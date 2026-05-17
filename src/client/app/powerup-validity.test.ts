import { describe, expect, it } from 'vitest';
import { tokenizePuzzleTiles } from '../utils';
import { getPowerupValidityForPuzzle } from './powerup-validity';
import type { Puzzle } from './types';

type TileOverride = Partial<Puzzle['tiles'][number]>;

const tile = (overrides: TileOverride = {}): Puzzle['tiles'][number] => ({
  cipherNumber: 1,
  displayChar: '_',
  index: 0,
  isBlind: false,
  isGold: false,
  isLetter: true,
  isLocked: false,
  ...overrides,
});

const puzzle = (tiles: Puzzle['tiles']): Puzzle => ({
  author: 'author',
  challengeType: 'QUOTE',
  dateKey: '2026-05-17',
  difficulty: 5,
  heartsMax: 3,
  levelId: 'daily-1',
  targetTimeSeconds: 30,
  tiles,
  words: ['ABC'],
});

const validity = ({
  isShieldActive = false,
  item,
  puzzleValue,
}: {
  isShieldActive?: boolean;
  item: Parameters<typeof getPowerupValidityForPuzzle>[0]['item'];
  puzzleValue: Puzzle | null;
}) =>
  getPowerupValidityForPuzzle({
    isShieldActive,
    item,
    puzzle: puzzleValue,
    tokens: puzzleValue ? tokenizePuzzleTiles(puzzleValue.tiles) : [],
  });

describe('getPowerupValidityForPuzzle', () => {
  it('rejects every powerup when level data is unavailable', () => {
    expect(validity({ item: 'hammer', puzzleValue: null })).toEqual({
      valid: false,
      reason: 'Level data is unavailable.',
    });
  });

  it('allows hammer when there is an unrevealed unlocked tile', () => {
    expect(validity({ item: 'hammer', puzzleValue: puzzle([tile()]) })).toEqual({
      valid: true,
      reason: null,
    });
  });

  it('rejects hammer when no unlocked hidden letters remain', () => {
    expect(
      validity({
        item: 'hammer',
        puzzleValue: puzzle([
          tile({ displayChar: 'A' }),
          tile({ index: 1, isLocked: true }),
        ]),
      })
    ).toEqual({
      valid: false,
      reason: 'No unlocked tiles left to reveal.',
    });
  });

  it('rejects wand when incomplete words are locked or blind only', () => {
    expect(
      validity({
        item: 'wand',
        puzzleValue: puzzle([
          tile({ isBlind: true }),
          tile({ index: 1, isLocked: true }),
        ]),
      })
    ).toEqual({
      valid: false,
      reason: 'No unlocked words available.',
    });
  });

  it('requires at least three unrevealed unlocked tiles for rocket', () => {
    expect(
      validity({
        item: 'rocket',
        puzzleValue: puzzle([tile(), tile({ index: 1 })]),
      })
    ).toEqual({
      valid: false,
      reason: 'Not enough unlocked tiles for Rocket.',
    });
    expect(
      validity({
        item: 'rocket',
        puzzleValue: puzzle([tile(), tile({ index: 1 }), tile({ index: 2 })]),
      })
    ).toEqual({ valid: true, reason: null });
  });

  it('rejects shield when shield is already active', () => {
    expect(
      validity({
        isShieldActive: true,
        item: 'shield',
        puzzleValue: puzzle([tile()]),
      })
    ).toEqual({
      valid: false,
      reason: 'Shield is already active.',
    });
  });
});
