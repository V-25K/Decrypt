export type ResolvedVote = 'like' | 'dislike' | null;

export type VoteState = {
  isCommunity: boolean;
  isOwnChallenge: boolean;
  likes: number;
  dislikes: number;
  myVote: ResolvedVote;
};

// Optimistic local update of the like/dislike counts when the viewer votes,
// mirroring the server's toggle/switch semantics so the UI responds instantly.
export const applyOptimisticVote = (
  state: VoteState,
  desired: 'like' | 'dislike' | 'clear'
): VoteState => {
  let likes = state.likes;
  let dislikes = state.dislikes;
  if (state.myVote === 'like') {
    likes -= 1;
  } else if (state.myVote === 'dislike') {
    dislikes -= 1;
  }
  let myVote: ResolvedVote = null;
  if (desired === 'like') {
    likes += 1;
    myVote = 'like';
  } else if (desired === 'dislike') {
    dislikes += 1;
    myVote = 'dislike';
  }
  return {
    ...state,
    likes: Math.max(0, likes),
    dislikes: Math.max(0, dislikes),
    myVote,
  };
};
