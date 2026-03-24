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
  keyDailyPointer,
  keyPuzzlePublishedPost,
  keyPuzzleStaged,
  keyPuzzlePrivate,
  keyPuzzlePublic,
  keyPuzzlesByDate,
  keyPuzzlesIndex,
  keyUsedStrings,
} from './keys';

export const getDailyPointer = async (): Promise<string | null> => {
  const value = await redis.get(keyDailyPointer);
  return value ?? null;
};

export const setDailyPointer = async (levelId: string): Promise<void> => {
  await redis.set(keyDailyPointer, levelId);
};

export const getNextLevelId = async (): Promise<string> => {
  const count = await redis.zCard(keyPuzzlesIndex);
  const next = count + 1;
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

export const savePuzzle = async (params: {
  puzzlePrivate: PuzzlePrivate;
  puzzlePublic: PuzzlePublic;
  normalizedSignature: string;
}): Promise<void> => {
  await redis.set(
    keyPuzzlePrivate(params.puzzlePrivate.levelId),
    JSON.stringify(params.puzzlePrivate)
  );
  await redis.set(
    keyPuzzlePublic(params.puzzlePublic.levelId),
    JSON.stringify(params.puzzlePublic)
  );
  await redis.zAdd(keyPuzzlesIndex, {
    member: params.puzzlePrivate.levelId,
    score: params.puzzlePrivate.createdAt,
  });
  if (
    params.puzzlePrivate.source === 'AUTO_DAILY' ||
    params.puzzlePrivate.source === 'MANUAL_INJECTED'
  ) {
    await redis.zAdd(keyPuzzlesByDate(params.puzzlePrivate.dateKey), {
      member: params.puzzlePrivate.levelId,
      score: params.puzzlePrivate.createdAt,
    });
  }
  await redis.hSet(keyUsedStrings, {
    [params.normalizedSignature]: params.puzzlePrivate.levelId,
  });
};

export const getPuzzlePublishedPostId = async (
  levelId: string
): Promise<string | null> => {
  const value = await redis.get(keyPuzzlePublishedPost(levelId));
  return value ?? null;
};

export const setPuzzlePublishedPostId = async (
  levelId: string,
  postId: string
): Promise<void> => {
  await redis.set(keyPuzzlePublishedPost(levelId), postId);
};

export const reserveUsedSignature = async (
  signature: string,
  levelId: string
): Promise<boolean> => {
  const reserved = await redis.hSetNX(keyUsedStrings, signature, levelId);
  return reserved === 1;
};

export const clearUsedSignature = async (
  signature: string,
  levelId: string
): Promise<void> => {
  const existing = await redis.hGet(keyUsedStrings, signature);
  if (existing === levelId) {
    await redis.hDel(keyUsedStrings, [signature]);
  }
};

export const deletePuzzleData = async (params: {
  levelId: string;
  dateKey?: string;
  signature?: string;
}): Promise<void> => {
  await redis.del(keyPuzzlePrivate(params.levelId));
  await redis.del(keyPuzzlePublic(params.levelId));
  await redis.del(keyPuzzlePublishedPost(params.levelId));
  await redis.zRem(keyPuzzlesIndex, [params.levelId]);
  if (params.dateKey) {
    await redis.zRem(keyPuzzlesByDate(params.dateKey), [params.levelId]);
  }
  if (params.signature) {
    await clearUsedSignature(params.signature, params.levelId);
  }
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


export const getOldestUnplayedLevelId = async (completed: Set<string>) => {
  const levelIds = await getAllLevelIds();
  for (const levelId of levelIds) {
    if (!completed.has(levelId)) {
      return levelId;
    }
  }
  return null;
};
