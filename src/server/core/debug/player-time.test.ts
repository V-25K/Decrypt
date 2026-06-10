import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  hGetMock,
  hGetAllMock,
  getUserByUsernameMock,
  getCompletedLevelsMock,
  getFailedLevelsMock,
  getKnownUserIdsMock,
  getUserProfileMock,
  saveUserProfileMock,
  getShareCompletionReceiptMock,
} = vi.hoisted(() => ({
  hGetMock: vi.fn(),
  hGetAllMock: vi.fn(),
  getUserByUsernameMock: vi.fn(),
  getCompletedLevelsMock: vi.fn(),
  getFailedLevelsMock: vi.fn(),
  getKnownUserIdsMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
  getShareCompletionReceiptMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    hGet: hGetMock,
    hGetAll: hGetAllMock,
  },
  reddit: {
    getUserByUsername: getUserByUsernameMock,
  },
}));

vi.mock('../state', () => ({
  getCompletedLevels: getCompletedLevelsMock,
  getFailedLevels: getFailedLevelsMock,
  getKnownUserIds: getKnownUserIdsMock,
  getUserProfile: getUserProfileMock,
  saveUserProfile: saveUserProfileMock,
}));

vi.mock('../share-receipts', () => ({
  getShareCompletionReceipt: getShareCompletionReceiptMock,
}));

vi.mock('../puzzle-store', () => ({
  clearStagedLevelId: vi.fn(),
  getPuzzlePrivate: vi.fn(),
  getPuzzlePublishedPostId: vi.fn(),
  getStagedLevelId: vi.fn(),
}));

vi.mock('../generator', () => ({
  generatePuzzleForDate: vi.fn(),
  injectManualPuzzle: vi.fn(),
  publishDailyPost: vi.fn(),
}));

vi.mock('../endless-catalog', () => ({
  activateEndlessCatalog: vi.fn(),
  getEndlessCatalogStatus: vi.fn(),
}));

vi.mock('../endless-audit', () => ({
  auditBundledEndlessStagingCollisions: vi.fn(),
}));

import { getPlayerTimeStatsByUsername } from './player-time';

afterEach(() => {
  hGetMock.mockReset();
  hGetAllMock.mockReset();
  getUserByUsernameMock.mockReset();
  getCompletedLevelsMock.mockReset();
  getFailedLevelsMock.mockReset();
  getKnownUserIdsMock.mockReset();
  getUserProfileMock.mockReset();
  saveUserProfileMock.mockReset();
  getShareCompletionReceiptMock.mockReset();
});

describe('getPlayerTimeStatsByUsername', () => {
  it('returns profile, receipt, and leaderboard time diagnostics for a username', async () => {
    getUserByUsernameMock.mockResolvedValue({
      id: 't2_u_debug',
      username: 'u_debug',
    });
    hGetAllMock.mockImplementation(async (key: string) => {
      if (key.includes('decrypt:user:t2_u_debug:profile')) {
        return {
          totalLevelsCompleted: '3',
          dailyModeClears: '2',
          endlessModeClears: '1',
        };
      }
      return {};
    });
    getUserProfileMock.mockResolvedValue({
      coins: 0,
      hearts: 3,
      lastHeartRefillTs: 0,
      infiniteHeartsExpiryTs: 0,
      currentStreak: 0,
      dailyCurrentStreak: 0,
      endlessCurrentStreak: 0,
      lastPlayedDateKey: '',
      totalWordsSolved: 0,
      logicTasksCompleted: 0,
      totalLevelsCompleted: 3,
      flawlessWins: 0,
      speedWins: 0,
      dailyFlawlessWins: 0,
      endlessFlawlessWins: 0,
      dailySpeedWins: 0,
      endlessSpeedWins: 0,
      dailyChallengesPlayed: 2,
      endlessChallengesPlayed: 1,
      dailyFirstTryWins: 0,
      endlessFirstTryWins: 0,
      questsCompleted: 0,
      dailyModeClears: 2,
      endlessModeClears: 1,
      dailySolveTimeTotalSec: 240,
      endlessSolveTimeTotalSec: 90,
      bestOverallRank: 0,
      communityJoinRewardClaimed: false,
      unlockedFlairs: [],
      activeFlair: '',
    });
    getCompletedLevelsMock.mockResolvedValue(
      new Set(['lvl_0001', 'lvl_0002', 'endless_0003'])
    );
    getShareCompletionReceiptMock.mockImplementation(
      async (_userId: string, levelId: string) => {
        if (levelId === 'lvl_0001') {
          return {
            levelId,
            dateKey: '2026-04-01',
            solveSeconds: 110,
            mistakes: 0,
            heartsRemaining: 3,
            usedPowerups: 0,
            score: 110,
            completedAtTs: 100,
          };
        }
        if (levelId === 'lvl_0002') {
          return {
            levelId,
            dateKey: '2026-04-01',
            solveSeconds: 130,
            mistakes: 1,
            heartsRemaining: 2,
            usedPowerups: 0,
            score: 160,
            completedAtTs: 110,
          };
        }
        if (levelId === 'endless_0003') {
          return {
            levelId,
            dateKey: '2026-04-01',
            solveSeconds: 90,
            mistakes: 0,
            heartsRemaining: 3,
            usedPowerups: 0,
            score: 90,
            completedAtTs: 120,
          };
        }
        return null;
      }
    );
    hGetMock.mockImplementation(async (_key: string, field: string) => {
      if (field === 't2_u_debug:solveSeconds') {
        return '360';
      }
      if (field === 't2_u_debug:mistakes') {
        return '3';
      }
      if (field === 't2_u_debug:usedPowerups') {
        return '1';
      }
      if (field === 't2_u_debug:runs') {
        return '3';
      }
      return null;
    });

    const result = await getPlayerTimeStatsByUsername({
      username: 'u/u_debug',
      dateKey: '2026-04-01',
    });

    expect(result.userId).toBe('t2_u_debug');
    expect(result.profile.dailyAvgSolveSeconds).toBe(120);
    expect(result.receipts.dailyAvgSolveSeconds).toBe(120);
    expect(result.dailyLeaderboard.avgSolveSeconds).toBe(120);
    expect(result.completed).toEqual({
      dailyLevels: 2,
      endlessLevels: 1,
      totalLevels: 3,
    });
    expect(result.flags).toEqual([]);
    expect(result.levelTimes).toHaveLength(3);
    expect(result.analysis).toEqual(
      expect.objectContaining({
        medianSolveSeconds: 110,
        minSolveSeconds: 90,
        maxSolveSeconds: 130,
        levelsOver10Minutes: 0,
        levelsOver20Minutes: 0,
        levelsOver30Minutes: 0,
      })
    );
    expect(result.analysis.slowestLevels[0]).toEqual(
      expect.objectContaining({
        levelId: 'lvl_0002',
        solveSeconds: 130,
      })
    );
  });
});
