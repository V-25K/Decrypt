import { TRPCError } from '@trpc/server';
import { hasAdminAccess } from '../core/admin-auth';
import { publicProcedure } from './base';

export { publicProcedure };

export const authedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in.',
    });
  }
  return next();
});

export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const allowed = await hasAdminAccess({
    subredditName: ctx.subredditName,
    username: ctx.username,
  });
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Moderator access required.',
    });
  }
  return next();
});
