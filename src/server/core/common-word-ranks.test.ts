import { describe, expect, it } from 'vitest';
import {
  commonWordRank,
  solverExpansionWords,
  topCommonWords,
} from './common-word-ranks';

describe('common word ranks', () => {
  it('keeps common short anchors available', () => {
    for (const word of ['THE', 'AND', 'THAT', 'WITH', 'HAVE', 'THIS']) {
      expect(commonWordRank.has(word)).toBe(true);
      expect(topCommonWords.has(word)).toBe(true);
    }
  });

  it('does not let game-domain terms dominate top-common coverage', () => {
    expect(topCommonWords.has('PUZZLE')).toBe(false);
    expect(topCommonWords.has('CIPHER')).toBe(false);
    expect(topCommonWords.has('DECODE')).toBe(false);
  });

  it('keeps solver expansion deterministic and duplicate-free', () => {
    const uniqueWords = new Set(solverExpansionWords);

    expect(uniqueWords.size).toBe(solverExpansionWords.length);
    expect(solverExpansionWords.every((word) => /^[A-Z]+$/.test(word))).toBe(true);
    expect(solverExpansionWords.every((word) => word.length <= 12)).toBe(true);
  });
});
