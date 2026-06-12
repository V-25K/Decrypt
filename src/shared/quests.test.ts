import { describe, expect, it } from 'vitest';
import type { QuestProgress } from './game';
import {
  isQuestDefinitionComplete,
  questCatalog,
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
  it('grants each flair from exactly one quest', () => {
    // Duplicate flair names merge two quests' rewards into one locker entry
    // (and a duplicate React key in the flair locker grid).
    const flairs = questCatalog
      .map((quest) => quest.reward.flair)
      .filter((flair): flair is string => flair !== null);
    const duplicates = flairs.filter(
      (flair, index) => flairs.indexOf(flair) !== index
    );
    expect(duplicates).toEqual([]);
  });

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
      isQuestDefinitionComplete(requireQuest('daily_fast_under_180'), progress)
    ).toBe(false);
  });

  it('keeps the refreshed daily coin rewards aligned with the one-daily plan', () => {
    const totalDailyCoins = questCatalog
      .filter((quest) => quest.category === 'daily')
      .reduce((sum, quest) => sum + quest.reward.coins, 0);

    expect(totalDailyCoins).toBe(40);
    expect(requireQuest('daily_fast_under_180').reward.inventory.hammer).toBe(1);
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
    expect(milestoneReward.coins).toBe(125);
    expect(milestoneReward.flair).toBe('Treasure Room');
  });

  // Snapshot of the trimmed top-tier payouts so future edits are deliberate:
  // early tiers stay welcoming, late tiers no longer mint thousands of coins.
  it('keeps the milestone reward curve at the trimmed amounts', () => {
    const expectedCoinsById: Record<string, number> = {
      milestone_wordsmith_1000: 450,
      milestone_flawless_50: 450,
      milestone_flawless_100: 650,
      milestone_spent_50000: 500,
      milestone_daily_top_20: 550,
      milestone_daily_top_50: 1000,
      milestone_daily_top_100: 1800,
      milestone_endless_150: 450,
      milestone_creator_acclaim_10: 800,
    };
    for (const [questId, coins] of Object.entries(expectedCoinsById)) {
      expect(requireQuest(questId).reward.coins).toBe(coins);
    }
    const maxMilestoneCoins = Math.max(
      ...questCatalog
        .filter((quest) => quest.category === 'milestone')
        .map((quest) => quest.reward.coins)
    );
    expect(maxMilestoneCoins).toBeLessThanOrEqual(1800);
  });
});
