import { describe, expect, it } from 'vitest';
import { getQuestVisibilityView } from './quest-view';
import type {
  QuestProgress,
  QuestStatus,
} from './types';

const progress = (overrides: Partial<QuestProgress> = {}): QuestProgress => ({
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
  ...overrides,
});

const status = (
  overrides: Partial<QuestStatus> = {},
  progressOverrides: Partial<QuestProgress> = {}
): QuestStatus => ({
  dailyDateKey: '2026-02-24',
  progress: progress(progressOverrides),
  claimedQuestIds: [],
  ...overrides,
});

describe('getQuestVisibilityView', () => {
  it('returns empty quest lists without quest status', () => {
    const view = getQuestVisibilityView(null);

    expect(view.claimedQuestIdSet.size).toBe(0);
    expect(view.visibleDailyQuests).toEqual([]);
    expect(view.visibleMilestoneIds.size).toBe(0);
    expect(view.visibleMilestoneQuests).toEqual([]);
  });

  it('hides completed and claimed daily quests', () => {
    const view = getQuestVisibilityView(
      status({ claimedQuestIds: ['daily_play_1'] }, { dailyPlayCount: 1 })
    );

    expect(view.claimedQuestIdSet.has('daily_play_1')).toBe(true);
    expect(view.visibleDailyQuests.map((quest) => quest.id)).not.toContain('daily_play_1');
    expect(view.visibleDailyQuests.map((quest) => quest.id)).toContain('daily_play_2');
  });

  it('shows only the next visible quest from grouped milestone progressions', () => {
    const view = getQuestVisibilityView(
      status(
        { claimedQuestIds: ['milestone_wordsmith_50'] },
        { lifetimeWordsmith: 60 }
      )
    );
    const visibleIds = view.visibleMilestoneQuests.map((quest) => quest.id);

    expect(view.visibleMilestoneIds.has('milestone_wordsmith_200')).toBe(true);
    expect(visibleIds).toContain('milestone_wordsmith_200');
    expect(visibleIds).not.toContain('milestone_wordsmith_50');
    expect(visibleIds).not.toContain('milestone_wordsmith_500');
  });
});
