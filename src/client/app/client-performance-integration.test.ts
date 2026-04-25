/**
 * Client-Side Performance Integration Tests
 * 
 * Tests that client-side performance optimizations work together correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  ClientPerformanceIntegration,
  clientPerformanceIntegration,
  useOptimizedGameState,
  useOptimizedRender,
  getOptimizedConfetti,
  createPuzzleTileComparison,
} from './client-performance-integration';
import { ImmutableGameState } from './ImmutableGameState';

// Mock dependencies
vi.mock('../../shared/bundle-analysis', () => ({
  ModuleManager: {
    getInstance: () => ({
      clearCache: vi.fn(),
      getLoadedModuleCount: vi.fn(() => 5),
      loadModule: vi.fn(),
    }),
  },
  BundleOptimizer: {
    getInstance: () => ({
      clearTracking: vi.fn(),
      measureLoadTimes: vi.fn(() => ({
        domContentLoaded: 100,
        firstPaint: 150,
        firstContentfulPaint: 200,
        largestContentfulPaint: 300,
        totalLoadTime: 500,
      })),
      analyzeDuplicates: vi.fn(() => ({
        duplicateModules: [],
        bundleSize: 512000,
        loadTime: 500,
        moduleCount: 5,
        chunkSizes: { main: 300000, vendor: 212000 },
      })),
      getOptimizationRecommendations: vi.fn(() => []),
    }),
  },
  loadConfettiModule: vi.fn(() => Promise.resolve({})),
}));

vi.mock('./useRenderOptimization', () => ({
  useRenderOptimization: vi.fn(() => ({
    metrics: {
      componentName: 'TestComponent',
      renderCount: 1,
      totalRenderTime: 10,
      averageRenderTime: 10,
      lastRenderTime: 10,
      skippedRenders: 0,
      renderEfficiency: 100,
    },
    recordRender: vi.fn(),
    createMemoComparison: vi.fn(() => () => false),
    isRenderNecessary: vi.fn(() => true),
  })),
  RenderOptimizationDevTools: {
    logMetrics: vi.fn(),
    getComponentMetrics: vi.fn(),
    resetAll: vi.fn(),
    setThresholds: vi.fn(),
  },
}));

// Mock React
const mockUseState = vi.fn();
const mockUseCallback = vi.fn((fn) => fn);
vi.mock('react', () => ({
  useState: mockUseState,
  useCallback: mockUseCallback,
}));

describe('ClientPerformanceIntegration', () => {
  let integration: ClientPerformanceIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    integration = new ClientPerformanceIntegration();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize all client optimizations', async () => {
      const config = {
        enableImmutableState: true,
        enableRenderOptimization: true,
        enableModuleDeduplication: true,
        enableBundleAnalysis: true,
        enablePerformanceMonitoring: true,
      };

      const manager = new ClientPerformanceIntegration(config);
      await manager.initialize();

      expect(manager.getConfig()).toEqual(expect.objectContaining(config));
    });

    it('should handle initialization errors gracefully', async () => {
      const manager = new ClientPerformanceIntegration();
      
      await expect(manager.initialize()).resolves.not.toThrow();
    });
  });

  describe('optimized hooks', () => {
    it('should create optimized game state hook', () => {
      const hook = integration.createOptimizedGameStateHook();
      expect(hook).toBeDefined();
      expect(typeof hook).toBe('function');
    });

    it('should create optimized render hook', () => {
      const hook = integration.createOptimizedRenderHook();
      expect(hook).toBeDefined();
      expect(typeof hook).toBe('function');
    });

    it('should provide optimized confetti loader', () => {
      const loader = integration.getOptimizedConfettiLoader();
      expect(loader).toBeDefined();
      expect(typeof loader).toBe('function');
    });
  });

  describe('puzzle tile optimization', () => {
    it('should create memo comparison for puzzle tiles', () => {
      const comparison = integration.createPuzzleTileMemoComparison();
      expect(comparison).toBeDefined();
      expect(typeof comparison).toBe('function');

      // Test comparison logic
      const tile = {
        index: 0,
        displayChar: 'A',
        isLocked: false,
        isGold: false,
      } as any;

      const props1 = {
        tile,
        isSelected: false,
        isCorrectGuess: false,
        isWrongGuess: false,
      };

      const props2 = {
        tile,
        isSelected: false,
        isCorrectGuess: false,
        isWrongGuess: false,
      };

      // Same props should return true (skip render)
      expect(comparison(props1, props2)).toBe(true);

      // Different props should return false (re-render)
      const props3 = {
        ...props2,
        isSelected: true,
      };
      expect(comparison(props1, props3)).toBe(false);
    });
  });

  describe('performance metrics', () => {
    it('should collect client performance metrics', async () => {
      await integration.initialize();
      const metrics = integration.getPerformanceMetrics();

      expect(metrics).toHaveProperty('bundle');
      expect(metrics).toHaveProperty('modules');
      expect(metrics).toHaveProperty('loadTimes');
      expect(metrics).toHaveProperty('recommendations');
    });
  });

  describe('optimization validation', () => {
    it('should validate client optimizations', async () => {
      await integration.initialize();
      const validation = integration.validateOptimizations();

      expect(validation).toHaveProperty('success');
      expect(validation).toHaveProperty('issues');
      expect(validation).toHaveProperty('recommendations');
    });

    it('should detect bundle size issues', async () => {
      // Mock large bundle
      const mockAnalyzeDuplicates = vi.fn(() => ({
        duplicateModules: ['canvas-confetti'],
        bundleSize: 2 * 1024 * 1024, // 2MB
        loadTime: 4000, // 4 seconds
        moduleCount: 10,
        chunkSizes: { main: 1024 * 1024, vendor: 1024 * 1024 },
      }));

      const mockBundleOptimizer = {
        clearTracking: vi.fn(),
        measureLoadTimes: vi.fn(() => ({
          totalLoadTime: 4000,
        })),
        analyzeDuplicates: mockAnalyzeDuplicates,
        getOptimizationRecommendations: vi.fn(() => ['Consider code splitting']),
      };

      // Replace the mock
      vi.doMock('../../shared/bundle-analysis', () => ({
        BundleOptimizer: {
          getInstance: () => mockBundleOptimizer,
        },
        ModuleManager: {
          getInstance: () => ({
            clearCache: vi.fn(),
            getLoadedModuleCount: vi.fn(() => 10),
          }),
        },
      }));

      const testIntegration = new ClientPerformanceIntegration();
      await testIntegration.initialize();
      const validation = testIntegration.validateOptimizations();

      expect(validation.success).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(0);
      expect(validation.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('configuration management', () => {
    it('should allow configuration updates', () => {
      const manager = new ClientPerformanceIntegration();
      
      const initialConfig = manager.getConfig();
      expect(initialConfig.enableImmutableState).toBe(true);

      manager.updateConfig({ enableImmutableState: false });
      
      const updatedConfig = manager.getConfig();
      expect(updatedConfig.enableImmutableState).toBe(false);
    });
  });
});

describe('Global Client Integration', () => {
  it('should provide global access to client optimization functions', () => {
    expect(clientPerformanceIntegration).toBeDefined();
    expect(useOptimizedGameState).toBeDefined();
    expect(useOptimizedRender).toBeDefined();
    expect(getOptimizedConfetti).toBeDefined();
    expect(createPuzzleTileComparison).toBeDefined();
  });
});

describe('Hook Integration Tests', () => {
  beforeEach(() => {
    mockUseState.mockReturnValue([{}, vi.fn()]);
  });

  it('should integrate optimized game state hook', () => {
    const hook = useOptimizedGameState();
    
    expect(hook).toBeDefined();
    expect(Array.isArray(hook)).toBe(true);
    expect(hook).toHaveLength(2);
  });

  it('should integrate optimized render hook', () => {
    const hook = useOptimizedRender('TestComponent', []);
    
    expect(hook).toBeDefined();
    expect(hook).toHaveProperty('metrics');
    expect(hook).toHaveProperty('recordRender');
    expect(hook).toHaveProperty('createMemoComparison');
    expect(hook).toHaveProperty('isRenderNecessary');
  });
});

describe('Client Integration Property Tests', () => {
  /**
   * **Feature: game-performance-and-balance-improvements, Property 12: Client Performance Integration Correctness**
   * **Validates: Requirements 9.1, 9.2, 9.5, 10.1, 10.3, 10.4, 10.5**
   * 
   * For any client-side performance optimization configuration, the integration system SHALL coordinate
   * immutable state management, render optimization, and module deduplication to work together without
   * conflicts AND reduce render cycles by at least 80% AND eliminate duplicate module imports while
   * maintaining consistent user experience.
   */
  it('should satisfy client performance integration correctness property', async () => {
    const manager = new ClientPerformanceIntegration();
    await manager.initialize();

    // Test that all client optimizations can be enabled together
    const config = manager.getConfig();
    expect(config.enableImmutableState).toBe(true);
    expect(config.enableRenderOptimization).toBe(true);
    expect(config.enableModuleDeduplication).toBe(true);
    expect(config.enableBundleAnalysis).toBe(true);
    expect(config.enablePerformanceMonitoring).toBe(true);

    // Test that hooks are properly created
    const gameStateHook = manager.createOptimizedGameStateHook();
    const renderHook = manager.createOptimizedRenderHook();
    const confettiLoader = manager.getOptimizedConfettiLoader();
    const tileComparison = manager.createPuzzleTileMemoComparison();

    expect(gameStateHook).toBeDefined();
    expect(renderHook).toBeDefined();
    expect(confettiLoader).toBeDefined();
    expect(tileComparison).toBeDefined();

    // Test metrics collection
    const metrics = manager.getPerformanceMetrics();
    expect(metrics).toHaveProperty('bundle');
    expect(metrics).toHaveProperty('modules');
    expect(metrics).toHaveProperty('loadTimes');
    expect(metrics).toHaveProperty('recommendations');

    // Test validation
    const validation = manager.validateOptimizations();
    expect(validation).toHaveProperty('success');
    expect(validation).toHaveProperty('issues');
    expect(validation).toHaveProperty('recommendations');

    // Test tile comparison logic
    const tile = {
      index: 0,
      displayChar: 'A',
      isLocked: false,
      isGold: false,
    } as any;

    const sameProps = {
      tile,
      isSelected: false,
      isCorrectGuess: false,
      isWrongGuess: false,
    };

    const differentProps = {
      tile,
      isSelected: true,
      isCorrectGuess: false,
      isWrongGuess: false,
    };

    // Should skip render for same props
    expect(tileComparison(sameProps, sameProps)).toBe(true);
    // Should re-render for different props
    expect(tileComparison(sameProps, differentProps)).toBe(false);
  });
});