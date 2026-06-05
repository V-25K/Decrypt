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
	        ? 'bg-transparent px-3 pt-0.5 pb-2'
	        : deviceTier === 'tablet'
	          ? 'bg-transparent px-2.5 pt-0.5 pb-[7px]'
	          : 'bg-transparent px-2 pt-0 pb-1.5'
	      : 'bg-transparent px-3 pt-0.5 pb-1.5',
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
      ? '-ml-[21px] h-[78px] w-[126px]'
      : deviceTier === 'desktop'
        ? '-ml-[27px] h-[114px] w-[180px]'
        : deviceTier === 'tablet'
          ? '-ml-[24px] h-[99px] w-[159px]'
          : '-ml-[21px] h-[87px] w-[140px]',
    inlineSnooClass: inlineTight
      ? 'h-[78px] w-[78px]'
      : deviceTier === 'desktop'
        ? 'h-[114px] w-[114px]'
        : deviceTier === 'tablet'
          ? 'h-[99px] w-[99px]'
          : 'h-[87px] w-[87px]',
    inlineSnooDockClass: inlineTight
      ? 'bottom-[-9px]'
      : deviceTier === 'desktop'
        ? 'bottom-[-12px]'
        : deviceTier === 'tablet'
          ? 'bottom-[-11px]'
          : 'bottom-[-10px]',
    inlineBundleDockClass: inlineTight
      ? 'left-[45px] bottom-0'
      : deviceTier === 'desktop'
        ? 'left-[72px] bottom-0'
        : deviceTier === 'tablet'
          ? 'left-[62px] bottom-0'
          : 'left-[51px] bottom-0',
    inlineBundleCardClass: inlineTight
      ? 'h-[58px] w-[56px] rounded-[9px] p-[2px]'
      : deviceTier === 'desktop'
        ? 'h-[77px] w-[72px] rounded-[11px] p-[3px]'
        : deviceTier === 'tablet'
          ? 'h-[71px] w-[66px] rounded-[10px] p-[3px]'
          : 'h-[65px] w-[60px] rounded-[10px] p-[3px]',
    bundleRewardRowTextClass: inlineTight
      ? 'text-[9px]'
      : deviceTier === 'desktop'
        ? 'text-[11px]'
        : deviceTier === 'tablet'
          ? 'text-[10px]'
          : 'text-[9px]',
    bundleRewardValueTextClass: inlineTight
      ? 'text-[10px]'
      : deviceTier === 'desktop'
        ? 'text-[12px]'
        : deviceTier === 'tablet'
          ? 'text-[11px]'
          : 'text-[10px]',
  };
};
