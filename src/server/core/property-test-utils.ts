/**
 * Property-Based Testing Utilities using fast-check
 * 
 * Provides common generators and test patterns for game logic validation
 */

import * as fc from 'fast-check';

/**
 * Common generators for game entities
 */
export const GameGenerators = {
  /**
   * Generate valid user IDs
   */
  userId: () => fc.string({ minLength: 5, maxLength: 20 }).map(s => `t2_${s}`),

  /**
   * Generate valid level IDs
   */
  levelId: () => fc.string({ minLength: 8, maxLength: 15 }).map(s => `level_${s}`),

  /**
   * Generate heart counts (0-3)
   */
  heartCount: () => fc.integer({ min: 0, max: 3 }),

  /**
   * Generate coin amounts
   */
  coinAmount: () => fc.integer({ min: 0, max: 10000 }),

  /**
   * Generate timestamps
   */
  timestamp: () => fc.integer({ min: 1000000000000, max: 2000000000000 }),

  /**
   * Generate time intervals in milliseconds
   */
  timeInterval: () => fc.integer({ min: 1000, max: 3600000 }), // 1 second to 1 hour

  /**
   * Generate powerup types
   */
  powerupType: () => fc.constantFrom('hammer', 'wand', 'shield', 'rocket'),

  /**
   * Generate retry counts
   */
  retryCount: () => fc.integer({ min: 0, max: 10 }),

  /**
   * Generate difficulty scores
   */
  difficultyScore: () => fc.float({ min: 1.0, max: 10.0 }),

  /**
   * Generate solve times in seconds
   */
  solveTime: () => fc.integer({ min: 1, max: 3600 }), // 1 second to 1 hour

  /**
   * Generate user profiles
   */
  userProfile: () => fc.record({
    userId: GameGenerators.userId(),
    hearts: GameGenerators.heartCount(),
    lastHeartRefillTs: GameGenerators.timestamp(),
    coins: GameGenerators.coinAmount(),
    infiniteHeartsExpiryTs: fc.integer({ min: 0, max: 2000000000000 })
  }),

  /**
   * Generate session states
   */
  sessionState: () => fc.record({
    levelId: GameGenerators.levelId(),
    startTimestamp: GameGenerators.timestamp(),
    activeMs: fc.integer({ min: 0, max: 3600000 }),
    lastSeenAt: GameGenerators.timestamp(),
    mistakesMade: fc.integer({ min: 0, max: 10 }),
    revealedIndices: fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 50 })
  }),

  /**
   * Generate batch operations
   */
  batchOperation: () => fc.record({
    operation: fc.constantFrom('get', 'set', 'hget', 'hset', 'incr'),
    key: fc.string({ minLength: 5, maxLength: 30 }),
    value: fc.oneof(fc.string(), fc.integer(), fc.boolean())
  }),

  /**
   * Generate guess sequences
   */
  guessSequence: () => fc.array(
    fc.record({
      cipherNumber: fc.integer({ min: 1, max: 26 }),
      guessedLetter: fc.char().filter(c => /[A-Z]/.test(c)),
      timestamp: GameGenerators.timestamp()
    }),
    { minLength: 1, maxLength: 20 }
  ),

  /**
   * Generate leaderboard entries
   */
  leaderboardEntry: () => fc.record({
    userId: GameGenerators.userId(),
    score: fc.integer({ min: 0, max: 100000 }),
    solveTime: GameGenerators.solveTime(),
    rank: fc.integer({ min: 1, max: 10000 })
  })
};

/**
 * Property test patterns for common game logic
 */
export const PropertyPatterns = {
  /**
   * Test that a function is idempotent
   */
  idempotent: <T, R>(fn: (input: T) => R, generator: fc.Arbitrary<T>) => {
    return fc.property(generator, (input) => {
      const result1 = fn(input);
      const result2 = fn(input);
      return JSON.stringify(result1) === JSON.stringify(result2);
    });
  },

  /**
   * Test that a function preserves certain invariants
   */
  preservesInvariant: <T, R>(
    fn: (input: T) => R,
    generator: fc.Arbitrary<T>,
    invariant: (input: T, output: R) => boolean
  ) => {
    return fc.property(generator, (input) => {
      const output = fn(input);
      return invariant(input, output);
    });
  },

  /**
   * Test that a function is monotonic (non-decreasing)
   */
  monotonic: <T>(
    fn: (input: T) => number,
    generator: fc.Arbitrary<T>,
    compareFn: (a: T, b: T) => number
  ) => {
    return fc.property(generator, generator, (input1, input2) => {
      if (compareFn(input1, input2) <= 0) {
        return fn(input1) <= fn(input2);
      }
      return true;
    });
  },

  /**
   * Test that a function has bounded output
   */
  bounded: <T>(
    fn: (input: T) => number,
    generator: fc.Arbitrary<T>,
    min: number,
    max: number
  ) => {
    return fc.property(generator, (input) => {
      const result = fn(input);
      return result >= min && result <= max;
    });
  },

  /**
   * Test that batch operations are equivalent to sequential operations
   */
  batchEquivalence: <T, R>(
    batchFn: (inputs: T[]) => R[],
    singleFn: (input: T) => R,
    generator: fc.Arbitrary<T>
  ) => {
    return fc.property(fc.array(generator, { maxLength: 10 }), (inputs) => {
      const batchResults = batchFn(inputs);
      const sequentialResults = inputs.map(singleFn);
      return JSON.stringify(batchResults) === JSON.stringify(sequentialResults);
    });
  }
};

/**
 * Test utilities for performance validation
 */
export const PerformanceTestUtils = {
  /**
   * Test that an operation completes within a time limit
   */
  withinTimeLimit: async <T>(
    operation: () => Promise<T>,
    timeLimitMs: number
  ): Promise<{ result: T; duration: number; withinLimit: boolean }> => {
    const start = performance.now();
    const result = await operation();
    const duration = performance.now() - start;
    
    return {
      result,
      duration,
      withinLimit: duration <= timeLimitMs
    };
  },

  /**
   * Test that batch operations are faster than sequential operations
   */
  batchIsFaster: async <T, R>(
    batchFn: (inputs: T[]) => Promise<R[]>,
    singleFn: (input: T) => Promise<R>,
    inputs: T[]
  ): Promise<{ batchTime: number; sequentialTime: number; improvement: number }> => {
    // Time batch operation
    const batchStart = performance.now();
    await batchFn(inputs);
    const batchTime = performance.now() - batchStart;

    // Time sequential operations
    const sequentialStart = performance.now();
    for (const input of inputs) {
      await singleFn(input);
    }
    const sequentialTime = performance.now() - sequentialStart;

    return {
      batchTime,
      sequentialTime,
      improvement: (sequentialTime - batchTime) / sequentialTime
    };
  },

  /**
   * Generate performance test data
   */
  generateTestLoad: (size: 'small' | 'medium' | 'large') => {
    const sizes = {
      small: { operations: 10, dataSize: 100 },
      medium: { operations: 50, dataSize: 1000 },
      large: { operations: 100, dataSize: 10000 }
    };
    
    const config = sizes[size];
    return {
      operations: config.operations,
      data: Array.from({ length: config.dataSize }, (_, i) => ({
        id: `test_${i}`,
        value: Math.random() * 1000,
        timestamp: Date.now() + i
      }))
    };
  }
};

/**
 * Balance testing utilities
 */
export const BalanceTestUtils = {
  /**
   * Test that cost scaling is reasonable
   */
  reasonableCostScaling: (
    costFn: (retryCount: number) => number,
    maxRetries: number = 10
  ) => {
    return fc.property(
      fc.integer({ min: 0, max: maxRetries }),
      fc.integer({ min: 0, max: maxRetries }),
      (retry1, retry2) => {
        if (retry1 === retry2) return true;
        
        const cost1 = costFn(retry1);
        const cost2 = costFn(retry2);
        
        // Cost should increase with retry count
        if (retry1 < retry2) {
          return cost1 <= cost2;
        } else {
          return cost1 >= cost2;
        }
      }
    );
  },

  /**
   * Test that penalties are within reasonable bounds
   */
  reasonablePenalties: (
    penaltyFn: (retryCount: number) => number,
    maxPenalty: number = 0.5
  ) => {
    return fc.property(
      fc.integer({ min: 0, max: 10 }),
      (retryCount) => {
        const penalty = penaltyFn(retryCount);
        return penalty >= 0 && penalty <= maxPenalty;
      }
    );
  },

  /**
   * Test that powerup pricing is balanced
   */
  balancedPowerupPricing: (
    pricingFn: (powerupType: string, difficulty: number) => number
  ) => {
    return fc.property(
      GameGenerators.powerupType(),
      GameGenerators.difficultyScore(),
      (powerupType, difficulty) => {
        const price = pricingFn(powerupType, difficulty);
        
        // Price should be positive and reasonable
        return price > 0 && price <= 1000;
      }
    );
  }
};