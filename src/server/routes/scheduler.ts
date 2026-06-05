import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import {
  generatePuzzleForDate,
  publishAndActivateDailyPost,
  publishStagedPuzzle,
  stagePuzzleForTomorrow,
  PuzzleNotStagedError,
  PuzzleDateMismatchError,
  PuzzlePublishInProgressError,
} from '../core/generator';
import { reportAutomatedGenerationFailure } from '../core/generation-failure';
import {
  countPublishedAutoDailyPuzzlesForDate,
  getAutoDailyLevelIdsForDate,
  getPuzzlePublicationReceipt,
} from '../core/puzzle-store';
import { formatDateKey } from '../core/serde';
import { awardDailyTopRank } from '../core/leaderboard';
import { getDailyAutomationEnabled } from '../core/config';
import { CompletionJournalCleanup } from '../core/completion-journal-cleanup';

export const schedulerRoutes = new Hono();
const expectedDailyPosts = 2;
const allowedScheduledPublishHoursUtc = [0, 12];

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

type ScheduledPublishWindow = {
  hourUtc: number;
  startMs: number;
  endMs: number;
};

const getScheduledPublishWindowUtc = (date: Date): ScheduledPublishWindow | null => {
  const hourUtc = date.getUTCHours();
  const allowedHour = allowedScheduledPublishHoursUtc.find((hour) => hour === hourUtc);
  if (allowedHour === undefined) {
    return null;
  }
  const startMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    allowedHour,
    0,
    0,
    0
  );
  return {
    hourUtc: allowedHour,
    startMs,
    endMs: startMs + 60 * 60 * 1000,
  };
};

const countPublishedAutoDailyPuzzlesInWindow = async (
  dateKey: string,
  window: ScheduledPublishWindow
): Promise<number> => {
  const levelIds = await getAutoDailyLevelIdsForDate(dateKey);
  if (levelIds.length === 0) {
    return 0;
  }
  const receipts = await Promise.all(
    levelIds.map((levelId) => getPuzzlePublicationReceipt(levelId))
  );
  return receipts.filter(
    (receipt) =>
      receipt !== null &&
      receipt.dateKey === dateKey &&
      receipt.publishedAt >= window.startMs &&
      receipt.publishedAt < window.endMs
  ).length;
};

const canFallbackToCurrentDayGeneration = (error: unknown): boolean =>
  error instanceof PuzzleNotStagedError || error instanceof PuzzleDateMismatchError;

const isPublishAlreadyInProgressError = (error: unknown): boolean =>
  error instanceof PuzzlePublishInProgressError;

const waitForPublishedDailyCount = async (
  dateKey: string,
  minimumCount: number
): Promise<number> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const publishedCount = await countPublishedAutoDailyPuzzlesForDate(dateKey);
    if (publishedCount >= minimumCount) {
      return publishedCount;
    }
    if (attempt < 4) {
      await pause(300);
    }
  }
  return countPublishedAutoDailyPuzzlesForDate(dateKey);
};

const publishNextDailyChallenge = async (
  dateKey: string,
  startingPublishedCount: number
): Promise<void> => {
  console.log('[publishNextDailyChallenge] Starting publication process', {
    dateKey,
    startingPublishedCount,
    expectedDailyPosts,
  });

  let publishedCount = startingPublishedCount;

  while (publishedCount < expectedDailyPosts) {
    console.log('[publishNextDailyChallenge] Attempting to publish staged puzzle', {
      publishedCount,
      expectedDailyPosts,
      dateKey,
    });

    try {
      await publishStagedPuzzle();
      console.log('[publishNextDailyChallenge] Successfully published staged puzzle');
      return;
    } catch (error) {
      console.log('[publishNextDailyChallenge] Staged puzzle publish failed', {
        error: error instanceof Error ? error.message : String(error),
        isInProgressError: isPublishAlreadyInProgressError(error),
        canFallback: canFallbackToCurrentDayGeneration(error),
      });

      if (isPublishAlreadyInProgressError(error)) {
        console.log('[publishNextDailyChallenge] Waiting for in-progress publish to complete');
        const waitedPublishedCount = await waitForPublishedDailyCount(
          dateKey,
          publishedCount + 1
        );
        if (waitedPublishedCount > publishedCount) {
          publishedCount = waitedPublishedCount;
          console.log('[publishNextDailyChallenge] In-progress publish completed', {
            newPublishedCount: publishedCount,
          });
          if (publishedCount >= expectedDailyPosts) {
            return;
          }
          continue;
        }
        throw error;
      }
      if (!canFallbackToCurrentDayGeneration(error)) {
        console.error('[publishNextDailyChallenge] Cannot fallback to current day generation', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      console.log('[publishNextDailyChallenge] Falling back to current day generation');
      break;
    }
  }

  console.log('[publishNextDailyChallenge] Generating fallback puzzle for current day', {
    dateKey,
  });

  const generated = await generatePuzzleForDate(new Date());
  
  console.log('[publishNextDailyChallenge] Generated fallback puzzle', {
    levelId: generated.levelId,
    generatedDateKey: generated.dateKey,
    expectedDateKey: dateKey,
  });

  if (generated.dateKey !== dateKey) {
    const errorMsg = `Generated fallback daily ${generated.levelId} for ${generated.dateKey}, expected ${dateKey}.`;
    console.error('[publishNextDailyChallenge] Date key mismatch', { errorMsg });
    throw new Error(errorMsg);
  }
  
  console.log('[publishNextDailyChallenge] Publishing fallback puzzle', {
    levelId: generated.levelId,
    dateKey: generated.dateKey,
  });

  // Scheduler has no user context - must use APP account for automated publishes.
  await publishAndActivateDailyPost({ ...generated, runAs: 'APP' });
  console.log('[publishNextDailyChallenge] Successfully published fallback puzzle');
};

schedulerRoutes.post('/generate-daily', async (c) => {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const dateKey = formatDateKey(tomorrow);
  const automationEnabled = await getDailyAutomationEnabled();
  if (!automationEnabled) {
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  }
  try {
    await stagePuzzleForTomorrow();
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    await reportAutomatedGenerationFailure({
      source: 'scheduler.generate-daily',
      dateKey,
      error,
    });
    throw error;
  }
});

schedulerRoutes.post('/publish-daily', async (c) => {
  console.log('[scheduler] publish-daily triggered', {
    timestamp: new Date().toISOString(),
    utcHour: new Date().getUTCHours(),
    utcMinute: new Date().getUTCMinutes(),
  });

  const now = new Date();
  const dateKey = formatDateKey(now);
  const automationEnabled = await getDailyAutomationEnabled();
  
  console.log('[scheduler] publish-daily configuration check', {
    dateKey,
    automationEnabled,
    publishWindow: getScheduledPublishWindowUtc(now),
    allowedHours: allowedScheduledPublishHoursUtc,
  });

  if (!automationEnabled) {
    console.log('[scheduler] publish-daily skipped - automation disabled');
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  }
  const publishWindow = getScheduledPublishWindowUtc(now);
  if (!publishWindow) {
    console.log('[scheduler] publish-daily skipped - outside publish window', {
      currentHour: now.getUTCHours(),
      allowedHours: allowedScheduledPublishHoursUtc,
    });
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  }
  try {
    const [publishedCount, currentWindowPublishedCount] = await Promise.all([
      countPublishedAutoDailyPuzzlesForDate(dateKey),
      countPublishedAutoDailyPuzzlesInWindow(dateKey, publishWindow),
    ]);
    
    console.log('[scheduler] publish-daily puzzle count check', {
      publishedCount,
      currentWindowPublishedCount,
      expectedDailyPosts,
      dateKey,
      publishWindow,
    });

    if (currentWindowPublishedCount > 0) {
      console.log('[scheduler] publish-daily skipped - already published in this window');
      return c.json<TaskResponse>({ status: 'ok' }, 200);
    }
    if (publishedCount < expectedDailyPosts) {
      console.log('[scheduler] publish-daily starting puzzle publication', {
        publishedCount,
        expectedDailyPosts,
        dateKey,
      });
      await publishNextDailyChallenge(dateKey, publishedCount);
      console.log('[scheduler] publish-daily puzzle publication completed');
    } else {
      console.log('[scheduler] publish-daily skipped - daily quota already met', {
        publishedCount,
        expectedDailyPosts,
      });
    }
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await awardDailyTopRank(formatDateKey(yesterday));
    console.log('[scheduler] publish-daily completed successfully');
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    console.error('[scheduler] publish-daily failed with error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      dateKey,
    });
    await reportAutomatedGenerationFailure({
      source: 'scheduler.publish-daily',
      dateKey,
      error,
    });
    throw error;
  }
});

schedulerRoutes.post('/verify-daily', async (c) => {
  const dateKey = formatDateKey(new Date());
  const automationEnabled = await getDailyAutomationEnabled();
  if (!automationEnabled) {
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  }
  try {
    const count = await countPublishedAutoDailyPuzzlesForDate(dateKey);
    if (count >= expectedDailyPosts) {
      return c.json<TaskResponse>({ status: 'ok' }, 200);
    }

    console.warn('[scheduler] verify-daily: deficit detected', {
      count,
      expectedDailyPosts,
      dateKey,
    });

    // Attempt self-healing directly. The publish-daily route has a UTC hour
    // guard, so re-scheduling the named cron job at watchdog time would skip.
    try {
      await publishNextDailyChallenge(dateKey, count);
      console.log('[scheduler] verify-daily: recovery publish succeeded');
    } catch (publishError) {
      console.error('[scheduler] verify-daily: recovery publish failed', {
        error: publishError instanceof Error ? publishError.message : String(publishError),
      });
      await reportAutomatedGenerationFailure({
        source: 'scheduler.verify-daily.recovery',
        dateKey,
        error: publishError,
      });
    }

    await reportAutomatedGenerationFailure({
      source: 'scheduler.verify-daily',
      dateKey,
      error: {
        reason: `Daily watchdog detected ${count}/${expectedDailyPosts} published AUTO_DAILY puzzles for ${dateKey}.`,
      },
    });

    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    await reportAutomatedGenerationFailure({
      source: 'scheduler.verify-daily',
      dateKey,
      error,
    });
    throw error;
  }
});

schedulerRoutes.post('/cleanup-completion-journals', async (c) => {
  try {
    const cleanup = new CompletionJournalCleanup();
    const result = await cleanup.performCleanup();

    console.log('[scheduler] cleanup-completion-journals completed:', {
      entriesRemoved: result.entriesRemoved,
      memoryFreed: result.memoryFreed,
      usersProcessed: result.usersProcessed,
      processingTimeMs: result.processingTimeMs,
      errorCount: result.errors.length
    });

    return c.json<TaskResponse>({
      status: 'ok',
      data: {
        entriesRemoved: result.entriesRemoved,
        memoryFreed: result.memoryFreed,
        usersProcessed: result.usersProcessed,
        processingTimeMs: result.processingTimeMs,
        errors: result.errors
      }
    }, 200);
  } catch (error) {
    console.error('[scheduler] cleanup-completion-journals failed:', error);
    return c.json<TaskResponse>({
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});
