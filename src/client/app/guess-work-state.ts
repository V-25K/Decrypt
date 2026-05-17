import {
  removePendingGuessEntries as removePendingGuessEntriesFromMap,
  type RevealedGuessTile,
} from './guess-result';
import { resolveStateUpdate, type StateUpdate } from './state-update';

export type GuessWorkState = {
  guessInFlight: boolean;
  pendingGuessByTile: Map<number, string>;
  queuedGuessCount: number;
};

export type GuessWorkAction =
  | { type: 'clearPendingGuessEntries'; revealedTiles: RevealedGuessTile[]; tileIndex: number }
  | { type: 'markPendingGuess'; letter: string; tileIndex: number }
  | { type: 'reset' }
  | { type: 'setGuessInFlight'; update: StateUpdate<boolean> }
  | { type: 'syncQueuedGuessCount'; queuedGuessCount: number };

export const initialGuessWorkState: GuessWorkState = {
  guessInFlight: false,
  pendingGuessByTile: new Map(),
  queuedGuessCount: 0,
};

export const guessWorkReducer = (
  state: GuessWorkState,
  action: GuessWorkAction
): GuessWorkState => {
  switch (action.type) {
    case 'clearPendingGuessEntries': {
      const pendingGuessByTile = removePendingGuessEntriesFromMap(
        state.pendingGuessByTile,
        action.tileIndex,
        action.revealedTiles
      );
      return pendingGuessByTile === state.pendingGuessByTile
        ? state
        : { ...state, pendingGuessByTile };
    }
    case 'markPendingGuess': {
      if (state.pendingGuessByTile.get(action.tileIndex) === action.letter) {
        return state;
      }
      const pendingGuessByTile = new Map(state.pendingGuessByTile);
      pendingGuessByTile.set(action.tileIndex, action.letter);
      return { ...state, pendingGuessByTile };
    }
    case 'reset':
      return state.guessInFlight ||
        state.queuedGuessCount !== 0 ||
        state.pendingGuessByTile.size !== 0
        ? initialGuessWorkState
        : state;
    case 'setGuessInFlight': {
      const guessInFlight = resolveStateUpdate(
        state.guessInFlight,
        action.update
      );
      return guessInFlight === state.guessInFlight
        ? state
        : { ...state, guessInFlight };
    }
    case 'syncQueuedGuessCount':
      return action.queuedGuessCount === state.queuedGuessCount
        ? state
        : { ...state, queuedGuessCount: action.queuedGuessCount };
  }
};
