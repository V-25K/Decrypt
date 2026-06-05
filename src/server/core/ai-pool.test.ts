import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createValidationPipelineMock,
  generatePuzzlePhraseBatchMock,
  getRecentUsedSignatureEntriesMock,
  getDecryptSettingsMock,
  clearUsedSignatureMock,
  computeAdaptiveHardnessBoundsMock,
  redisDelMock,
  redisGetMock,
  redisIncrByMock,
  redisMGetMock,
  redisSetMock,
  redisZAddMock,
  redisZCardMock,
  redisZRangeMock,
  redisZRemMock,
  reserveUsedSignatureMock,
} = vi.hoisted(() => ({
  createValidationPipelineMock: vi.fn(),
  generatePuzzlePhraseBatchMock: vi.fn(),
  getRecentUsedSignatureEntriesMock: vi.fn(),
  getDecryptSettingsMock: vi.fn(),
  clearUsedSignatureMock: vi.fn(),
  computeAdaptiveHardnessBoundsMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisIncrByMock: vi.fn(),
  redisMGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  redisZAddMock: vi.fn(),
  redisZCardMock: vi.fn(),
  redisZRangeMock: vi.fn(),
  redisZRemMock: vi.fn(),
  reserveUsedSignatureMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  redis: {
    del: redisDelMock,
    get: redisGetMock,
    incrBy: redisIncrByMock,
    mGet: redisMGetMock,
    set: redisSetMock,
    zAdd: redisZAddMock,
    zCard: redisZCardMock,
    zRange: redisZRangeMock,
    zRem: redisZRemMock,
  },
}));

vi.mock('./config', () => ({
  getDecryptSettings: getDecryptSettingsMock,
}));

vi.mock('./ai', () => ({
  aiChallengeTypePool: ['QUOTE'],
  generatePuzzlePhraseBatch: generatePuzzlePhraseBatchMock,
}));

vi.mock('./difficulty-calibration', () => ({
  computeAdaptiveHardnessBounds: computeAdaptiveHardnessBoundsMock,
}));

vi.mock('./validation-pipeline', () => ({
  createValidationPipeline: createValidationPipelineMock,
}));

vi.mock('./puzzle-store', () => ({
  clearUsedSignature: clearUsedSignatureMock,
  getRecentUsedSignatureEntries: getRecentUsedSignatureEntriesMock,
  reserveUsedSignature: reserveUsedSignatureMock,
}));

import {
  ensureAICandidatePoolSelection,
  takeAICandidateBatch,
  warmAICandidatePool,
} from './ai-pool';

beforeEach(() => {
  getDecryptSettingsMock.mockResolvedValue({
    geminiApiKey: 'api-key',
    contentSafetyMode: 'strict',
  });
  computeAdaptiveHardnessBoundsMock.mockResolvedValue(undefined);
  getRecentUsedSignatureEntriesMock.mockResolvedValue([]);
  clearUsedSignatureMock.mockResolvedValue(undefined);
  createValidationPipelineMock.mockReturnValue({
    phase1: () => ({ valid: true, reasons: [] }),
    duplicate: async () => ({
      duplicate: false,
      normalizedSignature: 'HELLOWORLD',
      tokenSignature: 'HELLO WORLD',
      reason: null,
    }),
  });
  redisZCardMock.mockResolvedValue(0);
  redisSetMock.mockResolvedValue(true);
  redisZAddMock.mockResolvedValue(undefined);
  redisZRangeMock.mockResolvedValue([]);
  redisZRemMock.mockResolvedValue(undefined);
  redisDelMock.mockResolvedValue(undefined);
  redisGetMock.mockResolvedValue(null);
  redisMGetMock.mockResolvedValue([]);
  reserveUsedSignatureMock.mockResolvedValue(true);
});

afterEach(() => {
  createValidationPipelineMock.mockReset();
  generatePuzzlePhraseBatchMock.mockReset();
  getRecentUsedSignatureEntriesMock.mockReset();
  getDecryptSettingsMock.mockReset();
  clearUsedSignatureMock.mockReset();
  computeAdaptiveHardnessBoundsMock.mockReset();
  redisDelMock.mockReset();
  redisGetMock.mockReset();
  redisIncrByMock.mockReset();
  redisMGetMock.mockReset();
  redisSetMock.mockReset();
  redisZAddMock.mockReset();
  redisZCardMock.mockReset();
  redisZRangeMock.mockReset();
  redisZRemMock.mockReset();
  reserveUsedSignatureMock.mockReset();
});

describe('ensureAICandidatePoolSelection', () => {
  it('deduplicates identical phrases inside the pool via reserved signatures', async () => {
    redisIncrByMock.mockImplementation(async (key: string) => {
      if (key.includes('cursor')) {
        return 1;
      }
      if (key.includes('candidate_sequence')) {
        return 1;
      }
      return 1;
    });
    let firstReservationAccepted = false;
    redisSetMock.mockImplementation(async (key: string) => {
      const keyText = String(key);
      if (keyText.includes('reserved_signature:HELLOWORLD')) {
        if (!firstReservationAccepted) {
          firstReservationAccepted = true;
          return true;
        }
        return false;
      }
      return true;
    });

    generatePuzzlePhraseBatchMock.mockResolvedValue({
      candidates: [
        { text: 'HELLO WORLD', author: 'AUTHOR', challengeType: 'QUOTE' },
        { text: 'HELLO WORLD', author: 'AUTHOR', challengeType: 'QUOTE' },
      ],
      totalRequested: 2,
      totalReturned: 2,
    });

    const result = await ensureAICandidatePoolSelection({
      difficulty: 2,
      preferredType: 'QUOTE',
      minimumCandidates: 2,
    });

    expect(result.generated).toBe(1);
    expect(redisZAddMock).toHaveBeenCalledTimes(1);
    expect(redisSetMock).toHaveBeenCalledWith(
      'decrypt:ai_pool:reserved_signature:HELLOWORLD',
      expect.any(String),
      expect.objectContaining({ nx: true, expiration: expect.any(Date) })
    );
    expect(reserveUsedSignatureMock).toHaveBeenCalledWith('HELLOWORLD', expect.any(String));
  });
});

describe('takeAICandidateBatch', () => {
  it('releases the reserved pool signature but keeps the main ledger reservation when consuming a candidate', async () => {
    redisZRangeMock.mockResolvedValue([{ member: 'pool_00000001', score: 1 }]);
    redisMGetMock
      .mockResolvedValueOnce([
        JSON.stringify({
          id: 'pool_00000001',
          text: 'HELLO WORLD',
          author: 'AUTHOR',
          challengeType: 'QUOTE',
          normalizedSignature: 'HELLOWORLD',
          sourceDifficulty: 2,
          tier: 'warmup',
          createdAt: 1,
        }),
      ])
      .mockResolvedValueOnce(['HELLOWORLD']);
    redisGetMock.mockImplementation(async (key: string) => {
      if (key.includes('reserved_signature:HELLOWORLD')) {
        return 'pool_00000001';
      }
      return null;
    });

    const result = await takeAICandidateBatch({
      difficulty: 2,
      preferredType: 'QUOTE',
      batchSize: 1,
    });

    expect(result.candidates).toEqual([
      {
        text: 'HELLO WORLD',
        author: 'AUTHOR',
        challengeType: 'QUOTE',
        reservationOwnerToken: 'pool_00000001',
      },
    ]);
    expect(redisDelMock).toHaveBeenCalledWith(
      'decrypt:ai_pool:reserved_signature:HELLOWORLD'
    );
    expect(clearUsedSignatureMock).not.toHaveBeenCalledWith('HELLOWORLD', 'pool_00000001');
  });

  it('clears stale reservations when the pool entry payload is missing', async () => {
    redisZRangeMock.mockResolvedValue([{ member: 'pool_00000002', score: 2 }]);
    redisMGetMock.mockResolvedValueOnce([null]).mockResolvedValueOnce(['STALESIGNATURE']);
    redisGetMock.mockImplementation(async (key: string) => {
      if (key.includes('reserved_signature:STALESIGNATURE')) {
        return 'pool_00000002';
      }
      return null;
    });

    const result = await takeAICandidateBatch({
      difficulty: 2,
      preferredType: 'QUOTE',
      batchSize: 1,
    });

    expect(result.candidates).toEqual([]);
    expect(redisDelMock).toHaveBeenCalledWith(
      'decrypt:ai_pool:reserved_signature:STALESIGNATURE'
    );
    expect(clearUsedSignatureMock).toHaveBeenCalledWith('STALESIGNATURE', 'pool_00000002');
  });
});

describe('warmAICandidatePool', () => {
  it('prunes pool buckets before attempting scheduled warming', async () => {
    redisZRangeMock.mockResolvedValue([{ member: 'pool_00000003', score: 3 }]);
    redisMGetMock.mockResolvedValueOnce([null]).mockResolvedValueOnce(['STALESIGNATURE']);
    redisGetMock.mockImplementation(async (key: string) => {
      if (key.includes('reserved_signature:STALESIGNATURE')) {
        return 'pool_00000003';
      }
      return null;
    });
    redisZCardMock.mockResolvedValue(6);

    await warmAICandidatePool({ maxCandidatesToGenerate: 1 });

    expect(redisDelMock).toHaveBeenCalledWith(
      'decrypt:ai_pool:reserved_signature:STALESIGNATURE'
    );
    expect(generatePuzzlePhraseBatchMock).not.toHaveBeenCalled();
  });
});
