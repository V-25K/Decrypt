import { context, reddit, redis } from '@devvit/web/server';
import {
  aiChallengeTypePool,
  generatePuzzlePhraseBatch,
  type BatchGenerationResult,
} from './ai';
import { ensureAICandidatePoolSelection, takeAICandidateBatch } from './ai-pool';
import { getDecryptSettings } from './config';
import {
  containsDisallowedContent,
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
  getRecentUsedSignatureEntries,
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
  transferUsedSignatureReservation,
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
import { validatePuzzle } from './validation';
import { filterCandidateBatch } from './candidate-filter';

const challengePostEntry = 'default' as const;

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

export class PuzzlePublishedPostUnavailableError extends Error {
  readonly postId: string;
  readonly levelId: string;
  readonly reason: 'removed' | 'spam';
  readonly removedBy?: string;
  readonly removedByCategory?: string;

  constructor(params: {
    postId: string;
    levelId: string;
    reason: 'removed' | 'spam';
    removedBy?: string;
    removedByCategory?: string;
  }) {
    const moderationDetails = [
      params.removedByCategory ? `removedByCategory=${params.removedByCategory}` : null,
      params.removedBy ? `removedBy=${params.removedBy}` : null,
    ]
      .filter((detail): detail is string => detail !== null)
      .join(', ');
    super(
      `Published post ${params.postId} for ${params.levelId} is not usable because it was marked ${params.reason}${
        moderationDetails.length > 0 ? ` (${moderationDetails})` : ''
      }.`
    );
    this.name = 'PuzzlePublishedPostUnavailableError';
    this.postId = params.postId;
    this.levelId = params.levelId;
    this.reason = params.reason;
    this.removedBy = params.removedBy;
    this.removedByCategory = params.removedByCategory;
  }
}

/** Thrown when publishStagedPuzzle finds no staged puzzle pointer or the puzzle data is missing. */
export class PuzzleNotStagedError extends Error {
  constructor(detail?: string) {
    super(detail ?? 'No staged puzzle is ready to publish.');
    this.name = 'PuzzleNotStagedError';
  }
}

/** Thrown when the staged puzzle's dateKey doesn't match the expected publish date. */
export class PuzzleDateMismatchError extends Error {
  readonly levelId: string;
  readonly puzzleDateKey: string;
  readonly expectedDateKey: string;

  constructor(params: { levelId: string; puzzleDateKey: string; expectedDateKey: string }) {
    super(
      `Staged puzzle ${params.levelId} is for ${params.puzzleDateKey}, not ${params.expectedDateKey}.`
    );
    this.name = 'PuzzleDateMismatchError';
    this.levelId = params.levelId;
    this.puzzleDateKey = params.puzzleDateKey;
    this.expectedDateKey = params.expectedDateKey;
  }
}

type PostModerationSnapshot = {
  approved: boolean;
  removed: boolean;
  spam: boolean;
  title?: string;
  subredditName?: string;
  removedBy?: string;
  removedByCategory?: string;
};

const capturePostModerationSnapshot = (
  post: Awaited<ReturnType<typeof reddit.getPostById>>
): PostModerationSnapshot => ({
  approved: post.approved,
  removed: post.removed,
  spam: post.spam,
  title: post.title,
  subredditName: post.subredditName,
  removedBy: post.removedBy,
  removedByCategory: post.removedByCategory,
});

const assertVerifiedPostUsable = (params: {
  levelId: string;
  postId: string;
  snapshot: PostModerationSnapshot;
}): void => {
  if (params.snapshot.removed) {
    throw new PuzzlePublishedPostUnavailableError({
      levelId: params.levelId,
      postId: params.postId,
      reason: 'removed',
      removedBy: params.snapshot.removedBy,
      removedByCategory: params.snapshot.removedByCategory,
    });
  }
  if (params.snapshot.spam) {
    throw new PuzzlePublishedPostUnavailableError({
      levelId: params.levelId,
      postId: params.postId,
      reason: 'spam',
      removedBy: params.snapshot.removedBy,
      removedByCategory: params.snapshot.removedByCategory,
    });
  }
};

const shouldAttemptApprovalRecovery = (snapshot: PostModerationSnapshot): boolean =>
  !snapshot.spam && (snapshot.removed || !snapshot.approved);

const verifyPostVisibilityState = async (params: {
  phase: 'publishDailyPost' | 'ensurePostVisibility';
  levelId: string;
  postId: string;
}): Promise<PostModerationSnapshot> => {
  const t3PostId = params.postId as `t3_${string}`;
  const initialPost = await reddit.getPostById(t3PostId);
  let snapshot = capturePostModerationSnapshot(initialPost);

  console.log(`[${params.phase}] Post status check`, {
    postId: params.postId,
    approved: snapshot.approved,
    removed: snapshot.removed,
    spam: snapshot.spam,
    removedBy: snapshot.removedBy,
    removedByCategory: snapshot.removedByCategory,
    title: snapshot.title,
    subreddit: snapshot.subredditName,
  });

  if (!shouldAttemptApprovalRecovery(snapshot)) {
    return snapshot;
  }

  try {
    console.log(`[${params.phase}] Attempting approval recovery`, {
      postId: params.postId,
      removed: snapshot.removed,
      approved: snapshot.approved,
      removedBy: snapshot.removedBy,
      removedByCategory: snapshot.removedByCategory,
    });
    await reddit.approve(t3PostId);
    await pause(150);

    const refetchedPost = await reddit.getPostById(t3PostId);
    snapshot = capturePostModerationSnapshot(refetchedPost);

    console.log(`[${params.phase}] Post status after approval attempt`, {
      postId: params.postId,
      approved: snapshot.approved,
      removed: snapshot.removed,
      spam: snapshot.spam,
      removedBy: snapshot.removedBy,
      removedByCategory: snapshot.removedByCategory,
      title: snapshot.title,
      subreddit: snapshot.subredditName,
    });
  } catch (approveError) {
    console.warn(`[${params.phase}] Could not recover post visibility via approval`, {
      postId: params.postId,
      error: approveError instanceof Error ? approveError.message : String(approveError),
      removed: snapshot.removed,
      approved: snapshot.approved,
      spam: snapshot.spam,
      removedBy: snapshot.removedBy,
      removedByCategory: snapshot.removedByCategory,
    });
  }

  return snapshot;
};

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
      allowWrap: true,
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
  const initialValidation = validatePuzzle(puzzle);
  if (
    initial.solvable &&
    !initial.blindGuessRequired &&
    initial.solvedRatio >= requiredSolveRatio &&
    initialValidation.valid
  ) {
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
    const candidatePuzzle: PuzzlePrivate = {
      ...puzzle,
      prefilledIndices: revealedIndices,
      revealedIndices,
      revealed_indices: revealedIndices,
    };
    const candidateValidation = validatePuzzle(candidatePuzzle);
    if (!candidateValidation.valid) {
      revealedSet.delete(index);
      continue;
    }
    const result = trySolve(revealedIndices);
    if (result.solvable && !result.blindGuessRequired && result.solvedRatio >= requiredSolveRatio) {
      return {
        puzzlePrivate: candidatePuzzle,
        puzzlePublic: buildPublicPuzzle(candidatePuzzle, []),
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
        applyObstructionsOnSkip: true,
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

const selectionPoolBatchSize = 3;
const selectionLiveBatchSize = 6;

const requestSelectionPoolRefill = (params: {
  difficulty: number;
  basePreferredType: ChallengeType;
  signatureOwnerToken: string;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
}) => {
  void ensureAICandidatePoolSelection({
    difficulty: params.difficulty,
    preferredType: params.basePreferredType,
    minimumCandidates: selectionPoolBatchSize,
    hardnessBoundsByTier: params.hardnessBoundsByTier,
  })
    .then((result) => {
      console.log(
        `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} refill generated=${result.generated} locked=${result.locked}`
      );
    })
    .catch((error) => {
      console.warn(
        `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} refill failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`
      );
    });
};

const fetchPuzzleCandidateBatch = async (params: {
  difficulty: number;
  difficultyLabel: string;
  basePreferredType: ChallengeType;
  batchAttempt: number;
  maxBatches: number;
  signatureOwnerToken: string;
  apiKey: string;
  safetyMode: string;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
}): Promise<{
  batch: BatchGenerationResult;
  batchSource: 'pool' | 'live';
  poolWasEmpty: boolean;
}> => {
  let poolWasEmpty = false;
  try {
    const poolBatch = await takeAICandidateBatch({
      difficulty: params.difficulty,
      preferredType: params.basePreferredType,
      batchSize: selectionPoolBatchSize,
    });
    if (poolBatch.totalReturned > 0) {
      requestSelectionPoolRefill({
        difficulty: params.difficulty,
        basePreferredType: params.basePreferredType,
        signatureOwnerToken: params.signatureOwnerToken,
        hardnessBoundsByTier: params.hardnessBoundsByTier,
      });
      return {
        batch: poolBatch,
        batchSource: 'pool',
        poolWasEmpty: false,
      };
    }
    poolWasEmpty = true;
    requestSelectionPoolRefill({
      difficulty: params.difficulty,
      basePreferredType: params.basePreferredType,
      signatureOwnerToken: params.signatureOwnerToken,
      hardnessBoundsByTier: params.hardnessBoundsByTier,
    });
  } catch (poolError) {
    console.warn(
      `[generatePuzzleForDate] attempt=${params.signatureOwnerToken} batch=${
        params.batchAttempt + 1
      }/${params.maxBatches} candidate pool unavailable: ${
        poolError instanceof Error ? poolError.message : 'unknown'
      }`
    );
  }

  try {
    const batch = await generatePuzzlePhraseBatch({
      levelId: `live_${params.signatureOwnerToken}_${params.batchAttempt + 1}`,
      difficulty: params.difficulty,
      batchSize: selectionLiveBatchSize,
      apiKey: params.apiKey,
      difficultyLabel: params.difficultyLabel,
      safetyMode: params.safetyMode,
      preferredType: params.basePreferredType,
      hardnessBoundsByTier: params.hardnessBoundsByTier,
    });
    return {
      batch,
      batchSource: 'live',
      poolWasEmpty,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    if (poolWasEmpty) {
      throw new Error(`candidate pool empty, live fallback failed: ${reason}`);
    }
    throw error;
  }
};

const releasePoolHeldReservations = async (
  candidates: Array<{ normalizedSignature: string; reservationOwnerToken?: string }>
): Promise<void> => {
  await Promise.all(
    candidates.map(async (candidate) => {
      if (!candidate.reservationOwnerToken) {
        return;
      }
      await clearUsedSignature(candidate.normalizedSignature, candidate.reservationOwnerToken);
    })
  );
};

export const generatePuzzleForDate = async (
  now: Date
): Promise<{ levelId: string; dateKey: string }> => {
  return await withPuzzleGenerationLock(async () => {
    const { trackBatchGeneration } = await import('./metrics.ts');
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
      const pipeline = createValidationPipeline(hardnessBoundsByTier);
      let lastFailureReason = 'unknown';

      for (let batchAttempt = 0; batchAttempt < retries; batchAttempt += 1) {
        let fetchedBatch: BatchGenerationResult;
        let batchSource: 'pool' | 'live' = 'pool';
        let poolWasEmpty = false;
        try {
          const fetched = await fetchPuzzleCandidateBatch({
            difficulty,
            difficultyLabel,
            basePreferredType,
            batchAttempt,
            maxBatches: retries,
            signatureOwnerToken,
            apiKey: settings.geminiApiKey,
            safetyMode: settings.contentSafetyMode,
            hardnessBoundsByTier,
          });
          fetchedBatch = fetched.batch;
          batchSource = fetched.batchSource;
          poolWasEmpty = fetched.poolWasEmpty;
          console.log(
            `[generatePuzzleForDate] attempt=${signatureOwnerToken} source=${batchSource} batch=${batchAttempt + 1}/${retries} received ${fetchedBatch.totalReturned}/${fetchedBatch.totalRequested} candidates`
          );
        } catch (error) {
          lastFailureReason = error instanceof Error ? error.message : 'unknown';
          console.warn(
            `[generatePuzzleForDate] attempt=${signatureOwnerToken} source=${batchSource} batch=${
              batchAttempt + 1
            }/${retries} candidate batch failed: ${lastFailureReason}`
          );
          trackBatchGeneration({
            candidatesRequested: batchSource === 'live' ? selectionLiveBatchSize : selectionPoolBatchSize,
            candidatesReturned: 0,
            candidateSelected: false,
          });
          continue;
        }

        if (fetchedBatch.totalReturned === 0) {
          lastFailureReason = poolWasEmpty
            ? `candidate pool empty for ${difficultyLabel} ${basePreferredType}`
            : `AI returned no usable candidates for ${difficultyLabel} ${basePreferredType}`;
          trackBatchGeneration({
            candidatesRequested: fetchedBatch.totalRequested,
            candidatesReturned: fetchedBatch.totalReturned,
            candidateSelected: false,
          });
          continue;
        }

        const recentSignatureEntries = await getRecentUsedSignatureEntries(1200);
        const filtered = filterCandidateBatch({
          candidates: fetchedBatch.candidates,
          preferredType: basePreferredType,
          difficulty,
          pipeline,
          recentSignatureEntries,
        });
        const pendingPoolReservationCandidates = new Map(
          filtered.decisions
            .filter(
              (decision): decision is typeof decision & {
                normalizedSignature: string;
                reservationOwnerToken: string;
              } =>
                typeof decision.normalizedSignature === 'string' &&
                decision.normalizedSignature.length > 0 &&
                typeof decision.reservationOwnerToken === 'string' &&
                decision.reservationOwnerToken.length > 0
            )
            .map((decision) => [
              decision.normalizedSignature,
              {
                normalizedSignature: decision.normalizedSignature,
                reservationOwnerToken: decision.reservationOwnerToken,
              },
            ])
        );

        for (const decision of filtered.decisions) {
          if (decision.accepted || !decision.reason) {
            continue;
          }
          lastFailureReason = decision.reason;
          console.warn(
            `[generatePuzzleForDate] attempt=${signatureOwnerToken} batch=${batchAttempt + 1} candidate=${
              decision.candidateIndex + 1
            } rejected quote: ${decision.reason}`
          );
        }

        if (filtered.accepted.length === 0) {
          await releasePoolHeldReservations([...pendingPoolReservationCandidates.values()]);
          trackBatchGeneration({
            candidatesRequested: fetchedBatch.totalRequested,
            candidatesReturned: fetchedBatch.totalReturned,
            candidateSelected: false,
          });
          continue;
        }

        for (let candidateIndex = 0; candidateIndex < filtered.accepted.length; candidateIndex += 1) {
          const selected = filtered.accepted[candidateIndex];
          if (!selected) {
            continue;
          }

          const reserved = selected.reservationOwnerToken
            ? await transferUsedSignatureReservation(
                selected.normalizedSignature,
                selected.reservationOwnerToken,
                signatureOwnerToken
              )
            : await reserveUsedSignature(selected.normalizedSignature, signatureOwnerToken);
          if (!reserved) {
            lastFailureReason = 'Selected puzzle signature could not be reserved.';
            console.warn(
              `[generatePuzzleForDate] attempt=${signatureOwnerToken} batch=${batchAttempt + 1} survivor=${
                candidateIndex + 1
              } reservation failed`
            );
            continue;
          }
          pendingPoolReservationCandidates.delete(selected.normalizedSignature);
          reservedSignature = selected.normalizedSignature;
          let shouldReleaseReservedSignature = true;
          try {
            for (let saveAttempt = 0; saveAttempt < 3; saveAttempt += 1) {
              const nextLevelId = await peekNextLevelId();
              const previousMapping = await previousMappingForLevel(nextLevelId);
              let generated;
              try {
                generated = buildManualPuzzleWithSolverFallback({
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
              } catch (error) {
                lastFailureReason = error instanceof Error ? error.message : 'unknown';
                console.warn(
                  `[generatePuzzleForDate] attempt=${signatureOwnerToken} batch=${batchAttempt + 1} survivor=${
                    candidateIndex + 1
                  } build failed: ${lastFailureReason}`
                );
                break;
              }

              const phase2 = pipeline.phase2(generated.puzzlePrivate);
              if (!phase2.valid) {
                lastFailureReason = `Generated puzzle validation failed: ${phase2.reasons.join('; ')}`;
                console.warn(
                  `[generatePuzzleForDate] attempt=${signatureOwnerToken} batch=${batchAttempt + 1} survivor=${
                    candidateIndex + 1
                  } phase2 failed: ${phase2.reasons.join('; ')}`
                );
                break;
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
                reservedSignature = null;
                shouldReleaseReservedSignature = false;
                trackBatchGeneration({
                  candidatesRequested: fetchedBatch.totalRequested,
                  candidatesReturned: fetchedBatch.totalReturned,
                  candidateSelected: true,
                });
                await releasePoolHeldReservations([...pendingPoolReservationCandidates.values()]);
                return { levelId, dateKey };
              } catch (error) {
                if (error instanceof PuzzleLevelAllocationConflictError && saveAttempt < 2) {
                  continue;
                }
                throw error;
              }
            }
          } finally {
            if (shouldReleaseReservedSignature && reservedSignature) {
              await clearUsedSignature(reservedSignature, signatureOwnerToken);
              reservedSignature = null;
            }
          }
        }

        await releasePoolHeldReservations([...pendingPoolReservationCandidates.values()]);
        trackBatchGeneration({
          candidatesRequested: fetchedBatch.totalRequested,
          candidatesReturned: fetchedBatch.totalReturned,
          candidateSelected: false,
        });
      }

      throw new PuzzleGenerationFailedError({
        levelId: levelId ?? signatureOwnerToken,
        dateKey,
        attempts: retries,
        reason: lastFailureReason,
      });
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
  forceNewPost?: boolean;
}): Promise<string> => {
  console.log('[publishDailyPost] Starting', {
    levelId: params.levelId,
    dateKey: params.dateKey,
    runAs: params.runAs ?? 'APP',
    forceNewPost: params.forceNewPost ?? false,
  });

  if (!params.forceNewPost) {
    const committedBeforeLock = await loadCommittedPublishedPostId(params.levelId);
    if (committedBeforeLock) {
      console.log('[publishDailyPost] Post already published, returning existing', {
        levelId: params.levelId,
        postId: committedBeforeLock.postId,
      });
      return committedBeforeLock.postId;
    }
  } else {
    console.log('[publishDailyPost] forceNewPost=true, skipping duplicate check');
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

    console.log('[publishDailyPost] About to call reddit.submitCustomPost', {
      levelId: params.levelId,
      dateKey: params.dateKey,
      subredditName,
      runAs,
      title,
      entry: challengePostEntry,
      postData: {
        levelId: params.levelId,
        dateKey: params.dateKey,
        mode: 'daily',
      },
    });

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
        entry: challengePostEntry,
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
        postDataSent: {
          levelId: params.levelId,
          dateKey: params.dateKey,
          mode: 'daily',
        },
        postKeys: post ? Object.keys(post) : [],
      });

      if (!post?.id) {
        console.error('[publishDailyPost] submitCustomPost returned without a post id', {
          fullResponse: JSON.stringify(post, null, 2),
        });
        throw new Error('submitCustomPost returned without a post id.');
      }

      // Verify the post was actually created by checking if we can access it
      try {
        const verifiedSnapshot = await verifyPostVisibilityState({
          phase: 'publishDailyPost',
          levelId: params.levelId,
          postId: post.id,
        });
        assertVerifiedPostUsable({
          levelId: params.levelId,
          postId: post.id,
          snapshot: verifiedSnapshot,
        });
      } catch (verifyError) {
        console.error('[publishDailyPost] Post verification failed', {
          postId: post.id,
          error: verifyError instanceof Error ? verifyError.message : String(verifyError),
        });
        if (verifyError instanceof PuzzlePublishedPostUnavailableError) {
          throw verifyError;
        }
        // Don't throw here - the post might still be valid, just not immediately queryable
      }
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

/**
 * Checks if a published post is visible and attempts to approve it if needed
 */
export const ensurePostVisibility = async (params: {
  levelId: string;
  postId: string;
}): Promise<void> => {
  const { levelId, postId } = params;
  try {
    const snapshot = await verifyPostVisibilityState({
      phase: 'ensurePostVisibility',
      levelId,
      postId,
    });
    assertVerifiedPostUsable({
      levelId,
      postId,
      snapshot,
    });
  } catch (error) {
    console.error('[ensurePostVisibility] Failed to check post visibility', {
      postId,
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof PuzzlePublishedPostUnavailableError) {
      throw error;
    }
  }
};

export const publishAndActivateDailyPost = async (params: {
  levelId: string;
  dateKey: string;
  runAs?: PublishRunAs;
  forceNewPost?: boolean;
}): Promise<string> => {
  console.log('[publishAndActivateDailyPost] Starting', {
    levelId: params.levelId,
    dateKey: params.dateKey,
    runAs: params.runAs,
    forceNewPost: params.forceNewPost ?? false,
  });
  const postId = await publishDailyPost(params);
  console.log('[publishAndActivateDailyPost] Post created, now activating', {
    levelId: params.levelId,
    postId,
  });

  // Ensure the post is visible before activating
  await ensurePostVisibility({
    levelId: params.levelId,
    postId,
  });

  await activateDailyPuzzle(params.levelId);
  console.log('[publishAndActivateDailyPost] Activation complete', { levelId: params.levelId });
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
      const generated = await generatePuzzleForDate(now);
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
    throw new PuzzleNotStagedError(`Staged puzzle ${stagedLevelId} could not be found.`);
  }

  if (!stagedLevelId) {
    throw new PuzzleNotStagedError();
  }

  if (!stagedPuzzle) {
    throw new PuzzleNotStagedError(`Staged puzzle ${stagedLevelId} could not be found.`);
  }

  if (stagedPuzzle.dateKey !== todayDateKey) {
    throw new PuzzleDateMismatchError({
      levelId: stagedPuzzle.levelId,
      puzzleDateKey: stagedPuzzle.dateKey,
      expectedDateKey: todayDateKey,
    });
  }

  throw new PuzzleNotStagedError();
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
  if (
    !author ||
    !looksLikeAllowedAuthor(author) ||
    containsDisallowedContent(author) ||
    author.length > maxPuzzleAuthorLength
  ) {
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
