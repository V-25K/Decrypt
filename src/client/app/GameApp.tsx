import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  getWebViewMode,
  OrderResultStatus,
  purchase,
  requestExpandedMode,
  showToast,
} from '@devvit/web/client';
import type {
  ConfettiLauncher,
  Options as CanvasConfettiOptions,
} from 'canvas-confetti';
import { trpc } from '../trpc';
import { chunkPuzzleTokensByWordLimit, cn, tokenizePuzzleTiles } from '../utils';
import {
  getOfferPromotionLabel,
  promotedOfferPrioritySkus,
} from '../../shared/store';
import {
  getCommunityFlairStyle,
  getQuestProgressValue,
  questCatalog,
  questProgressionGroups,
  type QuestDefinition,
  type QuestReward,
} from '../../shared/quests';
import { disposeSfx, playSfx, primeSfx } from '../sfx';
import {
  coinEmoji,
  confettiPalette,
  crossMarkEmoji,
  emptyHeartGlyph,
  heartEmoji,
  heartRefillIntervalMs,
  inlineMaxWordsPerLine,
  lockEmoji,
  maxOutcomeCrowdAvatars,
  maxWordTileColumns,
  outcomeCrowdCollisionPadding,
  outcomeCrowdCollisionPasses,
  outcomeCrowdPalette,
  outcomeCrowdScale,
  powerupCost,
  powerupIcon,
  powerupLabel,
  wordContinuationGlyph,
} from './constants';
import type {
  AllTimeLeaderboardEntry,
  AppScreen,
  BuyDialogState,
  ChallengeMetrics,
  DailyLeaderboardEntry,
  DeviceTier,
  HomeTab,
  Inventory,
  LeaderboardTab,
  PowerupType,
  Profile,
  QuestProgress,
  QuestStatus,
  RouterOutputs,
  RankSummary,
  StatsTab,
  StoreProduct,
  Puzzle,
  PuzzlePublicTile,
} from './types';
import {
  HomeIcon,
  InfoIcon,
  ReplayIcon,
  ShareIcon,
} from '../components/Icons';
import { HelpOverlay } from '../components/HelpOverlay';
import { BuyDialog } from '../components/BuyDialog';
import { BottomNav } from '../components/BottomNav';
import { HomeScreen } from '../screens/HomeScreen';

type PersistedOutcomeState = {
  levelId: string;
  isComplete: boolean;
  isGameOver: boolean;
  completion: RouterOutputs['game']['completeSession'] | null;
  solveSeconds: number | null;
  savedAt: number;
};
type OutcomeCrowdBubble = {
  id: string;
  avatarUrl: string;
  rank: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  radius: number;
  z: number;
  anchorX: number;
  anchorY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  backgroundColor: string;
  driftPhase: number;
  isPodium: boolean;
};
type OutcomeCrowdViewport = {
  width: number;
  height: number;
};
type GuessResult = RouterOutputs['game']['submitGuesses']['results'][number];
type TileVisualState = 'default' | 'selected' | 'correct' | 'wrong' | 'locked';
type ConfettiModule = typeof import('canvas-confetti');
const expandedScreenIntentKey = 'decrypt-expanded-screen-intent';
const expandedScreenIntentTtlMs = 15000;
const outcomeStateStorageKey = 'decrypt-challenge-outcome-v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCompletionResult = (
  value: unknown
): value is RouterOutputs['game']['completeSession'] => {
  if (!isRecord(value)) {
    return false;
  }
  const ok = value.ok;
  const accepted = value.accepted;
  const solveSeconds = value.solveSeconds;
  const score = value.score;
  const rewardCoins = value.rewardCoins;
  const mistakes = value.mistakes;
  const usedPowerups = value.usedPowerups;
  const profile = value.profile;
  const inventory = value.inventory;
  return (
    typeof ok === 'boolean' &&
    typeof accepted === 'boolean' &&
    typeof solveSeconds === 'number' &&
    typeof score === 'number' &&
    typeof rewardCoins === 'number' &&
    typeof mistakes === 'number' &&
    typeof usedPowerups === 'number' &&
    isRecord(profile) &&
    isRecord(inventory)
  );
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

const pickPromotedOffer = (products: StoreProduct[]): StoreProduct | null => {
  for (const sku of promotedOfferPrioritySkus) {
    const match = products.find((entry) => entry.sku === sku);
    if (match) {
      return match;
    }
  }
  return null;
};

const setExpandedScreenIntent = (screen: AppScreen) => {
  try {
    const payload = JSON.stringify({ screen, ts: Date.now() });
    sessionStorage.setItem(expandedScreenIntentKey, payload);
  } catch (_error) {
    // ignore storage failures; expanded fallback stays on challenge.
  }
};

const consumeExpandedScreenIntent = (): AppScreen | null => {
  try {
    const value = sessionStorage.getItem(expandedScreenIntentKey);
    sessionStorage.removeItem(expandedScreenIntentKey);
    if (!value) {
      return null;
    }
    const parsed = JSON.parse(value);
    if (!isRecord(parsed)) {
      return null;
    }
    const screenValue = parsed.screen;
    const tsValue = parsed.ts;
    if (
      typeof screenValue === 'string' &&
      (screenValue === 'shop' ||
        screenValue === 'home' ||
        screenValue === 'quest' ||
        screenValue === 'stats' ||
        screenValue === 'leaderboard') &&
      typeof tsValue === 'number' &&
      Date.now() - tsValue <= expandedScreenIntentTtlMs
    ) {
      return screenValue;
    }
    return null;
  } catch (_error) {
    return null;
  }
};

const readEntrypointScreen = (): AppScreen | null => {
  const value = document.getElementById('root')?.getAttribute('data-initial-screen');
  if (
    value === 'home' ||
    value === 'shop' ||
    value === 'quest' ||
    value === 'stats' ||
    value === 'leaderboard'
  ) {
    return value;
  }
  return null;
};

const persistOutcomeState = (state: PersistedOutcomeState | null) => {
  try {
    if (!state) {
      sessionStorage.removeItem(outcomeStateStorageKey);
      return;
    }
    sessionStorage.setItem(outcomeStateStorageKey, JSON.stringify(state));
  } catch (_error) {
    // Ignore persistence failures.
  }
};

const readOutcomeState = (): PersistedOutcomeState | null => {
  try {
    const raw = sessionStorage.getItem(outcomeStateStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return null;
    }
    const levelId = parsed.levelId;
    const isComplete = parsed.isComplete;
    const isGameOver = parsed.isGameOver;
    const savedAt = parsed.savedAt;
    if (
      typeof levelId !== 'string' ||
      typeof isComplete !== 'boolean' ||
      typeof isGameOver !== 'boolean' ||
      typeof savedAt !== 'number'
    ) {
      return null;
    }
    const completion = isCompletionResult(parsed.completion)
      ? parsed.completion
      : null;
    const solveSeconds =
      parsed.solveSeconds === null || typeof parsed.solveSeconds === 'number'
        ? (parsed.solveSeconds ?? null)
        : null;
    return {
      levelId,
      isComplete,
      isGameOver,
      completion,
      solveSeconds,
      savedAt,
    };
  } catch (_error) {
    return null;
  }
};

const isSuccessfulOrderStatus = (status: unknown): boolean =>
  status === OrderResultStatus.STATUS_SUCCESS ||
  status === 1 ||
  status === 'STATUS_SUCCESS' ||
  status === 'Success';

const toPurchaseErrorMessage = (errorMessage: string | null | undefined): string => {
  if (typeof errorMessage === 'string' && /order not placed/i.test(errorMessage)) {
    return 'Order not placed. For sandbox testing, run upload + playtest and verify products sync.';
  }
  return errorMessage ?? 'Purchase canceled.';
};

const formatCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatQuestReward = (
  reward: QuestReward
): { reward: string; flair: string | null } => {
  const parts: string[] = [];
  if (reward.coins > 0) {
    parts.push(`${coinEmoji} +${reward.coins}`);
  }
  const inventoryParts: Array<{ key: keyof Inventory; icon: string }> = [
    { key: 'hammer', icon: powerupIcon.hammer },
    { key: 'wand', icon: powerupIcon.wand },
    { key: 'shield', icon: powerupIcon.shield },
    { key: 'rocket', icon: powerupIcon.rocket },
  ];
  for (const item of inventoryParts) {
    const count = reward.inventory[item.key] ?? 0;
    if (count > 0) {
      parts.push(`${item.icon} +${count}`);
    }
  }
  return {
    reward: parts.join(' '),
    flair: reward.flair,
  };
};

const flairChipStyle = (
  flair: string,
  active: boolean
): CSSProperties | undefined => {
  const style = getCommunityFlairStyle(flair);
  if (!style) {
    return undefined;
  }
  return {
    backgroundColor: style.backgroundColor,
    color: style.textColor === 'dark' ? '#111111' : '#ffffff',
    borderColor: '#111111',
    opacity: active ? 1 : 0.82,
  };
};

const flairTagStyle = (flair: string): CSSProperties | undefined => {
  const style = getCommunityFlairStyle(flair);
  if (!style) {
    return undefined;
  }
  return {
    backgroundColor: style.backgroundColor,
    color: style.textColor === 'dark' ? '#111111' : '#ffffff',
    borderColor: '#111111',
  };
};

const groupedQuestIds = new Set(
  Object.values(questProgressionGroups).flat()
);

const getVisibleMilestoneIds = (
  progress: QuestProgress,
  claimedSet: Set<string>
): Set<string> => {
  const visible = new Set<string>();
  for (const group of Object.values(questProgressionGroups)) {
    for (const questId of group) {
      const quest = questCards.find((entry) => entry.id === questId);
      if (!quest) {
        continue;
      }
      const current = getQuestProgressValue(quest, progress);
      const completed = current >= quest.target;
      const claimed = claimedSet.has(questId);
      if (!(completed && claimed)) {
        visible.add(questId);
        break;
      }
    }
  }
  return visible;
};

const isQuestHidden = (
  quest: QuestDefinition,
  progress: QuestProgress,
  claimedSet: Set<string>
): boolean => {
  const current = getQuestProgressValue(quest, progress);
  const completed = current >= quest.target;
  const claimed = claimedSet.has(quest.id);
  return completed && claimed;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const settleOutcomeBubbleCollision = (
  first: OutcomeCrowdBubble,
  second: OutcomeCrowdBubble,
  normalX: number,
  normalY: number,
  overlap: number
) => {
  const firstPositionWeight = first.isPodium ? 0.18 : 0.52;
  const secondPositionWeight = second.isPodium ? 0.18 : 0.52;

  first.x -= normalX * overlap * firstPositionWeight;
  first.y -= normalY * overlap * firstPositionWeight;
  second.x += normalX * overlap * secondPositionWeight;
  second.y += normalY * overlap * secondPositionWeight;

  const relativeNormalVelocity =
    (second.vx - first.vx) * normalX + (second.vy - first.vy) * normalY;
  if (relativeNormalVelocity >= 0) {
    return;
  }

  const damping = first.isPodium || second.isPodium ? 0.72 : 0.84;
  const correction = -relativeNormalVelocity * damping;
  const firstVelocityWeight = first.isPodium ? 0.24 : 0.5;
  const secondVelocityWeight = second.isPodium ? 0.24 : 0.5;

  first.vx -= normalX * correction * firstVelocityWeight;
  first.vy -= normalY * correction * firstVelocityWeight;
  second.vx += normalX * correction * secondVelocityWeight;
  second.vy += normalY * correction * secondVelocityWeight;
};

const settleOutcomeBubbleBoundary = (bubble: OutcomeCrowdBubble) => {
  bubble.x = clampNumber(bubble.x, bubble.minX, bubble.maxX);
  bubble.y = clampNumber(bubble.y, bubble.minY, bubble.maxY);

  if (bubble.x <= bubble.minX && bubble.vx < 0) {
    bubble.vx *= -0.35;
  } else if (bubble.x >= bubble.maxX && bubble.vx > 0) {
    bubble.vx *= -0.35;
  }

  if (bubble.y <= bubble.minY && bubble.vy < 0) {
    bubble.vy *= -0.35;
  } else if (bubble.y >= bubble.maxY && bubble.vy > 0) {
    bubble.vy *= -0.35;
  }
};

const buildOutcomeCrowdBubbles = (
  avatarUrls: string[],
  viewport: OutcomeCrowdViewport
): OutcomeCrowdBubble[] => {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return [];
  }
  const visibleUrls = avatarUrls.slice(0, maxOutcomeCrowdAvatars);
  const podiumSpecs = [
    {
      x: viewport.width * 0.5,
      y: viewport.height * 0.82,
      size:
        clampNumber(viewport.width * 0.25, 112, 168) * outcomeCrowdScale,
      color: '#d4af37',
      z: 30,
      rank: 1,
    },
    {
      x: viewport.width * 0.32,
      y: viewport.height * 0.84,
      size:
        clampNumber(viewport.width * 0.21, 94, 142) * outcomeCrowdScale,
      color: '#d8dde6',
      z: 29,
      rank: 2,
    },
    {
      x: viewport.width * 0.68,
      y: viewport.height * 0.855,
      size:
        clampNumber(viewport.width * 0.18, 82, 124) * outcomeCrowdScale,
      color: '#cd7f32',
      z: 28,
      rank: 3,
    },
  ];

  return visibleUrls.map((avatarUrl, index) => {
    const podiumSpec = podiumSpecs[index];
    if (podiumSpec) {
      const radius = podiumSpec.size / 2;
      return {
        id: `outcome-podium-${index}`,
        avatarUrl,
        rank: podiumSpec.rank,
        x: podiumSpec.x,
        y: podiumSpec.y,
        vx: 0,
        vy: 0,
        size: podiumSpec.size,
        radius,
        z: podiumSpec.z,
        anchorX: podiumSpec.x,
        anchorY: podiumSpec.y,
        minX: podiumSpec.x - 18,
        maxX: podiumSpec.x + 18,
        minY: podiumSpec.y - 14,
        maxY: podiumSpec.y + 14,
        backgroundColor: podiumSpec.color,
        driftPhase: index * 1.3,
        isPodium: true,
      };
    }

    const trailingIndex = index - podiumSpecs.length;
    const side = trailingIndex % 2 === 0 ? -1 : 1;
    const pairIndex = Math.floor(trailingIndex / 2);
    const bandIndex = pairIndex % 5;
    const columnIndex = Math.floor(pairIndex / 5);
    const xBase = side < 0 ? 0.22 : 0.78;
    const xPct = xBase + columnIndex * side * 0.11;
    const yPct = 0.72 - bandIndex * 0.08 - columnIndex * 0.03;
    const size =
      clampNumber(112 - trailingIndex * 4, 54, 92) * outcomeCrowdScale;
    const radius = size / 2;
    const anchorX = viewport.width * clampNumber(xPct, 0.08, 0.92);
    const anchorY = viewport.height * clampNumber(yPct, 0.34, 0.76);
    return {
      id: `outcome-crowd-${index}`,
      avatarUrl,
      rank: index + 1,
      x: anchorX,
      y: anchorY,
      vx: (trailingIndex % 2 === 0 ? 1 : -1) * (0.012 + trailingIndex * 0.0012),
      vy: (trailingIndex % 3 === 0 ? -1 : 1) * (0.009 + trailingIndex * 0.001),
      size,
      radius,
      z: 20 - trailingIndex,
      anchorX,
      anchorY,
      minX: radius + 8,
      maxX: viewport.width - radius - 8,
      minY: viewport.height * 0.32 + radius,
      maxY: viewport.height - radius - 12,
      backgroundColor: outcomeCrowdPalette[trailingIndex % outcomeCrowdPalette.length] ?? '#8ecdf8',
      driftPhase: trailingIndex * 0.77,
      isPodium: false,
    };
  });
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
    'tile-btn relative rounded-md px-[5px] py-[1px] transition-colors duration-500';
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

const defaultChallengeMetrics: ChallengeMetrics = {
  plays: 0,
  wins: 0,
  winRatePct: 0,
};

const questCards: QuestDefinition[] = questCatalog;

const formatChallengeType = (value: string | undefined): string => {
  const normalized = (value ?? 'QUOTE')
    .toUpperCase()
    .replace(/[^A-Z_]/g, '')
    .trim();
  switch (normalized) {
    case 'LYRIC_LINE':
      return 'Lyric';
    case 'MOVIE_LINE':
      return 'Movie';
    case 'ANIME_LINE':
      return 'Anime';
    case 'SPEECH_LINE':
      return 'Speech';
    case 'BOOK_LINE':
      return 'Book';
    case 'TV_LINE':
      return 'TV';
    case 'SAYING':
      return 'Saying';
    case 'PROVERB':
      return 'Proverb';
    case 'QUOTE':
    default:
      return 'Quote';
  }
};

const formatDifficultyLabel = (value: number | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'Medium';
  }
  if (value <= 3) {
    return 'Easy';
  }
  if (value <= 7) {
    return 'Medium';
  }
  if (value >= 9) {
    return 'Expert';
  }
  return 'Hard';
};

const formatLeaderboardName = (entry: {
  username?: string | null;
  userId: string;
}): string => {
  if (entry.username && entry.username.trim().length > 0) {
    return entry.username;
  }
  return entry.userId.startsWith('t2_') ? entry.userId.slice(3) : entry.userId;
};

const formatStatDuration = (seconds: number | null | undefined): string => {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '--';
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatRankLabel = (rank: number | null | undefined): string =>
  typeof rank === 'number' && Number.isFinite(rank) && rank > 0 ? `#${rank}` : '--';

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
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [levelId, setLevelId] = useState('');
  const [mode, setMode] = useState<'daily' | 'endless'>('daily');
  const [heartsRemaining, setHeartsRemaining] = useState(3);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completionResult, setCompletionResult] = useState<RouterOutputs['game']['completeSession'] | null>(null);
  const [completionSolveSeconds, setCompletionSolveSeconds] = useState<number | null>(null);
  const [challengeStartTs, setChallengeStartTs] = useState<number | null>(null);
  const [completionCrowdAvatarUrls, setCompletionCrowdAvatarUrls] = useState<string[]>([]);
  const [completionCrowdReady, setCompletionCrowdReady] = useState(false);
  const [completionCelebrationId, setCompletionCelebrationId] = useState(0);
  const [outcomeCrowdViewport, setOutcomeCrowdViewport] = useState<OutcomeCrowdViewport>({
    width: 0,
    height: 0,
  });
  const [outcomeCrowdBubbles, setOutcomeCrowdBubbles] = useState<OutcomeCrowdBubble[]>([]);
  const [featuredOffer, setFeaturedOffer] = useState<StoreProduct | null>(null);
  const [shopProducts, setShopProducts] = useState<StoreProduct[]>([]);
  const [offerBusy, setOfferBusy] = useState(false);
  const [webViewMode, setWebViewMode] = useState<'inline' | 'expanded'>(() => getWebViewMode());
  const [activeScreen, setActiveScreen] = useState<AppScreen>(() =>
    getWebViewMode() === 'expanded'
      ? (readEntrypointScreen() ?? consumeExpandedScreenIntent() ?? 'home')
      : 'challenge'
  );
  const [buyDialog, setBuyDialog] = useState<BuyDialogState | null>(null);
  const [correctGuessTileIndices, setCorrectGuessTileIndices] = useState<Set<number>>(() => new Set());
  const [wrongGuessTileIndices, setWrongGuessTileIndices] = useState<Set<number>>(() => new Set());
  const [puzzleScale, setPuzzleScale] = useState(1);
  const [isPuzzleVerticallyCentered, setIsPuzzleVerticallyCentered] = useState(true);
  const [challengeMetrics, setChallengeMetrics] = useState<ChallengeMetrics>(defaultChallengeMetrics);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [headerNowTs, setHeaderNowTs] = useState(() => Date.now());
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [questStatus, setQuestStatus] = useState<QuestStatus | null>(null);
  const [questLoading, setQuestLoading] = useState(false);
  const [questError, setQuestError] = useState<string | null>(null);
  const [questTab, setQuestTab] = useState<'daily' | 'milestone'>('daily');
  const [flairSaveBusy, setFlairSaveBusy] = useState(false);
  const hasClaimableQuest = useMemo(() => {
    if (!questStatus) {
      return false;
    }
    const claimedSet = new Set(questStatus.claimedQuestIds ?? []);
    return questCards.some((quest) => {
      const current = getQuestProgressValue(quest, questStatus.progress);
      return current >= quest.target && !claimedSet.has(quest.id);
    });
  }, [questStatus]);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [dailyLeaderboardEntries, setDailyLeaderboardEntries] = useState<DailyLeaderboardEntry[]>([]);
  const [endlessLeaderboardEntries, setEndlessLeaderboardEntries] = useState<AllTimeLeaderboardEntry[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('daily');
  const [statsTab, setStatsTab] = useState<StatsTab>('daily');
  const [homeTab, setHomeTab] = useState<HomeTab>('daily');
  const [rankSummary, setRankSummary] = useState<RankSummary | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiLauncherRef = useRef<ConfettiLauncher | null>(null);
  const confettiModuleRef = useRef<ConfettiModule | null>(null);
  const outcomeCrowdRef = useRef<HTMLElement | null>(null);
  const outcomeCrowdBubblesRef = useRef<OutcomeCrowdBubble[]>([]);
  const outcomeCrowdNodesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const inlineInputRef = useRef<HTMLInputElement | null>(null);
  const helpCardRef = useRef<HTMLElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);
  const wrongGuessTimeoutsRef = useRef<Map<number, number>>(new Map());
  const guessQueueRef = useRef<
    Array<{ levelId: string; tileIndex: number; letter: string }>
  >([]);
  const processingGuessRef = useRef(false);
  const puzzleRef = useRef<Puzzle | null>(null);

  const tokens = useMemo(() => (puzzle ? tokenizePuzzleTiles(puzzle.tiles) : []), [puzzle]);
  const formattedLevel = useMemo(() => formatLevelNumber(levelId), [levelId]);
  const challengeTypeLabel = useMemo(
    () => formatChallengeType(puzzle?.challengeType),
    [puzzle?.challengeType]
  );
  const difficultyLabel = useMemo(
    () => formatDifficultyLabel(puzzle?.difficulty),
    [puzzle?.difficulty]
  );
  const handleOutcomeCrowdRef = useCallback((node: HTMLElement | null) => {
    outcomeCrowdRef.current = node;
    if (!node) {
      return;
    }
    const width = node.clientWidth || window.innerWidth;
    const height = node.clientHeight || window.innerHeight;
    if (width > 0 && height > 0) {
      setOutcomeCrowdViewport({ width, height });
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
      node.style.transform = `translate3d(${bubble.x}px, ${bubble.y}px, 0) translate(-50%, -50%)`;
    },
    []
  );

  const loadConfettiModule = useCallback(async (): Promise<ConfettiModule> => {
    if (confettiModuleRef.current) {
      return confettiModuleRef.current;
    }
    const module = await import('canvas-confetti');
    confettiModuleRef.current = module;
    return module;
  }, []);

  const setConfettiCanvasNode = useCallback(
    (node: HTMLCanvasElement | null) => {
      confettiCanvasRef.current = node;
      confettiLauncherRef.current = null;
      if (!node) {
        return;
      }
      void (async () => {
        const module = await loadConfettiModule();
        if (confettiCanvasRef.current !== node) {
          return;
        }
        confettiLauncherRef.current = module.default.create(node, {
          resize: true,
          useWorker: true,
        });
      })();
    },
    [loadConfettiModule]
  );

  const fireConfettiBurst = useCallback((options: CanvasConfettiOptions) => {
    const launcher = confettiLauncherRef.current;
    if (!launcher) {
      return;
    }
    void launcher({
      colors: confettiPalette,
      disableForReducedMotion: true,
      scalar: 1.6,
      gravity: 0.82,
      decay: 0.93,
      ticks: 220,
      shapes: ['square'],
      ...options,
    });
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
    guessQueueRef.current = [];
    processingGuessRef.current = false;
    setGuessInFlight(false);
    setQueuedGuessCount(0);
    setPendingGuessByTile(new Map());
  }, [levelId, isGameOver, isComplete]);

  const refreshBootstrapState = useCallback(async () => {
    const bootstrap = await trpc.game.bootstrap.query();
    setProfile(bootstrap.profile);
    setInventory(bootstrap.inventory);
  }, []);

  const loadCompletionSolveSecondsFromDatabase = useCallback(async (
    levelIdToLookup: string
  ): Promise<number | null> => {
    try {
      const receipt = await trpc.game.getCompletionReceipt.query({
        levelId: levelIdToLookup,
      });
      return typeof receipt.solveSeconds === 'number' ? receipt.solveSeconds : null;
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
    setLeaderboardLoading(true);
    try {
      const [daily, allTime] = await Promise.all([
        trpc.leaderboard.getDaily.query({
          limit: 12,
        }),
        trpc.leaderboard.getAllTime.query({
          limit: 12,
        }),
      ]);
      setDailyLeaderboardEntries(daily.entries);
      setEndlessLeaderboardEntries(allTime.levels);
    } catch (_error) {
      setDailyLeaderboardEntries([]);
      setEndlessLeaderboardEntries([]);
      showToast('Unable to load leaderboard.');
    } finally {
      setLeaderboardLoading(false);
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
    try {
      const products = await trpc.store.getProducts.query();
      setShopProducts(products.products);
      setFeaturedOffer(pickPromotedOffer(products.products));
    } catch (_error) {
      setShopProducts([]);
      setFeaturedOffer(null);
    }
  }, []);

  const refreshCurrentView = async (activeLevelId: string): Promise<Puzzle> => {
    const view = await trpc.game.getCurrentView.query({ levelId: activeLevelId });
    setPuzzle(view);
    setSelectedTile((previous) => {
      if (previous === null) {
        return null;
      }
      const tile = view.tiles[previous];
      if (!tile || !tile.isLetter || tile.displayChar !== '_' || tile.isLocked) {
        return null;
      }
      return previous;
    });
    return view;
  };

  const applyRevealedTiles = (
    currentPuzzle: Puzzle | null,
    revealedTiles: { index: number; letter: string }[]
  ): Puzzle | null => {
    if (!currentPuzzle || revealedTiles.length === 0) {
      return currentPuzzle;
    }
    const revealMap = new Map<number, string>();
    for (const tile of revealedTiles) {
      revealMap.set(tile.index, tile.letter);
    }
    const nextTiles = currentPuzzle.tiles.map((tile) => {
      const letter = revealMap.get(tile.index);
      if (!letter) {
        return tile;
      }
      return {
        ...tile,
        displayChar: letter,
      };
    });
    return { ...currentPuzzle, tiles: nextTiles };
  };

  const hasAvailableLetters = (currentPuzzle: Puzzle | null): boolean => {
    if (!currentPuzzle) {
      return false;
    }
    return currentPuzzle.tiles.some(
      (tile) => tile.isLetter && tile.displayChar === '_' && !tile.isLocked
    );
  };

  const clearTileFeedback = useCallback(() => {
    wrongGuessTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    wrongGuessTimeoutsRef.current.clear();
    setCorrectGuessTileIndices(new Set());
    setWrongGuessTileIndices(new Set());
  }, []);

  const flashWrongTile = (tileIndex: number) => {
    setWrongGuessTileIndices((previous) => {
      const next = new Set(previous);
      next.add(tileIndex);
      return next;
    });
    const existingTimeout = wrongGuessTimeoutsRef.current.get(tileIndex);
    if (existingTimeout !== undefined) {
      window.clearTimeout(existingTimeout);
    }
    const timeoutId = window.setTimeout(() => {
      setWrongGuessTileIndices((previous) => {
        const next = new Set(previous);
        next.delete(tileIndex);
        return next;
      });
      wrongGuessTimeoutsRef.current.delete(tileIndex);
    }, 1000);
    wrongGuessTimeoutsRef.current.set(tileIndex, timeoutId);
  };

  const startLevel = useCallback(async (
    activeLevelId: string,
    activeMode: 'daily' | 'endless'
  ) => {
    try {
      const session = await trpc.game.startSession.mutate({
        levelId: activeLevelId,
        mode: activeMode,
      });
      setHeartsRemaining(session.heartsRemaining);
      setIsGameOver(false);
      setIsComplete(false);
      setCompletionResult(null);
      setCompletionSolveSeconds(null);
      setChallengeStartTs(Date.now());
      persistOutcomeState(null);
      setSelectedTile(null);
      clearTileFeedback();
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
      if (message.toLowerCase().includes('already completed')) {
        showToast(message);
        return false;
      }
      throw error;
    }
  }, [clearTileFeedback, refreshBootstrapState]);

  const loadLevel = async (nextMode: 'daily' | 'endless') => {
    setBusy(true);
    try {
      const loaded = await trpc.game.loadLevel.query({
        mode: nextMode,
      });
      setMode(nextMode);
      setLevelId(loaded.levelId);
      setPuzzle(loaded.puzzle);
      setChallengeMetrics(loaded.challengeMetrics ?? defaultChallengeMetrics);
      setSelectedTile(null);
      await startLevel(loaded.levelId, nextMode);
      await refreshCurrentView(loaded.levelId);
    } finally {
      setBusy(false);
    }
  };

  const finishLevel = async () => {
    setBusy(true);
    const fallbackSolveSeconds =
      challengeStartTs !== null
        ? Math.max(0, Math.round((Date.now() - challengeStartTs) / 1000))
        : null;
    try {
      const result = await trpc.game.completeSession.mutate({ levelId, mode });
      const completed = result.ok;
      setProfile(result.profile);
      setInventory(result.inventory);
      setIsComplete(completed);
      setIsGameOver(false);
      setCompletionResult(completed ? result : null);
      const resolvedSolveSeconds =
        completed
          ? (typeof result.solveSeconds === 'number' ? result.solveSeconds : fallbackSolveSeconds)
          : null;
      setCompletionSolveSeconds(resolvedSolveSeconds);
      if (completed) {
        persistOutcomeState({
          levelId,
          isComplete: true,
          isGameOver: false,
          completion: result,
          solveSeconds: resolvedSolveSeconds,
          savedAt: Date.now(),
        });
      } else {
        persistOutcomeState(null);
      }
      if (completed) {
        setCompletionCelebrationId((previous) => previous + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (completionCelebrationId === 0 || !isComplete) {
      return;
    }
    let cancelled = false;
    let animationFrameId = 0;
    const run = () => {
      if (cancelled) {
        return;
      }
      if (!confettiCanvasRef.current || !confettiLauncherRef.current) {
        animationFrameId = window.requestAnimationFrame(run);
        return;
      }
      launchCompletionConfetti();
    };
    run();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [completionCelebrationId, isComplete, launchCompletionConfetti]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setBusy(true);
      try {
        const loadPromise = trpc.game.loadLevel.query({ mode: 'daily' });
        await Promise.all([
          refreshBootstrapState(),
          loadFeaturedOffer(),
          loadQuestStatus(),
          loadPromise,
        ]);
        const loaded = await loadPromise;
        if (cancelled) {
          return;
        }
        setMode('daily');
        setLevelId(loaded.levelId);
        setPuzzle(loaded.puzzle);
        setChallengeMetrics(loaded.challengeMetrics ?? defaultChallengeMetrics);
        setSelectedTile(null);
        const persistedOutcome = readOutcomeState();
        const canRestorePersisted =
          persistedOutcome !== null && persistedOutcome.levelId === loaded.levelId;
        if (persistedOutcome && persistedOutcome.levelId !== loaded.levelId) {
          persistOutcomeState(null);
        }
        if (canRestorePersisted && persistedOutcome) {
          setIsComplete(persistedOutcome.isComplete);
          setIsGameOver(persistedOutcome.isGameOver);
          setCompletionResult(persistedOutcome.completion ?? null);
          const restoredSolveSeconds =
            persistedOutcome.solveSeconds ??
            (typeof persistedOutcome.completion?.solveSeconds === 'number'
              ? persistedOutcome.completion.solveSeconds
              : null);
          setCompletionSolveSeconds(
            restoredSolveSeconds ??
              (await loadCompletionSolveSecondsFromDatabase(loaded.levelId))
          );
          setChallengeStartTs(null);
          setHeartsRemaining(loaded.puzzle.heartsMax);
          clearTileFeedback();
        } else if (loaded.alreadyCompleted) {
          setIsComplete(true);
          setIsGameOver(false);
          setCompletionResult(null);
          setCompletionSolveSeconds(
            await loadCompletionSolveSecondsFromDatabase(loaded.levelId)
          );
          setChallengeStartTs(null);
          setHeartsRemaining(loaded.puzzle.heartsMax);
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
        setPuzzle(view);
        setSelectedTile(null);
      } catch (_error) {
        if (!cancelled) {
          showToast('Failed to initialize Decrypt.');
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
    };
  }, [
    clearTileFeedback,
    loadCompletionSolveSecondsFromDatabase,
    loadFeaturedOffer,
    loadQuestStatus,
    refreshBootstrapState,
    startLevel,
  ]);

  useEffect(() => {
    const onFocus = () => setWebViewMode(getWebViewMode());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setHeaderNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (webViewMode !== 'expanded') {
      return;
    }
    const nextScreen = readEntrypointScreen() ?? consumeExpandedScreenIntent() ?? 'home';
    setActiveScreen(nextScreen);
  }, [webViewMode]);

  useEffect(() => {
    primeSfx();
    const onFirstInteraction = () => {
      primeSfx();
    };
    window.addEventListener('pointerdown', onFirstInteraction, { passive: true });
    window.addEventListener('keydown', onFirstInteraction, true);
    return () => {
      window.removeEventListener('pointerdown', onFirstInteraction);
      window.removeEventListener('keydown', onFirstInteraction, true);
    };
  }, []);

  useEffect(() => {
    const preload = (src: string) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    };
    preload('/logo.png');
    preload('/snoo.png');
    preload('/background.jpg');
    preload('/result.jpg');
  }, [
    clearTileFeedback,
    loadCompletionSolveSecondsFromDatabase,
    loadFeaturedOffer,
    loadQuestStatus,
    refreshBootstrapState,
    startLevel,
  ]);

  useEffect(() => {
    void import('../screens/ShopScreen');
    void import('../screens/QuestScreen');
    void import('../screens/StatsScreen');
    void import('../screens/LeaderboardScreen');
    void loadConfettiModule();
  }, [loadConfettiModule]);

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
    if (!isHelpOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isHelpOpen]);

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
    const fitPuzzle = () => {
      const viewport = viewportRef.current;
      const content = contentRef.current;
      if (!viewport || !content) {
        return;
      }
      const widthRatio = viewport.clientWidth / content.scrollWidth;
      const heightRatio = viewport.clientHeight / content.scrollHeight;
      const nextScale = webViewMode === 'inline'
        ? Math.min(1, widthRatio)
        : Math.min(1, widthRatio, heightRatio);
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
        const avatars = leaderboard.entries
          .map((entry) => entry.snoovatarUrl ?? null)
          .filter((entry): entry is string => Boolean(entry));
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
  }, [isComplete, levelId]);

  useEffect(() => {
    if (activeScreen !== 'challenge' || !isComplete) {
      setOutcomeCrowdViewport({ width: 0, height: 0 });
      return;
    }
    const crowdElement = outcomeCrowdRef.current;
    if (!crowdElement) {
      return;
    }
    let retryFrameId = 0;
    const syncViewport = () => {
      const width = crowdElement.clientWidth;
      const height = crowdElement.clientHeight;
      if (width > 0 && height > 0) {
        setOutcomeCrowdViewport({ width, height });
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
  }, [activeScreen, isComplete, completionCrowdAvatarUrls.length]);

  useEffect(() => {
    const outcomeCrowdWidth = outcomeCrowdViewport.width;
    const outcomeCrowdHeight = outcomeCrowdViewport.height;
    if (
      activeScreen !== 'challenge' ||
      !isComplete ||
      completionCrowdAvatarUrls.length === 0 ||
      outcomeCrowdWidth <= 0 ||
      outcomeCrowdHeight <= 0
    ) {
      outcomeCrowdBubblesRef.current = [];
      setOutcomeCrowdBubbles([]);
      setCompletionCrowdReady(false);
      return;
    }

    const viewport = { width: outcomeCrowdWidth, height: outcomeCrowdHeight };
    let bubbles = buildOutcomeCrowdBubbles(completionCrowdAvatarUrls, viewport);
    outcomeCrowdBubblesRef.current = bubbles;
    setOutcomeCrowdBubbles(bubbles);
    let frameId = 0;
    let lastFrameTs = performance.now();

    const tick = (frameTs: number) => {
      const dt = Math.min(22, frameTs - lastFrameTs);
      lastFrameTs = frameTs;
      const next = bubbles.map((bubble) => ({ ...bubble }));

      for (const bubble of next) {
        if (bubble.isPodium) {
          const driftX = Math.sin(frameTs / 2600 + bubble.driftPhase) * 9;
          const driftY = Math.cos(frameTs / 3200 + bubble.driftPhase) * 6;
          const targetX = bubble.anchorX + driftX;
          const targetY = bubble.anchorY + driftY;
          bubble.vx += (targetX - bubble.x) * 0.0015 * dt;
          bubble.vy += (targetY - bubble.y) * 0.0015 * dt;
          bubble.vx *= 0.92;
          bubble.vy *= 0.92;
        } else {
          bubble.vx += Math.sin(frameTs / 4000 + bubble.driftPhase) * 0.0007 * dt;
          bubble.vy += Math.cos(frameTs / 4300 + bubble.driftPhase) * 0.0006 * dt;
          bubble.vx *= 0.998;
          bubble.vy *= 0.998;
        }

        bubble.x += bubble.vx * dt;
        bubble.y += bubble.vy * dt;
      }

      for (let pass = 0; pass < outcomeCrowdCollisionPasses; pass += 1) {
        for (let i = 0; i < next.length; i += 1) {
          for (let j = i + 1; j < next.length; j += 1) {
            const first = next[i];
            const second = next[j];
            if (!first || !second) {
              continue;
            }
            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const distance = Math.hypot(dx, dy) || 0.0001;
            const minDistance =
              first.radius + second.radius + outcomeCrowdCollisionPadding;
            if (distance >= minDistance) {
              continue;
            }

            const normalX = dx / distance;
            const normalY = dy / distance;
            const overlap = minDistance - distance;
            settleOutcomeBubbleCollision(
              first,
              second,
              normalX,
              normalY,
              overlap
            );
          }
        }
      }

      for (const bubble of next) {
        settleOutcomeBubbleBoundary(bubble);
      }

      bubbles = next;
      outcomeCrowdBubblesRef.current = next;
      const nodes = outcomeCrowdNodesRef.current;
      for (const bubble of next) {
        const node = nodes.get(bubble.id);
        if (!node) {
          continue;
        }
        node.style.transform = `translate3d(${bubble.x}px, ${bubble.y}px, 0) translate(-50%, -50%)`;
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeScreen, isComplete, completionCrowdAvatarUrls, outcomeCrowdViewport]);

  useEffect(() => {
    if (!isComplete || completionCrowdAvatarUrls.length === 0) {
      setCompletionCrowdReady(false);
      return;
    }
    let cancelled = false;
    const urls = completionCrowdAvatarUrls.slice(0, maxOutcomeCrowdAvatars);
    const preloadPromises = urls.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        })
    );
    const fallback = window.setTimeout(() => {
      if (!cancelled) {
        setCompletionCrowdReady(true);
      }
    }, 1200);
    void Promise.all(preloadPromises).then(() => {
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
    setPendingGuessByTile((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      const next = new Map(previous);
      next.delete(tileIndex);
      if (Array.isArray(result.revealedTiles)) {
        for (const tile of result.revealedTiles) {
          next.delete(tile.index);
        }
      }
      return next;
    });
    if (result.errorCode === 'TILE_LOCKED') {
      showToast('This tile is still locked.');
    }
    let nextPuzzle = puzzleSnapshot;
    if (result.isCorrect) {
      playSfx('correct');
      const revealedTiles = Array.isArray(result.revealedTiles)
        ? result.revealedTiles
        : [];
      nextPuzzle = applyRevealedTiles(nextPuzzle, revealedTiles);
      const revealedIndicesForAnimation =
        revealedTiles.length > 0
          ? revealedTiles.map((tile) => tile.index)
          : result.revealedIndices;
      setCorrectGuessTileIndices((previous) => {
        const next = new Set(previous);
        for (const index of revealedIndicesForAnimation) {
          next.add(index);
        }
        return next;
      });
      setSelectedTile((previous) => (previous === tileIndex ? null : previous));
      setPuzzle(nextPuzzle);
    } else if (result.errorCode !== 'TILE_LOCKED') {
      playSfx('wrong');
      flashWrongTile(tileIndex);
    }
    setHeartsRemaining(result.heartsRemaining);
    const shouldRefresh =
      result.newlyUnlockedChainIds.length > 0 || result.lockProgressChanged;
    const viewPromise = shouldRefresh ? refreshCurrentView(levelId) : null;
    if (result.newlyUnlockedChainIds.length > 0) {
      showToast('Locks unlocked.');
    }
    if (result.isLevelComplete) {
      await finishLevel();
    } else if (result.isGameOver) {
      setIsGameOver(true);
      setCompletionResult(null);
      setCompletionSolveSeconds(null);
      await refreshBootstrapState();
      persistOutcomeState({
        levelId,
        isComplete: false,
        isGameOver: true,
        completion: null,
        solveSeconds: null,
        savedAt: Date.now(),
      });
    } else {
      if (viewPromise) {
        void viewPromise
          .then((view) => {
            if (!hasAvailableLetters(view)) {
              void finishLevel().catch(() => undefined);
            }
          })
          .catch(() => undefined);
      } else if (!hasAvailableLetters(nextPuzzle)) {
        void finishLevel().catch(() => undefined);
      }
    }
    return nextPuzzle;
  };

  const submitLetterForTile = async (letter: string, tileIndex: number) => {
    if (busy || isComplete || isGameOver) {
      return;
    }
    const currentPuzzle = puzzleRef.current;
    if (!currentPuzzle) {
      return;
    }
    const selected = currentPuzzle.tiles[tileIndex];
    if (!selected || !selected.isLetter || selected.isLocked || selected.displayChar !== '_') {
      return;
    }
    if (!canUseLifeForChallenge) {
      showToast('No lives left. Wait for refill.');
      return;
    }
    try {
      const result = await trpc.game.submitGuess.mutate({
        levelId,
        tileIndex,
        guessedLetter: letter,
      });
      await applyGuessResult(result, tileIndex, puzzleRef.current);
    } catch (_error) {
      showToast('Guess failed.');
    }
  };

  const processGuessQueue = async () => {
    if (processingGuessRef.current) {
      return;
    }
    processingGuessRef.current = true;
    setGuessInFlight(true);
    try {
      while (guessQueueRef.current.length > 0) {
        const batch = guessQueueRef.current.splice(0, guessQueueRef.current.length);
        setQueuedGuessCount(guessQueueRef.current.length);
        if (batch.length === 0) {
          continue;
        }
        const filtered = batch.filter((entry) => entry.levelId === levelId);
        if (filtered.length === 0) {
          continue;
        }
        if (filtered.length === 1) {
          const entry = filtered[0];
          if (entry) {
            await submitLetterForTile(entry.letter, entry.tileIndex);
          }
          continue;
        }
        const result = await trpc.game.submitGuesses.mutate({
          levelId,
          guesses: filtered.map((entry) => ({
            tileIndex: entry.tileIndex,
            guessedLetter: entry.letter,
          })),
        });
        let optimisticPuzzle = puzzleRef.current;
        for (let index = 0; index < result.results.length; index += 1) {
          const entry = filtered[index];
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
            break;
          }
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
      busy ||
      isGameOver ||
      isComplete ||
      guessInFlight ||
      queuedGuessCount > 0
    ) {
      if (guessInFlight || queuedGuessCount > 0) {
        showToast('Finish current guesses first.');
      }
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
      const revealedTiles = Array.isArray(used.revealedTiles) ? used.revealedTiles : [];
      const nextPuzzle = applyRevealedTiles(puzzle, revealedTiles);
      setProfile(used.profile);
      setInventory(used.inventory);
      setPuzzle(nextPuzzle);
      if (item === 'shield') {
        showToast('Shield active for next mistake.');
      }
      const shouldRefresh =
        used.newlyUnlockedChainIds.length > 0 || used.lockProgressChanged;
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
    return Math.floor(profile.coins / powerupCost[item]);
  };

  const openBuyDialog = (item: PowerupType) => {
    if (busy) {
      return;
    }
    const maxQuantity = maxPurchasableQuantity(item);
    if (maxQuantity < 1) {
      showToast('Not enough coins.');
      return;
    }
    setBuyDialog({ item, quantity: 1 });
  };

  const handleQuickPowerupTap = (item: PowerupType) => {
    if (!inventory || busy || guessInFlight || queuedGuessCount > 0 || isGameOver || isComplete) {
      return;
    }
    if (inventory[item] > 0) {
      void handleUsePowerup(item);
      return;
    }
    openBuyDialog(item);
  };

  const confirmBuy = async () => {
    if (!buyDialog || busy || !profile || !inventory) {
      return;
    }
    const max = maxPurchasableQuantity(buyDialog.item);
    if (max < 1) {
      showToast('Not enough coins.');
      setBuyDialog(null);
      return;
    }
    const quantity = Math.max(1, Math.min(buyDialog.quantity, max));
    setBusy(true);
    try {
      const bought = await trpc.powerup.purchase.mutate({
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

  const handleProductPurchase = async (sku: string) => {
    if (offerBusy) {
      return;
    }
    setOfferBusy(true);
    try {
      const result = await purchase([sku]);
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
    if (nextMode === 'endless') {
      showToast('Endless mode is coming soon.');
      return;
    }
    await loadLevel(nextMode);
    setActiveScreen('challenge');
  };

  const handleHomeTabSelect = (nextTab: HomeTab) => {
    setHomeTab(nextTab);
    if (nextTab === 'endless') {
      showToast('Endless mode is coming soon.');
    }
  };

  const handleHomePlay = () => {
    if (homeTab === 'endless') {
      showToast('Endless mode is coming soon.');
      return;
    }
    void loadModeAndOpenChallenge('daily');
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
    setFlairSaveBusy(true);
    try {
      const result = await trpc.profile.setActiveFlair.mutate({
        flair: nextFlair,
      });
      if (!result.success) {
        showToast(result.reason ?? 'Unable to change flair.');
        return;
      }
      setProfile(result.profile);
      showToast(
        nextFlair.length > 0 ? `Flair equipped: ${nextFlair}` : 'Flair cleared.'
      );
    } catch (_error) {
      showToast('Unable to change flair.');
    } finally {
      setFlairSaveBusy(false);
    }
  };

  const retry = async () => {
    if (!levelId) {
      return;
    }
    setBusy(true);
    try {
      await startLevel(levelId, mode);
      await refreshCurrentView(levelId);
      setIsGameOver(false);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!isComplete) {
      return;
    }
    const result = await trpc.social.shareResult.mutate({
      levelId,
    });
    showToast(result.success ? 'Result shared.' : result.reason ?? 'Share failed.');
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

  if (loading || !profile || !inventory || !puzzle) {
    return <div className="flex h-full items-center justify-center">Loading Decrypt...</div>;
  }

  const mistakesMade = Math.max(0, puzzle.heartsMax - heartsRemaining);
  const isInlineMode = webViewMode === 'inline';
  const buyMax = buyDialog ? maxPurchasableQuantity(buyDialog.item) : 0;
  const hasQueuedGuesses = queuedGuessCount > 0;
  const guessBusy = guessInFlight || hasQueuedGuesses;
  const deviceTier: DeviceTier =
    viewportWidth >= 1024 ? 'desktop' : viewportWidth >= 640 ? 'tablet' : 'mobile';
  const inlineTight = viewportWidth < 360;
  const frameMaxWidthClass = 'max-w-full';
  const powerupButtonSizeClass = isInlineMode
    ? inlineTight
      ? 'h-[38px] w-[38px] text-[17px]'
      : deviceTier === 'desktop'
        ? 'h-[50px] w-[50px] text-[22px]'
        : deviceTier === 'tablet'
          ? 'h-[46px] w-[46px] text-[20px]'
          : 'h-[42px] w-[42px] text-[18px]'
    : deviceTier === 'desktop'
      ? 'h-[40px] w-[40px] text-[18px]'
      : 'h-[36px] w-[36px] text-[16px]';
  const powerupWrapSizeClass = isInlineMode
    ? inlineTight
      ? 'h-[38px] w-[38px]'
      : deviceTier === 'desktop'
        ? 'h-[50px] w-[50px]'
        : deviceTier === 'tablet'
          ? 'h-[46px] w-[46px]'
          : 'h-[42px] w-[42px]'
    : deviceTier === 'desktop'
      ? 'h-[40px] w-[40px]'
      : 'h-[36px] w-[36px]';
  const utilityRowClass = isInlineMode
    ? deviceTier === 'desktop'
      ? 'bg-transparent px-3 pt-2 pb-4'
      : deviceTier === 'tablet'
        ? 'bg-transparent px-2.5 pt-1.5 pb-[14px]'
        : 'bg-transparent px-2 pt-1 pb-3'
    : 'bg-transparent px-3 py-3';
  const helpButtonClass = isInlineMode
    ? 'h-8 w-8 text-[14px]'
    : 'h-9 w-9 text-[15px]';
  const headerIconClass = isInlineMode ? 'h-[18px] w-[18px]' : 'h-[20px] w-[20px]';
  const helpCardWidthClass = deviceTier === 'mobile' ? 'max-w-[300px]' : 'max-w-[360px]';
  const puzzleMarkClass = isInlineMode
    ? 'text-[clamp(13px,3.8vw,18px)]'
    : 'text-[clamp(18px,2.5vw,24px)]';
  const puzzleCipherClass = isInlineMode
    ? 'text-[clamp(12px,2.6vw,14px)]'
    : 'text-[clamp(15px,2.1vw,17px)]';
  const separatorGlyphClass = isInlineMode
    ? 'text-[clamp(11px,3vw,15px)]'
    : 'text-[clamp(16px,2.3vw,20px)]';
  const punctuationMarkClass = isInlineMode
    ? 'text-[clamp(15px,4.1vw,19px)]'
    : 'text-[clamp(20px,2.7vw,25px)]';
  const punctuationTopHeightClass = isInlineMode ? 'min-h-[8px]' : 'min-h-[10px]';
  const punctuationBottomHeightClass = isInlineMode ? 'min-h-[25px]' : 'min-h-[24px]';
  const offerPromotionLabel = featuredOffer ? getOfferPromotionLabel(featuredOffer.sku) : '';
  const featuredPerks = featuredOffer
    ? [
      { key: 'coins', icon: coinEmoji, value: featuredOffer.perks.coins },
      { key: 'hearts', icon: heartEmoji, value: featuredOffer.perks.hearts },
      { key: 'hammer', icon: powerupIcon.hammer, value: featuredOffer.perks.hammer },
      { key: 'wand', icon: powerupIcon.wand, value: featuredOffer.perks.wand },
      { key: 'shield', icon: powerupIcon.shield, value: featuredOffer.perks.shield },
      { key: 'rocket', icon: powerupIcon.rocket, value: featuredOffer.perks.rocket },
    ].filter((entry) => entry.value > 0)
    : [];
  const layoutTestId = isInlineMode ? 'layout-inline' : 'layout-expanded-stacked';
  const isChallengeScreen = activeScreen === 'challenge';
  const isHomeScreen = activeScreen === 'home';
  const isShopScreen = activeScreen === 'shop';
  const isQuestScreen = activeScreen === 'quest';
  const isStatsScreen = activeScreen === 'stats';
  const isLeaderboardScreen = activeScreen === 'leaderboard';
  const showOutcomeOverlay = isChallengeScreen && (isGameOver || isComplete);
  const showSuccessOverlay = isComplete;
  const isDailyComplete = mode === 'daily' && isComplete;
  const maxLives = 3;
  const hasInfiniteHearts = profile.infiniteHeartsExpiryTs > headerNowTs;
  const infiniteHeartsRemainingMs = Math.max(0, profile.infiniteHeartsExpiryTs - headerNowTs);
  const baseLives = Math.min(maxLives, Math.max(0, profile.hearts));
  const elapsedSinceLastRefillMs = Math.max(0, headerNowTs - profile.lastHeartRefillTs);
  const earnedRefills =
    baseLives >= maxLives ? 0 : Math.floor(elapsedSinceLastRefillMs / heartRefillIntervalMs);
  const currentLives = hasInfiniteHearts
    ? maxLives
    : Math.min(maxLives, baseLives + earnedRefills);
  const nextLifeRemainingMs = (() => {
    if (hasInfiniteHearts || currentLives >= maxLives) {
      return 0;
    }
    const cycleElapsedMs = elapsedSinceLastRefillMs % heartRefillIntervalMs;
    return cycleElapsedMs === 0 ? heartRefillIntervalMs : heartRefillIntervalMs - cycleElapsedMs;
  })();
  const canUseLifeForChallenge = hasInfiniteHearts || currentLives > 0;
  const lifeStatusText = hasInfiniteHearts
    ? `Infinite ${formatCountdown(infiniteHeartsRemainingMs)}`
    : currentLives >= maxLives
      ? 'Full'
      : `+1 in ${formatCountdown(nextLifeRemainingMs)}`;
  const completionQuote = (() => {
    const solvedLetters = puzzle.words.join('');
    let letterCursor = 0;
    const rebuilt = puzzle.tiles
      .map((tile) => {
        if (!tile.isLetter) {
          return tile.displayChar;
        }
        const nextLetter = solvedLetters.charAt(letterCursor);
        letterCursor += 1;
        return nextLetter || tile.displayChar;
      })
      .join('');
    return rebuilt.trim().length > 0 ? rebuilt : puzzle.words.join(' ');
  })();
  const outcomeTitle = isComplete ? 'Level Completed' : 'Challenge Ended';
  const outcomeSubtitle = isComplete ? '' : 'Good run. Recharge and try again.';
  const completionSolveLabel = formatStatDuration(
    completionSolveSeconds ?? completionResult?.solveSeconds ?? null
  );
  const homePanelClass = deviceTier === 'mobile'
    ? 'mx-auto mt-3 w-full max-w-[340px] space-y-3'
    : 'mx-auto mt-4 w-full max-w-[520px] space-y-4';
  const claimedQuestIdSet = new Set(questStatus?.claimedQuestIds ?? []);
  const visibleDailyQuests =
    questStatus?.progress == null
      ? []
      : questCards.filter(
          (quest) =>
            quest.category === 'daily' &&
            !isQuestHidden(quest, questStatus.progress, claimedQuestIdSet)
        );
  const visibleMilestoneIds =
    questStatus && questStatus.progress
      ? getVisibleMilestoneIds(questStatus.progress, claimedQuestIdSet)
      : new Set<string>();
  const inlinePromoClusterClass = inlineTight
    ? 'h-[62px] w-[116px]'
    : deviceTier === 'desktop'
      ? 'h-[94px] w-[164px]'
      : deviceTier === 'tablet'
        ? 'h-[84px] w-[146px]'
        : 'h-[76px] w-[128px]';
  const inlineSnooClass = inlineTight
    ? 'h-[52px] w-[52px]'
    : deviceTier === 'desktop'
      ? 'h-[76px] w-[76px]'
      : deviceTier === 'tablet'
        ? 'h-[66px] w-[66px]'
        : 'h-[58px] w-[58px]';
  const inlineBundleDockClass = inlineTight
    ? 'left-[34px] bottom-[1px]'
    : deviceTier === 'desktop'
      ? 'left-[54px] bottom-[3px]'
      : deviceTier === 'tablet'
        ? 'left-[46px] bottom-[2px]'
        : 'left-[38px] bottom-[2px]';
  const inlineBundleCardClass = inlineTight
    ? 'h-[78px] w-[74px] rounded-[11px] p-[3px]'
    : deviceTier === 'desktop'
      ? 'h-[102px] w-[96px] rounded-[14px] p-1'
      : deviceTier === 'tablet'
        ? 'h-[94px] w-[88px] rounded-[13px] p-1'
        : 'h-[86px] w-[80px] rounded-[12px] p-1';
  const bundleRewardRowTextClass = inlineTight
    ? 'text-[11px]'
    : deviceTier === 'desktop'
      ? 'text-[14px]'
      : deviceTier === 'tablet'
        ? 'text-[13px]'
        : 'text-[12px]';
  const bundleRewardValueTextClass = inlineTight
    ? 'text-[12px]'
    : deviceTier === 'desktop'
      ? 'text-[15px]'
      : deviceTier === 'tablet'
        ? 'text-[14px]'
        : 'text-[13px]';
  const puzzleTokenLines = isInlineMode
    ? chunkPuzzleTokensByWordLimit(tokens, inlineMaxWordsPerLine)
    : [tokens];
  const activeLeaderboardEntries =
    leaderboardTab === 'daily' ? dailyLeaderboardEntries : endlessLeaderboardEntries;
  const dailyAvgSolveSeconds =
    profile.dailyModeClears > 0
      ? Math.round(profile.dailySolveTimeTotalSec / profile.dailyModeClears)
      : null;
  const endlessAvgSolveSeconds =
    profile.endlessModeClears > 0
      ? Math.round(profile.endlessSolveTimeTotalSec / profile.endlessModeClears)
      : null;
  const dailyStatCards = [
    { label: 'Levels Cleared', value: profile.dailyModeClears.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(dailyAvgSolveSeconds) },
    { label: 'Current Streak', value: profile.dailyCurrentStreak.toLocaleString() },
    { label: 'Flawless Wins', value: profile.dailyFlawlessWins.toLocaleString() },
    { label: 'Speed Wins', value: profile.dailySpeedWins.toLocaleString() },
    { label: 'Challenges Played', value: profile.dailyChallengesPlayed.toLocaleString() },
    { label: 'First Try Wins', value: profile.dailyFirstTryWins.toLocaleString() },
  ];
  const endlessStatCards = [
    { label: 'Levels Cleared', value: profile.endlessModeClears.toLocaleString() },
    { label: 'Avg Solve Time', value: formatStatDuration(endlessAvgSolveSeconds) },
    { label: 'Current Streak', value: profile.endlessCurrentStreak.toLocaleString() },
    { label: 'Flawless Wins', value: profile.endlessFlawlessWins.toLocaleString() },
    { label: 'Speed Wins', value: profile.endlessSpeedWins.toLocaleString() },
    { label: 'Challenges Played', value: profile.endlessChallengesPlayed.toLocaleString() },
    { label: 'First Try Wins', value: profile.endlessFirstTryWins.toLocaleString() },
  ];
  const activeStatsCards =
    statsTab === 'daily' ? dailyStatCards : endlessStatCards;
  const unlockedFlairs = profile.unlockedFlairs;
  const equippedFlairStyle = flairChipStyle(profile.activeFlair, true);
  const activeStatsRank =
    statsTab === 'daily'
      ? rankSummary?.dailyRank ?? null
      : rankSummary?.endlessRank ?? null;
  const globalStatsCards = [
    { label: 'Quest Completed', value: profile.questsCompleted.toLocaleString() },
    { label: 'Current Rank', value: formatRankLabel(activeStatsRank) },
    {
      label: 'All-Time Best Ranking',
      value: formatRankLabel(rankSummary?.bestOverallRank ?? profile.bestOverallRank),
    },
  ];
  const visibleStatsCards = [...activeStatsCards, ...globalStatsCards];

  const splitWordTiles = (tiles: PuzzlePublicTile[]): PuzzlePublicTile[][] => {
    if (tiles.length <= maxWordTileColumns) {
      return [tiles];
    }
    const chunks: PuzzlePublicTile[][] = [];
    for (let i = 0; i < tiles.length; i += maxWordTileColumns) {
      chunks.push(tiles.slice(i, i + maxWordTileColumns));
    }
    return chunks;
  };

  const focusInlineInputProxy = () => {
    const input = inlineInputRef.current;
    if (!input) {
      return;
    }
    input.value = '';
    input.focus({ preventScroll: true });
  };

  const handleTileSelection = (tileIndex: number) => {
    setSelectedTile(tileIndex);
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
    primeSfx();
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
    primeSfx();
    playSfx('button');
  };

  return (
    <div
      onPointerDownCapture={handleButtonPointerDownCapture}
      onKeyDownCapture={handleButtonKeyDownCapture}
      className={cn(
        'theme-app relative h-full w-full overflow-hidden',
        isChallengeScreen ? 'challenge-backdrop' : '',
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
        <div className="flex h-full w-full min-w-0 flex-col overflow-hidden" data-testid={layoutTestId}>
          {!showOutcomeOverlay && (
            <header className="px-2 pb-[6px] pt-2">
              <div className="flex items-center justify-between">
                <div className="app-text text-[clamp(14px,4.2vw,16px)] font-bold">{coinEmoji} {profile.coins}</div>
                <div className="text-center">
                  {isChallengeScreen ? (
                    <>
                      <div className="app-text-muted text-[10px] font-bold uppercase">Mistakes</div>
                      <div className="flex gap-1" data-testid="mistake-indicator">
                        {[0, 1, 2].map((index) => (
                          <span
                            key={index}
                            className="app-text flex h-[clamp(20px,6vw,24px)] w-[clamp(20px,6vw,24px)] items-center justify-center rounded-full border app-border-strong text-[clamp(9px,2.3vw,11px)]"
                          >
                            {index < mistakesMade ? crossMarkEmoji : ''}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="app-text-muted text-[10px] font-bold uppercase">Lives</div>
                      <div className="flex justify-center gap-1" data-testid="life-indicator">
                        {[0, 1, 2].map((index) => (
                          <span
                            key={index}
                            className="flex h-[clamp(24px,7vw,30px)] w-[clamp(24px,7vw,30px)] items-center justify-center text-[clamp(14px,3.6vw,18px)] leading-none"
                          >
                            {index < (hasInfiniteHearts ? maxLives : currentLives) ? heartEmoji : emptyHeartGlyph}
                          </span>
                        ))}
                      </div>
                      <div className="app-text-muted mt-[2px] text-[9px] font-bold uppercase">{lifeStatusText}</div>
                    </>
                  )}
                </div>
                <div className="flex items-center">
                  <button
                    data-testid="info-button"
                    ref={infoButtonRef}
                    className={`${helpButtonClass} btn-3d btn-neutral btn-info-soft btn-round flex items-center justify-center font-black`}
                    onClick={() => setIsHelpOpen((previous) => !previous)}
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
                <span>{challengeTypeLabel} lines ({difficultyLabel})</span>
                <span>Win: {challengeMetrics.winRatePct}%</span>
              </div>
            </div>
          )}

          {isChallengeScreen && !showOutcomeOverlay && (
            <main
              className="flex flex-1 min-h-0 px-2 py-2"
            >
            <div
              className="min-w-0 flex-1"
            >
              <div
                ref={viewportRef}
                className={`flex h-full justify-center overflow-x-hidden overflow-y-auto ${isPuzzleVerticallyCentered ? 'items-center' : 'items-start'}`}
              >
                <div className="flex w-full justify-center" style={{ transform: `scale(${puzzleScale})`, transformOrigin: 'top center' }}>
                  <div ref={contentRef} className="inline-block max-w-full">
                    <div
                      data-testid="puzzle-token-wrap"
                      className="flex flex-col items-center gap-y-[6px]"
                    >
                      {puzzleTokenLines.map((lineTokens, lineIndex) => (
                        <div key={`line-${lineIndex}`} className="flex flex-wrap items-end justify-center">
                          {lineTokens.map((token) => {
                            if (token.type === 'separator') {
                              return token.tile.displayChar === ' ' ? (
                                <span key={token.key} className={`inline-flex h-[1px] ${isInlineMode ? 'w-[20px]' : 'w-[22px]'}`} aria-hidden="true" />
                              ) : (
                                <div
                                  key={token.key}
                                  className={`${isInlineMode ? 'mr-0.5 min-w-[14px]' : 'mr-1 min-w-[16px]'} app-text flex flex-col items-center`}
                                >
                                  <span className={`${punctuationTopHeightClass} ${punctuationMarkClass} inline-flex -translate-y-[3px] items-start leading-none`}>
                                    {token.tile.displayChar}
                                  </span>
                                  <span className={`${punctuationBottomHeightClass} ${puzzleCipherClass} leading-none opacity-0 select-none`}>
                                    {'\u00A0'}
                                  </span>
                                </div>
                              );
                            }
                            const wordRows = splitWordTiles(token.tiles);
                            const isBridgeWord = wordRows.length > 1;
                            const highlightBridgeWord =
                              isBridgeWord &&
                              selectedTile !== null &&
                              token.tiles.some((tile) => tile.index === selectedTile);
                            return (
                              <div
                                key={token.key}
                                className={`${isBridgeWord
                                  ? `${isInlineMode ? 'mr-0.5' : 'mr-1'} inline-flex flex-col gap-0`
                                  : `${isInlineMode ? 'mr-0.5 gap-[2px]' : 'mr-1 gap-1'} inline-flex items-end whitespace-nowrap`
                                  } ${highlightBridgeWord ? 'app-surface-subtle rounded-md px-1 py-0.5' : ''}`}
                              >
                                {wordRows.map((rowTiles, rowIndex) => (
                                  <div
                                    key={`${token.key}-row-${rowIndex}`}
                                    className={`inline-flex items-end ${isInlineMode ? 'gap-[2px]' : 'gap-1'}`}
                                  >
                                    {rowTiles.map((tile) => {
                                      if (!tile.isLetter) {
                                        return (
                                          <div
                                            key={tile.index}
                                            className={`app-text flex ${isInlineMode ? 'min-w-[15px]' : 'min-w-[18px]'} flex-col items-center`}
                                          >
                                            <span className={`${punctuationTopHeightClass} ${punctuationMarkClass} inline-flex -translate-y-[3px] items-start leading-none`}>
                                              {tile.displayChar}
                                            </span>
                                            <span className={`${punctuationBottomHeightClass} ${puzzleCipherClass} leading-none opacity-0 select-none`}>
                                              {'\u00A0'}
                                            </span>
                                          </div>
                                        );
                                      }
                                      const disabled = tile.isLocked || busy || isComplete || isGameOver;
                                      const pendingLetter =
                                        !tile.isLocked && tile.displayChar === '_'
                                          ? pendingGuessByTile.get(tile.index)
                                          : null;
                                      const displayChar = pendingLetter ?? tile.displayChar;
                                      const lockDotCount = tile.isLocked
                                        ? Math.min(3, tile.lockRemainingKeys ?? 0)
                                        : 0;
                                      const lockDots =
                                        lockDotCount > 0
                                          ? Array.from({ length: lockDotCount }, (_value, index) => (
                                              <span key={`lock-dot-${tile.index}-${index}`} className="lock-dot">
                                                •
                                              </span>
                                            ))
                                          : null;
                                      const tileState = letterTileState(
                                        selectedTile === tile.index,
                                        tile.isLocked,
                                        correctGuessTileIndices.has(tile.index),
                                        wrongGuessTileIndices.has(tile.index)
                                      );
                                      return (
                                        <button
                                          key={tile.index}
                                          disabled={disabled}
                                          onClick={() => handleTileSelection(tile.index)}
                                          data-tile-state={tileState}
                                          className={letterTileClass(
                                            selectedTile === tile.index,
                                            disabled,
                                            tile.isGold,
                                            tile.isLocked,
                                            correctGuessTileIndices.has(tile.index),
                                            wrongGuessTileIndices.has(tile.index)
                                          )}
                                        >
                                          {tile.isLocked && (
                                            <span className="lock-stack-full">
                                              {lockDots ? (
                                                <span className="lock-dot-col">
                                                  {lockDots}
                                                </span>
                                              ) : null}
                                              <span className="lock-emoji">{lockEmoji}</span>
                                            </span>
                                          )}
                                          <span
                                            className={cn(
                                              `flex h-[18px] items-center justify-center font-black leading-none ${puzzleMarkClass}`,
                                              pendingLetter ? 'opacity-60' : ''
                                            )}
                                          >
                                            {tile.isLocked
                                              ? '\u00A0'
                                              : displayChar === '_'
                                                ? '\u00A0'
                                                : displayChar}
                                          </span>
                                          <span className={`app-surface-subtle block h-[2px] rounded-full ${isInlineMode ? 'mt-0.5 w-[clamp(16px,4.6vw,22px)]' : 'mt-1 w-[clamp(20px,5.4vw,26px)]'}`} />
                                          <span className={`app-text-soft block min-h-[12px] ${isInlineMode ? 'mt-0.5' : 'mt-1'} ${puzzleCipherClass}`}>
                                            {tile.isLocked ? (
                                              '\u00A0'
                                            ) : tile.isBlind ? (
                                              <span className="cipher-blind-mark">?</span>
                                            ) : (
                                              tile.cipherNumber ?? '\u00A0'
                                            )}
                                          </span>
                                        </button>
                                      );
                                    })}
                                    {isBridgeWord && rowIndex < wordRows.length - 1 && (
                                      <div className={`app-text-soft flex min-w-[14px] items-center justify-center ${isInlineMode ? 'mb-[9px]' : 'mb-[12px]'}`}>
                                        <span className={`${separatorGlyphClass} leading-none`}>{wordContinuationGlyph}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </main>
          )}

          {isChallengeScreen && showOutcomeOverlay && (
            <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="result-screen">
              {showSuccessOverlay && (
                <canvas
                  ref={setConfettiCanvasNode}
                  data-testid="result-confetti"
                  className="result-confetti-canvas"
                />
              )}
              {showSuccessOverlay &&
                completionCrowdAvatarUrls.length > 0 &&
                completionCrowdReady && (
                <section
                  data-testid="outcome-overlay-crowd"
                  className="pointer-events-none absolute inset-0 z-0"
                  ref={handleOutcomeCrowdRef}
                >
                  {outcomeCrowdBubbles.map((bubble) => {
                    return (
                      <div
                        key={bubble.id}
                        ref={(node) => {
                          setOutcomeCrowdBubbleNode(bubble.id, node);
                        }}
                        className={cn(
                          'result-crowd-avatar absolute',
                          bubble.isPodium ? 'result-crowd-avatar-podium' : ''
                        )}
                        style={{
                          left: 0,
                          top: 0,
                          width: `${bubble.size}px`,
                          height: `${bubble.size}px`,
                          zIndex: bubble.z,
                          transform: `translate3d(${bubble.x}px, ${bubble.y}px, 0) translate(-50%, -50%)`,
                        }}
                      >
                        <div
                          className="result-crowd-avatar-frame"
                          style={{
                            backgroundColor: bubble.backgroundColor,
                            boxShadow: bubble.isPodium
                              ? '0 12px 24px rgba(0, 0, 0, 0.28)'
                              : '0 8px 16px rgba(0, 0, 0, 0.18)',
                          }}
                        >
                          <img
                            src={bubble.avatarUrl}
                            alt="Player avatar"
                            className="result-crowd-avatar-image"
                            onError={(event) => {
                              event.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              <div
                className="pointer-events-none absolute inset-0 z-10"
                style={{ backgroundColor: 'var(--app-overlay)' }}
              />

              <main className="relative z-20 flex min-h-0 flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3">
                <div className="mx-auto h-full min-h-0 w-full max-w-[680px] overflow-hidden bg-transparent">
                  <div className="flex h-full min-h-0 flex-col overflow-y-auto">
                    <header className="shrink-0 px-3 pt-3 text-center sm:px-4 sm:pt-4" data-testid="outcome-overlay-header">
                      <h2 className="text-white text-[clamp(24px,5vw,36px)] font-black uppercase tracking-[0.05em]">
                        {outcomeTitle}
                      </h2>
                      {outcomeSubtitle.length > 0 && (
                        <p className="mt-1 text-sm font-semibold uppercase tracking-[0.04em] text-white/85">
                          {outcomeSubtitle}
                        </p>
                      )}
                    </header>

                    {showSuccessOverlay && (
                      <div className="relative mx-3 mt-2 mb-7 shrink-0 sm:mx-4 sm:mb-8">
                        <section
                          data-testid="outcome-overlay-quote"
                          className="rounded-2xl border border-white bg-transparent px-3 py-3 text-center sm:px-5 sm:py-4"
                        >
                          <p className="text-4xl font-black leading-none text-white/85">“</p>
                          <p className="mt-1 text-[clamp(16px,2.8vw,28px)] font-black leading-snug text-white">
                            {completionQuote}
                          </p>
                          <p className="mt-2 text-[clamp(14px,2.3vw,20px)] font-semibold text-white">
                            — {puzzle.author}
                          </p>
                        </section>
                        <div
                          data-testid="outcome-time-pill"
                          className="absolute top-full left-1/2 flex -translate-x-1/2 translate-y-0 items-center gap-2 rounded-b-2xl border-x border-b border-white bg-transparent px-4 py-1.5"
                        >
                          <span className="text-[12px] font-black uppercase tracking-[0.03em] text-white">
                            Time:
                          </span>
                          <span className="text-[clamp(17px,3.4vw,24px)] leading-none font-black tabular-nums text-white">
                            {completionSolveLabel}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="min-h-0 flex-1" />

                    <footer className="shrink-0 px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
                      <div className="flex items-center justify-center gap-3">
                        {showSuccessOverlay && (
                          <button
                            data-testid="overlay-share-comment"
                            className="btn-3d btn-primary btn-share-result btn-round flex h-14 w-14 items-center justify-center"
                            onClick={share}
                            disabled={busy}
                            aria-label="Share as comment"
                            title="Share as comment"
                          >
                            <ShareIcon className="h-6 w-6" />
                          </button>
                        )}
                        {!isDailyComplete && (
                          <button
                            data-testid="overlay-play-again"
                            className="btn-3d btn-retry btn-round flex h-14 w-14 items-center justify-center"
                            onClick={retry}
                            disabled={busy}
                            aria-label="Play again"
                            title="Play again"
                          >
                            <ReplayIcon className="h-6 w-6" />
                          </button>
                        )}
                        <button
                          data-testid="overlay-go-home"
                          className="btn-3d btn-home btn-round flex h-14 w-14 items-center justify-center"
                          onClick={openHome}
                          disabled={busy}
                          aria-label="Go home"
                          title="Go home"
                        >
                          <HomeIcon className="h-6 w-6" />
                        </button>
                      </div>
                    </footer>
                  </div>
                </div>
              </main>
            </section>
          )}

          {isChallengeScreen && !showOutcomeOverlay && (
            <section className={utilityRowClass} data-testid="utility-row">
              <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
                <div data-testid="inline-promo-cluster" className={`relative justify-self-start ${inlinePromoClusterClass}`}>
                  <img
                    data-testid="snoo-presenter"
                    src="/snoo.png"
                    alt="Snoo"
                    className={`pointer-events-none absolute bottom-0 left-0 z-10 object-contain ${inlineSnooClass}`}
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
	                        title={`${offerPromotionLabel}: ${coinEmoji} x${featuredOffer.perks.coins}, ${powerupIcon.hammer} x${featuredOffer.perks.hammer}, ${powerupIcon.shield} x${featuredOffer.perks.shield}`}
	                      >
	                        <div className="flex h-full w-full flex-col justify-center">
	                          <div className="mb-1 flex shrink-0 flex-col">
	                            <span
	                              data-testid="bundle-badge"
	                              className={`pointer-events-none font-black uppercase leading-none tracking-[0.02em] ${inlineTight ? 'text-[9px]' : deviceTier === 'desktop' ? 'text-[13px]' : deviceTier === 'tablet' ? 'text-[12px]' : 'text-[11px]'}`}
	                            >
	                              {offerPromotionLabel}
	                            </span>
	                            <span
	                              className={`${inlineTight ? 'text-[7px]' : deviceTier === 'desktop' ? 'text-[9px]' : 'text-[8px]'} mt-0.5 font-semibold leading-none opacity-70`}
	                            >
	                              {featuredOffer.displayName}
	                            </span>
	                          </div>
	                          <div className={`app-text flex min-h-0 flex-1 flex-col justify-center space-y-0.5 overflow-hidden ${bundleRewardRowTextClass}`}>
	                            {featuredPerks.slice(0, 3).map((perk) => (
	                              <div key={perk.key} className="flex items-center font-black leading-none">
	                                <span>{perk.icon}</span>
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
                      const maxQuantity = maxPurchasableQuantity(item);
                      return (
                        <div key={item} className="flex flex-col items-center gap-1">
                          <div className={`relative shrink-0 ${powerupWrapSizeClass}`}>
                            <button
                              data-testid={`powerup-use-${item}`}
                              className={`btn-3d btn-neutral btn-round flex items-center justify-center leading-none ${powerupButtonSizeClass}`}
                              onClick={() => handleQuickPowerupTap(item)}
                              disabled={busy || guessBusy || isGameOver || isComplete}
                              title={`${powerupLabel[item]} (${count})`}
                            >
                              {powerupIcon[item]}
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
                              disabled={busy || guessBusy || maxQuantity < 1}
                              onClick={() => openBuyDialog(item)}
                              title={`Buy ${powerupLabel[item]}`}
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
              homePanelClass={homePanelClass}
            />
          )}

          {isShopScreen && (
            <Suspense fallback={null}>
              <LazyShopScreen
                shopProducts={shopProducts}
                offerBusy={offerBusy}
                onPurchase={(sku) => void handleProductPurchase(sku)}
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
                questCards={questCards}
                visibleMilestoneIds={visibleMilestoneIds}
                groupedQuestIds={groupedQuestIds}
                claimedQuestIdSet={claimedQuestIdSet}
                claimingQuestId={claimingQuestId}
                onClaimQuest={(questId) => void handleQuestClaim(questId)}
                formatQuestReward={formatQuestReward}
                flairTagStyle={flairTagStyle}
                getQuestProgressValue={getQuestProgressValue}
                isQuestHidden={isQuestHidden}
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
                onRefresh={() => void loadLeaderboardData()}
                leaderboardLoading={leaderboardLoading}
                activeLeaderboardEntries={activeLeaderboardEntries}
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

      {buyDialog && (
        <BuyDialog
          buyDialog={buyDialog}
          buyMax={buyMax}
          busy={busy}
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
    </div>
  );
};

