import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  getWebViewMode,
  purchase,
  requestExpandedMode,
  showToast,
} from '@devvit/web/client';
import {
  chunkPuzzleTokensByWordLimit,
  cn,
  getPuzzleNavigableTileRows,
  tokenizePuzzleTiles,
} from '../utils';
import { getChallengeBackgroundAsset } from './challenge-backgrounds';
import { getAppViewState } from './app-view-state';
import {
  appRuntimeReducer,
  initialAppRuntimeState,
} from './app-runtime-state';
import {
  buildActiveChallengeSessionPatch,
  buildCompleteChallengeSessionPatch,
  buildGameOverChallengeSessionPatch,
  buildRestoredOutcomeSessionPatch,
  challengeSessionReducer,
  initialChallengeSessionState,
  type ChallengeMode,
  type ChallengeSessionState,
} from './challenge-session-state';
import {
  getQuestProgressValue,
} from '../../shared/quests';
import {
  disposeSfx,
  isSfxEnabled,
  playSfx,
  primeSfx,
  setSfxEnabled as persistSfxEnabled,
} from '../sfx';
import {
  preloadImageBatch,
  warmImagePreloads,
} from './asset-preload';
import {
  coinEmoji,
  coinHeartRefillCost,
  coinHeartTopUpCost,
  challengeHeartbeatIntervalMs,
  crossMarkEmoji,
  heartEmoji,
  infiniteHeartsIcon,
  inlineMaxWordsPerLine,
  maxOutcomeCrowdAvatars,
  maxWordTileColumns,
  powerupLabel,
} from './constants';
import {
  challengeTypeMetadata,
  type ChallengeType,
  type EndlessSort,
} from '../../shared/game';
import type {
  AppScreen,
  BuyDialogState,
  ChallengeMetrics,
  EndlessCatalogStatus,
  HomeTab,
  Inventory,
  LeaderboardTab,
  PowerupType,
  Profile,
  QuestStatus,
  RouterOutputs,
  RankSummary,
  StatsTab,
  StoreProduct,
  Puzzle,
} from './types';
import {
  InfoIcon,
} from '../components/Icons';
import { HudSprite } from '../components/HudSprite';
import { PowerupSprite } from '../components/PowerupSprite';
import { UiSprite } from '../components/UiSprite';
import { HelpOverlay } from '../components/HelpOverlay';
import { SettingsOverlay } from '../components/SettingsOverlay';
import { BuyDialog } from '../components/BuyDialog';
import { BottomNav } from '../components/BottomNav';
import { ChallengePuzzleGrid } from '../components/ChallengePuzzleGrid';
import { OutcomeOverlay } from '../components/OutcomeOverlay';
import { HeartPurchaseDialog } from '../components/HeartPurchaseDialog';
import { LoadingScreen } from '../components/LoadingScreen';
import {
  VirtualKeyboardOverlay,
  type VirtualArrowKey,
} from '../components/VirtualKeyboardOverlay';
import { HomeScreen } from '../screens/HomeScreen';
import {
  clearCorrectGuessIndices,
  consumeExpandedChallengeModeIntent,
  consumeExpandedScreenIntent,
  migrateSessionStorageForUser,
  persistCorrectGuessIndices,
  persistOutcomeState,
  readEntrypointScreen,
  readOutcomeState,
  setExpandedChallengeModeIntent,
  setExpandedScreenIntent,
} from './game-storage';
import {
  buildPersistedCompleteOutcomeState,
  buildPersistedGameOverOutcomeState,
  getBootstrapOutcomeDecision,
  getLoadLevelOutcomeDecision,
  resolveCompletionSolveSeconds,
  resolvePersistedOutcomeSolveSeconds,
} from './outcome-state';
import {
  useOutcomeCrowdOrchestration,
} from './outcome-crowd-orchestration';
import {
  flairChipStyle,
  flairTagStyle,
  formatLeaderboardName,
  formatQuestReward,
  formatStatDuration,
} from './game-formatters';
import { useCompletionConfetti } from './completion-confetti';
import { getOutcomeOverlayView } from './outcome-overlay-view';
import { getChallengeSummaryView } from './challenge-summary-view';
import { getFeaturedOfferView } from './featured-offer-view';
import {
  getBuyDialogView,
  getMaxPurchasableQuantity,
} from './powerup-purchase-view';
import {
  getPowerupValidityForPuzzle,
  type PowerupValidity,
} from './powerup-validity';
import {
  canBuyCoinHeartsFromState,
  getHeartState,
} from './heart-state';
import { getQuestVisibilityView } from './quest-view';
import { getResponsiveLayoutState } from './responsive-layout';
import { getStatsView } from './stats-view';
import type { StateUpdate } from './state-update';
import {
  initialUiOverlayState,
  uiOverlayReducer,
} from './ui-overlay-state';
import {
  initialQuestUiState,
  questUiReducer,
  type QuestUiTab,
} from './quest-ui-state';
import {
  initialLeaderboardStatsUiState,
  leaderboardStatsUiReducer,
} from './leaderboard-stats-ui-state';
import {
  addWrongGuessTileInGameState,
  applyServerPuzzleViewToGameState,
  clearTileFeedbackInGameState,
  findAdjacentGuessableTileIndex,
  findNextGuessableTileIndex,
  isGuessableTileAtIndex,
  removeWrongGuessTileInGameState,
  retainOrAdvanceSelectedTileIndex,
  setPuzzleViewInGameState,
  setSelectedTileInGameState,
} from './game-state-actions';
import {
  buildDispatchableGuessChunk,
  filterGuessQueueForLevel,
  type GuessQueueEntry,
} from './guess-queue';
import {
  guessWorkReducer,
  initialGuessWorkState,
} from './guess-work-state';
import {
  buildGuessSessionPatch,
  getRevealedIndicesForAnimation,
  getRevealedTilesFromGuessResult,
  isLockedGuessResult,
  shouldRefreshPuzzleViewAfterGuess,
} from './guess-result';
import {
  createInitialLayoutTimingState,
  layoutTimingReducer,
} from './layout-timing-state';
import {
  applyRevealedTiles,
  buildCompletionQuote,
  hasAvailableLetters,
} from './puzzle-view';
import { readRestoredCorrectGuessFeedback } from './server-puzzle-view';
import {
  isSuccessfulOrderStatus,
  pickPromotedOffer,
  toPurchaseErrorMessage,
} from './purchase-flow';
import {
  hasActiveGuessWork,
  getBusyActionBlockState,
  getOfferPurchaseBlockState,
} from './action-guards';
import { trpc } from '../trpc';
import { ImmutableGameState } from './ImmutableGameState';

type GuessResult = RouterOutputs['game']['submitGuesses']['results'][number];
type TileVisualState = 'default' | 'selected' | 'correct' | 'wrong' | 'locked';
const criticalUiImageAssets = [
  getChallengeBackgroundAsset(0),
  '/backgrounds/home.webp',
  '/hud_coin.png',
  '/hud_heart.png',
  '/loading_glass.png',
  '/logo.png',
  '/powerup_hammer.png',
  '/powerup_wand.png',
  '/powerup_shield.png',
  '/powerup_rocket.png',
  '/char.webp',
  '/ui_create.png',
  '/ui_home.png',
  '/ui_key.png',
  '/ui_leaderboard.png',
  '/ui_lock.png',
  '/ui_question.png',
  '/ui_quest.png',
  '/ui_settings.png',
  '/ui_shop.png',
  '/ui_sound.png',
  '/ui_stats.png',
];
const deferredUiImageAssets = ['/backgrounds/result.webp'];
const criticalOutcomeAvatarCount = 3;
const nonCriticalWarmupDelayMs = 180;
const nonCriticalWarmupTimeoutMs = 1400;

const LazyShopScreen = lazy(() =>
  import('../screens/ShopScreen').then((module) => ({ default: module.ShopScreen }))
);
const LazyQuestScreen = lazy(() =>
  import('../screens/QuestScreen').then((module) => ({ default: module.QuestScreen }))
);
const LazyStatsScreen = lazy(() =>
  import('../screens/StatsScreen').then((module) => ({ default: module.StatsScreen }))
);
const LazyLeaderboardScreen = lazy(() =>
  import('../screens/LeaderboardScreen').then((module) => ({
    default: module.LeaderboardScreen,
  }))
);
const LazyCommunityScreen = lazy(() =>
  import('../screens/CommunityScreen').then((module) => ({
    default: module.CommunityScreen,
  }))
);

const scheduleNonCriticalWarmup = (
  task: () => void,
  delayMs = nonCriticalWarmupDelayMs,
  timeoutMs = nonCriticalWarmupTimeoutMs
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(
      () => {
        task();
      },
      { timeout: timeoutMs }
    );
    return () => {
      window.cancelIdleCallback(idleId);
    };
  }
  const timerId = window.setTimeout(task, delayMs);
  return () => {
    window.clearTimeout(timerId);
  };
};

const isEndlessCaughtUpMessage = (message: string): boolean =>
  message.toLowerCase().includes('caught up');

const errorMessageFromUnknown = (
  error: unknown,
  fallback: string
): string =>
  error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;

const isNoLivesMessage = (message: string): boolean =>
  message.toLowerCase().includes('no lives left');

const letterTileState = (
  selected: boolean,
  isLocked: boolean,
  isCorrectGuess: boolean,
  isWrongGuess: boolean
): TileVisualState => {
  if (isLocked) {
    return 'locked';
  }
  if (isWrongGuess) {
    return 'wrong';
  }
  if (selected) {
    return 'selected';
  }
  if (isCorrectGuess) {
    return 'correct';
  }
  return 'default';
};

const letterTileClass = (
  selected: boolean,
  disabled: boolean,
  isGold: boolean,
  isLocked: boolean,
  isCorrectGuess: boolean,
  isWrongGuess: boolean
) => {
  const state = letterTileState(selected, isLocked, isCorrectGuess, isWrongGuess);
  const baseClass =
    'tile-btn relative rounded-md px-[4px] py-[1px] transition-colors duration-500';
  if (state === 'locked') {
    return `${baseClass} tile-state-locked`;
  }
  if (state === 'wrong') {
    return `${baseClass} tile-state-wrong`;
  }
  if (state === 'selected') {
    return `${baseClass} tile-state-selected`;
  }
  if (state === 'correct') {
    return `${baseClass} tile-state-correct`;
  }
  if (isGold || disabled) {
    return `${baseClass} app-text-muted`;
  }
  return `${baseClass} app-text`;
};

const powerupTypes: PowerupType[] = ['hammer', 'wand', 'shield', 'rocket'];

type HeartPurchaseLimitStatus = {
  purchasesToday: number;
  maxPurchasesPerDay: number;
  limitResetTs: number;
};

type ChallengeSessionTiming = {
  guessCount: number;
  usedPowerups: number;
  mistakesMade: number;
  startTimestamp: number;
};

type LoadLevelOptions = {
  dailyArchive?: boolean;
  excludeLevelId?: string | null;
  ignorePostLevel?: boolean;
};

type ContinuePromptState = {
  levelId: string;
  mode: ChallengeMode;
  heartsRemaining: number;
  ratingDelta: number | null;
};

type CompletedOutcomeStats = {
  solveSeconds: number | null;
  ratingDelta: number | null;
  score: number | null;
};

type FailedOutcomeStats = {
  ratingDelta: number | null;
};

type HeartShopReturnIntent = {
  levelId: string;
  mode: ChallengeMode;
  action: 'start' | 'continue';
};

const continuePromptPointCost = 50;

const buildEndlessCaughtUpMessage = (
  categoryFilter: ChallengeType | null
): string =>
  categoryFilter
    ? `You are caught up with ${challengeTypeMetadata[categoryFilter].label} type.`
    : 'You are caught up with Endless.';

const hasChallengeActivity = (session: ChallengeSessionTiming): boolean =>
  session.guessCount > 0 || session.usedPowerups > 0 || session.mistakesMade > 0;

const defaultChallengeMetrics: ChallengeMetrics = {
  plays: 0,
  wins: 0,
  winRatePct: 0,
};

const defaultCommunityNotifications: RouterOutputs['game']['bootstrap']['communityNotifications'] = {
  creatorChangesRequestedCount: 0,
  moderatorPendingReviewCount: 0,
  moderatorRevisionReviewCount: 0,
};

const normalizeCommunityNotifications = (
  notifications:
    | RouterOutputs['game']['bootstrap']['communityNotifications']
    | undefined
): RouterOutputs['game']['bootstrap']['communityNotifications'] => ({
  ...defaultCommunityNotifications,
  ...notifications,
});

export const GameApp = () => {
  const [appRuntimeState, dispatchAppRuntime] = useReducer(
    appRuntimeReducer,
    initialAppRuntimeState
  );
  const { bootstrapAttempt, bootstrapError, busy, loading } = appRuntimeState;
  const [guessWorkState, dispatchGuessWork] = useReducer(
    guessWorkReducer,
    initialGuessWorkState
  );
  const { guessInFlight, pendingGuessByTile, queuedGuessCount } = guessWorkState;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [subredditName, setSubredditName] = useState<string | null>(null);
  const [isModerator, setIsModerator] = useState(false);
  const [communityNotifications, setCommunityNotifications] = useState<
    RouterOutputs['game']['bootstrap']['communityNotifications']
  >(defaultCommunityNotifications);
  const [endlessCatalogStatus, setEndlessCatalogStatus] =
    useState<EndlessCatalogStatus | null>(null);
  const [endlessCategoryFilter, setEndlessCategoryFilter] =
    useState<ChallengeType | null>(null);
  const [endlessSort, setEndlessSort] = useState<EndlessSort>('random');
  const [endlessCaughtUpMessage, setEndlessCaughtUpMessage] =
    useState<string | null>(null);
  const [challengeSession, dispatchChallengeSession] = useReducer(
    challengeSessionReducer,
    initialChallengeSessionState
  );
  const {
    levelId,
    mode,
    heartsRemaining,
    isShieldActive,
    isGameOver,
    isComplete,
  } = challengeSession;
  const [gameState, setGameState] = useState(() => ImmutableGameState.empty());
  const puzzle = gameState.puzzle;
  const selectedTile = gameState.selectedTileIndex;
  const puzzleRef = useRef<Puzzle | null>(null);

  const patchChallengeSession = useCallback(
    (changes: Partial<ChallengeSessionState>) => {
      dispatchChallengeSession({ type: 'patch', changes });
    },
    []
  );
  const [completionResult, setCompletionResult] = useState<RouterOutputs['game']['completeSession'] | null>(null);
  const [completionSolveSeconds, setCompletionSolveSeconds] = useState<number | null>(null);
  const [completionRatingDelta, setCompletionRatingDelta] = useState<number | null>(null);
  const [completionPointsGained, setCompletionPointsGained] = useState<number | null>(null);
  const [failureRatingDelta, setFailureRatingDelta] = useState<number | null>(null);
  const [challengeStartTs, setChallengeStartTs] = useState<number | null>(null);
  const [completionCelebrationId, setCompletionCelebrationId] = useState(0);
  const [featuredOffer, setFeaturedOffer] = useState<StoreProduct | null>(null);
	  const [shopProducts, setShopProducts] = useState<StoreProduct[]>([]);
	  const [shopError, setShopError] = useState<string | null>(null);
	  const [offerBusy, setOfferBusy] = useState(false);
  const [initialWebViewMode] = useState<'inline' | 'expanded'>(() =>
    getWebViewMode()
  );
	  const [webViewMode, setWebViewMode] = useState<'inline' | 'expanded'>(
    initialWebViewMode
  );
		  const [activeScreen, setActiveScreen] = useState<AppScreen>(() =>
		    initialWebViewMode === 'expanded'
		      ? (consumeExpandedScreenIntent() ?? readEntrypointScreen() ?? 'challenge')
		      : 'challenge'
		  );
  const [uiOverlayState, dispatchUiOverlay] = useReducer(
    uiOverlayReducer,
    initialUiOverlayState
  );
  const {
    buyDialog,
    heartPurchaseDialogOpen,
    isHelpOpen,
    isSettingsOpen,
    retryDialog,
  } = uiOverlayState;
  const [layoutTimingState, dispatchLayoutTiming] = useReducer(
    layoutTimingReducer,
    undefined,
    () =>
      createInitialLayoutTimingState({
        headerNowTs: Date.now(),
        viewportWidth: window.innerWidth,
      })
  );
  const {
    headerNowTs,
    isPuzzleVerticallyCentered,
    puzzleScale,
    viewportWidth,
  } = layoutTimingState;
  const [challengeMetrics, setChallengeMetrics] = useState<ChallengeMetrics>(defaultChallengeMetrics);
  const [requiresPaidRetry, setRequiresPaidRetry] = useState(false);
  const [continuePrompt, setContinuePrompt] =
    useState<ContinuePromptState | null>(null);
  const [continueCancelConfirmOpen, setContinueCancelConfirmOpen] =
    useState(false);
  const continuePromptActive =
    continuePrompt !== null &&
    continuePrompt.levelId === levelId &&
    continuePrompt.mode === mode;
  const [heartPurchaseBusy, setHeartPurchaseBusy] = useState(false);
  const [coinHeartLimitReached, setCoinHeartLimitReached] = useState(false);
  const [heartPurchaseLimitStatus, setHeartPurchaseLimitStatus] =
    useState<HeartPurchaseLimitStatus | null>(null);
  const [heartShopReturnIntent, setHeartShopReturnIntent] =
    useState<HeartShopReturnIntent | null>(null);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => isSfxEnabled());
  const [audioPreferenceBusy, setAudioPreferenceBusy] = useState(false);
  const [questStatus, setQuestStatus] = useState<QuestStatus | null>(null);
  const [questUiState, dispatchQuestUi] = useReducer(
    questUiReducer,
    initialQuestUiState
  );
  const {
    claimingQuestId,
    flairSaveBusy,
    joiningCommunity,
    questError,
    questLoading,
    questTab,
  } = questUiState;
  const updateGameState = useCallback(
    (updater: (previous: ImmutableGameState) => ImmutableGameState) => {
      setGameState((previous) => {
        const next = updater(previous);
        return next.hasChanged(previous) ? next : previous;
      });
    },
    []
  );
  const setSelectedTileIndex = useCallback(
    (tileIndex: number | null) => {
      updateGameState((previous) =>
        setSelectedTileInGameState(previous, tileIndex)
      );
    },
    [updateGameState]
  );
  const setPuzzleView = useCallback(
    (
      nextPuzzle: Puzzle | null,
      options: { resetSelection?: boolean } = {}
    ) => {
      puzzleRef.current = nextPuzzle;
      updateGameState((previous) =>
        setPuzzleViewInGameState(previous, nextPuzzle, options)
      );
    },
    [updateGameState]
  );
  const questVisibilityView = useMemo(
    () => getQuestVisibilityView(questStatus),
    [questStatus]
  );
  const { hasClaimableQuest } = questVisibilityView;
  const communityNotificationCount =
    communityNotifications.creatorChangesRequestedCount +
    communityNotifications.moderatorPendingReviewCount;
  const [leaderboardStatsUiState, dispatchLeaderboardStatsUi] = useReducer(
    leaderboardStatsUiReducer,
    initialLeaderboardStatsUiState
  );
  const {
    homeTab,
    leaderboardTab,
    rankSummary,
    statsTab,
  } = leaderboardStatsUiState;
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const {
    launchCompletionConfetti,
    setConfettiCanvasNode,
  } = useCompletionConfetti();
  const inlineInputRef = useRef<HTMLInputElement | null>(null);
  const helpCardRef = useRef<HTMLElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsCardRef = useRef<HTMLElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);
  const wrongGuessTimeoutsRef = useRef<Map<number, number>>(new Map());
  const currentUserIdRef = useRef<string | null>(null);
  const guessQueueRef = useRef<GuessQueueEntry[]>([]);
  const processingGuessRef = useRef(false);
  const completionInProgressRef = useRef(false);
  const heartbeatInFlightRef = useRef(false);
  const communityNotificationToastShownRef = useRef(false);
  const expandedScreenSyncHandledRef = useRef(initialWebViewMode === 'expanded');
  const communityJoinRecorded = profile?.communityJoinRecorded === true;
  const isChallengeScreen = activeScreen === 'challenge';
  const setBuyDialog = useCallback(
    (update: StateUpdate<BuyDialogState | null>) =>
      dispatchUiOverlay({ type: 'setBuyDialog', update }),
    []
  );
  const setHeartPurchaseDialogOpen = useCallback(
    (update: StateUpdate<boolean>) =>
      dispatchUiOverlay({ type: 'setHeartPurchaseDialogOpen', update }),
    []
  );
  const setIsHelpOpen = useCallback(
    (update: StateUpdate<boolean>) =>
      dispatchUiOverlay({ type: 'setHelpOpen', update }),
    []
  );
  const setIsSettingsOpen = useCallback(
    (update: StateUpdate<boolean>) =>
      dispatchUiOverlay({ type: 'setSettingsOpen', update }),
    []
  );
  const setClaimingQuestId = useCallback(
    (update: StateUpdate<string | null>) =>
      dispatchQuestUi({ type: 'setClaimingQuestId', update }),
    []
  );
  const setFlairSaveBusy = useCallback(
    (update: StateUpdate<boolean>) =>
      dispatchQuestUi({ type: 'setFlairSaveBusy', update }),
    []
  );
  const setJoiningCommunity = useCallback(
    (update: StateUpdate<boolean>) =>
      dispatchQuestUi({ type: 'setJoiningCommunity', update }),
    []
  );
  const setQuestError = useCallback(
    (update: StateUpdate<string | null>) =>
      dispatchQuestUi({ type: 'setQuestError', update }),
    []
  );
  const setQuestLoading = useCallback(
    (update: StateUpdate<boolean>) =>
      dispatchQuestUi({ type: 'setQuestLoading', update }),
    []
  );
  const setQuestTab = useCallback(
    (update: StateUpdate<QuestUiTab>) =>
      dispatchQuestUi({ type: 'setQuestTab', update }),
    []
  );
  const setHomeTab = useCallback(
    (update: StateUpdate<HomeTab>) =>
      dispatchLeaderboardStatsUi({ type: 'setHomeTab', update }),
    []
  );
  const setLeaderboardTab = useCallback(
    (update: StateUpdate<LeaderboardTab>) =>
      dispatchLeaderboardStatsUi({ type: 'setLeaderboardTab', update }),
    []
  );
  const setRankSummary = useCallback(
    (update: StateUpdate<RankSummary | null>) =>
      dispatchLeaderboardStatsUi({ type: 'setRankSummary', update }),
    []
  );
  const setStatsTab = useCallback(
    (update: StateUpdate<StatsTab>) =>
      dispatchLeaderboardStatsUi({ type: 'setStatsTab', update }),
    []
  );
  const challengeSummaryView = useMemo(
    () => getChallengeSummaryView({ levelId, puzzle }),
    [levelId, puzzle]
  );
  const {
    backgroundAsset: challengeBackgroundAsset,
    backgroundClass: challengeBackgroundClass,
    challengeTypeLabel,
    difficultyLabel,
    formattedLevel,
  } = challengeSummaryView;

  useEffect(() => {
    if (!isChallengeScreen) {
      return;
    }
    warmImagePreloads([challengeBackgroundAsset], {
      fetchPriority: 'high',
    });
  }, [challengeBackgroundAsset, isChallengeScreen]);

  const tokens = useMemo(() => (puzzle ? tokenizePuzzleTiles(puzzle.tiles) : []), [puzzle]);
  const endlessCatalogAvailable = endlessCatalogStatus?.available === true;
  const loadLevelCrowdEntries = useCallback(async () => {
    const leaderboard = await trpc.leaderboard.getLevel.query({
      levelId,
      limit: maxOutcomeCrowdAvatars,
    });
    return leaderboard.entries;
  }, [levelId]);

  const {
    completionCrowdAvatarUrls,
    completionCrowdReady,
    handleOutcomeCrowdRef,
    outcomeCrowdBubbles,
    setOutcomeCrowdBubbleNode,
  } = useOutcomeCrowdOrchestration({
    activeScreen,
    isComplete,
    loadLevelCrowdEntries,
    reloadKey: subredditName,
  });

  useEffect(() => {
    puzzleRef.current = puzzle;
  }, [puzzle]);

	  useEffect(() => {
	    if (!profile) {
	      return;
	    }
	    setSfxEnabled(persistSfxEnabled(profile.audioEnabled));
	  }, [profile]);

  useEffect(() => {
    if (!heartPurchaseDialogOpen) {
      return;
    }
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const status = await trpc.profile.getCoinHeartPurchaseStatus.query();
        if (!cancelled) {
          setHeartPurchaseLimitStatus(status);
          setCoinHeartLimitReached(
            status.purchasesToday >= status.maxPurchasesPerDay
          );
        }
      } catch (_error) {
        if (!cancelled) {
          setHeartPurchaseLimitStatus(null);
        }
      }
    };
    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, [heartPurchaseDialogOpen]);

  useEffect(() => {
    guessQueueRef.current = [];
    processingGuessRef.current = false;
    dispatchGuessWork({ type: 'reset' });
  }, [levelId, isGameOver, isComplete]);

  useEffect(() => {
    setContinuePrompt((current) => {
      if (current === null) {
        return current;
      }
      return current.levelId === levelId && current.mode === mode ? current : null;
    });
  }, [levelId, mode]);

  useEffect(() => {
    if (continuePrompt === null) {
      setContinueCancelConfirmOpen(false);
    }
  }, [continuePrompt]);

  const refreshBootstrapState = useCallback(async () => {
    const bootstrap = await trpc.game.bootstrap.query();
    currentUserIdRef.current = bootstrap.userId;
    migrateSessionStorageForUser(bootstrap.userId);
    setProfile(bootstrap.profile);
    setInventory(bootstrap.inventory);
    setSubredditName(bootstrap.subredditName);
    setEndlessCatalogStatus(bootstrap.endlessCatalog);
    setIsModerator(bootstrap.isModerator);
    setCommunityNotifications(
      normalizeCommunityNotifications(bootstrap.communityNotifications)
    );
    return bootstrap;
  }, []);

  useEffect(() => {
    if (communityNotificationCount === 0) {
      communityNotificationToastShownRef.current = false;
      return;
    }
    if (communityNotificationToastShownRef.current) {
      return;
    }
    communityNotificationToastShownRef.current = true;
    if (communityNotifications.creatorChangesRequestedCount > 0) {
      showToast(
        communityNotifications.creatorChangesRequestedCount === 1
          ? '1 cipher needs changes. Open Create > My Ciphers.'
          : `${communityNotifications.creatorChangesRequestedCount} ciphers need changes. Open Create > My Ciphers.`
      );
      return;
    }
    if (communityNotifications.moderatorPendingReviewCount > 0) {
      showToast(
        communityNotifications.moderatorPendingReviewCount === 1
          ? '1 community submission awaits review.'
          : `${communityNotifications.moderatorPendingReviewCount} community submissions await review.`
      );
    }
  }, [communityNotificationCount, communityNotifications]);

  const finalizeContinuePrompt = useCallback(() => {
    if (continuePrompt === null) {
      return;
    }
    const promptLevelId = continuePrompt.levelId;
    setContinuePrompt(null);
    setContinueCancelConfirmOpen(false);
    if (promptLevelId !== levelId || continuePrompt.mode !== mode) {
      return;
    }
    patchChallengeSession(
      buildGameOverChallengeSessionPatch(continuePrompt.heartsRemaining)
    );
    setCompletionRatingDelta(null);
    setCompletionPointsGained(null);
    setFailureRatingDelta(continuePrompt.ratingDelta);
    setRequiresPaidRetry(mode === 'daily');
    setCompletionResult(null);
    setCompletionSolveSeconds(null);
    void refreshBootstrapState().catch(() => undefined);
    const storageUserId = currentUserIdRef.current;
    if (storageUserId) {
      persistOutcomeState(
        storageUserId,
        buildPersistedGameOverOutcomeState(
          promptLevelId,
          Date.now(),
          continuePrompt.ratingDelta
        )
      );
    }
  }, [
    continuePrompt,
    levelId,
    mode,
    patchChallengeSession,
    refreshBootstrapState,
  ]);

  const applyDailyRetryState = useCallback(
    (state: Pick<
	      RouterOutputs['game']['loadLevel'],
	      | 'requiresPaidRetry'
		    >) => {
		      setRequiresPaidRetry(state.requiresPaidRetry);
		    },
    []
  );

  const loadCompletedOutcomeStatsFromDatabase = useCallback(async (
    levelIdToLookup: string
  ): Promise<CompletedOutcomeStats> => {
    try {
      const outcome = await trpc.game.getCompletedOutcome.query({
        levelId: levelIdToLookup,
      });
      return {
        solveSeconds:
          typeof outcome?.solveSeconds === 'number' ? outcome.solveSeconds : null,
        ratingDelta:
          typeof outcome?.ratingDelta === 'number' ? outcome.ratingDelta : null,
        score: typeof outcome?.score === 'number' ? outcome.score : null,
      };
    } catch (_error) {
      return {
        solveSeconds: null,
        ratingDelta: null,
        score: null,
      };
    }
  }, []);

  const loadFailedOutcomeStatsFromDatabase = useCallback(async (
    levelIdToLookup: string
  ): Promise<FailedOutcomeStats> => {
    try {
      const outcome = await trpc.game.getFailedOutcome.query({
        levelId: levelIdToLookup,
      });
      return {
        ratingDelta:
          typeof outcome?.ratingDelta === 'number' ? outcome.ratingDelta : null,
      };
    } catch (_error) {
      return {
        ratingDelta: null,
      };
    }
  }, []);

  const loadQuestStatus = useCallback(async () => {
    setQuestLoading(true);
    setQuestError(null);
    try {
      const status = await trpc.quests.getStatus.query({});
      setQuestStatus(status);
      setQuestError(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to load quests.';
      setQuestError(
        message.toLowerCase().includes('logged in')
          ? 'Log in to view quests.'
          : message
      );
    } finally {
      setQuestLoading(false);
    }
  }, [setQuestError, setQuestLoading]);

  const loadLeaderboardData = useCallback(async () => {
    try {
      const rankSummaryPromise = trpc.leaderboard.getRankSummary
        .query({})
        .catch(() => null);
      const [daily, allTime, summary] = await Promise.all([
        trpc.leaderboard.getDaily.query({
          limit: 20,
        }),
        trpc.leaderboard.getAllTime.query({
          limit: 20,
        }),
        rankSummaryPromise,
      ]);
      const leaderboardAvatarUrls = [
        ...daily.entries.map((entry) => entry.snoovatarUrl ?? ''),
        ...allTime.levels.map((entry) => entry.snoovatarUrl ?? ''),
      ].filter((entry): entry is string => entry.length > 0);
      warmImagePreloads(leaderboardAvatarUrls, {
        fetchPriority: 'high',
      });
      setRankSummary(summary);
    } catch (_error) {
      setRankSummary(null);
    }
  }, [setRankSummary]);

  const loadRankSummary = useCallback(async () => {
    try {
      const summary = await trpc.leaderboard.getRankSummary.query({});
      setRankSummary(summary);
    } catch (_error) {
      setRankSummary(null);
    }
  }, [setRankSummary]);

  const loadFeaturedOffer = useCallback(async () => {
    setShopError(null);
    try {
      const products = await trpc.store.getProducts.query();
      setShopProducts(products.products);
      setFeaturedOffer(pickPromotedOffer(products.products));
    } catch (error) {
      console.error('[client] store.getProducts failed:', error);
      setShopError(
        error instanceof Error && error.message.trim().length > 0
          ? `Unable to load store: ${error.message}`
          : 'Unable to load store bundles.'
      );
      setShopProducts([]);
      setFeaturedOffer(null);
    }
  }, []);

  const applyServerPuzzleView = useCallback(
    (
      activeLevelId: string,
      view: Puzzle,
      options: { resetSelection?: boolean } = {}
    ) => {
      const restoredCorrectGuessIndices = readRestoredCorrectGuessFeedback({
        userId: currentUserIdRef.current,
        levelId: activeLevelId,
        view,
      });
      puzzleRef.current = view;
      updateGameState((previous) =>
        applyServerPuzzleViewToGameState(
          previous,
          view,
          restoredCorrectGuessIndices,
          options
        )
      );
    },
    [updateGameState]
  );

  const refreshCurrentView = async (activeLevelId: string): Promise<Puzzle> => {
    const view = await trpc.game.getCurrentView.query({ levelId: activeLevelId });
    applyServerPuzzleView(activeLevelId, view);
    return view;
  };

  const getPowerupValidity = useCallback(
    (item: PowerupType): PowerupValidity => {
      return getPowerupValidityForPuzzle({
        isShieldActive,
        item,
        puzzle,
        tokens,
      });
    },
    [isShieldActive, puzzle, tokens]
  );

  const clearTileFeedback = useCallback((options: { resetSelection?: boolean } = {}) => {
    wrongGuessTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    wrongGuessTimeoutsRef.current.clear();
    updateGameState((previous) =>
      clearTileFeedbackInGameState(previous, options)
    );
  }, [updateGameState]);

  const flashWrongTile = (tileIndex: number) => {
    updateGameState((previous) =>
      addWrongGuessTileInGameState(previous, tileIndex)
    );
    const existingTimeout = wrongGuessTimeoutsRef.current.get(tileIndex);
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
    }
    const timeoutId = window.setTimeout(() => {
      updateGameState((previous) =>
        removeWrongGuessTileInGameState(previous, tileIndex)
      );
      wrongGuessTimeoutsRef.current.delete(tileIndex);
    }, 1000);
    wrongGuessTimeoutsRef.current.set(tileIndex, timeoutId);
  };

  const readGuessWorkSnapshot = () => ({
    processingGuess: processingGuessRef.current,
    guessInFlight,
    queuedGuessCount,
  });

  const getBusyActionState = () =>
    getBusyActionBlockState({
      busy,
      ...readGuessWorkSnapshot(),
    });

  const getOfferPurchaseActionState = () =>
    getOfferPurchaseBlockState({
      offerBusy,
      busy,
      ...readGuessWorkSnapshot(),
    });

  const hasPendingGuessWork = (): boolean =>
    hasActiveGuessWork(readGuessWorkSnapshot());

  const showFinishGuessesToastIfNeeded = (): void => {
    if (hasPendingGuessWork()) {
      showToast('Finish current guesses first.');
    }
  };

  useEffect(() => {
    clearTileFeedback();
  }, [levelId, clearTileFeedback]);

  const startLevel = useCallback(async (
    activeLevelId: string,
    activeMode: 'daily' | 'endless'
  ) => {
    try {
      const session = await trpc.game.startSession.mutate({
        levelId: activeLevelId,
        mode: activeMode,
      });
      const isFreshSession =
        session.session.guessCount === 0 &&
        session.session.usedPowerups === 0 &&
        session.session.mistakesMade === 0;
      const storageUserId = currentUserIdRef.current;
      if (isFreshSession) {
        if (storageUserId) {
          clearCorrectGuessIndices(storageUserId, activeLevelId);
        }
      }
      patchChallengeSession(
        buildActiveChallengeSessionPatch({
          heartsRemaining: session.heartsRemaining,
          isShieldActive: session.session.shieldIsActive,
        })
      );
      setCompletionResult(null);
      setCompletionSolveSeconds(null);
      setCompletionRatingDelta(null);
      setCompletionPointsGained(null);
      setFailureRatingDelta(null);
      setChallengeStartTs(
        hasChallengeActivity(session.session) ? session.session.startTimestamp : null
      );
      if (storageUserId) {
        persistOutcomeState(storageUserId, null);
      }
      clearTileFeedback({ resetSelection: true });
      return true;
    } catch (error) {
      const message = errorMessageFromUnknown(error, 'Unable to start level.');
      if (isNoLivesMessage(message)) {
        await refreshBootstrapState().catch(() => undefined);
        setHeartPurchaseDialogOpen(true);
        showToast('Restore hearts to keep playing.');
        return false;
      }
      if (message.toLowerCase().includes('retry requires coins')) {
        showToast('Daily retry requires coins.');
        return false;
      }
      if (message.toLowerCase().includes('already completed')) {
        showToast(message);
        return false;
      }
      throw error;
    }
  }, [
    clearTileFeedback,
    patchChallengeSession,
    refreshBootstrapState,
    setHeartPurchaseDialogOpen,
  ]);

  const loadLevel = async (
    nextMode: 'daily' | 'endless',
    options: LoadLevelOptions = {}
  ) => {
    dispatchAppRuntime({ type: 'setBusy', update: true });
    try {
      const loaded = await trpc.game.loadLevel.query({
        mode: nextMode,
        dailyArchive: nextMode === 'daily' ? options.dailyArchive ?? false : false,
        excludeLevelId: options.excludeLevelId ?? null,
        ignorePostLevel: nextMode === 'daily' ? options.ignorePostLevel ?? false : false,
        categoryFilter:
          nextMode === 'endless' ? endlessCategoryFilter : null,
        endlessSort: nextMode === 'endless' ? endlessSort : 'random',
      });
      if (nextMode === 'endless') {
        setEndlessCaughtUpMessage(null);
      }
      dispatchAppRuntime({ type: 'setBootstrapError', update: null });
      patchChallengeSession({
        mode: nextMode,
        levelId: loaded.levelId,
        isComplete: false,
        isGameOver: false,
        isShieldActive: false,
      });
      setPuzzleView(loaded.puzzle, { resetSelection: true });
      applyDailyRetryState(loaded);
      setChallengeMetrics(loaded.challengeMetrics ?? { plays: 0, wins: 0, winRatePct: 0 });
      const outcomeDecision = getLoadLevelOutcomeDecision({
        mode: nextMode,
        requiresPaidRetry: loaded.requiresPaidRetry,
        alreadyCompleted: loaded.alreadyCompleted,
      });

      if (outcomeDecision === 'already-completed') {
        const storageUserId = currentUserIdRef.current;
        if (storageUserId) {
          clearCorrectGuessIndices(storageUserId, loaded.levelId);
        }
        patchChallengeSession({ isComplete: true, isGameOver: false });
        const completedStats = await loadCompletedOutcomeStatsFromDatabase(
          loaded.levelId
        );
        setCompletionResult(null);
        setCompletionSolveSeconds(completedStats.solveSeconds);
        setCompletionRatingDelta(completedStats.ratingDelta);
        setCompletionPointsGained(completedStats.score);
        setFailureRatingDelta(null);
        if (storageUserId) {
          persistOutcomeState(
            storageUserId,
            buildPersistedCompleteOutcomeState({
              levelId: loaded.levelId,
              completion: null,
              solveSeconds: completedStats.solveSeconds,
              ratingDelta: completedStats.ratingDelta,
              pointsGained: completedStats.score,
            })
          );
        }
      } else if (outcomeDecision === 'show-paid-retry') {
        const storageUserId = currentUserIdRef.current;
        const failedStats = await loadFailedOutcomeStatsFromDatabase(
          loaded.levelId
        );
        patchChallengeSession(
          buildGameOverChallengeSessionPatch(loaded.puzzle.heartsMax)
        );
        setCompletionResult(null);
        setCompletionSolveSeconds(null);
        setCompletionRatingDelta(null);
        setCompletionPointsGained(null);
        setFailureRatingDelta(failedStats.ratingDelta);
        setChallengeStartTs(null);
        clearTileFeedback();
        if (storageUserId) {
          persistOutcomeState(
            storageUserId,
            buildPersistedGameOverOutcomeState(
              loaded.levelId,
              Date.now(),
              failedStats.ratingDelta
            )
          );
        }
      } else {
        await startLevel(loaded.levelId, nextMode);
      }
      await refreshCurrentView(loaded.levelId);
    } finally {
      dispatchAppRuntime({ type: 'setBusy', update: false });
    }
  };

  const finishLevel = async () => {
    if (completionInProgressRef.current) {
      return;
    }
    completionInProgressRef.current = true;
    const activeLevelId = levelId;
    const activeMode = mode;
    dispatchAppRuntime({ type: 'setBusy', update: true });
    const fallbackSolveSeconds =
      challengeStartTs !== null
        ? Math.max(0, Math.round((Date.now() - challengeStartTs) / 1000))
        : null;
    try {
      const result = await trpc.game.completeSession.mutate({
        levelId: activeLevelId,
        mode: activeMode,
      });
      const storageUserId = currentUserIdRef.current;
      const completed = result.ok && result.accepted;
      setProfile(result.profile);
      setInventory(result.inventory);
      setRequiresPaidRetry(false);
      patchChallengeSession({ isComplete: completed, isGameOver: false });
      setCompletionResult(completed ? result : null);
      setCompletionRatingDelta(completed ? result.ratingDelta : null);
      setCompletionPointsGained(completed ? result.score : null);
      setFailureRatingDelta(null);
      const resolvedSolveSeconds =
        completed
          ? resolveCompletionSolveSeconds(result, fallbackSolveSeconds)
          : null;
      setCompletionSolveSeconds(resolvedSolveSeconds);
      if (completed) {
        if (storageUserId) {
          persistOutcomeState(
            storageUserId,
            buildPersistedCompleteOutcomeState({
              levelId: activeLevelId,
              completion: result,
              solveSeconds: resolvedSolveSeconds,
            })
          );
        }
      } else {
        if (storageUserId) {
          persistOutcomeState(storageUserId, null);
        }
        showToast('Run not accepted. Starting a fresh attempt.');
        await startLevel(activeLevelId, activeMode);
        await refreshCurrentView(activeLevelId);
      }
      if (completed) {
        setCompletionCelebrationId((previous) => previous + 1);
      }
    } finally {
      completionInProgressRef.current = false;
      dispatchAppRuntime({ type: 'setBusy', update: false });
    }
  };

  useEffect(() => {
    if (completionCelebrationId === 0 || !isComplete) {
      return;
    }
    const animationFrameId = window.requestAnimationFrame(() => {
      launchCompletionConfetti();
    });
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [completionCelebrationId, isComplete, launchCompletionConfetti]);

  useEffect(() => {
    let cancelled = false;
    let cancelDeferredNonCritical: () => void = () => undefined;
    const run = async () => {
      if (isComplete) return;
      dispatchAppRuntime({ type: 'setLoading', update: true });
      dispatchAppRuntime({ type: 'setBusy', update: true });
      dispatchAppRuntime({ type: 'setBootstrapError', update: null });
      try {
        const initialIntent = consumeExpandedChallengeModeIntent();
        let activeMode = initialIntent?.mode ?? 'daily';
        if (activeMode === 'endless') {
          setEndlessCategoryFilter(initialIntent?.categoryFilter ?? null);
          setEndlessSort(initialIntent?.endlessSort ?? 'random');
        }
        let shouldStartLoadedLevel = true;
        const bootstrap = await refreshBootstrapState();
        let loaded: RouterOutputs['game']['loadLevel'];
        try {
          loaded = await trpc.game.loadLevel.query({
            mode: activeMode,
            dailyArchive:
              activeMode === 'daily' ? initialIntent?.dailyArchive ?? false : false,
            excludeLevelId:
              activeMode === 'daily' ? initialIntent?.excludeLevelId ?? null : null,
            ignorePostLevel:
              activeMode === 'daily' ? initialIntent?.ignorePostLevel ?? false : false,
            categoryFilter:
              activeMode === 'endless' ? initialIntent?.categoryFilter ?? null : null,
            endlessSort:
              activeMode === 'endless' ? initialIntent?.endlessSort ?? 'random' : 'random',
          });
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : 'Unable to load Endless.';
          if (
            activeMode === 'endless' &&
            (isEndlessCaughtUpMessage(message) ||
              message.toLowerCase().includes('no endless challenges'))
          ) {
            const caughtUpMessage = buildEndlessCaughtUpMessage(
              initialIntent?.categoryFilter ?? null
            );
            setEndlessCaughtUpMessage(caughtUpMessage);
            showToast(
              isEndlessCaughtUpMessage(message) ? caughtUpMessage : message
            );
            setHomeTab('endless');
            setActiveScreen('home');
            activeMode = 'daily';
            shouldStartLoadedLevel = false;
            loaded = await trpc.game.loadLevel.query({ mode: 'daily' });
          } else {
            throw error;
          }
        }
        if (cancelled) {
          return;
        }
        cancelDeferredNonCritical = scheduleNonCriticalWarmup(() => {
          if (cancelled) {
            return;
          }
          void loadFeaturedOffer();
          void loadQuestStatus();
        });
        patchChallengeSession({ mode: activeMode, levelId: loaded.levelId });
        setPuzzleView(loaded.puzzle, { resetSelection: true });
        applyDailyRetryState(loaded);
        setChallengeMetrics(loaded.challengeMetrics ?? defaultChallengeMetrics);
        const storageUserId = bootstrap.userId;
        const persistedOutcome = readOutcomeState(storageUserId);
        const outcomeDecision = getBootstrapOutcomeDecision({
          persistedOutcome,
          levelId: loaded.levelId,
          requiresPaidRetry: loaded.requiresPaidRetry,
          alreadyCompleted: loaded.alreadyCompleted,
        });
        if (outcomeDecision.shouldClearStalePersisted) {
          persistOutcomeState(storageUserId, null);
        }
        if (outcomeDecision.branch === 'restore-persisted') {
          const restoredOutcome = outcomeDecision.persistedOutcome;
          patchChallengeSession(
            buildRestoredOutcomeSessionPatch({
              heartsRemaining: loaded.puzzle.heartsMax,
              isComplete: restoredOutcome.isComplete,
              isGameOver: restoredOutcome.isGameOver,
            })
          );
          setCompletionResult(restoredOutcome.completion ?? null);
          const restoredStats = restoredOutcome.isComplete
            ? await loadCompletedOutcomeStatsFromDatabase(loaded.levelId)
            : null;
          const restoredFailedStats = restoredOutcome.isGameOver
            ? await loadFailedOutcomeStatsFromDatabase(loaded.levelId)
            : null;
          setCompletionRatingDelta(
            restoredOutcome.isComplete
              ? restoredOutcome.ratingDelta ??
                  restoredOutcome.completion?.ratingDelta ??
                  restoredStats?.ratingDelta ??
                  null
              : null
          );
          setCompletionPointsGained(
            restoredOutcome.isComplete
              ? restoredOutcome.pointsGained ??
                  restoredOutcome.completion?.score ??
                  restoredStats?.score ??
                  null
              : null
          );
          setFailureRatingDelta(
            restoredOutcome.isGameOver
              ? restoredOutcome.ratingDelta ??
                  restoredFailedStats?.ratingDelta ??
                  null
              : null
          );
          const restoredSolveSeconds =
            resolvePersistedOutcomeSolveSeconds(restoredOutcome);
          setCompletionSolveSeconds(
            restoredSolveSeconds ??
              restoredStats?.solveSeconds ??
              null
          );
          setChallengeStartTs(null);
          clearTileFeedback();
        } else if (outcomeDecision.branch === 'show-paid-retry') {
          const failedStats = await loadFailedOutcomeStatsFromDatabase(
            loaded.levelId
          );
          patchChallengeSession(
            buildGameOverChallengeSessionPatch(loaded.puzzle.heartsMax)
          );
          setCompletionResult(null);
          setCompletionSolveSeconds(null);
          setCompletionRatingDelta(null);
          setCompletionPointsGained(null);
          setFailureRatingDelta(failedStats.ratingDelta);
          setChallengeStartTs(null);
          clearTileFeedback();
          persistOutcomeState(
            storageUserId,
            buildPersistedGameOverOutcomeState(
              loaded.levelId,
              Date.now(),
              failedStats.ratingDelta
            )
          );
        } else if (outcomeDecision.branch === 'already-completed') {
          clearCorrectGuessIndices(storageUserId, loaded.levelId);
          patchChallengeSession(
            buildCompleteChallengeSessionPatch(loaded.puzzle.heartsMax)
          );
          const completedStats = await loadCompletedOutcomeStatsFromDatabase(
            loaded.levelId
          );
          setCompletionResult(null);
          setCompletionSolveSeconds(completedStats.solveSeconds);
          setCompletionRatingDelta(completedStats.ratingDelta);
          setCompletionPointsGained(completedStats.score);
          setFailureRatingDelta(null);
          setChallengeStartTs(null);
          clearTileFeedback();
        } else if (shouldStartLoadedLevel) {
          await startLevel(loaded.levelId, activeMode);
        }
        const view = await trpc.game.getCurrentView.query({
          levelId: loaded.levelId,
        });
        if (cancelled) {
          return;
        }
        applyServerPuzzleView(loaded.levelId, view, { resetSelection: true });
      } catch (error) {
        if (!cancelled) {
          dispatchAppRuntime({
            type: 'setBootstrapError',
            update:
              error instanceof Error && error.message.trim().length > 0
                ? `Unable to start Decrypt: ${error.message}`
                : 'Unable to start Decrypt right now.',
          });
        }
      } finally {
        if (!cancelled) {
          dispatchAppRuntime({ type: 'setBusy', update: false });
          dispatchAppRuntime({ type: 'setLoading', update: false });
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      cancelDeferredNonCritical();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isComplete is intentionally excluded from bootstrap.
  }, [
    applyDailyRetryState,
    clearTileFeedback,
    loadCompletedOutcomeStatsFromDatabase,
    loadFailedOutcomeStatsFromDatabase,
    loadFeaturedOffer,
    loadQuestStatus,
    patchChallengeSession,
    refreshBootstrapState,
    applyServerPuzzleView,
    startLevel,
    bootstrapAttempt,
  ]);

  useEffect(() => {
    const onFocus = () => setWebViewMode(getWebViewMode());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (activeScreen !== 'challenge' || isComplete || isGameOver) {
      return;
    }
    dispatchLayoutTiming({ type: 'setHeaderNowTs', headerNowTs: Date.now() });
    const intervalId = window.setInterval(() => {
      dispatchLayoutTiming({ type: 'setHeaderNowTs', headerNowTs: Date.now() });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [activeScreen, isComplete, isGameOver]);

  useEffect(() => {
    if (
      activeScreen !== 'challenge' ||
      levelId.length === 0 ||
      isComplete ||
      isGameOver ||
      busy ||
      guessInFlight ||
      queuedGuessCount > 0
    ) {
      return;
    }
    let cancelled = false;
    const sendHeartbeat = async () => {
      if (cancelled || heartbeatInFlightRef.current) {
        return;
      }
      heartbeatInFlightRef.current = true;
      try {
        await trpc.game.heartbeat.mutate({
          levelId,
          mode,
        });
      } catch (_error) {
        // Ignore transient heartbeat failures; scoring still advances on actions.
      } finally {
        heartbeatInFlightRef.current = false;
      }
    };
    void sendHeartbeat();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void sendHeartbeat();
    }, challengeHeartbeatIntervalMs);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [
    activeScreen,
    busy,
    guessInFlight,
    isComplete,
    isGameOver,
    levelId,
    mode,
    queuedGuessCount,
  ]);

	  useEffect(() => {
	    if (webViewMode !== 'expanded') {
      expandedScreenSyncHandledRef.current = false;
	      return;
	    }
    if (expandedScreenSyncHandledRef.current) {
      return;
    }
    expandedScreenSyncHandledRef.current = true;
	    const nextScreen = consumeExpandedScreenIntent() ?? readEntrypointScreen() ?? 'challenge';
	    setActiveScreen(nextScreen);
	  }, [webViewMode]);

  useEffect(() => {
    primeSfx();
    let primedAfterInteraction = false;
    const onFirstInteraction = () => {
      if (primedAfterInteraction) {
        return;
      }
      primedAfterInteraction = true;
      primeSfx();
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction, true);
    };
    window.addEventListener('pointerdown', onFirstInteraction, { passive: true });
    window.addEventListener('keydown', onFirstInteraction, true);
    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction, true);
    };
  }, []);

  useEffect(() => {
    void preloadImageBatch(criticalUiImageAssets, {
      fetchPriority: 'high',
      timeoutMs: 2200,
    });
    const deferredPreloadTimer = window.setTimeout(() => {
      warmImagePreloads(deferredUiImageAssets, {
        fetchPriority: 'low',
        timeoutMs: 2600,
      });
    }, 120);
    return () => {
      window.clearTimeout(deferredPreloadTimer);
    };
  }, []);

  useEffect(() => {
    const cancelWarmup = scheduleNonCriticalWarmup(() => {
      void import('../screens/ShopScreen');
      void import('../screens/QuestScreen');
      void import('../screens/StatsScreen');
      void import('../screens/LeaderboardScreen');
      void import('canvas-confetti');
    });
    return () => {
      cancelWarmup();
    };
  }, []);

  useEffect(() => {
    const activeTimeouts = wrongGuessTimeoutsRef.current;
    return () => {
      activeTimeouts.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      activeTimeouts.clear();
      disposeSfx();
    };
  }, []);

  useEffect(() => {
    const syncViewportWidth = () =>
      dispatchLayoutTiming({
        type: 'setViewportWidth',
        viewportWidth: window.innerWidth,
      });
    window.addEventListener('resize', syncViewportWidth);
    return () => window.removeEventListener('resize', syncViewportWidth);
  }, []);

  useEffect(() => {
    if (!isHelpOpen && !isSettingsOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpOpen(false);
        setIsSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isHelpOpen, isSettingsOpen, setIsHelpOpen, setIsSettingsOpen]);

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }
    const closeWhenOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (helpCardRef.current?.contains(target)) {
        return;
      }
      if (infoButtonRef.current?.contains(target)) {
        return;
      }
      setIsHelpOpen(false);
    };
    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('touchstart', closeWhenOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('touchstart', closeWhenOutside);
    };
  }, [isHelpOpen, setIsHelpOpen]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }
    const closeWhenOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (settingsCardRef.current?.contains(target)) {
        return;
      }
      if (settingsButtonRef.current?.contains(target)) {
        return;
      }
      setIsSettingsOpen(false);
    };
    document.addEventListener('mousedown', closeWhenOutside);
    document.addEventListener('touchstart', closeWhenOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', closeWhenOutside);
      document.removeEventListener('touchstart', closeWhenOutside);
    };
  }, [isSettingsOpen, setIsSettingsOpen]);

  useEffect(() => {
    const fitPuzzle = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) {
        return;
      }
      if (webViewMode !== 'inline') {
        dispatchLayoutTiming({
          type: 'setPuzzleFit',
          isPuzzleVerticallyCentered:
            content.scrollHeight <= viewport.clientHeight - 6,
          puzzleScale: 1,
        });
        return;
      }
      const widthRatio = viewport.clientWidth / content.scrollWidth;
      const heightRatio = viewport.clientHeight / content.scrollHeight;
      const nextScale = Math.min(1, widthRatio, heightRatio);
      const scaledContentHeight = content.scrollHeight * nextScale;
      dispatchLayoutTiming({
        type: 'setPuzzleFit',
        isPuzzleVerticallyCentered:
          scaledContentHeight <= viewport.clientHeight - 6,
        puzzleScale: nextScale,
      });
    };
    const frameId = window.requestAnimationFrame(fitPuzzle);
    window.addEventListener('resize', fitPuzzle);
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => fitPuzzle())
        : null;
    if (observer && viewport) {
      observer.observe(viewport);
    }
    if (observer && content) {
      observer.observe(content);
    }
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', fitPuzzle);
      observer?.disconnect();
    };
  }, [tokens.length, puzzle?.levelId, webViewMode]);

  useEffect(() => {
    if (activeScreen !== 'challenge') {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = 0;
  }, [activeScreen, puzzle?.levelId, webViewMode]);

  useEffect(() => {
    if (activeScreen !== 'leaderboard') {
      return;
    }
    void loadLeaderboardData();
  }, [activeScreen, loadLeaderboardData]);

  useEffect(() => {
    if (activeScreen !== 'stats') {
      return;
    }
    void loadRankSummary();
  }, [activeScreen, loadRankSummary]);

  const applyGuessResult = async (
    result: GuessResult,
    tileIndex: number,
    puzzleSnapshot: Puzzle | null
  ): Promise<Puzzle | null> => {
    setChallengeStartTs(
      typeof result.sessionStartTimestamp === 'number'
        ? result.sessionStartTimestamp
        : null
    );
    const revealedTiles = getRevealedTilesFromGuessResult(result);
    dispatchGuessWork({
      type: 'clearPendingGuessEntries',
      revealedTiles,
      tileIndex,
    });
    if (isLockedGuessResult(result)) {
      showToast('This tile is still locked.');
    }
    let nextPuzzle = puzzleSnapshot;
    if (result.isCorrect) {
      playSfx('correct');
      nextPuzzle = applyRevealedTiles(nextPuzzle, revealedTiles);
      const revealedIndicesForAnimation = getRevealedIndicesForAnimation(
        result,
        revealedTiles
      );
      puzzleRef.current = nextPuzzle;
      updateGameState((previous) => {
        const next = new Set<number>(previous.correctGuessIndices);
        for (const index of revealedIndicesForAnimation) {
          next.add(index);
        }
        const storageUserId = currentUserIdRef.current;
        if (storageUserId) {
          persistCorrectGuessIndices(storageUserId, levelId, next);
        }
        return previous.update({
          puzzle: nextPuzzle,
          correctGuessIndices: next,
          selectedTileIndex: retainOrAdvanceSelectedTileIndex(previous, nextPuzzle),
        });
      });
    } else if (!isLockedGuessResult(result)) {
      playSfx('wrong');
      flashWrongTile(tileIndex);
    }
    const pendingFailure = result.isGameOver && !result.isLevelComplete;
    const sessionPatch = buildGuessSessionPatch(result);
    patchChallengeSession(
      pendingFailure
        ? {
            ...sessionPatch,
            isComplete: false,
            isGameOver: false,
          }
        : sessionPatch
    );
    const shouldRefresh = shouldRefreshPuzzleViewAfterGuess(result);
    const viewPromise = shouldRefresh ? refreshCurrentView(levelId) : null;
    if (result.newlyUnlockedChainIds.length > 0) {
      showToast('Locks unlocked.');
    }
      if (result.isLevelComplete) {
        await finishLevel();
      } else if (pendingFailure) {
        guessQueueRef.current = [];
        dispatchGuessWork({
          type: 'syncQueuedGuessCount',
          queuedGuessCount: 0,
        });
        setContinuePrompt({
          levelId,
          mode,
          heartsRemaining: result.heartsRemaining,
          ratingDelta: result.ratingDelta,
        });
        setRequiresPaidRetry(false);
        setCompletionResult(null);
        setCompletionSolveSeconds(null);
        setCompletionRatingDelta(null);
        setCompletionPointsGained(null);
        setFailureRatingDelta(result.ratingDelta);
    } else {
      if (viewPromise) {
        void viewPromise
          .then((view) => {
            if (
              !completionInProgressRef.current &&
              !hasAvailableLetters(view)
            ) {
              void finishLevel().catch(() => undefined);
            }
          })
          .catch(() => undefined);
      } else if (
        !completionInProgressRef.current &&
        !hasAvailableLetters(nextPuzzle)
      ) {
        void finishLevel().catch(() => undefined);
      }
    }
    return nextPuzzle;
  };

  const submitLetterForTile = async (
    letter: string,
    tileIndex: number,
    currentPuzzleOverride?: Puzzle | null
  ): Promise<{
    isLevelComplete: boolean;
    isGameOver: boolean;
    nextPuzzle: Puzzle | null;
  } | null> => {
	    if (busy || isComplete || isGameOver || continuePromptActive) {
      return null;
    }
    const currentPuzzle = currentPuzzleOverride ?? puzzleRef.current;
    if (!currentPuzzle) {
      return null;
    }
    const selected = currentPuzzle.tiles[tileIndex];
    if (!selected || !selected.isLetter || selected.isLocked || selected.displayChar !== '_') {
      return null;
    }
    try {
      const result = await trpc.game.submitGuess.mutate({
        levelId,
        tileIndex,
        guessedLetter: letter,
      });
      const nextPuzzle = await applyGuessResult(result, tileIndex, currentPuzzle);
      puzzleRef.current = nextPuzzle;
      return {
        isLevelComplete: result.isLevelComplete,
        isGameOver: result.isGameOver,
        nextPuzzle,
      };
    } catch (error) {
      const message = errorMessageFromUnknown(error, 'Guess failed.');
      if (isNoLivesMessage(message)) {
        await refreshBootstrapState().catch(() => undefined);
        setHeartPurchaseDialogOpen(true);
        showToast('Restore hearts to keep playing.');
      } else {
        showToast('Guess failed.');
      }
      return null;
    }
  };

	  const processGuessQueue = async () => {
	    if (processingGuessRef.current || continuePromptActive) {
	      return;
	    }
    processingGuessRef.current = true;
    dispatchGuessWork({ type: 'setGuessInFlight', update: true });
    try {
      let stopProcessing = false;
      while (guessQueueRef.current.length > 0) {
        const batch = guessQueueRef.current.splice(0, guessQueueRef.current.length);
        dispatchGuessWork({
          type: 'syncQueuedGuessCount',
          queuedGuessCount: guessQueueRef.current.length,
        });
        if (batch.length === 0) {
          continue;
        }
        const filtered = filterGuessQueueForLevel(batch, levelId);
        if (filtered.length === 0) {
          continue;
        }
        let optimisticPuzzle = puzzleRef.current;
        if (filtered.length === 1) {
          const entry = filtered[0];
          if (entry && isGuessableTileAtIndex(optimisticPuzzle, entry.tileIndex)) {
            const singleResult = await submitLetterForTile(
              entry.letter,
              entry.tileIndex,
              optimisticPuzzle
            );
            optimisticPuzzle = singleResult?.nextPuzzle ?? optimisticPuzzle;
            if (
              singleResult?.isGameOver === true ||
              singleResult?.isLevelComplete === true
            ) {
              guessQueueRef.current = [];
              dispatchGuessWork({
                type: 'syncQueuedGuessCount',
                queuedGuessCount: 0,
              });
              stopProcessing = true;
            }
          }
          if (stopProcessing) {
            break;
          }
          continue;
        }
        for (let offset = 0; offset < filtered.length; offset += 20) {
          const chunk = filtered.slice(offset, offset + 20);
          const dispatchableChunk = buildDispatchableGuessChunk(chunk, optimisticPuzzle);
          if (dispatchableChunk.length === 0) {
            continue;
          }
          if (dispatchableChunk.length === 1) {
            const single = dispatchableChunk[0];
            if (single) {
              const singleResult = await submitLetterForTile(
                single.letter,
                single.tileIndex,
                optimisticPuzzle
              );
              optimisticPuzzle = singleResult?.nextPuzzle ?? optimisticPuzzle;
              if (
                singleResult?.isGameOver === true ||
                singleResult?.isLevelComplete === true
              ) {
                guessQueueRef.current = [];
                dispatchGuessWork({
                  type: 'syncQueuedGuessCount',
                  queuedGuessCount: 0,
                });
                stopProcessing = true;
              }
            }
            if (stopProcessing) {
              break;
            }
            continue;
          }
          try {
            const result = await trpc.game.submitGuesses.mutate({
              levelId,
              guesses: dispatchableChunk.map((entry) => ({
                tileIndex: entry.tileIndex,
                guessedLetter: entry.letter,
              })),
            });
            for (let index = 0; index < result.results.length; index += 1) {
              const entry = dispatchableChunk[index];
              const guessResult = result.results[index];
              if (!entry || !guessResult) {
                continue;
              }
              optimisticPuzzle = await applyGuessResult(
                guessResult,
                entry.tileIndex,
                optimisticPuzzle
              );
              puzzleRef.current = optimisticPuzzle;
              if (guessResult.isGameOver || guessResult.isLevelComplete) {
                guessQueueRef.current = [];
                dispatchGuessWork({
                  type: 'syncQueuedGuessCount',
                  queuedGuessCount: 0,
                });
                stopProcessing = true;
                break;
              }
            }
          } catch (_error) {
            for (const entry of dispatchableChunk) {
              if (!isGuessableTileAtIndex(optimisticPuzzle, entry.tileIndex)) {
                continue;
              }
              const singleResult = await submitLetterForTile(
                entry.letter,
                entry.tileIndex,
                optimisticPuzzle
              );
              optimisticPuzzle = singleResult?.nextPuzzle ?? optimisticPuzzle;
              if (
                singleResult?.isGameOver === true ||
                singleResult?.isLevelComplete === true
              ) {
                guessQueueRef.current = [];
                dispatchGuessWork({
                  type: 'syncQueuedGuessCount',
                  queuedGuessCount: 0,
                });
                stopProcessing = true;
                break;
              }
            }
          }
          if (stopProcessing) {
            break;
          }
        }
        if (stopProcessing) {
          break;
        }
      }
    } finally {
      processingGuessRef.current = false;
      dispatchGuessWork({ type: 'setGuessInFlight', update: false });
      dispatchGuessWork({
        type: 'syncQueuedGuessCount',
        queuedGuessCount: guessQueueRef.current.length,
      });
    }
  };

	  const enqueueGuess = (letter: string, tileIndex: number) => {
    dispatchGuessWork({ type: 'markPendingGuess', letter, tileIndex });
    guessQueueRef.current.push({ levelId, tileIndex, letter });
    dispatchGuessWork({
      type: 'syncQueuedGuessCount',
      queuedGuessCount: guessQueueRef.current.length,
    });
	    void processGuessQueue();
	  };

  const handleUsePowerup = async (item: PowerupType) => {
    if (
	      !puzzle ||
	      !profile ||
	      !inventory ||
		      getBusyActionState().blocked ||
		      continuePromptActive ||
		      isGameOver ||
	      isComplete ||
	      completionInProgressRef.current
    ) {
      showFinishGuessesToastIfNeeded();
      return;
    }
    if (inventory[item] <= 0) {
      showToast('No inventory available.');
      return;
    }
    if ((item === 'hammer' || item === 'wand') && selectedTile === null) {
      showToast('Select a tile first.');
      return;
    }
    if (item === 'hammer' || item === 'wand') {
      const targetTile = selectedTile !== null ? puzzle.tiles[selectedTile] : null;
      if (!targetTile || !targetTile.isLetter) {
        showToast('Select a valid letter tile.');
        return;
      }
      if (targetTile.isLocked) {
        showToast(item === 'hammer' ? 'Locked tiles cannot be revealed yet.' : 'Select an unlocked word.');
        return;
      }
      if (item === 'hammer') {
        if (targetTile.displayChar !== '_') {
          showToast('Tile is already revealed.');
          return;
        }
      }
    }
    dispatchAppRuntime({ type: 'setBusy', update: true });
    try {
      const used = await trpc.powerup.use.mutate({
        levelId,
        itemType: item,
        targetIndex: item === 'hammer' || item === 'wand' ? selectedTile : null,
      });
      if (!used.success) {
        showToast(used.reason ?? 'Powerup failed.');
        return;
      }
      const revealedTiles = getRevealedTilesFromGuessResult(used);
      const nextPuzzle = applyRevealedTiles(puzzle, revealedTiles);
      setProfile(used.profile);
      setInventory(used.inventory);
      puzzleRef.current = nextPuzzle;
      setChallengeStartTs(
        hasChallengeActivity(used.session) ? used.session.startTimestamp : null
      );
      updateGameState((previous) => {
        return previous.update({
          puzzle: nextPuzzle,
          selectedTileIndex: retainOrAdvanceSelectedTileIndex(previous, nextPuzzle),
        });
      });
      patchChallengeSession({ isShieldActive: used.session.shieldIsActive });
      if (item === 'shield') {
        showToast('Shield active for next mistake.');
      }
      const shouldRefresh = shouldRefreshPuzzleViewAfterGuess(used);
      const viewPromise = shouldRefresh ? refreshCurrentView(levelId) : null;
      if (viewPromise) {
        const view = await viewPromise;
        if (!hasAvailableLetters(view)) {
          await finishLevel();
        }
      } else if (!hasAvailableLetters(nextPuzzle)) {
        await finishLevel();
      }
    } finally {
      dispatchAppRuntime({ type: 'setBusy', update: false });
    }
  };

  const maxPurchasableQuantity = (item: PowerupType): number => {
    return getMaxPurchasableQuantity({
      coins: profile?.coins ?? null,
      item,
      puzzle,
    });
  };

	  const openBuyDialog = (item: PowerupType) => {
		    if (getBusyActionState().blocked || continuePromptActive) {
	      showFinishGuessesToastIfNeeded();
	      return;
	    }
    const maxQuantity = maxPurchasableQuantity(item);
    if (maxQuantity < 1) {
      showToast('Not enough coins.');
      return;
    }
    setBuyDialog({ item, quantity: 1 });
  };

  const showMissingPowerupToast = (item: PowerupType) => {
    showToast(`No ${powerupLabel[item].toLowerCase()} available.`);
  };

  const handleQuickPowerupTap = (item: PowerupType) => {
	    if (
		      !inventory ||
		      getBusyActionState().blocked ||
		      continuePromptActive ||
		      isGameOver ||
	      isComplete
    ) {
      return;
    }
    if (inventory[item] > 0) {
      void handleUsePowerup(item);
      return;
    }
    if (maxPurchasableQuantity(item) < 1) {
      showMissingPowerupToast(item);
      return;
    }
    openBuyDialog(item);
  };

  const confirmBuy = async () => {
    if (
	      !buyDialog ||
	      getBusyActionState().blocked ||
	      !profile ||
      !inventory ||
      !levelId
    ) {
      showFinishGuessesToastIfNeeded();
      return;
    }
    const max = maxPurchasableQuantity(buyDialog.item);
    if (max < 1) {
      showToast('Not enough coins.');
      setBuyDialog(null);
      return;
    }
    const validity = getPowerupValidity(buyDialog.item);
    if (!validity.valid) {
      showToast(validity.reason ?? 'This powerup is not useful right now.');
      return;
    }
    const quantity = Math.max(1, Math.min(buyDialog.quantity, max));
    dispatchAppRuntime({ type: 'setBusy', update: true });
    try {
      const bought = await trpc.powerup.purchase.mutate({
        levelId,
        itemType: buyDialog.item,
        quantity,
      });
      if (!bought.success) {
        showToast(bought.reason ?? 'Purchase failed.');
        return;
      }
      setProfile(bought.profile);
      setInventory(bought.inventory);
      setBuyDialog(null);
    } finally {
      dispatchAppRuntime({ type: 'setBusy', update: false });
    }
  };

	  const handleProductPurchase = async (sku: string) => {
	    if (getOfferPurchaseActionState().blocked) {
	      showFinishGuessesToastIfNeeded();
	      return;
	    }
    setOfferBusy(true);
    try {
      const result = await purchase(sku);
      if (isSuccessfulOrderStatus(result.status)) {
        showToast('Purchase successful.');
        await Promise.all([refreshBootstrapState(), loadFeaturedOffer()]);
        if (heartShopReturnIntent) {
          const returnIntent = heartShopReturnIntent;
          setHeartShopReturnIntent(null);
          setActiveScreen('challenge');
          if (returnIntent.action === 'start') {
            await startLevel(returnIntent.levelId, returnIntent.mode);
            await refreshCurrentView(returnIntent.levelId);
          } else {
            showToast('Hearts restored. Continue your challenge.');
          }
        }
      } else {
        showToast(toPurchaseErrorMessage(result.errorMessage));
      }
    } catch (error) {
      const message =
        error instanceof Error ? toPurchaseErrorMessage(error.message) : 'Purchase failed.';
      showToast(message);
    } finally {
      setOfferBusy(false);
    }
  };

  const handleOfferPurchase = async () => {
    if (!featuredOffer) {
      return;
    }
    await handleProductPurchase(featuredOffer.sku);
  };

  const openShop = (event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (webViewMode === 'inline') {
      setExpandedScreenIntent('shop');
      if (event?.nativeEvent) {
        void requestExpandedMode(event.nativeEvent, 'shop');
      } else {
        showToast('Tap shop to open expanded mode.');
      }
      return;
    }
    setActiveScreen('shop');
  };

  const openHeartShopPackages = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (levelId) {
      setHeartShopReturnIntent({
        levelId,
        mode,
        action: continuePromptActive || isGameOver ? 'continue' : 'start',
      });
    }
    setHeartPurchaseDialogOpen(false);
    openShop(event);
  };

  const openCommunity = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (webViewMode === 'inline') {
      setExpandedScreenIntent('community');
      try {
        requestExpandedMode(event.nativeEvent, 'game');
      } catch (_error) {
        showToast('Reddit needs to expand this panel to show Community. Try tapping the button directly.');
      }
      return;
    }
    setActiveScreen('community');
  };

  const openQuest = (event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (webViewMode === 'inline') {
      setExpandedScreenIntent('quest');
      if (event?.nativeEvent) {
        void requestExpandedMode(event.nativeEvent, 'quest');
      } else {
        showToast('Tap quests to open expanded mode.');
      }
      return;
    }
    setActiveScreen('quest');
    void loadQuestStatus();
  };

  const openStats = (event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (webViewMode === 'inline') {
      setExpandedScreenIntent('stats');
      if (event?.nativeEvent) {
        void requestExpandedMode(event.nativeEvent, 'stats');
      } else {
        showToast('Tap stats to open expanded mode.');
      }
      return;
    }
    setActiveScreen('stats');
  };

  const openLeaderboard = (event?: ReactMouseEvent<HTMLButtonElement>) => {
    if (webViewMode === 'inline') {
      setExpandedScreenIntent('leaderboard');
      if (event?.nativeEvent) {
        void requestExpandedMode(event.nativeEvent, 'leaderboard');
      } else {
        showToast('Tap leaderboard to open expanded mode.');
      }
      return;
    }
    setActiveScreen('leaderboard');
  };

  const openHome = () => {
    finalizeContinuePrompt();
    setActiveScreen('home');
  };

  const requestChallengeExpandedMode = (
    nextMode: 'daily' | 'endless',
    event?: ReactMouseEvent<HTMLButtonElement>,
    options: LoadLevelOptions = {}
  ) => {
    setExpandedScreenIntent('challenge');
    setExpandedChallengeModeIntent(
      nextMode,
      nextMode === 'endless' ? endlessCategoryFilter : null,
      nextMode === 'endless' ? endlessSort : 'random',
      nextMode === 'daily' ? options.dailyArchive ?? false : false,
      options.excludeLevelId ?? null,
      nextMode === 'daily' ? options.ignorePostLevel ?? false : false
    );
    if (event?.nativeEvent) {
      void requestExpandedMode(event.nativeEvent, 'game');
    } else {
      showToast('Tap play to open expanded mode.');
    }
  };

	  const loadModeAndOpenChallenge = async (
	    nextMode: 'daily' | 'endless',
	    event?: ReactMouseEvent<HTMLButtonElement>,
	    options: LoadLevelOptions = {}
  ) => {
    if (webViewMode === 'inline') {
      requestChallengeExpandedMode(nextMode, event, options);
      return;
    }
    if (nextMode === 'endless' && !endlessCatalogAvailable) {
      showToast('Endless mode is not available yet.');
      return;
    }
    try {
      await loadLevel(nextMode, options);
      setActiveScreen('challenge');
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to load level.';
      if (message.toLowerCase().includes('endless catalog unavailable')) {
        await refreshBootstrapState();
        showToast('Endless mode is not available yet.');
        return;
      }
      if (
        isEndlessCaughtUpMessage(message) ||
        (nextMode === 'endless' &&
          message.toLowerCase().includes('no endless challenges'))
      ) {
        await refreshBootstrapState();
        if (nextMode === 'endless') {
          setEndlessCaughtUpMessage(
            buildEndlessCaughtUpMessage(endlessCategoryFilter)
          );
          setHomeTab('endless');
          setActiveScreen('home');
        }
        showToast(
          nextMode === 'endless'
            ? buildEndlessCaughtUpMessage(endlessCategoryFilter)
            : "You're all caught up."
        );
        return;
      }
      showToast(message);
	    }
	  };

  const recoverFromUnavailablePost = async () => {
    try {
      await loadLevel('daily', { ignorePostLevel: true });
      dispatchAppRuntime({ type: 'setBootstrapError', update: null });
      setActiveScreen('challenge');
    } catch (error) {
      showToast(
        errorMessageFromUnknown(
          error,
          'No playable daily challenge is available right now.'
        )
      );
    }
  };

  const leaveUnavailablePost = async () => {
    try {
      await loadLevel('daily', { ignorePostLevel: true });
      dispatchAppRuntime({ type: 'setBootstrapError', update: null });
      setEndlessCaughtUpMessage(null);
      setHomeTab('daily');
      setActiveScreen('home');
    } catch (error) {
      showToast(
        errorMessageFromUnknown(
          error,
          'No playable daily challenge is available right now.'
        )
      );
    }
  };

		  const handleOutcomeNextChallenge = (
	    event?: ReactMouseEvent<HTMLButtonElement>
	  ) => {
    const currentMode = mode;
	    void loadModeAndOpenChallenge(
      currentMode,
	      event,
      currentMode === 'daily'
	        ? { dailyArchive: true, excludeLevelId: levelId }
	        : {}
	    );
	  };

  const handleHomeTabSelect = (nextTab: HomeTab) => {
    setHomeTab(nextTab);
    if (nextTab === 'endless' && !endlessCatalogAvailable) {
      showToast('Endless mode is coming soon.');
    }
  };

  const handleEndlessCategoryFilterChange = (category: ChallengeType | null) => {
    setEndlessCategoryFilter(category);
    setEndlessCaughtUpMessage(null);
  };

  const handleEndlessSortChange = (sort: EndlessSort) => {
    setEndlessSort(sort);
    setEndlessCaughtUpMessage(null);
  };

  const handleEndlessCaughtUpHome = () => {
    setEndlessCaughtUpMessage(null);
    setHomeTab('daily');
  };

  const handleAudioToggle = async () => {
    if (!profile || audioPreferenceBusy) {
      return;
    }
    const previousEnabled = profile.audioEnabled;
    const nextEnabled = !previousEnabled;
    setAudioPreferenceBusy(true);
    setSfxEnabled(persistSfxEnabled(nextEnabled));
    setProfile((previous) =>
      previous ? { ...previous, audioEnabled: nextEnabled } : previous
    );
    try {
      const result = await trpc.profile.setAudioEnabled.mutate({
        enabled: nextEnabled,
      });
      setProfile(result.profile);
      setSfxEnabled(persistSfxEnabled(result.profile.audioEnabled));
    } catch (_error) {
      setProfile((previous) =>
        previous ? { ...previous, audioEnabled: previousEnabled } : previous
      );
      setSfxEnabled(persistSfxEnabled(previousEnabled));
      showToast('Unable to save audio preference.');
    } finally {
      setAudioPreferenceBusy(false);
    }
  };

  const handleHomePlay = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (homeTab === 'endless') {
      void loadModeAndOpenChallenge('endless', event);
    } else {
      void loadModeAndOpenChallenge('daily', event);
    }
  };

  const handleHomePlayEndless = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setEndlessCaughtUpMessage(null);
    void loadModeAndOpenChallenge('endless', event);
  };

  const handleQuestClaim = async (questId: string) => {
    setClaimingQuestId(questId);
    try {
      const previousUnlockedFlairs = new Set(profile?.unlockedFlairs ?? []);
      const result = await trpc.quests.claim.mutate({ questId });
      if (!result.success) {
        showToast(result.reason ?? 'Quest claim failed.');
        return;
      }
      setProfile(result.profile);
      setInventory(result.inventory);
      await loadQuestStatus();
      const newlyUnlockedFlair = result.profile.unlockedFlairs.find(
        (flair) => !previousUnlockedFlairs.has(flair)
      );
      showToast(
        newlyUnlockedFlair
          ? `Quest reward claimed. Flair unlocked: ${newlyUnlockedFlair}`
          : 'Quest reward claimed.'
      );
    } catch (_error) {
      showToast('Quest claim failed.');
    } finally {
      setClaimingQuestId(null);
    }
  };

  const handleSetActiveFlair = async (nextFlair: string) => {
    if (!profile) {
      return;
    }
    const previousProfile = profile;
    setFlairSaveBusy(true);
    setProfile({ ...profile, activeFlair: nextFlair });
    try {
      const result = await trpc.profile.setActiveFlair.mutate({
        flair: nextFlair,
      });
      if (!result.success) {
        setProfile(result.profile);
        showToast(result.reason ?? 'Unable to change flair.');
        return;
      }
      setProfile(result.profile);
      showToast(
        nextFlair.length > 0 ? `Flair equipped: ${nextFlair}` : 'Flair cleared.'
      );
    } catch (_error) {
      setProfile(previousProfile);
      showToast('Unable to change flair.');
    } finally {
      setFlairSaveBusy(false);
    }
  };

  const handleJoinCommunity = async () => {
    if (!subredditName) {
      showToast('Community link is unavailable right now.');
      return;
    }
    setJoiningCommunity(true);
    try {
      const result = await trpc.profile.joinCommunity.mutate();
      if (!result.success) {
        showToast(result.reason ?? 'Unable to join the community right now.');
        return;
      }
      setProfile(result.profile);
      showToast(
        result.rewardCoins > 0
          ? `Community joined. ${coinEmoji} +${result.rewardCoins}`
          : result.reason ?? 'Joined.'
      );
    } catch (_error) {
      showToast('Unable to join the community right now. Please try again in a moment.');
    } finally {
      setJoiningCommunity(false);
    }
  };

  const handleCoinHeartRefill = async () => {
    if (!canBuyCoinHearts || !coinRefillAffordable) {
      if (!coinRefillAffordable) {
        showToast('Not enough coins.');
      }
      return;
    }
    setHeartPurchaseBusy(true);
	    try {
	      const result = await trpc.profile.purchaseCoinRefill.mutate();
      setHeartPurchaseLimitStatus({
        purchasesToday: result.purchasesToday,
        maxPurchasesPerDay: result.maxPurchasesPerDay,
        limitResetTs: result.limitResetTs,
      });
	      if (!result.success) {
	        if (result.reason?.toLowerCase().includes('daily limit')) {
	          setCoinHeartLimitReached(true);
	        }
        showToast(result.reason ?? 'Refill failed.');
        return;
      }
      setProfile(result.profile);
      setHeartPurchaseDialogOpen(false);
      showToast(`${heartEmoji} Hearts refilled!`);
    } catch (_error) {
      showToast('Refill failed. Please try again.');
    } finally {
      setHeartPurchaseBusy(false);
    }
  };

  const handleCoinHeartTopUp = async () => {
    if (!canBuyCoinHearts || !coinTopUpAffordable) {
      if (!coinTopUpAffordable) {
        showToast('Not enough coins.');
      }
      return;
    }
    setHeartPurchaseBusy(true);
	    try {
	      const result = await trpc.profile.purchaseCoinTopUp.mutate();
      setHeartPurchaseLimitStatus({
        purchasesToday: result.purchasesToday,
        maxPurchasesPerDay: result.maxPurchasesPerDay,
        limitResetTs: result.limitResetTs,
      });
	      if (!result.success) {
        if (result.reason?.toLowerCase().includes('daily limit')) {
          setCoinHeartLimitReached(true);
        }
        showToast(result.reason ?? 'Top-up failed.');
        return;
      }
      setProfile(result.profile);
      setHeartPurchaseDialogOpen(false);
      showToast(`${heartEmoji} +1 heart!`);
    } catch (_error) {
      showToast('Top-up failed. Please try again.');
    } finally {
      setHeartPurchaseBusy(false);
    }
  };

	  const retry = async () => {
	    if (!levelId) {
	      return;
	    }
	    dispatchAppRuntime({ type: 'setBusy', update: true });
	    try {
	      if (isGameOver || continuePromptActive) {
	        if (!hasInfiniteHearts && currentLives <= 0) {
	          setHeartPurchaseDialogOpen(true);
	          return;
	        }
	        const result = await trpc.game.continueLevel.mutate({
	          levelId,
	          mode,
	        });
	        setProfile(result.profile);
	        setInventory(result.inventory);
	        setContinuePrompt(null);
	        setContinueCancelConfirmOpen(false);
	        patchChallengeSession(
	          buildActiveChallengeSessionPatch({
            heartsRemaining: result.heartsRemaining,
            isShieldActive: result.session.shieldIsActive,
          })
        );
        setRequiresPaidRetry(false);
        setCompletionResult(null);
        setCompletionSolveSeconds(null);
        setCompletionRatingDelta(null);
        setCompletionPointsGained(null);
        setFailureRatingDelta(null);
        setChallengeStartTs(
          hasChallengeActivity(result.session) ? result.session.startTimestamp : null
        );
        const storageUserId = currentUserIdRef.current;
        if (storageUserId) {
          persistOutcomeState(storageUserId, null);
        }
        clearTileFeedback();
        await refreshCurrentView(levelId);
        return;
      }

      if (!hasInfiniteHearts && currentLives <= 0) {
        setHeartPurchaseDialogOpen(true);
        return;
      }
      await startLevel(levelId, mode);
      await refreshCurrentView(levelId);
      patchChallengeSession({ isGameOver: false });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to continue challenge.';
      showToast(message);
    } finally {
      dispatchAppRuntime({ type: 'setBusy', update: false });
    }
  };

  const share = async () => {
    if (!isComplete) {
      return;
    }
    try {
      const result = await trpc.social.shareResult.mutate({
        levelId,
      });
      showToast(result.success ? 'Result shared.' : result.reason ?? 'Share failed.');
    } catch (_error) {
      showToast('Share failed.');
    }
  };

	  useEffect(() => {
	    if (
	      activeScreen !== 'challenge' ||
	      selectedTile === null ||
	      busy ||
	      continuePromptActive ||
	      isGameOver ||
	      isComplete
	    ) {
	      return;
	    }
    const frame = requestAnimationFrame(() => {
      focusInlineInputProxy();
    });
    return () => cancelAnimationFrame(frame);
	  }, [activeScreen, selectedTile, busy, continuePromptActive, isGameOver, isComplete]);

  useEffect(() => {
    if (
      activeScreen !== 'challenge' ||
      viewportWidth >= 640 ||
      selectedTile === null ||
      isHelpOpen ||
      isSettingsOpen ||
	      Boolean(buyDialog) ||
	      retryDialog !== null ||
	      heartPurchaseDialogOpen ||
	      continuePromptActive ||
	      isComplete ||
	      isGameOver
    ) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const viewport = viewportRef.current;
      const selectedElement = viewport?.querySelector('[data-tile-state="selected"]');
      if (
        selectedElement instanceof HTMLElement &&
        typeof selectedElement.scrollIntoView === 'function'
      ) {
        selectedElement.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
        });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    activeScreen,
    viewportWidth,
    selectedTile,
    isHelpOpen,
    isSettingsOpen,
    buyDialog,
    retryDialog,
	    heartPurchaseDialogOpen,
	    continuePromptActive,
	    isComplete,
    isGameOver,
  ]);

  if (loading) {
    return <LoadingScreen />;
  }

	  if (bootstrapError || !profile || !inventory || !puzzle) {
	    const isUnavailablePuzzle =
	      bootstrapError?.toLowerCase().includes('puzzle is unavailable') === true;
	    const isCaughtUpBootstrap =
	      bootstrapError?.toLowerCase().includes('caught up') === true;
	    const needsRecoveryActions = isUnavailablePuzzle || isCaughtUpBootstrap;
		    return (
		      <div className="theme-app result-backdrop app-surface-subtle relative flex h-full items-center justify-center overflow-hidden p-4">
		        <div className="app-surface-strong app-border relative z-10 w-full max-w-[360px] rounded-2xl border px-5 py-6 text-center shadow-[0_18px_44px_rgba(0,0,0,0.42)]">
	          {isUnavailablePuzzle && (
	            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl border border-black/30 bg-black/10">
	              <img
	                src="/ui_lock.png"
	                alt=""
	                loading="eager"
	                className="ui-sprite h-9 w-9"
	              />
	            </div>
	          )}
		          <div className="app-text text-sm font-black uppercase tracking-[0.04em]">
		            {isCaughtUpBootstrap
	                ? 'You are all caught up'
	                : isUnavailablePuzzle
	                  ? 'Cipher removed'
	                  : 'Decrypt unavailable'}
		          </div>
		          <p className="app-text-muted mt-2 text-sm font-semibold leading-snug">
		            {isCaughtUpBootstrap
	                ? 'New daily ciphers will appear here soon.'
	                : isUnavailablePuzzle
	                  ? 'This challenge left the game, but another cipher is ready.'
	                : bootstrapError ?? 'Unable to load the current challenge right now.'}
	          </p>
	          {!needsRecoveryActions && (
	            <button
              type="button"
              data-testid="bootstrap-retry"
              className="btn-3d btn-primary mt-4 rounded-xl px-4 py-2 text-sm font-black uppercase"
              onClick={() =>
                dispatchAppRuntime({ type: 'incrementBootstrapAttempt' })
              }
            >
	              Retry
	            </button>
	          )}
	          {needsRecoveryActions && (
	            <div className="mt-4 grid grid-cols-1 gap-2">
	              <button
	                type="button"
	                data-testid="removed-next-challenge"
	                className="btn-3d btn-primary rounded-xl px-4 py-2 text-sm font-black uppercase"
	                onClick={() => void recoverFromUnavailablePost()}
	              >
	                {isCaughtUpBootstrap ? 'Play Current Daily' : 'Next Cipher'}
	              </button>
	              <button
	                type="button"
	                className="btn-3d btn-neutral rounded-xl px-4 py-2 text-xs font-black uppercase"
	                onClick={() => void leaveUnavailablePost()}
	              >
	                Home
	              </button>
            </div>
	          )}
	        </div>
	      </div>
	    );
	  }

  const mistakesMade = Math.max(0, puzzle.heartsMax - heartsRemaining);
  const protectedMistakeIndex =
    isShieldActive && mistakesMade < puzzle.heartsMax ? mistakesMade : null;
  const isInlineMode = webViewMode === 'inline';
  const buyDialogView = getBuyDialogView({
    buyDialog,
    coins: profile.coins,
    isShieldActive,
    puzzle,
    tokens,
  });
  const {
    buyMax,
    chips: buyDialogChips,
    powerupValidity: buyDialogPowerupValidity,
    remainingLetters: buyDialogRemainingLetters,
    unitPrice: buyDialogUnitPrice,
  } = buyDialogView;
  const hasQueuedGuesses = queuedGuessCount > 0;
  const guessBusy = guessInFlight || hasQueuedGuesses;
  const responsiveLayoutState = getResponsiveLayoutState(viewportWidth, isInlineMode);
  const {
    deviceTier,
    inlineTight,
    frameMaxWidthClass,
    powerupButtonSizeClass,
    powerupWrapSizeClass,
    utilityRowClass,
    helpButtonClass,
    headerIconClass,
    helpCardWidthClass,
    puzzleMarkClass,
    puzzleCipherClass,
    separatorGlyphClass,
    punctuationMarkClass,
    puzzleTileUnderlineWidthClass,
    punctuationTileMinWidthClass,
    inlinePromoClusterClass,
    inlineSnooClass,
    inlineSnooDockClass,
    inlineBundleDockClass,
    inlineBundleCardClass,
    bundleRewardRowTextClass,
    bundleRewardValueTextClass,
  } = responsiveLayoutState;
  const featuredOfferView = getFeaturedOfferView(featuredOffer);
  const appViewState = getAppViewState({
    activeScreen,
    isChallengeScreen,
    isComplete,
    isGameOver,
    isInlineMode,
    mode,
    requiresPaidRetry,
  });
  const {
    layoutTestId,
    isHomeScreen,
    isCommunityScreen: isCommunityHubScreen,
    isShopScreen,
    isQuestScreen,
    isStatsScreen,
    isLeaderboardScreen,
    isHubScreen,
    showOutcomeOverlay,
    showChallengeBackdrop,
    showSuccessOverlay,
    isDailyComplete,
  } = appViewState;
  const showVirtualKeyboard =
    isChallengeScreen &&
    deviceTier === 'mobile' &&
    !showOutcomeOverlay &&
    !isHelpOpen &&
    !isSettingsOpen &&
    !buyDialog &&
    !retryDialog &&
    !heartPurchaseDialogOpen;
  const heartState = getHeartState({
    hearts: profile.hearts,
    infiniteHeartsExpiryTs: profile.infiniteHeartsExpiryTs,
    lastHeartRefillTs: profile.lastHeartRefillTs,
    nowTs: headerNowTs,
  });
  const {
    hasInfiniteHearts,
    currentLives,
    lifeStatusText,
    heartsNotFull,
  } = heartState;
  const coinRefillAffordable = profile.coins >= coinHeartRefillCost;
  const coinTopUpAffordable = profile.coins >= coinHeartTopUpCost;
  const canBuyCoinHearts = canBuyCoinHeartsFromState({
    hasInfiniteHearts,
    coinHeartLimitReached,
    heartPurchaseBusy,
    heartsNotFull,
  });
  const completionQuote = buildCompletionQuote(puzzle);
  const outcomeOverlayView = getOutcomeOverlayView({
    communityJoinRecorded,
    completionPointsGained,
    completionRatingDelta,
    completionResult,
    completionSolveSeconds,
    deviceTier,
    failureRatingDelta,
    isComplete,
    joiningCommunity,
  });
  const {
    communityJoinLabel,
    completionSolveLabel,
    homePanelClass,
    pointsGainedLabel,
    ratingDeltaLabel,
    ratingDeltaTone,
  } = outcomeOverlayView;
  const {
    claimedQuestIdSet,
    visibleDailyQuests,
    visibleMilestoneQuests,
  } = questVisibilityView;
	  const puzzleTokenLines = isInlineMode
	    ? chunkPuzzleTokensByWordLimit(tokens, inlineMaxWordsPerLine)
	    : [tokens];
  const puzzleNavigableTileRows = getPuzzleNavigableTileRows(
    puzzleTokenLines,
    maxWordTileColumns
  );
  const puzzleNavigableTileIndices = puzzleNavigableTileRows.flatMap((row) => row);
  const statsView = getStatsView({
    leaderboardTab,
    profile,
    rankSummary,
    statsTab,
  });
  const {
    activeLeaderboardRank,
    visibleStatsCards,
  } = statsView;
  const unlockedFlairs = profile.unlockedFlairs;
  const equippedFlairStyle = flairChipStyle(profile.activeFlair, true);

  const focusInlineInputProxy = () => {
    const input = inlineInputRef.current;
    if (!input) {
      return;
    }
    input.value = '';
    input.focus({ preventScroll: true });
  };

	  const handleTileSelection = (tileIndex: number) => {
	    if (continuePromptActive) {
	      return;
	    }
	    const currentPuzzle = puzzleRef.current ?? puzzle;
    const nextTileIndex = isGuessableTileAtIndex(currentPuzzle, tileIndex)
      ? tileIndex
      : findNextGuessableTileIndex(currentPuzzle, tileIndex);
    if (nextTileIndex === null) {
      return;
    }
    setSelectedTileIndex(nextTileIndex);
    focusInlineInputProxy();
  };

	  const handleVirtualLetterPress = (letter: string) => {
	    if (busy || continuePromptActive || isGameOver || isComplete) {
      return;
    }
    const currentPuzzle = puzzleRef.current ?? puzzle;
    const tileIndex =
      selectedTile !== null && isGuessableTileAtIndex(currentPuzzle, selectedTile)
        ? selectedTile
        : (puzzleNavigableTileIndices[0] ?? null);
    if (tileIndex === null) {
      showToast('No open letter tiles.');
      return;
    }
    setSelectedTileIndex(tileIndex);
    focusInlineInputProxy();
    enqueueGuess(letter, tileIndex);
  };

  const handleVirtualArrowPress = (key: VirtualArrowKey) => {
    moveSelectedTileByArrow(key);
  };

  const handleInlineInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget.value.toUpperCase();
    const lettersOnly = input.replace(/[^A-Z]/g, '');
    const letter = lettersOnly.charAt(lettersOnly.length - 1);
    event.currentTarget.value = '';
	    if (!letter || busy || continuePromptActive || isGameOver || isComplete) {
      return;
    }
    const tileIndex = selectedTile;
    const currentPuzzle = puzzleRef.current;
    if (tileIndex === null || !currentPuzzle) {
      return;
    }
    const tile = currentPuzzle.tiles[tileIndex];
    if (!tile || !tile.isLetter || tile.isLocked || tile.displayChar !== '_') {
      return;
    }
    enqueueGuess(letter, tileIndex);
  };

  const moveSelectedTileByArrow = (key: string): boolean => {
    if (
      !['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(key) ||
	      busy ||
	      continuePromptActive ||
	      isGameOver ||
      isComplete ||
      puzzleNavigableTileIndices.length === 0
    ) {
      return false;
    }

    if (selectedTile === null) {
      setSelectedTileIndex(
        key === 'ArrowLeft' || key === 'ArrowUp'
          ? (puzzleNavigableTileIndices[puzzleNavigableTileIndices.length - 1] ?? null)
          : (puzzleNavigableTileIndices[0] ?? null)
      );
      focusInlineInputProxy();
      return true;
    }

    const currentIndex = puzzleNavigableTileIndices.indexOf(selectedTile);
    if (currentIndex < 0) {
      const fallbackTileIndex = findAdjacentGuessableTileIndex(
        puzzleRef.current ?? puzzle,
        selectedTile,
        key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1
      );
      setSelectedTileIndex(
        fallbackTileIndex ??
          (key === 'ArrowLeft' || key === 'ArrowUp'
            ? (puzzleNavigableTileIndices[puzzleNavigableTileIndices.length - 1] ?? null)
            : (puzzleNavigableTileIndices[0] ?? null))
      );
      focusInlineInputProxy();
      return true;
    }

    let nextTileIndex: number | undefined;
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      nextTileIndex =
        puzzleNavigableTileIndices[currentIndex + (key === 'ArrowRight' ? 1 : -1)];
    } else {
      const currentRowIndex = puzzleNavigableTileRows.findIndex((row) =>
        row.includes(selectedTile)
      );
      const currentRow = puzzleNavigableTileRows[currentRowIndex];
      const targetRow =
        puzzleNavigableTileRows[currentRowIndex + (key === 'ArrowDown' ? 1 : -1)];
      if (!currentRow || !targetRow) {
        return true;
      }
      const columnIndex = currentRow.indexOf(selectedTile);
      nextTileIndex =
        targetRow[Math.min(Math.max(columnIndex, 0), targetRow.length - 1)];
    }

    if (nextTileIndex === undefined) {
      return true;
    }
    setSelectedTileIndex(nextTileIndex);
    focusInlineInputProxy();
    return true;
  };

  const handleInlineInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!moveSelectedTileByArrow(event.key)) {
      return;
    }
    event.preventDefault();
  };

	  const handleButtonPointerDownCapture = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return;
    }
    playSfx('button');
  };

  const handleButtonKeyDownCapture = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest('button');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return;
    }
    playSfx('button');
  };

  const punctuationVerticalClass = (displayChar: string): string => {
    if (["'", '\u2019', '`', '"'].includes(displayChar)) {
      return 'top-0';
    }
    if (['.', ',', '?', '!', ';', ':'].includes(displayChar)) {
      return 'bottom-0';
    }
    return 'top-1/2 -translate-y-1/2';
  };

  const punctuationGridHeightClass = isInlineMode ? 'h-[38px]' : 'h-[40px]';

  const renderPunctuationTile = (key: string | number, displayChar: string) => (
    <span
      key={key}
      className={cn(
        'relative inline-flex items-center justify-center px-0 py-0 leading-none',
        punctuationGridHeightClass,
        punctuationTileMinWidthClass
      )}
    >
      <span
        className={cn(
          'puzzle-punctuation-mark pointer-events-none absolute leading-none',
          punctuationVerticalClass(displayChar),
          punctuationMarkClass
        )}
      >
        {displayChar}
      </span>
    </span>
  );

  return (
    <div
      onPointerDownCapture={handleButtonPointerDownCapture}
      onKeyDownCapture={handleButtonKeyDownCapture}
      className={cn(
        'theme-app relative h-full w-full overflow-hidden',
        showChallengeBackdrop ? 'challenge-backdrop' : '',
        showChallengeBackdrop ? challengeBackgroundClass : '',
        isHubScreen ? 'home-backdrop' : '',
        isHubScreen ? 'hub-live' : '',
        isHomeScreen ? 'home-live' : '',
        showOutcomeOverlay ? 'result-backdrop' : '',
        showOutcomeOverlay ? 'app-surface-subtle' : ''
      )}
    >
      <div
        className={cn(
          'flex h-full w-full justify-center overflow-hidden',
          isChallengeScreen ? 'challenge-layer' : '',
          isChallengeScreen && !showOutcomeOverlay ? 'challenge-live' : ''
        )}
      >
        <div
          className={`relative h-full w-full overflow-hidden ${frameMaxWidthClass}`}
          data-testid="game-frame"
          data-webview-mode={webViewMode}
        >
        <div className="app-fade-in flex h-full w-full min-w-0 flex-col overflow-hidden" data-testid={layoutTestId}>
          {!showOutcomeOverlay && (
            <header className="px-2 pb-[6px] pt-2">
		              <div className="flex items-center justify-between">
		                <div className="app-text flex items-center gap-1.5 text-[clamp(14px,4.2vw,16px)] font-bold">
                      <HudSprite icon="coin" decorative className="h-[18px] w-[18px]" />
                      <span>{profile.coins}</span>
                    </div>

	                <div className="text-center">
                  {isChallengeScreen ? (
                    <>
	                    <div className="app-text-muted text-[10px] font-bold uppercase">Mistakes</div>
	                      <div className="flex gap-1" data-testid="mistake-indicator">
	                        {Array.from({ length: puzzle.heartsMax }, (_value, index) => (
	                          <span
	                            key={index}
	                            className="app-text flex h-[clamp(20px,6vw,24px)] w-[clamp(20px,6vw,24px)] items-center justify-center rounded-full border app-border-strong text-[clamp(9px,2.3vw,11px)]"
	                          >
	                            {index < mistakesMade ? (
                                  crossMarkEmoji
                                ) : index === protectedMistakeIndex ? (
                                  <PowerupSprite
                                    powerup="shield"
                                    decorative
                                    testId="mistake-shield-indicator"
                                    className="h-[70%] w-[70%]"
                                  />
                                ) : (
                                  ''
                                )}
	                          </span>
	                        ))}
	                      </div>
                    </>
                  ) : (
                    <>
                      <div className="app-text-muted text-[10px] font-bold uppercase">Lives</div>
	                      <div className="flex justify-center gap-1" data-testid="life-indicator">
	                        {hasInfiniteHearts ? (
	                          <span className="flex h-[clamp(24px,7vw,30px)] w-[clamp(24px,7vw,30px)] items-center justify-center text-[clamp(14px,3.6vw,18px)] leading-none">
	                            {infiniteHeartsIcon}
	                          </span>
	                        ) : (
	                          [0, 1, 2].map((index) => (
	                            <span
	                              key={index}
	                              className="flex h-[clamp(24px,7vw,30px)] w-[clamp(24px,7vw,30px)] items-center justify-center"
	                            >
	                              <HudSprite
                                  icon="heart"
                                  decorative
                                  className={cn(
                                    'h-[clamp(18px,5.2vw,22px)] w-[clamp(18px,5.2vw,22px)]',
                                    index < currentLives ? '' : 'grayscale brightness-75 opacity-35'
                                  )}
                                />
	                            </span>
	                          ))
	                        )}
                      </div>
                      <div className="app-text-muted mt-[2px] text-[9px] font-bold uppercase">{lifeStatusText}</div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    data-testid="settings-button"
                    ref={settingsButtonRef}
                    className={`${helpButtonClass} btn-3d btn-neutral btn-info-soft btn-round flex items-center justify-center font-black`}
                    onClick={() => {
                      setIsSettingsOpen((previous) => {
                        const next = !previous;
                        if (next) {
                          setIsHelpOpen(false);
                        }
                        return next;
                      });
                    }}
                    aria-label="Settings"
                    title="Settings"
                  >
                    <UiSprite icon="settings" decorative className={headerIconClass} />
                  </button>
                  <button
                    data-testid="info-button"
                    ref={infoButtonRef}
                    className={`${helpButtonClass} btn-3d btn-neutral btn-info-soft btn-round flex items-center justify-center font-black`}
                    onClick={() =>
                      setIsHelpOpen((previous) => {
                        const next = !previous;
                        if (next) {
                          setIsSettingsOpen(false);
                        }
                        return next;
                      })
                    }
                    aria-label="How to play"
                    title="How to play"
                  >
                    <InfoIcon className={headerIconClass} />
                  </button>
                </div>
              </div>
            </header>
          )}

          {isChallengeScreen && !showOutcomeOverlay && (
            <div className="app-surface-subtle app-text border-y app-border px-3 py-2">
		              <div className="flex items-center justify-between gap-2 text-[14px] font-bold uppercase sm:text-[15px] md:text-[16px]">
		                <span>Plays: {challengeMetrics.plays.toLocaleString()}</span>
		                <span className="text-[8px] sm:text-[15px] md:text-[16px]">
		                  {challengeTypeLabel} lines ({difficultyLabel})
		                </span>
		                <span>Win: {challengeMetrics.winRatePct}%</span>
		              </div>
            </div>
          )}

          {isChallengeScreen && !showOutcomeOverlay && (
            <ChallengePuzzleGrid
              viewportRef={viewportRef}
              contentRef={contentRef}
              isPuzzleVerticallyCentered={isPuzzleVerticallyCentered}
              puzzleScale={puzzleScale}
              puzzleTokenLines={puzzleTokenLines}
              isInlineMode={isInlineMode}
	              gameState={gameState}
	              busy={busy || continuePromptActive}
	              isComplete={isComplete}
	              isGameOver={isGameOver || continuePromptActive}
              pendingGuessByTile={pendingGuessByTile}
              puzzleMarkClass={puzzleMarkClass}
              puzzleTileUnderlineWidthClass={puzzleTileUnderlineWidthClass}
              puzzleCipherClass={puzzleCipherClass}
              punctuationTileMinWidthClass={punctuationTileMinWidthClass}
              punctuationMarkClass={punctuationMarkClass}
              separatorGlyphClass={separatorGlyphClass}
              handleTileSelection={handleTileSelection}
              renderPunctuationTile={renderPunctuationTile}
              getLetterTileClass={letterTileClass}
	              getLetterTileState={letterTileState}
	            />
	          )}

	          {isChallengeScreen && !showOutcomeOverlay && continuePromptActive && (
	            <div className="absolute inset-0 z-50">
	              <div
	                data-testid="continue-prompt-backdrop"
	                className="absolute inset-0 bg-black/45 backdrop-blur-[3px]"
	              />
	              <section
	                data-testid="continue-prompt"
	                role="dialog"
	                aria-modal="true"
	                aria-labelledby="continue-prompt-title"
	                className="pointer-events-auto absolute inset-0 flex items-center justify-center px-4 py-6"
	              >
	                <div className="w-[min(92vw,390px)] rounded-2xl border border-amber-200/80 bg-zinc-950/92 px-4 py-4 text-center shadow-[0_22px_54px_rgba(0,0,0,0.52)] ring-1 ring-white/10 sm:px-5 sm:py-5">
	                  {continueCancelConfirmOpen ? (
	                    <>
	                      <p
	                        id="continue-prompt-title"
	                        className="text-[18px] font-black uppercase leading-tight tracking-[0.04em] text-white sm:text-[22px]"
	                      >
	                        End this run?
	                      </p>
	                      <p className="mx-auto mt-2 max-w-[300px] text-[12px] font-bold leading-snug text-white/72 sm:text-[13px]">
	                        Your current guesses will stay saved as a failed attempt.
	                      </p>
	                      <div className="mt-5 grid grid-cols-2 gap-3">
	                        <button
	                          type="button"
	                          data-testid="continue-prompt-keep-playing"
	                          className="btn-3d btn-neutral min-h-[44px] rounded-xl px-3 text-[11px] font-black uppercase tracking-[0.04em] sm:min-h-[48px] sm:text-[12px]"
	                          onClick={(event) => {
	                            event.preventDefault();
	                            event.stopPropagation();
	                            setContinueCancelConfirmOpen(false);
	                          }}
	                          disabled={busy}
	                        >
	                          Keep Playing
	                        </button>
	                        <button
	                          type="button"
	                          data-testid="continue-prompt-confirm-cancel"
	                          className="btn-3d btn-retry min-h-[44px] rounded-xl px-3 text-[11px] font-black uppercase tracking-[0.04em] sm:min-h-[48px] sm:text-[12px]"
	                          onClick={(event) => {
	                            event.preventDefault();
	                            event.stopPropagation();
	                            finalizeContinuePrompt();
	                          }}
	                          disabled={busy}
	                        >
	                          End Run
	                        </button>
	                      </div>
	                    </>
	                  ) : (
	                    <>
		                      <p
		                        id="continue-prompt-title"
		                        className="text-[18px] font-black uppercase leading-tight tracking-[0.04em] text-white sm:text-[22px]"
		                      >
		                        Try Again?
		                      </p>
		                      <p className="mx-auto mt-2 max-w-[310px] text-[12px] font-bold leading-snug text-white/72 sm:text-[13px]">
		                        Keep your current board and take one more shot.
		                      </p>
		                      <button
		                        type="button"
		                        data-testid="continue-prompt-button"
		                        className="btn-3d btn-primary mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-black uppercase tracking-[0.04em] sm:min-h-[52px] sm:text-[14px]"
		                        onClick={(event) => {
		                          event.preventDefault();
		                          event.stopPropagation();
		                          void retry();
		                        }}
		                        disabled={busy}
		                      >
		                        <span>Continue for</span>
		                        <span className="inline-flex items-center gap-1.5">
		                          <span>{continuePromptPointCost}</span>
		                          <HudSprite icon="coin" decorative className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
		                        </span>
		                      </button>
		                      <div className="mt-3 flex justify-center">
		                        <button
		                          type="button"
		                          data-testid="continue-prompt-cancel"
		                          className="btn-3d btn-neutral min-h-[36px] rounded-lg px-5 text-[10px] font-black uppercase tracking-[0.04em]"
		                          onClick={(event) => {
		                            event.preventDefault();
		                            event.stopPropagation();
		                            setContinueCancelConfirmOpen(true);
	                          }}
	                          disabled={busy}
	                        >
	                          Cancel
	                        </button>
	                      </div>
	                    </>
	                  )}
	                </div>
	              </section>
	            </div>
	          )}

	          {isChallengeScreen && showOutcomeOverlay && (
            <OutcomeOverlay
              showSuccessOverlay={showSuccessOverlay}
              setConfettiCanvasNode={setConfettiCanvasNode}
              completionCrowdAvatarUrls={completionCrowdAvatarUrls}
              completionCrowdReady={completionCrowdReady}
              outcomeCrowdBubbles={outcomeCrowdBubbles}
              handleOutcomeCrowdRef={handleOutcomeCrowdRef}
              setOutcomeCrowdBubbleNode={setOutcomeCrowdBubbleNode}
              criticalOutcomeAvatarCount={criticalOutcomeAvatarCount}
              busy={busy}
              share={share}
              nextChallenge={handleOutcomeNextChallenge}
              isDailyComplete={isDailyComplete}
              retry={retry}
	              openHome={openHome}
	              subredditName={subredditName}
              joiningCommunity={joiningCommunity}
              communityJoinRecorded={communityJoinRecorded}
              communityJoinLabel={communityJoinLabel}
              handleJoinCommunity={handleJoinCommunity}
              completionSolveLabel={completionSolveLabel}
              pointsGainedLabel={pointsGainedLabel}
              ratingDeltaLabel={ratingDeltaLabel}
              ratingDeltaTone={ratingDeltaTone}
              completionQuote={completionQuote}
              puzzleAuthor={puzzle.author}
              hasClaimableQuest={hasClaimableQuest}
              openQuest={openQuest}
            />
          )}
          {isChallengeScreen && !showOutcomeOverlay && (
            <section className={utilityRowClass} data-testid="utility-row">
              <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
                <div data-testid="inline-promo-cluster" className={`relative justify-self-start ${inlinePromoClusterClass}`}>
                  <img
                    data-testid="snoo-presenter"
                    src="/char.webp"
                    alt="Snoo"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    className={`pointer-events-none absolute left-[-12px] z-10 object-contain ${inlineSnooDockClass} ${inlineSnooClass}`}
                  />
	                  {featuredOffer && (
	                    <section data-testid="inline-bundle-card" className={`absolute z-20 ${inlineBundleDockClass}`}>
	                      <button
                        data-testid="offer-card"
                        type="button"
                        className={`btn-3d btn-static btn-neutral app-text pointer-events-auto relative flex shrink-0 flex-col text-left ${inlineBundleCardClass}`}
                        onClick={() => {
                          void handleOfferPurchase();
                        }}
                        disabled={offerBusy}
                        aria-label={`Buy ${featuredOffer.displayName}`}
                        title={featuredOfferView.title}
                      >
                        <div className="flex h-full w-full flex-col justify-center">
                          <div className="mb-1 flex shrink-0 flex-col">
                            <span
                              data-testid="bundle-badge"
                              className={`pointer-events-none font-black uppercase leading-none tracking-[0.02em] ${inlineTight ? 'text-[9px]' : deviceTier === 'desktop' ? 'text-[13px]' : deviceTier === 'tablet' ? 'text-[12px]' : 'text-[11px]'}`}
                            >
                              {featuredOfferView.promotionLabel}
                            </span>
                            <span
                              className={`${inlineTight ? 'text-[7px]' : deviceTier === 'desktop' ? 'text-[9px]' : 'text-[8px]'} mt-0.5 font-semibold leading-none opacity-70`}
                            >
                              {featuredOffer.displayName}
                            </span>
                          </div>
                          <div className={`app-text flex min-h-0 flex-1 flex-col justify-center space-y-0.5 overflow-hidden ${bundleRewardRowTextClass}`}>
                            {featuredOfferView.perks.slice(0, 3).map((perk) => (
                              <div key={perk.key} className="flex items-center font-black leading-none">
                                {'powerup' in perk ? (
                                  <PowerupSprite
                                    powerup={perk.powerup}
                                    decorative
                                    className="h-[12px] w-[12px]"
                                  />
                                ) : (
                                  <HudSprite
                                    icon={perk.sprite}
                                    decorative
                                    className="h-[12px] w-[12px]"
                                  />
                                )}
                                <span className={`ml-1 ${bundleRewardValueTextClass}`}>x{perk.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </button>
	                    </section>
	                  )}
                </div>
                <section
                  data-testid="inline-powerup-grid"
                  className={`justify-self-end ${deviceTier === 'desktop' ? 'pb-3' : 'pb-2'}`}
                >
                  <div
                    data-testid="powerup-list"
                    className={`grid w-fit grid-cols-4 ${deviceTier === 'desktop' ? 'gap-3' : deviceTier === 'tablet' ? 'gap-2.5' : 'gap-2'}`}
                  >
                    {powerupTypes.map((item) => {
                      const count = inventory[item];
                      return (
                        <div key={item} className="flex flex-col items-center gap-1">
                          <div className={`relative shrink-0 ${powerupWrapSizeClass}`}>
                            <button
                              data-testid={`powerup-use-${item}`}
                              className={`btn-3d btn-neutral btn-round flex items-center justify-center leading-none ${powerupButtonSizeClass}`}
                              onClick={() => handleQuickPowerupTap(item)}
	                              disabled={busy || guessBusy || continuePromptActive || isGameOver || isComplete}
                              title={`${powerupLabel[item]} (${count})`}
                              aria-label={`${powerupLabel[item]} (${count})`}
                            >
                              <PowerupSprite
                                powerup={item}
                                decorative
                                testId={`powerup-icon-${item}`}
                                className="h-[68%] w-[68%]"
                              />
                            </button>
                            <span
                              data-testid={`powerup-count-${item}`}
                              className={`powerup-count-chip absolute top-0 right-0 min-w-[18px] translate-x-[20%] -translate-y-[20%] rounded-full px-1.5 text-center text-[10px] font-bold leading-[16px] ${count > 0 ? 'powerup-count-chip-filled' : 'powerup-count-chip-empty'}`}
                            >
                              {count}
                            </span>
                            <button
                              data-testid={`powerup-buy-${item}`}
                              className={`btn-3d btn-static btn-primary btn-powerup-add btn-round absolute right-0 bottom-[8px] translate-x-[20%] translate-y-[20%] font-extrabold leading-none ${inlineTight ? 'h-[16px] w-[16px] text-[11px]' : deviceTier === 'desktop' ? 'h-[20px] w-[20px] text-[13px]' : 'h-[18px] w-[18px] text-[12px]'}`}
	                              disabled={busy || guessBusy || continuePromptActive || isGameOver || isComplete}
                              onClick={() => openBuyDialog(item)}
                              title={`Buy ${powerupLabel[item]}`}
                              aria-label={`Buy ${powerupLabel[item]}`}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </section>
          )}

          {showVirtualKeyboard && (
            <VirtualKeyboardOverlay
	              disabled={busy || continuePromptActive || isGameOver || isComplete}
              deviceTier={deviceTier}
              onLetterPress={handleVirtualLetterPress}
              onArrowPress={handleVirtualArrowPress}
            />
          )}

          {isHomeScreen && (
            <HomeScreen
              deviceTier={deviceTier}
              homeTab={homeTab}
              onHomeTabSelect={handleHomeTabSelect}
              busy={busy}
              formattedLevel={formattedLevel}
              challengeMetrics={challengeMetrics}
              challengeTypeLabel={challengeTypeLabel}
              onPlay={handleHomePlay}
              onPlayEndless={handleHomePlayEndless}
              homePanelClass={homePanelClass}
              endlessCatalogAvailable={endlessCatalogAvailable}
              endlessCategoryFilter={endlessCategoryFilter}
              onEndlessCategoryFilterChange={handleEndlessCategoryFilterChange}
              endlessSort={endlessSort}
              onEndlessSortChange={handleEndlessSortChange}
              endlessCaughtUpMessage={endlessCaughtUpMessage}
              onEndlessCaughtUpHome={handleEndlessCaughtUpHome}
            />
          )}

          {isShopScreen && (
            <Suspense fallback={<LoadingScreen />}>
              <LazyShopScreen
                shopProducts={shopProducts}
                shopError={shopError}
                offerBusy={offerBusy}
                onPurchase={(sku) => void handleProductPurchase(sku)}
                onRetry={() => void loadFeaturedOffer()}
              />
            </Suspense>
          )}

          {isCommunityHubScreen && (
            <Suspense fallback={<LoadingScreen />}>
              <LazyCommunityScreen
                deviceTier={deviceTier}
                isModerator={isModerator}
                notifications={communityNotifications}
                onSubmitted={() => void refreshBootstrapState()}
              />
            </Suspense>
          )}

          {isQuestScreen && (
            <Suspense fallback={<LoadingScreen />}>
              <LazyQuestScreen
                questTab={questTab}
                onTabChange={setQuestTab}
                questLoading={questLoading}
                questStatus={questStatus}
                questError={questError}
                onRetry={() => void loadQuestStatus()}
                visibleDailyQuests={visibleDailyQuests}
                visibleMilestoneQuests={visibleMilestoneQuests}
                claimedQuestIdSet={claimedQuestIdSet}
                claimingQuestId={claimingQuestId}
                onClaimQuest={(questId) => void handleQuestClaim(questId)}
                formatQuestReward={formatQuestReward}
                flairTagStyle={flairTagStyle}
                getQuestProgressValue={getQuestProgressValue}
              />
            </Suspense>
          )}

          {isStatsScreen && (
            <Suspense fallback={<LoadingScreen />}>
              <LazyStatsScreen
                statsTab={statsTab}
                onTabChange={setStatsTab}
                visibleStatsCards={visibleStatsCards}
                profile={profile}
                unlockedFlairs={unlockedFlairs}
                equippedFlairStyle={equippedFlairStyle}
                flairChipStyle={flairChipStyle}
                flairSaveBusy={flairSaveBusy}
                onSetActiveFlair={(flair) => void handleSetActiveFlair(flair)}
              />
            </Suspense>
          )}

          {isLeaderboardScreen && (
            <Suspense fallback={<LoadingScreen />}>
              <LazyLeaderboardScreen
                leaderboardTab={leaderboardTab}
                onTabChange={setLeaderboardTab}
                currentUserRank={activeLeaderboardRank}
                formatLeaderboardName={formatLeaderboardName}
                formatStatDuration={formatStatDuration}
              />
            </Suspense>
          )}

          {!isChallengeScreen && (
            <BottomNav
              isShopScreen={isShopScreen}
              isHomeScreen={isHomeScreen}
              isCommunityScreen={isCommunityHubScreen}
              isQuestScreen={isQuestScreen}
              isStatsScreen={isStatsScreen}
              isLeaderboardScreen={isLeaderboardScreen}
              hasClaimableQuest={hasClaimableQuest}
              communityNotificationCount={communityNotificationCount}
              onOpenShop={openShop}
              onOpenHome={openHome}
              onOpenCommunity={openCommunity}
              onOpenQuest={openQuest}
              onOpenStats={openStats}
              onOpenLeaderboard={openLeaderboard}
            />
          )}
        </div>

          </div>
      </div>

      {isChallengeScreen && (
        <input
          ref={inlineInputRef}
          data-testid="inline-input-proxy"
          inputMode="none"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px opacity-0"
          onChange={handleInlineInputChange}
          onKeyDown={handleInlineInputKeyDown}
	          disabled={busy || continuePromptActive || isGameOver || isComplete}
        />
      )}

      {isHelpOpen && (
        <HelpOverlay
          deviceTier={deviceTier}
          helpCardWidthClass={helpCardWidthClass}
          helpCardRef={helpCardRef}
          onClose={() => setIsHelpOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsOverlay
          deviceTier={deviceTier}
          helpCardWidthClass={helpCardWidthClass}
          settingsCardRef={settingsCardRef}
          audioEnabled={sfxEnabled}
          audioBusy={audioPreferenceBusy}
          onToggleAudio={handleAudioToggle}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {buyDialog && (
        <BuyDialog
          buyDialog={buyDialog}
          buyMax={buyMax}
          chips={buyDialogChips}
          busy={busy}
          unitPrice={buyDialogUnitPrice}
          remainingLetters={buyDialogRemainingLetters}
          difficultyLabel={difficultyLabel}
          powerupValidity={buyDialogPowerupValidity}
          onSelectQuantity={(quantity) =>
            setBuyDialog((previous) =>
              previous ? { ...previous, quantity } : previous
            )
          }
          onCancel={() => setBuyDialog(null)}
          onConfirm={confirmBuy}
        />
      )}
      {heartPurchaseDialogOpen && profile && (
        <HeartPurchaseDialog
          coins={profile.coins}
          busy={heartPurchaseBusy}
          limitReached={coinHeartLimitReached}
          purchasesToday={heartPurchaseLimitStatus?.purchasesToday ?? 0}
          maxPurchasesPerDay={heartPurchaseLimitStatus?.maxPurchasesPerDay ?? 2}
          limitResetTs={
            heartPurchaseLimitStatus?.limitResetTs ??
            Date.now() + 24 * 60 * 60 * 1000
          }
          onRefill={() => void handleCoinHeartRefill()}
          onTopUp={() => void handleCoinHeartTopUp()}
          onOpenShopPackages={openHeartShopPackages}
          onCancel={() => setHeartPurchaseDialogOpen(false)}
        />
      )}
    </div>
  );
};

