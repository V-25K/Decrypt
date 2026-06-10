import { describe, expect, it } from 'vitest';
import { groupPuzzleTilesIntoWordRuns } from './puzzle-tile-groups';

type TestTile = {
  index: number;
  isLetter: boolean;
  displayChar: string;
};

const tile = (index: number, displayChar: string, isLetter = true): TestTile => ({
  index,
  isLetter,
  displayChar,
});

describe('groupPuzzleTilesIntoWordRuns', () => {
  it('keeps contiguous letters together and separators separate', () => {
    const groups = groupPuzzleTilesIntoWordRuns([
      tile(0, 'H'),
      tile(1, 'I'),
      tile(2, ' ', false),
      tile(3, 'T'),
      tile(4, 'H'),
      tile(5, 'E'),
      tile(6, 'R'),
      tile(7, 'E'),
      tile(8, '!', false),
    ]);

    expect(groups.map((group) => group.tiles.map((entry) => entry.index))).toEqual([
      [0, 1],
      [2],
      [3, 4, 5, 6, 7],
      [8],
    ]);
    expect(groups.map((group) => group.isWord)).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });
});
