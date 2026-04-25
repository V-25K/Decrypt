import { memo, type ReactNode, type RefObject } from 'react';
import { cn } from '../utils';
import { lockEmoji, maxWordTileColumns, wordContinuationGlyph } from '../app/constants';
import { type PuzzleRenderToken } from '../utils';
import type { PuzzlePublicTile } from '../app/types';

type ChallengePuzzleGridProps = {
  viewportRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  isPuzzleVerticallyCentered: boolean;
  puzzleScale: number;
  puzzleTokenLines: PuzzleRenderToken<PuzzlePublicTile>[][];
  isInlineMode: boolean;
  selectedTile: number | null;
  busy: boolean;
  isComplete: boolean;
  isGameOver: boolean;
  pendingGuessByTile: Map<number, string>;
  correctGuessTileIndices: Set<number>;
  wrongGuessTileIndices: Set<number>;
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

export const ChallengePuzzleGrid = memo((_props: ChallengePuzzleGridProps) => {
  const {
    viewportRef,
    contentRef,
    isPuzzleVerticallyCentered,
    puzzleScale,
    puzzleTokenLines,
    isInlineMode,
    selectedTile,
    busy,
    isComplete,
    isGameOver,
    pendingGuessByTile,
    correctGuessTileIndices,
    wrongGuessTileIndices,
    puzzleMarkClass,
    puzzleTileUnderlineWidthClass,
    puzzleCipherClass,
    separatorGlyphClass,
    handleTileSelection,
    renderPunctuationTile,
    getLetterTileState,
    getLetterTileClass,
  } = _props;

  return (
    <main className="flex flex-1 min-h-0 px-2 py-2">
      <div className="min-w-0 flex-1">
        <div
          ref={viewportRef}
          className={`flex h-full justify-center overflow-x-hidden overflow-y-auto ${
            isPuzzleVerticallyCentered ? 'items-center' : 'items-start'
          }`}
        >
          <div
            className="flex w-full justify-center"
            style={{ transform: `scale(${puzzleScale})`, transformOrigin: 'top center' }}
          >
            <div ref={contentRef} className="inline-block max-w-full">
              <div
                data-testid="puzzle-token-wrap"
                className="flex flex-col items-center gap-y-[4px]"
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
                                    disabled={disabled}
                                    onClick={() => handleTileSelection(tile.index)}
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
                                        <span className="lock-emoji">{lockEmoji}</span>
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
                                      className={`app-text-soft block min-h-[10px] ${
                                        isInlineMode ? 'mt-0.5' : 'mt-1'
                                      } ${puzzleCipherClass}`}
                                    >
                                      {tile.isLocked ? (
                                        '\u00A0'
                                      ) : tile.isBlind ? (
                                        <span className="cipher-blind-mark">?</span>
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
});

ChallengePuzzleGrid.displayName = 'ChallengePuzzleGrid';
