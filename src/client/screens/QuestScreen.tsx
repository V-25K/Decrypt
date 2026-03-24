import type { CSSProperties } from 'react';
import type { QuestDefinition, QuestReward } from '../../shared/quests';
import { tabButtonClass } from '../app/ui';
import type { QuestProgress, QuestStatus } from '../app/types';
import { cn } from '../utils';

type QuestScreenProps = {
  questTab: 'daily' | 'milestone';
  onTabChange: (tab: 'daily' | 'milestone') => void;
  questLoading: boolean;
  questStatus: QuestStatus | null;
  questError: string | null;
  onRetry: () => void;
  visibleDailyQuests: QuestDefinition[];
  questCards: QuestDefinition[];
  visibleMilestoneIds: Set<string>;
  groupedQuestIds: Set<string>;
  claimedQuestIdSet: Set<string>;
  claimingQuestId: string | null;
  onClaimQuest: (questId: string) => void;
  formatQuestReward: (reward: QuestReward) => { reward: string; flair: string | null };
  flairTagStyle: (flair: string) => CSSProperties | undefined;
  getQuestProgressValue: (quest: QuestDefinition, progress: QuestProgress) => number;
  isQuestHidden: (
    quest: QuestDefinition,
    progress: QuestProgress,
    claimedSet: Set<string>
  ) => boolean;
};

export const QuestScreen = ({
  questTab,
  onTabChange,
  questLoading,
  questStatus,
  questError,
  onRetry,
  visibleDailyQuests,
  questCards,
  visibleMilestoneIds,
  groupedQuestIds,
  claimedQuestIdSet,
  claimingQuestId,
  onClaimQuest,
  formatQuestReward,
  flairTagStyle,
  getQuestProgressValue,
  isQuestHidden,
}: QuestScreenProps) => (
  <section className="app-surface flex min-h-0 flex-1 flex-col" data-testid="quest-screen">
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
      <section className="app-surface-strong mb-3 rounded-xl border app-border px-4 py-3 text-center">
        <h2 className="app-text text-base font-black uppercase tracking-[0.04em]">Quests</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className={tabButtonClass(questTab === 'daily')} onClick={() => onTabChange('daily')}>
            Daily
          </button>
          <button
            className={tabButtonClass(questTab === 'milestone')}
            onClick={() => onTabChange('milestone')}
          >
            Milestone
          </button>
        </div>
      </section>
      <div className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto pr-1">
        {questLoading && (
          <div className="app-surface rounded-lg border app-border p-3 text-center text-xs font-semibold app-text-muted">
            Loading quests...
          </div>
        )}
        {!questLoading && !questStatus && (
          <div className="app-surface rounded-lg border app-border p-3 text-center text-xs font-semibold app-text-muted">
            <div>{questError ?? 'Unable to load quests.'}</div>
            <button
              className="btn-3d btn-neutral mt-2 px-3 py-1 text-[11px] font-bold uppercase"
              onClick={onRetry}
            >
              Retry
            </button>
          </div>
        )}
        {questStatus && (
          <>
            {questTab === 'daily' && (
              <section className="space-y-2">
                {visibleDailyQuests.length === 0 && (
                  <div className="app-surface rounded-lg border app-border p-3 text-center text-xs font-semibold app-text-muted">
                    All daily quests claimed. Come back tomorrow for a fresh set.
                  </div>
                )}
                {visibleDailyQuests.map((quest) => {
                  const current = getQuestProgressValue(quest, questStatus.progress);
                  const completed = current >= quest.target;
                  const claimed = claimedQuestIdSet.has(quest.id);
                  const isClaiming = claimingQuestId === quest.id;
                  const claimable = completed && !claimed && !isClaiming;
                  const rewardParts = formatQuestReward(quest.reward);
                  return (
                    <article
                      key={quest.id}
                      onClick={claimable ? () => onClaimQuest(quest.id) : undefined}
                      className={cn(
                        'app-surface w-full max-w-full rounded-xl border app-border px-3 py-3',
                        completed ? 'quest-complete' : '',
                        claimable ? 'quest-claimable' : '',
                        isClaiming ? 'opacity-60' : ''
                      )}
                    >
                      <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.3fr)] items-center gap-3">
                        <div className="min-w-0">
                          <h4 className="app-text text-sm font-black">{quest.title}</h4>
                          <p className="app-text-muted text-[11px] font-semibold break-words">
                            {quest.description}
                          </p>
                        </div>
                        <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-center">
                          <span className="app-text text-[11px] font-black uppercase">
                            {rewardParts.reward}
                          </span>
                          {rewardParts.flair && (
                            <span
                              className="quest-flair inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                              style={flairTagStyle(rewardParts.flair)}
                            >
                              {rewardParts.flair}
                            </span>
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col items-end gap-1.5">
                          <span className="app-text text-[11px] font-black uppercase">
                            {Math.min(current, quest.target)}/{quest.target}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
            {questTab === 'milestone' && (
              <section className="space-y-2">
                {questCards
                  .filter(
                    (quest) =>
                      quest.category === 'milestone' &&
                      !isQuestHidden(quest, questStatus.progress, claimedQuestIdSet) &&
                      (!groupedQuestIds.has(quest.id) || visibleMilestoneIds.has(quest.id))
                  )
                  .map((quest) => {
                    const current = getQuestProgressValue(quest, questStatus.progress);
                    const completed = current >= quest.target;
                    const claimed = claimedQuestIdSet.has(quest.id);
                    const isClaiming = claimingQuestId === quest.id;
                    const claimable = completed && !claimed && !isClaiming;
                    const rewardParts = formatQuestReward(quest.reward);
                    return (
                      <article
                        key={quest.id}
                        onClick={claimable ? () => onClaimQuest(quest.id) : undefined}
                        className={cn(
                          'app-surface w-full max-w-full rounded-xl border app-border px-3 py-3',
                          completed ? 'quest-complete' : '',
                          claimable ? 'quest-claimable' : '',
                          isClaiming ? 'opacity-60' : ''
                        )}
                      >
                        <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.3fr)] items-center gap-3">
                          <div className="min-w-0">
                            <h4 className="app-text text-sm font-black">{quest.title}</h4>
                            <p className="app-text-muted text-[11px] font-semibold break-words">
                              {quest.description}
                            </p>
                          </div>
                          <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-center">
                            <span className="app-text text-[11px] font-black uppercase">
                              {rewardParts.reward}
                            </span>
                            {rewardParts.flair && (
                              <span
                                className="quest-flair inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                                style={flairTagStyle(rewardParts.flair)}
                              >
                                {rewardParts.flair}
                              </span>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col items-end gap-1.5">
                            <span className="app-text text-[11px] font-black uppercase">
                              {Math.min(current, quest.target)}/{quest.target}
                            </span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  </section>
);
