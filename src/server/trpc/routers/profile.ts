import { reddit } from '@devvit/web/server';
import {
  profileJoinCommunityResponseSchema,
  profileSetAudioEnabledInputSchema,
  profileSetAudioEnabledResponseSchema,
  profileSetActiveFlairInputSchema,
  profileSetActiveFlairResponseSchema,
} from '../../../shared/game';
import { isPrimaryCommunitySubreddit, primaryCommunitySubreddit } from '../../../shared/community';
import { syncCommunityFlair } from '../../core/community-flair';
import { communityJoinRewardCoins } from '../../core/constants';
import { getUserProfile, saveUserProfile } from '../../core/state';
import { router } from '../base';
import { authedProcedure } from '../procedures';

export const profileRouter = router({
  joinCommunity: authedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId!;
    const profile = await getUserProfile(userId);
    if (!isPrimaryCommunitySubreddit(ctx.subredditName)) {
      return profileJoinCommunityResponseSchema.parse({
        success: false,
        reason: `Community rewards are only available in r/${primaryCommunitySubreddit}.`,
        joined: false,
        rewardCoins: 0,
        profile,
      });
    }
    if (profile.communityJoinRewardClaimed) {
      return profileJoinCommunityResponseSchema.parse({
        success: true,
        reason: null,
        joined: true,
        rewardCoins: 0,
        profile,
      });
    }
    try {
      await reddit.subscribeToCurrentSubreddit();
    } catch (error) {
      return profileJoinCommunityResponseSchema.parse({
        success: false,
        reason:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : 'Unable to join the community right now.',
        joined: false,
        rewardCoins: 0,
        profile,
      });
    }
    const updatedProfile = {
      ...profile,
      coins: profile.coins + communityJoinRewardCoins,
      communityJoinRewardClaimed: true,
    };
    await saveUserProfile(userId, updatedProfile);
    return profileJoinCommunityResponseSchema.parse({
      success: true,
      reason: null,
      joined: true,
      rewardCoins: communityJoinRewardCoins,
      profile: updatedProfile,
    });
  }),
  setActiveFlair: authedProcedure
    .input(profileSetActiveFlairInputSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const profile = await getUserProfile(userId);
      const nextFlair = input.flair.trim();
      if (nextFlair.length > 0 && !profile.unlockedFlairs.includes(nextFlair)) {
        return profileSetActiveFlairResponseSchema.parse({
          success: false,
          reason: 'That flair is not unlocked yet.',
          profile,
        });
      }
      try {
        await syncCommunityFlair({
          subredditName: ctx.subredditName,
          username: ctx.username,
          flair: nextFlair,
        });
      } catch (error) {
        return profileSetActiveFlairResponseSchema.parse({
          success: false,
          reason:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Unable to update community flair.',
          profile,
        });
      }
      const updatedProfile = {
        ...profile,
        activeFlair: nextFlair,
      };
      await saveUserProfile(userId, updatedProfile);
      return profileSetActiveFlairResponseSchema.parse({
        success: true,
        reason: null,
        profile: updatedProfile,
      });
    }),
  setAudioEnabled: authedProcedure
    .input(profileSetAudioEnabledInputSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const profile = await getUserProfile(userId);
      const updatedProfile = {
        ...profile,
        audioEnabled: input.enabled,
      };
      await saveUserProfile(userId, updatedProfile);
      return profileSetAudioEnabledResponseSchema.parse({
        success: true,
        reason: null,
        profile: updatedProfile,
      });
    }),
});
