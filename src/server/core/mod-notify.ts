import { context, reddit } from '@devvit/web/server';

type SubredditId = `t5_${string}`;

const isSubredditId = (value: string): value is SubredditId =>
  value.startsWith('t5_');

/**
 * Resolves the current subreddit's t5_ id (needed by modmail). Prefers the id
 * already on the request context and falls back to a name lookup.
 */
export const resolveSubredditId = async (): Promise<SubredditId | null> => {
  if (context.subredditId && isSubredditId(context.subredditId)) {
    return context.subredditId;
  }
  if (!context.subredditName) {
    return null;
  }
  try {
    const subreddit = await reddit.getSubredditByName(context.subredditName);
    return isSubredditId(subreddit.id) ? subreddit.id : null;
  } catch (error) {
    console.error(
      `[mod-notify] failed to resolve subreddit id: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
};

/**
 * Sends a moderator-only notification to the subreddit's modmail (an app→mod
 * inbox message, not a public post or comment). Self-guarded: returns null and
 * logs on failure so callers never break their primary action over a notice.
 */
export const sendModNotification = async (params: {
  subject: string;
  bodyMarkdown: string;
  logLabel: string;
}): Promise<string | null> => {
  try {
    const subredditId = await resolveSubredditId();
    if (!subredditId) {
      console.error(`[${params.logLabel}] missing subreddit id, skipped modmail`);
      return null;
    }
    return await reddit.modMail.createModNotification({
      subject: params.subject,
      bodyMarkdown: params.bodyMarkdown,
      subredditId,
    });
  } catch (error) {
    console.error(
      `[${params.logLabel}] failed to send modmail: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
};

/**
 * Sends a Reddit Direct Message from the app account to a single user — used to
 * tell community-challenge creators when a moderator approves, requests changes
 * on, or rejects their submission. The DM lands in the creator's Reddit inbox,
 * where Reddit's own notification settings deliver any device/email push.
 *
 * Self-guarded: a blocked recipient, opt-out, or rate limit must never fail the
 * moderation action that triggered it, so failures are logged and swallowed.
 * Returns true only when the message was sent.
 */
export const sendCreatorNotification = async (params: {
  toUsername: string;
  subject: string;
  bodyMarkdown: string;
  logLabel: string;
}): Promise<boolean> => {
  const recipient = params.toUsername.trim().replace(/^u\//i, '');
  if (recipient.length === 0) {
    console.error(`[${params.logLabel}] missing recipient, skipped creator DM`);
    return false;
  }
  try {
    await reddit.sendPrivateMessage({
      to: recipient,
      subject: params.subject,
      text: params.bodyMarkdown,
    });
    return true;
  } catch (error) {
    console.error(
      `[${params.logLabel}] failed to DM creator: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
};
