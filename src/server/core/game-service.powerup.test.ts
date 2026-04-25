import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, PuzzlePrivate, SessionState, UserProfile } from '../../shared/game';

const {
  contextMock,
  getPuzzlePrivateMock,
  getSessionStateMock,
  getUserProfileMock,
  getInventoryMock,
  saveSessionStateMock,
  consumePowerupMock,
  applyHammerMock,
  applyRocketMock,
  applyWandMock,
  checkPadlockStatusMock,
  getUnlockedWordIndicesMock,
  tileIsLockedMock,
} = vi.hoisted(() => ({
  contextMock: {
    userId: 't2_test',
    postId: 't3_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postData: {},
  },
  getPuzzlePrivateMock: vi.fn(),
  getSessionStateMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  saveSessionStateMock: vi.fn(),
  consumePowerupMock: vi.fn(),
  applyHammerMock: vi.fn(),
  applyRocketMock: vi.fn(),
  applyWandMock: vi.fn(),
  checkPadlockStatusMock: vi.fn(),
  getUnlockedWordIndicesMock: vi.fn(),
  tileIsLockedMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextMock,
}));

vi.mock('./puzzle-store', () => ({
  getDailyPointer: vi.fn(),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublic: vi.fn(),
}));

vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getDailyRetryCount: vi.fn(),
  getInventory: getInventoryMock,
  getUserProfile: getUserProfileMock,
  hasFailedLevel: vi.fn(),
  incrementDailyRetryCount: vi.fn(),
  markLevelCompleted: vi.fn(),
  markLevelFailed: vi.fn(),
  registerKnownUser: vi.fn(),
  saveInventory: vi.fn(),
  saveUserProfile: vi.fn(),
}));

vi.mock('./session', () => ({
  clearSessionState: vi.fn(),
  createSessionState: vi.fn(),
  getSessionState: getSessionStateMock,
  heartsRemaining: vi.fn(),
  saveSessionState: saveSessionStateMock,
  saveSessionTimingState: vi.fn(),
}));

vi.mock('./gameplay', () => ({
  applyHammer: applyHammerMock,
  applyRocket: applyRocketMock,
  applyWand: applyWandMock,
  checkPadlockStatus: checkPadlockStatusMock,
  getUnlockedWordIndices: getUnlockedWordIndicesMock,
  puzzleIsComplete: vi.fn(),
  revealFromGuess: vi.fn(),
  tileIsLocked: tileIsLockedMock,
}));

vi.mock('./economy', () => ({
  consumePowerup: consumePowerupMock,
  purchasePowerup: vi.fn(),
}));

vi.mock('./constants', async () => {
  const actual = await vi.importActual<typeof import('./constants')>('./constants');
  return actual;
});

vi.mock('./leaderboard', () => ({
  computeScore: vi.fn(),
  getUserRankSummary: vi.fn(),
  incrementAllTimeLogic: vi.fn(),
  recordAllTimeLevelScore: vi.fn(),
  recordDailyScore: vi.fn(),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
  recordQualifiedLevelPlay: vi.fn(),
  recordQualifiedLevelWin: vi.fn(),
  recordLevelPlay: vi.fn(),
  recordLevelWin: vi.fn(),
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCompletion: vi.fn(),
  updateQuestProgressOnCoinSpend: vi.fn(),
  updateQuestProgressOnShare: vi.fn(),
}));

vi.mock('./hearts', () => ({
  canStartChallenge: vi.fn(),
  consumeHeartOnFailure: vi.fn((profile) => profile),
}));

vi.mock('./share-receipts', () => ({
  saveShareCompletionReceipt: vi.fn(),
}));

vi.mock('./endless-catalog', () => ({
  getEndlessCatalogStatus: vi.fn(),
  getNextEndlessCatalogLevelId: vi.fn(),
}));

import { usePowerupForSession } from './game-service';

const profileFixture = (): UserProfile => ({
  coins: 1000,
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

const inventoryFixture = (overrides?: Partial<Inventory>): Inventory => ({
  hammer: 1,
  wand: 1,
  shield: 1,
  rocket: 1,
  ...overrides,
});

const sessionFixture = (overrides?: Partial<SessionState>): SessionState => ({
  activeLevelId: 'lvl_9001',
  mode: 'daily',
  startTimestamp: 100,
  activeMs: 0,
  lastSeenAt: 50,
  mistakesMade: 0,
  shieldIsActive: false,
  revealedIndices: [],
  usedPowerups: 0,
  wrongGuesses: 0,
  guessCount: 0,
  ...overrides,
});

const puzzleFixture = (): PuzzlePrivate => ({
  levelId: 'lvl_9001',
  dateKey: '2026-04-06',
  targetText: 'A B',
  author: 'TEST',
  challengeType: 'QUOTE',
  source: 'MANUAL_INJECTED',
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
  starThresholds: { '3_star': 60, '2_star': 90, '1_star': 120 },
  isLogical: false,
  createdAt: 0,
});

afterEach(() => {
  getPuzzlePrivateMock.mockReset();
  getSessionStateMock.mockReset();
  getUserProfileMock.mockReset();
  getInventoryMock.mockReset();
  saveSessionStateMock.mockReset();
  consumePowerupMock.mockReset();
  applyHammerMock.mockReset();
  applyRocketMock.mockReset();
  applyWandMock.mockReset();
  checkPadlockStatusMock.mockReset();
  getUnlockedWordIndicesMock.mockReset();
  tileIsLockedMock.mockReset();
  vi.restoreAllMocks();
});

describe('usePowerupForSession', () => {
  it('does not compute hammer effect or save session when consume fails', async () => {
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(sessionFixture());
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });
    tileIsLockedMock.mockReturnValue(false);
    consumePowerupMock.mockResolvedValue({
      success: false,
      reason: 'No hammer left.',
      profile: profileFixture(),
      inventory: inventoryFixture({ hammer: 0 }),
    });

    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'hammer',
      targetIndex: 0,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('No hammer left.');
    expect(consumePowerupMock).toHaveBeenCalledTimes(1);
    expect(applyHammerMock).not.toHaveBeenCalled();
    expect(saveSessionStateMock).not.toHaveBeenCalled();
  });

  it('validates hammer target, then consumes inventory, then saves session', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(sessionFixture());
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });
    tileIsLockedMock.mockReturnValue(false);
    consumePowerupMock.mockResolvedValue({
      success: true,
      reason: null,
      profile: profileFixture(),
      inventory: inventoryFixture({ hammer: 0 }),
    });
    applyHammerMock.mockReturnValue({
      revealedTiles: [{ index: 0, letter: 'A' }],
      revealedIndices: [0],
      revealedLetter: 'A',
    });

    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'hammer',
      targetIndex: 0,
    });

    expect(result.success).toBe(true);
    expect(consumePowerupMock).toHaveBeenCalledTimes(1);
    expect(applyHammerMock).toHaveBeenCalledTimes(1);
    const consumeCallOrder = consumePowerupMock.mock.invocationCallOrder[0];
    const applyCallOrder = applyHammerMock.mock.invocationCallOrder[0];
    if (consumeCallOrder === undefined || applyCallOrder === undefined) {
      throw new Error('Expected consume and hammer call order metadata');
    }
    expect(consumeCallOrder).toBeLessThan(applyCallOrder);
    expect(saveSessionStateMock).toHaveBeenCalledWith(
      't2_test',
      't3_test',
      expect.objectContaining({
        revealedIndices: [0],
        usedPowerups: 1,
        startTimestamp: 1000,
      })
    );
    nowSpy.mockRestore();
  });

  it('rejects wand use when a word only has blind tiles left unrevealed', async () => {
    getPuzzlePrivateMock.mockResolvedValue({
      ...puzzleFixture(),
      targetText: 'AB',
      tiles: [
        { index: 0, char: 'A', isLetter: true, wordIndex: 0 },
        { index: 1, char: 'B', isLetter: true, wordIndex: 0 },
      ],
      words: ['AB'],
      blindIndices: [1],
    });
    getSessionStateMock.mockResolvedValue(sessionFixture({ revealedIndices: [0] }));
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });
    getUnlockedWordIndicesMock.mockReturnValue(new Set([0]));
    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'wand',
      targetIndex: 0,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_TARGET');
    expect(result.reason).toBe('Select an unlocked word with missing letters.');
    expect(consumePowerupMock).not.toHaveBeenCalled();
    expect(applyWandMock).not.toHaveBeenCalled();
    expect(saveSessionStateMock).not.toHaveBeenCalled();
  });

  it('does not consume hammer inventory when the tile is locked', async () => {
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(sessionFixture());
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });
    tileIsLockedMock.mockReturnValue(true);

    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'hammer',
      targetIndex: 0,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TILE_LOCKED');
    expect(result.reason).toBe('Cannot Hammer Locked Tiles.');
    expect(consumePowerupMock).not.toHaveBeenCalled();
    expect(saveSessionStateMock).not.toHaveBeenCalled();
  });

  it('does not consume hammer inventory when the target is invalid', async () => {
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(sessionFixture());
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });
    tileIsLockedMock.mockReturnValue(false);

    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'hammer',
      targetIndex: 1,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_TARGET');
    expect(result.reason).toBe('Hammer target is invalid.');
    expect(consumePowerupMock).not.toHaveBeenCalled();
    expect(saveSessionStateMock).not.toHaveBeenCalled();
  });

  it('does not consume shield inventory when shield is already active', async () => {
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(
      sessionFixture({
        shieldIsActive: true,
      })
    );
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });

    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'shield',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Shield is already active.');
    expect(consumePowerupMock).not.toHaveBeenCalled();
    expect(saveSessionStateMock).not.toHaveBeenCalled();
  });

  it('does not consume rocket inventory when there are no unlocked candidates', async () => {
    getPuzzlePrivateMock.mockResolvedValue(puzzleFixture());
    getSessionStateMock.mockResolvedValue(
      sessionFixture({
        revealedIndices: [0, 2],
      })
    );
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });

    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'rocket',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('No unlocked tiles available for Rocket.');
    expect(consumePowerupMock).not.toHaveBeenCalled();
    expect(applyRocketMock).not.toHaveBeenCalled();
    expect(saveSessionStateMock).not.toHaveBeenCalled();
  });
});
