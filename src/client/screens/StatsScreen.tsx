import type { CSSProperties } from 'react';
import { tabButtonClass } from '../app/ui';
import type { Profile, StatsTab } from '../app/types';
import { cn } from '../utils';

type StatsCard = {
  label: string;
  value: string;
};

type StatsScreenProps = {
  statsTab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  visibleStatsCards: StatsCard[];
  profile: Profile;
  unlockedFlairs: string[];
  equippedFlairStyle: CSSProperties | undefined;
  flairChipStyle: (flair: string, active: boolean) => CSSProperties | undefined;
  flairSaveBusy: boolean;
  onSetActiveFlair: (flair: string) => void;
};

export const StatsScreen = ({
  statsTab,
  onTabChange,
  visibleStatsCards,
  profile,
  unlockedFlairs,
  equippedFlairStyle,
  flairChipStyle,
  flairSaveBusy,
  onSetActiveFlair,
}: StatsScreenProps) => (
  <section className="app-surface flex min-h-0 flex-1 flex-col" data-testid="stats-screen">
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
      <section className="app-surface-strong mb-3 rounded-xl border app-border px-4 py-3">
        <h2 className="app-text text-center text-base font-black uppercase tracking-[0.04em]">
          Stats
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className={tabButtonClass(statsTab === 'daily')} onClick={() => onTabChange('daily')}>
            Daily
          </button>
          <button className={tabButtonClass(statsTab === 'endless')} onClick={() => onTabChange('endless')}>
            Endless
          </button>
        </div>
      </section>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <section className="grid grid-cols-2 gap-2">
          {visibleStatsCards.map((card) => (
            <article
              key={card.label}
              className="app-surface rounded-xl border app-border px-3 py-2.5"
            >
              <div className="app-text-muted text-[10px] font-black uppercase tracking-[0.03em]">
                {card.label}
              </div>
              <div className="app-text mt-1 text-lg font-black leading-none">
                {card.value}
              </div>
            </article>
          ))}
        </section>
        <section className="app-surface rounded-xl border app-border px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="app-text text-sm font-black uppercase tracking-[0.03em]">
                Flair Locker
              </h3>
              <p className="app-text-muted mt-1 text-[11px] font-semibold">
                Quest flairs unlock here. Equip any unlocked flair whenever you want.
              </p>
            </div>
            <div className="app-surface-subtle rounded-lg border app-border px-2 py-1 text-right">
              <div className="app-text-muted text-[9px] font-black uppercase">Equipped</div>
              {profile.activeFlair ? (
                <div
                  className="mt-1 inline-flex rounded-md border px-2 py-1 text-[11px] font-black"
                  style={equippedFlairStyle}
                >
                  {profile.activeFlair}
                </div>
              ) : (
                <div className="app-text-muted mt-0.5 text-[11px] font-black">
                  None
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className={tabButtonClass(profile.activeFlair.length === 0)}
              onClick={() => onSetActiveFlair('')}
              disabled={flairSaveBusy}
              data-testid="flair-option-none"
            >
              No Flair
            </button>
            {unlockedFlairs.map((flair) => (
              <button
                key={flair}
                className={cn(
                  'btn-3d rounded-lg border px-2 py-1 text-xs font-black uppercase',
                  profile.activeFlair === flair ? 'btn-pressed' : ''
                )}
                onClick={() => onSetActiveFlair(flair)}
                disabled={flairSaveBusy}
                style={flairChipStyle(flair, profile.activeFlair === flair)}
                data-testid={`flair-option-${flair.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
              >
                {flair}
              </button>
            ))}
          </div>
          {unlockedFlairs.length === 0 && (
            <div className="app-text-muted mt-3 text-center text-[11px] font-semibold">
              No flairs unlocked yet.
            </div>
          )}
        </section>
      </div>
    </main>
  </section>
);
