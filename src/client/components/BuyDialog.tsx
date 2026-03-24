import { coinEmoji, powerupCost, powerupLabel } from '../app/constants';
import type { BuyDialogState } from '../app/types';
import { cn } from '../utils';

type BuyDialogProps = {
  buyDialog: BuyDialogState;
  buyMax: number;
  busy: boolean;
  buyChips: (maxQuantity: number) => Array<{
    id: string;
    label: string;
    quantity: number;
    disabled: boolean;
  }>;
  onSelectQuantity: (quantity: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export const BuyDialog = ({
  buyDialog,
  buyMax,
  busy,
  buyChips,
  onSelectQuantity,
  onCancel,
  onConfirm,
}: BuyDialogProps) => (
  <div
    data-testid="powerup-buy-dialog"
    className="absolute inset-0 z-30 flex items-center justify-center px-4"
    style={{ backgroundColor: 'var(--app-overlay)' }}
  >
    <div className="app-surface w-full max-w-[280px] rounded border app-border p-4">
      <div className="app-text mb-2 text-sm font-bold">
        Buy {powerupLabel[buyDialog.item]} ({powerupCost[buyDialog.item]} {coinEmoji} each)
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        {buyChips(buyMax).map((chip) => (
          <button
            key={chip.id}
            data-testid={`buy-quantity-${chip.id}`}
            disabled={chip.disabled || busy}
            onClick={() => onSelectQuantity(chip.quantity)}
            className={cn(
              'btn-3d rounded border text-xs font-bold disabled:opacity-40',
              buyDialog.quantity === chip.quantity ? 'btn-secondary' : 'btn-neutral'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="app-surface-strong app-text mb-3 rounded border app-border p-2 text-center text-sm font-bold">
        Total: {buyDialog.quantity * powerupCost[buyDialog.item]} {coinEmoji}
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
          disabled={busy || buyMax < 1}
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
);
