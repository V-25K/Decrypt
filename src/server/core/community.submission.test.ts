import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    zRange: vi.fn(),
    hGetAll: vi.fn(),
  },
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

vi.mock('./config', () => ({
  getDecryptSettings: vi.fn().mockResolvedValue({
    logicalCipherPercent: 100,
  }),
}));

vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./puzzle-store', () => ({
  getPuzzleMapping: vi.fn().mockResolvedValue(null),
  getPuzzlePrivate: vi.fn(),
  getRecentUsedSignatureEntries: vi.fn().mockResolvedValue([]),
  getUsedSignatureOwner: vi.fn().mockResolvedValue(null),
  peekNextLevelId: vi.fn().mockResolvedValue('lvl_0001'),
}));

vi.mock('./generator', () => ({
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: vi.fn(),
  publishDailyPost: vi.fn(),
}));

vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getFailedLevels: vi.fn(),
  getUserProfile: vi.fn(),
  saveUserProfile: vi.fn(),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn(),
}));

import { submitCommunitySubmission } from './community';

const pendingSubmissionHash = (submissionId: string) => ({
  authorId: 't2_user',
  authorName: 'tester',
  title: 'Puzzle',
  text: 'THIS IS A VALID COMMUNITY CIPHER TEXT',
  normalizedSig: submissionId,
  tokenSig: submissionId,
  category: 'QUOTE',
  attribution: 'Source',
  targetDifficulty: '5',
  creationMode: 'auto',
  manualLayout: '',
  suggestedTier: 'medium',
  status: 'pending',
  submittedAt: '1000',
  reviewedBy: '',
  reviewedAt: '',
  rejectionReason: '',
  levelId: '',
});

describe('submitCommunitySubmission', () => {
  beforeEach(() => {
    redisMock.zRange.mockReset();
    redisMock.hGetAll.mockReset();
  });

  it('caps each creator at three pending submissions', async () => {
    redisMock.zRange.mockResolvedValue([
      { member: 'submission-1', score: 300 },
      { member: 'submission-2', score: 200 },
      { member: 'submission-3', score: 100 },
    ]);
    redisMock.hGetAll.mockImplementation(async (key: string) => {
      const submissionId = key.split(':').at(-1) ?? 'submission-1';
      return pendingSubmissionHash(submissionId);
    });

    await expect(
      submitCommunitySubmission({
        title: 'Fourth puzzle',
        text: 'THE QUICK BROWN FOX JUMPS',
        category: 'QUOTE',
        attribution: 'Tester',
        targetDifficulty: 5,
        creationMode: 'auto',
        manualLayout: null,
      })
    ).rejects.toThrow('You already have 3 submissions under review.');
  });
});
