import { context, redis } from '@devvit/web/server';
import type {
  PowerupType,
  PuzzlePrivate,
  RevealedTile,
  SessionState,
  UserProfile,
} from '../../shared/game';
import { buildPublicPuzzle } from './puzzle';
import {
  getDailyPointer,
  getPuzzlePrivate,
  getPuzzlePublic,
} from './puzzle-store';
import {
  getCompletedLevels,
  getDailyRetryCount,
  getInventory,
  getUserProfile,
  hasFailedLevel,
  incrementUserEndlessCursor,
  markLevelCompleted,
  markLevelFailed,
  registerKnownUser,
  saveInventory,
  saveUserProfile,
} from './state';
import {
  clearSessionState,
  createSessionState,
  getSessionState,
  heartsRemaining,
  saveSessionState,
  saveSessionTimingState,
} from './session';
import {
  applyHammer,
  applyRocket,
  applyWand,
  checkPadlockStatus,
  getUnlockedWordIndices,
  puzzleIsComplete,
  revealFromGuess,
  tileIsLocked,
} from './gameplay';
import {
  defaultCoinsReward,
  applyDailyRetryPenalty,
  getFastSolveBonus,
  qualifiesForFastSolveBonus,
  flawlessBonusCoins,
  getDailyRetryScoreFactor,
  heartsPerRun,
  minSolveSeconds,
  sessionInactivityThresholdMs,
} from './constants';
import { getDailyRetryQuote } from '../../shared/game-balance';
import {
  computeScore,
  getUserRankSummary,
  incrementAllTimeLogic,
  recordAllTimeLevelScore,
  recordDailyScore,
} from './leaderboard';
import {
  getLevelEngagement,
  recordQualifiedLevelPlay,
  recordQualifiedLevelWin,
  recordLevelPlay,
  recordLevelWin,
} from './engagement';
import {
  updateQuestProgressOnCompletion,
  updateQuestProgressOnCoinSpend,
  updateQuestProgressOnShare,
} from './quests';
import { consumePowerup } from './economy';
import { z } from 'zod';
import { canStartChallenge, consumeHeartOnFailure } from './hearts';
import { saveShareCompletionReceipt } from './share-receipts';
import { getEndlessCatalogStatus, getNextEndlessCatalogLevelId } from './endless-catalog';
import { formatDateKey } from './serde';
import {
  keyCompletionFinalizeJournal,
  keyCompletionFinalizeLock,
  keyUserCompleted,
  keyUserDailyRetryCounts,
  keyUserProfile,
} from './keys';

const assertUserId = (): string => {
  const userId = context.userId;
  if (!userId) {
    throw new Error('User must be logged in.');
  }
  return userId;
};

const assertPostId = (): string => {
  const postId = context.postId;
  if (!postId) {
    throw new Error('This action requires post context.');
  }
  return postId;
};

const postDataSchema = z.object({
  levelId: z.string().min(1).optional(),
});

const getPostLevelId = (): string | null => {
  const parsed = postDataSchema.safeParse(context.postData ?? {});
  if (!parsed.success) {
    return null;
  }
  return parsed.data.levelId ?? null;
};

import { parseNumber, transactionCommitted } from './redis-util';

const maxOptimisticRetries = 3;

const completionLockTtlMs = 120_000;

const completionLockExpiration = (): Date =>
  new Date(Date.now() + completionLockTtlMs);

const completionLockToken = (): string =>
  crypto.randomUUID();


const loadPuzzlePrivate = async (levelId: string): Promise<PuzzlePrivate> => {
  const puzzle = await getPuzzlePrivate(levelId);
  if (!puzzle) {
    throw new Error(`Puzzle not found: ${levelId}`);
  }
  return puzzle;
};

const recomputeLegacyCurrentStreak = (profile: UserProfile): number =>
  Math.max(profile.dailyCurrentStreak, profile.endlessCurrentStreak);

const previousDateKey = (dateKey: string): string | null => {
  const rawParts = dateKey.split('-');
  if (rawParts.length !== 3) {
    return null;
  }
  const year = Number(rawParts[0]);
  const month = Number(rawParts[1]);
  const day = Number(rawParts[2]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null;
  }
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  if (Number.isNaN(previous.getTime())) {
    return null;
  }
  return formatDateKey(previous);
};

const remainingKeysByChain = (
  puzzle: PuzzlePrivate,
  revealedSet: Set<number>
): Map<number, number> => {
  const remaining = new Map<number, number>();
  for (const chain of puzzle.padlockChains) {
    const letterToIndices = new Map<string, number[]>();
    for (const index of chain.keyIndices) {
      const tile = puzzle.tiles[index];
      if (!tile || !tile.isLetter) {
        continue;
      }
      const existing = letterToIndices.get(tile.char) ?? [];
      existing.push(index);
      letterToIndices.set(tile.char, existing);
    }
    let count = 0;
    for (const indices of letterToIndices.values()) {
      if (!indices.some((index) => revealedSet.has(index))) {
        count += 1;
      }
    }
    if (letterToIndices.size === 0) {
      count = chain.keyIndices.filter((index) => !revealedSet.has(index)).length;
    }
    remaining.set(chain.chainId, count);
  }
  return remaining;
};

const hasLockProgressChanged = (
  before: Map<number, number>,
  after: Map<number, number>
): boolean => {
  if (before.size === 0 && after.size === 0) {
    return false;
  }
  for (const [chainId, afterRemaining] of after.entries()) {
    const beforeRemaining = before.get(chainId);
    if (beforeRemaining === undefined) {
      if (afterRemaining !== 0) {
        return true;
      }
      continue;
    }
    if (afterRemaining < beforeRemaining) {
      return true;
    }
  }
  return false;
};

const withTrackedSessionActivity = (
  session: SessionState,
  now = Date.now()
): SessionState => {
  const safeNow = Math.max(0, Math.floor(now));
  const previousSeenAt = session.lastSeenAt;
  if (previousSeenAt <= 0 || safeNow <= previousSeenAt) {
    return {
      ...session,
      lastSeenAt: safeNow,
    };
  }
  const deltaMs = safeNow - previousSeenAt;
  
  // HYBRID SESSION ACTIVITY TRACKING: 
  // Track all time for initial activity periods (thinking, solving)
  // For gaps between activities, don't track time over the threshold
  // This distinguishes between legitimate extended thinking and idle gaps
  
  const isInitialActivity = session.activeMs === 0;
  
  if (deltaMs > sessionInactivityThresholdMs && !isInitialActivity) {
    // This is a gap between activities - don't track it
    return {
      ...session,
      lastSeenAt: safeNow,
    };
  }
  
  // Track the full time for initial activity or reasonable gaps
  return {
    ...session,
    activeMs: session.activeMs + deltaMs,
    lastSeenAt: safeNow,
  };
};

// Export for testing purposes
export { withTrackedSessionActivity };

const buildDailyRetryState = (params: {
  mode: 'daily' | 'endless';
  retryCount: number;
  requiresPaidRetry: boolean;
  difficulty?: number;
}) => {
  if (params.mode !== 'daily') {
    return {
      retryCount: 0,
      nextRetryCost: 0,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
    };
  }
  const quote = getDailyRetryQuote({
    retryCount: params.retryCount,
    difficulty: params.difficulty,
  });
  return {
    retryCount: params.retryCount,
    nextRetryCost: quote.nextRetryCost,
    retryScoreFactor: quote.retryScoreFactor,
    nextRetryScoreFactor: quote.nextRetryScoreFactor,
    requiresPaidRetry: params.requiresPaidRetry,
  };
};

export const updateProfileOnCompletion = (params: {
  profile: UserProfile;
  puzzle: PuzzlePrivate;
  mode: 'daily' | 'endless';
  solveSeconds: number;
  mistakes: number;
  rewardCoins: number;
  currentDateKey: string;
  hadPriorFailure: boolean;
  isCurrentDaily: boolean;
  isRecoveryRun: boolean;
}): UserProfile => {
  const today = params.currentDateKey;
  const isCurrentDailyClear = params.mode === 'daily' && params.isCurrentDaily;
  let dailyStreak = params.profile.dailyCurrentStreak;
  if (isCurrentDailyClear && params.profile.lastPlayedDateKey !== today) {
    const expectedPrevious = previousDateKey(today);
    dailyStreak =
      params.profile.lastPlayedDateKey &&
      expectedPrevious !== null &&
      params.profile.lastPlayedDateKey === expectedPrevious
        ? params.profile.dailyCurrentStreak + 1
        : 1;
  }
  const endlessStreak =
    params.mode === 'endless' ? params.profile.endlessCurrentStreak + 1 : params.profile.endlessCurrentStreak;
  const nextLastPlayedDateKey =
    params.mode === 'daily' && !params.isCurrentDaily
      ? params.profile.lastPlayedDateKey
      : today;

  const wordsSolved = params.puzzle.words.length;
  const nextProfile: UserProfile = {
    ...params.profile,
    coins: params.profile.coins + params.rewardCoins,
    currentStreak: params.profile.currentStreak,
    dailyCurrentStreak:
      params.mode === 'daily' ? dailyStreak : params.profile.dailyCurrentStreak,
    endlessCurrentStreak: endlessStreak,
    lastPlayedDateKey: nextLastPlayedDateKey,
    totalWordsSolved: params.profile.totalWordsSolved + wordsSolved,
    logicTasksCompleted:
      params.profile.logicTasksCompleted + (params.puzzle.isLogical ? 1 : 0),
    totalLevelsCompleted: params.profile.totalLevelsCompleted + 1,
    flawlessWins: params.profile.flawlessWins + (params.mistakes === 0 ? 1 : 0),
    speedWins:
      params.profile.speedWins +
      (qualifiesForFastSolveBonus(
        params.solveSeconds,
        params.puzzle.difficulty
      )
        ? 1
        : 0),
    dailyFlawlessWins:
      params.profile.dailyFlawlessWins +
      (params.mode === 'daily' &&
      params.isCurrentDaily &&
      !params.isRecoveryRun &&
      params.mistakes === 0
        ? 1
        : 0),
    endlessFlawlessWins:
      params.profile.endlessFlawlessWins +
      (params.mode === 'endless' && params.mistakes === 0 ? 1 : 0),
    dailySpeedWins:
      params.profile.dailySpeedWins +
      (params.mode === 'daily' &&
      params.isCurrentDaily &&
      !params.isRecoveryRun &&
      qualifiesForFastSolveBonus(params.solveSeconds, params.puzzle.difficulty)
        ? 1
        : 0),
    endlessSpeedWins:
      params.profile.endlessSpeedWins +
      (params.mode === 'endless' &&
      qualifiesForFastSolveBonus(params.solveSeconds, params.puzzle.difficulty)
        ? 1
        : 0),
    dailyFirstTryWins:
      params.profile.dailyFirstTryWins +
      (params.mode === 'daily' &&
      params.isCurrentDaily &&
      !params.isRecoveryRun &&
      !params.hadPriorFailure
        ? 1
        : 0),
    endlessFirstTryWins:
      params.profile.endlessFirstTryWins +
      (params.mode === 'endless' && !params.hadPriorFailure ? 1 : 0),
    dailyModeClears: params.profile.dailyModeClears + (params.mode === 'daily' ? 1 : 0),
    endlessModeClears:
      params.profile.endlessModeClears + (params.mode === 'endless' ? 1 : 0),
    dailySolveTimeTotalSec:
      params.profile.dailySolveTimeTotalSec + (params.mode === 'daily' ? params.solveSeconds : 0),
    endlessSolveTimeTotalSec:
      params.profile.endlessSolveTimeTotalSec +
      (params.mode === 'endless' ? params.solveSeconds : 0),
  };
  return {
    ...nextProfile,
    currentStreak: recomputeLegacyCurrentStreak(nextProfile),
  };
};

const addRevealedIndices = (
  session: SessionState,
  indices: number[]
): SessionState => {
  const set = new Set(session.revealedIndices);
  for (const index of indices) {
    set.add(index);
  }
  return {
    ...session,
    revealedIndices: Array.from(set.values()),
  };
};

const deriveLegacyRevealFields = (revealedTiles: RevealedTile[]) => {
  const revealedIndices = revealedTiles.map((tile) => tile.index);
  const firstLetter = revealedTiles[0]?.letter ?? null;
  const revealedLetter =
    firstLetter !== null && revealedTiles.every((tile) => tile.letter === firstLetter)
      ? firstLetter
      : null;
  return {
    revealedIndices,
    revealedLetter,
  };
};

const getNewlyUnlockedChainIds = (params: {
  beforeUnlockedChainIds: Set<number>;
  afterUnlockedChainIds: number[];
}): number[] =>
  params.afterUnlockedChainIds.filter(
    (chainId) => !params.beforeUnlockedChainIds.has(chainId)
  );

export const bootstrapGame = async () => {
    const userId = assertUserId();
    await registerKnownUser(userId);
    const [profile, inventory, dailyPointer] = await Promise.all([
      getUserProfile(userId),
      getInventory(userId),
      getDailyPointer(),
    ]);
    const endlessCatalog = await getEndlessCatalogStatus();

    return {
      userId,
      username: context.username ?? null,
      subredditName: context.subredditName ?? null,
      postId: context.postId ?? null,
      currentDailyLevelId: dailyPointer,
      todayDateKey: formatDateKey(new Date()),
      profile,
      inventory,
      endlessCatalog,
    };
};

export const loadLevelForUser = async (params: {
  mode: 'daily' | 'endless';
  requestedLevelId?: string | null;
}) => {
  const userId = assertUserId();

  let levelId: string | null = null;
  if (params.mode === 'daily') {
    levelId =
      params.requestedLevelId ?? getPostLevelId() ?? (await getDailyPointer());
  } else if (params.requestedLevelId) {
    levelId = params.requestedLevelId;
  } else {
    // Endless mode - use cursor-based lookup (O(1))
    levelId = await getNextEndlessCatalogLevelId(userId);
  }

  if (!levelId) {
    if (params.mode === 'endless') {
      throw new Error('Endless catalog unavailable.');
    }
    throw new Error('No level available.');
  }

  const puzzlePublic = await getPuzzlePublic(levelId);
  if (!puzzlePublic) {
    throw new Error('Public puzzle payload not found.');
  }
  
  // For daily mode and completion checks, we still need getCompletedLevels
  const completed = params.mode === 'daily' || params.requestedLevelId
    ? await getCompletedLevels(userId)
    : new Set<string>();
  
  const postId = context.postId ?? null;
  const [challengeMetrics, failedLevel, retryCount, activeSession] = await Promise.all([
    getLevelEngagement(levelId),
    params.mode === 'daily' ? hasFailedLevel(userId, levelId) : Promise.resolve(false),
    params.mode === 'daily'
      ? getDailyRetryCount(userId, levelId)
      : Promise.resolve(0),
    postId ? getSessionState(userId, postId) : Promise.resolve(null),
  ]);
  const retryState = buildDailyRetryState({
    mode: params.mode,
    retryCount,
    requiresPaidRetry:
      params.mode === 'daily' &&
      failedLevel &&
      !completed.has(levelId) &&
      !(
        activeSession &&
        activeSession.activeLevelId === levelId &&
        activeSession.mode === 'daily'
      ),
    difficulty: puzzlePublic.difficulty,
  });

  return {
    mode: params.mode,
    levelId,
    puzzle: puzzlePublic,
    alreadyCompleted: completed.has(levelId),
    ...retryState,
    challengeMetrics,
  };
};

export const startSessionForLevel = async (
  levelId: string,
  mode: 'daily' | 'endless'
) => {
  const userId = assertUserId();
  const postId = assertPostId();
  const [profile, activeSession] = await Promise.all([
    getUserProfile(userId),
    getSessionState(userId, postId),
  ]);
  if (
    activeSession &&
    activeSession.activeLevelId === levelId &&
    activeSession.mode === mode
  ) {
    return {
      ok: true,
      session: activeSession,
      heartsRemaining: heartsRemaining(activeSession),
    };
  }
  if (mode === 'daily') {
    const [completed, failedLevel] = await Promise.all([
      getCompletedLevels(userId),
      hasFailedLevel(userId, levelId),
    ]);
    if (completed.has(levelId)) {
      throw new Error('Daily challenge already completed.');
    }
    if (failedLevel) {
      throw new Error('Daily retry requires coins.');
    }
  } else {
    const completed = await getCompletedLevels(userId);
    if (completed.has(levelId)) {
      throw new Error('Endless level already completed.');
    }
  }
  if (!canStartChallenge(profile)) {
    throw new Error('No lives left. Wait for refill.');
  }
  const puzzle = await loadPuzzlePrivate(levelId);
  const session = await createSessionState({
    userId,
    postId,
    levelId,
    mode,
    prefilledIndices: puzzle.prefilledIndices,
  });
  return {
    ok: true,
    session,
    heartsRemaining: heartsRemaining(session),
  };
};

export const purchaseDailyRetryForLevel = async (params: {
  levelId: string;
  mode: 'daily' | 'endless';
}) => {
  const userId = assertUserId();
  const postId = assertPostId();
  if (params.mode !== 'daily') {
    throw new Error('Paid retries are only available for daily challenges.');
  }
  const [
    profile,
    inventory,
    completed,
    failedLevel,
    retryCount,
    activeSession,
    puzzle,
  ] = await Promise.all([
    getUserProfile(userId),
    getInventory(userId),
    getCompletedLevels(userId),
    hasFailedLevel(userId, params.levelId),
    getDailyRetryCount(userId, params.levelId),
    getSessionState(userId, postId),
    loadPuzzlePrivate(params.levelId),
  ]);

  if (completed.has(params.levelId)) {
    throw new Error('Daily challenge already completed.');
  }
  if (!failedLevel) {
    throw new Error('Daily retry is only available after a failed daily.');
  }
  if (
    activeSession &&
    activeSession.activeLevelId === params.levelId &&
    activeSession.mode === 'daily'
  ) {
    const retryState = buildDailyRetryState({
      mode: 'daily',
      retryCount,
      requiresPaidRetry: false,
      difficulty: puzzle.difficulty,
    });
    return {
      ok: true,
      session: activeSession,
      heartsRemaining: heartsRemaining(activeSession),
      profile,
      inventory,
      ...retryState,
    };
  }
  if (!canStartChallenge(profile)) {
    throw new Error('No lives left. Wait for refill.');
  }

  const profileKey = keyUserProfile(userId);
  const retryCountsKey = keyUserDailyRetryCounts(userId);

  for (let attempt = 0; attempt < maxOptimisticRetries; attempt += 1) {
    const tx = await redis.watch(profileKey, retryCountsKey);
    const currentCoins = parseNumber(await redis.hGet(profileKey, 'coins'), 0);
    const currentRetryCount = parseNumber(
      await redis.hGet(retryCountsKey, params.levelId),
      0
    );
    const retryState = buildDailyRetryState({
      mode: 'daily',
      retryCount: currentRetryCount,
      requiresPaidRetry: true,
      difficulty: puzzle.difficulty,
    });
    const currentRetryCost = retryState.nextRetryCost;

    if (currentCoins < currentRetryCost) {
      await tx.unwatch();
      throw new Error('Not enough coins for daily retry.');
    }

    await tx.multi();
    await tx.hIncrBy(profileKey, 'coins', -currentRetryCost);
    await tx.hIncrBy(retryCountsKey, params.levelId, 1);
    const execResult = await tx.exec();
    if (!transactionCommitted(execResult)) {
      continue;
    }

    await updateQuestProgressOnCoinSpend({
      userId,
      amount: currentRetryCost,
    });

    const session = await createSessionState({
      userId,
      postId,
      levelId: params.levelId,
      mode: 'daily',
      prefilledIndices: puzzle.prefilledIndices,
    });
    const [updatedProfile, nextRetryCount] = await Promise.all([
      getUserProfile(userId),
      getDailyRetryCount(userId, params.levelId),
    ]);
    const nextRetryState = buildDailyRetryState({
      mode: 'daily',
      retryCount: nextRetryCount,
      requiresPaidRetry: false,
      difficulty: puzzle.difficulty,
    });

    return {
      ok: true,
      session,
      heartsRemaining: heartsRemaining(session),
      profile: updatedProfile,
      inventory,
      ...nextRetryState,
    };
  }

  throw new Error('Daily retry purchase conflicted. Please try again.');
};

export const submitGuessForSession = async (params: {
  levelId: string;
  tileIndex: number;
  guessedLetter: string;
}) => {
  const userId = assertUserId();
  const postId = assertPostId();
  const puzzle = await loadPuzzlePrivate(params.levelId);
  const session = await getSessionState(userId, postId);
  if (!session) {
    throw new Error('Session missing. Start a session first.');
  }
  if (session.activeLevelId !== params.levelId) {
    throw new Error('Session level mismatch.');
  }
  const isFirstGuess = session.guessCount === 0;

  const guessedLetter = params.guessedLetter.toUpperCase();
  const revealedSet = new Set(session.revealedIndices);
  const beforePadlockStatus = checkPadlockStatus(puzzle, revealedSet);
  const beforeRemainingKeys = remainingKeysByChain(puzzle, revealedSet);
  if (tileIsLocked(puzzle, params.tileIndex, revealedSet)) {
    return {
      ok: true,
      isCorrect: false,
      errorCode: 'TILE_LOCKED' as const,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      heartsRemaining: heartsRemaining(session),
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    };
  }

  const now = Date.now();
  const sessionWithActivity = withTrackedSessionActivity(session, now);
  let nextSession = {
    ...sessionWithActivity,
    startTimestamp:
      session.guessCount === 0 ? now : sessionWithActivity.startTimestamp,
    guessCount: session.guessCount + 1,
  };

  const revealResult = revealFromGuess({
    puzzle,
    session: nextSession,
    tileIndex: params.tileIndex,
    guessedLetter,
  });

  let shieldConsumed = false;
  if (revealResult.isCorrect) {
    nextSession = addRevealedIndices(
      nextSession,
      revealResult.revealedTiles.map((tile) => tile.index)
    );
  } else if (nextSession.shieldIsActive) {
    nextSession = {
      ...nextSession,
      shieldIsActive: false,
    };
    shieldConsumed = true;
  } else {
    nextSession = {
      ...nextSession,
      mistakesMade: nextSession.mistakesMade + 1,
      wrongGuesses: nextSession.wrongGuesses + 1,
    };
  }

  await saveSessionState(userId, postId, nextSession);
  if (isFirstGuess) {
    try {
      const profile = await getUserProfile(userId);
      const playedProfile: UserProfile = {
        ...profile,
        dailyChallengesPlayed:
          profile.dailyChallengesPlayed + (session.mode === 'daily' ? 1 : 0),
        endlessChallengesPlayed:
          profile.endlessChallengesPlayed + (session.mode === 'endless' ? 1 : 0),
      };
      await Promise.all([
        recordLevelPlay(params.levelId, userId),
        recordQualifiedLevelPlay(params.levelId, userId),
        saveUserProfile(userId, playedProfile),
      ]);
    } catch (error) {
      console.error(
        `submitGuessForSession first-guess telemetry failed userId=${userId} levelId=${params.levelId} error=${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const complete = puzzleIsComplete(puzzle, nextSession);
  const remaining = heartsRemaining(nextSession);
  const isGameOver = !complete && remaining <= 0;
  if (isGameOver) {
    const profileBeforeFailure = await getUserProfile(userId);
    let nextProfile = consumeHeartOnFailure(profileBeforeFailure);
    if (session.mode === 'daily') {
      nextProfile = {
        ...nextProfile,
        dailyCurrentStreak: 0,
      };
    } else {
      nextProfile = {
        ...nextProfile,
        endlessCurrentStreak: 0,
      };
    }
    nextProfile = {
      ...nextProfile,
      currentStreak: recomputeLegacyCurrentStreak(nextProfile),
    };
    if (
      nextProfile.hearts !== profileBeforeFailure.hearts ||
      nextProfile.lastHeartRefillTs !== profileBeforeFailure.lastHeartRefillTs ||
      nextProfile.currentStreak !== profileBeforeFailure.currentStreak ||
      nextProfile.dailyCurrentStreak !== profileBeforeFailure.dailyCurrentStreak ||
      nextProfile.endlessCurrentStreak !== profileBeforeFailure.endlessCurrentStreak
    ) {
      await saveUserProfile(userId, nextProfile);
    }
    await markLevelFailed(userId, params.levelId);
    await clearSessionState(userId, postId);
  }
  const afterPadlockStatus = checkPadlockStatus(
    puzzle,
    new Set(nextSession.revealedIndices)
  );
  const newlyUnlockedChainIds = getNewlyUnlockedChainIds({
    beforeUnlockedChainIds: beforePadlockStatus.unlockedChainIdSet,
    afterUnlockedChainIds: afterPadlockStatus.unlockedChainIds,
  });
  const afterRemainingKeys = remainingKeysByChain(
    puzzle,
    new Set(nextSession.revealedIndices)
  );
  const lockProgressChanged = hasLockProgressChanged(
    beforeRemainingKeys,
    afterRemainingKeys
  );
  const legacyReveal = deriveLegacyRevealFields(revealResult.revealedTiles);

  return {
    ok: true,
    isCorrect: revealResult.isCorrect,
    errorCode: null,
    revealedTiles: revealResult.revealedTiles,
    revealedIndices: legacyReveal.revealedIndices,
    revealedLetter: legacyReveal.revealedLetter,
    newlyUnlockedChainIds,
    lockProgressChanged,
    heartsRemaining: remaining,
    shieldConsumed,
    isLevelComplete: complete,
    isGameOver,
  };
};

export const submitGuessesForSession = async (params: {
  levelId: string;
  guesses: { tileIndex: number; guessedLetter: string }[];
}) => {
  const results = [];
  for (const guess of params.guesses) {
    const result = await submitGuessForSession({
      levelId: params.levelId,
      tileIndex: guess.tileIndex,
      guessedLetter: guess.guessedLetter,
    });
    results.push(result);
    if (result.isGameOver || result.isLevelComplete) {
      break;
    }
  }
  return {
    ok: true,
    results,
  };
};

export const completeSessionForLevel = async (params: {
  levelId: string;
  mode: 'daily' | 'endless';
}) => {
  const userId = assertUserId();
  const postId = assertPostId();
  const [session, puzzle, profile, inventory] = await Promise.all([
    getSessionState(userId, postId),
    loadPuzzlePrivate(params.levelId),
    getUserProfile(userId),
    getInventory(userId),
  ]);

  if (!session) {
    const journal = await redis.hGetAll(
      keyCompletionFinalizeJournal(userId, params.levelId)
    );
    if (
      journal['step:finalized'] === '1' ||
      journal['step:clear_session'] === '1'
    ) {
      return {
        ok: true,
        accepted: false,
        solveSeconds: 0,
        score: 0,
        rewardCoins: 0,
        mistakes: 0,
        usedPowerups: 0,
        retryCount: 0,
        retryScoreFactor: 1,
        isRecoveryRun: false,
        isCurrentDaily: false,
        rewardNotice: null,
        profile,
        inventory,
      };
    }
    throw new Error('Session missing.');
  }
  if (session.mode !== params.mode) {
    throw new Error('Session mode mismatch.');
  }
  const trackedSession = withTrackedSessionActivity(session, Date.now());
  const activeSolveSeconds = Math.max(
    0,
    Math.floor(trackedSession.activeMs / 1000)
  );
  const fallbackWallClockSolveSeconds = Math.max(
    0,
    Math.floor((Date.now() - trackedSession.startTimestamp) / 1000)
  );
  
  // HYBRID TIME TRACKING: Use active time when reasonable, wall clock time otherwise
  // Implement sanity checks for time values to detect network issues or long pauses
  // Use active time when reasonable (> 0 and < wallClockTime * 2), wall clock time otherwise
  const isActiveTimeReasonable = activeSolveSeconds > 0 && 
    activeSolveSeconds <= fallbackWallClockSolveSeconds * 2;
  
  const solveSeconds = isActiveTimeReasonable 
    ? activeSolveSeconds 
    : fallbackWallClockSolveSeconds;
  const currentDateKey = formatDateKey(new Date());
  const dailyRetryCount =
    params.mode === 'daily'
      ? await getDailyRetryCount(userId, params.levelId)
      : 0;
  const retryScoreFactor = getDailyRetryScoreFactor(dailyRetryCount);
  const isRecoveryRun = params.mode === 'daily' && dailyRetryCount > 0;
  const isCurrentDaily =
    params.mode === 'daily' ? puzzle.dateKey === currentDateKey : false;
  if (solveSeconds < minSolveSeconds) {
    await clearSessionState(userId, postId);
    return {
      ok: true,
      accepted: false,
      solveSeconds,
      score: 0,
      rewardCoins: 0,
      mistakes: trackedSession.mistakesMade,
      usedPowerups: trackedSession.usedPowerups,
      retryCount: dailyRetryCount,
      retryScoreFactor,
      isRecoveryRun,
      isCurrentDaily,
      rewardNotice: null,
      profile,
      inventory,
    };
  }

  const completionLockKey = keyCompletionFinalizeLock(userId, params.levelId);
  const lockToken = completionLockToken();
  const lockAcquired = await redis.set(completionLockKey, lockToken, {
    nx: true,
    expiration: completionLockExpiration(),
  });
  if (!lockAcquired) {
    return {
      ok: true,
      accepted: false,
      solveSeconds,
      score: 0,
      rewardCoins: 0,
      mistakes: trackedSession.mistakesMade,
      usedPowerups: trackedSession.usedPowerups,
      retryCount: dailyRetryCount,
      retryScoreFactor,
      isRecoveryRun,
      isCurrentDaily,
      rewardNotice: null,
      profile,
      inventory,
    };
  }

  // ATOMIC COMPLETION PROCESSING: Validate puzzle completion AFTER lock acquisition
  // This prevents race conditions where multiple requests can pass validation simultaneously
  if (!puzzleIsComplete(puzzle, session)) {
    // Release lock and return early if validation fails after lock acquisition
    const activeToken = await redis.get(completionLockKey);
    if (activeToken === lockToken) {
      await redis.del(completionLockKey);
    }
    throw new Error('Puzzle is not complete.');
  }

  try {
    const completionJournalKey = keyCompletionFinalizeJournal(userId, params.levelId);
    const completionJournalTtlSeconds = 14 * 24 * 60 * 60;
    const journal = await redis.hGetAll(completionJournalKey);
    const journalExists = Object.keys(journal).length > 0;
    const stepField = (step: string) => `step:${step}`;
    const hasStep = (step: string): boolean => journal[stepField(step)] === '1';

    const completionRecorded = await redis.hGet(
      keyUserCompleted(userId),
      params.levelId
    );
    if (completionRecorded && (!journalExists || hasStep('finalized'))) {
      await clearSessionState(userId, postId);
      return {
        ok: true,
        accepted: false,
        solveSeconds,
        score: 0,
        rewardCoins: 0,
        mistakes: trackedSession.mistakesMade,
        usedPowerups: trackedSession.usedPowerups,
        retryCount: dailyRetryCount,
        retryScoreFactor,
        isRecoveryRun,
        isCurrentDaily,
        rewardNotice: null,
        profile,
        inventory,
      };
    }
    if (!journalExists) {
      await redis.hSet(completionJournalKey, {
        levelId: params.levelId,
        mode: params.mode,
        createdAt: `${Date.now()}`,
      });
      await redis.expire(completionJournalKey, completionJournalTtlSeconds);
    }
    const markStep = async (step: string): Promise<void> => {
      journal[stepField(step)] = '1';
      await redis.hSet(completionJournalKey, {
        [stepField(step)]: '1',
        updatedAt: `${Date.now()}`,
      });
      await redis.expire(completionJournalKey, completionJournalTtlSeconds);
    };
    const runCompletionStep = async (
      step: string,
      action: () => Promise<void>
    ): Promise<void> => {
      if (hasStep(step)) {
        return;
      }
      await action();
      await markStep(step);
    };

    let rewardCoins = defaultCoinsReward;
    if (trackedSession.mistakesMade === 0) {
      rewardCoins += flawlessBonusCoins;
    }
    
    const fastSolveBonus = getFastSolveBonus(
      solveSeconds,
      defaultCoinsReward,
      puzzle.difficulty
    );
    rewardCoins += fastSolveBonus;
    
    if (params.mode === 'daily' && !isCurrentDaily) {
      rewardCoins = 0;
    }

    const baseScore = computeScore({
      solveSeconds,
      mistakes: trackedSession.mistakesMade,
      usedPowerups: trackedSession.usedPowerups,
    });
    const score =
      params.mode === 'daily'
        ? applyDailyRetryPenalty(baseScore, dailyRetryCount)
        : baseScore;
    const priorFailure = await hasFailedLevel(userId, params.levelId);

    const nextProfile = updateProfileOnCompletion({
      profile,
      puzzle,
      mode: params.mode,
      solveSeconds,
      mistakes: trackedSession.mistakesMade,
      rewardCoins,
      currentDateKey,
      hadPriorFailure: priorFailure,
      isCurrentDaily,
      isRecoveryRun,
    });
    await runCompletionStep('mark_level_completed', async () => {
      await markLevelCompleted(userId, params.levelId);
      // Increment cursor for endless mode progression
      if (params.mode === 'endless') {
        await incrementUserEndlessCursor(userId);
      }
    });
    await runCompletionStep('save_inventory', async () => {
      await saveInventory(userId, inventory);
    });
    if (params.mode === 'daily') {
      await runCompletionStep('record_daily_score', async () => {
        await recordDailyScore({
          dateKey: puzzle.dateKey,
          userId,
          score,
          solveSeconds,
          mistakes: trackedSession.mistakesMade,
          usedPowerups: trackedSession.usedPowerups,
        });
      });
    }
    const hasMeaningfulInteraction = trackedSession.guessCount >= 1;
    if (hasMeaningfulInteraction) {
      await runCompletionStep('record_level_win', async () => {
        await recordLevelWin(params.levelId, userId);
      });
    }
    if (trackedSession.usedPowerups <= 1 && hasMeaningfulInteraction) {
      await runCompletionStep('record_qualified_win', async () => {
        await recordQualifiedLevelWin(params.levelId, userId);
      });
    }
    if (params.mode === 'endless') {
      await runCompletionStep('record_all_time_level_score', async () => {
        await recordAllTimeLevelScore({
          userId,
          levelId: params.levelId,
          solveScore: score,
        });
      });
    }
    if (puzzle.isLogical) {
      await runCompletionStep('increment_all_time_logic', async () => {
        await incrementAllTimeLogic(userId, 1);
      });
    }
    const rankDateKey = puzzle.dateKey;
    const rankSummary = await getUserRankSummary({
      userId,
      dateKey: rankDateKey,
    });
    const updatedBestRank =
      rankSummary.currentRank === null
        ? nextProfile.bestOverallRank
        : nextProfile.bestOverallRank === 0
          ? rankSummary.currentRank
          : Math.min(nextProfile.bestOverallRank, rankSummary.currentRank);
    const profileWithBestRank: UserProfile = {
      ...nextProfile,
      bestOverallRank: updatedBestRank,
    };
    await runCompletionStep('save_profile', async () => {
      await saveUserProfile(userId, profileWithBestRank);
    });
    await runCompletionStep('update_quests', async () => {
      await updateQuestProgressOnCompletion({
        userId,
        dateKey: currentDateKey,
        solvedWords: puzzle.words.length,
        solveSeconds,
        mistakes: trackedSession.mistakesMade,
        usedPowerups: trackedSession.usedPowerups,
        isLogical: puzzle.isLogical,
        mode: params.mode,
        isCurrentDaily,
        isRecoveryRun,
      });
    });
    await runCompletionStep('save_receipt', async () => {
      await saveShareCompletionReceipt({
        userId,
        levelId: params.levelId,
        dateKey: puzzle.dateKey,
        solveSeconds,
        mistakes: trackedSession.mistakesMade,
        heartsRemaining: heartsRemaining(trackedSession),
        usedPowerups: trackedSession.usedPowerups,
        score,
      });
    });
    await runCompletionStep('clear_session', async () => {
      await clearSessionState(userId, postId);
    });
    await markStep('finalized');

    const rewardNotice =
      params.mode === 'daily' && !isCurrentDaily
        ? ''
        : isRecoveryRun
          ? 'Recovery clear complete. Retry penalty applied to your score.'
          : null;

    return {
      ok: true,
      accepted: true,
      solveSeconds,
      score,
      rewardCoins,
      mistakes: trackedSession.mistakesMade,
      usedPowerups: trackedSession.usedPowerups,
      retryCount: dailyRetryCount,
      retryScoreFactor,
      isRecoveryRun,
      isCurrentDaily,
      rewardNotice,
      profile: profileWithBestRank,
      inventory,
    };
  } finally {
    const activeToken = await redis.get(completionLockKey);
    if (activeToken === lockToken) {
      await redis.del(completionLockKey);
    }
  }
};

export const heartbeatSessionForLevel = async (params: {
  levelId: string;
  mode: 'daily' | 'endless';
}) => {
  const userId = assertUserId();
  const postId = assertPostId();
  const session = await getSessionState(userId, postId);
  if (!session) {
    return { ok: false };
  }
  if (
    session.activeLevelId !== params.levelId ||
    session.mode !== params.mode
  ) {
    return { ok: false };
  }
  const nextSession = withTrackedSessionActivity(session, Date.now());
  await saveSessionTimingState(userId, postId, {
    activeMs: nextSession.activeMs,
    lastSeenAt: nextSession.lastSeenAt,
  });
  return { ok: true };
};

export const usePowerupForSession = async (params: {
  levelId: string;
  itemType: PowerupType;
  targetIndex?: number | null;
  userId?: string;
  postId?: string;
}) => {
  const userId = params.userId ?? assertUserId();
  const postId = params.postId ?? assertPostId();
  const [puzzle, existingSession, profile, inventory] = await Promise.all([
    loadPuzzlePrivate(params.levelId),
    getSessionState(userId, postId),
    getUserProfile(userId),
    getInventory(userId),
  ]);
  if (!existingSession) {
    return {
      success: false,
      reason: 'Session missing. Start a session first.',
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      profile,
      inventory,
      session: {
        activeLevelId: params.levelId,
        mode: 'daily',
        startTimestamp: Date.now(),
        activeMs: 0,
        lastSeenAt: 0,
        mistakesMade: 0,
        shieldIsActive: false,
        revealedIndices: puzzle.prefilledIndices,
        usedPowerups: 0,
        wrongGuesses: 0,
        guessCount: 0,
      },
    };
  }
  if (existingSession.activeLevelId !== params.levelId) {
    return {
      success: false,
      reason: 'Session level mismatch.',
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      profile,
      inventory,
      session: existingSession,
    };
  }
  const failPowerup = (reason: string, errorCode: 'TILE_LOCKED' | 'INVALID_TARGET' | null) => ({
    success: false,
    reason,
    errorCode,
    revealedTiles: [],
    revealedIndices: [],
    revealedLetter: null,
    newlyUnlockedChainIds: [],
    lockProgressChanged: false,
    profile,
    inventory,
    session: existingSession,
  });
  const existingRevealedSet = new Set(existingSession.revealedIndices);
  const beforePadlockStatus = checkPadlockStatus(puzzle, existingRevealedSet);
  const beforeRemainingKeys = remainingKeysByChain(puzzle, existingRevealedSet);
  const now = Date.now();
  const trackedSession = withTrackedSessionActivity(existingSession, now);

  let revealedTiles: RevealedTile[] = [];
  let failureReason: string | null = null;
  let errorCode: 'TILE_LOCKED' | 'INVALID_TARGET' | null = null;
  let activateShield = false;

  if (params.itemType === 'shield') {
    if (existingSession.shieldIsActive) {
      failureReason = 'Shield is already active.';
    } else {
      activateShield = true;
    }
  } else if (params.itemType === 'hammer') {
    if (params.targetIndex === null || params.targetIndex === undefined) {
      return failPowerup('Hammer requires target tile index.', 'INVALID_TARGET');
    }
    const targetTile = puzzle.tiles[params.targetIndex];
    if (!targetTile || !targetTile.isLetter) {
      failureReason = 'Hammer target is invalid.';
      errorCode = 'INVALID_TARGET';
    } else if (existingRevealedSet.has(params.targetIndex)) {
      failureReason = 'Hammer target is invalid.';
      errorCode = 'INVALID_TARGET';
    } else if (tileIsLocked(puzzle, params.targetIndex, existingRevealedSet)) {
      failureReason = 'Cannot Hammer Locked Tiles.';
      errorCode = 'TILE_LOCKED';
    }
    if (failureReason) {
      return failPowerup(failureReason, errorCode);
    }
  } else if (params.itemType === 'wand') {
    if (params.targetIndex === null || params.targetIndex === undefined) {
      return failPowerup('Wand requires a target word.', 'INVALID_TARGET');
    }
    const targetTile = puzzle.tiles[params.targetIndex];
    if (!targetTile || !targetTile.isLetter) {
      failureReason = 'Select an unlocked word with missing letters.';
      errorCode = 'INVALID_TARGET';
    } else {
      const unlockedWords = getUnlockedWordIndices(puzzle, existingRevealedSet);
      if (!unlockedWords.has(targetTile.wordIndex)) {
        failureReason = 'Select an unlocked word with missing letters.';
        errorCode = 'INVALID_TARGET';
      } else {
        const blindIndexSet = new Set(puzzle.blindIndices);
        const hasMissingLetter = puzzle.tiles.some(
          (tile) =>
            tile.isLetter &&
            tile.wordIndex === targetTile.wordIndex &&
            !existingRevealedSet.has(tile.index) &&
            !blindIndexSet.has(tile.index)
        );
        if (!hasMissingLetter) {
          failureReason = 'Select an unlocked word with missing letters.';
          errorCode = 'INVALID_TARGET';
        }
      }
    }
  } else if (params.itemType === 'rocket') {
    const hasUnlockedCandidates = puzzle.tiles.some(
      (tile) =>
        tile.isLetter &&
        !existingRevealedSet.has(tile.index) &&
        !tileIsLocked(puzzle, tile.index, existingRevealedSet)
    );
    if (!hasUnlockedCandidates) {
      failureReason = 'No unlocked tiles available for Rocket.';
    }
  }

  if (failureReason) {
    return failPowerup(failureReason, errorCode);
  }

  const consume = await consumePowerup({
    userId,
    itemType: params.itemType,
  });
  if (!consume.success) {
    return {
      success: false,
      reason: consume.reason,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      profile: consume.profile,
      inventory: consume.inventory,
      session: existingSession,
    };
  }

  if (params.itemType === 'hammer' && params.targetIndex !== null && params.targetIndex !== undefined) {
    revealedTiles = applyHammer(puzzle, trackedSession, params.targetIndex).revealedTiles;
  } else if (params.itemType === 'wand' && params.targetIndex !== null && params.targetIndex !== undefined) {
    revealedTiles = applyWand(puzzle, trackedSession, params.targetIndex).revealedTiles;
  } else if (params.itemType === 'rocket') {
    revealedTiles = applyRocket(puzzle, trackedSession).revealedTiles;
  }

  let nextSession = trackedSession;
  if (activateShield) {
    nextSession = {
      ...nextSession,
      shieldIsActive: true,
    };
  }
  if (revealedTiles.length > 0) {
    nextSession = addRevealedIndices(
      nextSession,
      revealedTiles.map((tile) => tile.index)
    );
  }
  nextSession = {
    ...nextSession,
    startTimestamp:
      existingSession.guessCount === 0 && existingSession.usedPowerups === 0
        ? now
        : nextSession.startTimestamp,
    usedPowerups: existingSession.usedPowerups + 1,
  };
  const afterPadlockStatus = checkPadlockStatus(
    puzzle,
    new Set(nextSession.revealedIndices)
  );
  const newlyUnlockedChainIds = getNewlyUnlockedChainIds({
    beforeUnlockedChainIds: beforePadlockStatus.unlockedChainIdSet,
    afterUnlockedChainIds: afterPadlockStatus.unlockedChainIds,
  });
  const afterRemainingKeys = remainingKeysByChain(
    puzzle,
    new Set(nextSession.revealedIndices)
  );
  const lockProgressChanged = hasLockProgressChanged(
    beforeRemainingKeys,
    afterRemainingKeys
  );
  const legacyReveal = deriveLegacyRevealFields(revealedTiles);

  await saveSessionState(userId, postId, nextSession);
  return {
    success: true,
    reason: null,
    errorCode: null,
    revealedTiles,
    revealedIndices: legacyReveal.revealedIndices,
    revealedLetter: legacyReveal.revealedLetter,
    newlyUnlockedChainIds,
    lockProgressChanged,
    profile: consume.profile,
    inventory: consume.inventory,
    session: nextSession,
  };
};

export const getCurrentPuzzleView = async (params: {
  levelId: string;
  revealedIndices?: number[];
}) => {
  const puzzle = await loadPuzzlePrivate(params.levelId);

  const userId = context.userId;
  const postId = context.postId;
  if (!userId || !postId) {
    return buildPublicPuzzle(puzzle, [], []);
  }
  const session = await getSessionState(userId, postId);
  if (!session || session.activeLevelId !== params.levelId) {
    return buildPublicPuzzle(puzzle, [], []);
  }
  return buildPublicPuzzle(
    puzzle,
    session.revealedIndices,
    session.revealedIndices
  );
};

export const trackShareQuest = async (params: {
  levelId: string;
  dateKey: string;
}) => {
  const userId = assertUserId();
  await updateQuestProgressOnShare({
    userId,
    dateKey: params.dateKey,
  });
};

export const getRuntimeHeartsPerRun = () => heartsPerRun;
