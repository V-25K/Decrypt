import { describe, expect, it } from 'vitest';
import { getResponsiveLayoutState } from './responsive-layout';

describe('getResponsiveLayoutState', () => {
  it('uses compact inline classes below the tight width threshold', () => {
    const state = getResponsiveLayoutState(350, true);

    expect(state.deviceTier).toBe('mobile');
    expect(state.inlineTight).toBe(true);
    expect(state.powerupButtonSizeClass).toBe('h-[38px] w-[38px] text-[17px]');
    expect(state.inlinePromoClusterClass).toBe('-ml-[21px] h-[78px] w-[126px]');
    expect(state.inlineBundleCardClass).toBe('h-[58px] w-[56px] rounded-[9px] p-[2px]');
  });

  it('uses tablet inline classes at the tablet breakpoint', () => {
    const state = getResponsiveLayoutState(640, true);

    expect(state.deviceTier).toBe('tablet');
    expect(state.inlineTight).toBe(false);
    expect(state.powerupWrapSizeClass).toBe('h-[46px] w-[46px]');
    expect(state.utilityRowClass).toBe('bg-transparent px-2.5 pt-0.5 pb-[7px]');
    expect(state.inlineSnooDockClass).toBe('bottom-[-11px]');
  });

  it('uses desktop classes at the desktop breakpoint', () => {
    const state = getResponsiveLayoutState(1024, true);

    expect(state.deviceTier).toBe('desktop');
    expect(state.powerupButtonSizeClass).toBe('h-[50px] w-[50px] text-[22px]');
    expect(state.inlineBundleDockClass).toBe('left-[72px] bottom-0');
    expect(state.bundleRewardValueTextClass).toBe('text-[12px]');
  });

  it('uses expanded-mode powerup and utility classes outside inline mode', () => {
    const desktop = getResponsiveLayoutState(1024, false);
    const mobile = getResponsiveLayoutState(390, false);

    expect(desktop.powerupButtonSizeClass).toBe('h-[40px] w-[40px] text-[18px]');
    expect(desktop.powerupWrapSizeClass).toBe('h-[40px] w-[40px]');
    expect(mobile.powerupButtonSizeClass).toBe('h-[36px] w-[36px] text-[16px]');
    expect(mobile.utilityRowClass).toBe('bg-transparent px-3 pt-0.5 pb-1.5');
  });
});
