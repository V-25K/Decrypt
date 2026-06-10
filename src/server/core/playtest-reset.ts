import { redis } from '@devvit/web/server';
import { aiChallengeTypePool } from './ai';
import {
  keyAllTimeLevelsLeaderboard,
  keyAllTimeLogicLeaderboard,
  keyAIPoolBucket,
  keyAIPoolCandidate,
  keyAIPoolCandidateSequence,
  keyAIPoolCandidateSignature,
  keyAIPoolDifficultyCursor,
  keyAIPoolFillLock,
  keyAIPoolReservedSignature,
  keyCompletionFinalizeJournal,
  keyCompletionFinalizeLock,
  keyChallengeEvaluation,
  keyChallengeEvaluationIndex,
  keyChallengeEvaluationPublishIndex,
  keyCommunityApprovalLock,
  keyCommunityCreatorStats,
  keyCommunityPendingSignatures,
  keyCommunityPuzzlePlays,
  keyCommunityRemovedLevels,
  keyCommunitySubmission,
  keyCommunitySubmissionsApproved,
  keyCommunitySubmissionsByAuthor,
  keyCommunitySubmissionsByLevel,
  keyCommunitySubmissionsPending,
  keyCommunitySubmissionsRejected,
  keyCommunitySubmissionsRemoved,
  keyDailyChallengeTypeCursor,
  keyDailyChallengeTypeSeed,
  keyDailyPostCreateLock,
  keyDailyPointer,
  keyDailyLeaderboard,
  keyDailyLeaderboardStats,
  keyDailyRankAwarded,
  keyDailyTierCursor,
  keyDifficultyCalibrationArtifact,
  keyDifficultyCalibrationV3Artifact,
  keyGenerationFailureLatest,
  keyGenerationFailureNotified,
  keyKnownUsersIndex,
  keyLevelIdCounter,
  keyLevelDifficultyRating,
  keyLevelPlayCount,
  keyLevelPlayers,
  keyLevelQualifiedPlayers,
  keyLevelQualifiedFailures,
  keyLevelQualifiedOutcomes,
  keyLevelQualifiedWins,
  keyLevelWinCount,
  keyLevelWinners,
  keyGlobalRatingLeaderboard,
  keyGlobalScoreLeaderboard,
  keyModeratorAccessCacheIndex,
  keyOrderGrantRecord,
  keyPaymentOrderIndex,
  keyPlayerDifficultyRating,
  keyProcessedOrder,
  keyPuzzleGenerationLock,
  keyPuzzleMapping,
  keyPuzzlePrivate,
  keyPuzzlePublic,
  keyPuzzlePublicationReceipt,
  keyPuzzlePublishedPost,
  keyPuzzlePublishLock,
  keyPuzzlesByDate,
  keyPuzzlesIndex,
  keyPublishedAutoDailyPuzzlesByDate,
  keyPublishedAutoDailyPuzzlesByDateInitialized,
  keySessionIndex,
  keyGrantedOrderSkus,
  keyRefundProcessedOrder,
  keyShareCompletionReceipt,
  keySharedLevels,
  keyShadowDifficultyUpdateFailures,
  keyUsedSignatureMeta,
  keyUsedSignatureRecent,
  keyUsedStrings,
  keyUserCoinHeartPurchases,
  keyUserCompleted,
  keyUserContinuedLevels,
  keyUserDailyDataDates,
  keyUserDailyRetryCounts,
  keyUserEndlessPlayed,
  keyUserEndlessCursor,
  keyUserEndlessLevelScores,
  keyUserFailedLevels,
  keyUserGlobalLevelScores,
  keyUserInventory,
  keyUserProfile,
  keyUserPurchases,
  keyUserQuestDaily,
  keyUserQuestLifetime,
  keyUserRatingOutcomes,
  keyUserShadowRatingOutcomes,
} from './keys';
import { getAllLevelIds, getPuzzlePrivate } from './puzzle-store';
import { formatDateKey } from './serde';
import { getIndexedSessionKeys } from './session';
import { getKnownUserIds, getTrackedUserDailyDataDates } from './state';

export type SubredditGameDataClearResult = {
  knownUsers: number;
  sessions: number;
  deletedKeys: number;
};

const aiPoolTiers = ['warmup', 'medium', 'hard', 'expert'] as const;

const deleteKeys = async (keys: Iterable<string>): Promise<number> => {
  const uniqueKeys = [...new Set([...keys].filter((key) => key.trim().length > 0))];
  await Promise.all(uniqueKeys.map(async (key) => await redis.del(key)));
  return uniqueKeys.length;
};

const aiPoolCandidateId = (sequence: number): string =>
  `pool_${`${sequence}`.padStart(8, '0')}`;

const membersFromSortedSet = async (key: string): Promise<string[]> =>
  (await redis.zRange(key, 0, -1, { by: 'rank' })).map((entry) => entry.member);

export const clearSubredditGameData = async (): Promise<SubredditGameDataClearResult> => {
  const [knownUsers, sessionKeys, levelIds, aiPoolSequenceRaw, paymentOrderIds, modCacheKeys] =
    await Promise.all([
      getKnownUserIds(),
      getIndexedSessionKeys(),
      getAllLevelIds(),
      redis.get(keyAIPoolCandidateSequence),
      redis.hKeys(keyPaymentOrderIndex),
      redis.hKeys(keyModeratorAccessCacheIndex),
    ]);
  const [
    communityPendingSubmissionIds,
    communityApprovedSubmissionIds,
    communityRejectedSubmissionIds,
    communityRemovedSubmissionIds,
    communitySubmissionsByLevel,
    communityRemovedLevels,
  ] = await Promise.all([
    membersFromSortedSet(keyCommunitySubmissionsPending),
    membersFromSortedSet(keyCommunitySubmissionsApproved),
    membersFromSortedSet(keyCommunitySubmissionsRejected),
    membersFromSortedSet(keyCommunitySubmissionsRemoved),
    redis.hGetAll(keyCommunitySubmissionsByLevel),
    redis.hGetAll(keyCommunityRemovedLevels),
  ]);
  const communitySubmissionIds = new Set([
    ...communityPendingSubmissionIds,
    ...communityApprovedSubmissionIds,
    ...communityRejectedSubmissionIds,
    ...communityRemovedSubmissionIds,
    ...Object.values(communitySubmissionsByLevel),
    ...Object.values(communityRemovedLevels),
  ]);
  for (const userId of knownUsers) {
    for (const submissionId of await membersFromSortedSet(keyCommunitySubmissionsByAuthor(userId))) {
      communitySubmissionIds.add(submissionId);
    }
  }
  const communityAuthorIds = new Set(knownUsers);
  const communityLevelIds = new Set<string>([
    ...Object.keys(communitySubmissionsByLevel),
    ...Object.keys(communityRemovedLevels),
  ]);
  for (const submissionId of communitySubmissionIds) {
    const hash = await redis.hGetAll(keyCommunitySubmission(submissionId));
    const authorId = hash.authorId?.trim();
    const levelId = hash.levelId?.trim();
    if (authorId) {
      communityAuthorIds.add(authorId);
    }
    if (levelId) {
      communityLevelIds.add(levelId);
    }
  }
  const currentDateKey = formatDateKey(new Date());
  let deletedKeys = 0;
  const dateKeys = new Set([currentDateKey]);
  const puzzleDateKeysByLevelId = new Map<string, string>();
  const allLevelIds = new Set([...levelIds, ...communityLevelIds]);

  for (const levelId of allLevelIds) {
    const puzzle = await getPuzzlePrivate(levelId);
    if (puzzle?.dateKey) {
      dateKeys.add(puzzle.dateKey);
      puzzleDateKeysByLevelId.set(levelId, puzzle.dateKey);
    }
  }

  for (const userId of knownUsers) {
    const [
      profileHash,
      completedLevelIds,
      failedLevelIds,
      retryLevelIds,
      continuedLevelIds,
      sharedLevelIds,
      trackedDailyDateKeys,
    ] = await Promise.all([
      redis.hGetAll(keyUserProfile(userId)),
      redis.hKeys(keyUserCompleted(userId)),
      redis.hKeys(keyUserFailedLevels(userId)),
      redis.hKeys(keyUserDailyRetryCounts(userId)),
      redis.hKeys(keyUserContinuedLevels(userId)),
      redis.hKeys(keySharedLevels(userId)),
      getTrackedUserDailyDataDates(userId),
    ]);

    const levelIds = new Set([
      ...completedLevelIds,
      ...failedLevelIds,
      ...retryLevelIds,
      ...continuedLevelIds,
      ...sharedLevelIds,
    ]);
    const userDateKeys = new Set([...dateKeys, ...trackedDailyDateKeys, currentDateKey]);
    const lastPlayedDateKey = profileHash.lastPlayedDateKey?.trim();
    if (lastPlayedDateKey) {
      userDateKeys.add(lastPlayedDateKey);
    }
    for (const levelId of levelIds) {
      const puzzleDateKey = puzzleDateKeysByLevelId.get(levelId);
      if (puzzleDateKey) {
        userDateKeys.add(puzzleDateKey);
      }
    }

    const userKeys = [
      keyUserProfile(userId),
      keyUserInventory(userId),
      keyUserPurchases(userId),
      keyUserCompleted(userId),
      keyUserFailedLevels(userId),
      keyUserContinuedLevels(userId),
      keyUserDailyRetryCounts(userId),
      keyUserQuestLifetime(userId),
      keyUserEndlessCursor(userId),
      keyUserEndlessLevelScores(userId),
      keyUserEndlessPlayed(userId),
      keyUserGlobalLevelScores(userId),
      keyUserRatingOutcomes(userId),
      keyUserShadowRatingOutcomes(userId),
      keyPlayerDifficultyRating(userId),
      keySharedLevels(userId),
      keyUserDailyDataDates(userId),
    ];
    for (const trackedDateKey of userDateKeys) {
      userKeys.push(keyUserQuestDaily(userId, trackedDateKey));
      userKeys.push(keyUserCoinHeartPurchases(userId, trackedDateKey));
    }
    for (const levelId of levelIds) {
      userKeys.push(keyShareCompletionReceipt(userId, levelId));
      userKeys.push(keyCompletionFinalizeLock(userId, levelId));
      userKeys.push(keyCompletionFinalizeJournal(userId, levelId));
    }

    deletedKeys += await deleteKeys(userKeys);
  }

  const puzzleKeys: string[] = [];
  for (const levelId of allLevelIds) {
    puzzleKeys.push(
      keyPuzzlePrivate(levelId),
      keyPuzzlePublic(levelId),
      keyPuzzleMapping(levelId),
      keyChallengeEvaluation(levelId),
      keyPuzzlePublicationReceipt(levelId),
      keyPuzzlePublishedPost(levelId),
      keyPuzzlePublishLock(levelId),
      keyLevelPlayers(levelId),
      keyLevelWinners(levelId),
      keyLevelPlayCount(levelId),
      keyLevelWinCount(levelId),
      keyLevelQualifiedPlayers(levelId),
      keyLevelQualifiedWins(levelId),
      keyLevelQualifiedFailures(levelId),
      keyLevelQualifiedOutcomes(levelId),
      keyLevelDifficultyRating(levelId),
      keyCommunityPuzzlePlays(levelId)
    );
  }
  deletedKeys += await deleteKeys(puzzleKeys);

  const communityKeys = [
    keyCommunitySubmissionsPending,
    keyCommunitySubmissionsApproved,
    keyCommunitySubmissionsRejected,
    keyCommunitySubmissionsRemoved,
    keyCommunitySubmissionsByLevel,
    keyCommunityRemovedLevels,
    keyCommunityPendingSignatures,
  ];
  for (const submissionId of communitySubmissionIds) {
    communityKeys.push(
      keyCommunitySubmission(submissionId),
      keyCommunityApprovalLock(submissionId)
    );
  }
  for (const authorId of communityAuthorIds) {
    communityKeys.push(
      keyCommunitySubmissionsByAuthor(authorId),
      keyCommunityCreatorStats(authorId)
    );
  }
  deletedKeys += await deleteKeys(communityKeys);

  const datedKeys: string[] = [];
  for (const dateKey of dateKeys) {
    datedKeys.push(
      keyPuzzlesByDate(dateKey),
      keyPublishedAutoDailyPuzzlesByDate(dateKey),
      keyPublishedAutoDailyPuzzlesByDateInitialized(dateKey),
      keyDailyTierCursor(dateKey),
      keyDailyChallengeTypeCursor(dateKey),
      keyDailyChallengeTypeSeed(dateKey),
      keyDailyLeaderboard(dateKey),
      keyDailyLeaderboardStats(dateKey),
      keyDailyRankAwarded(dateKey),
      keyGenerationFailureNotified(dateKey)
    );
  }
  deletedKeys += await deleteKeys(datedKeys);

  const aiPoolKeys: string[] = [];
  for (const tier of aiPoolTiers) {
    for (const challengeType of aiChallengeTypePool) {
      aiPoolKeys.push(
        keyAIPoolBucket(tier, challengeType),
        keyAIPoolDifficultyCursor(tier, challengeType)
      );
    }
  }
  const aiPoolSequence = Number(aiPoolSequenceRaw ?? '0');
  if (Number.isFinite(aiPoolSequence) && aiPoolSequence > 0) {
    for (let sequence = 1; sequence <= Math.floor(aiPoolSequence); sequence += 1) {
      const candidateId = aiPoolCandidateId(sequence);
      const signatureKey = keyAIPoolCandidateSignature(candidateId);
      const signature = await redis.get(signatureKey);
      aiPoolKeys.push(keyAIPoolCandidate(candidateId), signatureKey);
      if (signature) {
        aiPoolKeys.push(keyAIPoolReservedSignature(signature));
      }
    }
  }
  deletedKeys += await deleteKeys(aiPoolKeys);

  const paymentKeys: string[] = [];
  for (const orderId of paymentOrderIds) {
    paymentKeys.push(
      keyProcessedOrder(orderId),
      keyRefundProcessedOrder(orderId),
      keyGrantedOrderSkus(orderId),
      keyOrderGrantRecord(orderId)
    );
  }
  deletedKeys += await deleteKeys(paymentKeys);
  deletedKeys += await deleteKeys(modCacheKeys);

  deletedKeys += await deleteKeys([
    keyDailyPointer,
    keyDailyPostCreateLock,
    keyLevelIdCounter,
    keyPaymentOrderIndex,
    keyPuzzleGenerationLock,
    keyAIPoolCandidateSequence,
    keyAIPoolFillLock,
    keyPuzzlesIndex,
    keyUsedStrings,
    keyUsedSignatureMeta,
    keyUsedSignatureRecent,
    keyDifficultyCalibrationArtifact,
    keyDifficultyCalibrationV3Artifact,
    keyGenerationFailureLatest,
    keyChallengeEvaluationIndex,
    keyChallengeEvaluationPublishIndex,
    keyAllTimeLevelsLeaderboard,
    keyAllTimeLogicLeaderboard,
    keyGlobalRatingLeaderboard,
    keyGlobalScoreLeaderboard,
    keyShadowDifficultyUpdateFailures,
    keyModeratorAccessCacheIndex,
  ]);

  deletedKeys += await deleteKeys(sessionKeys);
  deletedKeys += await deleteKeys([keySessionIndex, keyKnownUsersIndex]);

  return {
    knownUsers: knownUsers.length,
    sessions: sessionKeys.length,
    deletedKeys,
  };
};
