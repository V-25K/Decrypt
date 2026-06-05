import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Inventory, UserProfile } from '../../../shared/game';

const {
  getCompletedLevelsMock,
  getFailedOutcomeReceiptMock,
  getInventoryMock,
  getShareCompletionReceiptMock,
  hasFailedLevelMock,
  getUserProfileMock,
} = vi.hoisted(() => ({
  getCompletedLevelsMock: vi.fn(),
  getFailedOutcomeReceiptMock: vi.fn(),
  getInventoryMock: vi.fn(),
  getShareCompletionReceiptMock: vi.fn(),
  hasFailedLevelMock: vi.fn(),
  getUserProfileMock: vi.fn(),
}));

vi.mock('../../core/game-service', () => ({
  bootstrapGame: vi.fn(),
  completeSessionForLevel: vi.fn(),
  getCurrentPuzzleView: vi.fn(),
  heartbeatSessionForLevel: vi.fn(),
  loadLevelForUser: vi.fn(),
  purchaseDailyRetryForLevel: vi.fn(),
  startSessionForLevel: vi.fn(),
  submitGuessesForSession: vi.fn(),
  submitGuessForSession: vi.fn(),
}));

vi.mock('../../core/share-receipts', () => ({
  getShareCompletionReceipt: getShareCompletionReceiptMock,
}));

vi.mock('../../core/leaderboard', () => ({
  getRatingOutcomeReceipt: getFailedOutcomeReceiptMock,
}));

vi.mock('../../core/state', () => ({
  getCompletedLevels: getCompletedLevelsMock,
  getInventory: getInventoryMock,
  getUserProfile: getUserProfileMock,
  hasFailedLevel: hasFailedLevelMock,
}));

import { gameRouter } from './game';

const caller = gameRouter.createCaller({
  userId: 't2_player',
  username: 'player',
  subredditName: 'decrypttest_dev',
  postId: 't3_post',
});

const profile: UserProfile = {
  coins: 500,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 2,
  dailyCurrentStreak: 2,
  endlessCurrentStreak: 0,
  lastPlayedDateKey: '2026-05-16',
  totalWordsSolved: 12,
  logicTasksCompleted: 4,
  totalLevelsCompleted: 3,
  flawlessWins: 1,
  speedWins: 1,
  dailyFlawlessWins: 1,
  endlessFlawlessWins: 0,
  dailySpeedWins: 1,
  endlessSpeedWins: 0,
  dailyChallengesPlayed: 3,
  endlessChallengesPlayed: 0,
  dailyFirstTryWins: 1,
  endlessFirstTryWins: 0,
  questsCompleted: 2,
  dailyModeClears: 3,
  endlessModeClears: 0,
  dailySolveTimeTotalSec: 240,
  endlessSolveTimeTotalSec: 0,
  bestOverallRank: 4,
  audioEnabled: true,
  communityJoinRecorded: false,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
};

const inventory: Inventory = {
  hammer: 1,
  wand: 0,
  shield: 2,
  rocket: 0,
};

afterEach(() => {
  getCompletedLevelsMock.mockReset();
  getFailedOutcomeReceiptMock.mockReset();
  getInventoryMock.mockReset();
  getShareCompletionReceiptMock.mockReset();
  hasFailedLevelMock.mockReset();
  getUserProfileMock.mockReset();
});

describe('gameRouter.getCompletedOutcome', () => {
  it('returns null when the current user has not completed the level', async () => {
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());

    const result = await caller.getCompletedOutcome({ levelId: 'daily_2026_05_16' });

    expect(result).toBeNull();
    expect(getShareCompletionReceiptMock).not.toHaveBeenCalled();
    expect(getUserProfileMock).not.toHaveBeenCalled();
    expect(getInventoryMock).not.toHaveBeenCalled();
  });

  it('returns durable completion data for a completed level', async () => {
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['daily_2026_05_16']));
    getShareCompletionReceiptMock.mockResolvedValue({
      solveSeconds: 58,
      score: 1250,
      ratingDelta: 24,
      ratingAfter: 524,
      globalScoreAfter: 1250,
      completedAtTs: 1778900000000,
    });
    getUserProfileMock.mockResolvedValue(profile);
    getInventoryMock.mockResolvedValue(inventory);

    const result = await caller.getCompletedOutcome({ levelId: 'daily_2026_05_16' });

    expect(result).toEqual({
      levelId: 'daily_2026_05_16',
      solveSeconds: 58,
      score: 1250,
      ratingDelta: 24,
      ratingAfter: 524,
      globalScoreAfter: 1250,
      completedAtTs: 1778900000000,
      profile: expect.objectContaining(profile),
      inventory,
    });
  });
});

describe('gameRouter.getFailedOutcome', () => {
  it('returns null when the current user has not failed the level', async () => {
    hasFailedLevelMock.mockResolvedValue(false);

    const result = await caller.getFailedOutcome({ levelId: 'daily_2026_05_16' });

    expect(result).toBeNull();
    expect(getFailedOutcomeReceiptMock).not.toHaveBeenCalled();
  });

  it('returns durable failure rating metadata for a failed level', async () => {
    hasFailedLevelMock.mockResolvedValue(true);
    getFailedOutcomeReceiptMock.mockResolvedValue({
      ratingDelta: -18,
      ratingAfter: 482,
      ts: 1778900000000,
    });

    const result = await caller.getFailedOutcome({ levelId: 'daily_2026_05_16' });

    expect(result).toEqual({
      levelId: 'daily_2026_05_16',
      ratingDelta: -18,
      ratingAfter: 482,
      pointsGained: 0,
    });
  });
});
