import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bootstrapQuery = vi.fn();
const loadLevelQuery = vi.fn();
const startSessionMutation = vi.fn();
const continueLevelMutation = vi.fn();
const heartbeatMutation = vi.fn().mockResolvedValue({ ok: true });
const getCurrentViewQuery = vi.fn();
const getCompletedOutcomeQuery = vi.fn();
const getFailedOutcomeQuery = vi.fn();
const submitGuessMutation = vi.fn();
const submitGuessesMutation = vi.fn();
const completeSessionMutation = vi.fn();
const powerupPurchaseMutation = vi.fn();
const powerupUseMutation = vi.fn();
const leaderboardDailyQuery = vi.fn();
const leaderboardLevelQuery = vi.fn();
const leaderboardAllTimeQuery = vi.fn();
const leaderboardRankSummaryQuery = vi.fn();
const storeProductsQuery = vi.fn();
const questsGetStatusQuery = vi.fn();
const questsClaimMutation = vi.fn();
const profileJoinCommunityMutation = vi.fn();
const profileSetActiveFlairMutation = vi.fn();
const profileSetAudioEnabledMutation = vi.fn();
const purchaseMock = vi.fn();
const navigateToMock = vi.fn();
const showToastMock = vi.fn();
const requestExpandedModeMock = vi.fn();
const getWebViewModeMock = vi.fn(() => 'inline');
const addWebViewModeListenerMock = vi.fn();
const removeWebViewModeListenerMock = vi.fn();
const confettiBurstMock = vi.fn().mockResolvedValue(undefined);
const confettiCreateMock = vi.fn(() => vi.fn().mockResolvedValue(undefined));
let mountedGameModule: typeof import('./game') | null = null;

vi.mock('./trpc', () => ({
  trpc: {
    game: {
      bootstrap: { query: bootstrapQuery },
      loadLevel: { query: loadLevelQuery },
      startSession: { mutate: startSessionMutation },
      continueLevel: { mutate: continueLevelMutation },
      heartbeat: { mutate: heartbeatMutation },
      getCurrentView: { query: getCurrentViewQuery },
      getCompletedOutcome: { query: getCompletedOutcomeQuery },
      getFailedOutcome: { query: getFailedOutcomeQuery },
      submitGuess: { mutate: submitGuessMutation },
      submitGuesses: { mutate: submitGuessesMutation },
      completeSession: { mutate: completeSessionMutation },
    },
    powerup: {
      purchase: { mutate: powerupPurchaseMutation },
      use: { mutate: powerupUseMutation },
    },
    leaderboard: {
      getDaily: { query: leaderboardDailyQuery },
      getLevel: { query: leaderboardLevelQuery },
      getAllTime: { query: leaderboardAllTimeQuery },
      getRankSummary: { query: leaderboardRankSummaryQuery },
    },
    social: {
      shareResult: { mutate: vi.fn() },
    },
    quests: {
      getStatus: { query: questsGetStatusQuery },
      claim: { mutate: questsClaimMutation },
    },
    profile: {
      joinCommunity: { mutate: profileJoinCommunityMutation },
      setActiveFlair: { mutate: profileSetActiveFlairMutation },
      setAudioEnabled: { mutate: profileSetAudioEnabledMutation },
    },
    store: {
      getProducts: { query: storeProductsQuery },
    },
  },
}));

vi.mock('@devvit/web/client', () => ({
  navigateTo: navigateToMock,
  showToast: showToastMock,
  requestExpandedMode: requestExpandedModeMock,
  purchase: purchaseMock,
  getWebViewMode: getWebViewModeMock,
  addWebViewModeListener: addWebViewModeListenerMock,
  removeWebViewModeListener: removeWebViewModeListenerMock,
  OrderResultStatus: {
    STATUS_SUCCESS: 'STATUS_SUCCESS',
  },
}));

vi.mock('canvas-confetti', () => ({
  default: Object.assign(confettiBurstMock, {
    create: confettiCreateMock,
  }),
}));

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for UI update.');
};

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
};

const profileFixture = (coins = 500) => ({
  coins,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 0,
  dailyCurrentStreak: 0,
  endlessCurrentStreak: 0,
  lastPlayedDateKey: '',
  totalWordsSolved: 0,
  logicTasksCompleted: 0,
  totalLevelsCompleted: 0,
  flawlessWins: 0,
  speedWins: 0,
  dailyFlawlessWins: 0,
  endlessFlawlessWins: 0,
  dailySpeedWins: 0,
  endlessSpeedWins: 0,
  dailyChallengesPlayed: 0,
  endlessChallengesPlayed: 0,
  dailyFirstTryWins: 0,
  endlessFirstTryWins: 0,
  questsCompleted: 0,
  dailyModeClears: 0,
  endlessModeClears: 0,
  dailySolveTimeTotalSec: 0,
  endlessSolveTimeTotalSec: 0,
  bestOverallRank: 0,
  audioEnabled: true,
  themePreference: 'default' as const,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
});

const inventoryFixture = (overrides?: Partial<{ hammer: number; wand: number; shield: number; rocket: number }>) => ({
  hammer: 0,
  wand: 0,
  shield: 0,
  rocket: 0,
  ...overrides,
});

const puzzleFixture = (displayChar = '_', targetTimeSeconds?: number) => ({
  levelId: 'lvl_0001',
  dateKey: '2026-02-24',
  author: 'UNKNOWN',
  words: ['HELLO'],
  heartsMax: 3,
  ...(typeof targetTimeSeconds === 'number' ? { targetTimeSeconds } : {}),
  tiles: [
    {
      index: 0,
      isLetter: true,
      displayChar,
      cipherNumber: 1,
      isBlind: false,
      isGold: false,
      isLocked: false,
    },
  ],
});

const primeBaseMocks = (params?: {
  mode?: 'inline' | 'expanded';
  coins?: number;
  hearts?: number;
  inventory?: Partial<{ hammer: number; wand: number; shield: number; rocket: number }>;
  puzzle?: ReturnType<typeof puzzleFixture>;
  startTimestamp?: number;
  session?: Partial<{
    mistakesMade: number;
    shieldIsActive: boolean;
    revealedIndices: number[];
    usedPowerups: number;
    wrongGuesses: number;
    guessCount: number;
  }>;
  storeProducts?: Array<{
    sku: string;
    displayName: string;
    description: string;
    price: number;
    isOneTime: boolean;
    usdApprox: number | null;
    perks: {
      coins: number;
      hearts: number;
      hammer: number;
      wand: number;
      shield: number;
      rocket: number;
      infiniteHeartsHours: number;
    };
  }>;
}) => {
  getWebViewModeMock.mockReturnValue(params?.mode ?? 'inline');
  const puzzle = params?.puzzle ?? puzzleFixture('_');
  const profile = { ...profileFixture(params?.coins ?? 500), hearts: params?.hearts ?? 3 };
  bootstrapQuery.mockResolvedValue({
    userId: 't2_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postId: 't3_test',
    currentDailyLevelId: 'lvl_0001',
    todayDateKey: '2026-02-24',
    profile: profileFixture(params?.coins ?? 500),
    inventory: inventoryFixture(params?.inventory),
    endlessCatalog: {
      available: false,
      activeCatalogVersion: null,
      runtimeCatalogVersion: null,
      publishedLevelCount: 0,
      bundledVersions: [],
    },
  });
  loadLevelQuery.mockResolvedValue({
    mode: 'daily',
    levelId: 'lvl_0001',
    puzzle,
    alreadyCompleted: false,
    retryCount: 0,
    nextRetryCost: 35,
    retryScoreFactor: 1,
    nextRetryScoreFactor: 1,
    requiresPaidRetry: false,
    challengeMetrics: {
      plays: 42,
      wins: 21,
      winRatePct: 50,
    },
  });
	  startSessionMutation.mockResolvedValue({
    ok: true,
    session: {
      activeLevelId: 'lvl_0001',
      mode: 'daily',
      startTimestamp: params?.startTimestamp ?? 0,
      activeMs: 0,
      lastSeenAt: 0,
      mistakesMade: 0,
      shieldIsActive: false,
      revealedIndices: [],
      usedPowerups: 0,
      wrongGuesses: 0,
      guessCount: 0,
      ...params?.session,
    },
    heartsRemaining: 3,
	  });
  continueLevelMutation.mockResolvedValue({
    ok: true,
    session: {
      activeLevelId: 'lvl_0001',
      mode: 'daily',
      startTimestamp: params?.startTimestamp ?? 0,
      activeMs: 0,
      lastSeenAt: 0,
      mistakesMade: 0,
      shieldIsActive: false,
      revealedIndices: [],
      usedPowerups: 0,
      wrongGuesses: 0,
      guessCount: 0,
      ...params?.session,
    },
    heartsRemaining: 3,
    profile,
    inventory: inventoryFixture(params?.inventory),
  });
  getCurrentViewQuery.mockResolvedValue(puzzle);
  getCompletedOutcomeQuery.mockResolvedValue(null);
  getFailedOutcomeQuery.mockResolvedValue(null);
  leaderboardDailyQuery.mockResolvedValue({ entries: [], userRank: null });
  leaderboardLevelQuery.mockResolvedValue({ entries: [], userRank: null });
  leaderboardAllTimeQuery.mockResolvedValue({ levels: [], userRank: null });
  leaderboardRankSummaryQuery.mockResolvedValue(null);
  storeProductsQuery.mockResolvedValue({
    products: params?.storeProducts ?? [
      {
        sku: 'rookie_stash',
        displayName: 'Rookie Stash',
        description: '500 coins, 1 hammer, 1 shield',
        price: 50,
        isOneTime: true,
        usdApprox: 1,
        perks: {
          coins: 500,
          hearts: 0,
          hammer: 1,
          wand: 0,
          shield: 1,
          rocket: 0,
          infiniteHeartsHours: 0,
        },
      },
    ],
  });
  questsGetStatusQuery.mockResolvedValue({
    dailyDateKey: '2026-02-24',
    progress: {
      dailyPlayCount: 0,
      dailyFastWin: false,
      dailyNoPowerup: false,
      dailyNoMistake: false,
      dailyShareCount: 0,
      socialShareCount: 0,
      lifetimeWordsmith: 0,
      lifetimeLogicalSolved: 0,
      lifetimeFlawless: 0,
      lifetimeCoinsSpent: 0,
      lifetimePurchases: 0,
      lifetimeDailyTopRanks: 0,
      lifetimeEndlessClears: 0,
    },
    claimedQuestIds: [],
  });
  questsClaimMutation.mockResolvedValue({
    success: true,
    reason: null,
    rewardCoins: 0,
    rewardInventory: inventoryFixture(),
    profile,
    inventory: inventoryFixture(params?.inventory),
  });
  profileJoinCommunityMutation.mockResolvedValue({
    success: true,
    reason: null,
    joined: true,
    rewardCoins: 100,
    profile: {
      ...profileFixture(params?.coins ?? 500),
      coins: (params?.coins ?? 500) + 100,
      communityJoinRewardClaimed: true,
    },
  });
  profileSetAudioEnabledMutation.mockResolvedValue({
    success: true,
    reason: null,
    profile: profileFixture(params?.coins ?? 500),
  });
};

const renderGame = async (rootMarkup = '<div id="root"></div>'): Promise<void> => {
  document.body.innerHTML = rootMarkup;
  const gameModule = await import('./game');
  mountedGameModule = gameModule;
  gameModule.mountGame();
};

const waitForChallengeScreen = async (): Promise<void> => {
  await waitFor(() => Boolean(document.querySelector('[data-testid="puzzle-token-wrap"]')));
  await waitFor(() => (document.body.textContent ?? '').includes('Mistakes'));
};

const openChallengeFromHome = async (): Promise<void> => {
  await waitFor(
    () =>
      Boolean(document.querySelector('[data-testid="puzzle-token-wrap"]')) ||
      Boolean(document.querySelector('[data-testid="home-screen"]'))
  );
  if (document.querySelector('[data-testid="puzzle-token-wrap"]')) {
    await waitForChallengeScreen();
    return;
  }
  document
    .querySelector('[data-testid="home-play-button"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await waitForChallengeScreen();
};

const typeLetterWithProxy = (letter: string): boolean => {
  const input = document.querySelector('[data-testid="inline-input-proxy"]') as
    | HTMLInputElement
    | null;
  if (!input) {
    return false;
  }
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  input.focus();
  if (!valueSetter) {
    return false;
  }
  valueSetter.call(input, letter);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

const deferredPromise = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mountedGameModule?.unmountGame();
  mountedGameModule = null;
  vi.restoreAllMocks();
  bootstrapQuery.mockReset();
  loadLevelQuery.mockReset();
  startSessionMutation.mockReset();
  continueLevelMutation.mockReset();
  heartbeatMutation.mockReset();
  heartbeatMutation.mockResolvedValue({ ok: true });
  getCurrentViewQuery.mockReset();
  getCompletedOutcomeQuery.mockReset();
  getFailedOutcomeQuery.mockReset();
  submitGuessMutation.mockReset();
  submitGuessesMutation.mockReset();
  completeSessionMutation.mockReset();
  powerupPurchaseMutation.mockReset();
  powerupUseMutation.mockReset();
  leaderboardDailyQuery.mockReset();
  leaderboardLevelQuery.mockReset();
  leaderboardAllTimeQuery.mockReset();
  leaderboardRankSummaryQuery.mockReset();
  storeProductsQuery.mockReset();
  questsGetStatusQuery.mockReset();
  questsClaimMutation.mockReset();
  profileJoinCommunityMutation.mockReset();
  profileSetAudioEnabledMutation.mockReset();
  purchaseMock.mockReset();
  navigateToMock.mockReset();
  showToastMock.mockReset();
  requestExpandedModeMock.mockReset();
  getWebViewModeMock.mockReset();
  getWebViewModeMock.mockReturnValue('inline');
  addWebViewModeListenerMock.mockReset();
  removeWebViewModeListenerMock.mockReset();
  confettiBurstMock.mockClear();
  confettiCreateMock.mockClear();
  setViewportWidth(1024);
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('Game', { timeout: 15000 }, () => {
  it('renders the branded loading screen while bootstrap is pending', async () => {
    primeBaseMocks({ mode: 'inline' });
    const bootstrap = deferredPromise<{
      userId: string;
      username: string;
      subredditName: string;
      postId: string;
      currentDailyLevelId: string;
      todayDateKey: string;
      profile: ReturnType<typeof profileFixture>;
      inventory: ReturnType<typeof inventoryFixture>;
      endlessCatalog: {
        available: boolean;
        activeCatalogVersion: string | null;
        runtimeCatalogVersion: string | null;
        publishedLevelCount: number;
        bundledVersions: string[];
      };
    }>();
    bootstrapQuery.mockImplementation(() => bootstrap.promise);

    await renderGame();
    await waitFor(() => Boolean(document.querySelector('[data-testid="loading-screen"]')));

    const loadingGlass = document.querySelector(
      '[data-testid="loading-glass"]'
    ) as HTMLImageElement | null;
    expect(document.body.textContent?.trim()).toBe('');
    expect(loadingGlass?.getAttribute('src')).toBe('/loading_glass.png');

    bootstrap.resolve({
      userId: 't2_test',
      username: 'tester',
      subredditName: 'decrypttest_dev',
      postId: 't3_test',
      currentDailyLevelId: 'lvl_0001',
      todayDateKey: '2026-02-24',
      profile: profileFixture(),
      inventory: inventoryFixture(),
      endlessCatalog: {
        available: false,
        activeCatalogVersion: null,
        runtimeCatalogVersion: null,
        publishedLevelCount: 0,
        bundledVersions: [],
      },
    });

    await waitForChallengeScreen();
  });

  it('renders compact inline layout with hidden native input proxy', async () => {
    setViewportWidth(375);
    primeBaseMocks({ mode: 'inline' });
    await renderGame();
    await waitForChallengeScreen();
    await waitFor(() => Boolean(document.querySelector('[data-testid="inline-bundle-card"]')));

    const frame = document.querySelector('[data-testid="game-frame"]');
    const inlineLayout = document.querySelector('[data-testid="layout-inline"]');
    const utilityRow = document.querySelector('[data-testid="utility-row"]');
    const tokenWrap = document.querySelector('[data-testid="puzzle-token-wrap"]');
    const firstPuzzleTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    const inlineInputProxy = document.querySelector('[data-testid="inline-input-proxy"]');
    const keyboardSection = document.querySelector('[data-testid="keyboard-section"]');
    const hammerBuyButton = document.querySelector('[data-testid="powerup-buy-hammer"]');
	    const promoCluster = document.querySelector('[data-testid="inline-promo-cluster"]');
	    const snooPresenter = document.querySelector('[data-testid="snoo-presenter"]');
	    const bundleCard = document.querySelector('[data-testid="inline-bundle-card"]');
    const bundleBadge = document.querySelector('[data-testid="bundle-badge"]');
    const inlinePowerupGrid = document.querySelector('[data-testid="inline-powerup-grid"]');
    const hammerSprite = document.querySelector(
      '[data-testid="powerup-icon-hammer"]'
    ) as HTMLImageElement | null;
	    const settingsButton = document.querySelector('[data-testid="settings-button"]');
	    const infoButton = document.querySelector('[data-testid="info-button"]');
	    const expandedUtilityPanel = document.querySelector('[data-testid="expanded-utility-panel"]');

    expect(frame?.getAttribute('data-webview-mode')).toBe('inline');
    expect(frame?.className).toContain('max-w-full');
    expect(document.body.textContent ?? '').toContain('Plays: 42');
    expect(document.body.textContent ?? '').toContain('Win: 50%');
    expect(inlineLayout).toBeTruthy();
    expect(utilityRow?.className).toContain('bg-transparent');
    expect(utilityRow?.className.includes('overflow-x-auto')).toBe(false);
    expect(utilityRow?.textContent?.includes('Type')).toBe(false);
    expect(utilityRow).toBeTruthy();
    expect(tokenWrap?.className).toContain('items-center');
    expect(firstPuzzleTile?.getAttribute('data-tile-state')).toBe('default');
    expect(firstPuzzleTile?.className).toContain('py-[1px]');
    expect(inlineInputProxy).toBeTruthy();
    expect(keyboardSection).toBeFalsy();
    expect(hammerBuyButton?.className).toContain('btn-primary');
	    expect(promoCluster).toBeTruthy();
	    expect(snooPresenter).toBeTruthy();
	    expect(bundleCard).toBeTruthy();
	    expect(bundleBadge).toBeTruthy();
	    expect(inlinePowerupGrid).toBeTruthy();
    expect(hammerSprite?.getAttribute('src')).toBe('/powerup_hammer.png');
    expect(settingsButton).toBeTruthy();
    expect(infoButton).toBeTruthy();
    expect(document.querySelector('[data-testid="home-button"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="shop-button"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="stats-button"]')).toBeFalsy();
    const headerButtons = infoButton?.parentElement?.querySelectorAll('button');
    expect(headerButtons?.length).toBe(2);
    expect(headerButtons?.item(0)).toBe(settingsButton);
    expect(headerButtons?.item(1)).toBe(infoButton);
    expect(expandedUtilityPanel).toBeFalsy();
  });

  it('keeps the bonus timer off the challenge surface inside the bonus window', async () => {
    setViewportWidth(375);
    primeBaseMocks({
      mode: 'inline',
      puzzle: puzzleFixture('_', 30),
      startTimestamp: Date.now() - 1000,
      session: { guessCount: 1 },
    });

    await renderGame();
    await waitForChallengeScreen();

    expect(document.querySelector('[data-testid="bonus-timer"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="bonus-timer-countdown"]')).toBeFalsy();
    expect(document.body.textContent ?? '').not.toContain('Bonus Timer');
    expect(document.body.textContent ?? '').not.toContain('Fast solve');
  });

  it('does not start the bonus timer for a fresh untouched session', async () => {
    setViewportWidth(375);
    primeBaseMocks({
      mode: 'inline',
      puzzle: puzzleFixture('_', 30),
      startTimestamp: Date.now() - 1000,
    });

    await renderGame();
    await waitForChallengeScreen();

    expect(document.querySelector('[data-testid="bonus-timer"]')).toBeFalsy();
    expect(document.body.textContent ?? '').not.toContain('Bonus Timer');
  });

  it('keeps the bonus timer hidden when the player makes the first guess', async () => {
    setViewportWidth(375);
    primeBaseMocks({
      mode: 'inline',
      puzzle: puzzleFixture('_', 30),
    });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      sessionStartTimestamp: Date.now() - 1000,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      heartsRemaining: 2,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await waitForChallengeScreen();
    expect(document.querySelector('[data-testid="bonus-timer"]')).toBeFalsy();

    document
      .querySelector('[data-testid="puzzle-token-wrap"] button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(typeLetterWithProxy('Q')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    expect(document.querySelector('[data-testid="bonus-timer"]')).toBeFalsy();
    expect(document.body.textContent ?? '').not.toContain('Bonus Timer');
  });

  it('allows guesses in an active session after continue consumed the last profile life', async () => {
    setViewportWidth(375);
    primeBaseMocks({
      mode: 'inline',
      hearts: 0,
      puzzle: puzzleFixture('_', 30),
    });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      sessionStartTimestamp: Date.now() - 1000,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      heartsRemaining: 2,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await waitForChallengeScreen();
    document
      .querySelector('[data-testid="puzzle-token-wrap"] button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });

    expect(typeLetterWithProxy('Q')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    expect(showToastMock).not.toHaveBeenCalledWith('No lives left. Wait for refill.');
  });

  it('keeps the bonus timer hidden when the server session is already outside the bonus window', async () => {
    setViewportWidth(375);
    primeBaseMocks({
      mode: 'inline',
      puzzle: puzzleFixture('_', 30),
    });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      sessionStartTimestamp: Date.now() - 45_000,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      heartsRemaining: 2,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await waitForChallengeScreen();
    expect(document.querySelector('[data-testid="bonus-timer"]')).toBeFalsy();

    document
      .querySelector('[data-testid="puzzle-token-wrap"] button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(typeLetterWithProxy('Q')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    expect(document.querySelector('[data-testid="bonus-timer"]')).toBeFalsy();
    expect(document.body.textContent ?? '').not.toContain('Bonus Timer');
  });

  it('hides the bonus timer after the bonus window expires', async () => {
    setViewportWidth(375);
    primeBaseMocks({
      mode: 'inline',
      puzzle: puzzleFixture('_', 1),
      startTimestamp: Date.now() - 3000,
      session: { guessCount: 1 },
    });

    await renderGame();
    await waitForChallengeScreen();

    expect(document.querySelector('[data-testid="bonus-timer"]')).toBeFalsy();
    expect(document.body.textContent ?? '').not.toContain('Fast solve');
  });

  it('opens settings popup and toggles audio from the header', async () => {
    setViewportWidth(375);
    primeBaseMocks({ mode: 'inline' });
    await renderGame();
    await waitForChallengeScreen();

    const settingsButton = document.querySelector('[data-testid="settings-button"]');
    expect(settingsButton).toBeTruthy();

    settingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="settings-card"]')));
    expect(document.querySelector('[data-testid="settings-overlay"]')).toBeTruthy();
    expect(document.body.textContent ?? '').toContain('Settings');
    expect(document.body.textContent ?? '').toContain('Audio');

    const toggle = document.querySelector('[data-testid="audio-toggle"]');
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
    profileSetAudioEnabledMutation.mockResolvedValueOnce({
      success: true,
      reason: null,
      profile: {
        ...profileFixture(),
        audioEnabled: false,
      },
    });
    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => toggle?.getAttribute('aria-pressed') === 'false');

    settingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => !document.querySelector('[data-testid="settings-card"]'));
  });

  it('toggles help popup and closes via close button and outside tap', async () => {
    setViewportWidth(375);
    primeBaseMocks({ mode: 'inline' });
    await renderGame();
    await waitForChallengeScreen();

    const infoButton = document.querySelector('[data-testid="info-button"]');
    expect(infoButton).toBeTruthy();

    infoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="help-card"]')));
    expect(document.querySelector('[data-testid="help-overlay"]')).toBeTruthy();
    expect(document.body.textContent ?? '').toContain('Interactive Guide');
    expect(document.body.textContent ?? '').toContain('Pick a tile and type');
    expect(document.body.textContent ?? '').toContain('Tap tile');
    expect(document.body.textContent ?? '').toContain('Type A');

    const nextButton = document.querySelector('[data-testid="help-next"]');
    nextButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => (document.body.textContent ?? '').includes('Match repeated numbers'));
    expect(document.body.textContent ?? '').toContain('Repeated numbers always reuse the same letter');

    nextButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => (document.body.textContent ?? '').includes('Protect your mistakes'));
    const surviveSprites = Array.from(
      document.querySelectorAll('[data-testid="help-slide-survive"] img')
    ) as HTMLImageElement[];
    expect(surviveSprites.map((image) => image.getAttribute('src'))).toEqual([
      '/powerup_hammer.png',
      '/powerup_wand.png',
      '/powerup_shield.png',
      '/powerup_rocket.png',
    ]);

    infoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => !document.querySelector('[data-testid="help-card"]'));

    infoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="help-card"]')));
    const closeButton = document.querySelector('[data-testid="help-close"]');
    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => !document.querySelector('[data-testid="help-card"]'));

    infoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="help-card"]')));
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await waitFor(() => !document.querySelector('[data-testid="help-card"]'));
  });

  it('does not render top-row home/shop/stats actions', async () => {
    setViewportWidth(1024);
    primeBaseMocks({ mode: 'expanded' });
    await renderGame();
    await waitForChallengeScreen();

    expect(document.querySelector('[data-testid="home-button"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="shop-button"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="stats-button"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="info-button"]')).toBeTruthy();
  });

  it('uses wider inline frame on tablet widths', async () => {
    setViewportWidth(768);
    primeBaseMocks({ mode: 'inline' });
    await renderGame();
    await waitForChallengeScreen();

    const frame = document.querySelector('[data-testid="game-frame"]');
    expect(frame?.className).toContain('max-w-full');
  });

  it('uses wider inline frame on desktop widths', async () => {
    setViewportWidth(1280);
    primeBaseMocks({ mode: 'inline' });
    await renderGame();
    await waitForChallengeScreen();

    const frame = document.querySelector('[data-testid="game-frame"]');
    expect(frame?.className).toContain('max-w-full');
  });

  it('focuses hidden input proxy when a letter tile is tapped inline', async () => {
    setViewportWidth(375);
    primeBaseMocks({ mode: 'inline' });
    await renderGame();
    await waitForChallengeScreen();

    const inlineInputProxy = document.querySelector(
      '[data-testid="inline-input-proxy"]'
    ) as HTMLInputElement | null;
    const letterTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    expect(inlineInputProxy).toBeTruthy();
    expect(letterTile).toBeTruthy();

    letterTile?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.activeElement).toBe(inlineInputProxy);
  });

  it('renders expanded challenge layout with utility controls', async () => {
    setViewportWidth(1280);
    primeBaseMocks({ mode: 'expanded' });
    await renderGame();
    await openChallengeFromHome();
    await waitFor(() => Boolean(document.querySelector('[data-testid="offer-card"]')));

    const stackedLayout = document.querySelector('[data-testid="layout-expanded-stacked"]');
    const utilityRow = document.querySelector('[data-testid="utility-row"]');
    const offerCard = document.querySelector('[data-testid="offer-card"]');
    const powerupGrid = document.querySelector('[data-testid="inline-powerup-grid"]');
    const inputProxy = document.querySelector('[data-testid="inline-input-proxy"]');

    expect(stackedLayout).toBeTruthy();
    expect(utilityRow).toBeTruthy();
    expect(offerCard).toBeTruthy();
    expect(document.body.textContent ?? '').toContain('x500');
    expect(document.body.textContent ?? '').toContain('x1');
    expect(document.body.textContent ?? '').toContain('50');
    expect(powerupGrid).toBeTruthy();
    expect(inputProxy).toBeTruthy();
    expect(document.querySelector('[data-testid="virtual-keyboard-panel"]')).toBeFalsy();
  });

  it('places the virtual keyboard below the utility row for mobile expanded play', async () => {
    setViewportWidth(390);
    primeBaseMocks({
      mode: 'expanded',
      puzzle: {
        ...puzzleFixture('_'),
        words: ['HI'],
        tiles: [
          {
            index: 0,
            isLetter: true,
            displayChar: '_',
            cipherNumber: 1,
            isBlind: false,
            isGold: false,
            isLocked: false,
          },
          {
            index: 1,
            isLetter: true,
            displayChar: '_',
            cipherNumber: 2,
            isBlind: false,
            isGold: false,
            isLocked: false,
          },
        ],
      },
    });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();

    const inputProxy = document.querySelector<HTMLInputElement>(
      '[data-testid="inline-input-proxy"]'
    );
    const firstTile = document.querySelector<HTMLButtonElement>(
      '[data-testid="puzzle-token-wrap"] button'
    );
    const secondTile = document.querySelectorAll<HTMLButtonElement>(
      '[data-testid="puzzle-token-wrap"] button'
    )[1];
    const keyboardPanel = document.querySelector('[data-testid="virtual-keyboard-panel"]');
    const lastKeyboardRow = document.querySelector('[data-testid="virtual-key-row-2"]');
    const powerupGrid = document.querySelector('[data-testid="inline-powerup-grid"]');
    const utilityRow = document.querySelector('[data-testid="utility-row"]');

    expect(inputProxy?.inputMode).toBe('none');
    expect(keyboardPanel).toBeTruthy();
    expect(powerupGrid).toBeTruthy();
    expect(utilityRow).toBeTruthy();
    expect(document.querySelector('[data-testid="virtual-keyboard-collapse"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="virtual-keyboard-toggle"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="virtual-key-ArrowUp"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="virtual-key-ArrowDown"]')).toBeFalsy();
    expect(lastKeyboardRow?.firstElementChild?.getAttribute('data-testid')).toBe(
      'virtual-key-ArrowLeft'
    );
    expect(lastKeyboardRow?.lastElementChild?.getAttribute('data-testid')).toBe(
      'virtual-key-ArrowRight'
    );
    expect(
      utilityRow && keyboardPanel
        ? Boolean(
            utilityRow.compareDocumentPosition(keyboardPanel) &
              Node.DOCUMENT_POSITION_FOLLOWING
          )
        : false
    ).toBe(true);

    firstTile?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => firstTile?.getAttribute('data-tile-state') === 'selected');

    document
      .querySelector('[data-testid="virtual-key-ArrowRight"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => secondTile?.getAttribute('data-tile-state') === 'selected');

    document
      .querySelector('[data-testid="virtual-key-B"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    expect(submitGuessMutation).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      tileIndex: 1,
      guessedLetter: 'B',
    });
  });

  it('keeps the virtual keyboard permanent on mobile expanded play', async () => {
    setViewportWidth(390);
    primeBaseMocks({ mode: 'expanded' });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();
    await waitFor(() => Boolean(document.querySelector('[data-testid="virtual-keyboard-panel"]')));

    expect(document.querySelector('[data-testid="virtual-keyboard-collapse"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="virtual-keyboard-toggle"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="virtual-keyboard-panel"]')).toBeTruthy();
  });

  it('hides the virtual keyboard in desktop simulator sized expanded play', async () => {
    setViewportWidth(800);
    primeBaseMocks({ mode: 'expanded' });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();

    expect(document.querySelector('[data-testid="virtual-keyboard-panel"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="inline-input-proxy"]')).toBeTruthy();
  });

  it('centers blind marker icons in the cipher row', async () => {
    primeBaseMocks({
      mode: 'expanded',
      puzzle: {
        ...puzzleFixture('_'),
        tiles: [
          {
            index: 0,
            isLetter: true,
            displayChar: '_',
            cipherNumber: 1,
            isBlind: true,
            isGold: false,
            isLocked: false,
          },
        ],
      },
    });
    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();

    const blindMark = document.querySelector('.cipher-blind-mark');
    expect(blindMark).toBeTruthy();
    expect(blindMark?.parentElement?.className).toContain('flex');
    expect(blindMark?.parentElement?.className).toContain('items-center');
    expect(blindMark?.parentElement?.className).toContain('justify-center');
  });

  it('navigates puzzle tiles with arrow keys and skips locked or filled tiles', async () => {
    primeBaseMocks({
      mode: 'expanded',
      puzzle: {
        ...puzzleFixture('_'),
        words: ['ABCD'],
        tiles: [
          {
            index: 0,
            isLetter: true,
            displayChar: '_',
            cipherNumber: 1,
            isBlind: false,
            isGold: false,
            isLocked: false,
          },
          {
            index: 1,
            isLetter: true,
            displayChar: '_',
            cipherNumber: 2,
            isBlind: false,
            isGold: false,
            isLocked: true,
          },
          {
            index: 2,
            isLetter: true,
            displayChar: 'C',
            cipherNumber: 3,
            isBlind: false,
            isGold: false,
            isLocked: false,
          },
          {
            index: 3,
            isLetter: true,
            displayChar: '_',
            cipherNumber: 4,
            isBlind: false,
            isGold: false,
            isLocked: false,
          },
        ],
      },
    });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();

    const buttons = Array.from(
      document.querySelectorAll('[data-testid="puzzle-token-wrap"] button')
    );
    const firstTile = buttons[0];
    const lockedTile = buttons[1];
    const filledTile = buttons[2];
    const fourthTile = buttons[3];
    expect(firstTile).toBeTruthy();
    expect(lockedTile?.hasAttribute('disabled')).toBe(true);
    expect(filledTile?.textContent).toContain('C');
    expect(fourthTile).toBeTruthy();

    filledTile?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => fourthTile?.getAttribute('data-tile-state') === 'selected');

    firstTile?.focus();
    firstTile?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowRight',
      })
    );

    await waitFor(() => document.activeElement === fourthTile);
    expect(fourthTile?.getAttribute('data-tile-state')).toBe('selected');

    fourthTile?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowLeft',
      })
    );

    await waitFor(() => document.activeElement === firstTile);
    expect(firstTile?.getAttribute('data-tile-state')).toBe('selected');

    firstTile?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => document.activeElement?.getAttribute('data-testid') === 'inline-input-proxy');
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowRight',
      })
    );

    await waitFor(() => fourthTile?.getAttribute('data-tile-state') === 'selected');
  });

  it('navigates wrapped puzzle rows with up and down arrows', async () => {
    primeBaseMocks({
      mode: 'expanded',
      puzzle: {
        ...puzzleFixture('_'),
        words: ['ABCDEFGHIJKLM'],
        tiles: Array.from({ length: 13 }, (_value, index) => ({
          index,
          isLetter: true,
          displayChar: '_',
          cipherNumber: index + 1,
          isBlind: false,
          isGold: false,
          isLocked: false,
        })),
      },
    });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();

    const buttons = Array.from(
      document.querySelectorAll('[data-testid="puzzle-token-wrap"] button')
    );
    const firstTile = buttons[0];
    const wrappedTile = buttons[12];
    expect(firstTile).toBeTruthy();
    expect(wrappedTile).toBeTruthy();

    firstTile?.focus();
    firstTile?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowDown',
      })
    );

    await waitFor(() => document.activeElement === wrappedTile);
    expect(wrappedTile?.getAttribute('data-tile-state')).toBe('selected');

    wrappedTile?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'ArrowUp',
      })
    );

    await waitFor(() => document.activeElement === firstTile);
    expect(firstTile?.getAttribute('data-tile-state')).toBe('selected');
  });

  it('opens published game entry directly on the challenge screen', async () => {
    setViewportWidth(1280);
    primeBaseMocks({ mode: 'expanded' });
    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();

    expect(document.querySelector('[data-testid="home-screen"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="utility-row"]')).toBeTruthy();
  });

  it('renders stacked expanded layout for tablet/mobile widths', async () => {
    setViewportWidth(768);
    primeBaseMocks({ mode: 'expanded' });
    await renderGame();
    await openChallengeFromHome();
    await waitFor(() => Boolean(document.querySelector('[data-testid="offer-card"]')));

    const stackedLayout = document.querySelector('[data-testid="layout-expanded-stacked"]');
    const utilityRow = document.querySelector('[data-testid="utility-row"]');
    const inputProxy = document.querySelector('[data-testid="inline-input-proxy"]');

    expect(stackedLayout).toBeTruthy();
    expect(utilityRow).toBeTruthy();
    expect(inputProxy).toBeTruthy();
  });

  it('returns to the same challenge after shopping for hearts from a no-life start', async () => {
    primeBaseMocks({ mode: 'expanded', hearts: 0 });
    startSessionMutation.mockRejectedValueOnce(
      new Error('No lives left. Wait for refill.')
    );
    purchaseMock.mockResolvedValue({
      status: 'STATUS_SUCCESS',
      errorMessage: null,
    });

    await renderGame();

    await waitFor(() => Boolean(document.querySelector('[data-testid="heart-purchase-dialog"]')));
    expect(document.body.textContent ?? '').toContain('Restore Hearts');
    expect(document.querySelector('[data-testid="heart-purchase-shop-packages"]')).toBeTruthy();

    document
      .querySelector('[data-testid="heart-purchase-shop-packages"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => Boolean(document.querySelector('[data-testid="shop-screen"]')));
    await waitFor(() => Boolean(document.querySelector('[data-testid="shop-buy-rookie_stash"]')));
    expect(document.querySelector('[data-testid="heart-purchase-dialog"]')).toBeFalsy();

    document
      .querySelector('[data-testid="shop-buy-rookie_stash"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => purchaseMock.mock.calls.length > 0);
    await waitFor(() => startSessionMutation.mock.calls.length >= 2);
    await waitForChallengeScreen();
    expect(document.querySelector('[data-testid="shop-screen"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="result-screen"]')).toBeFalsy();
  });

  it('uses decoder pack as Popular replacement when one-time offer is absent', async () => {
    primeBaseMocks({
      mode: 'expanded',
      storeProducts: [
        {
          sku: 'decoder_pack',
          displayName: 'Decoder Pack',
          description: '3000 coins, 3 hammer, 2 wand, 2 shield, 1 rocket',
          price: 250,
          isOneTime: false,
          usdApprox: 5,
          perks: {
            coins: 3000,
            hearts: 0,
            hammer: 3,
            wand: 2,
            shield: 2,
            rocket: 1,
            infiniteHeartsHours: 2,
          },
        },
      ],
    });

    await renderGame();
    await openChallengeFromHome();
    await waitFor(() => Boolean(document.querySelector('[data-testid="offer-card"]')));

    const offerCard = document.querySelector('[data-testid="offer-card"]');
    const bundleBadge = document.querySelector('[data-testid="bundle-badge"]');
    expect(offerCard).toBeTruthy();
    expect(bundleBadge?.textContent ?? '').toContain('Popular');
    expect((document.body.textContent ?? '').includes('One-Time Offer')).toBe(false);
  });

  it('does not render one-time offer card when store does not return it', async () => {
    primeBaseMocks({ mode: 'expanded' });
    storeProductsQuery.mockResolvedValue({ products: [] });

    await renderGame();
    await openChallengeFromHome();
    await waitFor(() => !document.querySelector('[data-testid="offer-card"]'));
    expect(document.querySelector('[data-testid="inline-powerup-grid"]')).toBeTruthy();
  });

  it('passes a single SKU string to the Devvit purchase API', async () => {
    primeBaseMocks({ mode: 'expanded' });
    purchaseMock.mockResolvedValue({
      status: 'STATUS_SUCCESS',
      errorMessage: null,
    });

    await renderGame();
    await openChallengeFromHome();
    await waitFor(() => Boolean(document.querySelector('[data-testid="offer-card"]')));

    document
      .querySelector('[data-testid="offer-card"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => purchaseMock.mock.calls.length > 0);
    expect(purchaseMock).toHaveBeenCalledWith('rookie_stash');
  });

  it('shows a passive shop error instead of a startup toast when store loading fails', async () => {
    primeBaseMocks({ mode: 'expanded' });
    storeProductsQuery.mockRejectedValue(new Error('Store offline'));

    await renderGame('<div id="root" data-initial-screen="shop"></div>');
    await waitFor(() => Boolean(document.querySelector('[data-testid="shop-screen"]')));
    await waitFor(() => (document.body.textContent ?? '').includes('Unable to load store: Store offline'));

    expect(showToastMock).not.toHaveBeenCalledWith('Unable to load store: Store offline');
  });

  it('renders a retry state when bootstrap fails and recovers on retry', async () => {
    primeBaseMocks({ mode: 'expanded' });
    loadLevelQuery
      .mockRejectedValueOnce(new Error('Daily service unavailable'))
      .mockRejectedValueOnce(new Error('Daily service unavailable'))
      .mockResolvedValue({
        mode: 'daily',
        levelId: 'lvl_0001',
        puzzle: puzzleFixture('_'),
        alreadyCompleted: false,
        retryCount: 0,
        nextRetryCost: 35,
        retryScoreFactor: 1,
        nextRetryScoreFactor: 1,
        requiresPaidRetry: false,
        challengeMetrics: {
          plays: 42,
          wins: 21,
          winRatePct: 50,
        },
      });

    await renderGame();
    await waitFor(() => (document.body.textContent ?? '').includes('Decrypt unavailable'));

    expect(document.body.textContent ?? '').toContain(
      'Unable to start Decrypt: Daily service unavailable'
    );
    expect(showToastMock).not.toHaveBeenCalledWith('Failed to initialize Decrypt.');

    document
      .querySelector('[data-testid="bootstrap-retry"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitForChallengeScreen();
  });

  it('buys powerups with quantity dialog without auto-using', async () => {
    primeBaseMocks({ mode: 'expanded', coins: 700 });
    powerupPurchaseMutation.mockResolvedValue({
      success: true,
      reason: null,
      profile: profileFixture(90),
      inventory: inventoryFixture({ wand: 3 }),
    });

    await renderGame();
    await openChallengeFromHome();

    const buyWand = document.querySelector('[data-testid="powerup-buy-wand"]');
    expect(buyWand).toBeTruthy();
    buyWand?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="powerup-buy-dialog"]')));

    const qty3 = document.querySelector('[data-testid="buy-quantity-3"]');
    const confirm = document.querySelector('[data-testid="buy-confirm"]');
    qty3?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => (document.body.textContent ?? '').includes('Total: 600'));
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => powerupPurchaseMutation.mock.calls.length > 0);
    expect(powerupPurchaseMutation).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      itemType: 'wand',
      quantity: 3,
    });
    expect(powerupUseMutation).not.toHaveBeenCalled();

    const wandCount = document.querySelector('[data-testid="powerup-count-wand"]');
    await waitFor(() => (wandCount?.textContent ?? '').trim() === '3');
  });

  it('shows hammer selection toast when no valid tile is selected', async () => {
    primeBaseMocks({
      mode: 'expanded',
      inventory: { hammer: 1 },
      puzzle: puzzleFixture('A'),
    });
    await renderGame();
    await openChallengeFromHome();

    const useHammer = document.querySelector('[data-testid="powerup-use-hammer"]');
    expect(useHammer).toBeTruthy();
    useHammer?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => showToastMock.mock.calls.length > 0);
    expect(showToastMock).toHaveBeenCalledWith('Select a tile first.');
    expect(powerupUseMutation).not.toHaveBeenCalled();
  });

  it('uses quick powerup when count > 0 and opens buy dialog when count is 0', async () => {
    primeBaseMocks({
      mode: 'inline',
      inventory: { wand: 1, rocket: 0 },
    });
    powerupUseMutation.mockResolvedValue({
      success: true,
      reason: null,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      profile: profileFixture(500),
      inventory: inventoryFixture({ wand: 0 }),
      session: {
        activeLevelId: 'lvl_0001',
        mode: 'daily',
        startTimestamp: 0,
        activeMs: 0,
        lastSeenAt: 0,
        mistakesMade: 0,
        shieldIsActive: false,
        revealedIndices: [],
        usedPowerups: 1,
        wrongGuesses: 0,
        guessCount: 0,
      },
    });

    await renderGame();
    await waitForChallengeScreen();

    const quickWand = document.querySelector('[data-testid="powerup-use-wand"]');
    const tileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    tileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(quickWand).toBeTruthy();
    quickWand?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => powerupUseMutation.mock.calls.length > 0);
    expect(powerupUseMutation).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      itemType: 'wand',
      targetIndex: 0,
    });

    await waitFor(
      () =>
        !(
          document.querySelector('[data-testid="powerup-use-rocket"]') as HTMLButtonElement | null
        )?.disabled
    );
    const quickRocket = document.querySelector('[data-testid="powerup-use-rocket"]');
    quickRocket?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="powerup-buy-dialog"]')));
  });

  it('moves selection to the next blank tile after a powerup fills the selected tile', async () => {
    primeBaseMocks({
      mode: 'expanded',
      inventory: { hammer: 1 },
      puzzle: {
        ...puzzleFixture('_'),
        words: ['ABC'],
        tiles: [0, 1, 2].map((index) => ({
          index,
          isLetter: true,
          displayChar: '_',
          cipherNumber: index + 1,
          isBlind: false,
          isGold: false,
          isLocked: false,
        })),
      },
    });
    powerupUseMutation.mockResolvedValue({
      success: true,
      reason: null,
      errorCode: null,
      revealedTiles: [{ index: 0, letter: 'A' }],
      revealedIndices: [0],
      revealedLetter: 'A',
      newlyUnlockedChainIds: [],
      lockProgressChanged: false,
      profile: profileFixture(500),
      inventory: inventoryFixture({ hammer: 0 }),
      session: {
        activeLevelId: 'lvl_0001',
        mode: 'daily',
        startTimestamp: 0,
        activeMs: 0,
        lastSeenAt: 0,
        mistakesMade: 0,
        shieldIsActive: false,
        revealedIndices: [0],
        usedPowerups: 1,
        wrongGuesses: 0,
        guessCount: 0,
      },
    });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();

    const buttons = () =>
      Array.from(document.querySelectorAll('[data-testid="puzzle-token-wrap"] button'));
    buttons()[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => buttons()[0]?.getAttribute('data-tile-state') === 'selected');

    document
      .querySelector('[data-testid="powerup-use-hammer"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => powerupUseMutation.mock.calls.length > 0);
    await waitFor(() => buttons()[1]?.getAttribute('data-tile-state') === 'selected');
    expect(buttons()[0]?.textContent).toContain('A');

    buttons()[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => buttons()[1]?.getAttribute('data-tile-state') === 'selected');
  });

  it('shows missing powerup on the main button and not enough coins on the add button', async () => {
    primeBaseMocks({
      mode: 'inline',
      coins: 0,
      inventory: { rocket: 0 },
    });

    await renderGame();
    await waitForChallengeScreen();

    const quickRocket = document.querySelector(
      '[data-testid="powerup-use-rocket"]'
    );
    const buyRocket = document.querySelector(
      '[data-testid="powerup-buy-rocket"]'
    ) as HTMLButtonElement | null;

    expect(quickRocket).toBeTruthy();
    expect(buyRocket).toBeTruthy();
    expect(buyRocket?.disabled).toBe(false);

    quickRocket?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => showToastMock.mock.calls.length > 0);
    expect(showToastMock).toHaveBeenLastCalledWith('No rocket available.');
    expect(document.querySelector('[data-testid="powerup-buy-dialog"]')).toBeNull();

    showToastMock.mockClear();

    buyRocket?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => showToastMock.mock.calls.length > 0);
    expect(showToastMock).toHaveBeenLastCalledWith('Not enough coins.');
    expect(document.querySelector('[data-testid="powerup-buy-dialog"]')).toBeNull();
  });

  it('shows tile locked toast when backend returns TILE_LOCKED on guess', async () => {
    primeBaseMocks({ mode: 'expanded' });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: 'TILE_LOCKED',
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await openChallengeFromHome();

    const tileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    const inlineInputProxy = document.querySelector(
      '[data-testid="inline-input-proxy"]'
    ) as HTMLInputElement | null;
    tileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(inlineInputProxy).toBeTruthy();
    expect(typeLetterWithProxy('Q')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    await waitFor(() => showToastMock.mock.calls.length > 0);
    expect(showToastMock).toHaveBeenCalledWith('This tile is still locked.');
  });

  it('shows green highlight for correct guess reveals', async () => {
    primeBaseMocks({ mode: 'expanded' });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [{ index: 0, letter: 'Q' }],
      revealedIndices: [0],
      revealedLetter: 'Q',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await openChallengeFromHome();

    getCurrentViewQuery.mockResolvedValue(puzzleFixture('A'));
    const tileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    const inlineInputProxy = document.querySelector(
      '[data-testid="inline-input-proxy"]'
    ) as HTMLInputElement | null;
    tileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(inlineInputProxy).toBeTruthy();
    expect(typeLetterWithProxy('Q')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    await waitFor(() => {
      const updatedTileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return updatedTileButton?.getAttribute('data-tile-state') === 'correct';
    });
  });

  it('shows the result screen after completing a challenge', async () => {
    primeBaseMocks({ mode: 'expanded' });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [{ index: 0, letter: 'H' }],
      revealedIndices: [0],
      revealedLetter: 'H',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: true,
      isGameOver: false,
    });
    completeSessionMutation.mockResolvedValue({
      ok: true,
      accepted: true,
      solveSeconds: 84,
      score: 120,
      rewardCoins: 150,
      mistakes: 0,
      usedPowerups: 0,
      retryCount: 0,
      retryScoreFactor: 1,
	      isRecoveryRun: false,
	      isCurrentDaily: true,
	      rewardNotice: null,
	      ratingDelta: 18,
	      ratingAfter: 518,
	      globalScoreAfter: 120,
	      profile: profileFixture(650),
	      inventory: inventoryFixture(),
	    });

    await renderGame();
    await openChallengeFromHome();

    const tileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    tileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(typeLetterWithProxy('H')).toBe(true);

	    await waitFor(() => Boolean(document.querySelector('[data-testid="success-overlay"]')));
	    expect(document.body.textContent ?? '').not.toContain('Challenge Completed');
	    expect(document.querySelector('[data-testid="outcome-overlay-quote"]')).toBeTruthy();
	    expect(document.querySelector('[data-testid="outcome-time-pill"]')).toBeTruthy();
	    expect(document.querySelector('[data-testid="outcome-rating-pill"]')).toBeTruthy();
	    expect(document.body.textContent ?? '').toContain('+18 ELO');
	    expect(document.body.textContent ?? '').toContain('+120 pts');
	  });

  it('shows the shield on the active mistake slot only until it absorbs a mistake', async () => {
    primeBaseMocks({ mode: 'expanded' });
    startSessionMutation.mockResolvedValue({
      ok: true,
      session: {
        activeLevelId: 'lvl_0001',
        mode: 'daily',
        startTimestamp: 0,
        activeMs: 0,
        lastSeenAt: 0,
        mistakesMade: 0,
        shieldIsActive: true,
        revealedIndices: [],
        usedPowerups: 1,
        wrongGuesses: 0,
        guessCount: 0,
      },
      heartsRemaining: 3,
    });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: true,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();
    expect(document.querySelector('[data-testid="mistake-shield-indicator"]')).toBeTruthy();

    const tileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    tileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(typeLetterWithProxy('Q')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    await waitFor(() => !document.querySelector('[data-testid="mistake-shield-indicator"]'));
  });

  it('does not carry a shield indicator into a different challenge', async () => {
    const firstPuzzle = puzzleFixture('_');
    const secondPuzzle = {
      ...puzzleFixture('_'),
      levelId: 'lvl_9001',
      dateKey: '2026-02-25',
      words: ['WORLD'],
    };

    primeBaseMocks({ mode: 'expanded' });
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: firstPuzzle,
      alreadyCompleted: false,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: {
        plays: 42,
        wins: 21,
        winRatePct: 50,
      },
    });
    startSessionMutation.mockResolvedValue({
      ok: true,
      session: {
        activeLevelId: 'lvl_0001',
        mode: 'daily',
        startTimestamp: 0,
        activeMs: 0,
        lastSeenAt: 0,
        mistakesMade: 0,
        shieldIsActive: true,
        revealedIndices: [],
        usedPowerups: 1,
        wrongGuesses: 0,
        guessCount: 0,
      },
      heartsRemaining: 3,
    });
    getCurrentViewQuery.mockResolvedValue(firstPuzzle);
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [{ index: 0, letter: 'H' }],
      revealedIndices: [0],
      revealedLetter: 'H',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: true,
      isGameOver: false,
    });

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();
    expect(document.querySelector('[data-testid="mistake-shield-indicator"]')).toBeTruthy();

    const gameModule = await import('./game');
    gameModule.unmountGame();

    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_9001',
      puzzle: secondPuzzle,
      alreadyCompleted: false,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: {
        plays: 7,
        wins: 4,
        winRatePct: 57,
      },
    });
    startSessionMutation.mockResolvedValue({
      ok: true,
      session: {
        activeLevelId: 'lvl_9001',
        mode: 'daily',
        startTimestamp: 0,
        activeMs: 0,
        lastSeenAt: 0,
        mistakesMade: 0,
        shieldIsActive: false,
        revealedIndices: [],
        usedPowerups: 0,
        wrongGuesses: 0,
        guessCount: 0,
      },
      heartsRemaining: 3,
    });
    getCurrentViewQuery.mockResolvedValue(secondPuzzle);

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await waitForChallengeScreen();
    expect(document.querySelector('[data-testid="mistake-shield-indicator"]')).toBeFalsy();
  });

  it('shows red highlight on wrong guess and fades out', async () => {
    primeBaseMocks({ mode: 'expanded' });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      heartsRemaining: 2,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await openChallengeFromHome();

    const tileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    const inlineInputProxy = document.querySelector(
      '[data-testid="inline-input-proxy"]'
    ) as HTMLInputElement | null;
    tileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });
    expect(inlineInputProxy).toBeTruthy();
    expect(typeLetterWithProxy('Q')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    await waitFor(() => {
      const updatedTileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return updatedTileButton?.getAttribute('data-tile-state') === 'wrong';
    });

    await new Promise((resolve) => setTimeout(resolve, 1300));
    const fadedTileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    expect(fadedTileButton?.getAttribute('data-tile-state')).not.toBe('wrong');
  });

  it('skips a stale rapid second guess on the same tile after a correct reveal', async () => {
    primeBaseMocks({ mode: 'expanded' });
    const firstGuess = deferredPromise<{
      ok: true;
      isCorrect: true;
      errorCode: null;
      revealedTiles: Array<{ index: number; letter: string }>;
      revealedIndices: number[];
      revealedLetter: string;
      newlyUnlockedChainIds: string[];
      heartsRemaining: number;
      shieldConsumed: boolean;
      isLevelComplete: boolean;
      isGameOver: boolean;
    }>();
    submitGuessMutation.mockImplementationOnce(() => firstGuess.promise);

    await renderGame();
    await openChallengeFromHome();

    const tileButton = document.querySelector('[data-testid="puzzle-token-wrap"] button');
    tileButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const selectedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return selectedTile?.getAttribute('data-tile-state') === 'selected';
    });

    expect(typeLetterWithProxy('S')).toBe(true);
    expect(typeLetterWithProxy('A')).toBe(true);
    await waitFor(() => submitGuessMutation.mock.calls.length === 1);

    firstGuess.resolve({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [{ index: 0, letter: 'S' }],
      revealedIndices: [0],
      revealedLetter: 'S',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await waitFor(() => {
      const solvedTile = document.querySelector('[data-testid="puzzle-token-wrap"] button');
      return solvedTile?.textContent?.includes('S') ?? false;
    });
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(submitGuessMutation).toHaveBeenCalledTimes(1);
  });

  it('skips stale sibling input when the first correct guess auto-fills matching cipher tiles', async () => {
    const siblingPuzzle = {
      levelId: 'lvl_0001',
      dateKey: '2026-02-24',
      author: 'UNKNOWN',
      words: ['SEE'],
      heartsMax: 3,
      tiles: [
        {
          index: 0,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 9,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 1,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 9,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 2,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 3,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
      ],
    };
    primeBaseMocks({ mode: 'expanded', puzzle: siblingPuzzle });
    const firstGuess = deferredPromise<{
      ok: true;
      isCorrect: true;
      errorCode: null;
      revealedTiles: Array<{ index: number; letter: string }>;
      revealedIndices: number[];
      revealedLetter: string;
      newlyUnlockedChainIds: string[];
      heartsRemaining: number;
      shieldConsumed: boolean;
      isLevelComplete: boolean;
      isGameOver: boolean;
    }>();
    submitGuessMutation.mockImplementationOnce(() => firstGuess.promise);

    await renderGame();
    await openChallengeFromHome();

    const puzzleButtons = () =>
      Array.from(document.querySelectorAll('[data-testid="puzzle-token-wrap"] button'));

    puzzleButtons()[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => puzzleButtons()[0]?.getAttribute('data-tile-state') === 'selected');
    expect(typeLetterWithProxy('S')).toBe(true);

    puzzleButtons()[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => puzzleButtons()[1]?.getAttribute('data-tile-state') === 'selected');
    expect(typeLetterWithProxy('A')).toBe(true);
    await waitFor(() => submitGuessMutation.mock.calls.length === 1);

    firstGuess.resolve({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [
        { index: 0, letter: 'S' },
        { index: 1, letter: 'S' },
      ],
      revealedIndices: [0, 1],
      revealedLetter: 'S',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await waitFor(() => {
      const buttons = puzzleButtons();
      return (
        (buttons[0]?.textContent?.includes('S') ?? false) &&
        (buttons[1]?.textContent?.includes('S') ?? false)
      );
    });
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(submitGuessMutation).toHaveBeenCalledTimes(1);
  });

  it('filters stale queued guesses during burst typing while first request is in flight', async () => {
    const burstPuzzle = {
      levelId: 'lvl_0001',
      dateKey: '2026-02-24',
      author: 'UNKNOWN',
      words: ['SAX'],
      heartsMax: 3,
      tiles: [
        {
          index: 0,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 7,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 1,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 7,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 2,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 2,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
      ],
    };

    primeBaseMocks({ mode: 'expanded', puzzle: burstPuzzle });
    const firstGuess = deferredPromise<{
      ok: true;
      isCorrect: true;
      errorCode: null;
      revealedTiles: Array<{ index: number; letter: string }>;
      revealedIndices: number[];
      revealedLetter: string;
      newlyUnlockedChainIds: string[];
      heartsRemaining: number;
      shieldConsumed: boolean;
      isLevelComplete: boolean;
      isGameOver: boolean;
    }>();
    submitGuessMutation.mockImplementationOnce(() => firstGuess.promise);
    submitGuessMutation.mockResolvedValueOnce({
      ok: true,
      isCorrect: false,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      heartsRemaining: 2,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await openChallengeFromHome();

    const puzzleButtons = () =>
      Array.from(document.querySelectorAll('[data-testid="puzzle-token-wrap"] button'));

    puzzleButtons()[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => puzzleButtons()[0]?.getAttribute('data-tile-state') === 'selected');
    expect(typeLetterWithProxy('S')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));

    puzzleButtons()[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => puzzleButtons()[0]?.getAttribute('data-tile-state') === 'selected');
    expect(typeLetterWithProxy('A')).toBe(true);

    puzzleButtons()[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => puzzleButtons()[2]?.getAttribute('data-tile-state') === 'selected');
    expect(typeLetterWithProxy('Z')).toBe(true);
    await waitFor(() => submitGuessMutation.mock.calls.length === 1);

    firstGuess.resolve({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [
        { index: 0, letter: 'S' },
        { index: 1, letter: 'S' },
      ],
      revealedIndices: [0, 1],
      revealedLetter: 'S',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await waitFor(() => submitGuessMutation.mock.calls.length === 2);
    const submittedTileIndices = submitGuessMutation.mock.calls.map((call) => call[0]?.tileIndex);
    expect(submittedTileIndices).toEqual([0, 2]);
  });

  it('auto-advances selection to the next empty tile after a correct reveal', async () => {
    const multiTilePuzzle = {
      levelId: 'lvl_0001',
      dateKey: '2026-02-24',
      author: 'UNKNOWN',
      words: ['ABC'],
      heartsMax: 3,
      tiles: [
        {
          index: 0,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 1,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 1,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 2,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 2,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 3,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
      ],
    };
    primeBaseMocks({ mode: 'expanded', puzzle: multiTilePuzzle });
    submitGuessMutation.mockResolvedValueOnce({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [{ index: 0, letter: 'A' }],
      revealedIndices: [0],
      revealedLetter: 'A',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await openChallengeFromHome();

    const buttons = () =>
      Array.from(document.querySelectorAll('[data-testid="puzzle-token-wrap"] button'));
    buttons()[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => buttons()[0]?.getAttribute('data-tile-state') === 'selected');
    expect(typeLetterWithProxy('A')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    await waitFor(() => buttons()[1]?.getAttribute('data-tile-state') === 'selected');
  });

  it('auto-advances past same-number auto-filled siblings', async () => {
    const siblingPuzzle = {
      levelId: 'lvl_0001',
      dateKey: '2026-02-24',
      author: 'UNKNOWN',
      words: ['AAB'],
      heartsMax: 3,
      tiles: [
        {
          index: 0,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 7,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 1,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 7,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
        {
          index: 2,
          isLetter: true,
          displayChar: '_',
          cipherNumber: 9,
          isBlind: false,
          isGold: false,
          isLocked: false,
        },
      ],
    };
    primeBaseMocks({ mode: 'expanded', puzzle: siblingPuzzle });
    submitGuessMutation.mockResolvedValueOnce({
      ok: true,
      isCorrect: true,
      errorCode: null,
      revealedTiles: [
        { index: 0, letter: 'A' },
        { index: 1, letter: 'A' },
      ],
      revealedIndices: [0, 1],
      revealedLetter: 'A',
      newlyUnlockedChainIds: [],
      heartsRemaining: 3,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: false,
    });

    await renderGame();
    await openChallengeFromHome();

    const buttons = () =>
      Array.from(document.querySelectorAll('[data-testid="puzzle-token-wrap"] button'));
    buttons()[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => buttons()[0]?.getAttribute('data-tile-state') === 'selected');
    expect(typeLetterWithProxy('A')).toBe(true);

    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    await waitFor(() => buttons()[2]?.getAttribute('data-tile-state') === 'selected');
  });
});
