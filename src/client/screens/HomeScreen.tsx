import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  challengeTypeDisplayOrder,
  challengeTypeMetadata,
  challengeTypeSchema,
  type ChallengeType,
  type EndlessSort,
} from '../../shared/game';
import { tabButtonClass } from '../app/ui';
import type { ChallengeMetrics, DeviceTier, HomeTab } from '../app/types';
import { cn } from '../utils';

type HomeScreenProps = {
  deviceTier: DeviceTier;
  homeTab: HomeTab;
  onHomeTabSelect: (tab: HomeTab) => void;
  busy: boolean;
  formattedLevel: string;
  challengeMetrics: ChallengeMetrics;
  challengeTypeLabel: string;
  onPlay: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onPlayEndless: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  homePanelClass: string;
  endlessCatalogAvailable: boolean;
  endlessCategoryFilter: ChallengeType | null;
  onEndlessCategoryFilterChange: (category: ChallengeType | null) => void;
  endlessSort: EndlessSort;
  onEndlessSortChange: (sort: EndlessSort) => void;
  endlessCaughtUpMessage: string | null;
  onEndlessCaughtUpHome: () => void;
};

const parseEndlessCategoryFilter = (value: string): ChallengeType | null => {
  if (value === 'ANY') {
    return null;
  }
  const parsed = challengeTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const parseEndlessSort = (value: string): EndlessSort => {
  if (value === 'latest') {
    return 'latest';
  }
  if (value === 'oldest') {
    return 'oldest';
  }
  if (value === 'win_rate_desc') {
    return 'win_rate_desc';
  }
  if (value === 'win_rate_asc') {
    return 'win_rate_asc';
  }
  return 'random';
};

export const HomeScreen = ({
  deviceTier,
  homeTab,
  onHomeTabSelect,
  busy,
  formattedLevel,
  challengeMetrics,
  challengeTypeLabel,
  onPlay,
  onPlayEndless,
  homePanelClass,
  endlessCatalogAvailable,
  endlessCategoryFilter,
  onEndlessCategoryFilterChange,
  endlessSort,
  onEndlessSortChange,
  endlessCaughtUpMessage,
  onEndlessCaughtUpHome,
}: HomeScreenProps) => (
  <section className="flex min-h-0 flex-1 flex-col" data-testid="home-screen">
    <main className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <div className={cn(homePanelClass, 'home-panel-stack')}>
        <div className="flex items-center justify-center">
          <img
            src="/logo.png"
            alt="Decrypt"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className={`home-logo-image h-auto ${deviceTier === 'mobile' ? 'w-[148px]' : 'w-[190px]'}`}
          />
        </div>
        <section className="home-mode-strip panel-clear flex items-center justify-center gap-2">
          <button
            data-testid="home-mode-endless"
            className={cn(
              tabButtonClass(homeTab === 'endless'),
              'home-mode-btn relative w-[96px] px-1',
              homeTab === 'endless' ? 'home-mode-active' : ''
            )}
            type="button"
            onClick={() => onHomeTabSelect('endless')}
            disabled={busy && homeTab !== 'endless'}
          >
            Endless
          </button>
          <button
            data-testid="home-mode-daily"
            className={cn(
              tabButtonClass(homeTab === 'daily'),
              'home-mode-btn relative w-[96px] px-1',
              homeTab === 'daily' ? 'home-mode-active' : ''
            )}
            type="button"
            onClick={() => onHomeTabSelect('daily')}
            disabled={busy}
          >
            Daily
          </button>
        </section>
        {homeTab === 'daily' ? (
          <section
            className="home-stage-panel panel-clear rounded-xl px-4 py-4 text-center"
            data-testid="home-daily-panel"
          >
            <p className="app-text-muted mt-1 text-xs font-semibold uppercase">
              Daily Cipher #{formattedLevel}
            </p>
            <div className="app-text mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold uppercase">
              <div className="home-stat-card app-surface-subtle rounded-lg px-2 py-2">
                <div className="app-text-soft text-[9px]">Plays</div>
                <div>{challengeMetrics.plays.toLocaleString()}</div>
              </div>
              <div className="home-stat-card app-surface-subtle rounded-lg px-2 py-2">
                <div className="app-text-soft text-[9px]">Type</div>
                <div>{challengeTypeLabel}</div>
              </div>
              <div className="home-stat-card app-surface-subtle rounded-lg px-2 py-2">
                <div className="app-text-soft text-[9px]">Win</div>
                <div>{challengeMetrics.winRatePct}%</div>
              </div>
            </div>
            <button
              data-testid="home-play-button"
              className="btn-3d btn-primary mt-4 w-full rounded-xl px-4 py-3 text-lg font-black uppercase"
              onClick={onPlay}
              disabled={busy}
            >
              Play
            </button>
          </section>
        ) : (
          <section
            className="home-stage-panel panel-clear rounded-xl px-4 py-2"
            data-testid="home-endless-panel"
          >
            {endlessCatalogAvailable ? (
              <>
	                {endlessCaughtUpMessage && (
	                  <section
	                    className="app-surface-subtle app-border app-text rounded-xl border px-3 py-3 text-center"
	                    data-testid="home-endless-caught-up"
	                  >
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-white/35 bg-black/25">
                        <img
                          src="/ui_key.png"
                          alt=""
                          loading="eager"
                          className="ui-sprite h-8 w-8"
                        />
                      </div>
                      <p className="mt-2 text-[13px] font-black uppercase leading-snug">
                        All clear
                      </p>
                      <p className="app-text-muted mt-1 text-[11px] font-extrabold leading-snug">
                        {endlessCaughtUpMessage}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          className="btn-3d btn-primary rounded-xl px-3 py-2 text-[11px] font-black uppercase"
                          onClick={() => {
                            onEndlessCategoryFilterChange(null);
                            onEndlessSortChange('random');
                          }}
                        >
                          All Categories
                        </button>
                        <button
                          type="button"
                          className="btn-3d btn-home rounded-xl px-3 py-2 text-[11px] font-black uppercase"
                          onClick={onEndlessCaughtUpHome}
                        >
                          Daily
                        </button>
                      </div>
	                  </section>
	                )}
                <div className="grid gap-2">
                  <label className="app-text flex flex-col gap-1 text-[10px] font-black uppercase">
                    <span className="app-text-soft">Category</span>
                    <select
                      className="app-surface app-border app-text w-full rounded-lg border px-3 py-2 text-xs font-black uppercase"
                      value={endlessCategoryFilter ?? 'ANY'}
                      onChange={(event) => {
                        onEndlessCategoryFilterChange(
                          parseEndlessCategoryFilter(event.currentTarget.value)
                        );
                      }}
                      data-testid="home-endless-category-filter"
	                    >
	                      <option value="ANY">Any Category</option>
	                      {challengeTypeDisplayOrder.map((value) => (
	                        <option key={value} value={value}>
	                          {challengeTypeMetadata[value].label}
	                        </option>
	                      ))}
	                    </select>
                  </label>
                  <label className="app-text flex flex-col gap-1 text-[10px] font-black uppercase">
                    <span className="app-text-soft">Pick</span>
                    <select
                      className="app-surface app-border app-text w-full rounded-lg border px-3 py-2 text-xs font-black uppercase"
                      value={endlessSort}
                      onChange={(event) => {
                        onEndlessSortChange(parseEndlessSort(event.currentTarget.value));
                      }}
                      data-testid="home-endless-sort"
                    >
                      <option value="random">Random</option>
                      <option value="latest">Latest</option>
                      <option value="oldest">Oldest</option>
                      <option value="win_rate_desc">Win Rate High</option>
                      <option value="win_rate_asc">Win Rate Low</option>
                    </select>
                  </label>
                </div>
                <button
                  data-testid="home-play-endless-button"
                  className="btn-3d btn-primary mt-3 w-full rounded-xl px-4 py-3 text-lg font-black uppercase"
                  onClick={onPlayEndless}
                  disabled={busy}
                  type="button"
                >
                  Play
                </button>
              </>
            ) : (
              <div className="app-text-muted text-center text-xs font-bold uppercase">
                Community ciphers are waiting for approval.
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  </section>
);
