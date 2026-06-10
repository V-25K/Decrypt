import { describe, expect, it } from 'vitest';
import { applyOptimisticVote } from './community-vote-logic';

const base = {
  isCommunity: true as const,
  isOwnChallenge: false as const,
  likes: 10,
  dislikes: 4,
  myVote: null as 'like' | 'dislike' | null,
};

describe('applyOptimisticVote', () => {
  it('adds a like when the viewer had no vote', () => {
    const next = applyOptimisticVote(base, 'like');
    expect(next).toMatchObject({ likes: 11, dislikes: 4, myVote: 'like' });
  });

  it('switches a like to a dislike without double counting', () => {
    const liked = { ...base, likes: 11, myVote: 'like' as const };
    const next = applyOptimisticVote(liked, 'dislike');
    expect(next).toMatchObject({ likes: 10, dislikes: 5, myVote: 'dislike' });
  });

  it('clears an existing like (toggle off)', () => {
    const liked = { ...base, likes: 11, myVote: 'like' as const };
    const next = applyOptimisticVote(liked, 'clear');
    expect(next).toMatchObject({ likes: 10, dislikes: 4, myVote: null });
  });

  it('never produces negative counts', () => {
    const empty = { ...base, likes: 0, dislikes: 0, myVote: 'like' as const };
    const next = applyOptimisticVote(empty, 'clear');
    expect(next.likes).toBe(0);
    expect(next.dislikes).toBe(0);
    expect(next.myVote).toBeNull();
  });
});
