import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LineFitReport } from './board-fit-service';

const { fitLineToTiersMock, getCachedFittedLayoutMock, redisMock } = vi.hoisted(
  () => ({
    fitLineToTiersMock: vi.fn(),
    getCachedFittedLayoutMock: vi.fn(),
    redisMock: {
      hGet: vi.fn(),
    },
  })
);

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

vi.mock('./board-fit-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./board-fit-service')>();
  return {
    ...actual,
    fitLineToTiers: fitLineToTiersMock,
    getCachedFittedLayout: getCachedFittedLayoutMock,
  };
});

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

import { fitBoardToTier, tierFitLayoutVersion } from './tier-fitter';
import { previewCommunitySubmission } from './community';

const sampleText = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOGS AGAIN';

const reportWith = (
  entries: Array<{ tier: 'warmup' | 'medium' | 'hard' | 'expert'; feasible: boolean; reason?: string }>
): LineFitReport => ({
  textHash: 'hash',
  layoutVersion: tierFitLayoutVersion,
  textValid: true,
  reasons: [],
  suggestedTier: 'medium',
  tiers: entries.map((entry) => ({
    tier: entry.tier,
    feasible: entry.feasible,
    reason: entry.reason ?? null,
    summary: entry.feasible
      ? {
          solverRatio: 0.8,
          revealCount: 2,
          blindCount: 1,
          padlockCount: 0,
          estimatedDifficulty: 5,
          ceilingExceeded: false,
        }
      : null,
  })),
});

describe('community auto preview', () => {
  beforeEach(() => {
    redisMock.hGet.mockReset();
    redisMock.hGet.mockResolvedValue(null);
    fitLineToTiersMock.mockReset();
    getCachedFittedLayoutMock.mockReset();
  });

  it('surfaces the fit reason when the chosen tier is not available', async () => {
    fitLineToTiersMock.mockResolvedValue(
      reportWith([
        { tier: 'warmup', feasible: true },
        { tier: 'medium', feasible: true },
        {
          tier: 'hard',
          feasible: false,
          reason:
            'Hard doesn’t work for this line — its words are too unusual to solve without guessing.',
        },
        { tier: 'expert', feasible: false, reason: 'Expert needs a longer line.' },
      ])
    );

    const preview = await previewCommunitySubmission({
      title: 'Hard puzzle',
      text: sampleText,
      category: 'QUOTE',
      attribution: 'Tester',
      targetDifficulty: 8,
      creationMode: 'auto',
      manualLayout: null,
    });

    expect(preview.valid).toBe(false);
    expect(preview.reasons.join(' ')).not.toContain('DUMMY_SOLVER_UNSATISFIED');
    expect(preview.reasons[0]).toContain('Hard doesn’t work for this line');
    expect(getCachedFittedLayoutMock).not.toHaveBeenCalled();
  });

  it('builds the preview from the fitted layout when the tier is available', async () => {
    // Real fit for a real line: the preview must show exactly this board.
    const fitted = fitBoardToTier({
      text: sampleText,
      tier: 'medium',
      dateKey: '2026-06-10',
      author: 'Tester',
      challengeType: 'QUOTE',
      logicalPercent: 100,
    });
    expect(fitted.fitted).toBe(true);
    if (!fitted.fitted) {
      return;
    }
    fitLineToTiersMock.mockResolvedValue(
      reportWith([
        { tier: 'warmup', feasible: true },
        { tier: 'medium', feasible: true },
        { tier: 'hard', feasible: true },
        { tier: 'expert', feasible: false, reason: 'Expert needs a longer line.' },
      ])
    );
    getCachedFittedLayoutMock.mockResolvedValue(fitted.layout);

    const preview = await previewCommunitySubmission({
      title: 'Medium puzzle',
      text: sampleText,
      category: 'QUOTE',
      attribution: 'Tester',
      targetDifficulty: 5,
      creationMode: 'auto',
      manualLayout: null,
    });

    expect(preview.valid).toBe(true);
    expect(preview.puzzlePreview).not.toBeNull();
    // Revealed letter tiles show their char; hidden letters show '_'.
    const previewRevealed = preview.puzzlePreview?.tiles
      .filter((tile) => tile.isLetter && tile.displayChar !== '_')
      .map((tile) => tile.index)
      .sort((a, b) => a - b);
    expect(previewRevealed).toEqual(fitted.layout.prefilledIndices);
    const previewBlind = preview.puzzlePreview?.tiles
      .filter((tile) => tile.isBlind)
      .map((tile) => tile.index)
      .sort((a, b) => a - b);
    expect(previewBlind).toEqual(fitted.layout.blindIndices);
  });
});
