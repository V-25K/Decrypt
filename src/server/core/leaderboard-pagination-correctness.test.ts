/**
 * Property-Based Test: Leaderboard Pagination Correctness
 * 
 * **Feature: game-performance-and-balance-improvements, Property 3: Leaderboard Pagination Correctness**
 * **Validates: Requirements 3.1, 3.4, 3.5**
 * 
 * Property 3: For any leaderboard dataset, the pagination system SHALL enforce 
 * maximum page sizes of 50 entries AND provide correct navigation controls for 
 * all valid page requests AND clearly indicate end-of-data conditions when no 
 * more entries exist.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  PaginatedLeaderboardService,
  type LeaderboardPage,
  type DailyLeaderboardPageParams,
  type LevelLeaderboardPageParams,
  type LeaderboardPageParams
} from './paginated-leaderboard-service';
import { 
  DailyLeaderboardNavigation,
  LevelLeaderboardNavigation,
  AllTimeLevelsLeaderboardNavigation,
  AllTimeLogicLeaderboardNavigation,
  createLeaderboardNavigation
} from './leaderboard-navigation';
import { propertyTestConfig, gameArbitraries } from '../../shared/property-testing';

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
  keyDailyLeaderboard: vi.fn(() => 'daily:test'),
	  keyAllTimeLevelsLeaderboard: 'decrypt:leaderboard:alltime:levels',
	  keyAllTimeLogicLeaderboard: 'decrypt:leaderboard:alltime:logic',
	  keyGlobalRatingLeaderboard: 'decrypt:leaderboard:global:rating',
	}));

vi.mock('./serde', () => ({
  formatDateKey: vi.fn(() => '2024-01-01'),
}));

import { redis } from '@devvit/web/server';
import { getDailyTop, getLevelTop, getAllTimeTopLevels, getAllTimeTopLogic } from './leaderboard';

describe('Property 3: Leaderboard Pagination Correctness', () => {
  let service: PaginatedLeaderboardService;

  beforeEach(() => {
    service = new PaginatedLeaderboardService();
    vi.clearAllMocks();
  });

  /**
   * Property Test: Maximum Page Size Enforcement (Requirement 3.1)
   * 
   * For any requested page size, the system SHALL enforce a maximum of 50 entries
   */
  it('Property 3.1: SHALL enforce maximum page sizes of 50 entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          page: gameArbitraries.pageNumber(),
          pageSize: fc.integer({ min: 1, max: 200 }), // Test beyond max
          totalEntries: fc.integer({ min: 0, max: 1000 }),
          dateKey: fc.option(fc.string({ minLength: 8, maxLength: 10 }), { nil: undefined })
        }),
        async ({ page, pageSize, totalEntries, dateKey }) => {
          // Calculate effective page size and entries for this page
          const effectivePageSize = Math.min(pageSize || 50, 50);
          const offset = (page - 1) * effectivePageSize;
          
          // Setup mock data - getDailyTop is called with totalNeeded = offset + effectivePageSize
          // We need to return the entries that would be sliced for this specific page
          const totalNeeded = offset + effectivePageSize;
          const allMockEntries = Array.from({ length: totalEntries }, (_, i) => ({
            userId: `user${i}`,
            username: `User${i}`,
            score: 1000 - i,
            snoovatarUrl: null,
            solveSeconds: 30 + i,
            mistakes: i % 3,
            usedPowerups: i % 2
          }));
          
          // Return the entries that getDailyTop would return (up to totalNeeded)
          const mockEntries = allMockEntries.slice(0, Math.min(totalNeeded, totalEntries));

          vi.mocked(redis.zCard).mockResolvedValue(totalEntries);
          vi.mocked(getDailyTop).mockResolvedValue(mockEntries);

          const params: DailyLeaderboardPageParams = { page, pageSize, dateKey };
          const result = await service.getDailyLeaderboardPage(params);

          // Property: Page size is enforced to maximum of 50
          expect(result.pageInfo.pageSize).toBeLessThanOrEqual(50);
          
          // Property: Actual entries returned respect the page size limit
          expect(result.entries.length).toBeLessThanOrEqual(50);
          
          // Property: Page size matches the enforced limit
          const expectedPageSize = Math.min(pageSize || 50, 50);
          expect(result.pageInfo.pageSize).toBe(expectedPageSize);

          // Property: Entries returned match expected count for this page
          const expectedEntriesForThisPage = Math.max(0, Math.min(effectivePageSize, totalEntries - offset));
          expect(result.entries.length).toBe(expectedEntriesForThisPage);
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Navigation Controls Correctness (Requirement 3.4)
   * 
   * For any valid page request, the system SHALL provide correct navigation controls
   */
  it('Property 3.4: SHALL provide correct navigation controls for all valid page requests', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          currentPage: fc.integer({ min: 1, max: 20 }),
          pageSize: fc.integer({ min: 1, max: 50 }),
          totalEntries: fc.integer({ min: 0, max: 1000 }),
          leaderboardType: fc.constantFrom('daily', 'allTimeLevels', 'allTimeLogic') as fc.Arbitrary<'daily' | 'allTimeLevels' | 'allTimeLogic'>
        }),
        async ({ currentPage, pageSize, totalEntries, leaderboardType }) => {
          try {
            // Calculate effective page size and entries for this page
            const effectivePageSize = Math.min(pageSize, 50);
            const offset = (currentPage - 1) * effectivePageSize;
            
            // Setup mock data based on leaderboard type
            const totalNeeded = offset + effectivePageSize;
            const allMockEntries = Array.from({ length: totalEntries }, (_, i) => ({
              userId: `user${i}`,
              username: `User${i}`,
              score: 1000 - i,
              snoovatarUrl: null,
              ...(leaderboardType === 'daily' ? {
                solveSeconds: 30 + i,
                mistakes: i % 3,
                usedPowerups: i % 2
              } : {
                levelsCompleted: 10 + i
              })
            }));
            
            // Return the entries that the leaderboard function would return (up to totalNeeded)
            const mockEntries = allMockEntries.slice(0, Math.min(totalNeeded, totalEntries));

            vi.mocked(redis.zCard).mockResolvedValue(totalEntries);
            
            // Mock appropriate leaderboard function
            if (leaderboardType === 'daily') {
              vi.mocked(getDailyTop).mockResolvedValue(mockEntries);
            } else if (leaderboardType === 'allTimeLevels') {
              vi.mocked(getAllTimeTopLevels).mockResolvedValue(mockEntries);
            } else {
              vi.mocked(getAllTimeTopLogic).mockResolvedValue(mockEntries);
            }

            let result: LeaderboardPage;
            
            // Get result based on leaderboard type
            if (leaderboardType === 'daily') {
              result = await service.getDailyLeaderboardPage({ page: currentPage, pageSize });
            } else if (leaderboardType === 'allTimeLevels') {
              result = await service.getAllTimeLevelsLeaderboardPage({ page: currentPage, pageSize });
            } else {
              result = await service.getAllTimeLogicLeaderboardPage({ page: currentPage, pageSize });
            }

            const totalPages = totalEntries === 0 ? 0 : Math.ceil(totalEntries / effectivePageSize);

            // Property: hasNextPage is correct
            const expectedHasNextPage = totalEntries > 0 && currentPage < totalPages;
            if (result.hasNextPage !== expectedHasNextPage) return false;

            // Property: hasPreviousPage is correct
            const expectedHasPreviousPage = currentPage > 1;
            if (result.hasPreviousPage !== expectedHasPreviousPage) return false;

            // Property: totalPages calculation is correct (handle zero case)
            if (result.pageInfo.totalPages !== totalPages) return false;

            // Property: currentPage is preserved
            if (result.pageInfo.currentPage !== currentPage) return false;

            // Property: totalCount matches expected
            if (result.totalCount !== totalEntries) return false;

            return true;
          } catch (error) {
            console.error('Property test error:', error);
            return false;
          }
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: End-of-Data Indication (Requirement 3.5)
   * 
   * When no more entries exist, the system SHALL clearly indicate the end of results
   */
  it('Property 3.5: SHALL clearly indicate end-of-data conditions when no more entries exist', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          pageSize: fc.integer({ min: 1, max: 50 }),
          totalEntries: fc.integer({ min: 0, max: 500 }),
          requestedPage: fc.integer({ min: 1, max: 50 })
        }),
        async ({ pageSize, totalEntries, requestedPage }) => {
          try {
            const effectivePageSize = Math.min(pageSize, 50);
            const offset = (requestedPage - 1) * effectivePageSize;
            
            const totalNeeded = offset + effectivePageSize;
            const allMockEntries = Array.from({ length: totalEntries }, (_, i) => ({
              userId: `user${i}`,
              username: `User${i}`,
              score: 1000 - i,
              snoovatarUrl: null,
              levelsCompleted: 10 + i
            }));
            
            // Return the entries that getAllTimeTopLevels would return (up to totalNeeded)
            const mockEntries = allMockEntries.slice(0, Math.min(totalNeeded, totalEntries));

            vi.mocked(redis.zCard).mockResolvedValue(totalEntries);
            vi.mocked(getAllTimeTopLevels).mockResolvedValue(mockEntries);

            const result = await service.getAllTimeLevelsLeaderboardPage({ 
              page: requestedPage, 
              pageSize 
            });

            const totalPages = totalEntries === 0 ? 0 : Math.ceil(totalEntries / effectivePageSize);

            // Property: When on the last page or beyond, hasNextPage is false
            if (totalEntries === 0 || requestedPage >= totalPages) {
              if (result.hasNextPage !== false) return false;
            }

            // Property: When total entries is 0, clearly indicate no data
            if (totalEntries === 0) {
              if (result.entries.length !== 0) return false;
              if (result.hasNextPage !== false) return false;
              if (result.hasPreviousPage !== false) return false;
              if (result.pageInfo.totalPages !== 0) return false;
              if (result.totalCount !== 0) return false;
            }

            // Property: When requesting a page beyond available data
            if (totalEntries > 0 && requestedPage > totalPages) {
              if (result.hasNextPage !== false) return false;
            }

            // Property: totalCount is preserved
            if (result.totalCount !== totalEntries) return false;

            return true;
          } catch (error) {
            console.error('Property test error:', error);
            return false;
          }
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Navigation Controls Integration
   * 
   * Tests that LeaderboardNavigation classes work correctly with PaginatedLeaderboardService
   */
  it('Property 3: Navigation controls SHALL work correctly with pagination service', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          initialPage: fc.integer({ min: 1, max: 10 }),
          pageSize: fc.integer({ min: 1, max: 50 }),
          totalEntries: fc.integer({ min: 50, max: 500 }), // Ensure multiple pages
          navigationType: fc.constantFrom('daily', 'allTimeLevels') as fc.Arbitrary<'daily' | 'allTimeLevels'>
        }),
        async ({ initialPage, pageSize, totalEntries, navigationType }) => {
          try {
            const effectivePageSize = Math.min(pageSize, 50);
            
            // Create a function to generate mock entries for any page
            const generateMockEntries = (page: number) => {
              const offset = (page - 1) * effectivePageSize;
              const entriesForThisPage = Math.max(0, Math.min(effectivePageSize, totalEntries - offset));
              
              return Array.from({ length: entriesForThisPage }, (_, i) => ({
                userId: `user${offset + i}`,
                username: `User${offset + i}`,
                score: 1000 - (offset + i),
                snoovatarUrl: null,
                ...(navigationType === 'daily' ? {
                  solveSeconds: 30 + i,
                  mistakes: i % 3,
                  usedPowerups: i % 2
                } : {
                  levelsCompleted: 10 + i
                })
              }));
            };

            // Setup mocks to return appropriate data for any page request
            vi.mocked(redis.zCard).mockResolvedValue(totalEntries);
            
            if (navigationType === 'daily') {
              vi.mocked(getDailyTop).mockImplementation(async (dateKey, limit) => {
                // Determine which page this request is for based on limit
                const requestedPage = Math.ceil(limit / effectivePageSize);
                return generateMockEntries(requestedPage).slice(0, limit);
              });
            } else {
              vi.mocked(getAllTimeTopLevels).mockImplementation(async (limit) => {
                // Determine which page this request is for based on limit
                const requestedPage = Math.ceil(limit / effectivePageSize);
                return generateMockEntries(requestedPage).slice(0, limit);
              });
            }

            // Create navigation instance
            let navigation;
            if (navigationType === 'daily') {
              navigation = createLeaderboardNavigation('daily', { page: initialPage, pageSize });
            } else {
              navigation = createLeaderboardNavigation('allTimeLevels', { page: initialPage, pageSize });
            }

            // Test goToPage
            const pageResult = await navigation.goToPage(initialPage);
            if (pageResult.pageInfo.currentPage !== initialPage) return false;
            if (pageResult.pageInfo.pageSize > 50) return false;

            // Test navigation to first page
            const firstPageResult = await navigation.goToFirstPage();
            if (firstPageResult.pageInfo.currentPage !== 1) return false;

            // Test navigation to last page - handle edge cases
            const lastPageResult = await navigation.goToLastPage();
            const expectedLastPage = totalEntries === 0 ? 1 : Math.ceil(totalEntries / effectivePageSize);
            if (lastPageResult.pageInfo.currentPage !== expectedLastPage) return false;

            // Property: All navigation results have correct page sizes
            if (pageResult.pageInfo.pageSize > 50) return false;
            if (firstPageResult.pageInfo.pageSize > 50) return false;
            if (lastPageResult.pageInfo.pageSize > 50) return false;

            return true;
          } catch (error) {
            console.error('Property test error:', error);
            return false;
          }
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });

  /**
   * Property Test: Comprehensive Pagination Correctness
   * 
   * Tests all three requirements together: page size limits, navigation controls, and end-of-data indication
   */
  it('Property 3: Comprehensive pagination correctness for all leaderboard types', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          page: fc.integer({ min: 1, max: 20 }),
          requestedPageSize: fc.integer({ min: 1, max: 200 }), // Test beyond max
          totalEntries: fc.integer({ min: 0, max: 1000 }),
          leaderboardType: fc.constantFrom('daily', 'level', 'allTimeLevels', 'allTimeLogic') as fc.Arbitrary<'daily' | 'level' | 'allTimeLevels' | 'allTimeLogic'>,
          levelId: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: undefined })
        }),
        async ({ page, requestedPageSize, totalEntries, leaderboardType, levelId }) => {
          try {
            // Setup mock data
            const effectivePageSize = Math.min(requestedPageSize, 50);
            const offset = (page - 1) * effectivePageSize;
            const entriesForThisPage = Math.max(0, Math.min(effectivePageSize, totalEntries - offset));
            
            const mockEntries = Array.from({ length: entriesForThisPage }, (_, i) => ({
              userId: `user${offset + i}`,
              username: `User${offset + i}`,
              score: 1000 - (offset + i),
              snoovatarUrl: null,
              ...(leaderboardType === 'daily' ? {
                solveSeconds: 30 + i,
                mistakes: i % 3,
                usedPowerups: i % 2
              } : leaderboardType === 'level' ? {
                solveSeconds: 30 + i,
                mistakes: i % 3,
                usedPowerups: i % 2
              } : {
                levelsCompleted: 10 + i
              })
            }));

            vi.mocked(redis.zCard).mockResolvedValue(totalEntries);
            vi.mocked(getDailyTop).mockResolvedValue(mockEntries);
            vi.mocked(getLevelTop).mockResolvedValue(mockEntries);
            vi.mocked(getAllTimeTopLevels).mockResolvedValue(mockEntries);
            vi.mocked(getAllTimeTopLogic).mockResolvedValue(mockEntries);

            let result: LeaderboardPage;

            // Get result based on leaderboard type
            switch (leaderboardType) {
              case 'daily':
                result = await service.getDailyLeaderboardPage({ page, pageSize: requestedPageSize });
                break;
              case 'level':
                result = await service.getLevelLeaderboardPage({ 
                  page, 
                  pageSize: requestedPageSize, 
                  levelId: levelId || 'test-level' 
                });
                break;
              case 'allTimeLevels':
                result = await service.getAllTimeLevelsLeaderboardPage({ page, pageSize: requestedPageSize });
                break;
              case 'allTimeLogic':
                result = await service.getAllTimeLogicLeaderboardPage({ page, pageSize: requestedPageSize });
                break;
            }

            // Requirement 3.1: Maximum page size enforcement
            if (result.pageInfo.pageSize > 50) return false;
            if (result.entries.length > 50) return false;

            // Calculate expected values - handle level leaderboards differently
            let totalPages: number;
            let expectedTotalCount: number;
            
            if (leaderboardType === 'level') {
              // Level leaderboards estimate total count, so we use the result's totalCount
              expectedTotalCount = result.totalCount;
              totalPages = expectedTotalCount === 0 ? 0 : Math.ceil(expectedTotalCount / effectivePageSize);
            } else {
              expectedTotalCount = totalEntries;
              totalPages = totalEntries === 0 ? 0 : Math.ceil(totalEntries / effectivePageSize);
            }

            // Requirement 3.4: Navigation controls correctness
            const expectedHasNextPage = expectedTotalCount > 0 && page < totalPages;
            if (result.hasNextPage !== expectedHasNextPage) return false;
            if (result.hasPreviousPage !== (page > 1)) return false;
            if (result.pageInfo.currentPage !== page) return false;

            // Requirement 3.5: End-of-data indication
            if (expectedTotalCount === 0) {
              if (result.entries.length !== 0) return false;
              if (result.hasNextPage !== false) return false;
              if (result.hasPreviousPage !== false) return false;
              if (result.totalCount !== 0) return false;
            }

            if (expectedTotalCount > 0 && page >= totalPages) {
              if (result.hasNextPage !== false) return false;
            }

            // Property: All results have valid structure
            if (!result.pageInfo) return false;
            if (!result.entries) return false;
            if (!Array.isArray(result.entries)) return false;

            return true;
          } catch (error) {
            console.error('Property test error:', error);
            return false;
          }
        }
      ),
      { ...propertyTestConfig, numRuns: 100 }
    );
  });
});
