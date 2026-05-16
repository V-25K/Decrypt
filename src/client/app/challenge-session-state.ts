export type ChallengeMode = 'daily' | 'endless';

export type ChallengeSessionState = {
  levelId: string;
  mode: ChallengeMode;
  heartsRemaining: number;
  isShieldActive: boolean;
  isGameOver: boolean;
  isComplete: boolean;
};

export type ChallengeSessionAction = {
  type: 'patch';
  changes: Partial<ChallengeSessionState>;
};

export const initialChallengeSessionState: ChallengeSessionState = {
  levelId: '',
  mode: 'daily',
  heartsRemaining: 3,
  isShieldActive: false,
  isGameOver: false,
  isComplete: false,
};

const normalizeChallengeSessionState = (
  state: ChallengeSessionState
): ChallengeSessionState =>
  state.isComplete && state.isGameOver ? { ...state, isGameOver: false } : state;

const areChallengeSessionStatesEqual = (
  a: ChallengeSessionState,
  b: ChallengeSessionState
): boolean =>
  a.levelId === b.levelId &&
  a.mode === b.mode &&
  a.heartsRemaining === b.heartsRemaining &&
  a.isShieldActive === b.isShieldActive &&
  a.isGameOver === b.isGameOver &&
  a.isComplete === b.isComplete;

export const challengeSessionReducer = (
  state: ChallengeSessionState,
  action: ChallengeSessionAction
): ChallengeSessionState => {
  const next = normalizeChallengeSessionState({ ...state, ...action.changes });
  return areChallengeSessionStatesEqual(state, next) ? state : next;
};
