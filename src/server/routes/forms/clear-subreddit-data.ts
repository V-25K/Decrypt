import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { clearSubredditGameData } from '../../core/playtest-reset';
import { rejectWithoutAdminAccess } from './shared/auth';
import { firstValue } from './shared/parse';

type ModClearSubredditDataFormRequest = {
  confirmation?: unknown;
  subredditConfirmation?: unknown;
};

export const clearSubredditDataRoutes = new Hono();

clearSubredditDataRoutes.post('/mod-clear-subreddit-data-submit', async (c) => {
  const accessDenied = await rejectWithoutAdminAccess(c);
  if (accessDenied) {
    return accessDenied;
  }
  try {
    const body = await c.req.json<ModClearSubredditDataFormRequest>();
    const confirmation = firstValue(body.confirmation);
    if (confirmation !== 'CLEAR') {
      return c.json<UiResponse>(
        { showToast: 'Type CLEAR to confirm clearing subreddit game data.' },
        200
      );
    }
    // Two-factor guard: the moderator must also confirm the subreddit they're
    // wiping. Defends against fat-finger and compromised-account scenarios for
    // a destructive action with no undo.
    const subredditConfirmation = firstValue(body.subredditConfirmation);
    const expectedSubreddit = (context.subredditName ?? '').trim();
    const submittedSubreddit = (subredditConfirmation ?? '').trim();
    if (
      expectedSubreddit.length === 0 ||
      submittedSubreddit.toLowerCase() !== expectedSubreddit.toLowerCase()
    ) {
      return c.json<UiResponse>(
        {
          showToast: `Type the subreddit name (${
            expectedSubreddit || 'this subreddit'
          }) to confirm.`,
        },
        200
      );
    }
    const result = await clearSubredditGameData();
    return c.json<UiResponse>(
      {
        showToast:
          `Cleared subreddit game data for ${result.knownUsers} player(s), ` +
          `${result.sessions} session(s), and ${result.deletedKeys} key(s).`,
      },
      200
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error clearing subreddit game data: ${reason}`);
    return c.json<UiResponse>(
      {
        showToast: `Failed to clear subreddit game data: ${reason}`,
      },
      200
    );
  }
});
