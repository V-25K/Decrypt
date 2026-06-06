import { redis } from '@devvit/web/server';
import { z } from 'zod';
import type { PuzzlePrivate } from '../../shared/game';
import {
  keyLevelDifficultyRating,
  keyPlayerDifficultyRating,
} from './keys';
import type { ChallengeShadowRatingSnapshot } from './challenge-evaluation';

export const shadowDifficultyRatingVersion = 'v1';
export const shadowUncertaintyDecay = 0.97;
export const shadowMinUncertainty = 0.12;
export const shadowBaseLearningRate = 0.46;

export type ShadowDifficultyRating = {
  version: typeof shadowDifficultyRatingVersion;
  rating: number;
  uncertainty: number;
  playCount: number;
  updatedAt: number;
};

export type ShadowDifficultyOutcome = {
  userId: string;
  levelId: string;
  puzzle: PuzzlePrivate;
  outcome: 'win' | 'failure';
  solveSeconds?: number | null;
  mistakes: number;
  usedPowerups: number;
  retryCount: number;
  targetTimeSeconds?: number | null;
};

const shadowDifficultyRatingStoredSchema = z.object({
  version: z.literal(shadowDifficultyRatingVersion),
  rating: z.number(),
  uncertainty: z.number(),
  playCount: z.number(),
  updatedAt: z.number().optional(),
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round4 = (value: number): number => Number(value.toFixed(4));

const defaultPlayerRating = (): ShadowDifficultyRating => ({
  version: shadowDifficultyRatingVersion,
  rating: 5,
  uncertainty: 1,
  playCount: 0,
  updatedAt: Date.now(),
});

const defaultLevelRating = (puzzle: PuzzlePrivate): ShadowDifficultyRating => ({
  version: shadowDifficultyRatingVersion,
  rating: puzzle.difficulty,
  uncertainty: 1,
  playCount: 0,
  updatedAt: Date.now(),
});

const parseRating = (
  raw: string | null,
  fallback: ShadowDifficultyRating
): ShadowDifficultyRating => {
  if (!raw) {
    return fallback;
  }
  try {
    const parsedJson: unknown = JSON.parse(raw);
    const parsed = shadowDifficultyRatingStoredSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return fallback;
    }
    const rating = parsed.data;
    return {
      version: shadowDifficultyRatingVersion,
      rating: clamp(rating.rating, 1, 10),
      uncertainty: clamp(rating.uncertainty, shadowMinUncertainty, 1),
      playCount: Math.max(0, Math.floor(rating.playCount)),
      updatedAt:
        typeof rating.updatedAt === 'number' && Number.isFinite(rating.updatedAt)
          ? Math.max(0, Math.floor(rating.updatedAt))
          : fallback.updatedAt,
    };
  } catch {
    return fallback;
  }
};

const expectedWinProbability = (params: {
  playerRating: number;
  itemDifficultyRating: number;
}): number =>
  1 / (1 + Math.exp((params.itemDifficultyRating - params.playerRating) / 1.45));

const observedOutcomeScore = (outcome: ShadowDifficultyOutcome): number => {
  if (outcome.outcome === 'failure') {
    return 0;
  }
  const target =
    typeof outcome.targetTimeSeconds === 'number' && outcome.targetTimeSeconds > 0
      ? outcome.targetTimeSeconds
      : null;
  const speedBonus =
    target !== null && typeof outcome.solveSeconds === 'number'
      ? clamp((target - outcome.solveSeconds) / Math.max(1, target), -0.25, 0.2)
      : 0;
  const mistakePenalty = clamp(outcome.mistakes * 0.045, 0, 0.22);
  const powerupPenalty = clamp(outcome.usedPowerups * 0.05, 0, 0.24);
  const retryPenalty = clamp(outcome.retryCount * 0.08, 0, 0.24);
  return clamp(0.72 + speedBonus - mistakePenalty - powerupPenalty - retryPenalty, 0.15, 1);
};

const updateUncertainty = (rating: ShadowDifficultyRating): number =>
  round4(clamp(rating.uncertainty * shadowUncertaintyDecay, shadowMinUncertainty, 1));

export const getPlayerShadowDifficultyRating = async (
  userId: string
): Promise<ShadowDifficultyRating> =>
  parseRating(
    (await redis.get(keyPlayerDifficultyRating(userId))) ?? null,
    defaultPlayerRating()
  );

export const getLevelShadowDifficultyRating = async (
  levelId: string,
  puzzle: PuzzlePrivate
): Promise<ShadowDifficultyRating> =>
  parseRating(
    (await redis.get(keyLevelDifficultyRating(levelId))) ?? null,
    defaultLevelRating(puzzle)
  );

export const recordShadowDifficultyOutcome = async (
  outcome: ShadowDifficultyOutcome
): Promise<ChallengeShadowRatingSnapshot> => {
  const [player, item] = await Promise.all([
    getPlayerShadowDifficultyRating(outcome.userId),
    getLevelShadowDifficultyRating(outcome.levelId, outcome.puzzle),
  ]);
  const expected = expectedWinProbability({
    playerRating: player.rating,
    itemDifficultyRating: item.rating,
  });
  const observed = observedOutcomeScore(outcome);
  const learningRate =
    shadowBaseLearningRate * ((player.uncertainty + item.uncertainty) / 2);
  const delta = (observed - expected) * learningRate;
  const now = Date.now();
  const nextPlayer: ShadowDifficultyRating = {
    version: shadowDifficultyRatingVersion,
    rating: round4(clamp(player.rating + delta, 1, 10)),
    uncertainty: updateUncertainty(player),
    playCount: player.playCount + 1,
    updatedAt: now,
  };
  const nextItem: ShadowDifficultyRating = {
    version: shadowDifficultyRatingVersion,
    rating: round4(clamp(item.rating - delta, 1, 10)),
    uncertainty: updateUncertainty(item),
    playCount: item.playCount + 1,
    updatedAt: now,
  };

  await Promise.all([
    redis.set(keyPlayerDifficultyRating(outcome.userId), JSON.stringify(nextPlayer)),
    redis.set(keyLevelDifficultyRating(outcome.levelId), JSON.stringify(nextItem)),
  ]);

  return {
    itemDifficultyRating: nextItem.rating,
    itemUncertainty: nextItem.uncertainty,
    itemPlayCount: nextItem.playCount,
    playerSkillRating: nextPlayer.rating,
    playerUncertainty: nextPlayer.uncertainty,
    playerPlayCount: nextPlayer.playCount,
  };
};

export const recordShadowDifficultyOutcomeSafely = async (
  outcome: ShadowDifficultyOutcome
): Promise<ChallengeShadowRatingSnapshot> => {
  try {
    return await recordShadowDifficultyOutcome(outcome);
  } catch (error) {
    console.warn('[shadow-difficulty] outcome update failed', {
      levelId: outcome.levelId,
      userId: outcome.userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
};

export const getChallengeShadowRatingSnapshot = async (params: {
  levelId: string;
  puzzle: PuzzlePrivate;
  userId?: string | null;
}): Promise<ChallengeShadowRatingSnapshot> => {
  const [item, player] = await Promise.all([
    getLevelShadowDifficultyRating(params.levelId, params.puzzle),
    params.userId ? getPlayerShadowDifficultyRating(params.userId) : null,
  ]);
  return {
    itemDifficultyRating: item.rating,
    itemUncertainty: item.uncertainty,
    itemPlayCount: item.playCount,
    ...(player
      ? {
          playerSkillRating: player.rating,
          playerUncertainty: player.uncertainty,
          playerPlayCount: player.playCount,
        }
      : {}),
  };
};
