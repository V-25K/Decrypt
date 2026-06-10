import { memo, type RefCallback, type MouseEvent } from 'react';
import { cn } from '../utils';
import { CommunityVoteBar } from './CommunityVoteBar';
import { ReplayIcon, ShareIcon } from './Icons';
import { UiSprite } from './UiSprite';
import type { OutcomeCrowdBubble } from '../app/outcome-crowd';
import { truncateOutcomeQuote } from '../app/outcome-quote';

type OutcomeOverlayProps = {
  showSuccessOverlay: boolean;
  setConfettiCanvasNode: RefCallback<HTMLCanvasElement>;
  completionCrowdAvatarUrls: string[];
  completionCrowdReady: boolean;
  outcomeCrowdBubbles: OutcomeCrowdBubble[];
  handleOutcomeCrowdRef: (node: HTMLElement | null) => void;
  setOutcomeCrowdBubbleNode: (id: string, node: HTMLDivElement | null) => void;
  criticalOutcomeAvatarCount: number;
  busy: boolean;
  share: () => Promise<void>;
  nextChallenge: (event?: MouseEvent<HTMLButtonElement>) => void;
  isDailyComplete: boolean;
  retry: () => Promise<void>;
  openHome: () => void;
  subredditName: string | null;
  joiningCommunity: boolean;
  communityJoinRecorded: boolean;
  communityJoinLabel: string;
  handleJoinCommunity: () => Promise<void>;
  completionSolveLabel: string;
  pointsGainedLabel: string | null;
  ratingDeltaLabel: string | null;
  ratingDeltaTone: 'negative' | 'neutral' | 'positive';
  completionQuote: string;
  puzzleAuthor: string;
  hasClaimableQuest: boolean;
  openQuest: (event?: MouseEvent<HTMLButtonElement>) => void;
  outcomeLevelId: string | null;
};

export const OutcomeOverlay = memo(({
  showSuccessOverlay,
  setConfettiCanvasNode,
  completionCrowdAvatarUrls,
  completionCrowdReady,
  outcomeCrowdBubbles,
  handleOutcomeCrowdRef,
  setOutcomeCrowdBubbleNode,
  criticalOutcomeAvatarCount,
  busy,
  share,
  nextChallenge,
  isDailyComplete,
  retry,
  openHome,
  subredditName,
  joiningCommunity,
  communityJoinRecorded,
  communityJoinLabel,
  handleJoinCommunity,
  completionSolveLabel,
  pointsGainedLabel,
  ratingDeltaLabel,
  ratingDeltaTone,
  completionQuote,
  puzzleAuthor,
  hasClaimableQuest,
  openQuest,
  outcomeLevelId,
}: OutcomeOverlayProps) => {
  const displayedCompletionQuote = truncateOutcomeQuote(completionQuote);
  const ratingDeltaValueClass =
    ratingDeltaTone === 'positive'
      ? 'text-emerald-100'
      : ratingDeltaTone === 'negative'
        ? 'text-rose-100'
        : 'text-white';

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid={showSuccessOverlay ? 'success-overlay' : 'result-screen'}
    >
      {showSuccessOverlay && (
        <canvas
          ref={setConfettiCanvasNode}
          data-testid="result-confetti"
          className="result-confetti-canvas"
        />
      )}

      {showSuccessOverlay &&
        completionCrowdAvatarUrls.length > 0 &&
        completionCrowdReady && (
          <section
            data-testid="outcome-overlay-crowd"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[40%] min-h-[220px] max-h-[360px] overflow-hidden sm:h-[42%] sm:min-h-[240px] md:h-[44%] md:max-h-[420px]"
          >
            <div
              className="relative h-full w-full overflow-hidden"
              ref={handleOutcomeCrowdRef}
            >
              {outcomeCrowdBubbles.map((bubble) => {
                return (
                  <div
                    key={bubble.id}
                    ref={(node) => {
                      setOutcomeCrowdBubbleNode(bubble.id, node);
                    }}
                    role="img"
                    aria-label={`Player rank ${bubble.rank} avatar`}
                    className={cn(
                      'result-crowd-avatar absolute',
                      bubble.isPodium ? 'result-crowd-avatar-podium' : ''
                    )}
                    style={{
                      left: 0,
                      top: 0,
                      width: `${bubble.size}px`,
                      height: `${bubble.size}px`,
                      zIndex: bubble.z,
                      transform: `translate3d(${bubble.x}px, ${bubble.y}px, 0) translate(-50%, -50%)`,
                    }}
                  >
                    <div
                      className="result-crowd-avatar-frame"
                      style={{
                        background: `radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.42) 22%, rgba(255, 255, 255, 0.08) 38%), linear-gradient(165deg, rgba(255, 255, 255, 0.18), rgba(0, 0, 0, 0.2)), ${bubble.backgroundColor}`,
                        boxShadow: bubble.isPodium
                          ? '0 12px 24px rgba(0, 0, 0, 0.28)'
                          : '0 8px 16px rgba(0, 0, 0, 0.18)',
                      }}
                    >
                      <img
                        src={bubble.avatarUrl}
                        alt="Player avatar"
                        className="result-crowd-avatar-image"
                        loading="eager"
                        decoding="async"
                        fetchPriority={
                          bubble.rank <= criticalOutcomeAvatarCount ? 'high' : 'low'
                        }
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{ backgroundColor: 'var(--app-overlay)' }}
      />

      <main className="relative z-20 flex min-h-0 flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
              {showSuccessOverlay && (
                <button
                  type="button"
                  data-testid="overlay-share-comment"
                  className="btn-3d btn-primary btn-share-result btn-round flex h-11 w-11 items-center justify-center sm:h-12 sm:w-12 md:h-14 md:w-14"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void share();
                  }}
                  disabled={busy}
                  aria-label="Share score as yourself"
                  title="Share score as yourself"
                >
                  <ShareIcon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                </button>
              )}

              {showSuccessOverlay && !isDailyComplete && (
                <button
                  type="button"
                  data-testid="overlay-play-again"
                  className="btn-3d btn-retry btn-round flex h-11 w-11 items-center justify-center sm:h-12 sm:w-12 md:h-14 md:w-14"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void retry();
                  }}
                  disabled={busy}
                  aria-label="Play again"
                  title="Play again"
                >
                  <ReplayIcon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                </button>
              )}
              <button
                type="button"
                data-testid="overlay-go-home"
                className="btn-3d btn-home btn-round flex h-11 w-11 items-center justify-center sm:h-12 sm:w-12 md:h-14 md:w-14"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openHome();
                }}
                disabled={busy}
                aria-label="Go home"
                title="Go home"
              >
                <UiSprite
                  icon="home"
                  decorative
                  className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6"
                />
              </button>
              <button
                type="button"
                data-testid="overlay-next-challenge"
                className="btn-3d btn-primary flex h-11 items-center justify-center rounded-2xl px-4 text-[11px] font-black uppercase tracking-[0.04em] sm:h-12 sm:px-5 sm:text-[12px] md:h-14 md:px-6 md:text-[13px]"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  nextChallenge(event);
                }}
                disabled={busy}
                aria-label="Next challenge"
                title="Next challenge"
              >
                Next
              </button>
            </div>
            {subredditName && (
              <div className="pointer-events-auto flex justify-end">
                <button
                  type="button"
                  data-testid="join-community-button"
                  className="btn-3d btn-neutral app-text flex min-h-[38px] min-w-[148px] max-w-[188px] items-center justify-center rounded-2xl px-3 text-center text-[10px] font-black uppercase tracking-[0.03em] sm:min-h-[42px] sm:min-w-[176px] sm:max-w-[220px] sm:px-4 sm:text-[12px] md:min-h-[46px] md:min-w-[200px] md:px-5 md:text-[13px]"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleJoinCommunity();
                  }}
                  disabled={joiningCommunity || communityJoinRecorded}
                  aria-label={
                    communityJoinRecorded
                      ? 'Joined community'
                      : `Subscribe to r/${subredditName}`
                  }
                  title={
                    communityJoinRecorded
                      ? 'Community joined'
                      : `Subscribe to r/${subredditName}`
                  }
                >
                  {communityJoinLabel}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quest Button - Bottom Left (Book Tag Style) */}
        {showSuccessOverlay && hasClaimableQuest && (
          <div className="pointer-events-none absolute bottom-0 left-0 z-30 pb-4 sm:pb-5">
            <div className="pointer-events-auto relative">
              <button
                type="button"
                data-testid="overlay-quest-button"
                className="quest-book-tag group relative flex items-center gap-2 overflow-visible pl-3 pr-4 py-2 sm:pl-4 sm:pr-5 sm:py-2.5"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openQuest(event);
                }}
                disabled={busy}
                aria-label="View unclaimed quests"
                title="You have unclaimed quest rewards!"
	                style={{
	                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
	                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
	                  borderTopRightRadius: '12px',
	                  borderBottomRightRadius: '12px',
	                  boxShadow: '0 4px 12px rgba(251, 191, 36, 0.4), 0 0 20px rgba(251, 191, 36, 0.3)',
	                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
	                }}
	              >
                {/* Integrated notification ping - part of button */}
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
                </span>
                
                <span className="text-xs font-black uppercase tracking-wide text-white sm:text-sm">
                  Claim
                </span>
              </button>
            </div>
          </div>
        )}

        <div className="mx-auto flex h-full min-h-0 w-full max-w-[680px] flex-col justify-center overflow-hidden bg-transparent px-3 pb-20 pt-16 sm:px-4 sm:pb-24 sm:pt-20">
          <div className="mx-auto flex w-full max-w-[500px] flex-col items-center text-center">
            {(showSuccessOverlay ||
              displayedCompletionQuote.length > 0 ||
              ratingDeltaLabel ||
              pointsGainedLabel) && (
              <div className="relative w-full max-w-[500px] shrink-0">
                {showSuccessOverlay && (
                  <div
                    data-testid="outcome-time-pill"
                    className="absolute bottom-[calc(100%-1px)] left-1/2 flex -translate-x-1/2 translate-y-0 items-center gap-2 rounded-t-2xl border-x border-t border-white bg-transparent px-4 py-1.5"
                  >
                    <span className="text-[11px] font-black uppercase tracking-[0.03em] text-white sm:text-[12px]">
                      Time:
                    </span>
                    <span className="text-[clamp(17px,3.4vw,24px)] leading-none font-black tabular-nums text-white">
                      {completionSolveLabel}
                    </span>
                  </div>
                )}

                <section
                  data-testid="outcome-overlay-quote"
                  className="max-h-[44vh] overflow-hidden rounded-2xl border border-white bg-transparent px-3 py-3 text-center sm:max-h-[46vh] sm:px-5 sm:py-4"
                >
                  <p className="text-4xl font-black leading-none text-white/85">"</p>
                  <p className="outcome-quote-text mt-1 text-[clamp(12px,2.3vw,24px)] font-black leading-snug text-white">
                    {displayedCompletionQuote}
                  </p>
                  <p className="outcome-quote-author mt-2 text-[clamp(14px,2.3vw,20px)] font-semibold text-white">
                    ~ {puzzleAuthor}
                  </p>
                </section>
                {(ratingDeltaLabel || pointsGainedLabel) && (
                  <div
                    data-testid="outcome-rating-pill"
                    className="absolute left-1/2 top-[calc(100%-1px)] flex -translate-x-1/2 translate-y-0 items-center gap-3 rounded-b-2xl border-x border-b border-white bg-transparent px-3 py-1"
                  >
                    {ratingDeltaLabel && (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-[9px] font-black uppercase tracking-[0.03em] text-white sm:text-[10px]">
                          Rating:
                        </span>
                        <span
                          data-testid="outcome-rating-delta"
                          className={cn(
                            'text-[13px] leading-none font-black tabular-nums sm:text-[15px]',
                            ratingDeltaValueClass
                          )}
                        >
                          {ratingDeltaLabel}
                        </span>
                      </span>
                    )}
                    {pointsGainedLabel && (
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className="text-[9px] font-black uppercase tracking-[0.03em] text-white sm:text-[10px]">
                          Points:
                        </span>
                        <span
                          data-testid="outcome-points-gained"
                          className="text-[13px] leading-none font-black tabular-nums text-white sm:text-[15px]"
                        >
                          {pointsGainedLabel}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Community challenges get a like/dislike here (self-hides for
                daily puzzles and the creator's own challenge). */}
            <CommunityVoteBar levelId={outcomeLevelId} />
          </div>
        </div>
      </main>
    </section>
  );
});

OutcomeOverlay.displayName = 'OutcomeOverlay';
