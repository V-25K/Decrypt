import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { coinHeartRefillCost, coinHeartTopUpCost } from '../app/constants';
import { formatCountdown } from '../app/game-formatters';
import { getHeartState } from '../app/heart-state';
import { cn } from '../utils';
import { HudSprite } from './HudSprite';
import { UiSprite } from './UiSprite';

type HeartPurchaseDialogProps = {
  coins: number;
  hearts: number;
  infiniteHeartsExpiryTs: number;
  lastHeartRefillTs: number;
  busy: boolean;
  limitReached: boolean;
  purchasesToday: number;
  maxPurchasesPerDay: number;
  limitResetTs: number;
  onRefill: () => void;
  onTopUp: () => void;
  onOpenShopPackages: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onResume: () => void;
  onGoHome: () => void;
};

const formatTimeUntil = (targetTs: number, nowTs: number): string => {
  const totalMinutes = Math.max(0, Math.ceil((targetTs - nowTs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const HeartPurchaseDialog = ({
  coins,
  hearts,
  infiniteHeartsExpiryTs,
  lastHeartRefillTs,
  busy,
  limitReached,
  purchasesToday,
  maxPurchasesPerDay,
  limitResetTs,
  onRefill,
  onTopUp,
  onOpenShopPackages,
  onResume,
  onGoHome,
}: HeartPurchaseDialogProps) => {
  const [nowTs, setNowTs] = useState(() => Date.now());

  // Live tick so the next-heart countdown (and the daily-limit reset note)
  // stay current while the dialog is open; a heart can restore mid-dialog.
  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const {
    maxLives,
    hasInfiniteHearts,
    currentLives,
    nextLifeRemainingMs,
    heartsNotFull,
  } = getHeartState({
    hearts,
    infiniteHeartsExpiryTs,
    lastHeartRefillTs,
    nowTs,
  });
  const canResume = hasInfiniteHearts || currentLives > 0;

  return (
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
        <div className="app-surface-subtle mb-3 rounded border app-border px-3 py-2 text-center">
          <div className="flex justify-center gap-1" data-testid="heart-dialog-hearts">
            {Array.from({ length: maxLives }, (_value, index) => (
              <HudSprite
                key={index}
                icon="heart"
                decorative
                className={cn(
                  'h-5 w-5',
                  hasInfiniteHearts || index < currentLives ? '' : 'hud-heart-empty'
                )}
              />
            ))}
          </div>
          <div
            data-testid="heart-dialog-countdown"
            className="app-text-muted mt-1 text-[11px] font-bold tabular-nums"
          >
            {hasInfiniteHearts
              ? 'Infinite hearts active'
              : heartsNotFull
                ? `Next heart in ${formatCountdown(nextLifeRemainingMs)}`
                : 'Hearts are full!'}
          </div>
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
            <p className="mt-1">Resets in {formatTimeUntil(limitResetTs, nowTs)}</p>
          </div>
        )}
        <button
          data-testid="heart-purchase-shop-packages"
          className="btn-3d btn-primary mb-2 w-full rounded border text-xs font-black uppercase tracking-[0.03em]"
          onClick={onOpenShopPackages}
          disabled={busy}
        >
          Shop heart packs
        </button>
        {canResume && (
          <button
            data-testid="heart-purchase-resume"
            className="btn-3d btn-secondary mb-2 w-full rounded border text-xs font-black uppercase tracking-[0.03em]"
            onClick={onResume}
            disabled={busy}
          >
            Keep playing
          </button>
        )}
        <button
          data-testid="heart-purchase-home"
          className="btn-3d btn-home w-full rounded border text-xs font-black uppercase tracking-[0.03em]"
          onClick={onGoHome}
          disabled={busy}
        >
          <span className="flex items-center justify-center gap-1.5">
            <UiSprite icon="home" decorative className="h-4 w-4" />
            <span>Home</span>
          </span>
        </button>
      </div>
    </div>
  );
};
