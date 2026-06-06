import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisGetMock, redisSetMock, redisZAddMock, redisZRangeMock, store, zIndex } =
  vi.hoisted(() => ({
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
    redisZAddMock: vi.fn(),
    redisZRangeMock: vi.fn(),
    store: new Map<string, string>(),
    zIndex: new Map<string, number>(),
  }));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: redisGetMock,
    set: redisSetMock,
    zAdd: redisZAddMock,
    zRange: redisZRangeMock,
  },
}));

import { buildPublicPuzzle } from './puzzle';
import { buildPuzzle } from './puzzle';
import {
  buildChallengeEvaluation,
  getChallengeEvaluation,
  saveChallengeEvaluation,
  scoreChallengeLayoutCandidate,
} from './challenge-evaluation';
import type { ChallengeLayoutCandidateScoreInput } from './challenge-evaluation';

beforeEach(() => {
  store.clear();
  zIndex.clear();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  redisZAddMock.mockReset();
  redisZRangeMock.mockReset();
  redisGetMock.mockImplementation(async (key: string) => store.get(key) ?? null);
  redisSetMock.mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
    return true;
  });
  redisZAddMock.mockImplementation(
    async (_key: string, entry: { member: string; score: number }) => {
      zIndex.set(entry.member, entry.score);
    }
  );
  redisZRangeMock.mockImplementation(async () =>
    [...zIndex.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([member, score]) => ({ member, score }))
  );
});

const baseScoreInput = {
  targetTier: 'medium',
  targetDifficulty: 5,
  estimatedTier: 'medium',
  estimatedDifficulty: 5,
  fairnessStatus: 'pass',
  solverSolvedRatio: 0.82,
  ambiguityScore: 0.2,
  anchorCoverage: 0.45,
  blindCoverage: 0.02,
  lockCoverage: 0.02,
  prefillCoverage: 0.18,
  padlockCount: 1,
  budgetUsed: 10,
  budgetTotal: 60,
} satisfies ChallengeLayoutCandidateScoreInput;

describe('challenge evaluation scoring', () => {
  it('prefers candidates that fit the target tier and difficulty', () => {
    const aligned = scoreChallengeLayoutCandidate(baseScoreInput);
    const offTier = scoreChallengeLayoutCandidate({
      ...baseScoreInput,
      estimatedTier: 'expert',
      estimatedDifficulty: 9,
    });

    expect(aligned).toBeLessThan(offTier);
  });

  it('heavily penalizes fairness failures', () => {
    const fair = scoreChallengeLayoutCandidate(baseScoreInput);
    const unfair = scoreChallengeLayoutCandidate({
      ...baseScoreInput,
      fairnessStatus: 'fail',
      solverSolvedRatio: 0.2,
    });

    expect(unfair - fair).toBeGreaterThan(90);
  });

  it('rewards useful anchor coverage', () => {
    const anchored = scoreChallengeLayoutCandidate({
      ...baseScoreInput,
      anchorCoverage: 0.6,
    });
    const lowAnchor = scoreChallengeLayoutCandidate({
      ...baseScoreInput,
      anchorCoverage: 0.05,
    });

    expect(anchored).toBeLessThan(lowAnchor);
  });

  it('penalizes direct solver ambiguity even when target fit is unchanged', () => {
    const lowAmbiguity = scoreChallengeLayoutCandidate({
      ...baseScoreInput,
      ambiguityScore: 0.05,
    });
    const highAmbiguity = scoreChallengeLayoutCandidate({
      ...baseScoreInput,
      ambiguityScore: 0.85,
    });

    expect(highAmbiguity).toBeGreaterThan(lowAmbiguity);
  });
});

describe('challenge evaluation persistence', () => {
  it('stores and reads a private challenge evaluation', async () => {
    const generated = buildPuzzle({
      levelId: 'lvl_eval_1',
      dateKey: '2026-06-06',
      text: 'THE ONLY THING WE HAVE TO FEAR IS FEAR ITSELF',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const evaluation = buildChallengeEvaluation({
      puzzle: generated.puzzlePrivate,
      targetDifficulty: 5,
    });

    await saveChallengeEvaluation(evaluation);
    const loaded = await getChallengeEvaluation(generated.puzzlePrivate.levelId);

    expect(loaded?.challengeEvaluationVersion).toBe('v1');
    expect(loaded?.summary.fairnessStatus).toMatch(/pass|warning|fail/);
    expect(redisZAddMock).toHaveBeenCalledTimes(1);
  });

  it('does not add private evaluation fields to the public puzzle payload', () => {
    const generated = buildPuzzle({
      levelId: 'lvl_eval_2',
      dateKey: '2026-06-06',
      text: 'IN THE MIDDLE OF DIFFICULTY LIES OPPORTUNITY',
      author: 'UNKNOWN',
      difficulty: 5,
      logicalPercent: 20,
      skipSolvabilityCheck: true,
    });
    const publicPuzzle = buildPublicPuzzle(generated.puzzlePrivate, []);

    expect('difficultyBreakdown' in publicPuzzle).toBe(false);
    expect('challengeEvaluationSummary' in publicPuzzle).toBe(false);
  });
});
