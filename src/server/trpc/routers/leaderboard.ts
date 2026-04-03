import { z } from 'zod';
import {
  leaderboardGetInputSchema,
  leaderboardGetLevelInputSchema,
  leaderboardRankSummarySchema,
} from '../../../shared/game';
import {
  getAllTimeTopLevels,
  getAllTimeTopLogic,
  getDailyTop,
  getLevelTop,
  getUserRankSummary,
} from '../../core/leaderboard';
import { formatDateKey } from '../../core/serde';
import { getUserProfile } from '../../core/state';
import { router } from '../base';
import { authedProcedure, publicProcedure } from '../procedures';

export const leaderboardRouter = router({
  getDaily: publicProcedure.input(leaderboardGetInputSchema).query(async ({ input }) => {
    const dateKey = input.dateKey ?? formatDateKey(new Date());
    const limit = input.limit ?? 10;
    return {
      entries: await getDailyTop(dateKey, limit),
    };
  }),
  getLevel: publicProcedure
    .input(leaderboardGetLevelInputSchema)
    .query(async ({ input }) => {
      const limit = input.limit ?? 10;
      return {
        entries: await getLevelTop(input.levelId, limit),
      };
    }),
  getAllTime: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(50).optional() }))
    .query(async ({ input }) => {
      const limit = input.limit ?? 10;
      return {
        levels: await getAllTimeTopLevels(limit),
        logic: await getAllTimeTopLogic(limit),
      };
    }),
  getRankSummary: authedProcedure
    .input(z.object({ dateKey: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const dateKey = input.dateKey ?? formatDateKey(new Date());
      const [summary, profile] = await Promise.all([
        getUserRankSummary({
          userId: ctx.userId!,
          dateKey,
        }),
        getUserProfile(ctx.userId!),
      ]);
      return leaderboardRankSummarySchema.parse({
        dailyRank: summary.dailyRank,
        endlessRank: summary.endlessRank,
        currentRank: summary.currentRank,
        bestOverallRank: profile.bestOverallRank > 0 ? profile.bestOverallRank : null,
      });
    }),
});
