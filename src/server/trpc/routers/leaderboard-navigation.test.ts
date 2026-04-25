import { describe, it, expect, vi, beforeEach } from 'vitest';
import { leaderboardRouter } from './leaderboard';
import type { LeaderboardPage } from '../../core/paginated-leaderboard-service';

// Mock the leaderboard navigation
vi.mock('../../core/leaderboard-navigation', () => ({
  createLeaderboardNavigation: vi.fn(),
}));

import { createLeaderboardNavigation } from '../../core/leaderboard-navigation';

describe('Leaderboard Router - Navigation Endpoints', () => {
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

  const mockNavigation = {
    goToPage: vi.fn(),
    nextPage: vi.fn(),
    previousPage: vi.fn(),
    goToFirstPage: vi.fn(),
    goToLastPage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createLeaderboardNavigation).mockReturnValue(mockNavigation);
  });

  describe('Daily Navigation', () => {
    it('should navigate daily leaderboard to specific page', async () => {
      mockNavigation.goToPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateDailyToPage({
        page: 1,
        dateKey: '2024-01-01',
        targetPage: 2,
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('daily', {
        page: 1,
        dateKey: '2024-01-01',
        targetPage: 2,
      });
      expect(mockNavigation.goToPage).toHaveBeenCalledWith(2);
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate daily leaderboard to next page', async () => {
      mockNavigation.nextPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateDailyNext({
        page: 1,
        dateKey: '2024-01-01',
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('daily', {
        page: 1,
        dateKey: '2024-01-01',
      });
      expect(mockNavigation.nextPage).toHaveBeenCalled();
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should return null when no next page available', async () => {
      mockNavigation.nextPage.mockResolvedValue(null);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateDailyNext({
        page: 3,
        dateKey: '2024-01-01',
      });

      expect(result).toBeNull();
    });

    it('should navigate daily leaderboard to previous page', async () => {
      mockNavigation.previousPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateDailyPrevious({
        page: 2,
        dateKey: '2024-01-01',
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('daily', {
        page: 2,
        dateKey: '2024-01-01',
      });
      expect(mockNavigation.previousPage).toHaveBeenCalled();
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate daily leaderboard to first page', async () => {
      mockNavigation.goToFirstPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateDailyFirst({
        page: 3,
        dateKey: '2024-01-01',
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('daily', {
        page: 3,
        dateKey: '2024-01-01',
      });
      expect(mockNavigation.goToFirstPage).toHaveBeenCalled();
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate daily leaderboard to last page', async () => {
      mockNavigation.goToLastPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateDailyLast({
        page: 1,
        dateKey: '2024-01-01',
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('daily', {
        page: 1,
        dateKey: '2024-01-01',
      });
      expect(mockNavigation.goToLastPage).toHaveBeenCalled();
      expect(result).toEqual(mockLeaderboardPage);
    });
  });

  describe('Level Navigation', () => {
    it('should navigate level leaderboard to specific page', async () => {
      mockNavigation.goToPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateLevelToPage({
        page: 1,
        levelId: 'level123',
        targetPage: 2,
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('level', {
        page: 1,
        levelId: 'level123',
        targetPage: 2,
      });
      expect(mockNavigation.goToPage).toHaveBeenCalledWith(2);
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate level leaderboard to next page', async () => {
      mockNavigation.nextPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateLevelNext({
        page: 1,
        levelId: 'level123',
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('level', {
        page: 1,
        levelId: 'level123',
      });
      expect(mockNavigation.nextPage).toHaveBeenCalled();
      expect(result).toEqual(mockLeaderboardPage);
    });
  });

  describe('All Time Levels Navigation', () => {
    it('should navigate all-time levels leaderboard to specific page', async () => {
      mockNavigation.goToPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateAllTimeLevelsToPage({
        page: 1,
        targetPage: 2,
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('allTimeLevels', {
        page: 1,
        targetPage: 2,
      });
      expect(mockNavigation.goToPage).toHaveBeenCalledWith(2);
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate all-time levels leaderboard to next page', async () => {
      mockNavigation.nextPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateAllTimeLevelsNext({
        page: 1,
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('allTimeLevels', {
        page: 1,
      });
      expect(mockNavigation.nextPage).toHaveBeenCalled();
      expect(result).toEqual(mockLeaderboardPage);
    });
  });

  describe('All Time Logic Navigation', () => {
    it('should navigate all-time logic leaderboard to specific page', async () => {
      mockNavigation.goToPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateAllTimeLogicToPage({
        page: 1,
        targetPage: 2,
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('allTimeLogic', {
        page: 1,
        targetPage: 2,
      });
      expect(mockNavigation.goToPage).toHaveBeenCalledWith(2);
      expect(result).toEqual(mockLeaderboardPage);
    });

    it('should navigate all-time logic leaderboard to next page', async () => {
      mockNavigation.nextPage.mockResolvedValue(mockLeaderboardPage);

      const caller = leaderboardRouter.createCaller({});
      const result = await caller.navigateAllTimeLogicNext({
        page: 1,
      });

      expect(createLeaderboardNavigation).toHaveBeenCalledWith('allTimeLogic', {
        page: 1,
      });
      expect(mockNavigation.nextPage).toHaveBeenCalled();
      expect(result).toEqual(mockLeaderboardPage);
    });
  });
});
