import { useState } from 'react';
import {
  uiSpriteAssetPath,
  uiSpriteLabel,
  type UiSpriteType,
} from '../app/constants';
import { cn } from '../utils';

type UiSpriteProps = {
  icon: UiSpriteType;
  className?: string;
  alt?: string;
  decorative?: boolean;
  testId?: string;
};

export const UiSprite = ({
  icon,
  className,
  alt,
  decorative = false,
  testId,
}: UiSpriteProps) => {
  const [loadError, setLoadError] = useState(false);
  const label = alt ?? uiSpriteLabel[icon];

  if (loadError) {
    return (
      <span
        data-testid={testId}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative ? 'true' : undefined}
        className={cn(
          'ui-sprite inline-flex items-center justify-center rounded bg-gray-300 text-xs font-black text-gray-700',
          className
        )}
      >
        ?
      </span>
    );
  }

  return (
    <img
      data-testid={testId}
      src={uiSpriteAssetPath[icon]}
      alt={decorative ? '' : label}
      aria-hidden={decorative ? 'true' : undefined}
      loading="eager"
      decoding="async"
      className={cn('ui-sprite object-contain', className)}
      onError={() => setLoadError(true)}
    />
  );
};
