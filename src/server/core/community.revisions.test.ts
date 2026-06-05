import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  contextState,
  redisMock,
  getLevelEngagementMock,
  getPuzzlePrivateMock,
} = vi.hoisted(() => ({
  contextState: {
    userId: 't2_mod',
    username: 'mod_user',
    subredditName: 'decrypttest_dev',
  },
  redisMock: {
    del: vi.fn(),
    get: vi.fn(),
    hDel: vi.fn(),
    hGet: vi.fn(),
    hGetAll: vi.fn(),
    hIncrBy: vi.fn(),
    hSet: vi.fn(),
    hSetNX: vi.fn(),
    set: vi.fn(),
    zAdd: vi.fn(),
    zRem: vi.fn(),
  },
  getLevelEngagementMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextState,
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
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublishedPostId: vi.fn().mockResolvedValue('t3_existing'),
  getRecentUsedSignatureEntries: vi.fn().mockResolvedValue([]),
  getUsedSignatureOwner: vi.fn().mockResolvedValue(null),
  peekNextLevelId: vi.fn().mockResolvedValue('lvl_0001'),
  replacePuzzleDataInPlace: vi.fn(),
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
  getLevelEngagement: getLevelEngagementMock,
}));

import {
  approveCommunitySubmission,
  requestCommunitySubmissionChanges,
  submitRequestedCommunityEdit,
} from './community';

const approvedSubmissionHash = {
  authorId: 't2_creator',
  authorName: 'creator',
  title: 'Puzzle',
  text: 'THE QUICK BROWN FOX JUMPS',
  normalizedSig: 'THEQUICKBROWNFOXJUMPS',
  tokenSig: 'THE QUICK BROWN FOX JUMPS',
  category: 'QUOTE',
  attribution: 'Tester',
  targetDifficulty: '5',
  creationMode: 'auto',
  manualLayout: '',
  suggestedTier: 'medium',
  status: 'approved',
  submittedAt: '1000',
  reviewedBy: 't2_mod',
  reviewedAt: '2000',
  rejectionReason: '',
  levelId: 'lvl_0042',
};

describe('community revision workflow', () => {
  beforeEach(() => {
    redisMock.del.mockReset();
    redisMock.get.mockReset();
    redisMock.hDel.mockReset();
    redisMock.hGet.mockReset();
    redisMock.hGetAll.mockReset();
    redisMock.hIncrBy.mockReset();
    redisMock.hSet.mockReset();
    redisMock.hSetNX.mockReset();
    redisMock.set.mockReset();
    redisMock.zAdd.mockReset();
    redisMock.zRem.mockReset();
    getLevelEngagementMock.mockReset();
    getPuzzlePrivateMock.mockReset();
    contextState.userId = 't2_mod';
    contextState.username = 'mod_user';
    redisMock.set.mockResolvedValue(true);
    redisMock.get.mockResolvedValue(null);
    redisMock.hGet.mockResolvedValue(null);
  });

  it('moves an approved submission into changes_requested with a mod note', async () => {
    redisMock.hGetAll.mockResolvedValue(approvedSubmissionHash);

    const result = await requestCommunitySubmissionChanges({
      submissionId: 'sub_001',
      reason: 'Fix punctuation in the quote.',
    });

    expect(result.status).toBe('changes_requested');
    expect(result.rejectionReason).toBe('Fix punctuation in the quote.');
    expect(redisMock.zRem).toHaveBeenCalledWith(
      'decrypt:community:submissions:approved',
      ['sub_001']
    );
    expect(redisMock.zAdd).toHaveBeenCalledWith(
      'decrypt:community:submissions:pending',
      expect.objectContaining({ member: 'sub_001' })
    );
  });

  it('blocks letter-changing creator edits after the puzzle has plays', async () => {
    contextState.userId = 't2_creator';
    contextState.username = 'creator';
    redisMock.hGetAll.mockResolvedValue({
      ...approvedSubmissionHash,
      status: 'changes_requested',
      rejectionReason: 'Fix the typo.',
    });
    getLevelEngagementMock.mockResolvedValue({
      plays: 1,
      wins: 0,
      winRatePct: 0,
    });

    await expect(
      submitRequestedCommunityEdit({
        submissionId: 'sub_001',
        title: 'Puzzle',
        text: 'THE QUICK BROWN FOX LEAPS',
        attribution: 'Tester',
      })
    ).rejects.toThrow('already been played');
  });

  it('treats punctuation changes as puzzle-changing when plays exist', async () => {
    contextState.userId = 't2_creator';
    contextState.username = 'creator';
    redisMock.hGetAll.mockResolvedValue({
      ...approvedSubmissionHash,
      status: 'changes_requested',
      rejectionReason: 'Fix punctuation.',
    });
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0042',
      dateKey: '2026-05-30',
      targetText: 'THE QUICK BROWN FOX JUMPS',
      author: 'Tester',
      challengeType: 'QUOTE',
      source: 'COMMUNITY',
      cipherType: 'random',
      shiftAmount: null,
      mapping: {},
      reverseMapping: {},
      tiles: [],
      words: [],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      blindIndices: [],
      goldIndex: null,
      padlockChains: [],
      difficulty: 5,
      isLogical: true,
      createdAt: 1000,
    });
    getLevelEngagementMock.mockResolvedValue({
      plays: 1,
      wins: 0,
      winRatePct: 0,
    });

    await expect(
      submitRequestedCommunityEdit({
        submissionId: 'sub_001',
        title: 'Puzzle',
        text: 'THE QUICK BROWN FOX, JUMPS',
        attribution: 'Tester',
      })
    ).rejects.toThrow('already been played');
  });

  it('blocks in-place reapproval if plays arrive after a text-changing revision', async () => {
    redisMock.hGetAll.mockResolvedValue({
      ...approvedSubmissionHash,
      text: 'THE QUICK BROWN FOX LEAPS',
      normalizedSig: 'THEQUICKBROWNFOXLEAPS',
      tokenSig: 'THE QUICK BROWN FOX LEAPS',
      targetDifficulty: '8',
      suggestedTier: 'hard',
      status: 'pending',
      rejectionReason: 'Revision submitted for moderator review.',
    });
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0042',
      dateKey: '2026-05-30',
      targetText: 'THE QUICK BROWN FOX JUMPS',
      author: 'Tester',
      challengeType: 'QUOTE',
      source: 'COMMUNITY',
      cipherType: 'random',
      shiftAmount: null,
      mapping: {},
      reverseMapping: {},
      tiles: [],
      words: [],
      prefilledIndices: [],
      revealedIndices: [],
      revealed_indices: [],
      blindIndices: [],
      goldIndex: null,
      padlockChains: [],
      difficulty: 5,
      isLogical: true,
      createdAt: 1000,
    });
    getLevelEngagementMock.mockResolvedValue({
      plays: 1,
      wins: 0,
      winRatePct: 0,
    });

    await expect(approveCommunitySubmission('sub_001')).rejects.toThrow(
      'already been played'
    );
  });
});
