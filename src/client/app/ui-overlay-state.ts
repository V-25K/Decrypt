import { resolveStateUpdate, type StateUpdate } from './state-update';
import type {
  BuyDialogState,
  RetryDialogState,
} from './types';

export type UiOverlayState = {
  buyDialog: BuyDialogState | null;
  heartPurchaseDialogOpen: boolean;
  isHelpOpen: boolean;
  isSettingsOpen: boolean;
  retryDialog: RetryDialogState | null;
};

export type UiOverlayAction =
  | { type: 'setBuyDialog'; update: StateUpdate<BuyDialogState | null> }
  | { type: 'setHeartPurchaseDialogOpen'; update: StateUpdate<boolean> }
  | { type: 'setHelpOpen'; update: StateUpdate<boolean> }
  | { type: 'setRetryDialog'; update: StateUpdate<RetryDialogState | null> }
  | { type: 'setSettingsOpen'; update: StateUpdate<boolean> };

export const initialUiOverlayState: UiOverlayState = {
  buyDialog: null,
  heartPurchaseDialogOpen: false,
  isHelpOpen: false,
  isSettingsOpen: false,
  retryDialog: null,
};

export const uiOverlayReducer = (
  state: UiOverlayState,
  action: UiOverlayAction
): UiOverlayState => {
  switch (action.type) {
    case 'setBuyDialog':
      return {
        ...state,
        buyDialog: resolveStateUpdate(state.buyDialog, action.update),
      };
    case 'setHeartPurchaseDialogOpen':
      return {
        ...state,
        heartPurchaseDialogOpen: resolveStateUpdate(
          state.heartPurchaseDialogOpen,
          action.update
        ),
      };
    case 'setHelpOpen':
      return {
        ...state,
        isHelpOpen: resolveStateUpdate(state.isHelpOpen, action.update),
      };
    case 'setRetryDialog':
      return {
        ...state,
        retryDialog: resolveStateUpdate(state.retryDialog, action.update),
      };
    case 'setSettingsOpen':
      return {
        ...state,
        isSettingsOpen: resolveStateUpdate(state.isSettingsOpen, action.update),
      };
  }
};
