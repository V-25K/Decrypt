import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import type { Context as HonoContext } from 'hono';
import { context as devvitContext } from '@devvit/web/server';

export async function createContext(
  _options: FetchCreateContextFnOptions,
  _c: HonoContext
) {
  return {
    userId: devvitContext.userId ?? null,
    username: devvitContext.username ?? null,
    subredditName: devvitContext.subredditName ?? null,
    postId: devvitContext.postId ?? null,
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;
