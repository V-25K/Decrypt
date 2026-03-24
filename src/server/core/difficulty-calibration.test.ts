import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPuzzle } from './puzzle';

const { getAllLevelIdsMock, getPuzzlePrivateMock, getQualifiedLevelTelemetryMock } =
  vi.hoisted(() => ({
    getAllLevelIdsMock: vi.fn(),
    getPuzzlePrivateMock: vi.fn(),
    getQualifiedLevelTelemetryMock: vi.fn(),
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
  computeGlobalDailyBias,
  getGlobalDailyCalibrationSnapshot,
  observedTierFromSmoothedRate,
  smoothedWinRate,
  tierShift,
} from './difficulty-calibration';

const makePuzzle = (params: {
  levelId: string;
  difficulty: number;
  source: 'AUTO_DAILY' | 'MANUAL_INJECTED' | 'UNKNOWN_LEGACY';
}) => {
  const built = buildPuzzle({
    levelId: params.levelId,
    dateKey: '2026-03-06',
    text: 'STONE TONES LEAST STEAL STALE',
    author: 'TEST',
    difficulty: params.difficulty,
    logicalPercent: 10,
    skipSolvabilityCheck: true,
    source: params.source,
  });
  return built.puzzlePrivate;
};

afterEach(() => {
  getAllLevelIdsMock.mockReset();
  getPuzzlePrivateMock.mockReset();
  getQualifiedLevelTelemetryMock.mockReset();
});

describe('difficulty calibration math', () => {
  it('computes Bayesian smoothed win rate', () => {
    expect(smoothedWinRate(0, 0)).toBe(0.6);
    expect(smoothedWinRate(30, 30)).toBeCloseTo(0.9, 6);
    expect(smoothedWinRate(0, 30)).toBeCloseTo(0.15, 6);
  });

  it('maps observed tiers at threshold boundaries', () => {
    expect(observedTierFromSmoothedRate(0.72)).toBe('easy');
    expect(observedTierFromSmoothedRate(0.71)).toBe('medium');
    expect(observedTierFromSmoothedRate(0.4)).toBe('hard');
    expect(observedTierFromSmoothedRate(0.41)).toBe('medium');
  });

  it('computes future-shift direction from primary to observed tier', () => {
    expect(tierShift('medium', 'easy')).toBe(1);
    expect(tierShift('medium', 'hard')).toBe(-1);
    expect(tierShift('hard', 'easy')).toBe(1);
  });

  it('applies one-tier bias to representative difficulty values', () => {
    expect(applyBiasToDifficulty(2, 1)).toBe(5);
    expect(applyBiasToDifficulty(5, 1)).toBe(9);
    expect(applyBiasToDifficulty(9, 1)).toBe(9);
    expect(applyBiasToDifficulty(9, -1)).toBe(5);
    expect(applyBiasToDifficulty(5, -1)).toBe(2);
    expect(applyBiasToDifficulty(2, -1)).toBe(2);
  });
});

describe('difficulty calibration aggregation', () => {
  it('returns neutral bias when eligible sample size is too small', async () => {
    const levelIds = ['lvl_0001', 'lvl_0002', 'lvl_0003', 'lvl_0004'];
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makePuzzle({ levelId, difficulty: 5, source: 'AUTO_DAILY' })])
    );
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, { plays: 30, wins: 30 }])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? { plays: 0, wins: 0 }
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(4);
    expect(snapshot.biasTierShift).toBe(0);
  });

  it('returns +1 bias when harder-shift share exceeds threshold', async () => {
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
      levelIds.map((levelId) => [levelId, { plays: 30, wins: 30 }])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? { plays: 0, wins: 0 }
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(5);
    expect(snapshot.harderCount).toBe(5);
    expect(snapshot.easierCount).toBe(0);
    expect(snapshot.biasTierShift).toBe(1);
    expect(await computeGlobalDailyBias()).toBe(1);
  });

  it('returns -1 bias when easier-shift share exceeds threshold', async () => {
    const levelIds = ['lvl_0020', 'lvl_0021', 'lvl_0022', 'lvl_0023', 'lvl_0024'];
    const puzzlesByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, makePuzzle({ levelId, difficulty: 2, source: 'AUTO_DAILY' })])
    );
    const telemetryByLevel = Object.fromEntries(
      levelIds.map((levelId) => [levelId, { plays: 30, wins: 0 }])
    );

    getAllLevelIdsMock.mockResolvedValue(levelIds);
    getPuzzlePrivateMock.mockImplementation(async (levelId: string) => puzzlesByLevel[levelId] ?? null);
    getQualifiedLevelTelemetryMock.mockImplementation(
      async (levelId: string) => telemetryByLevel[levelId] ?? { plays: 0, wins: 0 }
    );

    const snapshot = await getGlobalDailyCalibrationSnapshot();
    expect(snapshot.eligibleLevels).toBe(5);
    expect(snapshot.harderCount).toBe(0);
    expect(snapshot.easierCount).toBe(5);
    expect(snapshot.biasTierShift).toBe(-1);
  });
});
