import type { MouseEvent as ReactMouseEvent } from 'react';
import { navigateTo } from '@devvit/web/client';
import {
  challengeTypeDisplayOrder,
  challengeTypeMetadata,
  challengeTypeSchema,
  type ChallengeType,
  type EndlessSort,
} from '../../shared/game';
import { tabButtonClass } from '../app/ui';
import { PRIVACY_URL, TERMS_URL } from '../app/constants';
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
  dailyCaughtUpMessage: string | null;
  onDailyCaughtUpEndless: () => void;
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
  dailyCaughtUpMessage,
  onDailyCaughtUpEndless,
}: HomeScreenProps) => (
  <section className="relative flex min-h-0 flex-1 flex-col" data-testid="home-screen">
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
      <footer className="mt-auto flex items-center justify-center gap-3 pt-3 text-[10px] font-bold uppercase tracking-wide">
        <button
          type="button"
          className="app-text-muted underline-offset-2 hover:underline"
          onClick={() => navigateTo(TERMS_URL)}
          data-testid="home-terms-link"
        >
          Terms
        </button>
        <span className="app-text-soft" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          className="app-text-muted underline-offset-2 hover:underline"
          onClick={() => navigateTo(PRIVACY_URL)}
          data-testid="home-privacy-link"
        >
          Privacy
        </button>
      </footer>
    </main>
    {/* Caught-up notice floats OVER the home content (Bug #9) instead of sitting
        in-flow and pushing the logo/stats/Play down. The bottom nav stays
        reachable below this overlay, and the card's actions move the player on. */}
    {((homeTab === 'daily' && dailyCaughtUpMessage) ||
      (homeTab === 'endless' && endlessCatalogAvailable && endlessCaughtUpMessage)) && (
      <div
        className="absolute inset-0 z-30 flex items-center justify-center px-5"
        data-testid={
          homeTab === 'daily' ? 'home-daily-caught-up' : 'home-endless-caught-up'
        }
      >
        <div
          className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          aria-hidden="true"
        />
        <section className="app-surface-strong app-border app-text relative z-[1] w-full max-w-[320px] overflow-hidden rounded-3xl border px-5 py-7 text-center shadow-[0_26px_60px_rgba(0,0,0,0.55)]">
          <div
            className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-[radial-gradient(circle_at_center,rgba(255,122,48,0.22),transparent_70%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/30 bg-black/30">
            <img src="/ui_key.png" alt="" loading="eager" className="ui-sprite h-10 w-10" />
          </div>
          <p className="relative mt-3 text-[10px] font-black uppercase tracking-[0.28em] text-[rgba(255,150,90,0.92)]">
            All clear
          </p>
          <h3 className="relative mt-1.5 text-[20px] font-black uppercase leading-tight">
            {"You're all caught up"}
          </h3>
          <p className="app-text-muted relative mx-auto mt-2 max-w-[260px] text-[12px] font-semibold leading-relaxed">
            {homeTab === 'daily' ? dailyCaughtUpMessage : endlessCaughtUpMessage}
          </p>
          {homeTab === 'daily' ? (
            <button
              type="button"
              className="btn-3d btn-primary relative mt-5 w-full rounded-xl px-3 py-2.5 text-[12px] font-black uppercase tracking-[0.04em]"
              onClick={onDailyCaughtUpEndless}
              data-testid="home-daily-caught-up-endless"
            >
              Try Endless
            </button>
          ) : (
            <div className="relative mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn-3d btn-primary rounded-xl px-3 py-2.5 text-[12px] font-black uppercase tracking-[0.04em]"
                onClick={() => {
                  onEndlessCategoryFilterChange(null);
                  onEndlessSortChange('random');
                }}
              >
                All Categories
              </button>
              <button
                type="button"
                className="btn-3d btn-home rounded-xl px-3 py-2.5 text-[12px] font-black uppercase tracking-[0.04em]"
                onClick={onEndlessCaughtUpHome}
              >
                Daily
              </button>
            </div>
          )}
        </section>
      </div>
    )}
  </section>
);
