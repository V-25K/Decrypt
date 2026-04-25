import { Hono } from 'hono';
import { scheduler } from '@devvit/web/server';
import type {
  OnAppInstallRequest,
  OnAppUpgradeRequest,
  TriggerResponse,
} from '@devvit/web/shared';

export const triggers = new Hono();

type TriggerRouteResult = {
  body: TriggerResponse;
  statusCode: 200;
};

const handleAutomationBootstrapTrigger = async (
  input: OnAppInstallRequest | OnAppUpgradeRequest
): Promise<TriggerRouteResult> => {
  if (input.type === 'AppInstall') {
    // Warm the AI candidate pool immediately so the first automated
    // publish (at 00:00 UTC) has puzzles ready even when the app is
    // installed between 00:00 and 22:00 (before the normal 22:00 cron).
    try {
      await scheduler.runJob({
        name: 'decrypt-refill-ai-pool-30m',
        runAt: new Date(),
      });
      console.log('[triggers] Scheduled immediate AI pool warm-up on install.');
    } catch (error) {
      console.error(
        `[triggers] Failed to schedule post-install pool warm-up: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
  return {
    body: {
      status: 'success',
      message: `Bootstrap trigger received (${input.type}); pool warm-up scheduled.`,
    },
    statusCode: 200,
  };
};

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  const response = await handleAutomationBootstrapTrigger(input);
  return c.json<TriggerResponse>(response.body, response.statusCode);
});

triggers.post('/on-app-upgrade', async (c) => {
  const input = await c.req.json<OnAppUpgradeRequest>();
  const response = await handleAutomationBootstrapTrigger(input);
  return c.json<TriggerResponse>(response.body, response.statusCode);
});
