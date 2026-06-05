import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisMock, getCompletedLevelsMock, getFailedLevelsMock } = vi.hoisted(() => ({
  redisMock: {
    zRange: vi.fn(),
    hGetAll: vi.fn(),
    zScore: vi.fn(),
  },
  getCompletedLevelsMock: vi.fn(),
  getFailedLevelsMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: {
    userId: 't2_user',
    username: 'tester',
    subredditName: 'decrypttest_dev',
  },
  reddit: {
    getSnoovatarUrl: vi.fn(),
  },
  redis: redisMock,
}));

vi.mock('./state', () => ({
  getCompletedLevels: getCompletedLevelsMock,
  getFailedLevels: getFailedLevelsMock,
  getUserProfile: vi.fn(),
  saveUserProfile: vi.fn(),
}));

vi.mock('./generator', () => ({
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: vi.fn(),
  publishDailyPost: vi.fn(),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn().mockResolvedValue({
    plays: 0,
    wins: 0,
    winRatePct: 0,
  }),
}));

import { getNextCommunityEndlessLevelId } from './community';

const submissionHash = (params: {
  submissionId: string;
  levelId: string;
  category?: string;
  reviewedAt?: number;
}) => ({
  authorId: 't2_author',
  authorName: 'maker',
  title: 'Puzzle',
  text: 'This is a valid community cipher text',
  normalizedSig: params.submissionId,
  tokenSig: params.submissionId,
  category: params.category ?? 'QUOTE',
  attribution: 'Source',
  targetDifficulty: '5',
  suggestedTier: 'medium',
  status: 'approved',
  submittedAt: '1000',
  reviewedBy: 'mod',
  reviewedAt: `${params.reviewedAt ?? 1000}`,
  rejectionReason: '',
  levelId: params.levelId,
});

describe('community endless selection', () => {
  beforeEach(() => {
    redisMock.zRange.mockReset();
    redisMock.hGetAll.mockReset();
    redisMock.zScore.mockReset();
    getCompletedLevelsMock.mockReset();
    getFailedLevelsMock.mockReset();
    getFailedLevelsMock.mockResolvedValue(new Set<string>());
  });

  it('skips the latest completed puzzle and selects the latest open puzzle', async () => {
    redisMock.zRange.mockResolvedValue([
      { member: 'submission-old-open', score: 100 },
      { member: 'submission-second-open', score: 200 },
      { member: 'submission-latest-completed', score: 300 },
    ]);
    redisMock.hGetAll.mockImplementation(async (key: string) => {
      if (key.endsWith('submission-latest-completed')) {
        return submissionHash({
          submissionId: 'submission-latest-completed',
          levelId: 'level-latest-completed',
          reviewedAt: 300,
        });
      }
      if (key.endsWith('submission-second-open')) {
        return submissionHash({
          submissionId: 'submission-second-open',
          levelId: 'level-second-open',
          reviewedAt: 200,
        });
      }
      return submissionHash({
        submissionId: 'submission-old-open',
        levelId: 'level-old-open',
        reviewedAt: 100,
      });
    });
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['level-latest-completed']));
    redisMock.zScore.mockResolvedValue(null);

    const selected = await getNextCommunityEndlessLevelId({
      userId: 't2_user',
      endlessSort: 'latest',
    });

    expect(selected).toEqual({
      levelId: 'level-second-open',
      reason: 'available',
    });
  });

  it('treats string zset scores as played and skips them', async () => {
    redisMock.zRange.mockResolvedValue([
      { member: 'submission-played', score: '300' },
      { member: 'submission-open', score: '200' },
    ]);
    redisMock.hGetAll.mockImplementation(async (key: string) => {
      if (key.endsWith('submission-played')) {
        return submissionHash({
          submissionId: 'submission-played',
          levelId: 'level-played',
          reviewedAt: 300,
        });
      }
      return submissionHash({
        submissionId: 'submission-open',
        levelId: 'level-open',
        reviewedAt: 200,
      });
    });
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    redisMock.zScore.mockImplementation(async (_key: string, levelId: string) =>
      levelId === 'level-played' ? '12345' : null
    );

    const selected = await getNextCommunityEndlessLevelId({
      userId: 't2_user',
      endlessSort: 'latest',
    });

    expect(selected).toEqual({
      levelId: 'level-open',
      reason: 'available',
    });
  });
});
