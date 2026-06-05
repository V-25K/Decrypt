import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateOutcomeQuote } from '../app/outcome-quote';
import { OutcomeOverlay } from './OutcomeOverlay';

let container: HTMLDivElement;
let root: Root;

const renderOverlay = async (
  props: Partial<Parameters<typeof OutcomeOverlay>[0]> = {}
) => {
  const retry = vi.fn(async () => undefined);
  const defaultProps: Parameters<typeof OutcomeOverlay>[0] = {
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
    nextChallenge: vi.fn(),
    isDailyComplete: false,
    retry,
    openHome: vi.fn(),
    subredditName: 'decrypttest_dev',
    joiningCommunity: false,
    communityJoinRecorded: false,
    communityJoinLabel: 'Join',
    handleJoinCommunity: vi.fn(async () => undefined),
    completionSolveLabel: '1:00',
    pointsGainedLabel: null,
    ratingDeltaLabel: null,
    ratingDeltaTone: 'neutral',
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
  it('truncates long result quotes with a fixed suffix', () => {
    expect(
      truncateOutcomeQuote(
        'One two three four five six seven eight nine ten eleven twelve',
        6,
        80
      )
    ).toBe('One two three four five six....');
    expect(truncateOutcomeQuote('Short quote', 6, 80)).toBe('Short quote');
  });

  it('does not render a continue CTA after failure', async () => {
    await renderOverlay();

    expect(container.querySelector('[data-testid="overlay-continue"]')).toBeNull();
  });

  it('renders the quote and next CTA after failure', async () => {
    const nextChallenge = vi.fn();
    await renderOverlay({ nextChallenge });

    expect(container.querySelector('[data-testid="outcome-overlay-quote"]')).not.toBeNull();
    expect(container.textContent ?? '').toContain('Test quote');
    const button = container.querySelector('[data-testid="overlay-next-challenge"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
      await Promise.resolve();
    });

    expect(nextChallenge).toHaveBeenCalledTimes(1);
  });

  it('does not render result title or retry subtitle copy', async () => {
    await renderOverlay();

    expect(container.textContent ?? '').not.toContain('Challenge Completed');
    expect(container.textContent ?? '').not.toContain('Challenge Failed');
    expect(container.textContent ?? '').not.toContain('Try again');
  });

  it('renders a compact mirrored stats pill under the quote', async () => {
    await renderOverlay({
      pointsGainedLabel: '+0 pts',
      ratingDeltaLabel: '-18 ELO',
      ratingDeltaTone: 'negative',
    });

    const pill = container.querySelector('[data-testid="outcome-rating-pill"]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent ?? '').toContain('Rating:');
    expect(pill?.textContent ?? '').toContain('-18 ELO');
    expect(pill?.textContent ?? '').toContain('Points:');
    expect(pill?.textContent ?? '').toContain('+0 pts');
    expect(pill?.className ?? '').toContain('rounded-b-2xl');
  });

  it('hides the continue CTA after completion', async () => {
    await renderOverlay({
      isDailyComplete: true,
      showSuccessOverlay: true,
    });

    expect(container.querySelector('[data-testid="overlay-continue"]')).toBeNull();
  });

  it('renders and triggers the next challenge CTA after completion', async () => {
    const nextChallenge = vi.fn();
    await renderOverlay({
      showSuccessOverlay: true,
      nextChallenge,
    });
    const button = container.querySelector('[data-testid="overlay-next-challenge"]');
    expect(button).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
      await Promise.resolve();
    });

    expect(nextChallenge).toHaveBeenCalledTimes(1);
  });

  it('keeps circular result actions grouped before the next CTA', async () => {
    await renderOverlay({ showSuccessOverlay: true });

    const actionCluster = container.querySelector(
      '[data-testid="overlay-share-comment"]'
    )?.parentElement;
    expect(
      container
        .querySelector('[data-testid="overlay-share-comment"]')
        ?.getAttribute('aria-label')
    ).toBe('Share score as yourself');

	    expect(
	      Array.from(actionCluster?.children ?? []).map((child) =>
        child.getAttribute('data-testid')
      )
    ).toEqual([
      'overlay-share-comment',
      'overlay-play-again',
      'overlay-go-home',
      'overlay-next-challenge',
    ]);
  });
});
