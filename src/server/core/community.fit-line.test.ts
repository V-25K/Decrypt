import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LineFitReport } from './board-fit-service';

const { fitLineToTiersMock, redisMock } = vi.hoisted(() => ({
  fitLineToTiersMock: vi.fn(),
  redisMock: {
    hGet: vi.fn(),
  },
}));

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

import {
  communitySubmissionSchema,
} from '../../shared/community';
import { tierFitLayoutVersion } from './tier-fitter';
import {
  autoFixCommunityManualLayout,
  fitCommunityLine,
} from './community';

const sampleReport: LineFitReport = {
  textHash: 'hash',
  layoutVersion: tierFitLayoutVersion,
  textValid: true,
  reasons: [],
  suggestedTier: 'medium',
  tiers: [
    {
      tier: 'warmup',
      feasible: true,
      reason: null,
      summary: {
        solverRatio: 0.9,
        revealCount: 4,
        blindCount: 0,
        padlockCount: 0,
        estimatedDifficulty: 2,
        ceilingExceeded: false,
      },
    },
    { tier: 'medium', feasible: true, reason: null, summary: null },
    { tier: 'hard', feasible: true, reason: null, summary: null },
    {
      tier: 'expert',
      feasible: false,
      reason: 'Expert needs at least 14 different letters; this line has 12.',
      summary: null,
    },
  ],
};

describe('fitCommunityLine', () => {
  beforeEach(() => {
    fitLineToTiersMock.mockReset();
  });

  it('returns labelled per-tier availability with player-facing names', async () => {
    fitLineToTiersMock.mockResolvedValue(sampleReport);
    const report = await fitCommunityLine({
      text: 'TO BE OR NOT TO BE THAT IS THE QUESTION',
    });
    expect(report.textValid).toBe(true);
    expect(report.suggestedTier).toBe('medium');
    expect(report.tiers.map((entry) => entry.label)).toEqual([
      'Easy',
      'Medium',
      'Hard',
      'Expert',
    ]);
    const expert = report.tiers.find((entry) => entry.tier === 'expert');
    expect(expert?.feasible).toBe(false);
    expect(expert?.reason).toContain('Expert');
    const warmup = report.tiers.find((entry) => entry.tier === 'warmup');
    expect(warmup?.summary).toEqual({
      revealCount: 4,
      blindCount: 0,
      padlockCount: 0,
    });
  });
});

describe('autoFixCommunityManualLayout', () => {
  beforeEach(() => {
    redisMock.hGet.mockReset();
    redisMock.hGet.mockResolvedValue(null);
  });

  it('repairs an unfair layout and reports the changes made', async () => {
    // No reveals at all: guaranteed unfair (no starter clue for players).
    const result = await autoFixCommunityManualLayout({
      text: 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO',
      manualLayout: {
        prefilledIndices: [],
        prefilledWordIndices: [],
        blindIndices: [],
        lockIndices: [],
        lockKeyIndices: [],
        padlocks: [],
      },
    });
    expect(result.success).toBe(true);
    expect(result.fixedLayout).not.toBeNull();
    expect(result.fixedLayout?.prefilledIndices.length).toBeGreaterThan(0);
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes[0]).toContain('Revealed');
  });

  it('leaves an already-fair layout untouched', async () => {
    const first = await autoFixCommunityManualLayout({
      text: 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO',
      manualLayout: {
        prefilledIndices: [],
        prefilledWordIndices: [],
        blindIndices: [],
        lockIndices: [],
        lockKeyIndices: [],
        padlocks: [],
      },
    });
    expect(first.success).toBe(true);
    const fixedLayout = first.fixedLayout;
    expect(fixedLayout).not.toBeNull();
    if (!fixedLayout) {
      return;
    }
    const second = await autoFixCommunityManualLayout({
      text: 'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO',
      manualLayout: fixedLayout,
    });
    expect(second.success).toBe(true);
    expect(second.changes).toEqual([]);
    expect(second.fixedLayout).toEqual(fixedLayout);
  });
});

describe('communitySubmissionSchema back-compat', () => {
  it('parses stored submissions that predate fittedLayout', () => {
    const legacy = communitySubmissionSchema.parse({
      submissionId: 'sub_legacy',
      authorId: 't2_user',
      authorName: 'tester',
      title: 'Old submission',
      text: 'THIS IS A VALID COMMUNITY CIPHER TEXT',
      normalizedSig: 'sig',
      tokenSig: 'tok',
      category: 'QUOTE',
      attribution: 'Source',
      targetDifficulty: 5,
      creationMode: 'auto',
      manualLayout: null,
      suggestedTier: 'medium',
      status: 'pending',
      submittedAt: 1000,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      levelId: null,
    });
    expect(legacy.fittedLayout).toBeNull();
  });
});
