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

// Import the functions we're testing
import { normalizeHearts } from './hearts';
import { getNextEndlessCatalogLevelId } from './endless-catalog';
import { withTrackedSessionActivity } from './game-service';
import type { SessionState, UserProfile } from '../../shared/game';
import { heartsPerRun, heartRefillIntervalMs, maxCoinHeartPurchasesPerDay } from './constants';

// Mock the state functions
const {
  getUserEndlessCursorMock,
  initializeUserEndlessCursorMock,
  getCompletedLevelsMock,
} = vi.hoisted(() => ({
  getUserEndlessCursorMock: vi.fn(),
  initializeUserEndlessCursorMock: vi.fn(),
  getCompletedLevelsMock: vi.fn(),
}));

vi.mock('./state', () => ({
  getUserEndlessCursor: getUserEndlessCursorMock,
  initializeUserEndlessCursor: initializeUserEndlessCursorMock,
  getCompletedLevels: getCompletedLevelsMock,
}));

// Mock the economy functions
const {
  acquireCoinHeartSlotMock,
} = vi.hoisted(() => ({
  acquireCoinHeartSlotMock: vi.fn(),
}));

vi.mock('./economy', () => ({
  acquireCoinHeartSlot: acquireCoinHeartSlotMock,
}));

/**
 * Comprehensive Preservation Property Tests for Normal Game Operations
 * 
 * **Property 2: Preservation** - Normal Game Operations Preservation
 * **IMPORTANT**: Follow observation-first methodology
 * 
 * These tests capture baseline behavior on UNFIXED code for normal operations:
 * - Heart checks with full hearts or normal timing
 * - Sequential endless progression without failures
 * - Session tracking with good network connectivity
 * - Coin purchases within limits without concurrency
 * 
 * **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
 * 
 * **Validates: Requirements 3.2, 3.3, 3.4, 3.5**
 */

describe('Comprehensive Normal Game Operations Preservation', () => {
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

  /**
   * Requirement 3.2: Standard Heart Mechanics Preservation
   */
  describe('Standard Heart Mechanics', () => {
    it('should preserve full hearts behavior', () => {
      const profile = createBaseProfile();
      profile.hearts = heartsPerRun;
      
      const result = normalizeHearts(profile, Date.now());
      
      expect(result.hearts).toBe(heartsPerRun);
      expect(result).toBe(profile);
    });

    it('should preserve normal heart refill timing', () => {
      const nowTs = Date.now();
      const profile = createBaseProfile();
      profile.hearts = 1;
      profile.lastHeartRefillTs = nowTs - heartRefillIntervalMs * 2;
      
      const result = normalizeHearts(profile, nowTs);
      
      expect(result.hearts).toBe(heartsPerRun);
      expect(result.lastHeartRefillTs).toBe(nowTs);
    });

    it('should preserve heart refill calculation patterns', () => {
      const testCases = [
        { hearts: 0, elapsedRefills: 1, expectedHearts: 1 },
        { hearts: 1, elapsedRefills: 1, expectedHearts: 2 },
        { hearts: 2, elapsedRefills: 1, expectedHearts: 3 },
        { hearts: 1, elapsedRefills: 3, expectedHearts: 3 }, // Clamped
        { hearts: 3, elapsedRefills: 0, expectedHearts: 3 }, // No change
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
   */
  describe('Sequential Endless Progression', () => {
    it('should preserve normal endless level progression', async () => {
      const userId = 'test-user';
      const catalogVersion = 'v1.0';
      
      redisGetMock.mockResolvedValue(catalogVersion);
      getUserEndlessCursorMock.mockResolvedValue(5);
      getCompletedLevelsMock.mockResolvedValue(new Set(['level1', 'level2']));
      redisZRangeMock.mockResolvedValue([{ member: 'endless-level-5', score: 5 }]);
      
      const result = await getNextEndlessCatalogLevelId(userId);
      
      expect(result).toBe('endless-level-5');
    });

    it('should preserve cursor initialization for new users', async () => {
      const userId = 'new-user';
      const catalogVersion = 'v1.0';
      
      redisGetMock.mockResolvedValue(catalogVersion);
      getUserEndlessCursorMock.mockResolvedValue(0);
      getCompletedLevelsMock.mockResolvedValue(new Set());
      redisHLenMock.mockResolvedValue(0);
      redisZRangeMock.mockResolvedValue([{ member: 'endless-level-0', score: 0 }]);
      
      const result = await getNextEndlessCatalogLevelId(userId);
      
      expect(result).toBe('endless-level-0');
    });

    it('should preserve progression across different cursor positions', async () => {
      const userId = 'test-user';
      const catalogVersion = 'v1.0';
      const positions = [0, 1, 5, 10, 25, 50];
      
      for (const position of positions) {
        redisGetMock.mockResolvedValue(catalogVersion);
        getUserEndlessCursorMock.mockResolvedValue(position);
        getCompletedLevelsMock.mockResolvedValue(new Set([`level${position}`]));
        redisZRangeMock.mockResolvedValue([{ member: `endless-level-${position}`, score: position }]);
        
        const result = await getNextEndlessCatalogLevelId(userId);
        
        expect(result).toBe(`endless-level-${position}`);
        vi.clearAllMocks();
      }
    });
  });

  /**
   * Requirement 3.4: Accurate Timing Preservation
   */
  describe('Session Activity Tracking with Good Network', () => {
    it('should preserve accurate timing for various durations', () => {
      const durations = [1000, 5000, 30000, 60000, 120000, 300000]; // 1s to 5min
      
      durations.forEach(duration => {
        const session = createBaseSession();
        const endTime = session.lastSeenAt + duration;
        
        const result = withTrackedSessionActivity(session, endTime);
        
        expect(result.activeMs).toBe(duration);
        expect(result.lastSeenAt).toBe(endTime);
      });
    });

    it('should preserve cumulative time tracking', () => {
      const session = createBaseSession();
      session.activeMs = 60000; // 1 minute existing
      const additionalTime = 30000; // 30 seconds more
      const endTime = session.lastSeenAt + additionalTime;
      
      const result = withTrackedSessionActivity(session, endTime);
      
      expect(result.activeMs).toBe(90000); // 1.5 minutes total
    });

    it('should preserve zero-time sessions', () => {
      const session = createBaseSession();
      const endTime = session.lastSeenAt; // No time passed
      
      const result = withTrackedSessionActivity(session, endTime);
      
      expect(result.activeMs).toBe(0);
      expect(result.lastSeenAt).toBe(endTime);
    });
  });

  /**
   * Requirement 3.5: Standard Purchase Flow Preservation
   */
  describe('Standard Coin Heart Purchase Flow', () => {
    it('should preserve successful purchase within daily limit', async () => {
      const userId = 'test-user';
      
      redisIncrByMock.mockResolvedValue(1); // First purchase
      redisExpireMock.mockResolvedValue(1);
      
      const result = await acquireCoinHeartSlot(userId);
      
      expect(result).toBe(true);
      expect(redisIncrByMock).toHaveBeenCalledWith(
        expect.stringContaining('coin-heart-purchases'),
        1
      );
    });

    it('should preserve purchase rejection at daily limit', async () => {
      const userId = 'test-user';
      
      // Mock exceeding limit (maxCoinHeartPurchasesPerDay = 2)
      redisIncrByMock
        .mockResolvedValueOnce(3) // Exceeds limit
        .mockResolvedValueOnce(2); // Rollback
      redisExpireMock.mockResolvedValue(1);
      
      const result = await acquireCoinHeartSlot(userId);
      
      expect(result).toBe(false);
      expect(redisIncrByMock).toHaveBeenCalledWith(
        expect.stringContaining('coin-heart-purchases'),
        -1
      );
    });

    it('should preserve multiple sequential purchases within limit', async () => {
      const userId = 'test-user';
      const purchases = [];
      
      // Test purchases up to the limit
      for (let i = 1; i <= maxCoinHeartPurchasesPerDay; i++) {
        redisIncrByMock.mockResolvedValue(i);
        redisExpireMock.mockResolvedValue(1);
        
        const result = await acquireCoinHeartSlot(userId);
        purchases.push(result);
        
        vi.clearAllMocks();
      }
      
      // All purchases within limit should succeed
      expect(purchases.every(p => p === true)).toBe(true);
      expect(purchases.length).toBe(maxCoinHeartPurchasesPerDay);
    });

    it('should preserve purchase behavior at exact limit', async () => {
      const userId = 'test-user';
      
      // Mock exactly at limit
      redisIncrByMock.mockResolvedValue(maxCoinHeartPurchasesPerDay);
      redisExpireMock.mockResolvedValue(1);
      
      const result = await acquireCoinHeartSlot(userId);
      
      expect(result).toBe(true); // Should succeed at exact limit
    });

    it('should preserve purchase behavior just over limit', async () => {
      const userId = 'test-user';
      
      // Mock just over limit
      redisIncrByMock
        .mockResolvedValueOnce(maxCoinHeartPurchasesPerDay + 1) // Over limit
        .mockResolvedValueOnce(maxCoinHeartPurchasesPerDay); // Rollback
      redisExpireMock.mockResolvedValue(1);
      
      const result = await acquireCoinHeartSlot(userId);
      
      expect(result).toBe(false); // Should fail over limit
    });
  });

  /**
   * General System Preservation
   */
  describe('System Constants and Structure Preservation', () => {
    it('should preserve heart system constants', () => {
      expect(heartsPerRun).toBe(3);
      expect(heartRefillIntervalMs).toBe(30 * 60 * 1000);
      expect(maxCoinHeartPurchasesPerDay).toBe(2);
    });

    it('should preserve session state structure', () => {
      const session = createBaseSession();
      
      const expectedProperties = [
        'activeLevelId', 'mode', 'startTimestamp', 'activeMs', 'lastSeenAt',
        'mistakesMade', 'shieldIsActive', 'revealedIndices', 'usedPowerups',
        'wrongGuesses', 'guessCount'
      ];
      
      expectedProperties.forEach(prop => {
        expect(session).toHaveProperty(prop);
      });
    });

    it('should preserve profile structure', () => {
      const profile = createBaseProfile();
      
      const expectedProperties = [
        'userId', 'hearts', 'lastHeartRefillTs', 'infiniteHeartsExpiryTs',
        'coins', 'currentStreak', 'longestStreak', 'totalCompletions',
        'totalMistakes', 'averageCompletionTimeMs', 'fastestCompletionTimeMs',
        'totalActiveTimeMs', 'createdAt', 'lastActiveAt'
      ];
      
      expectedProperties.forEach(prop => {
        expect(profile).toHaveProperty(prop);
      });
    });
  });

  /**
   * Property-Based Test Patterns
   * 
   * These tests use multiple test cases to verify behavior across ranges
   */
  describe('Property-Based Preservation Patterns', () => {
    it('should preserve heart refill behavior across time ranges', () => {
      const timeRanges = [
        { minutes: 0, expectedRefills: 0 },
        { minutes: 15, expectedRefills: 0 }, // Less than 30 min interval
        { minutes: 30, expectedRefills: 1 },
        { minutes: 45, expectedRefills: 1 },
        { minutes: 60, expectedRefills: 2 },
        { minutes: 90, expectedRefills: 3 },
        { minutes: 120, expectedRefills: 4 },
      ];
      
      timeRanges.forEach(({ minutes, expectedRefills }) => {
        const nowTs = Date.now();
        const profile = createBaseProfile();
        profile.hearts = 0; // Start with no hearts
        profile.lastHeartRefillTs = nowTs - (minutes * 60 * 1000);
        
        const result = normalizeHearts(profile, nowTs);
        const actualRefills = result.hearts - profile.hearts;
        const clampedRefills = Math.min(expectedRefills, heartsPerRun);
        
        expect(result.hearts).toBe(clampedRefills);
      });
    });

    it('should preserve session timing behavior across duration ranges', () => {
      const sessionDurations = [
        0, 1000, 5000, 10000, 30000, 60000, 120000, 300000, 600000
      ]; // 0s to 10min
      
      sessionDurations.forEach(duration => {
        const session = createBaseSession();
        const initialActiveMs = Math.floor(Math.random() * 60000); // Random initial time
        session.activeMs = initialActiveMs;
        const endTime = session.lastSeenAt + duration;
        
        const result = withTrackedSessionActivity(session, endTime);
        
        expect(result.activeMs).toBe(initialActiveMs + duration);
        expect(result.lastSeenAt).toBe(endTime);
      });
    });

    it('should preserve endless progression behavior across cursor ranges', async () => {
      const cursorPositions = [0, 1, 2, 5, 10, 25, 50, 100];
      const catalogVersion = 'test-catalog';
      
      for (const cursor of cursorPositions) {
        redisGetMock.mockResolvedValue(catalogVersion);
        getUserEndlessCursorMock.mockResolvedValue(cursor);
        redisZRangeMock.mockResolvedValue([{ 
          member: `level-${cursor}`, 
          score: cursor 
        }]);
        
        const result = await getNextEndlessCatalogLevelId('test-user');
        
        expect(result).toBe(`level-${cursor}`);
        expect(redisZRangeMock).toHaveBeenCalledWith(
          expect.stringContaining(catalogVersion),
          cursor,
          cursor,
          { by: 'rank' }
        );
        
        vi.clearAllMocks();
      }
    });
  });
});