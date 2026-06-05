import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  validateManualChallenge,
  injectManualChallengeWithAdjustment,
  type ManualChallengeValidationResult,
  type ManualChallengeResult,
} from './admin';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Manual Challenge Validation and Feedback', () => {
  describe('validateManualChallenge', () => {
    it('should validate warmup text for warmup difficulty', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'TO BE OR NOT TO BE AGAIN',
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

    it('treats an unreachable preference as a recommendation problem, not a validity failure', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'THE LIGHT WILL FALL PREY TO DARKNESS',
        difficulty: 2, // Warmup preference for a harder quote
      });

      expect(result.valid).toBe(true);
      expect(result.textProfile.cryptoHardness).toBeGreaterThan(0.5);
      expect(['medium', 'hard']).toContain(result.naturalDifficulty);
      expect(result.achievableTierRange).not.toContain('warmup');
      expect(result.suggestions).toHaveLength(0);
    });

    it('returns the achievable range even when the preferred tier is outside it', async () => {
      const result: ManualChallengeValidationResult = await validateManualChallenge({
        text: 'TO BE OR NOT TO BE AGAIN',
        difficulty: 9,
      });

      expect(result.valid).toBe(true);
      expect(result.achievableTierRange).not.toContain('expert');
      expect(result.reasons).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
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
        text: 'TO BE OR NOT TO BE AGAIN',
        difficulty: 2,
      });
      expect(['warmup', 'medium']).toContain(easyResult.naturalDifficulty);

      const hardResult = await validateManualChallenge({
        text: 'BOLD THINKERS NAVIGATE UNCERTAIN WORLDS',
        difficulty: 9,
      });
      expect(['hard', 'expert']).toContain(hardResult.naturalDifficulty);
    });

	    it('should generate suggestions for text that fits no supported tier', async () => {
	      const result = await validateManualChallenge({
	        text: 'ABCDEFG HIJKL MNOPQ RSTUV WXYZ',
	        difficulty: 1,
	      });

	      expect(result.valid).toBe(false);
	      expect(result.suggestions.length).toBeGreaterThan(0);
	    });
  });

  describe('injectManualChallengeWithAdjustment', () => {
    it('rejects invalid authors before attempting injection work', async () => {
      const result: ManualChallengeResult = await injectManualChallengeWithAdjustment({
        text: 'TO BE OR NOT TO BE AGAIN',
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
