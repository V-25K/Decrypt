import { describe, expect, it } from 'vitest';
import { deriveSeed, mulberry32 } from './rng';

describe('rng', () => {
  it('derives a deterministic seed from the full level id and quote text', () => {
    const first = deriveSeed('lvl_0045', 'A'.repeat(120));
    const second = deriveSeed('lvl_0045', 'A'.repeat(120));
    expect(first).toBe(second);
  });

  it('changes the seed when same-length quotes have different content', () => {
    const first = deriveSeed('lvl_0045', 'NEVER SETTLE FOR LESS THAN YOUR BEST');
    const second = deriveSeed('lvl_0045', 'WINNERS ALWAYS FIGHT THROUGH TO THE END');
    expect(first).not.toBe(second);
  });

  it('derives a seed for pending tokens with many digits without scientific-notation overflow', () => {
    const pendingToken =
      'pending:f950a7f8-6f7f-49d9-b77e-1c253f141c2d';
    expect(() =>
      deriveSeed(pendingToken, 'NEVER SETTLE FOR LESS THAN YOUR BEST TODAY')
    ).not.toThrow();
  });

  it('changes the seed for alternate solver seed keys on the same quote', () => {
    const base = deriveSeed('lvl_0044', 'NEVER SETTLE FOR LESS THAN YOUR BEST TODAY');
    const alternate = deriveSeed(
      'lvl_0044:solver:1',
      'NEVER SETTLE FOR LESS THAN YOUR BEST TODAY'
    );
    expect(base).not.toBe(alternate);
  });

  it('produces deterministic sequence for identical seed', () => {
    const rngA = mulberry32(123456);
    const rngB = mulberry32(123456);
    const valuesA = [rngA(), rngA(), rngA()];
    const valuesB = [rngB(), rngB(), rngB()];
    expect(valuesA).toEqual(valuesB);
  });
});
