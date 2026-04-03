import { afterEach, describe, expect, it, vi } from 'vitest';

const bootstrapQuery = vi.fn();
const loadLevelQuery = vi.fn();
const startSessionMutation = vi.fn();
const heartbeatMutation = vi.fn().mockResolvedValue({ ok: true });
const getCurrentViewQuery = vi.fn();
const submitGuessMutation = vi.fn();
const completeSessionMutation = vi.fn();
const powerupPurchaseMutation = vi.fn();
const powerupUseMutation = vi.fn();
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

vi.mock('./trpc', () => ({
  trpc: {
    game: {
      bootstrap: { query: bootstrapQuery },
      loadLevel: { query: loadLevelQuery },
      startSession: { mutate: startSessionMutation },
      heartbeat: { mutate: heartbeatMutation },
      getCurrentView: { query: getCurrentViewQuery },
      submitGuess: { mutate: submitGuessMutation },
      completeSession: { mutate: completeSessionMutation },
    },
    powerup: {
      purchase: { mutate: powerupPurchaseMutation },
      use: { mutate: powerupUseMutation },
    },
    leaderboard: {
      getDaily: { query: vi.fn() },
      getLevel: { query: vi.fn() },
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

const puzzleFixture = (displayChar = '_') => ({
  levelId: 'lvl_0001',
  dateKey: '2026-02-24',
  author: 'UNKNOWN',
  words: ['HELLO'],
  heartsMax: 3,
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
  inventory?: Partial<{ hammer: number; wand: number; shield: number; rocket: number }>;
  puzzle?: ReturnType<typeof puzzleFixture>;
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
      shieldIsActive: false,
      revealedIndices: [],
      usedPowerups: 0,
      wrongGuesses: 0,
      guessCount: 0,
    },
    heartsRemaining: 3,
  });
  getCurrentViewQuery.mockResolvedValue(puzzle);
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
      dailyUnder5Min: false,
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
    profile: profileFixture(params?.coins ?? 500),
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

const renderGame = async (): Promise<void> => {
  document.body.innerHTML = '<div id="root"></div>';
  const gameModule = await import('./game');
  gameModule.mountGame();
};

const waitForChallengeScreen = async (): Promise<void> => {
  await waitFor(() => Boolean(document.querySelector('[data-testid="puzzle-token-wrap"]')));
  await waitFor(() => (document.body.textContent ?? '').includes('Mistakes'));
};

const openChallengeFromHome = async (): Promise<void> => {
  await waitFor(() => Boolean(document.querySelector('[data-testid="home-screen"]')));
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

afterEach(() => {
  bootstrapQuery.mockReset();
  loadLevelQuery.mockReset();
  startSessionMutation.mockReset();
  heartbeatMutation.mockReset();
  heartbeatMutation.mockResolvedValue({ ok: true });
  getCurrentViewQuery.mockReset();
  submitGuessMutation.mockReset();
  completeSessionMutation.mockReset();
  powerupPurchaseMutation.mockReset();
  powerupUseMutation.mockReset();
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
  setViewportWidth(1024);
  document.body.innerHTML = '';
});

describe('Game', { timeout: 15000 }, () => {
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
    await waitFor(() => Boolean(document.querySelector('[data-testid="home-screen"]')));

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

  it('buys powerups with quantity dialog without auto-using', async () => {
    primeBaseMocks({ mode: 'expanded', coins: 600 });
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
    await waitFor(() => (document.body.textContent ?? '').includes('Total: 510'));
    confirm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => powerupPurchaseMutation.mock.calls.length > 0);
    expect(powerupPurchaseMutation).toHaveBeenCalledWith({ itemType: 'wand', quantity: 3 });
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

    await waitFor(() => Boolean(document.querySelector('[data-testid="result-screen"]')));
    expect(document.body.textContent ?? '').toContain('Level Completed');
    expect(document.querySelector('[data-testid="outcome-overlay-quote"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="outcome-time-pill"]')).toBeTruthy();
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
});
