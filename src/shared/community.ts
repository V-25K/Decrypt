import { z } from 'zod';
import {
  challengeTypeSchema,
  challengeEvaluationSummarySchema,
  difficultyBreakdownSchema,
  puzzlePublicSchema,
} from './game';
import {
  maxPuzzleTotalLength,
} from './puzzle-limits';

export const primaryCommunitySubreddit = 'PlayDecrypt';

export const isPrimaryCommunitySubreddit = (
  subredditName: string | null | undefined
): boolean =>
  typeof subredditName === 'string' &&
  subredditName.trim().toLowerCase() === primaryCommunitySubreddit.toLowerCase();

const communitySubmissionStatusSchema = z.enum([
  'pending',
  'approved',
  'changes_requested',
  'rejected',
  'withdrawn',
  'removed',
]);

export type CommunitySubmissionStatus = z.infer<
  typeof communitySubmissionStatusSchema
>;

const communityCreationModeSchema = z.enum(['auto', 'manual']);

export type CommunityCreationMode = z.infer<
  typeof communityCreationModeSchema
>;

const communityManualPadlockSchema = z.object({
  padlockId: z.number().int().positive(),
  lockedIndices: z.array(z.number().int().nonnegative()).default([]),
  keyIndices: z.array(z.number().int().nonnegative()).default([]),
});

export type CommunityManualPadlock = z.infer<
  typeof communityManualPadlockSchema
>;

export const communityManualLayoutSchema = z.object({
  prefilledIndices: z.array(z.number().int().nonnegative()).default([]),
  prefilledWordIndices: z.array(z.number().int().nonnegative()).default([]),
  blindIndices: z.array(z.number().int().nonnegative()).default([]),
  lockIndices: z.array(z.number().int().nonnegative()).default([]),
  lockKeyIndices: z.array(z.number().int().nonnegative()).default([]),
  padlocks: z.array(communityManualPadlockSchema).default([]),
});

export type CommunityManualLayout = z.infer<
  typeof communityManualLayoutSchema
>;

export const communitySubmissionInputSchema = z
  .object({
    title: z.string().min(1).max(80),
    text: z.string().min(1).max(maxPuzzleTotalLength),
    category: challengeTypeSchema,
    attribution: z.string().min(1).max(80),
    targetDifficulty: z.number().int().min(1).max(10).default(5),
    creationMode: communityCreationModeSchema.default('auto'),
    manualLayout: communityManualLayoutSchema.nullable().optional(),
  })
  .strict();

/**
 * Preview intentionally uses the same input as submission so players see the
 * same validation before and after they submit a challenge.
 */
export const communitySubmissionPreviewInputSchema =
  communitySubmissionInputSchema;

const communityDifficultyEstimateSchema = z.object({
  tier: z.enum(['warmup', 'medium', 'hard', 'expert']),
  label: z.string().min(1),
  estimatedDifficulty: z.number().int().min(1).max(10),
  uniqueLetterCount: z.number().int().nonnegative(),
  cryptoHardness: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
  anchorDensity: z.number().min(0).max(1).optional(),
  solverSolvedRatio: z.number().min(0).max(1).optional(),
});

export const communitySubmissionPreviewSchema = z.object({
  valid: z.boolean(),
  sanitizedTitle: z.string(),
  sanitizedText: z.string(),
  sanitizedAttribution: z.string(),
  normalizedSig: z.string(),
  tokenSig: z.string(),
  suggestedDifficulty: communityDifficultyEstimateSchema,
  reasons: z.array(z.string()),
  suggestions: z.array(z.string()),
  puzzlePreview: puzzlePublicSchema.nullable(),
  difficultyExplanation: difficultyBreakdownSchema.optional(),
  challengeEvaluationSummary: challengeEvaluationSummarySchema.optional(),
  manualLayoutGuidance: z
    .object({
      status: z.enum(['aligned', 'too_easy', 'too_hard', 'unfair']),
      targetTier: z.enum(['warmup', 'medium', 'hard', 'expert']),
      estimatedTier: z.enum(['warmup', 'medium', 'hard', 'expert']),
      messages: z.array(z.string()),
      suggestedActions: z.array(z.string()),
    })
    .optional(),
});

export const communitySubmissionSchema = z.object({
  submissionId: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  normalizedSig: z.string().min(1),
  tokenSig: z.string().min(1),
  category: challengeTypeSchema,
  attribution: z.string().min(1),
  targetDifficulty: z.number().int().min(1).max(10),
  creationMode: communityCreationModeSchema.default('auto'),
  manualLayout: communityManualLayoutSchema.nullable().default(null),
  suggestedTier: z.enum(['warmup', 'medium', 'hard', 'expert']),
  status: communitySubmissionStatusSchema,
  submittedAt: z.number().int().nonnegative(),
  reviewedBy: z.string().nullable(),
  reviewedAt: z.number().int().nonnegative().nullable(),
  rejectionReason: z.string().nullable(),
  levelId: z.string().nullable(),
});

export const communitySubmissionListInputSchema = z.object({
  status: communitySubmissionStatusSchema.optional().default('pending'),
  limit: z.number().int().positive().max(50).optional().default(25),
});

export const communitySubmissionListResponseSchema = z.object({
  submissions: z.array(communitySubmissionSchema),
});

export const communityWithdrawInputSchema = z
  .object({
    submissionId: z.string().min(1),
  })
  .strict();

export const communitySubmitRequestedEditInputSchema = z
  .object({
    submissionId: z.string().min(1),
    title: z.string().min(1).max(80),
    text: z.string().min(1).max(maxPuzzleTotalLength),
    attribution: z.string().min(1).max(80),
    // Manual submissions may also correct their board layout during a revision
    // (locks/blinds/reveals). Ignored for auto submissions. Re-validated
    // server-side against the revised text.
    manualLayout: communityManualLayoutSchema.nullable().optional(),
  })
  .strict();

export const communityActionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().min(1),
  submission: communitySubmissionSchema.nullable(),
});

export const adminCommunityApproveInputSchema = z
  .object({
    submissionId: z.string().min(1),
  })
  .strict();

export const adminCommunityRejectInputSchema = z
  .object({
    submissionId: z.string().min(1),
    reason: z.string().min(3).max(180),
  })
  .strict();

export const adminCommunityRequestChangesInputSchema = z
  .object({
    submissionId: z.string().min(1),
    reason: z.string().min(3).max(180),
  })
  .strict();

export const adminCommunityRemoveInputSchema = z
  .object({
    submissionId: z.string().min(1),
    reason: z.string().min(3).max(180).optional(),
  })
  .strict();

// --- Creator Acclaim voting ---------------------------------------------------

export const communityVoteInputSchema = z
  .object({
    levelId: z.string().min(1),
    vote: z.enum(['like', 'dislike', 'clear']),
  })
  .strict();

export const communityVoteResponseSchema = z.object({
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  myVote: z.enum(['like', 'dislike']).nullable(),
});

export const communityVoteStateInputSchema = z
  .object({ levelId: z.string().min(1) })
  .strict();

export const communityVoteStateResponseSchema = z.object({
  isCommunity: z.boolean(),
  isOwnChallenge: z.boolean(),
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  myVote: z.enum(['like', 'dislike']).nullable(),
});

// Mirrors AcclaimProgress in src/shared/acclaim.ts (kept in sync by tests).
export const acclaimProgressSchema = z.object({
  qualifiedPlays: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  dislikes: z.number().int().nonnegative(),
  totalVotes: z.number().int().nonnegative(),
  likeRatio: z.number().min(0).max(1),
  ratioLowerBound: z.number().min(0).max(1),
  playsToGo: z.number().int().nonnegative(),
  votesToGo: z.number().int().nonnegative(),
  met: z.boolean(),
});

export const communityCreatorProgressResponseSchema = z.object({
  levels: z.array(
    z.object({
      levelId: z.string().min(1),
      acclaimed: z.boolean(),
      progress: acclaimProgressSchema,
    })
  ),
});
