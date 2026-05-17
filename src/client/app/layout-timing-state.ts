export type LayoutTimingState = {
  headerNowTs: number;
  isPuzzleVerticallyCentered: boolean;
  puzzleScale: number;
  viewportWidth: number;
};

export type LayoutTimingAction =
  | { type: 'setHeaderNowTs'; headerNowTs: number }
  | {
      type: 'setPuzzleFit';
      isPuzzleVerticallyCentered: boolean;
      puzzleScale: number;
    }
  | { type: 'setViewportWidth'; viewportWidth: number };

export const createInitialLayoutTimingState = (params: {
  headerNowTs: number;
  viewportWidth: number;
}): LayoutTimingState => ({
  headerNowTs: params.headerNowTs,
  isPuzzleVerticallyCentered: true,
  puzzleScale: 1,
  viewportWidth: params.viewportWidth,
});

export const layoutTimingReducer = (
  state: LayoutTimingState,
  action: LayoutTimingAction
): LayoutTimingState => {
  switch (action.type) {
    case 'setHeaderNowTs':
      return action.headerNowTs === state.headerNowTs
        ? state
        : { ...state, headerNowTs: action.headerNowTs };
    case 'setPuzzleFit':
      return action.puzzleScale === state.puzzleScale &&
        action.isPuzzleVerticallyCentered === state.isPuzzleVerticallyCentered
        ? state
        : {
            ...state,
            isPuzzleVerticallyCentered: action.isPuzzleVerticallyCentered,
            puzzleScale: action.puzzleScale,
          };
    case 'setViewportWidth':
      return action.viewportWidth === state.viewportWidth
        ? state
        : { ...state, viewportWidth: action.viewportWidth };
  }
};
