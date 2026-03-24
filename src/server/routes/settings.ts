import { Hono } from 'hono';
import type {
  SettingsValidationRequest,
  SettingsValidationResponse,
} from '@devvit/web/shared';

export const settingsRoutes = new Hono();

settingsRoutes.post('/validate-publish-hour', async (c) => {
  const body = await c.req.json<SettingsValidationRequest<number>>();
  const value = body.value;
  if (value === undefined || value < 0 || value > 23) {
    return c.json<SettingsValidationResponse>(
      {
        success: false,
        error: 'Publish hour must be between 0 and 23.',
      },
      200
    );
  }
  return c.json<SettingsValidationResponse>({ success: true }, 200);
});

settingsRoutes.post('/validate-logical-percent', async (c) => {
  const body = await c.req.json<SettingsValidationRequest<number>>();
  const value = body.value;
  if (value === undefined || value < 0 || value > 100) {
    return c.json<SettingsValidationResponse>(
      {
        success: false,
        error: 'Logical percent must be between 0 and 100.',
      },
      200
    );
  }
  return c.json<SettingsValidationResponse>({ success: true }, 200);
});

settingsRoutes.post('/validate-ai-retries', async (c) => {
  const body = await c.req.json<SettingsValidationRequest<number>>();
  const value = body.value;
  if (value === undefined || value < 1 || value > 5) {
    return c.json<SettingsValidationResponse>(
      {
        success: false,
        error: 'AI retries must be between 1 and 5.',
      },
      200
    );
  }
  return c.json<SettingsValidationResponse>({ success: true }, 200);
});

