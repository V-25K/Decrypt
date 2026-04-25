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
  let allowed = false;
  try {
    allowed = await hasAdminAccess({
      subredditName: ctx.subredditName,
      username: ctx.username,
    });
  } catch (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        error instanceof Error && error.message.trim().length > 0
          ? `Unable to verify moderator access: ${error.message}`
          : 'Unable to verify moderator access right now.',
    });
  }
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Moderator access required.',
    });
  }
  return next();
});
