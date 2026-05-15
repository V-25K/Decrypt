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
} = vi.hoisted(() => ({
  delMock: vi.fn(async (key: string) => {
    const deletedString = stringState.delete(key);
    const deletedHash = hashState.delete(key);
    return deletedString || deletedHash ? 1 : 0;
  }),
  getAllLevelIdsMock: vi.fn(),
  getIndexedSessionKeysMock: vi.fn(),
  getKnownUserIdsMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getTrackedUserDailyDataDatesMock: vi.fn(),
  hashState: new Map<string, Record<string, string>>(),
  stringState: new Map<string, string>(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    del: delMock,
    get: vi.fn(async (key: string) => stringState.get(key) ?? null),
    hGetAll: vi.fn(async (key: string) => hashState.get(key) ?? {}),
    hKeys: vi.fn(async (key: string) => Object.keys(hashState.get(key) ?? {})),
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
});
