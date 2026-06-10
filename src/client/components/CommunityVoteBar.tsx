import { useEffect, useState } from 'react';
import { showToast } from '@devvit/web/client';
import { trpc } from '../trpc';
import { cn } from '../utils';
import { applyOptimisticVote, type VoteState } from './community-vote-logic';

// Result-screen like/dislike for community challenges. Self-hides for daily
// puzzles and for the creator's own challenge, so it can be rendered
// unconditionally on both the win and loss outcomes.
export const CommunityVoteBar = ({ levelId }: { levelId: string | null }) => {
  const [state, setState] = useState<VoteState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setState(null);
    if (!levelId) {
      return;
    }
    let cancelled = false;
    // Wrapped so neither a synchronous access error nor an async rejection can
    // escape into the result-screen render — this widget must never blank the
    // outcome overlay (it just stays hidden if vote state can't be loaded).
    void (async () => {
      try {
        const result = await trpc.community.getVoteState.query({ levelId });
        if (!cancelled) {
          setState(result);
        }
      } catch {
        // ignore — leave the bar hidden
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [levelId]);

  if (!levelId || !state || !state.isCommunity || state.isOwnChallenge) {
    return null;
  }

  const castVote = async (choice: 'like' | 'dislike') => {
    if (busy) {
      return;
    }
    const desired = state.myVote === choice ? 'clear' : choice;
    setBusy(true);
    setState((prev) => (prev ? applyOptimisticVote(prev, desired) : prev));
    try {
      const result = await trpc.community.vote.mutate({ levelId, vote: desired });
      setState((prev) => (prev ? { ...prev, ...result } : prev));
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not save your vote.'
      );
      // Re-sync from the server on failure so the UI never drifts.
      void trpc.community.getVoteState
        .query({ levelId })
        .then((fresh) => setState(fresh))
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="pointer-events-auto mt-3 flex items-center justify-center gap-2"
      data-testid="community-vote-bar"
    >
      <span className="text-[10px] font-black uppercase tracking-[0.04em] text-white/80">
        Rate this challenge
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void castVote('like');
        }}
        disabled={busy}
        className={cn(
          'btn-3d btn-round flex h-11 w-11 items-center justify-center text-lg',
          state.myVote === 'like' ? 'btn-primary' : 'btn-neutral'
        )}
        aria-label="Like this challenge"
        aria-pressed={state.myVote === 'like'}
        data-testid="community-vote-like"
      >
        👍
      </button>
      <span className="min-w-5 text-center text-xs font-black tabular-nums text-white">
        {state.likes}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void castVote('dislike');
        }}
        disabled={busy}
        className={cn(
          'btn-3d btn-round flex h-11 w-11 items-center justify-center text-lg',
          state.myVote === 'dislike' ? 'btn-retry' : 'btn-neutral'
        )}
        aria-label="Dislike this challenge"
        aria-pressed={state.myVote === 'dislike'}
        data-testid="community-vote-dislike"
      >
        👎
      </button>
      <span className="min-w-5 text-center text-xs font-black tabular-nums text-white">
        {state.dislikes}
      </span>
    </div>
  );
};
