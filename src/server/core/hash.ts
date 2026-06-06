export const numberFromHash = (
  hash: Record<string, string>,
  field: string,
  fallback: number
): number => {
  const raw = hash[field];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};
