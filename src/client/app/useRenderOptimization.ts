import React, { useRef, useCallback, useEffect } from 'react';

/**
 * Performance metrics for render optimization monitoring
 */
export interface RenderMetrics {
  componentName: string;
  renderCount: number;
  totalRenderTime: number;
  averageRenderTime: number;
  lastRenderTime: number;
  skippedRenders: number;
  renderEfficiency: number; // percentage of renders that were necessary
}

/**
 * Performance regression detection thresholds
 */
interface PerformanceThresholds {
  maxAverageRenderTime: number; // milliseconds
  maxRenderCount: number; // renders per time window
  minRenderEfficiency: number; // percentage (0-100)
  timeWindow: number; // milliseconds
}

/**
 * Default performance thresholds for render optimization
 */
const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  maxAverageRenderTime: 16, // 60fps = 16.67ms per frame
  maxRenderCount: 60, // max 60 renders per second
  minRenderEfficiency: 70, // at least 70% of renders should be necessary
  timeWindow: 1000, // 1 second window
};

/**
 * Global performance monitoring registry
 */
class RenderPerformanceMonitor {
  private metrics = new Map<string, RenderMetrics>();
  private thresholds: PerformanceThresholds;
  private listeners = new Set<(metrics: RenderMetrics) => void>();

  constructor(thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
  }

  recordRender(componentName: string, renderTime: number, wasNecessary: boolean): void {
    const existing = this.metrics.get(componentName) || {
      componentName,
      renderCount: 0,
      totalRenderTime: 0,
      averageRenderTime: 0,
      lastRenderTime: 0,
      skippedRenders: 0,
      renderEfficiency: 100,
    };

    const newRenderCount = existing.renderCount + 1;
    const newTotalTime = existing.totalRenderTime + renderTime;
    const newAverageTime = newTotalTime / newRenderCount;
    const newSkippedRenders = wasNecessary ? existing.skippedRenders : existing.skippedRenders + 1;
    const newEfficiency = ((newRenderCount - newSkippedRenders) / newRenderCount) * 100;

    const updatedMetrics: RenderMetrics = {
      componentName,
      renderCount: newRenderCount,
      totalRenderTime: newTotalTime,
      averageRenderTime: newAverageTime,
      lastRenderTime: renderTime,
      skippedRenders: newSkippedRenders,
      renderEfficiency: newEfficiency,
    };

    this.metrics.set(componentName, updatedMetrics);

    // Check for performance regressions
    this.checkPerformanceRegression(updatedMetrics);

    // Notify listeners
    this.listeners.forEach(listener => listener(updatedMetrics));
  }

  private checkPerformanceRegression(metrics: RenderMetrics): void {
    const issues: string[] = [];

    if (metrics.averageRenderTime > this.thresholds.maxAverageRenderTime) {
      issues.push(`Average render time (${metrics.averageRenderTime.toFixed(2)}ms) exceeds threshold (${this.thresholds.maxAverageRenderTime}ms)`);
    }

    if (metrics.renderEfficiency < this.thresholds.minRenderEfficiency) {
      issues.push(`Render efficiency (${metrics.renderEfficiency.toFixed(1)}%) below threshold (${this.thresholds.minRenderEfficiency}%)`);
    }

    if (issues.length > 0) {
      console.warn(`[RenderOptimization] Performance regression detected in ${metrics.componentName}:`, issues);
    }
  }

  getMetrics(componentName?: string): RenderMetrics | RenderMetrics[] {
    if (componentName) {
      return this.metrics.get(componentName) || {
        componentName,
        renderCount: 0,
        totalRenderTime: 0,
        averageRenderTime: 0,
        lastRenderTime: 0,
        skippedRenders: 0,
        renderEfficiency: 100,
      };
    }
    return Array.from(this.metrics.values());
  }

  subscribe(listener: (metrics: RenderMetrics) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reset(componentName?: string): void {
    if (componentName) {
      this.metrics.delete(componentName);
    } else {
      this.metrics.clear();
    }
  }

  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
}

// Global monitor instance
const globalMonitor = new RenderPerformanceMonitor();

/**
 * React hook for render performance monitoring and optimization
 * 
 * Features:
 * - Tracks render cycles and performance metrics
 * - Detects performance regressions automatically
 * - Provides render efficiency analysis
 * - Integrates with React.memo for optimization
 * 
 * @param componentName - Name of the component for tracking
 * @param dependencies - Dependencies to track for render necessity
 * @returns Render optimization utilities and metrics
 */
export function useRenderOptimization(
  componentName: string,
  dependencies?: any[]
): {
  metrics: RenderMetrics;
  recordRender: (wasNecessary?: boolean) => void;
  createMemoComparison: () => (prevProps: any, nextProps: any) => boolean;
  isRenderNecessary: (prevDeps?: any[]) => boolean;
} {
  const renderStartTime = useRef<number>(0);
  const previousDependencies = useRef<any[]>(dependencies || []);
  const renderCountRef = useRef(0);

  // Start timing the render
  renderStartTime.current = performance.now();

  // Record render completion
  const recordRender = useCallback((wasNecessary: boolean = true) => {
    const renderTime = performance.now() - renderStartTime.current;
    globalMonitor.recordRender(componentName, renderTime, wasNecessary);
  }, [componentName]);

  // Check if render is necessary based on dependencies
  const isRenderNecessary = useCallback((prevDeps?: any[]) => {
    const currentDeps = dependencies || [];
    const previousDeps = prevDeps || previousDependencies.current;

    if (currentDeps.length !== previousDeps.length) {
      return true;
    }

    for (let i = 0; i < currentDeps.length; i++) {
      if (!Object.is(currentDeps[i], previousDeps[i])) {
        return true;
      }
    }

    return false;
  }, [dependencies]);

  // Create memoization comparison function
  const createMemoComparison = useCallback(() => {
    return (prevProps: any, nextProps: any): boolean => {
      // Extract dependency values from props
      const prevDeps = dependencies?.map(dep => 
        typeof dep === 'function' ? dep(prevProps) : dep
      ) || [];
      const nextDeps = dependencies?.map(dep => 
        typeof dep === 'function' ? dep(nextProps) : dep
      ) || [];

	      const shouldSkip =
	        prevDeps.length === nextDeps.length &&
	        prevDeps.every((dep, index) => Object.is(dep, nextDeps[index]));
      
      if (shouldSkip) {
        recordRender(false); // Record as unnecessary render
      }

      return shouldSkip;
    };
  }, [dependencies, isRenderNecessary, recordRender]);

  // Record render on every render
  useEffect(() => {
    const necessary = isRenderNecessary();
    recordRender(necessary);
    previousDependencies.current = dependencies || [];
    renderCountRef.current += 1;
  });

  // Get current metrics
  const metrics = globalMonitor.getMetrics(componentName) as RenderMetrics;

  return {
    metrics,
    recordRender,
    createMemoComparison,
    isRenderNecessary,
  };
}

/**
 * Higher-order component for automatic render optimization
 * 
 * @param Component - React component to optimize
 * @param componentName - Name for performance tracking
 * @param dependencies - Function to extract dependencies from props
 * @returns Optimized component with performance monitoring
 */
export function withRenderOptimization<P extends object>(
  Component: React.ComponentType<P>,
  componentName: string,
  dependencies?: (props: P) => any[]
) {
  const OptimizedComponent = React.memo((props: P) => {
    const deps = dependencies ? dependencies(props) : [];
	    const { recordRender } = useRenderOptimization(componentName, deps);

    // Record that this render was necessary (since React.memo allowed it)
    useEffect(() => {
      recordRender(true);
    });

    return React.createElement(Component, props);
  }, (prevProps, nextProps) => {
    // Custom comparison function
    const prevDeps = dependencies ? dependencies(prevProps) : [];
    const nextDeps = dependencies ? dependencies(nextProps) : [];

    if (prevDeps.length !== nextDeps.length) {
      return false; // Props changed, re-render
    }

    for (let i = 0; i < prevDeps.length; i++) {
      if (!Object.is(prevDeps[i], nextDeps[i])) {
        return false; // Props changed, re-render
      }
    }

    return true; // Props same, skip render
  });

  OptimizedComponent.displayName = `withRenderOptimization(${componentName})`;
  return OptimizedComponent;
}

/**
 * Hook to subscribe to performance metrics updates
 * 
 * @param componentName - Optional component name to filter metrics
 * @returns Current metrics and subscription utilities
 */
export function usePerformanceMetrics(componentName?: string) {
  const [metrics, setMetrics] = React.useState<RenderMetrics | RenderMetrics[]>(
    () => globalMonitor.getMetrics(componentName)
  );

  useEffect(() => {
    const unsubscribe = globalMonitor.subscribe((updatedMetrics) => {
      if (!componentName || updatedMetrics.componentName === componentName) {
        setMetrics(globalMonitor.getMetrics(componentName));
      }
    });

    return unsubscribe;
  }, [componentName]);

  return {
    metrics,
    resetMetrics: (name?: string) => globalMonitor.reset(name),
    setThresholds: (thresholds: Partial<PerformanceThresholds>) => globalMonitor.setThresholds(thresholds),
  };
}

/**
 * Development-only performance debugging utilities
 */
export const RenderOptimizationDevTools = {
  /**
   * Log all performance metrics to console
   */
  logMetrics(): void {
    const allMetrics = globalMonitor.getMetrics() as RenderMetrics[];
    console.table(allMetrics.map(m => ({
      Component: m.componentName,
      'Render Count': m.renderCount,
      'Avg Time (ms)': m.averageRenderTime.toFixed(2),
      'Efficiency (%)': m.renderEfficiency.toFixed(1),
      'Skipped': m.skippedRenders,
    })));
  },

  /**
   * Get detailed metrics for a specific component
   */
  getComponentMetrics(componentName: string): RenderMetrics {
    return globalMonitor.getMetrics(componentName) as RenderMetrics;
  },

  /**
   * Reset all metrics (useful for testing)
   */
  resetAll(): void {
    globalMonitor.reset();
  },

  /**
   * Set custom performance thresholds
   */
  setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    globalMonitor.setThresholds(thresholds);
  },
};

// Make dev tools available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).RenderOptimizationDevTools = RenderOptimizationDevTools;
}

// Import React for JSX and hooks
