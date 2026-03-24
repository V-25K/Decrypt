import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  getProductsMock,
  getOrdersMock,
  bootstrapGameMock,
  getPurchasedSkusMock,
  submitGuessesForSessionMock,
} = vi.hoisted(() => ({
  getProductsMock: vi.fn(),
  getOrdersMock: vi.fn(),
  bootstrapGameMock: vi.fn(),
  getPurchasedSkusMock: vi.fn(),
  submitGuessesForSessionMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  payments: {
    getProducts: getProductsMock,
    getOrders: getOrdersMock,
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
  getUserProfile: vi.fn(),
  saveInventory: vi.fn(),
  saveUserProfile: vi.fn(),
}));

import { appRouter } from './trpc';

afterEach(() => {
  getProductsMock.mockReset();
  getOrdersMock.mockReset();
  bootstrapGameMock.mockReset();
  getPurchasedSkusMock.mockReset();
  submitGuessesForSessionMock.mockReset();
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
      subredditName: 'decrypttest_dev',
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
      subredditName: 'decrypttest_dev',
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
      subredditName: 'decrypttest_dev',
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
