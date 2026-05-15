import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Needed due to the custom conditions within devvit web
    typecheck: {
      enabled: false,
    },
    reporters: ['dot'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        test: {
          name: 'server',
          include: ['src/server/**/*.test.ts'],
          exclude: [
            'src/server/**/*exploration*.test.ts',
            'src/server/**/*property*.test.ts',
            'src/server/core/generator.test.ts',
            'src/server/core/leaderboard-pagination-correctness.test.ts',
            'src/server/core/leaderboard.rank.test.ts',
            'src/server/core/puzzle.phase2.test.ts',
            'src/server/core/puzzle.phase3.test.ts',
          ],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'client',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: [
            'src/server/**/*',
            'src/**/*exploration*.test.ts',
            'src/**/*property*.test.ts',
            'src/client/app/complete-system-integration-client.test.ts',
          ],
          environment: 'jsdom',
        },
      },
    ],
  },
});
