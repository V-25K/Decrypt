import {
  adminActionResponseSchema,
  adminActivateEndlessCatalogInputSchema,
  adminActivateEndlessCatalogResponseSchema,
  adminDifficultyCalibrationResponseSchema,
  adminInjectInputSchema,
  adminValidateManualChallengeInputSchema,
  adminValidateManualChallengeResponseSchema,
  adminInjectManualChallengeWithAdjustmentInputSchema,
  adminInjectManualChallengeWithAdjustmentResponseSchema,
} from '../../../shared/game';
import { endlessStagingCollisionReportSchema } from '../../../shared/endless';
import {
  activateEndlessCatalogVersion,
  formatModeratorRerollError,
  getEndlessStagingCollisionReport,
  getEndlessCatalogAdminStatus,
  injectAndPublishManualPuzzle,
  rerollAndPublish,
  preflightManualChallengeForPublish,
  injectManualChallengeWithAdjustment,
} from '../../core/admin';
import { getGlobalDailyCalibrationSnapshot } from '../../core/difficulty-calibration';
import { publishAndActivateDailyPost } from '../../core/generator';
import { getMetricsSnapshot } from '../../core/metrics';
import { router } from '../base';
import { adminProcedure } from '../procedures';
import { adminDebugProcedures } from './admin.debug';

const getManualPublishFailureLevelId = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const name = Reflect.get(error, 'name');
  const levelId = Reflect.get(error, 'levelId');
  if (name !== 'ManualPuzzlePublishFailedError' || typeof levelId !== 'string') {
    return null;
  }
  return levelId;
};

export const adminRouter = router({
  getDifficultyCalibration: adminProcedure.query(async () => {
    const snapshot = await getGlobalDailyCalibrationSnapshot();
    return adminDifficultyCalibrationResponseSchema.parse(snapshot);
  }),
  getEndlessCatalogStatus: adminProcedure.query(async () => {
    return await getEndlessCatalogAdminStatus();
  }),
  auditEndlessStagingCollisions: adminProcedure.query(async () => {
    const report = await getEndlessStagingCollisionReport();
    return endlessStagingCollisionReportSchema.parse(report);
  }),
  activateEndlessCatalog: adminProcedure
    .input(adminActivateEndlessCatalogInputSchema)
    .mutation(async ({ input }) => {
      const status = await activateEndlessCatalogVersion(input.catalogVersion);
      return adminActivateEndlessCatalogResponseSchema.parse({
        success: true,
        message: `Activated endless catalog ${input.catalogVersion}`,
        status,
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
    try {
      const injected = await injectAndPublishManualPuzzle({
        text: input.text,
        author: 'MODERATOR',
        difficulty: input.difficulty,
        challengeType: input.challengeType,
      });
      return adminActionResponseSchema.parse({
        success: true,
        message: `Injected and published ${injected.levelId}`,
        levelId: injected.levelId,
      });
    } catch (error) {
      const levelId = getManualPublishFailureLevelId(error);
      if (levelId) {
        return adminActionResponseSchema.parse({
          success: false,
          message: `Puzzle saved as ${levelId}, but publish failed. Retry that level.`,
          levelId,
        });
      }
      throw error;
    }
  }),
  validateManualChallenge: adminProcedure
    .input(adminValidateManualChallengeInputSchema)
    .query(async ({ input }) => {
      const result = await preflightManualChallengeForPublish({
        text: input.text,
        difficulty: input.targetDifficulty,
        challengeType: 'QUOTE',
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

      try {
        const postId = await publishAndActivateDailyPost({
          levelId: result.puzzle.puzzlePrivate.levelId,
          dateKey: result.puzzle.puzzlePrivate.dateKey,
          runAs: 'APP',
        });

        return adminInjectManualChallengeWithAdjustmentResponseSchema.parse({
          success: true,
          levelId: result.puzzle.puzzlePrivate.levelId,
          postId,
          feedback: result.feedback,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown publish error';
        return adminInjectManualChallengeWithAdjustmentResponseSchema.parse({
          success: false,
          levelId: result.puzzle.puzzlePrivate.levelId,
          feedback: result.feedback,
          error: `Puzzle saved as ${result.puzzle.puzzlePrivate.levelId}, but publish failed: ${reason}`,
        });
      }
    }),
  getMetrics: adminProcedure.query(async () => {
    return getMetricsSnapshot();
  }),
  ...adminDebugProcedures,
});
