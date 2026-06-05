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

import { recordGlobalLoss, recordGlobalWin } from './leaderboard';

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
