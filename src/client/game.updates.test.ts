import { afterEach, describe, expect, it, vi } from 'vitest';

const bootstrapQuery = vi.fn();
const loadLevelQuery = vi.fn();
const startSessionMutation = vi.fn();
const getCurrentViewQuery = vi.fn();
const submitGuessMutation = vi.fn();
const completeSessionMutation = vi.fn();
const powerupPurchaseMutation = vi.fn();
const powerupUseMutation = vi.fn();
const storeProductsQuery = vi.fn();
const questsGetStatusQuery = vi.fn();
const questsClaimMutation = vi.fn();
const profileSetActiveFlairMutation = vi.fn();
const leaderboardDailyQuery = vi.fn();
const leaderboardLevelQuery = vi.fn();
const leaderboardAllTimeQuery = vi.fn();
const leaderboardRankSummaryQuery = vi.fn();
const shareResultMutation = vi.fn();
const purchaseMock = vi.fn();
const showToastMock = vi.fn();
const getWebViewModeMock = vi.fn(() => 'expanded');

vi.mock('./trpc', () => ({
  trpc: {
    game: {
      bootstrap: { query: bootstrapQuery },
      loadLevel: { query: loadLevelQuery },
      startSession: { mutate: startSessionMutation },
      getCurrentView: { query: getCurrentViewQuery },
      submitGuess: { mutate: submitGuessMutation },
      completeSession: { mutate: completeSessionMutation },
      getCompletionReceipt: { query: vi.fn() },
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
      shareResult: { mutate: shareResultMutation },
    },
    quests: {
      getStatus: { query: questsGetStatusQuery },
      claim: { mutate: questsClaimMutation },
    },
    profile: {
      setActiveFlair: { mutate: profileSetActiveFlairMutation },
    },
    store: {
      getProducts: { query: storeProductsQuery },
    },
  },
}));

vi.mock('@devvit/web/client', () => ({
  showToast: showToastMock,
  requestExpandedMode: vi.fn(),
  purchase: purchaseMock,
  getWebViewMode: getWebViewModeMock,
  OrderResultStatus: {
    STATUS_SUCCESS: 'STATUS_SUCCESS',
  },
}));

const waitFor = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
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
  bestOverallRank: 2,
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
  bootstrapQuery.mockResolvedValue({
    userId: 't2_test',
    username: 'tester',
    postId: 't3_test',
    currentDailyLevelId: 'lvl_0001',
    todayDateKey: '2026-03-16',
    profile: profileFixture(),
    inventory: inventoryFixture(),
  });
  loadLevelQuery.mockResolvedValue({
    mode: 'daily',
    levelId: 'lvl_0001',
    puzzle: puzzleFixture(),
    alreadyCompleted: false,
    challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
  });
  startSessionMutation.mockResolvedValue({
    ok: true,
    session: {
      activeLevelId: 'lvl_0001',
      mode: 'daily',
      startTimestamp: 0,
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
    profile: profileFixture(),
    inventory: inventoryFixture(),
  });
  questsGetStatusQuery.mockResolvedValue({
    dailyDateKey: '2026-03-16',
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
    profile: profileFixture(),
    inventory: inventoryFixture(),
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
  leaderboardRankSummaryQuery.mockResolvedValue({
    dailyRank: 3,
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

afterEach(() => {
  bootstrapQuery.mockReset();
  loadLevelQuery.mockReset();
  startSessionMutation.mockReset();
  getCurrentViewQuery.mockReset();
  submitGuessMutation.mockReset();
  completeSessionMutation.mockReset();
  powerupPurchaseMutation.mockReset();
  powerupUseMutation.mockReset();
  storeProductsQuery.mockReset();
  questsGetStatusQuery.mockReset();
  questsClaimMutation.mockReset();
  leaderboardDailyQuery.mockReset();
  leaderboardLevelQuery.mockReset();
  leaderboardAllTimeQuery.mockReset();
  leaderboardRankSummaryQuery.mockReset();
  shareResultMutation.mockReset();
  purchaseMock.mockReset();
  showToastMock.mockReset();
  getWebViewModeMock.mockReset();
  getWebViewModeMock.mockReturnValue('expanded');
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('Game updates', () => {
  it('uses daily/endless as home toggles and keeps endless as coming-soon', async () => {
    primeMocks();
    document.body.innerHTML = '<div id="root"></div>';
    await import('./game');
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

  it('renders leaderboard headers and removes top player label', async () => {
    primeMocks();
    document.body.innerHTML = '<div id="root"></div>';
    await import('./game');
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-leaderboard"]')));

    document
      .querySelector('[data-testid="nav-leaderboard"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="leaderboard-screen"]')));

    const text = document.body.textContent ?? '';
    expect(text).toContain('Rank');
    expect(text).toContain('Player');
    expect(text).toContain('Score');
    expect(text.includes('Top Player')).toBe(false);
  });

  it('renders stats tabs and global cards', async () => {
    primeMocks();
    document.body.innerHTML = '<div id="root"></div>';
    await import('./game');
    await waitFor(() => Boolean(document.querySelector('[data-testid="nav-stats"]')));

    document
      .querySelector('[data-testid="nav-stats"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => Boolean(document.querySelector('[data-testid="stats-screen"]')));

    const text = document.body.textContent ?? '';
    expect(text).toContain('Daily');
    expect(text).toContain('Endless');
    expect(text).toContain('Challenges Played');
    expect(text).toContain('First Try Wins');
    expect(text).toContain('Quest Completed');
    expect(text).toContain('All-Time Best Ranking');
    expect(text).toContain('Current Rank');
  });

  it('shows the rank for the selected stats tab', async () => {
    primeMocks();
    document.body.innerHTML = '<div id="root"></div>';
    await import('./game');
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

  it('maps order-not-placed purchase failures to sandbox guidance', async () => {
    primeMocks();
    purchaseMock.mockResolvedValue({
      status: 'STATUS_ERROR',
      errorMessage: 'Order not placed',
    });

    document.body.innerHTML = '<div id="root"></div>';
    await import('./game');
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
      'Order not placed. For sandbox testing, run upload + playtest and verify products sync.'
    );
  });

  it('loads result crowd avatars from the specific level leaderboard', async () => {
    primeMocks();
    getWebViewModeMock.mockReturnValue('inline');
    loadLevelQuery.mockResolvedValue({
      mode: 'daily',
      levelId: 'lvl_0001',
      puzzle: puzzleFixture(),
      alreadyCompleted: true,
      challengeMetrics: { plays: 10, wins: 5, winRatePct: 50 },
    });

    document.body.innerHTML = '<div id="root"></div>';
    await import('./game');

    await waitFor(() => leaderboardLevelQuery.mock.calls.length > 0);
    expect(leaderboardLevelQuery).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      limit: 20,
    });
    expect(leaderboardDailyQuery).not.toHaveBeenCalled();
    await waitFor(() => Boolean(document.querySelector('[data-testid="outcome-overlay-crowd"] img')));
    const crowdImages = Array.from(
      document.querySelectorAll('[data-testid="outcome-overlay-crowd"] img')
    );
    expect(crowdImages.map((image) => image.getAttribute('src'))).toContain(
      'https://example.com/tester.png'
    );
  });
});
