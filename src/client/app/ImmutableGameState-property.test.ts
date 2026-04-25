import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ImmutableGameState } from './ImmutableGameState';
import type { Puzzle, PuzzlePublicTile } from './types';

// Mock puzzle generator for property tests
const generateMockPuzzle = (tileCount: number): Puzzle => ({
  levelId: `test-${Math.random()}`,
  dateKey: '2024-01-01',
  author: 'Test Author',
  challengeType: 'QUOTE',
  words: ['TEST', 'PUZZLE'],
  difficulty: 5,
  heartsMax: 3,
  tiles: Array.from({ length: tileCount }, (_, index): PuzzlePublicTile => ({
    index,
    isLetter: index % 2 === 0,
    displayChar: index % 2 === 0 ? String.fromCharCode(65 + (index % 26)) : ' ',
    cipherNumber: index % 2 === 0 ? (index % 26) + 1 : null,
    isBlind: false,
    isGold: false,
    isLocked: false,
    isSessionRevealed: false,
  })),
});

describe('ImmutableGameState - Property Tests', () => {
  /**
   * Property 9: React Rendering Optimization Correctness
   * Validates: Requirements 9.1, 9.2, 9.5
   */
  describe('Property 9: React Rendering Optimization Correctness', () => {
    it('should maintain immutability invariants', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }), // tileCount
          fc.array(fc.integer({ min: 0, max: 49 }), { maxLength: 20 }), // revealedIndices
          fc.array(fc.integer({ min: 0, max: 49 }), { maxLength: 20 }), // correctIndices
          fc.array(fc.integer({ min: 0, max: 49 }), { maxLength: 20 }), // wrongIndices
          fc.option(fc.integer({ min: 0, max: 49 })), // selectedIndex
          (tileCount, revealedIndices, correctIndices, wrongIndices, selectedIndex) => {
            const puzzle = generateMockPuzzle(tileCount);
            const state = new ImmutableGameState(
              puzzle,
              new Set(revealedIndices.filter(i => i < tileCount)),
              new Set(correctIndices.filter(i => i < tileCount)),
              new Set(wrongIndices.filter(i => i < tileCount)),
              selectedIndex && selectedIndex < tileCount ? selectedIndex : null
            );

            // Immutability: getters should return the same reference
            expect(state.puzzle).toBe(state.puzzle);
            expect(state.tiles).toBe(state.tiles);
            expect(state.revealedIndices).toBe(state.revealedIndices);
            expect(state.correctGuessIndices).toBe(state.correctGuessIndices);
            expect(state.wrongGuessIndices).toBe(state.wrongGuessIndices);

            // Immutability: arrays and sets should be frozen
            expect(Object.isFrozen(state.tiles)).toBe(true);
            expect(Object.isFrozen(state.revealedIndices)).toBe(true);
            expect(Object.isFrozen(state.correctGuessIndices)).toBe(true);
            expect(Object.isFrozen(state.wrongGuessIndices)).toBe(true);

            // State should be consistent
            expect(state.tiles.length).toBe(tileCount);
            expect(state.version).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should provide efficient change detection', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 20 }), // tileCount
          fc.array(fc.integer({ min: 0, max: 19 }), { maxLength: 10 }), // initialRevealed
          fc.array(fc.integer({ min: 0, max: 19 }), { maxLength: 5 }), // newRevealed
          (tileCount, initialRevealed, newRevealed) => {
            const puzzle = generateMockPuzzle(tileCount);
            const initialState = new ImmutableGameState(
              puzzle,
              new Set(initialRevealed.filter(i => i < tileCount))
            );

            // No-op updates should return same instance
            const sameState = initialState.setRevealedIndices(initialState.revealedIndices);
            expect(sameState).toBe(initialState);
            expect(sameState.hasChanged(initialState)).toBe(false);

            // Actual updates should create new instance
            const newRevealedSet = new Set([...initialRevealed, ...newRevealed].filter(i => i < tileCount));
            const newState = initialState.setRevealedIndices(newRevealedSet);
            
            if (newRevealedSet.size !== initialState.revealedIndices.size || 
                !Array.from(newRevealedSet).every(i => initialState.revealedIndices.has(i))) {
              expect(newState).not.toBe(initialState);
              expect(newState.hasChanged(initialState)).toBe(true);
              expect(newState.version).toBe(initialState.version + 1);
            } else {
              expect(newState).toBe(initialState);
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should support structural sharing for memory efficiency', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 20 }), // tileCount
          fc.integer({ min: 0, max: 19 }), // selectedIndex
          (tileCount, selectedIndex) => {
            const puzzle = generateMockPuzzle(tileCount);
            const initialState = new ImmutableGameState(puzzle);

            // Changing selection should share other state
            const newState = initialState.setSelectedTileIndex(selectedIndex < tileCount ? selectedIndex : null);
            
            // Only check structural sharing for things that shouldn't change
            expect(newState.puzzle).toBe(initialState.puzzle);
            expect(newState.tiles).toBe(initialState.tiles);
            
            // These sets might be recreated but should have same content if unchanged
            if (newState !== initialState) {
              expect(newState.revealedIndices).toEqual(initialState.revealedIndices);
              expect(newState.correctGuessIndices).toEqual(initialState.correctGuessIndices);
              expect(newState.wrongGuessIndices).toEqual(initialState.wrongGuessIndices);
            } else {
              // If it's the same instance, everything should be shared
              expect(newState.revealedIndices).toBe(initialState.revealedIndices);
              expect(newState.correctGuessIndices).toBe(initialState.correctGuessIndices);
              expect(newState.wrongGuessIndices).toBe(initialState.wrongGuessIndices);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide accurate tile-level change detection', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 30 }), // tileCount
          fc.integer({ min: 0, max: 29 }), // targetTileIndex
          fc.array(fc.integer({ min: 0, max: 29 }), { maxLength: 5 }), // changedIndices
          (tileCount, targetTileIndex, changedIndices) => {
            if (targetTileIndex >= tileCount) return true; // Skip invalid indices

            const puzzle = generateMockPuzzle(tileCount);
            const initialState = new ImmutableGameState(puzzle);

            // Add some revealed indices
            const revealedSet = new Set(changedIndices.filter(i => i < tileCount));
            const newState = initialState.setRevealedIndices(revealedSet);

            // Check tile-level change detection
            const targetChanged = revealedSet.has(targetTileIndex);
            expect(newState.hasTileChanged(targetTileIndex, initialState)).toBe(targetChanged);

            // Tiles not in the changed set should not be detected as changed
            for (let i = 0; i < Math.min(tileCount, 10); i++) {
              if (!revealedSet.has(i)) {
                expect(newState.hasTileChanged(i, initialState)).toBe(false);
              }
            }
          }
        ),
        { numRuns: 200 }
      );
    });

    it('should handle batch updates efficiently', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 15 }), // tileCount
          fc.record({
            revealedIndices: fc.option(fc.array(fc.integer({ min: 0, max: 14 }), { maxLength: 8 })),
            correctIndices: fc.option(fc.array(fc.integer({ min: 0, max: 14 }), { maxLength: 5 })),
            wrongIndices: fc.option(fc.array(fc.integer({ min: 0, max: 14 }), { maxLength: 3 })),
            selectedIndex: fc.option(fc.integer({ min: 0, max: 14 })),
          }),
          (tileCount, changes) => {
            const puzzle = generateMockPuzzle(tileCount);
            const initialState = new ImmutableGameState(puzzle);

            const updateChanges: any = {};
            if (changes.revealedIndices) {
              updateChanges.revealedIndices = new Set(changes.revealedIndices.filter(i => i < tileCount));
            }
            if (changes.correctIndices) {
              updateChanges.correctGuessIndices = new Set(changes.correctIndices.filter(i => i < tileCount));
            }
            if (changes.wrongIndices) {
              updateChanges.wrongGuessIndices = new Set(changes.wrongIndices.filter(i => i < tileCount));
            }
            if (changes.selectedIndex !== null && changes.selectedIndex !== undefined) {
              updateChanges.selectedTileIndex = changes.selectedIndex < tileCount ? changes.selectedIndex : null;
            }

            const batchUpdatedState = initialState.update(updateChanges);

            // Apply changes individually
            let individuallyUpdatedState = initialState;
            if (updateChanges.revealedIndices) {
              individuallyUpdatedState = individuallyUpdatedState.setRevealedIndices(updateChanges.revealedIndices);
            }
            if (updateChanges.correctGuessIndices) {
              individuallyUpdatedState = individuallyUpdatedState.setCorrectGuessIndices(updateChanges.correctGuessIndices);
            }
            if (updateChanges.wrongGuessIndices) {
              individuallyUpdatedState = individuallyUpdatedState.setWrongGuessIndices(updateChanges.wrongGuessIndices);
            }
            if (updateChanges.selectedTileIndex !== undefined) {
              individuallyUpdatedState = individuallyUpdatedState.setSelectedTileIndex(updateChanges.selectedTileIndex);
            }

            // Batch update should produce equivalent state (but potentially fewer version increments)
            expect(batchUpdatedState.puzzle).toBe(individuallyUpdatedState.puzzle);
            expect(batchUpdatedState.revealedIndices).toEqual(individuallyUpdatedState.revealedIndices);
            expect(batchUpdatedState.correctGuessIndices).toEqual(individuallyUpdatedState.correctGuessIndices);
            expect(batchUpdatedState.wrongGuessIndices).toEqual(individuallyUpdatedState.wrongGuessIndices);
            expect(batchUpdatedState.selectedTileIndex).toBe(individuallyUpdatedState.selectedTileIndex);

            // Batch update should be more efficient (fewer version increments)
            expect(batchUpdatedState.version).toBeLessThanOrEqual(individuallyUpdatedState.version);
          }
        ),
        { numRuns: 150 }
      );
    });

    it('should maintain consistency across state transitions', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 15 }), // tileCount
          fc.array(
            fc.record({
              type: fc.constantFrom('reveal', 'correct', 'wrong', 'select'),
              index: fc.integer({ min: 0, max: 14 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (tileCount, operations) => {
            const puzzle = generateMockPuzzle(tileCount);
            let state = new ImmutableGameState(puzzle);
            let previousVersion = state.version;

            for (const op of operations) {
              if (op.index >= tileCount) continue;

              const prevState = state;
              
              switch (op.type) {
                case 'reveal':
                  state = state.addRevealedIndex(op.index);
                  break;
                case 'correct':
                  state = state.addCorrectGuessIndex(op.index);
                  break;
                case 'wrong':
                  state = state.addWrongGuessIndex(op.index);
                  break;
                case 'select':
                  state = state.setSelectedTileIndex(op.index);
                  break;
              }

              // Version should increase if state actually changed
              if (state !== prevState) {
                expect(state.version).toBe(previousVersion + 1);
                expect(state.hasChanged(prevState)).toBe(true);
                previousVersion = state.version;
              } else {
                expect(state.version).toBe(previousVersion);
                expect(state.hasChanged(prevState)).toBe(false);
              }

              // State should remain internally consistent
              expect(state.tiles.length).toBe(tileCount);
              expect(state.puzzle).toBe(puzzle);
              
              // All indices should be valid
              for (const idx of state.revealedIndices) {
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThan(tileCount);
              }
              for (const idx of state.correctGuessIndices) {
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThan(tileCount);
              }
              for (const idx of state.wrongGuessIndices) {
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThan(tileCount);
              }
              if (state.selectedTileIndex !== null) {
                expect(state.selectedTileIndex).toBeGreaterThanOrEqual(0);
                expect(state.selectedTileIndex).toBeLessThan(tileCount);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should provide accurate state snapshots', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 10 }), // tileCount
          fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 5 }), // revealedIndices
          fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 3 }), // correctIndices
          fc.option(fc.integer({ min: 0, max: 9 })), // selectedIndex
          (tileCount, revealedIndices, correctIndices, selectedIndex) => {
            const puzzle = generateMockPuzzle(tileCount);
            const state = new ImmutableGameState(
              puzzle,
              new Set(revealedIndices.filter(i => i < tileCount)),
              new Set(correctIndices.filter(i => i < tileCount)),
              new Set(),
              selectedIndex && selectedIndex < tileCount ? selectedIndex : null
            );

            const snapshot = state.toSnapshot();

            // Snapshot should accurately reflect state
            expect(snapshot.puzzle).toBe(puzzle);
            expect(new Set(snapshot.revealedIndices)).toEqual(state.revealedIndices);
            expect(new Set(snapshot.correctGuessIndices)).toEqual(state.correctGuessIndices);
            expect(new Set(snapshot.wrongGuessIndices)).toEqual(state.wrongGuessIndices);
            expect(snapshot.selectedTileIndex).toBe(state.selectedTileIndex);
            expect(snapshot.version).toBe(state.version);

            // Snapshot should be serializable
            expect(() => JSON.stringify(snapshot)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge cases correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }), // tileCount
          (tileCount) => {
            const puzzle = generateMockPuzzle(tileCount);

            // Empty state
            const emptyState = ImmutableGameState.empty();
            expect(emptyState.puzzle).toBeNull();
            expect(emptyState.tiles.length).toBe(0);
            expect(emptyState.revealedIndices.size).toBe(0);

            // State from puzzle
            const puzzleState = ImmutableGameState.fromPuzzle(puzzle);
            expect(puzzleState.puzzle).toBe(puzzle);
            expect(puzzleState.tiles.length).toBe(tileCount);

            // Invalid indices should be handled gracefully
            const invalidIndex = tileCount + 10;
            const stateWithInvalidIndex = puzzleState.addRevealedIndex(invalidIndex);
            expect(stateWithInvalidIndex.revealedIndices.has(invalidIndex)).toBe(true);

            // Tile state for invalid index should return null tile
            const tileState = stateWithInvalidIndex.getTileState(invalidIndex);
            expect(tileState.tile).toBeNull();
            expect(tileState.isRevealed).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Performance Properties', () => {
    it('should have O(1) change detection for individual operations', () => {
      const puzzle = generateMockPuzzle(100);
      const state = new ImmutableGameState(puzzle);

      // Measure time for change detection operations
      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        const newState = state.addRevealedIndex(i % 100);
        newState.hasChanged(state);
        newState.hasTileChanged(i % 100, state);
      }
      
      const end = performance.now();
      const timePerOperation = (end - start) / 1000;
      
      // Should be very fast (less than 1ms per operation on average)
      expect(timePerOperation).toBeLessThan(1);
    });

    it('should minimize memory allocation for no-op updates', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 20 }), // tileCount
          (tileCount) => {
            const puzzle = generateMockPuzzle(tileCount);
            const state = new ImmutableGameState(puzzle);

            // No-op updates should return same instance
            expect(state.setPuzzle(puzzle)).toBe(state);
            expect(state.setRevealedIndices(state.revealedIndices)).toBe(state);
            expect(state.setCorrectGuessIndices(state.correctGuessIndices)).toBe(state);
            expect(state.setWrongGuessIndices(state.wrongGuessIndices)).toBe(state);
            expect(state.setSelectedTileIndex(state.selectedTileIndex)).toBe(state);

            // Batch no-op update should return same instance
            expect(state.update({})).toBe(state);
            expect(state.update({
              puzzle: state.puzzle,
              revealedIndices: state.revealedIndices,
              selectedTileIndex: state.selectedTileIndex,
            })).toBe(state);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});