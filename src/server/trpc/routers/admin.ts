import {
  adminActionResponseSchema,
  adminActivateEndlessCatalogInputSchema,
  adminActivateEndlessCatalogResponseSchema,
  adminDifficultyCalibrationResponseSchema,
  adminInjectInputSchema,
} from '../../../shared/game';
import { endlessStagingCollisionReportSchema } from '../../../shared/endless';
import {
  activateEndlessCatalogVersion,
  getEndlessStagingCollisionReport,
  getEndlessCatalogAdminStatus,
  injectAndPublishManualPuzzle,
  rerollAndPublish,
} from '../../core/admin';
import { getGlobalDailyCalibrationSnapshot } from '../../core/difficulty-calibration';
import { router } from '../base';
import { adminProcedure } from '../procedures';
import { adminDebugProcedures } from './admin.debug';

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
    const reroll = await rerollAndPublish();
    return adminActionResponseSchema.parse({
      success: true,
      message: `Published ${reroll.levelId}`,
      levelId: reroll.levelId,
    });
  }),
  injectManual: adminProcedure.input(adminInjectInputSchema).mutation(async ({ input }) => {
    const injected = await injectAndPublishManualPuzzle({
      text: input.text,
      difficulty: input.difficulty,
      challengeType: input.challengeType,
    });
    return adminActionResponseSchema.parse({
      success: true,
      message: `Injected and published ${injected.levelId}`,
      levelId: injected.levelId,
    });
  }),
  ...adminDebugProcedures,
});
