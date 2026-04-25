import { afterEach, describe, expect, it, vi } from 'vitest';

const { runDummySolverMock } = vi.hoisted(() => ({
  runDummySolverMock: vi.fn(),
}));

vi.mock('./dummy-solver.ts', () => ({
  runDummySolver: runDummySolverMock,
}));

import { buildPuzzle } from './puzzle';

afterEach(() => {
  runDummySolverMock.mockReset();
  vi.restoreAllMocks();
});

describe('buildPuzzle createdAt', () => {
  it('captures createdAt once even when solver retries exhaust', () => {
    runDummySolverMock.mockReturnValue({
      solvable: false,
      solvedRatio: 0,
      blindGuessRequired: false,
      branchExpansions: 0,
      elapsedMs: 1,
    });
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    expect(() =>
      buildPuzzle({
        levelId: 'lvl_9999',
        dateKey: '2026-04-10',
        text: 'THE QUICK BROWN FOX JUMPS',
        author: 'UNKNOWN',
        difficulty: 7,
        logicalPercent: 10,
      })
    ).toThrow('DUMMY_SOLVER_UNSATISFIED');

    expect(runDummySolverMock).toHaveBeenCalledTimes(5);
    expect(nowSpy).toHaveBeenCalledTimes(1);
  });
});
