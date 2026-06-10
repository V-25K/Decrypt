import { Hono } from 'hono';
import { scheduler, type TaskResponse } from '@devvit/web/server';
import {
  generatePuzzleForDate,
  publishAndActivateDailyPost,
} from '../core/generator';
import { reportAutomatedGenerationFailure } from '../core/generation-failure';
import {
  countPublishedAutoDailyPuzzlesForDate,
} from '../core/puzzle-store';
import { formatDateKey } from '../core/serde';
import { awardDailyTopRank } from '../core/leaderboard';
import { getDailyAutomationEnabled } from '../core/config';
import { CompletionJournalCleanup } from '../core/completion-journal-cleanup';
import { runDifficultyCalibrationV3Chunk } from '../core/difficulty-calibration';
import { logError, logInfo } from '../core/log';

export const schedulerRoutes = new Hono();
const expectedDailyPosts = 1;

type DifficultyCalibrationV3JobData = {
  offset?: number;
  processedLevels?: number;
  updatedEvaluations?: number;
  qualifiedLevels?: number;
  shadowReadyLevels?: number;
  chunkSize?: number;
};

type DifficultyCalibrationV3RequestBody = {
  data?: DifficultyCalibrationV3JobData;
};

const generateAndPublishDailyChallenge = async (
  dateKey: string
): Promise<void> => {
  logInfo('scheduler.publish-daily', 'starting publication process', {
    dateKey,
    expectedDailyPosts,
  });
  logInfo('scheduler.publish-daily', 'generating puzzle for current day', { dateKey });

  const generated = await generatePuzzleForDate(new Date());

  logInfo('scheduler.publish-daily', 'generated puzzle', {
    levelId: generated.levelId,
    generatedDateKey: generated.dateKey,
    expectedDateKey: dateKey,
  });

  if (generated.dateKey !== dateKey) {
    const errorMsg = `Generated daily ${generated.levelId} for ${generated.dateKey}, expected ${dateKey}.`;
    logError('scheduler.publish-daily', 'date key mismatch', undefined, { errorMsg });
    throw new Error(errorMsg);
  }

  logInfo('scheduler.publish-daily', 'publishing puzzle', {
    levelId: generated.levelId,
    dateKey: generated.dateKey,
  });

  // Scheduler has no user context - must use APP account for automated publishes.
  await publishAndActivateDailyPost({ ...generated, runAs: 'APP' });
  logInfo('scheduler.publish-daily', 'successfully published puzzle');
};

schedulerRoutes.post('/publish-daily', async (c) => {
  logInfo('scheduler.publish-daily', 'triggered', {
    timestamp: new Date().toISOString(),
    utcHour: new Date().getUTCHours(),
    utcMinute: new Date().getUTCMinutes(),
  });

  const now = new Date();
  const dateKey = formatDateKey(now);
  const automationEnabled = await getDailyAutomationEnabled();

  logInfo('scheduler.publish-daily', 'configuration check', {
    dateKey,
    automationEnabled,
  });

  if (!automationEnabled) {
    logInfo('scheduler.publish-daily', 'skipped — automation disabled');
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  }
  // No hour-window gate: idempotency is enforced by countPublishedAutoDailyPuzzlesForDate.
  // This lets Devvit's cron retries (and manual scheduler.runJob calls) recover the daily
  // post if the 00:00 UTC attempt failed and Devvit retries later in the same UTC day.
  try {
    const publishedCount = await countPublishedAutoDailyPuzzlesForDate(dateKey);

    logInfo('scheduler.publish-daily', 'puzzle count check', {
      publishedCount,
      expectedDailyPosts,
      dateKey,
    });

    if (publishedCount < expectedDailyPosts) {
      logInfo('scheduler.publish-daily', 'starting puzzle publication', {
        publishedCount,
        expectedDailyPosts,
        dateKey,
      });
      await generateAndPublishDailyChallenge(dateKey);
      logInfo('scheduler.publish-daily', 'puzzle publication completed');
    } else {
      logInfo('scheduler.publish-daily', 'skipped — daily quota already met', {
        publishedCount,
        expectedDailyPosts,
      });
    }
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await awardDailyTopRank(formatDateKey(yesterday));
    logInfo('scheduler.publish-daily', 'completed successfully');
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
    logError('scheduler.publish-daily', 'failed', error, { dateKey });
    await reportAutomatedGenerationFailure({
      source: 'scheduler.publish-daily',
      dateKey,
      error,
    });
    throw error;
  }
});

schedulerRoutes.post('/calibrate-difficulty-v3', async (c) => {
  const body = await c.req
    .json<DifficultyCalibrationV3RequestBody>()
    .catch((): DifficultyCalibrationV3RequestBody => ({ data: {} }));
  const data = body.data ?? {};
  const artifact = await runDifficultyCalibrationV3Chunk({
    offset: data.offset,
    processedLevels: data.processedLevels,
    updatedEvaluations: data.updatedEvaluations,
    qualifiedLevels: data.qualifiedLevels,
    shadowReadyLevels: data.shadowReadyLevels,
    chunkSize: data.chunkSize,
    startedAtMs: Date.now(),
  });

  if (artifact.nextOffset !== null) {
    await scheduler.runJob({
      name: 'decrypt-calibrate-difficulty-v3',
      runAt: new Date(),
      data: {
        offset: artifact.nextOffset,
        processedLevels: artifact.processedLevels,
        updatedEvaluations: artifact.updatedEvaluations,
        qualifiedLevels: artifact.qualifiedLevels,
        shadowReadyLevels: artifact.shadowReadyLevels,
        chunkSize: artifact.params.chunkSize,
      },
    });
  }

  return c.json<TaskResponse>({
    status: artifact.complete ? 'success' : 'requeued',
    data: artifact,
  });
});

schedulerRoutes.post('/cleanup-completion-journals', async (c) => {
  try {
    const cleanup = new CompletionJournalCleanup();
    const result = await cleanup.performCleanup();

    logInfo('scheduler.cleanup-completion-journals', 'completed', {
      entriesRemoved: result.entriesRemoved,
      memoryFreed: result.memoryFreed,
      usersProcessed: result.usersProcessed,
      processingTimeMs: result.processingTimeMs,
      errorCount: result.errors.length,
    });

    return c.json<TaskResponse>({
      status: 'ok',
      data: {
        entriesRemoved: result.entriesRemoved,
        memoryFreed: result.memoryFreed,
        usersProcessed: result.usersProcessed,
        processingTimeMs: result.processingTimeMs,
        errors: result.errors,
      },
    }, 200);
  } catch (error) {
    logError('scheduler.cleanup-completion-journals', 'failed', error);
    return c.json<TaskResponse>({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
