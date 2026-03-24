import type { RefObject } from 'react';
import type { DeviceTier } from '../app/types';
import { helpSections } from '../app/constants';

type HelpOverlayProps = {
  deviceTier: DeviceTier;
  helpCardWidthClass: string;
  helpCardRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

export const HelpOverlay = ({
  deviceTier,
  helpCardWidthClass,
  helpCardRef,
  onClose,
}: HelpOverlayProps) => (
  <div
    data-testid="help-overlay"
    className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end px-2 pt-14"
  >
    <section
      data-testid="help-card"
      ref={helpCardRef}
      className={`app-surface pointer-events-auto w-full ${helpCardWidthClass} rounded-2xl border-[3px] app-border-strong app-text`}
    >
      <header className="flex items-center justify-between border-b app-border px-3 py-2">
        <h2
          className={`${
            deviceTier === 'mobile' ? 'text-sm' : 'text-base'
          } font-black uppercase tracking-[0.04em]`}
        >
          How To Play
        </h2>
        <button
          data-testid="help-close"
          className="btn-3d btn-close btn-compact btn-round flex h-8 w-8 items-center justify-center text-lg font-black leading-none"
          onClick={onClose}
          aria-label="Close help"
        >
          ×
        </button>
      </header>
      <div
        className={`${
          deviceTier === 'mobile'
            ? 'space-y-2 p-2.5 text-[10px]'
            : 'space-y-2.5 p-3 text-[11px]'
        } leading-relaxed`}
      >
        {helpSections.map((section) => (
          <section
            key={section.title}
            className="app-surface-strong rounded-lg border app-border px-2 py-1.5"
          >
            <h3
              className={`${
                deviceTier === 'mobile' ? 'text-[10px]' : 'text-[11px]'
              } app-text mb-0.5 font-black uppercase`}
            >
              {section.title}
            </h3>
            <div className="app-text space-y-0.5">
              {section.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  </div>
);
