import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  zRangeMock,
  hGetMock,
  getUserByIdMock,
  getSnoovatarUrlMock,
  getShareCompletionReceiptMock,
} = vi.hoisted(() => ({
  zRangeMock: vi.fn(),
  hGetMock: vi.fn(),
  getUserByIdMock: vi.fn(),
  getSnoovatarUrlMock: vi.fn(),
  getShareCompletionReceiptMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    zRange: zRangeMock,
    hGet: hGetMock,
  },
  reddit: {
    getUserById: getUserByIdMock,
    getSnoovatarUrl: getSnoovatarUrlMock,
  },
}));

vi.mock('./share-receipts', () => ({
  getShareCompletionReceipt: getShareCompletionReceiptMock,
}));

import { getLevelTop, getUserRankSummary } from './leaderboard';

afterEach(() => {
  zRangeMock.mockReset();
  hGetMock.mockReset();
  getUserByIdMock.mockReset();
  getSnoovatarUrlMock.mockReset();
  getShareCompletionReceiptMock.mockReset();
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
            score: 88,
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
            score: 160,
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
        score: 912,
        snoovatarUrl: 'https://example.com/u_top.png',
        solveSeconds: 82,
        mistakes: 0,
        usedPowerups: 0,
      },
      {
        userId: 'u_mid',
        username: 'u_mid',
        score: 840,
        snoovatarUrl: 'https://example.com/u_mid.png',
        solveSeconds: 120,
        mistakes: 1,
        usedPowerups: 1,
      },
    ]);
  });
});
