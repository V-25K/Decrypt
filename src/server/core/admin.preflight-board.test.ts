import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzlePrivate } from '../../shared/game';
import type { DifficultyTier, PhraseDifficultyProfile } from './content';

const {
  adjustPuzzleDifficultyMock,
  buildChallengeEvaluationMock,
  buildManualPuzzleWithSolverFallbackMock,
  computeAdaptiveHardnessBoundsMock,
  createValidationPipelineMock,
  getDecryptSettingsMock,
  getPuzzleMappingMock,
  peekNextLevelIdMock,
} = vi.hoisted(() => ({
  adjustPuzzleDifficultyMock: vi.fn(),
  buildChallengeEvaluationMock: vi.fn(),
  buildManualPuzzleWithSolverFallbackMock: vi.fn(),
  computeAdaptiveHardnessBoundsMock: vi.fn(),
  createValidationPipelineMock: vi.fn(),
  getDecryptSettingsMock: vi.fn(),
  getPuzzleMappingMock: vi.fn(),
  peekNextLevelIdMock: vi.fn(),
}));

vi.mock('./content', () => {
  const difficultyToTier = (difficulty: number): DifficultyTier => {
    if (difficulty <= 3) {
      return 'warmup';
    }
    if (difficulty <= 6) {
      return 'medium';
    }
    if (difficulty <= 8) {
      return 'hard';
    }
    return 'expert';
  };

  const profile: PhraseDifficultyProfile = {
    totalLength: 32,
    totalLetters: 28,
    wordCount: 5,
    uniqueWordCount: 5,
    uniqueWordRatio: 1,
    repeatedWordRatio: 0,
    averageWordLength: 5.6,
    uniqueLetterCount: 18,
    letterEntropy: 4,
    bigramEntropy: 4,
    oneLetterWordCount: 0,
    twoLetterWordCount: 0,
    commonSuffixCount: 0,
    commonBigramRatio: 0.3,
    lexiconCoverageRatio: 0.8,
    topCommonWordRatio: 0.1,
    rareWordRatio: 0.2,
    anchorWordCount: 1,
    shortWordAnchorCount: 0,
    commonPatternCount: 0,
    repeatedPatternScore: 0,
    anchorDensity: 0.2,
    cryptoHardness: 0.75,
  };

  return {
    containsDisallowedContent: () => false,
    computePhraseDifficultyProfile: () => profile,
    difficultyToTier,
    looksLikeAllowedAuthor: () => true,
    maxPuzzleAuthorLength: 28,
    normalizeContent: (input: string) => input.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    rankDifficultyTiersForProfile: (
      _profile: PhraseDifficultyProfile,
      _bounds: unknown,
      candidateTiers: DifficultyTier[] = ['warmup', 'medium', 'hard', 'expert']
    ) =>
      ['hard', 'medium', 'expert', 'warmup']
        .filter((tier) => candidateTiers.includes(tier))
        .map((tier, index) => ({ tier, score: 100 - index })),
    sanitizeAuthor: (input: string) => input.trim().toUpperCase(),
    sanitizePhrase: (input: string) => input.trim().toUpperCase(),
  };
});

vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: computeAdaptiveHardnessBoundsMock,
}));

vi.mock('./config', () => ({
  getDecryptSettings: getDecryptSettingsMock,
}));

vi.mock('./puzzle-store', () => ({
  clearUsedSignature: vi.fn(),
  deletePuzzleData: vi.fn(),
  getAutoDailyLevelIdsForDate: vi.fn(),
  getPuzzleMapping: getPuzzleMappingMock,
  getPuzzlePrivate: vi.fn(),
  getPuzzlePublishedPostId: vi.fn(),
  peekNextLevelId: peekNextLevelIdMock,
  reserveUsedSignature: vi.fn(),
}));

vi.mock('./generator', () => ({
  activateDailyPuzzle: vi.fn(),
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: buildManualPuzzleWithSolverFallbackMock,
  generatePuzzleForDate: vi.fn(),
  injectManualPuzzle: vi.fn(),
  publishAndActivateDailyPost: vi.fn(),
  PuzzleGenerationFailedError: class PuzzleGenerationFailedError extends Error {},
  PuzzleGenerationInProgressError: class PuzzleGenerationInProgressError extends Error {},
  PuzzlePublishCommitError: class PuzzlePublishCommitError extends Error {},
  PuzzlePublishInProgressError: class PuzzlePublishInProgressError extends Error {},
}));

vi.mock('./puzzle', () => ({
  adjustPuzzleDifficulty: adjustPuzzleDifficultyMock,
  buildPublicPuzzle: vi.fn(),
  computeObstructionBudget: () => ({ total: 100, spent: 0 }),
  computeObstructionBudgetSpent: () => 10,
}));

vi.mock('./challenge-evaluation', () => ({
  buildChallengeEvaluation: buildChallengeEvaluationMock,
}));

vi.mock('./rng', () => ({
  deriveSeed: () => 123,
  mulberry32: () => () => 0.5,
}));

vi.mock('./validation-pipeline', () => ({
  createValidationPipeline: createValidationPipelineMock,
}));

import { preflightManualChallengeForPublish } from './admin';

const puzzleFixture = (difficulty: number): PuzzlePrivate => ({
  levelId: 'lvl_preview',
  dateKey: '2026-06-08',
  targetText: 'BRIGHT MINDS SOLVE HARD THINGS',
  author: 'PREVIEW',
  challengeType: 'QUOTE',
  source: 'MANUAL_INJECTED',
  cipherType: 'random',
  shiftAmount: null,
  mapping: {},
  reverseMapping: {},
  tiles: [],
  words: ['BRIGHT', 'MINDS', 'SOLVE', 'HARD', 'THINGS'],
  prefilledIndices: [0],
  revealedIndices: [0],
  revealed_indices: [0],
  lockIndices: [],
  blindIndices: [],
  goldIndex: null,
  padlockChains: [],
  difficulty,
  isLogical: false,
  createdAt: 1770000000000,
});

describe('preflightManualChallengeForPublish board achievability', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    adjustPuzzleDifficultyMock.mockReset();
    buildChallengeEvaluationMock.mockReset();
    buildManualPuzzleWithSolverFallbackMock.mockReset();
    computeAdaptiveHardnessBoundsMock.mockReset();
    createValidationPipelineMock.mockReset();
    getDecryptSettingsMock.mockReset();
    getPuzzleMappingMock.mockReset();
    peekNextLevelIdMock.mockReset();
  });

  it('only returns tiers that can pass the board build and adjustment probe', async () => {
    computeAdaptiveHardnessBoundsMock.mockResolvedValue(undefined);
    getDecryptSettingsMock.mockResolvedValue({ logicalCipherPercent: 50 });
    peekNextLevelIdMock.mockResolvedValue('lvl_preview');
    getPuzzleMappingMock.mockResolvedValue(null);
    createValidationPipelineMock.mockReturnValue({
      phase1: (_text: string, difficulty: number) => ({
        valid: difficulty !== 2,
        reasons: difficulty === 2 ? ['warmup rejected'] : [],
      }),
      duplicate: async () => ({
        duplicate: false,
        normalizedSignature: 'BRIGHTMINDSSOLVEHARDTHINGS',
        tokenSignature: 'BRIGHT MINDS SOLVE HARD THINGS',
      }),
      phase2: () => ({ valid: true, reasons: [] }),
    });
    buildManualPuzzleWithSolverFallbackMock.mockReturnValue({
      puzzlePrivate: puzzleFixture(8),
      puzzlePublic: {
        levelId: 'lvl_preview',
        dateKey: '2026-06-08',
        author: 'PREVIEW',
        challengeType: 'QUOTE',
        words: [],
        tiles: [],
        difficulty: 8,
        heartsMax: 3,
      },
    });
    adjustPuzzleDifficultyMock.mockImplementation(
      async (params: { targetDifficulty: number }) => {
        if (params.targetDifficulty === 9) {
          return {
            success: false,
            reason: 'expert board could not be stabilized',
            puzzle: null,
            adjustmentLog: [],
            budgetUsed: 10,
            budgetTotal: 100,
            achievableTierRange: ['hard', 'medium'],
          };
        }
        return {
          success: true,
          puzzle: puzzleFixture(params.targetDifficulty),
          adjustmentLog: ['adjusted'],
          budgetUsed: 20,
          budgetTotal: 100,
          achievableTierRange: ['hard', 'medium'],
        };
      }
    );
    buildChallengeEvaluationMock.mockReturnValue({
      difficultyBreakdown: undefined,
      summary: undefined,
    });

    const result = await preflightManualChallengeForPublish({
      text: 'Bright minds solve hard things',
      challengeType: 'QUOTE',
    });

    expect(result.valid).toBe(true);
    expect(result.achievableTierRange).toContain('hard');
    expect(result.achievableTierRange).toContain('medium');
    expect(result.achievableTierRange).not.toContain('expert');
  });
});
