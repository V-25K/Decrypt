import { describe, expect, it } from 'vitest';
import { solverLexicon } from './solver-lexicon';

describe('solverLexicon', () => {
  it('includes letters-only forms of common contractions', () => {
    expect(solverLexicon).toEqual(
      expect.arrayContaining([
        'CANT',
        'DONT',
        'WONT',
        'THATS',
        'THERES',
        'ISNT',
        'WOULDNT',
        'SHOULDNT',
      ])
    );
  });

  it('includes longer quote vocabulary from the app-owned expansion list', () => {
    expect(solverLexicon).toEqual(
      expect.arrayContaining([
        'OPPORTUNITY',
        'PERSISTENCE',
        'SOVEREIGNTY',
      ])
    );
  });
});
