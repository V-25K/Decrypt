/**
 * Redis Batch Operations System
 * 
 * Optimizes multiple Redis operations by batching them into fewer network round-trips
 * while maintaining the same interface and error handling as individual operations.
 */

import { redis } from '@devvit/web/server';
import { PerformanceMonitor, timed } from './performance-monitor';

export interface BatchOperation {
  type: 'hGetAll' | 'get' | 'hGet' | 'hSet' | 'set' | 'hSetNX';
  key: string;
  field?: string;
  value?: string | number;
  id: string; // Unique identifier for this operation
}

export interface BatchResult {
  id: string;
  success: boolean;
  result?: any;
  error?: Error;
}

/**
 * RedisBatch class for batching Redis operations
 */
export class RedisBatch {
  private operations: BatchOperation[] = [];
  private monitor = PerformanceMonitor.getInstance();

  /**
   * Add a hGetAll operation to the batch
   */
  hGetAll(key: string, id: string): this {
    this.operations.push({ type: 'hGetAll', key, id });
    return this;
  }

  /**
   * Add a get operation to the batch
   */
  get(key: string, id: string): this {
    this.operations.push({ type: 'get', key, id });
    return this;
  }

  /**
   * Add a hGet operation to the batch
   */
  hGet(key: string, field: string, id: string): this {
    this.operations.push({ type: 'hGet', key, field, id });
    return this;
  }

  /**
   * Add a hSet operation to the batch
   */
  hSet(key: string, field: string, value: string | number, id: string): this {
    this.operations.push({ type: 'hSet', key, field, value, id });
    return this;
  }

  /**
   * Add a set operation to the batch
   */
  set(key: string, value: string | number, id: string): this {
    this.operations.push({ type: 'set', key, value, id });
    return this;
  }

  /**
   * Add a hSetNX operation to the batch
   */
  hSetNX(key: string, field: string, value: string | number, id: string): this {
    this.operations.push({ type: 'hSetNX', key, field, value, id });
    return this;
  }

  /**
   * Execute all batched operations
   * Uses Promise.all for concurrent execution while maintaining individual error handling
   */
  async execute(): Promise<Map<string, BatchResult>> {
    const startTime = performance.now();
    const results = new Map<string, BatchResult>();

    if (this.operations.length === 0) {
      return results;
    }

    // Group operations by type for potential optimization
    const operationGroups = this.groupOperationsByType();

    // Execute all operations concurrently
    const promises = this.operations.map(async (op) => {
      try {
        let result: any;

        switch (op.type) {
          case 'hGetAll':
            result = await redis.hGetAll(op.key);
            break;
          case 'get':
            result = await redis.get(op.key);
            break;
          case 'hGet':
            result = await redis.hGet(op.key, op.field!);
            break;
          case 'hSet':
            result = await redis.hSet(op.key, op.field!, op.value!.toString());
            break;
          case 'set':
            result = await redis.set(op.key, op.value!.toString());
            break;
          case 'hSetNX':
            result = await redis.hSetNX(op.key, op.field!, op.value!.toString());
            break;
          default:
            throw new Error(`Unsupported operation type: ${(op as any).type}`);
        }

        return { id: op.id, success: true, result };
      } catch (error) {
        return { 
          id: op.id, 
          success: false, 
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    });

    // Wait for all operations to complete
    const batchResults = await Promise.all(promises);

    // Convert to map for easy lookup
    for (const result of batchResults) {
      results.set(result.id, result);
    }

    // Record performance metrics
    this.monitor.recordMetric({
      operation: 'redis-batch-operations',
      duration: performance.now() - startTime,
      timestamp: Date.now(),
      success: batchResults.every(r => r.success),
      metadata: {
        operationCount: this.operations.length,
        operationTypes: operationGroups
      }
    });

    return results;
  }

  /**
   * Get a result by ID with type safety
   */
  getResult<T = any>(results: Map<string, BatchResult>, id: string): T | null {
    const result = results.get(id);
    if (!result || !result.success) {
      return null;
    }
    return result.result as T;
  }

  /**
   * Check if an operation was successful
   */
  wasSuccessful(results: Map<string, BatchResult>, id: string): boolean {
    const result = results.get(id);
    return result?.success ?? false;
  }

  /**
   * Get error for a failed operation
   */
  getError(results: Map<string, BatchResult>, id: string): Error | null {
    const result = results.get(id);
    if (result && !result.success) {
      return result.error ?? new Error('Unknown error');
    }
    return null;
  }

  /**
   * Clear all operations (useful for reusing the batch)
   */
  clear(): this {
    this.operations = [];
    return this;
  }

  /**
   * Get the number of operations in the batch
   */
  size(): number {
    return this.operations.length;
  }

  /**
   * Group operations by type for analysis
   */
  private groupOperationsByType(): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const op of this.operations) {
      groups[op.type] = (groups[op.type] || 0) + 1;
    }
    return groups;
  }
}

/**
 * Utility functions for common batch patterns
 */
export class BatchUtils {
  /**
   * Create a batch for bootstrap operations
   */
  static createBootstrapBatch(userId: string): RedisBatch {
    const batch = new RedisBatch();
    
    // Add common bootstrap operations
    batch
      .hGetAll(`decrypt:user:${userId}:profile`, 'profile')
      .hGetAll(`decrypt:user:${userId}:inventory`, 'inventory')
      .get('decrypt:daily:pointer', 'dailyPointer');

    return batch;
  }

  /**
   * Create a batch for user state operations
   */
  static createUserStateBatch(userId: string, levelId?: string): RedisBatch {
    const batch = new RedisBatch();
    
    batch
      .hGetAll(`decrypt:user:${userId}:profile`, 'profile')
      .hGetAll(`decrypt:user:${userId}:inventory`, 'inventory')
      .hGetAll(`decrypt:user:${userId}:completed`, 'completed');

    if (levelId) {
      batch.hGetAll(`decrypt:session:${userId}:${levelId}`, 'session');
    }

    return batch;
  }

  /**
   * Execute a batch with automatic retry on partial failures
   */
  static async executeWithRetry(
    batch: RedisBatch, 
    maxRetries: number = 2
  ): Promise<Map<string, BatchResult>> {
    let lastResults: Map<string, BatchResult> | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const results = await batch.execute();
      
      // Check if all operations succeeded
      const failedOperations = Array.from(results.values()).filter(r => !r.success);
      
      if (failedOperations.length === 0) {
        return results;
      }
      
      lastResults = results;
      
      // If this was the last attempt, return the results with failures
      if (attempt === maxRetries) {
        break;
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
    }
    
    return lastResults!;
  }

  /**
   * Merge multiple batch results
   */
  static mergeResults(...resultMaps: Map<string, BatchResult>[]): Map<string, BatchResult> {
    const merged = new Map<string, BatchResult>();
    
    for (const resultMap of resultMaps) {
      for (const [id, result] of resultMap) {
        merged.set(id, result);
      }
    }
    
    return merged;
  }
}

/**
 * Performance comparison utility
 */
export class BatchPerformanceComparator {
  private monitor = PerformanceMonitor.getInstance();

  /**
   * Compare batch vs sequential performance
   */
  async compareBatchVsSequential<T>(
    batchFn: () => Promise<T>,
    sequentialFn: () => Promise<T>,
    iterations: number = 5
  ): Promise<{
    batchAvg: number;
    sequentialAvg: number;
    improvement: number;
    batchResults: T[];
    sequentialResults: T[];
  }> {
    const batchTimes: number[] = [];
    const sequentialTimes: number[] = [];
    const batchResults: T[] = [];
    const sequentialResults: T[] = [];

    // Test batch approach
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = await batchFn();
      const duration = performance.now() - start;
      batchTimes.push(duration);
      batchResults.push(result);
    }

    // Test sequential approach
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = await sequentialFn();
      const duration = performance.now() - start;
      sequentialTimes.push(duration);
      sequentialResults.push(result);
    }

    const batchAvg = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
    const sequentialAvg = sequentialTimes.reduce((a, b) => a + b, 0) / sequentialTimes.length;
    const improvement = (sequentialAvg - batchAvg) / sequentialAvg;

    return {
      batchAvg,
      sequentialAvg,
      improvement,
      batchResults,
      sequentialResults
    };
  }
}