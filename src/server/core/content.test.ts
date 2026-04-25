import { describe, expect, it } from 'vitest';
import {
  computePhraseDifficultyProfile,
  contentTokenSignature,
  difficultyToTier,
  hasMinUniqueWords,
  hasRepeatedLetter,
  isNearDuplicateSignature,
  normalizeContent,
  quotePassesTierLength,
  sanitizePhrase,
  quotePassesTierHardness,
  validateQuoteForPhase1,
} from './content';

describe('content phase1 rules', () => {
  it('keeps native numbers and punctuation while uppercasing', () => {
    const sanitized = sanitizePhrase("agent 007 won't-stop.");
    expect(sanitized).toBe("AGENT 007 WON'T-STOP.");
  });

  it('maps difficulty bands to warmup/medium/hard/expert', () => {
    expect(difficultyToTier(1)).toBe('warmup');
    expect(difficultyToTier(5)).toBe('medium');
    expect(difficultyToTier(8)).toBe('hard');
    expect(difficultyToTier(9)).toBe('expert');
  });

  it('enforces tier length windows', () => {
    expect(quotePassesTierLength('A'.repeat(15), 'warmup')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(25), 'warmup')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(26), 'warmup')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(40), 'medium')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(41), 'medium')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(46), 'hard')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(40), 'hard')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(50), 'expert')).toBe(true);
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

  it('models cryptogram hardness from unique letters and distribution', () => {
    const highVariety = computePhraseDifficultyProfile('WHY JOT FLUX VEX BRIM');
    const repetitive = computePhraseDifficultyProfile(
      'TO BE OR NOT TO BE THAT IS THE QUESTION'
    );

    expect(highVariety.uniqueLetterCount).toBeGreaterThan(repetitive.uniqueLetterCount);
    expect(highVariety.cryptoHardness).toBeGreaterThan(repetitive.cryptoHardness);
    expect(quotePassesTierHardness(highVariety.cryptoHardness, 'hard')).toBe(true);
  });

  it('does not inflate entropy for tiny alphabets that are evenly distributed', () => {
    const tinyAlphabet = computePhraseDifficultyProfile('A B C A B C A B C');
    expect(tinyAlphabet.letterEntropy).toBeLessThan(0.5);
    expect(tinyAlphabet.cryptoHardness).toBeLessThan(0.2);
  });

  it('counts common suffix helpers only on longer words', () => {
    const falsePositiveShortWords = computePhraseDifficultyProfile('BED FLY RED PLY');
    const realSuffixHelpers = computePhraseDifficultyProfile(
      'WALKED SOFTLY THROUGH EVENING'
    );

    expect(falsePositiveShortWords.commonSuffixCount).toBe(0);
    expect(realSuffixHelpers.commonSuffixCount).toBeGreaterThan(0);
  });

  it('accepts representative warmup, medium, hard, and expert phrases under the tuned bands', () => {
    expect(validateQuoteForPhase1('TO BE OR NOT TO BE', 2).valid).toBe(true);
    expect(
      validateQuoteForPhase1('GOOD THINGS TAKE PATIENCE AND CARE', 5).valid
    ).toBe(true);
    expect(
      validateQuoteForPhase1('BOLD THINKERS NAVIGATE UNCERTAIN WORLDS WITH GRIT', 8).valid
    ).toBe(true);
    expect(
      validateQuoteForPhase1('JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS', 9).valid
    ).toBe(true);
  });

  it('rejects warmup-tier phrases that are cryptographically too hard', () => {
    const trickyEasy = validateQuoteForPhase1('WHY JOT FLUX VEX BRIM', 2);
    expect(trickyEasy.valid).toBe(false);
    expect(trickyEasy.reasons.some((reason) => reason.includes('hardness'))).toBe(true);
  });

  it('rejects hard-tier phrases that are too repetitive', () => {
    const repetitiveHard = validateQuoteForPhase1(
      'TO BE OR NOT TO BE TO BE OR NOT TO BE TO BE OR NOT',
      9
    );
    expect(repetitiveHard.valid).toBe(false);
    expect(repetitiveHard.reasons.some((reason) => reason.includes('hardness'))).toBe(true);
  });
});

describe('near-duplicate detection', () => {
  it('treats punctuation/spelling variants as duplicates', () => {
    const prior = "Don't stop believing, hold on to that feeling";
    const candidate = "Don't stop believin' hold on to that feelin'";

    const result = isNearDuplicateSignature({
      candidateNormalizedSignature: normalizeContent(candidate),
      candidateTokenSignature: contentTokenSignature(candidate),
      recent: [
        {
          normalizedSignature: normalizeContent(prior),
          tokenSignature: contentTokenSignature(prior),
        },
      ],
    });

    expect(result.duplicate).toBe(true);
  });

  it('treats prefix/substring quotes as duplicates when there are enough words', () => {
    const prior = 'Action speaks louder than words';
    const candidate = 'Action speaks louder';

    const result = isNearDuplicateSignature({
      candidateNormalizedSignature: normalizeContent(candidate),
      candidateTokenSignature: contentTokenSignature(candidate),
      recent: [
        {
          normalizedSignature: normalizeContent(prior),
          tokenSignature: contentTokenSignature(prior),
        },
      ],
    });

    expect(result.duplicate).toBe(true);
  });
});
