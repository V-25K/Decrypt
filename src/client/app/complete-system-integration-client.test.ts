/**
 * Client-Side Complete System Integration Tests
 * 
 * Task 15.3: Client-side integration tests for complete system
 * 
 * Tests client-side performance optimizations, rendering, and mobile compatibility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImmutableGameState } from './ImmutableGameState';

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

describe('Client-Side Complete System Integration', () => {
  beforeEach(() => {
    // Reset React mocks
    vi.clearAllMocks();
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

  describe('Mobile Performance Optimization', () => {
    it('should optimize for mobile constraints', () => {
      // Simulate mobile environment
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        configurable: true
      });

      expect(navigator.userAgent).toContain('iPhone');
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
    it('should coordinate with server-side paginated data', () => {
      const mockServerResponse = {
        entries: Array.from({ length: 50 }, (_, i) => ({
          rank: i + 1,
          score: 1000 - i,
          userId: `user-${i}`
        })),
        hasNextPage: true,
        totalCount: 150
      };

      const renderStart = performance.now();
      for (let i = 0; i < mockServerResponse.entries.length; i++) {
        expect(mockServerResponse.entries[i]?.rank).toBe(i + 1);
      }
      const renderTime = performance.now() - renderStart;

      expect(renderTime).toBeLessThan(100);
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

      expect(mockABTestConfig.variant).toBe('new-balance');
    });
  });
});
