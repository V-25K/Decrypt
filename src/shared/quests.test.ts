import { describe, expect, it } from 'vitest';
import type { QuestProgress } from './game';
import {
  isQuestDefinitionComplete,
  questCatalogById,
  questProgressionGroups,
} from './quests';

const requireQuest = (id: string) => {
  const quest = questCatalogById[id];
  if (!quest) {
    throw new Error(`Missing quest definition for ${id}`);
  }
  return quest;
};

const baseProgress = (): QuestProgress => ({
  dailyPlayCount: 0,
  dailyFastWin: false,
  dailyUnder5Min: false,
  dailyNoPowerup: false,
  dailyNoMistake: false,
  dailyShareCount: 0,
  socialShareCount: 0,
  lifetimeWordsmith: 0,
  lifetimeLogicalSolved: 0,
  lifetimeFlawless: 0,
  lifetimeCoinsSpent: 0,
  lifetimePurchases: 0,
  lifetimeDailyTopRanks: 0,
  lifetimeEndlessClears: 0,
});

describe('quest catalog', () => {
  it('keeps progression groups ordered by increasing target', () => {
    for (const group of Object.values(questProgressionGroups)) {
      const targets = group.map((questId) => questCatalogById[questId]?.target ?? -1);
      expect(targets).toEqual([...targets].sort((left, right) => left - right));
    }
  });

  it('evaluates binary daily quests from shared quest definitions', () => {
    const progress = baseProgress();
    progress.dailyNoMistake = true;

    expect(
      isQuestDefinitionComplete(requireQuest('daily_no_mistake'), progress)
    ).toBe(true);
    expect(
      isQuestDefinitionComplete(requireQuest('daily_under_5min'), progress)
    ).toBe(false);
  });

  it('evaluates milestone quests from the shared reward catalog', () => {
    const progress = baseProgress();
    progress.lifetimeCoinsSpent = 10000;

    expect(
      isQuestDefinitionComplete(requireQuest('milestone_spent_500'), progress)
    ).toBe(true);
    expect(
      isQuestDefinitionComplete(requireQuest('milestone_spent_50000'), progress)
    ).toBe(false);
    const milestoneReward = requireQuest('milestone_spent_10000').reward;
    expect(milestoneReward.coins).toBe(300);
    expect(milestoneReward.flair).toBe('Treasure Room');
  });
});
