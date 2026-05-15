import { useState } from 'react';
import { powerupAssetPath, powerupLabel } from '../app/constants';
import type { PowerupType } from '../app/types';
import { cn } from '../utils';

type PowerupSpriteProps = {
  powerup: PowerupType;
  className?: string;
  alt?: string;
  decorative?: boolean;
  testId?: string;
};

export const PowerupSprite = ({
  powerup,
  className,
  alt,
  decorative = false,
  testId,
}: PowerupSpriteProps) => {
  const [loadError, setLoadError] = useState(false);
  const label = alt ?? powerupLabel[powerup];

  if (loadError) {
    return (
      <span
        data-testid={testId}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative ? 'true' : undefined}
        className={cn(
          'powerup-sprite inline-flex items-center justify-center rounded bg-gray-300 text-xs font-black text-gray-700',
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
      src={powerupAssetPath[powerup]}
      alt={decorative ? '' : label}
      aria-hidden={decorative ? 'true' : undefined}
      loading="eager"
      decoding="async"
      className={cn('powerup-sprite object-contain', className)}
      onError={() => setLoadError(true)}
    />
  );
};
