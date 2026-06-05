/**
 * Unified validation pipeline for challenge verification.
 * 
 * This module provides a consistent validation interface used by both
 * AI-generated and manual challenge paths to ensure identical validation
 * rules across all challenge sources.
 * 
 * The pipeline enforces:
 * - Phase 1 validation (text-only) before puzzle building
 * - Duplicate detection using the same rules
 * - Phase 2 validation (final puzzle) after building
 * - Consistent hardness bounds across both paths
 */

import type { PuzzlePrivate } from '../../shared/game.ts';
import { dedupSignatureLookback } from '../../shared/puzzle-limits.ts';
import type { HardnessBoundsByTier } from './content.ts';
import {
  validateQuoteForPhase1,
  normalizeContent,
  contentTokenSignature,
  isNearDuplicateSignature,
} from './content.ts';
import { validatePuzzle } from './validation.ts';
import { getRecentUsedSignatureEntries } from './puzzle-store.ts';

/**
 * Result of Phase 1 validation (text-only)
 */
export type Phase1ValidationResult = {
  valid: boolean;
  reasons: string[];
};

/**
 * Result of Phase 2 validation (final puzzle)
 */
export type Phase2ValidationResult = {
  valid: boolean;
  reasons: string[];
};

/**
 * Result of duplicate detection check
 */
export type DuplicateCheckResult = {
  duplicate: boolean;
  reason?: string;
  normalizedSignature: string;
  tokenSignature: string;
};

/**
 * Unified validation pipeline interface
 */
export type ValidationPipeline = {
  /**
   * Phase 1: Validate text suitability before puzzle building
   * Checks: length, letter variety, word count, hardness bounds
   */
  phase1: (text: string, difficulty: number) => Phase1ValidationResult;

  /**
   * Phase 2: Validate final puzzle after building
   * Checks: starter clues, padlock fairness, blind tile fairness
   */
  phase2: (puzzle: PuzzlePrivate) => Phase2ValidationResult;

  /**
   * Duplicate detection: Check if text is too similar to recent challenges
   * Checks: normalized signature, token signature, endless reservations
   */
  // Self-exclusion needs signature history to store owner level IDs first.
  duplicate: (text: string) => Promise<DuplicateCheckResult>;
};

/**
 * Creates a validation pipeline with consistent hardness bounds.
 * 
 * @param hardnessBoundsByTier - Optional calibrated hardness bounds for each tier
 * @returns ValidationPipeline instance with bound validation functions
 * 
 * @example
 * ```typescript
 * const bounds = await computeAdaptiveHardnessBounds();
 * const pipeline = createValidationPipeline(bounds);
 * 
 * // Phase 1 validation
 * const phase1 = pipeline.phase1(text, difficulty);
 * if (!phase1.valid) {
 *   console.error('Phase 1 failed:', phase1.reasons);
 *   return;
 * }
 * 
 * // Duplicate check
 * const dup = await pipeline.duplicate(text);
 * if (dup.duplicate) {
 *   console.error('Duplicate detected:', dup.reason);
 *   return;
 * }
 * 
 * // Build puzzle...
 * const puzzle = buildPuzzle({ ... });
 * 
 * // Phase 2 validation
 * const phase2 = pipeline.phase2(puzzle.puzzlePrivate);
 * if (!phase2.valid) {
 *   console.error('Phase 2 failed:', phase2.reasons);
 *   return;
 * }
 * ```
 */
export const createValidationPipeline = (
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>
): ValidationPipeline => {
  return {
    phase1: (text: string, difficulty: number): Phase1ValidationResult => {
      return validateQuoteForPhase1(text, difficulty, hardnessBoundsByTier);
    },

    phase2: (puzzle: PuzzlePrivate): Phase2ValidationResult => {
      return validatePuzzle(puzzle);
    },

    duplicate: async (text: string): Promise<DuplicateCheckResult> => {
      const normalizedSignature = normalizeContent(text);
      const tokenSignature = contentTokenSignature(text);

      if (!normalizedSignature) {
        return {
          duplicate: true,
          reason: 'empty signature',
          normalizedSignature: '',
          tokenSignature,
        };
      }

      const recentSignatureEntries = await getRecentUsedSignatureEntries(
        dedupSignatureLookback
      );
      const nearDuplicate = isNearDuplicateSignature({
        candidateNormalizedSignature: normalizedSignature,
        candidateTokenSignature: tokenSignature,
        recent: recentSignatureEntries,
      });

      if (nearDuplicate.duplicate) {
        return {
          duplicate: true,
          reason: nearDuplicate.reason ?? 'near duplicate',
          normalizedSignature,
          tokenSignature,
        };
      }

      return {
        duplicate: false,
        normalizedSignature,
        tokenSignature,
      };
    },
  };
};
