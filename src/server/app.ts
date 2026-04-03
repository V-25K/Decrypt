import { Hono } from 'hono';
import { trpcServer } from '@hono/trpc-server';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { schedulerRoutes } from './routes/scheduler';
import { forms } from './routes/forms';
import { paymentsRoutes } from './routes/payments';
import { settingsRoutes } from './routes/settings';
import { appRouter } from './trpc';
import { createContext } from './context';

const mountApiRoutes = (app: Hono) => {
  const api = new Hono();
  api.use(
    '/trpc/*',
    trpcServer({
      endpoint: '/api/trpc',
      router: appRouter,
      createContext,
    })
  );
  app.route('/api', api);
};

const mountInternalRoutes = (app: Hono) => {
  const internal = new Hono();
  internal.get('/health', (c) => {
    return c.json({ status: 'ok' }, 200);
  });
  internal.route('/menu', menu);
  internal.route('/triggers', triggers);
  internal.route('/scheduler', schedulerRoutes);
  internal.route('/forms', forms);
  internal.route('/payments', paymentsRoutes);
  internal.route('/settings', settingsRoutes);
  app.route('/internal', internal);
};

export const createApp = () => {
  const app = new Hono();

  app.onError((error, c) => {
    console.error(`[server] unhandled error ${c.req.method} ${c.req.path}:`, error);
    return c.json({ error: 'Internal server error' }, 500);
  });

  mountApiRoutes(app);
  mountInternalRoutes(app);
  return app;
};
