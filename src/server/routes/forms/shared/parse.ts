// Primitive parsers shared by every form route.
// Form values arrive as `unknown` (Devvit normalizes single-select fields to
// either string or [string]) so the helpers normalize both shapes safely.

export const firstValue = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    const candidate = value[0];
    return typeof candidate === 'string' ? candidate : null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}`;
  }
  return null;
};

export const normalizeLoose = (value: string): string =>
  value.toUpperCase().replace(/\s+/g, ' ').trim();
