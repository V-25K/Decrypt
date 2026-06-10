import { describe, expect, it } from 'vitest';
import { ScorePenaltyEngine } from './score-penalty-engine';

describe('score penalty engine arithmetic', () => {
  it('keeps the first retry free and then applies the logarithmic multiplier', () => {
    const engine = new ScorePenaltyEngine();

    expect(engine.calculatePenaltyFactor(0)).toBe(1);
    expect(engine.calculatePenaltyFactor(1)).toBe(1);
    expect(engine.calculatePenaltyFactor(2)).toBeCloseTo(
      1 - 0.25 * (Math.log(2) / Math.log(5)),
      8
    );
    expect(engine.calculatePenaltyFactor(3)).toBeCloseTo(
      1 - 0.25 * (Math.log(3) / Math.log(5)),
      8
    );
    expect(engine.calculatePenaltyFactor(5)).toBe(0.75);
    expect(engine.calculatePenaltyFactor(99)).toBe(0.75);
  });

  it('rounds penalized scores while preserving the 75 percent floor', () => {
    const engine = new ScorePenaltyEngine();

    expect(engine.applyPenalty(1000, 0)).toBe(1000);
    expect(engine.applyPenalty(1000, 1)).toBe(1000);
    expect(engine.applyPenalty(1000, 5)).toBe(750);
    expect(engine.applyPenalty(-100, 5)).toBe(0);
    expect(engine.applyPenalty(Number.NaN, 5)).toBe(0);
  });
});
