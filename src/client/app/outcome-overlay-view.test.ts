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
      completionSolveSeconds: 62,
      deviceTier: 'mobile',
      isComplete: true,
      joiningCommunity: false,
    });

    expect(view.outcomeTitle).toBe('Challenge Completed');
    expect(view.outcomeSubtitle).toBe('+20 coins');
    expect(view.completionSolveLabel).toBe('01:02');
    expect(view.homePanelClass).toContain('max-w-[340px]');
  });

  it('builds failed outcome copy and desktop layout class', () => {
    const view = getOutcomeOverlayView({
      communityJoinRecorded: false,
      completionResult: null,
      completionSolveSeconds: null,
      deviceTier: 'desktop',
      isComplete: false,
      joiningCommunity: false,
    });

    expect(view.outcomeTitle).toBe('Challenge Failed');
    expect(view.outcomeSubtitle).toBe('Try again!');
    expect(view.completionSolveLabel).toBe('--');
    expect(view.homePanelClass).toContain('max-w-[520px]');
  });
});
