import type { PuzzlePrivate } from '../../shared/game';
import {
  exceedsPuzzleTotalLength,
  hasWordLongerThan,
  maxPuzzleTotalLength,
  maxPuzzleWordLength,
} from './content';

const uniqueLetters = (text: string): Set<string> => {
  const set = new Set<string>();
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (/^[A-Z]$/.test(char)) {
      set.add(char);
    }
  }
  return set;
};

const hasStarterClue = (puzzle: PuzzlePrivate): boolean => {
  for (const index of puzzle.prefilledIndices) {
    const tile = puzzle.tiles[index];
    if (tile && tile.isLetter) {
      return true;
    }
  }
  return false;
};

const hasOverlap = (a: number[], b: number[]): boolean => {
  const setB = new Set(b);
  return a.some((index) => setB.has(index));
};

const hasCircularPadlock = (puzzle: PuzzlePrivate): boolean => {
  const adjacency = new Map<number, number[]>();
  const chainCount = puzzle.padlockChains.length;

  for (let i = 0; i < chainCount; i += 1) {
    adjacency.set(i, []);
  }

  for (let i = 0; i < chainCount; i += 1) {
    const chain = puzzle.padlockChains[i];
    if (!chain) {
      continue;
    }
    for (let j = 0; j < chainCount; j += 1) {
      const other = puzzle.padlockChains[j];
      if (!other) {
        continue;
      }
      if (hasOverlap(chain.keyIndices, other.lockedIndices)) {
        const edges = adjacency.get(i) ?? [];
        edges.push(j);
        adjacency.set(i, edges);
      }
    }
  }

  const state: Array<0 | 1 | 2> = Array.from({ length: chainCount }, () => 0);
  const visit = (node: number): boolean => {
    state[node] = 1;
    for (const next of adjacency.get(node) ?? []) {
      if (state[next] === 1) {
        return true;
      }
      if (state[next] === 0 && visit(next)) {
        return true;
      }
    }
    state[node] = 2;
    return false;
  };

  for (let i = 0; i < chainCount; i += 1) {
    if (state[i] === 0 && visit(i)) {
      return true;
    }
  }

  return false;
};

const hasUnfairBlindTile = (puzzle: PuzzlePrivate): boolean => {
  if (puzzle.blindIndices.length === 0) {
    return false;
  }

  const textLetters = uniqueLetters(puzzle.targetText);
  const blindSet = new Set(puzzle.blindIndices);
  for (const index of puzzle.blindIndices) {
    const tile = puzzle.tiles[index];
    if (!tile || !tile.isLetter) {
      return true;
    }
    const word = puzzle.words[tile.wordIndex];
    if (!word || word.length < 5) {
      return true;
    }

    let appearsElsewhere = false;
    for (const other of puzzle.tiles) {
      if (
        other.index !== tile.index &&
        other.char === tile.char &&
        other.isLetter &&
        !blindSet.has(other.index)
      ) {
        appearsElsewhere = true;
        break;
      }
    }
    if (!appearsElsewhere && textLetters.has(tile.char)) {
      return true;
    }
  }
  return false;
};

const hasOversizedWord = (puzzle: PuzzlePrivate): boolean =>
  hasWordLongerThan(puzzle.targetText, maxPuzzleWordLength);

const hasExcessiveTotalLength = (puzzle: PuzzlePrivate): boolean =>
  exceedsPuzzleTotalLength(puzzle.targetText, maxPuzzleTotalLength);

export const validatePuzzle = (puzzle: PuzzlePrivate): {
  valid: boolean;
  reasons: string[];
} => {
  const reasons: string[] = [];

  if (!hasStarterClue(puzzle)) {
    reasons.push('No starter clue on board.');
  }
  if (hasCircularPadlock(puzzle)) {
    reasons.push('Padlock dependency loop detected.');
  }
  if (hasUnfairBlindTile(puzzle)) {
    reasons.push('Blind tile fairness check failed.');
  }
  if (hasOversizedWord(puzzle)) {
    reasons.push(`Word length exceeds ${maxPuzzleWordLength} characters.`);
  }
  if (hasExcessiveTotalLength(puzzle)) {
    reasons.push(`Total challenge length exceeds ${maxPuzzleTotalLength} characters.`);
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
};
