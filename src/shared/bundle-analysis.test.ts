/**
 * Tests for Bundle Analysis Tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { BundleOptimizer, ModuleManager, loadConfettiModule } from './bundle-analysis';
import { propertyTestConfig } from './property-testing';

// Mock performance API for testing
const mockPerformance = {
  now: vi.fn(() => Date.now()),
  getEntriesByType: vi.fn(() => []),
  memory: {
    usedJSHeapSize: 1024 * 1024 // 1MB
  }
};

// Mock window object for browser-specific tests
const mockWindow = {
  performance: mockPerformance,
  PerformanceObserver: vi.fn()
};

describe('Bundle Analysis Tools', () => {
  let bundleOptimizer: BundleOptimizer;
  let moduleManager: ModuleManager;

  beforeEach(() => {
    bundleOptimizer = BundleOptimizer.getInstance();
    moduleManager = ModuleManager.getInstance();
    
    // Clear tracking data
    bundleOptimizer.clearTracking();
    moduleManager.clearCache();
    
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock global performance
    global.performance = mockPerformance as any;
    global.window = mockWindow as any;
  });

  describe('BundleOptimizer', () => {
    it('should track module loading', () => {
      bundleOptimizer.trackModuleLoad('test-module', 1024);
      bundleOptimizer.trackModuleLoad('test-module', 1024); // Load again to test duplication
      
      const analysis = bundleOptimizer.analyzeDuplicates();
      
      expect(analysis.duplicateModules).toContain('test-module');
      expect(analysis.moduleCount).toBe(1);
      expect(analysis.bundleSize).toBe(2048); // 1024 * 2 loads
    });

    it('should detect duplicate modules', () => {
      bundleOptimizer.trackModuleLoad('unique-module', 512);
      bundleOptimizer.trackModuleLoad('duplicate-module', 1024);
      bundleOptimizer.trackModuleLoad('duplicate-module', 1024);
      bundleOptimizer.trackModuleLoad('duplicate-module', 1024);
      
      const analysis = bundleOptimizer.analyzeDuplicates();
      
      expect(analysis.duplicateModules).toEqual(['duplicate-module']);
      expect(analysis.duplicateModules).not.toContain('unique-module');
      expect(analysis.bundleSize).toBe(512 + (1024 * 3));
    });

    it('should measure load times', () => {
      const mockNavigationTiming = {
        fetchStart: 100,
        domContentLoadedEventStart: 200,
        domContentLoadedEventEnd: 250,
        loadEventEnd: 300
      };

      const mockPaintEntries = [
        { name: 'first-paint', startTime: 150 },
        { name: 'first-contentful-paint', startTime: 180 }
      ];

      mockPerformance.getEntriesByType.mockImplementation((type: string) => {
        if (type === 'navigation') return [mockNavigationTiming];
        if (type === 'paint') return mockPaintEntries;
        return [];
      });

      const metrics = bundleOptimizer.measureLoadTimes();
      
      expect(metrics.domContentLoaded).toBe(50); // 250 - 200
      expect(metrics.firstPaint).toBe(150);
      expect(metrics.firstContentfulPaint).toBe(180);
      expect(metrics.totalLoadTime).toBe(200); // 300 - 100
    });

    it('should disconnect performance observers between measurements and disposal', () => {
      const disconnectMocks: Array<ReturnType<typeof vi.fn>> = [];
      const observeMocks: Array<ReturnType<typeof vi.fn>> = [];

      class MockPerformanceObserver {
        observe = vi.fn();
        disconnect = vi.fn();

        constructor(_callback: PerformanceObserverCallback) {
          observeMocks.push(this.observe);
          disconnectMocks.push(this.disconnect);
        }
      }

      Object.defineProperty(globalThis, 'PerformanceObserver', {
        configurable: true,
        value: MockPerformanceObserver
      });
      mockWindow.PerformanceObserver = MockPerformanceObserver;

      bundleOptimizer.measureLoadTimes();
      expect(observeMocks[0]).toHaveBeenCalledWith({
        entryTypes: ['largest-contentful-paint']
      });

      bundleOptimizer.measureLoadTimes();
      expect(disconnectMocks[0]).toHaveBeenCalledTimes(1);

      bundleOptimizer.dispose();
      expect(disconnectMocks[1]).toHaveBeenCalledTimes(1);
    });

    it('should provide optimization recommendations', () => {
      // Add a large module
      bundleOptimizer.trackModuleLoad('large-module', 200 * 1024); // 200KB
      
      // Add duplicate modules
      bundleOptimizer.trackModuleLoad('duplicate1', 1024);
      bundleOptimizer.trackModuleLoad('duplicate1', 1024);
      bundleOptimizer.trackModuleLoad('duplicate2', 1024);
      bundleOptimizer.trackModuleLoad('duplicate2', 1024);
      
      const recommendations = bundleOptimizer.getOptimizationRecommendations();
      
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.includes('duplicate'))).toBe(true);
      expect(recommendations.some(r => r.includes('Large modules'))).toBe(true);
    });

    it('should track bundle size changes', () => {
      const baseline = 1024 * 1024; // 1MB
      
      bundleOptimizer.trackModuleLoad('test-module', 512 * 1024); // 512KB
      
      const change = bundleOptimizer.trackBundleSizeChange(baseline);
      
      expect(change.currentSize).toBe(512 * 1024);
      expect(change.change).toBe(-512 * 1024); // Negative = improvement
      expect(change.changePercent).toBe(-50); // 50% reduction
      expect(change.improved).toBe(true);
    });

    it('should generate comprehensive reports', () => {
      bundleOptimizer.trackModuleLoad('module1', 1024);
      bundleOptimizer.trackModuleLoad('module2', 2048);
      bundleOptimizer.trackModuleLoad('module1', 1024); // Duplicate
      
      const report = bundleOptimizer.generateReport();
      
      expect(report.bundleAnalysis).toBeDefined();
      expect(report.loadMetrics).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.moduleDetails).toBeDefined();
      expect(report.moduleDetails).toHaveLength(2); // module1 and module2
    });
  });

  describe('ModuleManager', () => {
    it('should prevent duplicate module loading', async () => {
      let loadCount = 0;
      const mockLoader = vi.fn(async () => {
        loadCount++;
        return { data: 'test-data', loadCount };
      });

      // Load the same module multiple times
      const [result1, result2, result3] = await Promise.all([
        moduleManager.loadModule('test-module', mockLoader),
        moduleManager.loadModule('test-module', mockLoader),
        moduleManager.loadModule('test-module', mockLoader)
      ]);

      // Loader should only be called once
      expect(mockLoader).toHaveBeenCalledTimes(1);
      
      // All results should be identical
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result1.loadCount).toBe(1);
    });

    it('should handle module loading failures', async () => {
      const failingLoader = vi.fn(async () => {
        throw new Error('Module load failed');
      });

      await expect(
        moduleManager.loadModule('failing-module', failingLoader)
      ).rejects.toThrow('Module load failed');

      // Module should not be cached after failure
      expect(moduleManager.isModuleLoaded('failing-module')).toBe(false);
    });

    it('should track loaded module count', async () => {
      expect(moduleManager.getLoadedModuleCount()).toBe(0);

      await moduleManager.loadModule('module1', async () => ({ data: 1 }));
      expect(moduleManager.getLoadedModuleCount()).toBe(1);

      await moduleManager.loadModule('module2', async () => ({ data: 2 }));
      expect(moduleManager.getLoadedModuleCount()).toBe(2);

      // Loading same module again shouldn't increase count
      await moduleManager.loadModule('module1', async () => ({ data: 1 }));
      expect(moduleManager.getLoadedModuleCount()).toBe(2);
    });

    it('should clear cache correctly', async () => {
      await moduleManager.loadModule('test-module', async () => ({ data: 'test' }));
      expect(moduleManager.getLoadedModuleCount()).toBe(1);

      moduleManager.clearCache();
      expect(moduleManager.getLoadedModuleCount()).toBe(0);
      expect(moduleManager.isModuleLoaded('test-module')).toBe(false);
    });
  });

  describe('Confetti Module Loading', () => {
    it('should load confetti module through module manager', async () => {
      // Mock the dynamic import
      const mockConfetti = { confetti: vi.fn() };
      vi.doMock('canvas-confetti', () => mockConfetti);

      const confetti = await loadConfettiModule();
      expect(confetti).toBeDefined();
      
      // Loading again should return the same instance
      const confetti2 = await loadConfettiModule();
      expect(confetti).toBe(confetti2);
    });
  });

  /**
   * Property 10: Module Loading Management Correctness
   * Validates: Requirements 10.1, 10.3, 10.4, 10.5
   */
  describe('Property 10: Module Loading Management Correctness', () => {
    it('should prevent duplicate module loading', async () => {
      const moduleManager = ModuleManager.getInstance();
      moduleManager.clearCache();

      const mockLoader = vi.fn().mockResolvedValue({ test: 'module' });
      const moduleId = 'test-module';
      
      // Load the same module multiple times concurrently
      const loadPromises = Array.from({ length: 5 }, () =>
        moduleManager.loadModule(moduleId, mockLoader)
      );

      const results = await Promise.all(loadPromises);

      // Each unique module should only be loaded once
      expect(mockLoader).toHaveBeenCalledTimes(1);
      
      // All loads should return the same instances
      const firstResult = results[0];
      for (const result of results) {
        expect(result).toBe(firstResult);
      }
    });

    it('should handle module loading failures correctly', async () => {
      const moduleManager = ModuleManager.getInstance();
      moduleManager.clearCache();

      let attemptCount = 0;
      const mockLoader = vi.fn().mockImplementation(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Load attempt ${attemptCount} failed`);
        }
        return { success: true, attemptCount };
      });

      const moduleId = 'failing-module';

      // First attempts should fail
      await expect(moduleManager.loadModule(moduleId, mockLoader)).rejects.toThrow();
      expect(moduleManager.isModuleLoaded(moduleId)).toBe(false);

      await expect(moduleManager.loadModule(moduleId, mockLoader)).rejects.toThrow();
      expect(moduleManager.isModuleLoaded(moduleId)).toBe(false);

      // Final attempt should succeed
      const result = await moduleManager.loadModule(moduleId, mockLoader);
      expect(result.success).toBe(true);
      expect(moduleManager.isModuleLoaded(moduleId)).toBe(true);

      // Subsequent loads should return cached result
      const cachedResult = await moduleManager.loadModule(moduleId, mockLoader);
      expect(cachedResult).toBe(result);
    });

    it('should track module loading performance correctly', async () => {
      const moduleManager = ModuleManager.getInstance();
      const bundleOptimizer = BundleOptimizer.getInstance();
      
      moduleManager.clearCache();
      bundleOptimizer.clearTracking();

      const moduleConfigs = [
        { moduleId: 'module1', moduleSize: 1000 },
        { moduleId: 'module2', moduleSize: 2000 },
        { moduleId: 'module3', moduleSize: 1500 },
      ];

      // Load modules
      for (const config of moduleConfigs) {
        const mockLoader = vi.fn().mockResolvedValue({ 
          size: config.moduleSize, 
          id: config.moduleId 
        });

        await moduleManager.loadModule(config.moduleId, mockLoader);
      }

      const analysis = bundleOptimizer.analyzeDuplicates();
      
      // Verify tracking accuracy
      expect(analysis.moduleCount).toBe(3);
      
      // No duplicates should be detected (each module loaded once)
      expect(analysis.duplicateModules.length).toBe(0);
    });

    it('should maintain cache consistency', async () => {
      const moduleManager = ModuleManager.getInstance();
      moduleManager.clearCache();

      const moduleId = 'cache-test-module';
      const mockLoader = vi.fn().mockResolvedValue({ id: moduleId, loaded: true });

      // Initially not loaded
      expect(moduleManager.isModuleLoaded(moduleId)).toBe(false);

      // Load module
      await moduleManager.loadModule(moduleId, mockLoader);
      expect(moduleManager.isModuleLoaded(moduleId)).toBe(true);

      // Clear cache
      moduleManager.clearCache();
      expect(moduleManager.isModuleLoaded(moduleId)).toBe(false);
      expect(moduleManager.getLoadedModuleCount()).toBe(0);
    });

    it('should handle rapid loading cycles without memory leaks', async () => {
      const moduleManager = ModuleManager.getInstance();
      const bundleOptimizer = BundleOptimizer.getInstance();

      const moduleCount = 10;
      const cycleCount = 3;

      for (let cycle = 0; cycle < cycleCount; cycle++) {
        moduleManager.clearCache();
        bundleOptimizer.clearTracking();

        // Load many modules in this cycle
        const loadPromises = [];
        for (let i = 0; i < moduleCount; i++) {
          const moduleId = `module-${cycle}-${i}`;
          const mockLoader = vi.fn().mockResolvedValue({ 
            id: moduleId, 
            data: new Array(100).fill(i) // Some data to simulate memory usage
          });
          loadPromises.push(moduleManager.loadModule(moduleId, mockLoader));
        }

        await Promise.all(loadPromises);

        // Verify modules are loaded
        expect(moduleManager.getLoadedModuleCount()).toBe(moduleCount);
      }

      // After clearing, no modules should be loaded
      moduleManager.clearCache();
      expect(moduleManager.getLoadedModuleCount()).toBe(0);
    });
  });

  describe('Property-Based Bundle Analysis', () => {
    it('should handle arbitrary module loading patterns', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              size: fc.integer({ min: 1, max: 1024 * 1024 }) // 1MB max
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (modules) => {
            bundleOptimizer.clearTracking();
            
            // Track all modules
            for (const module of modules) {
              bundleOptimizer.trackModuleLoad(module.name, module.size);
            }
            
            const analysis = bundleOptimizer.analyzeDuplicates();
            
            // Property: Analysis should be consistent with tracked modules
            const uniqueModules = new Set(modules.map(m => m.name));
            const totalSize = modules.reduce((sum, m) => sum + m.size, 0);
            
            return (
              analysis.moduleCount === uniqueModules.size &&
              analysis.bundleSize === totalSize &&
              analysis.duplicateModules.length === 0 // No duplicates in this test
            );
          }
        ),
        { ...propertyTestConfig, numRuns: 50 }
      );
    });

    it('should correctly identify duplicate modules', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 1024 }),
          fc.integer({ min: 2, max: 10 }),
          (moduleName, moduleSize, loadCount) => {
            bundleOptimizer.clearTracking();
            
            // Load the same module multiple times
            for (let i = 0; i < loadCount; i++) {
              bundleOptimizer.trackModuleLoad(moduleName, moduleSize);
            }
            
            const analysis = bundleOptimizer.analyzeDuplicates();
            
            // Property: Module should be identified as duplicate if loaded more than once
            return (
              analysis.duplicateModules.includes(moduleName) &&
              analysis.bundleSize === moduleSize * loadCount &&
              analysis.moduleCount === 1
            );
          }
        ),
        { ...propertyTestConfig, numRuns: 30 }
      );
    });

    it('should provide consistent optimization recommendations', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 20 }),
              size: fc.integer({ min: 1, max: 500 * 1024 }), // Up to 500KB
              duplicateCount: fc.integer({ min: 1, max: 5 })
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (moduleSpecs) => {
            bundleOptimizer.clearTracking();
            
            let hasDuplicates = false;
            let hasLargeModules = false;
            
            for (const spec of moduleSpecs) {
              for (let i = 0; i < spec.duplicateCount; i++) {
                bundleOptimizer.trackModuleLoad(spec.name, spec.size);
              }
              
              if (spec.duplicateCount > 1) hasDuplicates = true;
              if (spec.size > 100 * 1024) hasLargeModules = true; // > 100KB
            }
            
            const recommendations = bundleOptimizer.getOptimizationRecommendations();
            
            // Property: Recommendations should match detected issues
            const hasDuplicateRecommendation = recommendations.some(r => r.includes('duplicate'));
            const hasLargeModuleRecommendation = recommendations.some(r => r.includes('Large modules'));
            
            return (
              (!hasDuplicates || hasDuplicateRecommendation) &&
              (!hasLargeModules || hasLargeModuleRecommendation)
            );
          }
        ),
        { ...propertyTestConfig, numRuns: 30 }
      );
    });
  });
});
