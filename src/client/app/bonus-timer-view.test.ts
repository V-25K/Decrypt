import { describe, expect, it } from 'vitest';
import { getBonusTimerView } from './bonus-timer-view';

const baseTimerView = (
  overrides: Partial<Parameters<typeof getBonusTimerView>[0]> = {}
) =>
  getBonusTimerView({
    challengeStartTs: 1_000,
    isChallengeScreen: true,
    isComplete: false,
    isGameOver: false,
    nowTs: 12_200,
    targetTimeSeconds: 20,
    ...overrides,
  });

describe('getBonusTimerView', () => {
  it('builds a visible countdown while the fast solve window is active', () => {
    const view = baseTimerView();

    expect(view).toEqual({
      countdownLabel: '00:09',
      fastSolveThresholdSeconds: 20,
      remainingMs: 8_800,
      secondsLeft: 9,
      showTimer: true,
    });
  });

  it('rounds fractional target times to match existing timer behavior', () => {
    const view = baseTimerView({
      nowTs: 1_000,
      targetTimeSeconds: 12.4,
    });

    expect(view.fastSolveThresholdSeconds).toBe(12);
    expect(view.countdownLabel).toBe('00:12');
  });

  it('hides the timer when there is no valid threshold or start time', () => {
    expect(baseTimerView({ targetTimeSeconds: 0 }).showTimer).toBe(false);
    expect(baseTimerView({ challengeStartTs: null }).showTimer).toBe(false);
  });

  it('hides the timer outside active challenge play', () => {
    expect(baseTimerView({ isChallengeScreen: false }).showTimer).toBe(false);
    expect(baseTimerView({ isComplete: true }).showTimer).toBe(false);
    expect(baseTimerView({ isGameOver: true }).showTimer).toBe(false);
  });

  it('clamps expired timers to zero', () => {
    const view = baseTimerView({ nowTs: 30_000 });

    expect(view.remainingMs).toBe(0);
    expect(view.secondsLeft).toBe(0);
    expect(view.countdownLabel).toBe('00:00');
    expect(view.showTimer).toBe(false);
  });
});
