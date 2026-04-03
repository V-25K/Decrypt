import { router } from './trpc/base';
import { adminRouter } from './trpc/routers/admin';
import { gameRouter } from './trpc/routers/game';
import { leaderboardRouter } from './trpc/routers/leaderboard';
import { powerupRouter } from './trpc/routers/powerup';
import { profileRouter } from './trpc/routers/profile';
import { questsRouter } from './trpc/routers/quests';
import { socialRouter } from './trpc/routers/social';
import { storeRouter } from './trpc/routers/store';

export const appRouter = router({
  game: gameRouter,
  powerup: powerupRouter,
  leaderboard: leaderboardRouter,
  quests: questsRouter,
  social: socialRouter,
  admin: adminRouter,
  store: storeRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
