/**
 * Tests for Performance Monitoring System
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor, ABTestManager } from './performance-monitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = PerformanceMonitor.getInstance();
    monitor.clearMetrics();
  });

  it('should record performance metrics', async () => {
    const result = await monitor.timeOperation('test-operation', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'success';
    });

    expect(result).toBe('success');
    
    const metrics = monitor.getAllMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].operation).toBe('test-operation');
    expect(metrics[0].success).toBe(true);
    expect(metrics[0].duration).toBeGreaterThan(0);
  });

  it('should record failed operations', async () => {
    await expect(
      monitor.timeOperation('failing-operation', async () => {
        throw new Error('Test error');
      })
    ).rejects.toThrow('Test error');

    const metrics = monitor.getAllMetrics();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].operation).toBe('failing-operation');
    expect(metrics[0].success).toBe(false);
  });

  it('should calculate operation statistics', async () => {
    // Record multiple operations
    await monitor.timeOperation('test-op', async () => 'result1');
    await monitor.timeOperation('test-op', async () => 'result2');
    await monitor.timeOperation('test-op', async () => 'result3');

    const stats = monitor.getOperationStats('test-op');
    expect(stats.count).toBe(3);
    expect(stats.avgDuration).toBeGreaterThan(0);
    expect(stats.successRate).toBe(1);
  });

  it('should limit stored metrics to prevent memory leaks', async () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.clearMetrics();

    // Record more than the limit
    for (let i = 0; i < 1100; i++) {
      monitor.recordMetric({
        operation: `test-${i}`,
        duration: 10,
        timestamp: Date.now(),
        success: true
      });
    }

    const metrics = monitor.getAllMetrics();
    expect(metrics.length).toBeLessThanOrEqual(1000);
  });

  it('should check performance targets', async () => {
    // Record some fast operations
    await monitor.timeOperation('bootstrap', async () => 'fast');
    await monitor.timeOperation('guess-processing', async () => 'fast');

    const targets = monitor.checkPerformanceTargets();
    expect(targets.bootstrap).toHaveProperty('target');
    expect(targets.bootstrap).toHaveProperty('actual');
    expect(targets.bootstrap).toHaveProperty('met');
  });
});

describe('ABTestManager', () => {
  let abTest: ABTestManager;

  beforeEach(() => {
    abTest = ABTestManager.getInstance();
  });

  it('should configure A/B tests', () => {
    abTest.configureTest('test-feature', true);
    
    const variant = abTest.getVariant('test-feature');
    expect(['A', 'B']).toContain(variant);
  });

  it('should provide consistent variants for same user', () => {
    abTest.configureTest('consistent-test', true);
    
    const variant1 = abTest.getVariant('consistent-test', 'user123');
    const variant2 = abTest.getVariant('consistent-test', 'user123');
    
    expect(variant1).toBe(variant2);
  });

  it('should return control group when test is disabled', () => {
    abTest.configureTest('disabled-test', false);
    
    const variant = abTest.getVariant('disabled-test', 'user123');
    expect(variant).toBe('A');
  });

  it('should distribute users across variants', () => {
    abTest.configureTest('distribution-test', true);
    
    const variants = [];
    for (let i = 0; i < 100; i++) {
      variants.push(abTest.getVariant('distribution-test', `user${i}`));
    }
    
    const aCount = variants.filter(v => v === 'A').length;
    const bCount = variants.filter(v => v === 'B').length;
    
    // Should have reasonable distribution (not exactly 50/50 due to hash function)
    expect(aCount).toBeGreaterThan(20);
    expect(bCount).toBeGreaterThan(20);
    expect(aCount + bCount).toBe(100);
  });

  it('should provide isVariantB helper', () => {
    abTest.configureTest('helper-test', true);
    
    const isB = abTest.isVariantB('helper-test', 'user123');
    const variant = abTest.getVariant('helper-test', 'user123');
    
    expect(isB).toBe(variant === 'B');
  });
});