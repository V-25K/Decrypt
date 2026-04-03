import { socialShareInputSchema } from '../../../shared/game';
import { trackShareQuest } from '../../core/game-service';
import { getPuzzlePrivate } from '../../core/puzzle-store';
import { getShareCompletionReceipt, markLevelSharedOnce } from '../../core/share-receipts';
import { shareResultAsComment } from '../../core/social';
import { router } from '../base';
import { authedProcedure } from '../procedures';

export const socialRouter = router({
  shareResult: authedProcedure
    .input(socialShareInputSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const puzzle = await getPuzzlePrivate(input.levelId);
      if (!puzzle) {
        return {
          success: false,
          reason: 'Puzzle not found.',
          commentId: null,
        };
      }
      const receipt = await getShareCompletionReceipt(userId, input.levelId);
      if (!receipt) {
        return {
          success: false,
          reason: 'No verified completion found for this level.',
          commentId: null,
        };
      }
      const shared = await shareResultAsComment({
        levelId: input.levelId,
        solveSeconds: receipt.solveSeconds,
        mistakes: receipt.mistakes,
        heartsRemaining: receipt.heartsRemaining,
        usedPowerups: receipt.usedPowerups,
        score: receipt.score ?? null,
      });
      if (shared.success) {
        const firstShareForLevel = await markLevelSharedOnce(userId, input.levelId);
        if (firstShareForLevel) {
          await trackShareQuest({
            levelId: input.levelId,
            dateKey: puzzle.dateKey,
          });
        }
      }
      return shared;
    }),
});
