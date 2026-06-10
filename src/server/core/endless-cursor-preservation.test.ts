import { describe, it, expect, vi, afterEach } from 'vitest';

const {
  hKeysMock,
  hSetMock,
  hGetMock,
  hLenMock,
  getMock,
  incrMock,
  setMock,
  zRangeMock,
} = vi.hoisted(() => ({
  hKeysMock: vi.fn(),
  hSetMock: vi.fn(),
  hGetMock: vi.fn(),
  hLenMock: vi.fn(),
  getMock: vi.fn(),
  incrMock: vi.fn(),
  setMock: vi.fn(),
  zRangeMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    hKeys: hKeysMock,
    hSet: hSetMock,
    hGet: hGetMock,
    hLen: hLenMock,
    get: getMock,
    incr: incrMock,
    set: setMock,
    zRange: zRangeMock,
  },
}));

import { getCompletedLevels, markLevelCompleted } from './state';

/**
 * Preservation Property Tests
 * 
 * Property 2: Daily Mode and Statistics Unchanged
 * 
 * IMPORTANT: Follow observation-first methodology
 * These tests capture baseline behavior on UNFIXED code
 * They must continue to PASS after the fix is implemented
 * 
 * GOAL: Ensure non-endless-mode operations remain unchanged
 */

describe('Endless Mode Cursor Preservation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Requirement 3.2: Completion Verification Preservation
   * 
   * Observe: getCompletedLevels() returns Set of completed level IDs
   * Expected: This behavior continues to work identically after fix
   */
  it('should preserve getCompletedLevels() behavior for completion verification', async () => {
    const userId = 'test_user';
    const completedLevels = ['daily_001', 'daily_002', 'endless_001'];
    
    hKeysMock.mockResolvedValueOnce(completedLevels);
    
    const result = await getCompletedLevels(userId);
    
    // Verify it returns a Set with all completed levels
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(3);
    expect(result.has('daily_001')).toBe(true);
    expect(result.has('daily_002')).toBe(true);
    expect(result.has('endless_001')).toBe(true);
    
    // Verify it calls hKeys with correct key
    expect(hKeysMock).toHaveBeenCalledWith(`decrypt:user:${userId}:completed`);
  });

  /**
   * Requirement 3.5: Completion Hash Update Preservation
   * 
   * Observe: markLevelCompleted() updates the completion hash
   * Expected: This behavior continues to work identically after fix
   */
  it('should preserve markLevelCompleted() behavior for backward compatibility', async () => {
    const userId = 'test_user';
    const levelId = 'endless_001';
    
    hSetMock.mockResolvedValueOnce(1);
    
    await markLevelCompleted(userId, levelId);
    
    // Verify it calls hSet with correct key and level ID
    expect(hSetMock).toHaveBeenCalledWith(
      `decrypt:user:${userId}:completed`,
      expect.objectContaining({
        [levelId]: expect.any(String),
      })
    );
  });

  /**
   * Requirement 3.7: Existing Progress Recognition
   * 
   * Observe: Users with existing completed levels have their progress recognized
   * Expected: After fix, cursor initialization correctly counts existing progress
   * 
   * Note: This test will be updated after implementation to verify cursor initialization
   */
  it('should recognize existing user progress (placeholder for post-fix verification)', async () => {
    const userId = 'test_user_with_progress';
    const existingLevels = ['endless_001', 'endless_002', 'endless_003'];
    
    hKeysMock.mockResolvedValueOnce(existingLevels);
    
    const completed = await getCompletedLevels(userId);
    
    // Verify existing progress is recognized
    expect(completed.size).toBe(3);
    expect(completed.has('endless_001')).toBe(true);
    expect(completed.has('endless_002')).toBe(true);
    expect(completed.has('endless_003')).toBe(true);
    
    // After fix: cursor should be initialized to 3 (next unplayed level)
    // This will be verified in the implementation tasks
  });

  /**
   * Requirement 3.1: Daily Mode Preservation
   * 
   * Observe: Daily mode continues to use getCompletedLevels() for completion tracking
   * Expected: Daily mode logic remains completely unchanged after fix
   * 
   * Note: This is verified by the fact that getCompletedLevels() continues to work
   * and is still called for daily mode operations
   */
  it('should preserve getCompletedLevels() availability for daily mode', async () => {
    const userId = 'daily_user';
    const dailyLevels = ['daily_001', 'daily_002'];
    
    hKeysMock.mockResolvedValueOnce(dailyLevels);
    
    const completed = await getCompletedLevels(userId);
    
    // Verify daily mode can still check completion status
    expect(completed.has('daily_001')).toBe(true);
    expect(completed.has('daily_002')).toBe(true);
    
    // This function must remain available for daily mode after fix
    expect(hKeysMock).toHaveBeenCalled();
  });

  /**
   * Requirement 3.3, 3.4, 3.6: Statistics, Achievements, Leaderboards Preservation
   * 
   * Observe: These systems rely on completion hash being updated
   * Expected: Completion hash continues to be updated, so these systems work identically
   * 
   * Note: Since markLevelCompleted() continues to update the hash (verified above),
   * all systems that read from the completion hash will continue to work correctly
   */
  it('should preserve completion hash for statistics and achievements', async () => {
    const userId = 'stats_user';
    const levelId = 'endless_100';
    
    hSetMock.mockResolvedValueOnce(1);
    
    // Mark level completed (this updates the hash)
    await markLevelCompleted(userId, levelId);
    
    // Verify hash is updated (statistics/achievements can read from it)
    expect(hSetMock).toHaveBeenCalledWith(
      `decrypt:user:${userId}:completed`,
      expect.any(Object)
    );
    
    // Now verify we can read it back
    hKeysMock.mockResolvedValueOnce([levelId]);
    const completed = await getCompletedLevels(userId);
    
    // Statistics, achievements, and leaderboards can query completion status
    expect(completed.has(levelId)).toBe(true);
  });
});
