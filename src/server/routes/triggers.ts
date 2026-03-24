import { context } from '@devvit/web/server';
import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';

import { createPost } from '../core/post';
import { reportAutomatedGenerationFailure } from '../core/generation-failure';
import { formatDateKey } from '../core/serde';
import { getDailyAutomationEnabled, getDecryptSettings } from '../core/config';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  try {
    const automationEnabled = await getDailyAutomationEnabled();
    if (!automationEnabled) {
      return c.json<TriggerResponse>(
        {
          status: 'success',
          message: `Automation disabled; no post created (trigger: ${input.type}).`,
        },
        200
      );
    }
    const settings = await getDecryptSettings();
    if (!settings.geminiApiKey) {
      return c.json<TriggerResponse>(
        {
          status: 'success',
          message: `Automation skipped; Gemini API key missing (trigger: ${input.type}).`,
        },
        200
      );
    }
    const post = await createPost();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    await reportAutomatedGenerationFailure({
      source: 'trigger.on-app-install',
      dateKey: formatDateKey(new Date()),
      error,
    });
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});
