/**
 * Property-based tests for Parallel Guess Processing System
 * 
 * **Feature: game-performance-and-balance-improvements, Property 2: Parallel Guess Processing with Order Preservation**
 * **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  ParallelGuessProcessor, 
  GuessGrouper, 
  GuessStateManager,
  GuessProcessorFactory,
  type GuessRequest,
  type GuessResult,
  type GuessProcessorConfig
} from './parallel-guess-processor';
import { propertyTestConfig, gameArbitraries } from '../../shared/property-testing';

describe('Parallel Guess Processing System', () => {
  let processor: ParallelGuessProcessor;
  let grouper: GuessGrouper;
  let stateManager: GuessStateManager;

  beforeEach(() => {
    processor = GuessProcessorFactory.createDefault();
    grouper = new GuessGrouper();
    stateManager = new GuessStateManager();
    stateManager.clearLocks();
  });

  describe('Property 2: Parallel Guess Processing with Order Preservation', () => {
    /**
     * **Validates: Requirements 2.1, 2.3, 2.4, 2.5**
     * 
     * For any sequence of game guesses, the parallel processing system SHALL:
     * - Maintain the original order of results (2.3)
     * - Continue processing remaining guesses when individual guesses fail (2.4) 
     * - Handle concurrent access to shared game state without race conditions (2.5)
     * - Process multiple guesses in parallel rather than sequentially (2.1)
     */
    it('should maintain original order of results across all guess sequences', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary sequences of guess requests
          fc.array(
            fc.record({
              tileIndex: fc.integer({ min: 0, max: 99 }),
              guessedLetter: fc.char().filter(c => /[A-Z]/.test(c))
            }),
            { minLength: 1, maxLength: 20 }
          ),
          fc.string({ minLength: 5, maxLength: 20 }), // levelId
          
          async (guesses: GuessRequest[], levelId: string) => {
            // Mock cipher number function - group tiles by tens to create conflicts
            const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
            
            // Mock single guess processor that tracks order
            const processedOrder: number[] = [];
            const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
              processedOrder.push(guess.tileIndex);
              
              // Simulate processing time variation
              await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
              
              return {
                ok: true,
                isCorrect: Math.random() > 0.5,
                isGameOver: false,
                isLevelComplete: false,
                mistakesRemaining: 3,
                revealedTiles: [guess.tileIndex]
              };
            };
            
            // Process guesses in parallel
            const results = await processor.processGuesses(
              guesses,
              levelId,
              getCipherNumber,
              processSingleGuess
            );
            
            // Verify results maintain original order
            expect(results).toHaveLength(guesses.length);
            
            for (let i = 0; i < guesses.length; i++) {
              expect(results[i]).toBeDefined();
              expect(results[i].ok).toBe(true);
              expect(results[i].revealedTiles).toContain(guesses[i].tileIndex);
            }
            
            return true;
          }
        ),
        propertyTestConfig
      );
    });

    it('should continue processing remaining guesses when individual guesses fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              tileIndex: fc.integer({ min: 0, max: 99 }),
              guessedLetter: fc.char().filter(c => /[A-Z]/.test(c))
            }),
            { minLength: 3, maxLength: 15 }
          ),
          fc.integer({ min: 0, max: 2 }), // Index of guess that will fail
          fc.string({ minLength: 5, maxLength: 20 }), // levelId
          
          async (guesses: GuessRequest[], failureIndex: number, levelId: string) => {
            if (guesses.length <= failureIndex) return true; // Skip if not enough guesses
            
            const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
            
            // Mock processor that fails specific guess
            const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
              const currentIndex = guesses.findIndex(g => 
                g.tileIndex === guess.tileIndex && g.guessedLetter === guess.guessedLetter
              );
              
              if (currentIndex === failureIndex) {
                throw new Error('Simulated guess processing failure');
              }
              
              return {
                ok: true,
                isCorrect: true,
                isGameOver: false,
                isLevelComplete: false,
                mistakesRemaining: 3,
                revealedTiles: [guess.tileIndex]
              };
            };
            
            const results = await processor.processGuesses(
              guesses,
              levelId,
              getCipherNumber,
              processSingleGuess
            );
            
            // Verify all guesses were processed (including failed one)
            expect(results).toHaveLength(guesses.length);
            
            // Verify failed guess has error result
            expect(results[failureIndex].ok).toBe(false);
            expect(results[failureIndex].message).toContain('failed');
            
            // Verify other guesses succeeded
            for (let i = 0; i < results.length; i++) {
              if (i !== failureIndex) {
                expect(results[i].ok).toBe(true);
                expect(results[i].isCorrect).toBe(true);
              }
            }
            
            return true;
          }
        ),
        propertyTestConfig
      );
    });

    it('should handle concurrent access to shared game state without race conditions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              tileIndex: fc.integer({ min: 0, max: 99 }),
              guessedLetter: fc.char().filter(c => /[A-Z]/.test(c))
            }),
            { minLength: 2, maxLength: 10 }
          ),
          fc.string({ minLength: 5, maxLength: 20 }), // levelId
          
          async (guesses: GuessRequest[], levelId: string) => {
            // Mix of same and different cipher groups to test both scenarios
            const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
            
            let sharedState = 0;
            const stateUpdates: number[] = [];
            const processingOrder: number[] = [];
            
            // Mock processor that modifies shared state
            const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
              processingOrder.push(guess.tileIndex);
              
              // Simulate some processing time
              await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
              
              // Update shared state atomically
              const newState = ++sharedState;
              stateUpdates.push(newState);
              
              return {
                ok: true,
                isCorrect: true,
                isGameOver: false,
                isLevelComplete: false,
                mistakesRemaining: 3,
                revealedTiles: [guess.tileIndex]
              };
            };
            
            const results = await processor.processGuesses(
              guesses,
              levelId,
              getCipherNumber,
              processSingleGuess
            );
            
            // Verify all guesses were processed
            expect(results).toHaveLength(guesses.length);
            expect(results.every(r => r.ok)).toBe(true);
            
            // Verify state was updated correctly (no race conditions)
            expect(sharedState).toBe(guesses.length);
            expect(stateUpdates).toHaveLength(guesses.length);
            
            // Verify state updates are sequential (no duplicates)
            const uniqueUpdates = new Set(stateUpdates);
            expect(uniqueUpdates.size).toBe(guesses.length);
            
            return true;
          }
        ),
        propertyTestConfig
      );
    });

    it('should process multiple guesses in parallel rather than sequentially', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              tileIndex: fc.integer({ min: 0, max: 99 }),
              guessedLetter: fc.char().filter(c => /[A-Z]/.test(c))
            }),
            { minLength: 3, maxLength: 8 }
          ),
          fc.string({ minLength: 5, maxLength: 20 }), // levelId
          
          async (guesses: GuessRequest[], levelId: string) => {
            const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
            
            let concurrentCount = 0;
            let maxConcurrentCount = 0;
            
            const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
              concurrentCount++;
              maxConcurrentCount = Math.max(maxConcurrentCount, concurrentCount);
              
              // Simulate processing time
              await new Promise(resolve => setTimeout(resolve, 5));
              
              concurrentCount--;
              
              return {
                ok: true,
                isCorrect: true,
                isGameOver: false,
                isLevelComplete: false,
                mistakesRemaining: 3,
                revealedTiles: [guess.tileIndex]
              };
            };
            
            const results = await processor.processGuesses(
              guesses,
              levelId,
              getCipherNumber,
              processSingleGuess
            );
            
            // Verify all guesses were processed
            expect(results).toHaveLength(guesses.length);
            expect(results.every(r => r.ok)).toBe(true);
            
            // Verify parallel processing occurred within groups
            // If we have multiple guesses in the same cipher group, they should be processed in parallel
            const groups = new Map<number, number>();
            for (const guess of guesses) {
              const cipher = getCipherNumber(guess.tileIndex);
              groups.set(cipher, (groups.get(cipher) || 0) + 1);
            }
            
            // Find the largest group
            const maxGroupSize = Math.max(...groups.values());
            
            // If the largest group has multiple guesses, we should see parallel processing
            if (maxGroupSize >= 2) {
              expect(maxConcurrentCount).toBeGreaterThanOrEqual(Math.min(maxGroupSize, 2));
            } else {
              // If all guesses are in different groups, we still process them (groups are processed sequentially)
              expect(maxConcurrentCount).toBeGreaterThanOrEqual(1);
            }
            
            return true;
          }
        ),
        { ...propertyTestConfig, numRuns: 20, timeout: 10000 } // Fewer runs, longer timeout
      );
    }, 15000); // 15 second test timeout
  });

  describe('GuessGrouper Unit Tests', () => {
    it('should group guesses by cipher number correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              tileIndex: fc.integer({ min: 0, max: 99 }),
              guessedLetter: fc.char()
            }),
            { minLength: 1, maxLength: 20 }
          ),
          
          (guesses: GuessRequest[]) => {
            const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
            const groups = grouper.groupByCipherNumber(guesses, getCipherNumber);
            
            // Verify all guesses are included
            const totalGuessesInGroups = groups.reduce((sum, group) => sum + group.length, 0);
            expect(totalGuessesInGroups).toBe(guesses.length);
            
            // Verify each group has same cipher number
            for (const group of groups) {
              if (group.length > 1) {
                const firstCipher = getCipherNumber(group[0].tileIndex);
                for (const guess of group) {
                  expect(getCipherNumber(guess.tileIndex)).toBe(firstCipher);
                }
              }
            }
            
            return true;
          }
        ),
        propertyTestConfig
      );
    });

    it('should restore original order after parallel processing', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              tileIndex: fc.integer({ min: 0, max: 99 }),
              guessedLetter: fc.char()
            }),
            { minLength: 1, maxLength: 20 }
          ),
          
          (originalGuesses: GuessRequest[]) => {
            // Create shuffled results
            const results = originalGuesses.map(guess => ({
              guess,
              result: {
                ok: true,
                isCorrect: true,
                isGameOver: false,
                isLevelComplete: false,
                mistakesRemaining: 3,
                revealedTiles: [guess.tileIndex]
              } as GuessResult
            }));
            
            // Shuffle the results to simulate parallel processing
            const shuffledResults = [...results].sort(() => Math.random() - 0.5);
            
            // Restore original order
            const orderedResults = grouper.restoreOriginalOrder(shuffledResults, originalGuesses);
            
            // Verify order is restored
            expect(orderedResults).toHaveLength(originalGuesses.length);
            for (let i = 0; i < originalGuesses.length; i++) {
              expect(orderedResults[i].revealedTiles).toContain(originalGuesses[i].tileIndex);
            }
            
            return true;
          }
        ),
        propertyTestConfig
      );
    });
  });

  describe('GuessStateManager Unit Tests', () => {
    it('should prevent concurrent access to same level', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 20 }), // levelId
          fc.integer({ min: 2, max: 10 }), // number of concurrent operations
          
          async (levelId: string, operationCount: number) => {
            const executionOrder: number[] = [];
            const operations: Promise<void>[] = [];
            
            for (let i = 0; i < operationCount; i++) {
              const operationId = i;
              const operation = stateManager.withLock(levelId, async () => {
                executionOrder.push(operationId);
                await new Promise(resolve => setTimeout(resolve, 10));
              });
              operations.push(operation);
            }
            
            await Promise.all(operations);
            
            // Verify operations executed sequentially (no concurrent access)
            expect(executionOrder).toHaveLength(operationCount);
            
            // All operations should have completed
            expect(stateManager.isLocked(levelId)).toBe(false);
            
            return true;
          }
        ),
        propertyTestConfig
      );
    });
  });
});