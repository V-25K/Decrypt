export const startingGlobalRating = 500;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const clampFinite = (
  value: number,
  min: number,
  max: number,
  fallback: number
): number => clamp(finiteOr(value, fallback), min, max);

const nonnegativeInteger = (
  value: number | null | undefined,
  fallback = 0
): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback;

export type RatingOutcome = 'win' | 'loss';

export type RatingInput = {
  playerRating: number;
  ratingGames: number;
  outcome: RatingOutcome;
  difficulty: number;
  cryptoHardness?: number | null | undefined;
  isLogical?: boolean | undefined;
  solveSeconds?: number | null;
  targetTimeSeconds?: number | null;
  mistakes?: number;
  usedPowerups?: number;
  currentWinStreak?: number;
  isRecoveryRun?: boolean;
};

export type RatingResult = {
  previousRating: number;
  nextRating: number;
  ratingDelta: number;
  challengeRating: number;
  expectedScore: number;
  qualityMultiplier: number;
};

const getChallengeRating = (params: {
  difficulty: number;
  cryptoHardness?: number | null | undefined;
  isLogical?: boolean | undefined;
}): number => {
  const safeDifficulty = clampFinite(Math.floor(params.difficulty), 1, 10, 5);
  const hardnessBonus =
    typeof params.cryptoHardness === 'number' && Number.isFinite(params.cryptoHardness)
      ? clamp(params.cryptoHardness, 0, 1) * 45
      : 0;
  const logicBonus = params.isLogical ? 20 : 0;
  return Math.round(clamp(350 + safeDifficulty * 45 + hardnessBonus + logicBonus, 350, 900));
};

const getKFactor = (ratingGames: number): number => {
  const games = nonnegativeInteger(ratingGames);
  if (games < 20) {
    return 48;
  }
  if (games < 100) {
    return 32;
  }
  return 20;
};

const getSpeedModifier = (params: {
  solveSeconds?: number | null;
  targetTimeSeconds?: number | null;
}): number => {
  if (
    typeof params.solveSeconds !== 'number' ||
    typeof params.targetTimeSeconds !== 'number' ||
    !Number.isFinite(params.solveSeconds) ||
    !Number.isFinite(params.targetTimeSeconds) ||
    params.targetTimeSeconds <= 0
  ) {
    return 0;
  }
  const ratio = params.solveSeconds / params.targetTimeSeconds;
  if (ratio <= 0.5) {
    return 0.12;
  }
  if (ratio < 1) {
    return (1 - ratio) * 0.24;
  }
  return -clamp((ratio - 1) * 0.08, 0, 0.08);
};

const getWinQualityMultiplier = (params: RatingInput): number => {
  const mistakes = nonnegativeInteger(params.mistakes);
  const usedPowerups = nonnegativeInteger(params.usedPowerups);
  const streakBonus = clamp(nonnegativeInteger(params.currentWinStreak) * 0.03, 0, 0.18);
  const mistakeModifier = mistakes === 0 ? 0.1 : -clamp(mistakes * 0.04, 0, 0.16);
  const powerupModifier = usedPowerups === 0 ? 0.08 : -clamp(usedPowerups * 0.04, 0, 0.16);
  const speedModifier = getSpeedModifier(params);
  const raw = 1 + streakBonus + mistakeModifier + powerupModifier + speedModifier;
  const capped = params.isRecoveryRun ? Math.min(raw, 0.5) : raw;
  return clamp(capped, 0.25, 1.5);
};

const getLossQualityMultiplier = (): number => 1;

export const calculateRating = (params: RatingInput): RatingResult => {
  const previousRating = Math.max(0, Math.round(finiteOr(params.playerRating, startingGlobalRating)));
  const challengeRating = getChallengeRating({
    difficulty: params.difficulty,
    cryptoHardness: params.cryptoHardness,
    isLogical: params.isLogical,
  });
  const expectedScore =
    1 / (1 + 10 ** ((challengeRating - previousRating) / 400));
  const actual = params.outcome === 'win' ? 1 : 0;
  const kFactor = getKFactor(params.ratingGames);
  const qualityMultiplier =
    params.outcome === 'win'
      ? getWinQualityMultiplier(params)
      : getLossQualityMultiplier();
  const rawDelta = kFactor * (actual - expectedScore) * qualityMultiplier;
  const roundedDelta = Math.round(
    clamp(rawDelta, params.outcome === 'win' ? -32 : -32, params.outcome === 'win' ? 40 : 0)
  );
  const minWinDelta = 1;
  const ratingDelta = params.outcome === 'win'
    ? Math.max(minWinDelta, roundedDelta)
    : roundedDelta;
  const nextRating = Math.max(0, previousRating + ratingDelta);
  return {
    previousRating,
    nextRating,
    ratingDelta,
    challengeRating,
    expectedScore,
    qualityMultiplier,
  };
};
