import { socialShareInputSchema } from '../../../shared/game';
import { trackShareQuest } from '../../core/game-service';
import { getPuzzlePrivate } from '../../core/puzzle-store';
import {
  clearLevelSharedMark,
  getShareCompletionReceipt,
  markLevelSharedOnce,
} from '../../core/share-receipts';
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
      if (typeof receipt.score !== 'number') {
        return {
          success: false,
          reason: 'Score unavailable for this level.',
          commentId: null,
        };
      }
      const firstShareForLevel = await markLevelSharedOnce(userId, input.levelId);
      if (!firstShareForLevel) {
        return {
          success: true,
          reason: 'Result already shared for this level.',
          commentId: null,
        };
      }
      const shared = await shareResultAsComment({
        levelId: input.levelId,
        solveSeconds: receipt.solveSeconds,
        mistakes: receipt.mistakes,
        heartsRemaining: receipt.heartsRemaining,
        usedPowerups: receipt.usedPowerups,
        score: receipt.score,
      });
      if (shared.success) {
        await trackShareQuest({
          levelId: input.levelId,
          dateKey: puzzle.dateKey,
        });
        return shared;
      }
      await clearLevelSharedMark(userId, input.levelId);
      return {
        success: false,
        reason: shared.reason,
        commentId: shared.commentId,
      };
    }),
});
