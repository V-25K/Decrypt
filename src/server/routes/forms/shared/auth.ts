import type { Context } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { hasAdminAccess } from '../../../core/admin-auth';

// If the caller is not a moderator of the current subreddit, returns a UI
// response that the route handler should propagate back to Devvit. Otherwise
// returns null and the caller proceeds with the privileged action.
export const rejectWithoutAdminAccess = async (
  c: Context
): Promise<Response | null> => {
  const allowed = await hasAdminAccess({
    subredditName: context.subredditName,
    username: context.username,
  });
  if (allowed) {
    return null;
  }
  return c.json<UiResponse>({ showToast: 'Moderator access required.' }, 200);
};
