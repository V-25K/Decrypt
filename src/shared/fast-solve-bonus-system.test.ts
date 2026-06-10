import { describe, expect, it } from 'vitest';
import { FastSolveBonusSystem } from './fast-solve-bonus-system';

describe('fast solve bonus arithmetic', () => {
  it('scales bonus from the difficulty-adjusted threshold', () => {
    const system = new FastSolveBonusSystem();

    expect(system.getThresholdForDifficulty(5)).toBe(30);
    expect(system.getThresholdForDifficulty(10)).toBe(45);
    expect(system.getThresholdForDifficulty(1)).toBe(18);
    expect(system.calculateBonus(15, 35, 5)).toBe(9);
    expect(system.calculateBonus(30, 35, 5)).toBe(0);
    expect(system.calculateBonus(31, 35, 5)).toBe(0);
  });

  it('clamps invalid difficulty before threshold arithmetic', () => {
    const system = new FastSolveBonusSystem();

    expect(system.getThresholdForDifficulty(Number.NaN)).toBe(30);
    expect(system.getThresholdForDifficulty(-100)).toBe(18);
    expect(system.getThresholdForDifficulty(100)).toBe(45);
  });

  it('rejects non-finite or negative solve and base values', () => {
    const system = new FastSolveBonusSystem();

    expect(() => system.calculateBonus(Number.NaN, 35, 5)).toThrow(
      'finite and non-negative'
    );
    expect(() => system.calculateBonus(10, Number.POSITIVE_INFINITY, 5)).toThrow(
      'finite and non-negative'
    );
    expect(() => system.calculateBonus(-1, 35, 5)).toThrow(
      'finite and non-negative'
    );
  });
});
