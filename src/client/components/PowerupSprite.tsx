import { powerupAssetPath, powerupLabel } from '../app/constants';
import type { PowerupType } from '../app/types';
import { SpriteImage } from './SpriteImage';

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
  const label = alt ?? powerupLabel[powerup];
  return (
    <SpriteImage
      src={powerupAssetPath[powerup]}
      label={label}
      spriteClassName="powerup-sprite"
      className={className}
      decorative={decorative}
      testId={testId}
    />
  );
};
