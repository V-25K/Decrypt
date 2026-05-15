import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { contentTokenSignature, isNearDuplicateSignature, normalizeContent } from './content.ts';

export const defaultManualLineRegistryPath = 'data/manual-line-registry.json';

const manualLineRegistryEntrySchema = z.object({
  id: z.string().min(1).optional(),
  text: z.string().min(1),
  author: z.string().min(1).optional(),
  challengeType: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
});

const manualLineRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(manualLineRegistryEntrySchema).default([]),
});

type ManualLineRegistryEntry = z.infer<typeof manualLineRegistryEntrySchema>;

export type LocalGameCorpusEntry = {
  levelId: string;
  challengeType: string | null;
  sourceKind: 'manual_registry';
  sourceLabel: string;
  targetText: string;
  author: string | null;
  normalizedSignature: string;
  tokenSignature: string;
};

export type LocalLineCheckStatus = 'clear' | 'exact_match' | 'near_duplicate';

export type LocalLineCheckResult = {
  inputText: string;
  normalizedSignature: string;
  tokenSignature: string;
  status: LocalLineCheckStatus;
  reason: string;
  matchedEntry: LocalGameCorpusEntry | null;
  exactMatches: LocalGameCorpusEntry[];
};

const toCorpusEntry = (
  entry: ManualLineRegistryEntry,
  index: number,
  sourceLabel: string
): LocalGameCorpusEntry => ({
  levelId: entry.id ?? `manual_${`${index + 1}`.padStart(4, '0')}`,
  challengeType: entry.challengeType ?? null,
  sourceKind: 'manual_registry',
  sourceLabel,
  targetText: entry.text,
  author: entry.author ?? null,
  normalizedSignature: normalizeContent(entry.text),
  tokenSignature: contentTokenSignature(entry.text),
});

export const loadManualLineRegistryEntries = (
  filePath = defaultManualLineRegistryPath
): LocalGameCorpusEntry[] => {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    return [];
  }
  const raw = readFileSync(resolvedPath, 'utf8');
  if (raw.trim().length === 0) {
    return [];
  }
  const parsed = manualLineRegistrySchema.parse(JSON.parse(raw));
  return parsed.entries.map((entry, index) => toCorpusEntry(entry, index, resolvedPath));
};

export const checkLineAgainstCorpusEntries = (
  inputText: string,
  corpusEntries: LocalGameCorpusEntry[]
): LocalLineCheckResult => {
  const normalizedSignature = normalizeContent(inputText);
  const tokenSignature = contentTokenSignature(inputText);

  if (!normalizedSignature) {
    return {
      inputText,
      normalizedSignature,
      tokenSignature,
      status: 'near_duplicate',
      reason: 'empty signature',
      matchedEntry: null,
      exactMatches: [],
    };
  }

  const exactMatches = corpusEntries.filter(
    (entry) => entry.normalizedSignature === normalizedSignature
  );

  if (exactMatches.length > 0) {
    return {
      inputText,
      normalizedSignature,
      tokenSignature,
      status: 'exact_match',
      reason: 'exact signature match',
      matchedEntry: exactMatches[0] ?? null,
      exactMatches,
    };
  }

  for (const entry of corpusEntries) {
    const nearDuplicate = isNearDuplicateSignature({
      candidateNormalizedSignature: normalizedSignature,
      candidateTokenSignature: tokenSignature,
      recent: [
        {
          normalizedSignature: entry.normalizedSignature,
          tokenSignature: entry.tokenSignature,
        },
      ],
    });

    if (nearDuplicate.duplicate) {
      return {
        inputText,
        normalizedSignature,
        tokenSignature,
        status: 'near_duplicate',
        reason: nearDuplicate.reason ?? 'near duplicate',
        matchedEntry: entry,
        exactMatches: [],
      };
    }
  }

  return {
    inputText,
    normalizedSignature,
    tokenSignature,
    status: 'clear',
    reason: 'no local registry match found',
    matchedEntry: null,
    exactMatches: [],
  };
};

export const checkLineAgainstManualRegistry = (
  inputText: string,
  filePath = defaultManualLineRegistryPath
): LocalLineCheckResult =>
  checkLineAgainstCorpusEntries(inputText, loadManualLineRegistryEntries(filePath));
