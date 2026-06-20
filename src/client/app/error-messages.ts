// Centralized mapping from raw thrown errors to copy a player should actually
// read. Server-side tRPC handlers throw curated, human-readable messages and we
// want to keep showing those. But network/transport/runtime failures surface
// cryptic strings ("Failed to fetch", "Unexpected token < in JSON", "Internal
// Server Error", Zod validation dumps, stack traces) that mean nothing to a
// player. Those get swapped for the caller's friendly fallback instead.

// Patterns that indicate a technical/transport error rather than a message the
// game intentionally wrote for the player.
const TECHNICAL_ERROR_PATTERNS: RegExp[] = [
  /failed to fetch/i,
  /fetch failed/i,
  /load failed/i,
  /network ?error/i,
  /network request failed/i,
  /\btimed? ?out\b/i,
  /\baborted?\b/i,
  /internal server error/i,
  /\bhttp \d{3}\b/i,
  /\b5[0-9]{2} (?:error|status)\b/i,
  /unexpected token/i,
  /unexpected end of (?:json|input)/i,
  /is not valid json/i,
  /<!doctype/i,
  /syntaxerror/i,
  /typeerror/i,
  /referenceerror/i,
  /\becon\w+\b/i, // ECONNREFUSED, ECONNRESET, ECONNABORTED…
  /enotfound/i,
  /\bsocket\b/i,
  /\btrpc\b/i,
  /\bzod\b/i,
  /invalid_type/i,
  /expected .+ received/i,
  /cannot read propert/i,
  /undefined is not/i,
];

const looksTechnical = (message: string): boolean =>
  TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message));

/**
 * Returns player-facing copy for an unknown thrown value. Curated server
 * messages pass through untouched; transport/runtime failures and empty
 * messages collapse to `fallback`. Overlong messages (likely a dump or stack)
 * also fall back, since real player-facing copy is short.
 */
export const friendlyErrorMessage = (error: unknown, fallback: string): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  const message = raw.trim();
  if (message.length === 0 || message.length > 160 || looksTechnical(message)) {
    return fallback;
  }
  return message;
};
