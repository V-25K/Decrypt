import { reddit } from '@devvit/web/server';

const adminUsernameAllowlist = ['your_reddit_username'];

const normalizeUsername = (value: string): string => value.trim().toLowerCase();

const allowlistSet = new Set<string>(
  adminUsernameAllowlist.map((username) => normalizeUsername(username))
);

export const isAllowlistedAdmin = (username: string | null | undefined): boolean => {
  if (!username) {
    return false;
  }
  return allowlistSet.has(normalizeUsername(username));
};

export const isSubredditModerator = async (params: {
  subredditName: string | null | undefined;
  username: string | null | undefined;
}): Promise<boolean> => {
  if (!params.subredditName || !params.username) {
    return false;
  }

  try {
    const moderators = await reddit
      .getModerators({
        subredditName: params.subredditName,
        username: params.username,
        limit: 1,
      })
      .all();
    const targetUsername = normalizeUsername(params.username);
    return moderators.some(
      (moderator) => normalizeUsername(moderator.username) === targetUsername
    );
  } catch (_error) {
    return false;
  }
};

export const hasAdminAccess = async (params: {
  subredditName: string | null | undefined;
  username: string | null | undefined;
}): Promise<boolean> => {
  if (isAllowlistedAdmin(params.username)) {
    return true;
  }
  return await isSubredditModerator(params);
};

