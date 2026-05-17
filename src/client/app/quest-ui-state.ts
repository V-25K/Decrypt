import { resolveStateUpdate, type StateUpdate } from './state-update';

export type QuestUiTab = 'daily' | 'milestone';

export type QuestUiState = {
  claimingQuestId: string | null;
  flairSaveBusy: boolean;
  joiningCommunity: boolean;
  questError: string | null;
  questLoading: boolean;
  questTab: QuestUiTab;
};

export type QuestUiAction =
  | { type: 'setClaimingQuestId'; update: StateUpdate<string | null> }
  | { type: 'setFlairSaveBusy'; update: StateUpdate<boolean> }
  | { type: 'setJoiningCommunity'; update: StateUpdate<boolean> }
  | { type: 'setQuestError'; update: StateUpdate<string | null> }
  | { type: 'setQuestLoading'; update: StateUpdate<boolean> }
  | { type: 'setQuestTab'; update: StateUpdate<QuestUiTab> };

export const initialQuestUiState: QuestUiState = {
  claimingQuestId: null,
  flairSaveBusy: false,
  joiningCommunity: false,
  questError: null,
  questLoading: false,
  questTab: 'daily',
};

export const questUiReducer = (
  state: QuestUiState,
  action: QuestUiAction
): QuestUiState => {
  switch (action.type) {
    case 'setClaimingQuestId':
      return {
        ...state,
        claimingQuestId: resolveStateUpdate(state.claimingQuestId, action.update),
      };
    case 'setFlairSaveBusy':
      return {
        ...state,
        flairSaveBusy: resolveStateUpdate(state.flairSaveBusy, action.update),
      };
    case 'setJoiningCommunity':
      return {
        ...state,
        joiningCommunity: resolveStateUpdate(state.joiningCommunity, action.update),
      };
    case 'setQuestError':
      return {
        ...state,
        questError: resolveStateUpdate(state.questError, action.update),
      };
    case 'setQuestLoading':
      return {
        ...state,
        questLoading: resolveStateUpdate(state.questLoading, action.update),
      };
    case 'setQuestTab':
      return {
        ...state,
        questTab: resolveStateUpdate(state.questTab, action.update),
      };
  }
};
