import type { QuestDefinition } from '../../shared/quests';
import {
  getVisibleMilestoneIds,
  groupedQuestIds,
  isQuestHidden,
  questCards,
} from './game-formatters';
import type { QuestStatus } from './types';

export type QuestVisibilityView = {
  claimedQuestIdSet: Set<string>;
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

  return {
    claimedQuestIdSet,
    visibleDailyQuests,
    visibleMilestoneIds,
    visibleMilestoneQuests,
  };
};
