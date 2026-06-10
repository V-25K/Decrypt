export type PuzzleTileWordGroup<Tile extends { index: number; isLetter: boolean }> = {
  key: string;
  isWord: boolean;
  tiles: Tile[];
};

export const groupPuzzleTilesIntoWordRuns = <
  Tile extends { index: number; isLetter: boolean },
>(
  tiles: readonly Tile[]
): PuzzleTileWordGroup<Tile>[] => {
  const groups: PuzzleTileWordGroup<Tile>[] = [];
  let wordTiles: Tile[] = [];
  let wordStartIndex: number | null = null;

  const flushWord = () => {
    if (wordTiles.length === 0 || wordStartIndex === null) {
      return;
    }
    groups.push({
      key: `word-${wordStartIndex}`,
      isWord: true,
      tiles: wordTiles,
    });
    wordTiles = [];
    wordStartIndex = null;
  };

  for (const tile of tiles) {
    if (tile.isLetter) {
      if (wordStartIndex === null) {
        wordStartIndex = tile.index;
      }
      wordTiles.push(tile);
      continue;
    }

    flushWord();
    groups.push({
      key: `separator-${tile.index}`,
      isWord: false,
      tiles: [tile],
    });
  }

  flushWord();
  return groups;
};
