import { beforeEach, describe, expect, it, vi } from 'vitest';

const { contextState, redis, getPuzzlePrivateMock, deletePuzzleDataMock } = vi.hoisted(() => {
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
    contextState: { userId: 't2_mod', username: 'mod' } as {
      userId: string | null;
      username: string | null;
    },
    getPuzzlePrivateMock: vi.fn(),
    deletePuzzleDataMock: vi.fn(),
    redis: {
      __hashes: hashes,
      __strings: strings,
      __zsets: zsets,
      hGet: vi.fn(async (key: string, field: string) => hashOf(key).get(field) ?? null),
      hGetAll: vi.fn(async (key: string) => Object.fromEntries(hashOf(key).entries())),
      hSet: vi.fn(async (key: string, values: Record<string, string>) => {
        const h = hashOf(key);
        for (const [f, v] of Object.entries(values)) h.set(f, v);
        return Object.keys(values).length;
      }),
      hDel: vi.fn(async (key: string, fields: string[]) => {
        const h = hashOf(key);
        let n = 0;
        for (const f of fields) if (h.delete(f)) n += 1;
        return n;
      }),
      del: vi.fn(async (key: string) => {
        const existed = hashes.has(key) || strings.has(key) || zsets.has(key);
        hashes.delete(key);
        strings.delete(key);
        zsets.delete(key);
        return existed ? 1 : 0;
      }),
      get: vi.fn(async (key: string) => strings.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        strings.set(key, value);
        return 'OK';
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
        if (!z) return 0;
        let n = 0;
        for (const m of members) if (z.delete(m)) n += 1;
        return n;
      }),
      zScore: vi.fn(async (key: string, member: string) => zsets.get(key)?.get(member) ?? null),
      zCard: vi.fn(async (key: string) => zsets.get(key)?.size ?? 0),
    },
  };
});

vi.mock('@devvit/web/server', () => ({
  context: contextState,
  reddit: { getSnoovatarUrl: vi.fn() },
  redis,
}));
vi.mock('./config', () => ({
  getDecryptSettings: vi.fn().mockResolvedValue({ logicalCipherPercent: 100 }),
}));
vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./puzzle-store', () => ({
  deletePuzzleData: deletePuzzleDataMock,
  getPuzzleMapping: vi.fn().mockResolvedValue(null),
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublishedPostId: vi.fn().mockResolvedValue(null),
  getRecentUsedSignatureEntries: vi.fn().mockResolvedValue([]),
  getUsedSignatureOwner: vi.fn().mockResolvedValue(null),
  peekNextLevelId: vi.fn().mockResolvedValue('lvl_0001'),
  replacePuzzleDataInPlace: vi.fn(),
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
vi.mock('./quests', () => ({
  updateQuestProgressOnAcclaim: vi.fn(),
  updateQuestProgressOnCreatorLike: vi.fn(),
}));

import { purgeCommunityChallengeByLevel } from './community';
import {
  keyCommunityAcclaimAwarded,
  keyCommunityLevelLikedBy,
  keyCommunityPuzzlePlays,
  keyCommunityRemovedLevels,
  keyCommunitySubmission,
  keyCommunitySubmissionsApproved,
  keyCommunitySubmissionsByAuthor,
  keyCommunitySubmissionsByLevel,
  keyCommunitySubmissionsRemoved,
  keyCommunityVotes,
  keyLevelPlayCount,
  keyLevelPlayers,
  keyPostLevel,
} from './keys';

const LEVEL = 'lvl_0042';
const SUB_ID = 'sub_1';
const POST_ID = 't3_post42';
const CREATOR = 't2_creator';

const submissionHash = {
  authorId: CREATOR,
  authorName: 'creator',
  title: 'Puzzle',
  text: 'THE QUICK BROWN FOX JUMPS',
  normalizedSig: 'THEQUICKBROWNFOXJUMPS',
  tokenSig: 'THE QUICK BROWN FOX JUMPS',
  category: 'QUOTE',
  attribution: 'Tester',
  targetDifficulty: '5',
  creationMode: 'auto',
  manualLayout: '',
  suggestedTier: 'medium',
  status: 'approved',
  submittedAt: '1000',
  reviewedBy: 't2_mod',
  reviewedAt: '2000',
  rejectionReason: '',
  levelId: LEVEL,
};

const seedHash = (key: string, values: Record<string, string>): void => {
  const h = new Map<string, string>();
  for (const [f, v] of Object.entries(values)) h.set(f, v);
  redis.__hashes.set(key, h);
};
const seedZset = (key: string, member: string): void => {
  redis.__zsets.set(key, new Map([[member, 1]]));
};

beforeEach(() => {
  redis.__hashes.clear();
  redis.__strings.clear();
  redis.__zsets.clear();
  getPuzzlePrivateMock.mockReset();
  deletePuzzleDataMock.mockReset();
});

const seedApprovedChallenge = (): void => {
  seedHash(keyCommunitySubmissionsByLevel, { [LEVEL]: SUB_ID });
  seedHash(keyCommunitySubmission(SUB_ID), submissionHash);
  seedZset(keyCommunitySubmissionsApproved, SUB_ID);
  seedZset(keyCommunitySubmissionsByAuthor(CREATOR), SUB_ID);
  seedHash(keyCommunityPuzzlePlays(LEVEL), { plays: '5', likes: '2' });
  seedHash(keyCommunityVotes(LEVEL), { t2_voter: '1' });
  seedHash(keyCommunityLevelLikedBy(LEVEL), { t2_voter: '1' });
  redis.__strings.set(keyCommunityAcclaimAwarded(LEVEL), '1');
  redis.__strings.set(keyLevelPlayCount(LEVEL), '5');
  redis.__hashes.set(keyLevelPlayers(LEVEL), new Map([['t2_voter', '1']]));
  redis.__strings.set(keyPostLevel(POST_ID), LEVEL);
  getPuzzlePrivateMock.mockResolvedValue({ dateKey: '2026-06-21' });
};

describe('purgeCommunityChallengeByLevel', () => {
  it('hard-deletes a community challenge: content, identity, engagement, indexes', async () => {
    seedApprovedChallenge();

    const result = await purgeCommunityChallengeByLevel({ levelId: LEVEL, postId: POST_ID });

    expect(result).toEqual({ purged: true });
    // Puzzle content delegated to deletePuzzleData with date + signature.
    expect(deletePuzzleDataMock).toHaveBeenCalledWith({
      levelId: LEVEL,
      dateKey: '2026-06-21',
      signature: 'THEQUICKBROWNFOXJUMPS',
    });
    // Creator text/identity record gone.
    expect(await redis.hGetAll(keyCommunitySubmission(SUB_ID))).toEqual({});
    // Per-level engagement gone.
    expect(redis.__hashes.has(keyCommunityPuzzlePlays(LEVEL))).toBe(false);
    expect(redis.__hashes.has(keyCommunityVotes(LEVEL))).toBe(false);
    expect(redis.__hashes.has(keyCommunityLevelLikedBy(LEVEL))).toBe(false);
    expect(redis.__hashes.has(keyLevelPlayers(LEVEL))).toBe(false);
    expect(redis.__strings.has(keyLevelPlayCount(LEVEL))).toBe(false);
    // Discovery indexes cleared so it can never be served again.
    expect(await redis.hGet(keyCommunitySubmissionsByLevel, LEVEL)).toBeNull();
    expect(await redis.zScore(keyCommunitySubmissionsApproved, SUB_ID)).toBeNull();
    expect(await redis.zScore(keyCommunitySubmissionsByAuthor(CREATOR), SUB_ID)).toBeNull();
    // Audit trail keeps ids only.
    expect(await redis.zScore(keyCommunitySubmissionsRemoved, SUB_ID)).not.toBeNull();
    expect(await redis.hGet(keyCommunityRemovedLevels, LEVEL)).toBe(SUB_ID);
    // Post -> level reverse pointer cleared.
    expect(await redis.get(keyPostLevel(POST_ID))).toBeNull();
  });

  it('is a safe no-op for a level that is not a community challenge', async () => {
    redis.__strings.set(keyPostLevel(POST_ID), 'lvl_daily');

    const result = await purgeCommunityChallengeByLevel({ levelId: 'lvl_daily', postId: POST_ID });

    expect(result).toEqual({ purged: false });
    expect(deletePuzzleDataMock).not.toHaveBeenCalled();
    // Stale post pointer for the deleted post is still cleaned up.
    expect(await redis.get(keyPostLevel(POST_ID))).toBeNull();
  });

  it('tolerates a missing submission record (purges by level, skips identity ops)', async () => {
    seedHash(keyCommunitySubmissionsByLevel, { [LEVEL]: SUB_ID });
    getPuzzlePrivateMock.mockResolvedValue({ dateKey: '2026-06-21' });

    const result = await purgeCommunityChallengeByLevel({ levelId: LEVEL });

    expect(result).toEqual({ purged: true });
    expect(deletePuzzleDataMock).toHaveBeenCalledWith({ levelId: LEVEL, dateKey: '2026-06-21' });
    expect(await redis.hGet(keyCommunitySubmissionsByLevel, LEVEL)).toBeNull();
  });
});
