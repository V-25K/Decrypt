import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PaginatedLeaderboardService } from './paginated-leaderboard-service';
import { propertyTestConfig, gameArbitraries } from '../../shared/property-testing';
import { GameGenerators } from './property-test-utils';

// Mock the dependencies
vi.mock('@devvit/web/server', () => ({
  redis: {
    zCard: vi.fn(),
    zRange: vi.fn(),
  },
}));

vi.mock('./leaderboard', () => ({
  getDailyTop: vi.fn(),
  getLevelTop: vi.fn(),
	  getAllTimeTopLevels: vi.fn(),
	  getAllTimeTopLogic: vi.fn(),
	  getGlobalTop: vi.fn(),
	}));

vi.mock('./keys', () => ({
  keyDailyLeaderboard: vi.fn(),
	  keyAllTimeLevelsLeaderboard: 'decrypt:leaderboard:alltime:levels',
	  keyAllTimeLogicLeaderboard: 'decrypt:leaderboard:alltime:logic',
	  keyGlobalRatingLeaderboard: 'decrypt:leaderboard:global:rating',
	}));

vi.mock('./serde', () => ({
  formatDateKey: vi.fn(() => '2024-01-01'),
}));

import { redis } from '@devvit/web/server';
import { getDailyTop, getAllTimeTopLevels } from './leaderboard';
import { keyDailyLeaderboard } from './keys';

describe('PaginatedLeaderboardService', () => {
  let service: PaginatedLeaderboardService;

  beforeEach(() => {
    service = new PaginatedLeaderboardService();
    vi.clearAllMocks();
  });

  describe('getDailyLeaderboardPage', () => {
    it('should return paginated daily leaderboard with correct metadata', async () => {
      // Mock data
      const mockEntries = [
        { userId: 'user1', username: 'User1', score: 1000, snoovatarUrl: null, solveSeconds: 30, mistakes: 0, usedPowerups: 0 },
        { userId: 'user2', username: 'User2', score: 900, snoovatarUrl: null, solveSeconds: 45, mistakes: 1, usedPowerups: 1 },
      ];

      vi.mocked(redis.zCard).mockResolvedValue(100);
      vi.mocked(getDailyTop).mockResolvedValue(mockEntries);
      vi.mocked(keyDailyLeaderboard).mockReturnValue('daily:2024-01-01');

      const result = await service.getDailyLeaderboardPage({
        page: 1,
        pageSize: 2,
      });

      expect(result).toEqual({
        entries: mockEntries,
        hasNextPage: true,
        hasPreviousPage: false,
        totalCount: 100,
        pageInfo: {
          currentPage: 1,
          pageSize: 2,
          totalPages: 50,
        },
      });

      expect(redis.zCard).toHaveBeenCalledWith('daily:2024-01-01');
      expect(getDailyTop).toHaveBeenCalledWith('2024-01-01', 2);
    });

    it('should enforce maximum page size of 50', async () => {
      vi.mocked(redis.zCard).mockResolvedValue(100);
      vi.mocked(getDailyTop).mockResolvedValue([]);

      await service.getDailyLeaderboardPage({
        page: 1,
        pageSize: 100, // Request more than max
      });

      // Should be clamped to 50
      expect(getDailyTop).toHaveBeenCalledWith('2024-01-01', 50);
    });

    it('should handle last page correctly', async () => {
      const mockEntries = [
        { userId: 'user1', username: 'User1', score: 1000, snoovatarUrl: null, solveSeconds: 30, mistakes: 0, usedPowerups: 0 },
      ];

      vi.mocked(redis.zCard).mockResolvedValue(51);
      vi.mocked(getDailyTop).mockResolvedValue(mockEntries);

      const result = await service.getDailyLeaderboardPage({
        page: 2,
        pageSize: 50,
      });

      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
      expect(result.pageInfo.totalPages).toBe(2);
    });
  });

  describe('getAllTimeLevelsLeaderboardPage', () => {
    it('should return paginated all-time levels leaderboard', async () => {
      const mockEntries = [
        { userId: 'user1', username: 'User1', score: 5000, snoovatarUrl: null, levelsCompleted: 100 },
      ];

      vi.mocked(redis.zCard).mockResolvedValue(200);
      vi.mocked(getAllTimeTopLevels).mockResolvedValue(mockEntries);

      const result = await service.getAllTimeLevelsLeaderboardPage({
        page: 1,
        pageSize: 1,
      });

      expect(result).toEqual({
        entries: mockEntries,
        hasNextPage: true,
        hasPreviousPage: false,
        totalCount: 200,
        pageInfo: {
          currentPage: 1,
          pageSize: 1,
          totalPages: 200,
        },
      });

      expect(redis.zCard).toHaveBeenCalledWith('decrypt:leaderboard:alltime:levels');
      expect(getAllTimeTopLevels).toHaveBeenCalledWith(1);
    });
  });

  describe('buildLeaderboardPage', () => {
    it('should calculate pagination metadata correctly', () => {
      const entries = ['entry1', 'entry2'];
      const result = (service as any).buildLeaderboardPage(entries, 2, 10, 25);

      expect(result).toEqual({
        entries,
        hasNextPage: true,
        hasPreviousPage: true,
        totalCount: 25,
        pageInfo: {
          currentPage: 2,
          pageSize: 10,
          totalPages: 3,
        },
      });
    });

    it('should handle edge case with zero total count', () => {
      const result = (service as any).buildLeaderboardPage([], 1, 10, 0);

      expect(result).toEqual({
        entries: [],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 0,
        pageInfo: {
          currentPage: 1,
          pageSize: 10,
          totalPages: 0,
        },
      });
    });
  });
});
