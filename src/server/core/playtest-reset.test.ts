import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  delMock,
  getAllLevelIdsMock,
  getIndexedSessionKeysMock,
  getKnownUserIdsMock,
  getPuzzlePrivateMock,
  getTrackedUserDailyDataDatesMock,
  hashState,
  stringState,
  sortedSetState,
} = vi.hoisted(() => ({
  delMock: vi.fn(async (key: string) => {
    const deletedString = stringState.delete(key);
    const deletedHash = hashState.delete(key);
    const deletedSortedSet = sortedSetState.delete(key);
    return deletedString || deletedHash || deletedSortedSet ? 1 : 0;
  }),
  getAllLevelIdsMock: vi.fn(),
  getIndexedSessionKeysMock: vi.fn(),
  getKnownUserIdsMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getTrackedUserDailyDataDatesMock: vi.fn(),
  hashState: new Map<string, Record<string, string>>(),
  stringState: new Map<string, string>(),
  sortedSetState: new Map<string, Array<{ member: string; score: number }>>(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    del: delMock,
    get: vi.fn(async (key: string) => stringState.get(key) ?? null),
    hGetAll: vi.fn(async (key: string) => hashState.get(key) ?? {}),
    hKeys: vi.fn(async (key: string) => Object.keys(hashState.get(key) ?? {})),
    zRange: vi.fn(async (key: string) => sortedSetState.get(key) ?? []),
  },
}));

vi.mock('./puzzle-store', () => ({
  getAllLevelIds: getAllLevelIdsMock,
  getPuzzlePrivate: getPuzzlePrivateMock,
}));

vi.mock('./serde', () => ({
  formatDateKey: vi.fn(() => '2026-05-02'),
}));

vi.mock('./session', () => ({
  getIndexedSessionKeys: getIndexedSessionKeysMock,
}));

vi.mock('./state', () => ({
  getKnownUserIds: getKnownUserIdsMock,
  getTrackedUserDailyDataDates: getTrackedUserDailyDataDatesMock,
}));

import { clearSubredditGameData } from './playtest-reset';
import {
  keyAIPoolCandidate,
  keyAIPoolCandidateSequence,
  keyAIPoolCandidateSignature,
  keyCompletionFinalizeJournal,
  keyCompletionFinalizeLock,
  keyGrantedOrderSkus,
  keyKnownUsersIndex,
  keyModeratorAccessCacheIndex,
  keyOrderGrantRecord,
  keyPaymentOrderIndex,
  keyCommunityApprovalLock,
  keyCommunityCreatorStats,
  keyCommunityPendingSignatures,
  keyCommunityPuzzlePlays,
  keyCommunityRemovedLevels,
  keyCommunitySubmission,
  keyCommunitySubmissionsApproved,
  keyCommunitySubmissionsByAuthor,
  keyCommunitySubmissionsByLevel,
  keyCommunitySubmissionsPending,
  keyCommunitySubmissionsRejected,
  keyCommunitySubmissionsRemoved,
  keyPuzzlePrivate,
  keyProcessedOrder,
  keyRefundProcessedOrder,
  keySessionIndex,
  keyShareCompletionReceipt,
  keySharedLevels,
  keyUserCoinHeartPurchases,
  keyUserCompleted,
  keyUserDailyDataDates,
  keyUserDailyRetryCounts,
  keyUserFailedLevels,
  keyUserProfile,
  keyUserQuestDaily,
} from './keys';

describe('clearSubredditGameData', () => {
  afterEach(() => {
    delMock.mockClear();
    getAllLevelIdsMock.mockReset();
    getIndexedSessionKeysMock.mockReset();
    getKnownUserIdsMock.mockReset();
    getPuzzlePrivateMock.mockReset();
    getTrackedUserDailyDataDatesMock.mockReset();
    hashState.clear();
    stringState.clear();
    sortedSetState.clear();
  });

  it('clears indexed daily data, payment records, and moderator cache keys', async () => {
    getKnownUserIdsMock.mockResolvedValue(['u1']);
    getIndexedSessionKeysMock.mockResolvedValue(['decrypt:session:u1:t3_post']);
    getAllLevelIdsMock.mockResolvedValue(['lvl_1', 'lvl_2']);
    getTrackedUserDailyDataDatesMock.mockResolvedValue(['2026-03-31']);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => {
      if (levelId === 'lvl_1') {
        return { dateKey: '2026-04-01' };
      }
      if (levelId === 'lvl_2') {
        return { dateKey: '2026-04-02' };
      }
      return null;
    });

    hashState.set(keyUserProfile('u1'), {
      lastPlayedDateKey: '2026-04-02',
    });
    hashState.set(keyUserCompleted('u1'), { lvl_1: '1' });
    hashState.set(keyUserFailedLevels('u1'), { lvl_2: '1' });
    hashState.set(keyUserDailyRetryCounts('u1'), { lvl_1: '1' });
    hashState.set(keySharedLevels('u1'), { lvl_2: '1' });
    hashState.set(keyUserDailyDataDates('u1'), { '2026-03-31': '1' });
    hashState.set(keyUserQuestDaily('u1', '2026-03-31'), { dailyPlayCount: '1' });
    stringState.set(keyUserCoinHeartPurchases('u1', '2026-03-31'), '1');
    hashState.set(keyShareCompletionReceipt('u1', 'lvl_2'), { levelId: 'lvl_2' });
    stringState.set(keyCompletionFinalizeLock('u1', 'lvl_1'), '1');
    stringState.set(keyCompletionFinalizeJournal('u1', 'lvl_1'), '1');

    hashState.set(keyPaymentOrderIndex, { order_1: '1' });
    stringState.set(keyOrderGrantRecord('order_1'), '{"status":"fulfilled"}');
    stringState.set(keyGrantedOrderSkus('order_1'), '["rookie_stash"]');
    stringState.set(keyProcessedOrder('order_1'), '1');
    stringState.set(keyRefundProcessedOrder('order_1'), '1');

    hashState.set(keyModeratorAccessCacheIndex, {
      'decrypt:cache:mod:decrypttest:mod_user': '1',
    });
    stringState.set('decrypt:cache:mod:decrypttest:mod_user', '1');

    stringState.set(keyAIPoolCandidateSequence, '1');
    stringState.set(keyAIPoolCandidateSignature('pool_00000001'), 'HELLOWORLD');
    stringState.set(keyAIPoolCandidate('pool_00000001'), '{"id":"pool_00000001"}');

    hashState.set(keyKnownUsersIndex, { u1: '1' });
    hashState.set(keySessionIndex, { 'decrypt:session:u1:t3_post': '1' });

    const result = await clearSubredditGameData();

    expect(result.knownUsers).toBe(1);
    expect(result.sessions).toBe(1);
    expect(result.deletedKeys).toBeGreaterThan(0);

    expect(hashState.has(keyUserQuestDaily('u1', '2026-03-31'))).toBe(false);
    expect(stringState.has(keyUserCoinHeartPurchases('u1', '2026-03-31'))).toBe(false);
    expect(hashState.has(keyPaymentOrderIndex)).toBe(false);
    expect(stringState.has(keyOrderGrantRecord('order_1'))).toBe(false);
    expect(stringState.has(keyGrantedOrderSkus('order_1'))).toBe(false);
    expect(stringState.has(keyProcessedOrder('order_1'))).toBe(false);
    expect(stringState.has(keyRefundProcessedOrder('order_1'))).toBe(false);
    expect(stringState.has('decrypt:cache:mod:decrypttest:mod_user')).toBe(false);
    expect(hashState.has(keyModeratorAccessCacheIndex)).toBe(false);
    expect(hashState.has(keyKnownUsersIndex)).toBe(false);
    expect(hashState.has(keySessionIndex)).toBe(false);
  });

  it('clears community cipher submissions from creator and review indexes', async () => {
    getKnownUserIdsMock.mockResolvedValue(['creator_1']);
    getIndexedSessionKeysMock.mockResolvedValue([]);
    getAllLevelIdsMock.mockResolvedValue([]);
    getTrackedUserDailyDataDatesMock.mockResolvedValue([]);
    getPuzzlePrivateMock.mockResolvedValue({ dateKey: '2026-04-03' });

    sortedSetState.set(keyCommunitySubmissionsByAuthor('creator_1'), [
      { member: 'sub_pending', score: 1 },
      { member: 'sub_withdrawn', score: 2 },
    ]);
    sortedSetState.set(keyCommunitySubmissionsPending, [
      { member: 'sub_pending', score: 1 },
    ]);
    sortedSetState.set(keyCommunitySubmissionsApproved, [
      { member: 'sub_approved', score: 3 },
    ]);
    sortedSetState.set(keyCommunitySubmissionsRejected, [
      { member: 'sub_rejected', score: 4 },
    ]);
    sortedSetState.set(keyCommunitySubmissionsRemoved, [
      { member: 'sub_removed', score: 5 },
    ]);
    hashState.set(keyCommunitySubmissionsByLevel, {
      lvl_community_1: 'sub_approved',
    });
    hashState.set(keyCommunityRemovedLevels, {
      lvl_community_2: 'sub_removed',
    });
    hashState.set(keyCommunityPendingSignatures, {
      PENDINGTEXT: 'sub_pending',
    });
    for (const [submissionId, levelId] of [
      ['sub_pending', ''],
      ['sub_withdrawn', ''],
      ['sub_approved', 'lvl_community_1'],
      ['sub_rejected', ''],
      ['sub_removed', 'lvl_community_2'],
    ]) {
      hashState.set(keyCommunitySubmission(submissionId), {
        authorId: 'creator_1',
        levelId,
      });
      stringState.set(keyCommunityApprovalLock(submissionId), 'lock');
    }
    hashState.set(keyCommunityCreatorStats('creator_1'), { submitted: '5' });
    hashState.set(keyCommunityPuzzlePlays('lvl_community_1'), { totalPlays: '7' });
    hashState.set(keyCommunityPuzzlePlays('lvl_community_2'), { totalPlays: '3' });
    stringState.set(keyPuzzlePrivate('lvl_community_1'), '{"levelId":"lvl_community_1"}');
    stringState.set(keyPuzzlePrivate('lvl_community_2'), '{"levelId":"lvl_community_2"}');

    await clearSubredditGameData();

    expect(sortedSetState.has(keyCommunitySubmissionsByAuthor('creator_1'))).toBe(false);
    expect(sortedSetState.has(keyCommunitySubmissionsPending)).toBe(false);
    expect(sortedSetState.has(keyCommunitySubmissionsApproved)).toBe(false);
    expect(sortedSetState.has(keyCommunitySubmissionsRejected)).toBe(false);
    expect(sortedSetState.has(keyCommunitySubmissionsRemoved)).toBe(false);
    expect(hashState.has(keyCommunitySubmissionsByLevel)).toBe(false);
    expect(hashState.has(keyCommunityRemovedLevels)).toBe(false);
    expect(hashState.has(keyCommunityPendingSignatures)).toBe(false);
    expect(hashState.has(keyCommunityCreatorStats('creator_1'))).toBe(false);
    expect(hashState.has(keyCommunityPuzzlePlays('lvl_community_1'))).toBe(false);
    expect(hashState.has(keyCommunityPuzzlePlays('lvl_community_2'))).toBe(false);
    for (const submissionId of [
      'sub_pending',
      'sub_withdrawn',
      'sub_approved',
      'sub_rejected',
      'sub_removed',
    ]) {
      expect(hashState.has(keyCommunitySubmission(submissionId))).toBe(false);
      expect(stringState.has(keyCommunityApprovalLock(submissionId))).toBe(false);
    }
    expect(stringState.has(keyPuzzlePrivate('lvl_community_1'))).toBe(false);
    expect(stringState.has(keyPuzzlePrivate('lvl_community_2'))).toBe(false);
  });
});
