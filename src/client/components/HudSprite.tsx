import {
  hudSpriteAssetPath,
  hudSpriteLabel,
  type HudSpriteType,
} from '../app/constants';
import { SpriteImage } from './SpriteImage';

type HudSpriteProps = {
  icon: HudSpriteType;
  className?: string;
  alt?: string;
  decorative?: boolean;
  testId?: string;
};

export const HudSprite = ({
  icon,
  className,
  alt,
  decorative = false,
  testId,
}: HudSpriteProps) => {
  const label = alt ?? hudSpriteLabel[icon];
  return (
    <SpriteImage
      src={hudSpriteAssetPath[icon]}
      label={label}
      spriteClassName="hud-sprite"
      className={className}
      decorative={decorative}
      testId={testId}
    />
  );
};
