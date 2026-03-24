import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, QuestProgress, UserProfile } from '../../shared/game';

const {
  hGetMock,
  hSetMock,
  getDailyQuestProgressMock,
  getLifetimeQuestProgressMock,
} = vi.hoisted(() => ({
  hGetMock: vi.fn(),
  hSetMock: vi.fn(),
  getDailyQuestProgressMock: vi.fn(),
  getLifetimeQuestProgressMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    hGet: hGetMock,
    hSet: hSetMock,
    hGetAll: vi.fn(),
  },
}));

vi.mock('./state', () => ({
  getDailyQuestProgress: getDailyQuestProgressMock,
  getLifetimeQuestProgress: getLifetimeQuestProgressMock,
  saveDailyQuestProgress: vi.fn(),
  saveLifetimeQuestProgress: vi.fn(),
}));

vi.mock('./keys', () => ({
  keyUserQuestDaily: (userId: string, dateKey: string) =>
    `daily:${userId}:${dateKey}`,
  keyUserQuestLifetime: (userId: string) => `lifetime:${userId}`,
}));

import { claimQuest } from './quests';

const progressFixture = (overrides?: Partial<QuestProgress>): QuestProgress => ({
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
  ...overrides,
});

const profileFixture = (overrides?: Partial<UserProfile>): UserProfile => ({
  coins: 100,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 0,
  dailyCurrentStreak: 0,
  endlessCurrentStreak: 0,
  lastPlayedDateKey: '',
  totalWordsSolved: 0,
  logicTasksCompleted: 0,
  totalLevelsCompleted: 0,
  flawlessWins: 0,
  speedWins: 0,
  dailyFlawlessWins: 0,
  endlessFlawlessWins: 0,
  dailySpeedWins: 0,
  endlessSpeedWins: 0,
  dailyChallengesPlayed: 0,
  endlessChallengesPlayed: 0,
  dailyFirstTryWins: 0,
  endlessFirstTryWins: 0,
  questsCompleted: 1,
  dailyModeClears: 0,
  endlessModeClears: 0,
  dailySolveTimeTotalSec: 0,
  endlessSolveTimeTotalSec: 0,
  bestOverallRank: 0,
  unlockedFlairs: ['First Patron'],
  activeFlair: 'First Patron',
  ...overrides,
});

const inventoryFixture = (): Inventory => ({
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
});

afterEach(() => {
  hGetMock.mockReset();
  hSetMock.mockReset();
  getDailyQuestProgressMock.mockReset();
  getLifetimeQuestProgressMock.mockReset();
});

describe('claimQuest', () => {
  it('unlocks quest flair rewards without auto-equipping them', async () => {
    hGetMock.mockResolvedValue(null);
    getDailyQuestProgressMock.mockResolvedValue(progressFixture());
    getLifetimeQuestProgressMock.mockResolvedValue(
      progressFixture({ lifetimeWordsmith: 50 })
    );

    const result = await claimQuest({
      userId: 'u1',
      dateKey: '2026-03-20',
      questId: 'milestone_wordsmith_50',
      profile: profileFixture(),
      inventory: inventoryFixture(),
    });

    expect(result.success).toBe(true);
    expect(result.profile.activeFlair).toBe('First Patron');
    expect(result.profile.unlockedFlairs).toEqual([
      'First Patron',
      'Quick Reader',
    ]);
    expect(result.profile.questsCompleted).toBe(2);
    expect(result.rewardCoins).toBe(100);
  });
});
