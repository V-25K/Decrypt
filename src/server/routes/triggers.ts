import { Hono } from 'hono';
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
