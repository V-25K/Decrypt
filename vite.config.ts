import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

const isRollupWatchMode = process.env.ROLLUP_WATCH === 'true';

const normalizeChunkPath = (id: string): string => id.replaceAll('\\', '/');

const manualChunks = (id: string): string | undefined => {
  const normalizedId = normalizeChunkPath(id);

  // Keep the inline preview React-free (Devvit inline-mode perf; guarded by
  // scripts/check-preview-bundle.mjs). preview.ts lazily `import('./game')`,
  // which Vite wraps with a `__vitePreload` helper. By default that helper is
  // hoisted into the React `game-shell` chunk, and the preview entry then
  // STATICALLY imports game-shell just to get the helper -> React executes on
  // inline load. Pin the helper to its own tiny chunk. (Must precede the
  // GameApp/components rules.)
  if (normalizedId.includes('vite/preload-helper')) {
    return 'vite-runtime';
  }
  // The small, React-free helpers preview.ts statically imports must also not
  // live in game-shell, or the preview entry imports game-shell to reach them.
  if (
    normalizedId.endsWith('/src/client/app/game-storage.ts') ||
    normalizedId.endsWith('/src/client/app/challenge-backgrounds.ts') ||
    normalizedId.endsWith('/src/client/app/level-number.ts') ||
    normalizedId.endsWith('/src/shared/game.ts')
  ) {
    return 'preview-lite';
  }

  if (normalizedId.includes('/node_modules/react/')) {
    return 'react-vendor';
  }
  if (
    normalizedId.includes('/node_modules/react-dom/') ||
    normalizedId.includes('/node_modules/scheduler/')
  ) {
    return 'react-dom-vendor';
  }
  if (
    normalizedId.includes('/node_modules/@devvit/') ||
    normalizedId.includes('/node_modules/@trpc/') ||
    normalizedId.includes('/node_modules/zod/')
  ) {
    return 'devvit-vendor';
  }
  if (normalizedId.endsWith('/src/client/app/GameApp.tsx')) {
    return 'game-shell';
  }
  if (normalizedId.includes('/src/client/components/')) {
    return 'game-ui';
  }

  return undefined;
};

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    devvit({
      client: {
        build: {
          ...(isRollupWatchMode ? { sourcemap: false } : {}),
          // Don't auto-warm dynamic-import targets with <link rel="modulepreload">.
          // For the inline preview that would prefetch the React/game chunks on
          // the feed surface. game.html loads its chunks via direct <script> tags,
          // so it is unaffected; lazy screens just load on demand.
          modulePreload: false,
          rollupOptions: {
            output: {
              manualChunks,
              sourcemapFileNames: '[name]-[hash].js.map',
            },
          },
        },
      },
      server: {
        build: {
          ...(isRollupWatchMode ? { sourcemap: false, minify: false } : {}),
        },
      },
    }),
  ],
});
