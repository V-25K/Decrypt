import { coinEmoji, coinHeartRefillCost, coinHeartTopUpCost, heartEmoji } from '../app/constants';

type HeartPurchaseDialogProps = {
  coins: number;
  busy: boolean;
  limitReached: boolean;
  onRefill: () => void;
  onTopUp: () => void;
  onCancel: () => void;
};

export const HeartPurchaseDialog = ({
  coins,
  busy,
  limitReached,
  onRefill,
  onTopUp,
  onCancel,
}: HeartPurchaseDialogProps) => (
  <div
    data-testid="heart-purchase-dialog"
    className="absolute inset-0 z-30 flex items-center justify-center px-4"
    style={{ backgroundColor: 'var(--app-overlay)' }}
  >
    <div className="app-surface w-full max-w-[300px] rounded border app-border p-4">
      <div className="app-text mb-2 flex items-center justify-between text-sm font-bold">
        <span>Restore Hearts</span>
        <span className="text-xs font-black">
          {coinEmoji} {coins}
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          data-testid="heart-refill-button"
          className="btn-3d btn-neutral rounded border text-xs font-bold disabled:opacity-40"
          onClick={onRefill}
          disabled={busy || limitReached || coins < coinHeartRefillCost}
        >
          <span className="block">{coinEmoji} {coinHeartRefillCost}</span>
          <span className="block text-[9px] opacity-70">Full refill</span>
        </button>
        <button
          data-testid="heart-topup-button"
          className="btn-3d btn-neutral rounded border text-xs font-bold disabled:opacity-40"
          onClick={onTopUp}
          disabled={busy || limitReached || coins < coinHeartTopUpCost}
        >
          <span className="block">{coinEmoji} {coinHeartTopUpCost}</span>
          <span className="block text-[9px] opacity-70">+1 {heartEmoji}</span>
        </button>
      </div>
      {limitReached && (
        <div className="app-text-soft mb-2 text-center text-[11px]">
          Daily coin limit reached.
        </div>
      )}
      <button
        data-testid="heart-purchase-cancel"
        className="btn-3d btn-neutral w-full rounded border text-xs font-bold"
        onClick={onCancel}
        disabled={busy}
      >
        Cancel
      </button>
    </div>
  </div>
);
