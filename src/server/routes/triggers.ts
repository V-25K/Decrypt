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

import { reportAutomatedGenerationFailure } from '../core/generation-failure';
import { formatDateKey } from '../core/serde';

const handleAutomationBootstrapTrigger = async (
  input: OnAppInstallRequest | OnAppUpgradeRequest
): Promise<TriggerRouteResult> => {
  if (input.type === 'AppInstall') {
    // Kick off the normal daily staging flow on initial install so tomorrow's
    // scheduled posts have saved puzzles ready without relying on a background
    // AI-pool refill loop.
    try {
      await scheduler.runJob({
        name: 'decrypt-generate-daily-2200',
        runAt: new Date(),
      });
      console.log(`[triggers] Scheduled immediate daily staging on ${input.type.toLowerCase()}.`);
    } catch (error) {
      console.error(
        `[triggers] Failed to schedule post-${input.type.toLowerCase()} daily staging: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await reportAutomatedGenerationFailure({
        source: 'trigger.on-app-install',
        dateKey: formatDateKey(new Date()),
        error,
      });
    }
  }
  return {
    body: {
      status: 'success',
      message:
        input.type === 'AppInstall'
          ? 'Bootstrap trigger received (AppInstall); requested an immediate daily staging run.'
          : 'Bootstrap trigger received (AppUpgrade); no immediate staging or post creation was performed.',
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
