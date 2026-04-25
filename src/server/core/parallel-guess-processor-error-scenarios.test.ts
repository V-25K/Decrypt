/**
 * Unit tests for Parallel Guess Processing Error Scenarios
 * 
 * Tests individual guess failures without blocking and race condition detection/resolution
 * **Validates: Requirements 2.4**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ParallelGuessProcessor, 
  GuessGrouper, 
  GuessStateManager,
  GuessProcessorFactory,
  type GuessRequest,
  type GuessResult,
  type GuessProcessorConfig
} from './parallel-guess-processor';

describe('Parallel Guess Processing Error Scenarios', () => {
  let processor: ParallelGuessProcessor;
  let stateManager: GuessStateManager;

  beforeEach(() => {
    processor = GuessProcessorFactory.createDefault();
    stateManager = new GuessStateManager();
    stateManager.clearLocks();
  });

  describe('Individual Guess Failures Without Blocking', () => {
    it('should continue processing when first guess fails', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' },
        { tileIndex: 2, guessedLetter: 'C' }
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        if (guess.tileIndex === 0) {
          throw new Error('Network timeout for tile 0');
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
        'test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(3);
      
      // First guess should have failed
      expect(results[0].ok).toBe(false);
      expect(results[0].message).toBe('Guess processing failed');
      expect(results[0].revealedTiles).toEqual([]);
      
      // Other guesses should have succeeded
      expect(results[1].ok).toBe(true);
      expect(results[1].revealedTiles).toEqual([1]);
      expect(results[2].ok).toBe(true);
      expect(results[2].revealedTiles).toEqual([2]);
    });

    it('should continue processing when middle guess fails', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' },
        { tileIndex: 2, guessedLetter: 'C' },
        { tileIndex: 3, guessedLetter: 'D' }
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        if (guess.tileIndex === 2) {
          throw new Error('Invalid guess format');
        }
        
        return {
          ok: true,
          isCorrect: guess.tileIndex % 2 === 0,
          isGameOver: false,
          isLevelComplete: false,
          mistakesRemaining: 2,
          revealedTiles: [guess.tileIndex]
        };
      };

      const results = await processor.processGuesses(
        guesses,
        'test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(4);
      
      // Successful guesses
      expect(results[0].ok).toBe(true);
      expect(results[0].isCorrect).toBe(true);
      expect(results[1].ok).toBe(true);
      expect(results[1].isCorrect).toBe(false);
      expect(results[3].ok).toBe(true);
      expect(results[3].isCorrect).toBe(false);
      
      // Failed guess
      expect(results[2].ok).toBe(false);
      expect(results[2].message).toBe('Guess processing failed');
    });

    it('should continue processing when last guess fails', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' },
        { tileIndex: 2, guessedLetter: 'C' }
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        if (guess.tileIndex === 2) {
          throw new Error('Database connection lost');
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
        'test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(3);
      
      // Successful guesses
      expect(results[0].ok).toBe(true);
      expect(results[1].ok).toBe(true);
      
      // Failed guess
      expect(results[2].ok).toBe(false);
      expect(results[2].message).toBe('Guess processing failed');
    });

    it('should continue processing when multiple guesses fail', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' },
        { tileIndex: 2, guessedLetter: 'C' },
        { tileIndex: 3, guessedLetter: 'D' },
        { tileIndex: 4, guessedLetter: 'E' }
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        // Fail guesses at indices 1 and 3
        if (guess.tileIndex === 1 || guess.tileIndex === 3) {
          throw new Error(`Processing failed for tile ${guess.tileIndex}`);
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
        'test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(5);
      
      // Successful guesses
      expect(results[0].ok).toBe(true);
      expect(results[2].ok).toBe(true);
      expect(results[4].ok).toBe(true);
      
      // Failed guesses
      expect(results[1].ok).toBe(false);
      expect(results[3].ok).toBe(false);
    });

    it('should handle timeout errors without blocking other guesses', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' },
        { tileIndex: 2, guessedLetter: 'C' }
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        if (guess.tileIndex === 1) {
          // Simulate a timeout by taking longer than the processor timeout
          await new Promise(resolve => setTimeout(resolve, 200)); // Longer than 100ms timeout
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

      // Use a custom processor with shorter timeout for testing
      const customProcessor = GuessProcessorFactory.createCustom({ timeoutMs: 100 });

      const results = await customProcessor.processGuesses(
        guesses,
        'test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(3);
      
      // Non-timeout guesses should succeed
      expect(results[0].ok).toBe(true);
      expect(results[2].ok).toBe(true);
      
      // Timeout guess should fail
      expect(results[1].ok).toBe(false);
      expect(results[1].message).toBe('Guess processing failed');
    });

    it('should handle different error types appropriately', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' }, // Network error
        { tileIndex: 1, guessedLetter: 'B' }, // Validation error
        { tileIndex: 2, guessedLetter: 'C' }, // Success
        { tileIndex: 3, guessedLetter: 'D' }  // Database error
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        switch (guess.tileIndex) {
          case 0:
            throw new Error('Network connection failed');
          case 1:
            throw new Error('Invalid letter format');
          case 3:
            throw new Error('Database query timeout');
          default:
            return {
              ok: true,
              isCorrect: true,
              isGameOver: false,
              isLevelComplete: false,
              mistakesRemaining: 3,
              revealedTiles: [guess.tileIndex]
            };
        }
      };

      const results = await processor.processGuesses(
        guesses,
        'test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(4);
      
      // Failed guesses should all have consistent error format
      expect(results[0].ok).toBe(false);
      expect(results[0].message).toBe('Guess processing failed');
      expect(results[1].ok).toBe(false);
      expect(results[1].message).toBe('Guess processing failed');
      expect(results[3].ok).toBe(false);
      expect(results[3].message).toBe('Guess processing failed');
      
      // Successful guess
      expect(results[2].ok).toBe(true);
      expect(results[2].revealedTiles).toEqual([2]);
    });
  });

  describe('Race Condition Detection and Resolution', () => {
    it('should handle concurrent guess processing without data corruption', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 5, guessedLetter: 'A' },  // Cipher 0
        { tileIndex: 15, guessedLetter: 'B' }, // Cipher 1
        { tileIndex: 6, guessedLetter: 'C' },  // Cipher 0
        { tileIndex: 16, guessedLetter: 'D' }  // Cipher 1
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      let cipher0Counter = 0;
      let cipher1Counter = 0;
      const processingLog: Array<{ tileIndex: number, cipher: number, counter: number }> = [];
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        const cipher = getCipherNumber(guess.tileIndex);
        
        // Simulate race condition potential
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        
        if (cipher === 0) {
          cipher0Counter++;
          processingLog.push({ tileIndex: guess.tileIndex, cipher, counter: cipher0Counter });
        } else {
          cipher1Counter++;
          processingLog.push({ tileIndex: guess.tileIndex, cipher, counter: cipher1Counter });
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
        'race-test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(4);
      expect(results.every(r => r.ok)).toBe(true);
      
      // Verify counters are correct (no race conditions)
      expect(cipher0Counter).toBe(2); // Two guesses in cipher 0
      expect(cipher1Counter).toBe(2); // Two guesses in cipher 1
      
      // Verify processing log shows proper sequencing within cipher groups
      const cipher0Logs = processingLog.filter(log => log.cipher === 0);
      const cipher1Logs = processingLog.filter(log => log.cipher === 1);
      
      expect(cipher0Logs).toHaveLength(2);
      expect(cipher1Logs).toHaveLength(2);
      
      // Within each cipher, counters should be sequential
      expect(cipher0Logs.map(log => log.counter)).toEqual([1, 2]);
      expect(cipher1Logs.map(log => log.counter)).toEqual([1, 2]);
    });

    it('should handle state manager lock operations', async () => {
      const levelId = 'lock-test-level';
      
      // Test basic lock functionality
      const operation1 = stateManager.withLock(levelId, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'operation1';
      });
      
      const result = await operation1;
      expect(result).toBe('operation1');
      expect(stateManager.isLocked(levelId)).toBe(false);
    });

    it('should handle lock cleanup after errors', async () => {
      const levelId = 'error-cleanup-level';
      
      // Operation that throws an error - use try/catch to handle properly
      try {
        await stateManager.withLock(levelId, async () => {
          throw new Error('Simulated processing error');
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Simulated processing error');
      }
      
      // Verify lock is cleaned up after error
      expect(stateManager.isLocked(levelId)).toBe(false);
      
      // Verify subsequent operations can acquire the lock
      const followupOperation = stateManager.withLock(levelId, async () => {
        return 'success after error';
      });
      
      const result = await followupOperation;
      expect(result).toBe('success after error');
      expect(stateManager.isLocked(levelId)).toBe(false);
    });

    it('should prevent race conditions in guess result ordering', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' },
        { tileIndex: 2, guessedLetter: 'C' },
        { tileIndex: 3, guessedLetter: 'D' },
        { tileIndex: 4, guessedLetter: 'E' }
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processingTimes: number[] = [];
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        // Introduce random processing delays to test ordering
        const delay = Math.random() * 30;
        processingTimes.push(delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        
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
        'ordering-test-level',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(5);
      
      // Verify results are in original order despite random processing times
      for (let i = 0; i < guesses.length; i++) {
        expect(results[i].revealedTiles).toEqual([guesses[i].tileIndex]);
      }
      
      // Verify all guesses succeeded
      expect(results.every(r => r.ok)).toBe(true);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from partial batch failures', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 10, guessedLetter: 'B' }, // Different cipher group
        { tileIndex: 1, guessedLetter: 'C' },
        { tileIndex: 11, guessedLetter: 'D' }  // Different cipher group
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        // Fail all guesses in cipher group 1 (tiles 10-19)
        if (getCipherNumber(guess.tileIndex) === 1) {
          throw new Error('Cipher group 1 processing failed');
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
        'batch-failure-test',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(4);
      
      // Cipher group 0 should succeed
      expect(results[0].ok).toBe(true); // tileIndex 0
      expect(results[2].ok).toBe(true); // tileIndex 1
      
      // Cipher group 1 should fail
      expect(results[1].ok).toBe(false); // tileIndex 10
      expect(results[3].ok).toBe(false); // tileIndex 11
    });

    it('should maintain system stability when all guesses fail', async () => {
      const guesses: GuessRequest[] = [
        { tileIndex: 0, guessedLetter: 'A' },
        { tileIndex: 1, guessedLetter: 'B' },
        { tileIndex: 2, guessedLetter: 'C' }
      ];

      const getCipherNumber = (tileIndex: number) => Math.floor(tileIndex / 10);
      
      const processSingleGuess = async (guess: GuessRequest): Promise<GuessResult> => {
        throw new Error('System-wide failure');
      };

      const results = await processor.processGuesses(
        guesses,
        'total-failure-test',
        getCipherNumber,
        processSingleGuess
      );

      expect(results).toHaveLength(3);
      
      // All results should be error results
      for (const result of results) {
        expect(result.ok).toBe(false);
        expect(result.message).toBe('Guess processing failed');
        expect(result.isCorrect).toBe(false);
        expect(result.isGameOver).toBe(false);
        expect(result.isLevelComplete).toBe(false);
        expect(result.mistakesRemaining).toBe(0);
        expect(result.revealedTiles).toEqual([]);
      }
    });
  });
});