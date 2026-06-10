import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  activateDailyPuzzleMock,
  adjustPuzzleDifficultyMock,
  buildManualPuzzleWithSolverFallbackMock,
  computeAdaptiveHardnessBoundsMock,
  computeObstructionBudgetMock,
  computeObstructionBudgetSpentMock,
  computePhraseDifficultyProfileMock,
  createValidationPipelineMock,
  deriveSeedMock,
  difficultyToTierMock,
  formatDateKeyMock,
  generatePuzzleForDateMock,
  getAutoDailyLevelIdsForDateMock,
  getDecryptSettingsMock,
  getPuzzleMappingMock,
  getPuzzlePrivateMock,
  getPuzzlePublishedPostIdMock,
  injectManualPuzzleMock,
  mulberry32Mock,
  peekNextLevelIdMock,
  publishAndActivateDailyPostMock,
  deletePuzzleDataMock,
} = vi.hoisted(() => ({
  activateDailyPuzzleMock: vi.fn(),
  adjustPuzzleDifficultyMock: vi.fn(),
  buildManualPuzzleWithSolverFallbackMock: vi.fn(),
  computeAdaptiveHardnessBoundsMock: vi.fn(),
  computeObstructionBudgetMock: vi.fn(),
  computeObstructionBudgetSpentMock: vi.fn(),
  computePhraseDifficultyProfileMock: vi.fn(),
  createValidationPipelineMock: vi.fn(),
  deriveSeedMock: vi.fn(),
  difficultyToTierMock: vi.fn(),
  formatDateKeyMock: vi.fn(),
  generatePuzzleForDateMock: vi.fn(),
  getAutoDailyLevelIdsForDateMock: vi.fn(),
  getDecryptSettingsMock: vi.fn(),
  getPuzzleMappingMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  injectManualPuzzleMock: vi.fn(),
  mulberry32Mock: vi.fn(),
  peekNextLevelIdMock: vi.fn(),
  publishAndActivateDailyPostMock: vi.fn(),
  deletePuzzleDataMock: vi.fn(),
}));

				vi.mock('./puzzle-store', () => ({
        deletePuzzleData: deletePuzzleDataMock,
				  getAutoDailyLevelIdsForDate: getAutoDailyLevelIdsForDateMock,
				  getPuzzleMapping: getPuzzleMappingMock,
				  getNextLevelId: vi.fn(),
			  peekNextLevelId: peekNextLevelIdMock,
			  getPuzzlePrivate: getPuzzlePrivateMock,
			  getPuzzlePublishedPostId: getPuzzlePublishedPostIdMock,
		  reserveUsedSignature: vi.fn(),
  savePuzzle: vi.fn(),
  clearUsedSignature: vi.fn(),
}));

vi.mock('./generator', () => ({
  PuzzlePublishCommitError: class PuzzlePublishCommitError extends Error {},
  PuzzlePublishInProgressError: class PuzzlePublishInProgressError extends Error {},
  activateDailyPuzzle: activateDailyPuzzleMock,
  buildManualPuzzleWithSolverFallback: buildManualPuzzleWithSolverFallbackMock,
  generatePuzzleForDate: generatePuzzleForDateMock,
  injectManualPuzzle: injectManualPuzzleMock,
  publishAndActivateDailyPost: publishAndActivateDailyPostMock,
}));

vi.mock('./endless-catalog', () => ({
  activateEndlessCatalog: vi.fn(),
  getEndlessCatalogStatus: vi.fn(),
}));

vi.mock('./endless-audit', () => ({
  auditBundledEndlessStagingCollisions: vi.fn(),
}));

vi.mock('./content', () => ({
  containsDisallowedContent: () => false,
  computePhraseDifficultyProfile: computePhraseDifficultyProfileMock,
  difficultyToTier: difficultyToTierMock,
  normalizeContent: (value: string) => value.trim().toUpperCase(),
  rankDifficultyTiersForProfile: (
    _profile: unknown,
    _bounds?: unknown,
    candidateTiers: string[] = ['warmup', 'medium', 'hard', 'expert']
  ) => candidateTiers.map((tier, index) => ({ tier, score: index, issues: [] })),
  looksLikeAllowedAuthor: (value: string) => /^[A-Z0-9 .'-]+$/.test(value) && /[A-Z]/.test(value),
  maxPuzzleAuthorLength: 28,
  sanitizeAuthor: (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9 .'-]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  sanitizePhrase: (value: string) => value,
}));

			vi.mock('./puzzle', () => ({
			  adjustPuzzleDifficulty: adjustPuzzleDifficultyMock,
			  buildPublicPuzzle: vi.fn(),
			  buildPuzzle: vi.fn(),
			  computeObstructionBudget: computeObstructionBudgetMock,
        computeObstructionBudgetSpent: computeObstructionBudgetSpentMock,
			}));

vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: computeAdaptiveHardnessBoundsMock,
}));

vi.mock('./config', () => ({
  getDecryptSettings: getDecryptSettingsMock,
}));

vi.mock('./rng', () => ({
  deriveSeed: deriveSeedMock,
  mulberry32: mulberry32Mock,
}));

vi.mock('./serde', () => ({
  formatDateKey: formatDateKeyMock,
}));

vi.mock('./validation-pipeline', () => ({
  createValidationPipeline: createValidationPipelineMock,
}));

import {
  injectAndPublishManualPuzzle,
  preflightManualChallengeForPublish,
  publishLastGeneratedChallenge,
  rerollAndPublish,
} from './admin';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getAutoDailyLevelIdsForDateMock.mockResolvedValue([]);
  difficultyToTierMock.mockImplementation((difficulty: number) => {
    if (difficulty <= 3) return 'warmup';
    if (difficulty <= 5) return 'medium';
    if (difficulty <= 8) return 'hard';
    return 'expert';
  });
  computeAdaptiveHardnessBoundsMock.mockResolvedValue(undefined);
  getDecryptSettingsMock.mockResolvedValue({ logicalCipherPercent: 10 });
  computeObstructionBudgetSpentMock.mockReturnValue(0);
  peekNextLevelIdMock.mockResolvedValue('lvl_0200');
  getPuzzleMappingMock.mockResolvedValue(null);
  formatDateKeyMock.mockReturnValue('2026-03-08');
  deriveSeedMock.mockReturnValue(1234);
  mulberry32Mock.mockReturnValue(() => 0.5);
});

afterEach(() => {
  vi.restoreAllMocks();
  activateDailyPuzzleMock.mockReset();
  adjustPuzzleDifficultyMock.mockReset();
  buildManualPuzzleWithSolverFallbackMock.mockReset();
  computeAdaptiveHardnessBoundsMock.mockReset();
  computeObstructionBudgetMock.mockReset();
  computeObstructionBudgetSpentMock.mockReset();
  computePhraseDifficultyProfileMock.mockReset();
  createValidationPipelineMock.mockReset();
  deletePuzzleDataMock.mockReset();
  deriveSeedMock.mockReset();
  difficultyToTierMock.mockReset();
  formatDateKeyMock.mockReset();
  generatePuzzleForDateMock.mockReset();
  getAutoDailyLevelIdsForDateMock.mockReset();
  getDecryptSettingsMock.mockReset();
  getPuzzleMappingMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getPuzzlePublishedPostIdMock.mockReset();
  injectManualPuzzleMock.mockReset();
  mulberry32Mock.mockReset();
  peekNextLevelIdMock.mockReset();
  publishAndActivateDailyPostMock.mockReset();
});

describe('daily publish activation flows', () => {
  it('rerollAndPublish publishes and activates after generation', async () => {
    generatePuzzleForDateMock.mockResolvedValue({
      levelId: 'lvl_0100',
      dateKey: '2026-03-07',
    });
    publishAndActivateDailyPostMock.mockResolvedValue('t3_daily100');

    const result = await rerollAndPublish();

    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0100',
      dateKey: '2026-03-07',
      runAs: 'APP',
    });
    expect(generatePuzzleForDateMock).toHaveBeenCalledWith(expect.any(Date));
    expect(result).toEqual({
      levelId: 'lvl_0100',
      dateKey: '2026-03-07',
      postId: 't3_daily100',
    });
  });

  it('publishLastGeneratedChallenge repairs activation when the post already exists', async () => {
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0101']);
    getPuzzlePrivateMock.mockResolvedValue({
      dateKey: '2026-03-07',
    });
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing101');

    const result = await publishLastGeneratedChallenge();

    expect(activateDailyPuzzleMock).toHaveBeenCalledWith('lvl_0101');
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      levelId: 'lvl_0101',
      dateKey: '2026-03-07',
      postId: 't3_existing101',
      alreadyPublished: true,
    });
  });

  it('publishLastGeneratedChallenge finds an unpublished daily for today', async () => {
    getAutoDailyLevelIdsForDateMock.mockResolvedValue(['lvl_0200', 'lvl_0201']);
    getPuzzlePrivateMock.mockResolvedValue({
      dateKey: '2026-03-07',
      difficulty: 5,
      challengeType: 'QUOTE',
      author: 'AUTHOR',
      targetText: 'TEXT',
      words: ['TEXT'],
    });
    getPuzzlePublishedPostIdMock.mockResolvedValue(null);
    publishAndActivateDailyPostMock.mockResolvedValue('t3_new201');

    const result = await publishLastGeneratedChallenge();

    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0201',
      dateKey: '2026-03-07',
      runAs: 'APP',
    });
    expect(result).toMatchObject({
      levelId: 'lvl_0201',
      dateKey: '2026-03-07',
      postId: 't3_new201',
      alreadyPublished: false,
    });
  });

  it('injectAndPublishManualPuzzle uses the publish-and-activate path', async () => {
    injectManualPuzzleMock.mockResolvedValue({
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
      difficulty: 5,
    });
    publishAndActivateDailyPostMock.mockResolvedValue('t3_manual102');

    const result = await injectAndPublishManualPuzzle({
      text: 'ALWAYS TEST THE PUBLISH PATH',
      author: 'MODERATOR',
      difficulty: 5,
      challengeType: 'QUOTE',
    });

    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
      difficulty: 5,
      runAs: 'APP',
      forceNewPost: true,
    });
    expect(result).toEqual({
      success: true,
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
      postId: 't3_manual102',
      difficulty: 5,
      publishState: 'published',
      recoverable: false,
      cleanupPerformed: false,
    });
  });

  it('rolls back a saved manual puzzle when publish fails before a post is created', async () => {
    injectManualPuzzleMock.mockResolvedValue({
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
      difficulty: 5,
    });
    getPuzzlePrivateMock.mockResolvedValue({
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
      targetText: 'ALWAYS TEST THE PUBLISH PATH',
    });
    publishAndActivateDailyPostMock.mockRejectedValue(new Error('reddit unavailable'));

    const result = await injectAndPublishManualPuzzle({
      text: 'ALWAYS TEST THE PUBLISH PATH',
      author: 'MODERATOR',
      difficulty: 5,
      challengeType: 'QUOTE',
    });

    expect(result).toMatchObject({
      success: false,
      publishState: 'rolled_back',
      recoverable: false,
      cleanupPerformed: true,
    });
    expect(result.levelId).toBeUndefined();
  });

  it('rejects invalid author input before publishing manual puzzles', async () => {
    const result = await injectAndPublishManualPuzzle({
      text: 'ALWAYS TEST THE PUBLISH PATH',
      author: '!!!',
      difficulty: 5,
      challengeType: 'QUOTE',
      allowAdjustment: true,
    });

    expect(result).toMatchObject({
      success: false,
      error: "Invalid author. Use letters, numbers, spaces, . ' and - (max 28).",
    });
    expect(injectManualPuzzleMock).not.toHaveBeenCalled();
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
  });
});

describe('manual publish preflight', () => {
  it('rejects duplicates before attempting a preview build', async () => {
    computePhraseDifficultyProfileMock.mockReturnValue({
      cryptoHardness: 0.4,
      uniqueLetterCount: 12,
      oneLetterWordCount: 0,
      commonSuffixCount: 0,
    });
    createValidationPipelineMock.mockReturnValue({
      phase1: vi.fn().mockReturnValue({ valid: true, reasons: [] }),
      phase2: vi.fn().mockReturnValue({ valid: true, reasons: [] }),
      duplicate: vi.fn().mockResolvedValue({
        duplicate: true,
        reason: 'exact signature match',
        normalizedSignature: 'TEXT',
        tokenSignature: 'TEXT',
      }),
    });

    const result = await preflightManualChallengeForPublish({
      text: 'TEXT',
      difficulty: 5,
      challengeType: 'QUOTE',
    });

    expect(result.valid).toBe(false);
    expect(result.reasons[0]).toContain('conflicts with existing content');
    expect(buildManualPuzzleWithSolverFallbackMock).not.toHaveBeenCalled();
  });

  it('rejects selected manual preferences that fail the board probe', async () => {
    computePhraseDifficultyProfileMock.mockReturnValue({
      cryptoHardness: 0.4,
      uniqueLetterCount: 12,
      oneLetterWordCount: 0,
      commonSuffixCount: 0,
    });
    createValidationPipelineMock.mockReturnValue({
      phase1: vi.fn((_: string, difficulty: number) => ({
        valid: difficulty === 2 || difficulty === 5 || difficulty === 8,
        reasons: [],
      })),
      phase2: vi.fn().mockReturnValue({ valid: true, reasons: [] }),
      duplicate: vi.fn().mockResolvedValue({
        duplicate: false,
        normalizedSignature: 'TEXT',
        tokenSignature: 'TEXT',
      }),
    });
    buildManualPuzzleWithSolverFallbackMock.mockReturnValue({
      puzzlePrivate: {
        levelId: 'lvl_0200',
        difficulty: 5,
        cipherType: 'random',
        prefilledIndices: [],
        blindIndices: [],
        padlockChains: [],
      },
      puzzlePublic: {},
    });
    computeObstructionBudgetMock.mockReturnValue({ total: 20, spent: 0 });
    adjustPuzzleDifficultyMock
      .mockResolvedValueOnce({
        success: true,
        puzzle: { levelId: 'lvl_0200', difficulty: 2 },
        achievedDifficulty: 2,
        achievableTierRange: ['warmup'],
        adjustmentLog: [],
        budgetUsed: 0,
        budgetTotal: 20,
      })
      .mockResolvedValueOnce({
        success: false,
        puzzle: { levelId: 'lvl_0200', difficulty: 5 },
        achievedDifficulty: 5,
        achievableTierRange: ['medium'],
        adjustmentLog: [],
        budgetUsed: 0,
        budgetTotal: 20,
        reason: 'No valid adjustments available within budget',
      });

    const result = await preflightManualChallengeForPublish({
      text: 'TEXT',
      difficulty: 8,
      challengeType: 'QUOTE',
    });

    expect(result.valid).toBe(false);
    expect(result.achievableTierRange).toEqual(['warmup', 'medium']);
    expect(result.reasons[0]).toContain('Could not build a fair hard puzzle');
    expect(result.reasons[0]).toContain('Achievable tiers from preview: warmup, medium');
  });

  it('surfaces precise convergence failures for fair-build preflight misses', async () => {
    computePhraseDifficultyProfileMock.mockReturnValue({
      cryptoHardness: 0.57,
      uniqueLetterCount: 16,
      oneLetterWordCount: 0,
      commonSuffixCount: 0,
    });
    createValidationPipelineMock.mockReturnValue({
      phase1: vi.fn((_: string, difficulty: number) => ({
        valid: difficulty === 5 || difficulty === 8,
        reasons: [],
      })),
      phase2: vi.fn().mockReturnValue({ valid: true, reasons: [] }),
      duplicate: vi.fn().mockResolvedValue({
        duplicate: false,
        normalizedSignature: 'TEXT',
        tokenSignature: 'TEXT',
      }),
    });
    buildManualPuzzleWithSolverFallbackMock.mockReturnValue({
      puzzlePrivate: {
        levelId: 'lvl_0200',
        difficulty: 8,
        cipherType: 'random',
        prefilledIndices: [1, 2],
        blindIndices: [3, 4],
        padlockChains: [{ chainId: 1, keyIndices: [5], lockedIndices: [6, 7] }],
      },
      puzzlePublic: {},
    });
    computeObstructionBudgetMock.mockReturnValue({ total: 115, spent: 0 });
    adjustPuzzleDifficultyMock
      .mockResolvedValueOnce({
        success: false,
        puzzle: { levelId: 'lvl_0200', difficulty: 10 },
        achievedDifficulty: 10,
        achievableTierRange: ['hard'],
        adjustmentLog: ['Add prefilled letter (cost: -5)'],
        budgetUsed: 0,
        budgetTotal: 115,
        reason: 'Max iterations reached without convergence',
      })
      .mockResolvedValueOnce({
        success: true,
        puzzle: { levelId: 'lvl_0200', difficulty: 8 },
        achievedDifficulty: 8,
        achievableTierRange: ['hard'],
        adjustmentLog: [],
        budgetUsed: 0,
        budgetTotal: 115,
      });

    const result = await preflightManualChallengeForPublish({
      text: 'TEXT',
      difficulty: 5,
      challengeType: 'QUOTE',
    });

    expect(result.valid).toBe(false);
    expect(result.reasons[0]).toContain('Could not build a fair medium puzzle');
    expect(result.reasons[0]).toContain('Natural fit:');
    expect(result.reasons[0]).toContain('did not converge within 5 adjustment steps');
    expect(result.reasons[0]).toContain('Achievable tiers from preview: hard');
  });

  it('blocks direct adjusted publish calls when preflight fails', async () => {
    computePhraseDifficultyProfileMock.mockReturnValue({
      cryptoHardness: 0.4,
      uniqueLetterCount: 12,
      oneLetterWordCount: 0,
      commonSuffixCount: 0,
    });
    createValidationPipelineMock.mockReturnValue({
      phase1: vi.fn().mockReturnValue({ valid: true, reasons: [] }),
      phase2: vi.fn().mockReturnValue({ valid: true, reasons: [] }),
      duplicate: vi.fn().mockResolvedValue({
        duplicate: true,
        reason: 'exact signature match',
        normalizedSignature: 'TEXT',
        tokenSignature: 'TEXT',
      }),
    });

    const result = await injectAndPublishManualPuzzle({
      text: 'TEXT',
      author: 'MODERATOR',
      difficulty: 5,
      challengeType: 'QUOTE',
      allowAdjustment: true,
    });

    expect(result).toMatchObject({
      success: false,
      error: 'Text conflicts with existing content: exact signature match.',
    });
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
  });
});
