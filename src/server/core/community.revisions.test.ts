import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  contextState,
  redisMock,
  getLevelEngagementMock,
  getPuzzlePrivateMock,
  replacePuzzleDataInPlaceMock,
  buildManualPuzzleWithSolverFallbackMock,
  getUserProfileMock,
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
  replacePuzzleDataInPlaceMock: vi.fn(),
  buildManualPuzzleWithSolverFallbackMock: vi.fn(),
  getUserProfileMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: contextState,
  reddit: {
    getSnoovatarUrl: vi.fn(),
    sendPrivateMessage: vi.fn().mockResolvedValue(undefined),
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
  replacePuzzleDataInPlace: replacePuzzleDataInPlaceMock,
}));

vi.mock('./generator', () => ({
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: buildManualPuzzleWithSolverFallbackMock,
  publishDailyPost: vi.fn(),
}));

vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getFailedLevels: vi.fn(),
  getUserProfile: getUserProfileMock,
  saveUserProfile: vi.fn(),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: getLevelEngagementMock,
}));

// Approval runs the text-validation pipeline; stub it to always pass so these
// tests exercise the in-place replacement behavior rather than calibration.
vi.mock('./validation-pipeline', () => ({
  createValidationPipeline: () => ({
    phase1: () => ({ valid: true, reasons: [] }),
    phase1Structural: () => ({ valid: true, reasons: [] }),
  }),
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
    replacePuzzleDataInPlaceMock.mockReset();
    buildManualPuzzleWithSolverFallbackMock.mockReset();
    getUserProfileMock.mockReset();
    contextState.userId = 't2_mod';
    contextState.username = 'mod_user';
    redisMock.set.mockResolvedValue(true);
    redisMock.get.mockResolvedValue(null);
    redisMock.hGet.mockResolvedValue(null);
    getUserProfileMock.mockResolvedValue({ unlockedFlairs: [] });
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

  it('lets a creator revise the line in place after the puzzle has plays', async () => {
    contextState.userId = 't2_creator';
    contextState.username = 'creator';
    redisMock.hGetAll.mockResolvedValue({
      ...approvedSubmissionHash,
      status: 'changes_requested',
      rejectionReason: 'Fix the typo.',
    });
    // Lots of plays must NOT dead-end the edit anymore.
    getLevelEngagementMock.mockResolvedValue({
      plays: 124,
      wins: 30,
      winRatePct: 24,
    });

    const result = await submitRequestedCommunityEdit({
      submissionId: 'sub_001',
      title: 'Puzzle',
      text: 'THE QUICK BROWN FOX LEAPS',
      attribution: 'Tester',
    });

    // The revised line goes back for moderator review; on approval it is
    // applied in place to the existing post (see the reapproval test below).
    expect(result.status).toBe('pending');
    expect(result.text).toBe('THE QUICK BROWN FOX LEAPS');
  });

  it('lets a creator fix punctuation in place after the puzzle has plays', async () => {
    contextState.userId = 't2_creator';
    contextState.username = 'creator';
    redisMock.hGetAll.mockResolvedValue({
      ...approvedSubmissionHash,
      status: 'changes_requested',
      rejectionReason: 'Fix punctuation.',
    });
    getLevelEngagementMock.mockResolvedValue({
      plays: 80,
      wins: 40,
      winRatePct: 50,
    });

    const result = await submitRequestedCommunityEdit({
      submissionId: 'sub_001',
      title: 'Puzzle',
      text: 'THE QUICK BROWN FOX, JUMPS',
      attribution: 'Tester',
    });

    expect(result.status).toBe('pending');
  });

  it('accepts an auto revision and ignores any provided manual layout', async () => {
    contextState.userId = 't2_creator';
    contextState.username = 'creator';
    redisMock.hGetAll.mockResolvedValue({
      ...approvedSubmissionHash,
      status: 'changes_requested',
      rejectionReason: 'Tighten the title.',
    });
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0042',
      targetText: 'THE QUICK BROWN FOX JUMPS',
      source: 'COMMUNITY',
      difficulty: 5,
    });
    getLevelEngagementMock.mockResolvedValue({ plays: 0, wins: 0, winRatePct: 0 });

    const result = await submitRequestedCommunityEdit({
      submissionId: 'sub_001',
      title: 'Sharper Title',
      text: 'THE QUICK BROWN FOX JUMPS',
      attribution: 'Tester',
      // An auto submission must ignore a stray manual layout payload.
      manualLayout: {
        prefilledIndices: [0, 1],
        prefilledWordIndices: [],
        blindIndices: [],
        lockIndices: [],
        lockKeyIndices: [],
        padlocks: [],
      },
    });

    expect(result.status).toBe('pending');
    expect(result.title).toBe('SHARPER TITLE');
    expect(result.creationMode).toBe('auto');
    expect(result.manualLayout).toBeNull();
  });

  it('reapproves a played, text-changed revision by replacing the board in place', async () => {
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
      difficulty: 8,
      isLogical: true,
      createdAt: 1000,
    });
    // 1,200 plays: the old code threw "already been played"; now the corrected
    // line is rebuilt onto the same level/post.
    getLevelEngagementMock.mockResolvedValue({
      plays: 1200,
      wins: 600,
      winRatePct: 50,
    });
    buildManualPuzzleWithSolverFallbackMock.mockReturnValue({
      puzzlePrivate: {
        levelId: 'lvl_0042',
        dateKey: '2026-05-30',
        targetText: 'THE QUICK BROWN FOX LEAPS',
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
        difficulty: 8,
        isLogical: true,
        createdAt: 1000,
      },
    });

    const result = await approveCommunitySubmission('sub_001');

    expect(result.status).toBe('approved');
    expect(result.levelId).toBe('lvl_0042');
    // The same level was overwritten in place with the corrected line.
    expect(replacePuzzleDataInPlaceMock).toHaveBeenCalledTimes(1);
    const replaced = replacePuzzleDataInPlaceMock.mock.calls[0]?.[0] as {
      levelId: string;
      puzzlePrivate: { targetText: string };
    };
    expect(replaced.levelId).toBe('lvl_0042');
    expect(replaced.puzzlePrivate.targetText).toBe('THE QUICK BROWN FOX LEAPS');
  });
});
