import {
  adminCommunityApproveInputSchema,
  adminCommunityRejectInputSchema,
  adminCommunityRequestChangesInputSchema,
  adminCommunityRemoveInputSchema,
  communityActionResponseSchema,
  communitySubmissionListInputSchema,
  communitySubmissionListResponseSchema,
} from '../../../shared/community';
import {
  adminActionResponseSchema,
  adminDifficultyCalibrationResponseSchema,
  adminInjectInputSchema,
  adminRetryPublishInputSchema,
  adminRetryPublishResponseSchema,
  adminValidateManualChallengeInputSchema,
  adminValidateManualChallengeResponseSchema,
  adminInjectManualChallengeWithAdjustmentInputSchema,
  adminInjectManualChallengeWithAdjustmentResponseSchema,
} from '../../../shared/game';
import {
  completeSavedManualPuzzlePublish,
  formatModeratorRerollError,
  injectAndPublishManualPuzzle,
  rerollAndPublish,
  retryPublishManualPuzzle,
  preflightManualChallengeForPublish,
  injectManualChallengeWithAdjustment,
} from '../../core/admin';
import {
  approveCommunitySubmission,
  listCommunitySubmissionsForReview,
  rejectCommunitySubmission,
  removeCommunityPuzzle,
  requestCommunitySubmissionChanges,
} from '../../core/community';
import {
  buildShadowCalibrationPreview,
  getGlobalDailyCalibrationSnapshot,
  readDifficultyCalibrationV3Artifact,
} from '../../core/difficulty-calibration';
import { getMetricsSnapshot } from '../../core/metrics';
import { router } from '../base';
import { adminProcedure } from '../procedures';
import { adminDebugProcedures } from './admin.debug';

export const adminRouter = router({
  getDifficultyCalibration: adminProcedure.query(async () => {
    const [snapshot, v3Artifact, shadowCalibrationPreview] = await Promise.all([
      getGlobalDailyCalibrationSnapshot(),
      readDifficultyCalibrationV3Artifact(),
      buildShadowCalibrationPreview(),
    ]);
    return adminDifficultyCalibrationResponseSchema.parse({
      ...snapshot,
      v3Artifact,
      shadowCalibrationPreview,
    });
  }),
  reroll: adminProcedure.mutation(async () => {
    try {
      const reroll = await rerollAndPublish();
      return adminActionResponseSchema.parse({
        success: true,
        message: `Published ${reroll.levelId}`,
        levelId: reroll.levelId,
      });
    } catch (error) {
      return adminActionResponseSchema.parse({
        success: false,
        message: formatModeratorRerollError(error),
        levelId: null,
      });
    }
  }),
  injectManual: adminProcedure.input(adminInjectInputSchema).mutation(async ({ input }) => {
    const result = await injectAndPublishManualPuzzle({
      text: input.text,
      author: input.author ?? 'MODERATOR',
      difficulty: input.difficulty,
      challengeType: input.challengeType,
      allowAdjustment: true,
    });

    if (result.success && result.levelId) {
      return adminActionResponseSchema.parse({
        success: true,
        message: `Injected and published ${result.levelId}`,
        levelId: result.levelId,
      });
    } else if (result.levelId) {
      // Puzzle saved but publish failed
      return adminActionResponseSchema.parse({
        success: false,
        message: `Puzzle saved as ${result.levelId}, but publish failed: ${result.error}. Retry publishing this level.`,
        levelId: result.levelId,
      });
    } else {
      // Complete failure
      return adminActionResponseSchema.parse({
        success: false,
        message: result.error ?? 'Failed to inject manual puzzle',
        levelId: null,
      });
    }
  }),
  validateManualChallenge: adminProcedure
    .input(adminValidateManualChallengeInputSchema)
    .query(async ({ input }) => {
      const result = await preflightManualChallengeForPublish({
        text: input.text,
        difficulty: input.targetDifficulty,
        challengeType: input.challengeType,
      });
      return adminValidateManualChallengeResponseSchema.parse(result);
    }),
  injectManualChallengeWithAdjustment: adminProcedure
    .input(adminInjectManualChallengeWithAdjustmentInputSchema)
    .mutation(async ({ input }) => {
      const result = await injectManualChallengeWithAdjustment({
        text: input.text,
        author: input.author,
        targetDifficulty: input.targetDifficulty,
        challengeType: input.challengeType,
        allowAdjustment: input.allowAdjustment,
      });

      if (!result.success || !result.puzzle) {
        return adminInjectManualChallengeWithAdjustmentResponseSchema.parse({
          success: false,
          levelId: result.puzzle?.puzzlePrivate.levelId,
          feedback: result.feedback,
          error: result.error,
        });
      }

      const publishResult = await completeSavedManualPuzzlePublish({
        levelId: result.puzzle.puzzlePrivate.levelId,
        dateKey: result.puzzle.puzzlePrivate.dateKey,
      });

      return adminInjectManualChallengeWithAdjustmentResponseSchema.parse({
        success: publishResult.success,
        levelId: publishResult.levelId,
        postId: publishResult.postId,
        feedback: result.feedback,
        error: publishResult.error,
      });
    }),
  getMetrics: adminProcedure.query(async () => {
    return await getMetricsSnapshot();
  }),
  retryPublish: adminProcedure
    .input(adminRetryPublishInputSchema)
    .mutation(async ({ input }) => {
      const result = await retryPublishManualPuzzle({
        levelId: input.levelId,
      });

      if (result.success) {
        return adminRetryPublishResponseSchema.parse({
          success: true,
          message: `Successfully published ${input.levelId}`,
          levelId: input.levelId,
          postId: result.postId,
        });
      } else {
        return adminRetryPublishResponseSchema.parse({
          success: false,
          message: result.error ?? 'Failed to retry publishing',
          levelId: input.levelId,
          postId: null,
        });
      }
    }),
  listCommunitySubmissions: adminProcedure
    .input(communitySubmissionListInputSchema)
    .query(async ({ input }) =>
      communitySubmissionListResponseSchema.parse({
        submissions: await listCommunitySubmissionsForReview({
          status: input.status,
          limit: input.limit,
        }),
      })
    ),
  approveCommunitySubmission: adminProcedure
    .input(adminCommunityApproveInputSchema)
    .mutation(async ({ input }) => {
      try {
        const submission = await approveCommunitySubmission(input.submissionId);
        return communityActionResponseSchema.parse({
          success: true,
          message: submission.levelId
            ? `Approved as ${submission.levelId}.`
            : 'Submission approved.',
          submission,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Approval failed.';
        console.error('[admin] approveCommunitySubmission failed:', error);
        return communityActionResponseSchema.parse({
          success: false,
          message: reason,
          submission: null,
        });
      }
    }),
  rejectCommunitySubmission: adminProcedure
    .input(adminCommunityRejectInputSchema)
    .mutation(async ({ input }) => {
      try {
        const submission = await rejectCommunitySubmission({
          submissionId: input.submissionId,
          reason: input.reason,
        });
        return communityActionResponseSchema.parse({
          success: true,
          message: 'Submission rejected.',
          submission,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Rejection failed.';
        console.error('[admin] rejectCommunitySubmission failed:', error);
        return communityActionResponseSchema.parse({
          success: false,
          message: reason,
          submission: null,
        });
      }
    }),
  requestCommunitySubmissionChanges: adminProcedure
    .input(adminCommunityRequestChangesInputSchema)
    .mutation(async ({ input }) => {
      try {
        const submission = await requestCommunitySubmissionChanges({
          submissionId: input.submissionId,
          reason: input.reason,
        });
        return communityActionResponseSchema.parse({
          success: true,
          message: 'Changes requested from creator.',
          submission,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Request changes failed.';
        console.error('[admin] requestCommunitySubmissionChanges failed:', error);
        return communityActionResponseSchema.parse({
          success: false,
          message: reason,
          submission: null,
        });
      }
    }),
  removeCommunityPuzzle: adminProcedure
    .input(adminCommunityRemoveInputSchema)
    .mutation(async ({ input }) => {
      try {
        const submission = await removeCommunityPuzzle({
          submissionId: input.submissionId,
          reason: input.reason,
        });
        return communityActionResponseSchema.parse({
          success: true,
          message: 'Community puzzle removed.',
          submission,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Removal failed.';
        console.error('[admin] removeCommunityPuzzle failed:', error);
        return communityActionResponseSchema.parse({
          success: false,
          message: reason,
          submission: null,
        });
      }
    }),
  ...adminDebugProcedures,
});
