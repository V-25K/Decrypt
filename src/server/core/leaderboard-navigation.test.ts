import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  DailyLeaderboardNavigation,
  LevelLeaderboardNavigation,
  AllTimeLevelsLeaderboardNavigation,
  AllTimeLogicLeaderboardNavigation,
  createLeaderboardNavigation
} from './leaderboard-navigation';
import type { LeaderboardPage } from './paginated-leaderboard-service';

// Mock the paginated leaderboard service
vi.mock('./paginated-leaderboard-service', () => ({
  paginatedLeaderboardService: {
    getDailyLeaderboardPage: vi.fn(),
    getLevelLeaderboardPage: vi.fn(),
    getAllTimeLevelsLeaderboardPage: vi.fn(),
    getAllTimeLogicLeaderboardPage: vi.fn(),
  },
}));

import { paginatedLeaderboardService } from './paginated-leaderboard-service';

describe('LeaderboardNavigation', () => {
  const mockLeaderboardPage: LeaderboardPage = {
    entries: [
      { userId: 'user1', score: 100, username: 'player1' },
      { userId: 'user2', score: 90, username: 'player2' },
    ],
    hasNextPage: true,
    hasPreviousPage: false,
    totalCount: 150,
    pageInfo: {
      currentPage: 1,
      pageSize: 50,
      totalPages: 3,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DailyLeaderboardNavigation', () => {
    it('should navigate to a specific page', async () => {
      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue(mockLeaderboardPage);

      const navigation = new DailyLeaderboardNavigation({ page: 1, dateKey: '2024-01-01' });
      const result = await navigation.goToPage(2);

      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
        dateKey: '2024-01-01',
      });
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate to next page when available', async () => {
      const nextPageMock = { ...mockLeaderboardPage, pageInfo: { ...mockLeaderboardPage.pageInfo, currentPage: 2 } };
      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue(nextPageMock);

      const navigation = new DailyLeaderboardNavigation({ page: 1, dateKey: '2024-01-01' });
      const result = await navigation.nextPage();

      expect(result).toEqual(nextPageMock);
      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
        dateKey: '2024-01-01',
      });
    });

    it('should return null when trying to navigate to next page from last page', async () => {
      const lastPageMock = { 
        ...mockLeaderboardPage, 
        hasNextPage: false,
        pageInfo: { ...mockLeaderboardPage.pageInfo, currentPage: 3 } 
      };
      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue(lastPageMock);

      const navigation = new DailyLeaderboardNavigation({ page: 3, dateKey: '2024-01-01' });
      // First call to establish current state
      await navigation.goToPage(3);
      
      const result = await navigation.nextPage();
      expect(result).toBeNull();
    });

    it('should navigate to previous page when available', async () => {
      const prevPageMock = { 
        ...mockLeaderboardPage, 
        hasPreviousPage: true,
        pageInfo: { ...mockLeaderboardPage.pageInfo, currentPage: 1 } 
      };
      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue(prevPageMock);

      const navigation = new DailyLeaderboardNavigation({ page: 2, dateKey: '2024-01-01' });
      const result = await navigation.previousPage();

      expect(result).toEqual(prevPageMock);
      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50,
        dateKey: '2024-01-01',
      });
    });

    it('should return null when trying to navigate to previous page from first page', async () => {
      const navigation = new DailyLeaderboardNavigation({ page: 1, dateKey: '2024-01-01' });
      const result = await navigation.previousPage();
      expect(result).toBeNull();
    });

    it('should navigate to first page', async () => {
      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage).mockResolvedValue(mockLeaderboardPage);

      const navigation = new DailyLeaderboardNavigation({ page: 3, dateKey: '2024-01-01' });
      const result = await navigation.goToFirstPage();

      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenCalledWith({
        page: 1,
        pageSize: 50,
        dateKey: '2024-01-01',
      });
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate to last page', async () => {
      const lastPageMock = { 
        ...mockLeaderboardPage, 
        pageInfo: { ...mockLeaderboardPage.pageInfo, currentPage: 3 } 
      };
      vi.mocked(paginatedLeaderboardService.getDailyLeaderboardPage)
        .mockResolvedValueOnce(mockLeaderboardPage) // First call to get total pages
        .mockResolvedValueOnce(lastPageMock); // Second call to get last page

      const navigation = new DailyLeaderboardNavigation({ page: 1, dateKey: '2024-01-01' });
      const result = await navigation.goToLastPage();

      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenCalledTimes(2);
      expect(paginatedLeaderboardService.getDailyLeaderboardPage).toHaveBeenLastCalledWith({
        page: 3,
        pageSize: 50,
        dateKey: '2024-01-01',
      });
      expect(result).toEqual(lastPageMock);
    });

    it('should throw error for invalid page number', async () => {
      const navigation = new DailyLeaderboardNavigation({ page: 1, dateKey: '2024-01-01' });
      
      await expect(navigation.goToPage(0)).rejects.toThrow('Page number must be greater than 0');
      await expect(navigation.goToPage(-1)).rejects.toThrow('Page number must be greater than 0');
    });
  });

  describe('LevelLeaderboardNavigation', () => {
    it('should navigate to a specific page', async () => {
      vi.mocked(paginatedLeaderboardService.getLevelLeaderboardPage).mockResolvedValue(mockLeaderboardPage);

      const navigation = new LevelLeaderboardNavigation({ page: 1, levelId: 'level123' });
      const result = await navigation.goToPage(2);

      expect(paginatedLeaderboardService.getLevelLeaderboardPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
        levelId: 'level123',
      });
      expect(result).toEqual(mockLeaderboardPage);
    });
  });

  describe('AllTimeLevelsLeaderboardNavigation', () => {
    it('should navigate to a specific page', async () => {
      vi.mocked(paginatedLeaderboardService.getAllTimeLevelsLeaderboardPage).mockResolvedValue(mockLeaderboardPage);

      const navigation = new AllTimeLevelsLeaderboardNavigation({ page: 1 });
      const result = await navigation.goToPage(2);

      expect(paginatedLeaderboardService.getAllTimeLevelsLeaderboardPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
      });
      expect(result).toEqual(mockLeaderboardPage);
    });
  });

  describe('AllTimeLogicLeaderboardNavigation', () => {
    it('should navigate to a specific page', async () => {
      vi.mocked(paginatedLeaderboardService.getAllTimeLogicLeaderboardPage).mockResolvedValue(mockLeaderboardPage);

      const navigation = new AllTimeLogicLeaderboardNavigation({ page: 1 });
      const result = await navigation.goToPage(2);

      expect(paginatedLeaderboardService.getAllTimeLogicLeaderboardPage).toHaveBeenCalledWith({
        page: 2,
        pageSize: 50,
      });
      expect(result).toEqual(mockLeaderboardPage);
    });
  });

  describe('createLeaderboardNavigation factory', () => {
    it('should create DailyLeaderboardNavigation for daily type', () => {
      const navigation = createLeaderboardNavigation('daily', { page: 1, dateKey: '2024-01-01' });
      expect(navigation).toBeInstanceOf(DailyLeaderboardNavigation);
    });

    it('should create LevelLeaderboardNavigation for level type', () => {
      const navigation = createLeaderboardNavigation('level', { page: 1, levelId: 'level123' });
      expect(navigation).toBeInstanceOf(LevelLeaderboardNavigation);
    });

    it('should create AllTimeLevelsLeaderboardNavigation for allTimeLevels type', () => {
      const navigation = createLeaderboardNavigation('allTimeLevels', { page: 1 });
      expect(navigation).toBeInstanceOf(AllTimeLevelsLeaderboardNavigation);
    });

    it('should create AllTimeLogicLeaderboardNavigation for allTimeLogic type', () => {
      const navigation = createLeaderboardNavigation('allTimeLogic', { page: 1 });
      expect(navigation).toBeInstanceOf(AllTimeLogicLeaderboardNavigation);
    });

    it('should throw error for unknown type', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid type
        createLeaderboardNavigation('unknown', { page: 1 });
      }).toThrow('Unknown leaderboard type: unknown');
    });
  });
});