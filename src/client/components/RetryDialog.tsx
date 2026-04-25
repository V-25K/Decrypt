import type { RetryDialogState } from '../app/types';
import { coinEmoji } from '../app/constants';

type RetryDialogProps = {
  retryDialog: RetryDialogState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export const RetryDialog = ({
  retryDialog,
  busy,
  onCancel,
  onConfirm,
}: RetryDialogProps) => (
  <div
    data-testid="retry-buy-dialog"
    className="absolute inset-0 z-30 flex items-center justify-center px-4"
    style={{ backgroundColor: 'var(--app-overlay)' }}
  >
    <div className="app-surface w-full max-w-[300px] rounded border app-border p-4">
      <div className="app-text mb-2 flex items-center justify-between text-sm font-bold">
        <span>Buy Retry</span>
        <span className="text-xs font-black">
          {coinEmoji} {retryDialog.coins}
        </span>
      </div>

      <div className="app-surface-strong app-text mb-2 rounded border app-border p-3 text-center text-lg font-black">
        {retryDialog.cost} {coinEmoji}
      </div>

      <div className="mb-3 space-y-2 text-center">
        <p className="app-text-soft text-xs">
          Difficulty: <span className="font-semibold">{retryDialog.difficultyLabel}</span>
        </p>
        <p className="app-text text-xs font-bold uppercase tracking-[0.03em]">
          This retry score: {retryDialog.penaltyLabel}
        </p>
        {retryDialog.nextPenaltyLabel && retryDialog.nextCost !== null ? (
          <p className="app-text-soft text-[11px] leading-snug">
            If you fail again, the next retry would be {retryDialog.nextCost} {coinEmoji} at{' '}
            {retryDialog.nextPenaltyLabel}.
          </p>
        ) : null}
        <div className="app-surface-subtle rounded border app-border p-2">
          <p className="app-text-soft text-[10px] leading-snug">
            Retry prices and score rules come from the live challenge state.
          </p>
        </div>
        {retryDialog.coins < retryDialog.cost ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.03em] text-white/70">
            Not enough coins
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          data-testid="retry-buy-cancel"
          className="btn-3d btn-neutral flex-1 rounded border text-xs font-bold"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          data-testid="retry-buy-confirm"
          className="btn-3d btn-primary flex-1 rounded border text-xs font-bold"
          onClick={onConfirm}
          disabled={busy || retryDialog.coins < retryDialog.cost}
        >
          Confirm
        </button>
      </div>
    </div>
  </div>
);
