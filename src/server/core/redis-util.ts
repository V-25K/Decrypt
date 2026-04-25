/**
 * Shared Redis utility helpers.
 */

/**
 * Parses a Redis string value to a number, returning `fallback` if the value
 * is undefined or not a finite number.
 */
export const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
};

/**
 * Returns true when a Redis MULTI/EXEC transaction committed successfully.
 * A null or undefined result means the transaction was aborted due to a WATCH conflict.
 */
export const transactionCommitted = (result: unknown): boolean =>
  result !== null && result !== undefined;
