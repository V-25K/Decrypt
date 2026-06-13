import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PuzzlePrivate } from '../../shared/game';

const {
  fitLineToTiersMock,
  getCachedFittedLayoutMock,
  getLevelEngagementMock,
  getPuzzlePrivateMock,
  getUsedSignatureOwnerMock,
  replacePuzzleDataInPlaceMock,
} = vi.hoisted(() => ({
  fitLineToTiersMock: vi.fn(),
  getCachedFittedLayoutMock: vi.fn(),
  getLevelEngagementMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getUsedSignatureOwnerMock: vi.fn(),
  replacePuzzleDataInPlaceMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: { subredditName: 'decrypttest_dev', username: 'mod' },
  reddit: {},
  redis: {},
}));
vi.mock('./puzzle-store', () => ({
  getAutoDailyLevelIdsForDate: vi.fn(),
  getLevelIdForPost: vi.fn(),
  getPuzzleMapping: vi.fn().mockResolvedValue(null),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublishedPostId: vi.fn(),
  getUsedSignatureOwner: getUsedSignatureOwnerMock,
  deletePuzzleData: vi.fn(),
  peekNextLevelId: vi.fn(),
  replacePuzzleDataInPlace: replacePuzzleDataInPlaceMock,
  reserveUsedSignature: vi.fn(),
  clearUsedSignature: vi.fn(),
}));
vi.mock('./engagement', () => ({
  getLevelEngagement: getLevelEngagementMock,
}));
vi.mock('./board-fit-service', () => ({
  fitLineToTiers: fitLineToTiersMock,
  getCachedFittedLayout: getCachedFittedLayoutMock,
}));
vi.mock('./generator', () => ({
  activateDailyPuzzle: vi.fn(),
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: vi.fn(),
  generatePuzzleForDate: vi.fn(),
  injectManualPuzzle: vi.fn(),
  PuzzleGenerationFailedError: class extends Error {},
  PuzzleGenerationInProgressError: class extends Error {},
  PuzzlePublishCommitError: class extends Error {},
  PuzzlePublishInProgressError: class extends Error {},
  publishAndActivateDailyPost: vi.fn(),
}));
vi.mock('./config', () => ({
  getDecryptSettings: vi.fn().mockResolvedValue({ logicalCipherPercent: 100 }),
}));
vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./metrics', () => ({
  trackDifficultyAdjustment: vi.fn(),
}));
vi.mock('./endless-catalog', () => ({
  activateEndlessCatalog: vi.fn(),
  getEndlessCatalogStatus: vi.fn(),
}));
vi.mock('./endless-audit', () => ({
  auditBundledEndlessStagingCollisions: vi.fn(),
}));

import { applyChallengeEdit } from './admin';
import { buildPuzzle } from './puzzle';
import { fitBoardToTier } from './tier-fitter';

const sampleText = 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO';

const injectedPuzzle = (): PuzzlePrivate =>
  buildPuzzle({
    levelId: 'lvl_0042',
    dateKey: '2026-06-10',
    text: sampleText,
    author: 'OLD AUTHOR',
    challengeType: 'QUOTE',
    source: 'MANUAL_INJECTED',
    difficulty: 5,
    logicalPercent: 100,
    previousMapping: null,
    skipSolvabilityCheck: true,
    applyObstructionsOnSkip: false,
  }).puzzlePrivate;

describe('applyChallengeEdit', () => {
  beforeEach(() => {
    fitLineToTiersMock.mockReset();
    getCachedFittedLayoutMock.mockReset();
    getLevelEngagementMock.mockReset();
    getPuzzlePrivateMock.mockReset();
    getUsedSignatureOwnerMock.mockReset();
    replacePuzzleDataInPlaceMock.mockReset();
    getUsedSignatureOwnerMock.mockResolvedValue(null);
  });

  it('allows fixing the author credit even after plays', async () => {
    getPuzzlePrivateMock.mockResolvedValue(injectedPuzzle());
    getLevelEngagementMock.mockResolvedValue({ plays: 12 });

    const result = await applyChallengeEdit({
      levelId: 'lvl_0042',
      text: sampleText,
      author: 'New Author',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Author updated');
    expect(replacePuzzleDataInPlaceMock).toHaveBeenCalledTimes(1);
    const replaced = replacePuzzleDataInPlaceMock.mock.calls[0]?.[0] as {
      puzzlePrivate: PuzzlePrivate;
    };
    expect(replaced.puzzlePrivate.author).toBe('NEW AUTHOR');
    expect(replaced.puzzlePrivate.targetText).toBe(sampleText);
  });

  it('allows editing the line even after the board has plays', { timeout: 30_000 }, async () => {
    getPuzzlePrivateMock.mockResolvedValue(injectedPuzzle());
    getLevelEngagementMock.mockResolvedValue({ plays: 7 });
    const newText = 'JUDGE EACH DAY BY THE SEEDS THAT YOU PLANT NOT THE HARVEST YOU REAP';
    const fitted = fitBoardToTier({
      text: newText,
      tier: 'medium',
      dateKey: '2026-06-10',
      author: 'NEW AUTHOR',
      challengeType: 'QUOTE',
      logicalPercent: 100,
    });
    expect(fitted.fitted).toBe(true);
    if (!fitted.fitted) {
      return;
    }
    getCachedFittedLayoutMock.mockResolvedValue(fitted.layout);

    const result = await applyChallengeEdit({
      levelId: 'lvl_0042',
      text: newText,
      author: 'New Author',
    });

    expect(result.success).toBe(true);
    expect(replacePuzzleDataInPlaceMock).toHaveBeenCalledTimes(1);
  });

  it('refuses community challenges', async () => {
    getPuzzlePrivateMock.mockResolvedValue({
      ...injectedPuzzle(),
      source: 'COMMUNITY',
    });

    const result = await applyChallengeEdit({
      levelId: 'lvl_0042',
      text: sampleText,
      author: 'New Author',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Request Changes');
  });

  it('lists the available tiers when the requested tier does not fit', async () => {
    getPuzzlePrivateMock.mockResolvedValue(injectedPuzzle());
    getLevelEngagementMock.mockResolvedValue({ plays: 0 });
    getCachedFittedLayoutMock.mockResolvedValue(null);
    fitLineToTiersMock.mockResolvedValue({
      textHash: 'hash',
      layoutVersion: 'v1',
      textValid: true,
      reasons: [],
      suggestedTier: 'medium',
      tiers: [
        { tier: 'warmup', feasible: true, reason: null, summary: null },
        { tier: 'medium', feasible: true, reason: null, summary: null },
        { tier: 'hard', feasible: false, reason: null, summary: null },
        { tier: 'expert', feasible: false, reason: 'Too short.', summary: null },
      ],
    });

    const result = await applyChallengeEdit({
      levelId: 'lvl_0042',
      text: 'JUDGE EACH DAY BY THE SEEDS THAT YOU PLANT NOT THE HARVEST',
      author: 'OLD AUTHOR',
    });

    expect(result.success).toBe(false);
    // The existing tier (Medium, difficulty 5) doesn't fit the new line; the
    // message names the tiers that do, since difficulty can only change via
    // re-inject.
    expect(result.message).toContain('It fits: Easy, Medium');
    expect(replacePuzzleDataInPlaceMock).not.toHaveBeenCalled();
  });

  it('rebuilds and replaces the board in place for an unplayed challenge', { timeout: 30_000 }, async () => {
    getPuzzlePrivateMock.mockResolvedValue(injectedPuzzle());
    getLevelEngagementMock.mockResolvedValue({ plays: 0 });
    const newText = 'JUDGE EACH DAY BY THE SEEDS THAT YOU PLANT NOT THE HARVEST YOU REAP';
    const fitted = fitBoardToTier({
      text: newText,
      tier: 'medium',
      dateKey: '2026-06-10',
      author: 'NEW AUTHOR',
      challengeType: 'QUOTE',
      logicalPercent: 100,
    });
    expect(fitted.fitted).toBe(true);
    if (!fitted.fitted) {
      return;
    }
    getCachedFittedLayoutMock.mockResolvedValue(fitted.layout);

    const result = await applyChallengeEdit({
      levelId: 'lvl_0042',
      text: newText,
      author: 'New Author',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Challenge line updated');
    expect(replacePuzzleDataInPlaceMock).toHaveBeenCalledTimes(1);
    const replaced = replacePuzzleDataInPlaceMock.mock.calls[0]?.[0] as {
      levelId: string;
      puzzlePrivate: PuzzlePrivate;
      previousNormalizedSignature?: string | null;
    };
    expect(replaced.levelId).toBe('lvl_0042');
    expect(replaced.puzzlePrivate.targetText).toBe(newText);
    expect(replaced.puzzlePrivate.prefilledIndices).toEqual(
      fitted.layout.prefilledIndices
    );
    expect(replaced.previousNormalizedSignature).toBeTruthy();
  });
});
