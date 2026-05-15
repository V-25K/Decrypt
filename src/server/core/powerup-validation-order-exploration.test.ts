import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, PuzzlePrivate, SessionState, UserProfile } from '../../shared/game';

const {
  contextMock,
  getPuzzlePrivateMock,
  getSessionStateMock,
  getUserProfileMock,
  getInventoryMock,
  consumePowerupMock,
  tileIsLockedMock,
  checkPadlockStatusMock,
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
  consumePowerupMock: vi.fn(),
  tileIsLockedMock: vi.fn(),
  checkPadlockStatusMock: vi.fn(),
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
  saveSessionState: vi.fn(),
  saveSessionTimingState: vi.fn(),
}));

vi.mock('./gameplay', () => ({
  applyHammer: vi.fn(),
  applyRocket: vi.fn(),
  applyWand: vi.fn(),
  checkPadlockStatus: checkPadlockStatusMock,
  getUnlockedWordIndices: vi.fn(),
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
  recordQualifiedLevelFailure: vi.fn(),
  recordQualifiedLevelWin: vi.fn(),
  recordLevelPlay: vi.fn(),
  recordLevelWin: vi.fn(),
  touchQualifiedLevelPlay: vi.fn(),
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
  lockIndices: [0], // Make tile 0 locked to trigger the bug condition
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
  vi.clearAllMocks();
});

/**
 * Powerup Validation Order Exploration Test
 * 
 * **Validates: Requirements 2.6**
 * 
 * Property 1: Bug Condition - Powerup Validation Order Issue
 * 
 * CRITICAL: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * DO NOT attempt to fix the test or the code when it fails
 * 
 * NOTE: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * GOAL: Surface counterexamples that demonstrate confusing error message order
 * 
 * Scoped PBT Approach: Scope to concrete failing case: hammer on locked tile with no inventory
 * Test that `usePowerupForSession` validates target before checking inventory availability
 * Simulate: player clicks hammer on locked tile (invalid target) with no hammer inventory
 * Run test on UNFIXED code
 * 
 * EXPECTED OUTCOME: Test FAILS (this is correct - it proves the validation order issue exists)
 * Document counterexamples found: "Shows 'Cannot Hammer Locked Tiles' instead of 'No inventory available'"
 */

describe('Powerup Validation Order Bug Condition - Exploration Test', () => {
  it('Property 1: Bug Condition - Powerup Validation Order Issue', async () => {
    /**
     * **Validates: Requirements 2.6**
     * 
     * This test demonstrates the bug where target validation happens before inventory checks.
     * 
     * Bug Condition Setup:
     * - Player has NO hammer inventory (hammer: 0)
     * - Player clicks hammer on a LOCKED tile (invalid target)
     * - Current code validates target first, shows "Cannot Hammer Locked Tiles"
     * - Expected behavior: check inventory first, show "No inventory available"
     * 
     * The test expects inventory-first validation but will fail on unfixed code
     * because target validation happens first.
     */

    // Setup: Player has no hammer inventory
    const emptyInventory = inventoryFixture({ hammer: 0 });
    
    // Setup: Puzzle with locked tile at index 0
    const puzzleWithLockedTile = puzzleFixture();
    
    // Setup: Session state
    const session = sessionFixture();
    
    // Mock the dependencies
    getPuzzlePrivateMock.mockResolvedValue(puzzleWithLockedTile);
    getSessionStateMock.mockResolvedValue(session);
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(emptyInventory);
    checkPadlockStatusMock.mockReturnValue({
      lockedIndexSet: new Set<number>(),
      unlockedChainIdSet: new Set<number>(),
      unlockedChainIds: [],
      lockedIndices: [],
    });
    
    // Mock tile as locked (this triggers the target validation error)
    tileIsLockedMock.mockReturnValue(true);
    
    // Mock consumePowerup to return inventory error (this should be checked first)
    consumePowerupMock.mockResolvedValue({
      success: false,
      reason: 'No inventory available.',
      profile: profileFixture(),
      inventory: emptyInventory,
    });

    // Execute: Try to use hammer on locked tile with no inventory
    const result = await usePowerupForSession({
      levelId: 'lvl_9001',
      itemType: 'hammer',
      targetIndex: 0, // Locked tile
    });

    // Expected behavior (after fix): Should check inventory first
    // This assertion will FAIL on unfixed code because target validation happens first
    expect(result.success).toBe(false);
    expect(result.reason).toBe('No inventory available.');
    expect(result.errorCode).toBe(null);
    
    // Verify that consumePowerup was called (inventory check happened)
    expect(consumePowerupMock).toHaveBeenCalledWith({
      userId: 't2_test',
      itemType: 'hammer',
    });
    
    // Document the counterexample that demonstrates the bug:
    // On unfixed code, this test will fail because:
    // - result.reason will be "Cannot Hammer Locked Tiles" (target validation error)
    // - result.errorCode will be "TILE_LOCKED" 
    // - consumePowerup will NOT be called (inventory check skipped)
    // 
    // This proves the validation order bug exists: target validation happens before inventory checks
  });
});
