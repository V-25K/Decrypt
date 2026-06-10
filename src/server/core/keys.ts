export const keyDailyPointer = 'decrypt:state:daily_pointer';
export const keyLevelIdCounter = 'decrypt:state:level_id_counter';
export const keyPuzzleGenerationLock = 'decrypt:state:puzzle_generation_lock';
export const keyAIPoolCandidateSequence = 'decrypt:state:ai_pool_candidate_sequence';
export const keyAIPoolFillLock = 'decrypt:state:ai_pool_fill_lock';
export const keyDailyTierCursor = (dateKey: string) =>
  `decrypt:state:daily_tier_cursor:${dateKey}`;
export const keyDailyChallengeTypeCursor = (dateKey: string) =>
  `decrypt:state:daily_challenge_type_cursor:${dateKey}`;
export const keyDailyChallengeTypeSeed = (dateKey: string) =>
  `decrypt:state:daily_challenge_type_seed:${dateKey}`;
export const keyAIPoolBucket = (tier: string, challengeType: string) =>
  `decrypt:ai_pool:${tier}:${challengeType}`;
export const keyAIPoolCandidate = (candidateId: string) =>
  `decrypt:ai_pool:candidate:${candidateId}`;
export const keyAIPoolCandidateSignature = (candidateId: string) =>
  `decrypt:ai_pool:candidate_signature:${candidateId}`;
export const keyAIPoolReservedSignature = (normalizedSignature: string) =>
  `decrypt:ai_pool:reserved_signature:${normalizedSignature}`;
export const keyAIPoolDifficultyCursor = (tier: string, challengeType: string) =>
  `decrypt:ai_pool:cursor:${tier}:${challengeType}`;
export const keyPuzzlePublishedPost = (levelId: string) =>
  `decrypt:puzzle:${levelId}:published_post`;
export const keyDailyPostCreateLock = 'decrypt:lock:daily_post_create';
export const keyPuzzleMapping = (levelId: string) =>
  `decrypt:puzzle:${levelId}:mapping`;
export const keyPuzzlePublicationReceipt = (levelId: string) =>
  `decrypt:puzzle:${levelId}:publication_receipt`;
export const keyPuzzlePublishLock = (levelId: string) =>
  `decrypt:puzzle:${levelId}:publish_lock`;
export const keyPuzzlesIndex = 'decrypt:puzzles:index';
export const keyPuzzlesByDate = (dateKey: string) =>
  `decrypt:puzzles:by_date:${dateKey}`;
export const keyPublishedAutoDailyPuzzlesByDate = (dateKey: string) =>
  `decrypt:puzzles:auto_daily_published:${dateKey}`;
export const keyPublishedAutoDailyPuzzlesByDateInitialized = (dateKey: string) =>
  `decrypt:puzzles:auto_daily_published_initialized:${dateKey}`;
export const keyUsedStrings = 'decrypt:history:used_strings';
export const keyUsedSignatureMeta = 'decrypt:history:used_signature_meta';
export const keyUsedSignatureRecent = 'decrypt:history:used_signature_recent';
export const keyDifficultyCalibrationArtifact =
  'decrypt:state:difficulty_calibration_artifact';
export const keyDifficultyCalibrationV3Artifact =
  'decrypt:state:difficulty_calibration_v3_artifact';
export const keyGenerationFailureLatest =
  'decrypt:state:generation_failure_latest';
export const keyGenerationFailureNotified = (dateKey: string) =>
  `decrypt:state:generation_failure_notified:${dateKey}`;

export const keyPuzzlePrivate = (levelId: string) =>
  `decrypt:puzzle:${levelId}:private`;

export const keyPuzzlePublic = (levelId: string) => `decrypt:puzzle:${levelId}:public`;

export const keyChallengeEvaluation = (levelId: string) =>
  `decrypt:challenge:${levelId}:evaluation`;

export const keyChallengeEvaluationIndex =
  'decrypt:challenge:evaluation:index';

export const keyChallengeEvaluationPublishIndex =
  'decrypt:challenge:evaluation:publish_index';

export const keyUserProfile = (userId: string) => `decrypt:user:${userId}:profile`;

export const keyPlayerDifficultyRating = (userId: string) =>
  `decrypt:user:${userId}:difficulty_rating`;

export const keyLevelDifficultyRating = (levelId: string) =>
  `decrypt:level:${levelId}:difficulty_rating`;

export const keyUserShadowRatingOutcomes = (userId: string) =>
  `decrypt:user:${userId}:shadow_rating_outcomes`;

export const keyShadowDifficultyUpdateFailures =
  'decrypt:metrics:shadow_update_failures';

export const keyUserInventory = (userId: string) =>
  `decrypt:user:${userId}:inventory`;

export const keyUserPurchases = (userId: string) =>
  `decrypt:user:${userId}:purchases`;

export const keyUserCompleted = (userId: string) =>
  `decrypt:user:${userId}:completed`;

export const keyUserEndlessLevelScores = (userId: string) =>
  `decrypt:user:${userId}:endless:level_scores`;

export const keyUserFailedLevels = (userId: string) =>
  `decrypt:user:${userId}:failed_levels`;

export const keyUserContinuedLevels = (userId: string) =>
  `decrypt:user:${userId}:continued_levels`;

export const keyUserDailyRetryCounts = (userId: string) =>
  `decrypt:user:${userId}:daily_retry_counts`;

export const keyCompletionFinalizeLock = (userId: string, levelId: string) =>
  `decrypt:user:${userId}:completion_lock:${levelId}`;

export const keyCompletionFinalizeJournal = (userId: string, levelId: string) =>
  `decrypt:user:${userId}:completion_journal:${levelId}`;

export const keyUserQuestDaily = (userId: string, dateKey: string) =>
  `decrypt:user:${userId}:quests:daily:${dateKey}`;

export const keyUserQuestLifetime = (userId: string) =>
  `decrypt:user:${userId}:quests:lifetime`;

export const keySession = (userId: string, postId: string) =>
  `decrypt:session:${userId}:${postId}`;

export const keyDailyLeaderboard = (dateKey: string) =>
  `decrypt:leaderboard:daily:${dateKey}`;

export const keyDailyLeaderboardStats = (dateKey: string) =>
  `decrypt:leaderboard:daily:${dateKey}:stats`;

export const keyDailyRankAwarded = (dateKey: string) =>
  `decrypt:leaderboard:daily:${dateKey}:awarded`;

export const keyAllTimeLevelsLeaderboard = 'decrypt:leaderboard:alltime:levels';

export const keyAllTimeLogicLeaderboard = 'decrypt:leaderboard:alltime:logic';

export const keyGlobalRatingLeaderboard = 'decrypt:leaderboard:global:rating';

export const keyGlobalScoreLeaderboard = 'decrypt:leaderboard:global:score';

export const keyUserGlobalLevelScores = (userId: string) =>
  `decrypt:user:${userId}:global:level_scores`;

export const keyUserRatingOutcomes = (userId: string) =>
  `decrypt:user:${userId}:rating_outcomes`;

export const keyLevelPlayers = (levelId: string) =>
  `decrypt:level:${levelId}:players`;

export const keyLevelWinners = (levelId: string) =>
  `decrypt:level:${levelId}:winners`;

export const keyLevelPlayCount = (levelId: string) =>
  `decrypt:level:${levelId}:play_count`;

export const keyLevelWinCount = (levelId: string) =>
  `decrypt:level:${levelId}:win_count`;

export const keyLevelQualifiedPlayers = (levelId: string) =>
  `decrypt:level:${levelId}:qualified_players`;

export const keyLevelQualifiedWins = (levelId: string) =>
  `decrypt:level:${levelId}:qualified_wins`;

export const keyLevelQualifiedFailures = (levelId: string) =>
  `decrypt:level:${levelId}:qualified_failures`;

export const keyLevelQualifiedOutcomes = (levelId: string) =>
  `decrypt:level:${levelId}:qualified_outcomes`;

export const keyKnownUsersIndex = 'decrypt:index:known_users';

export const keySessionIndex = 'decrypt:index:sessions';

export const keyPaymentOrderIndex = 'decrypt:index:payment_orders';

export const keyModeratorAccessCacheIndex = 'decrypt:index:moderator_access_cache';

export const keyShareCompletionReceipt = (userId: string, levelId: string) =>
  `decrypt:user:${userId}:share_receipt:${levelId}`;

export const keySharedLevels = (userId: string) =>
  `decrypt:user:${userId}:shared_levels`;

export const keyUserDailyDataDates = (userId: string) =>
  `decrypt:user:${userId}:daily_data_dates`;

export const keyProcessedOrder = (orderId: string) =>
  `decrypt:payments:processed_order:${orderId}`;

export const keyRefundProcessedOrder = (orderId: string) =>
  `decrypt:payments:refund_processed_order:${orderId}`;

export const keyGrantedOrderSkus = (orderId: string) =>
  `decrypt:payments:granted_order_skus:${orderId}`;

export const keyOrderGrantRecord = (orderId: string) =>
  `decrypt:payments:order_grant_record:${orderId}`;

export const keyOneTimeSkuClaimLock = (userId: string, sku: string) =>
  `decrypt:user:${userId}:one_time_claim:${sku}`;

export const keyModeratorAccessCache = (subredditName: string, username: string) =>
  `decrypt:cache:mod:${subredditName}:${username}`;

export const keyUserCoinHeartPurchases = (userId: string, dateKey: string) =>
  `decrypt:user:${userId}:coin-heart-purchases:${dateKey}`;

export const keyUserEndlessCursor = (userId: string) =>
  `decrypt:user:${userId}:endless:cursor`;

export const keyCommunitySubmission = (submissionId: string) =>
  `decrypt:community:submission:${submissionId}`;

export const keyCommunitySubmissionsPending =
  'decrypt:community:submissions:pending';

export const keyCommunitySubmissionsApproved =
  'decrypt:community:submissions:approved';

export const keyCommunitySubmissionsRejected =
  'decrypt:community:submissions:rejected';

export const keyCommunitySubmissionsRemoved =
  'decrypt:community:submissions:removed';

export const keyCommunitySubmissionsByLevel =
  'decrypt:community:submissions:by_level';

export const keyCommunityRemovedLevels =
  'decrypt:community:removed_levels';

export const keyCommunitySubmissionsByAuthor = (userId: string) =>
  `decrypt:community:by_author:${userId}`;

export const keyCommunityPendingSignatures =
  'decrypt:community:pending_signatures';

export const keyCommunityCreatorStats = (userId: string) =>
  `decrypt:community:creator:${userId}`;

export const keyUserEndlessPlayed = (userId: string) =>
  `decrypt:user:${userId}:endless:played`;

export const keyCommunityPuzzlePlays = (levelId: string) =>
  `decrypt:community:plays:${levelId}`;

export const keyCommunityApprovalLock = (submissionId: string) =>
  `decrypt:community:approval_lock:${submissionId}`;

// Per-(level) hash of voter userId -> '1' (like) | '-1' (dislike). Gives one
// vote per user with toggle/idempotency. Aggregate like/dislike counters live
// on keyCommunityPuzzlePlays(levelId) and are kept in sync with this hash.
export const keyCommunityVotes = (levelId: string) =>
  `decrypt:community:votes:${levelId}`;

// NX flag: set the first time a level crosses the acclaim bar so the creator's
// milestone is credited at most once per level.
export const keyCommunityAcclaimAwarded = (levelId: string) =>
  `decrypt:community:acclaim_awarded:${levelId}`;
