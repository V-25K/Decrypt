import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leaderboardRouter } from './leaderboard';

// Mock the dependencies
vi.mock('../../core/leaderboard', () => ({
  getDailyTop: vi.fn(),
  getLevelTop: vi.fn(),
  getAllTimeTopLevels: vi.fn(),
  getAllTimeTopLogic: vi.fn(),
  getUserRankSummary: vi.fn(),
}));

vi.mock('../../core/paginated-leaderboard-service', () => ({
  paginatedLeaderboardService: {
    getDailyLeaderboardPage: vi.fn(),
    getLevelLeaderboardPage: vi.fn(),
    getAllTimeLevelsLeaderboardPage: vi.fn(),
    getAllTimeLogicLeaderboardPage: vi.fn(),
  },
}));

vi.mock('../../core/state', () => ({
  getUserProfile: vi.fn(),
}));

vi.mock('../../core/serde', () => ({
  formatDateKey: vi.fn(() => '2024-01-01'),
}));

import { paginatedLeaderboardService } from '../../core/paginated-leaderboard-service';

describe('Leaderboard Router - Pagination Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDailyPage', () => {
    it('should call paginatedLeaderboardService.getDailyLeaderboardPage with correct parameters', async () => {
      const mockResult = {
        entries: [],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 0,
        pageInfo: {
          currentPage: 1,
          pageSize: 50,
          totalPages: 0,
        },
      };

      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue(mockResult);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.getDailyPage({
        page: 1,
        pageSize: 25,
        dateKey: '2024-01-01',
      });

      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 25,
        dateKey: '2024-01-01',
      });

      expect(result).toEqual(mockResult);
    });

    it('should use default page when not provided', async () => {
      const mockResult = {
        entries: [],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 0,
        pageInfo: {
          currentPage: 1,
          pageSize: 50,
          totalPages: 0,
        },
      };

      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue(mockResult);

      const caller = leaderboardRouter.createCaller({});
      await caller.getDailyPage({});

      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenCalledWith({
        page: 1, // Default value from schema
      });
    });
  });

  describe('getLevelPage', () => {
    it('should call paginatedLeaderboardService.getLevelLeaderboardPage with correct parameters', async () => {
      const mockResult = {
        entries: [],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 0,
        pageInfo: {
          currentPage: 1,
          pageSize: 50,
          totalPages: 0,
        },
      };

      vi.mocked(paginatedLeaderboardService.getLevelLeaderboardPage).mockResolvedValue(mockResult);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.getLevelPage({
        page: 2,
        pageSize: 30,
        levelId: 'level123',
      });

      expect(paginatedLeaderboardService.getLevelLeaderboardPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 30,
        levelId: 'level123',
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('getAllTimeLevelsPage', () => {
    it('should call paginatedLeaderboardService.getAllTimeLevelsLeaderboardPage with correct parameters', async () => {
      const mockResult = {
        entries: [],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 0,
        pageInfo: {
          currentPage: 1,
          pageSize: 50,
          totalPages: 0,
        },
      };

      vi.mocked(paginatedLeaderboardService.getAllTimeLevelsLeaderboardPage).mockResolvedValue(mockResult);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.getAllTimeLevelsPage({
        page: 3,
        pageSize: 20,
      });

      expect(paginatedLeaderboardService.getAllTimeLevelsLeaderboardPage).toHaveBeenCalledWith({
        page: 3,
        pageSize: 20,
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe('getAllTimeLogicPage', () => {
    it('should call paginatedLeaderboardService.getAllTimeLogicLeaderboardPage with correct parameters', async () => {
      const mockResult = {
        entries: [],
        hasNextPage: false,
        hasPreviousPage: false,
        totalCount: 0,
        pageInfo: {
          currentPage: 1,
          pageSize: 50,
          totalPages: 0,
        },
      };

      vi.mocked(paginatedLeaderboardService.getAllTimeLogicLeaderboardPage).mockResolvedValue(mockResult);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.getAllTimeLogicPage({
        page: 1,
        pageSize: 10,
      });

      expect(paginatedLeaderboardService.getAllTimeLogicLeaderboardPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 10,
      });

      expect(result).toEqual(mockResult);
    });
  });
});