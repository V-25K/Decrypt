// Creator Acclaim — the merit gate for community-challenge rewards.
//
// A community challenge becomes "acclaimed" (and credits its creator's
// lifetimeAcclaimedChallenges milestone) only once it has proven itself with
// real players. We deliberately do NOT trigger on a raw like percentage: a
// 3-like, 100% puzzle must not qualify. The gate combines three signals:
//   1. enough genuine plays (qualified plays, creator excluded),
//   2. enough votes (so the ratio is statistically meaningful), and
//   3. a high *lower bound* of the like ratio (Wilson score, not the raw mean),
//      so small-sample flukes and light brigading can't cross the bar.
//
// Pure module: no I/O. Reused by the server evaluator and the creator-progress
// UI so both speak the same numbers.

export const ACCLAIM_MIN_QUALIFIED_PLAYS = 200;
export const ACCLAIM_MIN_VOTES = 25;
export const ACCLAIM_MIN_RATIO = 0.7;

// z for a 95% confidence interval.
const WILSON_Z = 1.96;

export type AcclaimStats = {
  qualifiedPlays: number;
  likes: number;
  dislikes: number;
};

export type AcclaimProgress = {
  qualifiedPlays: number;
  likes: number;
  dislikes: number;
  totalVotes: number;
  // Raw like share (likes / totalVotes), 0 when no votes. For display only.
  likeRatio: number;
  // Wilson 95% lower bound of the like ratio — the value the gate checks.
  ratioLowerBound: number;
  playsToGo: number;
  votesToGo: number;
  met: boolean;
};

const clamp01 = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
};

// Wilson score interval lower bound for a binomial proportion.
// Returns 0 for an empty sample. Always within [0, 1].
export const wilsonLowerBound = (
  likes: number,
  total: number,
  z = WILSON_Z
): number => {
  if (total <= 0) {
    return 0;
  }
  const safeLikes = Math.max(0, Math.min(likes, total));
  const phat = safeLikes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = phat + z2 / (2 * total);
  const margin =
    z * Math.sqrt((phat * (1 - phat) + z2 / (4 * total)) / total);
  return clamp01((center - margin) / denominator);
};

export const isAcclaimed = (stats: AcclaimStats): boolean => {
  const totalVotes = Math.max(0, stats.likes) + Math.max(0, stats.dislikes);
  return (
    stats.qualifiedPlays >= ACCLAIM_MIN_QUALIFIED_PLAYS &&
    totalVotes >= ACCLAIM_MIN_VOTES &&
    wilsonLowerBound(stats.likes, totalVotes) >= ACCLAIM_MIN_RATIO
  );
};

// Breakdown for the creator-facing progress UI ("142 / 200 plays · 88% liked").
export const acclaimProgress = (stats: AcclaimStats): AcclaimProgress => {
  const likes = Math.max(0, stats.likes);
  const dislikes = Math.max(0, stats.dislikes);
  const qualifiedPlays = Math.max(0, stats.qualifiedPlays);
  const totalVotes = likes + dislikes;
  const ratioLowerBound = wilsonLowerBound(likes, totalVotes);
  return {
    qualifiedPlays,
    likes,
    dislikes,
    totalVotes,
    likeRatio: totalVotes === 0 ? 0 : likes / totalVotes,
    ratioLowerBound,
    playsToGo: Math.max(0, ACCLAIM_MIN_QUALIFIED_PLAYS - qualifiedPlays),
    votesToGo: Math.max(0, ACCLAIM_MIN_VOTES - totalVotes),
    met: isAcclaimed({ qualifiedPlays, likes, dislikes }),
  };
};
