import { Hono } from 'hono';
import type { TaskResponse } from '@devvit/web/server';
import { publishStagedPuzzle, stagePuzzleForTomorrow } from '../core/generator';
import { reportAutomatedGenerationFailure } from '../core/generation-failure';
import { countPuzzlesForDate } from '../core/puzzle-store';
import { formatDateKey } from '../core/serde';
import { awardDailyTopRank } from '../core/leaderboard';
import { getDailyAutomationEnabled } from '../core/config';

export const schedulerRoutes = new Hono();
const expectedDailyPosts = 2;

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
  const dateKey = formatDateKey(new Date());
  const automationEnabled = await getDailyAutomationEnabled();
  if (!automationEnabled) {
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  }
  try {
    await publishStagedPuzzle();
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await awardDailyTopRank(formatDateKey(yesterday));
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  } catch (error) {
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
    const count = await countPuzzlesForDate(dateKey);
    if (count >= expectedDailyPosts) {
      return c.json<TaskResponse>({ status: 'ok' }, 200);
    }

    await reportAutomatedGenerationFailure({
      source: 'scheduler.verify-daily',
      dateKey,
      error: {
        reason: `Daily watchdog detected ${count}/${expectedDailyPosts} puzzles for ${dateKey}.`,
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
