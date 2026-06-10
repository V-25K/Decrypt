import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PuzzlePrivate, PuzzlePublic, PuzzleTile } from '../../shared/game';

const {
  buildPuzzleMock,
  buildPublicPuzzleMock,
  runDummySolverMock,
  validatePuzzleMock,
  clearUsedSignatureMock,
  getAllLevelIdsMock,
  getAutoDailyLevelIdsForDateMock,
  getPuzzleMappingMock,
  getPuzzlePrivateMock,
  getPuzzlePublicationReceiptMock,
  getPuzzlePublishedPostIdMock,
  getRecentUsedSignatureEntriesMock,
  peekNextLevelIdMock,
  reserveUsedSignatureMock,
  savePuzzleMock,
  setDailyPointerMock,
  setPuzzlePublicationReceiptMock,
  setPuzzlePublishedPostIdMock,
  transferUsedSignatureReservationMock,
} = vi.hoisted(() => ({
  buildPuzzleMock: vi.fn(),
  buildPublicPuzzleMock: vi.fn(),
  runDummySolverMock: vi.fn(),
  validatePuzzleMock: vi.fn(),
  clearUsedSignatureMock: vi.fn(),
  getAllLevelIdsMock: vi.fn(),
  getAutoDailyLevelIdsForDateMock: vi.fn(),
  getPuzzleMappingMock: vi.fn(),
  getPuzzlePrivateMock: vi.fn(),
  getPuzzlePublicationReceiptMock: vi.fn(),
  getPuzzlePublishedPostIdMock: vi.fn(),
  getRecentUsedSignatureEntriesMock: vi.fn(),
  peekNextLevelIdMock: vi.fn(),
  reserveUsedSignatureMock: vi.fn(),
  savePuzzleMock: vi.fn(),
  setDailyPointerMock: vi.fn(),
  setPuzzlePublicationReceiptMock: vi.fn(),
  setPuzzlePublishedPostIdMock: vi.fn(),
  transferUsedSignatureReservationMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: { subredditName: 'decrypttest', subredditId: 't5_test' },
  reddit: {
    submitCustomPost: vi.fn(),
    getPostById: vi.fn(),
    approve: vi.fn(),
  },
  redis: {
    del: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('./puzzle', () => ({
  buildPuzzle: buildPuzzleMock,
  buildPublicPuzzle: buildPublicPuzzleMock,
  maxPrefilledCountForDifficulty: (difficulty: number) => {
    if (difficulty <= 3) {
      return 4;
    }
    if (difficulty <= 6) {
      return 2;
    }
    return 1;
  },
}));

vi.mock('./dummy-solver', () => ({
  runDummySolver: runDummySolverMock,
}));

vi.mock('./validation', () => ({
  validatePuzzle: validatePuzzleMock,
}));

vi.mock('./puzzle-store', () => ({
  PuzzleLevelAllocationConflictError: class PuzzleLevelAllocationConflictError extends Error {},
  clearUsedSignature: clearUsedSignatureMock,
  getAllLevelIds: getAllLevelIdsMock,
  getAutoDailyLevelIdsForDate: getAutoDailyLevelIdsForDateMock,
  getPuzzleMapping: getPuzzleMappingMock,
  getPuzzlePrivate: getPuzzlePrivateMock,
  getPuzzlePublicationReceipt: getPuzzlePublicationReceiptMock,
  getPuzzlePublishedPostId: getPuzzlePublishedPostIdMock,
  getRecentUsedSignatureEntries: getRecentUsedSignatureEntriesMock,
  isOfficialDailyPuzzleSource: (source: string) =>
    source === 'AUTO_DAILY' || source === 'MANUAL_INJECTED',
  peekNextLevelId: peekNextLevelIdMock,
  reserveUsedSignature: reserveUsedSignatureMock,
  savePuzzle: savePuzzleMock,
  setDailyPointer: setDailyPointerMock,
  setPuzzlePublicationReceipt: setPuzzlePublicationReceiptMock,
  setPuzzlePublishedPostId: setPuzzlePublishedPostIdMock,
  transferUsedSignatureReservation: transferUsedSignatureReservationMock,
}));

import { buildManualPuzzleWithSolverFallback } from './generator';

type BuildPuzzleParams = {
  skipSolvabilityCheck?: boolean;
};

type SolverParams = {
  revealedIndices: number[];
};

const letterTilesForText = (text: string): PuzzleTile[] => {
  let wordIndex = 0;
  return [...text].map((char, index) => {
    const isLetter = /^[A-Z]$/.test(char);
    const tile = {
      index,
      char,
      isLetter,
      wordIndex,
    };
    if (char === ' ') {
      wordIndex += 1;
    }
    return tile;
  });
};

const hardPuzzleFixture = (): PuzzlePrivate => {
  const targetText = 'ALPHA BETA GAMMA DELTA';
  return {
    levelId: 'lvl_injected_hard',
    dateKey: '2026-06-07',
    targetText,
    author: 'TESTER',
    challengeType: 'QUOTE',
    source: 'MANUAL_INJECTED',
    cipherType: 'random',
    shiftAmount: null,
    mapping: {
      A: 1,
      B: 2,
      D: 4,
      E: 5,
      G: 7,
      H: 8,
      L: 12,
      M: 13,
      P: 16,
      T: 20,
    },
    reverseMapping: {
      '1': 'A',
      '2': 'B',
      '4': 'D',
      '5': 'E',
      '7': 'G',
      '8': 'H',
      '12': 'L',
      '13': 'M',
      '16': 'P',
      '20': 'T',
    },
    tiles: letterTilesForText(targetText),
    words: ['ALPHA', 'BETA', 'GAMMA', 'DELTA'],
    prefilledIndices: [0],
    revealedIndices: [0],
    revealed_indices: [0],
    lockIndices: [],
    blindIndices: [],
    goldIndex: null,
    padlockChains: [],
    difficulty: 8,
    isLogical: false,
    createdAt: 1770000000000,
  };
};

const publicPuzzleFixture = (): PuzzlePublic => ({
  levelId: 'lvl_injected_hard',
  dateKey: '2026-06-07',
  author: 'TESTER',
  challengeType: 'QUOTE',
  words: ['ALPHA', 'BETA', 'GAMMA', 'DELTA'],
  tiles: [],
  difficulty: 8,
  heartsMax: 3,
});

describe('buildManualPuzzleWithSolverFallback', () => {
  afterEach(() => {
    buildPuzzleMock.mockReset();
    buildPublicPuzzleMock.mockReset();
    runDummySolverMock.mockReset();
    validatePuzzleMock.mockReset();
  });

  it('does not add extra starter reveals beyond the hard-tier cap during solver stabilization', () => {
    const hardPuzzle = hardPuzzleFixture();
    const solverRevealCounts: number[] = [];
    buildPuzzleMock.mockImplementation((params: BuildPuzzleParams) => {
      if (params.skipSolvabilityCheck) {
        return {
          puzzlePrivate: hardPuzzle,
          puzzlePublic: publicPuzzleFixture(),
        };
      }
      throw new Error('DUMMY_SOLVER_UNSATISFIED');
    });
    runDummySolverMock.mockImplementation((params: SolverParams) => {
      solverRevealCounts.push(params.revealedIndices.length);
      return {
        solvable: params.revealedIndices.length >= 2,
        blindGuessRequired: false,
        solvedRatio: params.revealedIndices.length >= 2 ? 1 : 0,
      };
    });
    validatePuzzleMock.mockReturnValue({ valid: true, reasons: [] });
    buildPublicPuzzleMock.mockReturnValue(publicPuzzleFixture());

    expect(() =>
      buildManualPuzzleWithSolverFallback({
        levelId: 'lvl_injected_hard',
        dateKey: '2026-06-07',
        text: 'ALPHA BETA GAMMA DELTA',
        author: 'TESTER',
        challengeType: 'QUOTE',
        source: 'MANUAL_INJECTED',
        difficulty: 8,
        logicalPercent: 50,
      })
    ).toThrow('DUMMY_SOLVER_UNSATISFIED');

    expect(solverRevealCounts).toEqual([1, 1, 1, 1]);
    expect(buildPublicPuzzleMock).not.toHaveBeenCalled();
  });
});
