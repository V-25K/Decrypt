import { context, reddit, redis } from '@devvit/web/server';
import { aiChallengeTypePool } from './ai';
import { ensureAICandidatePoolSelection, takeAICandidateBatch } from './ai-pool';
import { getDecryptSettings } from './config';
import {
  type HardnessBoundsByTier,
  looksLikeAllowedAuthor,
  maxPuzzleAuthorLength,
  sanitizeAuthor,
  sanitizePhrase,
} from './content';
import { buildPuzzle, buildPublicPuzzle } from './puzzle';
import { runDummySolver } from './dummy-solver';
import {
  computeAdaptiveHardnessBounds,
  computeGlobalDailyBias,
} from './difficulty-calibration';
import {
  clearUsedSignature,
  getAutoDailyLevelIdsForDate,
  peekNextLevelId,
  getPuzzleMapping,
  PuzzleLevelAllocationConflictError,
  getPuzzlePublicationReceipt,
  getPuzzlePublishedPostId,
  getStagedLevelId,
  getPuzzlePrivate,
  clearStagedLevelId,
  reserveUsedSignature,
  savePuzzle,
  setPuzzlePublicationReceipt,
  setPuzzlePublishedPostId,
  setStagedLevelId,
  setDailyPointer,
} from './puzzle-store';
import {
  keyDailyChallengeTypeSeed,
  keyDailyStageLock,
  keyPuzzleGenerationLock,
  keyPuzzlePublishLock,
} from './keys';
import { formatDateKey } from './serde';
import { mulberry32, randInt, shuffleWithRng } from './rng';
import type { DifficultyTier } from './content';
import type { ChallengeType, PuzzlePrivate, PuzzlePublic } from '../../shared/game';
import { createValidationPipeline } from './validation-pipeline';

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
  tokenSignature: Parameters<typeof savePuzzle>[0]['tokenSignature'];
  expectedLevelId?: Parameters<typeof savePuzzle>[0]['expectedLevelId'];
};

type SelectedPuzzleCandidate = {
  text: string;
  author: string;
  challengeType: ChallengeType;
  normalizedSignature: string;
  tokenSignature: string;
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

export class PuzzleGenerationInProgressError extends Error {
  constructor() {
    super('Puzzle generation already in progress. Please try again in a moment.');
    this.name = 'PuzzleGenerationInProgressError';
  }
}

export class PuzzlePublishCommitError extends Error {
  readonly levelId: string;
  readonly postId: string;

  constructor(params: { levelId: string; postId: string; cause?: unknown }) {
    const detail =
      params.cause instanceof Error ? params.cause.message : 'unknown publish commit failure';
    super(
      `Daily post ${params.postId} was created for ${params.levelId}, but publish state could not be committed: ${detail}`
    );
    this.name = 'PuzzlePublishCommitError';
    this.levelId = params.levelId;
    this.postId = params.postId;
  }
}

export class PuzzlePublishInProgressError extends Error {
  readonly levelId: string;

  constructor(levelId: string) {
    super(`Daily publish already in progress for ${levelId}. Please retry in a moment.`);
    this.name = 'PuzzlePublishInProgressError';
    this.levelId = levelId;
  }
}

type PublishRunAs = 'APP' | 'USER';

const commitPublishedPostState = async (params: {
  levelId: string;
  dateKey: string;
  postId: string;
}): Promise<void> => {
  let lastCommitError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await setPuzzlePublicationReceipt(params.levelId, {
        postId: params.postId,
        dateKey: params.dateKey,
        publishedAt: Date.now(),
      });
      await setPuzzlePublishedPostId(params.levelId, params.postId, params.dateKey);
      return;
    } catch (error) {
      lastCommitError = error;
    }
  }

  throw new PuzzlePublishCommitError({
    levelId: params.levelId,
    postId: params.postId,
    cause: lastCommitError,
  });
};

const puzzlePublishLockExpiration = (): Date =>
  new Date(Date.now() + 60 * 1000);

const dailyStageLockExpiration = (): Date =>
  new Date(Date.now() + 5 * 60 * 1000);

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

const pause = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

const loadCommittedPublishedPostId = async (
  levelId: string
): Promise<{ postId: string; dateKey: string } | null> => {
  const existingPostId = await getPuzzlePublishedPostId(levelId);
  if (existingPostId) {
    const receipt = await getPuzzlePublicationReceipt(levelId);
    return {
      postId: existingPostId,
      dateKey: receipt?.dateKey ?? '',
    };
  }

  const publicationReceipt = await getPuzzlePublicationReceipt(levelId);
  if (!publicationReceipt) {
    return null;
  }

  await commitPublishedPostState({
    levelId,
    dateKey: publicationReceipt.dateKey,
    postId: publicationReceipt.postId,
  });
  return publicationReceipt;
};

const waitForPublishedPostCommit = async (
  levelId: string
): Promise<{ postId: string; dateKey: string } | null> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const committed = await loadCommittedPublishedPostId(levelId);
    if (committed) {
      return committed;
    }
    if (attempt < 4) {
      await pause(50);
    }
  }
  return null;
};

const puzzleGenerationLockExpiration = (): Date =>
  new Date(Date.now() + 120 * 1000);

const puzzleGenerationLockToken = (): string => createLockToken();

const withPuzzleGenerationLock = async <T>(action: () => Promise<T>): Promise<T> => {
  const lockToken = puzzleGenerationLockToken();
  const lockAcquired = await redis.set(keyPuzzleGenerationLock, lockToken, {
    nx: true,
    expiration: puzzleGenerationLockExpiration(),
  });
  if (!lockAcquired) {
    const activeToken = await redis.get(keyPuzzleGenerationLock);
    console.warn(
      `[withPuzzleGenerationLock] generation lock already held age=${describeLockAge(activeToken)} token=${
        activeToken ?? 'none'
      }`
    );
    throw new PuzzleGenerationInProgressError();
  }

  try {
    return await action();
  } finally {
    const activeToken = await redis.get(keyPuzzleGenerationLock);
    if (activeToken === lockToken) {
      await redis.del(keyPuzzleGenerationLock);
    }
  }
};

const difficultyRangeForTier = (
  tier: DifficultyTier
): { min: number; max: number } => {
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

const seedFromString = (input: string): number => {
  // Non-cryptographic. Used only for deterministic shuffles.
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

const dailyTierOrder: DifficultyTier[] = ['warmup', 'medium', 'hard', 'expert'];

const buildDailyTierQueue = (dateKey: string): DifficultyTier[] => {
  const rng = mulberry32(seedFromString(`daily-tier:${dateKey}`));
  return shuffleWithRng(dailyTierOrder, rng);
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
    // If we lost the NX race and can't read the stored seed, we must fail fast.
    // Returning a local seed would silently desync the daily challenge type queue.
    throw new Error(`Failed to acquire daily challenge type seed for ${dateKey}`);
  }
  return seed;
};

const formatDailyTitle = (levelId: string): string => {
  const match = levelId.match(/(\d+)$/);
  if (!match || !match[1]) {
    return `Daily Cipher ${levelId}`;
  }
  return `Daily Cipher #${Number(match[1])}`;
};

const buildDailyChallengeTypeQueue = async (
  dateKey: string
): Promise<ChallengeType[]> => {
  const seed = await getDailyChallengeTypeSeed(dateKey);
  const rng = mulberry32(seed);
  return shuffleWithRng(aiChallengeTypePool, rng);
};

const selectDailyQueueEntry = <T>(
  queue: T[],
  slotIndex: number,
  params: { dateKey: string; label: string; allowWrap?: boolean }
): T => {
  if (slotIndex >= queue.length && !params.allowWrap) {
    throw new Error(
      `No ${params.label} slots remain for ${params.dateKey}; slot=${slotIndex} length=${queue.length}`
    );
  }
  const selected = queue[slotIndex % queue.length];
  if (!selected) {
    throw new Error(`Failed to select ${params.label} for ${params.dateKey}`);
  }
  if (slotIndex >= queue.length && params.allowWrap) {
    console.warn(
      `[resolveDailyGenerationPlan] ${params.label} queue exhausted for ${params.dateKey}; wrapping slot=${slotIndex} length=${queue.length}`
    );
  }
  return selected;
};

const resolveDailyGenerationPlan = async (dateKey: string): Promise<{
  slotIndex: number;
  tier: DifficultyTier;
  challengeType: ChallengeType;
}> => {
  const [existingAutoDailyLevelIds, challengeTypeQueue] = await Promise.all([
    getAutoDailyLevelIdsForDate(dateKey),
    buildDailyChallengeTypeQueue(dateKey),
  ]);
  const slotIndex = existingAutoDailyLevelIds.length;
  const tierQueue = buildDailyTierQueue(dateKey);

  return {
    slotIndex,
    tier: selectDailyQueueEntry(tierQueue, slotIndex, {
      dateKey,
      label: 'daily tier',
      allowWrap: true,
    }),
    challengeType: selectDailyQueueEntry(challengeTypeQueue, slotIndex, {
      dateKey,
      label: 'daily challenge type',
    }),
  };
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
  return await getPuzzleMapping(previousId);
};

type ManualPuzzleBuildContext = {
  nextLevelId: string;
  signatureOwnerToken: string;
  previousMapping: Record<string, number> | null;
};

type PreparedManualPuzzle = {
  puzzlePrivate: PuzzlePrivate;
  puzzlePublic: PuzzlePublic;
};

const maxSolverSeedAttempts = 4;

const isDummySolverUnsatisfiedError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('DUMMY_SOLVER_UNSATISFIED');

const solverSeedKeyForAttempt = (levelId: string, attempt: number): string =>
  attempt <= 0 ? levelId : `${levelId}:solver:${attempt}`;

const buildPuzzleWithSolverSeedRetries = (
  params: Parameters<typeof buildPuzzle>[0]
): { puzzlePrivate: PuzzlePrivate; puzzlePublic: PuzzlePublic } => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxSolverSeedAttempts; attempt += 1) {
    try {
      return buildPuzzle({
        ...params,
        seedKey: solverSeedKeyForAttempt(params.levelId, attempt),
      });
    } catch (error) {
      lastError = error;
      if (!isDummySolverUnsatisfiedError(error) || attempt >= maxSolverSeedAttempts - 1) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('DUMMY_SOLVER_UNSATISFIED');
};

const requiredSolveRatioForDifficulty = (difficulty: number): number => {
  if (difficulty <= 3) {
    return 0.9;
  }
  if (difficulty <= 7) {
    return 0.8;
  }
  if (difficulty >= 9) {
    return 0.65;
  }
  return 0.7;
};

const stabilizeManualPuzzleReveals = (
  puzzle: PuzzlePrivate
): { puzzlePrivate: PuzzlePrivate; puzzlePublic: PuzzlePublic } | null => {
  const requiredSolveRatio = requiredSolveRatioForDifficulty(puzzle.difficulty);
  const trySolve = (revealedIndices: number[]) =>
    runDummySolver({
      puzzle,
      revealedIndices,
      requiredSolveRatio,
    });

  const initial = trySolve(puzzle.prefilledIndices);
  if (initial.solvable && !initial.blindGuessRequired && initial.solvedRatio >= requiredSolveRatio) {
    return {
      puzzlePrivate: puzzle,
      puzzlePublic: buildPublicPuzzle(puzzle, []),
    };
  }

  const revealedSet = new Set(puzzle.prefilledIndices);
  const byLetter = new Map<string, { firstIndex: number; frequency: number }>();
  for (const tile of puzzle.tiles) {
    if (!tile.isLetter || revealedSet.has(tile.index)) {
      continue;
    }
    const existing = byLetter.get(tile.char);
    if (existing) {
      existing.frequency += 1;
      existing.firstIndex = Math.min(existing.firstIndex, tile.index);
    } else {
      byLetter.set(tile.char, {
        firstIndex: tile.index,
        frequency: 1,
      });
    }
  }

  const candidateIndices = [...byLetter.values()]
    .sort((a, b) => b.frequency - a.frequency || a.firstIndex - b.firstIndex)
    .map((entry) => entry.firstIndex);

  for (const index of candidateIndices) {
    revealedSet.add(index);
    const revealedIndices = [...revealedSet].sort((a, b) => a - b);
    const result = trySolve(revealedIndices);
    if (result.solvable && !result.blindGuessRequired && result.solvedRatio >= requiredSolveRatio) {
      const puzzlePrivate: PuzzlePrivate = {
        ...puzzle,
        prefilledIndices: revealedIndices,
        revealedIndices,
        revealed_indices: revealedIndices,
      };
      return {
        puzzlePrivate,
        puzzlePublic: buildPublicPuzzle(puzzlePrivate, []),
      };
    }
  }

  return null;
};

export const buildManualPuzzleWithSolverFallback = (
  params: Parameters<typeof buildPuzzle>[0]
): { puzzlePrivate: PuzzlePrivate; puzzlePublic: PuzzlePublic } => {
  try {
    return buildPuzzleWithSolverSeedRetries(params);
  } catch (error) {
    if (!isDummySolverUnsatisfiedError(error)) {
      throw error;
    }
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxSolverSeedAttempts; attempt += 1) {
    try {
      const generated = buildPuzzle({
        ...params,
        seedKey: solverSeedKeyForAttempt(params.levelId, attempt),
        skipSolvabilityCheck: true,
      });
      const stabilized = stabilizeManualPuzzleReveals(generated.puzzlePrivate);
      if (stabilized) {
        return stabilized;
      }
      lastError = new Error('DUMMY_SOLVER_UNSATISFIED');
    } catch (error) {
      lastError = error;
      if (!isDummySolverUnsatisfiedError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('DUMMY_SOLVER_UNSATISFIED');
};

export const buildAndSaveManualPuzzle = async (params: {
  signatureOwnerToken: string;
  normalizedSignature: string;
  tokenSignature?: string | null;
  buildPreparedPuzzle: (
    context: ManualPuzzleBuildContext
  ) => Promise<PreparedManualPuzzle> | PreparedManualPuzzle;
}): Promise<{
  levelId: string;
  signatureOwnerToken: string;
  puzzlePrivate: PuzzlePrivate;
  puzzlePublic: PuzzlePublic;
}> => {
  let signatureOwnerToken = params.signatureOwnerToken;

  for (let saveAttempt = 0; saveAttempt < 3; saveAttempt += 1) {
    const nextLevelId = await peekNextLevelId();
    const previousMapping = await previousMappingForLevel(nextLevelId);
    const prepared = await params.buildPreparedPuzzle({
      nextLevelId,
      signatureOwnerToken,
      previousMapping,
    });

    try {
      const levelId = await savePuzzle({
        puzzlePrivate: prepared.puzzlePrivate,
        puzzlePublic: prepared.puzzlePublic,
        normalizedSignature: params.normalizedSignature,
        tokenSignature: params.tokenSignature,
        expectedLevelId: nextLevelId,
      });
      signatureOwnerToken = levelId;
      return {
        levelId,
        signatureOwnerToken,
        puzzlePrivate: {
          ...prepared.puzzlePrivate,
          levelId,
        },
        puzzlePublic: {
          ...prepared.puzzlePublic,
          levelId,
        },
      };
    } catch (error) {
      if (error instanceof PuzzleLevelAllocationConflictError && saveAttempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to allocate a stable level id for the manual challenge.');
};

const selectPuzzleCandidate = async (params: {
  difficulty: number;
  difficultyLabel: string;
  retries: number;
  basePreferredType: ChallengeType;
  dateKey: string;
  signatureOwnerToken: string;
  allowSelectionRefill?: boolean;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
}): Promise<SelectedPuzzleCandidate> => {
  const { trackBatchGeneration } = await import('./metrics.ts');
  let lastFailureReason = 'unknown';
  const preferredType = params.basePreferredType;
  const batchSize = 3;
  const maxBatches = params.retries;
  const pipeline = createValidationPipeline(params.hardnessBoundsByTier);

  for (let batchAttempt = 0; batchAttempt < maxBatches; batchAttempt += 1) {
    let batch;
    try {
      batch = await takeAICandidateBatch({
        difficulty: params.difficulty,
        preferredType,
        batchSize,
      });
      console.log(
        `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} batch=${batchAttempt + 1}/${maxBatches} received ${batch.totalReturned}/${batch.totalRequested} candidates`
      );
      if (batch.totalReturned === 0) {
        lastFailureReason = `candidate pool empty for ${params.difficultyLabel} ${preferredType}`;
        if (params.allowSelectionRefill) {
          const refill = await ensureAICandidatePoolSelection({
            difficulty: params.difficulty,
            preferredType,
            minimumCandidates: batchSize,
            hardnessBoundsByTier: params.hardnessBoundsByTier,
          });
          if (refill.generated > 0) {
            continue;
          }
        }
        continue;
      }
    } catch (error) {
      lastFailureReason = error instanceof Error ? error.message : 'unknown';
      console.warn(
        `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} batch=${
          batchAttempt + 1
        }/${maxBatches} candidate batch failed: ${lastFailureReason}`
      );
      
      // Track failed batch
      trackBatchGeneration({
        candidatesRequested: batchSize,
        candidatesReturned: 0,
        candidateSelected: false,
      });
      
      continue;
    }

    for (let candidateIndex = 0; candidateIndex < batch.candidates.length; candidateIndex += 1) {
      const phrase = batch.candidates[candidateIndex];
      if (!phrase) continue;

      if (phrase.challengeType !== preferredType) {
        lastFailureReason = `challenge type mismatch (expected ${preferredType} got ${phrase.challengeType})`;
        console.warn(
          `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} batch=${batchAttempt + 1} candidate=${candidateIndex + 1} mismatch challenge type expected=${preferredType} actual=${phrase.challengeType}`
        );
        continue;
      }

      const text = sanitizePhrase(phrase.text);

      // Phase 1 validation using pipeline
      const phase1 = pipeline.phase1(text, params.difficulty);
      if (!phase1.valid) {
        lastFailureReason = phase1.reasons.join('; ');
        console.warn(
          `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} batch=${batchAttempt + 1} candidate=${candidateIndex + 1} rejected quote: ${phase1.reasons.join('; ')}`
        );
        continue;
      }

      const dup = await pipeline.duplicate(text, params.signatureOwnerToken);
      if (dup.duplicate) {
        lastFailureReason = dup.reason ?? 'duplicate';
        console.warn(
          `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} batch=${batchAttempt + 1} candidate=${candidateIndex + 1} rejected quote: ${dup.reason ?? 'duplicate'}`
        );
        continue;
      }

      // Track successful batch
      trackBatchGeneration({
        candidatesRequested: batch.totalRequested,
        candidatesReturned: batch.totalReturned,
        candidateSelected: true,
      });

      return {
        text,
        author: phrase.author,
        challengeType: phrase.challengeType,
        normalizedSignature: dup.normalizedSignature,
        tokenSignature: dup.tokenSignature,
      };
    }
    
    // Track batch with no selected candidate
    trackBatchGeneration({
      candidatesRequested: batch.totalRequested,
      candidatesReturned: batch.totalReturned,
      candidateSelected: false,
    });
  }

  throw new PuzzleGenerationFailedError({
    levelId: params.signatureOwnerToken,
    dateKey: params.dateKey,
    attempts: maxBatches,
    reason: lastFailureReason,
  });
};

export const generatePuzzleForDate = async (
  now: Date,
  options?: {
    allowSelectionRefill?: boolean;
  }
): Promise<{ levelId: string; dateKey: string }> => {
  return await withPuzzleGenerationLock(async () => {
    const settings = await getDecryptSettings();
    const retries = settings.aiMaxRetries;
    const dateKey = formatDateKey(now);
    let saved = false;
    let levelId: string | null = null;
    let signatureOwnerToken = `pending:${crypto.randomUUID()}`;
    let reservedSignature: string | null = null;
    try {
      const { tier, challengeType: basePreferredType } =
        await resolveDailyGenerationPlan(dateKey);
      const tierRange = difficultyRangeForTier(tier);
      const rng = mulberry32(seedFromString(`${dateKey}:${tier}`));
      const baseDifficulty = randInt(rng, tierRange.min, tierRange.max);
      let bias: -1 | 0 | 1 = 0;
      let hardnessBoundsByTier: Partial<HardnessBoundsByTier> | undefined = undefined;
      try {
        bias = await computeGlobalDailyBias();
      } catch (error) {
        console.error(
          `Difficulty calibration fallback to base difficulty due to error: ${
            error instanceof Error ? error.message : 'unknown'
          }`
        );
      }
      try {
        hardnessBoundsByTier = await computeAdaptiveHardnessBounds();
      } catch (error) {
        console.error(
          `Hardness calibration fallback to defaults due to error: ${
            error instanceof Error ? error.message : 'unknown'
          }`
        );
      }
      const difficulty = clampDifficultyWithinTier(baseDifficulty, bias, tierRange);
      const difficultyLabel = `difficulty ${difficulty} of 10 (${tier})`;
      const selected = await selectPuzzleCandidate({
        difficulty,
        difficultyLabel,
        retries,
        basePreferredType,
        dateKey,
        signatureOwnerToken,
        allowSelectionRefill: options?.allowSelectionRefill ?? false,
        hardnessBoundsByTier,
      });
      const reserved = await reserveUsedSignature(
        selected.normalizedSignature,
        signatureOwnerToken
      );
      if (!reserved) {
        throw new Error('Selected puzzle signature could not be reserved.');
      }
      reservedSignature = selected.normalizedSignature;
      for (let saveAttempt = 0; saveAttempt < 3; saveAttempt += 1) {
        const nextLevelId = await peekNextLevelId();
        const previousMapping = await previousMappingForLevel(nextLevelId);
        const generated = buildPuzzleWithSolverSeedRetries({
          levelId: nextLevelId,
          dateKey,
          text: selected.text,
          author: selected.author,
          challengeType: selected.challengeType,
          source: 'AUTO_DAILY',
          difficulty,
          logicalPercent: settings.logicalCipherPercent,
          previousMapping,
        });
        const pipeline = createValidationPipeline(hardnessBoundsByTier);
        const phase2 = pipeline.phase2(generated.puzzlePrivate);
        if (!phase2.valid) {
          throw new Error(`Generated puzzle validation failed: ${phase2.reasons.join('; ')}`);
        }
        const payload: GeneratedPuzzlePayload = {
          puzzlePrivate: generated.puzzlePrivate,
          puzzlePublic: generated.puzzlePublic,
          normalizedSignature: selected.normalizedSignature,
          tokenSignature: selected.tokenSignature,
          expectedLevelId: nextLevelId,
        };
        try {
          levelId = await savePuzzle(payload);
          saved = true;
          signatureOwnerToken = levelId;
          break;
        } catch (error) {
          if (error instanceof PuzzleLevelAllocationConflictError && saveAttempt < 2) {
            continue;
          }
          await clearUsedSignature(payload.normalizedSignature, signatureOwnerToken);
          throw error;
        }
      }
      if (!saved || !levelId) {
        throw new Error('Failed to allocate a stable level id for the generated puzzle.');
      }

      return { levelId, dateKey };
    } catch (error) {
      if (!saved && reservedSignature) {
        await clearUsedSignature(reservedSignature, signatureOwnerToken);
      }
      if (error instanceof PuzzleGenerationFailedError) {
        throw error;
      }
      throw new PuzzleGenerationFailedError({
        levelId: levelId ?? signatureOwnerToken,
        dateKey,
        attempts: retries,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  });
};

export const publishDailyPost = async (params: {
  levelId: string;
  dateKey: string;
  runAs?: PublishRunAs;
}): Promise<string> => {
  const committedBeforeLock = await loadCommittedPublishedPostId(params.levelId);
  if (committedBeforeLock) {
    return committedBeforeLock.postId;
  }

  const lockToken = createLockToken();
  const lockAcquired = await redis.set(keyPuzzlePublishLock(params.levelId), lockToken, {
    nx: true,
    expiration: puzzlePublishLockExpiration(),
  });
  if (!lockAcquired) {
    const committedWhileWaiting = await waitForPublishedPostCommit(params.levelId);
    if (committedWhileWaiting) {
      return committedWhileWaiting.postId;
    }
    throw new PuzzlePublishInProgressError(params.levelId);
  }

  try {
    const committedAfterLock = await loadCommittedPublishedPostId(params.levelId);
    if (committedAfterLock) {
      return committedAfterLock.postId;
    }

    const subredditName = context.subredditName;
    if (!subredditName) {
      throw new Error('subredditName is required');
    }
    const title = formatDailyTitle(params.levelId);
    const runAs = params.runAs ?? 'APP';

    console.log('[publishDailyPost] submitting custom post', {
      levelId: params.levelId,
      dateKey: params.dateKey,
      subredditName,
      runAs,
      contextDetails: {
        subredditId: context.subredditId,
        username: context.username,
      },
    });

    // Declare post in outer scope so it's accessible after the inner try-catch.
    let post: Awaited<ReturnType<typeof reddit.submitCustomPost>> | undefined;
    try {
      post = await reddit.submitCustomPost({
        subredditName,
        title,
        entry: 'default',
        ...(runAs === 'USER' ? { runAs } : {}),
        postData: {
          levelId: params.levelId,
          dateKey: params.dateKey,
          mode: 'daily',
        },
        textFallback: {
          text: `${title}. Open the interactive post to play.`,
        },
      });

      console.log('[publishDailyPost] Reddit API response received', {
        postId: post?.id,
        postUrl: post?.url,
        hasPost: !!post,
        postKeys: post ? Object.keys(post) : [],
      });
    } catch (error) {
      console.error('[publishDailyPost] Reddit API error during post submission', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        errorType: error?.constructor?.name,
        levelId: params.levelId,
        dateKey: params.dateKey,
        subredditName,
        runAs,
      });
      throw error;
    }

    if (!post?.id) {
      console.error('[publishDailyPost] submitCustomPost returned without a post id', {
        fullResponse: JSON.stringify(post, null, 2),
      });
      throw new Error('submitCustomPost returned without a post id.');
    }

    console.log('[publishDailyPost] custom post created successfully', {
      levelId: params.levelId,
      dateKey: params.dateKey,
      postId: post.id,
      runAs,
    });

    await commitPublishedPostState({
      levelId: params.levelId,
      dateKey: params.dateKey,
      postId: post.id,
    });
    return post.id;
  } finally {
    const activeToken = await redis.get(keyPuzzlePublishLock(params.levelId));
    if (activeToken === lockToken) {
      await redis.del(keyPuzzlePublishLock(params.levelId));
    }
  }
};

export const activateDailyPuzzle = async (levelId: string): Promise<void> => {
  await setDailyPointer(levelId);
};

export const publishAndActivateDailyPost = async (params: {
  levelId: string;
  dateKey: string;
  runAs?: PublishRunAs;
}): Promise<string> => {
  const postId = await publishDailyPost(params);
  await activateDailyPuzzle(params.levelId);
  return postId;
};

export const stagePuzzleForTomorrow = async (): Promise<{
  dateKey: string;
  levelIds: string[];
}> => {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + 1);
  const dateKey = formatDateKey(now);
  const existingLevelIdsBeforeLock = await getAutoDailyLevelIdsForDate(dateKey);
  if (existingLevelIdsBeforeLock.length >= 2) {
    return {
      dateKey,
      levelIds: existingLevelIdsBeforeLock,
    };
  }

  const lockToken = createLockToken();
  const lockAcquired = await redis.set(keyDailyStageLock(dateKey), lockToken, {
    nx: true,
    expiration: dailyStageLockExpiration(),
  });
  if (!lockAcquired) {
    return {
      dateKey,
      levelIds: existingLevelIdsBeforeLock,
    };
  }

  try {
    const existingLevelIds = await getAutoDailyLevelIdsForDate(dateKey);
    const generatedLevelIds: string[] = [];

    while (existingLevelIds.length + generatedLevelIds.length < 2) {
      const generated = await generatePuzzleForDate(now, {
        allowSelectionRefill: true,
      });
      generatedLevelIds.push(generated.levelId);
    }

    // Only set the staged pointer once after all generation is done.
    // Setting it on each iteration silently overwrites the first puzzle's pointer.
    const lastGeneratedId = generatedLevelIds[generatedLevelIds.length - 1];
    if (lastGeneratedId) {
      await setStagedLevelId(lastGeneratedId);
    }

    return {
      dateKey,
      levelIds: [...existingLevelIds, ...generatedLevelIds],
    };
  } finally {
    const activeToken = await redis.get(keyDailyStageLock(dateKey));
    if (activeToken === lockToken) {
      await redis.del(keyDailyStageLock(dateKey));
    }
  }
};

export const publishStagedPuzzle = async (): Promise<{
  levelId: string;
  dateKey: string;
  postId: string;
}> => {
  const todayDateKey = formatDateKey(new Date());
  const stagedLevelId = await getStagedLevelId();
  const stagedPuzzle = stagedLevelId ? await getPuzzlePrivate(stagedLevelId) : null;
  const stagedPointerMissingPuzzle = stagedLevelId !== null && stagedPuzzle === null;
  const clearStagedPointerIfConsumed = async (levelId: string, dateKey: string): Promise<void> => {
    if (stagedLevelId === levelId && dateKey === todayDateKey) {
      await clearStagedLevelId();
    }
  };

  if (stagedPointerMissingPuzzle) {
    await clearStagedLevelId();
  }

  if (stagedPuzzle?.dateKey === todayDateKey) {
    const existingPostId = await getPuzzlePublishedPostId(stagedPuzzle.levelId);
    if (!existingPostId) {
      const postId = await publishAndActivateDailyPost({
        levelId: stagedPuzzle.levelId,
        dateKey: stagedPuzzle.dateKey,
        runAs: 'APP',
      });
      await clearStagedPointerIfConsumed(stagedPuzzle.levelId, stagedPuzzle.dateKey);
      return {
        levelId: stagedPuzzle.levelId,
        dateKey: stagedPuzzle.dateKey,
        postId,
      };
    }
  }

  const todayLevelIds = await getAutoDailyLevelIdsForDate(todayDateKey);
  for (const levelId of todayLevelIds) {
    if (levelId === stagedPuzzle?.levelId) {
      continue;
    }
    const existingPostId = await getPuzzlePublishedPostId(levelId);
    if (existingPostId) {
      continue;
    }
    const postId = await publishAndActivateDailyPost({
      levelId,
      dateKey: todayDateKey,
      runAs: 'APP',
    });
    return {
      levelId,
      dateKey: todayDateKey,
      postId,
    };
  }

  if (stagedPuzzle?.dateKey === todayDateKey) {
    const existingPostId = await getPuzzlePublishedPostId(stagedPuzzle.levelId);
    if (existingPostId) {
      await activateDailyPuzzle(stagedPuzzle.levelId);
      await clearStagedPointerIfConsumed(stagedPuzzle.levelId, stagedPuzzle.dateKey);
      return {
        levelId: stagedPuzzle.levelId,
        dateKey: stagedPuzzle.dateKey,
        postId: existingPostId,
      };
    }
  }

  if (stagedPointerMissingPuzzle) {
    throw new Error(`Staged puzzle ${stagedLevelId} could not be found.`);
  }

  if (!stagedLevelId) {
    throw new Error('No staged puzzle is ready to publish.');
  }

  if (!stagedPuzzle) {
    throw new Error(`Staged puzzle ${stagedLevelId} could not be found.`);
  }

  if (stagedPuzzle.dateKey !== todayDateKey) {
    throw new Error(
      `Staged puzzle ${stagedPuzzle.levelId} is for ${stagedPuzzle.dateKey}, not ${todayDateKey}.`
    );
  }

  throw new Error('No staged puzzle is ready to publish.');
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
  const text = sanitizePhrase(params.text);
  const author = sanitizeAuthor(params.author);
  if (!author || !looksLikeAllowedAuthor(author) || author.length > maxPuzzleAuthorLength) {
    throw new Error(
      `Injected puzzle author invalid. Use letters, numbers, spaces, . ' and - (max ${maxPuzzleAuthorLength}).`
    );
  }
  let hardnessBoundsByTier: Partial<HardnessBoundsByTier> | undefined = undefined;
  try {
    hardnessBoundsByTier = await computeAdaptiveHardnessBounds();
  } catch (error) {
    console.error(
      `Manual hardness calibration fallback to defaults due to error: ${
        error instanceof Error ? error.message : 'unknown'
      }`
    );
  }

  // Create unified validation pipeline
  const pipeline = createValidationPipeline(hardnessBoundsByTier);

  // Phase 1 validation using pipeline
  const quoteValidation = pipeline.phase1(text, params.difficulty);
  if (!quoteValidation.valid) {
    throw new Error(`Injected puzzle quote invalid: ${quoteValidation.reasons.join(', ')}`);
  }

  // Duplicate check using pipeline
  let signatureOwnerToken = `pending:${crypto.randomUUID()}`;
  const dup = await pipeline.duplicate(text, signatureOwnerToken);
  if (dup.duplicate) {
    throw new Error(`Injected puzzle quote ${dup.reason ?? 'duplicate'}.`);
  }

  const reserved = await reserveUsedSignature(dup.normalizedSignature, signatureOwnerToken);
  if (!reserved) {
    throw new Error('Injected puzzle quote already used in another challenge.');
  }
  let saved = false;
  let levelId: string | null = null;
  try {
    const savedPuzzle = await buildAndSaveManualPuzzle({
      signatureOwnerToken,
      normalizedSignature: dup.normalizedSignature,
      tokenSignature: dup.tokenSignature,
      buildPreparedPuzzle: ({ nextLevelId, previousMapping }) => {
        const generated = buildManualPuzzleWithSolverFallback({
          levelId: nextLevelId,
          dateKey,
          text,
          author,
          challengeType: params.challengeType,
          source: 'MANUAL_INJECTED',
          difficulty: params.difficulty,
          logicalPercent: settings.logicalCipherPercent,
          previousMapping,
        });

        const validation = pipeline.phase2(generated.puzzlePrivate);
        if (!validation.valid) {
          throw new Error(`Injected puzzle validation failed: ${validation.reasons.join(', ')}`);
        }

        return {
          puzzlePrivate: generated.puzzlePrivate,
          puzzlePublic: generated.puzzlePublic,
        };
      },
    });
    levelId = savedPuzzle.levelId;
    signatureOwnerToken = savedPuzzle.signatureOwnerToken;
    saved = true;
  } catch (error) {
    if (!saved) {
      await clearUsedSignature(dup.normalizedSignature, signatureOwnerToken);
    }
    throw error;
  }
  if (!levelId) {
    throw new Error('Manual puzzle save completed without allocating a level id.');
  }
  return { levelId, dateKey };
};
