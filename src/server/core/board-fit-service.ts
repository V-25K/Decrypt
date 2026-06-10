import { redis } from '@devvit/web/server';
import type { ChallengeType } from '../../shared/game.ts';
import { getDecryptSettings } from './config.ts';
import {
  computePhraseDifficultyProfile,
  normalizeContent,
  rankDifficultyTiersForProfile,
  sanitizePhrase,
  validateQuoteStructure,
  type DifficultyTier,
} from './content.ts';
import { keyBoardFitLayout, keyBoardFitReport } from './keys.ts';
import { deriveSeed } from './rng.ts';
import { formatDateKey } from './serde.ts';
import {
  fitBoardToTier,
  tierFitLayoutVersion,
  type FittedLayout,
  type TierFitSummary,
} from './tier-fitter.ts';

export const boardFitTierOrder: DifficultyTier[] = [
  'warmup',
  'medium',
  'hard',
  'expert',
];

// Hot-path cache only: consumers persist the chosen layout on their own
// records (submission, publish), and a miss re-fits deterministically.
const boardFitTtlSeconds = 45 * 60;

export type LineTierFitEntry = {
  tier: DifficultyTier;
  feasible: boolean;
  reason: string | null;
  summary: TierFitSummary | null;
};

export type LineFitReport = {
  textHash: string;
  layoutVersion: string;
  textValid: boolean;
  reasons: string[];
  suggestedTier: DifficultyTier;
  tiers: LineTierFitEntry[];
};

// Two independent FNV passes (~64 bits) keyed by layout version. A collision
// would serve the wrong cached board for a text, so plain 32 bits is not
// enough; 64 makes it negligible at this cache's scale.
export const boardFitTextHash = (text: string): string => {
  const normalized = normalizeContent(sanitizePhrase(text));
  const a = deriveSeed(`fit:a:${tierFitLayoutVersion}`, normalized);
  const b = deriveSeed(`fit:b:${tierFitLayoutVersion}`, normalized);
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
};

const fitDefaults: { author: string; challengeType: ChallengeType } = {
  author: 'Unknown',
  challengeType: 'QUOTE',
};

const readCachedReport = async (
  textHash: string
): Promise<LineFitReport | null> => {
  const raw = await redis.get(keyBoardFitReport(textHash));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as LineFitReport;
    if (parsed.layoutVersion !== tierFitLayoutVersion) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeWithTtl = async (key: string, value: string): Promise<void> => {
  await redis.set(key, value);
  await redis.expire(key, boardFitTtlSeconds);
};

/**
 * Fits the line to every tier by actually building boards, so UIs can offer
 * only verified choices. Results (report + per-tier layouts) are cached by
 * text hash; the whole computation is deterministic, so cache expiry is never
 * user-visible — a miss just re-derives the same boards.
 */
export const fitLineToTiers = async (params: {
  text: string;
  author?: string;
  challengeType?: ChallengeType;
}): Promise<LineFitReport> => {
  const textHash = boardFitTextHash(params.text);
  const structure = validateQuoteStructure(params.text);
  if (!structure.valid) {
    return {
      textHash,
      layoutVersion: tierFitLayoutVersion,
      textValid: false,
      reasons: structure.reasons,
      suggestedTier: 'medium',
      tiers: boardFitTierOrder.map((tier) => ({
        tier,
        feasible: false,
        reason: structure.reasons[0] ?? null,
        summary: null,
      })),
    };
  }

  const cached = await readCachedReport(textHash);
  if (cached) {
    return cached;
  }

  const settings = await getDecryptSettings();
  const dateKey = formatDateKey(new Date());
  const entries: LineTierFitEntry[] = [];
  const writes: Array<Promise<void>> = [];
  for (const tier of boardFitTierOrder) {
    const outcome = fitBoardToTier({
      text: params.text,
      tier,
      dateKey,
      author: params.author ?? fitDefaults.author,
      challengeType: params.challengeType ?? fitDefaults.challengeType,
      logicalPercent: settings.logicalCipherPercent,
    });
    if (outcome.fitted) {
      entries.push({ tier, feasible: true, reason: null, summary: outcome.summary });
      writes.push(
        writeWithTtl(keyBoardFitLayout(textHash, tier), JSON.stringify(outcome.layout))
      );
    } else {
      entries.push({ tier, feasible: false, reason: outcome.detail, summary: null });
    }
  }

  const profile = computePhraseDifficultyProfile(sanitizePhrase(params.text));
  const feasibleTiers = entries
    .filter((entry) => entry.feasible)
    .map((entry) => entry.tier);
  const ranked = rankDifficultyTiersForProfile(
    profile,
    undefined,
    feasibleTiers.length > 0 ? feasibleTiers : boardFitTierOrder
  );
  const report: LineFitReport = {
    textHash,
    layoutVersion: tierFitLayoutVersion,
    textValid: true,
    reasons: [],
    suggestedTier: ranked[0]?.tier ?? 'medium',
    tiers: entries,
  };
  writes.push(writeWithTtl(keyBoardFitReport(textHash), JSON.stringify(report)));
  await Promise.all(writes);
  return report;
};

/**
 * Returns the fitted layout for (text, tier) — from cache when warm, by
 * deterministic re-fit on a miss. Null means the tier is genuinely
 * infeasible for this line.
 */
export const getCachedFittedLayout = async (params: {
  text: string;
  tier: DifficultyTier;
  author?: string;
  challengeType?: ChallengeType;
}): Promise<FittedLayout | null> => {
  const textHash = boardFitTextHash(params.text);
  const raw = await redis.get(keyBoardFitLayout(textHash, params.tier));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as FittedLayout;
      if (parsed.layoutVersion === tierFitLayoutVersion) {
        return parsed;
      }
    } catch {
      // Corrupt cache entry — fall through to a deterministic re-fit.
    }
  }

  const settings = await getDecryptSettings();
  const outcome = fitBoardToTier({
    text: params.text,
    tier: params.tier,
    dateKey: formatDateKey(new Date()),
    author: params.author ?? fitDefaults.author,
    challengeType: params.challengeType ?? fitDefaults.challengeType,
    logicalPercent: settings.logicalCipherPercent,
  });
  if (!outcome.fitted) {
    return null;
  }
  await writeWithTtl(
    keyBoardFitLayout(textHash, params.tier),
    JSON.stringify(outcome.layout)
  );
  return outcome.layout;
};
