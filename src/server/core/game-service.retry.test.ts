import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, SessionState, UserProfile } from '../../shared/game';

  const {
  contextMock,
  redisWatchMock,
  redisHGetMock,
  txMock,
  getCompletedLevelsMock,
  getDailyRetryCountMock,
  getInventoryMock,
  getPuzzlePrivateMock,
  getSessionStateMock,
  getUserProfileMock,
  hasFailedLevelMock,
  saveUserProfileMock,
  createSessionStateMock,
  heartsRemainingMock,
  canStartChallengeMock,
  updateQuestProgressOnCoinSpendMock,
} = vi.hoisted(() => ({
  contextMock: {
    userId: 't2_test',
    postId: 't3_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postData: {},
  },
  redisWatchMock: vi.fn(),
  redisHGetMock: vi.fn(),
  txMock: {
    multi: vi.fn(),
    hIncrBy: vi.fn(),
    exec: vi.fn(),
    unwatch: vi.fn(),
  },
  getCompletedLevelsMock: vi.fn(),
  getDailyRetryCountMock: vi.fn(),
  getInventoryMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getSessionStateMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  hasFailedLevelMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  createSessionStateMock: vi.fn(),
  heartsRemainingMock: vi.fn(),
  canStartChallengeMock: vi.fn(),
  updateQuestProgressOnCoinSpendMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextMock,
  redis: {
    watch: redisWatchMock,
    hGet: redisHGetMock,
  },
}));

vi.mock('./state', () => ({
  getCompletedLevels: getCompletedLevelsMock,
  getDailyRetryCount: getDailyRetryCountMock,
  getInventory: getInventoryMock,
  getUserProfile: getUserProfileMock,
  hasFailedLevel: hasFailedLevelMock,
	  incrementDailyRetryCount: vi.fn(),
	  markLevelCompleted: vi.fn(),
	  markLevelFailed: vi.fn(),
	  unmarkLevelFailed: vi.fn(),
	  registerKnownUser: vi.fn(),
  saveInventory: vi.fn(),
  saveUserProfile: saveUserProfileMock,
}));

vi.mock('./session', () => ({
  clearSessionState: vi.fn(),
  createSessionState: createSessionStateMock,
  getSessionState: getSessionStateMock,
  heartsRemaining: heartsRemainingMock,
  saveSessionState: vi.fn(),
  saveSessionTimingState: vi.fn(),
}));

vi.mock('./puzzle-store', () => ({
  getDailyPointer: vi.fn(),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublic: vi.fn(),
  isPuzzleRemovedFromPlay: vi.fn(async () => false),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
  recordQualifiedLevelPlay: vi.fn(),
  recordQualifiedLevelFailure: vi.fn(),
  recordQualifiedLevelWin: vi.fn(),
  recordLevelPlay: vi.fn(),
  recordLevelWin: vi.fn(),
  touchQualifiedLevelPlay: vi.fn(),
}));

vi.mock('./gameplay', () => ({
  applyHammer: vi.fn(),
  applyRocket: vi.fn(),
  applyWand: vi.fn(),
  checkPadlockStatus: vi.fn(),
  puzzleIsComplete: vi.fn(),
  revealFromGuess: vi.fn(),
  tileIsLocked: vi.fn(),
}));

vi.mock('./hearts', () => ({
  canStartChallenge: canStartChallengeMock,
  consumeHeartOnFailure: vi.fn((profile) => profile),
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCoinSpend: updateQuestProgressOnCoinSpendMock,
  updateQuestProgressOnCompletion: vi.fn(),
  updateQuestProgressOnShare: vi.fn(),
}));

import { purchaseDailyRetryForLevel } from './game-service';

const profileFixture = (overrides?: Partial<UserProfile>): UserProfile => ({
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
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
  ...overrides,
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
  startTimestamp: 0,
  activeMs: 0,
  lastSeenAt: 0,
  mistakesMade: 0,
  shieldIsActive: false,
  revealedIndices: [],
  usedPowerups: 0,
  wrongGuesses: 0,
  guessCount: 0,
});

afterEach(() => {
  getCompletedLevelsMock.mockReset();
  getDailyRetryCountMock.mockReset();
  getInventoryMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getSessionStateMock.mockReset();
  getUserProfileMock.mockReset();
  hasFailedLevelMock.mockReset();
  saveUserProfileMock.mockReset();
  createSessionStateMock.mockReset();
  heartsRemainingMock.mockReset();
  canStartChallengeMock.mockReset();
  updateQuestProgressOnCoinSpendMock.mockReset();
  redisWatchMock.mockReset();
  redisHGetMock.mockReset();
  txMock.multi.mockReset();
  txMock.hIncrBy.mockReset();
  txMock.exec.mockReset();
  txMock.unwatch.mockReset();
});

beforeEach(() => {
  getPuzzlePrivateMock.mockResolvedValue({
    prefilledIndices: [],
    difficulty: 5,
  });
});

describe('purchaseDailyRetryForLevel', () => {
  it('rejects endless retry purchases', async () => {
    await expect(
      purchaseDailyRetryForLevel({
        levelId: 'endless_0001',
        mode: 'endless',
      })
    ).rejects.toThrow('Paid retries are only available for daily challenges.');
  });

  it('rejects retries when the daily was not failed', async () => {
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    hasFailedLevelMock.mockResolvedValue(false);
    getDailyRetryCountMock.mockResolvedValue(0);
    getSessionStateMock.mockResolvedValue(null);

    await expect(
      purchaseDailyRetryForLevel({
        levelId: 'lvl_0001',
        mode: 'daily',
      })
    ).rejects.toThrow('Daily retry is only available after a failed daily.');
  });

  it('rejects retries when the daily is already completed', async () => {
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['lvl_0001']));
    hasFailedLevelMock.mockResolvedValue(true);
    getDailyRetryCountMock.mockResolvedValue(0);
    getSessionStateMock.mockResolvedValue(null);

    await expect(
      purchaseDailyRetryForLevel({
        levelId: 'lvl_0001',
        mode: 'daily',
      })
    ).rejects.toThrow('Daily challenge already completed.');
  });

  it('rejects retries when the player lacks coins', async () => {
    getUserProfileMock.mockResolvedValue(profileFixture({ coins: 20 }));
    getInventoryMock.mockResolvedValue(inventoryFixture());
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    hasFailedLevelMock.mockResolvedValue(true);
    getDailyRetryCountMock.mockResolvedValue(0);
    getSessionStateMock.mockResolvedValue(null);
    canStartChallengeMock.mockReturnValue(true);
    redisWatchMock.mockResolvedValue(txMock);
    redisHGetMock.mockImplementation(async (_key: string, field: string) => {
      if (field === 'coins') {
        return '20';
      }
      if (field === 'lvl_0001') {
        return '0';
      }
      return undefined;
    });

    await expect(
      purchaseDailyRetryForLevel({
        levelId: 'lvl_0001',
        mode: 'daily',
      })
    ).rejects.toThrow('Not enough coins for daily retry.');
  });

  it('starts a paid retry session and escalates the stored retry count', async () => {
    getUserProfileMock
      .mockResolvedValueOnce(profileFixture({ coins: 500 }))
      .mockResolvedValueOnce(profileFixture({ coins: 360 }));
    getInventoryMock.mockResolvedValue(inventoryFixture());
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    hasFailedLevelMock.mockResolvedValue(true);
    getDailyRetryCountMock.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    getSessionStateMock.mockResolvedValue(null);
    canStartChallengeMock.mockReturnValue(true);
    getPuzzlePrivateMock.mockResolvedValue({ prefilledIndices: [0] });
    createSessionStateMock.mockResolvedValue(sessionFixture());
    heartsRemainingMock.mockReturnValue(3);
    redisWatchMock.mockResolvedValue(txMock);
    txMock.exec.mockResolvedValue(['ok']);
    redisHGetMock.mockImplementation(async (_key: string, field: string) => {
      if (field === 'coins') {
        return '500';
      }
      if (field === 'lvl_0001') {
        return '1';
      }
      return undefined;
    });

    const result = await purchaseDailyRetryForLevel({
      levelId: 'lvl_0001',
      mode: 'daily',
    });

    expect(redisWatchMock).toHaveBeenCalledTimes(1);
    expect(txMock.multi).toHaveBeenCalledTimes(1);
    expect(txMock.hIncrBy).toHaveBeenCalledTimes(2);
    expect(saveUserProfileMock).not.toHaveBeenCalled();
    expect(updateQuestProgressOnCoinSpendMock).toHaveBeenCalledWith({
      userId: 't2_test',
      amount: 70,
    });
    expect(result.retryCount).toBe(2);
    expect(result.nextRetryCost).toBe(105);
    expect(result.retryScoreFactor).toBe(0.8923308604816518);
    expect(result.nextRetryScoreFactor).toBe(0.8293484513785037);
    expect(result.requiresPaidRetry).toBe(false);
    expect(createSessionStateMock).toHaveBeenCalledWith({
      userId: 't2_test',
      postId: 't3_test',
      levelId: 'lvl_0001',
      mode: 'daily',
      prefilledIndices: [0],
    });
  });

  it('fails with a retryable message after repeated transaction conflicts', async () => {
    getUserProfileMock.mockResolvedValue(profileFixture({ coins: 500 }));
    getInventoryMock.mockResolvedValue(inventoryFixture());
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    hasFailedLevelMock.mockResolvedValue(true);
    getDailyRetryCountMock.mockResolvedValue(1);
    getSessionStateMock.mockResolvedValue(null);
    canStartChallengeMock.mockReturnValue(true);
    redisWatchMock.mockResolvedValue(txMock);
    txMock.exec.mockResolvedValue(null);
    redisHGetMock.mockImplementation(async (_key: string, field: string) => {
      if (field === 'coins') {
        return '500';
      }
      if (field === 'lvl_0001') {
        return '1';
      }
      return undefined;
    });

    await expect(
      purchaseDailyRetryForLevel({
        levelId: 'lvl_0001',
        mode: 'daily',
      })
    ).rejects.toThrow('Daily retry purchase conflicted. Please try again.');

    expect(txMock.exec).toHaveBeenCalledTimes(3);
    expect(updateQuestProgressOnCoinSpendMock).not.toHaveBeenCalled();
  });
});
