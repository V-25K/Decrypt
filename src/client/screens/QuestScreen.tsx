import { memo, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { QuestDefinition, QuestReward } from '../../shared/quests';
import type { QuestRewardDisplayItem } from '../app/game-formatters';
import { tabButtonClass } from '../app/ui';
import { CreatorAcclaimInfo } from '../components/CreatorAcclaimInfo';
import { ErrorCard } from '../components/ErrorCard';
import { HudSprite } from '../components/HudSprite';
import { PowerupSprite } from '../components/PowerupSprite';
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
  visibleMilestoneQuests: QuestDefinition[];
  claimedQuestIdSet: Set<string>;
  claimingQuestId: string | null;
  onClaimQuest: (questId: string) => void;
  formatQuestReward: (reward: QuestReward) => {
    items: QuestRewardDisplayItem[];
    flair: string | null;
  };
  flairTagStyle: (flair: string) => CSSProperties | undefined;
  getQuestProgressValue: (quest: QuestDefinition, progress: QuestProgress) => number;
};

type QuestCardProps = {
  quest: QuestDefinition;
  progress: QuestProgress;
  claimedQuestIdSet: Set<string>;
  claimingQuestId: string | null;
  onClaimQuest: (questId: string) => void;
  formatQuestReward: (reward: QuestReward) => {
    items: QuestRewardDisplayItem[];
    flair: string | null;
  };
  flairTagStyle: (flair: string) => CSSProperties | undefined;
  getQuestProgressValue: (quest: QuestDefinition, progress: QuestProgress) => number;
  claimPercent?: number;
  infoSlot?: ReactNode;
};

const QuestCard = memo(({
  quest,
  progress,
  claimedQuestIdSet,
  claimingQuestId,
  onClaimQuest,
  formatQuestReward,
  flairTagStyle,
  getQuestProgressValue,
  claimPercent,
  infoSlot,
}: QuestCardProps) => {
  const current = getQuestProgressValue(quest, progress);
  const completed = current >= quest.target;
  const claimed = claimedQuestIdSet.has(quest.id);
  const isClaiming = claimingQuestId === quest.id;
  const claimable = completed && !claimed && !isClaiming;
  const rewardParts = formatQuestReward(quest.reward);
  const progressRatio =
    quest.target > 0 ? Math.min(1, current / quest.target) : 0;
  const handleKeyDown = claimable
    ? (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClaimQuest(quest.id);
        }
      }
    : undefined;

  return (
    <article
      onClick={claimable ? () => onClaimQuest(quest.id) : undefined}
      role={claimable ? 'button' : 'article'}
      tabIndex={claimable ? 0 : -1}
      aria-disabled={!claimable}
      onKeyDown={handleKeyDown}
      className={cn(
        'hub-card w-full max-w-full rounded-xl border app-border px-3 py-3',
        completed ? 'quest-complete' : '',
        claimable ? 'quest-claimable cursor-pointer' : 'cursor-default',
        isClaiming ? 'opacity-60' : ''
      )}
    >
      <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,0.55fr)] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="app-text text-sm font-black">{quest.title}</h4>
            {infoSlot}
          </div>
          <p className="app-text-muted text-[11px] font-semibold break-words">
            {quest.description}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-center gap-1 text-center">
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-1">
            {rewardParts.items.map((item) => renderRewardItem(item))}
          </div>
          {rewardParts.flair && (
            <span
              className="quest-flair inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
              style={flairTagStyle(rewardParts.flair)}
            >
              {rewardParts.flair}
            </span>
          )}
        </div>
      </div>
      {/* Binary quests only show a state once they're done — an idle label
          adds nothing. Counter quests always show the bar. */}
      {(!quest.binary || completed) && (
        <div className="mt-2.5 flex items-center gap-2">
          {quest.binary ? (
            <span className="app-text text-[11px] font-black uppercase">
              ✓ Done
            </span>
          ) : (
            <>
              <div
                className="quest-progress-track h-2 min-w-0 flex-1 overflow-hidden rounded-full"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={quest.target}
                aria-valuenow={Math.min(current, quest.target)}
              >
                <div
                  className="quest-progress-fill h-full rounded-full"
                  style={{ width: `${Math.round(progressRatio * 100)}%` }}
                />
              </div>
              <span className="app-text shrink-0 text-[11px] font-black uppercase tabular-nums">
                {Math.min(current, quest.target)}/{quest.target}
              </span>
            </>
          )}
        </div>
      )}
      {quest.category === 'milestone' && typeof claimPercent === 'number' && (
        <p className="app-text-muted mt-1 text-[10px] font-semibold">
          Achieved by {claimPercent}% of players
        </p>
      )}
    </article>
  );
});

QuestCard.displayName = 'QuestCard';

export const QuestScreen = ({
  questTab,
  onTabChange,
  questLoading,
  questStatus,
  questError,
  onRetry,
  visibleDailyQuests,
  visibleMilestoneQuests,
  claimedQuestIdSet,
  claimingQuestId,
  onClaimQuest,
  formatQuestReward,
  flairTagStyle,
  getQuestProgressValue,
}: QuestScreenProps) => (
  <section className="hub-screen app-surface flex min-h-0 flex-1 flex-col" data-testid="quest-screen">
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3">
      <section className="hub-header-panel panel-clear mb-3 rounded-xl px-4 py-3 text-center">
        <h2 className="app-text text-base font-black uppercase tracking-[0.04em]">Quests</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className={tabButtonClass(questTab === 'daily')}
            onClick={() => onTabChange('daily')}
          >
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
          <div className="hub-card app-surface rounded-lg border app-border p-3 text-center text-xs font-semibold app-text-muted">
            Loading quests...
          </div>
        )}
        {!questLoading && !questStatus && (
          <ErrorCard error={questError ?? 'Unable to load quests.'} onRetry={onRetry} />
        )}
        {questStatus && (
          <>
            {questTab === 'daily' && (
              <section className="space-y-2">
                {visibleDailyQuests.length === 0 && (
                  <div className="hub-card app-surface rounded-lg border app-border p-6 text-center">
                    <p className="app-text text-sm font-black uppercase">Daily Quests Cleared</p>
                    <p className="app-text-muted mt-1 text-xs font-semibold">
                      Fresh rewards arrive with tomorrow's cipher.
                    </p>
                  </div>
                )}
                {visibleDailyQuests.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    progress={questStatus.progress}
                    claimedQuestIdSet={claimedQuestIdSet}
                    claimingQuestId={claimingQuestId}
                    onClaimQuest={onClaimQuest}
                    formatQuestReward={formatQuestReward}
                    flairTagStyle={flairTagStyle}
                    getQuestProgressValue={getQuestProgressValue}
                  />
                ))}
              </section>
            )}
            {questTab === 'milestone' && (
              <section className="space-y-2">
                {visibleMilestoneQuests.map((quest) => (
                  <QuestCard
                    key={quest.id}
                    quest={quest}
                    progress={questStatus.progress}
                    claimedQuestIdSet={claimedQuestIdSet}
                    claimingQuestId={claimingQuestId}
                    onClaimQuest={onClaimQuest}
                    formatQuestReward={formatQuestReward}
                    flairTagStyle={flairTagStyle}
                    getQuestProgressValue={getQuestProgressValue}
                    {...(questStatus.milestoneClaimPercents?.[quest.id] !==
                    undefined
                      ? {
                          claimPercent:
                            questStatus.milestoneClaimPercents[quest.id],
                        }
                      : {})}
                    {...(quest.groupKey === 'creator'
                      ? { infoSlot: <CreatorAcclaimInfo /> }
                      : {})}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  </section>
);

const renderRewardItem = (item: QuestRewardDisplayItem) => (
  <span
    key={`${item.kind}-${item.key}`}
    data-testid={`quest-reward-item-${item.key}`}
    role="img"
    aria-label={
      item.kind === 'coins'
        ? `${item.count} coins reward`
        : `${item.count} ${item.powerup} powerup reward`
    }
    className="hub-subpanel app-surface-subtle inline-flex items-center gap-1 rounded-full border app-border px-2 py-1 text-[10px] font-black"
    title={item.kind === 'coins' ? `${item.count} coins` : `${item.count} ${item.powerup}`}
  >
    {item.kind === 'coins' ? (
      <HudSprite icon="coin" decorative className="h-[14px] w-[14px]" />
    ) : (
      <PowerupSprite
        powerup={item.powerup}
        decorative
        testId={`quest-reward-icon-${item.powerup}`}
        className="h-[14px] w-[14px]"
      />
    )}
    <span>x{item.count}</span>
  </span>
);
