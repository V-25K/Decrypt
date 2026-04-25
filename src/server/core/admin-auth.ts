import { redis, reddit } from '@devvit/web/server';

const normalizeUsername = (value: string): string => value.trim().toLowerCase();

// Cache moderator status in Redis for 60 seconds per (subreddit, username) pair.
// This avoids a live Reddit API call on every admin action while keeping the
// window short enough that a newly-added or removed mod sees the change quickly.
// We do NOT use Devvit's cache() helper here because the docs explicitly warn
// it must not be used for personalized/per-user data.
const modCacheTtlSeconds = 60;

const keyModCache = (subredditName: string, username: string): string =>
  `decrypt:cache:mod:${normalizeUsername(subredditName)}:${normalizeUsername(username)}`;

export const isSubredditModerator = async (params: {
  subredditName: string | null | undefined;
  username: string | null | undefined;
}): Promise<boolean> => {
  if (!params.subredditName || !params.username) {
    return false;
  }

  const cacheKey = keyModCache(params.subredditName, params.username);
  const cached = await redis.get(cacheKey);
  if (cached !== null && cached !== undefined) {
    return cached === '1';
  }

  const moderators = await reddit
    .getModerators({
      subredditName: params.subredditName,
      username: params.username,
      limit: 1,
    })
    .all();
  const targetUsername = normalizeUsername(params.username);
  const isMod = moderators.some(
    (moderator) => normalizeUsername(moderator.username) === targetUsername
  );

  // Cache the result. Use NX so a concurrent request that already wrote the
  // value doesn't get overwritten with a potentially stale second result.
  await redis.set(cacheKey, isMod ? '1' : '0', {
    expiration: new Date(Date.now() + modCacheTtlSeconds * 1000),
    nx: true,
  });

  return isMod;
};

export const hasAdminAccess = async (params: {
  subredditName: string | null | undefined;
  username: string | null | undefined;
}): Promise<boolean> => await isSubredditModerator(params);
