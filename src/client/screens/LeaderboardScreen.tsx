import { tabButtonClass } from '../app/ui';
import type {
  AllTimeLeaderboardEntry,
  DailyLeaderboardEntry,
  LeaderboardTab,
} from '../app/types';

type LeaderboardEntry = DailyLeaderboardEntry | AllTimeLeaderboardEntry;

const isDailyEntry = (entry: LeaderboardEntry): entry is DailyLeaderboardEntry =>
  'solveSeconds' in entry;

const isAllTimeEntry = (entry: LeaderboardEntry): entry is AllTimeLeaderboardEntry =>
  'levelsCompleted' in entry;

type LeaderboardScreenProps = {
  leaderboardTab: LeaderboardTab;
  onTabChange: (tab: LeaderboardTab) => void;
  onRefresh: () => void;
  leaderboardLoading: boolean;
  activeLeaderboardEntries: LeaderboardEntry[];
  currentUserRank: number | null;
  formatLeaderboardName: (entry: { username?: string | null; userId: string }) => string;
  formatStatDuration: (seconds: number | null | undefined) => string;
};

export const LeaderboardScreen = ({
  leaderboardTab,
  onTabChange,
  onRefresh,
  leaderboardLoading,
  activeLeaderboardEntries,
  currentUserRank,
  formatLeaderboardName,
  formatStatDuration,
}: LeaderboardScreenProps) => (
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
        <div className="flex items-center justify-end">
          <button
            className="btn-3d btn-neutral rounded-md px-2 py-1 text-[10px] font-black uppercase"
            onClick={onRefresh}
            disabled={leaderboardLoading}
          >
            Refresh
          </button>
        </div>
        {leaderboardLoading && (
          <div className="app-surface rounded-lg border app-border px-3 py-3 text-center text-xs font-semibold app-text-muted">
            Loading leaderboard...
          </div>
        )}

        {!leaderboardLoading && activeLeaderboardEntries.length === 0 && (
          <div className="app-surface rounded-lg border app-border px-3 py-3 text-center text-xs font-semibold app-text-muted">
            No leaderboard entries yet.
          </div>
        )}

        {!leaderboardLoading && activeLeaderboardEntries.length > 0 && (
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

        {!leaderboardLoading && activeLeaderboardEntries.length > 0 && (
          <div className="space-y-1.5">
            {activeLeaderboardEntries.map((entry, index) => {
              const detail =
                leaderboardTab === 'daily'
                  ? formatStatDuration(isDailyEntry(entry) ? entry.solveSeconds ?? null : null)
                  : String(isAllTimeEntry(entry) ? entry.levelsCompleted ?? '--' : '--');
              return (
                <article
                  key={`leaderboard-${leaderboardTab}-${entry.userId}-${index}`}
                  className="app-surface grid grid-cols-[26px_34px_minmax(0,1fr)_70px_60px] items-center gap-2 rounded-lg border app-border px-2 py-1.5"
                >
                  <span className="app-text text-[11px] font-black">#{index + 1}</span>
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
                    {formatLeaderboardName(entry)}
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
