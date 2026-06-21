import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contentTokenSignature, normalizeContent } from '../src/server/core/content.ts';
import type { LocalGameCorpusEntry } from '../src/server/core/line-checker.ts';

/**
 * Local corpus loader for the `lines:check` dev helper. Reads a hand-maintained
 * registry of lines you have already used for manual endless puzzles so you can
 * check a candidate line for duplicates before injecting it. Script-only (uses
 * node:fs) — never imported by the Devvit server bundle.
 *
 * Registry file shape (JSON): either a bare array of rows, or `{ "entries": [...] }`.
 * Each row: { levelId, targetText, challengeType?, sourceLabel?, author? }.
 * Signatures are derived from targetText via the shared content helpers, so the
 * file only needs the human-readable line.
 */
export const defaultManualLineRegistryPath = 'data/manual-line-registry.json';

type RawRegistryRow = {
  levelId?: unknown;
  targetText?: unknown;
  challengeType?: unknown;
  sourceLabel?: unknown;
  author?: unknown;
};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

export const loadManualLineRegistryEntries = (
  corpusFilePath: string
): LocalGameCorpusEntry[] => {
  const path = resolve(corpusFilePath);
  if (!existsSync(path)) {
    // No registry yet — every candidate line reads as CLEAR.
    return [];
  }

  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const rows: RawRegistryRow[] = Array.isArray(parsed)
    ? (parsed as RawRegistryRow[])
    : Array.isArray((parsed as { entries?: unknown })?.entries)
      ? ((parsed as { entries: RawRegistryRow[] }).entries)
      : [];

  const entries: LocalGameCorpusEntry[] = [];
  for (const row of rows) {
    const targetText = asString(row.targetText);
    const levelId = asString(row.levelId);
    if (!targetText || !levelId) {
      continue;
    }
    entries.push({
      levelId,
      challengeType: asString(row.challengeType),
      sourceKind: 'manual_registry',
      sourceLabel: asString(row.sourceLabel) ?? 'manual_registry',
      targetText,
      author: asString(row.author),
      normalizedSignature: normalizeContent(targetText),
      tokenSignature: contentTokenSignature(targetText),
    });
  }
  return entries;
};
