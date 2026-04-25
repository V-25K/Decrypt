import { z } from 'zod';
import {
  leaderboardGetInputSchema,
  leaderboardGetLevelInputSchema,
  leaderboardRankSummarySchema,
  dailyLeaderboardPageInputSchema,
  levelLeaderboardPageInputSchema,
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
import { createLeaderboardNavigation } from '../../core/leaderboard-navigation';
import { paginatedLeaderboardService } from '../../core/paginated-leaderboard-service';
import { getUserProfile } from '../../core/state';
import { formatDateKey } from '../../core/serde';
import { router } from '../base';
import { authedProcedure, publicProcedure } from '../procedures';

const normalizeDailyPageInput = (
  input: z.infer<typeof dailyLeaderboardPageInputSchema>
) => ({
  ...input,
  dateKey: input.dateKey ?? undefined,
});

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

  // Navigation endpoints
  navigateDailyToPage: publicProcedure
    .input(dailyLeaderboardPageInputSchema.extend({ targetPage: z.number().int().positive() }))
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('daily', normalizeDailyPageInput(input));
      return await navigation.goToPage(input.targetPage);
    }),

  navigateDailyNext: publicProcedure
    .input(dailyLeaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('daily', normalizeDailyPageInput(input));
      return await navigation.nextPage();
    }),

  navigateDailyPrevious: publicProcedure
    .input(dailyLeaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('daily', normalizeDailyPageInput(input));
      return await navigation.previousPage();
    }),

  navigateDailyFirst: publicProcedure
    .input(dailyLeaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('daily', normalizeDailyPageInput(input));
      return await navigation.goToFirstPage();
    }),

  navigateDailyLast: publicProcedure
    .input(dailyLeaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('daily', normalizeDailyPageInput(input));
      return await navigation.goToLastPage();
    }),

  navigateLevelToPage: publicProcedure
    .input(levelLeaderboardPageInputSchema.extend({ targetPage: z.number().int().positive() }))
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('level', input);
      return await navigation.goToPage(input.targetPage);
    }),

  navigateLevelNext: publicProcedure
    .input(levelLeaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('level', input);
      return await navigation.nextPage();
    }),

  navigateLevelPrevious: publicProcedure
    .input(levelLeaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('level', input);
      return await navigation.previousPage();
    }),

  navigateLevelFirst: publicProcedure
    .input(levelLeaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('level', input);
      return await navigation.goToFirstPage();
    }),

  navigateLevelLast: publicProcedure
    .input(levelLeaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('level', input);
      return await navigation.goToLastPage();
    }),

  navigateAllTimeLevelsToPage: publicProcedure
    .input(leaderboardPageInputSchema.extend({ targetPage: z.number().int().positive() }))
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLevels', input);
      return await navigation.goToPage(input.targetPage);
    }),

  navigateAllTimeLevelsNext: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLevels', input);
      return await navigation.nextPage();
    }),

  navigateAllTimeLevelsPrevious: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLevels', input);
      return await navigation.previousPage();
    }),

  navigateAllTimeLevelsFirst: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLevels', input);
      return await navigation.goToFirstPage();
    }),

  navigateAllTimeLevelsLast: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLevels', input);
      return await navigation.goToLastPage();
    }),

  navigateAllTimeLogicToPage: publicProcedure
    .input(leaderboardPageInputSchema.extend({ targetPage: z.number().int().positive() }))
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLogic', input);
      return await navigation.goToPage(input.targetPage);
    }),

  navigateAllTimeLogicNext: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLogic', input);
      return await navigation.nextPage();
    }),

  navigateAllTimeLogicPrevious: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema.nullable())
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLogic', input);
      return await navigation.previousPage();
    }),

  navigateAllTimeLogicFirst: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLogic', input);
      return await navigation.goToFirstPage();
    }),

  navigateAllTimeLogicLast: publicProcedure
    .input(leaderboardPageInputSchema)
    .output(leaderboardPageSchema)
    .query(async ({ input }) => {
      const navigation = createLeaderboardNavigation('allTimeLogic', input);
      return await navigation.goToLastPage();
    }),
});
