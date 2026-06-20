import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnAppUpgradeRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { warmGlobalScorePointsCutoff } from '../core/points-eligibility';

export const triggers = new Hono();

type TriggerRouteResult = {
  body: TriggerResponse;
  statusCode: 200;
};

const handleAutomationBootstrapTrigger = async (
  input: OnAppInstallRequest | OnAppUpgradeRequest
): Promise<TriggerRouteResult> => {
  // Resolve+cache the global-points cutoff once per deploy so the hot win path
  // only ever reads a warm cache (Bug 4). Self-guarded; never throws.
  await warmGlobalScorePointsCutoff();
  if (input.type !== 'AppInstall') {
    return {
      body: {
        status: 'success',
        message: 'AppUpgrade received; daily automation runs at 00:00 UTC.',
      },
      statusCode: 200,
    };
  }

  return {
    body: {
      status: 'success',
      message: 'AppInstall received; daily automation runs at 00:00 UTC.',
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
