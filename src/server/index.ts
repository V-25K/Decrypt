import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { createApp } from './app';

const devvitLogStreamAuthFailureMessage =
  'failed to authenticate plugin request; upstream request missing or timed out';
const devvitLogStreamAuthFailureCode = 'UNAUTHENTICATED';

const shouldIgnoreDevvitLogStreamAuthFailure = (reason: unknown): boolean => {
  const candidates: string[] = [];
  if (reason instanceof Error) {
    candidates.push(reason.message);
    if (typeof reason.stack === 'string') {
      candidates.push(reason.stack);
    }
  }
  if (reason && typeof reason === 'object') {
    const details = Reflect.get(reason, 'details');
    if (typeof details === 'string') {
      candidates.push(details);
    }
    const code = Reflect.get(reason, 'code');
    if (typeof code === 'string' || typeof code === 'number') {
      candidates.push(String(code));
    }
  }
  candidates.push(String(reason));

  const haystack = candidates.join('\n');
  return (
    haystack.includes(devvitLogStreamAuthFailureMessage) &&
    (haystack.includes(devvitLogStreamAuthFailureCode) ||
      haystack.includes('GenericPluginClient.LogStream'))
  );
};

process.on('unhandledRejection', (reason) => {
  if (shouldIgnoreDevvitLogStreamAuthFailure(reason)) {
    return;
  }
  console.error('Fatal Unhandled Promise rejected:', reason);
});

const app = createApp();

serve({
  fetch: app.fetch,
  createServer: createServer,
  port: getServerPort(),
});
