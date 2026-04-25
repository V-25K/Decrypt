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
import { keyDifficultyCalibrationArtifact } from './keys';

export const BAYES_ALPHA = 6;
export const BAYES_BETA = 4;
export const MIN_QUALIFIED_PLAYS_PER_LEVEL = 30;
export const LOOKBACK_ELIGIBLE_LEVELS = 30;
export const RECENT_LEVEL_SCAN_LIMIT = 120;
export const MIN_ELIGIBLE_LEVELS_FOR_BIAS = 5;
export const BIAS_REQUIRED_SHARE = 0.6;
export const OBSERVED_EASY_THRESHOLD = 0.72;
export const OBSERVED_HARD_THRESHOLD = 0.4;
export const OBSERVED_EXPERT_THRESHOLD = 0.25;
export const MIN_QUALIFIED_PLAYS_FOR_HARDNESS_BANDS = 15;
export const HARDNESS_BAND_SCAN_LIMIT = 180;
export const MIN_HARDNESS_SAMPLES_PER_TIER = 4;
export const HARDNESS_BAND_BLEND_SAMPLE_TARGET = 16;

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
  snapshot: DifficultyCalibrationSnapshot;
  hardnessBoundsByTier: HardnessBoundsByTier;
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
  snapshot: difficultyCalibrationSnapshotSchema,
  hardnessBoundsByTier: z.object({
    warmup: hardnessTierSchema,
    medium: hardnessTierSchema,
    hard: hardnessTierSchema,
    expert: hardnessTierSchema,
  }),
});

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

const rankToTier = (rank: number): DifficultyTier => {
  if (rank <= 0) {
    return 'warmup';
  }
  if (rank === 1) {
    return 'medium';
  }
  if (rank === 2) {
    return 'hard';
  }
  return 'expert';
};

const tierDifficultyBounds = (tier: DifficultyTier): { min: number; max: number } => {
  if (tier === 'warmup') {
    return { min: 1, max: 3 };
  }
  if (tier === 'medium') {
    return { min: 4, max: 5 };
  }
  if (tier === 'hard') {
    return { min: 6, max: 8 };
  }
  return { min: 9, max: 10 };
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
      const observedTier = observedTierFromSmoothedRate(
        smoothedWinRate(entry.telemetry.wins, entry.telemetry.plays)
      );
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
    const observedTier = observedTierFromSmoothedRate(
      smoothedWinRate(entry.telemetry.wins, entry.telemetry.plays)
    );
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

export const tierFromDifficulty = (difficulty: number): DifficultyTier =>
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
  const baseTier = tierFromDifficulty(baseDifficulty);
  const shiftedRank = Math.max(0, Math.min(3, tierToRank(baseTier) + bias));
  const shiftedTier = rankToTier(shiftedRank);
  const baseBounds = tierDifficultyBounds(baseTier);
  const shiftedBounds = tierDifficultyBounds(shiftedTier);
  const baseClamped = Math.max(baseBounds.min, Math.min(baseBounds.max, baseDifficulty));
  const baseSpan = baseBounds.max - baseBounds.min;
  const shiftedSpan = shiftedBounds.max - shiftedBounds.min;
  const relativePosition =
    baseSpan > 0 ? (baseClamped - baseBounds.min) / baseSpan : 0;
  const shiftedValue =
    shiftedBounds.min + Math.round(relativePosition * shiftedSpan);
  return Math.max(1, Math.min(10, shiftedValue));
};

export const computeAdaptiveHardnessBounds =
  async (): Promise<HardnessBoundsByTier> => {
    const artifact = await getCalibrationArtifact();
    return artifact.hardnessBoundsByTier;
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
