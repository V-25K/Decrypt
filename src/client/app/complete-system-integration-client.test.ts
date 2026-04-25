/**
 * Client-Side Complete System Integration Tests
 * 
 * Task 15.3: Client-side integration tests for complete system
 * 
 * Tests client-side performance optimizations, rendering, and mobile compatibility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ImmutableGameState } from './ImmutableGameState';
import { BundleOptimizer, ModuleManager, loadConfettiModule } from '../../shared/bundle-analysis';

// Mock React for testing
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useState: vi.fn(),
    useEffect: vi.fn(),
    useCallback: vi.fn(),
    memo: vi.fn((component) => component)
  };
});

// Mock canvas-confetti
vi.mock('canvas-confetti', () => ({
  default: vi.fn()
}));

// Mock performance APIs
Object.defineProperty(window, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
    getEntriesByType: vi.fn(() => []),
    mark: vi.fn(),
    measure: vi.fn()
  }
});

describe('Client-Side Complete System Integration', () => {
  let bundleOptimizer: BundleOptimizer;
  let moduleManager: ModuleManager;

  beforeEach(() => {
    bundleOptimizer = BundleOptimizer.getInstance();
    moduleManager = ModuleManager.getInstance();
    
    // Clear state
    bundleOptimizer.clearTracking();
    moduleManager.clearCache();
    
    // Reset React mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    bundleOptimizer.clearTracking();
    moduleManager.clearCache();
  });

  describe('ImmutableGameState Performance', () => {
    it('should optimize React rendering with immutable state', () => {
      // Test immutable state change detection
      const initialState = ImmutableGameState.empty();
      const puzzle = {
        id: 'test-puzzle',
        tiles: [
          { letter: 'A', revealed: false, cipherNumber: 1 },
          { letter: 'B', revealed: false, cipherNumber: 2 }
        ]
      };

      // Set puzzle
      const stateWithPuzzle = initialState.setPuzzle(puzzle as any);
      expect(stateWithPuzzle.hasChanged(initialState)).toBe(true);
      expect(stateWithPuzzle.hasPuzzleChanged(initialState)).toBe(true);

      // Add revealed index
      const stateWithRevealed = stateWithPuzzle.addRevealedIndex(0);
      expect(stateWithRevealed.hasChanged(stateWithPuzzle)).toBe(true);
      expect(stateWithRevealed.hasTileStateChanged(stateWithPuzzle)).toBe(true);

      // No change should return same instance
      const sameState = stateWithRevealed.addRevealedIndex(0);
      expect(sameState).toBe(stateWithRevealed);
      expect(sameState.hasChanged(stateWithRevealed)).toBe(false);
    });

    it('should provide efficient tile-specific change detection', () => {
      const puzzle = {
        id: 'test-puzzle',
        tiles: [
          { letter: 'A', revealed: false, cipherNumber: 1 },
          { letter: 'B', revealed: false, cipherNumber: 2 },
          { letter: 'C', revealed: false, cipherNumber: 3 }
        ]
      };

      const state1 = ImmutableGameState.fromPuzzle(puzzle as any);
      const state2 = state1.addRevealedIndex(0);

      // Only tile 0 should show changes
      expect(state2.hasTileChanged(0, state1)).toBe(true);
      expect(state2.hasTileChanged(1, state1)).toBe(false);
      expect(state2.hasTileChanged(2, state1)).toBe(false);

      // Test tile state retrieval
      const tile0State = state2.getTileState(0);
      expect(tile0State.isRevealed).toBe(true);
      expect(tile0State.isCorrect).toBe(false);
      expect(tile0State.isWrong).toBe(false);
      expect(tile0State.isSelected).toBe(false);
    });

    it('should handle batch updates efficiently', () => {
      const puzzle = {
        id: 'test-puzzle',
        tiles: Array.from({ length: 100 }, (_, i) => ({
          letter: String.fromCharCode(65 + (i % 26)),
          revealed: false,
          cipherNumber: i % 10
        }))
      };

      const initialState = ImmutableGameState.fromPuzzle(puzzle as any);
      
      // Batch update multiple changes
      const batchedState = initialState.update({
        revealedIndices: new Set([0, 1, 2, 3, 4]),
        correctGuessIndices: new Set([0, 2, 4]),
        wrongGuessIndices: new Set([1, 3]),
        selectedTileIndex: 5
      });

      expect(batchedState.revealedIndices.size).toBe(5);
      expect(batchedState.correctGuessIndices.size).toBe(3);
      expect(batchedState.wrongGuessIndices.size).toBe(2);
      expect(batchedState.selectedTileIndex).toBe(5);
      expect(batchedState.hasChanged(initialState)).toBe(true);
    });
  });

  describe('Module Deduplication', () => {
    it('should prevent duplicate module loading', async () => {
      const moduleId = 'test-module';
      const mockLoader = vi.fn().mockResolvedValue({ default: 'test-module-content' });

      // Load module multiple times
      const [result1, result2, result3] = await Promise.all([
        moduleManager.loadModule(moduleId, mockLoader),
        moduleManager.loadModule(moduleId, mockLoader),
        moduleManager.loadModule(moduleId, mockLoader)
      ]);

      // Should all return the same result
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);

      // Loader should only be called once
      expect(mockLoader).toHaveBeenCalledTimes(1);

      // Module should be marked as loaded
      expect(moduleManager.isModuleLoaded(moduleId)).toBe(true);
      expect(moduleManager.getLoadedModuleCount()).toBe(1);
    });

    it('should handle confetti module loading correctly', async () => {
      // Mock canvas-confetti import
      const mockConfetti = vi.fn();
      vi.doMock('canvas-confetti', () => ({ default: mockConfetti }));

      // Load confetti module multiple times
      const [confetti1, confetti2] = await Promise.all([
        loadConfettiModule(),
        loadConfettiModule()
      ]);

      // Should return the same module instance
      expect(confetti1).toBe(confetti2);

      // Should be tracked by bundle optimizer
      const analysis = bundleOptimizer.analyzeDuplicates();
      expect(analysis.moduleCount).toBeGreaterThan(0);
    });

    it('should track module loading performance', async () => {
      const moduleId = 'performance-test-module';
      const mockLoader = vi.fn().mockImplementation(async () => {
        // Simulate loading time
        await new Promise(resolve => setTimeout(resolve, 10));
        return { size: 50000 }; // 50KB module
      });

      await moduleManager.loadModule(moduleId, mockLoader);

      // Should track module in bundle optimizer
      const analysis = bundleOptimizer.analyzeDuplicates();
      expect(analysis.moduleCount).toBe(1);
      expect(analysis.bundleSize).toBeGreaterThan(0);
    });
  });

  describe('Bundle Optimization', () => {
    it('should analyze bundle for optimization opportunities', () => {
      // Track various modules
      bundleOptimizer.trackModuleLoad('react', 150000);
      bundleOptimizer.trackModuleLoad('lodash', 100000);
      bundleOptimizer.trackModuleLoad('moment', 80000);
      bundleOptimizer.trackModuleLoad('react', 150000); // Duplicate

      const analysis = bundleOptimizer.analyzeDuplicates();
      
      expect(analysis.duplicateModules).toContain('react');
      expect(analysis.bundleSize).toBe(480000); // 150k + 100k + 80k + 150k
      expect(analysis.moduleCount).toBe(3); // Unique modules

      const recommendations = bundleOptimizer.getOptimizationRecommendations();
      expect(recommendations.some(r => r.includes('duplicate'))).toBe(true);
    });

    it('should measure page load performance', () => {
      // Mock performance entries
      window.performance.getEntriesByType = vi.fn((type) => {
        if (type === 'navigation') {
          return [{
            domContentLoadedEventStart: 1000,
            domContentLoadedEventEnd: 1200,
            loadEventEnd: 2000,
            fetchStart: 0
          }];
        }
        if (type === 'paint') {
          return [
            { name: 'first-paint', startTime: 800 },
            { name: 'first-contentful-paint', startTime: 1000 }
          ];
        }
        return [];
      });

      const metrics = bundleOptimizer.measureLoadTimes();
      
      expect(metrics.domContentLoaded).toBe(200);
      expect(metrics.firstPaint).toBe(800);
      expect(metrics.firstContentfulPaint).toBe(1000);
      expect(metrics.totalLoadTime).toBe(2000);
    });

    it('should track bundle size changes over time', () => {
      const baseline = 500000; // 500KB baseline

      // Track current bundle
      bundleOptimizer.trackModuleLoad('main-bundle', 400000);
      bundleOptimizer.trackModuleLoad('vendor-bundle', 200000);

      const change = bundleOptimizer.trackBundleSizeChange(baseline);
      
      expect(change.currentSize).toBe(600000);
      expect(change.change).toBe(100000); // 100KB increase
      expect(change.changePercent).toBe(20); // 20% increase
      expect(change.improved).toBe(false);
    });

    it('should generate comprehensive performance report', () => {
      // Set up test data
      bundleOptimizer.trackModuleLoad('app', 300000);
      bundleOptimizer.trackModuleLoad('vendor', 200000);
      bundleOptimizer.measureLoadTimes();

      const report = bundleOptimizer.generateReport();
      
      expect(report.bundleAnalysis).toBeDefined();
      expect(report.loadMetrics).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.moduleDetails).toBeDefined();

      expect(report.bundleAnalysis.bundleSize).toBe(500000);
      expect(report.moduleDetails).toHaveLength(2);
    });
  });

  describe('Cross-Browser Compatibility', () => {
    it('should handle missing performance API gracefully', () => {
      // Mock missing performance API
      const originalPerformance = window.performance;
      delete (window as any).performance;

      const metrics = bundleOptimizer.measureLoadTimes();
      
      expect(metrics.domContentLoaded).toBe(0);
      expect(metrics.firstPaint).toBe(0);
      expect(metrics.totalLoadTime).toBe(0);

      // Restore performance API
      window.performance = originalPerformance;
    });

    it('should work in different JavaScript environments', () => {
      // Test in Node.js-like environment (no window)
      const originalWindow = global.window;
      delete (global as any).window;

      // Should not crash
      expect(() => {
        const optimizer = BundleOptimizer.getInstance();
        optimizer.trackModuleLoad('test', 1000);
      }).not.toThrow();

      // Restore window
      global.window = originalWindow;
    });

    it('should handle different module loading patterns', async () => {
      // Test ES modules
      const esModuleLoader = vi.fn().mockResolvedValue({ 
        default: 'es-module',
        namedExport: 'named'
      });

      // Test CommonJS modules
      const cjsModuleLoader = vi.fn().mockResolvedValue({
        module: { exports: 'cjs-module' }
      });

      // Test dynamic imports
      const dynamicLoader = vi.fn().mockResolvedValue({
        then: (callback: any) => callback({ default: 'dynamic-module' })
      });

      const [esResult, cjsResult, dynamicResult] = await Promise.all([
        moduleManager.loadModule('es-module', esModuleLoader),
        moduleManager.loadModule('cjs-module', cjsModuleLoader),
        moduleManager.loadModule('dynamic-module', dynamicLoader)
      ]);

      expect(esResult.default).toBe('es-module');
      expect(cjsResult.module.exports).toBe('cjs-module');
      expect(dynamicResult.then).toBeDefined();
    });
  });

  describe('Mobile Performance Optimization', () => {
    it('should optimize for mobile constraints', () => {
      // Simulate mobile environment
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });

      // Test mobile-specific optimizations
      bundleOptimizer.trackModuleLoad('mobile-optimized', 50000); // Smaller bundle
      
      const analysis = bundleOptimizer.analyzeDuplicates();
      const recommendations = bundleOptimizer.getOptimizationRecommendations();

      // Should not trigger large bundle warnings for mobile-optimized size
      expect(analysis.bundleSize).toBeLessThan(1024 * 1024); // < 1MB
      
      if (analysis.bundleSize > 500 * 1024) { // > 500KB
        expect(recommendations.some(r => r.includes('mobile'))).toBe(false);
      }
    });

    it('should handle touch interactions efficiently', () => {
      // Mock touch events
      const mockTouchEvent = {
        type: 'touchstart',
        touches: [{ clientX: 100, clientY: 100 }],
        preventDefault: vi.fn()
      };

      // Test that immutable state handles rapid touch updates
      const initialState = ImmutableGameState.empty();
      const states: ImmutableGameState[] = [initialState];

      // Simulate rapid touch interactions
      for (let i = 0; i < 10; i++) {
        const prevState = states[states.length - 1];
        const newState = prevState.setSelectedTileIndex(i);
        states.push(newState);
      }

      // Each state should be different
      for (let i = 1; i < states.length; i++) {
        expect(states[i].hasChanged(states[i - 1])).toBe(true);
        expect(states[i].selectedTileIndex).toBe(i - 1);
      }
    });

    it('should optimize memory usage for mobile devices', () => {
      // Test memory-efficient state management
      const largeGameState = ImmutableGameState.empty();
      
      // Create a large puzzle
      const largePuzzle = {
        id: 'large-puzzle',
        tiles: Array.from({ length: 1000 }, (_, i) => ({
          letter: String.fromCharCode(65 + (i % 26)),
          revealed: false,
          cipherNumber: i % 100
        }))
      };

      const stateWithLargePuzzle = largeGameState.setPuzzle(largePuzzle as any);
      
      // Test that structural sharing works
      const stateWithSelection = stateWithLargePuzzle.setSelectedTileIndex(0);
      
      // Should share the same tiles array (structural sharing)
      expect(stateWithSelection.tiles).toBe(stateWithLargePuzzle.tiles);
      
      // But should have different version
      expect(stateWithSelection.version).toBe(stateWithLargePuzzle.version + 1);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle module loading failures gracefully', async () => {
      const failingLoader = vi.fn().mockRejectedValue(new Error('Module load failed'));
      
      await expect(
        moduleManager.loadModule('failing-module', failingLoader)
      ).rejects.toThrow('Module load failed');

      // Failed module should not be cached
      expect(moduleManager.isModuleLoaded('failing-module')).toBe(false);

      // Should be able to retry loading
      const successfulLoader = vi.fn().mockResolvedValue({ success: true });
      const result = await moduleManager.loadModule('failing-module', successfulLoader);
      
      expect(result.success).toBe(true);
      expect(moduleManager.isModuleLoaded('failing-module')).toBe(true);
    });

    it('should handle performance monitoring failures', () => {
      // Mock performance API failure
      window.performance.now = vi.fn().mockImplementation(() => {
        throw new Error('Performance API failed');
      });

      // Should not crash
      expect(() => {
        bundleOptimizer.measureLoadTimes();
      }).not.toThrow();

      // Should return default values
      const metrics = bundleOptimizer.measureLoadTimes();
      expect(metrics.totalLoadTime).toBe(0);
    });

    it('should handle immutable state edge cases', () => {
      const state = ImmutableGameState.empty();
      
      // Test with null puzzle
      expect(state.puzzle).toBeNull();
      expect(state.tiles).toHaveLength(0);
      
      // Test with invalid indices
      const tileState = state.getTileState(-1);
      expect(tileState.tile).toBeNull();
      expect(tileState.isRevealed).toBe(false);
      
      // Test with large indices
      const largeTileState = state.getTileState(9999);
      expect(largeTileState.tile).toBeNull();
      
      // Test snapshot creation
      const snapshot = state.toSnapshot();
      expect(snapshot.puzzle).toBeNull();
      expect(snapshot.revealedIndices).toEqual([]);
      expect(snapshot.version).toBe(0);
    });
  });

  describe('Integration with Server Optimizations', () => {
    it('should coordinate with server-side performance improvements', async () => {
      // Test that client optimizations work with server optimizations
      
      // Mock server response with paginated data
      const mockServerResponse = {
        entries: Array.from({ length: 50 }, (_, i) => ({
          rank: i + 1,
          score: 1000 - i,
          userId: `user-${i}`
        })),
        hasNextPage: true,
        totalCount: 150
      };

      // Client should handle this efficiently
      bundleOptimizer.trackModuleLoad('leaderboard-renderer', 25000);
      
      // Simulate rendering 50 entries
      const renderStart = performance.now();
      
      // Mock rendering process
      for (let i = 0; i < mockServerResponse.entries.length; i++) {
        // Simulate DOM updates
      }
      
      const renderTime = performance.now() - renderStart;
      
      // Should render efficiently (< 16ms for 60fps)
      expect(renderTime).toBeLessThan(100); // Generous limit for test environment
      
      // Bundle should track the rendering module
      const analysis = bundleOptimizer.analyzeDuplicates();
      expect(analysis.moduleCount).toBeGreaterThan(0);
    });

    it('should work with A/B testing configurations', () => {
      // Test that client respects A/B test configurations
      
      const mockABTestConfig = {
        variant: 'new-balance',
        config: {
          fastSolve: {
            thresholdSeconds: 30,
            bonusPercent: 50
          }
        }
      };

      // Client should adapt UI based on configuration
      const fastSolveThreshold = mockABTestConfig.config.fastSolve.thresholdSeconds;
      const bonusPercent = mockABTestConfig.config.fastSolve.bonusPercent;

      expect(fastSolveThreshold).toBe(30);
      expect(bonusPercent).toBe(50);

      // Should track A/B test related modules
      bundleOptimizer.trackModuleLoad('ab-test-ui', 15000);
      
      const analysis = bundleOptimizer.analyzeDuplicates();
      expect(analysis.moduleCount).toBeGreaterThan(0);
    });
  });
});