/**
 * Client-Side Performance Integration
 * 
 * Wires client-side performance optimizations together:
 * - ImmutableGameState for optimized rendering
 * - Centralized module loading with ModuleManager
 * - Bundle optimization tracking
 * - Render performance monitoring
 */

import { ImmutableGameState, useImmutableGameState } from './ImmutableGameState';
import { useRenderOptimization, RenderOptimizationDevTools } from './useRenderOptimization';
import { ModuleManager, BundleOptimizer, loadConfettiModule } from '../../shared/bundle-analysis';
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
 * Default client performance configuration
 */
const DEFAULT_CLIENT_CONFIG: ClientPerformanceConfig = {
  enableImmutableState: true,
  enableRenderOptimization: true,
  enableModuleDeduplication: true,
  enableBundleAnalysis: true,
  enablePerformanceMonitoring: true,
};

/**
 * Client Performance Integration Manager
 */
export class ClientPerformanceIntegration {
  private config: ClientPerformanceConfig;
  private moduleManager: ModuleManager;
  private bundleOptimizer: BundleOptimizer;
  private initialized = false;

  constructor(config: Partial<ClientPerformanceConfig> = {}) {
    this.config = { ...DEFAULT_CLIENT_CONFIG, ...config };
    this.moduleManager = ModuleManager.getInstance();
    this.bundleOptimizer = BundleOptimizer.getInstance();
  }

  /**
   * Initialize client-side performance optimizations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[ClientPerformance] Initializing client-side optimizations...');

    // Initialize bundle analysis
    if (this.config.enableBundleAnalysis) {
      this.initializeBundleAnalysis();
    }

    // Initialize performance monitoring
    if (this.config.enablePerformanceMonitoring) {
      this.initializePerformanceMonitoring();
    }

    // Pre-warm critical modules
    if (this.config.enableModuleDeduplication) {
      await this.preWarmCriticalModules();
    }

    this.initialized = true;
    console.log('[ClientPerformance] Client-side optimizations initialized');
  }

  /**
   * Initialize bundle analysis and tracking
   */
  private initializeBundleAnalysis(): void {
    // Clear any existing tracking
    this.bundleOptimizer.clearTracking();

    // Start measuring load times
    this.bundleOptimizer.measureLoadTimes();

    // Track initial bundle state
    const initialAnalysis = this.bundleOptimizer.analyzeDuplicates();
    console.log('[ClientPerformance] Initial bundle analysis:', initialAnalysis);
  }

  /**
   * Initialize performance monitoring
   */
  private initializePerformanceMonitoring(): void {
    // Set up render optimization thresholds
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
      // Make dev tools available in development
      (window as any).ClientPerformanceDevTools = {
        ...RenderOptimizationDevTools,
        getBundleAnalysis: () => this.bundleOptimizer.analyzeDuplicates(),
        getModuleCount: () => this.moduleManager.getLoadedModuleCount(),
        clearModuleCache: () => this.moduleManager.clearCache(),
      };
    }
  }

  /**
   * Pre-warm critical modules to avoid loading delays
   */
  private async preWarmCriticalModules(): Promise<void> {
    try {
      // Pre-load confetti module to avoid duplication
      await loadConfettiModule();
      console.log('[ClientPerformance] Critical modules pre-warmed');
    } catch (error) {
      console.warn('[ClientPerformance] Failed to pre-warm modules:', error);
    }
  }

  /**
   * Create optimized game state hook
   */
  createOptimizedGameStateHook() {
    return (initialPuzzle?: Puzzle) => {
      if (this.config.enableImmutableState) {
        const initialState = initialPuzzle 
          ? ImmutableGameState.fromPuzzle(initialPuzzle)
          : ImmutableGameState.empty();
        
        return useImmutableGameState(initialState);
      }

      // Fallback to regular state management
      const [state, setState] = React.useState(
        initialPuzzle 
          ? ImmutableGameState.fromPuzzle(initialPuzzle)
          : ImmutableGameState.empty()
      );

      const updateState = React.useCallback((updater: (prev: ImmutableGameState) => ImmutableGameState) => {
        setState(prev => updater(prev));
      }, []);

      return [state, updateState] as const;
    };
  }

  /**
   * Create optimized render hook for components
   */
  createOptimizedRenderHook() {
    return (componentName: string, dependencies?: any[]) => {
      if (this.config.enableRenderOptimization) {
        return useRenderOptimization(componentName, dependencies);
      }

      // Fallback to basic metrics
      return {
        metrics: {
          componentName,
          renderCount: 0,
          totalRenderTime: 0,
          averageRenderTime: 0,
          lastRenderTime: 0,
          skippedRenders: 0,
          renderEfficiency: 100,
        },
        recordRender: () => {},
        createMemoComparison: () => () => false,
        isRenderNecessary: () => true,
      };
    };
  }

  /**
   * Get optimized confetti loader
   */
  getOptimizedConfettiLoader() {
    if (this.config.enableModuleDeduplication) {
      return loadConfettiModule;
    }

    // Fallback to direct import
    return () => import('canvas-confetti');
  }

  /**
   * Create optimized puzzle tile memo comparison
   */
  createPuzzleTileMemoComparison() {
    return (
      prevProps: {
        tile: PuzzlePublicTile;
        isSelected: boolean;
        isCorrectGuess: boolean;
        isWrongGuess: boolean;
      },
      nextProps: {
        tile: PuzzlePublicTile;
        isSelected: boolean;
        isCorrectGuess: boolean;
        isWrongGuess: boolean;
      }
    ): boolean => {
      // Custom comparison to prevent unnecessary re-renders
      return (
        prevProps.tile.index === nextProps.tile.index &&
        prevProps.tile.displayChar === nextProps.tile.displayChar &&
        prevProps.tile.isLocked === nextProps.tile.isLocked &&
        prevProps.tile.isGold === nextProps.tile.isGold &&
        prevProps.isSelected === nextProps.isSelected &&
        prevProps.isCorrectGuess === nextProps.isCorrectGuess &&
        prevProps.isWrongGuess === nextProps.isWrongGuess
      );
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      bundle: this.bundleOptimizer.analyzeDuplicates(),
      modules: {
        loadedCount: this.moduleManager.getLoadedModuleCount(),
      },
      loadTimes: this.bundleOptimizer.measureLoadTimes(),
      recommendations: this.bundleOptimizer.getOptimizationRecommendations(),
    };
  }

  /**
   * Validate client optimizations
   */
  validateOptimizations(): {
    success: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for duplicate modules
    const bundleAnalysis = this.bundleOptimizer.analyzeDuplicates();
    if (bundleAnalysis.duplicateModules.length > 0) {
      issues.push(`Found ${bundleAnalysis.duplicateModules.length} duplicate modules`);
      recommendations.push('Enable module deduplication to reduce bundle size');
    }

    // Check bundle size
    if (bundleAnalysis.bundleSize > 1024 * 1024) { // > 1MB
      recommendations.push(`Bundle size is ${Math.round(bundleAnalysis.bundleSize / 1024)}KB, consider code splitting`);
    }

    // Check load times
    const loadTimes = this.bundleOptimizer.measureLoadTimes();
    if (loadTimes.totalLoadTime > 3000) { // > 3 seconds
      issues.push(`Total load time (${loadTimes.totalLoadTime}ms) exceeds 3 second threshold`);
      recommendations.push('Optimize critical resource loading');
    }

    return {
      success: issues.length === 0,
      issues,
      recommendations: recommendations.concat(this.bundleOptimizer.getOptimizationRecommendations()),
    };
  }

  /**
   * Get configuration
   */
  getConfig(): ClientPerformanceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ClientPerformanceConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

/**
 * Global client performance integration instance
 */
export const clientPerformanceIntegration = new ClientPerformanceIntegration();

/**
 * Initialize client optimizations on module load
 */
if (typeof window !== 'undefined') {
  clientPerformanceIntegration.initialize().catch(error => {
    console.error('[ClientPerformance] Failed to initialize:', error);
  });
}

/**
 * Convenience hooks and utilities
 */
export const useOptimizedGameState = clientPerformanceIntegration.createOptimizedGameStateHook();
export const useOptimizedRender = clientPerformanceIntegration.createOptimizedRenderHook();
export const getOptimizedConfetti = clientPerformanceIntegration.getOptimizedConfettiLoader();
export const createPuzzleTileComparison = clientPerformanceIntegration.createPuzzleTileMemoComparison();

/**
 * Performance validation utilities
 */
export const validateClientOptimizations = () => clientPerformanceIntegration.validateOptimizations();
export const getClientPerformanceMetrics = () => clientPerformanceIntegration.getPerformanceMetrics();

// Import React for hooks
import React from 'react';
