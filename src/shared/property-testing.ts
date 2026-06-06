/**
 * Property-based testing configuration and utilities
 * Provides standardized setup for fast-check property tests
 */

import * as fc from 'fast-check';

/**
 * Standard property test configuration
 */
export const propertyTestConfig: fc.Parameters<unknown[]> = {
  numRuns: 100, // Minimum iterations per property
  timeout: 5000, // 5 second timeout per test
  seed: 42, // Reproducible test runs
  verbose: true, // Detailed failure reporting
  markInterruptAsFailure: true,
  interruptAfterTimeLimit: 5000
};

/**
 * Property test configuration for performance-sensitive tests
 */
const fastPropertyTestConfig: fc.Parameters<unknown[]> = {
  ...propertyTestConfig,
  numRuns: 50, // Fewer runs for performance tests
  timeout: 3000
};

/**
 * Property test configuration for comprehensive tests
 */
const comprehensivePropertyTestConfig: fc.Parameters<unknown[]> = {
  ...propertyTestConfig,
  numRuns: 200, // More runs for critical properties
  timeout: 10000
};

/**
 * Common arbitraries for game-related property tests
 */
export const gameArbitraries = {
  /**
   * Generate valid user IDs
   */
  userId: () => fc.string({ minLength: 1, maxLength: 50 }),

  /**
   * Generate valid coin amounts
   */
  coinAmount: () => fc.integer({ min: 0, max: 10000 }),

  /**
   * Generate valid heart amounts
   */
  heartAmount: () => fc.integer({ min: 0, max: 100 }),

  /**
   * Generate valid puzzle difficulty levels
   */
  difficulty: () => fc.integer({ min: 1, max: 10 }),

  /**
   * Generate valid retry counts
   */
  retryCount: () => fc.integer({ min: 0, max: 10 }),

  /**
   * Generate valid solve times in seconds
   */
  solveTime: () => fc.integer({ min: 1, max: 300 }),

  /**
   * Generate valid tile indices
   */
  tileIndex: () => fc.integer({ min: 0, max: 99 }),

  /**
   * Generate valid puzzle scores
   */
  puzzleScore: () => fc.integer({ min: 0, max: 1000 }),

  /**
   * Generate valid timestamps
   */
  timestamp: () => fc.integer({ min: Date.now() - 365 * 24 * 60 * 60 * 1000, max: Date.now() }),

  /**
   * Generate valid page numbers
   */
  pageNumber: () => fc.integer({ min: 1, max: 100 }),

  /**
   * Generate valid page sizes
   */
  pageSize: () => fc.integer({ min: 1, max: 100 }),

  /**
   * Generate user profile data
   */
  userProfile: () => fc.record({
    coins: gameArbitraries.coinAmount(),
    hearts: gameArbitraries.heartAmount(),
    level: fc.integer({ min: 1, max: 100 }),
    experience: fc.integer({ min: 0, max: 100000 })
  }),

  /**
   * Generate inventory data
   */
  inventory: () => fc.record({
    hammer: fc.integer({ min: 0, max: 50 }),
    wand: fc.integer({ min: 0, max: 50 }),
    shield: fc.integer({ min: 0, max: 50 }),
    rocket: fc.integer({ min: 0, max: 50 })
  }),

  /**
   * Generate guess request data
   */
  guessRequest: () => fc.record({
    tileIndex: gameArbitraries.tileIndex(),
    guessedLetter: fc.char(),
    sessionId: fc.string({ minLength: 10, maxLength: 20 }),
    timestamp: gameArbitraries.timestamp()
  }),

  /**
   * Generate leaderboard entry data
   */
  leaderboardEntry: () => fc.record({
    userId: gameArbitraries.userId(),
    score: gameArbitraries.puzzleScore(),
    rank: fc.integer({ min: 1, max: 10000 }),
    timestamp: gameArbitraries.timestamp()
  }),

  /**
   * Generate completion journal entry
   */
  completionEntry: () => fc.record({
    userId: gameArbitraries.userId(),
    puzzleId: fc.string({ minLength: 5, maxLength: 20 }),
    score: gameArbitraries.puzzleScore(),
    solveTime: gameArbitraries.solveTime(),
    timestamp: gameArbitraries.timestamp(),
    retryCount: gameArbitraries.retryCount()
  })
};

/**
 * Utility function to create property test with standard configuration
 */
function createPropertyTest<T extends readonly unknown[]>(
  name: string,
  arbitraries: fc.Arbitrary<T>,
  predicate: (args: T) => boolean | Promise<boolean>,
  config: fc.Parameters<T> = propertyTestConfig as fc.Parameters<T>
): fc.Property<T> {
  return fc.property(arbitraries, predicate).beforeEach(() => {
    // Reset any global state before each test
    // This can be extended as needed
  });
}

/**
 * Utility function to run property test with error handling
 */
async function runPropertyTest<T extends readonly unknown[]>(
  property: fc.Property<T>,
  config: fc.Parameters<T> = propertyTestConfig as fc.Parameters<T>
): Promise<void> {
  try {
    await fc.assert(property, config);
  } catch (error) {
    // Enhanced error reporting for property test failures
    if (error instanceof Error) {
      console.error(`Property test failed: ${error.message}`);
      if ('counterexample' in error) {
        console.error('Counterexample:', (error as any).counterexample);
      }
    }
    throw error;
  }
}

/**
 * Performance property test utilities
 */
const performanceProperties = {
  /**
   * Assert that an operation completes within a time limit
   */
  completesWithinTime: <T>(
    operation: () => Promise<T>,
    maxTimeMs: number
  ) => async (): Promise<boolean> => {
    const startTime = performance.now();
    await operation();
    const duration = performance.now() - startTime;
    return duration <= maxTimeMs;
  },

  /**
   * Assert that an operation improves performance by a percentage
   */
  improvesPerformanceBy: <T>(
    baselineOperation: () => Promise<T>,
    optimizedOperation: () => Promise<T>,
    improvementPercentage: number
  ) => async (): Promise<boolean> => {
    // Measure baseline
    const baselineStart = performance.now();
    await baselineOperation();
    const baselineTime = performance.now() - baselineStart;

    // Measure optimized
    const optimizedStart = performance.now();
    await optimizedOperation();
    const optimizedTime = performance.now() - optimizedStart;

    const improvement = (baselineTime - optimizedTime) / baselineTime;
    return improvement >= improvementPercentage / 100;
  },

  /**
   * Assert that memory usage doesn't exceed a limit
   */
  memoryUsageWithinLimit: (
    operation: () => void,
    maxMemoryMB: number
  ) => (): boolean => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;
    operation();
    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryUsedMB = (finalMemory - initialMemory) / (1024 * 1024);
    return memoryUsedMB <= maxMemoryMB;
  }
};