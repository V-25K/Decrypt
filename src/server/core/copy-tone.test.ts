import { describe, expect, it, vi } from 'vitest';

vi.mock('@devvit/web/server', () => ({
  context: { userId: 't2_user', username: 'tester', subredditName: 'decrypttest_dev' },
  reddit: { getSnoovatarUrl: vi.fn() },
  redis: { hGet: vi.fn() },
}));
vi.mock('./config', () => ({
  getDecryptSettings: vi.fn().mockResolvedValue({ logicalCipherPercent: 100 }),
}));
vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./puzzle-store', () => ({
  getPuzzleMapping: vi.fn().mockResolvedValue(null),
  getPuzzlePrivate: vi.fn(),
  getRecentUsedSignatureEntries: vi.fn().mockResolvedValue([]),
  getUsedSignatureOwner: vi.fn().mockResolvedValue(null),
  peekNextLevelId: vi.fn().mockResolvedValue('lvl_0001'),
}));
vi.mock('./generator', () => ({
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: vi.fn(),
  publishDailyPost: vi.fn(),
}));
vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getFailedLevels: vi.fn(),
  getUserProfile: vi.fn(),
  saveUserProfile: vi.fn(),
}));
vi.mock('./engagement', () => ({ getLevelEngagement: vi.fn() }));

import {
  buildCommunityTierFitMessage,
  humanizeCommunityReason,
} from './community';
import { fitBoardToTier, tierDisplayName } from './tier-fitter';

// Words players must never see. Internal mechanics stay internal; copy talks
// about boards, letters, tiles, and tiers (Easy/Medium/Hard/Expert).
const bannedPatterns: RegExp[] = [
  /\bsolver\b/i,
  /\bfairness check(er)?\b/i,
  /\btier bounds\b/i,
  /\bhardness\b/i,
  /\bvalidation\b/i,
  /\bobstructions?\b/i,
  /\bbudget\b/i,
  /\bengine\b/i,
  /\bbuildability\b/i,
  // The internal tier id must surface as "Easy".
  /\bwarmup\b/i,
];

const expectFriendly = (text: string): void => {
  for (const pattern of bannedPatterns) {
    expect(text, `"${text}" should not match ${pattern}`).not.toMatch(pattern);
  }
};

// Every raw engine string the preview/build paths can produce today.
const rawEngineReasons = [
  'Blind tile fairness check failed.',
  'No starter clue on board.',
  'This layout is not fair enough to publish as-is.',
  'Could not build a fair Hard board from this line [trace abc123].',
  'Target tier warmup not achievable with this text.',
  'Could not verify buildability for this text [trace abc123]: preview timeout.',
  'Could not build a custom preview: something broke.',
  'A multi-letter word is fully prefilled.',
  'Padlock chain locks its own key tiles.',
  'Padlock dependency loop detected.',
  'Word length exceeds 21 characters.',
  'Total challenge length exceeds 2000 characters.',
];

describe('player-facing copy stays jargon-free', () => {
  it('humanizeCommunityReason never leaks engine terms', () => {
    for (const raw of rawEngineReasons) {
      for (const creationMode of ['auto', 'manual'] as const) {
        expectFriendly(
          humanizeCommunityReason(raw, { tierLabel: 'Easy', creationMode })
        );
      }
    }
  });

  it('tier availability messages are friendly for every tier', () => {
    for (const difficulty of [2, 5, 8, 9]) {
      expectFriendly(buildCommunityTierFitMessage(difficulty));
    }
  });

  it('tier display names are the player-facing four', () => {
    expect(tierDisplayName('warmup')).toBe('Easy');
    expect(tierDisplayName('medium')).toBe('Medium');
    expect(tierDisplayName('hard')).toBe('Hard');
    expect(tierDisplayName('expert')).toBe('Expert');
  });

  it('fitter infeasibility reasons read as plain guidance', { timeout: 30_000 }, () => {
    const cases = [
      // Structurally invalid text.
      { text: 'SHORT', tier: 'medium' as const },
      // Too simple for the top tier.
      { text: 'TO BE OR NOT TO BE THAT IS THE QUESTION', tier: 'expert' as const },
      // Unusual words that cannot reach the easy band.
      { text: 'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS', tier: 'warmup' as const },
    ];
    for (const params of cases) {
      const outcome = fitBoardToTier({
        text: params.text,
        tier: params.tier,
        dateKey: '2026-06-10',
        author: 'Tester',
        challengeType: 'QUOTE',
        logicalPercent: 10,
      });
      expect(outcome.fitted).toBe(false);
      if (!outcome.fitted) {
        expectFriendly(outcome.detail);
      }
    }
  });
});
