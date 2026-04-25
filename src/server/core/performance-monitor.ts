/**
 * Performance Monitoring System for Game Logic Audit Fixes
 * 
 * Uses existing Devvit infrastructure to track performance metrics
 * without requiring external dependencies.
 */

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
  metadata?: Record<string, any>;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 metrics

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Time an operation and record performance metrics
   */
  async timeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = performance.now();
    let success = true;
    let result: T;

    try {
      result = await fn();
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = performance.now() - start;
      this.recordMetric({
        operation,
        duration,
        timestamp: Date.now(),
        success,
        metadata
      });
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(metric: PerformanceMetrics): void {
    this.metrics.push(metric);
    
    // Keep only the most recent metrics to prevent memory leaks
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getOperationStats(operation: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
  } {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    
    if (operationMetrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        successRate: 0
      };
    }

    const durations = operationMetrics.map(m => m.duration);
    const successCount = operationMetrics.filter(m => m.success).length;

    return {
      count: operationMetrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successCount / operationMetrics.length
    };
  }

  /**
   * Get all metrics for testing and analysis
   */
  getAllMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Check if performance targets are met
   */
  checkPerformanceTargets(): {
    bootstrap: { target: number; actual: number; met: boolean };
    guessProcessing: { target: number; actual: number; met: boolean };
    leaderboard: { target: number; actual: number; met: boolean };
    rendering: { target: number; actual: number; met: boolean };
  } {
    const bootstrapStats = this.getOperationStats('bootstrap');
    const guessStats = this.getOperationStats('guess-processing');
    const leaderboardStats = this.getOperationStats('leaderboard-query');
    const renderStats = this.getOperationStats('puzzle-render');

    return {
      bootstrap: {
        target: 50, // 50% improvement target
        actual: bootstrapStats.avgDuration,
        met: bootstrapStats.count > 0 && bootstrapStats.avgDuration < 200 // < 200ms
      },
      guessProcessing: {
        target: 60, // 60% improvement target
        actual: guessStats.avgDuration,
        met: guessStats.count > 0 && guessStats.avgDuration < 100 // < 100ms per guess
      },
      leaderboard: {
        target: 70, // 70% bandwidth reduction target
        actual: leaderboardStats.avgDuration,
        met: leaderboardStats.count > 0 && leaderboardStats.avgDuration < 50 // < 50ms
      },
      rendering: {
        target: 80, // 80% render cycle reduction target
        actual: renderStats.avgDuration,
        met: renderStats.count > 0 && renderStats.avgDuration < 16 // < 16ms (60fps)
      }
    };
  }
}

/**
 * Decorator for timing methods
 */
export function timed(operation: string, metadata?: Record<string, any>) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const monitor = PerformanceMonitor.getInstance();
      return monitor.timeOperation(
        operation,
        () => originalMethod.apply(this, args),
        metadata
      );
    };

    return descriptor;
  };
}

/**
 * Simple A/B testing infrastructure using existing tools
 */
export class ABTestManager {
  private static instance: ABTestManager;
  private tests: Map<string, { variant: 'A' | 'B'; enabled: boolean }> = new Map();

  static getInstance(): ABTestManager {
    if (!ABTestManager.instance) {
      ABTestManager.instance = new ABTestManager();
    }
    return ABTestManager.instance;
  }

  /**
   * Configure an A/B test
   */
  configureTest(testName: string, enabled: boolean = true): void {
    // Simple hash-based assignment for consistent user experience
    const variant = this.hashUserId(testName) % 2 === 0 ? 'A' : 'B';
    this.tests.set(testName, { variant, enabled });
  }

  /**
   * Get variant for a test
   */
  getVariant(testName: string, userId?: string): 'A' | 'B' {
    const test = this.tests.get(testName);
    if (!test || !test.enabled) {
      return 'A'; // Default to control group
    }

    // Use userId for consistent assignment if provided
    if (userId) {
      return this.hashUserId(userId + testName) % 2 === 0 ? 'A' : 'B';
    }

    return test.variant;
  }

  /**
   * Simple hash function for consistent user assignment
   */
  private hashUserId(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Check if user is in variant B for a test
   */
  isVariantB(testName: string, userId?: string): boolean {
    return this.getVariant(testName, userId) === 'B';
  }
}