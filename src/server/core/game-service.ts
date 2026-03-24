import { context } from '@devvit/web/server';
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
  getOldestUnplayedLevelId,
  getPuzzlePrivate,
  getPuzzlePublic,
} from './puzzle-store';
import {
  getCompletedLevels,
  getInventory,
  getUserProfile,
  hasFailedLevel,
  markLevelCompleted,
  markLevelFailed,
  registerKnownUser,
  saveInventory,
  saveUserProfile,
} from './state';
import { clearSessionState, createSessionState, getSessionState, heartsRemaining, saveSessionState } from './session';
import {
  applyHammer,
  applyRocket,
  applyWand,
  checkPadlockStatus,
  puzzleIsComplete,
  revealFromGuess,
  tileIsLocked,
} from './gameplay';
import {
  defaultCoinsReward,
  fastSolveBonusCoins,
  fastSolveSeconds,
  flawlessBonusCoins,
  heartsPerRun,
  minSolveSeconds,
} from './constants';
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
  updateQuestProgressOnShare,
} from './quests';
import { consumePowerup } from './economy';
import { z } from 'zod';
import { canStartChallenge, consumeHeartOnFailure } from './hearts';
import { saveShareCompletionReceipt } from './share-receipts';
import { formatDateKey } from './serde';

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


const loadPuzzlePrivate = async (levelId: string): Promise<PuzzlePrivate> => {
  const puzzle = await getPuzzlePrivate(levelId);
  if (!puzzle) {
    throw new Error(`Puzzle not found: ${levelId}`);
  }
  return puzzle;
};

const recomputeLegacyCurrentStreak = (profile: UserProfile): number =>
  Math.max(profile.dailyCurrentStreak, profile.endlessCurrentStreak);

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

export const updateProfileOnCompletion = (params: {
  profile: UserProfile;
  puzzle: PuzzlePrivate;
  mode: 'daily' | 'endless';
  solveSeconds: number;
  mistakes: number;
  rewardCoins: number;
  dateKey: string;
  hadPriorFailure: boolean;
}): UserProfile => {
  const today = params.dateKey;
  let dailyStreak = params.profile.dailyCurrentStreak;
  if (params.profile.lastPlayedDateKey === today) {
    dailyStreak = params.profile.dailyCurrentStreak;
  } else if (params.profile.lastPlayedDateKey) {
    dailyStreak = params.profile.dailyCurrentStreak + 1;
  } else {
    dailyStreak = 1;
  }
  const endlessStreak =
    params.mode === 'endless' ? params.profile.endlessCurrentStreak + 1 : params.profile.endlessCurrentStreak;

  const wordsSolved = params.puzzle.words.length;
  const nextProfile: UserProfile = {
    ...params.profile,
    coins: params.profile.coins + params.rewardCoins,
    currentStreak: params.profile.currentStreak,
    dailyCurrentStreak:
      params.mode === 'daily' ? dailyStreak : params.profile.dailyCurrentStreak,
    endlessCurrentStreak: endlessStreak,
    lastPlayedDateKey: today,
    totalWordsSolved: params.profile.totalWordsSolved + wordsSolved,
    logicTasksCompleted:
      params.profile.logicTasksCompleted + (params.puzzle.isLogical ? 1 : 0),
    totalLevelsCompleted: params.profile.totalLevelsCompleted + 1,
    flawlessWins: params.profile.flawlessWins + (params.mistakes === 0 ? 1 : 0),
    speedWins:
      params.profile.speedWins + (params.solveSeconds <= fastSolveSeconds ? 1 : 0),
    dailyFlawlessWins:
      params.profile.dailyFlawlessWins +
      (params.mode === 'daily' && params.mistakes === 0 ? 1 : 0),
    endlessFlawlessWins:
      params.profile.endlessFlawlessWins +
      (params.mode === 'endless' && params.mistakes === 0 ? 1 : 0),
    dailySpeedWins:
      params.profile.dailySpeedWins +
      (params.mode === 'daily' && params.solveSeconds <= fastSolveSeconds ? 1 : 0),
    endlessSpeedWins:
      params.profile.endlessSpeedWins +
      (params.mode === 'endless' && params.solveSeconds <= fastSolveSeconds ? 1 : 0),
    dailyFirstTryWins:
      params.profile.dailyFirstTryWins +
      (params.mode === 'daily' && !params.hadPriorFailure ? 1 : 0),
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

  return {
    userId,
    username: context.username ?? null,
    postId: context.postId ?? null,
    currentDailyLevelId: dailyPointer,
    todayDateKey: new Date().toISOString().slice(0, 10),
    profile,
    inventory,
  };
};

export const loadLevelForUser = async (params: {
  mode: 'daily' | 'endless';
  requestedLevelId?: string | null;
}) => {
  const userId = assertUserId();
  const completed = await getCompletedLevels(userId);

  let levelId: string | null = null;
  if (params.mode === 'daily') {
    levelId =
      params.requestedLevelId ?? getPostLevelId() ?? (await getDailyPointer());
  } else if (params.requestedLevelId) {
    levelId = params.requestedLevelId;
  } else {
    levelId = await getOldestUnplayedLevelId(completed);
  }

  if (!levelId) {
    throw new Error('No level available.');
  }

  const puzzlePublic = await getPuzzlePublic(levelId);
  if (!puzzlePublic) {
    throw new Error('Public puzzle payload not found.');
  }
  const challengeMetrics = await getLevelEngagement(levelId);

  return {
    mode: params.mode,
    levelId,
    puzzle: puzzlePublic,
    alreadyCompleted: completed.has(levelId),
    challengeMetrics,
  };
};

export const startSessionForLevel = async (
  levelId: string,
  mode: 'daily' | 'endless'
) => {
  const userId = assertUserId();
  const postId = assertPostId();
  const profile = await getUserProfile(userId);
  if (mode === 'daily') {
    const completed = await getCompletedLevels(userId);
    if (completed.has(levelId)) {
      throw new Error('Daily challenge already completed.');
    }
  }
  if (!canStartChallenge(profile)) {
    throw new Error('No lives left. Wait for refill.');
  }
  const puzzle = await loadPuzzlePrivate(levelId);
  await recordLevelPlay(levelId, userId);
  const session = await createSessionState({
    userId,
    postId,
    levelId,
    mode,
    prefilledIndices: puzzle.prefilledIndices,
  });
  const playedProfile: UserProfile = {
    ...profile,
    dailyChallengesPlayed:
      profile.dailyChallengesPlayed + (mode === 'daily' ? 1 : 0),
    endlessChallengesPlayed:
      profile.endlessChallengesPlayed + (mode === 'endless' ? 1 : 0),
  };
  await saveUserProfile(userId, playedProfile);
  return {
    ok: true,
    session,
    heartsRemaining: heartsRemaining(session),
  };
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
  await recordQualifiedLevelPlay(params.levelId, userId);

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

  let nextSession = {
    ...session,
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
  const [session, puzzle, completed, profile, inventory] = await Promise.all([
    getSessionState(userId, postId),
    loadPuzzlePrivate(params.levelId),
    getCompletedLevels(userId),
    getUserProfile(userId),
    getInventory(userId),
  ]);

  if (!session) {
    throw new Error('Session missing.');
  }
  if (session.mode !== params.mode) {
    throw new Error('Session mode mismatch.');
  }
  if (!puzzleIsComplete(puzzle, session)) {
    throw new Error('Puzzle is not complete.');
  }

  const solveSeconds = Math.max(
    0,
    Math.floor((Date.now() - session.startTimestamp) / 1000)
  );
  if (solveSeconds < minSolveSeconds) {
    await clearSessionState(userId, postId);
    return {
      ok: true,
      accepted: false,
      solveSeconds,
      score: 0,
      rewardCoins: 0,
      mistakes: session.mistakesMade,
      usedPowerups: session.usedPowerups,
      profile,
      inventory,
    };
  }

  if (completed.has(params.levelId)) {
    await clearSessionState(userId, postId);
    return {
      ok: true,
      accepted: false,
      solveSeconds,
      score: 0,
      rewardCoins: 0,
      mistakes: session.mistakesMade,
      usedPowerups: session.usedPowerups,
      profile,
      inventory,
    };
  }

  let rewardCoins = defaultCoinsReward;
  if (session.mistakesMade === 0) {
    rewardCoins += flawlessBonusCoins;
  }
  if (solveSeconds <= fastSolveSeconds) {
    rewardCoins += fastSolveBonusCoins;
  }

  const score = computeScore({
    solveSeconds,
    mistakes: session.mistakesMade,
    usedPowerups: session.usedPowerups,
  });
  const priorFailure = await hasFailedLevel(userId, params.levelId);

  const nextProfile = updateProfileOnCompletion({
    profile,
    puzzle,
    mode: params.mode,
    solveSeconds,
    mistakes: session.mistakesMade,
    rewardCoins,
    dateKey: puzzle.dateKey,
    hadPriorFailure: priorFailure,
  });

  await markLevelCompleted(userId, params.levelId);
  await saveInventory(userId, inventory);
  if (params.mode === 'daily') {
    const todayDateKey = formatDateKey(new Date());
    await recordDailyScore({
      dateKey: todayDateKey,
      userId,
      score,
      solveSeconds,
      mistakes: session.mistakesMade,
      usedPowerups: session.usedPowerups,
    });
  }
  await recordLevelWin(params.levelId, userId);
  const hasMeaningfulInteraction = session.guessCount >= 1 || session.usedPowerups > 0;
  if (session.usedPowerups <= 1 && hasMeaningfulInteraction) {
    await recordQualifiedLevelWin(params.levelId, userId);
  }
  if (params.mode === 'endless') {
    await recordAllTimeLevelScore({
      userId,
      levelId: params.levelId,
      solveIndex: score,
    });
  }
  if (puzzle.isLogical) {
    await incrementAllTimeLogic(userId, 1);
  }
  const rankDateKey =
    params.mode === 'daily' ? formatDateKey(new Date()) : puzzle.dateKey;
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
  await saveUserProfile(userId, profileWithBestRank);
  await updateQuestProgressOnCompletion({
    userId,
    dateKey: puzzle.dateKey,
    solvedWords: puzzle.words.length,
    solveSeconds,
    mistakes: session.mistakesMade,
    usedPowerups: session.usedPowerups,
    isLogical: puzzle.isLogical,
    mode: params.mode,
  });
  await saveShareCompletionReceipt({
    userId,
    levelId: params.levelId,
    dateKey: puzzle.dateKey,
    solveSeconds,
    mistakes: session.mistakesMade,
    heartsRemaining: heartsRemaining(session),
    usedPowerups: session.usedPowerups,
    score,
  });
  await clearSessionState(userId, postId);

  return {
    ok: true,
    accepted: true,
    solveSeconds,
    score,
    rewardCoins,
    mistakes: session.mistakesMade,
    usedPowerups: session.usedPowerups,
    profile: profileWithBestRank,
    inventory,
  };
};

export const usePowerupForSession = async (params: {
  levelId: string;
  itemType: PowerupType;
  targetIndex?: number | null;
}) => {
  const userId = assertUserId();
  const postId = assertPostId();
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
  const existingRevealedSet = new Set(existingSession.revealedIndices);
  const beforePadlockStatus = checkPadlockStatus(puzzle, existingRevealedSet);
  const beforeRemainingKeys = remainingKeysByChain(puzzle, existingRevealedSet);
  let nextSession = existingSession;

  let revealedTiles: RevealedTile[] = [];
  let failureReason: string | null = null;
  let errorCode: 'TILE_LOCKED' | 'INVALID_TARGET' | null = null;

  if (params.itemType === 'shield') {
    if (existingSession.shieldIsActive) {
      failureReason = 'Shield is already active.';
    }
    nextSession = {
      ...nextSession,
      shieldIsActive: true,
    };
  } else if (params.itemType === 'hammer') {
    if (params.targetIndex === null || params.targetIndex === undefined) {
      return {
        success: false,
        reason: 'Hammer requires target tile index.',
        errorCode: 'INVALID_TARGET' as const,
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
      return {
        success: false,
        reason: failureReason,
        errorCode,
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
    const result = applyHammer(puzzle, nextSession, params.targetIndex);
    if (result.revealedTiles.length === 0) {
      failureReason = 'Hammer target is invalid.';
      errorCode = 'INVALID_TARGET';
    }
    revealedTiles = result.revealedTiles;
    nextSession = addRevealedIndices(
      nextSession,
      revealedTiles.map((tile) => tile.index)
    );
  } else if (params.itemType === 'wand') {
    if (params.targetIndex === null || params.targetIndex === undefined) {
      return {
        success: false,
        reason: 'Wand requires a target word.',
        errorCode: 'INVALID_TARGET' as const,
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
    const result = applyWand(puzzle, nextSession, params.targetIndex);
    if (result.revealedTiles.length === 0) {
      failureReason = 'Select an unlocked word with missing letters.';
      errorCode = 'INVALID_TARGET';
    }
    revealedTiles = result.revealedTiles;
    nextSession = addRevealedIndices(
      nextSession,
      revealedTiles.map((tile) => tile.index)
    );
  } else if (params.itemType === 'rocket') {
    const result = applyRocket(puzzle, nextSession);
    if (result.revealedTiles.length === 0) {
      failureReason = 'No unlocked tiles available for Rocket.';
    }
    revealedTiles = result.revealedTiles;
    nextSession = addRevealedIndices(
      nextSession,
      revealedTiles.map((tile) => tile.index)
    );
  }

  if (failureReason) {
    return {
      success: false,
      reason: failureReason,
      errorCode,
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
  await recordQualifiedLevelPlay(params.levelId, userId);

  nextSession = {
    ...nextSession,
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
  if (params.revealedIndices && params.revealedIndices.length > 0) {
    return buildPublicPuzzle(puzzle, params.revealedIndices);
  }

  const userId = context.userId;
  const postId = context.postId;
  if (!userId || !postId) {
    return buildPublicPuzzle(puzzle, []);
  }
  const session = await getSessionState(userId, postId);
  if (!session || session.activeLevelId !== params.levelId) {
    return buildPublicPuzzle(puzzle, []);
  }
  return buildPublicPuzzle(puzzle, session.revealedIndices);
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
