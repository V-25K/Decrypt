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
  if (input.type !== 'AppInstall') {
    return {
      body: {
        status: 'success',
        message: 'AppUpgrade received; no immediate staging was performed.',
      },
      statusCode: 200,
    };
  }

  try {
    await scheduler.runJob({
      name: 'decrypt-generate-daily-2200',
      runAt: new Date(),
    });
    console.log('[triggers] Bootstrap staging scheduled on AppInstall.');
    return {
      body: {
        status: 'success',
        message: 'AppInstall received; bootstrap staging job scheduled.',
      },
      statusCode: 200,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[triggers] Failed to schedule bootstrap staging: ${reason}`);
    await reportAutomatedGenerationFailure({
      source: 'trigger.on-app-install',
      dateKey: formatDateKey(new Date()),
      error,
    });
    return {
      body: {
        status: 'error',
        message:
          'AppInstall received, but bootstrap staging could not be scheduled. Daily challenges will try again on the next scheduled run.',
      },
      statusCode: 200,
    };
  }
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
