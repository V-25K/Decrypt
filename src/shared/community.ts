export const primaryCommunitySubreddit = 'PlayDecrypt';
export const playtestCommunitySubreddits = ['decrypttest_dev'] as const;

export const primaryCommunityUrl = `https://www.reddit.com/r/${primaryCommunitySubreddit}/`;

export const isPrimaryCommunitySubreddit = (
  subredditName: string | null | undefined
): boolean =>
  typeof subredditName === 'string' &&
  subredditName.trim().toLowerCase() === primaryCommunitySubreddit.toLowerCase();

export const isPlaytestSubreddit = (
  subredditName: string | null | undefined
): boolean =>
  typeof subredditName === 'string' &&
  playtestCommunitySubreddits.some(
    (candidate) => candidate.toLowerCase() === subredditName.trim().toLowerCase()
  );
