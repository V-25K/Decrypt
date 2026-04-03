import { initTRPC } from '@trpc/server';
import { transformer } from '../../shared/transformer';
import type { Context } from '../context';

const t = initTRPC.context<Context>().create({
  transformer,
});

export const router = t.router;
export const publicProcedure = t.procedure;
