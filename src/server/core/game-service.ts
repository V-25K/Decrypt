import { context, redis } from '@devvit/web/server';
import type {
  PowerupType,
  GameInlineStatusResponse,
  GamePreviewResponse,
  ChallengeType,
  EndlessSort,
  PuzzlePrivate,
  RevealedTile,
  SessionState,
  UserProfile,
} from '../../shared/game';
import { buildPublicPuzzle } from './puzzle';
import {
  getAllLevelIds,
  getDailyPointer,
  getPuzzlePrivate,
  getPuzzlePublic,
  isPuzzleRemovedFromPlay,
  isPuzzlePublishedVisible,
} from './puzzle-store';
import {
  getCompletedLevels,
  getDailyRetryCount,
  getFailedLevels,
  getInventory,
  getUserProfile,
  hasContinuedLevel,
  hasFailedLevel,
  incrementUserEndlessCursor,
  markLevelContinued,
  markLevelCompleted,
  markLevelFailed,
  registerKnownUser,
  saveInventory,
  saveUserProfile,
  unmarkLevelFailed,
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
  earnsFlawlessCoinBonus,
  getDailyRetryScoreFactor,
  minSolveSeconds,
  sessionInactivityThresholdMs,
} from './constants';
import { getDailyRetryQuote } from '../../shared/game-balance';
import {
	  computeScore,
	  getRatingOutcomeReceipt,
	  getUserRankSummary,
	  incrementAllTimeLogic,
	  recordAllTimeLevelScore,
	  recordDailyScore,
	  recordGlobalLoss,
	  recordGlobalWin,
	} from './leaderboard';
import {
  getLevelEngagement,
  recordQualifiedLevelFailure,
  recordQualifiedLevelPlay,
  recordQualifiedLevelWin,
  recordLevelPlay,
  recordLevelWin,
  touchQualifiedLevelPlay,
} from './engagement';
import {
  autoClaimMissedDailyRewards,
  updateQuestProgressOnCompletion,
  updateQuestProgressOnCoinSpend,
  updateQuestProgressOnShare,
} from './quests';
import { consumePowerup } from './economy';
import { z } from 'zod';
import { canStartChallenge, consumeHeartOnFailure } from './hearts';
import {
  saveShareCompletionReceipt,
} from './share-receipts';
import { getEndlessCatalogStatus, getNextEndlessCatalogLevelId } from './endless-catalog';
import { hasAdminAccess } from './admin-auth';
import {
  getCommunityLevelAuthorId,
  getCommunityNotificationSummary,
  recordCommunityEndlessCompletion,
} from './community';
import { syncCommunityFlair } from './community-flair';
import { formatDateKey } from './serde';
import {
  keyCompletionFinalizeJournal,
  keyCompletionFinalizeLock,
  keyUserCompleted,
  keyUserDailyRetryCounts,
  keyUserEndlessRewardCount,
  keyUserProfile,
} from './keys';
import { recordShadowDifficultyOutcomeSafely } from './difficulty-shadow-rating';
import { applyEndlessRewardTaper } from '../../shared/economy';

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
  previewTitle: z.string().min(1).max(80).optional(),
  creatorUsername: z.string().min(1).optional(),
  creatorAvatarUrl: z.string().min(1).optional(),
});

type PostData = z.infer<typeof postDataSchema>;

const getPostData = (): PostData | null => {
  const parsed = postDataSchema.safeParse(context.postData ?? {});
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
};

const getPostLevelId = (): string | null => {
  const postData = getPostData();
  return postData?.levelId ?? null;
};

import { parseNumber, transactionCommitted } from './redis-util';

const maxOptimisticRetries = 3;

const completionLockTtlMs = 120_000;

const continueScorePenalty = 50;
const minimumCompletionScore = 1;

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

const assertPublishedPuzzleVisibility = async (levelId: string): Promise<void> => {
  const publishedVisible = await isPuzzlePublishedVisible(levelId);
  if (!publishedVisible) {
    throw new Error('Puzzle is unavailable.');
  }
};

const assertPuzzlePlayable = async (levelId: string): Promise<void> => {
  if (await isPuzzleRemovedFromPlay(levelId)) {
    throw new Error('Puzzle is unavailable.');
  }
};

const recomputeLegacyCurrentStreak = (profile: UserProfile): number =>
  Math.max(profile.dailyCurrentStreak, profile.endlessCurrentStreak);

const officialDailySources = new Set(['AUTO_DAILY', 'MANUAL_INJECTED']);

const isOfficialDailyPuzzle = (params: {
  puzzle: PuzzlePrivate;
  currentDateKey: string;
  dailyPointer: string | null;
}): boolean =>
  params.currentDateKey.trim().length > 0 &&
  params.dailyPointer === params.puzzle.levelId &&
  officialDailySources.has(params.puzzle.source);

const isGlobalEligiblePuzzle = (params: {
  puzzle: PuzzlePrivate;
  officialDaily: boolean;
}): boolean => {
  if (params.puzzle.source === 'MANUAL_INJECTED') {
    return params.officialDaily;
  }
  return (
    params.puzzle.source === 'AUTO_DAILY' ||
    params.puzzle.source === 'AUTO_ENDLESS' ||
    params.puzzle.source === 'COMMUNITY'
  );
};

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
    const todayDateKey = formatDateKey(new Date());
    // Claim any daily rewards the player completed but never claimed before the
    // date rolled over, so they aren't silently lost. Runs before the profile
    // fetch below so the returned coins/inventory already include the grants.
    const autoClaimedDailyRewards = await autoClaimMissedDailyRewards(
      userId,
      todayDateKey
    );
    const [profile, inventory, dailyPointer, isModerator] = await Promise.all([
      getUserProfile(userId),
      getInventory(userId),
      getDailyPointer(),
      hasAdminAccess({
        subredditName: context.subredditName,
        username: context.username,
      }),
    ]);
    const [endlessCatalog, communityNotifications] = await Promise.all([
      getEndlessCatalogStatus(),
      getCommunityNotificationSummary({ userId, isModerator }),
    ]);

    // Keep the player's subreddit flair (equipped flair + global rank) current.
    // Best-effort and deduped — never block or fail bootstrap on a flair sync.
    void (async () => {
      try {
        const { globalRank } = await getUserRankSummary({ userId, dateKey: todayDateKey });
        await syncCommunityFlair({
          subredditName: context.subredditName,
          username: context.username,
          flair: profile.activeFlair,
          globalRank,
          userId,
        });
      } catch {
        // Flair is cosmetic; swallow (e.g. flair disabled on the subreddit).
      }
    })();

	    return {
      userId,
      username: context.username ?? null,
      subredditName: context.subredditName ?? null,
      postId: context.postId ?? null,
      currentDailyLevelId: dailyPointer,
      todayDateKey,
      profile,
	      inventory,
	      endlessCatalog,
	      isModerator,
      communityNotifications,
      autoClaimedDailyRewards: {
        coins: autoClaimedDailyRewards.rewardCoins,
        questIds: autoClaimedDailyRewards.autoClaimedQuestIds,
      },
		};
};

const getNextDailyArchiveLevelId = async (
  userId: string,
  excludeLevelId: string | null
): Promise<string | null> => {
  const [allLevelIds, completed, failed] = await Promise.all([
    getAllLevelIds(),
    getCompletedLevels(userId),
    getFailedLevels(userId),
  ]);
  const anchorPuzzle = excludeLevelId
    ? await getPuzzlePrivate(excludeLevelId)
    : null;
  const anchorCreatedAt = anchorPuzzle?.createdAt ?? null;
  const candidates: Array<{ levelId: string; createdAt: number }> = [];
  for (const levelId of allLevelIds) {
    if (levelId === excludeLevelId || completed.has(levelId) || failed.has(levelId)) {
      continue;
    }
    const puzzle = await getPuzzlePrivate(levelId);
    if (!puzzle || puzzle.source !== 'AUTO_DAILY') {
      continue;
    }
    if (!(await isPuzzlePublishedVisible(levelId))) {
      continue;
    }
    if (anchorCreatedAt !== null && puzzle.createdAt >= anchorCreatedAt) {
      continue;
    }
    candidates.push({ levelId, createdAt: puzzle.createdAt });
  }
  candidates.sort((left, right) => right.createdAt - left.createdAt);
  return candidates[0]?.levelId ?? null;
};

export const loadLevelForUser = async (params: {
  mode: 'daily' | 'endless';
  requestedLevelId?: string | null;
  dailyArchive?: boolean;
  excludeLevelId?: string | null;
  ignorePostLevel?: boolean;
  categoryFilter?: ChallengeType | null;
  endlessSort?: EndlessSort;
}) => {
  const userId = assertUserId();

  let levelId: string | null = null;
  if (params.mode === 'daily') {
    const postLevelId = params.ignorePostLevel ? null : getPostLevelId();
    const isLoadingPostLevel =
      Boolean(postLevelId) && !params.requestedLevelId && !params.dailyArchive;
    if (params.requestedLevelId) {
      levelId = params.requestedLevelId;
    } else if (params.dailyArchive) {
      levelId = await getNextDailyArchiveLevelId(
        userId,
        params.excludeLevelId ?? null
      );
      if (!levelId) {
        throw new Error("You're all caught up.");
      }
    } else if (postLevelId) {
      levelId = postLevelId;
    } else {
      levelId = await getDailyPointer();
    }
    if (isLoadingPostLevel) {
      console.log('[loadLevelForUser] Loaded daily level from post data', {
        levelId,
        postLevelId,
      });
    }
  } else if (params.requestedLevelId) {
    levelId = params.requestedLevelId;
  } else {
    const profile = await getUserProfile(userId);
    const selection = await getNextEndlessCatalogLevelId(
      userId,
      params.categoryFilter ?? null,
      params.endlessSort ?? 'random',
      profile.globalRating
    );
    levelId = selection.levelId;
    if (!levelId && selection.reason === 'all_completed') {
      throw new Error("You're all caught up.");
    }
    if (!levelId && params.categoryFilter) {
      throw new Error('No Endless challenges are available for that category yet.');
    }
  }

  if (!levelId) {
    if (params.mode === 'endless') {
      throw new Error('Endless catalog unavailable.');
    }
    throw new Error('No level available.');
  }

  if (params.mode === 'daily') {
    await assertPublishedPuzzleVisibility(levelId);
  }
  await assertPuzzlePlayable(levelId);

  const puzzlePublic = await getPuzzlePublic(levelId);
  if (!puzzlePublic) {
    console.error('[loadLevelForUser] Puzzle data not found in Redis', {
      levelId,
      mode: params.mode,
    });
    throw new Error('Public puzzle payload not found.');
  }
  
  // For daily mode and completion checks, we still need getCompletedLevels
  const completed = params.mode === 'daily' || params.requestedLevelId
    ? await getCompletedLevels(userId)
    : new Set<string>();
  
  const postId = context.postId ?? null;
  const [challengeMetrics, failedLevel, retryCount, activeSession, ownChallengeAuthorId] =
    await Promise.all([
      getLevelEngagement(levelId),
      params.mode === 'daily' ? hasFailedLevel(userId, levelId) : Promise.resolve(false),
      params.mode === 'daily'
        ? getDailyRetryCount(userId, levelId)
        : Promise.resolve(0),
      postId ? getSessionState(userId, postId) : Promise.resolve(null),
      getCommunityLevelAuthorId(levelId),
    ]);
  const isOwnChallenge = Boolean(
    ownChallengeAuthorId && ownChallengeAuthorId === userId
  );
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
        activeSession.mode === 'daily' &&
        heartsRemaining(activeSession) > 0
      ),
    difficulty: puzzlePublic.difficulty,
  });

  return {
    mode: params.mode,
    levelId,
    puzzle: puzzlePublic,
    alreadyCompleted: completed.has(levelId),
    isOwnChallenge,
    ...retryState,
    challengeMetrics,
  };
};

export const getDailyPreview = async (): Promise<GamePreviewResponse> => {
  const postData = getPostData();
  const levelId = postData?.levelId ?? (await getDailyPointer());
  if (!levelId) {
    throw new Error('No level available.');
  }

  await assertPublishedPuzzleVisibility(levelId);
  const [puzzlePublic, challengeMetrics] = await Promise.all([
    getPuzzlePublic(levelId),
    getLevelEngagement(levelId),
  ]);

  if (!puzzlePublic) {
    console.error('[getDailyPreview] Puzzle data not found in Redis', {
      levelId,
    });
    throw new Error('Public puzzle payload not found.');
  }

  return {
    mode: 'daily',
    levelId,
    previewTitle: postData?.previewTitle ?? 'Can you decrypt this?',
    puzzle: puzzlePublic,
    challengeMetrics,
    creator: {
      username: postData?.creatorUsername ?? null,
      avatarUrl: postData?.creatorAvatarUrl ?? null,
    },
  };
};

export const getDailyInlineStatus = async (): Promise<GameInlineStatusResponse> => {
  const postData = getPostData();
  const levelId = postData?.levelId ?? (await getDailyPointer());
  if (!levelId) {
	    return {
	      levelId: null,
	      completed: false,
	      failed: false,
      removed: false,
	    };
  }
  if (await isPuzzleRemovedFromPlay(levelId)) {
    return {
      levelId,
      completed: false,
      failed: false,
      removed: true,
    };
  }
  const userId = context.userId ?? null;
  if (!userId) {
	    return {
	      levelId,
	      completed: false,
	      failed: false,
      removed: false,
	    };
  }
  const [completedLevels, failedLevel] = await Promise.all([
    getCompletedLevels(userId),
    hasFailedLevel(userId, levelId),
  ]);
	  return {
	    levelId,
	    completed: completedLevels.has(levelId),
	    failed: failedLevel && !completedLevels.has(levelId),
    removed: false,
	  };
};

export const startSessionForLevel = async (
  levelId: string,
  mode: 'daily' | 'endless'
) => {
  const userId = assertUserId();
  const postId = assertPostId();
  await assertPuzzlePlayable(levelId);
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
  const [completed, failedLevel] = await Promise.all([
    getCompletedLevels(userId),
    hasFailedLevel(userId, levelId),
  ]);
  if (mode === 'daily' && completed.has(levelId)) {
    throw new Error('Daily challenge already completed.');
  }
  if (failedLevel) {
    throw new Error('Challenge already failed.');
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

export const continueSessionForLevel = async (params: {
  levelId: string;
  mode: 'daily' | 'endless';
}) => {
  const userId = assertUserId();
  const postId = assertPostId();
  const [session, profile, inventory] = await Promise.all([
    getSessionState(userId, postId),
    getUserProfile(userId),
    getInventory(userId),
  ]);

  if (!session || session.activeLevelId !== params.levelId) {
    throw new Error('Session missing.');
  }
  if (session.mode !== params.mode) {
    throw new Error('Session mode mismatch.');
  }
  if (heartsRemaining(session) > 0) {
    throw new Error('Continue is only available after all mistakes are used.');
  }
  if (!canStartChallenge(profile)) {
    throw new Error('No lives left. Wait for refill.');
  }

  const now = Date.now();
  const nextProfile = consumeHeartOnFailure(profile, now);
  const continuedSession = withTrackedSessionActivity(
    {
      ...session,
      mistakesMade: 0,
      wrongGuesses: 0,
      shieldIsActive: false,
    },
    now
  );

	  await Promise.all([
	    saveUserProfile(userId, nextProfile),
	    saveSessionState(userId, postId, continuedSession),
	    markLevelContinued(userId, params.levelId),
	    unmarkLevelFailed(userId, params.levelId),
	  ]);

  return {
    ok: true,
    session: continuedSession,
    heartsRemaining: heartsRemaining(continuedSession),
    profile: nextProfile,
    inventory,
  };
};

export const submitGuessForSession = async (params: {
  levelId: string;
  tileIndex: number;
  guessedLetter: string;
}) => {
  const userId = assertUserId();
  const postId = assertPostId();
  await assertPuzzlePlayable(params.levelId);
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
      sessionStartTimestamp:
        session.guessCount > 0 || session.usedPowerups > 0 || session.mistakesMade > 0
          ? session.startTimestamp
          : null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      heartsRemaining: heartsRemaining(session),
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
      ratingDelta: null,
      ratingAfter: null,
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

  const targetTile = puzzle.tiles[params.tileIndex];
  const guessedLetterMatchesTile = Boolean(
    targetTile && targetTile.isLetter && targetTile.char === guessedLetter
  );
  let shieldConsumed = false;
  if (revealResult.isCorrect) {
    nextSession = addRevealedIndices(
      nextSession,
      revealResult.revealedTiles.map((tile) => tile.index)
    );
  } else if (guessedLetterMatchesTile) {
    // The guessed letter is correct for this tile, but nothing new was revealed
    // — typically a fast repeat of a letter that an earlier guess already filled
    // in (the same letter can occupy several blanks and all resolve at once).
    // A correct letter must never cost a heart or burn a shield, so treat this
    // as a benign no-op rather than a mistake.
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
        recordQualifiedLevelPlay(
          params.levelId,
          userId,
          nextSession.lastSeenAt || Date.now()
        ),
        saveUserProfile(userId, playedProfile),
      ]);
    } catch (error) {
      console.error(
        `submitGuessForSession first-guess telemetry failed userId=${userId} levelId=${params.levelId} error=${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    try {
      await touchQualifiedLevelPlay(
        params.levelId,
        userId,
        nextSession.lastSeenAt || Date.now()
      );
    } catch (error) {
      console.error(
        `submitGuessForSession telemetry touch failed userId=${userId} levelId=${params.levelId} error=${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const complete = puzzleIsComplete(puzzle, nextSession);
  const remaining = heartsRemaining(nextSession);
  const isGameOver = !complete && remaining <= 0;
  let ratingDelta: number | null = null;
  let ratingAfter: number | null = null;
		  if (isGameOver) {
	    const retryCountForTelemetry =
	      session.mode === 'daily' ? await getDailyRetryCount(userId, params.levelId) : 0;
	    const profileBeforeFailure = await getUserProfile(userId);
	    const currentDateKey = formatDateKey(new Date());
	    const dailyPointer =
	      session.mode === 'daily' || puzzle.source === 'MANUAL_INJECTED'
	        ? await getDailyPointer()
	        : null;
	    const officialDaily = isOfficialDailyPuzzle({
	      puzzle,
	      currentDateKey,
	      dailyPointer,
	    });
	    const globalEligible = isGlobalEligiblePuzzle({
	      puzzle,
	      officialDaily,
	    });
	    let nextProfile: UserProfile;
	    if (session.mode === 'daily') {
	      nextProfile = {
	        ...profileBeforeFailure,
	        dailyCurrentStreak: 0,
      };
    } else {
      nextProfile = {
        ...profileBeforeFailure,
        endlessCurrentStreak: 0,
      };
    }
	    nextProfile = {
	      ...nextProfile,
	      currentStreak: recomputeLegacyCurrentStreak(nextProfile),
	      globalWinStreak: 0,
	    };
		    if (globalEligible) {
		      const ratingOutcome = await recordGlobalLoss({
		        userId,
		        levelId: params.levelId,
		        profile: nextProfile,
		        puzzle,
		      });
		      nextProfile = ratingOutcome.profile;
		      ratingDelta = ratingOutcome.ratingDelta;
		      ratingAfter = ratingOutcome.ratingAfter;
		    }
	    await saveUserProfile(userId, nextProfile);
	    await Promise.all([
	      markLevelFailed(userId, params.levelId),
	      nextSession.guessCount >= 1
	        ? recordQualifiedLevelFailure(params.levelId, userId, {
	            mistakes: nextSession.mistakesMade,
	            usedPowerups: nextSession.usedPowerups,
	            retryCount: retryCountForTelemetry,
	            targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
	          })
	        : Promise.resolve(),
	      nextSession.guessCount >= 1
	        ? recordShadowDifficultyOutcomeSafely({
	            userId,
	            levelId: params.levelId,
	            puzzle,
	            outcome: 'failure',
	            mistakes: nextSession.mistakesMade,
	            usedPowerups: nextSession.usedPowerups,
	            retryCount: retryCountForTelemetry,
	            targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
	          })
	        : Promise.resolve(),
	    ]);
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
    sessionStartTimestamp: nextSession.startTimestamp,
    revealedTiles: revealResult.revealedTiles,
    revealedIndices: legacyReveal.revealedIndices,
    revealedLetter: legacyReveal.revealedLetter,
    newlyUnlockedChainIds,
    lockProgressChanged,
    heartsRemaining: remaining,
    shieldConsumed,
    isLevelComplete: complete,
    isGameOver,
    ratingDelta,
    ratingAfter,
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
  await assertPuzzlePlayable(params.levelId);
  const [session, puzzle, profile, inventory, ownChallengeAuthorId] =
    await Promise.all([
      getSessionState(userId, postId),
      loadPuzzlePrivate(params.levelId),
      getUserProfile(userId),
      getInventory(userId),
      getCommunityLevelAuthorId(params.levelId),
    ]);

  // Loophole guard: a creator can never earn coins, points, or ELO on their
  // own challenge. Reject the completion before any reward path runs, no matter
  // what the client sends.
  if (ownChallengeAuthorId && ownChallengeAuthorId === userId) {
    await clearSessionState(userId, postId);
    return {
      ok: true,
      accepted: false,
      solveSeconds: 0,
      score: 0,
      rewardCoins: 0,
      mistakes: session?.mistakesMade ?? 0,
      usedPowerups: session?.usedPowerups ?? 0,
      retryCount: 0,
      retryScoreFactor: 1,
      isRecoveryRun: false,
      isCurrentDaily: false,
      rewardNotice: null,
      profile,
      inventory,
    };
  }

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
	  const dailyPointer =
	    params.mode === 'daily' || puzzle.source === 'MANUAL_INJECTED'
	      ? await getDailyPointer()
	      : null;
	  const dailyRetryCount =
	    params.mode === 'daily'
	      ? await getDailyRetryCount(userId, params.levelId)
	      : 0;
	  const retryScoreFactor = getDailyRetryScoreFactor(dailyRetryCount);
	  const isRecoveryRun = params.mode === 'daily' && dailyRetryCount > 0;
	  const isCurrentDaily =
	    params.mode === 'daily'
	      ? isOfficialDailyPuzzle({
	          puzzle,
	          currentDateKey,
	          dailyPointer,
	        })
	      : false;
	  const globalEligible = isGlobalEligiblePuzzle({
	    puzzle,
	    officialDaily: isCurrentDaily,
	  });
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
    const isRepeatEndlessCompletion =
      params.mode === 'endless' && Boolean(completionRecorded);
    const hasMeaningfulInteraction = trackedSession.guessCount >= 1;
    if (isRepeatEndlessCompletion) {
      await recordCommunityEndlessCompletion({
        userId,
        levelId: params.levelId,
        meaningful: hasMeaningfulInteraction,
      });
      await clearSessionState(userId, postId);
      return {
        ok: true,
        accepted: true,
        solveSeconds,
        score: 0,
        rewardCoins: 0,
        mistakes: trackedSession.mistakesMade,
        usedPowerups: trackedSession.usedPowerups,
        retryCount: dailyRetryCount,
        retryScoreFactor,
        isRecoveryRun,
        isCurrentDaily,
        rewardNotice: 'Replay complete. Rewards are only paid on the first clear.',
        profile,
        inventory,
      };
    }
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

	    const [priorFailure, continuedLevel] = await Promise.all([
	      hasFailedLevel(userId, params.levelId),
	      hasContinuedLevel(userId, params.levelId),
	    ]);
	    let rewardCoins = defaultCoinsReward;
	    if (
	      earnsFlawlessCoinBonus({
	        mistakes: trackedSession.mistakesMade,
	        usedPowerups: trackedSession.usedPowerups,
	        continued: continuedLevel,
	      })
	    ) {
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

    // Endless taper: full rewards for the first clears of the day, smaller
    // bonuses after — keeps endless rewarding without infinite coin farming.
    let endlessRewardTapered = false;
    if (params.mode === 'endless') {
      const rewardedRaw = await redis.get(
        keyUserEndlessRewardCount(userId, currentDateKey)
      );
      const rewardedToday = rewardedRaw ? Number(rewardedRaw) || 0 : 0;
      const taper = applyEndlessRewardTaper(rewardCoins, rewardedToday);
      rewardCoins = taper.coins;
      endlessRewardTapered = taper.tapered;
    }

    const baseScore = computeScore({
      solveSeconds,
      mistakes: trackedSession.mistakesMade,
      usedPowerups: trackedSession.usedPowerups,
    });
	    const scoreBeforeContinuePenalty =
	      params.mode === 'daily'
	        ? applyDailyRetryPenalty(baseScore, dailyRetryCount)
	        : baseScore;
	    const score = Math.max(
	      minimumCompletionScore,
	      scoreBeforeContinuePenalty - (continuedLevel ? continueScorePenalty : 0)
	    );

	    let nextProfile = updateProfileOnCompletion({
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
        await recordCommunityEndlessCompletion({
          userId,
          levelId: params.levelId,
          meaningful: trackedSession.guessCount >= 1,
        });
      }
    });
    if (params.mode === 'endless') {
      // Journaled so a completion replay never double-counts the taper.
      await runCompletionStep('count_endless_reward', async () => {
        const counterKey = keyUserEndlessRewardCount(userId, currentDateKey);
        await redis.incrBy(counterKey, 1);
        await redis.expire(counterKey, 2 * 24 * 60 * 60);
      });
    }
    await runCompletionStep('save_inventory', async () => {
      await saveInventory(userId, inventory);
    });
	    if (isCurrentDaily) {
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
    if (hasMeaningfulInteraction) {
      await runCompletionStep('record_level_win', async () => {
        await recordLevelWin(params.levelId, userId);
      });
    }
    if (hasMeaningfulInteraction) {
      await runCompletionStep('record_qualified_win', async () => {
        await recordQualifiedLevelWin(params.levelId, userId, {
          solveSeconds,
          mistakes: trackedSession.mistakesMade,
          usedPowerups: trackedSession.usedPowerups,
          retryCount: dailyRetryCount,
          targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
        });
      });
    }
    if (hasMeaningfulInteraction) {
      await runCompletionStep('record_shadow_difficulty_win', async () => {
        await recordShadowDifficultyOutcomeSafely({
          userId,
          levelId: params.levelId,
          puzzle,
          outcome: 'win',
          solveSeconds,
          mistakes: trackedSession.mistakesMade,
          usedPowerups: trackedSession.usedPowerups,
          retryCount: dailyRetryCount,
          targetTimeSeconds: puzzle.targetTimeSeconds ?? null,
        });
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
	    let ratingDelta = 0;
	    let ratingAfter = nextProfile.globalRating;
	    let globalScoreAfter = nextProfile.globalScore;
	    const hydrateJournaledGlobalWin = async (): Promise<void> => {
	      const receipt = await getRatingOutcomeReceipt(
	        userId,
	        `win:${params.levelId}`
	      );
	      if (
	        !receipt ||
	        typeof receipt.ratingGamesAfter !== 'number' ||
	        nextProfile.ratingGames >= receipt.ratingGamesAfter
	      ) {
	        return;
	      }
	      nextProfile = {
	        ...nextProfile,
	        globalRating: receipt.ratingAfter,
	        globalScore:
	          typeof receipt.globalScoreAfter === 'number' &&
	          nextProfile.globalScore < receipt.globalScoreAfter
	            ? receipt.globalScoreAfter
	            : nextProfile.globalScore,
	        ratingGames: receipt.ratingGamesAfter,
	        ratingWins:
	          typeof receipt.ratingWinsAfter === 'number'
	            ? receipt.ratingWinsAfter
	            : nextProfile.ratingWins,
	        ratingLosses:
	          typeof receipt.ratingLossesAfter === 'number'
	            ? receipt.ratingLossesAfter
	            : nextProfile.ratingLosses,
	        globalWinStreak:
	          typeof receipt.globalWinStreakAfter === 'number'
	            ? receipt.globalWinStreakAfter
	            : nextProfile.globalWinStreak,
	      };
	      ratingDelta = receipt.ratingDelta;
	      ratingAfter = receipt.ratingAfter;
	      globalScoreAfter = nextProfile.globalScore;
	    };
	    if (globalEligible) {
	      if (hasStep('record_global_win')) {
	        await hydrateJournaledGlobalWin();
	      }
	      await runCompletionStep('record_global_win', async () => {
	        const ratingOutcome = await recordGlobalWin({
	          userId,
	          levelId: params.levelId,
	          solveScore: score,
	          profile: nextProfile,
	          puzzle,
	          solveSeconds,
	          mistakes: trackedSession.mistakesMade,
	          usedPowerups: trackedSession.usedPowerups,
	          isRecoveryRun,
	        });
	        nextProfile = ratingOutcome.profile;
	        ratingDelta = ratingOutcome.ratingDelta;
	        ratingAfter = ratingOutcome.ratingAfter;
	        globalScoreAfter = ratingOutcome.profile.globalScore;
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
	    const updatedBestGlobalRank =
	      rankSummary.globalRank === null
	        ? nextProfile.bestGlobalRank
	        : nextProfile.bestGlobalRank === 0
	          ? rankSummary.globalRank
	          : Math.min(nextProfile.bestGlobalRank, rankSummary.globalRank);
	    const profileWithBestRank: UserProfile = {
	      ...nextProfile,
	      bestOverallRank: updatedBestRank,
	      bestGlobalRank: updatedBestGlobalRank,
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
	        ratingDelta,
	        ratingAfter,
	        globalScoreAfter,
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
          : endlessRewardTapered
            ? 'You’ve earned today’s full endless rewards — smaller bonuses until tomorrow.'
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
      ratingDelta,
      ratingAfter,
      globalScoreAfter,
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
  if (session.guessCount > 0) {
    try {
      await touchQualifiedLevelPlay(params.levelId, userId, nextSession.lastSeenAt);
    } catch (error) {
      console.error(
        `heartbeatSessionForLevel telemetry touch failed userId=${userId} levelId=${params.levelId} error=${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
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
  await assertPublishedPuzzleVisibility(params.levelId);
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

