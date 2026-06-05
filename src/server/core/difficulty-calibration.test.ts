import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPuzzle } from './puzzle';
import { getDefaultHardnessBoundsByTier } from './content';

const {
  getAllLevelIdsMock,
  getPuzzlePrivateMock,
  getQualifiedLevelTelemetryMock,
  redisGetMock,
  redisSetMock,
} =
  vi.hoisted(() => ({
    getAllLevelIdsMock: vi.fn(),
    getPuzzlePrivateMock: vi.fn(),
    getQualifiedLevelTelemetryMock: vi.fn(),
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
  }));

vi.mock('@devvit/web/server', () => ({
  redis: {
    get: redisGetMock,
    set: redisSetMock,
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
  computeAdaptiveHardnessBounds,
  computeGlobalDailyBias,
  getGlobalDailyCalibrationSnapshot,
  observedTierFromTelemetry,
  observedTierFromSmoothedRate,
  smoothedWinRate,
  telemetryEaseScore,
  tierShift,
} from './difficulty-calibration';

const makePuzzle = (params: {
  levelId: string;
  difficulty: number;
  source: 'AUTO_DAILY' | 'MANUAL_INJECTED' | 'UNKNOWN_LEGACY';
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

    expect(observed).toBe('expert');
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

  it('computes future-shift direction from primary to observed tier', () => {
    expect(tierShift('medium', 'warmup')).toBe(1);
    expect(tierShift('medium', 'hard')).toBe(-1);
    expect(tierShift('hard', 'warmup')).toBe(1);
  });

  it('applies one-tier bias while preserving relative tier position', () => {
    expect(applyBiasToDifficulty(2, 1)).toBe(5);
    expect(applyBiasToDifficulty(5, 1)).toBe(8);
    expect(applyBiasToDifficulty(9, 1)).toBe(9);
    expect(applyBiasToDifficulty(9, -1)).toBe(6);
    expect(applyBiasToDifficulty(5, -1)).toBe(3);
    expect(applyBiasToDifficulty(2, -1)).toBe(2);
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
