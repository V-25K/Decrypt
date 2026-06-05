import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartPurchaseDialog } from './HeartPurchaseDialog';

let container: HTMLDivElement;
let root: Root;

const renderDialog = async (
  props: Partial<Parameters<typeof HeartPurchaseDialog>[0]> = {}
) => {
  const defaultProps = {
    coins: 500,
    busy: false,
    limitReached: false,
    purchasesToday: 0,
    maxPurchasesPerDay: 2,
    limitResetTs: Date.now() + 60 * 60 * 1000,
    onRefill: vi.fn(),
    onTopUp: vi.fn(),
    onOpenShopPackages: vi.fn(),
    onCancel: vi.fn(),
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
});
