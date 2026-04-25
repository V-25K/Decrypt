import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  formatModeratorRerollErrorMock,
  hasAdminAccessMock,
  injectAndPublishManualPuzzleMock,
  injectManualChallengeWithAdjustmentMock,
  preflightManualChallengeForPublishMock,
  publishAndActivateDailyPostMock,
  rerollAndPublishMock,
} = vi.hoisted(() => ({
  formatModeratorRerollErrorMock: vi.fn(),
  hasAdminAccessMock: vi.fn(),
  injectAndPublishManualPuzzleMock: vi.fn(),
  injectManualChallengeWithAdjustmentMock: vi.fn(),
  preflightManualChallengeForPublishMock: vi.fn(),
  publishAndActivateDailyPostMock: vi.fn(),
  rerollAndPublishMock: vi.fn(),
}));

vi.mock('../../core/admin-auth', () => ({
  hasAdminAccess: hasAdminAccessMock,
}));

vi.mock('../../core/admin', () => ({
  activateEndlessCatalogVersion: vi.fn(),
  formatModeratorRerollError: formatModeratorRerollErrorMock,
  getEndlessCatalogAdminStatus: vi.fn(),
  getEndlessStagingCollisionReport: vi.fn(),
  injectAndPublishManualPuzzle: injectAndPublishManualPuzzleMock,
  injectManualChallengeWithAdjustment: injectManualChallengeWithAdjustmentMock,
  preflightManualChallengeForPublish: preflightManualChallengeForPublishMock,
  rerollAndPublish: rerollAndPublishMock,
}));

vi.mock('../../core/generator', () => ({
  publishAndActivateDailyPost: publishAndActivateDailyPostMock,
}));

vi.mock('../../core/difficulty-calibration', () => ({
  getGlobalDailyCalibrationSnapshot: vi.fn(),
}));

vi.mock('../../core/metrics', () => ({
  getMetricsSnapshot: vi.fn(),
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

afterEach(() => {
  formatModeratorRerollErrorMock.mockReset();
  hasAdminAccessMock.mockReset();
  injectAndPublishManualPuzzleMock.mockReset();
  injectManualChallengeWithAdjustmentMock.mockReset();
  preflightManualChallengeForPublishMock.mockReset();
  publishAndActivateDailyPostMock.mockReset();
  rerollAndPublishMock.mockReset();
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
    });

    expect(preflightManualChallengeForPublishMock).toHaveBeenCalledWith({
      text: 'JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS',
      difficulty: 2,
      challengeType: 'QUOTE',
    });
    expect(result).toMatchObject({
      valid: false,
      naturalDifficulty: 'expert',
      achievableTierRange: ['hard', 'expert'],
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
    publishAndActivateDailyPostMock.mockResolvedValue('t3_manual200');

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

    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0200',
      dateKey: '2026-03-07',
      runAs: 'APP',
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
      text: 'TO BE OR NOT TO BE',
      author: 'TEST AUTHOR',
      targetDifficulty: 9,
      challengeType: 'QUOTE',
      allowAdjustment: true,
    });

    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
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
    publishAndActivateDailyPostMock.mockRejectedValue(new Error('reddit unavailable'));

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
      error: 'Puzzle saved as lvl_0201, but publish failed: reddit unavailable',
      feedback,
    });
  });
});
