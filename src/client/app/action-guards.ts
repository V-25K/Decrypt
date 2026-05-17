export type GuessWorkSnapshot = {
  processingGuess: boolean;
  guessInFlight: boolean;
  queuedGuessCount: number;
};

export type BusyActionSnapshot = GuessWorkSnapshot & {
  busy: boolean;
};

export type OfferPurchaseSnapshot = BusyActionSnapshot & {
  offerBusy: boolean;
};

export type ActionBlockState = {
  blocked: boolean;
  guessWorkActive: boolean;
};

export const hasActiveGuessWork = ({
  processingGuess,
  guessInFlight,
  queuedGuessCount,
}: GuessWorkSnapshot): boolean =>
  processingGuess || guessInFlight || queuedGuessCount > 0;

export const isBusyOrGuessBlocked = (snapshot: BusyActionSnapshot): boolean =>
  snapshot.busy || hasActiveGuessWork(snapshot);

export const isOfferPurchaseBlocked = (
  snapshot: OfferPurchaseSnapshot
): boolean => snapshot.offerBusy || isBusyOrGuessBlocked(snapshot);

export const getBusyActionBlockState = (
  snapshot: BusyActionSnapshot
): ActionBlockState => {
  const guessWorkActive = hasActiveGuessWork(snapshot);
  return {
    blocked: snapshot.busy || guessWorkActive,
    guessWorkActive,
  };
};

export const getOfferPurchaseBlockState = (
  snapshot: OfferPurchaseSnapshot
): ActionBlockState => {
  const busyActionState = getBusyActionBlockState(snapshot);
  return {
    blocked: snapshot.offerBusy || busyActionState.blocked,
    guessWorkActive: busyActionState.guessWorkActive,
  };
};
