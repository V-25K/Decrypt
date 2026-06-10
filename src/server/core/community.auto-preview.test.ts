import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildManualPuzzleWithSolverFallbackMock, redisMock } = vi.hoisted(() => ({
  buildManualPuzzleWithSolverFallbackMock: vi.fn(),
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

vi.mock('./generator', () => ({
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: buildManualPuzzleWithSolverFallbackMock,
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

import { previewCommunitySubmission } from './community';

describe('community auto preview', () => {
  beforeEach(() => {
    redisMock.hGet.mockReset();
    redisMock.hGet.mockResolvedValue(null);
    buildManualPuzzleWithSolverFallbackMock.mockReset();
  });

  it('turns solver build failures into creator-facing guidance', async () => {
    buildManualPuzzleWithSolverFallbackMock.mockImplementation(() => {
      throw new Error('DUMMY_SOLVER_UNSATISFIED');
    });

    const preview = await previewCommunitySubmission({
      title: 'Hard puzzle',
      text: 'THE QUICK BROWN FOX JUMPS OVER LAZY DOGS AT NOON',
      category: 'QUOTE',
      attribution: 'Tester',
      targetDifficulty: 8,
      creationMode: 'auto',
      manualLayout: null,
    });

    expect(preview.valid).toBe(false);
    expect(preview.reasons.join(' ')).not.toContain('DUMMY_SOLVER_UNSATISFIED');
    expect(preview.reasons[0]).toContain(
      'The builder could not make a fair Hard board'
    );
  });
});
