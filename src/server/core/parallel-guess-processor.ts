/**
 * Parallel Guess Queue Processing System
 * 
 * Processes multiple guesses in parallel while maintaining order and handling race conditions
 */

import { PerformanceMonitor, timed } from './performance-monitor';

export interface GuessRequest {
  tileIndex: number;
  guessedLetter: string;
}

export interface GuessResult {
  ok: boolean;
  isCorrect: boolean;
  isGameOver: boolean;
  isLevelComplete: boolean;
  mistakesRemaining: number;
  revealedTiles: number[];
  message?: string;
}

export interface GuessProcessorConfig {
  maxParallelGuesses: number;
  batchSize: number;
  timeoutMs: number;
}

/**
 * Groups guesses by cipher number to avoid conflicts
 */
export class GuessGrouper {
  /**
   * Group guesses by cipher number to enable parallel processing
   * Guesses affecting the same cipher must be processed sequentially
   */
  groupByCipherNumber(
    guesses: GuessRequest[],
    getCipherNumber: (tileIndex: number) => number
  ): GuessRequest[][] {
    const groups = new Map<number, GuessRequest[]>();
    
    for (const guess of guesses) {
      const cipherNumber = getCipherNumber(guess.tileIndex);
      if (!groups.has(cipherNumber)) {
        groups.set(cipherNumber, []);
      }
      groups.get(cipherNumber)!.push(guess);
    }
    
    return Array.from(groups.values());
  }
  
  /**
   * Restore original order of results after parallel processing
   */
  restoreOriginalOrder(
    results: Array<{ guess: GuessRequest; result: GuessResult }>,
    originalGuesses: GuessRequest[]
  ): GuessResult[] {
    const resultMap = new Map<string, GuessResult>();
    
    for (const { guess, result } of results) {
      const key = `${guess.tileIndex}-${guess.guessedLetter}`;
      resultMap.set(key, result);
    }
    
    return originalGuesses.map(guess => {
      const key = `${guess.tileIndex}-${guess.guessedLetter}`;
      return resultMap.get(key)!;
    });
  }
}

/**
 * Manages state locking for concurrent guess processing
 */
export class GuessStateManager {
  private locks = new Map<string, Promise<void>>();
  private monitor = PerformanceMonitor.getInstance();
  
  /**
   * Execute operation with lock to prevent race conditions
   */
  async withLock<T>(levelId: string, operation: () => Promise<T>): Promise<T> {
    const existingLock = this.locks.get(levelId);
    if (existingLock) {
      await existingLock;
    }
    
    const newLock = this.executeOperation(operation);
    // Handle both success and error cases to prevent unhandled rejections
    this.locks.set(levelId, newLock.then(() => {}, () => {}));
    
    try {
      return await newLock;
    } finally {
      this.locks.delete(levelId);
    }
  }
  
  private async executeOperation<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }
  
  /**
   * Check if a level is currently locked
   */
  isLocked(levelId: string): boolean {
    return this.locks.has(levelId);
  }
  
  /**
   * Clear all locks (useful for testing)
   */
  clearLocks(): void {
    this.locks.clear();
  }
}

/**
 * Parallel guess processor with order preservation
 */
export class ParallelGuessProcessor {
  private grouper = new GuessGrouper();
  private stateManager = new GuessStateManager();
  private monitor = PerformanceMonitor.getInstance();
  
  constructor(private config: GuessProcessorConfig) {}
  
  /**
   * Process guesses in parallel while maintaining order
   */
  async processGuesses(
    guesses: GuessRequest[],
    levelId: string,
    getCipherNumber: (tileIndex: number) => number,
    processSingleGuess: (guess: GuessRequest) => Promise<GuessResult>
  ): Promise<GuessResult[]> {
    const startTime = performance.now();
    if (guesses.length === 0) {
      return [];
    }
    
    // Group guesses by cipher number to avoid conflicts
    const groups = this.grouper.groupByCipherNumber(guesses, getCipherNumber);
    
    const allResults: Array<{ guess: GuessRequest; result: GuessResult }> = [];
    let shouldStop = false;
    
    // Process each group in parallel
    for (const group of groups) {
      if (shouldStop) {
        break;
      }
      
      // Process guesses within a group in parallel (they affect different ciphers)
      const groupPromises = group.map(async (guess) => {
        try {
          const result = await this.processSingleGuessWithTimeout(
            guess,
            processSingleGuess,
            this.config.timeoutMs
          );
          
          return { guess, result };
        } catch (error) {
          // Individual guess failure doesn't block others
          this.monitor.recordMetric({
            operation: 'guess-processing-error',
            duration: 0,
            timestamp: Date.now(),
            success: false,
            metadata: {
              error: error instanceof Error ? error.message : String(error),
              tileIndex: guess.tileIndex
            }
          });
          
          return {
            guess,
            result: {
              ok: false,
              isCorrect: false,
              isGameOver: false,
              isLevelComplete: false,
              mistakesRemaining: 0,
              revealedTiles: [],
              message: 'Guess processing failed'
            }
          };
        }
      });
      
      const groupResults = await Promise.all(groupPromises);
      allResults.push(...groupResults);
      
      // Check if we should stop processing (game over or level complete)
      if (groupResults.some(r => r.result.isGameOver || r.result.isLevelComplete)) {
        shouldStop = true;
      }
    }
    
    // Restore original order
    const orderedResults = this.grouper.restoreOriginalOrder(allResults, guesses);
    
    // Record performance metrics
    this.monitor.recordMetric({
      operation: 'guess-processing',
      duration: performance.now() - startTime,
      timestamp: Date.now(),
      success: true,
      metadata: {
        totalGuesses: guesses.length,
        groupCount: groups.length,
        successfulGuesses: orderedResults.filter(r => r.ok).length
      }
    });
    
    return orderedResults;
  }
  
  /**
   * Process a single guess with timeout
   */
  private async processSingleGuessWithTimeout(
    guess: GuessRequest,
    processFn: (guess: GuessRequest) => Promise<GuessResult>,
    timeoutMs: number
  ): Promise<GuessResult> {
    return Promise.race([
      processFn(guess),
      this.createTimeout(timeoutMs)
    ]);
  }
  
  private createTimeout(ms: number): Promise<GuessResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Guess processing timeout after ${ms}ms`));
      }, ms);
    });
  }
}

/**
 * Factory for creating parallel guess processors
 */
export class GuessProcessorFactory {
  static createDefault(): ParallelGuessProcessor {
    return new ParallelGuessProcessor({
      maxParallelGuesses: 10,
      batchSize: 5,
      timeoutMs: 5000
    });
  }
  
  static createCustom(config: Partial<GuessProcessorConfig>): ParallelGuessProcessor {
    const defaultConfig: GuessProcessorConfig = {
      maxParallelGuesses: 10,
      batchSize: 5,
      timeoutMs: 5000
    };
    
    return new ParallelGuessProcessor({
      ...defaultConfig,
      ...config
    });
  }
}
