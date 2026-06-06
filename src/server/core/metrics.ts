/**
 * Metrics tracking for challenge generation and difficulty adjustment
 * 
 * This module provides structured logging for monitoring:
 * - Batch generation success rates
 * - Difficulty adjustment convergence rates
 * - Budget utilization distribution
 */

type BatchMetrics = {
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
  totalCandidatesRequested: number;
  totalCandidatesReturned: number;
  totalCandidatesSelected: number;
  averageCandidatesPerBatch: number;
  batchSuccessRate: number;
};

type AdjustmentMetrics = {
  totalAdjustments: number;
  successfulAdjustments: number;
  failedAdjustments: number;
  averageIterations: number;
  convergenceRate: number;
  budgetUtilizationStats: {
    min: number;
    max: number;
    average: number;
    median: number;
  };
};

type MetricsSnapshot = {
  timestamp: number;
  batch: BatchMetrics;
  adjustment: AdjustmentMetrics;
};

// In-memory metrics storage (resets on server restart)
const metrics = {
  batch: {
    totalBatches: 0,
    successfulBatches: 0,
    failedBatches: 0,
    totalCandidatesRequested: 0,
    totalCandidatesReturned: 0,
    totalCandidatesSelected: 0,
  },
  adjustment: {
    totalAdjustments: 0,
    successfulAdjustments: 0,
    failedAdjustments: 0,
    totalIterations: 0,
    budgetUtilizations: [] as number[],
  },
};

/**
 * Track batch generation attempt
 */
export const trackBatchGeneration = (params: {
  candidatesRequested: number;
  candidatesReturned: number;
  candidateSelected: boolean;
}): void => {
  metrics.batch.totalBatches += 1;
  metrics.batch.totalCandidatesRequested += params.candidatesRequested;
  metrics.batch.totalCandidatesReturned += params.candidatesReturned;
  
  if (params.candidateSelected) {
    metrics.batch.successfulBatches += 1;
    metrics.batch.totalCandidatesSelected += 1;
  } else {
    metrics.batch.failedBatches += 1;
  }
};

/**
 * Track difficulty adjustment attempt
 */
export const trackDifficultyAdjustment = (params: {
  success: boolean;
  iterations: number;
  budgetUsed: number;
  budgetTotal: number;
}): void => {
  metrics.adjustment.totalAdjustments += 1;
  metrics.adjustment.totalIterations += params.iterations;
  
  if (params.success) {
    metrics.adjustment.successfulAdjustments += 1;
  } else {
    metrics.adjustment.failedAdjustments += 1;
  }
  
  const utilization = params.budgetTotal > 0 
    ? (params.budgetUsed / params.budgetTotal) * 100 
    : 0;
  metrics.adjustment.budgetUtilizations.push(utilization);
  
  // Keep only last 100 utilization samples to prevent memory growth
  if (metrics.adjustment.budgetUtilizations.length > 100) {
    metrics.adjustment.budgetUtilizations.shift();
  }
};

/**
 * Get current metrics snapshot
 */
export const getMetricsSnapshot = (): MetricsSnapshot => {
  const batchSuccessRate = metrics.batch.totalBatches > 0
    ? (metrics.batch.successfulBatches / metrics.batch.totalBatches) * 100
    : 0;
  
  const averageCandidatesPerBatch = metrics.batch.totalBatches > 0
    ? metrics.batch.totalCandidatesReturned / metrics.batch.totalBatches
    : 0;
  
  const convergenceRate = metrics.adjustment.totalAdjustments > 0
    ? (metrics.adjustment.successfulAdjustments / metrics.adjustment.totalAdjustments) * 100
    : 0;
  
  const averageIterations = metrics.adjustment.totalAdjustments > 0
    ? metrics.adjustment.totalIterations / metrics.adjustment.totalAdjustments
    : 0;
  
  const sortedUtilizations = [...metrics.adjustment.budgetUtilizations].sort((a, b) => a - b);
  const budgetUtilizationStats = {
    min: sortedUtilizations[0] ?? 0,
    max: sortedUtilizations[sortedUtilizations.length - 1] ?? 0,
    average: sortedUtilizations.length > 0
      ? sortedUtilizations.reduce((sum, val) => sum + val, 0) / sortedUtilizations.length
      : 0,
    median: sortedUtilizations.length > 0
      ? (sortedUtilizations[Math.floor(sortedUtilizations.length / 2)] ?? 0)
      : 0,
  };
  
  return {
    timestamp: Date.now(),
    batch: {
      totalBatches: metrics.batch.totalBatches,
      successfulBatches: metrics.batch.successfulBatches,
      failedBatches: metrics.batch.failedBatches,
      totalCandidatesRequested: metrics.batch.totalCandidatesRequested,
      totalCandidatesReturned: metrics.batch.totalCandidatesReturned,
      totalCandidatesSelected: metrics.batch.totalCandidatesSelected,
      averageCandidatesPerBatch,
      batchSuccessRate,
    },
    adjustment: {
      totalAdjustments: metrics.adjustment.totalAdjustments,
      successfulAdjustments: metrics.adjustment.successfulAdjustments,
      failedAdjustments: metrics.adjustment.failedAdjustments,
      averageIterations,
      convergenceRate,
      budgetUtilizationStats,
    },
  };
};

/**
 * Reset all metrics (useful for testing)
 */
export const resetMetrics = (): void => {
  metrics.batch.totalBatches = 0;
  metrics.batch.successfulBatches = 0;
  metrics.batch.failedBatches = 0;
  metrics.batch.totalCandidatesRequested = 0;
  metrics.batch.totalCandidatesReturned = 0;
  metrics.batch.totalCandidatesSelected = 0;
  
  metrics.adjustment.totalAdjustments = 0;
  metrics.adjustment.successfulAdjustments = 0;
  metrics.adjustment.failedAdjustments = 0;
  metrics.adjustment.totalIterations = 0;
  metrics.adjustment.budgetUtilizations = [];
};
