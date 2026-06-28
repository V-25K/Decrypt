import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }));
vi.mock('@devvit/web/client', () => ({ navigateTo: navigateToMock }));

import { SettingsOverlay } from './SettingsOverlay';
import { PRIVACY_URL, TERMS_URL } from '../app/constants';

let container: HTMLDivElement;
let root: Root;

const renderOverlay = async (
  props: Partial<Parameters<typeof SettingsOverlay>[0]> = {}
) => {
  const defaultProps: Parameters<typeof SettingsOverlay>[0] = {
    deviceTier: 'desktop',
    helpCardWidthClass: 'max-w-sm',
    settingsCardRef: { current: null },
    audioEnabled: true,
    audioBusy: false,
    themePreference: 'default',
    themeBusy: false,
    keyboardPreference: 'auto',
    onToggleAudio: vi.fn(),
    onSelectTheme: vi.fn(),
    onSelectKeyboard: vi.fn(),
    onClose: vi.fn(),
  };
  const merged = { ...defaultProps, ...props };
  await act(async () => {
    root.render(<SettingsOverlay {...merged} />);
  });
  return merged;
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  navigateToMock.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe('SettingsOverlay legal links', () => {
  const clickLink = async (testId: string) => {
    const button = container.querySelector(`[data-testid="${testId}"]`);
    expect(button).toBeInstanceOf(HTMLButtonElement);
    await act(async () => {
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
      await Promise.resolve();
    });
  };

  it('opens the Terms doc in the browser', async () => {
    await renderOverlay();
    await clickLink('settings-terms-link');
    expect(navigateToMock).toHaveBeenCalledWith(TERMS_URL);
  });

  it('opens the Privacy doc in the browser', async () => {
    await renderOverlay();
    await clickLink('settings-privacy-link');
    expect(navigateToMock).toHaveBeenCalledWith(PRIVACY_URL);
  });
});
