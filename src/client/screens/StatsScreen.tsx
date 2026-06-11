import type { CSSProperties } from 'react';
import { questCatalog } from '../../shared/quests';
import type { StatsCard } from '../app/stats-view';
import { tabButtonClass } from '../app/ui';
import type { Profile, StatsTab } from '../app/types';
import { cn } from '../utils';

type StatsScreenProps = {
  statsTab: StatsTab;
  onTabChange: (tab: StatsTab) => void;
  heroCards: StatsCard[];
  visibleStatsCards: StatsCard[];
  profile: Profile;
  unlockedFlairs: string[];
  equippedFlairStyle: CSSProperties | undefined;
  flairChipStyle: (flair: string, active: boolean) => CSSProperties | undefined;
  flairSaveBusy: boolean;
  onSetActiveFlair: (flair: string) => void;
};

// Every flair the quest catalog can award, in catalog order, with the quest
// that unlocks it — so the locker can show what's still out there to earn.
const catalogFlairEntries = questCatalog.flatMap((quest) =>
  quest.reward.flair
    ? [{ flair: quest.reward.flair, questTitle: quest.title }]
    : []
);
const catalogFlairNames = new Set(
  catalogFlairEntries.map((entry) => entry.flair)
);

export const StatsScreen = ({
  statsTab,
  onTabChange,
  heroCards,
  visibleStatsCards,
  profile,
  unlockedFlairs,
  equippedFlairStyle,
  flairChipStyle,
  flairSaveBusy,
  onSetActiveFlair,
}: StatsScreenProps) => {
  const unlockedSet = new Set(unlockedFlairs);
  // Flairs granted outside quests (e.g. Puzzle Maker from an approved
  // challenge) still belong in the locker.
  const extraUnlocked = unlockedFlairs.filter(
    (flair) => !catalogFlairNames.has(flair)
  );
  // Unlocked flairs always lead, regardless of catalog position; the
  // still-locked goals trail behind them.
  const unlockedFlairNames = [
    ...extraUnlocked,
    ...catalogFlairEntries
      .filter((entry) => unlockedSet.has(entry.flair))
      .map((entry) => entry.flair),
  ];
  const lockedEntries = catalogFlairEntries.filter(
    (entry) => !unlockedSet.has(entry.flair)
  );
  const unlockedCount = unlockedFlairNames.length;
  const totalCount = catalogFlairEntries.length + extraUnlocked.length;

  return (
    <section className="hub-screen app-surface flex min-h-0 flex-1 flex-col" data-testid="stats-screen">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <section className="hub-header-panel panel-clear mb-3 rounded-xl px-4 py-3">
          <h2 className="app-text text-center text-base font-black uppercase tracking-[0.04em]">
            Stats
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className={tabButtonClass(statsTab === 'overall')}
              onClick={() => onTabChange('overall')}
            >
              Stats
            </button>
            <button
              className={tabButtonClass(statsTab === 'flairs')}
              onClick={() => onTabChange('flairs')}
            >
              Flairs
            </button>
          </div>
        </section>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {statsTab === 'overall' && (
            <>
              <section
                className="hub-card app-surface rounded-xl border app-border px-3 py-3"
                data-testid="stats-hero"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="app-text text-xs font-black uppercase tracking-[0.03em]">
                    At a Glance
                  </h3>
                  {profile.activeFlair && (
                    <span
                      className="inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black"
                      style={equippedFlairStyle}
                    >
                      {profile.activeFlair}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {heroCards.map((card) => (
                    <div
                      key={card.label}
                      className="hub-subpanel app-surface-subtle rounded-lg border app-border px-2 py-2 text-center"
                    >
                      <div className="app-text text-lg font-black leading-none tabular-nums">
                        {card.value}
                      </div>
                      <div className="app-text-muted mt-1 text-[9px] font-black uppercase tracking-[0.03em]">
                        {card.label}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="grid grid-cols-2 gap-2">
                {visibleStatsCards.map((card) => (
                  <article
                    key={card.label}
                    className="hub-card hub-stat-card rounded-xl border app-border px-3 py-2.5"
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
            </>
          )}
          {statsTab === 'flairs' && (
            <section className="hub-card app-surface rounded-xl border app-border px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="app-text text-sm font-black uppercase tracking-[0.03em]">
                    Flair Locker
                  </h3>
                  <p className="app-text-muted mt-1 text-[11px] font-semibold">
                    {unlockedCount}/{totalCount} unlocked. Earn the rest through
                    quests.
                  </p>
                </div>
                <div className="hub-subpanel app-surface-subtle rounded-lg border app-border px-2 py-1 text-right">
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
                  className={tabButtonClass(!profile.activeFlair)}
                  onClick={() => onSetActiveFlair('')}
                  disabled={flairSaveBusy}
                  data-testid="flair-option-none"
                >
                  No Flair
                </button>
                {unlockedFlairNames.map((flair) => (
                  <button
                    key={flair}
                    className={cn(
                      'btn-3d btn-flair-chip rounded-lg border px-2 py-1 text-xs font-black uppercase',
                      profile.activeFlair === flair ? 'btn-pressed' : ''
                    )}
                    onClick={() => onSetActiveFlair(flair)}
                    disabled={flairSaveBusy}
                    style={flairChipStyle(flair, profile.activeFlair === flair)}
                    data-testid={`flair-option-${flair.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
                  >
                    {profile.activeFlair === flair ? `✓ ${flair}` : flair}
                  </button>
                ))}
                {lockedEntries.map((entry) => (
                  <div
                    key={entry.flair}
                    className="app-border rounded-lg border border-dashed px-2 py-1 text-center opacity-60"
                    title={`Unlock via "${entry.questTitle}"`}
                  >
                    <div className="app-text-muted text-xs font-black uppercase">
                      🔒 {entry.flair}
                    </div>
                    <div className="app-text-soft text-[9px] font-semibold">
                      {entry.questTitle}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </section>
  );
};
