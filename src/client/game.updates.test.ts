import { afterEach, describe, expect, it, vi } from 'vitest';

const bootstrapQuery = vi.fn();
const loadLevelQuery = vi.fn();
const startSessionMutation = vi.fn();
const continueLevelMutation = vi.fn();
const heartbeatMutation = vi.fn().mockResolvedValue({ ok: true });
const getCurrentViewQuery = vi.fn();
const submitGuessMutation = vi.fn();
const submitGuessesMutation = vi.fn();
const completeSessionMutation = vi.fn();
const purchaseDailyRetryMutation = vi.fn();
const powerupPurchaseMutation = vi.fn();
const powerupUseMutation = vi.fn();
const storeProductsQuery = vi.fn();
const questsGetStatusQuery = vi.fn();
const questsClaimMutation = vi.fn();
const profileJoinCommunityMutation = vi.fn();
const profileSetActiveFlairMutation = vi.fn();
const profileSetAudioEnabledMutation = vi.fn();
const leaderboardDailyQuery = vi.fn();
const leaderboardLevelQuery = vi.fn();
const leaderboardAllTimeQuery = vi.fn();
const leaderboardDailyPageQuery = vi.fn();
const leaderboardAllTimeLevelsPageQuery = vi.fn();
const leaderboardRankSummaryQuery = vi.fn();
const getCompletedOutcomeQuery = vi.fn();
const getFailedOutcomeQuery = vi.fn();
const shareResultMutation = vi.fn();
const purchaseMock = vi.fn();
const navigateToMock = vi.fn();
const showToastMock = vi.fn();
const getWebViewModeMock = vi.fn(() => 'expanded');
const sfxEnabledStorageKey = 'decrypt-sfx-enabled-v1';
const localStorageState = new Map<string, string>();
let mountedGameModule: typeof import('./game') | null = null;

const ensureLocalStorageMock = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => localStorageState.get(key) ?? null,
      setItem: (key: string, value: string) => {
        localStorageState.set(key, value);
      },
      removeItem: (key: string) => {
        localStorageState.delete(key);
      },
      clear: () => {
        localStorageState.clear();
      },
      key: (index: number) => Array.from(localStorageState.keys())[index] ?? null,
      get length() {
        return localStorageState.size;
      },
    } satisfies Storage,
  });
};

vi.mock('./trpc', () => ({
  trpc: {
    game: {
      bootstrap: { query: bootstrapQuery },
	      loadLevel: { query: loadLevelQuery },
	      startSession: { mutate: startSessionMutation },
	      continueLevel: { mutate: continueLevelMutation },
      heartbeat: { mutate: heartbeatMutation },
      getCurrentView: { query: getCurrentViewQuery },
      submitGuess: { mutate: submitGuessMutation },
      submitGuesses: { mutate: submitGuessesMutation },
	      completeSession: { mutate: completeSessionMutation },
	      purchaseDailyRetry: { mutate: purchaseDailyRetryMutation },
	      getCompletedOutcome: { query: getCompletedOutcomeQuery },
	      getFailedOutcome: { query: getFailedOutcomeQuery },
	    },
    powerup: {
      purchase: { mutate: powerupPurchaseMutation },
      use: { mutate: powerupUseMutation },
    },
    leaderboard: {
      getDaily: { query: leaderboardDailyQuery },
      getLevel: { query: leaderboardLevelQuery },
      getAllTime: { query: leaderboardAllTimeQuery },
      getDailyPage: { query: leaderboardDailyPageQuery },
	      getGlobalPage: { query: leaderboardAllTimeLevelsPageQuery },
      getRankSummary: { query: leaderboardRankSummaryQuery },
    },
    social: {
      shareResult: { mutate: shareResultMutation },
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
  requestExpandedMode: vi.fn(),
  purchase: purchaseMock,
  getWebViewMode: getWebViewModeMock,
  OrderResultStatus: {
    STATUS_SUCCESS: 'STATUS_SUCCESS',
  },
}));

const waitFor = async (predicate: () => boolean, timeoutMs = 5000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  console.log('DEBUG: waitFor TIMEOUT');
  console.log('DEBUG: DOM Body:', document.body.innerHTML.substring(0, 100000));
  throw new Error('Timed out waiting for condition');
};

const profileFixture = () => ({
  coins: 500,
  hearts: 3,
  lastHeartRefillTs: 0,
  infiniteHeartsExpiryTs: 0,
  currentStreak: 0,
  dailyCurrentStreak: 2,
  endlessCurrentStreak: 5,
  lastPlayedDateKey: '2026-03-16',
  totalWordsSolved: 10,
  logicTasksCompleted: 1,
  totalLevelsCompleted: 4,
  flawlessWins: 3,
  speedWins: 2,
  dailyFlawlessWins: 1,
  endlessFlawlessWins: 2,
  dailySpeedWins: 1,
  endlessSpeedWins: 1,
  dailyChallengesPlayed: 6,
  endlessChallengesPlayed: 9,
  dailyFirstTryWins: 2,
  endlessFirstTryWins: 3,
  questsCompleted: 4,
	  dailyModeClears: 3,
	  endlessModeClears: 5,
	  dailySolveTimeTotalSec: 390,
	  endlessSolveTimeTotalSec: 900,
	  globalRating: 650,
	  globalScore: 2400,
	  ratingGames: 12,
	  ratingWins: 8,
	  ratingLosses: 4,
	  globalWinStreak: 3,
	  bestGlobalRank: 2,
	  bestOverallRank: 2,
  audioEnabled: true,
  communityJoinRewardClaimed: false,
  unlockedFlairs: [],
  activeFlair: '',
});

const inventoryFixture = () => ({
  hammer: 1,
  wand: 1,
  shield: 1,
  rocket: 0,
});

const puzzleFixture = () => ({
  levelId: 'lvl_0001',
  dateKey: '2026-03-16',
  author: 'UNKNOWN',
  challengeType: 'QUOTE' as const,
  words: ['HELLO'],
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
  ],
});

const primeMocks = () => {
  getCompletedOutcomeQuery.mockResolvedValue({ accepted: true, solveSeconds: 100 });
  getFailedOutcomeQuery.mockResolvedValue(null);
  bootstrapQuery.mockResolvedValue({
    userId: 't2_test',
    username: 'tester',
    subredditName: 'decrypttest_dev',
    postId: 't3_test',
    currentDailyLevelId: 'lvl_0001',
    todayDateKey: '2026-03-16',
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
  loadLevelQuery.mockResolvedValue({
    mode: 'daily',
    levelId: 'lvl_0001',
    puzzle: puzzleFixture(),
    alreadyCompleted: false,
    retryCount: 0,
    nextRetryCost: 35,
    retryScoreFactor: 1,
    nextRetryScoreFactor: 1,
    requiresPaidRetry: false,
    challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
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
  getCurrentViewQuery.mockResolvedValue(puzzleFixture());
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
  completeSessionMutation.mockResolvedValue({
    ok: true,
    accepted: true,
    solveSeconds: 80,
    score: 88,
    rewardCoins: 150,
    mistakes: 0,
    usedPowerups: 0,
    retryCount: 0,
    retryScoreFactor: 1,
    isRecoveryRun: false,
    isCurrentDaily: true,
    rewardNotice: null,
    profile: profileFixture(),
    inventory: inventoryFixture(),
  });
  purchaseDailyRetryMutation.mockResolvedValue({
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
    profile: {
      ...profileFixture(),
      coins: 420,
    },
    inventory: inventoryFixture(),
    retryCount: 1,
    nextRetryCost: 70,
    retryScoreFactor: 1,
    nextRetryScoreFactor: 0.8923308604816518,
    requiresPaidRetry: false,
  });
  continueLevelMutation.mockResolvedValue({
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
    profile: profileFixture({ hearts: 2 }),
    inventory: inventoryFixture(),
  });
  questsGetStatusQuery.mockResolvedValue({
    dailyDateKey: '2026-03-16',
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
      lifetimeAcclaimedChallenges: 0,
      lifetimeLikesReceived: 0,
    },
    claimedQuestIds: [],
    milestoneClaimPercents: { milestone_spent_500: 12 },
  });
  questsClaimMutation.mockResolvedValue({
    success: true,
    reason: null,
    rewardCoins: 0,
    rewardInventory: inventoryFixture(),
    profile: profileFixture(),
    inventory: inventoryFixture(),
  });
  profileJoinCommunityMutation.mockResolvedValue({
    success: true,
    reason: null,
    joined: true,
    rewardCoins: 100,
    profile: {
      ...profileFixture(),
      coins: 600,
      communityJoinRecorded: true,
      communityJoinRewardClaimed: true,
    },
  });
  profileSetAudioEnabledMutation.mockResolvedValue({
    success: true,
    reason: null,
    profile: profileFixture(),
  });
  shareResultMutation.mockResolvedValue({
    success: true,
    reason: null,
    commentId: 't1_x',
  });
  leaderboardDailyQuery.mockResolvedValue({
    entries: [
      {
        userId: 't2_test',
        username: 'tester',
        score: 100,
        snoovatarUrl: null,
        solveSeconds: 90,
      },
    ],
  });
  leaderboardLevelQuery.mockResolvedValue({
    entries: [
      {
        userId: 't2_test',
        username: 'tester',
        score: 900,
        snoovatarUrl: 'https://example.com/tester.png',
        solveSeconds: 90,
      },
    ],
  });
  leaderboardAllTimeQuery.mockResolvedValue({
    levels: [
      {
        userId: 't2_test',
        username: 'tester',
        score: 5,
        snoovatarUrl: null,
      },
    ],
    logic: [],
  });
  leaderboardDailyPageQuery.mockResolvedValue({
    entries: [
      {
        userId: 't2_test',
        username: 'tester',
        score: 100,
        snoovatarUrl: null,
        solveSeconds: 90,
      },
    ],
    totalCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    pageInfo: {
      currentPage: 1,
      pageSize: 50,
      totalPages: 1,
    },
  });
  leaderboardAllTimeLevelsPageQuery.mockResolvedValue({
    entries: [
	      {
	        userId: 't2_test',
	        username: 'tester',
	        score: 650,
	        rating: 650,
	        globalScore: 2400,
	        challengesCompleted: 5,
	        snoovatarUrl: null,
	      },
    ],
    totalCount: 1,
    hasNextPage: false,
    hasPreviousPage: false,
    pageInfo: {
      currentPage: 1,
      pageSize: 50,
      totalPages: 1,
    },
  });
	  leaderboardRankSummaryQuery.mockResolvedValue({
	    dailyRank: 3,
	    globalRank: 2,
	    endlessRank: 2,
	    currentRank: 2,
	    bestOverallRank: 1,
	  });
  storeProductsQuery.mockResolvedValue({
    products: [
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
};

const renderGame = async (
  rootMarkup = '<div id="root" data-initial-screen="home"></div>'
): Promise<void> => {
  ensureLocalStorageMock();
  document.body.innerHTML = rootMarkup;
  const gameModule = await import('./game');
  mountedGameModule = gameModule;
  gameModule.mountGame();
};

const typeLetterWithProxy = (letter: string): boolean => {
  const input = document.querySelector('[data-testid="inline-input-proxy"]');
  if (!(input instanceof HTMLInputElement)) {
    return false;
  }
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  if (!valueSetter) {
    return false;
  }
  input.focus();
  valueSetter.call(input, letter);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};

afterEach(() => {
  mountedGameModule?.unmountGame();
  mountedGameModule = null;
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
  purchaseDailyRetryMutation.mockReset();
  powerupPurchaseMutation.mockReset();
  powerupUseMutation.mockReset();
  storeProductsQuery.mockReset();
  questsGetStatusQuery.mockReset();
  questsClaimMutation.mockReset();
  profileJoinCommunityMutation.mockReset();
  profileSetAudioEnabledMutation.mockReset();
  leaderboardDailyQuery.mockReset();
  leaderboardLevelQuery.mockReset();
  leaderboardAllTimeQuery.mockReset();
  leaderboardDailyPageQuery.mockReset();
  leaderboardAllTimeLevelsPageQuery.mockReset();
  leaderboardRankSummaryQuery.mockReset();
  shareResultMutation.mockReset();
  purchaseMock.mockReset();
  navigateToMock.mockReset();
  showToastMock.mockReset();
  getWebViewModeMock.mockReset();
  getWebViewModeMock.mockReturnValue('expanded');
  localStorageState.clear();
  // Clear sessionStorage between tests to prevent outcome state from leaking
  // across tests (persistOutcomeState uses sessionStorage, not localStorage).
  sessionStorage.clear();
  document.body.innerHTML = '';
});

describe('Game updates', { timeout: 15000 }, () => {
  it('uses daily/endless as home toggles and keeps endless as coming-soon', async () => {
    primeMocks();
    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="home-daily-panel"]')));

    const endlessButton = document.querySelector(
      '[data-testid="home-mode-endless"]'
    ) as HTMLButtonElement | null;
    const dailyButton = document.querySelector(
      '[data-testid="home-mode-daily"]'
    ) as HTMLButtonElement | null;
    const startSessionCallsBeforeToggle = startSessionMutation.mock.calls.length;

    dailyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="home-daily-panel"]')));
    expect(startSessionMutation.mock.calls.length).toBe(startSessionCallsBeforeToggle);

    expect(endlessButton?.disabled).toBe(false);
    expect(endlessButton?.textContent).toContain('Endless');
    endlessButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="home-endless-panel"]')));
    expect(showToastMock).toHaveBeenCalledWith('Endless mode is coming soon.');
  });

  it('remembers the settings audio toggle state', async () => {
    primeMocks();

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="home-play-button"]')));

    document
      .querySelector('[data-testid="home-play-button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="settings-button"]')));

    document
      .querySelector('[data-testid="settings-button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="audio-toggle"]')));

    const toggle = document.querySelector(
      '[data-testid="audio-toggle"]'
    ) as HTMLButtonElement | null;

    expect(toggle?.getAttribute('aria-pressed')).toBe('true');

    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(
      () => localStorageState.get(sfxEnabledStorageKey) === '0'
    );
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
  });

  it('renders endless as playable when a catalog is active', async () => {
    primeMocks();
    getCompletedOutcomeQuery.mockResolvedValue({ accepted: true, solveSeconds: 100 }); bootstrapQuery.mockResolvedValue({
      userId: 't2_test',
      username: 'tester',
      subredditName: 'decrypttest_dev',
      postId: 't3_test',
      currentDailyLevelId: 'lvl_0001',
      todayDateKey: '2026-03-16',
      profile: profileFixture(),
      inventory: inventoryFixture(),
      endlessCatalog: {
        available: true,
        activeCatalogVersion: 'v1',
        runtimeCatalogVersion: 'v1',
        publishedLevelCount: 200,
        bundledVersions: ['v1'],
      },
    });
    loadLevelQuery.mockImplementation(async ({ mode }: { mode: 'daily' | 'endless' }) => ({
      mode,
      levelId: mode === 'endless' ? 'endless_0001' : 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: false,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    }));

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="home-daily-panel"]')));

    document
      .querySelector('[data-testid="home-mode-endless"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="home-play-endless-button"]')));

    expect(document.querySelector('[data-testid="home-endless-category-filter"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="home-endless-sort"]')).not.toBeNull();
    expect(document.body.textContent ?? '').not.toContain('Endless Ciphers');
    expect(document.body.textContent ?? '').not.toContain('Ready');
    expect(document.body.textContent ?? '').not.toContain('Catalog');
    expect(showToastMock).not.toHaveBeenCalledWith('Endless mode is coming soon.');
  });

  it('renders leaderboard headers and removes top player label', async () => {
    primeMocks();
    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-leaderboard"]')));

    document
      .querySelector('[data-testid="nav-leaderboard"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="leaderboard-screen"]')));
    await waitFor(() => (document.body.textContent ?? '').includes('Player'));

    const text = document.body.textContent ?? '';
    expect(text).toContain('Rank');
    expect(text).toContain('Player');
    expect(text).toContain('Score');
    expect(text).toContain('Avg. Time');
    expect(text.includes('Top Player')).toBe(false);
  });

  it('renders stats tabs and global cards', async () => {
    primeMocks();
    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-stats"]')));

    document
      .querySelector('[data-testid="nav-stats"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="stats-screen"]')));

	    const text = document.body.textContent ?? '';
	    expect(text).toContain('Daily');
	    expect(text).toContain('Global');
	    expect(text).toContain('Challenges Played');
	    expect(text).toContain('First Try Wins');
	    expect(text).toContain('Quest Completed');
    expect(text).toContain('Best Overall Rank');
    expect(text).toContain('Current Rank');
  });

  it('renders quest reward icons in both daily and milestone tabs', async () => {
    primeMocks();
    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-quest"]')));

    document
      .querySelector('[data-testid="nav-quest"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="quest-screen"]')));

    await waitFor(() => Boolean(document.querySelector('[data-testid="quest-reward-item-coins"]')));
    await waitFor(() => Boolean(document.querySelector('[data-testid="quest-reward-icon-hammer"]')));
    await waitFor(() => Boolean(document.querySelector('[data-testid="quest-reward-icon-shield"]')));

    const milestoneButton = Array.from(
      document.querySelectorAll('[data-testid="quest-screen"] button')
    ).find((button) => button.textContent?.trim() === 'Milestone');
    milestoneButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => (document.body.textContent ?? '').includes('Pocket Change'));
    await waitFor(() => Boolean(document.querySelector('[data-testid="quest-reward-icon-hammer"]')));
    await waitFor(() => Boolean(document.querySelector('[data-testid="quest-reward-icon-shield"]')));
  });

	  it('renders avg solve time values for daily and global stats tabs', async () => {
    primeMocks();
    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-stats"]')));

    document
      .querySelector('[data-testid="nav-stats"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="stats-screen"]')));
    await waitFor(() => (document.body.textContent ?? '').includes('02:10'));

	    const globalTabButton = Array.from(
	      document.querySelectorAll('[data-testid="stats-screen"] button')
	    ).find((button) => button.textContent?.trim() === 'Global');
	    globalTabButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	
    await waitFor(() => (document.body.textContent ?? '').includes('02:41'));
  });

  it('shows the rank for the selected stats tab', async () => {
    primeMocks();
    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-stats"]')));

    document
      .querySelector('[data-testid="nav-stats"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="stats-screen"]')));
    await waitFor(() => (document.body.textContent ?? '').includes('#3'));

    document
      .querySelectorAll('[data-testid="stats-screen"] button')[1]
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => (document.body.textContent ?? '').includes('#2'));
  });

  it('renders avg time in the daily leaderboard row', async () => {
    primeMocks();
    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-leaderboard"]')));

    document
      .querySelector('[data-testid="nav-leaderboard"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="leaderboard-screen"]')));

    await waitFor(() => (document.body.textContent ?? '').includes('01:30'));
  });

  it('maps order-not-placed purchase failures to a production-safe message', async () => {
    primeMocks();
    purchaseMock.mockResolvedValue({
      status: 'STATUS_ERROR',
      errorMessage: 'Order not placed',
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-shop"]')));

    document
      .querySelector('[data-testid="nav-shop"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="shop-buy-rookie_stash"]')));

    document
      .querySelector('[data-testid="shop-buy-rookie_stash"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => showToastMock.mock.calls.length > 0);

    expect(showToastMock).toHaveBeenCalledWith(
      'Unable to place your order right now. Please try again.'
    );
  });

  it('continues from the in-challenge failure prompt', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: false,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      heartsRemaining: 0,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: true,
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="puzzle-token-wrap"] button')));

    document
      .querySelector('[data-testid="puzzle-token-wrap"] button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(
      () =>
        document
          .querySelector('[data-testid="puzzle-token-wrap"] button')
          ?.getAttribute('data-tile-state') === 'selected'
    );
    expect(typeLetterWithProxy('Q')).toBe(true);
    await waitFor(() => submitGuessMutation.mock.calls.length > 0);

    await waitFor(() => Boolean(document.querySelector('[data-testid="continue-prompt"]')));
    expect(document.querySelector('[data-testid="continue-prompt-backdrop"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="result-screen"]')).toBeNull();
    document
      .querySelector('[data-testid="continue-prompt-button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => continueLevelMutation.mock.calls.length > 0);
    expect(continueLevelMutation).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      mode: 'daily',
    });
    expect(purchaseDailyRetryMutation).not.toHaveBeenCalled();
  });

  it('requires confirmation before canceling the continue prompt', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: false,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });
    submitGuessMutation.mockResolvedValue({
      ok: true,
      isCorrect: false,
      errorCode: null,
      revealedTiles: [],
      revealedIndices: [],
      revealedLetter: null,
      newlyUnlockedChainIds: [],
      heartsRemaining: 0,
      shieldConsumed: false,
      isLevelComplete: false,
      isGameOver: true,
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitFor(() => Boolean(document.querySelector('[data-testid="puzzle-token-wrap"] button')));

    document
      .querySelector('[data-testid="puzzle-token-wrap"] button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(
      () =>
        document
          .querySelector('[data-testid="puzzle-token-wrap"] button')
          ?.getAttribute('data-tile-state') === 'selected'
    );
    expect(typeLetterWithProxy('Q')).toBe(true);
    await waitFor(() => submitGuessMutation.mock.calls.length > 0);
    await waitFor(() => Boolean(document.querySelector('[data-testid="continue-prompt"]')));

    document
      .querySelector('[data-testid="continue-prompt-cancel"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="continue-prompt-confirm-cancel"]')));
    expect(document.querySelector('[data-testid="result-screen"]')).toBeNull();

    document
      .querySelector('[data-testid="continue-prompt-keep-playing"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => !document.querySelector('[data-testid="continue-prompt-confirm-cancel"]'));
    expect(document.querySelector('[data-testid="continue-prompt"]')).not.toBeNull();

    document
      .querySelector('[data-testid="continue-prompt-cancel"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="continue-prompt-confirm-cancel"]')));
    document
      .querySelector('[data-testid="continue-prompt-confirm-cancel"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => Boolean(document.querySelector('[data-testid="result-screen"]')));
    expect(continueLevelMutation).not.toHaveBeenCalled();
  });

  it('does not offer continue from an already failed result screen', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');
    getCompletedOutcomeQuery.mockResolvedValue({ accepted: true, solveSeconds: 100 }); bootstrapQuery.mockResolvedValue({
      userId: 't2_test',
      username: 'tester',
      subredditName: 'decrypttest_dev',
      postId: 't3_test',
      currentDailyLevelId: 'lvl_0001',
      todayDateKey: '2026-03-16',
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
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: false,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: true,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() => Boolean(document.querySelector('[data-testid="result-screen"]')));
    expect(document.querySelector('[data-testid="overlay-continue"]')).toBeNull();
    expect(continueLevelMutation).not.toHaveBeenCalled();
    expect(purchaseDailyRetryMutation).not.toHaveBeenCalled();
  });

  it('loads result crowd avatars from the specific level leaderboard', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');
    bootstrapQuery.mockResolvedValue({
      userId: 't2_test',
      username: 'tester',
      subredditName: 'decrypttest_dev',
      postId: 't3_test',
      currentDailyLevelId: 'lvl_0001',
      todayDateKey: '2026-03-16',
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
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: true,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() => leaderboardLevelQuery.mock.calls.length > 0);
    expect(leaderboardLevelQuery).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      limit: 20,
    });
    expect(leaderboardDailyQuery).not.toHaveBeenCalled();
    await waitFor(() => Boolean(document.querySelector('[data-testid="success-overlay"]')));
    await waitFor(() => Boolean(document.querySelector('[data-testid="outcome-overlay-crowd"] img')));
    const crowdImages = Array.from(
      document.querySelectorAll('[data-testid="outcome-overlay-crowd"] img')
    );
    expect(crowdImages).toHaveLength(1);
    expect(crowdImages.map((image) => image.getAttribute('src'))).toContain(
      'https://example.com/tester.png'
    );
  });

  it('renders a username fallback bubble when a leaderboard entry has no snoovatar', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');
    bootstrapQuery.mockResolvedValue({
      userId: 't2_test',
      username: 'tester',
      subredditName: 'decrypttest_dev',
      postId: 't3_test',
      currentDailyLevelId: 'lvl_0001',
      todayDateKey: '2026-03-16',
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
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: true,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });
    leaderboardLevelQuery.mockResolvedValue({
      entries: [
        {
          userId: 't2_test',
          username: 'tester',
          score: 900,
          snoovatarUrl: 'https://example.com/tester.png',
          solveSeconds: 90,
        },
        {
          userId: 't2_alpha',
          username: 'alpha',
          score: 800,
          snoovatarUrl: null,
          solveSeconds: 100,
        },
      ],
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() => Boolean(document.querySelector('[data-testid="success-overlay"]')));
    await waitFor(
      () =>
        document.querySelectorAll('[data-testid="outcome-overlay-crowd"] img')
          .length >= 1, 10000);
    const crowdImages = Array.from(
      document.querySelectorAll('[data-testid="outcome-overlay-crowd"] img')
    );
    const urls = crowdImages.map((image) => image.getAttribute('src') ?? '');
    expect(urls).toContain('https://example.com/tester.png');
    expect(urls.some((url) => url.startsWith('data:image/svg+xml'))).toBe(true);
  });

  it('shows a community join button on the result screen and saves the joined state', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');
    getCompletedOutcomeQuery.mockResolvedValue({ accepted: true, solveSeconds: 100 }); bootstrapQuery.mockResolvedValue({
      userId: 't2_test',
      username: 'tester',
      subredditName: 'decrypttest_dev',
      postId: 't3_test',
      currentDailyLevelId: 'lvl_0001',
      todayDateKey: '2026-03-16',
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
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: true,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() => Boolean(document.querySelector('[data-testid="join-community-button"]')));
    const button = document.querySelector(
      '[data-testid="join-community-button"]'
    ) as HTMLButtonElement | null;
    expect(button?.textContent).toContain('Subscribe');

    await new Promise((resolve) => setTimeout(resolve, 300));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => profileJoinCommunityMutation.mock.calls.length > 0);

    expect(navigateToMock).not.toHaveBeenCalled();
    expect(shareResultMutation).not.toHaveBeenCalled();
    expect(
      showToastMock.mock.calls.some(
        ([message]) =>
          typeof message === 'string' && message.includes('Community joined.')
      )
    ).toBe(true);
    await waitFor(
      () =>
        (document.querySelector('[data-testid="join-community-button"]')?.textContent ?? '').includes(
          'Joined'
        )
    );
  });

  it('locks inline puzzle scrolling by fitting to both viewport width and height', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() => Boolean(document.querySelector('[data-testid="puzzle-viewport"]')));

    const viewport = document.querySelector(
      '[data-testid="puzzle-viewport"]'
    ) as HTMLDivElement | null;
    const content = document.querySelector(
      '[data-testid="puzzle-content"]'
    ) as HTMLDivElement | null;
    const scaleWrap = document.querySelector(
      '[data-testid="puzzle-scale-wrap"]'
    ) as HTMLDivElement | null;

    expect(viewport).not.toBeNull();
    expect(content).not.toBeNull();
    expect(scaleWrap).not.toBeNull();

    Object.defineProperty(viewport!, 'clientWidth', {
      configurable: true,
      get: () => 240,
    });
    Object.defineProperty(viewport!, 'clientHeight', {
      configurable: true,
      get: () => 120,
    });
    Object.defineProperty(content!, 'scrollWidth', {
      configurable: true,
      get: () => 300,
    });
    Object.defineProperty(content!, 'scrollHeight', {
      configurable: true,
      get: () => 240,
    });

    window.dispatchEvent(new Event('resize'));

    await waitFor(
      () => scaleWrap?.style.transform === 'scale(0.5)'
    );

    expect(viewport?.dataset.scrollMode).toBe('locked');
    expect(scaleWrap?.style.transform).toBe('scale(0.5)');
  });

  it('keeps expanded puzzle at natural scale and uses scroll instead of zooming out', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('expanded');

    await renderGame('<div id="root" data-initial-screen="challenge"></div>');
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() => Boolean(document.querySelector('[data-testid="puzzle-viewport"]')));

    const viewport = document.querySelector<HTMLDivElement>(
      '[data-testid="puzzle-viewport"]'
    );
    const content = document.querySelector<HTMLDivElement>(
      '[data-testid="puzzle-content"]'
    );
    const scaleWrap = document.querySelector<HTMLDivElement>(
      '[data-testid="puzzle-scale-wrap"]'
    );

    expect(viewport).not.toBeNull();
    expect(content).not.toBeNull();
    expect(scaleWrap).not.toBeNull();

    if (!viewport || !content || !scaleWrap) {
      throw new Error('Puzzle layout nodes were not rendered.');
    }

    Object.defineProperty(viewport, 'clientWidth', {
      configurable: true,
      get: () => 240,
    });
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      get: () => 120,
    });
    Object.defineProperty(content, 'scrollWidth', {
      configurable: true,
      get: () => 300,
    });
    Object.defineProperty(content, 'scrollHeight', {
      configurable: true,
      get: () => 240,
    });

    window.dispatchEvent(new Event('resize'));

    await waitFor(() => scaleWrap.style.transform === 'scale(1)');

    expect(viewport.dataset.scrollMode).toBe('auto');
    expect(viewport.className).toContain('items-start');
    expect(viewport.className).not.toContain('items-center');
    expect(scaleWrap.style.transform).toBe('scale(1)');
  });

  it('shows a toast instead of leaking an exception when comment sharing rejects', async () => {
    primeMocks();
    shareResultMutation.mockRejectedValueOnce(new Error('request aborted'));
    getWebViewModeMock.mockReturnValue('inline');
    getCompletedOutcomeQuery.mockResolvedValue({ accepted: true, solveSeconds: 100 }); bootstrapQuery.mockResolvedValue({
      userId: 't2_test',
      username: 'tester',
      subredditName: 'decrypttest_dev',
      postId: 't3_test',
      currentDailyLevelId: 'lvl_0001',
      todayDateKey: '2026-03-16',
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
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: true,
      retryCount: 0,
      nextRetryCost: 35,
      retryScoreFactor: 1,
      nextRetryScoreFactor: 1,
      requiresPaidRetry: false,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });

    await renderGame();
    await new Promise((resolve) => setTimeout(resolve, 300));

    await waitFor(() => Boolean(document.querySelector('[data-testid="success-overlay"]')));
    await waitFor(() => Boolean(document.querySelector('[data-testid="overlay-share-comment"]')));
    const button = document.querySelector(
      '[data-testid="overlay-share-comment"]'
    ) as HTMLButtonElement | null;

    await new Promise((resolve) => setTimeout(resolve, 300));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => shareResultMutation.mock.calls.length > 0);
    await waitFor(() => showToastMock.mock.calls.length > 0);
    expect(showToastMock).toHaveBeenCalledWith('Share failed.');
  });
});
