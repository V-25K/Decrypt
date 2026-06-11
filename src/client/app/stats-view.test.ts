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
      { label: 'Best Overall Rank', value: '#2' },
    ]);
  });

  it('builds global stat cards and global leaderboard rank', () => {
    const view = getStatsView({
      leaderboardTab: 'global',
      profile: profile({
        endlessModeClears: 2,
        dailyModeClears: 1,
        dailySolveTimeTotalSec: 95,
        endlessSolveTimeTotalSec: 185,
        globalRating: 712,
        globalScore: 2100,
        ratingGames: 10,
        ratingWins: 8,
        ratingLosses: 2,
        globalWinStreak: 5,
        totalLevelsCompleted: 3,
        bestGlobalRank: 6,
        bestOverallRank: 6,
      }),
      rankSummary: rankSummary({ bestOverallRank: null }),
      statsTab: 'global',
    });

    expect(view.activeLeaderboardRank).toBe(7);
    // Headline numbers live in the hero strip on every tab.
    expect(view.heroCards).toEqual([
      { label: 'Rating', value: '712' },
      { label: 'Win Rate', value: '80%' },
      { label: 'Win Streak', value: '5' },
    ]);
    expect(view.visibleStatsCards).toContainEqual({ label: 'Total Points', value: '2,100' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Rated Games', value: '10' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Challenges Cleared', value: '3' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Avg Solve Time', value: '01:33' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Words Solved', value: '0' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Logic Ciphers Solved', value: '0' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Current Rank', value: '#7' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Best Global Rank', value: '#6' });
  });

  it('builds endless stat cards from the endless split', () => {
    const view = getStatsView({
      leaderboardTab: 'global',
      profile: profile({
        endlessModeClears: 5,
        endlessSolveTimeTotalSec: 650,
        endlessCurrentStreak: 4,
        endlessFlawlessWins: 2,
        endlessSpeedWins: 1,
        endlessChallengesPlayed: 8,
        endlessFirstTryWins: 3,
      }),
      rankSummary: rankSummary(),
      statsTab: 'endless',
    });

    expect(view.visibleStatsCards).toContainEqual({ label: 'Levels Cleared', value: '5' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Avg Solve Time', value: '02:10' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Current Streak', value: '4' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Challenges Played', value: '8' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Current Rank', value: '#7' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Best Overall Rank', value: '#2' });
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
        bestGlobalRank: undefined,
      }),
      rankSummary: null,
      statsTab: 'global',
    });

    expect(view.heroCards).toContainEqual({ label: 'Rating', value: '500' });
    expect(view.heroCards).toContainEqual({ label: 'Win Rate', value: '--' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Total Points', value: '0' });
    expect(view.visibleStatsCards).toContainEqual({ label: 'Best Global Rank', value: '--' });
  });
});
