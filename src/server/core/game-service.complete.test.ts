import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, PuzzlePrivate, SessionState, UserProfile } from '../../shared/game';

const {
  contextMock,
  redisSetMock,
  redisHGetMock,
  redisHGetAllMock,
  redisHSetMock,
  redisExpireMock,
  redisGetMock,
  redisDelMock,
  getSessionStateMock,
  clearSessionStateMock,
  heartsRemainingMock,
  getPuzzlePrivateMock,
  getUserProfileMock,
  getInventoryMock,
  getDailyRetryCountMock,
  hasFailedLevelMock,
  markLevelCompletedMock,
  saveInventoryMock,
  saveUserProfileMock,
  puzzleIsCompleteMock,
  computeScoreMock,
  getUserRankSummaryMock,
  incrementAllTimeLogicMock,
  recordAllTimeLevelScoreMock,
  recordDailyScoreMock,
  recordLevelWinMock,
  recordQualifiedLevelWinMock,
  updateQuestProgressOnCompletionMock,
  saveShareCompletionReceiptMock,
} = vi.hoisted(() => ({
  contextMock: {
    userId: 't2_test',
    postId: 't3_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postData: {},
  },
  redisSetMock: vi.fn(),
  redisHGetMock: vi.fn(),
  redisHGetAllMock: vi.fn(),
  redisHSetMock: vi.fn(),
  redisExpireMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisDelMock: vi.fn(),
  getSessionStateMock: vi.fn(),
  clearSessionStateMock: vi.fn(),
  heartsRemainingMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  getDailyRetryCountMock: vi.fn(),
  hasFailedLevelMock: vi.fn(),
  markLevelCompletedMock: vi.fn(),
  saveInventoryMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  puzzleIsCompleteMock: vi.fn(),
  computeScoreMock: vi.fn(),
  getUserRankSummaryMock: vi.fn(),
  incrementAllTimeLogicMock: vi.fn(),
  recordAllTimeLevelScoreMock: vi.fn(),
  recordDailyScoreMock: vi.fn(),
  recordLevelWinMock: vi.fn(),
  recordQualifiedLevelWinMock: vi.fn(),
  updateQuestProgressOnCompletionMock: vi.fn(),
  saveShareCompletionReceiptMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextMock,
  redis: {
    set: redisSetMock,
    hGet: redisHGetMock,
    hGetAll: redisHGetAllMock,
    hSet: redisHSetMock,
    expire: redisExpireMock,
    get: redisGetMock,
    del: redisDelMock,
  },
}));

vi.mock('./session', () => ({
  clearSessionState: clearSessionStateMock,
  createSessionState: vi.fn(),
  getSessionState: getSessionStateMock,
  heartsRemaining: heartsRemainingMock,
  saveSessionState: vi.fn(),
  saveSessionTimingState: vi.fn(),
}));

vi.mock('./puzzle-store', () => ({
  getDailyPointer: vi.fn(),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublic: vi.fn(),
}));

vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getDailyRetryCount: getDailyRetryCountMock,
  getInventory: getInventoryMock,
  getUserProfile: getUserProfileMock,
  hasFailedLevel: hasFailedLevelMock,
  incrementDailyRetryCount: vi.fn(),
  markLevelCompleted: markLevelCompletedMock,
  markLevelFailed: vi.fn(),
  registerKnownUser: vi.fn(),
  saveInventory: saveInventoryMock,
  saveUserProfile: saveUserProfileMock,
}));

vi.mock('./gameplay', () => ({
  applyHammer: vi.fn(),
  applyRocket: vi.fn(),
  applyWand: vi.fn(),
  checkPadlockStatus: vi.fn(),
  getUnlockedWordIndices: vi.fn(),
  puzzleIsComplete: puzzleIsCompleteMock,
  revealFromGuess: vi.fn(),
  tileIsLocked: vi.fn(),
}));

vi.mock('./leaderboard', () => ({
  computeScore: computeScoreMock,
  getUserRankSummary: getUserRankSummaryMock,
  incrementAllTimeLogic: incrementAllTimeLogicMock,
  recordAllTimeLevelScore: recordAllTimeLevelScoreMock,
  recordDailyScore: recordDailyScoreMock,
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
  recordQualifiedLevelPlay: vi.fn(),
  recordQualifiedLevelFailure: vi.fn(),
  recordQualifiedLevelWin: recordQualifiedLevelWinMock,
  recordLevelPlay: vi.fn(),
  recordLevelWin: recordLevelWinMock,
  touchQualifiedLevelPlay: vi.fn(),
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCoinSpend: vi.fn(),
  updateQuestProgressOnCompletion: updateQuestProgressOnCompletionMock,
  updateQuestProgressOnShare: vi.fn(),
}));

vi.mock('./share-receipts', () => ({
  saveShareCompletionReceipt: saveShareCompletionReceiptMock,
}));

vi.mock('./economy', () => ({
  consumePowerup: vi.fn(),
  purchasePowerup: vi.fn(),
}));

vi.mock('./hearts', () => ({
  canStartChallenge: vi.fn(),
  consumeHeartOnFailure: vi.fn((profile) => profile),
}));

vi.mock('./endless-catalog', () => ({
  getEndlessCatalogStatus: vi.fn(),
  getNextEndlessCatalogLevelId: vi.fn(),
}));

import { completeSessionForLevel } from './game-service';

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
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
});

const inventoryFixture = (): Inventory => ({
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
});

const sessionFixture = (): SessionState => ({
  activeLevelId: 'lvl_0001',
  mode: 'daily',
  startTimestamp: 1000,
  activeMs: 20_000,
  lastSeenAt: 21_000,
  mistakesMade: 1,
  shieldIsActive: false,
  revealedIndices: [0, 2],
  usedPowerups: 0,
  wrongGuesses: 1,
  guessCount: 3,
});

const puzzleFixture = (): PuzzlePrivate => ({
  levelId: 'lvl_0001',
  dateKey: '2026-04-08',
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
  difficulty: 3,
  targetTimeSeconds: 60,
  starThresholds: { '3_star': 60, '2_star': 90, '1_star': 120 },
  isLogical: false,
  createdAt: 0,
});

afterEach(() => {
  redisSetMock.mockReset();
  redisHGetMock.mockReset();
  redisHGetAllMock.mockReset();
  redisHSetMock.mockReset();
  redisExpireMock.mockReset();
  redisGetMock.mockReset();
  redisDelMock.mockReset();
  getSessionStateMock.mockReset();
  clearSessionStateMock.mockReset();
  heartsRemainingMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getUserProfileMock.mockReset();
  getInventoryMock.mockReset();
  getDailyRetryCountMock.mockReset();
  hasFailedLevelMock.mockReset();
  markLevelCompletedMock.mockReset();
  saveInventoryMock.mockReset();
  saveUserProfileMock.mockReset();
  puzzleIsCompleteMock.mockReset();
  computeScoreMock.mockReset();
  getUserRankSummaryMock.mockReset();
  incrementAllTimeLogicMock.mockReset();
  recordAllTimeLevelScoreMock.mockReset();
  recordDailyScoreMock.mockReset();
  recordLevelWinMock.mockReset();
  recordQualifiedLevelWinMock.mockReset();
  updateQuestProgressOnCompletionMock.mockReset();
  saveShareCompletionReceiptMock.mockReset();
});

const arrangeHappyPath = () => {
  getSessionStateMock.mockResolvedValue(sessionFixture());
  getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
  getUserProfileMock.mockResolvedValue(profileFixture());
  getInventoryMock.mockResolvedValue(inventoryFixture());
  getDailyRetryCountMock.mockResolvedValue(0);
  puzzleIsCompleteMock.mockReturnValue(true);
  hasFailedLevelMock.mockResolvedValue(false);
  computeScoreMock.mockReturnValue(120);
  getUserRankSummaryMock.mockResolvedValue({
    dailyRank: null,
    endlessRank: null,
    currentRank: null,
    bestOverallRank: null,
  });
  heartsRemainingMock.mockReturnValue(3);
};

describe('completeSessionForLevel completion lock', () => {
  it('returns accepted=false without mutations when completion lock is already held', async () => {
    arrangeHappyPath();
    redisSetMock.mockResolvedValue(null);

    const result = await completeSessionForLevel({
      levelId: 'lvl_0001',
      mode: 'daily',
    });

    expect(result.accepted).toBe(false);
    expect(markLevelCompletedMock).not.toHaveBeenCalled();
    expect(recordDailyScoreMock).not.toHaveBeenCalled();
    expect(saveUserProfileMock).not.toHaveBeenCalled();
  });

  it('re-checks completion marker under lock and skips duplicate acceptance', async () => {
    arrangeHappyPath();
    redisSetMock.mockResolvedValue('OK');
    redisHGetAllMock.mockResolvedValue({});
    redisHGetMock.mockResolvedValue('1712582400000');
    redisHSetMock.mockResolvedValue(undefined);
    redisExpireMock.mockResolvedValue(undefined);
    redisGetMock.mockImplementation(async () => {
      const firstCall = redisSetMock.mock.calls[0];
      if (!firstCall) {
        return null;
      }
      return firstCall[1];
    });

    const result = await completeSessionForLevel({
      levelId: 'lvl_0001',
      mode: 'daily',
    });

    expect(result.accepted).toBe(false);
    expect(clearSessionStateMock).toHaveBeenCalledTimes(1);
    expect(markLevelCompletedMock).not.toHaveBeenCalled();
    expect(redisDelMock).toHaveBeenCalledTimes(1);
  });

  it('releases lock after successful completion', async () => {
    arrangeHappyPath();
    redisSetMock.mockResolvedValue('OK');
    redisHGetAllMock.mockResolvedValue({});
    redisHGetMock.mockResolvedValue(undefined);
    redisHSetMock.mockResolvedValue(undefined);
    redisExpireMock.mockResolvedValue(undefined);
    redisGetMock.mockImplementation(async () => {
      const firstCall = redisSetMock.mock.calls[0];
      if (!firstCall) {
        return null;
      }
      return firstCall[1];
    });

    const result = await completeSessionForLevel({
      levelId: 'lvl_0001',
      mode: 'daily',
    });

    expect(result.accepted).toBe(true);
    expect(markLevelCompletedMock).toHaveBeenCalledTimes(1);
    expect(saveShareCompletionReceiptMock).toHaveBeenCalledTimes(1);
    expect(redisDelMock).toHaveBeenCalledTimes(1);
  });

  it('releases lock even when completion pipeline throws', async () => {
    arrangeHappyPath();
    redisSetMock.mockResolvedValue('OK');
    redisHGetAllMock.mockResolvedValue({});
    redisHGetMock.mockResolvedValue(undefined);
    redisHSetMock.mockResolvedValue(undefined);
    redisExpireMock.mockResolvedValue(undefined);
    redisGetMock.mockImplementation(async () => {
      const firstCall = redisSetMock.mock.calls[0];
      if (!firstCall) {
        return null;
      }
      return firstCall[1];
    });
    markLevelCompletedMock.mockRejectedValue(new Error('write failed'));

    await expect(
      completeSessionForLevel({
        levelId: 'lvl_0001',
        mode: 'daily',
      })
    ).rejects.toThrow('write failed');

    expect(redisDelMock).toHaveBeenCalledTimes(1);
  });
});
