import { contentTokenSignature, isNearDuplicateSignature, normalizeContent } from './content.ts';

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
