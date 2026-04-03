export const primaryCommunitySubreddit = 'PlayDecrypt';

export const primaryCommunityUrl = `https://www.reddit.com/r/${primaryCommunitySubreddit}/`;

export const isPrimaryCommunitySubreddit = (
  subredditName: string | null | undefined
): boolean =>
  typeof subredditName === 'string' &&
  subredditName.trim().toLowerCase() === primaryCommunitySubreddit.toLowerCase();
