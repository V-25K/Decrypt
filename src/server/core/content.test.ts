import { describe, expect, it } from 'vitest';
import {
  computePhraseDifficultyProfile,
  containsDisallowedContent,
  contentTokenSignature,
  difficultyToTier,
  hasMinUniqueWords,
  hasRepeatedLetter,
  isNearDuplicateSignature,
  normalizeContent,
  quotePassesTierLength,
  sanitizePhrase,
  quotePassesTierHardness,
  scorePhraseDifficultyAgainstTier,
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
    expect(quotePassesTierLength('A'.repeat(35), 'warmup')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(36), 'warmup')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(70), 'medium')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(71), 'medium')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(105), 'hard')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(40), 'hard')).toBe(false);
    expect(quotePassesTierLength('A'.repeat(60), 'expert')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(160), 'expert')).toBe(true);
    expect(quotePassesTierLength('A'.repeat(161), 'expert')).toBe(false);
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

  it('allows ambiguous exact words that are common in idioms', () => {
    expect(containsDisallowedContent('KILL TWO BIRDS WITH ONE STONE')).toBe(false);
    expect(containsDisallowedContent('A LOVE-HATE RELATIONSHIP')).toBe(false);
  });

  it('still rejects explicit exact words and banned substrings', () => {
    expect(containsDisallowedContent('THIS IS SHIT')).toBe(true);
    expect(containsDisallowedContent('BRIGHT CUNTFISH COMETS GLOW')).toBe(true);
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

  it('does not score difficulty fit from presentation length alone', () => {
    const compact = computePhraseDifficultyProfile('TO BE OR NOT TO BE');
    const padded = computePhraseDifficultyProfile('TO BE OR NOT TO BE..............');

    expect(scorePhraseDifficultyAgainstTier(padded, 'medium').score).toBe(
      scorePhraseDifficultyAgainstTier(compact, 'medium').score
    );
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

  it('uses common bigrams to lower hardness for more predictable text', () => {
    const commonBigrams = computePhraseDifficultyProfile('THERE ARE OTHER THINGS HERE');
    const rareBigrams = computePhraseDifficultyProfile('JUMPY FJORDS VEX BLACK WIZARDS');

    expect(commonBigrams.commonBigramRatio).toBeGreaterThan(rareBigrams.commonBigramRatio);
    expect(commonBigrams.cryptoHardness).toBeLessThan(rareBigrams.cryptoHardness);
  });

  it('extracts V2 human cryptogram anchor signals', () => {
    const common = computePhraseDifficultyProfile(
      'THE ONLY THING WE HAVE TO FEAR IS FEAR ITSELF'
    );
    const rare = computePhraseDifficultyProfile(
      'MELANCHOLY IS INCOMPATIBLE WITH BICYCLING'
    );

    expect(common.topCommonWordRatio).toBeGreaterThan(rare.topCommonWordRatio);
    expect(common.anchorDensity).toBeGreaterThan(0);
    expect(rare.rareWordRatio).toBeGreaterThan(0);
  });

  it('normalizes apostrophes for V2 word coverage signals', () => {
    const profile = computePhraseDifficultyProfile("DON'T STOP BELIEVING");

    expect(profile.lexiconCoverageRatio).toBeGreaterThan(0.3);
    expect(profile.shortWordAnchorCount).toBeGreaterThanOrEqual(0);
  });

  it('does not treat tiny phrases with all-distinct bigrams as maximal bigram entropy', () => {
    const shortPhrase = computePhraseDifficultyProfile('ABCD');

    expect(shortPhrase.bigramEntropy).toBeLessThan(0.7);
  });

  it('accepts representative warmup, medium, hard, and expert phrases under the tuned bands', () => {
    expect(validateQuoteForPhase1('TO BE OR NOT TO BE AGAIN', 2).valid).toBe(true);
    expect(
      validateQuoteForPhase1('GOOD THINGS TAKE PATIENCE AND CARE', 5).valid
    ).toBe(true);
    expect(
      validateQuoteForPhase1('BOLD THINKERS NAVIGATE UNCERTAIN WORLDS WITH GRIT', 8).valid
    ).toBe(true);
    expect(
      validateQuoteForPhase1(
        'JUMPING ZEBRAS VEX QUICK WALTZ DRUM RHYTHMS UNDER BRIGHT MOONLIGHT',
        9
      ).valid
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

  it('treats one-token extensions of five-word sayings as duplicates', () => {
    const prior = 'Actions speak louder than words';
    const candidate = 'Actions speak louder than words do';

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

  it('treats dropped-middle-word variants as duplicates when most words remain in order', () => {
    const prior = 'Actions speak louder than words';
    const candidate = 'Actions louder than words';

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
    expect(result.reason).toBe('dropped words variant duplicate');
  });
});
