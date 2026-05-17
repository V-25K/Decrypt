import {
  getQuestProgressValue,
  type QuestDefinition,
} from '../../shared/quests';
import {
  getVisibleMilestoneIds,
  groupedQuestIds,
  isQuestHidden,
  questCards,
} from './game-formatters';
import type { QuestStatus } from './types';

export type QuestVisibilityView = {
  claimedQuestIdSet: Set<string>;
  hasClaimableQuest: boolean;
  visibleDailyQuests: QuestDefinition[];
  visibleMilestoneIds: Set<string>;
  visibleMilestoneQuests: QuestDefinition[];
};

export const getQuestVisibilityView = (
  questStatus: QuestStatus | null,
  allQuestCards: readonly QuestDefinition[] = questCards
): QuestVisibilityView => {
  const claimedQuestIdSet = new Set(questStatus?.claimedQuestIds ?? []);
  if (questStatus?.progress == null) {
    return {
      claimedQuestIdSet,
      hasClaimableQuest: false,
      visibleDailyQuests: [],
      visibleMilestoneIds: new Set<string>(),
      visibleMilestoneQuests: [],
    };
  }

  const visibleDailyQuests = allQuestCards.filter(
    (quest) =>
      quest.category === 'daily' &&
      !isQuestHidden(quest, questStatus.progress, claimedQuestIdSet)
  );
  const visibleMilestoneIds = getVisibleMilestoneIds(
    questStatus.progress,
    claimedQuestIdSet
  );
  const visibleMilestoneQuests = allQuestCards.filter(
    (quest) =>
      quest.category === 'milestone' &&
      !isQuestHidden(quest, questStatus.progress, claimedQuestIdSet) &&
      (!groupedQuestIds.has(quest.id) || visibleMilestoneIds.has(quest.id))
  );
  const hasClaimableQuest = allQuestCards.some((quest) => {
    const current = getQuestProgressValue(quest, questStatus.progress);
    return current >= quest.target && !claimedQuestIdSet.has(quest.id);
  });

  return {
    claimedQuestIdSet,
    hasClaimableQuest,
    visibleDailyQuests,
    visibleMilestoneIds,
    visibleMilestoneQuests,
  };
};
