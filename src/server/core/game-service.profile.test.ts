import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../shared/game';
import { buildPuzzle } from './puzzle';
import { updateProfileOnCompletion } from './game-service';

const profileFixture = (): UserProfile => ({
  coins: 0,
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
});

describe('updateProfileOnCompletion', () => {
  it('updates daily mode counters including first-try win', () => {
    const puzzle = buildPuzzle({
      levelId: 'lvl_1234',
      dateKey: '2026-03-16',
      text: 'HELLO WORLD',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    }).puzzlePrivate;
    const updated = updateProfileOnCompletion({
      profile: profileFixture(),
      puzzle,
      mode: 'daily',
      solveSeconds: 30,
      mistakes: 0,
      rewardCoins: 100,
      dateKey: '2026-03-16',
      hadPriorFailure: false,
    });
    expect(updated.dailyModeClears).toBe(1);
    expect(updated.dailyFlawlessWins).toBe(1);
    expect(updated.dailySpeedWins).toBe(1);
    expect(updated.dailyFirstTryWins).toBe(1);
    expect(updated.dailyCurrentStreak).toBe(1);
    expect(updated.currentStreak).toBe(1);
  });

  it('does not increment first-try when prior failure exists', () => {
    const puzzle = buildPuzzle({
      levelId: 'lvl_5678',
      dateKey: '2026-03-16',
      text: 'HELLO THERE',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 10,
      skipSolvabilityCheck: true,
    }).puzzlePrivate;
    const updated = updateProfileOnCompletion({
      profile: profileFixture(),
      puzzle,
      mode: 'endless',
      solveSeconds: 140,
      mistakes: 1,
      rewardCoins: 100,
      dateKey: '2026-03-16',
      hadPriorFailure: true,
    });
    expect(updated.endlessModeClears).toBe(1);
    expect(updated.endlessFirstTryWins).toBe(0);
    expect(updated.endlessCurrentStreak).toBe(1);
  });
});
