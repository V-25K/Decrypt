import { powerupPurchaseInputSchema, powerupUseInputSchema } from '../../../shared/game';
import { purchasePowerup } from '../../core/economy';
import { usePowerupForSession } from '../../core/game-service';
import { router } from '../base';
import { authedProcedure } from '../procedures';

export const powerupRouter = router({
  purchase: authedProcedure
    .input(powerupPurchaseInputSchema)
    .mutation(async ({ input, ctx }) => {
      return await purchasePowerup({
        userId: ctx.userId!,
        itemType: input.itemType,
        quantity: input.quantity,
      });
    }),
  use: authedProcedure.input(powerupUseInputSchema).mutation(async ({ input }) => {
    return await usePowerupForSession({
      levelId: input.levelId,
      itemType: input.itemType,
      targetIndex: input.targetIndex ?? null,
    });
  }),
});
