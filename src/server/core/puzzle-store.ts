import { redis } from '@devvit/web/server';
import { z } from 'zod';
import { type PuzzlePrivate, type PuzzlePublic } from '../../shared/game';
import {
  puzzlePrivateSchema,
  puzzlePrivateStoredSchema,
  puzzlePublicSchema,
} from '../../shared/game';
import { normalizePadlockChains } from './puzzle';
import {
  keyChallengeEvaluation,
  keyChallengeEvaluationIndex,
  keyDailyPointer,
  keyCommunityRemovedLevels,
  keyCommunitySubmission,
  keyCommunitySubmissionsRemoved,
  keyLevelIdCounter,
  keyPublishedAutoDailyPuzzlesByDate,
  keyPublishedAutoDailyPuzzlesByDateInitialized,
  keyPuzzleMapping,
  keyPuzzlePublicationReceipt,
  keyPuzzlePublishedPost,
  keyPuzzleStaged,
  keyPuzzlePrivate,
  keyPuzzlePublic,
  keyPuzzlesByDate,
  keyPuzzlesIndex,
  keyUsedStrings,
  keyUsedSignatureMeta,
  keyUsedSignatureRecent,
} from './keys';
import {
  buildChallengeEvaluation,
  saveChallengeEvaluation,
} from './challenge-evaluation';

const puzzleMappingSchema = z.record(z.string(), z.number());
const transactionCommitted = (result: unknown): boolean =>
  result !== null && result !== undefined;
const maxSavePuzzleRetries = 3;

export class PuzzleLevelAllocationConflictError extends Error {
  readonly expectedLevelId: string;
  readonly actualLevelId: string;

  constructor(params: { expectedLevelId: string; actualLevelId: string }) {
    super(
      `Puzzle level allocation changed from ${params.expectedLevelId} to ${params.actualLevelId}`
    );
    this.name = 'PuzzleLevelAllocationConflictError';
    this.expectedLevelId = params.expectedLevelId;
    this.actualLevelId = params.actualLevelId;
  }
}

export const getDailyPointer = async (): Promise<string | null> => {
  const value = await redis.get(keyDailyPointer);
  return value ?? null;
};

export const setDailyPointer = async (levelId: string): Promise<void> => {
  await redis.set(keyDailyPointer, levelId);
};

const parseLevelIdCounter = (value: string | null): number | null => {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
};

const parseLevelIdSuffix = (levelId: string): number | null => {
  const match = /^lvl_(\d+)$/.exec(levelId);
  if (!match) {
    return null;
  }
  const suffix = match[1] ?? '';
  const parsed = Number(suffix);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
};

const getHighestIndexedLevelIdCounter = async (): Promise<number> => {
  const indexed = await redis.zRange(keyPuzzlesIndex, 0, -1, { by: 'rank' });
  if (!Array.isArray(indexed)) {
    return 0;
  }
  let maxLevelCounter = 0;
  for (const entry of indexed) {
    const suffix = parseLevelIdSuffix(entry.member);
    if (suffix === null) {
      console.warn(`[level-id-counter] Ignoring malformed indexed level id: ${entry.member}`);
      continue;
    }
    maxLevelCounter = Math.max(maxLevelCounter, suffix);
  }
  return maxLevelCounter;
};

const normalizeLevelIdCounter = (params: {
  currentCounterRaw: string | null;
  baselineCounter: number;
}): {
  counter: number;
  repairReason: string | null;
} => {
  const parsedCounter = parseLevelIdCounter(params.currentCounterRaw);
  if (parsedCounter !== null && parsedCounter >= params.baselineCounter) {
    return {
      counter: parsedCounter,
      repairReason: null,
    };
  }

  return {
    counter: params.baselineCounter,
    repairReason:
    parsedCounter === null
      ? params.currentCounterRaw === null
        ? 'missing'
        : `invalid (${params.currentCounterRaw})`
      : `stale (${parsedCounter} < ${params.baselineCounter})`,
  };
};

const repairLevelIdCounterIfNeeded = async (params: {
  currentCounterRaw: string | null;
  baselineCounter: number;
}): Promise<number> => {
  const normalized = normalizeLevelIdCounter(params);
  if (normalized.repairReason === null) {
    return normalized.counter;
  }
  console.warn('[level-id-counter] Repairing counter state', {
    reason: normalized.repairReason,
    baselineCounter: params.baselineCounter,
  });
  await redis.set(keyLevelIdCounter, `${params.baselineCounter}`);
  return normalized.counter;
};

const ensureLevelIdCounterSeeded = async (): Promise<number> => {
  const currentCounterRaw = (await redis.get(keyLevelIdCounter)) ?? null;
  const highestIndexedCounter = await getHighestIndexedLevelIdCounter();
  if (currentCounterRaw === null) {
    await redis.set(keyLevelIdCounter, `${highestIndexedCounter}`, { nx: true });
    return highestIndexedCounter;
  }
  return repairLevelIdCounterIfNeeded({
    currentCounterRaw,
    baselineCounter: highestIndexedCounter,
  });
};

export const peekNextLevelId = async (): Promise<string> => {
  const currentCounter = await ensureLevelIdCounterSeeded();
  const next = currentCounter + 1;
  return `lvl_${`${next}`.padStart(4, '0')}`;
};

export const getNextLevelId = async (): Promise<string> => {
  await ensureLevelIdCounterSeeded();
  const next = await redis.incrBy(keyLevelIdCounter, 1);
  return `lvl_${`${next}`.padStart(4, '0')}`;
};

const readJsonWithSchema = async <T>(
  key: string,
  schema: z.ZodType<T>
): Promise<T | null> => {
  const raw = await redis.get(key);
  if (!raw) {
    return null;
  }
  const parsedJson = JSON.parse(raw);
  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
};

const cleanupPuzzlePersistence = async (params: {
  levelId: string;
  dateKey?: string;
  signature?: string;
}): Promise<void> => {
  await redis.del(keyChallengeEvaluation(params.levelId));
  await redis.zRem(keyChallengeEvaluationIndex, [params.levelId]);
  await redis.del(keyPuzzlePrivate(params.levelId));
  await redis.del(keyPuzzlePublic(params.levelId));
  await redis.del(keyPuzzleMapping(params.levelId));
  await redis.del(keyPuzzlePublicationReceipt(params.levelId));
  await redis.del(keyPuzzlePublishedPost(params.levelId));
  await redis.zRem(keyPuzzlesIndex, [params.levelId]);
  if (params.dateKey) {
    await redis.zRem(keyPuzzlesByDate(params.dateKey), [params.levelId]);
    await redis.zRem(keyPublishedAutoDailyPuzzlesByDate(params.dateKey), [params.levelId]);
  }
  if (params.signature) {
    const existing = await redis.hGet(keyUsedStrings, params.signature);
    if (existing === params.levelId) {
      await redis.hDel(keyUsedStrings, [params.signature]);
      await redis.hDel(keyUsedSignatureMeta, [params.signature]);
      await redis.zRem(keyUsedSignatureRecent, [params.signature]);
    }
  }
};

const persistChallengeEvaluationSafely = async (
  puzzlePrivate: PuzzlePrivate
): Promise<void> => {
  try {
    await saveChallengeEvaluation(
      buildChallengeEvaluation({
        puzzle: puzzlePrivate,
      })
    );
  } catch (error) {
    console.warn('[challenge-evaluation] failed to persist evaluation', {
      levelId: puzzlePrivate.levelId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
};

export const getPuzzlePrivate = async (
  levelId: string
): Promise<PuzzlePrivate | null> => {
  const stored = await readJsonWithSchema(
    keyPuzzlePrivate(levelId),
    puzzlePrivateStoredSchema
  );
  if (!stored) {
    return null;
  }
  return puzzlePrivateSchema.parse({
    ...stored,
    padlockChains: normalizePadlockChains({
      tiles: stored.tiles,
      padlockChains: stored.padlockChains,
    }),
  });
};

export const getPuzzlePublic = async (
  levelId: string
): Promise<PuzzlePublic | null> =>
  readJsonWithSchema(keyPuzzlePublic(levelId), puzzlePublicSchema);

export const getPuzzleMapping = async (
  levelId: string
): Promise<Record<string, number> | null> =>
  readJsonWithSchema(keyPuzzleMapping(levelId), puzzleMappingSchema);

export const savePuzzle = async (params: {
  puzzlePrivate: PuzzlePrivate;
  puzzlePublic: PuzzlePublic;
  normalizedSignature: string;
  tokenSignature?: string | null;
  expectedLevelId?: string;
}): Promise<string> => {
  for (let attempt = 0; attempt < maxSavePuzzleRetries; attempt += 1) {
    const tx = await redis.watch(keyLevelIdCounter, keyPuzzlesIndex);
    let transactionStarted = false;
    let execAttempted = false;
    try {
      const currentCounterRaw = (await redis.get(keyLevelIdCounter)) ?? null;
      const baselineCounter = await getHighestIndexedLevelIdCounter();
      const normalizedCounter = normalizeLevelIdCounter({
        currentCounterRaw,
        baselineCounter,
      });
      if (normalizedCounter.repairReason !== null) {
        console.warn('[level-id-counter] Repairing counter state', {
          reason: normalizedCounter.repairReason,
          baselineCounter,
        });
      }
      const currentCounter = normalizedCounter.counter;
      const nextCounter = currentCounter + 1;
      const allocatedLevelId = `lvl_${`${nextCounter}`.padStart(4, '0')}`;
      if (params.expectedLevelId && params.expectedLevelId !== allocatedLevelId) {
        await tx.unwatch();
        throw new PuzzleLevelAllocationConflictError({
          expectedLevelId: params.expectedLevelId,
          actualLevelId: allocatedLevelId,
        });
      }

      const puzzlePrivate: PuzzlePrivate = {
        ...params.puzzlePrivate,
        levelId: allocatedLevelId,
      };
      const puzzlePublic: PuzzlePublic = {
        ...params.puzzlePublic,
        levelId: allocatedLevelId,
      };

      await tx.multi();
      transactionStarted = true;
      if (currentCounterRaw === null) {
        await tx.set(keyLevelIdCounter, `${currentCounter}`, { nx: true });
      } else if (normalizedCounter.repairReason !== null) {
        await tx.set(keyLevelIdCounter, `${currentCounter}`);
      }
      await tx.incrBy(keyLevelIdCounter, 1);
      await tx.set(keyPuzzlePrivate(allocatedLevelId), JSON.stringify(puzzlePrivate));
      await tx.set(keyPuzzlePublic(allocatedLevelId), JSON.stringify(puzzlePublic));
      await tx.set(keyPuzzleMapping(allocatedLevelId), JSON.stringify(puzzlePrivate.mapping));
      await tx.zAdd(keyPuzzlesIndex, {
        member: allocatedLevelId,
        score: puzzlePrivate.createdAt,
      });
      if (puzzlePrivate.source === 'AUTO_DAILY' || puzzlePrivate.source === 'MANUAL_INJECTED' || puzzlePrivate.source === 'COMMUNITY') {
        await tx.zAdd(keyPuzzlesByDate(puzzlePrivate.dateKey), {
          member: allocatedLevelId,
          score: puzzlePrivate.createdAt,
        });
      }
      await tx.hSet(keyUsedStrings, {
        [params.normalizedSignature]: allocatedLevelId,
      });
      if (puzzlePrivate.source === 'AUTO_DAILY' || puzzlePrivate.source === 'MANUAL_INJECTED' || puzzlePrivate.source === 'COMMUNITY') {
        await tx.zAdd(keyUsedSignatureRecent, {
          member: params.normalizedSignature,
          score: puzzlePrivate.createdAt,
        });
        if (typeof params.tokenSignature === 'string' && params.tokenSignature.length > 0) {
          await tx.hSet(keyUsedSignatureMeta, {
            [params.normalizedSignature]: params.tokenSignature,
          });
        }
      }

      execAttempted = true;
      const execResult = await tx.exec();
      if (!transactionCommitted(execResult)) {
        continue;
      }
      await persistChallengeEvaluationSafely(puzzlePrivate);
      return allocatedLevelId;
    } catch (error) {
      if (error instanceof PuzzleLevelAllocationConflictError) {
        throw error;
      }
      if (!execAttempted) {
        if (transactionStarted && 'discard' in tx && typeof tx.discard === 'function') {
          await tx.discard();
        } else {
          await tx.unwatch();
        }
      }
      if (attempt >= maxSavePuzzleRetries - 1) {
        throw error;
      }
    }
  }
  throw new Error('Failed to save puzzle after transaction retries.');
};

export const replacePuzzleDataInPlace = async (params: {
  levelId: string;
  puzzlePrivate: PuzzlePrivate;
  puzzlePublic: PuzzlePublic;
  normalizedSignature: string;
  tokenSignature?: string | null;
  previousNormalizedSignature?: string | null;
}): Promise<void> => {
  const puzzlePrivate: PuzzlePrivate = {
    ...params.puzzlePrivate,
    levelId: params.levelId,
  };
  const puzzlePublic: PuzzlePublic = {
    ...params.puzzlePublic,
    levelId: params.levelId,
  };
  await redis.set(keyPuzzlePrivate(params.levelId), JSON.stringify(puzzlePrivate));
  await redis.set(keyPuzzlePublic(params.levelId), JSON.stringify(puzzlePublic));
  await redis.set(keyPuzzleMapping(params.levelId), JSON.stringify(puzzlePrivate.mapping));
  await redis.zAdd(keyPuzzlesIndex, {
    member: params.levelId,
    score: puzzlePrivate.createdAt,
  });
  if (
    puzzlePrivate.source === 'AUTO_DAILY' ||
    puzzlePrivate.source === 'MANUAL_INJECTED' ||
    puzzlePrivate.source === 'COMMUNITY'
  ) {
    await redis.zAdd(keyPuzzlesByDate(puzzlePrivate.dateKey), {
      member: params.levelId,
      score: puzzlePrivate.createdAt,
    });
    await redis.zAdd(keyUsedSignatureRecent, {
      member: params.normalizedSignature,
      score: puzzlePrivate.createdAt,
    });
  }
  const previousSignature = params.previousNormalizedSignature;
  if (previousSignature && previousSignature !== params.normalizedSignature) {
    const existingPreviousOwner = await redis.hGet(keyUsedStrings, previousSignature);
    if (existingPreviousOwner === params.levelId) {
      await redis.hDel(keyUsedStrings, [previousSignature]);
      await redis.hDel(keyUsedSignatureMeta, [previousSignature]);
      await redis.zRem(keyUsedSignatureRecent, [previousSignature]);
    }
  }
  await redis.hSet(keyUsedStrings, {
    [params.normalizedSignature]: params.levelId,
  });
  if (typeof params.tokenSignature === 'string' && params.tokenSignature.length > 0) {
    await redis.hSet(keyUsedSignatureMeta, {
      [params.normalizedSignature]: params.tokenSignature,
    });
  }
  await persistChallengeEvaluationSafely(puzzlePrivate);
};

export const getPuzzlePublishedPostId = async (
  levelId: string
): Promise<string | null> => {
  const value = await redis.get(keyPuzzlePublishedPost(levelId));
  return value ?? null;
};

export const isPuzzlePublishedVisible = async (levelId: string): Promise<boolean> => {
  const removedFromPlay = await isPuzzleRemovedFromPlay(levelId);
  if (removedFromPlay) {
    return false;
  }

  const [dailyPointer, publishedPostId, publicationReceipt] = await Promise.all([
    getDailyPointer(),
    getPuzzlePublishedPostId(levelId),
    getPuzzlePublicationReceipt(levelId),
  ]);

  return (
    dailyPointer === levelId ||
    publishedPostId !== null ||
    publicationReceipt !== null
  );
};

export const isPuzzleRemovedFromPlay = async (
  levelId: string
): Promise<boolean> => {
  const removedSubmissionId = await redis.hGet(keyCommunityRemovedLevels, levelId);
  if (removedSubmissionId) {
    return true;
  }

  const removedEntries = await redis.zRange(keyCommunitySubmissionsRemoved, 0, -1, {
    by: 'rank',
  });
  for (const entry of removedEntries) {
    const hash = await redis.hGetAll(keyCommunitySubmission(entry.member));
    if (hash.levelId === levelId && hash.status === 'removed') {
      await redis.hSet(keyCommunityRemovedLevels, {
        [levelId]: entry.member,
      });
      return true;
    }
  }
  return false;
};

export const setPuzzlePublishedPostId = async (
  levelId: string,
  postId: string,
  dateKey?: string
): Promise<void> => {
  await redis.set(keyPuzzlePublishedPost(levelId), postId);
  const stored = await readJsonWithSchema(
    keyPuzzlePrivate(levelId),
    puzzlePrivateStoredSchema
  );
  if (!stored || stored.source !== 'AUTO_DAILY') {
    return;
  }
  const effectiveDateKey = dateKey ?? stored.dateKey;
  await redis.zAdd(keyPublishedAutoDailyPuzzlesByDate(effectiveDateKey), {
    member: levelId,
    score: stored.createdAt,
  });
  await redis.set(
    keyPublishedAutoDailyPuzzlesByDateInitialized(effectiveDateKey),
    '1'
  );
};

type PuzzlePublicationReceipt = {
  postId: string;
  dateKey: string;
  publishedAt: number;
};

const puzzlePublicationReceiptSchema = z.object({
  postId: z.string().min(1),
  dateKey: z.string().min(1),
  publishedAt: z.number().int().nonnegative(),
});

export const getPuzzlePublicationReceipt = async (
  levelId: string
): Promise<PuzzlePublicationReceipt | null> =>
  readJsonWithSchema(
    keyPuzzlePublicationReceipt(levelId),
    puzzlePublicationReceiptSchema
  );

export const setPuzzlePublicationReceipt = async (
  levelId: string,
  receipt: PuzzlePublicationReceipt
): Promise<void> => {
  await redis.set(keyPuzzlePublicationReceipt(levelId), JSON.stringify(receipt));
};

export const reserveUsedSignature = async (
  signature: string,
  levelId: string
): Promise<boolean> => {
  const reserved = await redis.hSetNX(keyUsedStrings, signature, levelId);
  return reserved === 1;
};

export const transferUsedSignatureReservation = async (
  signature: string,
  expectedOwner: string,
  nextOwner: string
): Promise<boolean> => {
  const existing = await redis.hGet(keyUsedStrings, signature);
  if (existing !== expectedOwner) {
    return false;
  }
  await redis.hSet(keyUsedStrings, {
    [signature]: nextOwner,
  });
  return true;
};

export const getUsedSignatureOwner = async (
  signature: string
): Promise<string | null> => {
  const value = await redis.hGet(keyUsedStrings, signature);
  return value ?? null;
};

export const clearUsedSignature = async (
  signature: string,
  levelId: string
): Promise<void> => {
  const existing = await redis.hGet(keyUsedStrings, signature);
  if (existing === levelId) {
    await redis.hDel(keyUsedStrings, [signature]);
    await redis.hDel(keyUsedSignatureMeta, [signature]);
    await redis.zRem(keyUsedSignatureRecent, [signature]);
  }
};

export const getRecentUsedSignatureEntries = async (
  limit = 600
): Promise<Array<{ normalizedSignature: string; tokenSignature: string | null }>> => {
  const safeLimit = Math.max(0, Math.min(2000, Math.floor(limit)));
  if (safeLimit === 0) {
    return [];
  }
  const entries = await redis.zRange(keyUsedSignatureRecent, 0, safeLimit - 1, {
    by: 'rank',
    reverse: true,
  });
  const signatures = entries.map((entry) => entry.member).filter((value) => value.length > 0);
  let tokenSignatures: Array<string | null> = [];
  if (signatures.length > 0) {
    try {
      tokenSignatures = await redis.hMGet(keyUsedSignatureMeta, signatures);
    } catch (error) {
      // Devvit documents hMGet as allowlisted on some installs, so preserve
      // correctness with a fallback when the batched hash read is unavailable.
      console.warn(
        `[getRecentUsedSignatureEntries] hMGet unavailable, falling back to hGet fan-out: ${
          error instanceof Error ? error.message : 'unknown'
        }`
      );
      tokenSignatures = await Promise.all(
        signatures.map(async (signature) => {
          const raw = await redis.hGet(keyUsedSignatureMeta, signature);
          return raw ?? null;
        })
      );
    }
  }
  return signatures.map((normalizedSignature, index) => ({
    normalizedSignature,
    tokenSignature: tokenSignatures[index] ?? null,
  }));
};

export const deletePuzzleData = async (params: {
  levelId: string;
  dateKey?: string;
  signature?: string;
}): Promise<void> => {
  await cleanupPuzzlePersistence(params);
};

export const setStagedLevelId = async (levelId: string): Promise<void> => {
  await redis.set(keyPuzzleStaged, levelId);
};

export const getStagedLevelId = async (): Promise<string | null> => {
  const value = await redis.get(keyPuzzleStaged);
  return value ?? null;
};

export const clearStagedLevelId = async (): Promise<void> => {
  await redis.del(keyPuzzleStaged);
};

export const getAllLevelIds = async (): Promise<string[]> => {
  const entries = await redis.zRange(keyPuzzlesIndex, 0, -1, { by: 'rank' });
  return entries.map((entry) => entry.member);
};

export const countPuzzlesForDate = async (dateKey: string): Promise<number> => {
  const dateKeyIndex = keyPuzzlesByDate(dateKey);
  const indexedCount = await redis.zCard(dateKeyIndex);
  if (indexedCount > 0) {
    return indexedCount;
  }
  console.error(
    `[countPuzzlesForDate] date index missing for ${dateKey}, running full scan`
  );

  const levelIds = await getAllLevelIds();
  let count = 0;
  for (const levelId of levelIds) {
    const puzzle = await getPuzzlePrivate(levelId);
    if (
      !puzzle ||
      puzzle.dateKey !== dateKey ||
      (puzzle.source !== 'AUTO_DAILY' && puzzle.source !== 'MANUAL_INJECTED')
    ) {
      continue;
    }
    count += 1;
    await redis.zAdd(dateKeyIndex, {
      member: levelId,
      score: puzzle.createdAt,
    });
  }

  return count;
};

export const getAutoDailyLevelIdsForDate = async (
  dateKey: string
): Promise<string[]> => {
  const dateKeyIndex = keyPuzzlesByDate(dateKey);
  const indexedCount = await redis.zCard(dateKeyIndex);
  const levelIds =
    indexedCount > 0
      ? (await redis.zRange(dateKeyIndex, 0, -1, { by: 'rank' })).map(
          (entry) => entry.member
        )
      : await getAllLevelIds();

  if (indexedCount === 0) {
    console.error(`[getAutoDailyLevelIdsForDate] date index missing for ${dateKey}, running full scan`);
  }

  const autoDailyLevelIds: string[] = [];
  for (const levelId of levelIds) {
    const puzzle = await getPuzzlePrivate(levelId);
    if (!puzzle || puzzle.dateKey !== dateKey || puzzle.source !== 'AUTO_DAILY') {
      continue;
    }
    autoDailyLevelIds.push(levelId);
    if (indexedCount === 0) {
      await redis.zAdd(dateKeyIndex, {
        member: levelId,
        score: puzzle.createdAt,
      });
    }
  }

  return autoDailyLevelIds;
};

export const countPublishedAutoDailyPuzzlesForDate = async (
  dateKey: string
): Promise<number> => {
  const indexKey = keyPublishedAutoDailyPuzzlesByDate(dateKey);
  const [indexedCount, initialized] = await Promise.all([
    redis.zCard(indexKey),
    redis.get(keyPublishedAutoDailyPuzzlesByDateInitialized(dateKey)),
  ]);
  if (indexedCount > 0 || initialized === '1') {
    return indexedCount;
  }

  const levelIds = await getAutoDailyLevelIdsForDate(dateKey);
  if (levelIds.length === 0) {
    await redis.set(keyPublishedAutoDailyPuzzlesByDateInitialized(dateKey), '1');
    return 0;
  }

  const postIds = await redis.mGet(levelIds.map((levelId) => keyPuzzlePublishedPost(levelId)));
  const puzzles = await Promise.all(levelIds.map(async (levelId) => getPuzzlePrivate(levelId)));
  let count = 0;

  for (let index = 0; index < levelIds.length; index += 1) {
    const levelId = levelIds[index];
    const postId = postIds[index];
    const puzzle = puzzles[index];
    if (!levelId || !postId || !puzzle || puzzle.source !== 'AUTO_DAILY') {
      continue;
    }
    count += 1;
    await redis.zAdd(indexKey, {
      member: levelId,
      score: puzzle.createdAt,
    });
  }

  await redis.set(keyPublishedAutoDailyPuzzlesByDateInitialized(dateKey), '1');
  return count;
};
