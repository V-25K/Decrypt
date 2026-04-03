import type { PuzzlePrivate, PuzzleTile } from '../../shared/game.ts';

const englishFrequencyOrder = 'ETAOINSHRDLCUMWFGYPBVKJXQZ'.split('');
const suffixHints = ['ING', 'TION'] as const;
const maxBranchExpansions = 2000;
const maxSolverMs = 40;

type SolverResult = {
  solvable: boolean;
  solvedRatio: number;
  blindGuessRequired: boolean;
};

type CipherTile = {
  index: number;
  wordIndex: number;
  cipherNumber: number;
};

type Assignment = {
  cipherNumber: number;
  letter: string;
};

type SolverState = {
  knownLetters: Array<string | null>;
  letterToCipher: Map<string, number>;
  solvedIndices: Set<number>;
};

type SolverContext = {
  startedAtMs: number;
  branchExpansions: number;
  budgetExceeded: boolean;
  bestRatio: number;
};

const countKnown = (knownLetters: Array<string | null>): number =>
  knownLetters.filter((letter) => letter !== null).length;

const solveRatio = (solvedIndices: Set<number>, totalLetters: number): number =>
  totalLetters === 0 ? 0 : solvedIndices.size / totalLetters;

const buildCipherTiles = (
  puzzle: PuzzlePrivate,
  forbiddenIndices: Set<number>
): CipherTile[] =>
  puzzle.tiles
    .filter((tile): tile is PuzzleTile => tile.isLetter && !forbiddenIndices.has(tile.index))
    .map((tile) => {
      const cipherNumber = puzzle.mapping[tile.char];
      if (!cipherNumber) {
        return null;
      }
      return {
        index: tile.index,
        wordIndex: tile.wordIndex,
        cipherNumber,
      };
    })
    .filter((tile): tile is CipherTile => tile !== null);

const groupWordTiles = (cipherTiles: CipherTile[]): CipherTile[][] => {
  const byWord = new Map<number, CipherTile[]>();
  for (const tile of cipherTiles) {
    const existing = byWord.get(tile.wordIndex) ?? [];
    existing.push(tile);
    byWord.set(tile.wordIndex, existing);
  }
  return [...byWord.entries()]
    .sort((a, b) => a[0] - b[0])
    .map((entry) => entry[1].sort((a, b) => a.index - b.index));
};

const cloneState = (state: SolverState): SolverState => ({
  knownLetters: [...state.knownLetters],
  letterToCipher: new Map(state.letterToCipher),
  solvedIndices: new Set(state.solvedIndices),
});

const isWithinBudget = (context: SolverContext): boolean => {
  if (context.budgetExceeded) {
    return false;
  }
  const elapsed = Date.now() - context.startedAtMs;
  if (elapsed > maxSolverMs || context.branchExpansions >= maxBranchExpansions) {
    context.budgetExceeded = true;
    return false;
  }
  return true;
};

const isAssignmentCompatible = (
  state: SolverState,
  cipherNumber: number,
  letter: string
): boolean => {
  const existingLetter = state.knownLetters[cipherNumber] ?? null;
  if (existingLetter !== null && existingLetter !== letter) {
    return false;
  }
  const existingCipher = state.letterToCipher.get(letter);
  if (existingCipher !== undefined && existingCipher !== cipherNumber) {
    return false;
  }
  return true;
};

const assignCipherLetter = (
  state: SolverState,
  cipherNumber: number,
  letter: string
): 'assigned' | 'unchanged' | 'conflict' => {
  if (!isAssignmentCompatible(state, cipherNumber, letter)) {
    return 'conflict';
  }
  const existingLetter = state.knownLetters[cipherNumber] ?? null;
  if (existingLetter === letter) {
    return 'unchanged';
  }
  state.knownLetters[cipherNumber] = letter;
  state.letterToCipher.set(letter, cipherNumber);
  return 'assigned';
};

const applyAssignments = (state: SolverState, assignments: Assignment[]): boolean => {
  for (const assignment of assignments) {
    const outcome = assignCipherLetter(
      state,
      assignment.cipherNumber,
      assignment.letter
    );
    if (outcome === 'conflict') {
      return false;
    }
  }
  return true;
};

const propagateSolvedTiles = (state: SolverState, cipherTiles: CipherTile[]): boolean => {
  let changed = false;
  for (const tile of cipherTiles) {
    if (state.knownLetters[tile.cipherNumber] !== null && !state.solvedIndices.has(tile.index)) {
      state.solvedIndices.add(tile.index);
      changed = true;
    }
  }
  return changed;
};

const deterministicOneLetterPass = (
  state: SolverState,
  wordTiles: CipherTile[][]
): 'changed' | 'unchanged' | 'conflict' => {
  let changed = false;
  for (const word of wordTiles) {
    if (word.length !== 1) {
      continue;
    }
    const tile = word[0];
    if (!tile) {
      continue;
    }
    if (state.knownLetters[tile.cipherNumber] !== null) {
      continue;
    }
    const options = ['A', 'I'].filter((letter) =>
      isAssignmentCompatible(state, tile.cipherNumber, letter)
    );
    if (options.length === 0) {
      return 'conflict';
    }
    if (options.length === 1) {
      const onlyOption = options[0];
      if (!onlyOption) {
        return 'conflict';
      }
      const outcome = assignCipherLetter(state, tile.cipherNumber, onlyOption);
      if (outcome === 'conflict') {
        return 'conflict';
      }
      if (outcome === 'assigned') {
        changed = true;
      }
    }
  }
  return changed ? 'changed' : 'unchanged';
};

const propagateDeterministic = (
  state: SolverState,
  cipherTiles: CipherTile[],
  wordTiles: CipherTile[][],
  context: SolverContext
): boolean => {
  for (let pass = 0; pass < 64; pass += 1) {
    if (!isWithinBudget(context)) {
      return false;
    }
    let changed = false;
    if (propagateSolvedTiles(state, cipherTiles)) {
      changed = true;
    }
    const oneLetterOutcome = deterministicOneLetterPass(state, wordTiles);
    if (oneLetterOutcome === 'conflict') {
      return false;
    }
    if (oneLetterOutcome === 'changed') {
      changed = true;
    }
    if (!changed) {
      return true;
    }
  }
  return true;
};

const branchFromOneLetterWords = (
  state: SolverState,
  wordTiles: CipherTile[][]
): Assignment[][] => {
  const candidates = new Set<number>();
  for (const word of wordTiles) {
    if (word.length !== 1) {
      continue;
    }
    const tile = word[0];
    if (!tile) {
      continue;
    }
    if (state.knownLetters[tile.cipherNumber] === null) {
      candidates.add(tile.cipherNumber);
    }
  }
  const targetCipher = [...candidates].sort((a, b) => a - b)[0];
  if (targetCipher === undefined) {
    return [];
  }
  const options = ['A', 'I'].filter((letter) =>
    isAssignmentCompatible(state, targetCipher, letter)
  );
  return options.map((letter) => [{ cipherNumber: targetCipher, letter }]);
};

const suffixAssignmentsForWord = (
  state: SolverState,
  word: CipherTile[],
  suffix: string
): Assignment[] | null => {
  if (word.length < suffix.length) {
    return null;
  }
  const suffixTiles = word.slice(word.length - suffix.length);
  const suffixChars = suffix.split('');
  const localCipherToLetter = new Map<number, string>();
  const localLetterToCipher = new Map<string, number>();

  for (let i = 0; i < suffixTiles.length; i += 1) {
    const tile = suffixTiles[i];
    const letter = suffixChars[i];
    if (!tile || !letter) {
      return null;
    }
    const knownLetter = state.knownLetters[tile.cipherNumber] ?? null;
    if (knownLetter !== null && knownLetter !== letter) {
      return null;
    }
    const knownCipher = state.letterToCipher.get(letter);
    if (knownCipher !== undefined && knownCipher !== tile.cipherNumber) {
      return null;
    }
    const localExistingLetter = localCipherToLetter.get(tile.cipherNumber);
    if (localExistingLetter !== undefined && localExistingLetter !== letter) {
      return null;
    }
    const localExistingCipher = localLetterToCipher.get(letter);
    if (localExistingCipher !== undefined && localExistingCipher !== tile.cipherNumber) {
      return null;
    }
    localCipherToLetter.set(tile.cipherNumber, letter);
    localLetterToCipher.set(letter, tile.cipherNumber);
  }

  const assignments = [...localCipherToLetter.entries()]
    .filter(([cipherNumber]) => state.knownLetters[cipherNumber] === null)
    .map(([cipherNumber, letter]) => ({ cipherNumber, letter }));
  return assignments.length > 0 ? assignments : null;
};

const branchFromSuffixHints = (
  state: SolverState,
  wordTiles: CipherTile[][]
): Assignment[][] => {
  for (const suffix of suffixHints) {
    const candidates = wordTiles
      .map((word) => suffixAssignmentsForWord(state, word, suffix))
      .filter((assignments): assignments is Assignment[] => assignments !== null)
      .slice(0, 8);
    if (candidates.length === 0) {
      continue;
    }
    const deduped = new Map<string, Assignment[]>();
    for (const candidate of candidates) {
      const signature = candidate
        .map((entry) => `${entry.cipherNumber}:${entry.letter}`)
        .sort()
        .join('|');
      if (!deduped.has(signature)) {
        deduped.set(signature, candidate);
      }
    }
    return [...deduped.values()];
  }
  return [];
};

const branchFromFrequency = (
  state: SolverState,
  cipherTiles: CipherTile[]
): Assignment[][] => {
  const unresolvedCounts = new Map<number, number>();
  for (const tile of cipherTiles) {
    if (state.knownLetters[tile.cipherNumber] !== null) {
      continue;
    }
    unresolvedCounts.set(
      tile.cipherNumber,
      (unresolvedCounts.get(tile.cipherNumber) ?? 0) + 1
    );
  }
  const ranked = [...unresolvedCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0] - b[0]
  );
  const top = ranked[0];
  if (!top) {
    return [];
  }
  const secondCount = ranked[1]?.[1] ?? 0;
  if (top[1] - secondCount < 2) {
    return [];
  }
  const topCipher = top[0];
  if (topCipher === undefined) {
    return [];
  }

  const usedLetters = new Set(state.letterToCipher.keys());
  return englishFrequencyOrder
    .filter((letter) => !usedLetters.has(letter))
    .slice(0, 4)
    .filter((letter) => isAssignmentCompatible(state, topCipher, letter))
    .map((letter) => [{ cipherNumber: topCipher, letter }]);
};

const chooseBranchCandidates = (
  state: SolverState,
  cipherTiles: CipherTile[],
  wordTiles: CipherTile[][]
): Assignment[][] => {
  const oneLetterBranches = branchFromOneLetterWords(state, wordTiles);
  if (oneLetterBranches.length > 0) {
    return oneLetterBranches;
  }
  const suffixBranches = branchFromSuffixHints(state, wordTiles);
  if (suffixBranches.length > 0) {
    return suffixBranches;
  }
  return branchFromFrequency(state, cipherTiles);
};

const searchSolve = (params: {
  state: SolverState;
  cipherTiles: CipherTile[];
  wordTiles: CipherTile[][];
  totalLetters: number;
  context: SolverContext;
}): SolverState | null => {
  if (!isWithinBudget(params.context)) {
    return null;
  }
  const propagated = propagateDeterministic(
    params.state,
    params.cipherTiles,
    params.wordTiles,
    params.context
  );
  if (!propagated) {
    return null;
  }

  const ratio = solveRatio(params.state.solvedIndices, params.totalLetters);
  params.context.bestRatio = Math.max(params.context.bestRatio, ratio);
  if (ratio >= 0.8) {
    return params.state;
  }

  const branchCandidates = chooseBranchCandidates(
    params.state,
    params.cipherTiles,
    params.wordTiles
  );
  if (branchCandidates.length === 0) {
    return null;
  }

  for (const branch of branchCandidates) {
    if (!isWithinBudget(params.context)) {
      return null;
    }
    params.context.branchExpansions += 1;
    if (!isWithinBudget(params.context)) {
      return null;
    }
    const nextState = cloneState(params.state);
    if (!applyAssignments(nextState, branch)) {
      continue;
    }
    const solved = searchSolve({
      ...params,
      state: nextState,
    });
    if (solved) {
      return solved;
    }
  }
  return null;
};

export const runDummySolver = (params: {
  puzzle: PuzzlePrivate;
  revealedIndices: number[];
  forbiddenIndices?: number[];
}): SolverResult => {
  const forbiddenSet = new Set(params.forbiddenIndices ?? []);
  const cipherTiles = buildCipherTiles(params.puzzle, forbiddenSet);
  const wordTiles = groupWordTiles(cipherTiles);
  const totalLetters = cipherTiles.length;
  const state: SolverState = {
    knownLetters: Array.from({ length: 27 }, () => null),
    letterToCipher: new Map<string, number>(),
    solvedIndices: new Set<number>(),
  };

  for (const revealedIndex of params.revealedIndices) {
    if (forbiddenSet.has(revealedIndex)) {
      continue;
    }
    const tile = params.puzzle.tiles[revealedIndex];
    if (!tile || !tile.isLetter) {
      continue;
    }
    const cipherNumber = params.puzzle.mapping[tile.char];
    if (!cipherNumber) {
      continue;
    }
    const assigned = assignCipherLetter(state, cipherNumber, tile.char);
    if (assigned === 'conflict') {
      return {
        solvable: false,
        solvedRatio: solveRatio(state.solvedIndices, totalLetters),
        blindGuessRequired: true,
      };
    }
    state.solvedIndices.add(revealedIndex);
  }

  if (countKnown(state.knownLetters) === 0) {
    return {
      solvable: false,
      solvedRatio: 0,
      blindGuessRequired: true,
    };
  }

  const context: SolverContext = {
    startedAtMs: Date.now(),
    branchExpansions: 0,
    budgetExceeded: false,
    bestRatio: solveRatio(state.solvedIndices, totalLetters),
  };
  const solved = searchSolve({
    state,
    cipherTiles,
    wordTiles,
    totalLetters,
    context,
  });

  if (solved && !context.budgetExceeded) {
    const ratio = solveRatio(solved.solvedIndices, totalLetters);
    return {
      solvable: ratio >= 0.8,
      solvedRatio: ratio,
      blindGuessRequired: ratio < 0.8,
    };
  }

  return {
    solvable: false,
    solvedRatio: context.bestRatio,
    blindGuessRequired: true,
  };
};
