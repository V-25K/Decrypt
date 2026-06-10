import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisMock, solverCallSummaries } = vi.hoisted(() => {
  const summaries: {
    forbiddenIndices: number[];
    requiredSolveRatio?: number;
    solverProfile?: string;
  }[] = [];
  return {
    redisMock: {
      hGet: vi.fn(),
    },
    solverCallSummaries: summaries,
  };
});

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

vi.mock('./puzzle-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./puzzle-store')>();
  return {
    ...actual,
    getPuzzleMapping: vi.fn().mockResolvedValue(null),
    getRecentUsedSignatureEntries: vi.fn().mockResolvedValue([]),
    getUsedSignatureOwner: vi.fn().mockResolvedValue(null),
    peekNextLevelId: vi.fn().mockResolvedValue('lvl_0001'),
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

vi.mock('./dummy-solver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dummy-solver')>();
  return {
    ...actual,
    runDummySolver: (params: Parameters<typeof actual.runDummySolver>[0]) => {
      solverCallSummaries.push({
        forbiddenIndices: params.forbiddenIndices ?? [],
        requiredSolveRatio: params.requiredSolveRatio,
        solverProfile: params.solverProfile,
      });
      return actual.runDummySolver(params);
    },
  };
});

import { previewCommunitySubmission } from './community';

describe('community manual layout preview', () => {
  beforeEach(() => {
    redisMock.hGet.mockReset();
    redisMock.hGet.mockResolvedValue(null);
    solverCallSummaries.length = 0;
    vi.restoreAllMocks();
  });

  it('returns an editable puzzle preview before the manual layout is valid', async () => {
    const preview = await previewCommunitySubmission({
      title: 'Manual puzzle',
      text: 'THE QUICK BROWN FOX JUMPS',
      category: 'QUOTE',
      attribution: 'Tester',
      targetDifficulty: 5,
      creationMode: 'manual',
      manualLayout: {
        prefilledIndices: [],
        prefilledWordIndices: [],
	        blindIndices: [],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [], keyIndices: [] }],
	      },
	    });

    expect(preview.valid).toBe(false);
    expect(preview.reasons).toContain('Reveal at least one starting letter.');
    expect(preview.puzzlePreview).not.toBeNull();
    expect(
      preview.puzzlePreview?.tiles
        .filter((tile) => tile.isLetter)
        .every((tile) => tile.displayChar === '_')
    ).toBe(true);
    expect(preview.suggestedDifficulty.label).toContain('layout difficulty estimate');
  });

  it('computes layout difficulty from selected reveal letters and padlocks', async () => {
	    const preview = await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'THE QUICK BROWN FOX JUMPS',
      category: 'QUOTE',
      attribution: 'Tester',
      targetDifficulty: 5,
      creationMode: 'manual',
      manualLayout: {
        prefilledIndices: [0],
	        prefilledWordIndices: [],
	        blindIndices: [],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [10], keyIndices: [4] }],
	      },
	    });

    expect(preview.valid).toBe(true);
    expect(preview.puzzlePreview?.difficulty).toBe(
      preview.suggestedDifficulty.estimatedDifficulty
	    );
	  });

  it('returns preview-only guidance without mutating a manual layout draft', async () => {
    const manualLayout = {
      prefilledIndices: [0],
      prefilledWordIndices: [],
      blindIndices: [],
      lockIndices: [],
      lockKeyIndices: [],
      padlocks: [{ padlockId: 1, lockedIndices: [], keyIndices: [] }],
    };
    const originalLayout = structuredClone(manualLayout);
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);

    try {
      const preview = await previewCommunitySubmission({
        title: 'Manual puzzle',
        text: 'THE QUICK BROWN FOX JUMPS',
        category: 'QUOTE',
        attribution: 'Tester',
        targetDifficulty: 9,
        creationMode: 'manual',
        manualLayout,
      });

      expect(manualLayout).toEqual(originalLayout);
      expect(preview.manualLayoutGuidance?.status).toBe('too_easy');
      expect(preview.manualLayoutGuidance?.suggestedActions.join(' ')).toContain(
        'Publish as'
      );
      expect(preview.puzzlePreview?.difficulty).toBe(
        preview.suggestedDifficulty.estimatedDifficulty
      );
    } finally {
      nowSpy.mockRestore();
    }
  });

	  it('supports multiple manual padlocks with different keys', async () => {
	    const preview = await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'THE QUICK BROWN FOX JUMPS',
	      category: 'QUOTE',
	      attribution: 'Tester',
	      targetDifficulty: 5,
	      creationMode: 'manual',
	      manualLayout: {
	        prefilledIndices: [0],
	        prefilledWordIndices: [],
	        blindIndices: [],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [
	          { padlockId: 1, lockedIndices: [10], keyIndices: [4] },
	          { padlockId: 2, lockedIndices: [16], keyIndices: [12, 14] },
	        ],
	      },
	    });

	    expect(preview.valid, preview.reasons.join('; ')).toBe(true);
	    const chainIds = new Set(
	      preview.puzzlePreview?.tiles
	        .map((tile) => tile.lockChainId ?? null)
	        .filter((chainId) => chainId !== null)
	    );
	    expect(chainIds.has(1)).toBe(true);
	    expect(chainIds.has(2)).toBe(true);
	  });

	  it('forbids both blind and locked tiles during manual fairness checking', async () => {
	    await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'THE QUICK BROWN FOX JUMPS',
	      category: 'QUOTE',
	      attribution: 'Tester',
	      targetDifficulty: 5,
	      creationMode: 'manual',
	      manualLayout: {
	        prefilledIndices: [0],
	        prefilledWordIndices: [],
	        blindIndices: [5],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [10], keyIndices: [4] }],
	      },
	    });

	    const fairnessCall = solverCallSummaries.find(
	      (summary) =>
	        summary.solverProfile === 'deep' && summary.requiredSolveRatio === 0.65
	    );

	    expect(fairnessCall?.forbiddenIndices).toEqual(
	      expect.arrayContaining([5, 10])
	    );
	  });

	  it('points creators at specific marks when a manual layout is not publishable', async () => {
	    const preview = await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'THE QUICK BROWN FOX JUMPS',
	      category: 'QUOTE',
	      attribution: 'Tester',
	      targetDifficulty: 2,
	      creationMode: 'manual',
	      manualLayout: {
	        prefilledIndices: [0],
	        prefilledWordIndices: [],
	        blindIndices: [1],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [10], keyIndices: [4] }],
	      },
	    });

	    const actions = preview.manualLayoutGuidance?.suggestedActions.join(' ') ?? '';
	    expect(actions).toContain('Remove the ? from');
	    expect(actions).toContain('Remove the padlock from');
	  });

	  it('allows a manual padlock key to also be a question-mark tile', async () => {
	    const preview = await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'THE QUICK BROWN FOX JUMPS',
	      category: 'QUOTE',
	      attribution: 'Tester',
	      targetDifficulty: 5,
	      creationMode: 'manual',
	      manualLayout: {
	        prefilledIndices: [0],
	        prefilledWordIndices: [],
	        blindIndices: [5],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [10], keyIndices: [5] }],
	      },
	    });

	    expect(preview.valid).toBe(true);
	    expect(preview.puzzlePreview?.tiles.find((tile) => tile.index === 5)?.isBlind).toBe(true);
	  });

	  it('keeps a manual padlock on the exact locked tile the creator selected', async () => {
	    const preview = await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'HAPPY HUNTERS HIDE HISTORY',
	      category: 'QUOTE',
	      attribution: 'Tester',
	      targetDifficulty: 5,
	      creationMode: 'manual',
	      manualLayout: {
	        prefilledIndices: [2],
	        prefilledWordIndices: [],
	        blindIndices: [14],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [6], keyIndices: [1] }],
	      },
	    });

	    const lockedIndices =
	      preview.puzzlePreview?.tiles
	        .filter((tile) => tile.lockChainId === 1 && tile.isLocked)
	        .map((tile) => tile.index)
	        .sort((left, right) => left - right) ?? [];
	    expect(lockedIndices).toEqual([6]);
	    expect(lockedIndices).not.toContain(14);
	  });

	  it('explains when a manual padlock has too many locked tiles', async () => {
	    const preview = await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'THE QUICK BROWN FOX JUMPS',
	      category: 'QUOTE',
	      attribution: 'Tester',
	      targetDifficulty: 5,
	      creationMode: 'manual',
	      manualLayout: {
	        prefilledIndices: [0],
	        prefilledWordIndices: [],
	        blindIndices: [],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [10, 16], keyIndices: [4] }],
	      },
	    });

	    expect(preview.valid).toBe(false);
	    expect(preview.reasons).toContain('Lock 1 can lock only one tile.');
	  });

	  it('explains when a manual padlock has too many keys', async () => {
	    const preview = await previewCommunitySubmission({
	      title: 'Manual puzzle',
	      text: 'THE QUICK BROWN FOX JUMPS',
	      category: 'QUOTE',
	      attribution: 'Tester',
	      targetDifficulty: 5,
	      creationMode: 'manual',
	      manualLayout: {
	        prefilledIndices: [0],
	        prefilledWordIndices: [],
	        blindIndices: [],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [10], keyIndices: [4, 5, 6] }],
	      },
	    });

	    expect(preview.valid).toBe(false);
    expect(preview.reasons).toContain('Lock 1 can use at most two key tiles.');
	  });

  it('explains how to fix unfair question marks', async () => {
    const preview = await previewCommunitySubmission({
      title: 'Manual puzzle',
      text: 'THE QUICK BROWN FOX JUMPS',
      category: 'QUOTE',
      attribution: 'Tester',
      targetDifficulty: 5,
      creationMode: 'manual',
      manualLayout: {
        prefilledIndices: [0],
        prefilledWordIndices: [],
	        blindIndices: [4],
	        lockIndices: [],
	        lockKeyIndices: [],
	        padlocks: [{ padlockId: 1, lockedIndices: [], keyIndices: [] }],
	      },
	    });

    expect(preview.valid).toBe(false);
    expect(preview.reasons.join(' ')).toContain(
      'needs another visible'
    );
    expect(preview.reasons).not.toContain('Blind tile fairness check failed.');
  });
});
