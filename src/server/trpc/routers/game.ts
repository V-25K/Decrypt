import { z } from 'zod';
import {
  gameBootstrapResponseSchema,
  gameContinueLevelInputSchema,
  gameContinueLevelResponseSchema,
  gameCompletedOutcomeSchema,
  gameCompleteSessionInputSchema,
  gameCompleteSessionResponseSchema,
  gameFailedOutcomeSchema,
  gameHeartbeatInputSchema,
  gameHeartbeatResponseSchema,
  gameLoadLevelInputSchema,
  gameLoadLevelResponseSchema,
  gamePreviewResponseSchema,
  gamePurchaseDailyRetryInputSchema,
  gamePurchaseDailyRetryResponseSchema,
  gameStartSessionInputSchema,
  gameStartSessionResponseSchema,
  gameSubmitGuessesInputSchema,
  gameSubmitGuessesResponseSchema,
  gameSubmitGuessInputSchema,
  gameSubmitGuessResponseSchema,
} from '../../../shared/game';
import {
  bootstrapGame,
  completeSessionForLevel,
  continueSessionForLevel,
  getCurrentPuzzleView,
  getDailyPreview,
  heartbeatSessionForLevel,
  loadLevelForUser,
  purchaseDailyRetryForLevel,
  startSessionForLevel,
  submitGuessesForSession,
  submitGuessForSession,
} from '../../core/game-service';
import { getRatingOutcomeReceipt } from '../../core/leaderboard';
import { getShareCompletionReceipt } from '../../core/share-receipts';
import { getCompletedLevels, getInventory, getUserProfile, hasFailedLevel } from '../../core/state';
import { router } from '../base';
import { authedProcedure, publicProcedure } from '../procedures';

export const gameRouter = router({
  bootstrap: authedProcedure.query(async () => {
    const data = await bootstrapGame();
    return gameBootstrapResponseSchema.parse(data);
  }),
  preview: publicProcedure.query(async () => {
    return gamePreviewResponseSchema.parse(await getDailyPreview());
  }),
  loadLevel: authedProcedure.input(gameLoadLevelInputSchema).query(async ({ input }) => {
    return gameLoadLevelResponseSchema.parse(
      await loadLevelForUser({
        mode: input.mode,
        requestedLevelId: input.requestedLevelId ?? null,
        dailyArchive: input.dailyArchive,
        excludeLevelId: input.excludeLevelId ?? null,
        ignorePostLevel: input.ignorePostLevel,
        categoryFilter: input.categoryFilter ?? null,
        endlessSort: input.endlessSort,
      })
    );
  }),
  startSession: authedProcedure
    .input(gameStartSessionInputSchema)
    .mutation(async ({ input }) => {
      return gameStartSessionResponseSchema.parse(
        await startSessionForLevel(input.levelId, input.mode)
      );
    }),
  purchaseDailyRetry: authedProcedure
    .input(gamePurchaseDailyRetryInputSchema)
    .mutation(async ({ input }) => {
      return gamePurchaseDailyRetryResponseSchema.parse(
        await purchaseDailyRetryForLevel({
          levelId: input.levelId,
          mode: input.mode,
        })
      );
	    }),
  continueLevel: authedProcedure
    .input(gameContinueLevelInputSchema)
    .mutation(async ({ input }) => {
      return gameContinueLevelResponseSchema.parse(
        await continueSessionForLevel({
          levelId: input.levelId,
          mode: input.mode,
        })
      );
    }),
  heartbeat: authedProcedure
    .input(gameHeartbeatInputSchema)
    .mutation(async ({ input }) => {
      const result = await heartbeatSessionForLevel({
        levelId: input.levelId,
        mode: input.mode,
      });
      return gameHeartbeatResponseSchema.parse(result);
    }),
  submitGuess: authedProcedure
    .input(gameSubmitGuessInputSchema)
    .mutation(async ({ input }) => {
      return gameSubmitGuessResponseSchema.parse(
        await submitGuessForSession({
          levelId: input.levelId,
          tileIndex: input.tileIndex,
          guessedLetter: input.guessedLetter,
        })
      );
    }),
  submitGuesses: authedProcedure
    .input(gameSubmitGuessesInputSchema)
    .mutation(async ({ input }) => {
      const result = await submitGuessesForSession({
        levelId: input.levelId,
        guesses: input.guesses,
      });
      return gameSubmitGuessesResponseSchema.parse(result);
    }),
  completeSession: authedProcedure
    .input(gameCompleteSessionInputSchema)
    .mutation(async ({ input }) => {
      return gameCompleteSessionResponseSchema.parse(
        await completeSessionForLevel({
          levelId: input.levelId,
          mode: input.mode,
        })
      );
    }),
  getCompletionReceipt: authedProcedure
    .input(z.object({ levelId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const receipt = await getShareCompletionReceipt(ctx.userId, input.levelId);
      return {
        solveSeconds: receipt?.solveSeconds ?? null,
      };
    }),
  getCompletedOutcome: authedProcedure
    .input(z.object({ levelId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const completedLevels = await getCompletedLevels(ctx.userId);
      if (!completedLevels.has(input.levelId)) {
        return null;
      }
      const [receipt, profile, inventory] = await Promise.all([
        getShareCompletionReceipt(ctx.userId, input.levelId),
        getUserProfile(ctx.userId),
        getInventory(ctx.userId),
      ]);
      return gameCompletedOutcomeSchema.parse({
        levelId: input.levelId,
        solveSeconds: receipt?.solveSeconds ?? null,
        score: receipt?.score ?? null,
        ratingDelta: receipt?.ratingDelta ?? null,
        ratingAfter: receipt?.ratingAfter ?? null,
        globalScoreAfter: receipt?.globalScoreAfter ?? null,
        completedAtTs: receipt?.completedAtTs ?? null,
        profile,
        inventory,
      });
    }),
  getFailedOutcome: authedProcedure
    .input(z.object({ levelId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const failed = await hasFailedLevel(ctx.userId, input.levelId);
      if (!failed) {
        return null;
      }
      const receipt = await getRatingOutcomeReceipt(
        ctx.userId,
        `loss:${input.levelId}`
      );
      return gameFailedOutcomeSchema.parse({
        levelId: input.levelId,
        ratingDelta: receipt?.ratingDelta ?? null,
        ratingAfter: receipt?.ratingAfter ?? null,
        pointsGained: 0,
      });
    }),
  getCurrentView: publicProcedure
    .input(z.object({ levelId: z.string().min(1) }))
    .query(async ({ input }) => {
      // revealedIndices are always sourced server-side from the stored session;
      // never accepted from the caller to prevent client-side tile reveal exploits.
      return await getCurrentPuzzleView({
        levelId: input.levelId,
        revealedIndices: [],
      });
    }),
});
