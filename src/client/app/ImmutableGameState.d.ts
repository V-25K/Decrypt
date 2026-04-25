import type { Puzzle, PuzzlePublicTile } from './types';
/**
 * ImmutableGameState provides immutable state management for puzzle data
 * to optimize React rendering performance by enabling efficient change detection.
 *
 * Features:
 * - Immutable updates for puzzle state
 * - Efficient change tracking for render optimization
 * - Structural sharing to minimize memory usage
 * - Fast equality checks for React.memo optimization
 */
export declare class ImmutableGameState {
    private readonly _puzzle;
    private readonly _tiles;
    private readonly _revealedIndices;
    private readonly _correctGuessIndices;
    private readonly _wrongGuessIndices;
    private readonly _selectedTileIndex;
    private readonly _version;
    constructor(puzzle?: Puzzle | null, revealedIndices?: Set<number> | ReadonlySet<number>, correctGuessIndices?: Set<number> | ReadonlySet<number>, wrongGuessIndices?: Set<number> | ReadonlySet<number>, selectedTileIndex?: number | null, version?: number, tiles?: ReadonlyArray<PuzzlePublicTile>);
    get puzzle(): Puzzle | null;
    get tiles(): ReadonlyArray<PuzzlePublicTile>;
    get revealedIndices(): ReadonlySet<number>;
    get correctGuessIndices(): ReadonlySet<number>;
    get wrongGuessIndices(): ReadonlySet<number>;
    get selectedTileIndex(): number | null;
    get version(): number;
    setPuzzle(puzzle: Puzzle | null): ImmutableGameState;
    setRevealedIndices(indices: Set<number>): ImmutableGameState;
    addRevealedIndex(index: number): ImmutableGameState;
    setCorrectGuessIndices(indices: Set<number>): ImmutableGameState;
    addCorrectGuessIndex(index: number): ImmutableGameState;
    setWrongGuessIndices(indices: Set<number>): ImmutableGameState;
    addWrongGuessIndex(index: number): ImmutableGameState;
    setSelectedTileIndex(index: number | null): ImmutableGameState;
    update(changes: {
        puzzle?: Puzzle | null;
        revealedIndices?: Set<number>;
        correctGuessIndices?: Set<number>;
        wrongGuessIndices?: Set<number>;
        selectedTileIndex?: number | null;
    }): ImmutableGameState;
    hasChanged(other: ImmutableGameState): boolean;
    hasPuzzleChanged(other: ImmutableGameState): boolean;
    hasTileStateChanged(other: ImmutableGameState): boolean;
    hasSelectionChanged(other: ImmutableGameState): boolean;
    hasTileChanged(tileIndex: number, other: ImmutableGameState): boolean;
    getTileState(tileIndex: number): {
        isRevealed: boolean;
        isCorrect: boolean;
        isWrong: boolean;
        isSelected: boolean;
        tile: PuzzlePublicTile | null;
    };
    toSnapshot(): {
        puzzle: Puzzle | null;
        revealedIndices: number[];
        correctGuessIndices: number[];
        wrongGuessIndices: number[];
        selectedTileIndex: number | null;
        version: number;
    };
    static empty(): ImmutableGameState;
    static fromPuzzle(puzzle: Puzzle): ImmutableGameState;
    private _setsEqual;
}
/**
 * React hook for using ImmutableGameState with automatic change detection
 */
export declare function useImmutableGameState(initialState?: ImmutableGameState): readonly [ImmutableGameState, (updater: (prev: ImmutableGameState) => ImmutableGameState) => void];
