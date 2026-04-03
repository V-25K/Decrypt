import { describe, expect, it } from 'vitest';
import { defaultUserProfile } from './state';

describe('defaultUserProfile', () => {
  it('initializes new mode and rank fields', () => {
    const profile = defaultUserProfile();
    expect(profile.dailyCurrentStreak).toBe(0);
    expect(profile.endlessCurrentStreak).toBe(0);
    expect(profile.dailyFlawlessWins).toBe(0);
    expect(profile.endlessFlawlessWins).toBe(0);
    expect(profile.dailySpeedWins).toBe(0);
    expect(profile.endlessSpeedWins).toBe(0);
    expect(profile.dailyChallengesPlayed).toBe(0);
    expect(profile.endlessChallengesPlayed).toBe(0);
    expect(profile.dailyFirstTryWins).toBe(0);
    expect(profile.endlessFirstTryWins).toBe(0);
    expect(profile.bestOverallRank).toBe(0);
    expect(profile.communityJoinRewardClaimed).toBe(false);
  });
});
