import { describe, expect, it } from 'vitest';
import { applyFittedLayoutToBasePuzzle } from './board-layout';
import { validateQuoteForPhase1, type DifficultyTier } from './content';
import { buildPuzzle } from './puzzle';
import { runDummySolver } from './dummy-solver';
import { solverBandForTier } from './solver-thresholds';
import {
  fitBoardToTier,
  maxRevealsForFit,
  representativeDifficultyForTier,
  tierFitLayoutVersion,
} from './tier-fitter';
import { validatePuzzle } from './validation';

const allTiers: DifficultyTier[] = ['warmup', 'medium', 'hard', 'expert'];

const fitParams = (text: string, tier: DifficultyTier) => ({
  text,
  tier,
  dateKey: '2026-06-10',
  author: 'Tester',
  challengeType: 'QUOTE' as const,
  logicalPercent: 10,
});

// Real-quote-style corpus: varied length and letter variety.
const corpus = [
  'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
  'TO BE OR NOT TO BE THAT IS THE QUESTION',
  'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO',
  'JUDGE EACH DAY BY THE SEEDS THAT YOU PLANT NOT THE HARVEST YOU REAP',
];

describe('fitBoardToTier', () => {
  it('fits a complex line to an easy board that the legacy tier gate rejects', () => {
    const pangram = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG';
    // The legacy phase-1 gate refuses this line at easy ("too complex for
    // easy") — the exact dead-end the fitter exists to remove.
    expect(validateQuoteForPhase1(pangram, 2).valid).toBe(false);

    const outcome = fitBoardToTier(fitParams(pangram, 'warmup'));
    expect(outcome.fitted).toBe(true);
    if (!outcome.fitted) {
      return;
    }
    const band = solverBandForTier('warmup');
    expect(outcome.summary.solverRatio).toBeGreaterThanOrEqual(band.floor);
    expect(validatePuzzle(outcome.puzzlePrivate).valid).toBe(true);
  });

  it('reports honest impossibility for expert on a simple line', () => {
    const outcome = fitBoardToTier(
      fitParams('TO BE OR NOT TO BE THAT IS THE QUESTION', 'expert')
    );
    expect(outcome.fitted).toBe(false);
    if (outcome.fitted) {
      return;
    }
    expect(outcome.reasonCode).toBe('TOO_SIMPLE_FOR_TIER');
    expect(outcome.detail).toContain('Expert');
    expect(outcome.detail).toContain('letters');
  });

  it('rejects structurally invalid text with TEXT_INVALID', () => {
    const outcome = fitBoardToTier(fitParams('SHORT', 'medium'));
    expect(outcome.fitted).toBe(false);
    if (outcome.fitted) {
      return;
    }
    expect(outcome.reasonCode).toBe('TEXT_INVALID');
    expect(outcome.detail.length).toBeGreaterThan(0);
  });

  // 8 full fits: generous timeout for CI/full-suite CPU contention.
  it('is deterministic: same input produces the identical layout', { timeout: 30_000 }, () => {
    for (const tier of allTiers) {
      const first = fitBoardToTier(fitParams(corpus[3] ?? '', tier));
      const second = fitBoardToTier(fitParams(corpus[3] ?? '', tier));
      expect(second.fitted).toBe(first.fitted);
      if (first.fitted && second.fitted) {
        // createdAt is a wall-clock timestamp; the layout is the contract.
        expect(second.layout).toEqual(first.layout);
        expect(second.summary).toEqual(first.summary);
      }
    }
  });

  // 16 full fits: generous timeout for CI/full-suite CPU contention.
  it('produces valid boards inside the tier band across the corpus', { timeout: 30_000 }, () => {
    let fittedCount = 0;
    for (const text of corpus) {
      for (const tier of allTiers) {
        const outcome = fitBoardToTier(fitParams(text, tier));
        if (!outcome.fitted) {
          // Infeasible tiers must explain themselves.
          expect(outcome.detail.length).toBeGreaterThan(0);
          continue;
        }
        fittedCount += 1;
        const band = solverBandForTier(tier);
        expect(outcome.summary.solverRatio).toBeGreaterThanOrEqual(band.floor);
        expect(validatePuzzle(outcome.puzzlePrivate).valid).toBe(true);
        expect(outcome.layout.layoutVersion).toBe(tierFitLayoutVersion);
        expect(outcome.layout.prefilledIndices.length).toBeLessThanOrEqual(
          maxRevealsForFit(
            tier,
            new Set(text.replace(/[^A-Z]/g, '').split('')).size
          )
        );
        expect(outcome.layout.prefilledIndices).toEqual(
          [...outcome.puzzlePrivate.prefilledIndices].sort((a, b) => a - b)
        );
      }
    }
    // The corpus must exercise the success path broadly, not vacuously.
    expect(fittedCount).toBeGreaterThanOrEqual(10);
  });

  it('never pre-rejects easy or medium for being too complex', () => {
    for (const text of corpus) {
      for (const tier of ['warmup', 'medium'] as const) {
        const outcome = fitBoardToTier(fitParams(text, tier));
        if (!outcome.fitted) {
          expect(outcome.reasonCode).not.toBe('TOO_SIMPLE_FOR_TIER');
        }
      }
    }
  });
});

describe('applyFittedLayoutToBasePuzzle', () => {
  it('reproduces the fitted board on a fresh base with a different level id', () => {
    const text = 'JUDGE EACH DAY BY THE SEEDS THAT YOU PLANT NOT THE HARVEST YOU REAP';
    const tier: DifficultyTier = 'medium';
    const outcome = fitBoardToTier(fitParams(text, tier));
    expect(outcome.fitted).toBe(true);
    if (!outcome.fitted) {
      return;
    }

    // Publish-time conditions: real level id, different seed, fresh mapping.
    const base = buildPuzzle({
      levelId: 'lvl_9999',
      dateKey: '2026-07-01',
      text,
      author: 'Tester',
      challengeType: 'QUOTE',
      source: 'COMMUNITY',
      difficulty: representativeDifficultyForTier(tier),
      logicalPercent: 10,
      previousMapping: null,
      skipSolvabilityCheck: true,
      applyObstructionsOnSkip: false,
    }).puzzlePrivate;

    const applied = applyFittedLayoutToBasePuzzle({
      basePuzzle: base,
      layout: outcome.layout,
    });

    expect(applied.prefilledIndices).toEqual(outcome.layout.prefilledIndices);
    expect(applied.blindIndices).toEqual(outcome.layout.blindIndices);
    expect(applied.padlockChains).toEqual(outcome.layout.padlockChains);
    expect(applied.goldIndex).toBe(outcome.layout.goldIndex);
    expect(validatePuzzle(applied).valid).toBe(true);

    // The published board must still clear the tier's fairness floor.
    const band = solverBandForTier(tier);
    const solver = runDummySolver({
      puzzle: applied,
      revealedIndices: applied.prefilledIndices,
      requiredSolveRatio: band.floor,
      solverProfile: 'standard',
      maxSearchMs: 250,
      maxBranchExpansions: 1200,
    });
    expect(solver.solvable).toBe(true);
    expect(solver.blindGuessRequired).toBe(false);
    expect(solver.solvedRatio).toBeGreaterThanOrEqual(band.floor);
  });
});
