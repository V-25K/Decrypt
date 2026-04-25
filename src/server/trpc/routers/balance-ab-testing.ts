/**
 * Balance A/B Testing TRPC Router
 * 
 * Provides endpoints for managing and monitoring balance A/B tests
 */

import { z } from 'zod';
import { router } from '../base';
import { authedProcedure, publicProcedure } from '../procedures';
import { 
  balanceABTestingConfig,
  getBalanceTestResults,
  getBalanceTestStatus
} from '../../core/balance-ab-testing-config';
import { 
  balanceSystemFactory,
  recordUserBalanceMetrics
} from '../../core/balance-ab-testing-integration';

// Input schemas
const recordMetricsInputSchema = z.object({
  type: z.enum(['retry', 'completion', 'powerup', 'penalty']),
  data: z.record(z.any())
});

const getUserBalanceConfigInputSchema = z.object({
  userId: z.string().optional()
});

// Output schemas
const balanceConfigOutputSchema = z.object({
  variant: z.string().nullable(),
  testName: z.string(),
  isControl: z.boolean(),
  isTreatment: z.boolean(),
  config: z.record(z.any()).nullable()
});

const testResultsOutputSchema = z.object({
  mainTest: z.object({
    variants: z.record(z.object({
      mean: z.number(),
      count: z.number(),
      stdDev: z.number()
    })),
    pValue: z.number(),
    significant: z.boolean()
  }),
  individualTests: z.record(z.any()),
  recommendations: z.array(z.string())
});

const testStatusOutputSchema = z.object({
  activeTests: z.array(z.string()),
  userDistribution: z.record(z.object({
    control: z.number(),
    treatment: z.number()
  })),
  totalUsers: z.number()
});

export const balanceABTestingRouter = router({
  /**
   * Get balance configuration for the current user
   */
  getUserBalanceConfig: authedProcedure
    .output(balanceConfigOutputSchema)
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const { config, variant, testName } = balanceABTestingConfig.getBalanceConfigForUser(userId);
      const testInfo = balanceSystemFactory.getUserTestInfo(userId);

      return {
        variant: testInfo.variant,
        testName: testInfo.testName,
        isControl: testInfo.isControl,
        isTreatment: testInfo.isTreatment,
        config
      };
    }),

  /**
   * Get balance configuration for a specific user (admin only)
   */
  getBalanceConfigForUser: authedProcedure
    .input(getUserBalanceConfigInputSchema)
    .output(balanceConfigOutputSchema)
    .query(async ({ input, ctx }) => {
      const userId = input.userId || ctx.userId!;
      const { config, variant, testName } = balanceABTestingConfig.getBalanceConfigForUser(userId);
      const testInfo = balanceSystemFactory.getUserTestInfo(userId);

      return {
        variant: testInfo.variant,
        testName: testInfo.testName,
        isControl: testInfo.isControl,
        isTreatment: testInfo.isTreatment,
        config
      };
    }),

  /**
   * Record balance metrics for A/B test analysis
   */
  recordBalanceMetrics: authedProcedure
    .input(recordMetricsInputSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      recordUserBalanceMetrics(userId, input.type, input.data);
      
      return { success: true };
    }),

  /**
   * Get A/B test results and statistical analysis
   */
  getTestResults: publicProcedure
    .output(testResultsOutputSchema)
    .query(async () => {
      return await getBalanceTestResults();
    }),

  /**
   * Get current test status and user distribution
   */
  getTestStatus: publicProcedure
    .output(testStatusOutputSchema)
    .query(async () => {
      return getBalanceTestStatus();
    }),

  /**
   * Get balance systems configured for the current user
   */
  getUserBalanceSystems: authedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const systems = balanceSystemFactory;

      // Get current configurations for the user
      const retryCostCalculator = systems.getRetryCostCalculator(userId);
      const scorePenaltyEngine = systems.getScorePenaltyEngine(userId);
      const fastSolveBonusSystem = systems.getFastSolveBonusSystem(userId);
      const powerupPricingEngine = systems.getPowerupPricingEngine(userId);

      return {
        retryConfig: {
          maxCostCoins: (retryCostCalculator as any).config?.maxCostCoins || 140,
          scalingType: (retryCostCalculator as any).config?.scalingType || 'linear',
          difficultyMultiplier: (retryCostCalculator as any).config?.difficultyMultiplier || 1.2
        },
        scoringConfig: {
          maxPenaltyPercent: (scorePenaltyEngine as any).config?.maxPenaltyPercent || 25,
          penaltyType: (scorePenaltyEngine as any).config?.penaltyType || 'logarithmic',
          firstRetryFree: (scorePenaltyEngine as any).config?.firstRetryFree || true
        },
        fastSolveConfig: {
          thresholdSeconds: (fastSolveBonusSystem as any).config?.thresholdSeconds || 30,
          bonusPercent: (fastSolveBonusSystem as any).config?.bonusPercent || 50,
          difficultyScaling: (fastSolveBonusSystem as any).config?.difficultyScaling || true
        },
        powerupConfig: {
          rocketCostMultiplier: (powerupPricingEngine as any).config?.rocketCostMultiplier || 2.0,
          valuePerCoinRatios: (powerupPricingEngine as any).config?.valuePerCoinRatios || {
            hammer: 1.0,
            wand: 0.35,
            shield: 0.27,
            rocket: 0.5
          }
        }
      };
    }),

  /**
   * Calculate retry cost for current user's configuration
   */
  calculateRetryCost: authedProcedure
    .input(z.object({
      retryNumber: z.number().int().min(1),
      difficulty: z.number().min(1).max(5),
      baseCost: z.number().min(1)
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const calculator = balanceSystemFactory.getRetryCostCalculator(userId);
      
      const cost = calculator.calculateRetryCost(
        input.retryNumber,
        input.difficulty,
        input.baseCost
      );

      return { cost };
    }),

  /**
   * Calculate score penalty for current user's configuration
   */
  calculateScorePenalty: authedProcedure
    .input(z.object({
      retryNumber: z.number().int().min(1),
      originalScore: z.number().min(0)
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const engine = balanceSystemFactory.getScorePenaltyEngine(userId);
      
      const penalty = engine.calculatePenalty(input.retryNumber, input.originalScore);

      return { 
        penaltyPercent: penalty.penaltyPercent,
        penaltyAmount: penalty.penaltyAmount,
        finalScore: penalty.finalScore
      };
    }),

  /**
   * Calculate fast solve bonus for current user's configuration
   */
  calculateFastSolveBonus: authedProcedure
    .input(z.object({
      solveTimeSeconds: z.number().min(0),
      difficulty: z.number().min(1).max(5),
      baseScore: z.number().min(0)
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const system = balanceSystemFactory.getFastSolveBonusSystem(userId);
      
      const bonus = system.calculateBonus(
        input.solveTimeSeconds,
        input.difficulty,
        input.baseScore
      );

      return {
        eligible: bonus.eligible,
        bonusPercent: bonus.bonusPercent,
        bonusAmount: bonus.bonusAmount,
        finalScore: bonus.finalScore,
        threshold: bonus.threshold
      };
    }),

  /**
   * Calculate powerup cost for current user's configuration
   */
  calculatePowerupCost: authedProcedure
    .input(z.object({
      powerupType: z.enum(['hammer', 'wand', 'shield', 'rocket']),
      difficulty: z.number().min(1).max(5),
      remainingLetters: z.number().min(0)
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const engine = balanceSystemFactory.getPowerupPricingEngine(userId);
      
      const cost = engine.calculatePowerupCost(
        input.powerupType,
        input.difficulty,
        input.remainingLetters
      );

      return { cost };
    })
});