export type Rng = () => number;

const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

export const deriveSeed = (levelId: string, quotePlain: string): number => {
  // FNV-1a 32-bit hash over the full seed key and quote text.
  // This keeps generation deterministic while avoiding collisions between
  // different same-length phrases or large pending-token digit sequences.
  const input = `${levelId}|${quotePlain.length}|${quotePlain}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
};

export const mulberry32 = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_MAX_PLUS_ONE;
  };
};

export const randInt = (
  rng: Rng,
  min: number,
  maxInclusive: number
): number => {
  if (maxInclusive < min) {
    throw new Error('maxInclusive must be greater than or equal to min');
  }
  const span = maxInclusive - min + 1;
  return min + Math.floor(rng() * span);
};

export const shuffleWithRng = <T>(items: T[], rng: Rng): T[] => {
  const clone = [...items];
  for (let i = clone.length - 1; i > 0; i -= 1) {
    const j = randInt(rng, 0, i);
    const current = clone[i];
    const next = clone[j];
    if (current === undefined || next === undefined) {
      continue;
    }
    clone[i] = next;
    clone[j] = current;
  }
  return clone;
};
