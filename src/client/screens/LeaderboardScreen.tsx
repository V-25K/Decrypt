import { useState, useCallback, useEffect, useRef } from 'react';
import { tabButtonClass } from '../app/ui';
import { trpc } from '../trpc';
import { ErrorCard } from '../components/ErrorCard';
import type {
  LeaderboardTab,
  LeaderboardPage,
} from '../app/types';
import type { LeaderboardEntry } from '../../shared/game';

const isDailyEntry = (entry: LeaderboardEntry): entry is LeaderboardEntry & { solveSeconds: number | null } =>
  entry.solveSeconds !== undefined;

const isAllTimeEntry = (entry: LeaderboardEntry): entry is LeaderboardEntry & { levelsCompleted: number } =>
  entry.levelsCompleted !== undefined;

const formatLeaderboardNumber = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.round(value).toLocaleString()
    : '--';

type LeaderboardScreenProps = {
  leaderboardTab: LeaderboardTab;
  onTabChange: (tab: LeaderboardTab) => void;
  currentUserRank: number | null;
  currentUserId: string | null;
  formatLeaderboardName: (entry: { username?: string | null; userId: string }) => string;
  formatStatDuration: (seconds: number | null | undefined) => string;
};

// Podium treatment for the top three: medal instead of a plain rank number,
// plus a tinted border so the very top of the board reads at a glance.
const medalForRank = (rank: number): string | null =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

const rowAccentClass = (rank: number, isCurrentUser: boolean): string => {
  if (isCurrentUser) {
    return 'border-amber-300/80 bg-amber-300/10';
  }
  if (rank === 1) {
    return 'border-yellow-300/70 bg-yellow-300/10';
  }
  if (rank === 2) {
    return 'border-slate-200/60 bg-slate-200/10';
  }
  if (rank === 3) {
    return 'border-orange-300/60 bg-orange-400/10';
  }
  return '';
};

const avatarRingClass = (rank: number): string =>
  rank === 1
    ? 'ring-2 ring-yellow-300/90'
    : rank === 2
      ? 'ring-2 ring-slate-200/80'
      : rank === 3
        ? 'ring-2 ring-orange-300/80'
        : 'ring-1 ring-white/20';

type LeaderboardAvatarProps = {
  entry: LeaderboardEntry;
  displayName: string;
  eager: boolean;
};

const LeaderboardAvatar = ({
  entry,
  displayName,
  eager,
  ringClass,
}: LeaderboardAvatarProps & { ringClass: string }) => {
  const [avatarError, setAvatarError] = useState(false);
  const fallbackInitial = displayName.trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gray-700 ${ringClass}`}
    >
      {!avatarError && entry.snoovatarUrl ? (
        <img
          src={entry.snoovatarUrl}
          alt={`${displayName} snoovatar`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'low'}
          width={32}
          height={32}
          className="h-full w-full object-cover"
          onError={() => setAvatarError(true)}
        />
      ) : (
        <span className="text-xs font-bold text-white">{fallbackInitial}</span>
      )}
    </div>
  );
};

export const LeaderboardScreen = ({
  leaderboardTab,
  onTabChange,
  currentUserRank,
  currentUserId,
  formatLeaderboardName,
  formatStatDuration,
}: LeaderboardScreenProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardPage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  const runLeaderboardRequest = useCallback(
    async (request: {
      load: () => Promise<LeaderboardPage | null>;
      apply: (data: LeaderboardPage | null) => void;
      errorMessage: string;
    }) => {
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      setIsLoading(true);
      setError(null);

      try {
        const data = await request.load();
        if (latestRequestIdRef.current !== requestId) {
          return;
        }
        request.apply(data);
      } catch (err) {
        if (latestRequestIdRef.current !== requestId) {
          return;
        }
        setError(request.errorMessage);
        console.error('Leaderboard fetch error:', err);
      } finally {
        if (latestRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  // Fetch leaderboard data based on current tab and page
  const goToPage = useCallback(async (page: number) => {
    if (page < 1) {
      return;
    }
    await runLeaderboardRequest({
      load: async () =>
	        leaderboardTab === 'daily'
	          ? await trpc.leaderboard.getDailyPage.query({ page, pageSize: 50 })
	          : await trpc.leaderboard.getGlobalPage.query({ page, pageSize: 50 }),
      apply: (data) => {
        if (!data) {
          return;
        }
        setLeaderboardData(data);
        setCurrentPage(data.pageInfo.currentPage);
      },
      errorMessage: 'Failed to load leaderboard data',
    });
  }, [leaderboardTab, runLeaderboardRequest]);

  const fetchLeaderboardData = useCallback(async (page: number = 1) => {
    await goToPage(page);
  }, [goToPage]);

  // Load data when tab changes or component mounts
  useEffect(() => {
    setCurrentPage(1);
    void fetchLeaderboardData(1);
  }, [fetchLeaderboardData]);

  // Navigation handlers
  const handleNextPage = useCallback(() => {
    if (!leaderboardData?.hasNextPage || isLoading) return;
    void goToPage(currentPage + 1);
  }, [currentPage, goToPage, leaderboardData?.hasNextPage, isLoading]);

  const handlePreviousPage = useCallback(() => {
    if (!leaderboardData?.hasPreviousPage || isLoading) return;
    void goToPage(currentPage - 1);
  }, [currentPage, goToPage, leaderboardData?.hasPreviousPage, isLoading]);

  const handleFirstPage = useCallback(() => {
    if (currentPage === 1 || isLoading) return;
    void goToPage(1);
  }, [currentPage, goToPage, isLoading]);

  const handleLastPage = useCallback(() => {
    if (!leaderboardData || currentPage >= leaderboardData.pageInfo.totalPages || isLoading) return;
    void goToPage(leaderboardData.pageInfo.totalPages);
  }, [currentPage, goToPage, leaderboardData, isLoading]);

  const handleRefresh = useCallback(() => {
    void fetchLeaderboardData(currentPage);
  }, [fetchLeaderboardData, currentPage]);

  return (
    <section className="hub-screen app-surface flex min-h-0 flex-1 flex-col" data-testid="leaderboard-screen">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <section className="hub-header-panel panel-clear mb-3 rounded-xl px-4 py-3">
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
	              className={tabButtonClass(leaderboardTab === 'global')}
	              onClick={() => onTabChange('global')}
	            >
	              Global
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
            <ErrorCard error={error} onRetry={handleRefresh} />
          )}

          {/* Loading State */}
          {isLoading && !leaderboardData && (
            <div className="hub-card app-surface rounded-lg border app-border px-3 py-3 text-center text-xs font-semibold app-text-muted">
              Loading leaderboard...
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && leaderboardData && leaderboardData.entries.length === 0 && (
            <div className="hub-card app-surface rounded-lg border app-border px-4 py-6 text-center">
              <p className="app-text text-sm font-black uppercase">No Scores Yet</p>
              <p className="app-text-muted mt-1 text-xs font-semibold">
                Be the first player to leave a mark on this board.
              </p>
            </div>
          )}

          {/* Leaderboard Header */}
          {!isLoading && !error && leaderboardData && leaderboardData.entries.length > 0 && (
	            <div className="hub-subpanel app-surface-subtle grid grid-cols-[26px_34px_minmax(0,1fr)_76px_76px] items-center gap-2 rounded-lg border app-border px-2 py-1.5">
              <div className="app-text-muted text-[9px] font-black uppercase">Rank</div>
              <div className="app-text-muted text-[9px] font-black uppercase" aria-hidden="true" />
              <div className="app-text-muted text-[9px] font-black uppercase">Player</div>
	              <div className="app-text-muted text-right text-[9px] font-black uppercase">
	                {leaderboardTab === 'daily' ? 'Score' : 'Rating'}
	              </div>
		              <div className="app-text-muted text-right text-[9px] font-black uppercase">
		                {leaderboardTab === 'daily' ? 'Avg. Time' : 'Total Points'}
		              </div>
            </div>
          )}

          {/* Leaderboard Entries */}
          {!isLoading && !error && leaderboardData && leaderboardData.entries.length > 0 && (
            <div className="space-y-1.5">
	              {leaderboardData.entries.map((entry, index) => {
	                const globalRank = (leaderboardData.pageInfo.currentPage - 1) * leaderboardData.pageInfo.pageSize + index + 1;
	                const displayName = formatLeaderboardName({
	                  userId: entry.userId,
	                  username: entry.username ?? null
	                });
		                const scoreValue =
		                  leaderboardTab === 'daily'
		                    ? formatLeaderboardNumber(entry.score)
		                    : formatLeaderboardNumber(entry.rating ?? entry.score);
		                const detail =
		                  leaderboardTab === 'daily'
		                    ? formatStatDuration(isDailyEntry(entry) ? (entry.solveSeconds ?? null) : null)
		                    : formatLeaderboardNumber(
		                        entry.globalScore ??
		                          (isAllTimeEntry(entry) ? entry.levelsCompleted : null)
		                      );
                const medal = medalForRank(globalRank);
                const isCurrentUser =
                  currentUserId !== null && entry.userId === currentUserId;
                return (
                  <article
                    key={`leaderboard-${leaderboardTab}-${entry.userId}-${index}`}
                    data-testid={isCurrentUser ? 'leaderboard-row-you' : undefined}
                    className={`hub-card hub-row-card app-surface grid grid-cols-[26px_34px_minmax(0,1fr)_76px_76px] items-center gap-2 rounded-lg border app-border px-2 py-1.5 ${rowAccentClass(globalRank, isCurrentUser)} ${
                      !medal && !isCurrentUser && index % 2 === 1
                        ? 'app-surface-subtle'
                        : ''
                    }`}
                  >
                    {medal ? (
                      <span className="text-[15px] leading-none" aria-label={`Rank ${globalRank}`}>
                        {medal}
                      </span>
                    ) : (
                      <span className="app-text text-[11px] font-black">#{globalRank}</span>
                    )}
                    <LeaderboardAvatar
                      entry={entry}
                      displayName={displayName}
                      eager={index < 4}
                      ringClass={avatarRingClass(globalRank)}
                    />
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="app-text truncate text-[11px] font-bold">
                        {displayName}
                      </span>
                      {isCurrentUser && (
                        <span className="badge-primary shrink-0 rounded px-1 py-0.5 text-[8px] font-black uppercase">
                          You
                        </span>
                      )}
                    </div>
                    <div className="app-text text-right text-[11px] font-black">
                      {scoreValue}
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
            <div className="hub-subpanel app-surface-subtle rounded-lg border app-border px-3 py-2">
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
	                    disabled={isLoading || currentPage >= leaderboardData.pageInfo.totalPages}
	                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <footer className="hub-subpanel app-surface-subtle mt-2 shrink-0 rounded-lg border app-border px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="app-text-muted text-[10px] font-black uppercase tracking-[0.03em]">
	              Your {leaderboardTab === 'daily' ? 'Daily' : 'Global'} Rank
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
