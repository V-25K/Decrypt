import { describe, expect, it } from 'vitest';
import { deriveSeed, mulberry32 } from './rng';

describe('rng', () => {
  it('derives seed with fixed-width quote length encoding', () => {
    const seed = deriveSeed('lvl_0045', 'A'.repeat(120));
    expect(seed).toBe(45120);
    const shortSeed = deriveSeed('lvl_0045', 'A'.repeat(5));
    expect(shortSeed).toBe(45005);
  });

  it('avoids seed collisions from ambiguous concatenation boundaries', () => {
    const first = deriveSeed('lvl_42', 'A'.repeat(15));
    const second = deriveSeed('lvl_4', 'A'.repeat(215));
    expect(first).not.toBe(second);
  });

  it('produces deterministic sequence for identical seed', () => {
    const rngA = mulberry32(123456);
    const rngB = mulberry32(123456);
    const valuesA = [rngA(), rngA(), rngA()];
    const valuesB = [rngB(), rngB(), rngB()];
    expect(valuesA).toEqual(valuesB);
  });
});
