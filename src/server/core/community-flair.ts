import { reddit } from '@devvit/web/server';
import { getCommunityFlairStyle } from '../../shared/quests';

export const syncCommunityFlair = async (params: {
  subredditName: string | null | undefined;
  username: string | null | undefined;
  flair: string;
}): Promise<void> => {
  if (!params.subredditName || !params.username) {
    return;
  }

  const nextFlair = params.flair.trim();
  const flairStyle = getCommunityFlairStyle(nextFlair);
  await reddit.setUserFlair({
    subredditName: params.subredditName,
    username: params.username,
    text: nextFlair,
    backgroundColor: flairStyle?.backgroundColor ?? 'transparent',
    textColor: flairStyle?.textColor ?? 'dark',
  });
};
