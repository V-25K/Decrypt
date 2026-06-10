import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildAndSaveManualPuzzleMock,
  getPuzzlePrivateMock,
  getUserProfileMock,
  publishDailyPostMock,
  redis,
  saveUserProfileMock,
} = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, string>>();
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const hashOf = (key: string): Map<string, string> => {
    let h = hashes.get(key);
    if (!h) {
      h = new Map();
      hashes.set(key, h);
    }
    return h;
  };
  return {
    buildAndSaveManualPuzzleMock: vi.fn(),
    getPuzzlePrivateMock: vi.fn(),
    getUserProfileMock: vi.fn(),
    publishDailyPostMock: vi.fn(),
    saveUserProfileMock: vi.fn(),
    redis: {
      __hashes: hashes,
      hGet: vi.fn(async (key: string, field: string) => hashOf(key).get(field) ?? null),
      hSet: vi.fn(async (key: string, values: Record<string, string>) => {
        const h = hashOf(key);
        for (const [f, v] of Object.entries(values)) h.set(f, v);
        return Object.keys(values).length;
      }),
      hSetNX: vi.fn(async (key: string, field: string, value: string) => {
        const h = hashOf(key);
        if (h.has(field)) return 0;
        h.set(field, value);
        return 1;
      }),
      hDel: vi.fn(async (key: string, fields: string[]) => {
        const h = hashOf(key);
        let n = 0;
        for (const f of fields) if (h.delete(f)) n += 1;
        return n;
      }),
      hGetAll: vi.fn(async (key: string) => Object.fromEntries(hashOf(key).entries())),
      hIncrBy: vi.fn(async (key: string, field: string, by: number) => {
        const h = hashOf(key);
        const next = (Number(h.get(field) ?? '0') || 0) + by;
        h.set(field, `${next}`);
        return next;
      }),
      set: vi.fn(async (key: string, value: string, opts?: { nx?: boolean }) => {
        if (opts?.nx && strings.has(key)) return null;
        strings.set(key, value);
        return 'OK';
      }),
      get: vi.fn(async (key: string) => strings.get(key) ?? null),
      del: vi.fn(async (...keys: string[]) => {
        for (const key of keys) strings.delete(key);
        return keys.length;
      }),
      zAdd: vi.fn(async (key: string, entry: { member: string; score: number }) => {
        let z = zsets.get(key);
        if (!z) {
          z = new Map();
          zsets.set(key, z);
        }
        z.set(entry.member, entry.score);
        return 1;
      }),
      zRem: vi.fn(async (key: string, members: string[]) => {
        const z = zsets.get(key);
        let n = 0;
        for (const member of members) if (z?.delete(member)) n += 1;
        return n;
      }),
    },
  };
});

vi.mock('@devvit/web/server', () => ({
  context: { userId: 't2_reviewer', username: 'reviewer', subredditName: 'decrypttest_dev' },
  reddit: { getSnoovatarUrl: vi.fn().mockResolvedValue(undefined) },
  redis,
}));
vi.mock('./config', () => ({
  getDecryptSettings: vi.fn().mockResolvedValue({ logicalCipherPercent: 100 }),
}));
vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./puzzle-store', () => ({
  getPuzzleMapping: vi.fn().mockResolvedValue(null),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublishedPostId: vi.fn().mockResolvedValue(null),
  getRecentUsedSignatureEntries: vi.fn().mockResolvedValue([]),
  getUsedSignatureOwner: vi.fn().mockResolvedValue(null),
  peekNextLevelId: vi.fn().mockResolvedValue('lvl_0001'),
  replacePuzzleDataInPlace: vi.fn(),
}));
vi.mock('./generator', () => ({
  buildAndSaveManualPuzzle: buildAndSaveManualPuzzleMock,
  buildManualPuzzleWithSolverFallback: vi.fn(),
  publishDailyPost: publishDailyPostMock,
}));
vi.mock('./state', () => ({
  getCompletedLevels: vi.fn(),
  getFailedLevels: vi.fn(),
  getUserProfile: getUserProfileMock,
  saveUserProfile: saveUserProfileMock,
}));
vi.mock('./engagement', () => ({ getLevelEngagement: vi.fn() }));
vi.mock('./quests', () => ({ updateQuestProgressOnAcclaim: vi.fn() }));

import { validateQuoteForPhase1 } from './content';
import { approveCommunitySubmission } from './community';
import { keyCommunityCreatorStats, keyCommunitySubmission } from './keys';

// Approval must pass the phase-1 text check for the submission's target
// difficulty; pick a line the current calibration accepts at medium.
const candidateTexts = [
  'TO BE OR NOT TO BE THAT IS THE QUESTION',
  'JUDGE EACH DAY BY THE SEEDS THAT YOU PLANT NOT THE HARVEST YOU REAP',
  'THE ONLY WAY TO DO GREAT WORK IS TO LOVE WHAT YOU DO',
];

describe('approveCommunitySubmission rewards', () => {
  beforeEach(() => {
    redis.__hashes.clear();
    redis.hIncrBy.mockClear();
    saveUserProfileMock.mockReset();
    getUserProfileMock.mockReset();
    buildAndSaveManualPuzzleMock.mockReset();
    publishDailyPostMock.mockReset();
    getPuzzlePrivateMock.mockReset();
  });

  it('grants the Puzzle Maker flair but zero coins on approval', async () => {
    const text = candidateTexts.find(
      (candidate) => validateQuoteForPhase1(candidate, 5).valid
    );
    expect(text).toBeDefined();
    if (!text) {
      return;
    }

    await redis.hSet(keyCommunitySubmission('sub_001'), {
      authorId: 't2_creator',
      authorName: 'creator',
      title: 'My puzzle',
      text,
      normalizedSig: 'sig-001',
      tokenSig: 'tok-001',
      category: 'QUOTE',
      attribution: 'Source',
      targetDifficulty: '5',
      creationMode: 'auto',
      manualLayout: '',
      fittedLayout: '',
      suggestedTier: 'medium',
      status: 'pending',
      submittedAt: '1000',
      reviewedBy: '',
      reviewedAt: '',
      rejectionReason: '',
      levelId: '',
    });

    const puzzlePrivate = {
      levelId: 'lvl_0099',
      dateKey: '2026-06-10',
      targetText: text,
    };
    buildAndSaveManualPuzzleMock.mockResolvedValue({
      levelId: 'lvl_0099',
      signatureOwnerToken: 'token',
      puzzlePrivate,
      puzzlePublic: { levelId: 'lvl_0099' },
    });
    getPuzzlePrivateMock.mockResolvedValue(puzzlePrivate);
    publishDailyPostMock.mockResolvedValue('t3_post');
    getUserProfileMock.mockResolvedValue({
      coins: 500,
      unlockedFlairs: [],
    });

    const approved = await approveCommunitySubmission('sub_001');
    expect(approved.status).toBe('approved');

    // Flair yes, coins no — all creator payout flows through acclaim quests.
    expect(saveUserProfileMock).toHaveBeenCalledTimes(1);
    const savedProfile = saveUserProfileMock.mock.calls[0]?.[1] as {
      coins: number;
      unlockedFlairs: string[];
    };
    expect(savedProfile.coins).toBe(500);
    expect(savedProfile.unlockedFlairs).toContain('Puzzle Maker');

    const coinsEarnedCalls = redis.hIncrBy.mock.calls.filter(
      (call) =>
        call[0] === keyCommunityCreatorStats('t2_creator') &&
        call[1] === 'coinsEarned'
    );
    expect(coinsEarnedCalls).toHaveLength(0);
  });
});
