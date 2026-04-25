import React from 'react';
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
    renderEfficiency: number;
}
/**
 * Performance regression detection thresholds
 */
interface PerformanceThresholds {
    maxAverageRenderTime: number;
    maxRenderCount: number;
    minRenderEfficiency: number;
    timeWindow: number;
}
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
export declare function useRenderOptimization(componentName: string, dependencies?: any[]): {
    metrics: RenderMetrics;
    recordRender: (wasNecessary?: boolean) => void;
    createMemoComparison: () => (prevProps: any, nextProps: any) => boolean;
    isRenderNecessary: (prevDeps?: any[]) => boolean;
};
/**
 * Higher-order component for automatic render optimization
 *
 * @param Component - React component to optimize
 * @param componentName - Name for performance tracking
 * @param dependencies - Function to extract dependencies from props
 * @returns Optimized component with performance monitoring
 */
export declare function withRenderOptimization<P extends object>(Component: React.ComponentType<P>, componentName: string, dependencies?: (props: P) => any[]): React.MemoExoticComponent<(props: P) => React.ReactElement<P, string | React.JSXElementConstructor<any>>>;
/**
 * Hook to subscribe to performance metrics updates
 *
 * @param componentName - Optional component name to filter metrics
 * @returns Current metrics and subscription utilities
 */
export declare function usePerformanceMetrics(componentName?: string): {
    metrics: RenderMetrics | RenderMetrics[];
    resetMetrics: (name?: string) => void;
    setThresholds: (thresholds: Partial<PerformanceThresholds>) => void;
};
/**
 * Development-only performance debugging utilities
 */
export declare const RenderOptimizationDevTools: {
    /**
     * Log all performance metrics to console
     */
    logMetrics(): void;
    /**
     * Get detailed metrics for a specific component
     */
    getComponentMetrics(componentName: string): RenderMetrics;
    /**
     * Reset all metrics (useful for testing)
     */
    resetAll(): void;
    /**
     * Set custom performance thresholds
     */
    setThresholds(thresholds: Partial<PerformanceThresholds>): void;
};
export {};
