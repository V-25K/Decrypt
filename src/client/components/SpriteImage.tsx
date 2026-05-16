import { useState } from 'react';
import { cn } from '../utils';

type SpriteImageProps = {
  src: string;
  label: string;
  spriteClassName: string;
  className?: string | undefined;
  decorative?: boolean | undefined;
  testId?: string | undefined;
};

export const SpriteImage = ({
  src,
  label,
  spriteClassName,
  className,
  decorative = false,
  testId,
}: SpriteImageProps) => {
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <span
        data-testid={testId}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative ? 'true' : undefined}
        className={cn(
          spriteClassName,
          'inline-flex items-center justify-center rounded bg-gray-300 text-xs font-black text-gray-700',
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
      src={src}
      alt={decorative ? '' : label}
      aria-hidden={decorative ? 'true' : undefined}
      loading="eager"
      decoding="async"
      className={cn(spriteClassName, 'object-contain', className)}
      onError={() => setLoadError(true)}
    />
  );
};
