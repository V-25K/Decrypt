import { 
  paginatedLeaderboardService, 
  type LeaderboardPage, 
  type DailyLeaderboardPageParams,
  type LevelLeaderboardPageParams,
  type LeaderboardPageParams 
} from './paginated-leaderboard-service';

/**
 * Navigation interface for leaderboard pagination
 * Provides methods for navigating between pages with consistent behavior
 */
export interface LeaderboardNavigation {
  goToPage(page: number): Promise<LeaderboardPage>;
  nextPage(): Promise<LeaderboardPage | null>;
  previousPage(): Promise<LeaderboardPage | null>;
  goToFirstPage(): Promise<LeaderboardPage>;
  goToLastPage(): Promise<LeaderboardPage>;
}

/**
 * Base navigation implementation that provides common navigation logic
 */
abstract class BaseLeaderboardNavigation<TParams extends LeaderboardPageParams> 
  implements LeaderboardNavigation {
  
  protected currentPage: number = 1;
  protected currentPageSize: number = 50;
  protected totalPages: number = 1;
  protected params: TParams;

  constructor(params: TParams) {
    this.params = params;
    this.currentPage = params.page || 1;
    this.currentPageSize = params.pageSize || 50;
  }

  /**
   * Navigate to a specific page number
   */
  async goToPage(page: number): Promise<LeaderboardPage> {
    if (page < 1) {
      throw new Error('Page number must be greater than 0');
    }

    const updatedParams = { ...this.params, page, pageSize: this.currentPageSize };
    const result = await this.fetchPage(updatedParams);
    
    // Update internal state
    this.currentPage = page;
    this.totalPages = result.pageInfo.totalPages;
    
    return result;
  }

  /**
   * Navigate to the next page
   */
  async nextPage(): Promise<LeaderboardPage | null> {
    // First get current page info to determine if next page exists
    const currentResult = await this.fetchPage({ ...this.params, page: this.currentPage, pageSize: this.currentPageSize });
    this.totalPages = currentResult.pageInfo.totalPages;
    
    if (!currentResult.hasNextPage) {
      return null;
    }
    
    return await this.goToPage(this.currentPage + 1);
  }

  /**
   * Navigate to the previous page
   */
  async previousPage(): Promise<LeaderboardPage | null> {
    if (this.currentPage <= 1) {
      return null;
    }
    
    return await this.goToPage(this.currentPage - 1);
  }

  /**
   * Navigate to the first page
   */
  async goToFirstPage(): Promise<LeaderboardPage> {
    return await this.goToPage(1);
  }

  /**
   * Navigate to the last page
   */
  async goToLastPage(): Promise<LeaderboardPage> {
    // First get current page info to determine total pages
    const currentResult = await this.fetchPage({ ...this.params, page: this.currentPage, pageSize: this.currentPageSize });
    const lastPage = currentResult.pageInfo.totalPages;
    
    if (lastPage <= 0) {
      return await this.goToPage(1);
    }
    
    return await this.goToPage(lastPage);
  }

  /**
   * Abstract method to fetch a page - implemented by concrete classes
   */
  protected abstract fetchPage(params: TParams): Promise<LeaderboardPage>;
}

/**
 * Navigation implementation for daily leaderboards
 */
export class DailyLeaderboardNavigation extends BaseLeaderboardNavigation<DailyLeaderboardPageParams> {
  protected async fetchPage(params: DailyLeaderboardPageParams): Promise<LeaderboardPage> {
    return await paginatedLeaderboardService.getDailyLeaderboardPage(params);
  }
}

/**
 * Navigation implementation for level leaderboards
 */
export class LevelLeaderboardNavigation extends BaseLeaderboardNavigation<LevelLeaderboardPageParams> {
  protected async fetchPage(params: LevelLeaderboardPageParams): Promise<LeaderboardPage> {
    return await paginatedLeaderboardService.getLevelLeaderboardPage(params);
  }
}

/**
 * Navigation implementation for all-time levels leaderboards
 */
export class AllTimeLevelsLeaderboardNavigation extends BaseLeaderboardNavigation<LeaderboardPageParams> {
  protected async fetchPage(params: LeaderboardPageParams): Promise<LeaderboardPage> {
    return await paginatedLeaderboardService.getAllTimeLevelsLeaderboardPage(params);
  }
}

/**
 * Navigation implementation for all-time logic leaderboards
 */
export class AllTimeLogicLeaderboardNavigation extends BaseLeaderboardNavigation<LeaderboardPageParams> {
  protected async fetchPage(params: LeaderboardPageParams): Promise<LeaderboardPage> {
    return await paginatedLeaderboardService.getAllTimeLogicLeaderboardPage(params);
  }
}

/**
 * Factory function to create navigation instances for different leaderboard types
 */
export function createLeaderboardNavigation(
  type: 'daily',
  params: DailyLeaderboardPageParams
): DailyLeaderboardNavigation;
export function createLeaderboardNavigation(
  type: 'level',
  params: LevelLeaderboardPageParams
): LevelLeaderboardNavigation;
export function createLeaderboardNavigation(
  type: 'allTimeLevels',
  params: LeaderboardPageParams
): AllTimeLevelsLeaderboardNavigation;
export function createLeaderboardNavigation(
  type: 'allTimeLogic',
  params: LeaderboardPageParams
): AllTimeLogicLeaderboardNavigation;
export function createLeaderboardNavigation(
  type: 'daily' | 'level' | 'allTimeLevels' | 'allTimeLogic',
  params: any
): LeaderboardNavigation {
  switch (type) {
    case 'daily':
      return new DailyLeaderboardNavigation(params);
    case 'level':
      return new LevelLeaderboardNavigation(params);
    case 'allTimeLevels':
      return new AllTimeLevelsLeaderboardNavigation(params);
    case 'allTimeLogic':
      return new AllTimeLogicLeaderboardNavigation(params);
    default:
      throw new Error(`Unknown leaderboard type: ${type}`);
  }
}
