import { useState, useCallback, useEffect } from 'react';
import { tabButtonClass } from '../app/ui';
import { trpc } from '../trpc';
import type {
  LeaderboardTab,
  LeaderboardPage,
} from '../app/types';
import type { LeaderboardEntry } from '../../shared/game';

const isDailyEntry = (entry: LeaderboardEntry): entry is LeaderboardEntry & { solveSeconds: number | null } =>
  entry.solveSeconds !== undefined;

const isAllTimeEntry = (entry: LeaderboardEntry): entry is LeaderboardEntry & { levelsCompleted: number } =>
  entry.levelsCompleted !== undefined;

type LeaderboardScreenProps = {
  leaderboardTab: LeaderboardTab;
  onTabChange: (tab: LeaderboardTab) => void;
  currentUserRank: number | null;
  formatLeaderboardName: (entry: { username?: string | null; userId: string }) => string;
  formatStatDuration: (seconds: number | null | undefined) => string;
};

export const LeaderboardScreen = ({
  leaderboardTab,
  onTabChange,
  currentUserRank,
  formatLeaderboardName,
  formatStatDuration,
}: LeaderboardScreenProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch leaderboard data based on current tab and page
  const fetchLeaderboardData = useCallback(async (page: number = 1) => {
    setIsLoading(true);
    setError(null);
    
    try {
      let data: LeaderboardPage;
      
      if (leaderboardTab === 'daily') {
        data = await trpc.leaderboard.getDailyPage.query({
          page,
          pageSize: 50,
        });
      } else {
        // For endless/all-time leaderboard
        data = await trpc.leaderboard.getAllTimeLevelsPage.query({
          page,
          pageSize: 50,
        });
      }
      
      setLeaderboardData(data);
      setCurrentPage(page);
    } catch (err) {
      setError('Failed to load leaderboard data');
      console.error('Leaderboard fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [leaderboardTab]);

  // Load data when tab changes or component mounts
  useEffect(() => {
    setCurrentPage(1);
    fetchLeaderboardData(1);
  }, [fetchLeaderboardData]);

  // Navigation handlers
  const handleNextPage = useCallback(async () => {
    if (!leaderboardData?.hasNextPage) return;
    
    try {
      setIsLoading(true);
      let nextPageData: LeaderboardPage | null;
      
      if (leaderboardTab === 'daily') {
        nextPageData = await trpc.leaderboard.navigateDailyNext.query({
          page: currentPage,
          pageSize: 50,
        });
      } else {
        nextPageData = await trpc.leaderboard.navigateAllTimeLevelsNext.query({
          page: currentPage,
          pageSize: 50,
        });
      }
      
      if (nextPageData) {
        setLeaderboardData(nextPageData);
        setCurrentPage(currentPage + 1);
      }
    } catch (err) {
      setError('Failed to load next page');
      console.error('Next page error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [leaderboardTab, currentPage, leaderboardData?.hasNextPage]);

  const handlePreviousPage = useCallback(async () => {
    if (!leaderboardData?.hasPreviousPage) return;
    
    try {
      setIsLoading(true);
      let prevPageData: LeaderboardPage | null;
      
      if (leaderboardTab === 'daily') {
        prevPageData = await trpc.leaderboard.navigateDailyPrevious.query({
          page: currentPage,
          pageSize: 50,
        });
      } else {
        prevPageData = await trpc.leaderboard.navigateAllTimeLevelsPrevious.query({
          page: currentPage,
          pageSize: 50,
        });
      }
      
      if (prevPageData) {
        setLeaderboardData(prevPageData);
        setCurrentPage(currentPage - 1);
      }
    } catch (err) {
      setError('Failed to load previous page');
      console.error('Previous page error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [leaderboardTab, currentPage, leaderboardData?.hasPreviousPage]);

  const handleFirstPage = useCallback(async () => {
    if (currentPage === 1) return;
    
    try {
      setIsLoading(true);
      let firstPageData: LeaderboardPage;
      
      if (leaderboardTab === 'daily') {
        firstPageData = await trpc.leaderboard.navigateDailyFirst.query({
          page: currentPage,
          pageSize: 50,
        });
      } else {
        firstPageData = await trpc.leaderboard.navigateAllTimeLevelsFirst.query({
          page: currentPage,
          pageSize: 50,
        });
      }
      
      setLeaderboardData(firstPageData);
      setCurrentPage(1);
    } catch (err) {
      setError('Failed to load first page');
      console.error('First page error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [leaderboardTab, currentPage]);

  const handleLastPage = useCallback(async () => {
    if (!leaderboardData?.hasNextPage) return;
    
    try {
      setIsLoading(true);
      let lastPageData: LeaderboardPage;
      
      if (leaderboardTab === 'daily') {
        lastPageData = await trpc.leaderboard.navigateDailyLast.query({
          page: currentPage,
          pageSize: 50,
        });
      } else {
        lastPageData = await trpc.leaderboard.navigateAllTimeLevelsLast.query({
          page: currentPage,
          pageSize: 50,
        });
      }
      
      setLeaderboardData(lastPageData);
      setCurrentPage(lastPageData.pageInfo.totalPages);
    } catch (err) {
      setError('Failed to load last page');
      console.error('Last page error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [leaderboardTab, currentPage, leaderboardData?.hasNextPage]);

  const handleRefresh = useCallback(() => {
    fetchLeaderboardData(currentPage);
  }, [fetchLeaderboardData, currentPage]);

  return (
    <section className="app-surface flex min-h-0 flex-1 flex-col" data-testid="leaderboard-screen">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <section className="app-surface-strong mb-3 rounded-xl border app-border px-4 py-3">
          <h2 className="app-text text-center text-base font-black uppercase tracking-[0.04em]">
            Leaderboard
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className={tabButtonClass(leaderboardTab === 'daily')}
              onClick={() => onTabChange('daily')}
            >
              Daily
            </button>
            <button
              className={tabButtonClass(leaderboardTab === 'endless')}
              onClick={() => onTabChange('endless')}
            >
              Endless
            </button>
          </div>
        </section>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {leaderboardData && (
                <span className="app-text-muted text-[10px] font-semibold">
                  Page {leaderboardData.pageInfo.currentPage} of {leaderboardData.pageInfo.totalPages}
                  {leaderboardData.totalCount > 0 && ` (${leaderboardData.totalCount} total)`}
                </span>
              )}
            </div>
            <button
              className="btn-3d btn-neutral rounded-md px-2 py-1 text-[10px] font-black uppercase"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {/* Error State */}
          {error && (
            <div className="app-surface rounded-lg border app-border px-3 py-3 text-center text-xs font-semibold text-red-500">
              {error}
            </div>
          )}

          {/* Loading State */}
          {isLoading && !leaderboardData && (
            <div className="app-surface rounded-lg border app-border px-3 py-3 text-center text-xs font-semibold app-text-muted">
              Loading leaderboard...
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && leaderboardData && leaderboardData.entries.length === 0 && (
            <div className="app-surface rounded-lg border app-border px-3 py-3 text-center text-xs font-semibold app-text-muted">
              No leaderboard entries yet.
            </div>
          )}

          {/* Leaderboard Header */}
          {!isLoading && !error && leaderboardData && leaderboardData.entries.length > 0 && (
            <div className="app-surface-subtle grid grid-cols-[26px_34px_minmax(0,1fr)_70px_60px] items-center gap-2 rounded-lg border app-border px-2 py-1.5">
              <div className="app-text-muted text-[9px] font-black uppercase">Rank</div>
              <div className="app-text-muted text-[9px] font-black uppercase" aria-hidden="true" />
              <div className="app-text-muted text-[9px] font-black uppercase">Player</div>
              <div className="app-text-muted text-right text-[9px] font-black uppercase">Score</div>
              <div className="app-text-muted text-right text-[9px] font-black uppercase">
                {leaderboardTab === 'daily' ? 'Avg. Time' : 'Levels'}
              </div>
            </div>
          )}

          {/* Leaderboard Entries */}
          {!isLoading && !error && leaderboardData && leaderboardData.entries.length > 0 && (
            <div className="space-y-1.5">
              {leaderboardData.entries.map((entry, index) => {
                const globalRank = (leaderboardData.pageInfo.currentPage - 1) * leaderboardData.pageInfo.pageSize + index + 1;
                const detail =
                  leaderboardTab === 'daily'
                    ? formatStatDuration(isDailyEntry(entry) ? (entry.solveSeconds ?? null) : null)
                    : String(isAllTimeEntry(entry) ? (entry.levelsCompleted ?? '--') : '--');
                return (
                  <article
                    key={`leaderboard-${leaderboardTab}-${entry.userId}-${index}`}
                    className="app-surface grid grid-cols-[26px_34px_minmax(0,1fr)_70px_60px] items-center gap-2 rounded-lg border app-border px-2 py-1.5"
                  >
                    <span className="app-text text-[11px] font-black">#{globalRank}</span>
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-transparent">
                      {entry.snoovatarUrl && (
                        <img
                          src={entry.snoovatarUrl}
                          alt="Player snoovatar"
                          loading={index < 4 ? 'eager' : 'lazy'}
                          decoding="async"
                          fetchPriority={index < 4 ? 'high' : 'low'}
                          width={32}
                          height={32}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <div className="app-text truncate text-[11px] font-bold">
                      {formatLeaderboardName({
                        userId: entry.userId,
                        username: entry.username ?? null
                      })}
                    </div>
                    <div className="app-text text-right text-[11px] font-black">
                      {Math.round(entry.score)}
                    </div>
                    <div className="app-text-muted text-right text-[10px] font-bold">
                      {detail}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {!isLoading && !error && leaderboardData && leaderboardData.pageInfo.totalPages > 1 && (
            <div className="app-surface-subtle rounded-lg border app-border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    className="btn-3d btn-neutral rounded-md px-2 py-1 text-[9px] font-black uppercase disabled:opacity-50"
                    onClick={handleFirstPage}
                    disabled={isLoading || currentPage === 1}
                  >
                    First
                  </button>
                  <button
                    className="btn-3d btn-neutral rounded-md px-2 py-1 text-[9px] font-black uppercase disabled:opacity-50"
                    onClick={handlePreviousPage}
                    disabled={isLoading || !leaderboardData.hasPreviousPage}
                  >
                    Prev
                  </button>
                </div>
                
                <span className="app-text-muted text-[10px] font-semibold">
                  {leaderboardData.pageInfo.currentPage} / {leaderboardData.pageInfo.totalPages}
                </span>
                
                <div className="flex items-center gap-1">
                  <button
                    className="btn-3d btn-neutral rounded-md px-2 py-1 text-[9px] font-black uppercase disabled:opacity-50"
                    onClick={handleNextPage}
                    disabled={isLoading || !leaderboardData.hasNextPage}
                  >
                    Next
                  </button>
                  <button
                    className="btn-3d btn-neutral rounded-md px-2 py-1 text-[9px] font-black uppercase disabled:opacity-50"
                    onClick={handleLastPage}
                    disabled={isLoading || !leaderboardData.hasNextPage}
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <footer className="app-surface-subtle mt-2 shrink-0 rounded-lg border app-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="app-text-muted text-[10px] font-black uppercase tracking-[0.03em]">
              Your {leaderboardTab === 'daily' ? 'Daily' : 'Endless'} Rank
            </span>
            <span className="app-text text-sm font-black">
              {typeof currentUserRank === 'number' && currentUserRank > 0
                ? `#${currentUserRank}`
                : '--'}
            </span>
          </div>
        </footer>
      </main>
    </section>
  );
};
