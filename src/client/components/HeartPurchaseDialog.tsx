import { coinHeartRefillCost, coinHeartTopUpCost } from '../app/constants';
import { HudSprite } from './HudSprite';

type HeartPurchaseDialogProps = {
  coins: number;
  busy: boolean;
  limitReached: boolean;
  purchasesToday: number;
  maxPurchasesPerDay: number;
  limitResetTs: number;
  onRefill: () => void;
  onTopUp: () => void;
  onCancel: () => void;
};

const formatTimeUntil = (targetTs: number): string => {
  const totalMinutes = Math.max(0, Math.ceil((targetTs - Date.now()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const HeartPurchaseDialog = ({
  coins,
  busy,
  limitReached,
  purchasesToday,
  maxPurchasesPerDay,
  limitResetTs,
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
        <span className="inline-flex items-center gap-1 text-xs font-black">
          <HudSprite icon="coin" decorative className="h-4 w-4" />
          <span>{coins}</span>
        </span>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button
          data-testid="heart-refill-button"
          className="btn-3d btn-neutral rounded border text-xs font-bold disabled:opacity-40"
          onClick={onRefill}
          disabled={busy || limitReached || coins < coinHeartRefillCost}
        >
          <span className="flex items-center justify-center gap-1">
            <HudSprite icon="coin" decorative className="h-4 w-4" />
            <span>{coinHeartRefillCost}</span>
          </span>
          <span className="block text-[9px] opacity-70">Full refill</span>
        </button>
        <button
          data-testid="heart-topup-button"
          className="btn-3d btn-neutral rounded border text-xs font-bold disabled:opacity-40"
          onClick={onTopUp}
          disabled={busy || limitReached || coins < coinHeartTopUpCost}
        >
          <span className="flex items-center justify-center gap-1">
            <HudSprite icon="coin" decorative className="h-4 w-4" />
            <span>{coinHeartTopUpCost}</span>
          </span>
          <span className="flex items-center justify-center gap-1 text-[9px] opacity-70">
            <span>+1</span>
            <HudSprite icon="heart" decorative className="h-3.5 w-3.5" />
          </span>
        </button>
      </div>
      {limitReached && (
        <div className="app-text-soft mb-2 text-center text-[11px]">
          <p>
            Daily coin limit reached ({purchasesToday}/{maxPurchasesPerDay}).
          </p>
          <p className="mt-1">Resets in {formatTimeUntil(limitResetTs)}</p>
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
