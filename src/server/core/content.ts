export const maxPuzzleWordLength = 12;
export const maxPuzzleTotalLength = 50;

export const normalizeContent = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

export const sanitizePhrase = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[^A-Z0-9 ,.'!?;:()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const looksLikeAllowedPhrase = (input: string): boolean =>
  /^[A-Z0-9 ,.'!?;:()-]+$/.test(input) && /[A-Z]/.test(input);

const extractWords = (text: string): string[] =>
  text
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212-]/g, ' ')
    .split(/\s+/g)
    .map((token) => token.replace(/[^A-Z0-9]/g, ''))
    .filter((token) => token.length > 0);

const countLetters = (text: string): number =>
  (text.match(/[A-Z]/g) ?? []).length;

export const hasWordLongerThan = (
  input: string,
  maxWordLength = maxPuzzleWordLength
): boolean => {
  const tokens = input
    .trim()
    .split(/\s+/g)
    .filter((token) => token.length > 0);
  return tokens.some((token) => token.length > maxWordLength);
};

export const exceedsPuzzleTotalLength = (
  input: string,
  maxTotalLength = maxPuzzleTotalLength
): boolean => input.length > maxTotalLength;

export type DifficultyTier = 'easy' | 'medium' | 'hard';

export const difficultyToTier = (difficulty: number): DifficultyTier => {
  if (difficulty <= 3) {
    return 'easy';
  }
  if (difficulty <= 7) {
    return 'medium';
  }
  return 'hard';
};

export const quotePassesTierLength = (
  text: string,
  tier: DifficultyTier
): boolean => {
  if (tier === 'easy') {
    return text.length >= 15 && text.length <= 35;
  }
  if (tier === 'medium') {
    return text.length >= 36 && text.length <= maxPuzzleTotalLength;
  }
  return text.length >= 46 && text.length <= maxPuzzleTotalLength;
};

export const hasMinUniqueWords = (
  text: string,
  minimumUniqueWords: number
): boolean => {
  const words = extractWords(text);
  const uniqueWords = new Set(words);
  return uniqueWords.size >= minimumUniqueWords;
};

export const hasRepeatedLetter = (text: string): boolean => {
  const counts: Record<string, number> = {};
  for (const char of text.toUpperCase()) {
    if (!/^[A-Z]$/.test(char)) {
      continue;
    }
    counts[char] = (counts[char] ?? 0) + 1;
    if ((counts[char] ?? 0) > 1) {
      return true;
    }
  }
  return false;
};

export const validateQuoteForPhase1 = (
  text: string,
  difficulty: number
): { valid: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  const normalized = sanitizePhrase(text);
  const tier = difficultyToTier(difficulty);
  const words = extractWords(normalized);
  const uniqueWordCount = new Set(words).size;
  const wordCount = words.length;
  const minUniqueWords =
    tier === 'easy'
      ? Math.max(2, Math.ceil(wordCount * 0.6))
      : tier === 'medium'
        ? Math.max(3, Math.ceil(wordCount * 0.7))
        : Math.max(4, Math.ceil(wordCount * 0.8));
  const minLetters = tier === 'easy' ? 12 : tier === 'medium' ? 18 : 24;

  if (!quotePassesTierLength(normalized, tier)) {
    reasons.push(`Quote length ${normalized.length} does not satisfy ${tier} tier bounds.`);
  }
  if (uniqueWordCount < minUniqueWords) {
    reasons.push(`Quote must contain at least ${minUniqueWords} unique words.`);
  }
  if (countLetters(normalized) < minLetters) {
    reasons.push(`Quote must contain at least ${minLetters} letters.`);
  }
  if (!hasRepeatedLetter(normalized)) {
    reasons.push('Quote must contain at least one repeated letter.');
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
};

