import { z } from 'zod';
import {
  gameBootstrapResponseSchema,
  gameCompletedOutcomeSchema,
  gameCompleteSessionInputSchema,
  gameCompleteSessionResponseSchema,
  gameHeartbeatInputSchema,
  gameHeartbeatResponseSchema,
  gameLoadLevelInputSchema,
  gameLoadLevelResponseSchema,
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
  getCurrentPuzzleView,
  heartbeatSessionForLevel,
  loadLevelForUser,
  purchaseDailyRetryForLevel,
  startSessionForLevel,
  submitGuessesForSession,
  submitGuessForSession,
} from '../../core/game-service';
import { getShareCompletionReceipt } from '../../core/share-receipts';
import { getCompletedLevels, getInventory, getUserProfile } from '../../core/state';
import { router } from '../base';
import { authedProcedure, publicProcedure } from '../procedures';

export const gameRouter = router({
  bootstrap: authedProcedure.query(async () => {
    const data = await bootstrapGame();
    return gameBootstrapResponseSchema.parse(data);
  }),
  loadLevel: authedProcedure.input(gameLoadLevelInputSchema).query(async ({ input }) => {
    return gameLoadLevelResponseSchema.parse(
      await loadLevelForUser({
        mode: input.mode,
        requestedLevelId: input.requestedLevelId ?? null,
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
        completedAtTs: receipt?.completedAtTs ?? null,
        profile,
        inventory,
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
