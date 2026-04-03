import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  getProductsMock,
  getOrdersMock,
  bootstrapGameMock,
  getPurchasedSkusMock,
  submitGuessesForSessionMock,
  subscribeToCurrentSubredditMock,
  getUserProfileMock,
  saveUserProfileMock,
} = vi.hoisted(() => ({
  getProductsMock: vi.fn(),
  getOrdersMock: vi.fn(),
  bootstrapGameMock: vi.fn(),
  getPurchasedSkusMock: vi.fn(),
  submitGuessesForSessionMock: vi.fn(),
  subscribeToCurrentSubredditMock: vi.fn(),
  getUserProfileMock: vi.fn(),
  saveUserProfileMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  payments: {
    getProducts: getProductsMock,
    getOrders: getOrdersMock,
  },
  reddit: {
    subscribeToCurrentSubreddit: subscribeToCurrentSubredditMock,
  },
}));

vi.mock('./core/game-service', () => ({
  bootstrapGame: bootstrapGameMock,
  completeSessionForLevel: vi.fn(),
  getCurrentPuzzleView: vi.fn(),
  loadLevelForUser: vi.fn(),
  startSessionForLevel: vi.fn(),
  submitGuessesForSession: submitGuessesForSessionMock,
  submitGuessForSession: vi.fn(),
  usePowerupForSession: vi.fn(),
}));

vi.mock('./core/state', () => ({
  getInventory: vi.fn(),
  getPurchasedSkus: getPurchasedSkusMock,
  getUserProfile: getUserProfileMock,
  saveInventory: vi.fn(),
  saveUserProfile: saveUserProfileMock,
}));

import { appRouter } from './trpc';

afterEach(() => {
  getProductsMock.mockReset();
  getOrdersMock.mockReset();
  bootstrapGameMock.mockReset();
  getPurchasedSkusMock.mockReset();
  submitGuessesForSessionMock.mockReset();
  subscribeToCurrentSubredditMock.mockReset();
  getUserProfileMock.mockReset();
  saveUserProfileMock.mockReset();
});

describe('store.getProducts', () => {
  it('filters purchased one-time offer and returns enriched metadata', async () => {
    bootstrapGameMock.mockResolvedValue({ userId: 'u_test' });
    getPurchasedSkusMock.mockResolvedValue(new Set(['rookie_stash']));
    getProductsMock.mockResolvedValue({
      products: [
        {
          sku: 'rookie_stash',
          name: 'Rookie Stash',
          description: 'Starter bundle',
          price: { amount: 50 },
        },
        {
          sku: 'decoder_pack',
          name: 'Decoder Pack',
          description: 'Core bundle',
          price: { amount: 250 },
        },
      ],
    });

    const caller = appRouter.createCaller({
      userId: 't2_u_test',
      username: 'tester',
      subredditName: 'PlayDecrypt',
      postId: 't3_testpost',
    });
    const result = await caller.store.getProducts();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      sku: 'decoder_pack',
      isOneTime: false,
      usdApprox: 5,
      perks: {
        coins: 2600,
        hammer: 3,
        wand: 1,
        shield: 2,
        rocket: 1,
        infiniteHeartsHours: 2,
      },
    });
  });

  it('includes one-time offer metadata when not yet purchased', async () => {
    bootstrapGameMock.mockResolvedValue({ userId: 'u_test' });
    getPurchasedSkusMock.mockResolvedValue(new Set());
    getProductsMock.mockResolvedValue({
      products: [
        {
          sku: 'rookie_stash',
          name: 'Rookie Stash',
          description: 'Starter bundle',
          price: { amount: 50 },
        },
      ],
    });

    const caller = appRouter.createCaller({
      userId: 't2_u_test',
      username: 'tester',
      subredditName: 'PlayDecrypt',
      postId: 't3_testpost',
    });
    const result = await caller.store.getProducts();

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      sku: 'rookie_stash',
      isOneTime: true,
      usdApprox: 1,
      perks: {
        coins: 500,
        hammer: 1,
        wand: 0,
        shield: 1,
        rocket: 0,
        infiniteHeartsHours: 0,
      },
    });
  });
});

describe('game.submitGuesses', () => {
  it('forwards batched guesses and returns results', async () => {
    submitGuessesForSessionMock.mockResolvedValue({
      ok: true,
      results: [
        {
          ok: true,
          isCorrect: true,
          errorCode: null,
          revealedTiles: [],
          revealedIndices: [],
          revealedLetter: null,
          newlyUnlockedChainIds: [],
          heartsRemaining: 3,
          shieldConsumed: false,
          isLevelComplete: false,
          isGameOver: false,
        },
      ],
    });

    const caller = appRouter.createCaller({
      userId: 't2_u_test',
      username: 'tester',
      subredditName: 'PlayDecrypt',
      postId: 't3_testpost',
    });

    const result = await caller.game.submitGuesses({
      levelId: 'lvl_0001',
      guesses: [{ tileIndex: 4, guessedLetter: 'A' }],
    });

    expect(submitGuessesForSessionMock).toHaveBeenCalledWith({
      levelId: 'lvl_0001',
      guesses: [{ tileIndex: 4, guessedLetter: 'A' }],
    });
    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.isCorrect).toBe(true);
  });
});

describe('profile.joinCommunity', () => {
  it('subscribes once, saves the joined state, and awards coins', async () => {
    getUserProfileMock.mockResolvedValue({
      coins: 25,
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
      communityJoinRewardClaimed: false,
      unlockedFlairs: [],
      activeFlair: '',
    });
    subscribeToCurrentSubredditMock.mockResolvedValue(undefined);

    const caller = appRouter.createCaller({
      userId: 't2_u_test',
      username: 'tester',
      subredditName: 'PlayDecrypt',
      postId: 't3_testpost',
    });
    const result = await caller.profile.joinCommunity();

    expect(subscribeToCurrentSubredditMock).toHaveBeenCalledTimes(1);
    expect(saveUserProfileMock).toHaveBeenCalledWith(
      't2_u_test',
      expect.objectContaining({
        coins: 125,
        communityJoinRewardClaimed: true,
      })
    );
    expect(result).toMatchObject({
      success: true,
      joined: true,
      rewardCoins: 100,
      profile: expect.objectContaining({
        coins: 125,
        communityJoinRewardClaimed: true,
      }),
    });
  });

  it('returns the saved joined state without rewarding twice', async () => {
    getUserProfileMock.mockResolvedValue({
      coins: 125,
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
      communityJoinRewardClaimed: true,
      unlockedFlairs: [],
      activeFlair: '',
    });

    const caller = appRouter.createCaller({
      userId: 't2_u_test',
      username: 'tester',
      subredditName: 'PlayDecrypt',
      postId: 't3_testpost',
    });
    const result = await caller.profile.joinCommunity();

    expect(subscribeToCurrentSubredditMock).not.toHaveBeenCalled();
    expect(saveUserProfileMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      joined: true,
      rewardCoins: 0,
      profile: expect.objectContaining({
        communityJoinRewardClaimed: true,
      }),
    });
  });
});
