import { getPowerupPrice } from '../../shared/game-balance';
import type { PuzzleRenderToken } from '../utils';
import { countRemainingLetters } from './puzzle-view';
import {
  getPowerupValidityForPuzzle,
  type PowerupValidity,
} from './powerup-validity';
import type {
  BuyDialogState,
  PowerupType,
  Puzzle,
} from './types';

export type BuyQuantityChip = {
  disabled: boolean;
  id: string;
  label: string;
  quantity: number;
};

export type BuyDialogView = {
  buyMax: number;
  chips: BuyQuantityChip[];
  powerupValidity: PowerupValidity;
  remainingLetters: number;
  unitPrice: number;
};

export const getPowerupUnitPrice = (
  item: PowerupType,
  puzzle: Puzzle | null
): number => {
  const pricingContext = {
    remainingLetters: countRemainingLetters(puzzle),
    ...(puzzle ? { difficulty: puzzle.difficulty } : {}),
  };
  return getPowerupPrice(item, pricingContext);
};

export const getMaxPurchasableQuantity = ({
  coins,
  item,
  puzzle,
}: {
  coins: number | null;
  item: PowerupType;
  puzzle: Puzzle | null;
}): number => {
  if (coins === null) {
    return 0;
  }
  const unitPrice = getPowerupUnitPrice(item, puzzle);
  if (unitPrice <= 0) {
    return 0;
  }
  return Math.floor(coins / unitPrice);
};

export const getBuyQuantityChips = (maxQuantity: number): BuyQuantityChip[] => [
  { id: '1', label: '+1', quantity: 1, disabled: maxQuantity < 1 },
  { id: '3', label: '+3', quantity: 3, disabled: maxQuantity < 3 },
  { id: '5', label: '+5', quantity: 5, disabled: maxQuantity < 5 },
  { id: 'max', label: 'MAX', quantity: maxQuantity, disabled: maxQuantity < 1 },
];

export const getBuyDialogView = ({
  buyDialog,
  coins,
  isShieldActive,
  puzzle,
  tokens,
}: {
  buyDialog: BuyDialogState | null;
  coins: number | null;
  isShieldActive: boolean;
  puzzle: Puzzle | null;
  tokens: readonly PuzzleRenderToken<Puzzle['tiles'][number]>[];
}): BuyDialogView => {
  if (!buyDialog) {
    return {
      buyMax: 0,
      chips: getBuyQuantityChips(0),
      powerupValidity: { valid: true, reason: null },
      remainingLetters: countRemainingLetters(puzzle),
      unitPrice: 0,
    };
  }

  const buyMax = getMaxPurchasableQuantity({
    coins,
    item: buyDialog.item,
    puzzle,
  });

  return {
    buyMax,
    chips: getBuyQuantityChips(buyMax),
    powerupValidity: getPowerupValidityForPuzzle({
      isShieldActive,
      item: buyDialog.item,
      puzzle,
      tokens,
    }),
    remainingLetters: countRemainingLetters(puzzle),
    unitPrice: getPowerupUnitPrice(buyDialog.item, puzzle),
  };
};
