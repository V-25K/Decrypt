import { difficultyToTier, type DifficultyTier } from './content';
import { getQualifiedLevelTelemetry } from './engagement';
import { getAllLevelIds, getPuzzlePrivate } from './puzzle-store';

export const BAYES_ALPHA = 6;
export const BAYES_BETA = 4;
export const MIN_QUALIFIED_PLAYS_PER_LEVEL = 30;
export const LOOKBACK_ELIGIBLE_LEVELS = 30;
export const RECENT_LEVEL_SCAN_LIMIT = 120;
export const MIN_ELIGIBLE_LEVELS_FOR_BIAS = 5;
export const BIAS_REQUIRED_SHARE = 0.6;
export const OBSERVED_EASY_THRESHOLD = 0.72;
export const OBSERVED_HARD_THRESHOLD = 0.4;

export type TierShift = -1 | 0 | 1;

export type DifficultyCalibrationSnapshot = {
  biasTierShift: TierShift;
  eligibleLevels: number;
  harderCount: number;
  easierCount: number;
  neutralCount: number;
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
  };
};

const tierToRank = (tier: DifficultyTier): number => {
  if (tier === 'easy') {
    return 0;
  }
  if (tier === 'medium') {
    return 1;
  }
  return 2;
};

const rankToTier = (rank: number): DifficultyTier => {
  if (rank <= 0) {
    return 'easy';
  }
  if (rank >= 2) {
    return 'hard';
  }
  return 'medium';
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
});

export const smoothedWinRate = (wins: number, plays: number): number =>
  (BAYES_ALPHA + wins) / (BAYES_ALPHA + BAYES_BETA + plays);

export const tierFromDifficulty = (difficulty: number): DifficultyTier =>
  difficultyToTier(difficulty);

export const observedTierFromSmoothedRate = (rate: number): DifficultyTier => {
  if (rate >= OBSERVED_EASY_THRESHOLD) {
    return 'easy';
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
  const shiftedRank = Math.max(0, Math.min(2, tierToRank(baseTier) + bias));
  const shiftedTier = rankToTier(shiftedRank);
  if (shiftedTier === 'easy') {
    return 2;
  }
  if (shiftedTier === 'medium') {
    return 5;
  }
  return 9;
};

export const getGlobalDailyCalibrationSnapshot =
  async (): Promise<DifficultyCalibrationSnapshot> => {
    const allLevelIds = await getAllLevelIds();
    const recentIds = allLevelIds.slice(-RECENT_LEVEL_SCAN_LIMIT).reverse();

    let eligibleLevels = 0;
    let harderCount = 0;
    let easierCount = 0;
    let neutralCount = 0;

    for (const levelId of recentIds) {
      if (eligibleLevels >= LOOKBACK_ELIGIBLE_LEVELS) {
        break;
      }
      const puzzle = await getPuzzlePrivate(levelId);
      if (!puzzle || puzzle.source !== 'AUTO_DAILY') {
        continue;
      }

      const telemetry = await getQualifiedLevelTelemetry(levelId);
      if (telemetry.plays < MIN_QUALIFIED_PLAYS_PER_LEVEL) {
        continue;
      }

      const primaryTier = tierFromDifficulty(puzzle.difficulty);
      const observedTier = observedTierFromSmoothedRate(
        smoothedWinRate(telemetry.wins, telemetry.plays)
      );
      const shift = tierShift(primaryTier, observedTier);
      eligibleLevels += 1;

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
      biasTierShift,
      eligibleLevels,
      harderCount,
      easierCount,
      neutralCount,
      params: calibrationParams(),
    };
  };

export const computeGlobalDailyBias = async (): Promise<TierShift> => {
  const snapshot = await getGlobalDailyCalibrationSnapshot();
  return snapshot.biasTierShift;
};
