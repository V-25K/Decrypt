import type { DeviceTier } from './types';

export type ResponsiveLayoutState = {
  deviceTier: DeviceTier;
  inlineTight: boolean;
  frameMaxWidthClass: string;
  powerupButtonSizeClass: string;
  powerupWrapSizeClass: string;
  utilityRowClass: string;
  helpButtonClass: string;
  headerIconClass: string;
  helpCardWidthClass: string;
  puzzleMarkClass: string;
  puzzleCipherClass: string;
  separatorGlyphClass: string;
  punctuationMarkClass: string;
  puzzleTileUnderlineWidthClass: string;
  punctuationTileMinWidthClass: string;
  inlinePromoClusterClass: string;
  inlineSnooClass: string;
  inlineSnooDockClass: string;
  inlineBundleDockClass: string;
  inlineBundleCardClass: string;
  bundleRewardRowTextClass: string;
  bundleRewardValueTextClass: string;
};

export const getResponsiveLayoutState = (
  viewportWidth: number,
  isInlineMode: boolean
): ResponsiveLayoutState => {
  const deviceTier: DeviceTier =
    viewportWidth >= 1024 ? 'desktop' : viewportWidth >= 640 ? 'tablet' : 'mobile';
  const inlineTight = viewportWidth < 360;

  return {
    deviceTier,
    inlineTight,
    frameMaxWidthClass: 'max-w-full',
    powerupButtonSizeClass: isInlineMode
      ? inlineTight
        ? 'h-[38px] w-[38px] text-[17px]'
        : deviceTier === 'desktop'
          ? 'h-[50px] w-[50px] text-[22px]'
          : deviceTier === 'tablet'
            ? 'h-[46px] w-[46px] text-[20px]'
            : 'h-[42px] w-[42px] text-[18px]'
      : deviceTier === 'desktop'
        ? 'h-[40px] w-[40px] text-[18px]'
        : 'h-[36px] w-[36px] text-[16px]',
    powerupWrapSizeClass: isInlineMode
      ? inlineTight
        ? 'h-[38px] w-[38px]'
        : deviceTier === 'desktop'
          ? 'h-[50px] w-[50px]'
          : deviceTier === 'tablet'
            ? 'h-[46px] w-[46px]'
            : 'h-[42px] w-[42px]'
      : deviceTier === 'desktop'
        ? 'h-[40px] w-[40px]'
        : 'h-[36px] w-[36px]',
    utilityRowClass: isInlineMode
      ? deviceTier === 'desktop'
        ? 'bg-transparent px-3 pt-2 pb-4'
        : deviceTier === 'tablet'
          ? 'bg-transparent px-2.5 pt-1.5 pb-[14px]'
          : 'bg-transparent px-2 pt-1 pb-3'
      : 'bg-transparent px-3 py-3',
    helpButtonClass: isInlineMode
      ? 'h-8 w-8 text-[14px]'
      : 'h-9 w-9 text-[15px]',
    headerIconClass: isInlineMode ? 'h-[18px] w-[18px]' : 'h-[20px] w-[20px]',
    helpCardWidthClass: deviceTier === 'mobile' ? 'max-w-[300px]' : 'max-w-[360px]',
    puzzleMarkClass: isInlineMode
      ? 'text-[clamp(11px,3.5vw,16px)]'
      : 'text-[clamp(16px,2.3vw,22px)]',
    puzzleCipherClass: isInlineMode
      ? 'text-[clamp(10px,2.4vw,12px)]'
      : 'text-[clamp(13px,1.9vw,15px)]',
    separatorGlyphClass: isInlineMode
      ? 'text-[clamp(9px,2.7vw,13px)]'
      : 'text-[clamp(14px,2.1vw,18px)]',
    punctuationMarkClass: isInlineMode
      ? 'text-[clamp(13px,3.7vw,17px)]'
      : 'text-[clamp(18px,2.4vw,23px)]',
    puzzleTileUnderlineWidthClass: isInlineMode
      ? 'w-[clamp(14px,4.2vw,20px)]'
      : 'w-[clamp(18px,5vw,24px)]',
    punctuationTileMinWidthClass: isInlineMode ? 'min-w-[2px]' : 'min-w-[4px]',
    inlinePromoClusterClass: inlineTight
      ? '-ml-[28px] h-[104px] w-[168px]'
      : deviceTier === 'desktop'
        ? '-ml-[36px] h-[152px] w-[240px]'
        : deviceTier === 'tablet'
          ? '-ml-[32px] h-[132px] w-[212px]'
          : '-ml-[28px] h-[116px] w-[186px]',
    inlineSnooClass: inlineTight
      ? 'h-[104px] w-[104px]'
      : deviceTier === 'desktop'
        ? 'h-[152px] w-[152px]'
        : deviceTier === 'tablet'
          ? 'h-[132px] w-[132px]'
          : 'h-[116px] w-[116px]',
    inlineSnooDockClass: inlineTight
      ? 'bottom-[-12px]'
      : deviceTier === 'desktop'
        ? 'bottom-[-16px]'
        : deviceTier === 'tablet'
          ? 'bottom-[-14px]'
          : 'bottom-[-13px]',
    inlineBundleDockClass: inlineTight
      ? 'left-[60px] bottom-0'
      : deviceTier === 'desktop'
        ? 'left-[96px] bottom-0'
        : deviceTier === 'tablet'
          ? 'left-[82px] bottom-0'
          : 'left-[68px] bottom-0',
    inlineBundleCardClass: inlineTight
      ? 'h-[78px] w-[74px] rounded-[11px] p-[3px]'
      : deviceTier === 'desktop'
        ? 'h-[102px] w-[96px] rounded-[14px] p-1'
        : deviceTier === 'tablet'
          ? 'h-[94px] w-[88px] rounded-[13px] p-1'
          : 'h-[86px] w-[80px] rounded-[12px] p-1',
    bundleRewardRowTextClass: inlineTight
      ? 'text-[11px]'
      : deviceTier === 'desktop'
        ? 'text-[14px]'
        : deviceTier === 'tablet'
          ? 'text-[13px]'
          : 'text-[12px]',
    bundleRewardValueTextClass: inlineTight
      ? 'text-[12px]'
      : deviceTier === 'desktop'
        ? 'text-[15px]'
        : deviceTier === 'tablet'
          ? 'text-[14px]'
          : 'text-[13px]',
  };
};
