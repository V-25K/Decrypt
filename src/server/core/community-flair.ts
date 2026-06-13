import { reddit, redis } from '@devvit/web/server';
import { getCommunityFlairStyle } from '../../shared/quests';
import { keyUserFlairText } from './keys';

/**
 * The player's subreddit user flair is their equipped in-app flair followed by
 * their global rank, e.g. "Living Legend · #42". The rank is always appended
 * when known, whatever the flair (or just "#42" when no flair is equipped).
 */
export const buildUserFlairText = (
  flair: string,
  globalRank: number | null | undefined
): string => {
  const label = flair.trim();
  const rankPart =
    typeof globalRank === 'number' && globalRank > 0 ? `#${globalRank}` : '';
  if (label && rankPart) {
    return `${label} · ${rankPart}`;
  }
  return label || rankPart;
};

export const syncCommunityFlair = async (params: {
  subredditName: string | null | undefined;
  username: string | null | undefined;
  flair: string;
  globalRank?: number | null;
  // When provided, the last-written flair text is cached so repeat syncs (e.g.
  // every bootstrap) only hit the Reddit API when the text actually changes.
  userId?: string | null;
}): Promise<void> => {
  if (!params.subredditName || !params.username) {
    return;
  }

  const nextFlair = params.flair.trim();
  const text = buildUserFlairText(nextFlair, params.globalRank);

  if (params.userId) {
    const lastText = await redis.get(keyUserFlairText(params.userId));
    if (lastText === text) {
      return;
    }
  }

  const flairStyle = getCommunityFlairStyle(nextFlair);
  await reddit.setUserFlair({
    subredditName: params.subredditName,
    username: params.username,
    text,
    backgroundColor: flairStyle?.backgroundColor ?? 'transparent',
    textColor: flairStyle?.textColor ?? 'dark',
  });

  if (params.userId) {
    await redis.set(keyUserFlairText(params.userId), text);
  }
};
