import { describe, expect, it } from 'vitest';
import { getAppViewState } from './app-view-state';

describe('getAppViewState', () => {
  it('marks hub screens and expanded layout', () => {
    expect(
      getAppViewState({
        activeScreen: 'leaderboard',
        isChallengeScreen: false,
        isComplete: false,
        isGameOver: false,
        isInlineMode: false,
        mode: 'daily',
        requiresPaidRetry: false,
      })
    ).toMatchObject({
      layoutTestId: 'layout-expanded-stacked',
      isLeaderboardScreen: true,
      isHubScreen: true,
      showOutcomeOverlay: false,
      showChallengeBackdrop: false,
    });
  });

  it('marks inline challenge play without outcome overlay', () => {
    expect(
      getAppViewState({
        activeScreen: 'challenge',
        isChallengeScreen: true,
        isComplete: false,
        isGameOver: false,
        isInlineMode: true,
        mode: 'daily',
        requiresPaidRetry: false,
      })
    ).toMatchObject({
      layoutTestId: 'layout-inline',
      isHubScreen: false,
      showOutcomeOverlay: false,
      showChallengeBackdrop: true,
      showSuccessOverlay: false,
    });
  });

  it('marks completed daily outcome state', () => {
    expect(
      getAppViewState({
        activeScreen: 'challenge',
        isChallengeScreen: true,
        isComplete: true,
        isGameOver: false,
        isInlineMode: false,
        mode: 'daily',
        requiresPaidRetry: false,
      })
    ).toMatchObject({
      showOutcomeOverlay: true,
      showChallengeBackdrop: false,
      showSuccessOverlay: true,
      isDailyComplete: true,
      showPaidDailyRetryCta: false,
    });
  });

  it('shows paid retry CTA only for failed daily paid retries', () => {
    expect(
      getAppViewState({
        activeScreen: 'challenge',
        isChallengeScreen: true,
        isComplete: false,
        isGameOver: true,
        isInlineMode: false,
        mode: 'daily',
        requiresPaidRetry: true,
      }).showPaidDailyRetryCta
    ).toBe(true);

    expect(
      getAppViewState({
        activeScreen: 'challenge',
        isChallengeScreen: true,
        isComplete: false,
        isGameOver: true,
        isInlineMode: false,
        mode: 'endless',
        requiresPaidRetry: true,
      }).showPaidDailyRetryCta
    ).toBe(false);
  });
});
