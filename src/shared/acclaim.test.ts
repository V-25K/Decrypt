import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  ACCLAIM_MIN_QUALIFIED_PLAYS,
  ACCLAIM_MIN_RATIO,
  ACCLAIM_MIN_VOTES,
  acclaimProgress,
  isAcclaimed,
  wilsonLowerBound,
} from './acclaim';

describe('wilsonLowerBound', () => {
  it('returns 0 for an empty sample', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it('is below the raw proportion (it is a lower bound)', () => {
    expect(wilsonLowerBound(80, 100)).toBeLessThan(0.8);
    expect(wilsonLowerBound(80, 100)).toBeGreaterThan(0);
  });

  it('tightens toward the raw proportion as the sample grows', () => {
    const small = wilsonLowerBound(9, 10); // 90% over 10 votes
    const large = wilsonLowerBound(900, 1000); // 90% over 1000 votes
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(0.9);
  });

  it('stays within [0, 1] for arbitrary inputs (property)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100000 }),
        fc.nat({ max: 100000 }),
        (likes, extra) => {
          const total = likes + extra;
          const lb = wilsonLowerBound(likes, total);
          return lb >= 0 && lb <= 1;
        }
      )
    );
  });

  it('is monotonic in likes at a fixed total (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5000 }),
        fc.nat({ max: 5000 }),
        fc.nat({ max: 5000 }),
        (total, a, b) => {
          const likesLow = Math.min(a, b) % (total + 1);
          const likesHigh = Math.max(a, b) % (total + 1);
          if (likesLow > likesHigh) {
            return true;
          }
          return (
            wilsonLowerBound(likesLow, total) <=
            wilsonLowerBound(likesHigh, total) + 1e-9
          );
        }
      )
    );
  });
});

describe('isAcclaimed', () => {
  it('rejects a small-sample 100% (the anti-gaming case)', () => {
    // 3 likes, 0 dislikes, tons of plays — must NOT qualify (votes < min).
    expect(
      isAcclaimed({ qualifiedPlays: 999, likes: 3, dislikes: 0 })
    ).toBe(false);
  });

  it('rejects when plays are below the floor even with great votes', () => {
    expect(
      isAcclaimed({ qualifiedPlays: 199, likes: 100, dislikes: 2 })
    ).toBe(false);
  });

  it('rejects when the like ratio lower bound is too low', () => {
    // 60 likes / 40 dislikes = 60% raw; lower bound well under 0.70.
    expect(
      isAcclaimed({ qualifiedPlays: 500, likes: 60, dislikes: 40 })
    ).toBe(false);
  });

  it('accepts a clearly-loved, well-played challenge', () => {
    expect(
      isAcclaimed({ qualifiedPlays: 300, likes: 180, dislikes: 20 })
    ).toBe(true);
  });

  it('honours every threshold constant exactly at the boundary', () => {
    // Construct a vote set whose Wilson lower bound clears 0.70 with the
    // minimum votes, at exactly the play floor.
    const likes = 25;
    const dislikes = 0;
    expect(wilsonLowerBound(likes, likes + dislikes)).toBeGreaterThanOrEqual(
      ACCLAIM_MIN_RATIO
    );
    expect(likes + dislikes).toBeGreaterThanOrEqual(ACCLAIM_MIN_VOTES);
    expect(
      isAcclaimed({
        qualifiedPlays: ACCLAIM_MIN_QUALIFIED_PLAYS,
        likes,
        dislikes,
      })
    ).toBe(true);
  });
});

describe('acclaimProgress', () => {
  it('reports remaining plays and votes for an in-progress challenge', () => {
    const progress = acclaimProgress({
      qualifiedPlays: 142,
      likes: 12,
      dislikes: 2,
    });
    expect(progress.playsToGo).toBe(ACCLAIM_MIN_QUALIFIED_PLAYS - 142);
    expect(progress.votesToGo).toBe(ACCLAIM_MIN_VOTES - 14);
    expect(progress.totalVotes).toBe(14);
    expect(progress.likeRatio).toBeCloseTo(12 / 14, 5);
    expect(progress.met).toBe(false);
  });

  it('reports met=true and zero remaining once acclaimed', () => {
    const progress = acclaimProgress({
      qualifiedPlays: 300,
      likes: 180,
      dislikes: 20,
    });
    expect(progress.met).toBe(true);
    expect(progress.playsToGo).toBe(0);
    expect(progress.votesToGo).toBe(0);
  });

  it('handles the zero-vote case without dividing by zero', () => {
    const progress = acclaimProgress({
      qualifiedPlays: 0,
      likes: 0,
      dislikes: 0,
    });
    expect(progress.likeRatio).toBe(0);
    expect(progress.ratioLowerBound).toBe(0);
    expect(progress.met).toBe(false);
  });
});
