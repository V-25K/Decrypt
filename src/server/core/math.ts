export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const round4 = (value: number): number => Number(value.toFixed(4));
