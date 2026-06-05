import {
  memo,
  useCallback,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '../utils';
import { maxWordTileColumns, wordContinuationGlyph } from '../app/constants';
import { getPuzzleNavigableTileRows, type PuzzleRenderToken } from '../utils';
import type { PuzzlePublicTile } from '../app/types';
import { UiSprite } from './UiSprite';
import type { ImmutableGameState } from '../app/ImmutableGameState';

type ChallengePuzzleGridProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  isPuzzleVerticallyCentered: boolean;
  puzzleScale: number;
  puzzleTokenLines: PuzzleRenderToken<PuzzlePublicTile>[][];
  isInlineMode: boolean;
  gameState: ImmutableGameState;
  busy: boolean;
  isComplete: boolean;
  isGameOver: boolean;
  pendingGuessByTile: Map<number, string>;
  puzzleMarkClass: string;
  puzzleTileUnderlineWidthClass: string;
  puzzleCipherClass: string;
  punctuationTileMinWidthClass: string;
  punctuationMarkClass: string;
  separatorGlyphClass: string;
  handleTileSelection: (tileIndex: number) => void;
  renderPunctuationTile: (key: string | number, displayChar: string) => ReactNode;
  getLetterTileState: (
    selected: boolean,
    isLocked: boolean,
    isCorrectGuess: boolean,
    isWrongGuess: boolean
  ) => string;
  getLetterTileClass: (
    selected: boolean,
    disabled: boolean,
    isGold: boolean,
    isLocked: boolean,
    isCorrectGuess: boolean,
    isWrongGuess: boolean
  ) => string;
};

const splitWordTiles = (tiles: PuzzlePublicTile[]) => {
  if (tiles.length <= maxWordTileColumns) {
    return [tiles];
  }
  const chunks: PuzzlePublicTile[][] = [];
  for (let index = 0; index < tiles.length; index += maxWordTileColumns) {
    chunks.push(tiles.slice(index, index + maxWordTileColumns));
  }
  return chunks;
};

export const ChallengePuzzleGrid = memo(({
  viewportRef,
  contentRef,
  isPuzzleVerticallyCentered,
  puzzleScale,
  puzzleTokenLines,
  isInlineMode,
  gameState,
  busy,
  isComplete,
  isGameOver,
  pendingGuessByTile,
  puzzleMarkClass,
  puzzleTileUnderlineWidthClass,
  puzzleCipherClass,
  separatorGlyphClass,
  handleTileSelection,
  renderPunctuationTile,
  getLetterTileState,
  getLetterTileClass,
}: ChallengePuzzleGridProps) => {
  const selectedTile = gameState.selectedTileIndex;
  const correctGuessTileIndices = gameState.correctGuessIndices;
  const wrongGuessTileIndices = gameState.wrongGuessIndices;
  const tileButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const navigableTileRows = useMemo(
    () => getPuzzleNavigableTileRows(puzzleTokenLines, maxWordTileColumns),
    [puzzleTokenLines]
  );
  const navigableTileIndices = useMemo(
    () => navigableTileRows.flatMap((row) => row),
    [navigableTileRows]
  );
  const handleTileKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tileIndex: number) => {
      const currentIndex = navigableTileIndices.indexOf(tileIndex);
      if (currentIndex < 0) {
        return;
      }

      let nextTileIndex: number | undefined;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const offset = event.key === 'ArrowRight' ? 1 : -1;
        nextTileIndex = navigableTileIndices[currentIndex + offset];
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const currentRowIndex = navigableTileRows.findIndex((row) =>
          row.includes(tileIndex)
        );
        const currentRow = navigableTileRows[currentRowIndex];
        if (!currentRow) {
          return;
        }
        const targetRow =
          navigableTileRows[currentRowIndex + (event.key === 'ArrowDown' ? 1 : -1)];
        if (!targetRow) {
          return;
        }
        const columnIndex = currentRow.indexOf(tileIndex);
        nextTileIndex =
          targetRow[Math.min(Math.max(columnIndex, 0), targetRow.length - 1)];
      } else {
        return;
      }

      if (nextTileIndex === undefined) {
        return;
      }

      event.preventDefault();
      handleTileSelection(nextTileIndex);
      tileButtonRefs.current.get(nextTileIndex)?.focus();
    },
    [handleTileSelection, navigableTileIndices, navigableTileRows]
  );

  return (
    <main className="flex flex-1 min-h-0 px-2 py-2">
      <div className="min-w-0 flex-1">
        <div
          ref={viewportRef}
          data-testid="puzzle-viewport"
          data-scroll-mode={isInlineMode ? 'locked' : 'auto'}
          className={`flex h-full justify-center overflow-x-hidden ${
            isInlineMode ? 'overflow-y-hidden' : 'overflow-y-auto'
          } ${
            isInlineMode && isPuzzleVerticallyCentered ? 'items-center' : 'items-start'
          }`}
        >
          <div
            data-testid="puzzle-scale-wrap"
            className="flex w-full justify-center"
            style={{ transform: `scale(${puzzleScale})`, transformOrigin: 'top center' }}
          >
            <div ref={contentRef} data-testid="puzzle-content" className="inline-block max-w-full">
              <div
                data-testid="puzzle-token-wrap"
                className="puzzle-readability-backdrop mt-2 flex flex-col items-center gap-y-[4px] sm:mt-10 lg:mt-14"
              >
                {puzzleTokenLines.map((lineTokens, lineIndex) => (
                  <div key={`line-${lineIndex}`} className="flex flex-wrap items-end justify-center">
                    {lineTokens.map((token) => {
                      if (token.type === 'separator') {
                        return token.tile.displayChar === ' ' ? (
                          <span
                            key={token.key}
                            className={`inline-flex h-[1px] ${
                              isInlineMode ? 'w-[18px]' : 'w-[20px]'
                            }`}
                            aria-hidden="true"
                          />
                        ) : (
                          <div key={token.key} className={isInlineMode ? 'mr-[2px]' : 'mr-[4px]'}>
                            {renderPunctuationTile(token.key, token.tile.displayChar)}
                          </div>
                        );
                      }

                      const wordRows = splitWordTiles(token.tiles);
                      const isBridgeWord = wordRows.length > 1;
                      const highlightBridgeWord =
                        isBridgeWord &&
                        selectedTile !== null &&
                        token.tiles.some((tile) => tile.index === selectedTile);

                      return (
                        <div
                          key={token.key}
                          className={`${
                            isBridgeWord
                              ? `${
                                  isInlineMode ? 'mr-0.5' : 'mr-1'
                                } inline-flex flex-col gap-0`
                              : `${
                                  isInlineMode ? 'mr-0.5 gap-[1px]' : 'mr-1 gap-[2px]'
                                } inline-flex items-end whitespace-nowrap`
                          } ${
                            highlightBridgeWord ? 'app-surface-subtle rounded-md px-1 py-0.5' : ''
                          }`}
                        >
                          {wordRows.map((rowTiles, rowIndex) => (
                            <div
                              key={`${token.key}-row-${rowIndex}`}
                              className={`inline-flex items-end ${
                                isInlineMode ? 'gap-[1px]' : 'gap-[2px]'
                              }`}
                            >
                              {rowTiles.map((tile) => {
                                if (!tile.isLetter) {
                                  return renderPunctuationTile(tile.index, tile.displayChar);
                                }

                                const disabled =
                                  tile.isLocked || busy || isComplete || isGameOver;
                                const pendingLetter =
                                  !tile.isLocked && tile.displayChar === '_'
                                    ? pendingGuessByTile.get(tile.index)
                                    : null;
                                const displayChar = pendingLetter ?? tile.displayChar;

                                const lockDotCount = tile.isLocked
                                  ? Math.min(
                                      2,
                                      tile.lockTotalKeys ?? tile.lockRemainingKeys ?? 0
                                    )
                                  : 0;
                                const lockDots =
                                  lockDotCount > 0
                                    ? Array.from({ length: lockDotCount }, (_value, index) => (
                                        <span key={`lock-dot-${tile.index}-${index}`} className="lock-dot">
                                          •
                                        </span>
                                      ))
                                    : null;

                                const isCorrectGuess =
                                  correctGuessTileIndices.has(tile.index) ||
                                  tile.isSessionRevealed === true;
                                const isWrongGuess = wrongGuessTileIndices.has(tile.index);
                                const tileState = getLetterTileState(
                                  selectedTile === tile.index,
                                  tile.isLocked,
                                  isCorrectGuess,
                                  isWrongGuess
                                );

                                return (
                                  <button
                                    key={tile.index}
                                    ref={(node) => {
                                      if (node) {
                                        tileButtonRefs.current.set(tile.index, node);
                                      } else {
                                        tileButtonRefs.current.delete(tile.index);
                                      }
                                    }}
                                    disabled={disabled}
                                    onClick={() => handleTileSelection(tile.index)}
                                    onKeyDown={(event) => handleTileKeyDown(event, tile.index)}
                                    aria-label={`Cipher tile ${tile.index + 1}`}
                                    data-tile-state={tileState}
                                    className={getLetterTileClass(
                                      selectedTile === tile.index,
                                      disabled,
                                      tile.isGold,
                                      tile.isLocked,
                                      isCorrectGuess,
                                      isWrongGuess
                                    )}
                                  >
                                    {tile.isLocked && (
                                      <span className="lock-stack-full">
                                        {lockDots ? (
                                          <span className="lock-dot-col">{lockDots}</span>
                                        ) : null}
                                        <UiSprite icon="lock" decorative className="lock-sprite" />
                                      </span>
                                    )}

                                    <span
                                      className={cn(
                                        `flex h-[16px] items-center justify-center font-black leading-none ${puzzleMarkClass}`,
                                        pendingLetter ? 'opacity-60' : ''
                                      )}
                                    >
                                      {tile.isLocked
                                        ? '\u00A0'
                                        : displayChar === '_'
                                          ? '\u00A0'
                                          : displayChar}
                                    </span>

                                    <span
                                      className={cn(
                                        'app-surface-subtle block h-[2px] rounded-full',
                                        tile.isLocked ? 'opacity-0' : 'opacity-100',
                                        isInlineMode ? 'mt-0.5' : 'mt-1',
                                        puzzleTileUnderlineWidthClass
                                      )}
                                    />

                                    <span
                                      className={`app-text-soft flex min-h-[10px] items-center justify-center leading-none ${
                                        isInlineMode ? 'mt-0.5' : 'mt-1'
                                      } ${puzzleCipherClass}`}
                                    >
                                      {tile.isLocked ? (
                                        '\u00A0'
                                      ) : tile.isBlind ? (
                                        <UiSprite icon="question" decorative className="cipher-blind-mark" />
                                      ) : (
                                        tile.cipherNumber ?? '\u00A0'
                                      )}
                                    </span>
                                  </button>
                                );
                              })}

                              {isBridgeWord && rowIndex < wordRows.length - 1 && (
                                <div
                                  className={`app-text-soft flex min-w-[12px] items-center justify-center ${
                                    isInlineMode ? 'mb-[7px]' : 'mb-[10px]'
                                  }`}
                                >
                                  <span className={`${separatorGlyphClass} leading-none`}>
                                    {wordContinuationGlyph}
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}, (prev, next) =>
  prev.viewportRef === next.viewportRef &&
  prev.contentRef === next.contentRef &&
  prev.isPuzzleVerticallyCentered === next.isPuzzleVerticallyCentered &&
  prev.puzzleScale === next.puzzleScale &&
  prev.puzzleTokenLines === next.puzzleTokenLines &&
  prev.isInlineMode === next.isInlineMode &&
  !next.gameState.hasChanged(prev.gameState) &&
  prev.busy === next.busy &&
  prev.isComplete === next.isComplete &&
  prev.isGameOver === next.isGameOver &&
  prev.pendingGuessByTile === next.pendingGuessByTile &&
  prev.puzzleMarkClass === next.puzzleMarkClass &&
  prev.puzzleTileUnderlineWidthClass === next.puzzleTileUnderlineWidthClass &&
  prev.puzzleCipherClass === next.puzzleCipherClass &&
  prev.punctuationTileMinWidthClass === next.punctuationTileMinWidthClass &&
  prev.punctuationMarkClass === next.punctuationMarkClass &&
  prev.separatorGlyphClass === next.separatorGlyphClass &&
  prev.handleTileSelection === next.handleTileSelection &&
  prev.renderPunctuationTile === next.renderPunctuationTile &&
  prev.getLetterTileState === next.getLetterTileState &&
  prev.getLetterTileClass === next.getLetterTileClass
);

ChallengePuzzleGrid.displayName = 'ChallengePuzzleGrid';
