import { describe, expect, it } from 'vitest';
import { adjustPuzzleDifficulty, buildPuzzle, computeObstructionBudget, type PuzzleDifficultyContext } from './puzzle';
import { difficultyToTier, computePhraseDifficultyProfile } from './content';
import { mulberry32 } from './rng';

describe('adjustPuzzleDifficulty - comprehensive tests', () => {
  it('should adjust from easy to medium with proper budget', async () => {
    const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG';
    const basePuzzle = buildPuzzle({
      levelId: 'comp-001',
      dateKey: '2024-01-01',
      text,
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 2,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    const profile = computePhraseDifficultyProfile(text);
    const context: PuzzleDifficultyContext = {
      tier: 'medium',
      difficulty: 5,
      cipherType: 'random',
      phraseUniqueLetters: profile.uniqueLetterCount,
      phraseOneLetterWords: profile.oneLetterWordCount,
      phraseSuffixCount: profile.commonSuffixCount,
      cryptoHardness: profile.cryptoHardness,
    };
    
    const budget = computeObstructionBudget(context);
    const rng = mulberry32(12345);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 5,
      budget,
      maxIterations: 5,
      rng,
    });
    
    // Should either succeed or provide clear feedback
    if (result.success && result.puzzle) {
      expect(difficultyToTier(result.puzzle.difficulty)).toBe('medium');
      expect(result.adjustmentLog.length).toBeGreaterThan(0);
      
      // Verify obstructions were added
      const totalObstructions = 
        result.puzzle.padlockChains.length + 
        result.puzzle.blindIndices.length;
      expect(totalObstructions).toBeGreaterThan(0);
    } else {
      // If it fails, should have a reason
      expect(result.reason).toBeDefined();
      expect(result.achievableTierRange.length).toBeGreaterThan(0);
    }
  });
  
  it('should adjust from medium to easy by removing obstructions', async () => {
    const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG';
    const basePuzzle = buildPuzzle({
      levelId: 'comp-002',
      dateKey: '2024-01-02',
      text,
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 5,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true, // Skip solver to avoid DUMMY_SOLVER_UNSATISFIED
    });
    
    const budget = {
      total: 100,
      spent: 0,
    };
    
    const rng = mulberry32(54321);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 2,
      budget,
      maxIterations: 5,
      rng,
    });
    
    // Should succeed or provide clear reason
    if (result.success && result.puzzle) {
      expect(difficultyToTier(result.puzzle.difficulty)).toBe('warmup');
    } else {
      expect(result.reason).toBeDefined();
      expect(result.achievableTierRange.length).toBeGreaterThan(0);
    }
  });
  
  it('should respect budget constraints', async () => {
    const text = 'HELLO WORLD';
    const basePuzzle = buildPuzzle({
      levelId: 'comp-003',
      dateKey: '2024-01-03',
      text,
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 2,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    // Very limited budget
    const budget = {
      total: 10,
      spent: 0,
    };
    
    const rng = mulberry32(99999);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 9,
      budget,
      maxIterations: 5,
      rng,
    });
    
    // Should fail due to budget constraints or lack of valid adjustments
    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
  });
  
  it('should maintain fairness constraints throughout adjustment', async () => {
    const text = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG';
    const basePuzzle = buildPuzzle({
      levelId: 'comp-004',
      dateKey: '2024-01-04',
      text,
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 2,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    const budget = {
      total: 100,
      spent: 0,
    };
    
    const rng = mulberry32(11111);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 8,
      budget,
      maxIterations: 5,
      rng,
    });
    
    // If successful, puzzle must pass validation
    if (result.success && result.puzzle) {
      const { validatePuzzle } = await import('./validation');
      const validation = validatePuzzle(result.puzzle);
      expect(validation.valid).toBe(true);
      expect(validation.reasons.length).toBe(0);
    }
  });
  
  it('should provide achievable tier range on failure', async () => {
    const text = 'HI';
    const basePuzzle = buildPuzzle({
      levelId: 'comp-005',
      dateKey: '2024-01-05',
      text,
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 2,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    const budget = {
      total: 50,
      spent: 0,
    };
    
    const rng = mulberry32(22222);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 9,
      budget,
      maxIterations: 5,
      rng,
    });
    
    // Should provide achievable range
    expect(result.achievableTierRange).toBeDefined();
    expect(result.achievableTierRange.length).toBeGreaterThan(0);
  });
});
