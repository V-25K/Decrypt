export type Rng = () => number;

const UINT32_MAX_PLUS_ONE = 0x1_0000_0000;

const toUint32 = (value: bigint): number =>
  Number(value % BigInt(UINT32_MAX_PLUS_ONE)) >>> 0;

const levelDigits = (levelId: string): string => {
  const digits = levelId.replace(/[^0-9]/g, '');
  return digits.length > 0 ? `${Number(digits)}` : '0';
};

export const deriveSeed = (levelId: string, quotePlain: string): number => {
  const levelPart = levelDigits(levelId);
  const quoteLengthPart = `${quotePlain.length}`.padStart(3, '0');
  const concatenated = `${levelPart}${quoteLengthPart}`;
  return toUint32(BigInt(concatenated));
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
