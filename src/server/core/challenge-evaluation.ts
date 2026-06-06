import { redis } from '@devvit/web/server';
import { z } from 'zod';
import type {
  ChallengeEvaluationSummary,
  DifficultyBreakdown,
  PuzzlePrivate,
  PuzzleSource,
} from '../../shared/game';
import {
  challengeEvaluationSummarySchema,
  difficultyBreakdownSchema,
} from '../../shared/game';
import {
  difficultyToTier,
  type DifficultyTier,
} from './content';
import {
  keyChallengeEvaluation,
  keyChallengeEvaluationIndex,
} from './keys';
import { buildDifficultyBreakdown } from './difficulty-model';
import { runDummySolver, type SolverResult } from './dummy-solver';
import { solverThresholdForDifficulty } from './solver-thresholds';
import type { LevelQualifiedTelemetry } from './engagement';

export const challengeEvaluationVersion = 'v1';

export type ChallengeOptimizerSummary = {
  mode:
    | 'generated'
    | 'preview'
    | 'manual_no_adjustment'
    | 'candidate_optimizer'
    | 'fallback';
  candidatesEvaluated: number;
  searchDepth: number;
  selectedScore: number | null;
  reasons: string[];
};

export type ChallengeShadowRatingSnapshot = {
  itemDifficultyRating: number;
  itemUncertainty: number;
  itemPlayCount: number;
  playerSkillRating?: number;
  playerUncertainty?: number;
  playerPlayCount?: number;
} | null;

export type ChallengeTelemetrySnapshot = (LevelQualifiedTelemetry & {
  targetTimeSeconds: number | null;
}) | null;

type ChallengeLayoutSummary = {
  letterCount: number;
  wordCount: number;
  prefilledCount: number;
  prefillCoverage: number;
  blindCount: number;
  blindCoverage: number;
  lockCount: number;
  lockCoverage: number;
  padlockCount: number;
  revealedAnchorCoverage: number;
};

type ChallengeSolverSummary = {
  requiredSolveRatio: number;
  deepRequiredSolveRatio: number | null;
  standard: SolverResult;
  deep: SolverResult | null;
  fairnessStatus: 'pass' | 'warning' | 'fail';
};

export type ChallengeEvaluation = {
  challengeEvaluationVersion: typeof challengeEvaluationVersion;
  levelId: string;
  source: PuzzleSource;
  targetTier: DifficultyTier;
  targetDifficulty: number;
  createdAt: number;
  difficultyBreakdown: DifficultyBreakdown;
  layoutSummary: ChallengeLayoutSummary;
  solverSummary: ChallengeSolverSummary;
  optimizerSummary: ChallengeOptimizerSummary;
  telemetrySnapshot: ChallengeTelemetrySnapshot;
  shadowRatingSnapshot: ChallengeShadowRatingSnapshot;
  summary: ChallengeEvaluationSummary;
};

export type ChallengeLayoutCandidateScoreInput = {
  targetTier: DifficultyTier;
  targetDifficulty: number;
  estimatedTier: DifficultyTier;
  estimatedDifficulty: number;
  fairnessStatus: 'pass' | 'warning' | 'fail';
  solverSolvedRatio: number;
  ambiguityScore: number;
  anchorCoverage: number;
  blindCoverage: number;
  lockCoverage: number;
  prefillCoverage: number;
  padlockCount: number;
  budgetUsed: number;
  budgetTotal: number;
};

const solverResultSchema = z.object({
  solvable: z.boolean(),
  solvedRatio: z.number().min(0).max(1),
  blindGuessRequired: z.boolean(),
  budgetExceeded: z.boolean(),
  branchExpansions: z.number().int().nonnegative(),
  bestRatio: z.number().min(0).max(1),
  ambiguousWordCount: z.number().int().nonnegative(),
  meanCandidateCount: z.number().nonnegative(),
  maxCandidateCount: z.number().int().nonnegative(),
  unresolvedCipherCount: z.number().int().nonnegative(),
  forcedGuessCount: z.number().int().nonnegative(),
  ambiguityScore: z.number().min(0).max(1),
});

const layoutSummarySchema = z.object({
  letterCount: z.number().int().nonnegative(),
  wordCount: z.number().int().nonnegative(),
  prefilledCount: z.number().int().nonnegative(),
  prefillCoverage: z.number().min(0).max(1),
  blindCount: z.number().int().nonnegative(),
  blindCoverage: z.number().min(0).max(1),
  lockCount: z.number().int().nonnegative(),
  lockCoverage: z.number().min(0).max(1),
  padlockCount: z.number().int().nonnegative(),
  revealedAnchorCoverage: z.number().min(0).max(1),
});

const optimizerSummarySchema = z.object({
  mode: z.enum([
    'generated',
    'preview',
    'manual_no_adjustment',
    'candidate_optimizer',
    'fallback',
  ]),
  candidatesEvaluated: z.number().int().nonnegative(),
  searchDepth: z.number().int().nonnegative(),
  selectedScore: z.number().nullable(),
  reasons: z.array(z.string()),
});

const telemetrySnapshotSchema = z
  .object({
    plays: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    failures: z.number().int().nonnegative(),
    abandons: z.number().int().nonnegative(),
    averageSolveSeconds: z.number().nonnegative(),
    averageMistakes: z.number().nonnegative(),
    averageUsedPowerups: z.number().nonnegative(),
    averageRetryCount: z.number().nonnegative(),
    fastSolveRate: z.number().min(0).max(1),
    targetTimeSeconds: z.number().nonnegative().nullable(),
  })
  .nullable();

const shadowRatingSnapshotSchema = z
  .object({
    itemDifficultyRating: z.number(),
    itemUncertainty: z.number().min(0).max(1),
    itemPlayCount: z.number().int().nonnegative(),
    playerSkillRating: z.number().optional(),
    playerUncertainty: z.number().min(0).max(1).optional(),
    playerPlayCount: z.number().int().nonnegative().optional(),
  })
  .nullable();

export const challengeEvaluationSchema = z.object({
  challengeEvaluationVersion: z.literal(challengeEvaluationVersion),
  levelId: z.string().min(1),
  source: z.enum([
    'AUTO_DAILY',
    'AUTO_ENDLESS',
    'COMMUNITY',
    'MANUAL_INJECTED',
    'UNKNOWN_LEGACY',
  ]),
  targetTier: z.enum(['warmup', 'medium', 'hard', 'expert']),
  targetDifficulty: z.number().int().min(1).max(10),
  createdAt: z.number().int().nonnegative(),
  difficultyBreakdown: difficultyBreakdownSchema,
  layoutSummary: layoutSummarySchema,
  solverSummary: z.object({
    requiredSolveRatio: z.number().min(0).max(1),
    deepRequiredSolveRatio: z.number().min(0).max(1).nullable(),
    standard: solverResultSchema,
    deep: solverResultSchema.nullable(),
    fairnessStatus: z.enum(['pass', 'warning', 'fail']),
  }),
  optimizerSummary: optimizerSummarySchema,
  telemetrySnapshot: telemetrySnapshotSchema,
  shadowRatingSnapshot: shadowRatingSnapshotSchema,
  summary: challengeEvaluationSummarySchema,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round4 = (value: number): number => Number(value.toFixed(4));

const tierRank = (tier: DifficultyTier): number => {
  if (tier === 'warmup') {
    return 0;
  }
  if (tier === 'medium') {
    return 1;
  }
  if (tier === 'hard') {
    return 2;
  }
  return 3;
};

export const scoreChallengeLayoutCandidate = (
  input: ChallengeLayoutCandidateScoreInput
): number => {
  const tierGap = Math.abs(tierRank(input.targetTier) - tierRank(input.estimatedTier));
  const difficultyGap = Math.abs(input.targetDifficulty - input.estimatedDifficulty);
  const fairnessPenalty =
    input.fairnessStatus === 'fail'
      ? 100
      : input.fairnessStatus === 'warning'
        ? 2.2
        : 0;
  const solverPenalty = Math.max(0, 0.72 - input.solverSolvedRatio) * 2.4;
  const anchorPenalty = Math.max(0, 0.35 - input.anchorCoverage) * 1.8;
  const ambiguityPenalty = input.ambiguityScore * 1.6;
  const obstructionClutterPenalty =
    input.blindCoverage * 1.2 +
    input.lockCoverage * 1.1 +
    Math.max(0, input.padlockCount - 2) * 0.28;
  const overRevealPenalty = Math.max(0, input.prefillCoverage - 0.34) * 0.9;
  const budgetPenalty =
    input.budgetTotal > 0
      ? clamp(input.budgetUsed / input.budgetTotal, 0, 1) * 0.28
      : 0;

  return round4(
    tierGap * 4.5 +
      difficultyGap * 0.55 +
      fairnessPenalty +
      solverPenalty +
      anchorPenalty +
      ambiguityPenalty +
      obstructionClutterPenalty +
      overRevealPenalty +
      budgetPenalty
  );
};

const defaultOptimizerSummary = (): ChallengeOptimizerSummary => ({
  mode: 'generated',
  candidatesEvaluated: 0,
  searchDepth: 0,
  selectedScore: null,
  reasons: [],
});

const buildLayoutSummary = (puzzle: PuzzlePrivate): ChallengeLayoutSummary => {
  const letterCount = puzzle.tiles.filter((tile) => tile.isLetter).length;
  const safeLetterCount = Math.max(1, letterCount);
  const lockCount = puzzle.lockIndices?.length ?? 0;
  return {
    letterCount,
    wordCount: puzzle.words.length,
    prefilledCount: puzzle.prefilledIndices.length,
    prefillCoverage: round4(puzzle.prefilledIndices.length / safeLetterCount),
    blindCount: puzzle.blindIndices.length,
    blindCoverage: round4(puzzle.blindIndices.length / safeLetterCount),
    lockCount,
    lockCoverage: round4(lockCount / safeLetterCount),
    padlockCount: puzzle.padlockChains.length,
    revealedAnchorCoverage: round4(
      puzzle.difficultyBreakdown?.humanFeatures.revealedAnchorCoverage ??
        buildDifficultyBreakdown(puzzle).humanFeatures.revealedAnchorCoverage
    ),
  };
};

const solverPasses = (
  result: SolverResult,
  requiredRatio: number
): boolean =>
  result.solvable &&
  !result.blindGuessRequired &&
  !result.budgetExceeded &&
  result.solvedRatio >= requiredRatio;

const runDeepSolverForPuzzle = (
  puzzle: PuzzlePrivate,
  requiredSolveRatio: number | null
): SolverResult | null => {
  if (requiredSolveRatio === null) {
    return null;
  }
  return runDummySolver({
    puzzle,
    revealedIndices: puzzle.prefilledIndices,
    requiredSolveRatio,
    solverProfile: 'deep',
    maxSearchMs: 90,
    maxBranchExpansions: 6000,
  });
};

const determineFairnessStatus = (params: {
  standard: SolverResult;
  deep: SolverResult | null;
  requiredSolveRatio: number;
  deepRequiredSolveRatio: number | null;
  ambiguityScore: number;
}): ChallengeSolverSummary['fairnessStatus'] => {
  const standardPasses = solverPasses(params.standard, params.requiredSolveRatio);
  const deepPasses =
    params.deepRequiredSolveRatio === null ||
    (params.deep !== null && solverPasses(params.deep, params.deepRequiredSolveRatio));

  if (!standardPasses || !deepPasses) {
    return 'fail';
  }
  if (
    params.ambiguityScore >= 0.68 ||
    params.standard.solvedRatio < params.requiredSolveRatio + 0.08
  ) {
    return 'warning';
  }
  return 'pass';
};

const buildSolverSummary = (puzzle: PuzzlePrivate): ChallengeSolverSummary => {
  const requiredSolveRatio = solverThresholdForDifficulty(puzzle.difficulty, 'build');
  const standard = runDummySolver({
    puzzle,
    revealedIndices: puzzle.prefilledIndices,
    requiredSolveRatio,
    solverProfile: 'standard',
  });
  const deepRequiredSolveRatio =
    puzzle.difficulty >= 6
      ? solverThresholdForDifficulty(puzzle.difficulty, 'deep-build')
      : null;
  const deep = runDeepSolverForPuzzle(puzzle, deepRequiredSolveRatio);
  const ambiguityScore = Math.max(
    standard.ambiguityScore,
    deep?.ambiguityScore ?? 0
  );
  const fairnessStatus = determineFairnessStatus({
    standard,
    deep,
    requiredSolveRatio,
    deepRequiredSolveRatio,
    ambiguityScore,
  });

  return {
    requiredSolveRatio,
    deepRequiredSolveRatio,
    standard,
    deep,
    fairnessStatus,
  };
};

const recommendationFor = (params: {
  fairnessStatus: 'pass' | 'warning' | 'fail';
  anchorCoverage: number;
  ambiguityScore: number;
  layoutSummary: ChallengeLayoutSummary;
}): string => {
  if (params.fairnessStatus === 'fail') {
    return 'Add a revealed anchor or remove an obstruction before publishing.';
  }
  if (params.anchorCoverage < 0.25) {
    return 'Reveal one anchor word or common short word to improve the solve path.';
  }
  if (params.ambiguityScore >= 0.68) {
    return 'Reduce ambiguity with one extra reveal or by removing a blind tile.';
  }
  if (params.layoutSummary.blindCoverage > 0.12) {
    return 'Blind coverage is high; keep an eye on player telemetry.';
  }
  return 'Layout is fair enough for live use; monitor telemetry before changing tiers.';
};

export const summarizeChallengeEvaluation = (
  evaluation: Omit<ChallengeEvaluation, 'summary'>
): ChallengeEvaluationSummary => {
  const estimatedDifficulty = evaluation.difficultyBreakdown.calibratedDifficulty;
  const standard = evaluation.solverSummary.standard;
  const ambiguityScore = Math.max(
    standard.ambiguityScore,
    evaluation.solverSummary.deep?.ambiguityScore ?? 0
  );
  const anchorCoverage =
    evaluation.layoutSummary.revealedAnchorCoverage ??
    evaluation.difficultyBreakdown.humanFeatures.revealedAnchorCoverage;
  const confidence = clamp(
    evaluation.difficultyBreakdown.difficultyConfidence -
      ambiguityScore * 0.2 -
      (evaluation.solverSummary.fairnessStatus === 'fail' ? 0.22 : 0) -
      (standard.budgetExceeded ? 0.12 : 0),
    0,
    1
  );

  return challengeEvaluationSummarySchema.parse({
    challengeEvaluationVersion,
    targetTier: evaluation.targetTier,
    targetDifficulty: evaluation.targetDifficulty,
    estimatedTier: difficultyToTier(estimatedDifficulty),
    estimatedDifficulty,
    confidence: round4(confidence),
    fairnessStatus: evaluation.solverSummary.fairnessStatus,
    solverSolvedRatio: standard.solvedRatio,
    ambiguityScore: round4(ambiguityScore),
    anchorCoverage: round4(anchorCoverage),
    candidatesEvaluated: evaluation.optimizerSummary.candidatesEvaluated,
    recommendation: recommendationFor({
      fairnessStatus: evaluation.solverSummary.fairnessStatus,
      anchorCoverage,
      ambiguityScore,
      layoutSummary: evaluation.layoutSummary,
    }),
  });
};

export const buildChallengeEvaluation = (params: {
  puzzle: PuzzlePrivate;
  targetDifficulty?: number;
  targetTier?: DifficultyTier;
  optimizerSummary?: ChallengeOptimizerSummary;
  telemetrySnapshot?: ChallengeTelemetrySnapshot;
  shadowRatingSnapshot?: ChallengeShadowRatingSnapshot;
  createdAt?: number;
}): ChallengeEvaluation => {
  const difficultyBreakdown =
    params.puzzle.difficultyBreakdown ?? buildDifficultyBreakdown(params.puzzle);
  const targetDifficulty = params.targetDifficulty ?? params.puzzle.difficulty;
  const targetTier = params.targetTier ?? difficultyToTier(targetDifficulty);
  const baseEvaluation = {
    challengeEvaluationVersion: challengeEvaluationVersion,
    levelId: params.puzzle.levelId,
    source: params.puzzle.source,
    targetTier,
    targetDifficulty,
    createdAt: params.createdAt ?? Date.now(),
    difficultyBreakdown,
    layoutSummary: buildLayoutSummary({
      ...params.puzzle,
      difficultyBreakdown,
    }),
    solverSummary: buildSolverSummary(params.puzzle),
    optimizerSummary: params.optimizerSummary ?? defaultOptimizerSummary(),
    telemetrySnapshot: params.telemetrySnapshot ?? null,
    shadowRatingSnapshot: params.shadowRatingSnapshot ?? null,
  } satisfies Omit<ChallengeEvaluation, 'summary'>;
  return challengeEvaluationSchema.parse({
    ...baseEvaluation,
    summary: summarizeChallengeEvaluation(baseEvaluation),
  });
};

export const saveChallengeEvaluation = async (
  evaluation: ChallengeEvaluation
): Promise<void> => {
  await Promise.all([
    redis.set(
      keyChallengeEvaluation(evaluation.levelId),
      JSON.stringify(evaluation)
    ),
    redis.zAdd(keyChallengeEvaluationIndex, {
      member: evaluation.levelId,
      score: evaluation.createdAt,
    }),
  ]);
};

export const getChallengeEvaluation = async (
  levelId: string
): Promise<ChallengeEvaluation | null> => {
  const raw = await redis.get(keyChallengeEvaluation(levelId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const evaluation = challengeEvaluationSchema.safeParse(parsed);
    return evaluation.success ? evaluation.data : null;
  } catch {
    return null;
  }
};

export const getRecentChallengeEvaluationLevelIds = async (
  limit = 40
): Promise<string[]> => {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const entries = await redis.zRange(keyChallengeEvaluationIndex, 0, safeLimit - 1, {
    by: 'rank',
    reverse: true,
  });
  return entries
    .map((entry) => entry.member)
    .filter((member) => member.length > 0);
};

export const getRecentChallengeEvaluations = async (
  limit = 40
): Promise<ChallengeEvaluation[]> => {
  const levelIds = await getRecentChallengeEvaluationLevelIds(limit);
  const evaluations = await Promise.all(levelIds.map(getChallengeEvaluation));
  return evaluations.filter(
    (evaluation): evaluation is ChallengeEvaluation => evaluation !== null
  );
};
