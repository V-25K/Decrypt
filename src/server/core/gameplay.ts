import type { PuzzlePrivate, SessionState } from '../../shared/game';

export type RevealedTile = {
  index: number;
  letter: string;
};

export type RevealPayload = {
  revealedTiles: RevealedTile[];
  revealedIndices: number[];
  revealedLetter: string | null;
};

const emptyRevealPayload = (): RevealPayload => ({
  revealedTiles: [],
  revealedIndices: [],
  revealedLetter: null,
});

const withLegacyRevealFields = (revealedTiles: RevealedTile[]): RevealPayload => {
  const revealedIndices = revealedTiles.map((tile) => tile.index);
  if (revealedTiles.length === 0) {
    return emptyRevealPayload();
  }
  const firstLetter = revealedTiles[0]?.letter ?? null;
  const revealedLetter =
    firstLetter !== null && revealedTiles.every((tile) => tile.letter === firstLetter)
      ? firstLetter
      : null;
  return {
    revealedTiles,
    revealedIndices,
    revealedLetter,
  };
};

const allLetterIndicesForWord = (puzzle: PuzzlePrivate, wordIndex: number): number[] =>
  puzzle.tiles
    .filter((tile) => tile.wordIndex === wordIndex && tile.isLetter)
    .map((tile) => tile.index);

const unresolvedLetterIndicesForWord = (
  puzzle: PuzzlePrivate,
  wordIndex: number,
  revealed: Set<number>
): number[] =>
  allLetterIndicesForWord(puzzle, wordIndex).filter((index) => !revealed.has(index));

export const checkPadlockStatus = (
  puzzle: PuzzlePrivate,
  revealed: Set<number>
): {
  lockedIndices: number[];
  lockedIndexSet: Set<number>;
  unlockedChainIds: number[];
  unlockedChainIdSet: Set<number>;
} => {
  const lockedIndexSet = new Set<number>();
  const unlockedChainIds: number[] = [];
  const unlockedChainIdSet = new Set<number>();

  for (const chain of puzzle.padlockChains) {
    const keySolved = chain.keyIndices.every((index) => revealed.has(index));
    if (keySolved) {
      unlockedChainIdSet.add(chain.chainId);
      unlockedChainIds.push(chain.chainId);
      continue;
    }
    for (const index of chain.lockedIndices) {
      lockedIndexSet.add(index);
    }
  }

  return {
    lockedIndices: Array.from(lockedIndexSet).sort((a, b) => a - b),
    lockedIndexSet,
    unlockedChainIds: unlockedChainIds.sort((a, b) => a - b),
    unlockedChainIdSet,
  };
};

export const getUnlockedWordIndices = (
  puzzle: PuzzlePrivate,
  revealed: Set<number>
): Set<number> => {
  const unlocked = new Set<number>();
  const lockStatus = checkPadlockStatus(puzzle, revealed);

  for (let i = 0; i < puzzle.words.length; i += 1) {
    const wordIndices = allLetterIndicesForWord(puzzle, i);
    const isLocked = wordIndices.some((index) => lockStatus.lockedIndexSet.has(index));
    if (!isLocked) {
      unlocked.add(i);
    }
  }

  return unlocked;
};

export const tileIsLocked = (
  puzzle: PuzzlePrivate,
  tileIndex: number,
  revealed: Set<number>
): boolean => {
  const tile = puzzle.tiles[tileIndex];
  if (!tile || !tile.isLetter) {
    return false;
  }

  const lockStatus = checkPadlockStatus(puzzle, revealed);
  return lockStatus.lockedIndexSet.has(tileIndex);
};

export const revealFromGuess = (params: {
  puzzle: PuzzlePrivate;
  session: SessionState;
  tileIndex: number;
  guessedLetter: string;
}): {
  isCorrect: boolean;
  revealedTiles: RevealedTile[];
  revealedIndices: number[];
  revealedLetter: string | null;
} => {
  const tile = params.puzzle.tiles[params.tileIndex];
  if (!tile || !tile.isLetter) {
    return { isCorrect: false, ...emptyRevealPayload() };
  }

  const revealed = new Set(params.session.revealedIndices);
  if (revealed.has(params.tileIndex)) {
    return { isCorrect: false, ...emptyRevealPayload() };
  }
  if (tileIsLocked(params.puzzle, params.tileIndex, revealed)) {
    return { isCorrect: false, ...emptyRevealPayload() };
  }

  const correctLetter = tile.char;
  if (correctLetter !== params.guessedLetter) {
    return { isCorrect: false, ...emptyRevealPayload() };
  }

  const blindSet = new Set(params.puzzle.blindIndices);
  if (blindSet.has(params.tileIndex)) {
    return {
      isCorrect: true,
      ...withLegacyRevealFields([{ index: params.tileIndex, letter: correctLetter }]),
    };
  }

  const revealedTiles: RevealedTile[] = [];
  for (const candidate of params.puzzle.tiles) {
    if (!candidate.isLetter) {
      continue;
    }
    if (candidate.char !== correctLetter) {
      continue;
    }
    if (revealed.has(candidate.index)) {
      continue;
    }
    if (tileIsLocked(params.puzzle, candidate.index, revealed)) {
      continue;
    }
    if (blindSet.has(candidate.index)) {
      continue;
    }
    revealedTiles.push({ index: candidate.index, letter: candidate.char });
    revealed.add(candidate.index);
  }

  return {
    isCorrect: true,
    ...withLegacyRevealFields(revealedTiles),
  };
};

export const puzzleIsComplete = (
  puzzle: PuzzlePrivate,
  session: SessionState
): boolean => {
  const revealed = new Set(session.revealedIndices);
  for (const tile of puzzle.tiles) {
    if (tile.isLetter && !revealed.has(tile.index)) {
      return false;
    }
  }
  return true;
};

export const applyHammer = (
  puzzle: PuzzlePrivate,
  session: SessionState,
  targetIndex: number
): RevealPayload => {
  const tile = puzzle.tiles[targetIndex];
  if (!tile || !tile.isLetter) {
    return emptyRevealPayload();
  }
  const revealedSet = new Set(session.revealedIndices);
  if (revealedSet.has(targetIndex)) {
    return emptyRevealPayload();
  }
  if (tileIsLocked(puzzle, targetIndex, revealedSet)) {
    return emptyRevealPayload();
  }
  return revealFromGuess({
    puzzle,
    session,
    tileIndex: targetIndex,
    guessedLetter: tile.char,
  });
};

export const applyWand = (
  puzzle: PuzzlePrivate,
  session: SessionState,
  targetIndex?: number | null
): RevealPayload => {
  const revealedSet = new Set(session.revealedIndices);
  const unlockedWords = getUnlockedWordIndices(puzzle, revealedSet);

  let chosenWord = -1;
  let chosenMissing = -1;
  let chosenLength = -1;

  if (typeof targetIndex === 'number') {
    const targetTile = puzzle.tiles[targetIndex];
    if (!targetTile || !targetTile.isLetter) {
      return emptyRevealPayload();
    }
    if (!unlockedWords.has(targetTile.wordIndex)) {
      return emptyRevealPayload();
    }
    const missing = unresolvedLetterIndicesForWord(
      puzzle,
      targetTile.wordIndex,
      revealedSet
    ).length;
    if (missing <= 0) {
      return emptyRevealPayload();
    }
    chosenWord = targetTile.wordIndex;
  } else {
    for (let i = 0; i < puzzle.words.length; i += 1) {
      if (!unlockedWords.has(i)) {
        continue;
      }
      const indices = allLetterIndicesForWord(puzzle, i);
      const missing = unresolvedLetterIndicesForWord(puzzle, i, revealedSet).length;
      const wordLength = indices.length;
      if (
        missing > chosenMissing ||
        (missing === chosenMissing && wordLength > chosenLength)
      ) {
        chosenMissing = missing;
        chosenWord = i;
        chosenLength = wordLength;
      }
    }
  }

  if (chosenWord < 0) {
    return emptyRevealPayload();
  }

  const revealedIndices = unresolvedLetterIndicesForWord(puzzle, chosenWord, revealedSet);
  if (revealedIndices.length === 0) {
    return emptyRevealPayload();
  }

  const revealedTiles = revealedIndices
    .map((index) => puzzle.tiles[index])
    .filter((tile): tile is (typeof puzzle.tiles)[number] => Boolean(tile && tile.isLetter))
    .map((tile) => ({ index: tile.index, letter: tile.char }));
  return withLegacyRevealFields(revealedTiles);
};

export const applyRocket = (
  puzzle: PuzzlePrivate,
  session: SessionState
): RevealPayload => {
  const revealedSet = new Set(session.revealedIndices);
  const unresolvedUnlockedIndices = puzzle.tiles
    .filter(
      (tile) =>
        tile.isLetter &&
        !revealedSet.has(tile.index) &&
        !tileIsLocked(puzzle, tile.index, revealedSet)
    )
    .map((tile) => tile.index);

  if (unresolvedUnlockedIndices.length === 0) {
    return emptyRevealPayload();
  }

  const candidateIndices = [...unresolvedUnlockedIndices];
  const targetCount = Math.min(4, candidateIndices.length);
  const selectedTargetIndices: number[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    const pick = Math.floor(Math.random() * candidateIndices.length);
    const selected = candidateIndices.splice(pick, 1)[0];
    if (selected !== undefined) {
      selectedTargetIndices.push(selected);
    }
  }

  const selectedLetters = new Set(
    selectedTargetIndices
      .map((index) => puzzle.tiles[index])
      .filter((tile): tile is (typeof puzzle.tiles)[number] => Boolean(tile && tile.isLetter))
      .map((tile) => tile.char)
  );
  const revealedIndices = Array.from(
    new Set(
      puzzle.tiles
        .filter(
          (tile) =>
            tile.isLetter &&
            selectedLetters.has(tile.char) &&
            !revealedSet.has(tile.index) &&
            !tileIsLocked(puzzle, tile.index, revealedSet)
        )
        .map((tile) => tile.index)
    )
  );

  const revealedTiles = revealedIndices
    .map((index) => puzzle.tiles[index])
    .filter((tile): tile is (typeof puzzle.tiles)[number] => Boolean(tile && tile.isLetter))
    .map((tile) => ({ index: tile.index, letter: tile.char }));
  return withLegacyRevealFields(revealedTiles);
};
