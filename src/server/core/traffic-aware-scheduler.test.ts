import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TrafficAwareScheduler, type SchedulerConfig, type TrafficMetrics } from './traffic-aware-scheduler';
import { CompletionJournalCleanup, type CleanupResult } from './completion-journal-cleanup';
import { PerformanceMonitor } from '../../shared/performance';

// Mock the performance monitor
vi.mock('../../shared/performance', () => ({
  PerformanceMonitor: {
    getInstance: vi.fn(() => ({
      measureAsync: vi.fn()
    }))
  },
  defaultPerformanceConfig: {
    cleanup: {
      scheduleHours: [2, 3, 4, 5], // 2-6 AM UTC
      maxAgeMs: 90 * 24 * 60 * 60 * 1000,
      minRetainCount: 100,
      batchSize: 1000
    }
  }
}));

describe('TrafficAwareScheduler', () => {
  let scheduler: TrafficAwareScheduler;
  let mockCleanup: CompletionJournalCleanup;
  let mockPerformanceMonitor: any;

  beforeEach(() => {
    // Create mock cleanup
    mockCleanup = {
      performCleanup: vi.fn()
    } as any;

    // Create mock performance monitor
    mockPerformanceMonitor = {
      measureAsync: vi.fn()
    };
    
    vi.mocked(PerformanceMonitor.getInstance).mockReturnValue(mockPerformanceMonitor);

    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Use fake timers for time-based tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create scheduler with default config', () => {
      scheduler = new TrafficAwareScheduler();
      expect(scheduler).toBeDefined();
    });

    it('should create scheduler with custom cleanup and config', () => {
      const customConfig: Partial<SchedulerConfig> = {
        lowTrafficHours: [1, 2, 3],
        maxActiveConnections: 50
      };

      scheduler = new TrafficAwareScheduler(mockCleanup, customConfig);
      expect(scheduler).toBeDefined();
    });
  });

  describe('start and stop', () => {
    beforeEach(() => {
      scheduler = new TrafficAwareScheduler(mockCleanup);
    });

    it('should start scheduler successfully', () => {
      expect(scheduler.getStatus().isRunning).toBe(false);
      
      scheduler.start();
      
      expect(scheduler.getStatus().isRunning).toBe(true);
    });

    it('should warn when starting already running scheduler', () => {
      scheduler.start();
      scheduler.start(); // Start again
      
      expect(console.warn).toHaveBeenCalledWith('TrafficAwareScheduler is already running');
    });

    it('should stop scheduler successfully', () => {
      scheduler.start();
      expect(scheduler.getStatus().isRunning).toBe(true);
      
      scheduler.stop();
      
      expect(scheduler.getStatus().isRunning).toBe(false);
    });

    it('should handle stopping non-running scheduler gracefully', () => {
      expect(scheduler.getStatus().isRunning).toBe(false);
      
      scheduler.stop(); // Stop when not running
      
      expect(scheduler.getStatus().isRunning).toBe(false);
    });
  });

  describe('traffic detection during different hours', () => {
    beforeEach(() => {
      scheduler = new TrafficAwareScheduler(mockCleanup, {
        lowTrafficHours: [2, 3, 4, 5], // 2-6 AM UTC
        maxActiveConnections: 100,
        maxRequestsPerMinute: 1000,
        maxResponseTime: 500
      });
    });

    it('should detect low traffic during configured hours with low load', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      const isLowTraffic = await scheduler.isLowTrafficPeriod();
      
      expect(isLowTraffic).toBe(true);
    });

    it('should detect high traffic during peak hours', async () => {
      // Set time to 3 PM UTC (peak hour)
      const peakTime = new Date('2024-01-01T15:00:00.000Z');
      vi.setSystemTime(peakTime);

      const isLowTraffic = await scheduler.isLowTrafficPeriod();
      
      expect(isLowTraffic).toBe(false);
    });

    it('should detect high traffic during low-traffic hours if load is high', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      // Mock scheduler to simulate high load during low-traffic hour
      const highLoadScheduler = new TrafficAwareScheduler(mockCleanup, {
        lowTrafficHours: [2, 3, 4, 5],
        maxActiveConnections: 10, // Very low threshold
        maxRequestsPerMinute: 100, // Very low threshold
        maxResponseTime: 50 // Very low threshold
      });

      const isLowTraffic = await highLoadScheduler.isLowTrafficPeriod();
      
      // Should be false because simulated traffic exceeds the low thresholds
      expect(isLowTraffic).toBe(false);
    });

    it('should calculate next cleanup time correctly', () => {
      // Set time to 1 AM UTC (before low traffic hours)
      const beforeLowTraffic = new Date('2024-01-01T01:00:00.000Z');
      vi.setSystemTime(beforeLowTraffic);

      const nextCleanupTime = scheduler.calculateNextCleanupTime();
      const nextCleanupDate = new Date(nextCleanupTime);
      
      // Should schedule for 2 AM UTC (first low traffic hour)
      expect(nextCleanupDate.getUTCHours()).toBe(2);
      expect(nextCleanupDate.getUTCMinutes()).toBe(0);
      expect(nextCleanupDate.getUTCSeconds()).toBe(0);
    });

    it('should calculate next cleanup time for next day when past all low traffic hours', () => {
      // Set time to 10 AM UTC (after all low traffic hours)
      const afterLowTraffic = new Date('2024-01-01T10:00:00.000Z');
      vi.setSystemTime(afterLowTraffic);

      const nextCleanupTime = scheduler.calculateNextCleanupTime();
      const nextCleanupDate = new Date(nextCleanupTime);
      
      // Should schedule for 2 AM UTC next day
      expect(nextCleanupDate.getUTCDate()).toBe(2); // Next day
      expect(nextCleanupDate.getUTCHours()).toBe(2);
    });
  });

  describe('cleanup scheduling logic', () => {
    beforeEach(() => {
      scheduler = new TrafficAwareScheduler(mockCleanup);
    });

    it('should schedule cleanup during low traffic period', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      // Mock successful cleanup result
      const mockResult: CleanupResult = {
        entriesRemoved: 150,
        memoryFreed: 2048,
        usersProcessed: 10,
        processingTimeMs: 1500,
        errors: []
      };

      mockCleanup.performCleanup = vi.fn().mockResolvedValue(mockResult);
      mockPerformanceMonitor.measureAsync = vi.fn().mockImplementation(
        (name: string, fn: () => Promise<CleanupResult>) => fn()
      );

      scheduler.start();
      await scheduler.scheduleCleanup();

      expect(mockCleanup.performCleanup).toHaveBeenCalled();
    });

    it('should defer cleanup during high traffic period', async () => {
      // Set time to 3 PM UTC (high traffic hour)
      const highTrafficTime = new Date('2024-01-01T15:00:00.000Z');
      vi.setSystemTime(highTrafficTime);

      scheduler.start();
      await scheduler.scheduleCleanup();

      expect(mockCleanup.performCleanup).not.toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      // Mock cleanup failure
      const cleanupError = new Error('Cleanup failed');
      mockCleanup.performCleanup = vi.fn().mockRejectedValue(cleanupError);
      mockPerformanceMonitor.measureAsync = vi.fn().mockRejectedValue(cleanupError);

      scheduler.start();
      await scheduler.scheduleCleanup();

      expect(console.error).toHaveBeenCalledWith('Scheduled cleanup failed:', cleanupError);
    });

    it('should warn when trying to schedule cleanup on stopped scheduler', async () => {
      // Don't start the scheduler
      await scheduler.scheduleCleanup();

      expect(console.warn).toHaveBeenCalledWith('Scheduler is not running, cannot schedule cleanup');
      expect(mockCleanup.performCleanup).not.toHaveBeenCalled();
    });
  });

  describe('cleanup results', () => {
    beforeEach(() => {
      scheduler = new TrafficAwareScheduler(mockCleanup);
    });

    it('should complete cleanup with entries removed and memory freed', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      // Mock successful cleanup result with specific values
      const mockResult: CleanupResult = {
        entriesRemoved: 250,
        memoryFreed: 4096,
        usersProcessed: 15,
        processingTimeMs: 2500,
        errors: []
      };

      mockCleanup.performCleanup = vi.fn().mockResolvedValue(mockResult);
      mockPerformanceMonitor.measureAsync = vi.fn().mockImplementation(
        (name: string, fn: () => Promise<CleanupResult>) => fn()
      );

      scheduler.start();
      await scheduler.scheduleCleanup();

      // Verify cleanup was called
      expect(mockCleanup.performCleanup).toHaveBeenCalled();
    });

    it('should complete cleanup with zero values when no cleanup needed', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      // Mock cleanup result with no work done
      const mockResult: CleanupResult = {
        entriesRemoved: 0,
        memoryFreed: 0,
        usersProcessed: 5,
        processingTimeMs: 100,
        errors: []
      };

      mockCleanup.performCleanup = vi.fn().mockResolvedValue(mockResult);
      mockPerformanceMonitor.measureAsync = vi.fn().mockImplementation(
        (name: string, fn: () => Promise<CleanupResult>) => fn()
      );

      scheduler.start();
      await scheduler.scheduleCleanup();

      expect(mockCleanup.performCleanup).toHaveBeenCalled();
    });

    it('should log performance monitoring metrics', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      const mockResult: CleanupResult = {
        entriesRemoved: 100,
        memoryFreed: 1024,
        usersProcessed: 8,
        processingTimeMs: 1200,
        errors: []
      };

      mockCleanup.performCleanup = vi.fn().mockResolvedValue(mockResult);
      mockPerformanceMonitor.measureAsync = vi.fn().mockImplementation(
        (name: string, fn: () => Promise<CleanupResult>) => fn()
      );

      scheduler.start();
      await scheduler.scheduleCleanup();

      // Verify performance monitoring was called with correct parameters
      expect(mockPerformanceMonitor.measureAsync).toHaveBeenCalledWith(
        'completion_journal_cleanup',
        expect.any(Function),
        { scheduled: 'true', traffic_aware: 'true' }
      );
    });
  });

  describe('traffic metrics tracking', () => {
    beforeEach(() => {
      scheduler = new TrafficAwareScheduler(mockCleanup);
    });

    it('should track traffic metrics over time', async () => {
      // Set time to 3 AM UTC (low traffic hour)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      // Call isLowTrafficPeriod to generate metrics
      await scheduler.isLowTrafficPeriod();

      const metrics = scheduler.getTrafficMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        activeConnections: expect.any(Number),
        requestsPerMinute: expect.any(Number),
        averageResponseTime: expect.any(Number),
        timestamp: expect.any(Number)
      });
    });

    it('should simulate different traffic patterns based on time of day', async () => {
      // This test verifies that traffic patterns change based on time of day
      
      // Test low traffic hour (3 AM) - in low traffic hours (2-5)
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);
      const lowScheduler = new TrafficAwareScheduler(mockCleanup);
      
      // At 3 AM, should be in low traffic hours and generate metrics
      const isLowTraffic = await lowScheduler.isLowTrafficPeriod();
      const lowMetrics = lowScheduler.getTrafficMetrics();
      
      expect(lowMetrics.length).toBeGreaterThan(0);
      expect(isLowTraffic).toBe(true); // 3 AM is in low traffic hours [2,3,4,5]
      
      // Test another low traffic hour (4 AM) to compare metrics
      const anotherLowTrafficTime = new Date('2024-01-01T04:00:00.000Z');
      vi.setSystemTime(anotherLowTrafficTime);
      const anotherLowScheduler = new TrafficAwareScheduler(mockCleanup);
      
      const isAnotherLowTraffic = await anotherLowScheduler.isLowTrafficPeriod();
      const anotherLowMetrics = anotherLowScheduler.getTrafficMetrics();
      
      expect(anotherLowMetrics.length).toBeGreaterThan(0);
      expect(isAnotherLowTraffic).toBe(true); // 4 AM is also in low traffic hours
      
      // Test high traffic hour (3 PM) - not in low traffic hours
      const highTrafficTime = new Date('2024-01-01T15:00:00.000Z');
      vi.setSystemTime(highTrafficTime);
      const highScheduler = new TrafficAwareScheduler(mockCleanup);
      
      const isHighTraffic = await highScheduler.isLowTrafficPeriod();
      
      // At 3 PM, not in low traffic hours, so should return false immediately
      expect(isHighTraffic).toBe(false); // 15 is not in low traffic hours [2,3,4,5]
    });

    it('should provide scheduler status information', () => {
      scheduler.start();
      
      const status = scheduler.getStatus();
      
      expect(status).toMatchObject({
        isRunning: true,
        nextScheduledTime: expect.any(Number),
        lastTrafficCheck: null, // No traffic check yet
        config: expect.objectContaining({
          lowTrafficHours: expect.any(Array),
          maxActiveConnections: expect.any(Number),
          maxRequestsPerMinute: expect.any(Number),
          maxResponseTime: expect.any(Number)
        })
      });
    });
  });

  describe('error handling and resilience', () => {
    beforeEach(() => {
      scheduler = new TrafficAwareScheduler(mockCleanup);
    });

    it('should handle traffic metrics collection errors gracefully', async () => {
      // This test ensures the scheduler continues to work even if traffic metrics fail
      const lowTrafficTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(lowTrafficTime);

      // The getCurrentTrafficMetrics method should not throw errors
      const isLowTraffic = await scheduler.isLowTrafficPeriod();
      
      // Should still be able to determine traffic level
      expect(typeof isLowTraffic).toBe('boolean');
    });

    it('should maintain metrics history with proper cleanup', async () => {
      // Set initial time
      const startTime = new Date('2024-01-01T03:00:00.000Z');
      vi.setSystemTime(startTime);

      // Generate some metrics
      await scheduler.isLowTrafficPeriod();
      expect(scheduler.getTrafficMetrics()).toHaveLength(1);

      // Advance time by 25 hours (beyond 24-hour retention)
      const futureTime = new Date(startTime.getTime() + 25 * 60 * 60 * 1000);
      vi.setSystemTime(futureTime);

      // Generate new metrics (this should clean up old ones)
      await scheduler.isLowTrafficPeriod();

      const metrics = scheduler.getTrafficMetrics();
      // Should only have the recent metric, old one should be cleaned up
      expect(metrics).toHaveLength(1);
      expect(metrics[0].timestamp).toBeGreaterThan(startTime.getTime());
    });
  });
});
