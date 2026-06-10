import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzlePrivate, UserProfile } from '../../shared/game';

const {
  hGetMock,
  hSetMock,
  hSetNXMock,
  zAddMock,
  zIncrByMock,
} = vi.hoisted(() => ({
  hGetMock: vi.fn(),
  hSetMock: vi.fn(),
  hSetNXMock: vi.fn(),
  zAddMock: vi.fn(),
  zIncrByMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    hGet: hGetMock,
    hSet: hSetMock,
    hSetNX: hSetNXMock,
    zAdd: zAddMock,
    zIncrBy: zIncrByMock,
  },
  reddit: {},
}));

vi.mock('./share-receipts', () => ({
  getShareCompletionReceipt: vi.fn(),
}));

import { computeScore, recordGlobalLoss, recordGlobalWin } from './leaderboard';

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
  globalRating: 500,
  globalScore: 0,
  ratingGames: 0,
  ratingWins: 0,
  ratingLosses: 0,
  globalWinStreak: 0,
  bestGlobalRank: 0,
  bestOverallRank: 0,
  audioEnabled: true,
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
});

const puzzleFixture = (): PuzzlePrivate => ({
  levelId: 'lvl_0001',
  dateKey: '2026-06-05',
  targetText: 'A B',
  author: 'TEST',
  challengeType: 'QUOTE',
  source: 'AUTO_DAILY',
  cipherType: 'random',
  shiftAmount: null,
  mapping: { A: 1, B: 2 },
  reverseMapping: { '1': 'A', '2': 'B' },
  tiles: [
    { index: 0, char: 'A', isLetter: true, wordIndex: 0 },
    { index: 1, char: ' ', isLetter: false, wordIndex: 0 },
    { index: 2, char: 'B', isLetter: true, wordIndex: 1 },
  ],
  words: ['A', 'B'],
  prefilledIndices: [],
  revealedIndices: [],
  revealed_indices: [],
  lockIndices: [],
  blindIndices: [],
  goldIndex: null,
  padlockChains: [],
  difficulty: 5,
  targetTimeSeconds: 60,
  isLogical: false,
  createdAt: 0,
});

afterEach(() => {
  hGetMock.mockReset();
  hSetMock.mockReset();
  hSetNXMock.mockReset();
  zAddMock.mockReset();
  zIncrByMock.mockReset();
});

describe('global rating leaderboard writes', () => {
  it('calculates challenge score with speed, mistake, and powerup multipliers', () => {
    expect(computeScore({
      solveSeconds: 0,
      mistakes: 0,
      usedPowerups: 0,
    })).toBe(1300);
    expect(computeScore({
      solveSeconds: 120,
      mistakes: 0,
      usedPowerups: 0,
    })).toBe(700);
    expect(computeScore({
      solveSeconds: 120,
      mistakes: 1,
      usedPowerups: 0,
    })).toBe(630);
    expect(computeScore({
      solveSeconds: 120,
      mistakes: 0,
      usedPowerups: 1,
    })).toBe(665);
    expect(computeScore({
      solveSeconds: 120,
      mistakes: 1,
      usedPowerups: 1,
    })).toBe(599);
  });

  it('keeps challenge score finite and non-negative for bad numeric inputs', () => {
    expect(computeScore({
      solveSeconds: Number.NaN,
      mistakes: Number.NaN,
      usedPowerups: Number.NaN,
    })).toBe(1300);
  });

  it('updates global score and rating on a first win', async () => {
    hGetMock.mockResolvedValue(null);
    hSetNXMock.mockResolvedValue(1);

    const result = await recordGlobalWin({
      userId: 'u1',
      levelId: 'lvl_0001',
      solveScore: 700,
      profile: profileFixture(),
      puzzle: puzzleFixture(),
      solveSeconds: 40,
      mistakes: 0,
      usedPowerups: 0,
      isRecoveryRun: false,
    });

    expect(result.globalScoreDelta).toBe(700);
    expect(result.ratingDelta).toBeGreaterThan(0);
    expect(result.profile.globalRating).toBeGreaterThan(500);
    expect(result.profile.globalScore).toBe(700);
    expect(result.profile.ratingWins).toBe(1);
    expect(zIncrByMock).toHaveBeenCalledWith(
      'decrypt:leaderboard:global:score',
      'u1',
      700
    );
    expect(zAddMock).toHaveBeenCalledWith('decrypt:leaderboard:global:rating', {
      member: 'u1',
      score: result.profile.globalRating,
    });
  });

  it('does not apply a second rating gain for the same win outcome', async () => {
    hGetMock.mockResolvedValue('500');
    hSetNXMock.mockResolvedValue(0);

    const result = await recordGlobalWin({
      userId: 'u1',
      levelId: 'lvl_0001',
      solveScore: 650,
      profile: profileFixture(),
      puzzle: puzzleFixture(),
      solveSeconds: 40,
      mistakes: 0,
      usedPowerups: 0,
      isRecoveryRun: false,
    });

    expect(result.globalScoreDelta).toBe(150);
    expect(result.ratingDelta).toBe(0);
    expect(result.profile.globalRating).toBe(500);
  });

  it('does not subtract global score when a replay score is below the stored best', async () => {
    hGetMock.mockResolvedValue('700');
    hSetNXMock.mockResolvedValue(0);

    const result = await recordGlobalWin({
      userId: 'u1',
      levelId: 'lvl_0001',
      solveScore: 650,
      profile: {
        ...profileFixture(),
        globalScore: 700,
      },
      puzzle: puzzleFixture(),
      solveSeconds: 40,
      mistakes: 0,
      usedPowerups: 0,
      isRecoveryRun: false,
    });

    expect(result.globalScoreDelta).toBe(0);
    expect(result.profile.globalScore).toBe(700);
    expect(zIncrByMock).not.toHaveBeenCalled();
  });

  it('hydrates a recorded win receipt when retrying after rating was journaled before profile save', async () => {
    hGetMock
      .mockResolvedValueOnce('500')
      .mockResolvedValueOnce(JSON.stringify({
        ratingDelta: 23,
        ratingAfter: 523,
        ts: 1717584000000,
        globalScoreAfter: 650,
        ratingGamesAfter: 1,
        ratingWinsAfter: 1,
        ratingLossesAfter: 0,
        globalWinStreakAfter: 1,
      }));
    hSetNXMock.mockResolvedValue(0);

    const result = await recordGlobalWin({
      userId: 'u1',
      levelId: 'lvl_0001',
      solveScore: 650,
      profile: profileFixture(),
      puzzle: puzzleFixture(),
      solveSeconds: 40,
      mistakes: 0,
      usedPowerups: 0,
      isRecoveryRun: false,
    });

    expect(result.ratingDelta).toBe(23);
    expect(result.ratingAfter).toBe(523);
    expect(result.profile.globalRating).toBe(523);
    expect(result.profile.globalScore).toBe(650);
    expect(result.profile.ratingGames).toBe(1);
    expect(result.profile.ratingWins).toBe(1);
    expect(result.profile.globalWinStreak).toBe(1);
    expect(zAddMock).toHaveBeenCalledWith('decrypt:leaderboard:global:rating', {
      member: 'u1',
      score: 523,
    });
  });

  it('decreases rating and resets streak on a first loss', async () => {
    hSetNXMock.mockResolvedValue(1);
    const profile = {
      ...profileFixture(),
      globalRating: 520,
      globalWinStreak: 4,
    };

    const result = await recordGlobalLoss({
      userId: 'u1',
      levelId: 'lvl_0001',
      profile,
      puzzle: puzzleFixture(),
    });

    expect(result.ratingDelta).toBeLessThan(0);
    expect(result.profile.globalRating).toBeLessThan(520);
    expect(result.profile.globalWinStreak).toBe(0);
    expect(result.profile.ratingLosses).toBe(1);
  });
});
