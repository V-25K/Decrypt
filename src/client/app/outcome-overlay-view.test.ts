import { describe, expect, it } from 'vitest';
import {
  getCommunityJoinLabel,
  getOutcomeOverlayView,
} from './outcome-overlay-view';

describe('getCommunityJoinLabel', () => {
  it('prioritizes in-flight join state', () => {
    expect(
      getCommunityJoinLabel({
        communityJoinRecorded: true,
        joiningCommunity: true,
      })
    ).toBe('Joining...');
  });

  it('shows recorded and default labels', () => {
    expect(
      getCommunityJoinLabel({
        communityJoinRecorded: true,
        joiningCommunity: false,
      })
    ).toBe('Joined');
    expect(
      getCommunityJoinLabel({
        communityJoinRecorded: false,
        joiningCommunity: false,
      })
    ).toBe('Subscribe');
  });
});

describe('getOutcomeOverlayView', () => {
  it('builds completed outcome copy and solve labels', () => {
    const view = getOutcomeOverlayView({
      communityJoinRecorded: false,
      completionResult: {
        success: true,
        profile: {},
        inventory: {},
        rewardNotice: '+20 coins',
        solveSeconds: 96,
        score: 100,
        dailyRetryCount: 0,
        nextDailyRetryCost: 0,
        nextDailyRetryScoreFactor: 1,
        requiresPaidRetry: false,
        challengeMetrics: null,
        leaderboardScore: 100,
        rankSummary: null,
        questStatus: null,
        completionReceipts: [],
      },
      completionPointsGained: null,
      completionRatingDelta: null,
      completionSolveSeconds: 62,
      deviceTier: 'mobile',
      failureRatingDelta: null,
      isComplete: true,
      joiningCommunity: false,
    });

    expect(view.completionSolveLabel).toBe('01:02');
    expect(view.homePanelClass).toContain('max-w-[340px]');
    expect(view.pointsGainedLabel).toBe('+100 pts');
    expect(view.ratingDeltaLabel).toBeNull();
    expect(view.ratingDeltaTone).toBe('neutral');
  });

  it('builds failed outcome copy and desktop layout class', () => {
    const view = getOutcomeOverlayView({
      communityJoinRecorded: false,
      completionPointsGained: null,
      completionRatingDelta: null,
      completionResult: null,
      completionSolveSeconds: null,
      deviceTier: 'desktop',
      failureRatingDelta: -16,
      isComplete: false,
      joiningCommunity: false,
    });

    expect(view.completionSolveLabel).toBe('--');
    expect(view.homePanelClass).toContain('max-w-[520px]');
    expect(view.pointsGainedLabel).toBe('+0 pts');
    expect(view.ratingDeltaLabel).toBe('-16 ELO');
    expect(view.ratingDeltaTone).toBe('negative');
  });

  it('formats positive completion rating deltas', () => {
    const view = getOutcomeOverlayView({
      communityJoinRecorded: false,
      completionResult: {
        success: true,
        profile: {},
        inventory: {},
        rewardNotice: null,
        solveSeconds: 96,
        score: 1250,
        ratingDelta: 24,
        dailyRetryCount: 0,
        nextDailyRetryCost: 0,
        nextDailyRetryScoreFactor: 1,
        requiresPaidRetry: false,
        challengeMetrics: null,
        leaderboardScore: 100,
        rankSummary: null,
        questStatus: null,
        completionReceipts: [],
      },
      completionPointsGained: null,
      completionRatingDelta: null,
      completionSolveSeconds: null,
      deviceTier: 'tablet',
      failureRatingDelta: null,
      isComplete: true,
      joiningCommunity: false,
    });

    expect(view.ratingDeltaLabel).toBe('+24 ELO');
    expect(view.ratingDeltaTone).toBe('positive');
    expect(view.pointsGainedLabel).toBe('+1,250 pts');
  });

  it('uses durable completion stats when the mutation result is missing after refresh', () => {
    const view = getOutcomeOverlayView({
      communityJoinRecorded: false,
      completionPointsGained: 875,
      completionRatingDelta: 19,
      completionResult: null,
      completionSolveSeconds: 44,
      deviceTier: 'desktop',
      failureRatingDelta: null,
      isComplete: true,
      joiningCommunity: false,
    });

    expect(view.ratingDeltaLabel).toBe('+19 ELO');
    expect(view.pointsGainedLabel).toBe('+875 pts');
  });
});
