import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzleSource } from '../../shared/game';
import { buildPuzzle } from './puzzle';
import { getDefaultHardnessBoundsByTier } from './content';

const {
  getAllLevelIdsMock,
  getPuzzlePrivateMock,
  getQualifiedLevelTelemetryMock,
  redisGetMock,
  redisSetMock,
  redisZAddMock,
  redisZRangeMock,
} =
  vi.hoisted(() => ({
    getAllLevelIdsMock: vi.fn(),
    getPuzzlePrivateMock: vi.fn(),
    getQualifiedLevelTelemetryMock: vi.fn(),
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
    redisZAddMock: vi.fn(),
    redisZRangeMock: vi.fn(),
  }));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: redisGetMock,
    set: redisSetMock,
    zAdd: redisZAddMock,
    zRange: redisZRangeMock,
  },
}));

vi.mock('./puzzle-store', () => ({
  getAllLevelIds: getAllLevelIdsMock,
  getPuzzlePrivate: getPuzzlePrivateMock,
}));

vi.mock('./engagement', () => ({
  getQualifiedLevelTelemetry: getQualifiedLevelTelemetryMock,
}));

import {
  applyBiasToDifficulty,
  buildShadowCalibrationPreview,
  computeAdaptiveHardnessBounds,
  computeGlobalDailyBias,
  getGlobalDailyCalibrationSnapshot,
  observedTierFromTelemetry,
  observedTierFromSmoothedRate,
  readDifficultyCalibrationV3Artifact,
  runDifficultyCalibrationV3Chunk,
  smoothedWinRate,
  telemetryEaseScore,
  tierShift,
} from './difficulty-calibration';
import { buildChallengeEvaluation } from './challenge-evaluation';
import {
  keyChallengeEvaluation,
  keyChallengeEvaluationIndex,
  keyChallengeEvaluationPublishIndex,
  keyLevelDifficultyRating,
} from './keys';

const makePuzzle = (params: {
  levelId: string;
  difficulty: number;
  source: PuzzleSource;
  text?: string;
}) => {
  const built = buildPuzzle({
    levelId: params.levelId,
    dateKey: '2026-03-06',
    text: params.text ?? 'STONE TONES LEAST STEAL STALE',
    author: 'TEST',
    difficulty: params.difficulty,
    logicalPercent: 10,
    skipSolvabilityCheck: true,
    source: params.source,
  });
  return built.puzzlePrivate;
};

const makeTelemetry = (overrides?: Partial<Awaited<ReturnType<typeof getQualifiedLevelTelemetryMock>>> ) => ({
  plays: 0,
  wins: 0,
  failures: 0,
  abandons: 0,
  averageSolveSeconds: 0,
  averageMistakes: 0,
  averageUsedPowerups: 0,
  averageRetryCount: 0,
  fastSolveRate: 0,
  ...overrides,
});

afterEach(() => {
  getAllLevelIdsMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getQualifiedLevelTelemetryMock.mockReset();
  redisGetMock.mockReset();
  redisSetMock.mockReset();
  redisZAddMock.mockReset();
  redisZRangeMock.mockReset();
});

describe('difficulty calibration math', () => {
  it('computes Bayesian smoothed win rate', () => {
    expect(smoothedWinRate(0, 0)).toBeCloseTo(0.666667, 6);
    expect(smoothedWinRate(30, 30)).toBeCloseTo(0.944444, 6);
    expect(smoothedWinRate(0, 30)).toBeCloseTo(0.111111, 6);
  });

  it('maps observed tiers at threshold boundaries', () => {
    expect(observedTierFromSmoothedRate(0.72)).toBe('warmup');
    expect(observedTierFromSmoothedRate(0.71)).toBe('medium');
    expect(observedTierFromSmoothedRate(0.4)).toBe('hard');
    expect(observedTierFromSmoothedRate(0.41)).toBe('medium');
    expect(observedTierFromSmoothedRate(0.24)).toBe('expert');
  });

  it('downgrades observed tier when telemetry shows abandons, hints, and slow solves', () => {
    const observed = observedTierFromTelemetry({
      telemetry: makeTelemetry({
        plays: 30,
        wins: 18,
        failures: 5,
        abandons: 7,
        averageSolveSeconds: 130,
        averageUsedPowerups: 1.7,
        averageMistakes: 1.8,
        averageRetryCount: 1.1,
      }),
      targetTimeSeconds: 60,
    });

    expect(observed).toBe('hard');
  });

  it('reduces telemetry ease score as friction signals increase', () => {
    const smoothRun = telemetryEaseScore({
      wins: 20,
      plays: 30,
      failures: 2,
      abandons: 1,
      averageSolveSeconds: 45,
      averageUsedPowerups: 0.1,
      averageMistakes: 0.2,
      averageRetryCount: 0.1,
      targetTimeSeconds: 60,
    });
    const roughRun = telemetryEaseScore({
      wins: 20,
      plays: 30,
      failures: 5,
      abandons: 5,
      averageSolveSeconds: 140,
      averageUsedPowerups: 1.8,
      averageMistakes: 2.5,
      averageRetryCount: 1.4,
      targetTimeSeconds: 60,
    });

    expect(roughRun).toBeLessThan(smoothRun);
  });

  it('penalizes qualified failures more than stale abandons', () => {
    const withFailures = telemetryEaseScore({
      wins: 20,
      plays: 30,
      failures: 5,
      abandons: 0,
      averageSolveSeconds: 45,
      averageUsedPowerups: 0,
      averageMistakes: 0,
      averageRetryCount: 0,
      targetTimeSeconds: 60,
    });
    const withAbandons = telemetryEaseScore({
      wins: 20,
      plays: 30,
      failures: 0,
      abandons: 5,
      averageSolveSeconds: 45,
      averageUsedPowerups: 0,
      averageMistakes: 0,
      averageRetryCount: 0,
      targetTimeSeconds: 60,
    });

    expect(withAbandons).toBeGreaterThan(withFailures);
  });

  it('computes future-shift direction from primary to observed tier', () => {
    expect(tierShift('medium', 'warmup')).toBe(1);
    expect(tierShift('medium', 'hard')).toBe(-1);
    expect(tierShift('hard', 'warmup')).toBe(1);
  });

  it('caps telemetry bias to one difficulty point', () => {
    expect(applyBiasToDifficulty(2, 1)).toBe(3);
    expect(applyBiasToDifficulty(5, 1)).toBe(6);
    expect(applyBiasToDifficulty(9, 1)).toBe(10);
    expect(applyBiasToDifficulty(9, -1)).toBe(8);
    expect(applyBiasToDifficulty(5, -1)).toBe(4);
    expect(applyBiasToDifficulty(1, -1)).toBe(1);
  });
});

describe('difficulty calibration aggregation', () => {
  it('shares one cached artifact across bias and hardness computations', async () => {
    const redisStore = new Map<string, string>();
    redisGetMock.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    redisSetMock.mockImplementation(async (key: string, value: string) => {
      redisStore.set(key, value);
      return true;
    });
    const levelIds = ['lvl_9001', 'lvl_9002', 'lvl_9003', 'lvl_9004', 'lvl_9005'];
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makePuzzle({ levelId, difficulty: 5, source: 'AUTO_DAILY' })])
    );
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makeTelemetry({ plays: 30, wins: 15 })])
    );
    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const bias = await computeGlobalDailyBias();
    const bounds = await computeAdaptiveHardnessBounds();

    expect(bias).toBe(0);
    expect(bounds).toBeDefined();
    expect(getAllLevelIdsMock).toHaveBeenCalledTimes(1);
    expect(redisSetMock).toHaveBeenCalledTimes(1);
  });

  it('ignores stale Redis artifacts from older difficulty models', async () => {
    redisGetMock.mockResolvedValue(
      JSON.stringify({
        difficultyModelVersion: 'v1',
        snapshot: {
          biasTierShift: 1,
          eligibleLevels: 999,
          harderCount: 999,
          easierCount: 0,
          neutralCount: 0,
          averageCryptoHardness: 1,
          params: {},
        },
        hardnessBoundsByTier: getDefaultHardnessBoundsByTier(),
      })
    );
    redisSetMock.mockResolvedValue(true);
    getAllLevelIdsMock.mockResolvedValue([]);

    const snapshot = await getGlobalDailyCalibrationSnapshot();

    expect(snapshot.biasTierShift).toBe(0);
    expect(snapshot.eligibleLevels).toBe(0);
    expect(getAllLevelIdsMock).toHaveBeenCalledTimes(1);
    expect(redisSetMock).toHaveBeenCalledTimes(1);
  });

  it('returns neutral bias when eligible sample size is too small', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    const levelIds = ['lvl_0001', 'lvl_0002', 'lvl_0003', 'lvl_0004'];
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makePuzzle({ levelId, difficulty: 5, source: 'AUTO_DAILY' })])
    );
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makeTelemetry({ plays: 30, wins: 30 })])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(4);
    expect(snapshot.biasTierShift).toBe(0);
  });

  it('returns +1 bias when harder-shift share exceeds threshold', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    const levelIds = ['lvl_0010', 'lvl_0011', 'lvl_0012', 'lvl_0013', 'lvl_0014', 'lvl_0015', 'lvl_0016'];
    const puzzlesByLevel = Object.fromEntries([
      ['lvl_0010', makePuzzle({ levelId: 'lvl_0010', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0011', makePuzzle({ levelId: 'lvl_0011', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0012', makePuzzle({ levelId: 'lvl_0012', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0013', makePuzzle({ levelId: 'lvl_0013', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0014', makePuzzle({ levelId: 'lvl_0014', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0015', makePuzzle({ levelId: 'lvl_0015', difficulty: 5, source: 'MANUAL_INJECTED' })],
      ['lvl_0016', makePuzzle({ levelId: 'lvl_0016', difficulty: 5, source: 'UNKNOWN_LEGACY' })],
    ]);
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makeTelemetry({ plays: 30, wins: 30 })])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(5);
    expect(snapshot.harderCount).toBe(5);
    expect(snapshot.easierCount).toBe(0);
    expect(snapshot.biasTierShift).toBe(1);
    expect(await computeGlobalDailyBias()).toBe(1);
  });

  it('returns -1 bias when easier-shift share exceeds threshold', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    const levelIds = ['lvl_0020', 'lvl_0021', 'lvl_0022', 'lvl_0023', 'lvl_0024'];
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makePuzzle({ levelId, difficulty: 2, source: 'AUTO_DAILY' })])
    );
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makeTelemetry({ plays: 30, wins: 0 })])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(5);
    expect(snapshot.harderCount).toBe(0);
    expect(snapshot.easierCount).toBe(5);
    expect(snapshot.biasTierShift).toBe(-1);
  });

  it('responds when half of eligible levels agree on a bias direction', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    const levelIds = ['lvl_0025', 'lvl_0026', 'lvl_0027', 'lvl_0028', 'lvl_0029', 'lvl_0030'];
    const puzzlesByLevel = Object.fromEntries([
      ['lvl_0025', makePuzzle({ levelId: 'lvl_0025', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0026', makePuzzle({ levelId: 'lvl_0026', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0027', makePuzzle({ levelId: 'lvl_0027', difficulty: 9, source: 'AUTO_DAILY' })],
      ['lvl_0028', makePuzzle({ levelId: 'lvl_0028', difficulty: 5, source: 'AUTO_DAILY' })],
      ['lvl_0029', makePuzzle({ levelId: 'lvl_0029', difficulty: 5, source: 'AUTO_DAILY' })],
      ['lvl_0030', makePuzzle({ levelId: 'lvl_0030', difficulty: 5, source: 'AUTO_DAILY' })],
    ]);
    const telemetryByLevel = Object.fromEntries([
      ['lvl_0025', makeTelemetry({ plays: 30, wins: 30 })],
      ['lvl_0026', makeTelemetry({ plays: 30, wins: 30 })],
      ['lvl_0027', makeTelemetry({ plays: 30, wins: 30 })],
      ['lvl_0028', makeTelemetry({ plays: 30, wins: 15 })],
      ['lvl_0029', makeTelemetry({ plays: 30, wins: 15 })],
      ['lvl_0030', makeTelemetry({ plays: 30, wins: 15 })],
    ]);

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(6);
    expect(snapshot.harderCount).toBe(3);
    expect(snapshot.biasTierShift).toBe(1);
  });

  it('falls back to default hardness bounds when data is sparse', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    const levelIds = ['lvl_3000', 'lvl_3001', 'lvl_3002'];
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [
        levelId,
        makePuzzle({
          levelId,
          difficulty: 5,
          source: 'AUTO_DAILY',
          text: 'STONE TONES LEAST STEAL STALE',
        }),
      ])
    );
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makeTelemetry({ plays: 20, wins: 10 })])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(
      async (levelId: string) => puzzlesByLevel[levelId] ?? null
    );
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const adaptive = await computeAdaptiveHardnessBounds();
    const defaults = getDefaultHardnessBoundsByTier();
    expect(adaptive).toEqual(defaults);
  });

  it('adapts medium hardness bounds when enough medium-tier telemetry exists', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    const levelIds = Array.from({ length: 12 }, (_, index) => `lvl_31${index}`);
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [
        levelId,
        makePuzzle({
          levelId,
          difficulty: 5,
          source: 'AUTO_DAILY',
          text: 'PACK MY BOX WITH FIVE DOZEN LIQUOR JUGS',
        }),
      ])
    );
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makeTelemetry({ plays: 20, wins: 10 })])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(
      async (levelId: string) => puzzlesByLevel[levelId] ?? null
    );
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const adaptive = await computeAdaptiveHardnessBounds();
    const defaults = getDefaultHardnessBoundsByTier();

    expect(adaptive.medium.uniqueLetterBounds.min).toBeGreaterThan(
      defaults.medium.uniqueLetterBounds.min
    );
    expect(adaptive.medium.cryptoHardnessBounds.min).toBeGreaterThanOrEqual(
      defaults.medium.cryptoHardnessBounds.min
    );
  });

  it('reports snapshot averageCryptoHardness from median to resist outliers', async () => {
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue(true);
    const levelIds = ['lvl_5000', 'lvl_5001', 'lvl_5002', 'lvl_5003', 'lvl_5004'];
    const puzzlesByLevel = Object.fromEntries([
      ['lvl_5000', { ...makePuzzle({ levelId: 'lvl_5000', difficulty: 5, source: 'AUTO_DAILY' }), cryptoHardness: 0.1 }],
      ['lvl_5001', { ...makePuzzle({ levelId: 'lvl_5001', difficulty: 5, source: 'AUTO_DAILY' }), cryptoHardness: 0.2 }],
      ['lvl_5002', { ...makePuzzle({ levelId: 'lvl_5002', difficulty: 5, source: 'AUTO_DAILY' }), cryptoHardness: 0.3 }],
      ['lvl_5003', { ...makePuzzle({ levelId: 'lvl_5003', difficulty: 5, source: 'AUTO_DAILY' }), cryptoHardness: 0.4 }],
      ['lvl_5004', { ...makePuzzle({ levelId: 'lvl_5004', difficulty: 5, source: 'AUTO_DAILY' }), cryptoHardness: 1.0 }],
    ]);
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makeTelemetry({ plays: 30, wins: 15 })])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? makeTelemetry()
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(5);
    expect(snapshot.averageCryptoHardness).toBe(0.3);
  });
});

describe('difficulty calibration v3 shadow artifact', () => {
  it('ignores malformed V3 artifacts safely', async () => {
    redisGetMock.mockResolvedValue(JSON.stringify({ difficultyCalibrationVersion: 'v2' }));

    const artifact = await readDifficultyCalibrationV3Artifact();

    expect(artifact).toBeNull();
  });

  it('processes recent levels in chunks and writes a resumable artifact', async () => {
    const redisStore = new Map<string, string>();
    redisGetMock.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    redisSetMock.mockImplementation(async (key: string, value: string) => {
      redisStore.set(key, value);
      return true;
    });
    redisZAddMock.mockResolvedValue(undefined);
    const levelSources: Record<string, PuzzleSource> = {
      lvl_v3_daily: 'AUTO_DAILY',
      lvl_v3_manual: 'MANUAL_INJECTED',
      lvl_v3_community: 'COMMUNITY',
      lvl_v3_endless: 'AUTO_ENDLESS',
      lvl_v3_legacy: 'UNKNOWN_LEGACY',
    };
    const levelIds = Object.keys(levelSources);
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [
        levelId,
        makePuzzle({
          levelId,
          difficulty: 5,
          source: levelSources[levelId] ?? 'UNKNOWN_LEGACY',
          text: 'CLEAR SIGNALS MAKE FAIR PUZZLES',
        }),
      ])
    );
    for (const levelId of levelIds) {
      redisStore.set(
        keyLevelDifficultyRating(levelId),
        JSON.stringify({
          version: 'v1',
          rating: 5,
          uncertainty: 0.3,
          playCount: 35,
          updatedAt: Date.now(),
        })
      );
    }
    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(
      async (levelId: string) => puzzlesByLevel[levelId] ?? null
    );
    getQualifiedLevelTelemetryMock.mockImplementation(async () =>
      makeTelemetry({ plays: 20, wins: 12 })
    );

    const first = await runDifficultyCalibrationV3Chunk({
      chunkSize: 3,
    });
    const second = await runDifficultyCalibrationV3Chunk({
      offset: first.nextOffset ?? 0,
      processedLevels: first.processedLevels,
      updatedEvaluations: first.updatedEvaluations,
      qualifiedLevels: first.qualifiedLevels,
      shadowReadyLevels: first.shadowReadyLevels,
      shadowReadyLevelsBySource: first.shadowReadyLevelsBySource,
      chunkSize: 3,
    });

    expect(first.complete).toBe(false);
    expect(first.nextOffset).toBe(3);
    expect(second.complete).toBe(true);
    expect(second.processedLevels).toBe(5);
    expect(second.updatedEvaluations).toBe(5);
    expect(second.qualifiedLevels).toBe(5);
    expect(second.shadowReadyLevels).toBe(5);
    expect(second.shadowReadyLevelsBySource).toEqual({
      AUTO_DAILY: 1,
      AUTO_ENDLESS: 1,
      COMMUNITY: 1,
      MANUAL_INJECTED: 1,
      UNKNOWN_LEGACY: 1,
    });
    expect(redisZAddMock).toHaveBeenCalled();
  });

  it('reports admin-only mature shadow deltas without changing live difficulty', async () => {
    const redisStore = new Map<string, string>();
    const readyPuzzle = makePuzzle({
      levelId: 'lvl_shadow_ready',
      difficulty: 5,
      source: 'AUTO_DAILY',
    });
    const sparsePuzzle = makePuzzle({
      levelId: 'lvl_shadow_sparse',
      difficulty: 6,
      source: 'AUTO_DAILY',
    });
    const manualPuzzle = makePuzzle({
      levelId: 'lvl_shadow_manual',
      difficulty: 5,
      source: 'MANUAL_INJECTED',
    });
    const communityPuzzle = makePuzzle({
      levelId: 'lvl_shadow_community',
      difficulty: 5,
      source: 'COMMUNITY',
    });
    const baseReadyEvaluation = buildChallengeEvaluation({
      puzzle: readyPuzzle,
      shadowRatingSnapshot: {
        itemDifficultyRating: 8.4,
        itemUncertainty: 0.3,
        itemPlayCount: 35,
      },
    });
    const readyEvaluation = {
      ...baseReadyEvaluation,
      difficultyBreakdown: {
        ...baseReadyEvaluation.difficultyBreakdown,
        staticDifficulty: 5,
        calibratedDifficulty: 5,
      },
    };
    const sparseEvaluation = buildChallengeEvaluation({
      puzzle: sparsePuzzle,
      shadowRatingSnapshot: {
        itemDifficultyRating: 2.2,
        itemUncertainty: 0.8,
        itemPlayCount: 12,
      },
    });
    const baseManualEvaluation = buildChallengeEvaluation({
      puzzle: manualPuzzle,
      shadowRatingSnapshot: {
        itemDifficultyRating: 6.2,
        itemUncertainty: 0.25,
        itemPlayCount: 40,
      },
    });
    const manualEvaluation = {
      ...baseManualEvaluation,
      difficultyBreakdown: {
        ...baseManualEvaluation.difficultyBreakdown,
        staticDifficulty: 5,
        calibratedDifficulty: 5,
      },
    };
    const communityEvaluation = buildChallengeEvaluation({
      puzzle: communityPuzzle,
      shadowRatingSnapshot: {
        itemDifficultyRating: 8,
        itemUncertainty: 0.2,
        itemPlayCount: 45,
      },
    });
    redisStore.set(
      keyChallengeEvaluation(readyPuzzle.levelId),
      JSON.stringify(readyEvaluation)
    );
    redisStore.set(
      keyChallengeEvaluation(sparsePuzzle.levelId),
      JSON.stringify(sparseEvaluation)
    );
    redisStore.set(
      keyChallengeEvaluation(manualPuzzle.levelId),
      JSON.stringify(manualEvaluation)
    );
    redisStore.set(
      keyChallengeEvaluation(communityPuzzle.levelId),
      JSON.stringify(communityEvaluation)
    );
    redisGetMock.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    redisZRangeMock.mockResolvedValue([
      { member: readyPuzzle.levelId, score: 4 },
      { member: sparsePuzzle.levelId, score: 3 },
      { member: manualPuzzle.levelId, score: 2 },
      { member: communityPuzzle.levelId, score: 1 },
    ]);

    const preview = await buildShadowCalibrationPreview();

    expect(redisZRangeMock).toHaveBeenCalledWith(
      keyChallengeEvaluationPublishIndex,
      0,
      179,
      {
        by: 'rank',
        reverse: true,
      }
    );
    expect(preview.readyLevels).toBe(2);
    expect(preview.reviewCandidates).toHaveLength(2);
    expect(preview.reviewCandidates.map((candidate) => candidate.levelId)).toEqual([
      readyPuzzle.levelId,
      manualPuzzle.levelId,
    ]);
    expect(preview.reviewCandidates[0]?.source).toBe('AUTO_DAILY');
    expect(preview.reviewCandidates[1]?.source).toBe('MANUAL_INJECTED');
    expect(preview.reviewCandidates[0]?.recommendedShift).toBe(1);
    expect(preview.tierBreakdown.warmup).toEqual({
      readyLevels: 0,
      averageDelta: 0,
      suggestEasier: 0,
      suggestHarder: 0,
    });
    expect(preview.tierBreakdown.medium).toEqual({
      readyLevels: 2,
      averageDelta: 2.3,
      suggestEasier: 0,
      suggestHarder: 2,
    });
    expect(readyEvaluation.difficultyBreakdown.calibratedDifficulty).toBe(
      readyEvaluation.difficultyBreakdown.staticDifficulty
    );
  });

  it('builds shadow preview from publish-recency instead of evaluation-recency', async () => {
    const redisStore = new Map<string, string>();
    const oldPuzzle = {
      ...makePuzzle({
        levelId: 'lvl_shadow_old_reevaluated',
        difficulty: 5,
        source: 'AUTO_DAILY',
      }),
      createdAt: 1_000,
    };
    const newPuzzle = {
      ...makePuzzle({
        levelId: 'lvl_shadow_new_published',
        difficulty: 5,
        source: 'AUTO_DAILY',
      }),
      createdAt: 2_000,
    };
    const oldEvaluation = buildChallengeEvaluation({
      puzzle: oldPuzzle,
      createdAt: 3_000,
      shadowRatingSnapshot: {
        itemDifficultyRating: 8,
        itemUncertainty: 0.2,
        itemPlayCount: 40,
      },
    });
    const newEvaluation = buildChallengeEvaluation({
      puzzle: newPuzzle,
      createdAt: 2_500,
      shadowRatingSnapshot: {
        itemDifficultyRating: 6.5,
        itemUncertainty: 0.2,
        itemPlayCount: 40,
      },
    });
    redisStore.set(
      keyChallengeEvaluation(oldPuzzle.levelId),
      JSON.stringify(oldEvaluation)
    );
    redisStore.set(
      keyChallengeEvaluation(newPuzzle.levelId),
      JSON.stringify(newEvaluation)
    );
    redisGetMock.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    redisZRangeMock.mockImplementation(async (key: string) =>
      key === keyChallengeEvaluationPublishIndex
        ? [{ member: newPuzzle.levelId, score: newPuzzle.createdAt }]
        : [{ member: oldPuzzle.levelId, score: oldEvaluation.createdAt }]
    );

    const preview = await buildShadowCalibrationPreview();

    expect(redisZRangeMock).toHaveBeenCalledWith(
      keyChallengeEvaluationPublishIndex,
      0,
      179,
      {
        by: 'rank',
        reverse: true,
      }
    );
    expect(preview.reviewCandidates).toHaveLength(1);
    expect(preview.reviewCandidates[0]?.levelId).toBe(newPuzzle.levelId);
  });

  it('uses hysteresis and confidence-weighted sorting for shadow review candidates', async () => {
    const redisStore = new Map<string, string>();
    const candidates = [
      {
        levelId: 'lvl_shadow_noisy_large_delta',
        shadowDifficulty: 7.1,
        itemUncertainty: 0.49,
      },
      {
        levelId: 'lvl_shadow_confident_delta',
        shadowDifficulty: 6.8,
        itemUncertainty: 0.2,
      },
      {
        levelId: 'lvl_shadow_inside_upper_band',
        shadowDifficulty: 5.75,
        itemUncertainty: 0.1,
      },
      {
        levelId: 'lvl_shadow_inside_lower_band',
        shadowDifficulty: 4.25,
        itemUncertainty: 0.1,
      },
      {
        levelId: 'lvl_shadow_easier',
        shadowDifficulty: 4,
        itemUncertainty: 0.25,
      },
    ];

    for (const candidate of candidates) {
      const puzzle = makePuzzle({
        levelId: candidate.levelId,
        difficulty: 5,
        source: 'AUTO_DAILY',
      });
      const evaluation = buildChallengeEvaluation({
        puzzle,
        shadowRatingSnapshot: {
          itemDifficultyRating: candidate.shadowDifficulty,
          itemUncertainty: candidate.itemUncertainty,
          itemPlayCount: 40,
        },
      });
      redisStore.set(
        keyChallengeEvaluation(candidate.levelId),
        JSON.stringify({
          ...evaluation,
          difficultyBreakdown: {
            ...evaluation.difficultyBreakdown,
            staticDifficulty: 5,
          },
        })
      );
    }
    redisGetMock.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    redisZRangeMock.mockResolvedValue(
      candidates.map((candidate, index) => ({
        member: candidate.levelId,
        score: index,
      }))
    );

    const preview = await buildShadowCalibrationPreview();

    expect(preview.readyLevels).toBe(candidates.length);
    const confidentIndex = preview.reviewCandidates.findIndex(
      (candidate) => candidate.levelId === 'lvl_shadow_confident_delta'
    );
    const noisyIndex = preview.reviewCandidates.findIndex(
      (candidate) => candidate.levelId === 'lvl_shadow_noisy_large_delta'
    );

    expect(confidentIndex).toBeGreaterThanOrEqual(0);
    expect(noisyIndex).toBeGreaterThanOrEqual(0);
    expect(confidentIndex).toBeLessThan(noisyIndex);
    expect(
      preview.reviewCandidates.find(
        (candidate) => candidate.levelId === 'lvl_shadow_inside_upper_band'
      )?.recommendedShift
    ).toBe(0);
    expect(
      preview.reviewCandidates.find(
        (candidate) => candidate.levelId === 'lvl_shadow_inside_lower_band'
      )?.recommendedShift
    ).toBe(0);
    expect(
      preview.reviewCandidates.find(
        (candidate) => candidate.levelId === 'lvl_shadow_confident_delta'
      )?.recommendedShift
    ).toBe(1);
    expect(
      preview.reviewCandidates.find(
        (candidate) => candidate.levelId === 'lvl_shadow_easier'
      )?.recommendedShift
    ).toBe(-1);
    expect(preview.tierBreakdown.medium).toEqual({
      readyLevels: 5,
      averageDelta: 0.58,
      suggestEasier: 1,
      suggestHarder: 2,
    });
  });
});
