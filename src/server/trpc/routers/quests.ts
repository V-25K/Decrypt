import { z } from 'zod';
import {
  questClaimInputSchema,
  questStatusResponseSchema,
} from '../../../shared/game';
import { formatDateKey } from '../../core/serde';
import { claimQuest, getClaimedQuestIds, getQuestStatus } from '../../core/quests';
import { router } from '../base';
import { authedProcedure } from '../procedures';

export const questsRouter = router({
  getStatus: authedProcedure
    .input(z.object({ dateKey: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId;
      const dateKey = input.dateKey ?? formatDateKey(new Date());
      const [status, claimedQuestIds] = await Promise.all([
        getQuestStatus({ userId, dateKey }),
        getClaimedQuestIds({ userId, dateKey }),
      ]);
      return questStatusResponseSchema.parse({
        dailyDateKey: dateKey,
        progress: {
          ...status.lifetime,
          dailyPlayCount: status.daily.dailyPlayCount,
          dailyFastWin: status.daily.dailyFastWin,
          dailyNoPowerup: status.daily.dailyNoPowerup,
          dailyNoMistake: status.daily.dailyNoMistake,
          dailyShareCount: status.daily.dailyShareCount,
        },
        claimedQuestIds,
      });
    }),
  claim: authedProcedure.input(questClaimInputSchema).mutation(async ({ input, ctx }) => {
    const dateKey = formatDateKey(new Date());
    const userId = ctx.userId;
    const claimed = await claimQuest({
      userId,
      dateKey,
      questId: input.questId,
    });
    return {
      success: claimed.success,
      reason: claimed.reason,
      rewardCoins: claimed.rewardCoins,
      rewardInventory: claimed.inventory,
      profile: claimed.profile,
      inventory: claimed.inventory,
    };
  }),
});
