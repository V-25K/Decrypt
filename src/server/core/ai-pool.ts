import { redis } from '@devvit/web/server';
import { z } from 'zod';
import {
  normalizeContent,
  difficultyToTier,
  sanitizePhrase,
  type DifficultyTier,
  type HardnessBoundsByTier,
} from './content';
import { getDecryptSettings } from './config';
import {
  aiChallengeTypePool,
  generatePuzzlePhraseBatch,
  type BatchGenerationResult,
  type ChallengeCandidate,
} from './ai';
import {
  keyAIPoolBucket,
  keyAIPoolCandidate,
  keyAIPoolCandidateSignature,
  keyAIPoolCandidateSequence,
  keyAIPoolDifficultyCursor,
  keyAIPoolFillLock,
  keyAIPoolReservedSignature,
} from './keys';
import { challengeTypeSchema, type ChallengeType } from '../../shared/game';
import { computeAdaptiveHardnessBounds } from './difficulty-calibration';
import { createValidationPipeline } from './validation-pipeline';

const aiPoolCandidateSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  author: z.string().min(1),
  challengeType: z.string().min(1),
  normalizedSignature: z.string().min(1),
  sourceDifficulty: z.number().int().min(1).max(10),
  tier: z.union([
    z.literal('warmup'),
    z.literal('medium'),
    z.literal('hard'),
    z.literal('expert'),
  ]),
  createdAt: z.number().int().nonnegative(),
});

type AIPoolCandidate = {
  id: string;
  text: string;
  author: string;
  challengeType: ChallengeType;
  normalizedSignature: string;
  sourceDifficulty: number;
  tier: DifficultyTier;
  createdAt: number;
};

const aiPoolTargetSizePerBucket = 4;
const aiPoolCandidateTtlMs = 72 * 60 * 60 * 1000;
const aiPoolBatchFillSize = 3;
const aiPoolCleanupConcurrency = 10;
const aiPoolPruneLimitPerBucket = 12;
const aiPoolCandidateExpiration = (createdAt: number): Date =>
  new Date(createdAt + aiPoolCandidateTtlMs);
const createLockToken = (): string => `${Date.now()}:${crypto.randomUUID()}`;

const describeLockAge = (token: string | null | undefined): string => {
  if (!token) {
    return 'none';
  }
  const [issuedAtRaw] = token.split(':', 1);
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    return 'unknown';
  }
  const ageMs = Math.max(0, Date.now() - issuedAt);
  return `${ageMs}ms`;
};

const difficultyRangeForTier = (tier: DifficultyTier): number[] => {
  if (tier === 'warmup') {
    return [1, 2, 3];
  }
  if (tier === 'medium') {
    return [4, 5];
  }
  if (tier === 'hard') {
    return [6, 7, 8];
  }
  return [9, 10];
};

const representativeDifficultyForTier = (tier: DifficultyTier): number => {
  if (tier === 'warmup') {
    return 2;
  }
  if (tier === 'medium') {
    return 5;
  }
  if (tier === 'hard') {
    return 7;
  }
  return 9;
};

const nextDifficultyForBucket = async (
  tier: DifficultyTier,
  challengeType: ChallengeType
): Promise<number> => {
  const difficulties = difficultyRangeForTier(tier);
  const index =
    (await redis.incrBy(keyAIPoolDifficultyCursor(tier, challengeType), 1)) - 1;
  return difficulties[index % difficulties.length] ?? representativeDifficultyForTier(tier);
};

const aiPoolFillLockExpiration = (): Date =>
  new Date(Date.now() + 90 * 1000);

const aiPoolFillLockToken = (): string => createLockToken();

const withAIPoolFillLock = async <T>(action: () => Promise<T>): Promise<T | null> => {
  const token = aiPoolFillLockToken();
  const acquired = await redis.set(keyAIPoolFillLock, token, {
    nx: true,
    expiration: aiPoolFillLockExpiration(),
  });
  if (!acquired) {
    const activeToken = await redis.get(keyAIPoolFillLock);
    console.warn(
      `[withAIPoolFillLock] pool fill lock already held age=${describeLockAge(activeToken)} token=${
        activeToken ?? 'none'
      }`
    );
    return null;
  }

  try {
    return await action();
  } finally {
    const activeToken = await redis.get(keyAIPoolFillLock);
    if (activeToken === token) {
      await redis.del(keyAIPoolFillLock);
    }
  }
};

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

const parsePoolCandidate = (
  raw: string | null | undefined
): AIPoolCandidate | null => {
  if (!raw) {
    return null;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = aiPoolCandidateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return null;
  }
  const challengeTypeParsed = challengeTypeSchema.safeParse(parsed.data.challengeType);
  if (!challengeTypeParsed.success) {
    return null;
  }
  return {
    id: parsed.data.id,
    text: sanitizePhrase(parsed.data.text),
    author: parsed.data.author,
    challengeType: challengeTypeParsed.data,
    normalizedSignature: parsed.data.normalizedSignature,
    sourceDifficulty: parsed.data.sourceDifficulty,
    tier: parsed.data.tier,
    createdAt: parsed.data.createdAt,
  };
};

const reservePoolSignature = async (
  normalizedSignature: string,
  candidateId: string,
  expiration: Date
): Promise<boolean> => {
  const reserved = await redis.set(
    keyAIPoolReservedSignature(normalizedSignature),
    candidateId,
    {
      nx: true,
      expiration,
    }
  );
  return Boolean(reserved);
};

const clearPoolSignature = async (
  normalizedSignature: string,
  candidateId: string
): Promise<void> => {
  const existing = await redis.get(keyAIPoolReservedSignature(normalizedSignature));
  if (existing === candidateId) {
    await redis.del(keyAIPoolReservedSignature(normalizedSignature));
  }
};

const removePoolEntry = async (params: {
  bucketKey: string;
  candidateId: string;
  signature: string | null;
}): Promise<void> => {
  if (typeof params.signature === 'string' && params.signature.length > 0) {
    await clearPoolSignature(params.signature, params.candidateId);
  }
  await Promise.all([
    redis.del(keyAIPoolCandidate(params.candidateId)),
    redis.del(keyAIPoolCandidateSignature(params.candidateId)),
    redis.zRem(params.bucketKey, [params.candidateId]),
  ]);
};

const pruneStalePoolEntries = async (
  bucketKey: string,
  limit = aiPoolPruneLimitPerBucket
): Promise<void> => {
  const entries = await redis.zRange(bucketKey, 0, Math.max(0, limit - 1), {
    by: 'rank',
  });
  const candidateIds = entries.map((entry) => entry.member).filter((id) => id.length > 0);
  if (candidateIds.length === 0) {
    return;
  }
  const [payloads, signatures] = await Promise.all([
    redis.mGet(candidateIds.map((candidateId) => keyAIPoolCandidate(candidateId))),
    redis.mGet(candidateIds.map((candidateId) => keyAIPoolCandidateSignature(candidateId))),
  ]);
  await runWithConcurrency(candidateIds, aiPoolCleanupConcurrency, async (candidateId, index) => {
    const parsed = parsePoolCandidate(payloads[index]);
    if (parsed) {
      return;
    }
    await removePoolEntry({
      bucketKey,
      candidateId,
      signature: signatures[index] ?? null,
    });
  });
};

const savePoolCandidate = async (params: {
  candidate: ChallengeCandidate;
  sourceDifficulty: number;
  tier: DifficultyTier;
}) => {
  const sequence = await redis.incrBy(keyAIPoolCandidateSequence, 1);
  const id = `pool_${`${sequence}`.padStart(8, '0')}`;
  const createdAt = Date.now();
  const payload: AIPoolCandidate = {
    id,
    text: params.candidate.text,
    author: params.candidate.author,
    challengeType: params.candidate.challengeType,
    normalizedSignature: normalizeContent(params.candidate.text),
    sourceDifficulty: params.sourceDifficulty,
    tier: params.tier,
    createdAt,
  };
  const expiration = aiPoolCandidateExpiration(createdAt);

  const reserved = await reservePoolSignature(payload.normalizedSignature, id, expiration);
  if (!reserved) {
    return false;
  }

  try {
    await redis.set(keyAIPoolCandidateSignature(id), payload.normalizedSignature, {
      expiration,
    });
    await redis.set(keyAIPoolCandidate(id), JSON.stringify(payload), {
      expiration,
    });
    await redis.zAdd(keyAIPoolBucket(params.tier, params.candidate.challengeType), {
      member: id,
      score: createdAt,
    });
    return true;
  } catch (error) {
    await clearPoolSignature(payload.normalizedSignature, id);
    await redis.del(keyAIPoolCandidateSignature(id));
    throw error;
  }
};

const fillBucket = async (params: {
  tier: DifficultyTier;
  challengeType: ChallengeType;
  targetSizePerBucket: number;
  maxCandidatesToGenerate: number;
  fixedDifficulty?: number;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
}): Promise<number> => {
  const bucketKey = keyAIPoolBucket(params.tier, params.challengeType);
  const currentSize = await redis.zCard(bucketKey);
  if (currentSize >= params.targetSizePerBucket || params.maxCandidatesToGenerate <= 0) {
    return 0;
  }

  const missing = Math.min(
    params.targetSizePerBucket - currentSize,
    params.maxCandidatesToGenerate,
    aiPoolBatchFillSize
  );
  const settings = await getDecryptSettings();
  if (!settings.geminiApiKey) {
    return 0;
  }

  const difficulty =
    params.fixedDifficulty ??
    (await nextDifficultyForBucket(params.tier, params.challengeType));
  const batch = await generatePuzzlePhraseBatch({
    levelId: `pool_${params.tier}_${params.challengeType}`,
    difficulty,
    apiKey: settings.geminiApiKey,
    difficultyLabel: `difficulty ${difficulty} of 10 (${params.tier})`,
    safetyMode: settings.contentSafetyMode,
    preferredType: params.challengeType,
    hardnessBoundsByTier: params.hardnessBoundsByTier,
    batchSize: missing,
  });

  const pipeline = createValidationPipeline(params.hardnessBoundsByTier);
  let stored = 0;
  for (const candidate of batch.candidates) {
    if (stored >= missing) {
      break;
    }
    if (candidate.challengeType !== params.challengeType) {
      continue;
    }
    const phase1 = pipeline.phase1(candidate.text, difficulty);
    if (!phase1.valid) {
      continue;
    }
    const dup = await pipeline.duplicate(
      candidate.text,
      `pool_${params.tier}_${params.challengeType}`
    );
    if (dup.duplicate) {
      continue;
    }
    const saved = await savePoolCandidate({
      candidate,
      sourceDifficulty: difficulty,
      tier: params.tier,
    });
    if (saved) {
      stored += 1;
    }
  }

  return stored;
};

const pruneAllPoolBuckets = async (): Promise<void> => {
  const buckets = (
    ['warmup', 'medium', 'hard', 'expert'] as const
  ).flatMap((tier) =>
    aiChallengeTypePool.map((challengeType) => ({
      tier,
      challengeType,
      bucketKey: keyAIPoolBucket(tier, challengeType),
    }))
  );
  await runWithConcurrency(buckets, aiPoolCleanupConcurrency, async (bucket) => {
    await pruneStalePoolEntries(bucket.bucketKey);
  });
};

export const warmAICandidatePool = async (params?: {
  maxCandidatesToGenerate?: number;
  targetSizePerBucket?: number;
}) => {
  const maxCandidatesToGenerate = params?.maxCandidatesToGenerate ?? 6;
  const targetSizePerBucket = params?.targetSizePerBucket ?? aiPoolTargetSizePerBucket;
  const hardnessBoundsByTier = await computeAdaptiveHardnessBounds().catch(
    () => undefined
  );

  const result = await withAIPoolFillLock(async () => {
    await pruneAllPoolBuckets();
    let remaining = maxCandidatesToGenerate;
    let attempted = 0;
    let generated = 0;

    for (const tier of ['warmup', 'medium', 'hard', 'expert'] as const) {
      for (const challengeType of aiChallengeTypePool) {
        if (remaining <= 0) {
          return { attempted, generated, locked: false };
        }
        attempted += 1;
        const stored = await fillBucket({
          tier,
          challengeType,
          targetSizePerBucket,
          maxCandidatesToGenerate: remaining,
          hardnessBoundsByTier,
        });
        generated += stored;
        remaining -= stored;
      }
    }

    return { attempted, generated, locked: false };
  });

  return (
    result ?? {
      attempted: 0,
      generated: 0,
      locked: true,
    }
  );
};

export const ensureAICandidatePoolSelection = async (params: {
  difficulty: number;
  preferredType: ChallengeType;
  minimumCandidates?: number;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
}) => {
  const tier = difficultyToTier(params.difficulty);
  const minimumCandidates = params.minimumCandidates ?? 3;
  const result = await withAIPoolFillLock(async () => {
    const stored = await fillBucket({
      tier,
      challengeType: params.preferredType,
      targetSizePerBucket: minimumCandidates,
      maxCandidatesToGenerate: minimumCandidates,
      fixedDifficulty: params.difficulty,
      hardnessBoundsByTier: params.hardnessBoundsByTier,
    });
    return {
      generated: stored,
      locked: false,
    };
  });

  return (
    result ?? {
      generated: 0,
      locked: true,
    }
  );
};

export const takeAICandidateBatch = async (params: {
  difficulty: number;
  preferredType: ChallengeType;
  batchSize: number;
}): Promise<BatchGenerationResult> => {
  const tier = difficultyToTier(params.difficulty);
  const bucketKey = keyAIPoolBucket(tier, params.preferredType);
  const entries = await redis.zRange(bucketKey, 0, params.batchSize - 1, {
    by: 'rank',
  });
  const candidateIds = entries.map((entry) => entry.member).filter((id) => id.length > 0);
  const candidates =
    candidateIds.length === 0
      ? []
      : (
          await (async () => {
            const [payloads, signatures] = await Promise.all([
              redis.mGet(candidateIds.map((candidateId) => keyAIPoolCandidate(candidateId))),
              redis.mGet(
                candidateIds.map((candidateId) => keyAIPoolCandidateSignature(candidateId))
              ),
            ]);
            const processed = await runWithConcurrency(
              candidateIds,
              aiPoolCleanupConcurrency,
              async (candidateId, index): Promise<ChallengeCandidate | null> => {
                const parsed = parsePoolCandidate(payloads[index]);
                if (!parsed) {
                  await removePoolEntry({
                    bucketKey,
                    candidateId,
                    signature: signatures[index] ?? null,
                  });
                  return null;
                }
                await removePoolEntry({
                  bucketKey,
                  candidateId,
                  signature: parsed.normalizedSignature,
                });
                return {
                  text: parsed.text,
                  author: parsed.author,
                  challengeType: parsed.challengeType,
                };
              }
            );
            return processed.filter((candidate): candidate is ChallengeCandidate => candidate !== null);
          })()
        );

  return {
    candidates,
    totalRequested: params.batchSize,
    totalReturned: candidates.length,
  };
};
