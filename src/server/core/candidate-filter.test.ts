import { describe, expect, it } from 'vitest';
import { filterCandidateBatch } from './candidate-filter';
import { contentTokenSignature, normalizeContent } from './content';

const acceptingPipeline = {
  phase1: () => ({
    valid: true,
    reasons: [],
  }),
  phase2: () => ({
    valid: true,
    reasons: [],
  }),
  duplicate: async () => ({
    duplicate: false,
    normalizedSignature: '',
    tokenSignature: '',
  }),
};

describe('filterCandidateBatch', () => {
  it('removes near-duplicate survivors within the same batch before build attempts', () => {
    const result = filterCandidateBatch({
      candidates: [
        {
          text: 'ACTIONS SPEAK LOUDER THAN WORDS',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
        },
        {
          text: 'ACTIONS SPEAK LOUDER THAN WORDS DO',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
        },
      ],
      preferredType: 'QUOTE',
      difficulty: 5,
      pipeline: acceptingPipeline,
      recentSignatureEntries: [],
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.text).toBe('ACTIONS SPEAK LOUDER THAN WORDS');
    expect(result.decisions[1]).toMatchObject({
      accepted: false,
      reason: expect.stringContaining('duplicate within batch'),
    });
  });

  it('rejects candidates that already match the recent signature ledger', () => {
    const result = filterCandidateBatch({
      candidates: [
        {
          text: 'ACTION SPEAKS LOUDER',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
        },
      ],
      preferredType: 'QUOTE',
      difficulty: 5,
      pipeline: acceptingPipeline,
      recentSignatureEntries: [
        {
          normalizedSignature: normalizeContent('ACTION SPEAKS LOUDER THAN WORDS'),
          tokenSignature: contentTokenSignature('ACTION SPEAKS LOUDER THAN WORDS'),
        },
      ],
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.decisions[0]).toMatchObject({
      accepted: false,
      reason: 'substring/prefix duplicate',
    });
  });

  it('keeps challenge type matching strict by default', () => {
    const result = filterCandidateBatch({
      candidates: [
        {
          text: 'FORTUNE FAVORS THE BOLD',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
        },
      ],
      preferredType: 'PROVERB',
      difficulty: 5,
      pipeline: acceptingPipeline,
      recentSignatureEntries: [],
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.decisions[0]).toMatchObject({
      accepted: false,
      reason: 'challenge type mismatch (expected PROVERB got QUOTE)',
    });
  });

  it('accepts close challenge type fallbacks when explicitly allowed', () => {
    const result = filterCandidateBatch({
      candidates: [
        {
          text: 'FORTUNE FAVORS THE BOLD',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
        },
      ],
      preferredType: 'PROVERB',
      difficulty: 5,
      pipeline: acceptingPipeline,
      recentSignatureEntries: [],
      allowChallengeTypeFallback: true,
    });

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.challengeType).toBe('QUOTE');
  });
});
