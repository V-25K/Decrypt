import type { DifficultyBreakdown, PuzzlePrivate, PuzzleTile } from '../../shared/game.ts';
import { computePhraseDifficultyProfile } from './content.ts';
import { topCommonWords } from './common-word-ranks.ts';
import { runDummySolver } from './dummy-solver.ts';

export const difficultyModelVersion = 'v2';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clamp01 = (value: number): number => clamp(value, 0, 1);

const roundedDifficulty = (score: number): number =>
  Math.max(1, Math.min(10, Math.round(score)));

const commonSuffixes = ['ING', 'TION', 'NESS', 'LY', 'ED', 'ER', 'EST'];

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

const wordPatternCounts = (words: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const word of words) {
    if (word.length < 3) {
      continue;
    }
    const key = `${word.length}:${wordPatternSignature(word)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const isAnchorWord = (
  word: string,
  patternCounts: Map<string, number>
): boolean => {
  if (word.length <= 3 && topCommonWords.has(word)) {
    return true;
  }
  if (
    word.length >= 5 &&
    commonSuffixes.some((suffix) => word.endsWith(suffix))
  ) {
    return true;
  }
  const patternKey = `${word.length}:${wordPatternSignature(word)}`;
  return (patternCounts.get(patternKey) ?? 0) > 1;
};

const countFullyPrefilledWords = (params: {
  tiles: readonly PuzzleTile[];
  words: readonly string[];
  prefilledIndices: readonly number[];
}): number => {
  const prefilledSet = new Set(params.prefilledIndices);
  let count = 0;
  for (let wordIndex = 0; wordIndex < params.words.length; wordIndex += 1) {
    const letterIndices = params.tiles
      .filter((tile) => tile.isLetter && tile.wordIndex === wordIndex)
      .map((tile) => tile.index);
    if (
      letterIndices.length > 0 &&
      letterIndices.every((index) => prefilledSet.has(index))
    ) {
      count += 1;
    }
  }
  return count;
};

const revealedAnchorCoverage = (puzzle: PuzzlePrivate): number => {
  const prefilledSet = new Set(puzzle.prefilledIndices);
  const patternCounts = wordPatternCounts(puzzle.words);
  let anchorWords = 0;
  let revealedAnchorWords = 0;

  for (let wordIndex = 0; wordIndex < puzzle.words.length; wordIndex += 1) {
    const word = puzzle.words[wordIndex] ?? '';
    if (!isAnchorWord(word, patternCounts)) {
      continue;
    }
    anchorWords += 1;
    const wordLetterIndices = puzzle.tiles
      .filter((tile) => tile.isLetter && tile.wordIndex === wordIndex)
      .map((tile) => tile.index);
    if (wordLetterIndices.some((index) => prefilledSet.has(index))) {
      revealedAnchorWords += 1;
    }
  }

  return anchorWords > 0 ? revealedAnchorWords / anchorWords : 0;
};

export const buildDifficultyBreakdown = (puzzle: PuzzlePrivate): DifficultyBreakdown => {
  const phraseProfile = computePhraseDifficultyProfile(puzzle.targetText);
  const padlockCount = puzzle.padlockChains.length;
  const blindCount = puzzle.blindIndices.length;
  const letterCount = puzzle.tiles.filter((tile) => tile.isLetter).length;
  const safeLetterCount = Math.max(1, letterCount);
  const lockCount = puzzle.lockIndices?.length ?? 0;
  const blindCoverage = blindCount / safeLetterCount;
  const lockCoverage = lockCount / safeLetterCount;
  const prefillCoverage = puzzle.prefilledIndices.length / safeLetterCount;
  const fullyPrefilledWordCount = countFullyPrefilledWords({
    tiles: puzzle.tiles,
    words: puzzle.words,
    prefilledIndices: puzzle.prefilledIndices,
  });
  const solver = runDummySolver({
    puzzle,
    revealedIndices: puzzle.prefilledIndices,
    forbiddenIndices: [...puzzle.blindIndices, ...(puzzle.lockIndices ?? [])],
    requiredSolveRatio: 0.6,
    maxSearchMs: 25,
    maxBranchExpansions: 1200,
    solverProfile: 'standard',
  });

  const uniqueLetterSignal = clamp01(phraseProfile.uniqueLetterCount / 22);
  const longWordPressure = clamp01((phraseProfile.averageWordLength - 4.2) / 4.8);
  const revealedAnchor = clamp01(revealedAnchorCoverage(puzzle));
  const textBase =
    1.2 +
    phraseProfile.cryptoHardness * 2.4 +
    uniqueLetterSignal * 0.9 +
    phraseProfile.rareWordRatio * 1.1 +
    longWordPressure * 0.5 -
    phraseProfile.topCommonWordRatio * 0.8 -
    phraseProfile.anchorDensity * 0.9 -
    phraseProfile.repeatedPatternScore * 0.35;
  const obstructionBonus =
    Math.min(1.8, padlockCount * 0.45 + lockCoverage * 4.8) +
    Math.min(1.6, blindCoverage * 5.0 + Math.max(0, blindCount - 2) * 0.12);
  const revealDiscount = Math.min(
    2.4,
    prefillCoverage * 6.0 + fullyPrefilledWordCount * 0.25 + revealedAnchor * 0.5
  );
  const solverDiscount = Math.min(1.3, solver.solvedRatio * 1.3);
  const fairnessPenalty =
    !solver.solvable || solver.blindGuessRequired
      ? 0.9
      : solver.solvedRatio < 0.45
        ? 0.3
        : 0;
  const cipherAdjustment =
    puzzle.cipherType === 'random' ? 0.25 : puzzle.cipherType === 'shift' ? -0.3 : 0;
  const staticDifficulty = roundedDifficulty(
    textBase + obstructionBonus - revealDiscount - solverDiscount + fairnessPenalty + cipherAdjustment
  );
  const confidence = clamp01(
    0.35 +
      solver.solvedRatio * 0.35 +
      phraseProfile.lexiconCoverageRatio * 0.2 +
      Math.min(0.1, puzzle.prefilledIndices.length / 20) -
      (solver.blindGuessRequired ? 0.2 : 0)
  );

  return {
    difficultyModelVersion,
    staticDifficulty,
    calibratedDifficulty: staticDifficulty,
    difficultyConfidence: Number(confidence.toFixed(4)),
    humanFeatures: {
      lexiconCoverageRatio: Number(phraseProfile.lexiconCoverageRatio.toFixed(4)),
      topCommonWordRatio: Number(phraseProfile.topCommonWordRatio.toFixed(4)),
      rareWordRatio: Number(phraseProfile.rareWordRatio.toFixed(4)),
      anchorWordCount: phraseProfile.anchorWordCount,
      shortWordAnchorCount: phraseProfile.shortWordAnchorCount,
      commonPatternCount: phraseProfile.commonPatternCount,
      repeatedPatternScore: Number(phraseProfile.repeatedPatternScore.toFixed(4)),
      averageWordLength: Number(phraseProfile.averageWordLength.toFixed(4)),
      anchorDensity: Number(phraseProfile.anchorDensity.toFixed(4)),
      uniqueLetterSignal: Number(uniqueLetterSignal.toFixed(4)),
      longWordPressure: Number(longWordPressure.toFixed(4)),
      revealedAnchorCoverage: Number(revealedAnchor.toFixed(4)),
    },
    fairnessSummary: {
      solvable: solver.solvable,
      solvedRatio: Number(solver.solvedRatio.toFixed(4)),
      blindGuessRequired: solver.blindGuessRequired,
    },
  };
};

export const estimateDifficultyV2 = (puzzle: PuzzlePrivate): number =>
  buildDifficultyBreakdown(puzzle).calibratedDifficulty;
