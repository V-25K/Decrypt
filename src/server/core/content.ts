import {
  maxPuzzleTotalLength as sharedMaxPuzzleTotalLength,
  minPlayablePuzzleTotalLength as sharedMinPlayablePuzzleTotalLength,
} from '../../shared/puzzle-limits';
import { commonWordRank, topCommonWords } from './common-word-ranks';

export const maxPuzzleWordLength = 12;
export const maxPuzzleTotalLength = sharedMaxPuzzleTotalLength;
export const minPlayablePuzzleTotalLength = sharedMinPlayablePuzzleTotalLength;
export const maxPuzzleAuthorLength = 28;
const maxAlphabetLetters = 26;
const absoluteEntropyMax = Math.log2(maxAlphabetLetters);
const commonDifficultySuffixes = ['ING', 'TION', 'NESS', 'LY', 'ED', 'ER', 'EST'];
const commonEnglishBigrams = new Set([
  'TH', 'HE', 'IN', 'ER', 'AN', 'RE', 'ON', 'AT', 'EN', 'ND',
  'TI', 'ES', 'OR', 'TE', 'OF', 'ED', 'IS', 'IT', 'AL', 'AR',
  'ST', 'TO', 'NT', 'NG', 'SE', 'HA', 'AS', 'OU', 'IO', 'LE',
  'VE', 'CO', 'ME', 'DE', 'HI', 'RI', 'RO', 'IC', 'NE', 'EA',
]);
const minimumSuffixWordLength = 5;
const minPlayableLetterCount = 12;
const minPlayableUniqueLetterCount = 5;
const minPlayableUniqueWordCount = 2;
const bannedExactWords = [
  'FUCK',
  'SHIT',
  'BITCH',
  'ASSHOLE',
  'SUICIDE',
  'RAPE',
];
const bannedSubstrings = ['NIGG', 'FAGG', 'CUNT', 'WHORE', 'KYS'];
const spammyFragments = ['HTTP', 'WWW', '.COM', '.NET', '.ORG', 'BUY NOW', 'SUBSCRIBE', 'FOLLOW ME'];

export const normalizeContent = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

export const contentTokenSignature = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212-]/g, ' ')
    .split(/\s+/g)
    .map((token) => token.replace(/[^A-Z0-9]/g, ''))
    .filter((token) => token.length > 0)
    .join(' ');

export const sanitizePhrase = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[^A-Z0-9 ,.'!?;:()-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const looksLikeAllowedPhrase = (input: string): boolean =>
  /^[A-Z0-9 ,.'!?;:()-]+$/.test(input) && /[A-Z]/.test(input);

export const sanitizeAuthor = (input: string): string =>
  input
    .toUpperCase()
    .replace(/[^A-Z0-9 .'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const looksLikeAllowedAuthor = (input: string): boolean =>
  /^[A-Z0-9 .'-]+$/.test(input) && /[A-Z]/.test(input);

export const containsDisallowedContent = (input: string): boolean => {
  const upper = input.toUpperCase();
  const exactWords = upper.split(/[^A-Z0-9]+/).filter((token) => token.length > 0);
  const hasExactMatch = bannedExactWords.some((word) => exactWords.includes(word));
  if (hasExactMatch) {
    return true;
  }
  return bannedSubstrings.some((fragment) => upper.includes(fragment));
};

export const assessContentQuality = (input: string): string[] => {
  const text = sanitizePhrase(input);
  const reasons: string[] = [];
  const letters = (text.match(/[A-Z]/g) ?? []).length;
  const digits = (text.match(/[0-9]/g) ?? []).length;
  const words = extractWords(text);

  if (spammyFragments.some((fragment) => text.includes(fragment))) {
    reasons.push('Quote looks promotional or link-like.');
  }
  if (/(.)\1\1\1/.test(text.replace(/\s+/g, ''))) {
    reasons.push('Quote contains excessive repeated characters.');
  }
  if (/[!?.,;:()-]{4,}/.test(text)) {
    reasons.push('Quote contains excessive punctuation.');
  }
  if (digits > 0 && letters > 0 && digits / Math.max(1, letters + digits) > 0.3) {
    reasons.push('Quote contains too many digits for a clean puzzle prompt.');
  }
  if (words.length > 0) {
    let longestRepeatedRun = 1;
    let currentRun = 1;
    for (let index = 1; index < words.length; index += 1) {
      if (words[index] === words[index - 1]) {
        currentRun += 1;
        longestRepeatedRun = Math.max(longestRepeatedRun, currentRun);
      } else {
        currentRun = 1;
      }
    }
    if (longestRepeatedRun >= 3) {
      reasons.push('Quote repeats the same word too many times in a row.');
    }
  }

  return reasons;
};

const extractWords = (text: string): string[] =>
  text
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212-]/g, ' ')
    .split(/\s+/g)
    .map((token) => token.replace(/[^A-Z0-9]/g, ''))
    .filter((token) => token.length > 0);

const kGramSet = (value: string, size: number): Set<string> => {
  const grams = new Set<string>();
  const k = Math.max(2, Math.min(8, Math.floor(size)));
  if (value.length < k) {
    return grams;
  }
  for (let i = 0; i <= value.length - k; i += 1) {
    grams.add(value.slice(i, i + k));
  }
  return grams;
};

const jaccard = (first: Set<string>, second: Set<string>): number => {
  if (first.size === 0 && second.size === 0) {
    return 1;
  }
  if (first.size === 0 || second.size === 0) {
    return 0;
  }
  let intersection = 0;
  const [small, large] = first.size <= second.size ? [first, second] : [second, first];
  for (const value of small) {
    if (large.has(value)) {
      intersection += 1;
    }
  }
  const union = first.size + second.size - intersection;
  return union <= 0 ? 0 : intersection / union;
};

const containment = (first: Set<string>, second: Set<string>): number => {
  if (first.size === 0 || second.size === 0) {
    return 0;
  }
  const [small, large] = first.size <= second.size ? [first, second] : [second, first];
  let intersection = 0;
  for (const value of small) {
    if (large.has(value)) {
      intersection += 1;
    }
  }
  return intersection / small.size;
};

const looksLikeSubstringDuplicate = (
  candidateTokenSig: string,
  priorTokenSig: string
): boolean => {
  const candidate = candidateTokenSig.trim();
  const prior = priorTokenSig.trim();
  if (candidate.length === 0 || prior.length === 0) {
    return false;
  }
  const candidateWords = candidate.split(' ').filter(Boolean);
  const priorWords = prior.split(' ').filter(Boolean);
  const shorterWords = candidateWords.length <= priorWords.length ? candidateWords : priorWords;
  if (shorterWords.length < 2) {
    return false;
  }
  if (shorterWords.length === 2) {
    // Avoid spurious matches like "IN THE" across many prompts.
    const shorterText = shorterWords.join(' ');
    if (shorterText.length < 14) {
      return false;
    }
  }
  if (candidate === prior) {
    return true;
  }
  if (candidate.startsWith(prior) || prior.startsWith(candidate)) {
    return true;
  }
  if (candidate.includes(prior) || prior.includes(candidate)) {
    return true;
  }
  return false;
};

const tokensNearlyEqual = (first: string, second: string): boolean => {
  const a = first.trim();
  const b = second.trim();
  if (a === b) {
    return true;
  }
  if (a.length < 5 || b.length < 5) {
    return false;
  }
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (longer.startsWith(shorter) && longer.length - shorter.length <= 2) {
    return true;
  }
  return false;
};

const matchCountWithOptionalSkip = (params: {
  longer: string[];
  shorter: string[];
  skipIndex: number | null;
}): number => {
  let matches = 0;
  let shortIndex = 0;
  for (let longIndex = 0; longIndex < params.longer.length; longIndex += 1) {
    if (params.skipIndex !== null && longIndex === params.skipIndex) {
      continue;
    }
    const shortToken = params.shorter[shortIndex];
    if (!shortToken) {
      break;
    }
    if (tokensNearlyEqual(params.longer[longIndex] ?? '', shortToken)) {
      matches += 1;
    }
    shortIndex += 1;
  }
  return matches;
};

const looksLikeMinorTokenVariantsDuplicate = (
  candidateTokenSig: string,
  priorTokenSig: string
): boolean => {
  const candidateTokens = candidateTokenSig.split(' ').filter(Boolean);
  const priorTokens = priorTokenSig.split(' ').filter(Boolean);
  const maxLen = Math.max(candidateTokens.length, priorTokens.length);
  const minLen = Math.min(candidateTokens.length, priorTokens.length);
  if (maxLen < 6) {
    return false;
  }
  if (maxLen - minLen > 1) {
    return false;
  }

  if (candidateTokens.length === priorTokens.length) {
    const matches = matchCountWithOptionalSkip({
      longer: candidateTokens,
      shorter: priorTokens,
      skipIndex: null,
    });
    return matches / maxLen >= 0.9;
  }

  const longer = candidateTokens.length > priorTokens.length ? candidateTokens : priorTokens;
  const shorter = candidateTokens.length > priorTokens.length ? priorTokens : candidateTokens;
  let bestMatches = 0;
  for (let skipIndex = 0; skipIndex < longer.length; skipIndex += 1) {
    bestMatches = Math.max(
      bestMatches,
      matchCountWithOptionalSkip({ longer, shorter, skipIndex })
    );
  }
  if (shorter.length >= 5 && bestMatches >= shorter.length) {
    return true;
  }
  return bestMatches / longer.length >= 0.9;
};

const looksLikeDroppedWordsDuplicate = (
  candidateTokenSig: string,
  priorTokenSig: string
): boolean => {
  const candidateTokens = candidateTokenSig.split(' ').filter(Boolean);
  const priorTokens = priorTokenSig.split(' ').filter(Boolean);
  const maxLen = Math.max(candidateTokens.length, priorTokens.length);
  const minLen = Math.min(candidateTokens.length, priorTokens.length);
  if (minLen < 4 || maxLen - minLen > 3) {
    return false;
  }
  if (minLen / maxLen < 0.7) {
    return false;
  }

  const [shorter, longer] =
    candidateTokens.length <= priorTokens.length
      ? [candidateTokens, priorTokens]
      : [priorTokens, candidateTokens];
  let shortIndex = 0;
  for (let longIndex = 0; longIndex < longer.length && shortIndex < shorter.length; longIndex += 1) {
    if (tokensNearlyEqual(longer[longIndex] ?? '', shorter[shortIndex] ?? '')) {
      shortIndex += 1;
    }
  }
  return shortIndex === shorter.length;
};

export const isNearDuplicateSignature = (params: {
  candidateNormalizedSignature: string;
  candidateTokenSignature: string;
  recent: Array<{ normalizedSignature: string; tokenSignature: string | null }>;
}): { duplicate: boolean; reason: string | null } => {
  const candidateNormalized = params.candidateNormalizedSignature.trim();
  const candidateTokenSig = params.candidateTokenSignature.trim();
  if (candidateNormalized.length === 0) {
    return { duplicate: false, reason: null };
  }

  const candidateGrams = kGramSet(candidateNormalized, 5);
  for (const entry of params.recent) {
    const priorNormalized = entry.normalizedSignature.trim();
    if (priorNormalized.length === 0) {
      continue;
    }
    if (priorNormalized === candidateNormalized) {
      return { duplicate: true, reason: 'exact signature match' };
    }
    const priorTokenSig = (entry.tokenSignature ?? '').trim();
    if (candidateTokenSig.length > 0 && priorTokenSig.length > 0) {
      if (looksLikeSubstringDuplicate(candidateTokenSig, priorTokenSig)) {
        return { duplicate: true, reason: 'substring/prefix duplicate' };
      }
      if (looksLikeMinorTokenVariantsDuplicate(candidateTokenSig, priorTokenSig)) {
        return { duplicate: true, reason: 'minor token variant duplicate' };
      }
      if (looksLikeDroppedWordsDuplicate(candidateTokenSig, priorTokenSig)) {
        return { duplicate: true, reason: 'dropped words variant duplicate' };
      }
    } else {
      const minLen = Math.min(candidateNormalized.length, priorNormalized.length);
      if (minLen >= 16) {
        if (
          candidateNormalized.includes(priorNormalized) ||
          priorNormalized.includes(candidateNormalized)
        ) {
          return { duplicate: true, reason: 'substring duplicate' };
        }
      }
    }

    const minLen = Math.min(candidateNormalized.length, priorNormalized.length);
    if (minLen < 18) {
      continue;
    }
    const priorGrams = kGramSet(priorNormalized, 5);
    const jac = jaccard(candidateGrams, priorGrams);
    if (jac >= 0.9) {
      return { duplicate: true, reason: 'high similarity' };
    }
    const cover = containment(candidateGrams, priorGrams);
    if (cover >= 0.96) {
      return { duplicate: true, reason: 'high containment' };
    }
  }

  return { duplicate: false, reason: null };
};

const countLetters = (text: string): number =>
  (text.match(/[A-Z]/g) ?? []).length;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const wordPatternSignature = (word: string): string => {
  const seen = new Map<string, number>();
  let next = 0;
  const signature: string[] = [];
  for (const char of word) {
    const existing = seen.get(char);
    if (existing !== undefined) {
      signature.push(String.fromCharCode(65 + existing));
      continue;
    }
    seen.set(char, next);
    signature.push(String.fromCharCode(65 + next));
    next += 1;
  }
  return signature.join('');
};

export type PhraseDifficultyProfile = {
  totalLength: number;
  totalLetters: number;
  wordCount: number;
  uniqueWordCount: number;
  uniqueWordRatio: number;
  repeatedWordRatio: number;
  averageWordLength: number;
  uniqueLetterCount: number;
  letterEntropy: number;
  bigramEntropy: number;
  oneLetterWordCount: number;
  twoLetterWordCount: number;
  commonSuffixCount: number;
  commonBigramRatio: number;
  lexiconCoverageRatio: number;
  topCommonWordRatio: number;
  rareWordRatio: number;
  anchorWordCount: number;
  shortWordAnchorCount: number;
  commonPatternCount: number;
  repeatedPatternScore: number;
  anchorDensity: number;
  cryptoHardness: number;
};

export const computePhraseDifficultyProfile = (
  input: string
): PhraseDifficultyProfile => {
  const text = sanitizePhrase(input);
  const letters = text.replace(/[^A-Z]/g, '').split('');
  const totalLetters = letters.length;
  const frequency = new Map<string, number>();
  for (const letter of letters) {
    frequency.set(letter, (frequency.get(letter) ?? 0) + 1);
  }
  const uniqueLetterCount = frequency.size;

  let entropy = 0;
  for (const count of frequency.values()) {
    const p = totalLetters > 0 ? count / totalLetters : 0;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  const letterEntropy = absoluteEntropyMax > 0 ? entropy / absoluteEntropyMax : 0;
  const normalizedEntropy = clamp01(letterEntropy);

  const words = extractWords(text).map((word) => word.replace(/[^A-Z]/g, ''));
  const wordCount = words.length;
  const uniqueWordCount = new Set(words).size;
  const uniqueWordRatio = wordCount > 0 ? uniqueWordCount / wordCount : 0;
  const repeatedWordRatio = wordCount > 0 ? 1 - uniqueWordRatio : 0;
  const averageWordLength = wordCount > 0 ? totalLetters / wordCount : 0;
  const oneLetterWordCount = words.filter((word) => word.length === 1).length;
  const twoLetterWordCount = words.filter((word) => word.length === 2).length;
  const knownWordCount = words.filter((word) => commonWordRank.has(word)).length;
  const topCommonWordCount = words.filter((word) => topCommonWords.has(word)).length;
  const rareWordCount = words.filter((word) => {
    const rank = commonWordRank.get(word);
    return rank === undefined || rank > 450;
  }).length;
  const commonSuffixCount = words.filter((word) =>
    word.length >= minimumSuffixWordLength &&
    commonDifficultySuffixes.some((suffix) => word.endsWith(suffix))
  ).length;
  const shortWordAnchorCount = words.filter(
    (word) => word.length <= 3 && topCommonWords.has(word)
  ).length;
  const patternFrequency = new Map<string, number>();
  for (const word of words) {
    if (word.length < 3) {
      continue;
    }
    const pattern = `${word.length}:${wordPatternSignature(word)}`;
    patternFrequency.set(pattern, (patternFrequency.get(pattern) ?? 0) + 1);
  }
  const repeatedPatternCount = [...patternFrequency.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );
  const bigramFrequency = new Map<string, number>();
  let totalBigrams = 0;
  let commonBigramCount = 0;
  for (const word of words) {
    if (word.length < 2) {
      continue;
    }
    for (let index = 0; index < word.length - 1; index += 1) {
      const bigram = word.slice(index, index + 2);
      bigramFrequency.set(bigram, (bigramFrequency.get(bigram) ?? 0) + 1);
      totalBigrams += 1;
      if (commonEnglishBigrams.has(bigram)) {
        commonBigramCount += 1;
      }
    }
  }
  let rawBigramEntropy = 0;
  for (const count of bigramFrequency.values()) {
    const p = totalBigrams > 0 ? count / totalBigrams : 0;
    if (p > 0) {
      rawBigramEntropy -= p * Math.log2(p);
    }
  }
  const bigramEntropyMax =
    totalBigrams > 1 ? Math.log2(Math.max(8, Math.min(26 * 26, totalBigrams))) : 0;
  const bigramEntropy = bigramEntropyMax > 0 ? rawBigramEntropy / bigramEntropyMax : 0;
  const normalizedBigramEntropy = clamp01(bigramEntropy);
  const commonBigramRatio = totalBigrams > 0 ? commonBigramCount / totalBigrams : 0;
  const lexiconCoverageRatio = wordCount > 0 ? knownWordCount / wordCount : 0;
  const topCommonWordRatio = wordCount > 0 ? topCommonWordCount / wordCount : 0;
  const rareWordRatio = wordCount > 0 ? rareWordCount / wordCount : 0;
  const commonPatternCount =
    shortWordAnchorCount + commonSuffixCount + Math.round(commonBigramRatio * Math.max(1, wordCount));
  const repeatedPatternScore = wordCount > 0 ? repeatedPatternCount / wordCount : 0;
  const anchorWordCount = Math.min(
    wordCount,
    shortWordAnchorCount + commonSuffixCount + repeatedPatternCount
  );
  const anchorDensity = wordCount > 0 ? anchorWordCount / wordCount : 0;

  const uniquenessCoverage =
    totalLetters > 0 ? uniqueLetterCount / Math.min(maxAlphabetLetters, totalLetters) : 0;
  const alphabetBreadth = uniqueLetterCount / maxAlphabetLetters;
  const uniquenessScore = clamp01(uniquenessCoverage * 0.6 + alphabetBreadth * 0.4);
  const helperPenalty = Math.min(
    1,
    oneLetterWordCount * 0.15 + twoLetterWordCount * 0.08 + commonSuffixCount * 0.06
  );
  const cryptoHardness = clamp01(
    uniquenessScore * 0.48 +
      normalizedEntropy * 0.26 +
      normalizedBigramEntropy * 0.16 -
      helperPenalty * 0.15 -
      commonBigramRatio * 0.1
  );

  return {
    totalLength: text.length,
    totalLetters,
    wordCount,
    uniqueWordCount,
    uniqueWordRatio,
    repeatedWordRatio,
    averageWordLength,
    uniqueLetterCount,
    letterEntropy,
    bigramEntropy,
    oneLetterWordCount,
    twoLetterWordCount,
    commonSuffixCount,
    commonBigramRatio,
    lexiconCoverageRatio,
    topCommonWordRatio,
    rareWordRatio,
    anchorWordCount,
    shortWordAnchorCount,
    commonPatternCount,
    repeatedPatternScore,
    anchorDensity,
    cryptoHardness,
  };
};

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

export type DifficultyTier = 'warmup' | 'medium' | 'hard' | 'expert';

export type HardnessBounds = {
  uniqueLetterBounds: {
    min: number;
    max: number;
  };
  cryptoHardnessBounds: {
    min: number;
    max: number;
  };
};

export type HardnessBoundsByTier = Record<DifficultyTier, HardnessBounds>;

const defaultHardnessBoundsByTier: HardnessBoundsByTier = {
  warmup: {
    uniqueLetterBounds: { min: 5, max: 8 },
    cryptoHardnessBounds: { min: 0.14, max: 0.33 },
  },
  medium: {
    uniqueLetterBounds: { min: 8, max: 13 },
    cryptoHardnessBounds: { min: 0.32, max: 0.58 },
  },
  hard: {
    uniqueLetterBounds: { min: 13, max: 22 },
    cryptoHardnessBounds: { min: 0.58, max: 0.82 },
  },
  expert: {
    uniqueLetterBounds: { min: 19, max: 26 },
    cryptoHardnessBounds: { min: 0.78, max: 1.0 },
  },
};

const cloneHardnessBounds = (bounds: HardnessBounds): HardnessBounds => ({
  uniqueLetterBounds: { ...bounds.uniqueLetterBounds },
  cryptoHardnessBounds: { ...bounds.cryptoHardnessBounds },
});

export const getDefaultHardnessBoundsByTier = (): HardnessBoundsByTier => ({
  warmup: cloneHardnessBounds(defaultHardnessBoundsByTier.warmup),
  medium: cloneHardnessBounds(defaultHardnessBoundsByTier.medium),
  hard: cloneHardnessBounds(defaultHardnessBoundsByTier.hard),
  expert: cloneHardnessBounds(defaultHardnessBoundsByTier.expert),
});

const resolveHardnessBounds = (
  tier: DifficultyTier,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>
): HardnessBounds => cloneHardnessBounds(hardnessBoundsByTier?.[tier] ?? defaultHardnessBoundsByTier[tier]);

export type QuotePromptProfile = {
  tier: DifficultyTier;
  wordCountBounds: {
    min: number;
    max: number;
  };
  recommendedMinUniqueWords: number;
  uniqueLetterBounds: {
    min: number;
    max: number;
  };
  cryptoHardnessBounds: {
    min: number;
    max: number;
  };
};

export const difficultyToTier = (difficulty: number): DifficultyTier => {
  if (difficulty <= 3) {
    return 'warmup';
  }
  if (difficulty <= 5) {
    return 'medium';
  }
  if (difficulty <= 8) {
    return 'hard';
  }
  return 'expert';
};

export const quotePromptProfileForDifficulty = (
  difficulty: number,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>
): QuotePromptProfile => {
  const tier = difficultyToTier(difficulty);
  const hardnessBounds = resolveHardnessBounds(tier, hardnessBoundsByTier);
  if (tier === 'warmup') {
	    return {
	      tier,
	      wordCountBounds: { min: 3, max: 7 },
	      recommendedMinUniqueWords: 3,
	      uniqueLetterBounds: { ...hardnessBounds.uniqueLetterBounds },
      cryptoHardnessBounds: { ...hardnessBounds.cryptoHardnessBounds },
    };
  }
  if (tier === 'medium') {
	    return {
	      tier,
	      wordCountBounds: { min: 5, max: 12 },
	      recommendedMinUniqueWords: 4,
	      uniqueLetterBounds: { ...hardnessBounds.uniqueLetterBounds },
      cryptoHardnessBounds: { ...hardnessBounds.cryptoHardnessBounds },
    };
  }
  if (tier === 'hard') {
	    return {
	      tier,
	      wordCountBounds: { min: 7, max: 18 },
	      recommendedMinUniqueWords: 5,
	      uniqueLetterBounds: { ...hardnessBounds.uniqueLetterBounds },
      cryptoHardnessBounds: { ...hardnessBounds.cryptoHardnessBounds },
    };
  }
	  return {
	    tier,
	    wordCountBounds: { min: 10, max: 24 },
	    recommendedMinUniqueWords: 6,
    uniqueLetterBounds: { ...hardnessBounds.uniqueLetterBounds },
    cryptoHardnessBounds: { ...hardnessBounds.cryptoHardnessBounds },
  };
};

export const quotePassesTierLength = (
  text: string,
  tier: DifficultyTier
): boolean => {
  if (tier === 'warmup') {
    return text.length >= 15 && text.length <= 35;
  }
  if (tier === 'medium') {
    return text.length >= 26 && text.length <= 70;
  }
  if (tier === 'hard') {
    return text.length >= 41 && text.length <= 105;
  }
  return text.length >= 60 && text.length <= maxPuzzleTotalLength;
};

export const quotePassesTierHardness = (
  cryptoHardness: number,
  tier: DifficultyTier,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>
): boolean => {
  const bounds = resolveHardnessBounds(tier, hardnessBoundsByTier).cryptoHardnessBounds;
  return cryptoHardness >= bounds.min && cryptoHardness <= bounds.max;
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

export type TierFitDiagnostics = {
  tier: DifficultyTier;
  score: number;
  issues: string[];
};

const softRangePenalty = (
  value: number,
  bounds: { min: number; max: number },
  params: {
    belowScale: number;
    aboveScale: number;
    belowWeight?: number;
    aboveWeight?: number;
  }
): number => {
  if (value < bounds.min) {
    const gap = bounds.min - value;
    return (gap / Math.max(0.0001, params.belowScale)) * (params.belowWeight ?? 1);
  }
  if (value > bounds.max) {
    const gap = value - bounds.max;
    return (gap / Math.max(0.0001, params.aboveScale)) * (params.aboveWeight ?? 1);
  }
  return 0;
};

const pushIssueIfMeaningful = (
  issues: Array<{ penalty: number; message: string }>,
  penalty: number,
  message: string
): void => {
  if (penalty >= 0.45) {
    issues.push({ penalty, message });
  }
};

export const scorePhraseDifficultyAgainstTier = (
  profile: PhraseDifficultyProfile,
  tier: DifficultyTier,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>
): TierFitDiagnostics => {
  const promptProfile = quotePromptProfileForDifficulty(
    tier === 'warmup' ? 2 : tier === 'medium' ? 5 : tier === 'hard' ? 8 : 9,
    hardnessBoundsByTier
  );
  const rawIssues: Array<{ penalty: number; message: string }> = [];
  const uniqueWordPenalty = softRangePenalty(
    profile.uniqueWordCount,
    {
      min: promptProfile.recommendedMinUniqueWords,
      max: promptProfile.wordCountBounds.max + 2,
    },
    { belowScale: 2.5, aboveScale: 6, belowWeight: 1.2, aboveWeight: 0.15 }
  );
  pushIssueIfMeaningful(
    rawIssues,
    uniqueWordPenalty,
    `Quote does not have the usual word variety for ${tier}.`
  );

  const uniqueLetterPenalty = softRangePenalty(
    profile.uniqueLetterCount,
    promptProfile.uniqueLetterBounds,
    { belowScale: 4.5, aboveScale: 5.5, belowWeight: 1.1, aboveWeight: 0.9 }
  );
  pushIssueIfMeaningful(
    rawIssues,
    uniqueLetterPenalty,
    `Quote letter variety sits outside the typical ${tier} range.`
  );

  const hardnessPenalty = softRangePenalty(
    profile.cryptoHardness,
    promptProfile.cryptoHardnessBounds,
    { belowScale: 0.22, aboveScale: 0.22, belowWeight: 1.25, aboveWeight: 1.25 }
  );
  pushIssueIfMeaningful(
    rawIssues,
    hardnessPenalty,
    `Quote crypto hardness is outside the typical ${tier} presentation range.`
  );

  const repetitionPenalty =
    tier === 'expert'
      ? Math.max(0, profile.repeatedWordRatio - 0.18) * 2.2
      : tier === 'hard'
        ? Math.max(0, profile.repeatedWordRatio - 0.28) * 1.4
        : 0;
  pushIssueIfMeaningful(
    rawIssues,
    repetitionPenalty,
    `Quote repeats words more than a typical ${tier} challenge.`
  );

  const score =
    uniqueWordPenalty * 1.1 +
    uniqueLetterPenalty * 1.2 +
    hardnessPenalty * 1.5 +
    repetitionPenalty;

  rawIssues.sort((a, b) => b.penalty - a.penalty);
  return {
    tier,
    score,
    issues: rawIssues.map((issue) => issue.message),
  };
};

export const rankDifficultyTiersForProfile = (
  profile: PhraseDifficultyProfile,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>,
  candidateTiers: DifficultyTier[] = ['warmup', 'medium', 'hard', 'expert']
): TierFitDiagnostics[] =>
  [...candidateTiers]
    .map((tier) => scorePhraseDifficultyAgainstTier(profile, tier, hardnessBoundsByTier))
    .sort((a, b) => a.score - b.score);

export const validateQuoteForPhase1 = (
  text: string,
  difficulty: number,
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>
): { valid: boolean; reasons: string[] } => {
  const reasons: string[] = [];
  const normalized = sanitizePhrase(text);
  const tier = difficultyToTier(difficulty);
  const promptProfile = quotePromptProfileForDifficulty(
    difficulty,
    hardnessBoundsByTier
  );
  const words = extractWords(normalized);
  const uniqueWordCount = new Set(words).size;
  const phraseProfile = computePhraseDifficultyProfile(normalized);
  if (normalized.length < minPlayablePuzzleTotalLength) {
    reasons.push(
      `Quote length ${normalized.length} is too short. Minimum playable length is ${minPlayablePuzzleTotalLength}.`
    );
  }
  if (uniqueWordCount < minPlayableUniqueWordCount) {
    reasons.push(`Quote must contain at least ${minPlayableUniqueWordCount} unique words.`);
  }
  if (countLetters(normalized) < minPlayableLetterCount) {
    reasons.push(`Quote must contain at least ${minPlayableLetterCount} letters.`);
  }
  if (containsDisallowedContent(normalized)) {
    reasons.push('Quote contains disallowed content.');
  }
  reasons.push(...assessContentQuality(normalized));
  if (!hasRepeatedLetter(normalized)) {
    reasons.push('Quote must contain at least one repeated letter.');
  }
  if (phraseProfile.uniqueLetterCount < minPlayableUniqueLetterCount) {
    reasons.push(
      `Quote must contain at least ${minPlayableUniqueLetterCount} unique letters.`
    );
  }
  if (normalized.length > maxPuzzleTotalLength) {
    reasons.push(
      `Quote length ${normalized.length} exceeds the playable maximum of ${maxPuzzleTotalLength}.`
    );
  }

  if (reasons.length === 0) {
    const fit = scorePhraseDifficultyAgainstTier(phraseProfile, tier, hardnessBoundsByTier);
    if (fit.score > 2.0) {
      const fitReasons = fit.issues.slice(0, 2);
      reasons.push(
        ...(fitReasons.length > 0
          ? fitReasons
          : [
              `Quote sits too far from the typical ${promptProfile.tier} presentation profile to tune fairly.`,
            ])
      );
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
};

