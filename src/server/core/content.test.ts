import { describe, expect, it } from 'vitest';
import {
  difficultyToTier,
  hasMinUniqueWords,
  hasRepeatedLetter,
  quotePassesTierLength,
  sanitizePhrase,
  validateQuoteForPhase1,
} from './content';

describe('content phase1 rules', () => {
  it('keeps native numbers and punctuation while uppercasing', () => {
    const sanitized = sanitizePhrase("agent 007 won't-stop.");
    expect(sanitized).toBe("AGENT 007 WON'T-STOP.");
  });

  it('maps difficulty bands to easy/medium/hard', () => {
    expect(difficultyToTier(1)).toBe('easy');
    expect(difficultyToTier(5)).toBe('medium');
    expect(difficultyToTier(9)).toBe('hard');
  });

  it('enforces tier length windows', () => {
    expect(quotePassesTierLength('A'.repeat(15), 'easy')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(35), 'easy')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(36), 'easy')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(50), 'medium')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(51), 'medium')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(46), 'hard')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(45), 'hard')).toBe(false);
  });

  it('detects unique-word minimum and repeated-letter requirement', () => {
    expect(hasMinUniqueWords('ALPHA BETA GAMMA DELTA EPSILON', 5)).toBe(true);
    expect(hasMinUniqueWords('ALPHA ALPHA ALPHA ALPHA ALPHA', 5)).toBe(false);
    expect(hasMinUniqueWords('ALPHA-BETA GAMMA DELTA EPSILON ZETA', 6)).toBe(true);
    expect(hasMinUniqueWords('ALPHA—BETA GAMMA DELTA EPSILON', 5)).toBe(true);
    expect(hasMinUniqueWords('ALPHA–BETA GAMMA DELTA EPSILON', 5)).toBe(true);
    expect(hasRepeatedLetter('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false);
    expect(hasRepeatedLetter('A QUICK BROWN FOX JUMPS')).toBe(true);
  });

  it('rejects invalid quotes by phase1 policy', () => {
    const tooFewWords = validateQuoteForPhase1('CODE CODE CODE CODE CODE', 2);
    expect(tooFewWords.valid).toBe(false);

    const noRepeatedLetters = validateQuoteForPhase1('ABCDEFG HIJKL MNOPQ RSTUV WXYZ', 2);
    expect(noRepeatedLetters.valid).toBe(false);
  });
});
