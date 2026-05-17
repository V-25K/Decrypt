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
import type {
  ConfettiLauncher,
  Options as CanvasConfettiOptions,
} from 'canvas-confetti';
import {
  chunkPuzzleTokensByWordLimit,
  cn,
  getPuzzleNavigableTileRows,
  tokenizePuzzleTiles,
} from '../utils';
import {
  getChallengeBackgroundAsset,
  getStableChallengeBackgroundIndex,
} from './challenge-backgrounds';
import { getAppViewState } from './app-view-state';
import {
  buildActiveChallengeSessionPatch,
  buildCompleteChallengeSessionPatch,
  buildGameOverChallengeSessionPatch,
  buildRestoredOutcomeSessionPatch,
  challengeSessionReducer,
  initialChallengeSessionState,
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
  preloadImageAsset,
  preloadImageBatch,
  warmImagePreloads,
} from './asset-preload';
import {
  coinEmoji,
  coinHeartRefillCost,
  coinHeartTopUpCost,
  challengeHeartbeatIntervalMs,
  confettiPalette,
  crossMarkEmoji,
  heartEmoji,
  infiniteHeartsIcon,
  inlineMaxWordsPerLine,
  maxWordTileColumns,
  maxOutcomeCrowdAvatars,
  powerupLabel,
} from './constants';
import {
  getDailyRetryQuote,
  getPowerupPrice,
} from '../../shared/game-balance';
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
  RetryDialogState,
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
import { RetryDialog } from '../components/RetryDialog';
import { HeartPurchaseDialog } from '../components/HeartPurchaseDialog';
import { LoadingScreen } from '../components/LoadingScreen';
import { HomeScreen } from '../screens/HomeScreen';
import {
  clearCorrectGuessIndices,
  consumeExpandedScreenIntent,
  migrateSessionStorageForUser,
  persistCorrectGuessIndices,
  persistOutcomeState,
  readEntrypointScreen,
  readOutcomeState,
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
  buildOutcomeCrowdBubbles,
  syncOutcomeCrowdNodePosition,
  type OutcomeCrowdBubble,
  type OutcomeCrowdViewport,
} from './outcome-crowd';
import {
  flairChipStyle,
  flairTagStyle,
  formatChallengeType,
  formatDifficultyLabel,
  formatLeaderboardName,
  formatQuestReward,
  formatStatDuration,
} from './game-formatters';
import { getBonusTimerView } from './bonus-timer-view';
import { getFeaturedOfferView } from './featured-offer-view';
import {
  canBuyCoinHeartsFromState,
  getHeartState,
} from './heart-state';
import { getQuestVisibilityView } from './quest-view';
import { getResponsiveLayoutState } from './responsive-layout';
import { getStatsView } from './stats-view';
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
  buildGuessSessionPatch,
  getRevealedIndicesForAnimation,
  getRevealedTilesFromGuessResult,
  isLockedGuessResult,
  removePendingGuessEntries,
  shouldRefreshPuzzleViewAfterGuess,
} from './guess-result';
import {
  applyRevealedTiles,
  buildCompletionQuote,
  countRemainingLetters,
  hasAvailableLetters,
} from './puzzle-view';
import { readRestoredCorrectGuessFeedback } from './server-puzzle-view';
import {
  isSuccessfulOrderStatus,
  pickPromotedOffer,
  toPurchaseErrorMessage,
} from './purchase-flow';
import {
  buildRetryDialogState,
  getRetryAction,
} from './retry-flow';
import {
  hasActiveGuessWork,
  isBusyOrGuessBlocked,
  isOfferPurchaseBlocked,
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
  '/ui_home.png',
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
const outcomeCrowdFallbackReadyMs = 650;
const nonCriticalWarmupDelayMs = 180;
const nonCriticalWarmupTimeoutMs = 1400;
const isLayoutlessTestEnv =
  typeof navigator !== 'undefined' && /jsdom|happy-dom/i.test(navigator.userAgent);

const readOutcomeCrowdViewport = (
  node: HTMLElement
): OutcomeCrowdViewport | null => {
  const bounds = node.getBoundingClientRect();
  const width = Math.round(bounds.width);
  const height = Math.round(bounds.height);
  if (width > 0 && height > 0) {
    return { width, height };
  }
  if (isLayoutlessTestEnv) {
    return { width: 500, height: 300 };
  }
  return null;
};

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

const canUseCanvasConfetti = (): boolean =>
  typeof navigator === 'undefined' || !/jsdom/i.test(navigator.userAgent);

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

const canInitializeConfettiCanvas = (_canvas: HTMLCanvasElement): boolean => {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.userAgent === 'string' &&
    /jsdom/i.test(navigator.userAgent)
  ) {
    return false;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  return true;
};

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

const formatLevelNumber = (rawLevelId: string): string => {
  const match = rawLevelId.match(/(\d+)$/);
  if (!match || !match[1]) {
    return rawLevelId;
  }
  return `${Number(match[1])}`;
};

const buyChips = (maxQuantity: number) => [
  { id: '1', label: '+1', quantity: 1, disabled: maxQuantity < 1 },
  { id: '3', label: '+3', quantity: 3, disabled: maxQuantity < 3 },
  { id: '5', label: '+5', quantity: 5, disabled: maxQuantity < 5 },
  { id: 'max', label: 'MAX', quantity: maxQuantity, disabled: maxQuantity < 1 },
];

const powerupTypes: PowerupType[] = ['hammer', 'wand', 'shield', 'rocket'];

type PowerupValidity = {
  valid: boolean;
  reason: string | null;
};

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

const hasChallengeActivity = (session: ChallengeSessionTiming): boolean =>
  session.guessCount > 0 || session.usedPowerups > 0 || session.mistakesMade > 0;

const defaultChallengeMetrics: ChallengeMetrics = {
  plays: 0,
  wins: 0,
  winRatePct: 0,
};

const escapeSvgText = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toUsernameAvatarDataUrl = (rawLabel: string): string => {
  const label = rawLabel.trim().length > 0 ? rawLabel.trim() : 'Player';
  const normalized = label.replace(/[^a-z0-9]/gi, '');
  const initialsRaw = normalized.slice(0, 2).toUpperCase();
  const initials = initialsRaw.length > 0 ? initialsRaw : 'P';
  const shortName =
    label.length <= 10 ? label : `${label.slice(0, 9).trim()}...`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text x="50" y="46" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-weight="900" font-size="34" fill="rgba(0,0,0,0.82)">${escapeSvgText(initials)}</text>
  <text x="50" y="74" text-anchor="middle" dominant-baseline="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-weight="800" font-size="12" fill="rgba(0,0,0,0.7)">${escapeSvgText(shortName)}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const GameApp = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [guessInFlight, setGuessInFlight] = useState(false);
  const [queuedGuessCount, setQueuedGuessCount] = useState(0);
  const [pendingGuessByTile, setPendingGuessByTile] = useState<Map<number, string>>(
    () => new Map()
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [subredditName, setSubredditName] = useState<string | null>(null);
  const [endlessCatalogStatus, setEndlessCatalogStatus] =
    useState<EndlessCatalogStatus | null>(null);
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
  const [challengeStartTs, setChallengeStartTs] = useState<number | null>(null);
  const [completionCrowdAvatarUrls, setCompletionCrowdAvatarUrls] = useState<string[]>([]);
  const [completionCrowdReady, setCompletionCrowdReady] = useState(false);
  const [completionCelebrationId, setCompletionCelebrationId] = useState(0);
  const [outcomeCrowdViewport, setOutcomeCrowdViewport] = useState<OutcomeCrowdViewport>(() => {
    return {
      width: isLayoutlessTestEnv ? 500 : 0,
      height: isLayoutlessTestEnv ? 300 : 0,
    };
  });
  const [outcomeCrowdBubbles, setOutcomeCrowdBubbles] = useState<OutcomeCrowdBubble[]>([]);
  const [featuredOffer, setFeaturedOffer] = useState<StoreProduct | null>(null);
  const [shopProducts, setShopProducts] = useState<StoreProduct[]>([]);
  const [shopError, setShopError] = useState<string | null>(null);
  const [offerBusy, setOfferBusy] = useState(false);
  const [webViewMode, setWebViewMode] = useState<'inline' | 'expanded'>(() => getWebViewMode());
  const [activeScreen, setActiveScreen] = useState<AppScreen>(() =>
    getWebViewMode() === 'expanded'
      ? (readEntrypointScreen() ?? consumeExpandedScreenIntent() ?? 'challenge')
      : 'challenge'
  );
  const [buyDialog, setBuyDialog] = useState<BuyDialogState | null>(null);
  const [retryDialog, setRetryDialog] = useState<RetryDialogState | null>(null);
  const [puzzleScale, setPuzzleScale] = useState(1);
  const [isPuzzleVerticallyCentered, setIsPuzzleVerticallyCentered] = useState(true);
  const [challengeMetrics, setChallengeMetrics] = useState<ChallengeMetrics>(defaultChallengeMetrics);
  const [dailyRetryCount, setDailyRetryCount] = useState(0);
  const [nextDailyRetryCost, setNextDailyRetryCost] = useState(0);
  const [nextDailyRetryScoreFactor, setNextDailyRetryScoreFactor] = useState(1);
  const [requiresPaidRetry, setRequiresPaidRetry] = useState(false);
  const [heartPurchaseBusy, setHeartPurchaseBusy] = useState(false);
  const [coinHeartLimitReached, setCoinHeartLimitReached] = useState(false);
  const [heartPurchaseLimitStatus, setHeartPurchaseLimitStatus] =
    useState<HeartPurchaseLimitStatus | null>(null);
  const [heartPurchaseDialogOpen, setHeartPurchaseDialogOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [headerNowTs, setHeaderNowTs] = useState(() => Date.now());
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => isSfxEnabled());
  const [audioPreferenceBusy, setAudioPreferenceBusy] = useState(false);
  const [questStatus, setQuestStatus] = useState<QuestStatus | null>(null);
  const [questLoading, setQuestLoading] = useState(false);
  const [questError, setQuestError] = useState<string | null>(null);
  const [questTab, setQuestTab] = useState<'daily' | 'milestone'>('daily');
  const [flairSaveBusy, setFlairSaveBusy] = useState(false);
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
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [joiningCommunity, setJoiningCommunity] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('daily');
  const [statsTab, setStatsTab] = useState<StatsTab>('daily');
  const [homeTab, setHomeTab] = useState<HomeTab>('daily');
  const [rankSummary, setRankSummary] = useState<RankSummary | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiLauncherRef = useRef<ConfettiLauncher | null>(null);
  const outcomeCrowdRef = useRef<HTMLElement | null>(null);
  const outcomeCrowdBubblesRef = useRef<OutcomeCrowdBubble[]>([]);
  const outcomeCrowdNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
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
  const communityJoinRecorded = profile?.communityJoinRecorded === true;
  const communityJoinLabel = joiningCommunity
    ? 'Joining...'
    : communityJoinRecorded
      ? 'Joined'
      : 'Subscribe';
  const isChallengeScreen = activeScreen === 'challenge';
  const challengeBackgroundKey = puzzle?.levelId || levelId;
  const challengeBackgroundIndex = useMemo(
    () => getStableChallengeBackgroundIndex(challengeBackgroundKey),
    [challengeBackgroundKey]
  );

  useEffect(() => {
    if (!isChallengeScreen) {
      return;
    }
    warmImagePreloads([getChallengeBackgroundAsset(challengeBackgroundIndex)], {
      fetchPriority: 'high',
    });
  }, [challengeBackgroundIndex, isChallengeScreen]);
  const challengeBackgroundClass = useMemo(
    () => `challenge-backdrop-img-${challengeBackgroundIndex + 1}`,
    [challengeBackgroundIndex]
  );

  const tokens = useMemo(() => (puzzle ? tokenizePuzzleTiles(puzzle.tiles) : []), [puzzle]);
  const formattedLevel = useMemo(() => formatLevelNumber(levelId), [levelId]);
  const challengeTypeLabel = useMemo(
    () => formatChallengeType(puzzle?.challengeType),
    [puzzle?.challengeType]
  );
  const endlessCatalogAvailable = endlessCatalogStatus?.available === true;
  const difficultyLabel = useMemo(
    () => formatDifficultyLabel(puzzle?.difficulty),
    [puzzle?.difficulty]
  );
  const handleOutcomeCrowdRef = useCallback((node: HTMLElement | null) => {
    outcomeCrowdRef.current = node;
    if (!node) {
      return;
    }
    const viewport = readOutcomeCrowdViewport(node);
    if (viewport) {
      setOutcomeCrowdViewport(viewport);
    }
  }, []);
  const setOutcomeCrowdBubbleNode = useCallback(
    (id: string, node: HTMLDivElement | null) => {
      const nodes = outcomeCrowdNodesRef.current;
      if (!node) {
        nodes.delete(id);
        return;
      }
      nodes.set(id, node);
      const bubble = outcomeCrowdBubblesRef.current.find((entry) => entry.id === id);
      if (!bubble) {
        return;
      }
      syncOutcomeCrowdNodePosition(node, bubble);
    },
    []
  );

  const setConfettiCanvasNode = useCallback(
    (node: HTMLCanvasElement | null) => {
      confettiCanvasRef.current = node;
      confettiLauncherRef.current = null;
      if (!node) {
        return;
      }
      if (!canInitializeConfettiCanvas(node)) {
        return;
      }
      void (async () => {
        try {
          const module = await import('canvas-confetti');
	          if (confettiCanvasRef.current !== node) {
	            return;
	          }
	          const createConfetti = module.default.create;
	          if (!createConfetti) {
	            return;
	          }
	          confettiLauncherRef.current = createConfetti(node, {
	            resize: true,
	            useWorker: true,
	          });
        } catch (_error) {
          try {
            const module = await import('canvas-confetti');
	            if (confettiCanvasRef.current !== node) {
	              return;
	            }
	            const createConfetti = module.default.create;
	            if (!createConfetti) {
	              return;
	            }
	            confettiLauncherRef.current = createConfetti(node, {
	              resize: true,
	              useWorker: false,
	            });
          } catch (_fallbackError) {
            confettiLauncherRef.current = null;
          }
        }
      })();
    },
    []
  );

  const fireConfettiBurst = useCallback((options: CanvasConfettiOptions) => {
    const sharedOptions: CanvasConfettiOptions = {
      colors: confettiPalette,
      disableForReducedMotion: true,
      scalar: 1.6,
      gravity: 0.82,
      decay: 0.93,
      ticks: 220,
      shapes: ['square'],
      ...options,
    };
    const launcher = confettiLauncherRef.current;
    if (!launcher) {
      if (!canUseCanvasConfetti()) {
        return;
      }
      void (async () => {
        try {
          const module = await import('canvas-confetti');
          await module.default(sharedOptions);
        } catch (_error) {
          // Best effort only.
        }
      })();
      return;
    }
    void launcher(sharedOptions);
  }, []);

  const launchCompletionConfetti = useCallback(() => {
    fireConfettiBurst({
      particleCount: 34,
      angle: 58,
      spread: 34,
      startVelocity: 31,
      drift: 0.14,
      origin: { x: 0.05, y: 0.98 },
    });
    fireConfettiBurst({
      particleCount: 34,
      angle: 122,
      spread: 34,
      startVelocity: 31,
      drift: -0.14,
      origin: { x: 0.95, y: 0.98 },
    });
    window.setTimeout(() => {
      fireConfettiBurst({
        particleCount: 26,
        angle: 64,
        spread: 28,
        startVelocity: 27,
        drift: 0.12,
        origin: { x: 0.08, y: 0.98 },
      });
      fireConfettiBurst({
        particleCount: 26,
        angle: 116,
        spread: 28,
        startVelocity: 27,
        drift: -0.12,
        origin: { x: 0.92, y: 0.98 },
      });
    }, 110);
  }, [fireConfettiBurst]);

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
    setGuessInFlight(false);
    setQueuedGuessCount(0);
    setPendingGuessByTile(new Map());
  }, [levelId, isGameOver, isComplete]);

  const refreshBootstrapState = useCallback(async () => {
    const bootstrap = await trpc.game.bootstrap.query();
    currentUserIdRef.current = bootstrap.userId;
    migrateSessionStorageForUser(bootstrap.userId);
    setProfile(bootstrap.profile);
    setInventory(bootstrap.inventory);
    setSubredditName(bootstrap.subredditName);
    setEndlessCatalogStatus(bootstrap.endlessCatalog);
    return bootstrap;
  }, []);

  const applyDailyRetryState = useCallback(
    (state: Pick<
	      RouterOutputs['game']['loadLevel'],
	      | 'retryCount'
	      | 'nextRetryCost'
	      | 'nextRetryScoreFactor'
	      | 'requiresPaidRetry'
	    >) => {
	      setDailyRetryCount(state.retryCount);
	      setNextDailyRetryCost(state.nextRetryCost);
	      setNextDailyRetryScoreFactor(state.nextRetryScoreFactor);
	      setRequiresPaidRetry(state.requiresPaidRetry);
	    },
    []
  );

  const loadCompletionSolveSecondsFromDatabase = useCallback(async (
    levelIdToLookup: string
  ): Promise<number | null> => {
    try {
      const outcome = await trpc.game.getCompletedOutcome.query({
        levelId: levelIdToLookup,
      });
      return typeof outcome?.solveSeconds === 'number' ? outcome.solveSeconds : null;
    } catch (_error) {
      return null;
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
  }, []);

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
  }, []);

  const loadRankSummary = useCallback(async () => {
    try {
      const summary = await trpc.leaderboard.getRankSummary.query({});
      setRankSummary(summary);
    } catch (_error) {
      setRankSummary(null);
    }
  }, []);

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

  const getCurrentPowerupUnitPrice = useCallback(
    (item: PowerupType, currentPuzzle: Puzzle | null): number => {
      const pricingContext = {
        remainingLetters: countRemainingLetters(currentPuzzle),
        ...(currentPuzzle ? { difficulty: currentPuzzle.difficulty } : {}),
      };
      return getPowerupPrice(item, pricingContext);
    },
    []
  );

  const getPowerupValidity = useCallback(
    (item: PowerupType): PowerupValidity => {
      if (!puzzle) {
        return { valid: false, reason: 'Level data is unavailable.' };
      }
      const unrevealedUnlockedTiles = puzzle.tiles.filter(
        (tile) => tile.isLetter && tile.displayChar === '_' && !tile.isLocked
      );
      const unlockedIncompleteWords = tokens.filter(
        (token) =>
          token.type === 'word' &&
          token.tiles.some(
            (tile) =>
              tile.isLetter &&
              tile.displayChar === '_' &&
              !tile.isLocked &&
              !tile.isBlind
          )
      );

      switch (item) {
        case 'hammer':
          return unrevealedUnlockedTiles.length === 0
            ? { valid: false, reason: 'No unlocked tiles left to reveal.' }
            : { valid: true, reason: null };
        case 'wand':
          return unlockedIncompleteWords.length === 0
            ? { valid: false, reason: 'No unlocked words available.' }
            : { valid: true, reason: null };
        case 'rocket':
          return unrevealedUnlockedTiles.length < 3
            ? { valid: false, reason: 'Not enough unlocked tiles for Rocket.' }
            : { valid: true, reason: null };
        case 'shield':
          return isShieldActive
            ? { valid: false, reason: 'Shield is already active.' }
            : { valid: true, reason: null };
      }
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
      setChallengeStartTs(
        hasChallengeActivity(session.session) ? session.session.startTimestamp : null
      );
      if (storageUserId) {
        persistOutcomeState(storageUserId, null);
      }
      clearTileFeedback({ resetSelection: true });
      return true;
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to start level.';
      if (message.toLowerCase().includes('no lives left')) {
        await refreshBootstrapState();
        showToast(message);
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
  }, [clearTileFeedback, patchChallengeSession, refreshBootstrapState]);

  const loadLevel = async (nextMode: 'daily' | 'endless') => {
    patchChallengeSession({
      isComplete: false,
      isGameOver: false,
      isShieldActive: false,
    });
    setBusy(true);
    try {
      const loaded = await trpc.game.loadLevel.query({
        mode: nextMode,
      });
      patchChallengeSession({ mode: nextMode, levelId: loaded.levelId });
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
        setCompletionResult(null);
        setCompletionSolveSeconds(
          await loadCompletionSolveSecondsFromDatabase(loaded.levelId)
        );
        if (storageUserId) {
          persistOutcomeState(
            storageUserId,
            buildPersistedCompleteOutcomeState({
              levelId: loaded.levelId,
              completion: null,
              solveSeconds: null,
            })
          );
        }
      } else if (outcomeDecision === 'show-paid-retry') {
        const storageUserId = currentUserIdRef.current;
        patchChallengeSession(
          buildGameOverChallengeSessionPatch(loaded.puzzle.heartsMax)
        );
        setCompletionResult(null);
        setCompletionSolveSeconds(null);
        setChallengeStartTs(null);
        clearTileFeedback();
        if (storageUserId) {
          persistOutcomeState(
            storageUserId,
            buildPersistedGameOverOutcomeState(loaded.levelId)
          );
        }
      } else {
        await startLevel(loaded.levelId, nextMode);
      }
      await refreshCurrentView(loaded.levelId);
    } finally {
      setBusy(false);
    }
  };

  const finishLevel = async () => {
    if (completionInProgressRef.current) {
      return;
    }
    completionInProgressRef.current = true;
    const activeLevelId = levelId;
    const activeMode = mode;
    setBusy(true);
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
      const retryQuote = getDailyRetryQuote({
        retryCount: result.retryCount,
        difficulty: puzzle?.difficulty,
      });
      setProfile(result.profile);
      setInventory(result.inventory);
      setDailyRetryCount(result.retryCount);
      setNextDailyRetryCost(retryQuote.nextRetryCost);
      setNextDailyRetryScoreFactor(retryQuote.nextRetryScoreFactor);
      setRequiresPaidRetry(false);
      patchChallengeSession({ isComplete: completed, isGameOver: false });
      setCompletionResult(completed ? result : null);
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
      setBusy(false);
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
      setLoading(true);
      setBusy(true);
      setBootstrapError(null);
      try {
        const [loaded, bootstrap] = await Promise.all([
          trpc.game.loadLevel.query({ mode: 'daily' }),
          refreshBootstrapState(),
        ]);
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
        patchChallengeSession({ mode: 'daily', levelId: loaded.levelId });
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
          const restoredSolveSeconds =
            resolvePersistedOutcomeSolveSeconds(restoredOutcome);
          setCompletionSolveSeconds(
            restoredSolveSeconds ??
              (await loadCompletionSolveSecondsFromDatabase(loaded.levelId))
          );
          setChallengeStartTs(null);
          clearTileFeedback();
        } else if (outcomeDecision.branch === 'show-paid-retry') {
          patchChallengeSession(
            buildGameOverChallengeSessionPatch(loaded.puzzle.heartsMax)
          );
          setCompletionResult(null);
          setCompletionSolveSeconds(null);
          setChallengeStartTs(null);
          clearTileFeedback();
          persistOutcomeState(
            storageUserId,
            buildPersistedGameOverOutcomeState(loaded.levelId)
          );
        } else if (outcomeDecision.branch === 'already-completed') {
          clearCorrectGuessIndices(storageUserId, loaded.levelId);
          patchChallengeSession(
            buildCompleteChallengeSessionPatch(loaded.puzzle.heartsMax)
          );
          setCompletionResult(null);
          setCompletionSolveSeconds(
            await loadCompletionSolveSecondsFromDatabase(loaded.levelId)
          );
          setChallengeStartTs(null);
          clearTileFeedback();
        } else {
          await startLevel(loaded.levelId, 'daily');
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
          setBootstrapError(
            error instanceof Error && error.message.trim().length > 0
              ? `Unable to start Decrypt: ${error.message}`
              : 'Unable to start Decrypt right now.'
          );
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          setLoading(false);
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
    loadCompletionSolveSecondsFromDatabase,
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
    setHeaderNowTs(Date.now());
    const intervalId = window.setInterval(() => {
      setHeaderNowTs(Date.now());
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
      return;
    }
    const nextScreen = readEntrypointScreen() ?? consumeExpandedScreenIntent() ?? 'challenge';
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
    const syncViewportWidth = () => setViewportWidth(window.innerWidth);
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
  }, [isHelpOpen, isSettingsOpen]);

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
  }, [isHelpOpen]);

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
  }, [isSettingsOpen]);

  useEffect(() => {
    const fitPuzzle = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) {
        return;
      }
      const widthRatio = viewport.clientWidth / content.scrollWidth;
      const heightRatio = viewport.clientHeight / content.scrollHeight;
      const nextScale = Math.min(1, widthRatio, heightRatio);
      setPuzzleScale(nextScale);
      const scaledContentHeight = content.scrollHeight * nextScale;
      setIsPuzzleVerticallyCentered(scaledContentHeight <= viewport.clientHeight - 6);
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
    let cancelled = false;
    if (!isComplete) {
      setCompletionCrowdAvatarUrls([]);
      setOutcomeCrowdBubbles([]);
      return () => {
        cancelled = true;
      };
    }
    const loadCrowd = async () => {
      try {
        const leaderboard = await trpc.leaderboard.getLevel.query({
          levelId,
          limit: maxOutcomeCrowdAvatars,
        });
        if (cancelled) {
          return;
        }
        const avatars = leaderboard.entries.map((entry) => {
          const rawUrl = entry.snoovatarUrl;
          if (typeof rawUrl === 'string' && rawUrl.trim().length > 0) {
            return rawUrl;
          }
          return toUsernameAvatarDataUrl(formatLeaderboardName(entry));
        });
        warmImagePreloads(
          avatars.filter((url) => !url.startsWith('data:image/svg+xml')),
          {
          fetchPriority: 'high',
          }
        );
        setCompletionCrowdAvatarUrls(avatars);
      } catch (_error) {
        if (!cancelled) {
          setCompletionCrowdAvatarUrls([]);
        }
      }
    };
    void loadCrowd();
    return () => {
      cancelled = true;
    };
  }, [isComplete, levelId, subredditName]);

  useEffect(() => {
    if (activeScreen !== 'challenge' || !isComplete || !completionCrowdReady) {
      setOutcomeCrowdViewport({ width: 0, height: 0 });
      return;
    }
    const crowdElement = outcomeCrowdRef.current;
    if (!crowdElement) {
      return;
    }
    let retryFrameId = 0;
    const syncViewport = () => {
      const viewport = readOutcomeCrowdViewport(crowdElement);
      if (viewport) {
        setOutcomeCrowdViewport((previous) =>
          previous.width === viewport.width && previous.height === viewport.height
            ? previous
            : viewport
        );
        return;
      }
      retryFrameId = window.requestAnimationFrame(syncViewport);
    };
    syncViewport();
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => syncViewport())
        : null;
    observer?.observe(crowdElement);
    window.addEventListener('resize', syncViewport);
    return () => {
      window.cancelAnimationFrame(retryFrameId);
      observer?.disconnect();
      window.removeEventListener('resize', syncViewport);
    };
  }, [activeScreen, isComplete, completionCrowdAvatarUrls.length, completionCrowdReady]);

  useEffect(() => {
    const outcomeCrowdWidth = outcomeCrowdViewport.width;
    const outcomeCrowdHeight = outcomeCrowdViewport.height;
    if (
      activeScreen !== 'challenge' ||
      !isComplete ||
      outcomeCrowdWidth <= 0 ||
      outcomeCrowdHeight <= 0
    ) {
      outcomeCrowdBubblesRef.current = [];
      setOutcomeCrowdBubbles([]);
      setCompletionCrowdReady(false);
      return;
    }
    if (completionCrowdAvatarUrls.length === 0) {
      outcomeCrowdBubblesRef.current = [];
      setOutcomeCrowdBubbles([]);
      setCompletionCrowdReady(true);
      return;
    }

    const viewport = { width: outcomeCrowdWidth, height: outcomeCrowdHeight };
    const bubbles = buildOutcomeCrowdBubbles(completionCrowdAvatarUrls, viewport);
    outcomeCrowdBubblesRef.current = bubbles;
    setOutcomeCrowdBubbles(bubbles);
    const nodes = outcomeCrowdNodesRef.current;
    for (const bubble of bubbles) {
      const node = nodes.get(bubble.id);
      if (!node) {
        continue;
      }
      syncOutcomeCrowdNodePosition(node, bubble);
    }
  }, [activeScreen, isComplete, completionCrowdAvatarUrls, outcomeCrowdViewport]);

  useEffect(() => {
    if (!isComplete) {
      setCompletionCrowdReady(false);
      return;
    }
    if (completionCrowdAvatarUrls.length === 0) {
      setCompletionCrowdReady(true);
      return;
    }
    let cancelled = false;
    const urls = completionCrowdAvatarUrls.slice(0, maxOutcomeCrowdAvatars);
    const criticalUrls = urls.slice(0, Math.min(criticalOutcomeAvatarCount, urls.length));
    warmImagePreloads(urls, {
      fetchPriority: 'high',
      timeoutMs: 1900,
    });
    const fallback = window.setTimeout(() => {
      if (!cancelled) {
        setCompletionCrowdReady(true);
      }
    }, outcomeCrowdFallbackReadyMs);
    void Promise.all(
      criticalUrls.map((url) =>
        preloadImageAsset(url, { fetchPriority: 'high', timeoutMs: 1300 })
      )
    ).then(() => {
      if (!cancelled) {
        window.clearTimeout(fallback);
        setCompletionCrowdReady(true);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [isComplete, completionCrowdAvatarUrls]);

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
    setPendingGuessByTile((previous) =>
      removePendingGuessEntries(previous, tileIndex, revealedTiles)
    );
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
    patchChallengeSession(buildGuessSessionPatch(result));
    const shouldRefresh = shouldRefreshPuzzleViewAfterGuess(result);
    const viewPromise = shouldRefresh ? refreshCurrentView(levelId) : null;
    if (result.newlyUnlockedChainIds.length > 0) {
      showToast('Locks unlocked.');
    }
      if (result.isLevelComplete) {
        await finishLevel();
      } else if (result.isGameOver) {
        setRequiresPaidRetry(mode === 'daily');
        setCompletionResult(null);
        setCompletionSolveSeconds(null);
        await refreshBootstrapState();
        const storageUserId = currentUserIdRef.current;
        if (storageUserId) {
          persistOutcomeState(
            storageUserId,
            buildPersistedGameOverOutcomeState(levelId)
          );
        }
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
    if (busy || isComplete || isGameOver) {
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
    if (!canUseLifeForChallenge) {
      showToast('No lives left. Wait for refill.');
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
    } catch (_error) {
      showToast('Guess failed.');
      return null;
    }
  };

  const processGuessQueue = async () => {
    if (processingGuessRef.current) {
      return;
    }
    processingGuessRef.current = true;
    setGuessInFlight(true);
    try {
      let stopProcessing = false;
      while (guessQueueRef.current.length > 0) {
        const batch = guessQueueRef.current.splice(0, guessQueueRef.current.length);
        setQueuedGuessCount(guessQueueRef.current.length);
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
              setQueuedGuessCount(0);
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
                setQueuedGuessCount(0);
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
                setQueuedGuessCount(0);
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
                setQueuedGuessCount(0);
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
      setGuessInFlight(false);
      setQueuedGuessCount(guessQueueRef.current.length);
    }
  };

	  const enqueueGuess = (letter: string, tileIndex: number) => {
		    setPendingGuessByTile((previous) => {
		      const next = new Map(previous);
		      next.set(tileIndex, letter);
      return next;
    });
    guessQueueRef.current.push({ levelId, tileIndex, letter });
	    setQueuedGuessCount(guessQueueRef.current.length);
	    void processGuessQueue();
	  };

  const handleUsePowerup = async (item: PowerupType) => {
    if (
      !puzzle ||
      !profile ||
      !inventory ||
      isBusyOrGuessBlocked({
        busy,
        ...readGuessWorkSnapshot(),
      }) ||
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
    setBusy(true);
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
      setBusy(false);
    }
  };

  const maxPurchasableQuantity = (item: PowerupType): number => {
    if (!profile) {
      return 0;
    }
    const unitPrice = getCurrentPowerupUnitPrice(item, puzzle);
    if (unitPrice <= 0) {
      return 0;
    }
    return Math.floor(profile.coins / unitPrice);
  };

  const openBuyDialog = (item: PowerupType) => {
    if (isBusyOrGuessBlocked({ busy, ...readGuessWorkSnapshot() })) {
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
      isBusyOrGuessBlocked({ busy, ...readGuessWorkSnapshot() }) ||
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
      isBusyOrGuessBlocked({
        busy,
        ...readGuessWorkSnapshot(),
      }) ||
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
    setBusy(true);
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
      setBusy(false);
    }
  };

  const openRetryDialog = () => {
    if (isBusyOrGuessBlocked({ busy, ...readGuessWorkSnapshot() })) {
      showFinishGuessesToastIfNeeded();
      return;
    }
    if (!profile) {
      return;
    }
    const nextDialog = buildRetryDialogState({
      coins: profile.coins,
      nextDailyRetryCost,
      nextDailyRetryScoreFactor,
      dailyRetryCount,
      puzzleDifficulty: puzzle?.difficulty,
      difficultyLabel: formatDifficultyLabel(puzzle?.difficulty),
    });
    if (!nextDialog) {
      showToast('Retry is unavailable right now.');
      return;
    }
    setRetryDialog(nextDialog);
  };

  const handleProductPurchase = async (sku: string) => {
    if (
      isOfferPurchaseBlocked({
        offerBusy,
        busy,
        ...readGuessWorkSnapshot(),
      })
    ) {
      showFinishGuessesToastIfNeeded();
      return;
    }
    setOfferBusy(true);
    try {
      const result = await purchase(sku);
      if (isSuccessfulOrderStatus(result.status)) {
        showToast('Purchase successful.');
        await Promise.all([refreshBootstrapState(), loadFeaturedOffer()]);
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
    setActiveScreen('home');
  };

  const loadModeAndOpenChallenge = async (nextMode: 'daily' | 'endless') => {
    patchChallengeSession({ isComplete: false, isGameOver: false });
    if (nextMode === 'endless' && !endlessCatalogAvailable) {
      showToast('Endless mode is not available yet.');
      return;
    }
    try {
      await loadLevel(nextMode);
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
      showToast(message);
    }
  };

  const handleHomeTabSelect = (nextTab: HomeTab) => {
    setHomeTab(nextTab);
    if (nextTab === 'endless' && !endlessCatalogAvailable) {
      showToast('Endless mode is coming soon.');
    }
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

  const handleHomePlay = () => {
    if (homeTab === 'endless') {
      void loadModeAndOpenChallenge('endless');
    } else {
      void loadModeAndOpenChallenge('daily');
    }
  };

  const handleHomePlayEndless = () => {
    void loadModeAndOpenChallenge('endless');
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

  const handlePurchaseDailyRetry = async () => {
    if (!levelId) {
      return;
    }
    setBusy(true);
    try {
      const result = await trpc.game.purchaseDailyRetry.mutate({
        levelId,
        mode,
      });
      setProfile(result.profile);
      setInventory(result.inventory);
      setDailyRetryCount(result.retryCount);
      setNextDailyRetryCost(result.nextRetryCost);
      setNextDailyRetryScoreFactor(result.nextRetryScoreFactor);
      setRequiresPaidRetry(result.requiresPaidRetry);
      const storageUserId = currentUserIdRef.current;
      if (storageUserId) {
        clearCorrectGuessIndices(storageUserId, levelId);
      }
      patchChallengeSession(
        buildActiveChallengeSessionPatch({
          heartsRemaining: result.heartsRemaining,
          isShieldActive: result.session.shieldIsActive,
        })
      );
      setCompletionResult(null);
      setCompletionSolveSeconds(null);
      setChallengeStartTs(
        hasChallengeActivity(result.session) ? result.session.startTimestamp : null
      );
      if (storageUserId) {
        persistOutcomeState(storageUserId, null);
      }
      setRetryDialog(null);
      clearTileFeedback({ resetSelection: true });
      await refreshCurrentView(levelId);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : 'Unable to start daily retry.';
      showToast(message);
    } finally {
      setBusy(false);
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
    const action = getRetryAction({
      levelId,
      mode,
      isGameOver,
      requiresPaidRetry,
      hasInfiniteHearts,
      currentLives,
    });
    if (action === 'none') {
      return;
    }
    if (action === 'open-heart-purchase') {
      setHeartPurchaseDialogOpen(true);
      return;
    }
    if (action === 'open-paid-daily-retry') {
      openRetryDialog();
      return;
    }
    setBusy(true);
    try {
      await startLevel(levelId, mode);
      await refreshCurrentView(levelId);
      patchChallengeSession({ isGameOver: false });
    } finally {
      setBusy(false);
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
    if (activeScreen !== 'challenge' || selectedTile === null || busy || isGameOver || isComplete) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      focusInlineInputProxy();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeScreen, selectedTile, busy, isGameOver, isComplete]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (bootstrapError || !profile || !inventory || !puzzle) {
    return (
      <div className="app-surface flex h-full items-center justify-center p-4">
        <div className="app-surface-strong w-full max-w-[320px] rounded-2xl border app-border px-4 py-5 text-center">
          <div className="app-text text-sm font-black uppercase tracking-[0.04em]">
            Decrypt unavailable
          </div>
          <p className="app-text-muted mt-2 text-sm font-semibold">
            {bootstrapError ?? 'Unable to load the current challenge right now.'}
          </p>
          <button
            type="button"
            data-testid="bootstrap-retry"
            className="btn-3d btn-primary mt-4 rounded-xl px-4 py-2 text-sm font-black uppercase"
            onClick={() => setBootstrapAttempt((previous) => previous + 1)}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const mistakesMade = Math.max(0, puzzle.heartsMax - heartsRemaining);
  const protectedMistakeIndex =
    isShieldActive && mistakesMade < puzzle.heartsMax ? mistakesMade : null;
  const isInlineMode = webViewMode === 'inline';
  const buyMax = buyDialog ? maxPurchasableQuantity(buyDialog.item) : 0;
  const buyDialogUnitPrice = buyDialog
    ? getCurrentPowerupUnitPrice(buyDialog.item, puzzle)
    : 0;
  const buyDialogRemainingLetters = countRemainingLetters(puzzle);
  const buyDialogPowerupValidity = buyDialog
    ? getPowerupValidity(buyDialog.item)
    : { valid: true, reason: null };
  const hasQueuedGuesses = queuedGuessCount > 0;
  const guessBusy = guessInFlight || hasQueuedGuesses;
  const bonusTimerView = getBonusTimerView({
    challengeStartTs,
    isChallengeScreen,
    isComplete,
    isGameOver,
    nowTs: headerNowTs,
    targetTimeSeconds: puzzle.targetTimeSeconds,
  });
  const {
    countdownLabel: bonusTimerCountdownLabel,
    secondsLeft: bonusTimerSecondsLeft,
    showTimer: showBonusTimer,
  } = bonusTimerView;
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
    isShopScreen,
    isQuestScreen,
    isStatsScreen,
    isLeaderboardScreen,
    isHubScreen,
    showOutcomeOverlay,
    showChallengeBackdrop,
    showSuccessOverlay,
    isDailyComplete,
    showPaidDailyRetryCta,
  } = appViewState;
  const heartState = getHeartState({
    hearts: profile.hearts,
    infiniteHeartsExpiryTs: profile.infiniteHeartsExpiryTs,
    lastHeartRefillTs: profile.lastHeartRefillTs,
    nowTs: headerNowTs,
  });
  const {
    hasInfiniteHearts,
    currentLives,
    canUseLifeForChallenge,
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
  const outcomeTitle = isComplete ? 'Challenge Completed' : 'Challenge Failed';
  const outcomeSubtitle = isComplete
    ? completionResult?.rewardNotice ?? ''
    : 'Try again!';
  const completionSolveLabel = formatStatDuration(
    completionSolveSeconds ?? completionResult?.solveSeconds ?? null
  );
  const homePanelClass = deviceTier === 'mobile'
    ? 'mx-auto mt-3 w-full max-w-[340px] space-y-3'
    : 'mx-auto mt-4 w-full max-w-[520px] space-y-4';
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

	  const handleInlineInputChange = (event: ChangeEvent<HTMLInputElement>) => {
	    const input = event.currentTarget.value.toUpperCase();
	    const lettersOnly = input.replace(/[^A-Z]/g, '');
    const letter = lettersOnly.charAt(lettersOnly.length - 1);
    event.currentTarget.value = '';
    if (!letter || busy || isGameOver || isComplete) {
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

          {showBonusTimer && (
            <aside
              data-testid="bonus-timer"
              aria-label={`Bonus Timer, ${bonusTimerSecondsLeft} seconds left`}
              className={cn(
                'pointer-events-none absolute right-2 z-30 rounded-md border border-amber-300/70 bg-zinc-950/70 px-2 py-1 text-right shadow-[0_8px_18px_rgba(0,0,0,0.28)] backdrop-blur-sm',
                isInlineMode
                  ? 'top-[104px] w-[82px]'
                  : 'top-[112px] w-[96px]'
              )}
            >
              <div className="text-[8px] font-black uppercase leading-none tracking-[0.04em] text-amber-200">
                Bonus Timer
              </div>
              <div
                data-testid="bonus-timer-countdown"
                className="mt-0.5 font-mono text-[16px] font-black leading-none text-white"
              >
                {bonusTimerCountdownLabel}
              </div>
            </aside>
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
              busy={busy}
              isComplete={isComplete}
              isGameOver={isGameOver}
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
              isDailyComplete={isDailyComplete}
              retry={retry}
              openHome={openHome}
              showPaidDailyRetryCta={showPaidDailyRetryCta}
              nextDailyRetryCost={nextDailyRetryCost}
              subredditName={subredditName}
              joiningCommunity={joiningCommunity}
              communityJoinRecorded={communityJoinRecorded}
              communityJoinLabel={communityJoinLabel}
              handleJoinCommunity={handleJoinCommunity}
              outcomeTitle={outcomeTitle}
              outcomeSubtitle={outcomeSubtitle}
              completionSolveLabel={completionSolveLabel}
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
                                    className="h-[16px] w-[16px]"
                                  />
                                ) : (
                                  <HudSprite
                                    icon={perk.sprite}
                                    decorative
                                    className="h-[16px] w-[16px]"
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
                              disabled={busy || guessBusy || isGameOver || isComplete}
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
                              disabled={busy || guessBusy || isGameOver || isComplete}
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
              endlessPublishedLevelCount={
                endlessCatalogStatus?.publishedLevelCount ?? 0
              }
              endlessActiveCatalogVersion={
                endlessCatalogStatus?.activeCatalogVersion ?? null
              }
            />
          )}

          {isShopScreen && (
            <Suspense fallback={null}>
              <LazyShopScreen
                shopProducts={shopProducts}
                shopError={shopError}
                offerBusy={offerBusy}
                onPurchase={(sku) => void handleProductPurchase(sku)}
                onRetry={() => void loadFeaturedOffer()}
              />
            </Suspense>
          )}

          {isQuestScreen && (
            <Suspense fallback={null}>
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
            <Suspense fallback={null}>
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
            <Suspense fallback={null}>
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
              isQuestScreen={isQuestScreen}
              isStatsScreen={isStatsScreen}
              isLeaderboardScreen={isLeaderboardScreen}
              hasClaimableQuest={hasClaimableQuest}
              onOpenShop={openShop}
              onOpenHome={openHome}
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
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
	          className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px opacity-0"
	          onChange={handleInlineInputChange}
	          onKeyDown={handleInlineInputKeyDown}
	          disabled={busy || isGameOver || isComplete}
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
          busy={busy}
          unitPrice={buyDialogUnitPrice}
          remainingLetters={buyDialogRemainingLetters}
          difficultyLabel={formatDifficultyLabel(puzzle?.difficulty)}
          powerupValidity={buyDialogPowerupValidity}
          buyChips={buyChips}
          onSelectQuantity={(quantity) =>
            setBuyDialog((previous) =>
              previous ? { ...previous, quantity } : previous
            )
          }
          onCancel={() => setBuyDialog(null)}
          onConfirm={confirmBuy}
        />
      )}
      {retryDialog && (
        <RetryDialog
          retryDialog={retryDialog}
          busy={busy}
          onCancel={() => setRetryDialog(null)}
          onConfirm={() => void handlePurchaseDailyRetry()}
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
          onCancel={() => setHeartPurchaseDialogOpen(false)}
        />
      )}
    </div>
  );
};

