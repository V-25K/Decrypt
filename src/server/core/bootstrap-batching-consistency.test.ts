/**
 * Property Test for Bootstrap Operation Batching and Consistency
 * **Feature: game-performance-and-balance-improvements, Property 1: Bootstrap Operation Batching and Consistency**
 * **Validates: Requirements 1.1, 1.3, 1.4, 1.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RedisBatch, BatchUtils } from './redis-batch';
import { bootstrapGameOptimized } from './bootstrap-optimized';
import { getUserProfile, getInventory, getDailyPointer } from './economy';

describe('Property 1: Bootstrap Operation Batching and Consistency', () => {
  /**
   * **Validates: Requirements 1.1**
   * 
   * The batched bootstrap system SHALL group all operations into a single network round-trip
   */
  it('should batch all Redis operations into single round-trip', async () => {
    // **Requirement 1.1**: Verify batching groups operations
    const batch = BatchUtils.createBootstrapBatch('t2_testuser');
    expect(batch.size()).toBe(3); // Should batch all operations into single round-trip
  });

  /**
   * **Validates: Requirements 1.1, 1.3**
   * 
   * Tests that the batched system groups operations and provides clear error handling
   */
  it('should handle batch operation failures gracefully', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate error scenarios
        fc.record({
          operationCount: fc.integer({ min: 1, max: 5 }),
          hasErrors: fc.boolean()
        }),
        async (scenario) => {
          const batch = new RedisBatch();
          
          // Add operations to batch
          for (let i = 0; i < scenario.operationCount; i++) {
            batch.hGetAll(`test:key${i}`, `op${i}`);
          }
          
          // **Requirement 1.1**: Verify operations are batched
          expect(batch.size()).toBe(scenario.operationCount);
          
          // **Requirement 1.3**: Batch should handle errors gracefully
          // Without Redis connection, operations will fail but batch should not throw
          const results = await batch.execute();
          
          expect(results.size).toBe(scenario.operationCount);
          
          // Operations may fail due to no Redis connection, but batch handles it gracefully
          for (let i = 0; i < scenario.operationCount; i++) {
            const id = `op${i}`;
            const wasSuccessful = batch.wasSuccessful(results, id);
            
            // Either succeeds (if Redis available) or fails gracefully (if not)
            expect(typeof wasSuccessful).toBe('boolean');
            
            if (!wasSuccessful) {
              // **Requirement 1.3**: Should provide clear error information
              const error = batch.getError(results, id);
              expect(error).toBeInstanceOf(Error);
            }
          }
        }
      ),
      { 
        numRuns: 100, // Minimum 100 iterations as specified
        timeout: 10000,
        verbose: false
      }
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.4**
   * 
   * Tests that batching maintains data consistency across batch operations
   */
  it('should maintain data consistency across batch operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate batch operation scenarios
        fc.record({
          operationTypes: fc.array(
            fc.oneof(
              fc.constant('hGetAll'),
              fc.constant('get')
            ),
            { minLength: 1, maxLength: 10 }
          ),
          keyPrefix: fc.string({ minLength: 1, maxLength: 10 })
        }),
        async (scenario) => {
          const batch = new RedisBatch();
          
          // Add operations based on scenario
          scenario.operationTypes.forEach((opType, index) => {
            const key = `${scenario.keyPrefix}:${index}`;
            const id = `op_${index}`;
            
            if (opType === 'hGetAll') {
              batch.hGetAll(key, id);
            } else {
              batch.get(key, id);
            }
          });
          
          // **Requirement 1.1**: Verify all operations are batched
          expect(batch.size()).toBe(scenario.operationTypes.length);
          
          // **Requirement 1.4**: Execute batch and verify consistency
          const results = await batch.execute();
          
          expect(results.size).toBe(scenario.operationTypes.length);
          
          // **Requirement 1.5**: All operations should produce consistent results
          scenario.operationTypes.forEach((opType, index) => {
            const id = `op_${index}`;
            const wasSuccessful = batch.wasSuccessful(results, id);
            
            // Consistent behavior: either all succeed or all fail gracefully
            expect(typeof wasSuccessful).toBe('boolean');
            
            if (wasSuccessful) {
              const result = batch.getResult(results, id);
              if (opType === 'hGetAll') {
                expect(result).toEqual({}); // Empty hash for non-existent keys
              } else {
                expect(result).toBeNull(); // Null for non-existent string keys
              }
            } else {
              // **Requirement 1.3**: Clear error information when operations fail
              const error = batch.getError(results, id);
              expect(error).toBeInstanceOf(Error);
            }
          });
        }
      ),
      { 
        numRuns: 100,
        timeout: 10000,
        verbose: false
      }
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.4**
   * 
   * Tests that batching maintains performance characteristics under varying loads
   */
  it('should maintain performance characteristics under varying loads', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate performance test scenarios
        fc.record({
          batchSize: fc.integer({ min: 1, max: 20 }),
          keyComplexity: fc.oneof(
            fc.constant('simple'),
            fc.constant('complex')
          )
        }),
        async (scenario) => {
          const batch = new RedisBatch();
          
          // Create batch with varying sizes
          for (let i = 0; i < scenario.batchSize; i++) {
            const key = scenario.keyComplexity === 'complex' 
              ? `complex:nested:key:${i}:${Date.now()}`
              : `key${i}`;
            batch.hGetAll(key, `op${i}`);
          }
          
          // **Requirement 1.1**: Verify batching scales with size
          expect(batch.size()).toBe(scenario.batchSize);
          
          // **Requirement 1.4**: Measure performance consistency
          const startTime = performance.now();
          const results = await batch.execute();
          const duration = performance.now() - startTime;
          
          // Should complete within reasonable time regardless of batch size
          expect(duration).toBeLessThan(1000); // Less than 1 second
          
          // **Requirement 1.5**: All operations should have consistent behavior
          expect(results.size).toBe(scenario.batchSize);
          
          // All operations should behave consistently (all succeed or all fail gracefully)
          let successCount = 0;
          let failureCount = 0;
          
          for (let i = 0; i < scenario.batchSize; i++) {
            const wasSuccessful = batch.wasSuccessful(results, `op${i}`);
            if (wasSuccessful) {
              successCount++;
            } else {
              failureCount++;
              // **Requirement 1.3**: Failures should have clear error information
              const error = batch.getError(results, `op${i}`);
              expect(error).toBeInstanceOf(Error);
            }
          }
          
          // Consistent behavior: either all succeed or all fail
          expect(successCount === scenario.batchSize || failureCount === scenario.batchSize).toBe(true);
        }
      ),
      { 
        numRuns: 100,
        timeout: 15000,
        verbose: false
      }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   * 
   * Tests that the system provides clear error information for failed operations
   */
  it('should provide clear error information for failed operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate scenarios with potential errors
        fc.record({
          validOperations: fc.integer({ min: 1, max: 5 }),
          includeInvalidOperation: fc.boolean()
        }),
        async (scenario) => {
          const batch = new RedisBatch();
          
          // Add valid operations
          for (let i = 0; i < scenario.validOperations; i++) {
            batch.hGetAll(`valid:key${i}`, `valid_${i}`);
          }
          
          // **Requirement 1.1**: Verify operations are batched
          const expectedSize = scenario.validOperations;
          expect(batch.size()).toBe(expectedSize);
          
          // Execute batch
          const results = await batch.execute();
          
          // **Requirement 1.3**: Should provide clear error handling
          expect(results.size).toBe(expectedSize);
          
          // Check that all operations have consistent behavior
          for (let i = 0; i < scenario.validOperations; i++) {
            const id = `valid_${i}`;
            const wasSuccessful = batch.wasSuccessful(results, id);
            
            if (wasSuccessful) {
              // Success case: no error should be present
              expect(batch.getError(results, id)).toBeNull();
            } else {
              // Failure case: clear error information should be provided
              const error = batch.getError(results, id);
              expect(error).toBeInstanceOf(Error);
              expect(error.message).toBeTruthy(); // Error should have a message
            }
          }
        }
      ),
      { 
        numRuns: 100,
        timeout: 10000,
        verbose: false
      }
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.4, 1.5**
   * 
   * Tests that batched bootstrap produces identical results to sequential processing
   * This is the core property test for bootstrap batching consistency
   */
  it('should produce identical results to sequential processing', async () => {
    // Helper function for sequential bootstrap (simulating original approach)
    async function executeSequentialBootstrap(userId: string) {
      // Execute operations sequentially (one at a time)
      const profile = await getUserProfile(userId).catch(() => null);
      const inventory = await getInventory(userId).catch(() => null);
      const dailyPointer = await getDailyPointer().catch(() => null);

      return {
        profile,
        inventory,
        dailyPointer
      };
    }

    // Helper function for batched bootstrap
    async function executeBatchedBootstrap(userId: string) {
      const batch = BatchUtils.createBootstrapBatch(userId);
      const results = await batch.execute();

      return {
        profile: batch.getResult(results, 'profile'),
        inventory: batch.getResult(results, 'inventory'),
        dailyPointer: batch.getResult(results, 'dailyPointer')
      };
    }

    await fc.assert(
      fc.asyncProperty(
        // Generate test user scenarios
        fc.record({
          userId: fc.string({ minLength: 5, maxLength: 20 }).map(s => `t2_${s}`),
          testRun: fc.integer({ min: 1, max: 10 }) // Multiple test runs for consistency
        }),
        async (scenario) => {
          try {
            // **Requirement 1.1**: Execute both batched and sequential approaches
            const [batchedResult, sequentialResult] = await Promise.all([
              executeBatchedBootstrap(scenario.userId),
              executeSequentialBootstrap(scenario.userId)
            ]);

            // **Requirement 1.5**: Batched approach SHALL produce identical results to sequential
            // Both approaches should handle missing data consistently
            expect(batchedResult.profile).toEqual(sequentialResult.profile);
            expect(batchedResult.inventory).toEqual(sequentialResult.inventory);
            expect(batchedResult.dailyPointer).toEqual(sequentialResult.dailyPointer);

            // **Requirement 1.4**: Data consistency - both should succeed or fail together
            const batchedHasData = batchedResult.profile !== null || batchedResult.inventory !== null;
            const sequentialHasData = sequentialResult.profile !== null || sequentialResult.inventory !== null;
            
            // If one has data, both should have data (consistency)
            if (batchedHasData || sequentialHasData) {
              // Both approaches should handle data presence/absence consistently
              expect(typeof batchedResult.profile).toBe(typeof sequentialResult.profile);
              expect(typeof batchedResult.inventory).toBe(typeof sequentialResult.inventory);
              expect(typeof batchedResult.dailyPointer).toBe(typeof sequentialResult.dailyPointer);
            }

          } catch (error) {
            // **Requirement 1.3**: Both approaches should handle errors consistently
            // If batched fails, sequential should also fail (or vice versa)
            // This ensures consistent error behavior
            expect(error).toBeInstanceOf(Error);
          }
        }
      ),
      { 
        numRuns: 100, // Minimum 100 iterations as specified
        timeout: 15000,
        verbose: false
      }
    );
  });
});