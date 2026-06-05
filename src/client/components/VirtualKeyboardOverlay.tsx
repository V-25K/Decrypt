import type { DeviceTier } from '../app/types';
import { cn } from '../utils';

export type VirtualArrowKey =
  | 'ArrowLeft'
  | 'ArrowRight';

type VirtualKeyboardOverlayProps = {
  disabled: boolean;
  deviceTier: DeviceTier;
  onLetterPress: (letter: string) => void;
  onArrowPress: (key: VirtualArrowKey) => void;
};

const letterRows = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

const leftArrowKey: { key: VirtualArrowKey; label: string } = {
  key: 'ArrowLeft',
  label: '<',
};
const rightArrowKey: { key: VirtualArrowKey; label: string } = {
  key: 'ArrowRight',
  label: '>',
};

const renderArrowKey = (
  key: VirtualArrowKey,
  label: string,
  disabled: boolean,
  keySizeClass: string,
  onArrowPress: (key: VirtualArrowKey) => void
) => (
  <button
    key={key}
    type="button"
    data-testid={`virtual-key-${key}`}
    className={cn(
      'btn-3d btn-secondary min-w-0 flex-1 rounded-lg px-0 font-black leading-none',
      keySizeClass
    )}
    disabled={disabled}
    onClick={() => onArrowPress(key)}
    aria-label={key}
    title={key}
  >
    {label}
  </button>
);

export const VirtualKeyboardOverlay = ({
  disabled,
  deviceTier,
  onLetterPress,
  onArrowPress,
}: VirtualKeyboardOverlayProps) => {
  const keySizeClass =
    deviceTier === 'desktop'
      ? 'h-9 text-[14px]'
      : deviceTier === 'tablet'
        ? 'h-[34px] text-[13px]'
        : 'h-[clamp(28px,8vw,32px)] text-[clamp(11px,3.4vw,13px)]';
  const panelWidthClass =
    deviceTier === 'desktop' ? 'max-w-[520px]' : 'max-w-[380px]';
  const rowGapClass = deviceTier === 'desktop' ? 'gap-1.5' : 'gap-[3px]';

  return (
    <div
      data-testid="virtual-keyboard-overlay"
      className="pointer-events-none relative z-40 flex shrink-0 justify-center px-2 pb-2 pt-0.5"
    >
      <section
        data-testid="virtual-keyboard-panel"
        className={cn(
          'pointer-events-auto w-full rounded-xl border app-border bg-black/45 px-2 py-2 shadow-[0_16px_34px_rgba(0,0,0,0.42)] backdrop-blur-md',
          panelWidthClass
        )}
        aria-label="Virtual keyboard"
      >
        <div className="space-y-1">
          {letterRows.map((row, rowIndex) => (
            <div
              key={row.join('')}
              data-testid={`virtual-key-row-${rowIndex}`}
              className={cn('flex w-full justify-center', rowGapClass)}
            >
              {rowIndex === letterRows.length - 1 &&
                renderArrowKey(
                  leftArrowKey.key,
                  leftArrowKey.label,
                  disabled,
                  keySizeClass,
                  onArrowPress
                )}
              {row.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  data-testid={`virtual-key-${letter}`}
                  className={cn(
                    'btn-3d btn-neutral min-w-0 flex-1 rounded-lg px-0 font-black leading-none',
                    keySizeClass
                  )}
                  disabled={disabled}
                  onClick={() => onLetterPress(letter)}
                  aria-label={`Guess ${letter}`}
                  title={`Guess ${letter}`}
                >
                  {letter}
                </button>
              ))}
              {rowIndex === letterRows.length - 1 &&
                renderArrowKey(
                  rightArrowKey.key,
                  rightArrowKey.label,
                  disabled,
                  keySizeClass,
                  onArrowPress
                )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
