import {
  uiSpriteAssetPath,
  uiSpriteLabel,
  type UiSpriteType,
} from '../app/constants';
import { SpriteImage } from './SpriteImage';

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
  const label = alt ?? uiSpriteLabel[icon];
  return (
    <SpriteImage
      src={uiSpriteAssetPath[icon]}
      label={label}
      spriteClassName="ui-sprite"
      className={className}
      decorative={decorative}
      testId={testId}
    />
  );
};
