import { showToast } from '@devvit/web/client';
import { endlessPreviewLevels } from '../app/constants';
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
  onPlay: () => void;
  onPlayEndless: () => void;
  homePanelClass: string;
  endlessCatalogAvailable: boolean;
  endlessPublishedLevelCount: number;
  endlessActiveCatalogVersion: string | null;
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
  endlessPublishedLevelCount,
  endlessActiveCatalogVersion,
}: HomeScreenProps) => (
  <section className="flex min-h-0 flex-1 flex-col" data-testid="home-screen">
    <main className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <div className={homePanelClass}>
        <div className="flex items-center justify-center">
          <img
            src="/logo.png"
            alt="Decrypt"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className={`h-auto ${deviceTier === 'mobile' ? 'w-[148px]' : 'w-[190px]'}`}
          />
        </div>
        <section className="flex items-center justify-center gap-2">
          <button
            data-testid="home-mode-endless"
            className={cn(
              tabButtonClass(homeTab === 'endless'),
              'home-mode-btn w-[96px] px-1',
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
              'home-mode-btn w-[96px] px-1',
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
            className="app-surface rounded-xl border app-border px-4 py-4 text-center"
            data-testid="home-daily-panel"
          >
            <p className="app-text-muted mt-1 text-xs font-semibold uppercase">
              Daily Cipher #{formattedLevel}
            </p>
            <div className="app-text mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold uppercase">
              <div className="app-surface-subtle rounded-lg px-2 py-2">
                <div className="app-text-soft text-[9px]">Plays</div>
                <div>{challengeMetrics.plays.toLocaleString()}</div>
              </div>
              <div className="app-surface-subtle rounded-lg px-2 py-2">
                <div className="app-text-soft text-[9px]">Type</div>
                <div>{challengeTypeLabel}</div>
              </div>
              <div className="app-surface-subtle rounded-lg px-2 py-2">
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
            className="app-surface rounded-xl border app-border px-4 py-4"
            data-testid="home-endless-panel"
          >
            <div className="app-text flex items-center justify-between text-xs font-black uppercase">
              <span>Endless Levels</span>
              <span className="app-text-muted text-[10px]">
                {endlessCatalogAvailable
                  ? endlessActiveCatalogVersion ?? 'Ready'
                  : 'Coming Soon'}
              </span>
            </div>
            {endlessCatalogAvailable ? (
              <>
                <div className="app-text mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold uppercase">
                  <div className="app-surface-subtle rounded-lg px-2 py-2">
                    <div className="app-text-soft text-[9px]">Levels</div>
                    <div>{endlessPublishedLevelCount.toLocaleString()}</div>
                  </div>
                  <div className="app-surface-subtle rounded-lg px-2 py-2">
                    <div className="app-text-soft text-[9px]">Catalog</div>
                    <div>{endlessActiveCatalogVersion ?? 'Live'}</div>
                  </div>
                  <div className="app-surface-subtle rounded-lg px-2 py-2">
                    <div className="app-text-soft text-[9px]">Mode</div>
                    <div>Static</div>
                  </div>
                </div>
                <button
                  data-testid="home-play-endless-button"
                  className="btn-3d btn-primary mt-4 w-full rounded-xl px-4 py-3 text-lg font-black uppercase"
                  onClick={onPlayEndless}
                  disabled={busy}
                  type="button"
                >
                  Play Endless
                </button>
              </>
            ) : (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {endlessPreviewLevels.map((levelNumber) => (
                  <button
                    key={`home-endless-level-${levelNumber}`}
                    data-testid={`home-endless-level-${levelNumber}`}
                    className="btn-3d btn-neutral rounded-lg px-2 py-2 text-center"
                    onClick={() => showToast('Endless mode is coming soon.')}
                    type="button"
                  >
                    <div className="app-text text-[11px] font-black uppercase">
                      Lv {String(levelNumber).padStart(2, '0')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  </section>
);
