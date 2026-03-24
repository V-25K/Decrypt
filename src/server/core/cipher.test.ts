import { describe, expect, it } from 'vitest';
import { buildCipherMapping, chooseCipherType, invertCipherMapping } from './cipher';
import { mulberry32 } from './rng';

describe('cipher', () => {
  it('creates reverse mapping correctly for legacy compatibility', () => {
    const built = buildCipherMapping({
      cipherType: 'reverse',
      shiftAmount: 0,
    });
    expect(built.mapping.A).toBe(26);
    expect(built.mapping.Z).toBe(1);
    expect(built.shiftAmount).toBe(0);
    const reverse = invertCipherMapping(built.mapping);
    expect(reverse['26']).toBe('A');
    expect(reverse['1']).toBe('Z');
  });

  it('creates shift mapping with modulo wrap and preserves selected shift', () => {
    const rng = mulberry32(123);
    const built = buildCipherMapping({
      cipherType: 'shift',
      shiftAmount: 5,
      rng,
    });
    expect(built.mapping.A).toBe(6);
    expect(built.mapping.V).toBe(1);
    expect(built.shiftAmount).toBe(5);
  });

  it('creates random mapping as a 26-value bijection', () => {
    const built = buildCipherMapping({
      cipherType: 'random',
      shiftAmount: 0,
      rng: mulberry32(999),
    });
    const values = Object.values(built.mapping).sort((a, b) => a - b);
    expect(values).toEqual(Array.from({ length: 26 }, (_unused, index) => index + 1));
    for (const [index, letter] of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').entries()) {
      expect(built.mapping[letter]).not.toBe(index + 1);
    }
  });

  it('deterministically avoids anti-cheat collisions on common letters', () => {
    const previousMapping = Object.fromEntries(
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        .split('')
        .map((letter, index) => [letter, index + 1] as const)
    );
    const built = buildCipherMapping({
      cipherType: 'random',
      shiftAmount: 0,
      rng: mulberry32(7),
      previousMapping,
    });

    for (const letter of ['E', 'T', 'A', 'O', 'I', 'N', 'S']) {
      expect(built.mapping[letter]).not.toBe(previousMapping[letter]);
    }
  });

  it('chooses only shift or random for new generation', () => {
    const alwaysShift = chooseCipherType(100, mulberry32(77));
    expect(alwaysShift.cipherType).toBe('shift');
    expect(alwaysShift.shiftAmount).toBeGreaterThanOrEqual(1);
    expect(alwaysShift.shiftAmount).toBeLessThanOrEqual(25);

    const alwaysRandom = chooseCipherType(0, mulberry32(77));
    expect(alwaysRandom.cipherType).toBe('random');
    expect(alwaysRandom.shiftAmount).toBe(0);
  });
});
