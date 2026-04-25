/**
 * Performance monitoring and metrics collection system
 * Provides infrastructure for measuring and tracking performance improvements
 */

export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface PerformanceConfig {
  bootstrap: {
    batchSize: number;
    timeoutMs: number;
    retryAttempts: number;
  };
  guessProcessing: {
    maxParallelGuesses: number;
    batchSize: number;
    timeoutMs: number;
  };
  leaderboard: {
    pageSize: number;
    maxPageSize: number;
    cacheTimeMs: number;
  };
  cleanup: {
    maxAgeMs: number;
    minRetainCount: number;
    batchSize: number;
    scheduleHours: number[];
  };
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private static instance: PerformanceMonitor;

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now()
    };
    if (tags !== undefined) {
      metric.tags = tags;
    }
    this.metrics.push(metric);
  }

  /**
   * Measure execution time of an operation
   */
  async measureAsync<T>(
    name: string, 
    operation: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await operation();
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, { ...tags, status: 'error' });
      throw error;
    }
  }

  /**
   * Measure execution time of a synchronous operation
   */
  measure<T>(
    name: string, 
    operation: () => T,
    tags?: Record<string, string>
  ): T {
    const startTime = performance.now();
    try {
      const result = operation();
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, { ...tags, status: 'success' });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordMetric(name, duration, { ...tags, status: 'error' });
      throw error;
    }
  }

  /**
   * Get metrics for a specific operation
   */
  getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.metrics.filter(m => m.name === name);
    }
    return [...this.metrics];
  }

  /**
   * Calculate average performance for an operation
   */
  getAverageMetric(name: string): number {
    const metrics = this.getMetrics(name);
    if (metrics.length === 0) return 0;
    
    const sum = metrics.reduce((acc, m) => acc + m.value, 0);
    return sum / metrics.length;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Get performance summary
   */
  getSummary(): Record<string, { count: number; average: number; min: number; max: number }> {
    const summary: Record<string, { count: number; average: number; min: number; max: number }> = {};
    
    const metricsByName = this.metrics.reduce((acc, metric) => {
      if (!acc[metric.name]) {
        acc[metric.name] = [];
      }
      acc[metric.name]?.push(metric.value);
      return acc;
    }, {} as Record<string, number[]>);

    for (const [name, values] of Object.entries(metricsByName)) {
      summary[name] = {
        count: values.length,
        average: values.reduce((sum, val) => sum + val, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values)
      };
    }

    return summary;
  }
}

/**
 * Default performance configuration
 */
export const defaultPerformanceConfig: PerformanceConfig = {
  bootstrap: {
    batchSize: 10,
    timeoutMs: 5000,
    retryAttempts: 3
  },
  guessProcessing: {
    maxParallelGuesses: 50,
    batchSize: 10,
    timeoutMs: 3000
  },
  leaderboard: {
    pageSize: 50,
    maxPageSize: 100,
    cacheTimeMs: 60000 // 1 minute
  },
  cleanup: {
    maxAgeMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    minRetainCount: 100,
    batchSize: 1000,
    scheduleHours: [2, 3, 4, 5] // 2-6 AM UTC
  }
};
