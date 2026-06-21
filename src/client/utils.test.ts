import { describe, expect, it } from 'vitest';
import {
  chunkPuzzleTokensByWordLimit,
  groupLineTokensBySpaces,
  tokenizePuzzleTiles,
} from './utils';

describe('tokenizePuzzleTiles', () => {
  it('keeps words as unbreakable tokens and emits punctuation/space separators', () => {
    const tiles = [
      { isLetter: true, displayChar: 'H' },
      { isLetter: true, displayChar: 'E' },
      { isLetter: true, displayChar: 'L' },
      { isLetter: true, displayChar: 'L' },
      { isLetter: true, displayChar: 'O' },
      { isLetter: false, displayChar: ',' },
      { isLetter: false, displayChar: ' ' },
      { isLetter: true, displayChar: 'W' },
      { isLetter: true, displayChar: 'O' },
      { isLetter: true, displayChar: 'R' },
      { isLetter: true, displayChar: 'L' },
      { isLetter: true, displayChar: 'D' },
      { isLetter: false, displayChar: '!' },
    ];

    const tokens = tokenizePuzzleTiles(tiles);
    expect(tokens.map((token) => token.type)).toEqual([
      'word',
      'separator',
      'separator',
      'word',
      'separator',
    ]);
    expect(
      tokens
        .filter((token) => token.type === 'word')
        .map((token) =>
          token.tiles.map((tile) => tile.displayChar).join('')
        )
    ).toEqual(['HELLO', 'WORLD']);
  });

  it('splits token rows by maximum word count without leading/trailing spaces', () => {
    const words = [
      'ONE',
      'TWO',
      'THREE',
      'FOUR',
      'FIVE',
      'SIX',
      'SEVEN',
      'EIGHT',
      'NINE',
      'TEN',
    ];
    const phrase = words.join(' ');
    const tiles = phrase.split('').map((char) => ({
      isLetter: /^[A-Z]$/.test(char),
      displayChar: char,
    }));

    const tokens = tokenizePuzzleTiles(tiles);
    const lines = chunkPuzzleTokensByWordLimit(tokens, 8);

    expect(lines.length).toBe(2);
    const wordCounts = lines.map(
      (line) => line.filter((token) => token.type === 'word').length
    );
    expect(wordCounts).toEqual([8, 2]);
    expect(lines[0]?.[0]?.type).toBe('word');
    expect(lines[1]?.[0]?.type).toBe('word');
  });
});

describe('groupLineTokensBySpaces', () => {
  it('keeps a word and its trailing punctuation in one non-space group', () => {
    const tiles = 'HELLO, WORLD!'.split('').map((char) => ({
      isLetter: /^[A-Z]$/.test(char),
      displayChar: char,
    }));
    const tokens = tokenizePuzzleTiles(tiles);

    const segments = groupLineTokensBySpaces(tokens);

    expect(segments.map((segment) => segment.kind)).toEqual([
      'group',
      'space',
      'group',
    ]);

    const groups = segments.filter((segment) => segment.kind === 'group');
    // "HELLO" + "," stay together; "WORLD" + "!" stay together.
    expect(groups[0]?.tokens.map((token) => token.type)).toEqual([
      'word',
      'separator',
    ]);
    expect(groups[1]?.tokens.map((token) => token.type)).toEqual([
      'word',
      'separator',
    ]);
  });

  it('emits each space as its own wrap point between groups', () => {
    const tiles = 'A B C'.split('').map((char) => ({
      isLetter: /^[A-Z]$/.test(char),
      displayChar: char,
    }));
    const tokens = tokenizePuzzleTiles(tiles);

    const segments = groupLineTokensBySpaces(tokens);

    expect(segments.map((segment) => segment.kind)).toEqual([
      'group',
      'space',
      'group',
      'space',
      'group',
    ]);
  });
});
