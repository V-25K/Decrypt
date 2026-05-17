import { powerupLabel } from '../app/constants';
import { HudSprite } from './HudSprite';
import type { BuyDialogState, PowerupType } from '../app/types';
import type { BuyQuantityChip } from '../app/powerup-purchase-view';
import { cn } from '../utils';

type BuyDialogProps = {
  buyDialog: BuyDialogState;
  buyMax: number;
  chips: BuyQuantityChip[];
  busy: boolean;
  unitPrice: number;
  remainingLetters: number;
  difficultyLabel: string;
  powerupValidity: {
    valid: boolean;
    reason: string | null;
  };
  onSelectQuantity: (quantity: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const powerupDescription = (powerupType: PowerupType): string => {
  switch (powerupType) {
    case 'hammer':
      return 'Reveals one chosen tile.';
    case 'wand':
      return 'Completes the chosen unlocked word.';
    case 'shield':
      return 'Blocks one mistake.';
    case 'rocket':
      return 'Reveals multiple unlocked letters.';
  }
};

export const BuyDialog = ({
  buyDialog,
  buyMax,
  chips,
  busy,
  unitPrice,
  remainingLetters,
  difficultyLabel,
  powerupValidity,
  onSelectQuantity,
  onCancel,
  onConfirm,
}: BuyDialogProps) => (
  <div
    data-testid="powerup-buy-dialog"
    className="absolute inset-0 z-30 flex items-center justify-center px-4"
    style={{ backgroundColor: 'var(--app-overlay)' }}
  >
    <div className="app-surface w-full max-w-[300px] rounded border app-border p-4">
      <div className="app-text mb-2 text-sm font-bold">
        <span>Buy {powerupLabel[buyDialog.item]}</span>{' '}
        <span className="inline-flex items-center gap-1 text-xs align-middle">
          <span>({unitPrice}</span>
          <HudSprite icon="coin" decorative className="h-4 w-4" />
          <span>each)</span>
        </span>
      </div>

      <div className="app-surface-subtle mb-3 rounded border app-border p-3">
        <p className="app-text text-xs font-semibold">
          {powerupDescription(buyDialog.item)}
        </p>
        <p className="app-text-soft mt-2 text-[11px] leading-snug">
          Challenge difficulty: {difficultyLabel}
        </p>
        <p className="app-text-soft text-[11px] leading-snug">
          Letters still hidden: {remainingLetters}
        </p>
        {!powerupValidity.valid && powerupValidity.reason && (
          <p className="mt-2 text-[11px] font-semibold text-yellow-600">
            {powerupValidity.reason}
          </p>
        )}
      </div>

      <div className="mb-2 grid grid-cols-2 gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            data-testid={`buy-quantity-${chip.id}`}
            aria-label={`Buy ${chip.quantity} ${powerupLabel[buyDialog.item]}`}
            disabled={chip.disabled || busy}
            onClick={() => onSelectQuantity(chip.quantity)}
            className={cn(
              'btn-3d rounded border text-xs font-bold disabled:opacity-40',
              buyDialog.quantity === chip.quantity ? 'btn-secondary btn-pressed' : 'btn-neutral'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="app-surface-strong app-text mb-3 rounded border app-border p-2 text-center text-sm font-bold">
        <span className="inline-flex items-center gap-1.5">
          <span>Total: {buyDialog.quantity * unitPrice}</span>
          <HudSprite icon="coin" decorative className="h-4 w-4" />
        </span>
      </div>
      <div className="flex gap-2">
        <button
          data-testid="buy-cancel"
          className="btn-3d btn-neutral flex-1 rounded border text-xs font-bold"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          data-testid="buy-confirm"
          className="btn-3d btn-primary flex-1 rounded border text-xs font-bold disabled:opacity-50"
          onClick={onConfirm}
          disabled={busy || buyMax < 1 || !powerupValidity.valid}
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
);
