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
