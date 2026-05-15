/**
 * Bundle Analysis Tools for Client Optimization Tracking
 * Provides utilities to monitor bundle size and detect duplicate modules
 */

export interface BundleAnalysis {
  duplicateModules: string[];
  bundleSize: number;
  loadTime: number;
  moduleCount: number;
  chunkSizes: Record<string, number>;
}

export interface ModuleInfo {
  name: string;
  size: number;
  loadCount: number;
  duplicated: boolean;
}

export interface LoadTimeMetrics {
  domContentLoaded: number;
  firstPaint: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  totalLoadTime: number;
}

export class BundleOptimizer {
  private loadedModules = new Map<string, ModuleInfo>();
  private loadTimes: LoadTimeMetrics | null = null;
  private performanceObserver: PerformanceObserver | null = null;
  private static instance: BundleOptimizer;

  static getInstance(): BundleOptimizer {
    if (!BundleOptimizer.instance) {
      BundleOptimizer.instance = new BundleOptimizer();
    }
    return BundleOptimizer.instance;
  }

  /**
   * Track module loading
   */
  trackModuleLoad(moduleName: string, size: number): void {
    const existing = this.loadedModules.get(moduleName);
    if (existing) {
      existing.loadCount++;
      existing.duplicated = existing.loadCount > 1;
    } else {
      this.loadedModules.set(moduleName, {
        name: moduleName,
        size,
        loadCount: 1,
        duplicated: false
      });
    }
  }

  /**
   * Analyze current bundle for duplicates and optimization opportunities
   */
  analyzeDuplicates(): BundleAnalysis {
    const duplicateModules: string[] = [];
    let totalSize = 0;
    let moduleCount = 0;

    for (const [name, info] of this.loadedModules) {
      if (info.duplicated) {
        duplicateModules.push(name);
      }
      totalSize += info.size * info.loadCount;
      moduleCount++;
    }

    return {
      duplicateModules,
      bundleSize: totalSize,
      loadTime: this.loadTimes?.totalLoadTime || 0,
      moduleCount,
      chunkSizes: this.calculateChunkSizes()
    };
  }

  /**
   * Measure page load performance metrics
   */
  measureLoadTimes(): LoadTimeMetrics {
    this.dispose();

    if (typeof window === 'undefined' || !window.performance) {
      return {
        domContentLoaded: 0,
        firstPaint: 0,
        firstContentfulPaint: 0,
        largestContentfulPaint: 0,
        totalLoadTime: 0
      };
    }

	    const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
	    const paint = window.performance.getEntriesByType('paint');
    
    const firstPaint = paint.find(entry => entry.name === 'first-paint')?.startTime || 0;
    const firstContentfulPaint = paint.find(entry => entry.name === 'first-contentful-paint')?.startTime || 0;

    // Get LCP if available
    let largestContentfulPaint = 0;
    if ('PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
	          const entries = list.getEntries();
	          const lastEntry = entries[entries.length - 1];
	          if (lastEntry) {
	            largestContentfulPaint = lastEntry.startTime;
	          }
        });
        this.performanceObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        this.performanceObserver = null;
        // LCP not supported
      }
    }

	    const metrics: LoadTimeMetrics = {
	      domContentLoaded: navigation
	        ? navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart
	        : 0,
	      firstPaint,
	      firstContentfulPaint,
	      largestContentfulPaint,
	      totalLoadTime: navigation ? navigation.loadEventEnd - navigation.fetchStart : 0
	    };

    this.loadTimes = metrics;
    return metrics;
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations(): string[] {
    const recommendations: string[] = [];
    const analysis = this.analyzeDuplicates();

    if (analysis.duplicateModules.length > 0) {
      recommendations.push(
        `Found ${analysis.duplicateModules.length} duplicate modules: ${analysis.duplicateModules.join(', ')}. Consider using a module manager or webpack optimization.`
      );
    }

    if (analysis.bundleSize > 1024 * 1024) { // > 1MB
      recommendations.push(
        `Bundle size is ${Math.round(analysis.bundleSize / 1024)} KB. Consider code splitting or lazy loading.`
      );
    }

    if (this.loadTimes && this.loadTimes.totalLoadTime > 3000) { // > 3 seconds
      recommendations.push(
        `Total load time is ${Math.round(this.loadTimes.totalLoadTime)}ms. Consider optimizing critical resources.`
      );
    }

    const largeModules = Array.from(this.loadedModules.values())
      .filter(module => module.size > 100 * 1024) // > 100KB
      .sort((a, b) => b.size - a.size);

    if (largeModules.length > 0) {
      recommendations.push(
        `Large modules detected: ${largeModules.slice(0, 3).map(m => `${m.name} (${Math.round(m.size / 1024)}KB)`).join(', ')}`
      );
    }

    return recommendations;
  }

  /**
   * Monitor bundle size changes over time
   */
  trackBundleSizeChange(baseline: number): {
    currentSize: number;
    change: number;
    changePercent: number;
    improved: boolean;
  } {
    const currentSize = this.analyzeDuplicates().bundleSize;
    const change = currentSize - baseline;
    const changePercent = (change / baseline) * 100;

    return {
      currentSize,
      change,
      changePercent,
      improved: change < 0
    };
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    bundleAnalysis: BundleAnalysis;
    loadMetrics: LoadTimeMetrics;
    recommendations: string[];
    moduleDetails: ModuleInfo[];
  } {
    return {
      bundleAnalysis: this.analyzeDuplicates(),
      loadMetrics: this.loadTimes || this.measureLoadTimes(),
      recommendations: this.getOptimizationRecommendations(),
      moduleDetails: Array.from(this.loadedModules.values())
    };
  }

  /**
   * Clear tracking data
   */
  clearTracking(): void {
    this.loadedModules.clear();
    this.loadTimes = null;
    this.dispose();
  }

  dispose(): void {
    if (!this.performanceObserver) {
      return;
    }
    this.performanceObserver.disconnect();
    this.performanceObserver = null;
  }

  private calculateChunkSizes(): Record<string, number> {
    const chunkSizes: Record<string, number> = {};
    
    // Group modules by likely chunks (simplified heuristic)
    for (const [name, info] of this.loadedModules) {
      let chunkName = 'main';
      
      if (name.includes('node_modules')) {
        chunkName = 'vendor';
      } else if (name.includes('client')) {
        chunkName = 'client';
      } else if (name.includes('server')) {
        chunkName = 'server';
      } else if (name.includes('shared')) {
        chunkName = 'shared';
      }

      if (!chunkSizes[chunkName]) {
        chunkSizes[chunkName] = 0;
      }
	      chunkSizes[chunkName] = (chunkSizes[chunkName] ?? 0) + info.size;
    }

    return chunkSizes;
  }
}

/**
 * Module Manager for preventing duplicate imports
 */
export class ModuleManager {
  private static instance: ModuleManager;
  private loadedModules = new Map<string, Promise<unknown>>();
  private bundleOptimizer = BundleOptimizer.getInstance();

  static getInstance(): ModuleManager {
    if (!ModuleManager.instance) {
      ModuleManager.instance = new ModuleManager();
    }
    return ModuleManager.instance;
  }

  /**
   * Load a module with deduplication
   */
  async loadModule<T>(moduleId: string, loader: () => Promise<T>): Promise<T> {
    if (this.loadedModules.has(moduleId)) {
      return this.loadedModules.get(moduleId) as Promise<T>;
    }

    const modulePromise = this.loadModuleWithTracking(moduleId, loader);
    this.loadedModules.set(moduleId, modulePromise);

    return modulePromise;
  }

  /**
   * Check if a module is already loaded
   */
  isModuleLoaded(moduleId: string): boolean {
    return this.loadedModules.has(moduleId);
  }

  /**
   * Get loaded module count
   */
  getLoadedModuleCount(): number {
    return this.loadedModules.size;
  }

  /**
   * Clear module cache (for testing)
   */
  clearCache(): void {
    this.loadedModules.clear();
  }

  private async loadModuleWithTracking<T>(moduleId: string, loader: () => Promise<T>): Promise<T> {
    try {
      const module = await loader();
      
      // Estimate module size (simplified)
      const estimatedSize = this.estimateModuleSize(module);
      this.bundleOptimizer.trackModuleLoad(moduleId, estimatedSize);
      
      return module;
    } catch (error) {
      // Remove failed module from cache
      this.loadedModules.delete(moduleId);
      throw error;
    }
  }

  private estimateModuleSize(module: unknown): number {
    // Simplified size estimation
    try {
      const serialized = JSON.stringify(module);
      return serialized.length * 2; // Rough estimate including overhead
    } catch {
      return 1024; // Default estimate for non-serializable modules
    }
  }
}

/**
 * Centralized confetti module loader to fix duplication
 */
export const loadConfettiModule = () => {
  return ModuleManager.getInstance().loadModule(
    'canvas-confetti',
    () => import('canvas-confetti') as Promise<typeof import('canvas-confetti')>
  );
};

/**
 * Performance monitoring hook for React components
 */
export function usePerformanceMonitoring(_componentName: string) {
  if (typeof window === 'undefined') {
    return { renderCount: 0, averageRenderTime: 0 };
  }

  const [renderStats, setRenderStats] = React.useState({
    renderCount: 0,
    averageRenderTime: 0,
    totalRenderTime: 0
  });

  React.useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const renderTime = performance.now() - startTime;
      setRenderStats(prev => {
        const newCount = prev.renderCount + 1;
        const newTotal = prev.totalRenderTime + renderTime;
        return {
          renderCount: newCount,
          averageRenderTime: newTotal / newCount,
          totalRenderTime: newTotal
        };
      });
    };
  });

  return renderStats;
}

// Add React import for the hook
import React from 'react';
