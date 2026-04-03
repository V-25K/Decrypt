export const keyDailyPointer = 'decrypt:state:daily_pointer';
export const keyDailyTierCursor = (dateKey: string) =>
  `decrypt:state:daily_tier_cursor:${dateKey}`;
export const keyDailyChallengeTypeCursor = (dateKey: string) =>
  `decrypt:state:daily_challenge_type_cursor:${dateKey}`;
export const keyDailyChallengeTypeSeed = (dateKey: string) =>
  `decrypt:state:daily_challenge_type_seed:${dateKey}`;
export const keyPuzzleStaged = 'decrypt:puzzle:staged';
export const keyPuzzlePublishedPost = (levelId: string) =>
  `decrypt:puzzle:${levelId}:published_post`;
export const keyPuzzlesIndex = 'decrypt:puzzles:index';
export const keyPuzzlesByDate = (dateKey: string) =>
  `decrypt:puzzles:by_date:${dateKey}`;
export const keyUsedStrings = 'decrypt:history:used_strings';
export const keyGenerationFailureLatest =
  'decrypt:state:generation_failure_latest';
export const keyGenerationFailureNotified = (dateKey: string) =>
  `decrypt:state:generation_failure_notified:${dateKey}`;

export const keyPuzzlePrivate = (levelId: string) =>
  `decrypt:puzzle:${levelId}:private`;

export const keyPuzzlePublic = (levelId: string) => `decrypt:puzzle:${levelId}:public`;

export const keyUserProfile = (userId: string) => `decrypt:user:${userId}:profile`;

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

export const keyLevelPlayers = (levelId: string) =>
  `decrypt:level:${levelId}:players`;

export const keyLevelWinners = (levelId: string) =>
  `decrypt:level:${levelId}:winners`;

export const keyLevelQualifiedPlayers = (levelId: string) =>
  `decrypt:level:${levelId}:qualified_players`;

export const keyLevelQualifiedWins = (levelId: string) =>
  `decrypt:level:${levelId}:qualified_wins`;

export const keyKnownUsersIndex = 'decrypt:index:known_users';

export const keySessionIndex = 'decrypt:index:sessions';

export const keyShareCompletionReceipt = (userId: string, levelId: string) =>
  `decrypt:user:${userId}:share_receipt:${levelId}`;

export const keySharedLevels = (userId: string) =>
  `decrypt:user:${userId}:shared_levels`;

export const keyProcessedOrder = (orderId: string) =>
  `decrypt:payments:processed_order:${orderId}`;

export const keyRefundProcessedOrder = (orderId: string) =>
  `decrypt:payments:refund_processed_order:${orderId}`;

export const keyGrantedOrderSkus = (orderId: string) =>
  `decrypt:payments:granted_order_skus:${orderId}`;

export const keyEndlessActiveCatalogVersion =
  'decrypt:endless:active_catalog_version';

export const keyEndlessCatalogSequence = (catalogVersion: string) =>
  `decrypt:endless:catalog:${catalogVersion}:sequence`;
