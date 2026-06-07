import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  approveCommunitySubmissionMock,
  buildShadowCalibrationPreviewMock,
  completeSavedManualPuzzlePublishMock,
  formatModeratorRerollErrorMock,
  getGlobalDailyCalibrationSnapshotMock,
  getMetricsSnapshotMock,
  hasAdminAccessMock,
  injectAndPublishManualPuzzleMock,
  injectManualChallengeWithAdjustmentMock,
  listCommunitySubmissionsForReviewMock,
  preflightManualChallengeForPublishMock,
  readDifficultyCalibrationV3ArtifactMock,
  rejectCommunitySubmissionMock,
  removeCommunityPuzzleMock,
  requestCommunitySubmissionChangesMock,
  rerollAndPublishMock,
} = vi.hoisted(() => ({
  approveCommunitySubmissionMock: vi.fn(),
  buildShadowCalibrationPreviewMock: vi.fn(),
  completeSavedManualPuzzlePublishMock: vi.fn(),
  formatModeratorRerollErrorMock: vi.fn(),
  getGlobalDailyCalibrationSnapshotMock: vi.fn(),
  getMetricsSnapshotMock: vi.fn(),
  hasAdminAccessMock: vi.fn(),
  injectAndPublishManualPuzzleMock: vi.fn(),
  injectManualChallengeWithAdjustmentMock: vi.fn(),
  listCommunitySubmissionsForReviewMock: vi.fn(),
  preflightManualChallengeForPublishMock: vi.fn(),
  readDifficultyCalibrationV3ArtifactMock: vi.fn(),
  rejectCommunitySubmissionMock: vi.fn(),
  removeCommunityPuzzleMock: vi.fn(),
  requestCommunitySubmissionChangesMock: vi.fn(),
  rerollAndPublishMock: vi.fn(),
}));

vi.mock('../../core/admin-auth', () => ({
  hasAdminAccess: hasAdminAccessMock,
}));

vi.mock('../../core/admin', () => ({
  activateEndlessCatalogVersion: vi.fn(),
  completeSavedManualPuzzlePublish: completeSavedManualPuzzlePublishMock,
  formatModeratorRerollError: formatModeratorRerollErrorMock,
  getEndlessCatalogAdminStatus: vi.fn(),
  getEndlessStagingCollisionReport: vi.fn(),
  injectAndPublishManualPuzzle: injectAndPublishManualPuzzleMock,
  injectManualChallengeWithAdjustment: injectManualChallengeWithAdjustmentMock,
  preflightManualChallengeForPublish: preflightManualChallengeForPublishMock,
  rerollAndPublish: rerollAndPublishMock,
}));

vi.mock('../../core/difficulty-calibration', () => ({
  buildShadowCalibrationPreview: buildShadowCalibrationPreviewMock,
  getGlobalDailyCalibrationSnapshot: getGlobalDailyCalibrationSnapshotMock,
  readDifficultyCalibrationV3Artifact: readDifficultyCalibrationV3ArtifactMock,
}));

const defaultShadowCalibrationPreview = () => ({
  readyLevels: 0,
  averageStaticShadowDelta: 0,
  maxStaticShadowDelta: 0,
  generatedAt: 0,
  tierBreakdown: {
    warmup: { readyLevels: 0, averageDelta: 0, suggestEasier: 0, suggestHarder: 0 },
    medium: { readyLevels: 0, averageDelta: 0, suggestEasier: 0, suggestHarder: 0 },
    hard: { readyLevels: 0, averageDelta: 0, suggestEasier: 0, suggestHarder: 0 },
    expert: { readyLevels: 0, averageDelta: 0, suggestEasier: 0, suggestHarder: 0 },
  },
  reviewCandidates: [],
});

const defaultDifficultyCalibrationSnapshot = () => ({
  biasTierShift: 0,
  eligibleLevels: 0,
  harderCount: 0,
  easierCount: 0,
  neutralCount: 0,
  params: {
    bayesAlpha: 2,
    bayesBeta: 2,
    minQualifiedPlaysPerLevel: 5,
    lookbackEligibleLevels: 50,
    recentLevelScanLimit: 100,
    minEligibleLevelsForBias: 12,
    biasRequiredShare: 0.55,
    observedEasyThreshold: 0.68,
    observedHardThreshold: 0.42,
  },
});

vi.mock('../../core/metrics', () => ({
  getMetricsSnapshot: getMetricsSnapshotMock,
}));

vi.mock('../../core/community', () => ({
  approveCommunitySubmission: approveCommunitySubmissionMock,
  listCommunitySubmissionsForReview: listCommunitySubmissionsForReviewMock,
  rejectCommunitySubmission: rejectCommunitySubmissionMock,
  removeCommunityPuzzle: removeCommunityPuzzleMock,
  requestCommunitySubmissionChanges: requestCommunitySubmissionChangesMock,
}));

vi.mock('./admin.debug', () => ({
  adminDebugProcedures: {},
}));

import { adminRouter } from './admin';

const feedback = {
  textProfile: {
    cryptoHardness: 0.5,
    uniqueLetterCount: 12,
    oneLetterWordCount: 0,
    commonSuffixCount: 1,
  },
  naturalDifficulty: 'medium' as const,
  achievableTierRange: ['warmup', 'medium', 'hard'] as const,
  budgetUsed: 3,
  budgetTotal: 5,
  adjustmentsMade: ['Adjusted padlocks'],
};

const communitySubmission = {
  submissionId: 'sub_001',
  authorId: 't2_creator',
  authorName: 'creator',
  title: 'Test Cipher',
  text: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
  normalizedSig: 'NEVERSETTLEFORLESSTHANYOURBEST',
  tokenSig: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
  category: 'QUOTE',
  attribution: 'TEST AUTHOR',
  targetDifficulty: 5,
  creationMode: 'auto',
  manualLayout: null,
  suggestedTier: 'medium',
  status: 'approved',
  submittedAt: 1,
  reviewedBy: 't2_mod',
  reviewedAt: 2,
  rejectionReason: null,
  levelId: 'lvl_community001',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  buildShadowCalibrationPreviewMock.mockResolvedValue(defaultShadowCalibrationPreview());
  getGlobalDailyCalibrationSnapshotMock.mockResolvedValue(
    defaultDifficultyCalibrationSnapshot()
  );
  readDifficultyCalibrationV3ArtifactMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  approveCommunitySubmissionMock.mockReset();
  buildShadowCalibrationPreviewMock.mockReset();
  completeSavedManualPuzzlePublishMock.mockReset();
  formatModeratorRerollErrorMock.mockReset();
  getGlobalDailyCalibrationSnapshotMock.mockReset();
  getMetricsSnapshotMock.mockReset();
  hasAdminAccessMock.mockReset();
  injectAndPublishManualPuzzleMock.mockReset();
  injectManualChallengeWithAdjustmentMock.mockReset();
  listCommunitySubmissionsForReviewMock.mockReset();
  preflightManualChallengeForPublishMock.mockReset();
  readDifficultyCalibrationV3ArtifactMock.mockReset();
  rejectCommunitySubmissionMock.mockReset();
  removeCommunityPuzzleMock.mockReset();
  requestCommunitySubmissionChangesMock.mockReset();
  rerollAndPublishMock.mockReset();
});

describe('adminRouter.getMetrics', () => {
  it('returns the async metrics snapshot', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    getMetricsSnapshotMock.mockResolvedValue({
      timestamp: 1,
      batch: {
        totalBatches: 0,
        successfulBatches: 0,
        failedBatches: 0,
        totalCandidatesRequested: 0,
        totalCandidatesReturned: 0,
        totalCandidatesSelected: 0,
        averageCandidatesPerBatch: 0,
        batchSuccessRate: 0,
      },
      adjustment: {
        totalAdjustments: 0,
        successfulAdjustments: 0,
        failedAdjustments: 0,
        averageIterations: 0,
        convergenceRate: 0,
        budgetUtilizationStats: {
          min: 0,
          max: 0,
          average: 0,
          median: 0,
        },
      },
      shadow: {
        updateFailures: 3,
      },
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.getMetrics();

    expect(getMetricsSnapshotMock).toHaveBeenCalled();
    expect(result.shadow.updateFailures).toBe(3);
  });
});

describe('adminRouter.getDifficultyCalibration', () => {
  it('returns the shadow calibration tier breakdown contract', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    buildShadowCalibrationPreviewMock.mockResolvedValue({
      ...defaultShadowCalibrationPreview(),
      readyLevels: 4,
      tierBreakdown: {
        warmup: { readyLevels: 1, averageDelta: -0.25, suggestEasier: 1, suggestHarder: 0 },
        medium: { readyLevels: 2, averageDelta: 0.5, suggestEasier: 0, suggestHarder: 1 },
        hard: { readyLevels: 1, averageDelta: 1.25, suggestEasier: 0, suggestHarder: 1 },
        expert: { readyLevels: 0, averageDelta: 0, suggestEasier: 0, suggestHarder: 0 },
      },
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.getDifficultyCalibration();

    expect(getGlobalDailyCalibrationSnapshotMock).toHaveBeenCalled();
    expect(buildShadowCalibrationPreviewMock).toHaveBeenCalled();
    expect(result.shadowCalibrationPreview?.tierBreakdown.medium).toEqual({
      readyLevels: 2,
      averageDelta: 0.5,
      suggestEasier: 0,
      suggestHarder: 1,
    });
  });
});

describe('adminRouter.reroll', () => {
  it('returns a moderator-friendly failure instead of throwing raw reroll errors', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    rerollAndPublishMock.mockRejectedValue(new Error('PUZZLE_GENERATION_FAILED internal text'));
    formatModeratorRerollErrorMock.mockReturnValue(
      'Could not reroll a puzzle right now because the AI candidate pool was empty for the required difficulty and challenge type.'
    );

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.reroll();

    expect(formatModeratorRerollErrorMock).toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      message:
        'Could not reroll a puzzle right now because the AI candidate pool was empty for the required difficulty and challenge type.',
    });
  });
});

describe('adminRouter.validateManualChallenge', () => {
  it('uses the shared preflight validator for manual challenge checks', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: false,
      textProfile: {
        cryptoHardness: 0.82,
        uniqueLetterCount: 23,
        oneLetterWordCount: 0,
        commonSuffixCount: 0,
      },
      naturalDifficulty: 'expert',
      achievableTierRange: ['hard', 'expert'],
      reasons: ['Target tier warmup not achievable with this text.'],
      suggestions: ['Use text with more repeated letters and common words.'],
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.validateManualChallenge({
      text: 'JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS',
      targetDifficulty: 2,
      challengeType: 'LYRIC_LINE',
    });

    expect(preflightManualChallengeForPublishMock).toHaveBeenCalledWith({
      text: 'JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS',
      difficulty: 2,
      challengeType: 'LYRIC_LINE',
    });
    expect(result).toMatchObject({
      valid: false,
      naturalDifficulty: 'expert',
      achievableTierRange: ['hard', 'expert'],
    });
  });

  it('allows validation without an explicit tier preference', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    preflightManualChallengeForPublishMock.mockResolvedValue({
      valid: true,
      textProfile: {
        cryptoHardness: 0.63,
        uniqueLetterCount: 17,
        oneLetterWordCount: 0,
        commonSuffixCount: 1,
      },
      naturalDifficulty: 'hard',
      achievableTierRange: ['medium', 'hard'],
      reasons: [],
      suggestions: [],
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.validateManualChallenge({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      challengeType: 'QUOTE',
    });

    expect(preflightManualChallengeForPublishMock).toHaveBeenCalledWith({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      difficulty: undefined,
      challengeType: 'QUOTE',
    });
    expect(result).toMatchObject({
      valid: true,
      naturalDifficulty: 'hard',
      achievableTierRange: ['medium', 'hard'],
    });
  });
});

describe('adminRouter.injectManual', () => {
  it('allows auto-detected manual injection without a fixed difficulty', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    injectAndPublishManualPuzzleMock.mockResolvedValue({
      success: true,
      levelId: 'lvl_0300',
      postId: 't3_manual300',
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.injectManual({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      author: 'TEST AUTHOR',
      challengeType: 'QUOTE',
    });

    expect(injectAndPublishManualPuzzleMock).toHaveBeenCalledWith({
      text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
      author: 'TEST AUTHOR',
      difficulty: undefined,
      challengeType: 'QUOTE',
      allowAdjustment: true,
    });
    expect(result).toMatchObject({
      success: true,
      levelId: 'lvl_0300',
    });
  });
});

describe('adminRouter.injectManualChallengeWithAdjustment', () => {
  it('publishes successful adjusted manual injections', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    injectManualChallengeWithAdjustmentMock.mockResolvedValue({
      success: true,
      puzzle: {
        puzzlePrivate: {
          levelId: 'lvl_0200',
          dateKey: '2026-03-07',
        },
      },
      feedback,
    });
    completeSavedManualPuzzlePublishMock.mockResolvedValue({
      success: true,
      levelId: 'lvl_0200',
      dateKey: '2026-03-07',
      postId: 't3_manual200',
      publishState: 'published',
      recoverable: false,
      cleanupPerformed: false,
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.injectManualChallengeWithAdjustment({
      text: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
      author: 'TEST AUTHOR',
      targetDifficulty: 5,
      challengeType: 'QUOTE',
      allowAdjustment: true,
    });

    expect(completeSavedManualPuzzlePublishMock).toHaveBeenCalledWith({
      levelId: 'lvl_0200',
      dateKey: '2026-03-07',
    });
    expect(result).toMatchObject({
      success: true,
      levelId: 'lvl_0200',
      postId: 't3_manual200',
      feedback,
    });
  });

  it('does not publish failed adjusted manual injections', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    injectManualChallengeWithAdjustmentMock.mockResolvedValue({
      success: false,
      feedback,
      error: 'Target tier expert not achievable',
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.injectManualChallengeWithAdjustment({
      text: 'TO BE OR NOT TO BE AGAIN',
      author: 'TEST AUTHOR',
      targetDifficulty: 9,
      challengeType: 'QUOTE',
      allowAdjustment: true,
    });

    expect(completeSavedManualPuzzlePublishMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      error: 'Target tier expert not achievable',
      feedback,
    });
  });

  it('returns the saved level id when adjusted publish fails after save', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    injectManualChallengeWithAdjustmentMock.mockResolvedValue({
      success: true,
      puzzle: {
        puzzlePrivate: {
          levelId: 'lvl_0201',
          dateKey: '2026-03-07',
        },
      },
      feedback,
    });
    completeSavedManualPuzzlePublishMock.mockResolvedValue({
      success: false,
      levelId: 'lvl_0201',
      dateKey: '2026-03-07',
      error: 'Manual puzzle lvl_0201 was saved for 2026-03-07, but publish failed: redis unavailable',
      publishState: 'saved_for_retry',
      recoverable: true,
      cleanupPerformed: false,
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.injectManualChallengeWithAdjustment({
      text: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
      author: 'TEST AUTHOR',
      targetDifficulty: 5,
      challengeType: 'QUOTE',
      allowAdjustment: true,
    });

    expect(result).toMatchObject({
      success: false,
      levelId: 'lvl_0201',
      error: 'Manual puzzle lvl_0201 was saved for 2026-03-07, but publish failed: redis unavailable',
      feedback,
    });
  });
});

describe('adminRouter community moderation actions', () => {
  it('returns a structured approval failure instead of throwing', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    approveCommunitySubmissionMock.mockRejectedValue(
      new Error('Submission is no longer pending.')
    );

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.approveCommunitySubmission({
      submissionId: 'sub_001',
    });

    expect(result).toEqual({
      success: false,
      message: 'Submission is no longer pending.',
      submission: null,
    });
  });

  it('returns a structured rejection failure instead of throwing', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    rejectCommunitySubmissionMock.mockRejectedValue(
      new Error('Add a short reason before rejecting.')
    );

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.rejectCommunitySubmission({
      submissionId: 'sub_001',
      reason: 'Needs attribution',
    });

    expect(result).toEqual({
      success: false,
      message: 'Add a short reason before rejecting.',
      submission: null,
    });
  });

  it('returns a structured removal failure instead of throwing', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    removeCommunityPuzzleMock.mockRejectedValue(
      new Error('Community puzzle is already removed.')
    );

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.removeCommunityPuzzle({
      submissionId: 'sub_001',
      reason: 'Content cleanup',
    });

    expect(result).toEqual({
      success: false,
      message: 'Community puzzle is already removed.',
      submission: null,
    });
  });

  it('keeps successful approval responses structured', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    approveCommunitySubmissionMock.mockResolvedValue(communitySubmission);

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.approveCommunitySubmission({
      submissionId: 'sub_001',
    });

    expect(result).toMatchObject({
      success: true,
      message: 'Approved as lvl_community001.',
      submission: communitySubmission,
    });
  });

  it('returns a structured request-changes response', async () => {
    hasAdminAccessMock.mockResolvedValue(true);
    requestCommunitySubmissionChangesMock.mockResolvedValue({
      ...communitySubmission,
      status: 'changes_requested',
      rejectionReason: 'Fix punctuation in the quote.',
    });

    const caller = adminRouter.createCaller({
      userId: 't2_mod',
      username: 'mod_user',
      subredditName: 'decrypttest',
      postId: 't3_context',
    });

    const result = await caller.requestCommunitySubmissionChanges({
      submissionId: 'sub_001',
      reason: 'Fix punctuation in the quote.',
    });

    expect(result).toMatchObject({
      success: true,
      message: 'Changes requested from creator.',
      submission: {
        status: 'changes_requested',
        rejectionReason: 'Fix punctuation in the quote.',
      },
    });
  });
});
