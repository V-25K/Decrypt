import { z } from 'zod';
import {
  leaderboardGetInputSchema,
  leaderboardGetLevelInputSchema,
  leaderboardRankSummarySchema,
  levelLeaderboardPageInputSchema,
  dailyLeaderboardPageInputSchema,
  leaderboardPageInputSchema,
  leaderboardPageSchema,
} from '../../../shared/game';
import {
  getAllTimeTopLevels,
  getAllTimeTopLogic,
  getDailyTop,
  getLevelTop,
  getUserRankSummary,
} from '../../core/leaderboard';
import { paginatedLeaderboardService } from '../../core/paginated-leaderboard-service';
import { getUserProfile } from '../../core/state';
import { formatDateKey } from '../../core/serde';
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
  getDailyPage: publicProcedure
    .input(dailyLeaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      return await paginatedLeaderboardService.getDailyLeaderboardPage({
        ...input,
        dateKey: input.dateKey ?? undefined,
      });
    }),
  getLevel: publicProcedure
    .input(leaderboardGetLevelInputSchema)
    .query(async ({ input }) => {
      const limit = input.limit ?? 10;
      return {
        entries: await getLevelTop(input.levelId, limit),
      };
    }),
  getLevelPage: publicProcedure
    .input(levelLeaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      return await paginatedLeaderboardService.getLevelLeaderboardPage(input);
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
  getAllTimeLevelsPage: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      return await paginatedLeaderboardService.getAllTimeLevelsLeaderboardPage(input);
    }),
  getAllTimeLogicPage: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      return await paginatedLeaderboardService.getAllTimeLogicLeaderboardPage(input);
    }),
  getRankSummary: authedProcedure
    .input(z.object({ dateKey: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const dateKey = input.dateKey ?? formatDateKey(new Date());
      // Use getUserProfile so bestOverallRank goes through the same normalization
      // path (heart refill, flair dedup) as every other profile read, rather than
      // bypassing it with a raw Redis hGet.
      const [summary, profile] = await Promise.all([
        getUserRankSummary({
          userId: ctx.userId,
          dateKey,
        }),
        getUserProfile(ctx.userId),
      ]);
      const bestOverallRank = profile.bestOverallRank;
      return leaderboardRankSummarySchema.parse({
        dailyRank: summary.dailyRank,
        endlessRank: summary.endlessRank,
        currentRank: summary.currentRank,
        bestOverallRank:
          Number.isFinite(bestOverallRank) && bestOverallRank > 0
            ? Math.floor(bestOverallRank)
            : null,
      });
    }),
});
