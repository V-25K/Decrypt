import { showToast } from '@devvit/web/client';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  challengeTypeDisplayOrder,
  challengeTypeMetadata,
  type ChallengeType,
} from '../../shared/game';
import {
  maxPuzzleTotalLength,
  minPlayablePuzzleTotalLength,
} from '../../shared/puzzle-limits';
import type {
  CommunityCreationMode,
  CommunityManualLayout,
  CommunityManualPadlock,
  CommunitySubmissionStatus,
} from '../../shared/community';
import { trpc } from '../trpc';
import type { DeviceTier, RouterOutputs } from '../app/types';
import { cn } from '../utils';
import { tabButtonClass } from '../app/ui';
import { UiSprite } from '../components/UiSprite';

type CommunitySubmission =
  RouterOutputs['community']['listMine']['submissions'][number];

type CommunityPreview = RouterOutputs['community']['previewSubmission'];

type ManualLayoutTool = 'reveal' | 'blind' | 'lock' | 'key';
type CreateStep = 'edit' | 'preview';
type ModerationReasonAction = 'reject' | 'request_changes' | 'remove';
type ModerationReasonPrompt = {
  action: ModerationReasonAction;
  submissionId: string;
  title: string;
};

type CommunityScreenProps = {
  deviceTier: DeviceTier;
  isModerator: boolean;
  notifications: RouterOutputs['game']['bootstrap']['communityNotifications'];
  onSubmitted: () => void;
};

const challengeCategories = challengeTypeDisplayOrder;

const categoryLabel = (value: ChallengeType): string =>
  challengeTypeMetadata[value].shortLabel;

const communityStatuses: CommunitySubmissionStatus[] = [
  'pending',
  'approved',
  'changes_requested',
  'rejected',
  'removed',
];

const parseCategory = (value: string): ChallengeType =>
  challengeCategories.find((category) => category === value) ?? 'QUOTE';

const parseStatus = (value: string): CommunitySubmissionStatus =>
  communityStatuses.find((status) => status === value) ?? 'pending';

const statusLabel = (status: CommunitySubmissionStatus): string =>
  status.replace(/_/g, ' ').toUpperCase();

const difficultyTierLabel = (difficulty: number): string => {
  if (difficulty <= 3) {
    return 'Easy';
  }
  if (difficulty <= 5) {
    return 'Medium';
  }
  if (difficulty <= 8) {
    return 'Hard';
  }
  return 'Expert';
};

const difficultyPreferenceOptions = [
  { label: 'Easy', value: 2 },
  { label: 'Medium', value: 5 },
  { label: 'Hard', value: 8 },
  { label: 'Expert', value: 9 },
] satisfies { label: string; value: number }[];

const communityDraftStorageKey = 'decrypt:community:create-draft:v1';

type CommunityDraft = {
  title: string;
  text: string;
  category: ChallengeType;
  attribution: string;
  targetDifficulty: number;
  creationMode: CommunityCreationMode;
};

const readStringProperty = (source: object, key: string): string =>
  typeof Reflect.get(source, key) === 'string' ? Reflect.get(source, key) : '';

const readCommunityDraft = (): CommunityDraft | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(communityDraftStorageKey);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const targetDifficulty = Reflect.get(parsed, 'targetDifficulty');
    const creationMode = Reflect.get(parsed, 'creationMode');
    return {
      title: readStringProperty(parsed, 'title'),
      text: readStringProperty(parsed, 'text'),
      category: parseCategory(readStringProperty(parsed, 'category')),
      attribution: readStringProperty(parsed, 'attribution'),
      targetDifficulty:
        typeof targetDifficulty === 'number' && Number.isInteger(targetDifficulty)
          ? targetDifficulty
          : 5,
      creationMode: creationMode === 'manual' ? 'manual' : 'auto',
    };
  } catch (_error) {
    return null;
  }
};

const writeCommunityDraft = (draft: CommunityDraft): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.setItem(communityDraftStorageKey, JSON.stringify(draft));
  } catch (_error) {
    // Storage can be unavailable in embedded/private contexts.
  }
};

const clearCommunityDraft = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.sessionStorage.removeItem(communityDraftStorageKey);
  } catch (_error) {
    // Ignore storage failures; the submitted state is still reset in memory.
  }
};

const characterCounterClass = (length: number, max: number): string =>
  cn(
    'mt-1 text-right text-[10px] font-bold',
    length >= max * 0.9 ? 'text-red-200' : 'app-text-muted'
  );

const emptyManualLayout = (): CommunityManualLayout => ({
  prefilledIndices: [],
  prefilledWordIndices: [],
  blindIndices: [],
  lockIndices: [],
  lockKeyIndices: [],
  padlocks: [],
});

const toggleNumber = (values: number[], value: number): number[] =>
  values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value].sort((a, b) => a - b);

const sameCipherTileIndices = (
  puzzlePreview: CommunityPreview['puzzlePreview'],
  tileIndex: number
): number[] => {
  if (!puzzlePreview) {
    return [tileIndex];
  }
  const selectedTile = puzzlePreview.tiles.find((tile) => tile.index === tileIndex);
  if (!selectedTile?.isLetter || selectedTile.cipherNumber === null) {
    return [tileIndex];
  }
  return puzzlePreview.tiles
    .filter(
      (tile) => tile.isLetter && tile.cipherNumber === selectedTile.cipherNumber
    )
    .map((tile) => tile.index);
};

const getManualPadlocks = (
  layout: CommunityManualLayout
): CommunityManualPadlock[] => {
  if (layout.padlocks.length > 0) {
    return layout.padlocks;
  }
  if (layout.lockIndices.length > 0 || layout.lockKeyIndices.length > 0) {
    return [
      {
        padlockId: 1,
        lockedIndices: layout.lockIndices,
        keyIndices: layout.lockKeyIndices,
      },
    ];
  }
  return [];
};

const syncManualPadlocks = (
  layout: CommunityManualLayout,
  padlocks: CommunityManualPadlock[]
): CommunityManualLayout => {
  return {
    ...layout,
    padlocks,
    lockIndices: padlocks
      .flatMap((padlock) => padlock.lockedIndices)
      .sort((a, b) => a - b),
    lockKeyIndices: padlocks
      .flatMap((padlock) => padlock.keyIndices)
      .sort((a, b) => a - b),
  };
};

const removeTileFromPadlocks = (
  padlocks: CommunityManualPadlock[],
  tileIndex: number
): CommunityManualPadlock[] =>
  padlocks.map((padlock) => ({
    ...padlock,
    lockedIndices: padlock.lockedIndices.filter((index) => index !== tileIndex),
    keyIndices: padlock.keyIndices.filter((index) => index !== tileIndex),
  }));

const removeTileLocksFromPadlocks = (
  padlocks: CommunityManualPadlock[],
  tileIndex: number
): CommunityManualPadlock[] =>
  padlocks.map((padlock) => ({
    ...padlock,
    lockedIndices: padlock.lockedIndices.filter((index) => index !== tileIndex),
  }));

const nextManualPadlockId = (padlocks: CommunityManualPadlock[]): number =>
  padlocks.reduce(
    (highest, padlock) => Math.max(highest, padlock.padlockId),
    0
  ) + 1;


const SubmissionCard = ({
  submission,
  action,
}: {
  submission: CommunitySubmission;
  action?: ReactNode;
}) => (
  <article
    className={cn(
      'app-surface-subtle app-border rounded-lg border px-3 py-3',
      submission.status === 'changes_requested'
        ? 'border-red-300/60 shadow-[0_0_0_1px_rgba(252,165,165,0.25)]'
        : ''
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="app-text text-xs font-black uppercase">
          {categoryLabel(submission.category)} · {statusLabel(submission.status)}
        </div>
	        <h3 className="app-text mt-2 truncate text-sm font-black">
	          {submission.title}
	        </h3>
	        <p className="app-text mt-2 text-sm font-semibold leading-snug">
	          {submission.text}
	        </p>
        <p className="app-text-muted mt-1 text-xs font-bold">
          {submission.attribution}
        </p>
        {submission.rejectionReason && submission.status !== 'withdrawn' && (
          <p className="mt-2 text-xs font-semibold text-red-200">
            {submission.status === 'changes_requested'
              ? `Mod requested changes: ${submission.rejectionReason}`
              : submission.rejectionReason}
          </p>
        )}
        {submission.status === 'withdrawn' && (
          <p className="app-text-muted mt-2 text-xs font-semibold">
            Withdrawn by you.
          </p>
        )}
        {submission.levelId && (
          <p className="app-text-soft mt-2 text-[11px] font-black uppercase">
            {submission.levelId}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  </article>
);

const PreviewPanel = ({
  creationMode,
  manualLayout,
  manualTool,
  selectedPadlockId,
  onAddPadlock,
  onManualToolChange,
  onRemoveSelectedPadlock,
  onSelectedPadlockChange,
  onToggleManualTile,
  preview,
  focusedCipherNumber,
}: {
  creationMode: CommunityCreationMode;
  manualLayout: CommunityManualLayout;
  manualTool: ManualLayoutTool;
  selectedPadlockId: number;
  onAddPadlock: () => void;
  onManualToolChange: (tool: ManualLayoutTool) => void;
  onRemoveSelectedPadlock: () => void;
  onSelectedPadlockChange: (padlockId: number) => void;
  onToggleManualTile: (tileIndex: number, cipherNumber: number | null) => void;
  preview: CommunityPreview | null;
  focusedCipherNumber: number | null;
}) => {
  if (!preview) {
    return null;
  }
  const manualMode = creationMode === 'manual';
  const publicLockedByTile = new Map<number, number>();
  const publicKeyByTile = new Map<number, number>();
  if (preview.puzzlePreview) {
    for (const tile of preview.puzzlePreview.tiles) {
      if (tile.lockChainId) {
        if (tile.isLocked) {
          publicLockedByTile.set(tile.index, tile.lockChainId);
        } else {
          publicKeyByTile.set(tile.index, tile.lockChainId);
        }
      }
    }
  }
  const prefilledSet = new Set(manualLayout.prefilledIndices);
  const blindSet = new Set(manualLayout.blindIndices);
  const padlocks = getManualPadlocks(manualLayout);
  const selectedPadlock =
    padlocks.find((padlock) => padlock.padlockId === selectedPadlockId) ??
    padlocks[0];
  const selectedPadlockStatus = selectedPadlock
    ? selectedPadlock.lockedIndices.length === 0 &&
      selectedPadlock.keyIndices.length === 0
      ? 'Set locked tiles'
      : selectedPadlock.lockedIndices.length > 0 &&
          selectedPadlock.keyIndices.length === 0
        ? 'Add key tiles'
        : `${selectedPadlock.lockedIndices.length} locked - ${selectedPadlock.keyIndices.length} ${
            selectedPadlock.keyIndices.length === 1 ? 'key' : 'keys'
          }`
	    : '';
  const manualStep =
    manualTool === 'reveal'
      ? {
          label: 'Step 1',
          title: 'Choose starter letters',
          detail: 'Tap letters players should see at the start.',
        }
      : manualTool === 'blind'
        ? {
            label: 'Step 2',
            title: 'Add question marks',
            detail: 'Tap letters that should hide their cipher number.',
          }
        : manualTool === 'lock'
          ? {
              label: 'Step 2',
              title: `Pick locked tiles for Lock ${selectedPadlock?.padlockId ?? 1}`,
              detail: 'Tapping one cipher number selects its matching tiles.',
            }
          : {
              label: 'Step 3',
              title: `Pick key tiles for Lock ${selectedPadlock?.padlockId ?? 1}`,
              detail: 'Choose one or two letters that unlock this padlock.',
            };
  const manualHelp =
    manualTool === 'reveal'
      ? {
          title: 'How Reveal Letter works',
          steps: [
            'Tap a letter tile to show it when the puzzle starts.',
            'Revealed letters make the cipher easier and can help a harder layout stay fair.',
            'Tap the same tile again to remove the reveal.',
          ],
        }
      : manualTool === 'blind'
        ? {
            title: 'How Blind Tile works',
            steps: [
              'Tap a letter tile to hide it behind a question mark.',
              'Blind tiles make the cipher harder because players cannot see that cipher number at first.',
              'Tap the same tile again to remove the question mark.',
            ],
          }
        : manualTool === 'key'
          ? {
              title: 'How Key Tiles work',
              steps: [
                'Choose the lock you want to edit.',
                'Pick one or two key letters for that lock.',
                'When players reveal a key tile, it unlocks only the matching locked tiles.',
              ],
            }
          : {
              title: 'How Padlocks work',
              steps: [
                'Choose or add a lock.',
                'Mark the letters that should start locked.',
                'Switch to Key Tiles and pick one or two letters that unlock that lock.',
              ],
            };
  const lockedByTile = new Map<number, number>();
  const keyByTile = new Map<number, number>();
  for (const padlock of padlocks) {
    for (const index of padlock.lockedIndices) {
      lockedByTile.set(index, padlock.padlockId);
    }
    for (const index of padlock.keyIndices) {
      keyByTile.set(index, padlock.padlockId);
    }
  }
  const hasObstructionPreview =
    manualMode ||
    (preview.puzzlePreview?.tiles.some(
      (tile) => tile.isBlind || tile.isLocked || Boolean(tile.lockChainId)
    ) ??
      false);
  const manualProblems = preview.reasons;
  const previewTier = difficultyTierLabel(
    preview.suggestedDifficulty.estimatedDifficulty
  );
  const previewReady =
    preview.valid &&
    (creationMode !== 'manual' || manualProblems.length === 0);
			  return (
			    <section className="app-surface-subtle app-border rounded-lg border px-3 py-3">
		      <div className="app-text text-sm font-black">
		        {preview.sanitizedTitle}
		      </div>
		      <div className="app-text mt-1 text-xs font-black uppercase">
		        {previewTier}
		      </div>
      <div className="app-text-muted mt-1 text-[11px] font-semibold">
        {preview.suggestedDifficulty.uniqueLetterCount} unique letters.
      </div>
	      <div
	        className={cn(
	          'mt-2 rounded-md px-3 py-2 text-xs font-bold',
	          previewReady
	            ? 'bg-emerald-400/15 text-emerald-100'
	            : 'bg-red-500/15 text-red-100'
	        )}
	      >
	        {previewReady
	          ? 'This challenge is ready to submit.'
	          : manualProblems[0] ?? 'Check the board setup before submitting.'}
	      </div>
	      {manualProblems.length > 1 && (
	        <ul className="mt-2 space-y-1 text-xs font-semibold text-red-200">
	          {manualProblems.slice(1).map((reason) => (
	            <li key={reason}>{reason}</li>
	          ))}
	        </ul>
	      )}
      {creationMode === 'manual' && preview.manualLayoutGuidance && (
        <div
          className={cn(
            'mt-2 rounded-md px-3 py-2 text-xs font-semibold leading-snug',
            preview.manualLayoutGuidance.status === 'aligned'
              ? 'bg-emerald-400/10 text-emerald-100'
              : preview.manualLayoutGuidance.status === 'unfair'
                ? 'bg-red-500/15 text-red-100'
                : 'bg-amber-300/15 text-amber-100'
          )}
        >
          <div className="font-black">
            {preview.manualLayoutGuidance.messages[0]}
          </div>
          {preview.manualLayoutGuidance.suggestedActions.length > 0 && (
            <ul className="mt-1 space-y-1">
              {preview.manualLayoutGuidance.suggestedActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {creationMode === 'manual' && preview.puzzlePreview && (
        <div className="mt-3 space-y-3">
          <div className="app-surface app-border rounded-md border px-2.5 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="app-text-soft text-[10px] font-black uppercase">
                  {manualStep.label}
                </span>
                <div className="app-text text-xs font-black">
                  {manualStep.title}
                </div>
              </div>
              {selectedPadlock && (manualTool === 'lock' || manualTool === 'key') && (
                <span className="badge-primary rounded-md px-2 py-1 text-[10px] font-black uppercase">
                  {selectedPadlock.lockedIndices.length} locked / {selectedPadlock.keyIndices.length} keys
                </span>
              )}
            </div>
            <p className="app-text-muted mt-1 text-[11px] font-semibold leading-snug">
              {manualStep.detail}
            </p>
            {focusedCipherNumber !== null && (
              <p className="app-text-soft mt-1 text-[10px] font-black uppercase">
                Cipher {focusedCipherNumber} group highlighted
              </p>
            )}
          </div>
			          <div className="flex flex-wrap gap-1.5">
			            {(['reveal', 'blind', 'lock'] satisfies ManualLayoutTool[]).map((tool) => (
			              <button
	                key={tool}
	                type="button"
	                className={cn(
	                  tabButtonClass(
	                    tool === 'lock'
	                      ? manualTool === 'lock' || manualTool === 'key'
	                      : manualTool === tool
	                  ),
	                  'min-h-[34px] px-3 text-[10px]'
	                )}
		                onClick={() => {
		                  if (tool === 'lock' && padlocks.length === 0) {
		                    onAddPadlock();
		                    return;
		                  }
		                  onManualToolChange(tool);
		                }}
		                title={
		                  tool === 'reveal'
		                    ? 'Show this letter when the puzzle starts.'
		                    : tool === 'blind'
		                      ? 'Hide this tile behind a question mark.'
		                      : tool === 'lock'
		                        ? 'Lock matching letter tiles until a key is found.'
		                        : 'Mark a tile as a key for the selected lock.'
		                }
		              >
		                {tool === 'reveal'
		                  ? 'Reveal Letter'
		                  : tool === 'blind'
		                    ? 'Blind Tile'
		                    : 'Padlock'}
			              </button>
			            ))}
			          </div>
			          {(manualTool === 'lock' || manualTool === 'key') && (
			            <div className="app-surface app-border rounded-md border px-2 py-2">
			              <div className="flex flex-wrap items-center justify-between gap-2">
			                <span className="app-text text-[10px] font-black uppercase">
			                  Padlocks
			                </span>
			                <div className="flex gap-1.5">
			                  {selectedPadlock && (
			                    <button
			                      type="button"
			                      className="btn-3d btn-neutral rounded-md px-2 py-1 text-[10px] font-black uppercase"
			                      onClick={onRemoveSelectedPadlock}
			                    >
			                      - Padlock
			                    </button>
			                  )}
			                  <button
			                    type="button"
			                    className="btn-3d btn-neutral rounded-md px-2 py-1 text-[10px] font-black uppercase"
			                    onClick={onAddPadlock}
			                  >
			                    + Padlock
			                  </button>
			                </div>
			              </div>
				              {selectedPadlock && (
				                <>
				                <div className="mt-2 grid grid-cols-2 gap-1.5">
			                  <button
			                    type="button"
			                    className={cn(tabButtonClass(manualTool === 'lock'), 'text-[10px]')}
			                    onClick={() => onManualToolChange('lock')}
			                  >
			                    Locked Tiles
			                  </button>
			                  <button
			                    type="button"
			                    className={cn(tabButtonClass(manualTool === 'key'), 'text-[10px]')}
			                    onClick={() => onManualToolChange('key')}
			                  >
			                    Key Tiles
			                  </button>
				                </div>
	                <p className="app-text-muted mt-2 text-[11px] font-semibold leading-snug">
	                  {selectedPadlockStatus}
	                </p>
				                </>
				              )}
			              <div className="mt-2 flex flex-wrap gap-1.5">
			                {padlocks.map((padlock) => (
			                  <button
			                    key={padlock.padlockId}
			                    type="button"
			                    className={cn(
			                      tabButtonClass(
			                        selectedPadlock?.padlockId === padlock.padlockId
			                      ),
			                      'min-h-[30px] px-2 text-[10px]'
			                    )}
			                    onClick={() => onSelectedPadlockChange(padlock.padlockId)}
			                  >
				                    Lock {padlock.padlockId}
				                    {selectedPadlock?.padlockId === padlock.padlockId
				                      ? ` - ${selectedPadlockStatus}`
				                      : ''}
			                  </button>
			                ))}
			              </div>
			              {padlocks.length === 0 && (
			                <p className="app-text-muted mt-2 text-[11px] font-semibold leading-snug">
			                  Add a padlock, mark its locked tiles, then switch to Key Tiles for the same padlock.
			                </p>
			              )}
			            </div>
			          )}
				          <details className="app-text-muted text-[11px] font-semibold leading-snug">
				            <summary className="app-text cursor-pointer font-black">
				              {manualHelp.title}
				            </summary>
				            <ol className="mt-1 list-decimal space-y-1 pl-4">
				              {manualHelp.steps.map((step) => (
				                <li key={step}>{step}</li>
				              ))}
				            </ol>
				          </details>
			        </div>
			      )}
	      {preview.puzzlePreview && (
	        <div className="mt-3 space-y-2">
          {hasObstructionPreview && (
	            <div className="app-text-muted flex flex-wrap justify-center gap-2 text-[10px] font-bold uppercase">
	              <span className="inline-flex items-center gap-1">
	                <span className="h-2.5 w-2.5 rounded-sm bg-amber-300" />
	                Revealed
	              </span>
	              <span className="inline-flex items-center gap-1">
	                <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
	                Blind
	              </span>
	              <span className="inline-flex items-center gap-1">
	                <span className="h-2.5 w-2.5 rounded-sm bg-rose-400" />
	                Locked
	              </span>
	              <span className="inline-flex items-center gap-1">
	                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
	                Key
	              </span>
	            </div>
	          )}
	        <div className="flex flex-wrap justify-center gap-1.5">
	          {preview.puzzlePreview.tiles.map((tile) =>
	            tile.isLetter ? (
	              <button
	                key={tile.index}
	                type="button"
		                className={cn(
		                  'app-surface app-border inline-flex min-h-[34px] min-w-[30px] flex-col items-center justify-center rounded-md border px-1 font-black',
		                  manualMode &&
		                    prefilledSet.has(tile.index)
		                    ? 'ring-2 ring-amber-300'
		                    : '',
			                  (manualMode ? blindSet.has(tile.index) : tile.isBlind)
			                    ? 'bg-sky-500/25'
			                    : '',
			                  (manualMode
			                    ? lockedByTile.has(tile.index)
			                    : tile.isLocked)
			                    ? 'bg-rose-500/25'
			                    : '',
			                  (manualMode
			                    ? keyByTile.has(tile.index)
			                    : publicKeyByTile.has(tile.index))
			                    ? 'bg-emerald-500/25'
			                    : '',
			                  manualMode &&
			                    lockedByTile.get(tile.index) === selectedPadlockId
			                    ? 'ring-2 ring-rose-300'
			                    : '',
                  manualMode &&
                    keyByTile.get(tile.index) === selectedPadlockId
                    ? 'ring-2 ring-emerald-300'
                    : '',
                  manualMode &&
                    focusedCipherNumber !== null &&
                    tile.cipherNumber === focusedCipherNumber
                    ? 'outline outline-2 outline-offset-2 outline-fuchsia-300'
                    : ''
                )}
        onClick={() => {
          if (manualMode) {
            onToggleManualTile(tile.index, tile.cipherNumber ?? null);
          }
        }}
			              >
			                <span className="flex h-5 items-center justify-center text-base leading-none">
			                  {(manualMode
			                    ? lockedByTile.has(tile.index)
			                    : tile.isLocked) ? (
			                    <span className="relative flex h-5 w-5 items-center justify-center">
			                      <UiSprite icon="lock" decorative className="h-5 w-5" />
			                      <span className="absolute -bottom-1 -right-1 rounded bg-black/70 px-0.5 text-[8px] leading-none text-amber-100">
			                        {manualMode
			                          ? lockedByTile.get(tile.index)
			                          : tile.lockChainId ?? ''}
			                      </span>
			                    </span>
			                  ) : (manualMode
			                    ? keyByTile.has(tile.index)
			                    : publicKeyByTile.has(tile.index)) ? (
			                    <span className="relative flex h-5 w-5 items-center justify-center">
			                      <UiSprite icon="key" decorative className="h-5 w-5" />
			                      <span className="absolute -bottom-1 -right-1 rounded bg-black/70 px-0.5 text-[8px] leading-none text-emerald-100">
			                        {manualMode
			                          ? keyByTile.get(tile.index)
			                          : publicKeyByTile.get(tile.index) ?? ''}
			                      </span>
			                    </span>
			                  ) : (manualMode ? blindSet.has(tile.index) : tile.isBlind) ? (
			                    '?'
			                  ) : tile.displayChar === '_' ? '_' : tile.displayChar}
			                </span>
		                <span className="app-text-muted text-[9px] leading-none">
		                  {(manualMode ? blindSet.has(tile.index) : tile.isBlind) ? (
		                    <UiSprite icon="question" decorative className="h-3 w-3" />
		                  ) : (
		                    tile.cipherNumber ?? ''
		                  )}
		                </span>
	              </button>
	            ) : (
              <span
                key={tile.index}
                className="app-text inline-flex min-h-[34px] min-w-[10px] items-end justify-center text-base font-black"
              >
                {tile.displayChar}
              </span>
            )
          )}
        </div>
        </div>
      )}
    </section>
  );
};

export const CommunityScreen = ({
  deviceTier,
  isModerator,
  notifications,
  onSubmitted,
		}: CommunityScreenProps) => {
		  const initialDraft = useMemo(() => readCommunityDraft(), []);
  const [tab, setTab] = useState<'create' | 'mine' | 'review'>(
    notifications.creatorChangesRequestedCount > 0
      ? 'mine'
      : isModerator && notifications.moderatorPendingReviewCount > 0
        ? 'review'
        : 'create'
  );
	  const [createStep, setCreateStep] = useState<CreateStep>('edit');
	  const [title, setTitle] = useState(initialDraft?.title ?? '');
	  const [text, setText] = useState(initialDraft?.text ?? '');
	  const [category, setCategory] = useState<ChallengeType>(
	    initialDraft?.category ?? 'QUOTE'
	  );
	  const [attribution, setAttribution] = useState(
	    initialDraft?.attribution ?? ''
	  );
	  const [targetDifficulty, setTargetDifficulty] = useState(
	    initialDraft?.targetDifficulty ?? 5
	  );
	  const [creationMode, setCreationMode] =
	    useState<CommunityCreationMode>(initialDraft?.creationMode ?? 'auto');
	  const [manualLayout, setManualLayout] =
	    useState<CommunityManualLayout>(() => emptyManualLayout());
	  const [manualTool, setManualTool] = useState<ManualLayoutTool>('reveal');
	  const [selectedPadlockId, setSelectedPadlockId] = useState(1);
	  const [focusedManualCipherNumber, setFocusedManualCipherNumber] =
	    useState<number | null>(null);
	  const [preview, setPreview] = useState<CommunityPreview | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<CommunitySubmission[]>([]);
  const [mineLoading, setMineLoading] = useState(false);
	  const [reviewStatus, setReviewStatus] =
	    useState<CommunitySubmissionStatus>('pending');
	  const [reviewItems, setReviewItems] = useState<CommunitySubmission[]>([]);
  const [moderationPrompt, setModerationPrompt] =
    useState<ModerationReasonPrompt | null>(null);
  const [moderationReason, setModerationReason] = useState('');
	  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
	  const isEditingRequestedChanges = editingSubmissionId !== null;
  const trimmedModerationReason = moderationReason.trim();
  const hasActionableModerationReason = trimmedModerationReason.length >= 3;

	  const input = useMemo(
	    () => ({
	      title,
	      text,
		      category,
		      attribution,
		      targetDifficulty,
		      creationMode,
		      manualLayout: creationMode === 'manual' ? manualLayout : null,
		    }),
	    [attribution, category, creationMode, manualLayout, targetDifficulty, text, title]
	  );
  const inputFingerprint = useMemo(() => JSON.stringify(input), [input]);

  useEffect(() => {
    if (isEditingRequestedChanges) {
      return;
    }
    writeCommunityDraft({
      title,
      text,
      category,
      attribution,
      targetDifficulty,
      creationMode,
    });
  }, [
    attribution,
    category,
    creationMode,
    isEditingRequestedChanges,
    targetDifficulty,
    text,
    title,
  ]);

  useEffect(() => {
    setPreview(null);
    setPreviewFingerprint(null);
    setCreateStep('edit');
  }, [attribution, category, creationMode, targetDifficulty, text, title]);

  const loadMine = useCallback(async () => {
    setMineLoading(true);
    try {
      const result = await trpc.community.listMine.query();
      setMine(result.submissions);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not load your submissions.');
    } finally {
      setMineLoading(false);
    }
  }, []);

	  const loadReview = useCallback(async () => {
    if (!isModerator) {
      return;
    }
    const result = await trpc.admin.listCommunitySubmissions.query({
      status: reviewStatus,
      limit: 25,
    });
    setReviewItems(result.submissions);
	  }, [isModerator, reviewStatus]);

	  const getFriendlyValidationMessage = (requireReadyPreview = false): string | null => {
	    if (!title.trim()) {
	      return 'Give your challenge a short title first.';
	    }
	    if (!text.trim()) {
	      return 'Paste the line players will decrypt first.';
	    }
		    if (text.trim().length < minPlayablePuzzleTotalLength) {
		      return `Use at least ${minPlayablePuzzleTotalLength} characters so the cipher is interesting.`;
	    }
	    if (!attribution.trim()) {
	      return 'Add who said it or where it is from.';
	    }
	    if (requireReadyPreview && !preview) {
	      return 'Preview the challenge before submitting.';
	    }
	    if (
	      requireReadyPreview &&
	      preview &&
	      previewFingerprint !== inputFingerprint
	    ) {
	      return 'Go back, review your changes, and preview again before submitting.';
	    }
	    if (requireReadyPreview && preview && !preview.valid) {
	      return preview.reasons[0] ?? 'Preview needs changes before submitting.';
	    }
	    return null;
	  };

  useEffect(() => {
    if (tab === 'mine') {
      void loadMine();
    }
  }, [loadMine, tab]);

	  useEffect(() => {
	    if (tab === 'review') {
	      void loadReview();
	    }
	  }, [loadReview, tab]);

	  const hasManualPreview = creationMode === 'manual' && preview !== null;
	  const canSubmit =
	    isEditingRequestedChanges ||
	    (preview?.valid === true && previewFingerprint === inputFingerprint);
  const visibleMine = useMemo(
    () =>
      [...mine].sort((left, right) => {
        if (left.status === 'changes_requested' && right.status !== 'changes_requested') {
          return -1;
        }
        if (left.status !== 'changes_requested' && right.status === 'changes_requested') {
          return 1;
        }
        return right.submittedAt - left.submittedAt;
      }),
    [mine]
  );

	  useEffect(() => {
	    if (!hasManualPreview || busy) {
	      return;
	    }
	    let cancelled = false;
	    const timeoutId = window.setTimeout(() => {
	      void trpc.community.previewSubmission
	        .query(input)
	        .then((result) => {
	          if (!cancelled) {
	            setPreview(result);
	            setPreviewFingerprint(inputFingerprint);
	          }
	        })
	        .catch(() => undefined);
	    }, 500);
	    return () => {
	      cancelled = true;
	      window.clearTimeout(timeoutId);
	    };
	  }, [busy, hasManualPreview, input, inputFingerprint]);

		  const handlePreview = async () => {
	    const friendlyMessage =
	      !title.trim() || !text.trim() || !attribution.trim()
	        ? getFriendlyValidationMessage()
	        : null;
	    if (friendlyMessage) {
	      showToast(friendlyMessage);
	      return;
	    }
	    setBusy(true);
    try {
      const result = await trpc.community.previewSubmission.query(input);
      setPreview(result);
      setPreviewFingerprint(inputFingerprint);
      setCreateStep('preview');
      if (!result.valid) {
        showToast(result.reasons[0] ?? 'Preview needs changes.');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const friendlyMessage = getFriendlyValidationMessage(!isEditingRequestedChanges);
    if (friendlyMessage) {
      showToast(friendlyMessage);
      return;
    }
    setBusy(true);
    try {
      const result =
        editingSubmissionId !== null
          ? await trpc.community.submitRequestedEdit.mutate({
              submissionId: editingSubmissionId,
              title,
              text,
              attribution,
            })
          : await trpc.community.submit.mutate(input);
      showToast(result.message);
      setTitle('');
      setText('');
	      setAttribution('');
	      setCategory('QUOTE');
	      setTargetDifficulty(5);
	      setCreationMode('auto');
	      setManualLayout(emptyManualLayout());
	      setSelectedPadlockId(1);
	      setFocusedManualCipherNumber(null);
      setPreview(null);
      setPreviewFingerprint(null);
      setCreateStep('edit');
      setEditingSubmissionId(null);
      clearCommunityDraft();
      onSubmitted();
      setTab('mine');
      await loadMine();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Submission failed.');
    } finally {
      setBusy(false);
    }
  };

	  const handleWithdraw = async (submissionId: string) => {
	    setBusy(true);
	    try {
	      const result = await trpc.community.withdraw.mutate({ submissionId });
	      showToast(result.message);
	      await loadMine();
      onSubmitted();
	    } catch (error) {
	      showToast(error instanceof Error ? error.message : 'Withdraw failed.');
	    } finally {
      setBusy(false);
    }
  };

  const handleStartRequestedEdit = (submission: CommunitySubmission) => {
    setEditingSubmissionId(submission.submissionId);
    setTitle(submission.title);
    setText(submission.text);
    setCategory(submission.category);
    setAttribution(submission.attribution);
    setTargetDifficulty(submission.targetDifficulty);
    setCreationMode(submission.creationMode);
    setManualLayout(submission.manualLayout ?? emptyManualLayout());
    setSelectedPadlockId(1);
    setFocusedManualCipherNumber(null);
    setPreview(null);
    setPreviewFingerprint(null);
    setCreateStep('edit');
    setTab('create');
  };

	  const handleApprove = async (submissionId: string) => {
	    setBusy(true);
    try {
      const result = await trpc.admin.approveCommunitySubmission.mutate({
        submissionId,
      });
      showToast(result.message);
      await loadReview();
      onSubmitted();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Approval failed.');
    } finally {
      setBusy(false);
	    }
	  };

  const openModerationReasonPrompt = (
    action: ModerationReasonAction,
    submission: CommunitySubmission
  ) => {
    setModerationPrompt({
      action,
      submissionId: submission.submissionId,
      title: submission.title,
    });
    setModerationReason('');
  };

  const closeModerationReasonPrompt = () => {
    if (busy) {
      return;
    }
    setModerationPrompt(null);
    setModerationReason('');
  };

  const handleModerationReasonSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!moderationPrompt) {
      return;
    }
    if (!hasActionableModerationReason) {
      showToast('Add a clear reason first.');
      return;
    }
    setBusy(true);
    try {
      const result =
        moderationPrompt.action === 'reject'
          ? await trpc.admin.rejectCommunitySubmission.mutate({
              submissionId: moderationPrompt.submissionId,
              reason: trimmedModerationReason,
            })
          : moderationPrompt.action === 'request_changes'
            ? await trpc.admin.requestCommunitySubmissionChanges.mutate({
                submissionId: moderationPrompt.submissionId,
                reason: trimmedModerationReason,
              })
            : await trpc.admin.removeCommunityPuzzle.mutate({
                submissionId: moderationPrompt.submissionId,
                reason: trimmedModerationReason,
              });
      showToast(result.message);
      setModerationPrompt(null);
      setModerationReason('');
      await loadReview();
      onSubmitted();
    } catch (error) {
      const fallback =
        moderationPrompt.action === 'reject'
          ? 'Rejection failed.'
          : moderationPrompt.action === 'request_changes'
            ? 'Request changes failed.'
            : 'Removal failed.';
      showToast(error instanceof Error ? error.message : fallback);
    } finally {
      setBusy(false);
    }
  };

			  const addManualPadlock = () => {
			    setManualLayout((current) => {
			      const padlocks = getManualPadlocks(current);
			      const padlockId = nextManualPadlockId(padlocks);
			      setSelectedPadlockId(padlockId);
			      return syncManualPadlocks(current, [
			        ...padlocks,
			        { padlockId, lockedIndices: [], keyIndices: [] },
			      ]);
			    });
			    setManualTool('lock');
			    setFocusedManualCipherNumber(null);
			  };

			  const removeSelectedManualPadlock = () => {
			    setManualLayout((current) => {
			      const padlocks = getManualPadlocks(current);
			      const nextPadlocks = padlocks.filter(
			        (padlock) => padlock.padlockId !== selectedPadlockId
			      );
			      setSelectedPadlockId(nextPadlocks[0]?.padlockId ?? 1);
			      return syncManualPadlocks(current, nextPadlocks);
			    });
			    setManualTool('lock');
			    setFocusedManualCipherNumber(null);
			  };

			  const toggleManualTile = (tileIndex: number, cipherNumber: number | null) => {
			    setFocusedManualCipherNumber(cipherNumber);
			    setManualLayout((current) => {
			      const padlocks = getManualPadlocks(current);
			      const activePadlock =
			        padlocks.find((padlock) => padlock.padlockId === selectedPadlockId) ??
			        padlocks[0];
			      const activePadlockId = activePadlock?.padlockId ?? 1;
			      const cleanedPadlocks = removeTileFromPadlocks(padlocks, tileIndex);
			      const keyStackPadlocks = removeTileLocksFromPadlocks(
			        padlocks,
			        tileIndex
			      );
			      if (manualTool === 'reveal') {
			        return syncManualPadlocks(
			          {
			            ...current,
			            prefilledIndices: toggleNumber(current.prefilledIndices, tileIndex),
			            blindIndices: current.blindIndices.filter((index) => index !== tileIndex),
			          },
			          cleanedPadlocks
			        );
			      }
			      if (manualTool === 'blind') {
			        return syncManualPadlocks(
			          {
			            ...current,
			            blindIndices: toggleNumber(current.blindIndices, tileIndex),
			            prefilledIndices: current.prefilledIndices.filter((index) => index !== tileIndex),
			          },
			          keyStackPadlocks
			        );
			      }
			      if (manualTool === 'lock') {
			        const lockFamily = sameCipherTileIndices(
			          preview?.puzzlePreview ?? null,
			          tileIndex
			        );
			        const lockFamilySet = new Set(lockFamily);
			        const prefilledSet = new Set(current.prefilledIndices);
			        const blindSet = new Set(current.blindIndices);
			        const otherBoundSet = new Set<number>();
			        for (const padlock of padlocks) {
			          for (const index of padlock.keyIndices) {
			            otherBoundSet.add(index);
			          }
			          if (padlock.padlockId !== activePadlockId) {
			            for (const index of padlock.lockedIndices) {
			              otherBoundSet.add(index);
			            }
			          }
			        }
			        const wasLocked =
			          activePadlock?.lockedIndices.some((index) =>
			            lockFamilySet.has(index)
			          ) ?? false;
			        const lockableFamily = lockFamily.filter(
			          (index) =>
			            !prefilledSet.has(index) &&
			            !blindSet.has(index) &&
			            !otherBoundSet.has(index)
			        );
			        const nextPadlocks = padlocks.map((padlock) => {
			          if (padlock.padlockId !== activePadlockId) {
			            return padlock;
			          }
			          const remainingLocked = padlock.lockedIndices.filter(
			            (index) => !lockFamilySet.has(index)
			          );
			          return {
			            ...padlock,
			            lockedIndices: wasLocked
			              ? remainingLocked
			              : Array.from(new Set([...remainingLocked, ...lockableFamily])).sort(
			                  (a, b) => a - b
			                ),
			          };
			        });
			        return syncManualPadlocks(
			          {
			            ...current,
			          },
			          nextPadlocks
			        );
			      }
			      if (manualTool === 'key') {
			        const wasKey = activePadlock?.keyIndices.includes(tileIndex) ?? false;
			        const nextPadlocks = cleanedPadlocks.map((padlock) =>
			          padlock.padlockId === activePadlockId && !wasKey
			            ? {
			                ...padlock,
			                keyIndices: toggleNumber(padlock.keyIndices, tileIndex).slice(0, 2),
			              }
			            : padlock
			        );
			        return syncManualPadlocks(
			          {
			            ...current,
			            prefilledIndices: current.prefilledIndices.filter((index) => index !== tileIndex),
			          },
			          nextPadlocks
			        );
			      }
				      return current;
				    });
				  };

  const moderationPromptHeading =
    moderationPrompt?.action === 'reject'
      ? 'Reject submission'
      : moderationPrompt?.action === 'request_changes'
        ? 'Request changes'
        : 'Remove cipher';
  const moderationPromptHelp =
    moderationPrompt?.action === 'reject'
      ? 'Tell the creator why this submission cannot be approved.'
      : moderationPrompt?.action === 'request_changes'
        ? 'Tell the creator exactly what to fix before resubmitting.'
        : 'Explain why this published cipher is being removed from play.';
  const moderationPromptButtonLabel =
    moderationPrompt?.action === 'reject'
      ? 'Reject'
      : moderationPrompt?.action === 'request_changes'
        ? 'Send Request'
        : 'Remove';

	  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="community-screen">
      <main className="flex min-h-0 flex-1 flex-col px-3 py-3">
	        <div className="panel-clear relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl px-3 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              className={cn(tabButtonClass(tab === 'create'), 'w-[92px] px-1')}
              onClick={() => setTab('create')}
              disabled={busy}
              data-testid="community-tab-create"
            >
              Create
            </button>
	            <button
	              type="button"
	              className={cn(tabButtonClass(tab === 'mine'), 'relative w-[92px] px-1')}
	              onClick={() => setTab('mine')}
	              disabled={busy}
	              data-testid="community-tab-mine"
		            >
		              My Ciphers
              {notifications.creatorChangesRequestedCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-white/70 bg-red-500 px-1 text-[9px] font-black leading-none text-white"
                  data-testid="community-mine-badge"
                >
                  {notifications.creatorChangesRequestedCount > 9
                    ? '9+'
                    : notifications.creatorChangesRequestedCount}
                </span>
              )}
		            </button>
	            {isModerator && (
	              <button
	                type="button"
	                className={cn(tabButtonClass(tab === 'review'), 'relative w-[92px] px-1')}
	                onClick={() => setTab('review')}
	                disabled={busy}
	                data-testid="community-tab-review"
	              >
	                Review
                {notifications.moderatorPendingReviewCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full border border-white/70 bg-red-500 px-1 text-[9px] font-black leading-none text-white"
                    data-testid="community-review-badge"
                  >
                    {notifications.moderatorPendingReviewCount > 9
                      ? '9+'
                      : notifications.moderatorPendingReviewCount}
                  </span>
                )}
	              </button>
	            )}
          </div>

          {tab === 'create' && createStep === 'edit' && (
            <form
              className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
              onSubmit={(event) => void handleSubmit(event)}
              data-testid="community-create-form"
            >
              {isEditingRequestedChanges && (
                <div className="app-surface-subtle app-border rounded-lg border px-3 py-3">
                  <div className="app-text text-xs font-black uppercase">
                    Requested Changes
                  </div>
                  <p className="app-text-muted mt-1 text-[11px] font-semibold leading-snug">
                    Update only the requested fields. Category, build mode, and target tier stay locked for this submission.
                  </p>
                </div>
              )}
              <label className="block">
	                <span className="app-text text-xs font-black uppercase">
	                  Challenge Title
	                </span>
	                <input
	                  className="app-surface app-border app-text mt-1 w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none"
	                  value={title}
	                  minLength={1}
	                  maxLength={60}
	                  onChange={(event) => setTitle(event.currentTarget.value)}
	                  disabled={busy}
	                  data-testid="community-title"
	                />
	              </label>
	              <label className="block">
	                <span className="app-text text-xs font-black uppercase">
	                  Challenge Text
                </span>
	                <textarea
	                  className="app-surface app-border app-text mt-1 min-h-[96px] w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none"
	                  value={text}
		                  minLength={minPlayablePuzzleTotalLength}
		                  maxLength={maxPuzzleTotalLength}
                  onChange={(event) => setText(event.currentTarget.value)}
                  disabled={busy}
                  data-testid="community-text"
                />
                <span className={characterCounterClass(text.length, maxPuzzleTotalLength)}>
                  {text.length}/{maxPuzzleTotalLength}
                </span>
              </label>
	              <div className={cn('grid gap-2', deviceTier === 'mobile' ? 'grid-cols-1' : 'grid-cols-2')}>
	                <label className="block">
                  <span className="app-text text-xs font-black uppercase">
                    Category
                  </span>
                  <select
                    className="app-surface app-border app-text mt-1 w-full rounded-lg border px-3 py-2 text-sm font-bold"
                  value={category}
                  onChange={(event) => setCategory(parseCategory(event.currentTarget.value))}
                  disabled={busy || isEditingRequestedChanges}
                    data-testid="community-category"
                  >
                    {challengeCategories.map((option) => (
                      <option key={option} value={option}>
                        {challengeTypeMetadata[option].label}
                      </option>
                    ))}
	                  </select>
                </label>
	                <div>
	                  <span className="app-text text-xs font-black uppercase">
	                    Build Mode
	                  </span>
	                  <div className="mt-1 grid grid-cols-2 gap-2">
		                    <button
		                      type="button"
		                      className={tabButtonClass(creationMode === 'auto')}
	                      onClick={() => {
	                        setCreationMode('auto');
	                        setPreview(null);
	                      }}
		                      disabled={busy || isEditingRequestedChanges}
	                      data-testid="community-mode-auto"
	                    >
	                      Auto
	                    </button>
		                    <button
		                      type="button"
		                      className={tabButtonClass(creationMode === 'manual')}
	                      onClick={() => {
	                        setCreationMode('manual');
	                        setPreview(null);
	                      }}
		                      disabled={busy || isEditingRequestedChanges}
	                      data-testid="community-mode-manual"
	                    >
	                      Manual
	                    </button>
	                  </div>
	                </div>
	              </div>
		              {creationMode === 'auto' && (
		                <div className="app-surface-subtle app-border rounded-lg border px-3 py-3">
		                  <div className="flex items-center justify-between gap-3">
		                    <span className="app-text text-xs font-black uppercase">
		                      Preferred Tier
		                    </span>
		                    <span className="badge-primary rounded-md px-2 py-1 text-[10px] font-black uppercase">
		                      {difficultyTierLabel(targetDifficulty)}
		                    </span>
		                  </div>
		                  <div
		                    className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"
		                    data-testid="community-difficulty"
		                  >
		                    {difficultyPreferenceOptions.map((option) => (
		                      <button
		                        key={option.value}
		                        type="button"
		                        className={cn(
		                          tabButtonClass(targetDifficulty === option.value),
		                          'min-h-[34px] px-2 text-[10px]'
		                        )}
			                        onClick={() => setTargetDifficulty(option.value)}
			                        disabled={busy || isEditingRequestedChanges}
		                        aria-label={`Prefer ${option.label} difficulty`}
		                      >
		                        {option.label}
		                      </button>
		                    ))}
		                  </div>
		                  <p className="app-text-muted mt-2 text-[11px] font-semibold leading-snug">
		                    Preview will show the actual tier the engine can build for this quote.
		                  </p>
		                </div>
		              )}
              <label className="block">
                <span className="app-text text-xs font-black uppercase">
                  Author / Source
                </span>
                <input
                  className="app-surface app-border app-text mt-1 w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none"
                  value={attribution}
                  maxLength={28}
                  onChange={(event) => setAttribution(event.currentTarget.value)}
                  disabled={busy}
                  data-testid="community-attribution"
                  placeholder="e.g. Shakespeare - Hamlet"
                />
                <span className="app-text-muted mt-1 block text-[11px] font-semibold">
                  Shown below the solved quote, max 28 characters.
                </span>
                <span className={characterCounterClass(attribution.length, 28)}>
                  {attribution.length}/28
                </span>
              </label>
              {isEditingRequestedChanges ? (
                <button
                  type="submit"
                  className="btn-3d btn-primary w-full rounded-xl px-3 py-2 text-sm font-black uppercase"
                  disabled={busy}
                  data-testid="community-submit-revision-button"
                >
                  Submit Revision
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-3d btn-neutral flex-1 rounded-xl px-3 py-2 text-sm font-black uppercase"
                    onClick={() => void handlePreview()}
                    disabled={busy}
                    data-testid="community-preview-button"
                  >
                    Preview
                  </button>
                </div>
              )}
            </form>
          )}

          {tab === 'create' && createStep === 'preview' && (
            <form
              className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
              onSubmit={(event) => void handleSubmit(event)}
              data-testid="community-preview-form"
            >
              <div className="app-surface-subtle app-border rounded-lg border px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="app-text text-xs font-black uppercase">
                    Step 2: Preview
                  </span>
                  <span className="badge-primary rounded-md px-2 py-1 text-[10px] font-black uppercase">
                    {creationMode === 'manual' ? 'Manual Builder' : 'Auto Build'}
                  </span>
                </div>
                <div className="app-text mt-2 text-sm font-black">{title}</div>
                <div className="app-text-muted mt-1 text-[11px] font-semibold">
                  {categoryLabel(category)} by {attribution}
                </div>
              </div>
              <PreviewPanel
                creationMode={creationMode}
                manualLayout={manualLayout}
                manualTool={manualTool}
                selectedPadlockId={selectedPadlockId}
                onAddPadlock={addManualPadlock}
                onManualToolChange={setManualTool}
                onRemoveSelectedPadlock={removeSelectedManualPadlock}
                onSelectedPadlockChange={setSelectedPadlockId}
                onToggleManualTile={toggleManualTile}
                preview={preview}
                focusedCipherNumber={focusedManualCipherNumber}
              />
              <div
                className={cn(
                  'grid gap-2',
                  creationMode === 'manual' ? 'grid-cols-2' : 'grid-cols-1'
                )}
              >
                <button
                  type="button"
                  className="btn-3d btn-neutral rounded-xl px-3 py-2 text-sm font-black uppercase"
                  onClick={() => setCreateStep('edit')}
                  disabled={busy}
                >
                  Back to Edit
                </button>
                {creationMode === 'manual' && (
                  <button
                    type="button"
                    className="btn-3d btn-neutral rounded-xl px-3 py-2 text-sm font-black uppercase"
                    onClick={() => void handlePreview()}
                    disabled={busy}
                    data-testid="community-refresh-preview-button"
	                  >
	                    Update Preview
	                  </button>
                )}
              </div>
              {canSubmit ? (
                <button
                  type="submit"
                  className="btn-3d btn-primary w-full rounded-xl px-3 py-2 text-sm font-black uppercase disabled:opacity-45"
                  disabled={busy}
                  data-testid="community-submit-button"
                >
                  Submit
                </button>
              ) : (
                <div className="app-surface-subtle app-border rounded-lg border px-3 py-3 text-center">
                  <span className="app-text-muted text-xs font-bold">
	                    {creationMode === 'manual'
	                      ? 'Adjust the board tools, then update the preview.'
	                      : 'Go back and change the quote or preferred tier, then preview again.'}
                  </span>
                </div>
              )}
            </form>
          )}

	          {tab === 'mine' && (
	            <section className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1" data-testid="community-mine-list">
              {notifications.creatorChangesRequestedCount > 0 && (
                <div className="app-surface-subtle app-border rounded-lg border border-red-300/50 px-3 py-3">
                  <div className="text-xs font-black uppercase text-red-100">
                    Changes Requested
                  </div>
                  <p className="app-text-muted mt-1 text-[11px] font-semibold leading-snug">
                    Open the highlighted cipher below, make the requested edit, then submit it for moderator review.
                  </p>
                </div>
              )}
	              {mineLoading && (
	                <div className="app-surface-subtle app-border rounded-lg border px-3 py-4 text-center">
                  <span className="app-text-muted text-xs font-black uppercase">
                    Loading submissions...
                  </span>
	                </div>
	              )}
	              {visibleMine.map((submission) => (
	                <SubmissionCard
                  key={submission.submissionId}
                  submission={submission}
                  action={
                    submission.status === 'pending' ? (
                      <button
                        type="button"
                        className="btn-3d btn-neutral rounded-lg px-2 py-1 text-[11px] font-black uppercase"
                        disabled={busy}
                        onClick={() => void handleWithdraw(submission.submissionId)}
                      >
                        Withdraw
                      </button>
                    ) : submission.status === 'changes_requested' ? (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          className="btn-3d btn-primary rounded-lg px-2 py-1 text-[11px] font-black uppercase"
                          disabled={busy}
                          onClick={() => handleStartRequestedEdit(submission)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-3d btn-neutral rounded-lg px-2 py-1 text-[11px] font-black uppercase"
                          disabled={busy}
                          onClick={() => void handleWithdraw(submission.submissionId)}
                        >
                          Withdraw
                        </button>
                      </div>
                    ) : null
                  }
                />
              ))}
              {!mineLoading && mine.length === 0 && (
                <p className="app-text-muted px-2 py-8 text-center text-sm font-semibold">
                  Your submitted ciphers will show up here.
                </p>
              )}
            </section>
          )}

          {tab === 'review' && isModerator && (
            <section className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" data-testid="community-review-list">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <select
                  className="app-surface app-border app-text rounded-lg border px-3 py-2 text-sm font-bold"
                  value={reviewStatus}
                  onChange={(event) => setReviewStatus(parseStatus(event.currentTarget.value))}
                  disabled={busy}
                >
                  {communityStatuses.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-3d btn-neutral rounded-lg px-3 py-2 text-xs font-black uppercase"
                  onClick={() => void loadReview()}
                  disabled={busy}
                >
                  Refresh
                </button>
              </div>
	              {reviewStatus === 'pending' &&
	                notifications.moderatorRevisionReviewCount > 0 && (
                  <div className="app-surface-subtle app-border rounded-lg border px-3 py-2">
                    <span className="app-text text-xs font-black uppercase">
                      {notifications.moderatorRevisionReviewCount} revised{' '}
                      {notifications.moderatorRevisionReviewCount === 1
                        ? 'cipher'
                        : 'ciphers'}{' '}
                      in this queue
                    </span>
                  </div>
                )}
	              {reviewItems.map((submission) => (
                <SubmissionCard
                  key={submission.submissionId}
                  submission={submission}
                  action={
                    <div className="flex flex-col gap-2">
                      {submission.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            className="btn-3d btn-primary rounded-lg px-2 py-1 text-[11px] font-black uppercase"
                            disabled={busy}
                            onClick={() => void handleApprove(submission.submissionId)}
                          >
                            Approve
                          </button>
	                          <button
	                            type="button"
		                            className="btn-3d btn-neutral rounded-lg px-2 py-1 text-[11px] font-black uppercase"
		                            disabled={busy}
		                            onClick={() =>
                                  openModerationReasonPrompt('reject', submission)
                                }
	                          >
	                            Reject
                          </button>
                        </>
                      )}
                      {submission.status === 'approved' && (
                        <>
	                          <button
	                            type="button"
		                            className="btn-3d btn-primary rounded-lg px-2 py-1 text-[11px] font-black uppercase"
		                            disabled={busy}
		                            onClick={() =>
                                  openModerationReasonPrompt(
                                    'request_changes',
                                    submission
                                  )
                                }
	                          >
	                            Request Changes
                          </button>
	                          <button
	                            type="button"
		                            className="btn-3d btn-neutral rounded-lg px-2 py-1 text-[11px] font-black uppercase"
		                            disabled={busy}
		                            onClick={() =>
                                  openModerationReasonPrompt('remove', submission)
                                }
	                          >
	                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  }
                />
              ))}
	              {reviewItems.length === 0 && (
	                <p className="app-text-muted px-2 py-8 text-center text-sm font-semibold">
	                  No submissions in this queue.
	                </p>
	              )}
	            </section>
	          )}
          {moderationPrompt && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 px-3"
              data-testid="community-moderation-reason-prompt"
            >
              <form
                className="app-surface-strong app-border w-full max-w-[340px] rounded-xl border px-4 py-4 shadow-xl"
                onSubmit={(event) => void handleModerationReasonSubmit(event)}
              >
                <div className="app-text text-sm font-black uppercase">
                  {moderationPromptHeading}
                </div>
                <p className="app-text-muted mt-1 text-[11px] font-semibold leading-snug">
                  {moderationPrompt.title}
                </p>
                <p className="app-text-muted mt-2 text-xs font-semibold leading-snug">
                  {moderationPromptHelp}
                </p>
                <textarea
                  className="app-surface app-border app-text mt-3 min-h-[94px] w-full rounded-lg border px-3 py-2 text-sm font-semibold outline-none"
                  value={moderationReason}
                  minLength={3}
                  maxLength={180}
                  onChange={(event) =>
                    setModerationReason(event.currentTarget.value)
                  }
                  disabled={busy}
                  autoFocus
                  data-testid="community-moderation-reason"
                  placeholder="Write the reason..."
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn-3d btn-neutral rounded-lg px-3 py-2 text-xs font-black uppercase"
                    disabled={busy}
                    onClick={closeModerationReasonPrompt}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-3d btn-primary rounded-lg px-3 py-2 text-xs font-black uppercase disabled:opacity-50"
                    disabled={busy || !hasActionableModerationReason}
                  >
                    {moderationPromptButtonLabel}
                  </button>
                </div>
              </form>
            </div>
          )}
	        </div>
	      </main>
	    </section>
  );
};
