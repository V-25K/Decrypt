import { describe, it, expect, vi } from 'vitest';
import { LeaderboardScreen } from './LeaderboardScreen';

// Mock the tRPC client
vi.mock('../trpc', () => ({
  trpc: {
    leaderboard: {
      getDailyPage: {
        query: vi.fn(),
      },
      getAllTimeLevelsPage: {
        query: vi.fn(),
      },
      navigateDailyNext: {
        query: vi.fn(),
      },
      navigateDailyPrevious: {
        query: vi.fn(),
      },
      navigateDailyFirst: {
        query: vi.fn(),
      },
      navigateDailyLast: {
        query: vi.fn(),
      },
      navigateAllTimeLevelsNext: {
        query: vi.fn(),
      },
      navigateAllTimeLevelsPrevious: {
        query: vi.fn(),
      },
      navigateAllTimeLevelsFirst: {
        query: vi.fn(),
      },
      navigateAllTimeLevelsLast: {
        query: vi.fn(),
      },
    },
  },
}));

describe('LeaderboardScreen', () => {
  it('should be a valid React component', () => {
    expect(typeof LeaderboardScreen).toBe('function');
  });

  it('should export the component correctly', () => {
    expect(LeaderboardScreen).toBeDefined();
    expect(LeaderboardScreen.name).toBe('LeaderboardScreen');
  });

  it('should have the correct component structure', () => {
    // Verify the component is a function that can accept props
    expect(LeaderboardScreen.length).toBeGreaterThan(0); // Has parameters
  });
});