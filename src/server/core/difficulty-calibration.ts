import { redis } from '@devvit/web/server';
import { z } from 'zod';
import {
  computePhraseDifficultyProfile,
  difficultyToTier,
  getDefaultHardnessBoundsByTier,
  type HardnessBoundsByTier,
  type DifficultyTier,
} from './content';
import { getQualifiedLevelTelemetry } from './engagement';
import { getAllLevelIds, getPuzzlePrivate } from './puzzle-store';
import {
  keyDifficultyCalibrationArtifact,
  keyDifficultyCalibrationV3Artifact,
} from './keys';
import { difficultyModelVersion } from './difficulty-model';
import {
  buildChallengeEvaluation,
  getRecentChallengeEvaluations,
  saveChallengeEvaluation,
} from './challenge-evaluation';
import { getChallengeShadowRatingSnapshot } from './difficulty-shadow-rating';

const BAYES_ALPHA = 4;
const BAYES_BETA = 2;
const MIN_QUALIFIED_PLAYS_PER_LEVEL = 30;
const LOOKBACK_ELIGIBLE_LEVELS = 30;
const RECENT_LEVEL_SCAN_LIMIT = 120;
const MIN_ELIGIBLE_LEVELS_FOR_BIAS = 5;
const BIAS_REQUIRED_SHARE = 0.5;
const OBSERVED_EASY_THRESHOLD = 0.72;
const OBSERVED_HARD_THRESHOLD = 0.4;
const OBSERVED_EXPERT_THRESHOLD = 0.25;
const MIN_QUALIFIED_PLAYS_FOR_HARDNESS_BANDS = 15;
const HARDNESS_BAND_SCAN_LIMIT = 180;
const MIN_HARDNESS_SAMPLES_PER_TIER = 4;
const HARDNESS_BAND_BLEND_SAMPLE_TARGET = 16;
const V3_CALIBRATION_SCAN_LIMIT = 180;
const V3_DEFAULT_CHUNK_SIZE = 20;
const V3_MAX_EXECUTION_MS = 20_000;
const SHADOW_PREVIEW_SCAN_LIMIT = 40;
const SHADOW_PREVIEW_CANDIDATE_LIMIT = 8;
const SHADOW_READY_MIN_PLAYS = 30;
const SHADOW_READY_MAX_UNCERTAINTY = 0.5;

export const difficultyCalibrationV3Version = 'v3';

export type TierShift = -1 | 0 | 1;

type HardnessSample = {
  uniqueLetterCount: number;
  cryptoHardness: number;
};

export type DifficultyCalibrationSnapshot = {
  biasTierShift: TierShift;
  eligibleLevels: number;
  harderCount: number;
  easierCount: number;
  neutralCount: number;
  averageCryptoHardness: number | null;
  params: {
    bayesAlpha: number;
    bayesBeta: number;
    minQualifiedPlaysPerLevel: number;
    lookbackEligibleLevels: number;
    recentLevelScanLimit: number;
    minEligibleLevelsForBias: number;
    biasRequiredShare: number;
    observedEasyThreshold: number;
    observedHardThreshold: number;
    observedExpertThreshold: number;
  };
};

type CalibrationArtifact = {
  difficultyModelVersion: typeof difficultyModelVersion;
  snapshot: DifficultyCalibrationSnapshot;
  hardnessBoundsByTier: HardnessBoundsByTier;
};

export type DifficultyCalibrationV3Artifact = {
  difficultyCalibrationVersion: typeof difficultyCalibrationV3Version;
  difficultyModelVersion: typeof difficultyModelVersion;
  builtAt: number;
  complete: boolean;
  nextOffset: number | null;
  totalLevels: number;
  processedLevels: number;
  updatedEvaluations: number;
  qualifiedLevels: number;
  shadowReadyLevels: number;
  params: {
    scanLimit: number;
    chunkSize: number;
    maxExecutionMs: number;
  };
};

export type ShadowCalibrationPreviewCandidate = {
  levelId: string;
  staticDifficulty: number;
  shadowDifficulty: number;
  recommendedShift: TierShift;
  itemPlayCount: number;
  itemUncertainty: number;
};

export type ShadowCalibrationPreview = {
  readyLevels: number;
  averageStaticShadowDelta: number;
  maxStaticShadowDelta: number;
  generatedAt: number;
  reviewCandidates: ShadowCalibrationPreviewCandidate[];
};

type CalibrationLevelData = {
  levelId: string;
  puzzle: Awaited<ReturnType<typeof getPuzzlePrivate>>;
  telemetry: Awaited<ReturnType<typeof getQualifiedLevelTelemetry>> | null;
};

const CALIBRATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CALIBRATION_CONCURRENCY = 10;

const boundsSchema = z.object({
  min: z.number(),
  max: z.number(),
});
const hardnessTierSchema = z.object({
  uniqueLetterBounds: boundsSchema,
  cryptoHardnessBounds: boundsSchema,
});
const difficultyCalibrationSnapshotSchema = z.object({
  biasTierShift: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  eligibleLevels: z.number().int().nonnegative(),
  harderCount: z.number().int().nonnegative(),
  easierCount: z.number().int().nonnegative(),
  neutralCount: z.number().int().nonnegative(),
  averageCryptoHardness: z.number().nullable(),
  params: z.object({
    bayesAlpha: z.number(),
    bayesBeta: z.number(),
    minQualifiedPlaysPerLevel: z.number(),
    lookbackEligibleLevels: z.number(),
    recentLevelScanLimit: z.number(),
    minEligibleLevelsForBias: z.number(),
    biasRequiredShare: z.number(),
    observedEasyThreshold: z.number(),
    observedHardThreshold: z.number(),
    observedExpertThreshold: z.number(),
  }),
});
const calibrationArtifactSchema = z.object({
  difficultyModelVersion: z.literal(difficultyModelVersion),
  snapshot: difficultyCalibrationSnapshotSchema,
  hardnessBoundsByTier: z.object({
    warmup: hardnessTierSchema,
    medium: hardnessTierSchema,
    hard: hardnessTierSchema,
    expert: hardnessTierSchema,
  }),
});
const difficultyCalibrationV3ArtifactSchema = z.object({
  difficultyCalibrationVersion: z.literal(difficultyCalibrationV3Version),
  difficultyModelVersion: z.literal(difficultyModelVersion),
  builtAt: z.number().int().nonnegative(),
  complete: z.boolean(),
  nextOffset: z.number().int().nonnegative().nullable(),
  totalLevels: z.number().int().nonnegative(),
  processedLevels: z.number().int().nonnegative(),
  updatedEvaluations: z.number().int().nonnegative(),
  qualifiedLevels: z.number().int().nonnegative(),
  shadowReadyLevels: z.number().int().nonnegative(),
  params: z.object({
    scanLimit: z.number().int().positive(),
    chunkSize: z.number().int().positive(),
    maxExecutionMs: z.number().int().positive(),
  }),
});

const round4 = (value: number): number => Number(value.toFixed(4));

const clampTierShift = (value: number): TierShift => {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
};

let calibrationArtifactInFlight: Promise<CalibrationArtifact> | null = null;

const tierToRank = (tier: DifficultyTier): number => {
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

const clampShift = (value: number): TierShift => {
  if (value > 0) {
    return 1;
  }
  if (value < 0) {
    return -1;
  }
  return 0;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round2 = (value: number): number => Number(value.toFixed(2));

const lerp = (from: number, to: number, weight: number): number =>
  from + (to - from) * weight;

const quantile = (values: number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const position = clampNumber(ratio, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower] ?? 0;
  }
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lerp(lowerValue, upperValue, position - lower);
};

const calibrateTierHardnessBounds = (params: {
  defaults: HardnessBoundsByTier[DifficultyTier];
  samples: HardnessSample[];
}): HardnessBoundsByTier[DifficultyTier] => {
  if (params.samples.length < MIN_HARDNESS_SAMPLES_PER_TIER) {
    return params.defaults;
  }
  const sampleWeight = clampNumber(
    params.samples.length / HARDNESS_BAND_BLEND_SAMPLE_TARGET,
    0,
    1
  );

  const uniqueValues = params.samples.map((sample) => sample.uniqueLetterCount);
  const uniqueCenterObserved = quantile(uniqueValues, 0.5);
  const uniqueSpanObserved = Math.max(
    2,
    quantile(uniqueValues, 0.8) - quantile(uniqueValues, 0.2)
  );
  const uniqueDefault = params.defaults.uniqueLetterBounds;
  const uniqueCenterDefault = (uniqueDefault.min + uniqueDefault.max) / 2;
  const uniqueSpanDefault = Math.max(2, uniqueDefault.max - uniqueDefault.min);
  const uniqueCenter = lerp(uniqueCenterDefault, uniqueCenterObserved, sampleWeight);
  const uniqueSpan = lerp(uniqueSpanDefault, uniqueSpanObserved, sampleWeight);
  const uniqueMin = Math.floor(
    clampNumber(uniqueCenter - uniqueSpan / 2, 1, 25)
  );
  const uniqueMax = Math.ceil(
    clampNumber(uniqueCenter + uniqueSpan / 2, uniqueMin + 1, 26)
  );

  const hardnessValues = params.samples.map((sample) => sample.cryptoHardness);
  const hardCenterObserved = quantile(hardnessValues, 0.5);
  const hardSpanObserved = Math.max(
    0.1,
    quantile(hardnessValues, 0.8) - quantile(hardnessValues, 0.2)
  );
  const hardDefault = params.defaults.cryptoHardnessBounds;
  const hardCenterDefault = (hardDefault.min + hardDefault.max) / 2;
  const hardSpanDefault = Math.max(0.1, hardDefault.max - hardDefault.min);
  const hardCenter = lerp(hardCenterDefault, hardCenterObserved, sampleWeight);
  const hardSpan = lerp(hardSpanDefault, hardSpanObserved, sampleWeight);
  const hardMin = round2(clampNumber(hardCenter - hardSpan / 2, 0, 0.95));
  const hardMax = round2(clampNumber(hardCenter + hardSpan / 2, hardMin + 0.1, 1));

  return {
    uniqueLetterBounds: {
      min: uniqueMin,
      max: uniqueMax,
    },
    cryptoHardnessBounds: {
      min: hardMin,
      max: hardMax,
    },
  };
};

const calibrationParams = (): DifficultyCalibrationSnapshot['params'] => ({
  bayesAlpha: BAYES_ALPHA,
  bayesBeta: BAYES_BETA,
  minQualifiedPlaysPerLevel: MIN_QUALIFIED_PLAYS_PER_LEVEL,
  lookbackEligibleLevels: LOOKBACK_ELIGIBLE_LEVELS,
  recentLevelScanLimit: RECENT_LEVEL_SCAN_LIMIT,
  minEligibleLevelsForBias: MIN_ELIGIBLE_LEVELS_FOR_BIAS,
    biasRequiredShare: BIAS_REQUIRED_SHARE,
    observedEasyThreshold: OBSERVED_EASY_THRESHOLD,
    observedHardThreshold: OBSERVED_HARD_THRESHOLD,
    observedExpertThreshold: OBSERVED_EXPERT_THRESHOLD,
  });

const calibrationArtifactExpiration = (): Date =>
  new Date(Date.now() + CALIBRATION_CACHE_TTL_MS);

const runWithConcurrency = async <TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> => {
  if (items.length === 0) {
    return [];
  }
  const results: TOutput[] = new Array(items.length);
  let nextIndex = 0;
  const width = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: width }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex] as TInput, currentIndex);
      }
    })
  );

  return results;
};

const loadCalibrationLevels = async (levelIds: string[]): Promise<CalibrationLevelData[]> =>
  runWithConcurrency(levelIds, CALIBRATION_CONCURRENCY, async (levelId) => {
    const puzzle = await getPuzzlePrivate(levelId);
    if (!puzzle || puzzle.source !== 'AUTO_DAILY') {
      return {
        levelId,
        puzzle,
        telemetry: null,
      };
    }
    const telemetry = await getQualifiedLevelTelemetry(levelId);
    return {
      levelId,
      puzzle,
      telemetry,
    };
  });

const buildCalibrationArtifact = async (): Promise<CalibrationArtifact> => {
  const defaults = getDefaultHardnessBoundsByTier();
  const allLevelIds = await getAllLevelIds();
  const scanLimit = Math.max(HARDNESS_BAND_SCAN_LIMIT, RECENT_LEVEL_SCAN_LIMIT);
  const recentIds = allLevelIds.slice(-scanLimit).reverse();
  const levelData = await loadCalibrationLevels(recentIds);

  let eligibleLevels = 0;
  let harderCount = 0;
  let easierCount = 0;
  let neutralCount = 0;
  const hardnessValues: number[] = [];
  const samplesByTier: Record<DifficultyTier, HardnessSample[]> = {
    warmup: [],
    medium: [],
    hard: [],
    expert: [],
  };

  for (let index = 0; index < levelData.length; index += 1) {
    const entry = levelData[index];
    if (!entry?.puzzle || entry.puzzle.source !== 'AUTO_DAILY' || !entry.telemetry) {
      continue;
    }

    if (
      index < HARDNESS_BAND_SCAN_LIMIT &&
      entry.telemetry.plays >= MIN_QUALIFIED_PLAYS_FOR_HARDNESS_BANDS
    ) {
      const observedTier = observedTierFromTelemetry({
        telemetry: entry.telemetry,
        targetTimeSeconds: entry.puzzle.targetTimeSeconds ?? null,
      });
      const profile = computePhraseDifficultyProfile(entry.puzzle.targetText);
      samplesByTier[observedTier].push({
        uniqueLetterCount: profile.uniqueLetterCount,
        cryptoHardness:
          typeof entry.puzzle.cryptoHardness === 'number'
            ? entry.puzzle.cryptoHardness
            : profile.cryptoHardness,
      });
    }

    if (
      index >= RECENT_LEVEL_SCAN_LIMIT ||
      eligibleLevels >= LOOKBACK_ELIGIBLE_LEVELS ||
      entry.telemetry.plays < MIN_QUALIFIED_PLAYS_PER_LEVEL
    ) {
      continue;
    }

    const puzzleHardness =
      typeof entry.puzzle.cryptoHardness === 'number'
        ? entry.puzzle.cryptoHardness
        : computePhraseDifficultyProfile(entry.puzzle.targetText).cryptoHardness;
    const primaryTier = tierFromDifficulty(entry.puzzle.difficulty);
    const observedTier = observedTierFromTelemetry({
      telemetry: entry.telemetry,
      targetTimeSeconds: entry.puzzle.targetTimeSeconds ?? null,
    });
    const shift = tierShift(primaryTier, observedTier);
    eligibleLevels += 1;
    hardnessValues.push(puzzleHardness);

    if (shift > 0) {
      harderCount += 1;
    } else if (shift < 0) {
      easierCount += 1;
    } else {
      neutralCount += 1;
    }
  }

  let biasTierShift: TierShift = 0;
  if (eligibleLevels >= MIN_ELIGIBLE_LEVELS_FOR_BIAS) {
    const harderShare = harderCount / eligibleLevels;
    const easierShare = easierCount / eligibleLevels;
    if (harderShare >= BIAS_REQUIRED_SHARE) {
      biasTierShift = 1;
    } else if (easierShare >= BIAS_REQUIRED_SHARE) {
      biasTierShift = -1;
    }
  }

	  return {
	    difficultyModelVersion,
	    snapshot: {
      biasTierShift,
      eligibleLevels,
      harderCount,
      easierCount,
      neutralCount,
      averageCryptoHardness:
        eligibleLevels > 0
          ? Number(quantile(hardnessValues, 0.5).toFixed(4))
          : null,
      params: calibrationParams(),
    },
    hardnessBoundsByTier: {
      warmup: calibrateTierHardnessBounds({
        defaults: defaults.warmup,
        samples: samplesByTier.warmup,
      }),
      medium: calibrateTierHardnessBounds({
        defaults: defaults.medium,
        samples: samplesByTier.medium,
      }),
      hard: calibrateTierHardnessBounds({
        defaults: defaults.hard,
        samples: samplesByTier.hard,
      }),
      expert: calibrateTierHardnessBounds({
        defaults: defaults.expert,
        samples: samplesByTier.expert,
      }),
    },
  };
};

const readCachedCalibrationArtifact = async (): Promise<CalibrationArtifact | null> => {
  const raw = await redis.get(keyDifficultyCalibrationArtifact);
  if (!raw) {
    return null;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = calibrationArtifactSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
};

const getCalibrationArtifact = async (): Promise<CalibrationArtifact> => {
  const cached = await readCachedCalibrationArtifact();
  if (cached) {
    return cached;
  }
  if (!calibrationArtifactInFlight) {
    calibrationArtifactInFlight = (async () => {
      const artifact = await buildCalibrationArtifact();
      await redis.set(
        keyDifficultyCalibrationArtifact,
        JSON.stringify(artifact),
        { expiration: calibrationArtifactExpiration() }
      );
      return artifact;
    })().finally(() => {
      calibrationArtifactInFlight = null;
    });
  }
  return calibrationArtifactInFlight;
};

export const smoothedWinRate = (wins: number, plays: number): number =>
  (BAYES_ALPHA + wins) / (BAYES_ALPHA + BAYES_BETA + plays);

const tierFromDifficulty = (difficulty: number): DifficultyTier =>
  difficultyToTier(difficulty);

export const observedTierFromSmoothedRate = (rate: number): DifficultyTier => {
  if (rate >= OBSERVED_EASY_THRESHOLD) {
    return 'warmup';
  }
  if (rate <= OBSERVED_EXPERT_THRESHOLD) {
    return 'expert';
  }
  if (rate <= OBSERVED_HARD_THRESHOLD) {
    return 'hard';
  }
  return 'medium';
};

export const telemetryEaseScore = (params: {
  wins: number;
  plays: number;
  failures: number;
  abandons: number;
  averageSolveSeconds: number;
  averageUsedPowerups: number;
  averageMistakes: number;
  averageRetryCount: number;
  targetTimeSeconds?: number | null;
}): number => {
  const completionEase = smoothedWinRate(params.wins, params.plays);
  const failureRate = params.plays > 0 ? params.failures / params.plays : 0;
  const abandonRate = params.plays > 0 ? params.abandons / params.plays : 0;
  const hintPressure = clampNumber(params.averageUsedPowerups / 2.5, 0, 1);
  const mistakePressure = clampNumber(params.averageMistakes / 3, 0, 1);
  const retryPressure = clampNumber(params.averageRetryCount / 2, 0, 1);
  const slowPressure =
    typeof params.targetTimeSeconds === 'number' && params.targetTimeSeconds > 0
      ? Math.max(
          0,
          clampNumber(params.averageSolveSeconds / (params.targetTimeSeconds * 1.35), 0, 1.4) -
            0.45
        )
      : 0;

  return clampNumber(
    completionEase -
      failureRate * 0.18 -
      abandonRate * 0.24 -
      hintPressure * 0.14 -
      mistakePressure * 0.08 -
      retryPressure * 0.06 -
      slowPressure * 0.12,
    0,
    1
  );
};

export const observedTierFromTelemetry = (params: {
  telemetry: Awaited<ReturnType<typeof getQualifiedLevelTelemetry>>;
  targetTimeSeconds?: number | null;
}): DifficultyTier =>
  observedTierFromSmoothedRate(
    telemetryEaseScore({
      wins: params.telemetry.wins,
      plays: params.telemetry.plays,
      failures: params.telemetry.failures ?? 0,
      abandons: params.telemetry.abandons ?? 0,
      averageSolveSeconds: params.telemetry.averageSolveSeconds ?? 0,
      averageUsedPowerups: params.telemetry.averageUsedPowerups ?? 0,
      averageMistakes: params.telemetry.averageMistakes ?? 0,
      averageRetryCount: params.telemetry.averageRetryCount ?? 0,
      targetTimeSeconds: params.targetTimeSeconds ?? null,
    })
  );

export const tierShift = (
  primaryTier: DifficultyTier,
  observedTier: DifficultyTier
): TierShift => {
  const primaryRank = tierToRank(primaryTier);
  const observedRank = tierToRank(observedTier);
  return clampShift(primaryRank - observedRank);
};

export const applyBiasToDifficulty = (
  baseDifficulty: number,
  bias: TierShift
): number => {
  return Math.max(1, Math.min(10, baseDifficulty + bias));
};

export const computeAdaptiveHardnessBounds =
  async (): Promise<HardnessBoundsByTier> => {
    try {
      const artifact = await getCalibrationArtifact();
      return artifact.hardnessBoundsByTier;
    } catch (error) {
      console.warn(
        `Difficulty calibration failed, using fallback bounds: ${
          error instanceof Error ? error.message : 'unknown'
        }`
      );
      // Fallback to last known good bounds or defaults
      const fallback = await readCachedCalibrationArtifact();
      if (fallback) {
        console.log('Using cached calibration bounds as fallback');
        return fallback.hardnessBoundsByTier;
      }
      console.log('Using default calibration bounds as fallback');
      return getDefaultHardnessBoundsByTier();
    }
  };

export const getGlobalDailyCalibrationSnapshot =
  async (): Promise<DifficultyCalibrationSnapshot> => {
    const artifact = await getCalibrationArtifact();
    return artifact.snapshot;
  };

export const computeGlobalDailyBias = async (): Promise<TierShift> => {
  const snapshot = await getGlobalDailyCalibrationSnapshot();
  return snapshot.biasTierShift;
};

export const readDifficultyCalibrationV3Artifact =
  async (): Promise<DifficultyCalibrationV3Artifact | null> => {
    const raw = await redis.get(keyDifficultyCalibrationV3Artifact);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      const artifact = difficultyCalibrationV3ArtifactSchema.safeParse(parsed);
      return artifact.success ? artifact.data : null;
    } catch {
      return null;
    }
  };

const shadowRatingIsReady = (snapshot: {
  itemPlayCount: number;
  itemUncertainty: number;
} | null): boolean =>
  snapshot !== null &&
  snapshot.itemPlayCount >= SHADOW_READY_MIN_PLAYS &&
  snapshot.itemUncertainty <= SHADOW_READY_MAX_UNCERTAINTY;

const recommendedShadowShift = (params: {
  staticDifficulty: number;
  shadowDifficulty: number;
}): TierShift =>
  clampTierShift(
    Math.max(
      -1,
      Math.min(1, Math.round(params.shadowDifficulty) - params.staticDifficulty)
    )
  );

export const buildShadowCalibrationPreview =
  async (): Promise<ShadowCalibrationPreview> => {
    const evaluations = await getRecentChallengeEvaluations(SHADOW_PREVIEW_SCAN_LIMIT);
    const readyCandidates = evaluations
      .filter((evaluation) => shadowRatingIsReady(evaluation.shadowRatingSnapshot))
      .map((evaluation): ShadowCalibrationPreviewCandidate => {
        const shadow = evaluation.shadowRatingSnapshot;
        if (shadow === null) {
          throw new Error('Expected ready shadow rating snapshot.');
        }
        const staticDifficulty = evaluation.difficultyBreakdown.staticDifficulty;
        return {
          levelId: evaluation.levelId,
          staticDifficulty,
          shadowDifficulty: round4(shadow.itemDifficultyRating),
          recommendedShift: recommendedShadowShift({
            staticDifficulty,
            shadowDifficulty: shadow.itemDifficultyRating,
          }),
          itemPlayCount: shadow.itemPlayCount,
          itemUncertainty: round4(shadow.itemUncertainty),
        };
      });
    const deltas = readyCandidates.map((candidate) =>
      Math.abs(candidate.shadowDifficulty - candidate.staticDifficulty)
    );
    const averageDelta =
      deltas.length > 0
        ? deltas.reduce((total, delta) => total + delta, 0) / deltas.length
        : 0;
    const maxDelta = deltas.length > 0 ? Math.max(...deltas) : 0;
    const reviewCandidates = [...readyCandidates]
      .sort(
        (left, right) =>
          Math.abs(right.shadowDifficulty - right.staticDifficulty) -
          Math.abs(left.shadowDifficulty - left.staticDifficulty)
      )
      .slice(0, SHADOW_PREVIEW_CANDIDATE_LIMIT);

    return {
      readyLevels: readyCandidates.length,
      averageStaticShadowDelta: round4(averageDelta),
      maxStaticShadowDelta: round4(maxDelta),
      generatedAt: Date.now(),
      reviewCandidates,
    };
  };

type DifficultyCalibrationV3ChunkParams = {
  offset?: number;
  processedLevels?: number;
  updatedEvaluations?: number;
  qualifiedLevels?: number;
  shadowReadyLevels?: number;
  chunkSize?: number;
  startedAtMs?: number;
};

type DifficultyCalibrationV3ChunkProgress = {
  processedThisChunk: number;
  updatedThisChunk: number;
  qualifiedThisChunk: number;
  shadowReadyThisChunk: number;
};

const normalizeDifficultyCalibrationV3Chunk = (
  params?: DifficultyCalibrationV3ChunkParams
): {
  startedAtMs: number;
  chunkSize: number;
  offset: number;
} => ({
  startedAtMs: params?.startedAtMs ?? Date.now(),
  chunkSize: Math.max(
    1,
    Math.floor(params?.chunkSize ?? V3_DEFAULT_CHUNK_SIZE)
  ),
  offset: Math.max(0, Math.floor(params?.offset ?? 0)),
});

const isDifficultyCalibrationV3ChunkOutOfTime = (
  startedAtMs: number
): boolean => Date.now() - startedAtMs > V3_MAX_EXECUTION_MS;

const refreshChallengeEvaluationForCalibration = async (
  levelId: string
): Promise<Omit<DifficultyCalibrationV3ChunkProgress, 'processedThisChunk'>> => {
  const puzzle = await getPuzzlePrivate(levelId);
  if (!puzzle) {
    return {
      updatedThisChunk: 0,
      qualifiedThisChunk: 0,
      shadowReadyThisChunk: 0,
    };
  }

  const [telemetry, shadowRatingSnapshot] = await Promise.all([
    getQualifiedLevelTelemetry(levelId),
    getChallengeShadowRatingSnapshot({
      levelId,
      puzzle,
    }),
  ]);
  await saveChallengeEvaluation(
    buildChallengeEvaluation({
      puzzle,
      telemetrySnapshot: {
        ...telemetry,
        targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
      },
      shadowRatingSnapshot,
      optimizerSummary: {
        mode: 'fallback',
        candidatesEvaluated: 0,
        searchDepth: 0,
        selectedScore: null,
        reasons: ['Evaluation refreshed by scheduled V3 shadow calibration.'],
      },
    })
  );

  return {
    updatedThisChunk: 1,
    qualifiedThisChunk:
      telemetry.plays >= MIN_QUALIFIED_PLAYS_FOR_HARDNESS_BANDS ? 1 : 0,
    shadowReadyThisChunk: shadowRatingIsReady(shadowRatingSnapshot) ? 1 : 0,
  };
};

export const runDifficultyCalibrationV3Chunk = async (
  params?: DifficultyCalibrationV3ChunkParams
): Promise<DifficultyCalibrationV3Artifact> => {
  const { startedAtMs, chunkSize, offset } =
    normalizeDifficultyCalibrationV3Chunk(params);
  const allLevelIds = await getAllLevelIds();
  const levelIds = allLevelIds.slice(-V3_CALIBRATION_SCAN_LIMIT).reverse();
  const chunk = levelIds.slice(offset, offset + chunkSize);
  const progress: DifficultyCalibrationV3ChunkProgress = {
    processedThisChunk: 0,
    updatedThisChunk: 0,
    qualifiedThisChunk: 0,
    shadowReadyThisChunk: 0,
  };

  for (const levelId of chunk) {
    if (isDifficultyCalibrationV3ChunkOutOfTime(startedAtMs)) {
      break;
    }
    progress.processedThisChunk += 1;
    const levelProgress = await refreshChallengeEvaluationForCalibration(levelId);
    progress.updatedThisChunk += levelProgress.updatedThisChunk;
    progress.qualifiedThisChunk += levelProgress.qualifiedThisChunk;
    progress.shadowReadyThisChunk += levelProgress.shadowReadyThisChunk;
  }

  const processedLevels =
    (params?.processedLevels ?? 0) + progress.processedThisChunk;
  const updatedEvaluations =
    (params?.updatedEvaluations ?? 0) + progress.updatedThisChunk;
  const qualifiedLevels =
    (params?.qualifiedLevels ?? 0) + progress.qualifiedThisChunk;
  const shadowReadyLevels =
    (params?.shadowReadyLevels ?? 0) + progress.shadowReadyThisChunk;
  const nextOffset =
    offset + progress.processedThisChunk < levelIds.length
      ? offset + progress.processedThisChunk
      : null;
  const artifact: DifficultyCalibrationV3Artifact = {
    difficultyCalibrationVersion: difficultyCalibrationV3Version,
    difficultyModelVersion,
    builtAt: Date.now(),
    complete: nextOffset === null,
    nextOffset,
    totalLevels: levelIds.length,
    processedLevels,
    updatedEvaluations,
    qualifiedLevels,
    shadowReadyLevels,
    params: {
      scanLimit: V3_CALIBRATION_SCAN_LIMIT,
      chunkSize,
      maxExecutionMs: V3_MAX_EXECUTION_MS,
    },
  };
  await redis.set(keyDifficultyCalibrationV3Artifact, JSON.stringify(artifact));
  return artifact;
};
