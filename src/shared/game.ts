import { z } from 'zod';
import { endlessCatalogStatusSchema } from './endless';
import { startingGlobalRating } from './rating';

const maxHearts = 3;

export const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const cipherTypeSchema = z.union([
  z.literal('random'),
  z.literal('reverse'),
  z.literal('shift'),
]);

export type CipherType = z.infer<typeof cipherTypeSchema>;

export const tileSchema = z.object({
  index: z.number().int().nonnegative(),
  char: z.string().length(1),
  isLetter: z.boolean(),
  wordIndex: z.number().int().nonnegative(),
});

export type PuzzleTile = z.infer<typeof tileSchema>;

export const padlockChainSchema = z.object({
  chainId: z.number().int().positive(),
  keyIndices: z.array(z.number().int().nonnegative()),
  lockedIndices: z.array(z.number().int().nonnegative()),
});

export type PadlockChain = z.infer<typeof padlockChainSchema>;

export const legacyPadlockChainSchema = z.object({
  keyWordIndex: z.number().int().nonnegative(),
  lockedWordIndex: z.number().int().nonnegative(),
});

export type LegacyPadlockChain = z.infer<typeof legacyPadlockChainSchema>;

export const storedPadlockChainSchema = z.union([
  padlockChainSchema,
  legacyPadlockChainSchema,
]);

export type StoredPadlockChain = z.infer<typeof storedPadlockChainSchema>;

export const challengeTypeSchema = z.union([
  z.literal('QUOTE'),
  z.literal('LYRIC_LINE'),
  z.literal('MOVIE_LINE'),
  z.literal('ANIME_LINE'),
  z.literal('SPEECH_LINE'),
  z.literal('BOOK_LINE'),
  z.literal('TV_LINE'),
  z.literal('SAYING'),
  z.literal('PROVERB'),
]);

export type ChallengeType = z.infer<typeof challengeTypeSchema>;

export const challengeTypeDisplayOrder = [
  'QUOTE',
  'SAYING',
  'PROVERB',
  'SPEECH_LINE',
  'BOOK_LINE',
  'MOVIE_LINE',
  'TV_LINE',
  'ANIME_LINE',
  'LYRIC_LINE',
] satisfies ChallengeType[];

export const challengeTypeMetadata = {
  QUOTE: {
    label: 'Quote',
    shortLabel: 'Quote',
    description: 'Attributed line that does not fit a narrower source type.',
  },
  SAYING: {
    label: 'Saying / Idiom',
    shortLabel: 'Saying',
    description: 'Common expression or idiom, often conversational.',
  },
  PROVERB: {
    label: 'Proverb',
    shortLabel: 'Proverb',
    description: 'Traditional wisdom phrase with a lesson or moral.',
  },
  SPEECH_LINE: {
    label: 'Speech Line',
    shortLabel: 'Speech',
    description: 'Line from a public speech, address, or formal remarks.',
  },
  BOOK_LINE: {
    label: 'Book / Literature',
    shortLabel: 'Book',
    description: 'Line from a book, poem, play, or other literary work.',
  },
  MOVIE_LINE: {
    label: 'Movie Line',
    shortLabel: 'Movie',
    description: 'Recognizable line from a film.',
  },
  TV_LINE: {
    label: 'TV Line',
    shortLabel: 'TV',
    description: 'Recognizable line from a television show.',
  },
  ANIME_LINE: {
    label: 'Anime Line',
    shortLabel: 'Anime',
    description: 'Recognizable line from an anime series or film.',
  },
  LYRIC_LINE: {
    label: 'Lyric Line',
    shortLabel: 'Lyric',
    description: 'Short lyric excerpt with clear attribution.',
  },
} satisfies Record<
  ChallengeType,
  { label: string; shortLabel: string; description: string }
>;

export const challengeTypeSelectionHelpText =
  'Speech is from public remarks; Saying is a common idiom; Proverb is traditional wisdom; Quote is for lines with no narrower source.';

export const endlessSortSchema = z.union([
  z.literal('random'),
  z.literal('latest'),
  z.literal('oldest'),
  z.literal('win_rate_desc'),
  z.literal('win_rate_asc'),
]);

export type EndlessSort = z.infer<typeof endlessSortSchema>;

export const puzzleSourceSchema = z.union([
  z.literal('AUTO_DAILY'),
  z.literal('AUTO_ENDLESS'),
  z.literal('COMMUNITY'),
  z.literal('MANUAL_INJECTED'),
  z.literal('UNKNOWN_LEGACY'),
]);

export type PuzzleSource = z.infer<typeof puzzleSourceSchema>;

const difficultyHumanFeaturesSchema = z.object({
  lexiconCoverageRatio: z.number().min(0).max(1),
  topCommonWordRatio: z.number().min(0).max(1),
  rareWordRatio: z.number().min(0).max(1),
  anchorWordCount: z.number().int().nonnegative(),
  shortWordAnchorCount: z.number().int().nonnegative(),
  commonPatternCount: z.number().int().nonnegative(),
  repeatedPatternScore: z.number().min(0).max(1),
  anchorDensity: z.number().min(0).max(1),
  uniqueLetterSignal: z.number().min(0).max(1),
  longWordPressure: z.number().min(0).max(1),
  revealedAnchorCoverage: z.number().min(0).max(1),
});

const difficultyFairnessSummarySchema = z.object({
  solvable: z.boolean(),
  solvedRatio: z.number().min(0).max(1),
  blindGuessRequired: z.boolean(),
});

export const difficultyBreakdownSchema = z.object({
  difficultyModelVersion: z.literal('v2'),
  staticDifficulty: z.number().int().min(1).max(10),
  calibratedDifficulty: z.number().int().min(1).max(10),
  difficultyConfidence: z.number().min(0).max(1),
  humanFeatures: difficultyHumanFeaturesSchema,
  fairnessSummary: difficultyFairnessSummarySchema,
});

export type DifficultyBreakdown = z.infer<typeof difficultyBreakdownSchema>;

export const puzzlePrivateSchema = z.object({
  levelId: z.string().min(1),
  dateKey: z.string().min(1),
  targetText: z.string().min(1),
  author: z.string().min(1),
  challengeType: challengeTypeSchema.default('QUOTE'),
  source: puzzleSourceSchema.default('UNKNOWN_LEGACY'),
  cipherType: cipherTypeSchema,
  shiftAmount: z.number().int().min(0).max(25).nullable(),
  mapping: z.record(z.string().length(1), z.number().int().min(1).max(26)),
  reverseMapping: z.record(z.string().regex(/^\d+$/), z.string().length(1)),
  tiles: z.array(tileSchema),
  words: z.array(z.string()),
  prefilledIndices: z.array(z.number().int().nonnegative()),
  revealedIndices: z.array(z.number().int().nonnegative()).default([]),
  revealed_indices: z.array(z.number().int().nonnegative()).default([]),
  lockIndices: z.array(z.number().int().nonnegative()).optional(),
  blindIndices: z.array(z.number().int().nonnegative()),
  goldIndex: z.number().int().nonnegative().nullable(),
  padlockChains: z.array(padlockChainSchema),
  difficulty: z.number().int().min(1).max(10),
  difficultyModelVersion: z.literal('v2').optional(),
  difficultyBreakdown: difficultyBreakdownSchema.optional(),
  cryptoHardness: z.number().min(0).max(1).optional(),
  targetTimeSeconds: z.number().nonnegative().optional(),
  starThresholds: z
    .object({
      '3_star': z.number().nonnegative(),
      '2_star': z.number().nonnegative(),
      '1_star': z.number().nonnegative(),
    })
    .optional(),
  isLogical: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});

export type PuzzlePrivate = z.infer<typeof puzzlePrivateSchema>;

export const puzzlePrivateStoredSchema = puzzlePrivateSchema.extend({
  padlockChains: z.array(storedPadlockChainSchema),
});

export type PuzzlePrivateStored = z.infer<typeof puzzlePrivateStoredSchema>;

export const puzzlePublicTileSchema = z.object({
  index: z.number().int().nonnegative(),
  isLetter: z.boolean(),
  displayChar: z.string().length(1),
  cipherNumber: z.number().int().min(1).max(26).nullable(),
  isBlind: z.boolean(),
  isGold: z.boolean(),
  isLocked: z.boolean(),
  isSessionRevealed: z.boolean().optional(),
  hasLock: z.boolean().optional(),
  lockChainId: z.number().int().positive().nullable().optional(),
  lockRemainingKeys: z.number().int().nonnegative().optional(),
  lockTotalKeys: z.number().int().positive().optional(),
});

export type PuzzlePublicTile = z.infer<typeof puzzlePublicTileSchema>;

export const puzzlePublicSchema = z.object({
  levelId: z.string().min(1),
  dateKey: z.string().min(1),
  author: z.string().min(1),
  challengeType: challengeTypeSchema.default('QUOTE'),
  words: z.array(z.string()),
  tiles: z.array(puzzlePublicTileSchema),
  difficulty: z.number().int().min(1).max(10),
  targetTimeSeconds: z.number().nonnegative().optional(),
  heartsMax: z.number().int().positive(),
});

export type PuzzlePublic = z.infer<typeof puzzlePublicSchema>;

export const inventorySchema = z.object({
  hammer: z.number().int().nonnegative(),
  wand: z.number().int().nonnegative(),
  shield: z.number().int().nonnegative(),
  rocket: z.number().int().nonnegative(),
});

export type Inventory = z.infer<typeof inventorySchema>;

export const userProfileSchema = z.object({
  coins: z.number().int().nonnegative(),
  hearts: z.number().int().nonnegative().max(maxHearts),
  lastHeartRefillTs: z.number().int().nonnegative(),
  infiniteHeartsExpiryTs: z.number().int().nonnegative(),
  currentStreak: z.number().int().nonnegative(),
  dailyCurrentStreak: z.number().int().nonnegative(),
  endlessCurrentStreak: z.number().int().nonnegative(),
  lastPlayedDateKey: z.string(),
  totalWordsSolved: z.number().int().nonnegative(),
  logicTasksCompleted: z.number().int().nonnegative(),
  totalLevelsCompleted: z.number().int().nonnegative(),
  flawlessWins: z.number().int().nonnegative(),
  speedWins: z.number().int().nonnegative(),
  dailyFlawlessWins: z.number().int().nonnegative(),
  endlessFlawlessWins: z.number().int().nonnegative(),
  dailySpeedWins: z.number().int().nonnegative(),
  endlessSpeedWins: z.number().int().nonnegative(),
  dailyChallengesPlayed: z.number().int().nonnegative(),
  endlessChallengesPlayed: z.number().int().nonnegative(),
  dailyFirstTryWins: z.number().int().nonnegative(),
  endlessFirstTryWins: z.number().int().nonnegative(),
  questsCompleted: z.number().int().nonnegative(),
  dailyModeClears: z.number().int().nonnegative(),
  endlessModeClears: z.number().int().nonnegative(),
  dailySolveTimeTotalSec: z.number().int().nonnegative(),
  endlessSolveTimeTotalSec: z.number().int().nonnegative(),
  globalRating: z.number().int().nonnegative().default(startingGlobalRating),
  globalScore: z.number().int().nonnegative().default(0),
  ratingGames: z.number().int().nonnegative().default(0),
  ratingWins: z.number().int().nonnegative().default(0),
  ratingLosses: z.number().int().nonnegative().default(0),
  globalWinStreak: z.number().int().nonnegative().default(0),
  bestGlobalRank: z.number().int().nonnegative().default(0),
  bestOverallRank: z.number().int().nonnegative(),
  audioEnabled: z.boolean().default(true),
  // Tracks whether the player has ever successfully completed the "join community" user action.
  // This is separate from reward claiming so we can show "Joined" UI even in dev/playtest subs.
  communityJoinRecorded: z.boolean().default(false),
  communityJoinRewardClaimed: z.boolean(),
  unlockedFlairs: z.array(z.string().min(1)),
  activeFlair: z.string(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

export const sessionSchema = z.object({
  activeLevelId: z.string().min(1),
  mode: z.union([z.literal('daily'), z.literal('endless')]).default('daily'),
  startTimestamp: z.number().int().nonnegative(),
  activeMs: z.number().int().nonnegative().default(0),
  lastSeenAt: z.number().int().nonnegative().default(0),
  mistakesMade: z.number().int().nonnegative(),
  shieldIsActive: z.boolean(),
  revealedIndices: z.array(z.number().int().nonnegative()),
  usedPowerups: z.number().int().nonnegative(),
  wrongGuesses: z.number().int().nonnegative(),
  guessCount: z.number().int().nonnegative(),
});

export type SessionState = z.infer<typeof sessionSchema>;

export const leaderboardEntrySchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1).nullable().optional(),
  score: z.number(),
  snoovatarUrl: z.string().min(1).nullable().optional(),
  solveSeconds: z.number().int().nonnegative().nullable().optional(),
  mistakes: z.number().int().nonnegative().nullable().optional(),
  usedPowerups: z.number().int().nonnegative().nullable().optional(),
  levelsCompleted: z.number().int().nonnegative().optional(),
  rating: z.number().int().nonnegative().optional(),
  ratingDelta: z.number().int().optional(),
  globalScore: z.number().int().nonnegative().optional(),
  challengesCompleted: z.number().int().nonnegative().optional(),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const powerupTypeSchema = z.union([
  z.literal('hammer'),
  z.literal('wand'),
  z.literal('shield'),
  z.literal('rocket'),
]);

export type PowerupType = z.infer<typeof powerupTypeSchema>;

export const actionErrorCodeSchema = z.union([
  z.literal('TILE_LOCKED'),
  z.literal('INVALID_TARGET'),
]);

export type ActionErrorCode = z.infer<typeof actionErrorCodeSchema>;

export const revealedTileSchema = z.object({
  index: z.number().int().nonnegative(),
  letter: z.string().length(1),
});

export type RevealedTile = z.infer<typeof revealedTileSchema>;

export const questProgressSchema = z.object({
  dailyPlayCount: z.number().int().nonnegative(),
  dailyFastWin: z.boolean(),
  dailyNoPowerup: z.boolean(),
  dailyNoMistake: z.boolean(),
  dailyShareCount: z.number().int().nonnegative(),
  socialShareCount: z.number().int().nonnegative(),
  lifetimeWordsmith: z.number().int().nonnegative(),
  lifetimeLogicalSolved: z.number().int().nonnegative(),
  lifetimeFlawless: z.number().int().nonnegative(),
  lifetimeCoinsSpent: z.number().int().nonnegative(),
  lifetimePurchases: z.number().int().nonnegative(),
  lifetimeDailyTopRanks: z.number().int().nonnegative(),
  lifetimeEndlessClears: z.number().int().nonnegative(),
});

export type QuestProgress = z.infer<typeof questProgressSchema>;

export const gameBootstrapResponseSchema = z.object({
  userId: z.string().min(1),
  username: z.string().nullable(),
  subredditName: z.string().nullable(),
  postId: z.string().nullable(),
  currentDailyLevelId: z.string().nullable(),
  todayDateKey: z.string().min(1),
  profile: userProfileSchema,
  inventory: inventorySchema,
  endlessCatalog: endlessCatalogStatusSchema,
  isModerator: z.boolean().default(false),
  communityNotifications: z
    .object({
      creatorChangesRequestedCount: z.number().int().nonnegative(),
      moderatorPendingReviewCount: z.number().int().nonnegative(),
      moderatorRevisionReviewCount: z.number().int().nonnegative(),
    })
    .default({
      creatorChangesRequestedCount: 0,
      moderatorPendingReviewCount: 0,
      moderatorRevisionReviewCount: 0,
    }),
});

export const gameLoadLevelInputSchema = z.object({
  mode: z.union([z.literal('daily'), z.literal('endless')]),
  requestedLevelId: z.string().nullable().optional(),
  dailyArchive: z.boolean().optional().default(false),
  excludeLevelId: z.string().nullable().optional(),
  ignorePostLevel: z.boolean().optional().default(false),
  categoryFilter: challengeTypeSchema.nullable().optional(),
  endlessSort: endlessSortSchema.optional().default('random'),
});

export const gameLoadLevelResponseSchema = z.object({
  mode: z.union([z.literal('daily'), z.literal('endless')]),
  levelId: z.string().min(1),
  puzzle: puzzlePublicSchema,
  alreadyCompleted: z.boolean(),
  retryCount: z.number().int().nonnegative(),
  nextRetryCost: z.number().int().nonnegative(),
  retryScoreFactor: z.number().nonnegative(),
  nextRetryScoreFactor: z.number().nonnegative(),
  requiresPaidRetry: z.boolean(),
  challengeMetrics: z.object({
    plays: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    winRatePct: z.number().int().min(0).max(100),
  }),
});

export const gamePreviewResponseSchema = z.object({
  mode: z.literal('daily'),
  levelId: z.string().min(1),
  previewTitle: z.string().min(1).max(80),
  puzzle: puzzlePublicSchema,
  challengeMetrics: z.object({
    plays: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    winRatePct: z.number().int().min(0).max(100),
  }),
  creator: z.object({
    username: z.string().min(1).nullable(),
    avatarUrl: z.string().min(1).nullable(),
  }),
});

export type GamePreviewResponse = z.infer<typeof gamePreviewResponseSchema>;

export const gameInlineStatusResponseSchema = z.object({
  levelId: z.string().min(1).nullable(),
  completed: z.boolean(),
  failed: z.boolean().optional().default(false),
  removed: z.boolean().optional().default(false),
});

export type GameInlineStatusResponse = z.infer<typeof gameInlineStatusResponseSchema>;

export const gameStartSessionInputSchema = z.object({
  levelId: z.string().min(1),
  mode: z.union([z.literal('daily'), z.literal('endless')]),
});

export const gameHeartbeatInputSchema = z.object({
  levelId: z.string().min(1),
  mode: z.union([z.literal('daily'), z.literal('endless')]),
});

export const gameHeartbeatResponseSchema = z.object({
  ok: z.boolean(),
});

export const gameStartSessionResponseSchema = z.object({
  ok: z.boolean(),
  session: sessionSchema,
  heartsRemaining: z.number().int().nonnegative(),
});

export const gamePurchaseDailyRetryInputSchema = z.object({
  levelId: z.string().min(1),
  mode: z.union([z.literal('daily'), z.literal('endless')]),
});

export const gamePurchaseDailyRetryResponseSchema = z.object({
  ok: z.boolean(),
  session: sessionSchema,
  heartsRemaining: z.number().int().nonnegative(),
  profile: userProfileSchema,
  inventory: inventorySchema,
  retryCount: z.number().int().nonnegative(),
  nextRetryCost: z.number().int().nonnegative(),
  retryScoreFactor: z.number().nonnegative(),
  nextRetryScoreFactor: z.number().nonnegative(),
  requiresPaidRetry: z.boolean(),
});

export const gameContinueLevelInputSchema = z.object({
  levelId: z.string().min(1),
  mode: z.union([z.literal('daily'), z.literal('endless')]),
});

export const gameContinueLevelResponseSchema = z.object({
  ok: z.boolean(),
  session: sessionSchema,
  heartsRemaining: z.number().int().nonnegative(),
  profile: userProfileSchema,
  inventory: inventorySchema,
});

export const gameSubmitGuessInputSchema = z.object({
  levelId: z.string().min(1),
  tileIndex: z.number().int().nonnegative(),
  guessedLetter: z.string().length(1),
});

export const gameSubmitGuessResponseSchema = z.object({
  ok: z.boolean(),
  isCorrect: z.boolean(),
  errorCode: actionErrorCodeSchema.nullable(),
  sessionStartTimestamp: z.number().int().nonnegative().nullable().optional().default(null),
  revealedTiles: z.array(revealedTileSchema).default([]),
  revealedIndices: z.array(z.number().int().nonnegative()),
  revealedLetter: z.string().length(1).nullable(),
  newlyUnlockedChainIds: z.array(z.number().int().positive()),
  lockProgressChanged: z.boolean().default(false),
  heartsRemaining: z.number().int().nonnegative(),
  shieldConsumed: z.boolean(),
  isLevelComplete: z.boolean(),
  isGameOver: z.boolean(),
  ratingDelta: z.number().int().nullable().default(null),
  ratingAfter: z.number().int().nonnegative().nullable().default(null),
});

export const gameSubmitGuessesInputSchema = z.object({
  levelId: z.string().min(1),
  guesses: z
    .array(
      z.object({
        tileIndex: z.number().int().nonnegative(),
        guessedLetter: z.string().length(1),
      })
    )
    .min(1)
    .max(20),
});

export const gameSubmitGuessesResponseSchema = z.object({
  ok: z.boolean(),
  results: z.array(gameSubmitGuessResponseSchema),
});

export const gameCompleteSessionInputSchema = z.object({
  levelId: z.string().min(1),
  mode: z.union([z.literal('daily'), z.literal('endless')]),
});

export const gameCompleteSessionResponseSchema = z.object({
  ok: z.boolean(),
  accepted: z.boolean(),
  solveSeconds: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
  rewardCoins: z.number().int().nonnegative(),
  mistakes: z.number().int().nonnegative(),
  usedPowerups: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  retryScoreFactor: z.number().nonnegative(),
  isRecoveryRun: z.boolean(),
  isCurrentDaily: z.boolean(),
  rewardNotice: z.string().nullable(),
  ratingDelta: z.number().int().nullable().default(null),
  ratingAfter: z.number().int().nonnegative().nullable().default(null),
  globalScoreAfter: z.number().int().nonnegative().nullable().default(null),
  profile: userProfileSchema,
  inventory: inventorySchema,
});

export const gameCompletedOutcomeSchema = z.object({
  levelId: z.string().min(1),
  solveSeconds: z.number().int().nonnegative().nullable(),
  score: z.number().int().nonnegative().nullable(),
  ratingDelta: z.number().int().nullable().default(null),
  ratingAfter: z.number().int().nonnegative().nullable().default(null),
  globalScoreAfter: z.number().int().nonnegative().nullable().default(null),
  completedAtTs: z.number().int().nonnegative().nullable(),
  profile: userProfileSchema,
  inventory: inventorySchema,
});

export const gameFailedOutcomeSchema = z.object({
  levelId: z.string().min(1),
  ratingDelta: z.number().int().nullable().default(null),
  ratingAfter: z.number().int().nonnegative().nullable().default(null),
  pointsGained: z.number().int().nonnegative().default(0),
});

export const powerupPurchaseInputSchema = z.object({
  levelId: z.string().min(1),
  itemType: powerupTypeSchema,
  quantity: z.number().int().positive().optional().default(1),
});

export const powerupPurchaseResponseSchema = z.object({
  success: z.boolean(),
  reason: z.string().nullable(),
  profile: userProfileSchema,
  inventory: inventorySchema,
});

export const powerupUseInputSchema = z.object({
  levelId: z.string().min(1),
  itemType: powerupTypeSchema,
  targetIndex: z.number().int().nonnegative().nullable().optional(),
});

export const powerupUseResponseSchema = z.object({
  success: z.boolean(),
  reason: z.string().nullable(),
  errorCode: actionErrorCodeSchema.nullable(),
  revealedTiles: z.array(revealedTileSchema).default([]),
  revealedIndices: z.array(z.number().int().nonnegative()),
  revealedLetter: z.string().length(1).nullable(),
  newlyUnlockedChainIds: z.array(z.number().int().positive()),
  lockProgressChanged: z.boolean().default(false),
  profile: userProfileSchema,
  inventory: inventorySchema,
  session: sessionSchema,
});

export const leaderboardGetInputSchema = z.object({
  dateKey: z.string().nullable().optional(),
  limit: z.number().int().positive().max(50).optional(),
});

export const leaderboardGetLevelInputSchema = z.object({
  levelId: z.string().min(1),
  limit: z.number().int().positive().max(50).optional(),
});

export const leaderboardGetResponseSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
});

export const leaderboardRankSummarySchema = z.object({
  dailyRank: z.number().int().positive().nullable(),
  globalRank: z.number().int().positive().nullable(),
  endlessRank: z.number().int().positive().nullable().optional(),
  currentRank: z.number().int().positive().nullable(),
  bestOverallRank: z.number().int().positive().nullable(),
});

export const pageInfoSchema = z.object({
  currentPage: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

export const leaderboardPageSchema = z.object({
  entries: z.array(leaderboardEntrySchema),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  totalCount: z.number().int().nonnegative(),
  pageInfo: pageInfoSchema,
});

export const leaderboardPageInputSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(50).optional(),
});

export const dailyLeaderboardPageInputSchema = leaderboardPageInputSchema.extend({
  dateKey: z.string().nullable().optional(),
});

export const levelLeaderboardPageInputSchema = leaderboardPageInputSchema.extend({
  levelId: z.string().min(1),
});

export type PageInfo = z.infer<typeof pageInfoSchema>;
export type LeaderboardPage = z.infer<typeof leaderboardPageSchema>;
export type LeaderboardPageInput = z.infer<typeof leaderboardPageInputSchema>;
export type DailyLeaderboardPageInput = z.infer<typeof dailyLeaderboardPageInputSchema>;
export type LevelLeaderboardPageInput = z.infer<typeof levelLeaderboardPageInputSchema>;

export const questStatusResponseSchema = z.object({
  dailyDateKey: z.string().min(1),
  progress: questProgressSchema,
  claimedQuestIds: z.array(z.string().min(1)).default([]),
});

export const questClaimInputSchema = z.object({
  questId: z.string().min(1),
});

export const questClaimResponseSchema = z.object({
  success: z.boolean(),
  reason: z.string().nullable(),
  rewardCoins: z.number().int().nonnegative(),
  rewardInventory: inventorySchema,
  profile: userProfileSchema,
  inventory: inventorySchema,
});

export const profileSetActiveFlairInputSchema = z.object({
  flair: z.string(),
});

export const profileSetAudioEnabledInputSchema = z.object({
  enabled: z.boolean(),
});

export const profileSetActiveFlairResponseSchema = z.object({
  success: z.boolean(),
  reason: z.string().nullable(),
  profile: userProfileSchema,
});

export const profileSetAudioEnabledResponseSchema =
  profileSetActiveFlairResponseSchema;

export const profileJoinCommunityResponseSchema = z.object({
  success: z.boolean(),
  reason: z.string().nullable(),
  joined: z.boolean(),
  rewardCoins: z.number().int().nonnegative(),
  profile: userProfileSchema,
});

export const heartPurchaseResponseSchema = z.object({
  success: z.boolean(),
  reason: z.string().nullable(),
  profile: userProfileSchema,
  purchasesToday: z.number().int().nonnegative(),
  maxPurchasesPerDay: z.number().int().positive(),
  limitResetTs: z.number().int().nonnegative(),
});

export const heartPurchaseStatusResponseSchema = z.object({
  purchasesToday: z.number().int().nonnegative(),
  maxPurchasesPerDay: z.number().int().positive(),
  limitResetTs: z.number().int().nonnegative(),
});

export const socialShareInputSchema = z.object({
  levelId: z.string().min(1),
});

export const socialShareResponseSchema = z.object({
  success: z.boolean(),
  reason: z.string().nullable(),
  commentId: z.string().nullable(),
});

export const adminInjectInputSchema = z.object({
  text: z.string().min(3),
  difficulty: z.number().int().min(1).max(10).optional(),
  challengeType: challengeTypeSchema.default('QUOTE'),
  author: z.string().min(1).optional(),
});

export const adminActionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().min(1),
  levelId: z.string().nullable(),
});

export const adminValidateManualChallengeInputSchema = z.object({
  text: z.string().min(3),
  targetDifficulty: z.number().int().min(1).max(10).optional(),
  challengeType: challengeTypeSchema.optional().default('QUOTE'),
});

export const adminValidateManualChallengeResponseSchema = z.object({
  valid: z.boolean(),
  textProfile: z.object({
    cryptoHardness: z.number(),
    uniqueLetterCount: z.number().int(),
    oneLetterWordCount: z.number().int(),
    commonSuffixCount: z.number().int(),
    lexiconCoverageRatio: z.number().min(0).max(1).optional(),
    topCommonWordRatio: z.number().min(0).max(1).optional(),
    rareWordRatio: z.number().min(0).max(1).optional(),
    anchorDensity: z.number().min(0).max(1).optional(),
  }),
  naturalDifficulty: z.enum(['warmup', 'medium', 'hard', 'expert']),
  achievableTierRange: z.array(z.enum(['warmup', 'medium', 'hard', 'expert'])),
  reasons: z.array(z.string()),
  suggestions: z.array(z.string()),
  difficultyExplanation: difficultyBreakdownSchema.optional(),
});

export const adminInjectManualChallengeWithAdjustmentInputSchema = z.object({
  text: z.string().min(3),
  author: z.string().min(1),
  targetDifficulty: z.number().int().min(1).max(10).optional(),
  challengeType: challengeTypeSchema.default('QUOTE'),
  allowAdjustment: z.boolean().default(true),
});

export const adminInjectManualChallengeWithAdjustmentResponseSchema = z.object({
  success: z.boolean(),
  levelId: z.string().optional(),
  postId: z.string().optional(),
  feedback: z.object({
    textProfile: z.object({
      cryptoHardness: z.number(),
      uniqueLetterCount: z.number().int(),
      oneLetterWordCount: z.number().int(),
      commonSuffixCount: z.number().int(),
      lexiconCoverageRatio: z.number().min(0).max(1).optional(),
      topCommonWordRatio: z.number().min(0).max(1).optional(),
      rareWordRatio: z.number().min(0).max(1).optional(),
      anchorDensity: z.number().min(0).max(1).optional(),
    }),
    naturalDifficulty: z.enum(['warmup', 'medium', 'hard', 'expert']),
    achievableTierRange: z.array(z.enum(['warmup', 'medium', 'hard', 'expert'])),
    budgetUsed: z.number().int(),
    budgetTotal: z.number().int(),
    adjustmentsMade: z.array(z.string()),
    suggestions: z.array(z.string()).optional(),
    difficultyExplanation: difficultyBreakdownSchema.optional(),
  }),
  error: z.string().optional(),
});

export const adminRetryPublishInputSchema = z.object({
  levelId: z.string().min(1),
});

export const adminRetryPublishResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().min(1),
  levelId: z.string().nullable(),
  postId: z.string().nullable(),
});

export const adminDifficultyCalibrationResponseSchema = z.object({
  biasTierShift: z.number().int().min(-1).max(1),
  eligibleLevels: z.number().int().nonnegative(),
  harderCount: z.number().int().nonnegative(),
  easierCount: z.number().int().nonnegative(),
  neutralCount: z.number().int().nonnegative(),
  params: z.object({
    bayesAlpha: z.number().nonnegative(),
    bayesBeta: z.number().nonnegative(),
    minQualifiedPlaysPerLevel: z.number().int().nonnegative(),
    lookbackEligibleLevels: z.number().int().nonnegative(),
    recentLevelScanLimit: z.number().int().nonnegative(),
    minEligibleLevelsForBias: z.number().int().nonnegative(),
    biasRequiredShare: z.number().nonnegative(),
    observedEasyThreshold: z.number().nonnegative(),
    observedHardThreshold: z.number().nonnegative(),
  }),
});

export const storeProductsResponseSchema = z.object({
  products: z.array(
    z.object({
      sku: z.string().min(1),
      displayName: z.string().min(1),
      description: z.string(),
      price: z.number().int().positive(),
      isOneTime: z.boolean(),
      usdApprox: z.number().positive().nullable(),
      perks: z.object({
        coins: z.number().int().nonnegative(),
        hearts: z.number().int().nonnegative(),
        hammer: z.number().int().nonnegative(),
        wand: z.number().int().nonnegative(),
        shield: z.number().int().nonnegative(),
        rocket: z.number().int().nonnegative(),
        infiniteHeartsHours: z.number().nonnegative(),
      }),
    })
  ),
});
