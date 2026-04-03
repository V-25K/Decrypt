import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  zRangeMock,
  hGetMock,
  hGetAllMock,
  hSetMock,
  hDelMock,
  zAddMock,
  zRemMock,
  expireMock,
  getUserByIdMock,
  getSnoovatarUrlMock,
  getShareCompletionReceiptMock,
} = vi.hoisted(() => ({
  zRangeMock: vi.fn(),
  hGetMock: vi.fn(),
  hGetAllMock: vi.fn(),
  hSetMock: vi.fn(),
  hDelMock: vi.fn(),
  zAddMock: vi.fn(),
  zRemMock: vi.fn(),
  expireMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  getSnoovatarUrlMock: vi.fn(),
  getShareCompletionReceiptMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    zRange: zRangeMock,
    hGet: hGetMock,
    hGetAll: hGetAllMock,
    hSet: hSetMock,
    hDel: hDelMock,
    zAdd: zAddMock,
    zRem: zRemMock,
    expire: expireMock,
  },
  reddit: {
    getUserById: getUserByIdMock,
    getSnoovatarUrl: getSnoovatarUrlMock,
  },
}));

vi.mock('./share-receipts', () => ({
  getShareCompletionReceipt: getShareCompletionReceiptMock,
}));

import { computeScore, getDailyTop, getLevelTop, getUserRankSummary } from './leaderboard';

afterEach(() => {
  zRangeMock.mockReset();
  hGetMock.mockReset();
  hGetAllMock.mockReset();
  hSetMock.mockReset();
  hDelMock.mockReset();
  zAddMock.mockReset();
  zRemMock.mockReset();
  expireMock.mockReset();
  getUserByIdMock.mockReset();
  getSnoovatarUrlMock.mockReset();
  getShareCompletionReceiptMock.mockReset();
});

describe('computeScore', () => {
  it('returns a positive score even for very long solved runs', () => {
    expect(
      computeScore({
        solveSeconds: 2700,
        mistakes: 2,
        usedPowerups: 1,
      })
    ).toBe(116);
  });

  it('rewards faster and cleaner clears with higher score', () => {
    const fastClean = computeScore({
      solveSeconds: 80,
      mistakes: 0,
      usedPowerups: 0,
    });
    const slowerMessy = computeScore({
      solveSeconds: 200,
      mistakes: 2,
      usedPowerups: 2,
    });
    expect(fastClean).toBeGreaterThan(slowerMessy);
  });
});

describe('getUserRankSummary', () => {
  it('returns ranks and chooses best current rank', async () => {
    hGetMock.mockResolvedValue(null);
    zRangeMock
      .mockResolvedValueOnce([
        { member: 'u_top', score: 9 },
        { member: 'u_mid', score: 7 },
        { member: 'u_test', score: 6 },
      ])
      .mockResolvedValueOnce([
        { member: 'u_top', score: 9 },
        { member: 'u_mid', score: 7 },
        { member: 'u_test', score: 6 },
      ]);

    const summary = await getUserRankSummary({
      userId: 'u_test',
      dateKey: '2026-03-16',
    });

    expect(summary).toEqual({
      dailyRank: 3,
      endlessRank: null,
      currentRank: 3,
    });
  });

  it('returns null ranks when user is unranked', async () => {
    hGetMock.mockResolvedValue(null);
    zRangeMock
      .mockResolvedValueOnce([{ member: 'u_top', score: 9 }])
      .mockResolvedValueOnce([{ member: 'u_top', score: 9 }]);

    const summary = await getUserRankSummary({
      userId: 'u_missing',
      dateKey: '2026-03-16',
    });

    expect(summary).toEqual({
      dailyRank: null,
      endlessRank: null,
      currentRank: null,
    });
  });

  it('filters out scores from challenges created on a different day', async () => {
    hGetMock.mockResolvedValue(null);
    hSetMock.mockResolvedValue(undefined);
    hDelMock.mockResolvedValue(1);
    zAddMock.mockResolvedValue(undefined);
    zRemMock.mockResolvedValue(1);
    expireMock.mockResolvedValue(true);
    zRangeMock.mockResolvedValue([
      { member: 'u_wrong_day', score: 930 },
      { member: 'u_today', score: 870 },
    ]);
    hGetAllMock.mockImplementation(async (key: string) => {
      if (key.includes('u_wrong_day')) {
        return { lvl_yesterday: '200' };
      }
      if (key.includes('u_today')) {
        return { lvl_today: '100' };
      }
      return {};
    });
    getShareCompletionReceiptMock.mockImplementation(
      async (userId: string, levelId: string) => {
        if (userId === 'u_wrong_day' && levelId === 'lvl_yesterday') {
          return {
            levelId,
            dateKey: '2026-03-24',
            solveSeconds: 80,
            mistakes: 0,
            heartsRemaining: 3,
            usedPowerups: 0,
            score: 820,
            completedAtTs: 200,
          };
        }
        if (userId === 'u_today' && levelId === 'lvl_today') {
          return {
            levelId,
            dateKey: '2026-03-25',
            solveSeconds: 110,
            mistakes: 1,
            heartsRemaining: 2,
            usedPowerups: 0,
            score: 653,
            completedAtTs: 100,
          };
        }
        return null;
      }
    );
    getUserByIdMock.mockImplementation(async (userId: string) => ({
      username: userId.replace(/^t2_/, ''),
    }));
    getSnoovatarUrlMock.mockImplementation(
      async (username: string) => `https://example.com/${username}.png`
    );

    const top = await getDailyTop('2026-03-25', 20);

    expect(top).toEqual([
      {
        userId: 'u_today',
        username: 'u_today',
        score: 653,
        snoovatarUrl: 'https://example.com/u_today.png',
        solveSeconds: 110,
        mistakes: 1,
        usedPowerups: 0,
      },
    ]);
    expect(zRemMock).toHaveBeenCalled();
  });

  it('computes daily average time from stored totals without forcing receipt repair', async () => {
    zRangeMock.mockResolvedValue([{ member: 'u_avg', score: 880 }]);
    hGetMock.mockImplementation(async (key: string, field: string) => {
      if (key.endsWith(':stats')) {
        if (field === 'u_avg') {
          return JSON.stringify({
            solveSeconds: 300,
            mistakes: 4,
            usedPowerups: 2,
            runs: 3,
          });
        }
        if (field === 'u_avg:solveSeconds') {
          return '300';
        }
        if (field === 'u_avg:mistakes') {
          return '4';
        }
        if (field === 'u_avg:usedPowerups') {
          return '2';
        }
        if (field === 'u_avg:runs') {
          return '3';
        }
      }
      return null;
    });
    getUserByIdMock.mockResolvedValue({ username: 'u_avg' });
    getSnoovatarUrlMock.mockResolvedValue('https://example.com/u_avg.png');

    const top = await getDailyTop('2026-03-25', 10);

    expect(top).toEqual([
      {
        userId: 'u_avg',
        username: 'u_avg',
        score: 880,
        snoovatarUrl: 'https://example.com/u_avg.png',
        solveSeconds: 100,
        mistakes: 1,
        usedPowerups: 1,
      },
    ]);
    expect(hGetAllMock).not.toHaveBeenCalled();
    expect(getShareCompletionReceiptMock).not.toHaveBeenCalled();
  });

  it('treats zero legacy run counts as one run for average display', async () => {
    zRangeMock.mockResolvedValue([{ member: 'u_legacy', score: 845 }]);
    hGetMock.mockImplementation(async (key: string, field: string) => {
      if (key.endsWith(':stats')) {
        if (field === 'u_legacy') {
          return JSON.stringify({
            solveSeconds: 125,
            mistakes: 2,
            usedPowerups: 1,
            runs: 0,
          });
        }
        if (field === 'u_legacy:solveSeconds') {
          return '125';
        }
        if (field === 'u_legacy:mistakes') {
          return '2';
        }
        if (field === 'u_legacy:usedPowerups') {
          return '1';
        }
        if (field === 'u_legacy:runs') {
          return '0';
        }
      }
      return null;
    });
    getUserByIdMock.mockResolvedValue({ username: 'u_legacy' });
    getSnoovatarUrlMock.mockResolvedValue('https://example.com/u_legacy.png');

    const top = await getDailyTop('2026-03-25', 10);

    expect(top).toEqual([
      {
        userId: 'u_legacy',
        username: 'u_legacy',
        score: 845,
        snoovatarUrl: 'https://example.com/u_legacy.png',
        solveSeconds: 125,
        mistakes: 2,
        usedPowerups: 1,
      },
    ]);
    expect(hGetAllMock).not.toHaveBeenCalled();
    expect(getShareCompletionReceiptMock).not.toHaveBeenCalled();
  });

  it('returns level-specific winners ranked by challenge score', async () => {
    hGetMock.mockResolvedValue(null);
    zRangeMock.mockResolvedValue([
      { member: 'u_mid', score: 1 },
      { member: 'u_top', score: 2 },
      { member: 'u_missing', score: 3 },
    ]);
    getShareCompletionReceiptMock.mockImplementation(
      async (userId: string) => {
        if (userId === 'u_top') {
          return {
            levelId: 'lvl_0001',
            dateKey: '2026-03-16',
            solveSeconds: 82,
            mistakes: 0,
            heartsRemaining: 3,
            usedPowerups: 0,
            score: 813,
            completedAtTs: 100,
          };
        }
        if (userId === 'u_mid') {
          return {
            levelId: 'lvl_0001',
            dateKey: '2026-03-16',
            solveSeconds: 120,
            mistakes: 1,
            heartsRemaining: 2,
            usedPowerups: 1,
            score: 599,
            completedAtTs: 90,
          };
        }
        return null;
      }
    );
    getUserByIdMock.mockImplementation(async (userId: string) => ({
      username: userId.replace(/^t2_/, ''),
    }));
    getSnoovatarUrlMock.mockImplementation(
      async (username: string) => `https://example.com/${username}.png`
    );

    const top = await getLevelTop('lvl_0001', 20);

    expect(top).toEqual([
      {
        userId: 'u_top',
        username: 'u_top',
        score: 813,
        snoovatarUrl: 'https://example.com/u_top.png',
        solveSeconds: 82,
        mistakes: 0,
        usedPowerups: 0,
      },
      {
        userId: 'u_mid',
        username: 'u_mid',
        score: 599,
        snoovatarUrl: 'https://example.com/u_mid.png',
        solveSeconds: 120,
        mistakes: 1,
        usedPowerups: 1,
      },
    ]);
  });
});
