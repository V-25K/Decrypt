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
  globalRating: 500,
  globalScore: 0,
  ratingGames: 0,
  ratingWins: 0,
  ratingLosses: 0,
  globalWinStreak: 0,
  bestGlobalRank: 0,
  bestOverallRank: 0,
  audioEnabled: true,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
  ...overrides,
});

const rankSummary = (overrides: Partial<RankSummary> = {}): RankSummary => ({
  dailyRank: 3,
  globalRank: 7,
  endlessRank: 7,
  currentRank: 3,
  bestOverallRank: 2,
  ...overrides,
});

describe('getStatsView', () => {
  it('builds one curated overall card set with combined lifetime numbers', () => {
    const view = getStatsView({
      leaderboardTab: 'daily',
      profile: profile({
        totalLevelsCompleted: 3,
        dailyModeClears: 1,
        endlessModeClears: 2,
        dailySolveTimeTotalSec: 95,
        endlessSolveTimeTotalSec: 185,
        currentStreak: 4,
        flawlessWins: 2,
        speedWins: 1,
        totalWordsSolved: 120,
        logicTasksCompleted: 5,
        globalScore: 2100,
        questsCompleted: 9,
        globalRating: 712,
        ratingGames: 10,
        ratingWins: 8,
        globalWinStreak: 5,
      }),
      rankSummary: rankSummary(),
    });

    expect(view.activeLeaderboardRank).toBe(3);
    expect(view.heroCards).toEqual([
      { label: 'Rating', value: '712' },
      { label: 'Win Rate', value: '80%' },
      { label: 'Win Streak', value: '5' },
    ]);
    expect(view.visibleStatsCards).toEqual([
      { label: 'Challenges Cleared', value: '3' },
      // Combined daily+endless average: (95+185)/3 -> 93.33s -> 01:33.
      { label: 'Avg Solve Time', value: '01:33' },
      { label: 'Current Streak', value: '4' },
      { label: 'Flawless Wins', value: '2' },
      { label: 'Speed Wins', value: '1' },
      { label: 'Words Solved', value: '120' },
      { label: 'Logic Ciphers Solved', value: '5' },
      { label: 'Total Points', value: '2,100' },
      { label: 'Quest Completed', value: '9' },
      { label: 'Current Rank', value: '#7' },
      { label: 'Best Overall Rank', value: '#2' },
    ]);
  });

  it('uses the global rank for the leaderboard footer on the global tab', () => {
    const view = getStatsView({
      leaderboardTab: 'global',
      profile: profile(),
      rankSummary: rankSummary(),
    });
    expect(view.activeLeaderboardRank).toBe(7);
  });

  it('shows unranked labels when rank data is absent', () => {
    const view = getStatsView({
      leaderboardTab: 'daily',
      profile: profile(),
      rankSummary: null,
    });

    expect(view.activeLeaderboardRank).toBeNull();
    expect(view.visibleStatsCards).toContainEqual({ label: 'Current Rank', value: '--' });
    expect(view.visibleStatsCards).toContainEqual({
      label: 'Best Overall Rank',
      value: '--',
    });
  });

  it('falls back safely when legacy profiles omit global rating fields', () => {
    const view = getStatsView({
      leaderboardTab: 'global',
      profile: profile({
        globalRating: undefined,
        globalScore: undefined,
        ratingGames: undefined,
        ratingWins: undefined,
        ratingLosses: undefined,
        globalWinStreak: undefined,
      }),
      rankSummary: null,
    });

    expect(view.heroCards).toContainEqual({ label: 'Rating', value: '500' });
    expect(view.heroCards).toContainEqual({ label: 'Win Rate', value: '--' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Total Points', value: '0' });
  });
});
