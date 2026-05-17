import { describe, expect, it } from 'vitest';
import { getStatsView } from './stats-view';
import type {
  Profile,
  RankSummary,
} from './types';

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  coins: 500,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 0,
  dailyCurrentStreak: 0,
  endlessCurrentStreak: 0,
  lastPlayedDateKey: '',
  totalWordsSolved: 0,
  logicTasksCompleted: 0,
  totalLevelsCompleted: 0,
  flawlessWins: 0,
  speedWins: 0,
  dailyFlawlessWins: 0,
  endlessFlawlessWins: 0,
  dailySpeedWins: 0,
  endlessSpeedWins: 0,
  dailyChallengesPlayed: 0,
  endlessChallengesPlayed: 0,
  dailyFirstTryWins: 0,
  endlessFirstTryWins: 0,
  questsCompleted: 0,
  dailyModeClears: 0,
  endlessModeClears: 0,
  dailySolveTimeTotalSec: 0,
  endlessSolveTimeTotalSec: 0,
  bestOverallRank: 0,
  audioEnabled: true,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
  ...overrides,
});

const rankSummary = (overrides: Partial<RankSummary> = {}): RankSummary => ({
  dailyRank: 3,
  endlessRank: 7,
  currentRank: 3,
  bestOverallRank: 2,
  ...overrides,
});

describe('getStatsView', () => {
  it('builds daily stat cards and daily leaderboard rank', () => {
    const view = getStatsView({
      leaderboardTab: 'daily',
      profile: profile({
        dailyModeClears: 4,
        dailySolveTimeTotalSec: 500,
        dailyCurrentStreak: 2,
        dailyFlawlessWins: 1,
        dailySpeedWins: 3,
        dailyChallengesPlayed: 6,
        dailyFirstTryWins: 2,
        questsCompleted: 9,
      }),
      rankSummary: rankSummary(),
      statsTab: 'daily',
    });

    expect(view.activeLeaderboardRank).toBe(3);
    expect(view.visibleStatsCards).toEqual([
      { label: 'Levels Cleared', value: '4' },
      { label: 'Avg Solve Time', value: '02:05' },
      { label: 'Current Streak', value: '2' },
      { label: 'Flawless Wins', value: '1' },
      { label: 'Speed Wins', value: '3' },
      { label: 'Challenges Played', value: '6' },
      { label: 'First Try Wins', value: '2' },
      { label: 'Quest Completed', value: '9' },
      { label: 'Current Rank', value: '#3' },
      { label: 'All-Time Best Ranking', value: '#2' },
    ]);
  });

  it('builds endless stat cards and endless leaderboard rank', () => {
    const view = getStatsView({
      leaderboardTab: 'endless',
      profile: profile({
        endlessModeClears: 2,
        endlessSolveTimeTotalSec: 185,
        endlessCurrentStreak: 5,
        endlessFlawlessWins: 4,
        endlessSpeedWins: 1,
        endlessChallengesPlayed: 8,
        endlessFirstTryWins: 3,
        bestOverallRank: 6,
      }),
      rankSummary: rankSummary({ bestOverallRank: null }),
      statsTab: 'endless',
    });

    expect(view.activeLeaderboardRank).toBe(7);
    expect(view.visibleStatsCards).toContainEqual({ label: 'Avg Solve Time', value: '01:33' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Current Rank', value: '#7' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'All-Time Best Ranking', value: '#6' });
  });

  it('shows unranked labels when rank data is absent', () => {
    const view = getStatsView({
      leaderboardTab: 'daily',
      profile: profile(),
      rankSummary: null,
      statsTab: 'daily',
    });

    expect(view.activeLeaderboardRank).toBeNull();
    expect(view.visibleStatsCards).toContainEqual({ label: 'Current Rank', value: '--' });
    expect(view.visibleStatsCards).toContainEqual({
      label: 'All-Time Best Ranking',
      value: '--',
    });
  });
});
