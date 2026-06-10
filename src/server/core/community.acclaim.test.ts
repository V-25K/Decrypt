import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  contextState,
  redis,
  getPuzzlePrivateMock,
  updateQuestProgressOnAcclaimMock,
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
    contextState: { userId: 't2_voter', username: 'voter' } as {
      userId: string | null;
      username: string | null;
    },
    getPuzzlePrivateMock: vi.fn(),
    updateQuestProgressOnAcclaimMock: vi.fn(),
    redis: {
      __hashes: hashes,
      __strings: strings,
      __zsets: zsets,
      hGet: vi.fn(async (key: string, field: string) => hashOf(key).get(field) ?? null),
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
      hGetAll: vi.fn(async (key: string) =>
        Object.fromEntries(hashOf(key).entries())
      ),
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
      zCard: vi.fn(async (key: string) => zsets.get(key)?.size ?? 0),
      zScore: vi.fn(async (key: string, member: string) =>
        zsets.get(key)?.get(member) ?? null
      ),
      zAdd: vi.fn(async (key: string, entry: { member: string; score: number }) => {
        let z = zsets.get(key);
        if (!z) {
          z = new Map();
          zsets.set(key, z);
        }
        z.set(entry.member, entry.score);
        return 1;
      }),
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
  updateQuestProgressOnAcclaim: updateQuestProgressOnAcclaimMock,
}));

import {
  getCommunityVoteState,
  recordCommunityVote,
} from './community';
import {
  keyCommunityAcclaimAwarded,
  keyCommunityCreatorStats,
  keyCommunitySubmission,
  keyCommunitySubmissionsByLevel,
  keyCommunityVotes,
  keyLevelQualifiedPlayers,
} from './keys';

const LEVEL = 'lvl_0042';
const CREATOR = 't2_creator';

const fullSubmissionHash = {
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

const seedQualifiedPlayers = (count: number): void => {
  const z = new Map<string, number>();
  for (let i = 0; i < count; i += 1) z.set(`t2_player_${i}`, Date.now());
  redis.__zsets.set(keyLevelQualifiedPlayers(LEVEL), z);
};

const seedVotes = (likes: number, dislikes: number): void => {
  const h = new Map<string, string>();
  for (let i = 0; i < likes; i += 1) h.set(`t2_like_${i}`, '1');
  for (let i = 0; i < dislikes; i += 1) h.set(`t2_dislike_${i}`, '-1');
  redis.__hashes.set(keyCommunityVotes(LEVEL), h);
};

beforeEach(() => {
  redis.__hashes.clear();
  redis.__strings.clear();
  redis.__zsets.clear();
  getPuzzlePrivateMock.mockReset();
  updateQuestProgressOnAcclaimMock.mockReset();
  contextState.userId = 't2_voter';
  contextState.username = 'voter';
  getPuzzlePrivateMock.mockResolvedValue({ levelId: LEVEL, source: 'COMMUNITY' });
  seedHash(keyCommunitySubmissionsByLevel, { [LEVEL]: 'sub_1' });
  seedHash(keyCommunitySubmission('sub_1'), fullSubmissionHash);
});

describe('community acclaim voting', () => {
  it('rejects voting on a non-community puzzle', async () => {
    getPuzzlePrivateMock.mockResolvedValue({ levelId: LEVEL, source: 'DAILY' });
    await expect(
      recordCommunityVote({ levelId: LEVEL, vote: 'like' })
    ).rejects.toThrow('community challenges');
  });

  it("rejects the creator voting on their own challenge", async () => {
    contextState.userId = CREATOR;
    await expect(
      recordCommunityVote({ levelId: LEVEL, vote: 'like' })
    ).rejects.toThrow('your own challenge');
  });

  it('records a like, returns the tally and myVote, and toggles off on clear', async () => {
    const liked = await recordCommunityVote({ levelId: LEVEL, vote: 'like' });
    expect(liked).toEqual({ likes: 1, dislikes: 0, myVote: 'like' });

    const cleared = await recordCommunityVote({ levelId: LEVEL, vote: 'clear' });
    expect(cleared).toEqual({ likes: 0, dislikes: 0, myVote: null });
  });

  it('switches a like to a dislike without double-counting', async () => {
    await recordCommunityVote({ levelId: LEVEL, vote: 'like' });
    const disliked = await recordCommunityVote({ levelId: LEVEL, vote: 'dislike' });
    expect(disliked).toEqual({ likes: 0, dislikes: 1, myVote: 'dislike' });
  });

  it('does not credit acclaim below the bar', async () => {
    seedQualifiedPlayers(50); // < 200 play floor
    seedVotes(10, 0);
    await recordCommunityVote({ levelId: LEVEL, vote: 'like' });
    expect(updateQuestProgressOnAcclaimMock).not.toHaveBeenCalled();
    expect(redis.__strings.has(keyCommunityAcclaimAwarded(LEVEL))).toBe(false);
  });

  it('credits acclaim exactly once when the bar is crossed', async () => {
    seedQualifiedPlayers(300);
    seedVotes(180, 19); // +1 like from the voter below => 181/19, plays 300
    await recordCommunityVote({ levelId: LEVEL, vote: 'like' });

    expect(updateQuestProgressOnAcclaimMock).toHaveBeenCalledTimes(1);
    expect(updateQuestProgressOnAcclaimMock).toHaveBeenCalledWith({ userId: CREATOR });
    expect(redis.__strings.get(keyCommunityAcclaimAwarded(LEVEL))).toBe('1');
    expect(
      redis.__hashes.get(keyCommunityCreatorStats(CREATOR))?.get('acclaimed')
    ).toBe('1');

    // A second qualifying vote must NOT re-credit (award-once).
    await recordCommunityVote({ levelId: LEVEL, vote: 'clear' });
    await recordCommunityVote({ levelId: LEVEL, vote: 'like' });
    expect(updateQuestProgressOnAcclaimMock).toHaveBeenCalledTimes(1);
  });

  it('excludes the creator from the qualified-play count', async () => {
    // 200 players incl. the creator => 199 qualified, just under the floor.
    const z = new Map<string, number>();
    for (let i = 0; i < 199; i += 1) z.set(`t2_player_${i}`, Date.now());
    z.set(CREATOR, Date.now());
    redis.__zsets.set(keyLevelQualifiedPlayers(LEVEL), z);
    seedVotes(60, 0);
    await recordCommunityVote({ levelId: LEVEL, vote: 'like' });
    expect(updateQuestProgressOnAcclaimMock).not.toHaveBeenCalled();
  });

  it('reports vote state including the viewer current vote and ownership', async () => {
    seedVotes(5, 2);
    const state = await getCommunityVoteState(LEVEL);
    expect(state).toMatchObject({
      isCommunity: true,
      isOwnChallenge: false,
      likes: 5,
      dislikes: 2,
      myVote: null,
    });

    contextState.userId = CREATOR;
    const ownerState = await getCommunityVoteState(LEVEL);
    expect(ownerState.isOwnChallenge).toBe(true);
  });
});
