import type { RefObject } from 'react';
import type { DeviceTier } from '../app/types';
import { cn } from '../utils';

type SettingsOverlayProps = {
  deviceTier: DeviceTier;
  helpCardWidthClass: string;
  settingsCardRef: RefObject<HTMLElement | null>;
  audioEnabled: boolean;
  audioBusy: boolean;
  onToggleAudio: () => void;
  onClose: () => void;
};

export const SettingsOverlay = ({
  deviceTier,
  helpCardWidthClass,
  settingsCardRef,
  audioEnabled,
  audioBusy,
  onToggleAudio,
  onClose,
}: SettingsOverlayProps) => (
  <div
    data-testid="settings-overlay"
    className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end px-2 pt-14"
  >
    <section
      data-testid="settings-card"
      ref={settingsCardRef}
      className={`app-surface pointer-events-auto w-full ${helpCardWidthClass} rounded-2xl border-[3px] app-border-strong app-text`}
    >
      <header className="flex items-center justify-between border-b app-border px-3 py-2">
        <h2
          className={`${
            deviceTier === 'mobile' ? 'text-sm' : 'text-base'
          } font-black uppercase tracking-[0.04em]`}
        >
          Settings
        </h2>
        <button
          data-testid="settings-close"
          className="btn-3d btn-close btn-compact btn-round flex h-8 w-8 items-center justify-center text-lg font-black leading-none"
          onClick={onClose}
          aria-label="Close settings"
        >
          x
        </button>
      </header>
      <div
        className={`${
          deviceTier === 'mobile'
            ? 'space-y-2 p-2.5 text-[10px]'
            : 'space-y-2.5 p-3 text-[11px]'
        } leading-relaxed`}
      >
        <section className="app-surface-strong rounded-lg border app-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3
                className={`${
                  deviceTier === 'mobile' ? 'text-[10px]' : 'text-[11px]'
                } app-text font-black uppercase`}
              >
                Audio
              </h3>
              <p
                className={`${
                  deviceTier === 'mobile' ? 'text-[9px]' : 'text-[10px]'
                } app-text-muted mt-1 font-semibold normal-case`}
              >
                Turn sound on or off.
              </p>
            </div>
            <button
              data-testid="audio-toggle"
              type="button"
              className={cn(
                'flex h-7 w-12 items-center rounded-full border border-black/70 px-1 transition-colors',
                audioEnabled ? 'justify-end bg-[#4ec86a]' : 'justify-start bg-[#b7b0a8]',
                audioBusy ? 'opacity-70' : ''
              )}
              onClick={onToggleAudio}
              disabled={audioBusy}
              aria-pressed={audioEnabled}
              aria-label={audioEnabled ? 'Turn audio off' : 'Turn audio on'}
              title={audioEnabled ? 'Audio on' : 'Audio off'}
            >
              <span className="block h-5 w-5 rounded-full bg-[#111111]" />
            </button>
          </div>
        </section>
      </div>
    </section>
  </div>
);
