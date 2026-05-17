import { resolveStateUpdate, type StateUpdate } from './state-update';

export type AppRuntimeState = {
  bootstrapAttempt: number;
  bootstrapError: string | null;
  busy: boolean;
  loading: boolean;
};

export type AppRuntimeAction =
  | { type: 'incrementBootstrapAttempt' }
  | { type: 'setBootstrapError'; update: StateUpdate<string | null> }
  | { type: 'setBusy'; update: StateUpdate<boolean> }
  | { type: 'setLoading'; update: StateUpdate<boolean> };

export const initialAppRuntimeState: AppRuntimeState = {
  bootstrapAttempt: 0,
  bootstrapError: null,
  busy: false,
  loading: true,
};

const areAppRuntimeStatesEqual = (
  a: AppRuntimeState,
  b: AppRuntimeState
): boolean =>
  a.bootstrapAttempt === b.bootstrapAttempt &&
  a.bootstrapError === b.bootstrapError &&
  a.busy === b.busy &&
  a.loading === b.loading;

const retainAppRuntimeStateIfEqual = (
  previous: AppRuntimeState,
  next: AppRuntimeState
): AppRuntimeState => (areAppRuntimeStatesEqual(previous, next) ? previous : next);

export const appRuntimeReducer = (
  state: AppRuntimeState,
  action: AppRuntimeAction
): AppRuntimeState => {
  switch (action.type) {
    case 'incrementBootstrapAttempt':
      return {
        ...state,
        bootstrapAttempt: state.bootstrapAttempt + 1,
      };
    case 'setBootstrapError':
      return retainAppRuntimeStateIfEqual(state, {
        ...state,
        bootstrapError: resolveStateUpdate(state.bootstrapError, action.update),
      });
    case 'setBusy':
      return retainAppRuntimeStateIfEqual(state, {
        ...state,
        busy: resolveStateUpdate(state.busy, action.update),
      });
    case 'setLoading':
      return retainAppRuntimeStateIfEqual(state, {
        ...state,
        loading: resolveStateUpdate(state.loading, action.update),
      });
  }
};
