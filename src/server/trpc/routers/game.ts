import { z } from 'zod';
import {
  gameBootstrapResponseSchema,
  gameCompleteSessionInputSchema,
  gameHeartbeatInputSchema,
  gameHeartbeatResponseSchema,
  gameLoadLevelInputSchema,
  gameStartSessionInputSchema,
  gameSubmitGuessesInputSchema,
  gameSubmitGuessesResponseSchema,
  gameSubmitGuessInputSchema,
} from '../../../shared/game';
import {
  bootstrapGame,
  completeSessionForLevel,
  getCurrentPuzzleView,
  heartbeatSessionForLevel,
  loadLevelForUser,
  startSessionForLevel,
  submitGuessesForSession,
  submitGuessForSession,
} from '../../core/game-service';
import { getShareCompletionReceipt } from '../../core/share-receipts';
import { router } from '../base';
import { authedProcedure, publicProcedure } from '../procedures';

export const gameRouter = router({
  bootstrap: authedProcedure.query(async () => {
    const data = await bootstrapGame();
    return gameBootstrapResponseSchema.parse(data);
  }),
  loadLevel: authedProcedure.input(gameLoadLevelInputSchema).query(async ({ input }) => {
    return await loadLevelForUser({
      mode: input.mode,
      requestedLevelId: input.requestedLevelId ?? null,
    });
  }),
  startSession: authedProcedure
    .input(gameStartSessionInputSchema)
    .mutation(async ({ input }) => {
      return await startSessionForLevel(input.levelId, input.mode);
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
      return await submitGuessForSession({
        levelId: input.levelId,
        tileIndex: input.tileIndex,
        guessedLetter: input.guessedLetter,
      });
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
      return await completeSessionForLevel({
        levelId: input.levelId,
        mode: input.mode,
      });
    }),
  getCompletionReceipt: authedProcedure
    .input(z.object({ levelId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const receipt = await getShareCompletionReceipt(ctx.userId!, input.levelId);
      return {
        solveSeconds: receipt?.solveSeconds ?? null,
      };
    }),
  getCurrentView: publicProcedure
    .input(z.object({ levelId: z.string().min(1), revealedIndices: z.array(z.number()).optional() }))
    .query(async ({ input }) => {
      return await getCurrentPuzzleView({
        levelId: input.levelId,
        revealedIndices: input.revealedIndices ?? [],
      });
    }),
});
