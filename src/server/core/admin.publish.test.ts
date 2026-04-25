import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  activateDailyPuzzleMock,
  adjustPuzzleDifficultyMock,
  buildManualPuzzleWithSolverFallbackMock,
  computeAdaptiveHardnessBoundsMock,
  computeObstructionBudgetMock,
  computePhraseDifficultyProfileMock,
  createValidationPipelineMock,
  clearStagedLevelIdMock,
  deriveSeedMock,
  difficultyToTierMock,
  formatDateKeyMock,
  generatePuzzleForDateMock,
  getAutoDailyLevelIdsForDateMock,
  getDecryptSettingsMock,
  getPuzzleMappingMock,
  getPuzzlePrivateMock,
  getPuzzlePublishedPostIdMock,
  getStagedLevelIdMock,
  injectManualPuzzleMock,
  mulberry32Mock,
  peekNextLevelIdMock,
  publishAndActivateDailyPostMock,
} = vi.hoisted(() => ({
  activateDailyPuzzleMock: vi.fn(),
  adjustPuzzleDifficultyMock: vi.fn(),
  buildManualPuzzleWithSolverFallbackMock: vi.fn(),
  computeAdaptiveHardnessBoundsMock: vi.fn(),
  computeObstructionBudgetMock: vi.fn(),
  computePhraseDifficultyProfileMock: vi.fn(),
  createValidationPipelineMock: vi.fn(),
  clearStagedLevelIdMock: vi.fn(),
  deriveSeedMock: vi.fn(),
  difficultyToTierMock: vi.fn(),
  formatDateKeyMock: vi.fn(),
  generatePuzzleForDateMock: vi.fn(),
  getAutoDailyLevelIdsForDateMock: vi.fn(),
  getDecryptSettingsMock: vi.fn(),
  getPuzzleMappingMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  getStagedLevelIdMock: vi.fn(),
  injectManualPuzzleMock: vi.fn(),
  mulberry32Mock: vi.fn(),
  peekNextLevelIdMock: vi.fn(),
  publishAndActivateDailyPostMock: vi.fn(),
}));

		vi.mock('./puzzle-store', () => ({
		  clearStagedLevelId: clearStagedLevelIdMock,
		  getAutoDailyLevelIdsForDate: getAutoDailyLevelIdsForDateMock,
		  getPuzzleMapping: getPuzzleMappingMock,
		  getNextLevelId: vi.fn(),
		  peekNextLevelId: peekNextLevelIdMock,
		  getPuzzlePrivate: getPuzzlePrivateMock,
		  getPuzzlePublishedPostId: getPuzzlePublishedPostIdMock,
		  getStagedLevelId: getStagedLevelIdMock,
	  reserveUsedSignature: vi.fn(),
  savePuzzle: vi.fn(),
  clearUsedSignature: vi.fn(),
}));

vi.mock('./generator', () => ({
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
  computePhraseDifficultyProfile: computePhraseDifficultyProfileMock,
  difficultyToTier: difficultyToTierMock,
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
  getAutoDailyLevelIdsForDateMock.mockResolvedValue([]);
  difficultyToTierMock.mockImplementation((difficulty: number) => {
    if (difficulty <= 3) return 'warmup';
    if (difficulty <= 5) return 'medium';
    if (difficulty <= 8) return 'hard';
    return 'expert';
  });
  computeAdaptiveHardnessBoundsMock.mockResolvedValue(undefined);
  getDecryptSettingsMock.mockResolvedValue({ logicalCipherPercent: 10 });
  peekNextLevelIdMock.mockResolvedValue('lvl_0200');
  getPuzzleMappingMock.mockResolvedValue(null);
  formatDateKeyMock.mockReturnValue('2026-03-08');
  deriveSeedMock.mockReturnValue(1234);
  mulberry32Mock.mockReturnValue(() => 0.5);
});

afterEach(() => {
  activateDailyPuzzleMock.mockReset();
  adjustPuzzleDifficultyMock.mockReset();
  buildManualPuzzleWithSolverFallbackMock.mockReset();
  computeAdaptiveHardnessBoundsMock.mockReset();
  computeObstructionBudgetMock.mockReset();
  computePhraseDifficultyProfileMock.mockReset();
  createValidationPipelineMock.mockReset();
  clearStagedLevelIdMock.mockReset();
  deriveSeedMock.mockReset();
  difficultyToTierMock.mockReset();
  formatDateKeyMock.mockReset();
  generatePuzzleForDateMock.mockReset();
  getAutoDailyLevelIdsForDateMock.mockReset();
  getDecryptSettingsMock.mockReset();
  getPuzzleMappingMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getPuzzlePublishedPostIdMock.mockReset();
  getStagedLevelIdMock.mockReset();
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
    expect(generatePuzzleForDateMock).toHaveBeenCalledWith(expect.any(Date), {
      allowSelectionRefill: true,
    });
    expect(result).toEqual({
      levelId: 'lvl_0100',
      dateKey: '2026-03-07',
      postId: 't3_daily100',
    });
  });

  it('publishLastGeneratedChallenge repairs activation when the post already exists', async () => {
    getStagedLevelIdMock.mockResolvedValue('lvl_0101');
    getPuzzlePrivateMock.mockResolvedValue({
      dateKey: '2026-03-07',
    });
    getPuzzlePublishedPostIdMock.mockResolvedValue('t3_existing101');

    const result = await publishLastGeneratedChallenge();

    expect(activateDailyPuzzleMock).toHaveBeenCalledWith('lvl_0101');
    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
    expect(clearStagedLevelIdMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      levelId: 'lvl_0101',
      dateKey: '2026-03-07',
      postId: 't3_existing101',
      alreadyPublished: true,
    });
  });

  it('publishLastGeneratedChallenge finds an unpublished tomorrow daily when the staged pointer is missing', async () => {
    getStagedLevelIdMock.mockResolvedValue(null);
    getAutoDailyLevelIdsForDateMock
      .mockResolvedValueOnce(['lvl_0200', 'lvl_0201'])
      .mockResolvedValueOnce([]);
    getPuzzlePrivateMock.mockResolvedValue({
      dateKey: '2026-03-08',
      difficulty: 5,
      challengeType: 'QUOTE',
      author: 'AUTHOR',
      targetText: 'TEXT',
      words: ['TEXT'],
    });
    getPuzzlePublishedPostIdMock
      .mockResolvedValueOnce('t3_existing200')
      .mockResolvedValueOnce(null);
    publishAndActivateDailyPostMock.mockResolvedValue('t3_new201');

    const result = await publishLastGeneratedChallenge();

    expect(publishAndActivateDailyPostMock).toHaveBeenCalledWith({
      levelId: 'lvl_0200',
      dateKey: '2026-03-08',
      runAs: 'APP',
    });
    expect(result).toEqual({
      levelId: 'lvl_0200',
      dateKey: '2026-03-08',
      postId: 't3_new201',
      alreadyPublished: false,
    });
    expect(clearStagedLevelIdMock).not.toHaveBeenCalled();
  });

  it('injectAndPublishManualPuzzle uses the publish-and-activate path', async () => {
    injectManualPuzzleMock.mockResolvedValue({
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
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
      runAs: 'APP',
    });
    expect(result).toEqual({
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
      postId: 't3_manual102',
    });
  });

  it('injectAndPublishManualPuzzle preserves the saved level id when publish fails', async () => {
    injectManualPuzzleMock.mockResolvedValue({
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
    });
    publishAndActivateDailyPostMock.mockRejectedValue(new Error('reddit unavailable'));

    await expect(
      injectAndPublishManualPuzzle({
        text: 'ALWAYS TEST THE PUBLISH PATH',
        author: 'MODERATOR',
        difficulty: 5,
        challengeType: 'QUOTE',
      })
    ).rejects.toMatchObject({
      name: 'ManualPuzzlePublishFailedError',
      levelId: 'lvl_0102',
      dateKey: '2026-03-08',
    });
  });

  it('rejects invalid author input before publishing manual puzzles', async () => {
    await expect(
      injectAndPublishManualPuzzle({
        text: 'ALWAYS TEST THE PUBLISH PATH',
        author: '!!!',
        difficulty: 5,
        challengeType: 'QUOTE',
        allowAdjustment: true,
      })
    ).rejects.toThrow("Invalid author. Use letters, numbers, spaces, . ' and - (max 28).");

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

  it('removes tiers from the achievable list when the dry-run adjuster cannot really reach them', async () => {
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
    expect(result.reasons[0]).toContain('Target tier hard not achievable');
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

    await expect(
      injectAndPublishManualPuzzle({
        text: 'TEXT',
        author: 'MODERATOR',
        difficulty: 5,
        challengeType: 'QUOTE',
        allowAdjustment: true,
      })
    ).rejects.toMatchObject({
      name: 'ManualChallengePreflightFailedError',
    });

    expect(publishAndActivateDailyPostMock).not.toHaveBeenCalled();
  });
});
