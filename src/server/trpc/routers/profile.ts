import { reddit } from '@devvit/web/server';
import {
  heartPurchaseResponseSchema,
  heartPurchaseStatusResponseSchema,
  profileJoinCommunityResponseSchema,
  profileSetAudioEnabledInputSchema,
  profileSetAudioEnabledResponseSchema,
  profileSetActiveFlairInputSchema,
  profileSetActiveFlairResponseSchema,
  profileSetThemePreferenceInputSchema,
  profileSetThemePreferenceResponseSchema,
} from '../../../shared/game';
import { isPrimaryCommunitySubreddit, primaryCommunitySubreddit } from '../../../shared/community';
import { syncCommunityFlair } from '../../core/community-flair';
import { communityJoinRewardCoins } from '../../core/constants';
import {
  getCoinHeartPurchaseStatus,
  purchaseCoinHeartRefill,
  purchaseCoinHeartTopUp,
} from '../../core/economy';
import { getUserProfile, saveUserProfile } from '../../core/state';
import { router } from '../base';
import { authedProcedure } from '../procedures';

const describeActionError = (error: unknown): string => {
  if (error instanceof Error) {
    const extra = error.cause instanceof Error ? ` cause=${error.cause.message}` : '';
    return `${error.name}: ${error.message}${extra}`;
  }
  return String(error);
};

const isSubscribePermissionFailure = (error: unknown): boolean => {
  const detail = describeActionError(error).toUpperCase();
  return (
    detail.includes('SUBSCRIBE_TO_SUBREDDIT') ||
    detail.includes('NOT ALLOWED TO RUN AS USER') ||
    detail.includes('PERMISSION NOT GRANTED')
  );
};

const isRetryableSubscribeFailure = (error: unknown): boolean => {
  const detail = describeActionError(error).toUpperCase();
  return (
    detail.includes('UNAUTHENTICATED') ||
    detail.includes('FAILED TO AUTHENTICATE PLUGIN REQUEST') ||
    detail.includes('UPSTREAM REQUEST MISSING OR TIMED OUT') ||
    detail.includes('TIMED OUT') ||
    detail.includes('TIMEOUT')
  );
};

const isAlreadySubscribedResult = (error: unknown): boolean => {
  const detail = describeActionError(error).toUpperCase();
  return detail.includes('ALREADY SUBSCRIBED') || detail.includes('ALREADY_SUBSCRIBED');
};

const toJoinCommunityFailureReason = (error: unknown): string => {
  if (isSubscribePermissionFailure(error)) {
    return 'Subscribe is unavailable for this player in playtest. After app approval, it works for all users.';
  }
  if (isRetryableSubscribeFailure(error)) {
    return 'Unable to join the community right now. Please try again in a moment.';
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Unable to join the community right now.';
};

const subscribeCurrentCommunity = async (): Promise<void> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await reddit.subscribeToCurrentSubreddit();
      return;
    } catch (error) {
      if (isAlreadySubscribedResult(error)) {
        return;
      }
      lastError = error;
      if (!isRetryableSubscribeFailure(error) || attempt === 1) {
        throw error;
      }
    }
  }
  throw lastError;
};

export const profileRouter = router({
  joinCommunity: authedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.userId;
    const profile = await getUserProfile(userId);
    try {
      await subscribeCurrentCommunity();
    } catch (error) {
      if (!isSubscribePermissionFailure(error) && !isRetryableSubscribeFailure(error)) {
        console.error(
          `profile.joinCommunity failed userId=${userId} subreddit=${ctx.subredditName} error=${describeActionError(error)}`
        );
      }
      return profileJoinCommunityResponseSchema.parse({
        success: false,
        reason: toJoinCommunityFailureReason(error),
        joined: false,
        rewardCoins: 0,
        profile,
      });
    }

    const rewardEligible = isPrimaryCommunitySubreddit(ctx.subredditName);
    const grantReward = rewardEligible && !profile.communityJoinRewardClaimed;
    const updatedProfile = {
      ...profile,
      coins: profile.coins + (grantReward ? communityJoinRewardCoins : 0),
      communityJoinRecorded: true,
      communityJoinRewardClaimed: profile.communityJoinRewardClaimed || grantReward,
    };
    await saveUserProfile(userId, updatedProfile);
    return profileJoinCommunityResponseSchema.parse({
      success: true,
      reason: rewardEligible
        ? 'Community joined.'
        : `Joined this subreddit. Join rewards are only available in r/${primaryCommunitySubreddit}.`,
      joined: true,
      rewardCoins: grantReward ? communityJoinRewardCoins : 0,
      profile: updatedProfile,
    });
  }),
  purchaseCoinRefill: authedProcedure.mutation(async ({ ctx }) => {
    const result = await purchaseCoinHeartRefill({ userId: ctx.userId });
    return heartPurchaseResponseSchema.parse(result);
  }),
	  purchaseCoinTopUp: authedProcedure.mutation(async ({ ctx }) => {
	    const result = await purchaseCoinHeartTopUp({ userId: ctx.userId });
	    return heartPurchaseResponseSchema.parse(result);
	  }),
  getCoinHeartPurchaseStatus: authedProcedure.query(async ({ ctx }) => {
    return heartPurchaseStatusResponseSchema.parse(
      await getCoinHeartPurchaseStatus({ userId: ctx.userId })
    );
  }),
	  setActiveFlair: authedProcedure
    .input(profileSetActiveFlairInputSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
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
      const userId = ctx.userId;
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
  setThemePreference: authedProcedure
    .input(profileSetThemePreferenceInputSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const profile = await getUserProfile(userId);
      const updatedProfile = {
        ...profile,
        themePreference: input.theme,
      };
      await saveUserProfile(userId, updatedProfile);
      return profileSetThemePreferenceResponseSchema.parse({
        success: true,
        reason: null,
        profile: updatedProfile,
      });
    }),
});
