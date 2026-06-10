import { z } from 'zod';
import { getPlayerTimeStatsByUsername } from '../../core/debug';
import { adminProcedure } from '../procedures';

export const adminDebugProcedures = {
  getPlayerTimeStats: adminProcedure
    .input(
      z.object({
        username: z.string().min(1),
        dateKey: z.string().min(1).optional(),
      })
    )
    .query(async ({ input }) => {
      return await getPlayerTimeStatsByUsername({
        username: input.username,
        dateKey: input.dateKey,
      });
    }),
};
