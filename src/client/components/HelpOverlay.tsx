import { useState, type RefObject } from 'react';
import type { DeviceTier } from '../app/types';
import { helpSlides, powerupIcon } from '../app/constants';
import { cn } from '../utils';

type HelpOverlayProps = {
  deviceTier: DeviceTier;
  helpCardWidthClass: string;
  helpCardRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

type HelpSlide = (typeof helpSlides)[number];

type ExampleTileProps = {
  top: string;
  bottom: string;
  state?: 'default' | 'selected' | 'correct';
};

const ExampleTile = ({ top, bottom, state = 'default' }: ExampleTileProps) => (
  <div
    className={cn(
      'flex h-15 w-11 flex-col justify-between rounded-xl border px-2 py-1.5 text-center shadow-[0_4px_10px_rgba(0,0,0,0.12)]',
      state === 'selected'
        ? 'border-black/75 bg-[#f2d778] text-black'
        : state === 'correct'
          ? 'border-[#365d11] bg-[#a1f51b] text-[#173000]'
          : 'border-black/20 bg-[#f6f0eb] text-black'
    )}
  >
    <span className="text-lg font-black leading-none">{top}</span>
    <span className="border-t border-black/35 pt-1 text-[11px] font-black leading-none">
      {bottom}
    </span>
  </div>
);

const renderGuessVisual = () => (
  <div className="rounded-2xl bg-[linear-gradient(145deg,#efe7e2,#dfd5cf)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
    <div className="flex items-center justify-between gap-2">
      <span className="rounded-full bg-[#111111] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white">
        Tap tile
      </span>
      <span className="rounded-full bg-[#4ec86a] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-black">
        Type A
      </span>
    </div>
    <div className="mt-3 flex items-end justify-center gap-2">
      <ExampleTile top="_" bottom="8" />
      <ExampleTile top="_" bottom="12" state="selected" />
      <ExampleTile top="_" bottom="3" />
    </div>
    <p className="mt-3 text-center text-[11px] font-semibold text-black/70">
      Select a blank tile first, then enter your guess.
    </p>
  </div>
);

const renderMatchVisual = () => (
  <div className="rounded-2xl bg-[linear-gradient(145deg,#efe7e2,#dfd5cf)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
    <div className="flex items-center justify-center gap-3">
      <ExampleTile top="S" bottom="12" state="correct" />
      <div className="rounded-full bg-[#111111] px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-white">
        Same
      </div>
      <ExampleTile top="S" bottom="12" state="correct" />
    </div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-black uppercase tracking-[0.05em] text-black/65">
      <span>Word 1</span>
      <span />
      <span>Word 2</span>
    </div>
    <p className="mt-2 text-center text-[11px] font-semibold text-black/70">
      Repeated numbers always reuse the same letter.
    </p>
  </div>
);

const renderSurviveVisual = () => (
  <div className="rounded-2xl bg-[linear-gradient(145deg,#efe7e2,#dfd5cf)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 rounded-xl border border-black/12 bg-white/45 p-2">
        <div className="text-[10px] font-black uppercase tracking-[0.08em] text-black/60">
          Mistakes
        </div>
        <div className="mt-2 flex gap-1.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-black/75 bg-[#ff9cac] text-[11px]">
            X
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-black/75 bg-transparent text-[11px] text-black/25">
            O
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-black/75 bg-transparent text-[11px] text-black/25">
            O
          </span>
        </div>
      </div>
      <div className="grid min-w-[128px] grid-cols-2 gap-2">
        {[powerupIcon.hammer, powerupIcon.wand, powerupIcon.shield, powerupIcon.rocket].map(
          (icon) => (
            <div
              key={icon}
              className="flex h-12 items-center justify-center rounded-xl border border-black/15 bg-white/55 text-xl shadow-[0_3px_8px_rgba(0,0,0,0.08)]"
            >
              {icon}
            </div>
          )
        )}
      </div>
    </div>
    <p className="mt-3 text-center text-[11px] font-semibold text-black/70">
      Avoid misses, and use powerups when you need help.
    </p>
  </div>
);

const renderFinishVisual = () => (
  <div className="rounded-2xl bg-[linear-gradient(145deg,#efe7e2,#dfd5cf)] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
    <div className="rounded-2xl border border-black/15 bg-white/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-[#4ec86a] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-black">
          Solved
        </span>
        <span className="text-[11px] font-black text-black/70">+150 coins</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between rounded-xl bg-[#111111] px-2.5 py-2 text-[11px] font-black text-white">
          <span>You</span>
          <span>#4</span>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-black/12 bg-white/80 px-2.5 py-2 text-[10px] font-black text-black/70">
          <span>Leaderboard</span>
          <span>Daily</span>
        </div>
      </div>
    </div>
    <p className="mt-3 text-center text-[11px] font-semibold text-black/70">
      Every clear gives you progress, coins, and a better rank.
    </p>
  </div>
);

const renderSlideVisual = (slideId: HelpSlide['id']) => {
  switch (slideId) {
    case 'guess':
      return renderGuessVisual();
    case 'match':
      return renderMatchVisual();
    case 'survive':
      return renderSurviveVisual();
    case 'finish':
      return renderFinishVisual();
  }
};

export const HelpOverlay = ({
  deviceTier,
  helpCardWidthClass,
  helpCardRef,
  onClose,
}: HelpOverlayProps) => {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const isMobile = deviceTier === 'mobile';
  const canGoBackward = activeSlideIndex > 0;
  const canGoForward = activeSlideIndex < helpSlides.length - 1;

  return (
    <div
      data-testid="help-overlay"
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end px-2 pt-14"
    >
      <section
        data-testid="help-card"
        ref={helpCardRef}
        className={`app-surface pointer-events-auto w-full ${helpCardWidthClass} rounded-2xl border-[3px] app-border-strong app-text overflow-hidden`}
      >
        <header className="flex items-center justify-between border-b app-border px-3 py-2">
          <div className="min-w-0">
            <p className="app-text-soft text-[9px] font-black uppercase tracking-[0.12em]">
              Interactive Guide
            </p>
            <h2
              className={`${
                isMobile ? 'text-sm' : 'text-base'
              } font-black uppercase tracking-[0.04em]`}
            >
              How To Play
            </h2>
          </div>
          <button
            data-testid="help-close"
            className="btn-3d btn-close btn-compact btn-round flex h-8 w-8 items-center justify-center text-lg font-black leading-none"
            onClick={onClose}
            aria-label="Close help"
          >
            x
          </button>
        </header>

        <div className={`${isMobile ? 'p-2.5' : 'p-3'} space-y-3`}>
          <div className="overflow-hidden rounded-[20px]" data-testid="help-slide-track">
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${activeSlideIndex * 100}%)` }}
            >
              {helpSlides.map((slide, index) => (
                <section
                  key={slide.id}
                  data-testid={`help-slide-${slide.id}`}
                  className="min-w-full"
                >
                  <div className="app-surface-strong rounded-[20px] border app-border p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="rounded-full bg-black px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-white">
                        {slide.stepLabel}
                      </span>
                      <span className="app-text-soft text-[10px] font-black uppercase tracking-[0.08em]">
                        {index + 1} / {helpSlides.length}
                      </span>
                    </div>

                    {renderSlideVisual(slide.id)}

                    <div className="mt-3">
                      <h3
                        className={`${
                          isMobile ? 'text-[13px]' : 'text-[14px]'
                        } font-black uppercase leading-tight`}
                      >
                        {slide.title}
                      </h3>
                      <p
                        className={`${
                          isMobile ? 'mt-1.5 text-[10px]' : 'mt-2 text-[11px]'
                        } app-text font-semibold leading-relaxed`}
                      >
                        {slide.description}
                      </p>
                      <p
                        className={`${
                          isMobile ? 'mt-1.5 text-[9px]' : 'mt-2 text-[10px]'
                        } app-text-muted leading-relaxed`}
                      >
                        {slide.hint}
                      </p>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              data-testid="help-prev"
              type="button"
              className="btn-3d btn-neutral btn-compact rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em]"
              onClick={() => {
                if (!canGoBackward) {
                  return;
                }
                setActiveSlideIndex((current) => current - 1);
              }}
              disabled={!canGoBackward}
            >
              Back
            </button>

            <div className="flex items-center gap-1.5" data-testid="help-pagination">
              {helpSlides.map((slide, index) => {
                const isActive = index === activeSlideIndex;
                return (
                  <button
                    key={slide.id}
                    data-testid={`help-dot-${index}`}
                    type="button"
                    className={cn(
                      'h-2.5 rounded-full border border-black/30 transition-all',
                      isActive ? 'w-6 bg-black' : 'w-2.5 bg-black/20'
                    )}
                    onClick={() => setActiveSlideIndex(index)}
                    aria-label={`Open ${slide.stepLabel}`}
                    aria-pressed={isActive}
                    title={slide.title}
                  />
                );
              })}
            </div>

            <button
              data-testid="help-next"
              type="button"
              className="btn-3d btn-primary btn-compact rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em]"
              onClick={() => {
                if (!canGoForward) {
                  onClose();
                  return;
                }
                setActiveSlideIndex((current) => current + 1);
              }}
            >
              {canGoForward ? 'Next' : 'Done'}
            </button>
          </div>

          <p className="app-text-soft text-center text-[9px] font-semibold">
            Swipe-style guide: move through the cards to learn the flow quickly.
          </p>
        </div>
      </section>
    </div>
  );
};
