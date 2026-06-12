import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { heartRefillIntervalMs } from '../app/constants';
import { HeartPurchaseDialog } from './HeartPurchaseDialog';

let container: HTMLDivElement;
let root: Root;

const renderDialog = async (
  props: Partial<Parameters<typeof HeartPurchaseDialog>[0]> = {}
) => {
  const defaultProps = {
    coins: 500,
    hearts: 0,
    infiniteHeartsExpiryTs: 0,
    lastHeartRefillTs: Date.now(),
    busy: false,
    limitReached: false,
    purchasesToday: 0,
    maxPurchasesPerDay: 2,
    limitResetTs: Date.now() + 60 * 60 * 1000,
    onRefill: vi.fn(),
    onTopUp: vi.fn(),
    onOpenShopPackages: vi.fn(),
    onResume: vi.fn(),
    onGoHome: vi.fn(),
  };
  const mergedProps = {
    ...defaultProps,
    ...props,
  };

  await act(async () => {
    root.render(<HeartPurchaseDialog {...mergedProps} />);
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

describe('HeartPurchaseDialog', () => {
  it('opens the shop package flow from restore hearts', async () => {
    const onOpenShopPackages = vi.fn();
    await renderDialog({ onOpenShopPackages });

    await act(async () => {
      container
        .querySelector('[data-testid="heart-purchase-shop-packages"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onOpenShopPackages).toHaveBeenCalledTimes(1);
  });

  it('shows a home button instead of cancel', async () => {
    const onGoHome = vi.fn();
    await renderDialog({ onGoHome });

    expect(
      container.querySelector('[data-testid="heart-purchase-cancel"]')
    ).toBeNull();
    const homeButton = container.querySelector(
      '[data-testid="heart-purchase-home"]'
    );
    expect(homeButton).toBeTruthy();

    await act(async () => {
      homeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });

  it('shows the next-heart countdown while hearts are missing', async () => {
    // Halfway through a refill cycle: countdown shows the remaining half.
    await renderDialog({
      hearts: 0,
      lastHeartRefillTs: Date.now() - heartRefillIntervalMs / 2,
    });

    const countdown = container.querySelector(
      '[data-testid="heart-dialog-countdown"]'
    );
    expect(countdown?.textContent ?? '').toMatch(/Next heart in 1[45]:\d{2}/);
    expect(
      container.querySelector('[data-testid="heart-purchase-resume"]')
    ).toBeNull();
  });

  it('offers keep playing once a heart has regenerated', async () => {
    const onResume = vi.fn();
    // Out of hearts long enough ago that one full refill interval elapsed.
    await renderDialog({
      hearts: 0,
      lastHeartRefillTs: Date.now() - heartRefillIntervalMs - 1000,
      onResume,
    });

    const resumeButton = container.querySelector(
      '[data-testid="heart-purchase-resume"]'
    );
    expect(resumeButton).toBeTruthy();

    await act(async () => {
      resumeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
