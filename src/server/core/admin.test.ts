import { describe, expect, it } from 'vitest';
import {
  validateManualChallenge,
  injectManualChallengeWithAdjustment,
  type ManualChallengeValidationResult,
  type ManualChallengeResult,
} from './admin';

describe('Manual Challenge Validation and Feedback', () => {
  describe('validateManualChallenge', () => {
    it('should validate warmup text for warmup difficulty', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'TO BE OR NOT TO BE',
        difficulty: 2,
      });

      expect(result.valid).toBe(true);
      expect(result.textProfile).toBeDefined();
      expect(['warmup', 'medium']).toContain(result.naturalDifficulty);
      expect(result.achievableTierRange).toContain('warmup');
      expect(result.reasons).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should validate medium text for medium difficulty', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
        difficulty: 5,
      });

      expect(result.valid).toBe(true);
      expect(result.textProfile).toBeDefined();
      expect(result.achievableTierRange.length).toBeGreaterThan(0);
      expect(result.reasons).toHaveLength(0);
    });

    it('should reject text that is too short', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'HI',
        difficulty: 2,
      });

      expect(result.valid).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
      expect(result.reasons.some((reason) => reason.includes('too short'))).toBe(true);
    });

    it('should provide feedback for unreachable difficulty', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        difficulty: 1, // Easy difficulty with very hard text
      });

      expect(result.valid).toBe(false);
      expect(result.textProfile.cryptoHardness).toBeGreaterThan(0.6);
      expect(result.naturalDifficulty).toBe('expert');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should report unreachable target tiers instead of raw target-tier phase1 failure', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'TO BE OR NOT TO BE',
        difficulty: 9,
      });

      expect(result.valid).toBe(false);
      expect(result.achievableTierRange).not.toContain('expert');
      expect(
        result.reasons.some((reason) => reason.includes('Target tier expert not achievable'))
      ).toBe(true);
    });

    it('should compute achievable tier range correctly', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'NEVER SETTLE FOR LESS THAN YOUR BEST',
        difficulty: 5,
      });

      expect(result.achievableTierRange).toBeDefined();
      expect(result.achievableTierRange.length).toBeGreaterThan(0);
    });
  });

  describe('Helper Functions', () => {
    it('should infer natural difficulty tier from the best-fit text profile', async () => {
      const easyResult = await validateManualChallenge({
        text: 'TO BE OR NOT TO BE',
        difficulty: 2,
      });
      expect(['warmup', 'medium']).toContain(easyResult.naturalDifficulty);

      const hardResult = await validateManualChallenge({
        text: 'BOLD THINKERS NAVIGATE UNCERTAIN WORLDS',
        difficulty: 9,
      });
      expect(['hard', 'expert']).toContain(hardResult.naturalDifficulty);
    });

    it('should generate suggestions for text modification', async () => {
      const result = await validateManualChallenge({
        text: 'WHY JOT FLUX VEX BRIM', // High hardness text
        difficulty: 1, // Trying to make it warmup
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.includes('hardness'))).toBe(true);
    });
  });

  describe('injectManualChallengeWithAdjustment', () => {
    it('rejects invalid authors before attempting injection work', async () => {
      const result: ManualChallengeResult = await injectManualChallengeWithAdjustment({
        text: 'TO BE OR NOT TO BE',
        author: '!!!',
        targetDifficulty: 5,
        challengeType: 'QUOTE',
        allowAdjustment: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid author');
    });
  });
});
