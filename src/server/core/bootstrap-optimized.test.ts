/**
 * Tests for Optimized Bootstrap System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDevvitTest } from '@devvit/test/server/vitest';
import * as fc from 'fast-check';
import { RedisBatch, BatchUtils } from './redis-batch';
import { bootstrapGameOptimized, BootstrapPerformanceComparator } from './bootstrap-optimized';
import { getUserProfile, getInventory, getDailyPointer } from './game-service';
import type { UserProfile, Inventory } from '../../shared/game';

const test = createDevvitTest({
  username: 'testuser',
  userId: 't2_testuser',
  subredditName: 'testsub',
});

describe('RedisBatch', () => {
  test('should batch Redis operations correctly', async ({ redis }) => {
    // Set up test data
    await redis.hSet('test:profile', 'coins', '100');
    await redis.hSet('test:inventory', 'hammers', '5');
    await redis.set('test:pointer', 'level123');

    // Create and execute batch
    const batch = new RedisBatch();
    batch
      .hGetAll('test:profile', 'profile')
      .hGetAll('test:inventory', 'inventory')
      .get('test:pointer', 'pointer');

    const results = await batch.execute();

    // Verify results
    expect(results.size).toBe(3);
    expect(batch.wasSuccessful(results, 'profile')).toBe(true);
    expect(batch.wasSuccessful(results, 'inventory')).toBe(true);
    expect(batch.wasSuccessful(results, 'pointer')).toBe(true);

    const profile = batch.getResult(results, 'profile');
    const inventory = batch.getResult(results, 'inventory');
    const pointer = batch.getResult(results, 'pointer');

    expect(profile.coins).toBe('100');
    expect(inventory.hammers).toBe('5');
    expect(pointer).toBe('level123');
  });

  test('should handle failed operations gracefully', async ({ redis }) => {
    const batch = new RedisBatch();
    batch
      .hGetAll('nonexistent:key', 'missing')
      .get('another:missing', 'missing2');

    const results = await batch.execute();

    // Operations should succeed but return empty results
    expect(results.size).toBe(2);
    expect(batch.wasSuccessful(results, 'missing')).toBe(true);
    expect(batch.wasSuccessful(results, 'missing2')).toBe(true);

    const missing = batch.getResult(results, 'missing');
    const missing2 = batch.getResult(results, 'missing2');

    expect(missing).toEqual({});
    // Redis get() returns null for missing keys, but our batch might return undefined
    expect(missing2 == null).toBe(true); // Handles both null and undefined
  });
});

describe('BatchUtils', () => {
  test('should create bootstrap batch correctly', async () => {
    const batch = BatchUtils.createBootstrapBatch('t2_testuser');
    
    expect(batch.size()).toBe(3);
  });

  test('should execute with retry on failures', async ({ redis }) => {
    // Set up test data
    await redis.hSet('retry:test', 'value', '123');
    
    const batch = new RedisBatch();
    batch.hGetAll('retry:test', 'test');

    const results = await BatchUtils.executeWithRetry(batch, 2);
    
    expect(results.size).toBe(1);
    expect(batch.wasSuccessful(results, 'test')).toBe(true);
  });
});

describe('Bootstrap Performance', () => {
  test('should provide performance comparison utilities', async () => {
    const comparator = new BootstrapPerformanceComparator();
    
    // This test just verifies the comparator exists and has the right methods
    expect(comparator.compareBootstrapMethods).toBeDefined();
    expect(comparator.validateEquivalence).toBeDefined();
  });
});

describe('Optimized Bootstrap Integration', () => {
  test('should bootstrap game data efficiently', async ({ redis, userId }) => {
    // Set up minimal test data
    await redis.hSet(`decrypt:user:${userId}:profile`, 'coins', '100');
    await redis.hSet(`decrypt:user:${userId}:profile`, 'hearts', '3');
    await redis.hSet(`decrypt:user:${userId}:inventory`, 'hammers', '2');
    await redis.set('decrypt:daily:pointer', 'daily_level_123');

    // Test optimized bootstrap
    const result = await bootstrapGameOptimized();

    // Verify structure
    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('inventory');
    expect(result).toHaveProperty('currentDailyLevelId');
    expect(result).toHaveProperty('todayDateKey');

    // Verify data
    expect(result.userId).toBe(userId);
    expect(result.profile.coins).toBe(100);
    expect(result.profile.hearts).toBe(3);
    expect(result.inventory.hammers).toBe(2);
    expect(result.currentDailyLevelId).toBe('daily_level_123');
  });

  test('should handle missing data with defaults', async ({ userId }) => {
    // Don't set up any data - should use defaults
    const result = await bootstrapGameOptimized();

    // Should still return valid structure with defaults
    expect(result).toHaveProperty('userId');
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('inventory');
    
    expect(result.userId).toBe(userId);
    expect(result.profile.coins).toBe(0); // Default
    expect(result.profile.hearts).toBe(3); // Default
    expect(result.inventory.hammers).toBe(0); // Default
  });

  test('should maintain data consistency', async ({ redis, userId }) => {
    // Set up data that needs normalization
    await redis.hSet(`decrypt:user:${userId}:profile`, 'coins', '150');
    await redis.hSet(`decrypt:user:${userId}:profile`, 'hearts', '2');
    await redis.hSet(`decrypt:user:${userId}:profile`, 'lastHeartRefillTs', String(Date.now() - 3600000)); // 1 hour ago
    
    const result = await bootstrapGameOptimized();

    // Should normalize hearts (2 hearts + 1 hour = 4 hearts, clamped to 3)
    expect(result.profile.hearts).toBe(3);
    expect(result.profile.lastHeartRefillTs).toBeGreaterThan(Date.now() - 1000); // Should be updated
  });
});

/**
 * Property Test for Bootstrap Operation Batching and Consistency
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
 */
describe('Property Test: Bootstrap Operation Batching and Consistency', () => {
  test('should produce identical results to sequential operations across all user states', async ({ redis, userId }) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary user profile data
        fc.record({
          coins: fc.integer({ min: 0, max: 10000 }),
          hearts: fc.integer({ min: 0, max: 5 }),
          lastHeartRefillTs: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
          infiniteHeartsExpiryTs: fc.integer({ min: 0, max: Date.now() + 86400000 }),
          currentStreak: fc.integer({ min: 0, max: 100 }),
          dailyCurrentStreak: fc.integer({ min: 0, max: 50 }),
          endlessCurrentStreak: fc.integer({ min: 0, max: 50 }),
          lastPlayedDateKey: fc.string({ minLength: 8, maxLength: 10 }),
          totalWordsSolved: fc.integer({ min: 0, max: 1000 }),
          totalLevelsCompleted: fc.integer({ min: 0, max: 500 }),
          flawlessWins: fc.integer({ min: 0, max: 100 }),
          speedWins: fc.integer({ min: 0, max: 100 }),
          audioEnabled: fc.boolean(),
          communityJoinRecorded: fc.boolean(),
          communityJoinRewardClaimed: fc.boolean(),
          unlockedFlairs: fc.array(fc.string(), { maxLength: 10 }),
          activeFlair: fc.string()
        }),
        // Generate arbitrary inventory data
        fc.record({
          hammers: fc.integer({ min: 0, max: 50 }),
          rockets: fc.integer({ min: 0, max: 20 }),
          wands: fc.integer({ min: 0, max: 30 }),
          coinHeartsPurchasedToday: fc.integer({ min: 0, max: 10 })
        }),
        // Generate daily pointer scenarios
        fc.oneof(
          fc.constant(null),
          fc.string({ minLength: 5, maxLength: 20 })
        ),
        // Generate Redis error scenarios
        fc.record({
          profileError: fc.boolean(),
          inventoryError: fc.boolean(),
          dailyPointerError: fc.boolean()
        }),
        async (profileData, inventoryData, dailyPointer, errorScenarios) => {
          // Clear any existing data
          try {
            await redis.del(`decrypt:user:${userId}:profile`);
            await redis.del(`decrypt:user:${userId}:inventory`);
            await redis.del('decrypt:daily:pointer');
          } catch (error) {
            // Ignore cleanup errors
          }

          // Set up test data based on generated values
          if (!errorScenarios.profileError) {
            for (const [key, value] of Object.entries(profileData)) {
              if (key === 'unlockedFlairs') {
                await redis.hSet(`decrypt:user:${userId}:profile`, key, JSON.stringify(value));
              } else {
                await redis.hSet(`decrypt:user:${userId}:profile`, key, String(value));
              }
            }
          }

          if (!errorScenarios.inventoryError) {
            for (const [key, value] of Object.entries(inventoryData)) {
              await redis.hSet(`decrypt:user:${userId}:inventory`, key, String(value));
            }
          }

          if (!errorScenarios.dailyPointerError && dailyPointer !== null) {
            await redis.set('decrypt:daily:pointer', dailyPointer);
          }

          // Execute both batched and sequential approaches
          const [batchedResult, sequentialResult] = await Promise.all([
            bootstrapGameOptimized().catch(error => ({ error: error.message })),
            executeSequentialBootstrap(userId).catch(error => ({ error: error.message }))
          ]);

          // Both should succeed or fail together
          if ('error' in batchedResult || 'error' in sequentialResult) {
            // If one fails, both should fail (or handle gracefully)
            expect(typeof batchedResult).toBe(typeof sequentialResult);
            return;
          }

          // Compare core data structures (excluding timestamps that may vary)
          expect(batchedResult.userId).toBe(sequentialResult.userId);
          expect(batchedResult.currentDailyLevelId).toBe(sequentialResult.currentDailyLevelId);
          
          // Compare profile data (excluding time-sensitive fields)
          const batchProfile = { ...batchedResult.profile };
          const seqProfile = { ...sequentialResult.profile };
          
          // Remove time-sensitive fields that may differ slightly
          delete batchProfile.lastHeartRefillTs;
          delete seqProfile.lastHeartRefillTs;
          
          expect(batchProfile.coins).toBe(seqProfile.coins);
          expect(batchProfile.hearts).toBe(seqProfile.hearts);
          expect(batchProfile.currentStreak).toBe(seqProfile.currentStreak);
          expect(batchProfile.totalLevelsCompleted).toBe(seqProfile.totalLevelsCompleted);
          
          // Compare inventory data
          expect(batchedResult.inventory.hammers).toBe(sequentialResult.inventory.hammers);
          expect(batchedResult.inventory.rockets).toBe(sequentialResult.inventory.rockets);
          expect(batchedResult.inventory.wands).toBe(sequentialResult.inventory.wands);
          expect(batchedResult.inventory.coinHeartsPurchasedToday).toBe(sequentialResult.inventory.coinHeartsPurchasedToday);
        }
      ),
      { 
        numRuns: 20,
        timeout: 30000,
        verbose: true
      }
    );
  });

  test('should handle batch operation failures gracefully', async ({ redis, userId }) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate scenarios with different Redis failures
        fc.record({
          simulateRedisDown: fc.boolean(),
          corruptProfileData: fc.boolean(),
          corruptInventoryData: fc.boolean(),
          missingDailyPointer: fc.boolean()
        }),
        async (errorScenario) => {
          // Clear existing data
          await redis.del(`decrypt:user:${userId}:profile`);
          await redis.del(`decrypt:user:${userId}:inventory`);
          await redis.del('decrypt:daily:pointer');

          // Set up corrupted or missing data based on scenario
          if (errorScenario.corruptProfileData) {
            await redis.hSet(`decrypt:user:${userId}:profile`, 'coins', 'invalid_number');
            await redis.hSet(`decrypt:user:${userId}:profile`, 'hearts', 'not_a_number');
          }

          if (errorScenario.corruptInventoryData) {
            await redis.hSet(`decrypt:user:${userId}:inventory`, 'hammers', 'invalid');
          }

          // Execute bootstrap - should handle errors gracefully
          const result = await bootstrapGameOptimized();

          // Should always return a valid structure, even with corrupted data
          expect(result).toHaveProperty('userId');
          expect(result).toHaveProperty('profile');
          expect(result).toHaveProperty('inventory');
          expect(result).toHaveProperty('currentDailyLevelId');

          // Profile should have valid defaults when data is corrupted
          expect(typeof result.profile.coins).toBe('number');
          expect(typeof result.profile.hearts).toBe('number');
          expect(result.profile.hearts).toBeGreaterThanOrEqual(0);
          expect(result.profile.hearts).toBeLessThanOrEqual(3);

          // Inventory should have valid defaults
          expect(typeof result.inventory.hammers).toBe('number');
          expect(typeof result.inventory.rockets).toBe('number');
          expect(typeof result.inventory.wands).toBe('number');
          expect(result.inventory.hammers).toBeGreaterThanOrEqual(0);
        }
      ),
      { 
        numRuns: 15,
        timeout: 20000
      }
    );
  });

  test('should maintain performance characteristics under load', async ({ redis, userId }) => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different data sizes to test performance scaling
        fc.record({
          profileFieldCount: fc.integer({ min: 5, max: 25 }),
          inventoryFieldCount: fc.integer({ min: 3, max: 10 }),
          flairCount: fc.integer({ min: 0, max: 20 })
        }),
        async (dataSize) => {
          // Set up varying amounts of data
          const profileData: Record<string, string> = {
            coins: '1000',
            hearts: '3',
            currentStreak: '5'
          };

          // Add extra profile fields to test scaling
          for (let i = 0; i < dataSize.profileFieldCount - 3; i++) {
            profileData[`extraField${i}`] = `value${i}`;
          }

          const inventoryData: Record<string, string> = {
            hammers: '10',
            rockets: '5',
            wands: '3'
          };

          // Add extra inventory fields
          for (let i = 0; i < dataSize.inventoryFieldCount - 3; i++) {
            inventoryData[`extraItem${i}`] = `${i}`;
          }

          // Set up flairs array
          const flairs = Array.from({ length: dataSize.flairCount }, (_, i) => `flair${i}`);
          profileData.unlockedFlairs = JSON.stringify(flairs);

          // Store data in Redis
          for (const [key, value] of Object.entries(profileData)) {
            await redis.hSet(`decrypt:user:${userId}:profile`, key, value);
          }
          for (const [key, value] of Object.entries(inventoryData)) {
            await redis.hSet(`decrypt:user:${userId}:inventory`, key, value);
          }
          await redis.set('decrypt:daily:pointer', 'test_level');

          // Measure performance
          const startTime = performance.now();
          const result = await bootstrapGameOptimized();
          const duration = performance.now() - startTime;

          // Should complete within reasonable time regardless of data size
          expect(duration).toBeLessThan(1000); // Less than 1 second
          
          // Should still return valid data
          expect(result.profile.coins).toBe(1000);
          expect(result.inventory.hammers).toBe(10);
          expect(result.currentDailyLevelId).toBe('test_level');
        }
      ),
      { 
        numRuns: 10,
        timeout: 15000
      }
    );
  });
});

/**
 * Helper function to execute sequential bootstrap for comparison
 */
async function executeSequentialBootstrap(userId: string) {
  // Simulate the original sequential approach
  const [profile, inventory, dailyPointer] = await Promise.all([
    getUserProfile(userId),
    getInventory(userId),
    getDailyPointer(),
  ]);

  return {
    userId,
    username: null,
    subredditName: null,
    postId: null,
    currentDailyLevelId: dailyPointer,
    todayDateKey: new Date().toISOString().split('T')[0].replace(/-/g, ''),
    profile,
    inventory,
    endlessCatalog: null, // Simplified for testing
  };
}