import { context, reddit, redis } from '@devvit/web/server';
import { aiChallengeTypePool, generatePuzzlePhrase } from './ai';
import { getDecryptSettings } from './config';
import { normalizeContent, sanitizePhrase, validateQuoteForPhase1 } from './content';
import { buildPuzzle } from './puzzle';
import {
  computeGlobalDailyBias,
} from './difficulty-calibration';
import { getBundledEndlessReservationOwner } from './endless-reservations';
import {
  clearUsedSignature,
  getPuzzlePublishedPostId,
  getNextLevelId,
  getStagedLevelId,
  getPuzzlePrivate,
  clearStagedLevelId,
  reserveUsedSignature,
  savePuzzle,
  setPuzzlePublishedPostId,
  setStagedLevelId,
  setDailyPointer,
} from './puzzle-store';
import {
  keyDailyChallengeTypeCursor,
  keyDailyChallengeTypeSeed,
  keyDailyTierCursor,
} from './keys';
import { validatePuzzle } from './validation';
import { formatDateKey } from './serde';
import { mulberry32, randInt, shuffleWithRng } from './rng';
import type { DifficultyTier } from './content';
import type { ChallengeType } from '../../shared/game';

const isDummySolverUnsatisfiedError = (error: unknown): boolean =>
  error instanceof Error && error.message === 'DUMMY_SOLVER_UNSATISFIED';

const buildPuzzleWithSolverFallback = (
  params: Parameters<typeof buildPuzzle>[0]
): ReturnType<typeof buildPuzzle> => {
  try {
    return buildPuzzle(params);
  } catch (error) {
    if (!isDummySolverUnsatisfiedError(error)) {
      throw error;
    }
    return buildPuzzle({
      ...params,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: true,
    });
  }
};

const previousLevelId = (levelId: string): string | null => {
  const match = levelId.match(/^(.*?)(\d+)$/);
  if (!match) {
    return null;
  }
  const prefix = match[1] ?? '';
  const numeric = Number(match[2]);
  if (!Number.isFinite(numeric) || numeric <= 1) {
    return null;
  }
  const width = (match[2] ?? '').length;
  const previous = `${numeric - 1}`.padStart(width, '0');
  return `${prefix}${previous}`;
};

type PuzzleGenerationFailedParams = {
  levelId: string;
  dateKey: string;
  attempts: number;
  reason: string;
};

type GeneratedPuzzlePayload = {
  puzzlePrivate: Parameters<typeof savePuzzle>[0]['puzzlePrivate'];
  puzzlePublic: Parameters<typeof savePuzzle>[0]['puzzlePublic'];
  normalizedSignature: Parameters<typeof savePuzzle>[0]['normalizedSignature'];
};

export class PuzzleGenerationFailedError extends Error {
  readonly levelId: string;
  readonly dateKey: string;
  readonly attempts: number;
  readonly reason: string;

  constructor(params: PuzzleGenerationFailedParams) {
    super(
      `PUZZLE_GENERATION_FAILED level=${params.levelId} dateKey=${params.dateKey} attempts=${params.attempts} reason=${params.reason}`
    );
    this.name = 'PuzzleGenerationFailedError';
    this.levelId = params.levelId;
    this.dateKey = params.dateKey;
    this.attempts = params.attempts;
    this.reason = params.reason;
  }
}

const difficultyRangeForTier = (
  tier: DifficultyTier
): { min: number; max: number } => {
  if (tier === 'easy') {
    return { min: 1, max: 3 };
  }
  if (tier === 'medium') {
    return { min: 4, max: 6 };
  }
  return { min: 7, max: 9 };
};

const seedFromString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
};

const dailyTierOrder: DifficultyTier[] = ['easy', 'medium', 'hard'];

const buildDailyTierQueue = (dateKey: string): DifficultyTier[] => {
  const rng = mulberry32(seedFromString(`daily-tier:${dateKey}`));
  return shuffleWithRng(dailyTierOrder, rng);
};

const reserveDailyTier = async (dateKey: string): Promise<DifficultyTier> => {
  const cursorKey = keyDailyTierCursor(dateKey);
  const index = (await redis.incrBy(cursorKey, 1)) - 1;
  const queue = buildDailyTierQueue(dateKey);
  const tier = queue[index % queue.length];
  if (!tier) {
    throw new Error(`Failed to reserve daily tier for ${dateKey}`);
  }
  return tier;
};

const restoreDailyTier = async (dateKey: string): Promise<void> => {
  const cursorKey = keyDailyTierCursor(dateKey);
  const currentRaw = await redis.get(cursorKey);
  const current = currentRaw ? Number(currentRaw) : 0;
  if (!Number.isFinite(current) || current <= 0) {
    return;
  }
  await redis.incrBy(cursorKey, -1);
};

const seedExpiryForDateKey = (dateKey: string): Date => {
  const parts = dateKey.split('-');
  if (parts.length !== 3) {
    return new Date(Date.now() + 48 * 60 * 60 * 1000);
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(Date.now() + 48 * 60 * 60 * 1000);
  }
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
};

const parseSeed = (raw: string | null | undefined): number | null => {
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.floor(parsed);
};

const getDailyChallengeTypeSeed = async (dateKey: string): Promise<number> => {
  const seedKey = keyDailyChallengeTypeSeed(dateKey);
  const existingRaw = await redis.get(seedKey);
  const existingSeed = parseSeed(existingRaw);
  if (existingSeed !== null) {
    return existingSeed;
  }
  const seed = Math.floor(Math.random() * 0x1_0000_0000);
  const written = await redis.set(seedKey, `${seed}`, {
    nx: true,
    expiration: seedExpiryForDateKey(dateKey),
  });
  if (!written) {
    const storedRaw = await redis.get(seedKey);
    const storedSeed = parseSeed(storedRaw);
    if (storedSeed !== null) {
      return storedSeed;
    }
  }
  return seed;
};

const buildDailyChallengeTypeQueue = async (
  dateKey: string
): Promise<ChallengeType[]> => {
  const seed = await getDailyChallengeTypeSeed(dateKey);
  const rng = mulberry32(seed);
  return shuffleWithRng(aiChallengeTypePool, rng);
};

const reserveDailyChallengeType = async (
  dateKey: string
): Promise<ChallengeType> => {
  const cursorKey = keyDailyChallengeTypeCursor(dateKey);
  const index = (await redis.incrBy(cursorKey, 1)) - 1;
  const queue = await buildDailyChallengeTypeQueue(dateKey);
  const selected = queue[index % queue.length];
  if (!selected) {
    throw new Error(`Failed to reserve daily challenge type for ${dateKey}`);
  }
  return selected;
};

const restoreDailyChallengeType = async (dateKey: string): Promise<void> => {
  const cursorKey = keyDailyChallengeTypeCursor(dateKey);
  const currentRaw = await redis.get(cursorKey);
  const current = currentRaw ? Number(currentRaw) : 0;
  if (!Number.isFinite(current) || current <= 0) {
    return;
  }
  await redis.incrBy(cursorKey, -1);
};

const clampDifficultyWithinTier = (
  difficulty: number,
  bias: -1 | 0 | 1,
  range: { min: number; max: number }
): number => {
  if (bias === 0) {
    return Math.max(range.min, Math.min(range.max, difficulty));
  }
  const next = difficulty + (bias > 0 ? 1 : -1);
  return Math.max(range.min, Math.min(range.max, next));
};

const previousMappingForLevel = async (
  levelId: string
): Promise<Record<string, number> | null> => {
  const previousId = previousLevelId(levelId);
  if (!previousId) {
    return null;
  }
  const previousPuzzle = await getPuzzlePrivate(previousId);
  return previousPuzzle?.mapping ?? null;
};

const generatePuzzlePayload = async (params: {
  levelId: string;
  dateKey: string;
  difficulty: number;
  difficultyLabel: string;
  retries: number;
  settings: Awaited<ReturnType<typeof getDecryptSettings>>;
  basePreferredType: ChallengeType;
}): Promise<GeneratedPuzzlePayload> => {
  let lastFailureReason = 'unknown';
  for (let attempt = 0; attempt < params.retries; attempt += 1) {
    const preferredType = params.basePreferredType;
    let phrase;
    try {
      phrase = await generatePuzzlePhrase({
        levelId: params.levelId,
        difficulty: params.difficulty,
        apiKey: params.settings.geminiApiKey,
        difficultyLabel: params.difficultyLabel,
        safetyMode: params.settings.contentSafetyMode,
        preferredType,
      });
    } catch (error) {
      lastFailureReason = error instanceof Error ? error.message : 'unknown';
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} attempt=${
          attempt + 1
        }/${params.retries} ai request failed: ${lastFailureReason}`
      );
      continue;
    }

    if (phrase.challengeType !== preferredType) {
      lastFailureReason = `challenge type mismatch (expected ${preferredType} got ${phrase.challengeType})`;
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} attempt=${
          attempt + 1
        }/${params.retries} mismatch challenge type expected=${preferredType} actual=${phrase.challengeType}`
      );
      continue;
    }

    const text = sanitizePhrase(phrase.text);
    const quoteValidation = validateQuoteForPhase1(text, params.difficulty);
    if (!quoteValidation.valid) {
      lastFailureReason = quoteValidation.reasons.join('; ');
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} rejected quote: ${quoteValidation.reasons.join(
          '; '
        )}`
      );
      continue;
    }

    const normalized = normalizeContent(text);
    if (!normalized) {
      lastFailureReason = 'empty signature';
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} rejected quote: empty signature`
      );
      continue;
    }

    const endlessReservationOwner = getBundledEndlessReservationOwner(normalized);
    if (endlessReservationOwner && endlessReservationOwner !== params.levelId) {
      lastFailureReason = `signature reserved by endless ${endlessReservationOwner}`;
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} rejected quote: reserved by endless ${endlessReservationOwner}`
      );
      continue;
    }

    const reserved = await reserveUsedSignature(normalized, params.levelId);
    if (!reserved) {
      lastFailureReason = 'signature reused';
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} rejected quote: signature reused`
      );
      continue;
    }

    const previousMapping = await previousMappingForLevel(params.levelId);
    let generated;
    try {
      generated = buildPuzzleWithSolverFallback({
        levelId: params.levelId,
        dateKey: params.dateKey,
        text,
        author: phrase.author,
        challengeType: phrase.challengeType,
        source: 'AUTO_DAILY',
        difficulty: params.difficulty,
        logicalPercent: params.settings.logicalCipherPercent,
        previousMapping,
      });
    } catch (error) {
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} puzzle build failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`
      );
      await clearUsedSignature(normalized, params.levelId);
      lastFailureReason = error instanceof Error ? error.message : 'puzzle build failed';
      continue;
    }

    const validation = validatePuzzle(generated.puzzlePrivate);
    if (!validation.valid) {
      lastFailureReason = validation.reasons.join('; ');
      console.warn(
        `[generatePuzzleForDate] level=${params.levelId} rejected puzzle: ${validation.reasons.join(
          '; '
        )}`
      );
      await clearUsedSignature(normalized, params.levelId);
      continue;
    }

    return {
      puzzlePrivate: generated.puzzlePrivate,
      puzzlePublic: generated.puzzlePublic,
      normalizedSignature: normalized,
    };
  }

  throw new PuzzleGenerationFailedError({
    levelId: params.levelId,
    dateKey: params.dateKey,
    attempts: params.retries,
    reason: lastFailureReason,
  });
};

export const generatePuzzleForDate = async (
  now: Date
): Promise<{ levelId: string; dateKey: string }> => {
  const settings = await getDecryptSettings();
  const retries = settings.aiMaxRetries;
  const dateKey = formatDateKey(now);
  const levelId = await getNextLevelId();
  const tier = await reserveDailyTier(dateKey);
  const basePreferredType = await reserveDailyChallengeType(dateKey);
  try {
    const tierRange = difficultyRangeForTier(tier);
    const rng = mulberry32(seedFromString(`${dateKey}:${tier}`));
    const baseDifficulty = randInt(rng, tierRange.min, tierRange.max);
    let bias: -1 | 0 | 1 = 0;
    try {
      bias = await computeGlobalDailyBias();
    } catch (error) {
      console.error(
        `Difficulty calibration fallback to base difficulty due to error: ${
          error instanceof Error ? error.message : 'unknown'
        }`
      );
    }
    const difficulty = clampDifficultyWithinTier(baseDifficulty, bias, tierRange);
    const difficultyLabel = `difficulty ${difficulty} of 10 (${tier})`;
    const payload = await generatePuzzlePayload({
      levelId,
      dateKey,
      difficulty,
      difficultyLabel,
      retries,
      settings,
      basePreferredType,
    });
    try {
      await savePuzzle(payload);
    } catch (error) {
      await clearUsedSignature(payload.normalizedSignature, levelId);
      throw error;
    }
    await setDailyPointer(levelId);

    return { levelId, dateKey };
  } catch (error) {
    await restoreDailyTier(dateKey);
    await restoreDailyChallengeType(dateKey);
    throw error;
  }
};

export const publishDailyPost = async (params: {
  levelId: string;
  dateKey: string;
}): Promise<string> => {
  const subredditName = context.subredditName;
  if (!subredditName) {
    throw new Error('subredditName is required');
  }
  const formatDailyTitle = (levelId: string): string => {
    const match = levelId.match(/(\d+)$/);
    if (!match || !match[1]) {
      return `Daily Cipher ${levelId}`;
    }
    return `Daily Cipher #${Number(match[1])}`;
  };
  const title = formatDailyTitle(params.levelId);

  const post = await reddit.submitCustomPost({
    subredditName,
    title,
    entry: 'default',
    postData: {
      levelId: params.levelId,
      dateKey: params.dateKey,
      mode: 'daily',
    },
    textFallback: {
      text: `${title}. Open the interactive post to play.`,
    },
  });

  await setPuzzlePublishedPostId(params.levelId, post.id);
  return post.id;
};

export const stagePuzzleForTomorrow = async (): Promise<{
  levelId: string;
  dateKey: string;
}> => {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 1);
  const generated = await generatePuzzleForDate(now);
  await setStagedLevelId(generated.levelId);
  return generated;
};

export const publishStagedPuzzle = async (): Promise<{
  levelId: string;
  dateKey: string;
  postId: string;
}> => {
  const todayDateKey = formatDateKey(new Date());
  const stagedLevelId = await getStagedLevelId();
  if (!stagedLevelId) {
    const generated = await generatePuzzleForDate(new Date());
    const postId = await publishDailyPost(generated);
    return {
      levelId: generated.levelId,
      dateKey: generated.dateKey,
      postId,
    };
  }

  const stagedPuzzle = await getPuzzlePrivate(stagedLevelId);
  if (!stagedPuzzle) {
    const generated = await generatePuzzleForDate(new Date());
    const postId = await publishDailyPost(generated);
    return {
      levelId: generated.levelId,
      dateKey: generated.dateKey,
      postId,
    };
  }

  if (stagedPuzzle.dateKey !== todayDateKey) {
    const generated = await generatePuzzleForDate(new Date());
    const postId = await publishDailyPost(generated);
    return {
      levelId: generated.levelId,
      dateKey: generated.dateKey,
      postId,
    };
  }

  const existingPostId = await getPuzzlePublishedPostId(stagedPuzzle.levelId);
  if (existingPostId) {
    if (stagedPuzzle.dateKey === todayDateKey) {
      await clearStagedLevelId();
    }
    return {
      levelId: stagedPuzzle.levelId,
      dateKey: stagedPuzzle.dateKey,
      postId: existingPostId,
    };
  }

  await setDailyPointer(stagedPuzzle.levelId);
  const postId = await publishDailyPost({
    levelId: stagedPuzzle.levelId,
    dateKey: stagedPuzzle.dateKey,
  });
  if (stagedPuzzle.dateKey === todayDateKey) {
    await clearStagedLevelId();
  }
  return {
    levelId: stagedPuzzle.levelId,
    dateKey: stagedPuzzle.dateKey,
    postId,
  };
};

export const injectManualPuzzle = async (params: {
  text: string;
  author: string;
  difficulty: number;
  challengeType: ChallengeType;
}): Promise<{ levelId: string; dateKey: string }> => {
  const settings = await getDecryptSettings();
  const now = new Date();
  const dateKey = formatDateKey(now);
  const levelId = await getNextLevelId();
  const text = sanitizePhrase(params.text);
  const quoteValidation = validateQuoteForPhase1(text, params.difficulty);
  if (!quoteValidation.valid) {
    throw new Error(`Injected puzzle quote invalid: ${quoteValidation.reasons.join(', ')}`);
  }
  const normalizedSignature = normalizeContent(text);
  if (!normalizedSignature) {
    throw new Error('Injected puzzle quote invalid: empty signature');
  }
  const endlessReservationOwner = getBundledEndlessReservationOwner(normalizedSignature);
  if (endlessReservationOwner && endlessReservationOwner !== levelId) {
    throw new Error(
      `Injected puzzle quote already reserved by endless level ${endlessReservationOwner}.`
    );
  }
  const reserved = await reserveUsedSignature(normalizedSignature, levelId);
  if (!reserved) {
    throw new Error('Injected puzzle quote already used in another challenge.');
  }
  try {
    const previousMapping = await previousMappingForLevel(levelId);
    const generated = buildPuzzleWithSolverFallback({
      levelId,
      dateKey,
      text,
      author: params.author,
      challengeType: params.challengeType,
      source: 'MANUAL_INJECTED',
      difficulty: params.difficulty,
      logicalPercent: settings.logicalCipherPercent,
      previousMapping,
    });
    const validation = validatePuzzle(generated.puzzlePrivate);
    if (!validation.valid) {
      throw new Error(`Injected puzzle validation failed: ${validation.reasons.join(', ')}`);
    }
    try {
      await savePuzzle({
        puzzlePrivate: generated.puzzlePrivate,
        puzzlePublic: generated.puzzlePublic,
        normalizedSignature,
      });
    } catch (error) {
      await clearUsedSignature(normalizedSignature, levelId);
      throw error;
    }
  } catch (error) {
    await clearUsedSignature(normalizedSignature, levelId);
    throw error;
  }
  await setDailyPointer(levelId);
  return { levelId, dateKey };
};
