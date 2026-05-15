import { describe, expect, it } from 'vitest';
import { checkLineAgainstCorpusEntries } from './line-checker';

const corpusEntries = [
  {
    levelId: 'manual_0001',
    challengeType: 'SAYING',
    sourceKind: 'manual_registry' as const,
    sourceLabel: 'test-registry',
    targetText: 'LOOK BEFORE YOU LEAP.',
    author: 'TRADITIONAL',
    normalizedSignature: 'LOOKBEFOREYOULEAP',
    tokenSignature: 'LOOK BEFORE YOU LEAP',
  },
];

describe('line checker', () => {
  it('finds exact signature matches', () => {
    const result = checkLineAgainstCorpusEntries('LOOK BEFORE YOU LEAP.', corpusEntries);

    expect(result.status).toBe('exact_match');
    expect(result.reason).toBe('exact signature match');
    expect(result.matchedEntry?.levelId).toBe('manual_0001');
  });

  it('finds near duplicates using the same token similarity rules', () => {
    const result = checkLineAgainstCorpusEntries('LOOK BEFORE YOU LEAP NOW', corpusEntries);

    expect(result.status).toBe('near_duplicate');
    expect(result.reason).toBe('substring/prefix duplicate');
    expect(result.matchedEntry?.levelId).toBe('manual_0001');
  });

  it('returns clear for unrelated lines', () => {
    const result = checkLineAgainstCorpusEntries('ZEBRAS JUGGLE QUIET NEBULAS', corpusEntries);

    expect(result.status).toBe('clear');
    expect(result.matchedEntry).toBeNull();
  });
});
