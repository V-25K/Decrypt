import { redis } from '@devvit/web/server';
import { z } from 'zod';
import { keyShareCompletionReceipt, keySharedLevels } from './keys';

const shareCompletionReceiptSchema = z.object({
  levelId: z.string().min(1),
  dateKey: z.string().min(1),
  solveSeconds: z.number().int().nonnegative(),
  mistakes: z.number().int().nonnegative(),
  heartsRemaining: z.number().int().nonnegative(),
  usedPowerups: z.number().int().nonnegative(),
  score: z.number().int().nonnegative().optional(),
  completedAtTs: z.number().int().nonnegative(),
});

export type ShareCompletionReceipt = z.infer<typeof shareCompletionReceiptSchema>;

export const saveShareCompletionReceipt = async (params: {
  userId: string;
  levelId: string;
  dateKey: string;
  solveSeconds: number;
  mistakes: number;
  heartsRemaining: number;
  usedPowerups: number;
  score: number;
}): Promise<void> => {
  const receipt: ShareCompletionReceipt = {
    levelId: params.levelId,
    dateKey: params.dateKey,
    solveSeconds: params.solveSeconds,
    mistakes: params.mistakes,
    heartsRemaining: params.heartsRemaining,
    usedPowerups: params.usedPowerups,
    score: params.score,
    completedAtTs: Date.now(),
  };
  await redis.hSet(keyShareCompletionReceipt(params.userId, params.levelId), {
    levelId: receipt.levelId,
    dateKey: receipt.dateKey,
    solveSeconds: `${receipt.solveSeconds}`,
    mistakes: `${receipt.mistakes}`,
    heartsRemaining: `${receipt.heartsRemaining}`,
    usedPowerups: `${receipt.usedPowerups}`,
    score: `${receipt.score ?? ''}`,
    completedAtTs: `${receipt.completedAtTs}`,
  });
};

const numberFromHash = (
  hash: Record<string, string>,
  field: keyof ShareCompletionReceipt
): number | null => {
  const raw = hash[field];
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? Math.floor(value) : null;
};

export const getShareCompletionReceipt = async (
  userId: string,
  levelId: string
): Promise<ShareCompletionReceipt | null> => {
  const hash = await redis.hGetAll(keyShareCompletionReceipt(userId, levelId));
  if (Object.keys(hash).length === 0) {
    return null;
  }
  const solveSeconds = numberFromHash(hash, 'solveSeconds');
  const mistakes = numberFromHash(hash, 'mistakes');
  const heartsRemaining = numberFromHash(hash, 'heartsRemaining');
  const usedPowerups = numberFromHash(hash, 'usedPowerups');
  const score = numberFromHash(hash, 'score');
  const completedAtTs = numberFromHash(hash, 'completedAtTs');

  const parsed = shareCompletionReceiptSchema.safeParse({
    levelId: hash.levelId ?? levelId,
    dateKey: hash.dateKey ?? '',
    solveSeconds,
    mistakes,
    heartsRemaining,
    usedPowerups,
    score,
    completedAtTs,
  });
  return parsed.success ? parsed.data : null;
};

export const markLevelSharedOnce = async (
  userId: string,
  levelId: string
): Promise<boolean> => {
  const inserted = await redis.hSetNX(keySharedLevels(userId), levelId, '1');
  return inserted === 1;
};
