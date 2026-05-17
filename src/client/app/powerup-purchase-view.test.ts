import { describe, expect, it } from 'vitest';
import { tokenizePuzzleTiles } from '../utils';
import {
  getBuyDialogView,
  getBuyQuantityChips,
  getMaxPurchasableQuantity,
  getPowerupUnitPrice,
} from './powerup-purchase-view';
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

const puzzle = (overrides: Partial<Puzzle> = {}): Puzzle => ({
  author: 'author',
  challengeType: 'QUOTE',
  dateKey: '2026-05-17',
  difficulty: 5,
  heartsMax: 3,
  levelId: 'daily-1',
  targetTimeSeconds: 30,
  tiles: [tile(), tile({ index: 1 }), tile({ index: 2 })],
  words: ['ABC'],
  ...overrides,
});

describe('powerup purchase view helpers', () => {
  it('builds quantity chips from max purchasable quantity', () => {
    expect(getBuyQuantityChips(2)).toEqual([
      { id: '1', label: '+1', quantity: 1, disabled: false },
      { id: '3', label: '+3', quantity: 3, disabled: true },
      { id: '5', label: '+5', quantity: 5, disabled: true },
      { id: 'max', label: 'MAX', quantity: 2, disabled: false },
    ]);
  });

  it('calculates unit price and max quantity from coins', () => {
    const puzzleValue = puzzle();
    const unitPrice = getPowerupUnitPrice('hammer', puzzleValue);

    expect(unitPrice).toBeGreaterThan(0);
    expect(
      getMaxPurchasableQuantity({
        coins: unitPrice * 2 + unitPrice - 1,
        item: 'hammer',
        puzzle: puzzleValue,
      })
    ).toBe(2);
  });

  it('returns zero max quantity when profile coins are unavailable', () => {
    expect(
      getMaxPurchasableQuantity({
        coins: null,
        item: 'wand',
        puzzle: puzzle(),
      })
    ).toBe(0);
  });

  it('builds buy dialog render data for an active dialog', () => {
    const puzzleValue = puzzle();
    const tokens = tokenizePuzzleTiles(puzzleValue.tiles);
    const unitPrice = getPowerupUnitPrice('rocket', puzzleValue);
    const view = getBuyDialogView({
      buyDialog: { item: 'rocket', quantity: 1 },
      coins: unitPrice * 3,
      isShieldActive: false,
      puzzle: puzzleValue,
      tokens,
    });

    expect(view.buyMax).toBe(3);
    expect(view.unitPrice).toBe(unitPrice);
    expect(view.remainingLetters).toBe(3);
    expect(view.powerupValidity).toEqual({ valid: true, reason: null });
    expect(view.chips).toContainEqual({
      id: '3',
      label: '+3',
      quantity: 3,
      disabled: false,
    });
  });

  it('builds inert defaults when no buy dialog is open', () => {
    expect(
      getBuyDialogView({
        buyDialog: null,
        coins: 500,
        isShieldActive: false,
        puzzle: null,
        tokens: [],
      })
    ).toEqual({
      buyMax: 0,
      chips: getBuyQuantityChips(0),
      powerupValidity: { valid: true, reason: null },
      remainingLetters: 10,
      unitPrice: 0,
    });
  });
});
