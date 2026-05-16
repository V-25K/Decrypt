import { heartRefillIntervalMs } from './constants';
import { formatCountdown } from './game-formatters';

export type HeartStateParams = {
  hearts: number;
  infiniteHeartsExpiryTs: number;
  lastHeartRefillTs: number;
  nowTs: number;
  maxLives?: number;
};

export type HeartState = {
  maxLives: number;
  hasInfiniteHearts: boolean;
  infiniteHeartsRemainingMs: number;
  currentLives: number;
  nextLifeRemainingMs: number;
  canUseLifeForChallenge: boolean;
  lifeStatusText: string;
  heartsNotFull: boolean;
};

export type CoinHeartPurchaseAvailability = {
  hasInfiniteHearts: boolean;
  coinHeartLimitReached: boolean;
  heartPurchaseBusy: boolean;
  heartsNotFull: boolean;
};

export const getHeartState = ({
  hearts,
  infiniteHeartsExpiryTs,
  lastHeartRefillTs,
  nowTs,
  maxLives = 3,
}: HeartStateParams): HeartState => {
  const hasInfiniteHearts = infiniteHeartsExpiryTs > nowTs;
  const infiniteHeartsRemainingMs = Math.max(0, infiniteHeartsExpiryTs - nowTs);
  const baseLives = Math.min(maxLives, Math.max(0, hearts));
  const elapsedSinceLastRefillMs = Math.max(0, nowTs - lastHeartRefillTs);
  const earnedRefills =
    baseLives >= maxLives ? 0 : Math.floor(elapsedSinceLastRefillMs / heartRefillIntervalMs);
  const currentLives = hasInfiniteHearts
    ? maxLives
    : Math.min(maxLives, baseLives + earnedRefills);
  const nextLifeRemainingMs = (() => {
    if (hasInfiniteHearts || currentLives >= maxLives) {
      return 0;
    }
    const cycleElapsedMs = elapsedSinceLastRefillMs % heartRefillIntervalMs;
    return cycleElapsedMs === 0 ? heartRefillIntervalMs : heartRefillIntervalMs - cycleElapsedMs;
  })();
  const heartsNotFull = currentLives < maxLives;
  const lifeStatusText = hasInfiniteHearts
    ? `Infinite ${formatCountdown(infiniteHeartsRemainingMs)}`
    : currentLives >= maxLives
      ? 'Full'
      : `+1 in ${formatCountdown(nextLifeRemainingMs)}`;

  return {
    maxLives,
    hasInfiniteHearts,
    infiniteHeartsRemainingMs,
    currentLives,
    nextLifeRemainingMs,
    canUseLifeForChallenge: hasInfiniteHearts || currentLives > 0,
    lifeStatusText,
    heartsNotFull,
  };
};

export const canBuyCoinHeartsFromState = ({
  hasInfiniteHearts,
  coinHeartLimitReached,
  heartPurchaseBusy,
  heartsNotFull,
}: CoinHeartPurchaseAvailability): boolean =>
  !hasInfiniteHearts && !coinHeartLimitReached && !heartPurchaseBusy && heartsNotFull;
