import { initTRPC } from '@trpc/server';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { transformer } from '../shared/transformer';
import type { Context } from './context';
import {
  adminActionResponseSchema,
  adminDifficultyCalibrationResponseSchema,
  adminInjectInputSchema,
  gameBootstrapResponseSchema,
  gameCompleteSessionInputSchema,
  gameLoadLevelInputSchema,
  gameStartSessionInputSchema,
  gameSubmitGuessesInputSchema,
  gameSubmitGuessesResponseSchema,
  gameSubmitGuessInputSchema,
  leaderboardGetInputSchema,
  leaderboardGetLevelInputSchema,
  leaderboardRankSummarySchema,
  powerupPurchaseInputSchema,
  powerupUseInputSchema,
  profileSetActiveFlairInputSchema,
  profileSetActiveFlairResponseSchema,
  questClaimInputSchema,
  socialShareInputSchema,
  storeProductsResponseSchema,
} from '../shared/game';
import {
  bootstrapGame,
  completeSessionForLevel,
  getCurrentPuzzleView,
  loadLevelForUser,
  startSessionForLevel,
  submitGuessesForSession,
  submitGuessForSession,
  trackShareQuest,
  usePowerupForSession,
} from './core/game-service';
import { purchasePowerup } from './core/economy';
import { syncCommunityFlair } from './core/community-flair';
import {
  getAllTimeTopLevels,
  getAllTimeTopLogic,
  getDailyTop,
  getLevelTop,
  getUserRankSummary,
} from './core/leaderboard';
import { claimQuest, getClaimedQuestIds, getQuestStatus } from './core/quests';
import { shareResultAsComment } from './core/social';
import { getPuzzlePrivate } from './core/puzzle-store';
import { formatDateKey } from './core/serde';
import {
  injectAndPublishManualPuzzle,
  resetAllStoredData,
  rerollAndPublish,
} from './core/admin';
import { getGlobalDailyCalibrationSnapshot } from './core/difficulty-calibration';
import { payments } from '@devvit/web/server';
import {
  getInventory,
  getPurchasedSkus,
  getUserProfile,
  saveInventory,
  saveUserProfile,
} from './core/state';
import {
  getBundlePerks,
  getUsdApproxFromGold,
  isOneTimeOfferSku,
} from '../shared/store';
import { hasAdminAccess } from './core/admin-auth';
import {
  getShareCompletionReceipt,
  markLevelSharedOnce,
} from './core/share-receipts';

const t = initTRPC.context<Context>().create({
  transformer,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const authedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in.',
    });
  }
  return next();
});
export const adminProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const allowed = await hasAdminAccess({
    subredditName: ctx.subredditName,
    username: ctx.username,
  });
  if (!allowed) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Moderator access required.',
    });
  }
  return next();
});

const mapProductDisplayName = (
  product: { name?: string; sku: string; description?: string; price?: { amount?: number } }
) => ({
  sku: product.sku,
  displayName: product.name ?? product.sku,
  description: product.description ?? '',
  price: product.price?.amount ?? 1,
  isOneTime: isOneTimeOfferSku(product.sku),
  usdApprox: getUsdApproxFromGold(product.price?.amount ?? 1),
  perks: getBundlePerks(product.sku),
});

export const appRouter = t.router({
  game: t.router({
    bootstrap: authedProcedure.query(async () => {
      const data = await bootstrapGame();
      return gameBootstrapResponseSchema.parse(data);
    }),
    loadLevel: authedProcedure
      .input(gameLoadLevelInputSchema)
      .query(async ({ input }) => {
        return await loadLevelForUser({
          mode: input.mode,
          requestedLevelId: input.requestedLevelId ?? null,
        });
      }),
    startSession: authedProcedure
      .input(gameStartSessionInputSchema)
      .mutation(async ({ input }) => {
        return await startSessionForLevel(input.levelId, input.mode);
      }),
    submitGuess: authedProcedure
      .input(gameSubmitGuessInputSchema)
      .mutation(async ({ input }) => {
        return await submitGuessForSession({
          levelId: input.levelId,
          tileIndex: input.tileIndex,
          guessedLetter: input.guessedLetter,
        });
      }),
    submitGuesses: authedProcedure
      .input(gameSubmitGuessesInputSchema)
      .mutation(async ({ input }) => {
        const result = await submitGuessesForSession({
          levelId: input.levelId,
          guesses: input.guesses,
        });
        return gameSubmitGuessesResponseSchema.parse(result);
      }),
    completeSession: authedProcedure
      .input(gameCompleteSessionInputSchema)
      .mutation(async ({ input }) => {
        return await completeSessionForLevel({
          levelId: input.levelId,
          mode: input.mode,
        });
      }),
    getCompletionReceipt: authedProcedure
      .input(z.object({ levelId: z.string().min(1) }))
      .query(async ({ input, ctx }) => {
        const receipt = await getShareCompletionReceipt(ctx.userId!, input.levelId);
        return {
          solveSeconds: receipt?.solveSeconds ?? null,
        };
      }),
    getCurrentView: publicProcedure
      .input(z.object({ levelId: z.string().min(1), revealedIndices: z.array(z.number()).optional() }))
      .query(async ({ input }) => {
        return await getCurrentPuzzleView({
          levelId: input.levelId,
          revealedIndices: input.revealedIndices ?? [],
        });
      }),
  }),
  powerup: t.router({
    purchase: authedProcedure
      .input(powerupPurchaseInputSchema)
      .mutation(async ({ input, ctx }) => {
        return await purchasePowerup({
          userId: ctx.userId!,
          itemType: input.itemType,
          quantity: input.quantity,
        });
      }),
    use: authedProcedure
      .input(powerupUseInputSchema)
      .mutation(async ({ input }) => {
        return await usePowerupForSession({
          levelId: input.levelId,
          itemType: input.itemType,
          targetIndex: input.targetIndex ?? null,
        });
      }),
  }),
  leaderboard: t.router({
    getDaily: publicProcedure
      .input(leaderboardGetInputSchema)
      .query(async ({ input }) => {
        const dateKey = input.dateKey ?? formatDateKey(new Date());
        const limit = input.limit ?? 10;
        return {
          entries: await getDailyTop(dateKey, limit),
        };
      }),
    getLevel: publicProcedure
      .input(leaderboardGetLevelInputSchema)
      .query(async ({ input }) => {
        const limit = input.limit ?? 10;
        return {
          entries: await getLevelTop(input.levelId, limit),
        };
      }),
    getAllTime: publicProcedure
      .input(z.object({ limit: z.number().int().positive().max(50).optional() }))
      .query(async ({ input }) => {
        const limit = input.limit ?? 10;
        return {
          levels: await getAllTimeTopLevels(limit),
          logic: await getAllTimeTopLogic(limit),
        };
      }),
    getRankSummary: authedProcedure
      .input(z.object({ dateKey: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const dateKey = input.dateKey ?? formatDateKey(new Date());
        const [summary, profile] = await Promise.all([
          getUserRankSummary({
            userId: ctx.userId!,
            dateKey,
          }),
          getUserProfile(ctx.userId!),
        ]);
        return leaderboardRankSummarySchema.parse({
          dailyRank: summary.dailyRank,
          endlessRank: summary.endlessRank,
          currentRank: summary.currentRank,
          bestOverallRank:
            profile.bestOverallRank > 0 ? profile.bestOverallRank : null,
        });
      }),
  }),
  quests: t.router({
    getStatus: authedProcedure
      .input(z.object({ dateKey: z.string().optional() }))
      .query(async ({ input, ctx }) => {
        const userId = ctx.userId!;
        const dateKey = input.dateKey ?? formatDateKey(new Date());
        const [status, claimedQuestIds] = await Promise.all([
          getQuestStatus({ userId, dateKey }),
          getClaimedQuestIds({ userId, dateKey }),
        ]);
        return {
          dailyDateKey: dateKey,
          progress: {
            ...status.lifetime,
            dailyPlayCount: status.daily.dailyPlayCount,
            dailyFastWin: status.daily.dailyFastWin,
            dailyUnder5Min: status.daily.dailyUnder5Min,
            dailyNoPowerup: status.daily.dailyNoPowerup,
            dailyNoMistake: status.daily.dailyNoMistake,
            dailyShareCount: status.daily.dailyShareCount,
          },
          claimedQuestIds,
        };
      }),
    claim: authedProcedure
      .input(questClaimInputSchema)
      .mutation(async ({ input, ctx }) => {
        const dateKey = formatDateKey(new Date());
        const userId = ctx.userId!;
        const profile = await getUserProfile(userId);
        const inventory = await getInventory(userId);
        const claimed = await claimQuest({
          userId,
          dateKey,
          questId: input.questId,
          profile,
          inventory,
        });
        if (claimed.success) {
          await Promise.all([
            saveUserProfile(userId, claimed.profile),
            saveInventory(userId, claimed.inventory),
          ]);
        }
        return {
          success: claimed.success,
          reason: claimed.reason,
          rewardCoins: claimed.rewardCoins,
          rewardInventory: claimed.inventory,
          profile: claimed.profile,
          inventory: claimed.inventory,
        };
      }),
  }),
  social: t.router({
    shareResult: authedProcedure
      .input(socialShareInputSchema)
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.userId!;
        const puzzle = await getPuzzlePrivate(input.levelId);
        if (!puzzle) {
          return {
            success: false,
            reason: 'Puzzle not found.',
            commentId: null,
          };
        }
        const receipt = await getShareCompletionReceipt(userId, input.levelId);
        if (!receipt) {
          return {
            success: false,
            reason: 'No verified completion found for this level.',
            commentId: null,
          };
        }
        const shared = await shareResultAsComment({
          levelId: input.levelId,
          solveSeconds: receipt.solveSeconds,
          mistakes: receipt.mistakes,
          heartsRemaining: receipt.heartsRemaining,
          usedPowerups: receipt.usedPowerups,
          score: receipt.score ?? null,
        });
        if (shared.success) {
          const firstShareForLevel = await markLevelSharedOnce(userId, input.levelId);
          if (firstShareForLevel) {
            await trackShareQuest({
              levelId: input.levelId,
              dateKey: puzzle.dateKey,
            });
          }
        }
        return shared;
      }),
  }),
  admin: t.router({
    getDifficultyCalibration: adminProcedure.query(async () => {
      const snapshot = await getGlobalDailyCalibrationSnapshot();
      return adminDifficultyCalibrationResponseSchema.parse(snapshot);
    }),
    reroll: adminProcedure.mutation(async () => {
      const reroll = await rerollAndPublish();
      return adminActionResponseSchema.parse({
        success: true,
        message: `Published ${reroll.levelId}`,
        levelId: reroll.levelId,
      });
    }),
    injectManual: adminProcedure
      .input(adminInjectInputSchema)
      .mutation(async ({ input }) => {
        const injected = await injectAndPublishManualPuzzle({
          text: input.text,
          difficulty: input.difficulty,
          challengeType: input.challengeType,
        });
        return adminActionResponseSchema.parse({
          success: true,
          message: `Injected and published ${injected.levelId}`,
          levelId: injected.levelId,
        });
      }),
    resetData: adminProcedure.mutation(async () => {
      const summary = await resetAllStoredData();
      return adminActionResponseSchema.parse({
        success: true,
        message: `Deleted ${summary.deletedKeys} keys`,
        levelId: null,
      });
    }),
  }),
  store: t.router({
    getProducts: authedProcedure.query(async ({ ctx }) => {
      const [result, purchasedSkus] = await Promise.all([
        payments.getProducts(),
        getPurchasedSkus(ctx.userId!),
      ]);
      const normalized = result.products
        .filter(
          (product) =>
            !(isOneTimeOfferSku(product.sku) && purchasedSkus.has(product.sku))
        )
        .map(mapProductDisplayName);
      return storeProductsResponseSchema.parse({
        products: normalized,
      });
    }),
  }),
  profile: t.router({
    setActiveFlair: authedProcedure
      .input(profileSetActiveFlairInputSchema)
      .mutation(async ({ input, ctx }) => {
        const userId = ctx.userId!;
        const profile = await getUserProfile(userId);
        const nextFlair = input.flair.trim();
        if (nextFlair.length > 0 && !profile.unlockedFlairs.includes(nextFlair)) {
          return profileSetActiveFlairResponseSchema.parse({
            success: false,
            reason: 'That flair is not unlocked yet.',
            profile,
          });
        }
        try {
          await syncCommunityFlair({
            subredditName: ctx.subredditName,
            username: ctx.username,
            flair: nextFlair,
          });
        } catch (error) {
          return profileSetActiveFlairResponseSchema.parse({
            success: false,
            reason:
              error instanceof Error && error.message.trim().length > 0
                ? error.message
                : 'Unable to update community flair.',
            profile,
          });
        }
        const updatedProfile = {
          ...profile,
          activeFlair: nextFlair,
        };
        await saveUserProfile(userId, updatedProfile);
        return profileSetActiveFlairResponseSchema.parse({
          success: true,
          reason: null,
          profile: updatedProfile,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
