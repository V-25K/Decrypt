import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redisGetMock } = vi.hoisted(() => ({
  redisGetMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: redisGetMock,
  },
}));

import {
  trackBatchGeneration,
  trackDifficultyAdjustment,
  getMetricsSnapshot,
  resetMetrics,
} from './metrics';

describe('metrics', () => {
  beforeEach(() => {
    resetMetrics();
    redisGetMock.mockReset();
    redisGetMock.mockResolvedValue(null);
  });

  describe('trackBatchGeneration', () => {
    it('should track successful batch generation', async () => {
      trackBatchGeneration({
        candidatesRequested: 3,
        candidatesReturned: 3,
        candidateSelected: true,
      });

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.batch.totalBatches).toBe(1);
      expect(snapshot.batch.successfulBatches).toBe(1);
      expect(snapshot.batch.failedBatches).toBe(0);
      expect(snapshot.batch.totalCandidatesRequested).toBe(3);
      expect(snapshot.batch.totalCandidatesReturned).toBe(3);
      expect(snapshot.batch.totalCandidatesSelected).toBe(1);
      expect(snapshot.batch.batchSuccessRate).toBe(100);
    });

    it('should track failed batch generation', async () => {
      trackBatchGeneration({
        candidatesRequested: 3,
        candidatesReturned: 2,
        candidateSelected: false,
      });

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.batch.totalBatches).toBe(1);
      expect(snapshot.batch.successfulBatches).toBe(0);
      expect(snapshot.batch.failedBatches).toBe(1);
      expect(snapshot.batch.batchSuccessRate).toBe(0);
    });

    it('should calculate average candidates per batch', async () => {
      trackBatchGeneration({
        candidatesRequested: 3,
        candidatesReturned: 3,
        candidateSelected: true,
      });
      trackBatchGeneration({
        candidatesRequested: 3,
        candidatesReturned: 2,
        candidateSelected: false,
      });

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.batch.averageCandidatesPerBatch).toBe(2.5);
    });
  });

  describe('trackDifficultyAdjustment', () => {
    it('should track successful adjustment', async () => {
      trackDifficultyAdjustment({
        success: true,
        iterations: 3,
        budgetUsed: 26,
        budgetTotal: 50,
      });

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.adjustment.totalAdjustments).toBe(1);
      expect(snapshot.adjustment.successfulAdjustments).toBe(1);
      expect(snapshot.adjustment.failedAdjustments).toBe(0);
      expect(snapshot.adjustment.averageIterations).toBe(3);
      expect(snapshot.adjustment.convergenceRate).toBe(100);
      expect(snapshot.adjustment.budgetUtilizationStats.average).toBe(52);
    });

    it('should track failed adjustment', async () => {
      trackDifficultyAdjustment({
        success: false,
        iterations: 5,
        budgetUsed: 50,
        budgetTotal: 50,
      });

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.adjustment.totalAdjustments).toBe(1);
      expect(snapshot.adjustment.successfulAdjustments).toBe(0);
      expect(snapshot.adjustment.failedAdjustments).toBe(1);
      expect(snapshot.adjustment.convergenceRate).toBe(0);
    });

    it('should calculate budget utilization stats', async () => {
      trackDifficultyAdjustment({
        success: true,
        iterations: 2,
        budgetUsed: 10,
        budgetTotal: 50,
      });
      trackDifficultyAdjustment({
        success: true,
        iterations: 3,
        budgetUsed: 30,
        budgetTotal: 50,
      });
      trackDifficultyAdjustment({
        success: true,
        iterations: 4,
        budgetUsed: 50,
        budgetTotal: 50,
      });

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.adjustment.budgetUtilizationStats.min).toBe(20);
      expect(snapshot.adjustment.budgetUtilizationStats.max).toBe(100);
      expect(snapshot.adjustment.budgetUtilizationStats.average).toBeCloseTo(60, 1);
      expect(snapshot.adjustment.budgetUtilizationStats.median).toBe(60);
    });

    it('should limit budget utilization samples to 100', async () => {
      for (let i = 0; i < 150; i++) {
        trackDifficultyAdjustment({
          success: true,
          iterations: 1,
          budgetUsed: 25,
          budgetTotal: 50,
        });
      }

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.adjustment.totalAdjustments).toBe(150);
      // Budget utilization stats should only use last 100 samples
      expect(snapshot.adjustment.budgetUtilizationStats.average).toBe(50);
    });
  });

  describe('getMetricsSnapshot', () => {
    it('should return snapshot with timestamp', async () => {
      const before = Date.now();
      const snapshot = await getMetricsSnapshot();
      const after = Date.now();

      expect(snapshot.timestamp).toBeGreaterThanOrEqual(before);
      expect(snapshot.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle empty metrics', async () => {
      const snapshot = await getMetricsSnapshot();

      expect(snapshot.batch.totalBatches).toBe(0);
      expect(snapshot.batch.batchSuccessRate).toBe(0);
      expect(snapshot.batch.averageCandidatesPerBatch).toBe(0);
      expect(snapshot.adjustment.totalAdjustments).toBe(0);
      expect(snapshot.adjustment.convergenceRate).toBe(0);
      expect(snapshot.adjustment.averageIterations).toBe(0);
      expect(snapshot.shadow.updateFailures).toBe(0);
    });

    it('should include persistent shadow update failures', async () => {
      redisGetMock.mockResolvedValue('12');

      const snapshot = await getMetricsSnapshot();

      expect(snapshot.shadow.updateFailures).toBe(12);
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', async () => {
      trackBatchGeneration({
        candidatesRequested: 3,
        candidatesReturned: 3,
        candidateSelected: true,
      });
      trackDifficultyAdjustment({
        success: true,
        iterations: 3,
        budgetUsed: 26,
        budgetTotal: 50,
      });

      resetMetrics();

      const snapshot = await getMetricsSnapshot();
      expect(snapshot.batch.totalBatches).toBe(0);
      expect(snapshot.adjustment.totalAdjustments).toBe(0);
    });
  });
});
