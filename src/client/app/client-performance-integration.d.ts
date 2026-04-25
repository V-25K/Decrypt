/**
 * Client-Side Performance Integration
 *
 * Wires client-side performance optimizations together:
 * - ImmutableGameState for optimized rendering
 * - Centralized module loading with ModuleManager
 * - Bundle optimization tracking
 * - Render performance monitoring
 */
import { ImmutableGameState } from './ImmutableGameState';
import type { Puzzle, PuzzlePublicTile } from './types';
/**
 * Client performance configuration
 */
export interface ClientPerformanceConfig {
    enableImmutableState: boolean;
    enableRenderOptimization: boolean;
    enableModuleDeduplication: boolean;
    enableBundleAnalysis: boolean;
    enablePerformanceMonitoring: boolean;
}
/**
 * Client Performance Integration Manager
 */
export declare class ClientPerformanceIntegration {
    private config;
    private moduleManager;
    private bundleOptimizer;
    private initialized;
    constructor(config?: Partial<ClientPerformanceConfig>);
    /**
     * Initialize client-side performance optimizations
     */
    initialize(): Promise<void>;
    /**
     * Initialize bundle analysis and tracking
     */
    private initializeBundleAnalysis;
    /**
     * Initialize performance monitoring
     */
    private initializePerformanceMonitoring;
    /**
     * Pre-warm critical modules to avoid loading delays
     */
    private preWarmCriticalModules;
    /**
     * Create optimized game state hook
     */
    createOptimizedGameStateHook(): (initialPuzzle?: Puzzle) => readonly [ImmutableGameState, (updater: (prev: ImmutableGameState) => ImmutableGameState) => void];
    /**
     * Create optimized render hook for components
     */
    createOptimizedRenderHook(): (componentName: string, dependencies?: any[]) => {
        metrics: import("./useRenderOptimization").RenderMetrics;
        recordRender: (wasNecessary?: boolean) => void;
        createMemoComparison: () => (prevProps: any, nextProps: any) => boolean;
        isRenderNecessary: (prevDeps?: any[]) => boolean;
    };
    /**
     * Get optimized confetti loader
     */
    getOptimizedConfettiLoader(): () => Promise<typeof import("canvas-confetti")>;
    /**
     * Create optimized puzzle tile memo comparison
     */
    createPuzzleTileMemoComparison(): (prevProps: {
        tile: PuzzlePublicTile;
        isSelected: boolean;
        isCorrectGuess: boolean;
        isWrongGuess: boolean;
    }, nextProps: {
        tile: PuzzlePublicTile;
        isSelected: boolean;
        isCorrectGuess: boolean;
        isWrongGuess: boolean;
    }) => boolean;
    /**
     * Get performance metrics
     */
    getPerformanceMetrics(): {
        bundle: import("../../shared/bundle-analysis").BundleAnalysis;
        modules: {
            loadedCount: number;
        };
        loadTimes: import("../../shared/bundle-analysis").LoadTimeMetrics;
        recommendations: string[];
    };
    /**
     * Validate client optimizations
     */
    validateOptimizations(): {
        success: boolean;
        issues: string[];
        recommendations: string[];
    };
    /**
     * Get configuration
     */
    getConfig(): ClientPerformanceConfig;
    /**
     * Update configuration
     */
    updateConfig(updates: Partial<ClientPerformanceConfig>): void;
}
/**
 * Global client performance integration instance
 */
export declare const clientPerformanceIntegration: ClientPerformanceIntegration;
/**
 * Convenience hooks and utilities
 */
export declare const useOptimizedGameState: (initialPuzzle?: Puzzle) => readonly [ImmutableGameState, (updater: (prev: ImmutableGameState) => ImmutableGameState) => void];
export declare const useOptimizedRender: (componentName: string, dependencies?: any[]) => {
    metrics: import("./useRenderOptimization").RenderMetrics;
    recordRender: (wasNecessary?: boolean) => void;
    createMemoComparison: () => (prevProps: any, nextProps: any) => boolean;
    isRenderNecessary: (prevDeps?: any[]) => boolean;
};
export declare const getOptimizedConfetti: () => Promise<typeof import("canvas-confetti")>;
export declare const createPuzzleTileComparison: (prevProps: {
    tile: PuzzlePublicTile;
    isSelected: boolean;
    isCorrectGuess: boolean;
    isWrongGuess: boolean;
}, nextProps: {
    tile: PuzzlePublicTile;
    isSelected: boolean;
    isCorrectGuess: boolean;
    isWrongGuess: boolean;
}) => boolean;
/**
 * Performance validation utilities
 */
export declare const validateClientOptimizations: () => {
    success: boolean;
    issues: string[];
    recommendations: string[];
};
export declare const getClientPerformanceMetrics: () => {
    bundle: import("../../shared/bundle-analysis").BundleAnalysis;
    modules: {
        loadedCount: number;
    };
    loadTimes: import("../../shared/bundle-analysis").LoadTimeMetrics;
    recommendations: string[];
};
