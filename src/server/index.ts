import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { createApp } from './app';

const app = createApp();

serve({
  fetch: app.fetch,
  createServer: createServer,
  port: getServerPort(),
});
