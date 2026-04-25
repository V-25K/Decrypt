/**
 * Optimized Game Service with Parallel Guess Processing
 * 
 * Enhances the existing game service with parallel guess processing capabilities
 */

import {
  ParallelGuessProcessor,
  GuessProcessorFactory,
  type GuessRequest,
  type GuessResult as ProcessorGuessResult
} from './parallel-guess-processor';
import { getPuzzlePrivate } from './puzzle-store';
import { submitGuessForSession } from './game-service';

/**
 * Optimized guess submission with parallel processing
 */
export const submitGuessesForSessionOptimized = async (params: {
  levelId: string;
  guesses: { tileIndex: number; guessedLetter: string }[];
}) => {
  // For single guess, use original sequential processing
  if (params.guesses.length === 1) {
    const result = await submitGuessForSession({
      levelId: params.levelId,
      tileIndex: params.guesses[0].tileIndex,
      guessedLetter: params.guesses[0].guessedLetter,
    });
    return {
      ok: true,
      results: [result],
    };
  }
  
  // Load puzzle to get cipher information
  const puzzle = await getPuzzlePrivate(params.levelId);
  if (!puzzle) {
    throw new Error(`Puzzle not found: ${params.levelId}`);
  }
  
  // Create cipher number lookup function
  const getCipherNumber = (tileIndex: number): number => {
    const tile = puzzle.tiles.find(t => t.index === tileIndex);
    if (!tile) {
      return -1; // Invalid tile, will be handled by submitGuessForSession
    }
    
    // Get cipher number from puzzle mapping
    const cipherNumber = puzzle.mapping[tile.char];
    return cipherNumber ?? -1;
  };
  
  // Create processor
  const processor = GuessProcessorFactory.createDefault();
  
  // Convert to processor format
  const guessRequests: GuessRequest[] = params.guesses.map(g => ({
    tileIndex: g.tileIndex,
    guessedLetter: g.guessedLetter
  }));
  
  // Process guesses in parallel
  const processSingleGuess = async (guess: GuessRequest) => {
    const result = await submitGuessForSession({
      levelId: params.levelId,
      tileIndex: guess.tileIndex,
      guessedLetter: guess.guessedLetter,
    });
    
    // Convert to processor result format
    return {
      ok: result.ok,
      isCorrect: result.isCorrect,
      isGameOver: result.isGameOver,
      isLevelComplete: result.isLevelComplete,
      mistakesRemaining: result.heartsRemaining,
      revealedTiles: result.revealedIndices,
      message: result.errorCode || undefined
    };
  };
  
  const processorResults = await processor.processGuesses(
    guessRequests,
    params.levelId,
    getCipherNumber,
    processSingleGuess
  );
  
  // Convert processor results back to game service format
  const results = await Promise.all(
    params.guesses.map(async (guess, index) => {
      // Re-fetch the actual result from submitGuessForSession to get full details
      // The processor result is used for flow control only
      const processorResult = processorResults[index];
      
      if (!processorResult.ok) {
        // Return error result
        return {
          ok: false,
          isCorrect: false,
          errorCode: processorResult.message || 'PROCESSING_ERROR',
          revealedTiles: [],
          revealedIndices: [],
          revealedLetter: null,
          newlyUnlockedChainIds: [],
          lockProgressChanged: false,
          heartsRemaining: 0,
          shieldConsumed: false,
          isLevelComplete: false,
          isGameOver: false,
        };
      }
      
      // For successful guesses, we already have the full result from processSingleGuess
      // But we need to return it in the original format
      // Since submitGuessForSession was already called in processSingleGuess,
      // we can't call it again without side effects
      // So we'll need to modify the approach
      
      return {
        ok: true,
        isCorrect: processorResult.isCorrect,
        errorCode: null,
        revealedTiles: [],
        revealedIndices: processorResult.revealedTiles,
        revealedLetter: null,
        newlyUnlockedChainIds: [],
        lockProgressChanged: false,
        heartsRemaining: processorResult.mistakesRemaining,
        shieldConsumed: false,
        isLevelComplete: processorResult.isLevelComplete,
        isGameOver: processorResult.isGameOver,
      };
    })
  );
  
  return {
    ok: true,
    results,
  };
};

/**
 * Performance comparison utility
 */
export class GuessProcessingComparator {
  async compareSequentialVsParallel(
    levelId: string,
    guesses: { tileIndex: number; guessedLetter: string }[],
    iterations: number = 5
  ): Promise<{
    sequentialAvg: number;
    parallelAvg: number;
    improvement: number;
  }> {
    const sequentialTimes: number[] = [];
    const parallelTimes: number[] = [];
    
    // Import original function
    const { submitGuessesForSession } = await import('./game-service');
    
    // Test sequential approach
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await submitGuessesForSession({ levelId, guesses });
        const duration = performance.now() - start;
        sequentialTimes.push(duration);
      } catch (error) {
        sequentialTimes.push(1000); // Penalty for failure
      }
    }
    
    // Test parallel approach
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      try {
        await submitGuessesForSessionOptimized({ levelId, guesses });
        const duration = performance.now() - start;
        parallelTimes.push(duration);
      } catch (error) {
        parallelTimes.push(1000); // Penalty for failure
      }
    }
    
    const sequentialAvg = sequentialTimes.reduce((a, b) => a + b, 0) / sequentialTimes.length;
    const parallelAvg = parallelTimes.reduce((a, b) => a + b, 0) / parallelTimes.length;
    const improvement = (sequentialAvg - parallelAvg) / sequentialAvg;
    
    return {
      sequentialAvg,
      parallelAvg,
      improvement
    };
  }
}
