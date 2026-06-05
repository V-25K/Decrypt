import { describe, expect, it } from 'vitest';
import { solverThresholdForDifficulty } from './solver-thresholds';

describe('solverThresholdForDifficulty', () => {
  it('keeps build and manual stabilization thresholds intentionally distinct', () => {
    expect(solverThresholdForDifficulty(3, 'build')).toBe(0.82);
    expect(solverThresholdForDifficulty(3, 'manual-stabilization')).toBe(0.9);
    expect(solverThresholdForDifficulty(5, 'build')).toBe(0.7);
    expect(solverThresholdForDifficulty(5, 'manual-stabilization')).toBe(0.8);
    expect(solverThresholdForDifficulty(8, 'build')).toBe(0.5);
    expect(solverThresholdForDifficulty(8, 'deep-build')).toBe(0.48);
    expect(solverThresholdForDifficulty(8, 'manual-stabilization')).toBe(0.7);
    expect(solverThresholdForDifficulty(9, 'build')).toBe(0.42);
    expect(solverThresholdForDifficulty(9, 'manual-stabilization')).toBe(0.65);
  });
});
