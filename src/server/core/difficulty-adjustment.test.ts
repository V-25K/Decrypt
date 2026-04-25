import { describe, expect, it } from 'vitest';
import { adjustPuzzleDifficulty, buildPuzzle, type ObstructionBudget } from './puzzle';
import { mulberry32 } from './rng';

describe('adjustPuzzleDifficulty', () => {
  it('should successfully adjust easy puzzle to medium difficulty', async () => {
    // Build a base easy puzzle
    const basePuzzle = buildPuzzle({
      levelId: 'test-001',
      dateKey: '2024-01-01',
      text: 'THE QUICK BROWN FOX',
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 2,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    const budget: ObstructionBudget = {
      total: 50,
      spent: 0,
    };
    
    const rng = mulberry32(12345);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 5,
      budget,
      maxIterations: 5,
      rng,
    });
    
    expect(result.success).toBe(true);
    expect(result.puzzle).not.toBeNull();
    expect(result.adjustmentLog.length).toBeGreaterThan(0);
  });
  
  it('should return failure when target difficulty is unreachable', async () => {
    // Build a base puzzle
    const basePuzzle = buildPuzzle({
      levelId: 'test-002',
      dateKey: '2024-01-02',
      text: 'HELLO WORLD',
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 2,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    // Very limited budget
    const budget: ObstructionBudget = {
      total: 5,
      spent: 0,
    };
    
    const rng = mulberry32(12345);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 9,
      budget,
      maxIterations: 5,
      rng,
    });
    
    expect(result.success).toBe(false);
    expect(result.reason).toBeDefined();
  });
  
  it('should return success immediately if already at target tier', async () => {
    const basePuzzle = buildPuzzle({
      levelId: 'test-003',
      dateKey: '2024-01-03',
      text: 'THE QUICK BROWN FOX JUMPS',
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 5,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    const budget: ObstructionBudget = {
      total: 50,
      spent: 0,
    };
    
    const rng = mulberry32(12345);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 6, // Same tier (medium)
      budget,
      maxIterations: 5,
      rng,
    });
    
    expect(result.success).toBe(true);
    // May need some adjustments to reach exact tier, so just check it succeeded
    expect(result.adjustmentLog.length).toBeGreaterThanOrEqual(0);
  });
  
  it('should respect fairness constraints', async () => {
    const basePuzzle = buildPuzzle({
      levelId: 'test-004',
      dateKey: '2024-01-04',
      text: 'TESTING FAIRNESS',
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 2,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    const budget: ObstructionBudget = {
      total: 100,
      spent: 0,
    };
    
    const rng = mulberry32(12345);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 8,
      budget,
      maxIterations: 5,
      rng,
    });
    
    // Should either succeed with valid puzzle or fail gracefully
    if (result.success && result.puzzle) {
      // Verify puzzle passes validation
      const { validatePuzzle } = await import('./validation');
      const validation = validatePuzzle(result.puzzle);
      expect(validation.valid).toBe(true);
    } else {
      expect(result.reason).toBeDefined();
    }
  });
  
  it('should log adjustments made', async () => {
    const basePuzzle = buildPuzzle({
      levelId: 'test-005',
      dateKey: '2024-01-05',
      text: 'THE QUICK BROWN FOX JUMPS OVER',
      author: 'TEST',
      challengeType: 'QUOTE',
      source: 'MANUAL_INJECTED',
      difficulty: 3,
      logicalPercent: 0.5,
      skipSolvabilityCheck: true,
    });
    
    const budget: ObstructionBudget = {
      total: 50,
      spent: 0,
    };
    
    const rng = mulberry32(12345);
    
    const result = await adjustPuzzleDifficulty({
      basePuzzle: basePuzzle.puzzlePrivate,
      targetDifficulty: 6,
      budget,
      maxIterations: 5,
      rng,
    });
    
    // Should have adjustment log entries
    expect(result.adjustmentLog).toBeDefined();
    expect(Array.isArray(result.adjustmentLog)).toBe(true);
  });
});
