import { redis } from '@devvit/web/server';
import { getDailyTop, getLevelTop, getAllTimeTopLevels, getAllTimeTopLogic } from './leaderboard';
import { keyDailyLeaderboard, keyAllTimeLevelsLeaderboard, keyAllTimeLogicLeaderboard } from './keys';
import { formatDateKey } from './serde';

/**
 * Page information for leaderboard pagination
 */
export interface PageInfo {
  currentPage: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Paginated leaderboard response
 */
export interface LeaderboardPage<T = any> {
  entries: T[];
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  totalCount: number;
  pageInfo: PageInfo;
}

/**
 * Parameters for leaderboard page requests
 */
export interface LeaderboardPageParams {
  page: number;
  pageSize?: number;
}

/**
 * Daily leaderboard page parameters
 */
export interface DailyLeaderboardPageParams extends LeaderboardPageParams {
  dateKey?: string;
}

/**
 * Level leaderboard page parameters
 */
export interface LevelLeaderboardPageParams extends LeaderboardPageParams {
  levelId: string;
}

/**
 * PaginatedLeaderboardService provides efficient pagination for leaderboard data
 * with cursor-based navigation and total count calculation.
 * 
 * Features:
 * - 50-entry page limits (configurable)
 * - Cursor-based navigation for efficient data retrieval
 * - Total count calculation and page metadata
 * - Parallel Redis operations for performance
 */
export class PaginatedLeaderboardService {
  private readonly PAGE_SIZE = 50;

  /**
   * Get a paginated daily leaderboard
   */
  async getDailyLeaderboardPage(params: DailyLeaderboardPageParams): Promise<LeaderboardPage> {
    const pageSize = Math.min(params.pageSize || this.PAGE_SIZE, this.PAGE_SIZE);
    const offset = (params.page - 1) * pageSize;
    
    const dateKey = params.dateKey || formatDateKey(new Date());
    const leaderboardKey = keyDailyLeaderboard(dateKey);
    
    // Use Promise.all for parallel Redis operations as specified in design
    const [totalCount, entries] = await Promise.all([
      redis.zCard(leaderboardKey),
      this.getDailyEntriesForPage(dateKey, offset, pageSize)
    ]);
    
    return this.buildLeaderboardPage(entries, params.page, pageSize, totalCount);
  }

  /**
   * Get a paginated level leaderboard
   */
  async getLevelLeaderboardPage(params: LevelLeaderboardPageParams): Promise<LeaderboardPage> {
    const pageSize = Math.min(params.pageSize || this.PAGE_SIZE, this.PAGE_SIZE);
    const offset = (params.page - 1) * pageSize;
    
    // For level leaderboards, we need to get entries and estimate total count
    const entries = await this.getLevelEntriesForPage(params.levelId, offset, pageSize);
    
    // Estimate total count based on returned entries
    // If we got fewer entries than requested, we're at the end
    let totalCount: number;
    if (entries.length < pageSize) {
      // We're at the end, total count is offset + actual entries
      totalCount = offset + entries.length;
    } else {
      // We might have more data, estimate conservatively
      // Try to get one more entry to see if there's more data
      const checkEntries = await this.getLevelEntriesForPage(params.levelId, offset + pageSize, 1);
      totalCount = checkEntries.length > 0 ? offset + pageSize + 1 : offset + entries.length;
    }
    
    return this.buildLeaderboardPage(entries, params.page, pageSize, totalCount);
  }

  /**
   * Get a paginated all-time levels leaderboard
   */
  async getAllTimeLevelsLeaderboardPage(params: LeaderboardPageParams): Promise<LeaderboardPage> {
    const pageSize = Math.min(params.pageSize || this.PAGE_SIZE, this.PAGE_SIZE);
    const offset = (params.page - 1) * pageSize;
    
    const leaderboardKey = keyAllTimeLevelsLeaderboard;
    
    const [totalCount, entries] = await Promise.all([
      redis.zCard(leaderboardKey),
      this.getAllTimeLevelsEntriesForPage(offset, pageSize)
    ]);
    
    return this.buildLeaderboardPage(entries, params.page, pageSize, totalCount);
  }

  /**
   * Get a paginated all-time logic leaderboard
   */
  async getAllTimeLogicLeaderboardPage(params: LeaderboardPageParams): Promise<LeaderboardPage> {
    const pageSize = Math.min(params.pageSize || this.PAGE_SIZE, this.PAGE_SIZE);
    const offset = (params.page - 1) * pageSize;
    
    const leaderboardKey = keyAllTimeLogicLeaderboard;
    
    const [totalCount, entries] = await Promise.all([
      redis.zCard(leaderboardKey),
      this.getAllTimeLogicEntriesForPage(offset, pageSize)
    ]);
    
    return this.buildLeaderboardPage(entries, params.page, pageSize, totalCount);
  }

  /**
   * Get daily leaderboard entries for a specific page
   */
  private async getDailyEntriesForPage(dateKey: string, offset: number, pageSize: number) {
    // Use the existing getDailyTop function but with calculated offset and limit
    // We need to get more entries than needed and slice to handle the offset
    const totalNeeded = offset + pageSize;
    const allEntries = await getDailyTop(dateKey, totalNeeded);
    
    return allEntries.slice(offset, offset + pageSize);
  }

  /**
   * Get level leaderboard entries for a specific page
   */
  private async getLevelEntriesForPage(levelId: string, offset: number, pageSize: number) {
    // Similar approach for level leaderboards
    const totalNeeded = offset + pageSize;
    const allEntries = await getLevelTop(levelId, totalNeeded);
    
    return allEntries.slice(offset, offset + pageSize);
  }

  /**
   * Get all-time levels leaderboard entries for a specific page
   */
  private async getAllTimeLevelsEntriesForPage(offset: number, pageSize: number) {
    const totalNeeded = offset + pageSize;
    const allEntries = await getAllTimeTopLevels(totalNeeded);
    
    return allEntries.slice(offset, offset + pageSize);
  }

  /**
   * Get all-time logic leaderboard entries for a specific page
   */
  private async getAllTimeLogicEntriesForPage(offset: number, pageSize: number) {
    const totalNeeded = offset + pageSize;
    const allEntries = await getAllTimeTopLogic(totalNeeded);
    
    return allEntries.slice(offset, offset + pageSize);
  }

  /**
   * Build a standardized leaderboard page response
   */
  private buildLeaderboardPage<T>(
    entries: T[],
    currentPage: number,
    pageSize: number,
    totalCount: number
  ): LeaderboardPage<T> {
    // Handle edge case where totalCount is 0
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
    
    // Navigation logic: 
    // - hasNextPage: only true if we have data and current page is less than total pages
    // - hasPreviousPage: only true if current page is greater than 1
    const hasNextPage = totalCount > 0 && currentPage < totalPages;
    const hasPreviousPage = currentPage > 1;

    return {
      entries,
      hasNextPage,
      hasPreviousPage,
      totalCount,
      pageInfo: {
        currentPage,
        pageSize,
        totalPages
      }
    };
  }
}

/**
 * Singleton instance of the paginated leaderboard service
 */
export const paginatedLeaderboardService = new PaginatedLeaderboardService();