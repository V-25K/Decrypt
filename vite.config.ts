import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';

const normalizeChunkPath = (id: string): string => id.replaceAll('\\', '/');

const manualChunks = (id: string): string | undefined => {
  const normalizedId = normalizeChunkPath(id);

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
    normalizedId.includes('/node_modules/superjson/') ||
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
          rollupOptions: {
            output: {
              manualChunks,
              sourcemapFileNames: '[name]-[hash].js.map',
            },
          },
        },
      },
    }),
  ],
});
