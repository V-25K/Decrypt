import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, QuestProgress, UserProfile } from '../../shared/game';

const {
  hGetMock,
  hSetNXMock,
  hDelMock,
  getDailyQuestProgressMock,
  getInventoryMock,
  getLifetimeQuestProgressMock,
  getUserProfileMock,
  saveInventoryMock,
  saveDailyQuestProgressMock,
  saveLifetimeQuestProgressMock,
  saveUserProfileMock,
} = vi.hoisted(() => ({
  hGetMock: vi.fn(),
  hSetNXMock: vi.fn(),
  hDelMock: vi.fn(),
  getDailyQuestProgressMock: vi.fn(),
  getInventoryMock: vi.fn(),
  getLifetimeQuestProgressMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  saveInventoryMock: vi.fn(),
  saveDailyQuestProgressMock: vi.fn(),
  saveLifetimeQuestProgressMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    hGet: hGetMock,
    hSetNX: hSetNXMock,
    hDel: hDelMock,
    hGetAll: vi.fn(),
  },
}));

vi.mock('./state', () => ({
  getDailyQuestProgress: getDailyQuestProgressMock,
  getInventory: getInventoryMock,
  getLifetimeQuestProgress: getLifetimeQuestProgressMock,
  getUserProfile: getUserProfileMock,
  saveInventory: saveInventoryMock,
  saveDailyQuestProgress: saveDailyQuestProgressMock,
  saveLifetimeQuestProgress: saveLifetimeQuestProgressMock,
  saveUserProfile: saveUserProfileMock,
}));

vi.mock('./keys', () => ({
  keyUserQuestDaily: (userId: string, dateKey: string) =>
    `daily:${userId}:${dateKey}`,
  keyUserQuestLifetime: (userId: string) => `lifetime:${userId}`,
}));

import { claimQuest, updateQuestProgressOnCompletion } from './quests';

const progressFixture = (overrides?: Partial<QuestProgress>): QuestProgress => ({
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
  audioEnabled: true,
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
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
  hSetNXMock.mockReset();
  hDelMock.mockReset();
  getDailyQuestProgressMock.mockReset();
  getInventoryMock.mockReset();
  getLifetimeQuestProgressMock.mockReset();
  getUserProfileMock.mockReset();
  saveInventoryMock.mockReset();
  saveDailyQuestProgressMock.mockReset();
  saveLifetimeQuestProgressMock.mockReset();
  saveUserProfileMock.mockReset();
});

describe('claimQuest', () => {
  it('unlocks quest flair rewards without auto-equipping them', async () => {
    hSetNXMock.mockResolvedValue(1);
    getDailyQuestProgressMock.mockResolvedValue(progressFixture());
    getLifetimeQuestProgressMock.mockResolvedValue(
      progressFixture({ lifetimeWordsmith: 50 })
    );
    getUserProfileMock.mockResolvedValue(profileFixture());
    getInventoryMock.mockResolvedValue(inventoryFixture());

    const result = await claimQuest({
      userId: 'u1',
      dateKey: '2026-03-20',
      questId: 'milestone_wordsmith_50',
    });

    expect(result.success).toBe(true);
    expect(result.profile.activeFlair).toBe('First Patron');
    expect(result.profile.unlockedFlairs).toEqual([
      'First Patron',
      'Quick Reader',
    ]);
    expect(result.profile.questsCompleted).toBe(2);
    expect(result.rewardCoins).toBe(60);
    expect(saveUserProfileMock).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ questsCompleted: 2, coins: 160 })
    );
    expect(saveInventoryMock).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        hammer: 0,
        rocket: 0,
      })
    );
  });
});

describe('updateQuestProgressOnCompletion', () => {
  it('counts recovery clears for daily completion quests but skips prestige flags', async () => {
    getDailyQuestProgressMock.mockResolvedValue(progressFixture());
    getLifetimeQuestProgressMock.mockResolvedValue(progressFixture());

    await updateQuestProgressOnCompletion({
      userId: 'u1',
      dateKey: '2026-04-04',
      solvedWords: 3,
      solveSeconds: 120,
      mistakes: 0,
      usedPowerups: 0,
      isLogical: false,
      mode: 'daily',
      isCurrentDaily: true,
      isRecoveryRun: true,
    });

    expect(saveDailyQuestProgressMock).toHaveBeenCalledWith(
      'u1',
      '2026-04-04',
      expect.objectContaining({
        dailyPlayCount: 1,
        dailyFastWin: false,
        dailyNoPowerup: false,
        dailyNoMistake: false,
      })
    );
    expect(saveLifetimeQuestProgressMock).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        lifetimeWordsmith: 3,
        lifetimeFlawless: 1,
      })
    );
  });

  it('skips daily quest progress entirely for older daily clears', async () => {
    getLifetimeQuestProgressMock.mockResolvedValue(progressFixture());

    await updateQuestProgressOnCompletion({
      userId: 'u1',
      dateKey: '2026-04-04',
      solvedWords: 2,
      solveSeconds: 90,
      mistakes: 0,
      usedPowerups: 0,
      isLogical: true,
      mode: 'daily',
      isCurrentDaily: false,
      isRecoveryRun: false,
    });

    expect(getDailyQuestProgressMock).not.toHaveBeenCalled();
    expect(saveDailyQuestProgressMock).not.toHaveBeenCalled();
    expect(saveLifetimeQuestProgressMock).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        lifetimeWordsmith: 2,
        lifetimeLogicalSolved: 1,
        lifetimeFlawless: 1,
      })
    );
  });
});
