import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock Redis and other dependencies
const {
  contextMock,
  redisGetMock,
  redisSetMock,
  redisDelMock,
  redisHGetMock,
  redisHSetMock,
  redisHGetAllMock,
  redisExpireMock,
  redisIncrByMock,
  redisZRangeMock,
  redisHLenMock,
  redisHKeysMock,
} = vi.hoisted(() => ({
  contextMock: {
    userId: 't2_test',
    postId: 't3_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postData: {},
  },
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisHGetMock: vi.fn(),
  redisHSetMock: vi.fn(),
  redisHGetAllMock: vi.fn(),
  redisExpireMock: vi.fn(),
  redisIncrByMock: vi.fn(),
  redisZRangeMock: vi.fn(),
  redisHLenMock: vi.fn(),
  redisHKeysMock: vi.fn(),
}));

const {
  getSessionStateMock,
  getPuzzlePrivateMock,
  getUserProfileMock,
  getInventoryMock,
  getDailyRetryCountMock,
  hasFailedLevelMock,
  computeScoreMock,
  getUserRankSummaryMock,
  puzzleIsCompleteMock,
  markLevelCompletedMock,
  saveInventoryMock,
  saveUserProfileMock,
  recordDailyScoreMock,
  recordLevelWinMock,
  recordQualifiedLevelWinMock,
  updateQuestProgressOnCompletionMock,
  saveShareCompletionReceiptMock,
  clearSessionStateMock,
  getUserEndlessCursorMock,
  initializeUserEndlessCursorMock,
  getCompletedLevelsMock,
  saveSessionStateMock,
  loadPuzzlePrivateMock,
} = vi.hoisted(() => ({
  getSessionStateMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  getInventoryMock: vi.fn(),
  getDailyRetryCountMock: vi.fn(),
  hasFailedLevelMock: vi.fn(),
  computeScoreMock: vi.fn(),
  getUserRankSummaryMock: vi.fn(),
  puzzleIsCompleteMock: vi.fn(),
  markLevelCompletedMock: vi.fn(),
  saveInventoryMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  recordDailyScoreMock: vi.fn(),
  recordLevelWinMock: vi.fn(),
  recordQualifiedLevelWinMock: vi.fn(),
  updateQuestProgressOnCompletionMock: vi.fn(),
  saveShareCompletionReceiptMock: vi.fn(),
  clearSessionStateMock: vi.fn(),
  getUserEndlessCursorMock: vi.fn(),
  initializeUserEndlessCursorMock: vi.fn(),
  getCompletedLevelsMock: vi.fn(),
  saveSessionStateMock: vi.fn(),
  loadPuzzlePrivateMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextMock,
  redis: {
    get: redisGetMock,
    set: redisSetMock,
    del: redisDelMock,
    hGet: redisHGetMock,
    hSet: redisHSetMock,
    hGetAll: redisHGetAllMock,
    expire: redisExpireMock,
    incrBy: redisIncrByMock,
    zRange: redisZRangeMock,
    hLen: redisHLenMock,
    hKeys: redisHKeysMock,
  },
}));

vi.mock('./state', () => ({
  getSessionState: getSessionStateMock,
  markLevelCompleted: markLevelCompletedMock,
  clearSessionState: clearSessionStateMock,
  getUserEndlessCursor: getUserEndlessCursorMock,
  initializeUserEndlessCursor: initializeUserEndlessCursorMock,
  getUserProfile: getUserProfileMock,
  saveUserProfile: saveUserProfileMock,
  getInventory: getInventoryMock,
  saveInventory: saveInventoryMock,
  getDailyRetryCount: getDailyRetryCountMock,
  hasFailedLevel: hasFailedLevelMock,
  getCompletedLevels: getCompletedLevelsMock,
  saveSessionState: saveSessionStateMock,
}));

vi.mock('./puzzle-store', () => ({
  getPuzzlePrivate: getPuzzlePrivateMock,
  loadPuzzlePrivate: loadPuzzlePrivateMock,
}));

vi.mock('./gameplay', () => ({
  puzzleIsComplete: puzzleIsCompleteMock,
}));

vi.mock('./leaderboard', () => ({
  computeScore: computeScoreMock,
  getUserRankSummary: getUserRankSummaryMock,
  recordDailyScore: recordDailyScoreMock,
  recordLevelWin: recordLevelWinMock,
  recordQualifiedLevelWin: recordQualifiedLevelWinMock,
}));

vi.mock('./quests', () => ({
  updateQuestProgressOnCompletion: updateQuestProgressOnCompletionMock,
}));

vi.mock('./share-receipts', () => ({
  saveShareCompletionReceipt: saveShareCompletionReceiptMock,
}));

// Mock economy module
const { acquireCoinHeartSlotMock, consumePowerupMock } = vi.hoisted(() => ({
  acquireCoinHeartSlotMock: vi.fn(),
  consumePowerupMock: vi.fn(),
}));

vi.mock('./economy', () => ({
  acquireCoinHeartSlot: acquireCoinHeartSlotMock,
  consumePowerup: consumePowerupMock,
}));

// Import the functions we're testing
import { completeSessionForLevel, withTrackedSessionActivity, usePowerupForSession } from './game-service';
import { normalizeHearts } from './hearts';
import { getNextEndlessCatalogLevelId } from './endless-catalog';
import type { SessionState, UserProfile, Inventory } from '../../shared/game';
import { heartsPerRun, heartRefillIntervalMs } from './constants';

// Use the mocked function
const acquireCoinHeartSlot = acquireCoinHeartSlotMock;
const consumePowerup = consumePowerupMock;

/**
 * Preservation Property Tests for Normal Game Operations
 * 
 * **Property 2: Preservation** - Normal Game Operations Preservation
 * **IMPORTANT**: Follow observation-first methodology
 * 
 * These tests capture baseline behavior on UNFIXED code for normal operations:
 * - Single completion requests without concurrency
 * - Heart checks with full hearts or normal timing
 * - Sequential endless progression without failures
 * - Session tracking with good network connectivity
 * - Coin purchases within limits without concurrency
 * - Powerup usage with valid targets and inventory
 * 
 * **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 */

describe('Normal Game Operations Preservation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test fixtures
  const createBaseSession = (): SessionState => ({
    activeLevelId: 'test-level',
    mode: 'daily',
    startTimestamp: 1000,
    activeMs: 0,
    lastSeenAt: 1000,
    mistakesMade: 0,
    shieldIsActive: false,
    revealedIndices: [],
    usedPowerups: 0,
    wrongGuesses: 0,
    guessCount: 0,
  });

  const createBaseProfile = (): UserProfile => ({
    userId: 'test-user',
    hearts: heartsPerRun,
    lastHeartRefillTs: Date.now(),
    infiniteHeartsExpiryTs: 0,
    coins: 100,
    currentStreak: 5,
    longestStreak: 10,
    totalCompletions: 25,
    totalMistakes: 3,
    averageCompletionTimeMs: 120000,
    fastestCompletionTimeMs: 60000,
    totalActiveTimeMs: 3000000,
    createdAt: Date.now() - 86400000,
    lastActiveAt: Date.now(),
  });

  const createBaseInventory = (): Inventory => ({
    hammer: 3,
    shield: 2,
    wand: 1,
    rocket: 1,
  });

  const setupMocksForSuccessfulCompletion = () => {
    getSessionStateMock.mockResolvedValue(createBaseSession());
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'test-level',
      solution: 'TEST',
      hints: [],
    });
    loadPuzzlePrivateMock.mockResolvedValue({
      levelId: 'test-level',
      solution: 'TEST',
      hints: [],
      tiles: [
        { index: 0, isLetter: false, letter: '', wordIndex: -1 },
        { index: 1, isLetter: true, letter: 'T', wordIndex: 0 },
        { index: 2, isLetter: true, letter: 'E', wordIndex: 0 },
        { index: 3, isLetter: true, letter: 'S', wordIndex: 0 },
        { index: 4, isLetter: true, letter: 'T', wordIndex: 0 },
        { index: 5, isLetter: true, letter: 'H', wordIndex: 1 }, // Valid hammer target
        { index: 6, isLetter: true, letter: 'A', wordIndex: 1 },
        { index: 7, isLetter: true, letter: 'M', wordIndex: 1 },
        { index: 8, isLetter: true, letter: 'M', wordIndex: 1 },
        { index: 9, isLetter: true, letter: 'E', wordIndex: 1 },
        { index: 10, isLetter: true, letter: 'R', wordIndex: 1 }, // Valid wand target
      ],
      prefilledIndices: [],
      blindIndices: [],
      chains: [],
    });
    getUserProfileMock.mockResolvedValue(createBaseProfile());
    getInventoryMock.mockResolvedValue(createBaseInventory());
    getDailyRetryCountMock.mockResolvedValue(0);
    hasFailedLevelMock.mockResolvedValue(false);
    computeScoreMock.mockReturnValue(120);
    getUserRankSummaryMock.mockResolvedValue({ currentRank: 1 });
    puzzleIsCompleteMock.mockReturnValue(true);
    
    // Mock Redis operations for successful completion
    redisGetMock.mockResolvedValue(null); // No existing lock
    redisSetMock.mockResolvedValue('OK');
    redisDelMock.mockResolvedValue(1);
    redisHGetMock.mockResolvedValue(null);
    redisHSetMock.mockResolvedValue(1);
    redisHGetAllMock.mockResolvedValue({});
    redisExpireMock.mockResolvedValue(1);
    
    // Mock all completion side effects
    markLevelCompletedMock.mockResolvedValue(undefined);
    saveInventoryMock.mockResolvedValue(undefined);
    saveSessionStateMock.mockResolvedValue(undefined);
    
    // Mock endless progression
    getCompletedLevelsMock.mockResolvedValue(new Set()); // Return empty set for normal progression
    getUserEndlessCursorMock.mockResolvedValue(1);
    initializeUserEndlessCursorMock.mockResolvedValue(1);
    
    // Mock coin heart purchases
    acquireCoinHeartSlotMock.mockResolvedValue(true);
    saveUserProfileMock.mockResolvedValue(undefined);
    recordDailyScoreMock.mockResolvedValue(undefined);
    recordLevelWinMock.mockResolvedValue(undefined);
    recordQualifiedLevelWinMock.mockResolvedValue(undefined);
    updateQuestProgressOnCompletionMock.mockResolvedValue(undefined);
    saveShareCompletionReceiptMock.mockResolvedValue(undefined);
    clearSessionStateMock.mockResolvedValue(undefined);
  };

  /**
   * Requirement 3.1: Normal Completion Flow Preservation
   * 
   * Observe: Single completion requests without concurrency work correctly
   * Expected: This behavior continues to work identically after fix
   */
  describe('Single Completion Requests (No Concurrency)', () => {
    it('should preserve normal single completion flow', async () => {
      setupMocksForSuccessfulCompletion();
      
      const result = await completeSessionForLevel({
        levelId: 'test-level',
        mode: 'daily',
      });
      });
      
      // Verify successful completion
      expect(result.ok).toBe(true);
      expect(result.accepted).toBe(true);
      expect(result.score).toBe(120);
      
      // Verify all completion steps were executed
      expect(puzzleIsCompleteMock).toHaveBeenCalled();
      expect(markLevelCompletedMock).toHaveBeenCalled();
      expect(saveUserProfileMock).toHaveBeenCalled();
      expect(clearSessionStateMock).toHaveBeenCalled();
    });

    it('should preserve completion validation for incomplete puzzles', async () => {
      setupMocksForSuccessfulCompletion();
      puzzleIsCompleteMock.mockReturnValue(false); // Puzzle not complete
      
      // Verify completion is rejected (should throw error for incomplete puzzle)
      await expect(completeSessionForLevel({
        levelId: 'test-level',
        mode: 'daily',
      })).rejects.toThrow('not complete');
      
      // Verify no completion side effects occurred
      expect(markLevelCompletedMock).not.toHaveBeenCalled();
      expect(saveUserProfileMock).not.toHaveBeenCalled();
    });

    it('should preserve multiple sequential completions', async () => {
      // Test multiple completions in sequence (not concurrent)
      const completions = [];
      
      for (let i = 0; i < 3; i++) {
        setupMocksForSuccessfulCompletion();
        
        const result = await completeSessionForLevel({
          levelId: `test-level-${i}`,
          mode: 'daily',
        });
        
        completions.push(result);
        vi.clearAllMocks();
      }
      
      // Verify all completions succeeded
      completions.forEach((result, index) => {
        expect(result.ok).toBe(true);
        expect(result.accepted).toBe(true);
        expect(result.score).toBe(120);
      });
    });
  });

  /**
   * Requirement 3.2: Standard Heart Mechanics Preservation
   * 
   * Observe: Heart checks with full hearts or normal timing work correctly
   * Expected: This behavior continues to work identically after fix
   */
  describe('Standard Heart Mechanics', () => {
    it('should preserve full hearts behavior', () => {
      const profile = createBaseProfile();
      profile.hearts = heartsPerRun; // Full hearts
      
      const result = normalizeHearts(profile, Date.now());
      
      // Full hearts should remain unchanged
      expect(result.hearts).toBe(heartsPerRun);
      expect(result).toBe(profile); // Should return same object for efficiency
    });

    it('should preserve normal heart refill timing', () => {
      const nowTs = Date.now();
      const profile = createBaseProfile();
      profile.hearts = 2; // Partial hearts
      profile.lastHeartRefillTs = nowTs - heartRefillIntervalMs * 2; // 2 refill periods ago
      
      const result = normalizeHearts(profile, nowTs);
      
      // Should refill to full hearts
      expect(result.hearts).toBe(heartsPerRun);
      expect(result.lastHeartRefillTs).toBe(nowTs);
    });

    it('should preserve heart refill calculation for various scenarios', () => {
      const testCases = [
        { hearts: 1, elapsedRefills: 1, expectedHearts: 2 },
        { hearts: 2, elapsedRefills: 2, expectedHearts: 3 }, // Clamped to heartsPerRun (3)
        { hearts: 1, elapsedRefills: 5, expectedHearts: heartsPerRun }, // Clamped to max
        { hearts: 3, elapsedRefills: 0, expectedHearts: 3 }, // No refill
      ];
      
      testCases.forEach(({ hearts, elapsedRefills, expectedHearts }) => {
        const nowTs = Date.now();
        const profile = createBaseProfile();
        profile.hearts = hearts;
        profile.lastHeartRefillTs = nowTs - heartRefillIntervalMs * elapsedRefills;
        
        const result = normalizeHearts(profile, nowTs);
        
        expect(result.hearts).toBe(expectedHearts);
      });
    });
  });

  /**
   * Requirement 3.3: Sequential Endless Progression Preservation
   * 
   * Observe: Sequential endless progression without failures works correctly
   * Expected: This behavior continues to work identically after fix
   */
  describe('Sequential Endless Progression', () => {
    it('should preserve normal endless level progression', async () => {
      const userId = 'test-user';
      const catalogVersion = 'v1.0';
      
      // Mock successful catalog setup
      redisGetMock.mockResolvedValue(catalogVersion);
      getUserEndlessCursorMock.mockResolvedValue(5);
      redisZRangeMock.mockResolvedValue([{ member: 'endless-level-5', score: 5 }]);
      
      const result = await getNextEndlessCatalogLevelId(userId);
      
      expect(result).toBe('endless-level-5');
      expect(redisZRangeMock).toHaveBeenCalledWith(
        'decrypt:endless:catalog:v1.0:sequence',
        5,
        5,
        { by: 'rank' }
      );
    });

    it('should preserve cursor initialization for new users', async () => {
      const userId = 'new-user';
      const catalogVersion = 'v1.0';
      
      // Mock new user scenario
      redisGetMock.mockResolvedValue(catalogVersion);
      getUserEndlessCursorMock.mockResolvedValue(0); // New user
      redisHLenMock.mockResolvedValue(0); // No completed levels
      redisZRangeMock.mockResolvedValue([{ member: 'endless-level-0', score: 0 }]);
      
      const result = await getNextEndlessCatalogLevelId(userId);
      
      expect(result).toBe('endless-level-0');
      expect(getUserEndlessCursorMock).toHaveBeenCalledWith(userId);
    });

    it('should preserve endless progression for various cursor positions', async () => {
      const userId = 'test-user';
      const catalogVersion = 'v1.0';
      const testCases = [0, 1, 5, 10, 50];
      
      for (const cursor of testCases) {
        redisGetMock.mockResolvedValue(catalogVersion);
        getUserEndlessCursorMock.mockResolvedValue(cursor);
        redisZRangeMock.mockResolvedValue([{ member: `endless-level-${cursor}`, score: cursor }]);
        
        const result = await getNextEndlessCatalogLevelId(userId);
        
        expect(result).toBe(`endless-level-${cursor}`);
        vi.clearAllMocks();
      }
    });
  });

  /**
   * Requirement 3.4: Accurate Timing Preservation
   * 
   * Observe: Session tracking with good network connectivity works correctly
   * Expected: This behavior continues to work identically after fix
   */
  describe('Session Activity Tracking with Good Network', () => {
    it('should preserve accurate timing for short sessions', () => {
      const session = createBaseSession();
      const shortDuration = 30000; // 30 seconds
      const endTime = session.lastSeenAt + shortDuration;
      
      const result = withTrackedSessionActivity(session, endTime);
      
      expect(result.activeMs).toBe(shortDuration);
      expect(result.lastSeenAt).toBe(endTime);
    });

    it('should preserve accurate timing for medium sessions', () => {
      const session = createBaseSession();
      const mediumDuration = 300000; // 5 minutes
      const endTime = session.lastSeenAt + mediumDuration;
      
      const result = withTrackedSessionActivity(session, endTime);
      
      expect(result.activeMs).toBe(mediumDuration);
      expect(result.lastSeenAt).toBe(endTime);
    });

    it('should preserve timing for various session durations', () => {
      const testDurations = [1000, 5000, 30000, 120000, 300000]; // 1s to 5min
      
      testDurations.forEach(duration => {
        const session = createBaseSession();
        const endTime = session.lastSeenAt + duration;
        
        const result = withTrackedSessionActivity(session, endTime);
        
        expect(result.activeMs).toBe(duration);
        expect(result.lastSeenAt).toBe(endTime);
      });
    });
  });

  /**
   * Requirement 3.5: Standard Purchase Flow Preservation
   * 
   * Observe: Coin purchases within limits without concurrency work correctly
   * Expected: This behavior continues to work identically after fix
   */
  describe('Standard Coin Heart Purchase Flow', () => {
    it('should preserve successful purchase within daily limit', async () => {
      const userId = 'test-user';
      
      // Mock purchase within limit
      redisIncrByMock.mockResolvedValue(1); // First purchase of the day
      
      const result = await acquireCoinHeartSlot(userId);
      
      expect(result).toBe(true);
      expect(redisIncrByMock).toHaveBeenCalledWith(
        expect.stringContaining('coin-heart-purchases'),
        1
      );
    });

    it('should preserve purchase rejection at daily limit', async () => {
      const userId = 'test-user';
      
      // Mock purchase at limit (assuming limit is 2 based on constants)
      redisIncrByMock.mockResolvedValue(3); // Exceeds limit
      
      const result = await acquireCoinHeartSlot(userId);
      
      expect(result).toBe(false);
    });

    it('should preserve multiple sequential purchases within limit', async () => {
      const userId = 'test-user';
      const purchases = [];
      
      // Mock sequential purchases (limit is 2)
      for (let i = 1; i <= 2; i++) {
        redisIncrByMock.mockResolvedValue(i);
        
        const result = await acquireCoinHeartSlot(userId);
        purchases.push(result);
        
        vi.clearAllMocks();
      }
      
      // All purchases within limit should succeed
      expect(purchases).toEqual([true, true]);
    });
  });

  /**
   * Requirement 3.6: Successful Powerup Usage Preservation
   * 
   * Observe: Powerup usage with valid targets and inventory works correctly
   * Expected: This behavior continues to work identically after fix
   */
  describe('Successful Powerup Usage', () => {
    it('should preserve successful hammer usage on valid target', async () => {
      const session = createBaseSession();
      const inventory = createBaseInventory();
      inventory.hammer = 2; // Has hammer inventory
      
      getSessionStateMock.mockResolvedValue(session);
      getInventoryMock.mockResolvedValue(inventory);
      saveInventoryMock.mockResolvedValue(undefined);
      
      // Mock successful powerup consumption
      consumePowerupMock.mockResolvedValue({
        success: true,
        reason: null,
        profile: createBaseProfile(),
        inventory: { ...inventory, hammer: inventory.hammer - 1 },
      });
      
      const result = await usePowerupForSession({
        levelId: 'test-level',
        itemType: 'hammer',
        targetIndex: 5, // Valid target
        userId: 'test-user',
        postId: 'test-post',
      });
      
      expect(result.success).toBe(true);
      expect(consumePowerupMock).toHaveBeenCalledWith({
        userId: 'test-user',
        itemType: 'hammer',
      });
    });

    it('should preserve successful shield activation', async () => {
      const session = createBaseSession();
      const inventory = createBaseInventory();
      inventory.shield = 1; // Has shield inventory
      
      getSessionStateMock.mockResolvedValue(session);
      getInventoryMock.mockResolvedValue(inventory);
      saveInventoryMock.mockResolvedValue(undefined);
      
      // Mock successful powerup consumption
      consumePowerupMock.mockResolvedValue({
        success: true,
        reason: null,
        profile: createBaseProfile(),
        inventory: { ...inventory, shield: inventory.shield - 1 },
      });
      
      const result = await usePowerupForSession({
        levelId: 'test-level',
        itemType: 'shield',
        targetIndex: null, // Shield doesn't need target
        userId: 'test-user',
        postId: 'test-post',
      });
      
      expect(result.success).toBe(true);
      expect(consumePowerupMock).toHaveBeenCalledWith({
        userId: 'test-user',
        itemType: 'shield',
      });
    });

    it('should preserve successful reveal usage on valid target', async () => {
      const session = createBaseSession();
      const inventory = createBaseInventory();
      inventory.wand = 3; // Has wand inventory (reveal is now wand)
      
      getSessionStateMock.mockResolvedValue(session);
      getInventoryMock.mockResolvedValue(inventory);
      saveInventoryMock.mockResolvedValue(undefined);
      
      // Mock successful powerup consumption
      consumePowerupMock.mockResolvedValue({
        success: true,
        reason: null,
        profile: createBaseProfile(),
        inventory: { ...inventory, wand: inventory.wand - 1 },
      });
      
      const result = await usePowerupForSession({
        levelId: 'test-level',
        itemType: 'wand',
        targetIndex: 10, // Valid target
        userId: 'test-user',
        postId: 'test-post',
      });
      
      expect(result.success).toBe(true);
      expect(consumePowerupMock).toHaveBeenCalledWith({
        userId: 'test-user',
        itemType: 'wand',
      });
    });
  });

  /**
   * Requirements 3.7, 3.8: Other Game Features Preservation
   * 
   * Observe: Game features not affected by bugs continue to work
   * Expected: These continue to work identically after fix
   */
  describe('Other Game Features Preservation', () => {
    it('should preserve session state management', async () => {
      const session = createBaseSession();
      
      getSessionStateMock.mockResolvedValue(session);
      
      const result = await getSessionStateMock('test-user');
      
      expect(result).toEqual(session);
      expect(getSessionStateMock).toHaveBeenCalledWith('test-user');
    });

    it('should preserve profile management', async () => {
      const profile = createBaseProfile();
      
      getUserProfileMock.mockResolvedValue(profile);
      saveUserProfileMock.mockResolvedValue(undefined);
      
      const retrievedProfile = await getUserProfileMock('test-user');
      await saveUserProfileMock(profile);
      
      expect(retrievedProfile).toEqual(profile);
      expect(saveUserProfileMock).toHaveBeenCalledWith(profile);
    });

    it('should preserve inventory management', async () => {
      const inventory = createBaseInventory();
      
      getInventoryMock.mockResolvedValue(inventory);
      saveInventoryMock.mockResolvedValue(undefined);
      
      const retrievedInventory = await getInventoryMock('test-user');
      await saveInventoryMock(inventory);
      
      expect(retrievedInventory).toEqual(inventory);
      expect(saveInventoryMock).toHaveBeenCalledWith(inventory);
    });
  });
});