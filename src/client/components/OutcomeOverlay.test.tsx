import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutcomeOverlay } from './OutcomeOverlay';

let container: HTMLDivElement;
let root: Root;

const renderOverlay = async (
  props: Partial<Parameters<typeof OutcomeOverlay>[0]> = {}
) => {
  const retry = vi.fn(async () => undefined);
  const defaultProps = {
    showSuccessOverlay: false,
    setConfettiCanvasNode: vi.fn(),
    completionCrowdAvatarUrls: [],
    completionCrowdReady: false,
    outcomeCrowdBubbles: [],
    handleOutcomeCrowdRef: vi.fn(),
    setOutcomeCrowdBubbleNode: vi.fn(),
    criticalOutcomeAvatarCount: 0,
    busy: false,
    share: vi.fn(async () => undefined),
    isDailyComplete: false,
    retry,
    openHome: vi.fn(),
    showPaidDailyRetryCta: true,
    nextDailyRetryCost: 75,
    subredditName: 'decrypttest_dev',
    joiningCommunity: false,
    communityJoinRecorded: false,
    communityJoinLabel: 'Join',
    handleJoinCommunity: vi.fn(async () => undefined),
    outcomeTitle: 'Game Over',
    outcomeSubtitle: 'Try again',
    completionSolveLabel: '1:00',
    completionQuote: 'Test quote',
    puzzleAuthor: 'Tester',
    hasClaimableQuest: false,
    openQuest: vi.fn(),
  };
  const mergedProps = {
    ...defaultProps,
    ...props,
  };

  await act(async () => {
    root.render(<OutcomeOverlay {...mergedProps} />);
  });

  return mergedProps;
};

const getPaidRetryButton = (): HTMLButtonElement => {
  const button = container.querySelector('[data-testid="overlay-paid-daily-retry"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Paid retry button was not rendered');
  }
  return button;
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('OutcomeOverlay', () => {
  it('renders and triggers the paid daily retry CTA when available', async () => {
    const props = await renderOverlay();

    expect(getPaidRetryButton().textContent).toBe('Retry for 75 coins');

    await act(async () => {
      getPaidRetryButton().click();
      await Promise.resolve();
    });

    expect(props.retry).toHaveBeenCalledTimes(1);
  });

  it('hides the paid daily retry CTA after daily completion', async () => {
    await renderOverlay({
      isDailyComplete: true,
    });

    expect(container.querySelector('[data-testid="overlay-paid-daily-retry"]')).toBeNull();
  });
});
