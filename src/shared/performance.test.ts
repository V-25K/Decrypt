/**
 * Tests for performance monitoring infrastructure
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PerformanceMonitor } from './performance';
import { 
  propertyTestConfig, 
  gameArbitraries, 
  createPropertyTest,
  performanceProperties 
} from './property-testing';

describe('Performance Monitoring Infrastructure', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clearMetrics();
  });

  describe('PerformanceMonitor', () => {
    it('should record metrics correctly', () => {
      monitor.recordMetric('test-metric', 100, { tag: 'value' });
      
      const metrics = monitor.getMetrics('test-metric');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('test-metric');
      expect(metrics[0].value).toBe(100);
      expect(metrics[0].tags).toEqual({ tag: 'value' });
    });

    it('should measure async operations', async () => {
      const result = await monitor.measureAsync('async-test', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'success';
      });

      expect(result).toBe('success');
      const metrics = monitor.getMetrics('async-test');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBeGreaterThan(0);
      expect(metrics[0].tags?.status).toBe('success');
    });

    it('should measure sync operations', () => {
      const result = monitor.measure('sync-test', () => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      });

      expect(result).toBe(499500);
      const metrics = monitor.getMetrics('sync-test');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBeGreaterThan(0);
    });

    it('should calculate average metrics', () => {
      monitor.recordMetric('avg-test', 10);
      monitor.recordMetric('avg-test', 20);
      monitor.recordMetric('avg-test', 30);

      const average = monitor.getAverageMetric('avg-test');
      expect(average).toBe(20);
    });

    it('should generate performance summary', () => {
      monitor.recordMetric('test1', 10);
      monitor.recordMetric('test1', 20);
      monitor.recordMetric('test2', 30);

      const summary = monitor.getSummary();
      expect(summary.test1.count).toBe(2);
      expect(summary.test1.average).toBe(15);
      expect(summary.test1.min).toBe(10);
      expect(summary.test1.max).toBe(20);
      expect(summary.test2.count).toBe(1);
      expect(summary.test2.average).toBe(30);
    });
  });

  describe('Property-Based Testing Setup', () => {
    it('should run property tests with game arbitraries', () => {
      fc.assert(
        fc.property(
          gameArbitraries.coinAmount(),
          gameArbitraries.heartAmount(),
          (coins, hearts) => {
            // Property: coin and heart amounts should always be non-negative
            return coins >= 0 && hearts >= 0;
          }
        ),
        propertyTestConfig
      );
    });

    it('should generate valid user profiles', () => {
      fc.assert(
        fc.property(
          gameArbitraries.userProfile(),
          (profile) => {
            // Property: user profiles should have valid structure
            return (
              typeof profile.coins === 'number' &&
              typeof profile.hearts === 'number' &&
              typeof profile.level === 'number' &&
              typeof profile.experience === 'number' &&
              profile.coins >= 0 &&
              profile.hearts >= 0 &&
              profile.level >= 1 &&
              profile.experience >= 0
            );
          }
        ),
        propertyTestConfig
      );
    });

    it('should generate valid guess requests', () => {
      fc.assert(
        fc.property(
          gameArbitraries.guessRequest(),
          (guess) => {
            // Property: guess requests should have valid structure
            return (
              typeof guess.tileIndex === 'number' &&
              typeof guess.guessedLetter === 'string' &&
              typeof guess.sessionId === 'string' &&
              typeof guess.timestamp === 'number' &&
              guess.tileIndex >= 0 &&
              guess.tileIndex <= 99 &&
              guess.guessedLetter.length === 1 &&
              guess.sessionId.length >= 10 &&
              guess.timestamp > 0
            );
          }
        ),
        propertyTestConfig
      );
    });
  });

  describe('Performance Properties', () => {
    it('should validate operation completion time', async () => {
      const fastOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      };

      const property = performanceProperties.completesWithinTime(fastOperation, 100);
      const result = await property();
      expect(result).toBe(true);
    });

    it('should detect performance improvements', async () => {
      const slowOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'slow';
      };

      const fastOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'fast';
      };

      const property = performanceProperties.improvesPerformanceBy(
        slowOperation,
        fastOperation,
        50 // 50% improvement
      );

      const result = await property();
      expect(result).toBe(true);
    });

    it('should monitor memory usage', () => {
      const memoryIntensiveOperation = () => {
        // Create a small array to avoid excessive memory usage in tests
        const data = new Array(1000).fill('test');
        return data.length;
      };

      const property = performanceProperties.memoryUsageWithinLimit(
        memoryIntensiveOperation,
        10 // 10MB limit
      );

      const result = property();
      expect(result).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should integrate performance monitoring with property testing', () => {
      // Property: Performance monitoring should consistently record metrics
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.float({ min: 0, max: 1000 }),
          (metricName, value) => {
            monitor.recordMetric(metricName, value);
            const metrics = monitor.getMetrics(metricName);
            
            return (
              metrics.length > 0 &&
              metrics[metrics.length - 1].name === metricName &&
              metrics[metrics.length - 1].value === value
            );
          }
        ),
        { ...propertyTestConfig, numRuns: 50 } // Fewer runs for integration test
      );
    });
  });
});