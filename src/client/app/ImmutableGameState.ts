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
export class ImmutableGameState {
  private readonly _puzzle: Puzzle | null;
  private readonly _tiles: ReadonlyArray<PuzzlePublicTile>;
  private readonly _revealedIndices: ReadonlySet<number>;
  private readonly _correctGuessIndices: ReadonlySet<number>;
  private readonly _wrongGuessIndices: ReadonlySet<number>;
  private readonly _selectedTileIndex: number | null;
  private readonly _version: number;

  constructor(
    puzzle: Puzzle | null = null,
    revealedIndices: Set<number> | ReadonlySet<number> = new Set(),
    correctGuessIndices: Set<number> | ReadonlySet<number> = new Set(),
    wrongGuessIndices: Set<number> | ReadonlySet<number> = new Set(),
    selectedTileIndex: number | null = null,
    version: number = 0,
    tiles?: ReadonlyArray<PuzzlePublicTile>
  ) {
    this._puzzle = puzzle;
    this._tiles = tiles || (puzzle ? Object.freeze([...puzzle.tiles]) : Object.freeze([]));
    this._revealedIndices = revealedIndices instanceof Set ? Object.freeze(new Set(revealedIndices)) : revealedIndices;
    this._correctGuessIndices = correctGuessIndices instanceof Set ? Object.freeze(new Set(correctGuessIndices)) : correctGuessIndices;
    this._wrongGuessIndices = wrongGuessIndices instanceof Set ? Object.freeze(new Set(wrongGuessIndices)) : wrongGuessIndices;
    this._selectedTileIndex = selectedTileIndex;
    this._version = version;
  }

  // Getters for accessing immutable state
  get puzzle(): Puzzle | null {
    return this._puzzle;
  }

  get tiles(): ReadonlyArray<PuzzlePublicTile> {
    return this._tiles;
  }

  get revealedIndices(): ReadonlySet<number> {
    return this._revealedIndices;
  }

  get correctGuessIndices(): ReadonlySet<number> {
    return this._correctGuessIndices;
  }

  get wrongGuessIndices(): ReadonlySet<number> {
    return this._wrongGuessIndices;
  }

  get selectedTileIndex(): number | null {
    return this._selectedTileIndex;
  }

  get version(): number {
    return this._version;
  }

  // Immutable update methods
  setPuzzle(puzzle: Puzzle | null): ImmutableGameState {
    if (this._puzzle === puzzle) {
      return this;
    }
    return new ImmutableGameState(
      puzzle,
      this._revealedIndices,
      this._correctGuessIndices,
      this._wrongGuessIndices,
      this._selectedTileIndex,
      this._version + 1
    );
  }

  setRevealedIndices(indices: Set<number>): ImmutableGameState {
    if (this._setsEqual(this._revealedIndices, indices)) {
      return this;
    }
    return new ImmutableGameState(
      this._puzzle,
      indices,
      this._correctGuessIndices,
      this._wrongGuessIndices,
      this._selectedTileIndex,
      this._version + 1,
      this._tiles
    );
  }

  addRevealedIndex(index: number): ImmutableGameState {
    if (this._revealedIndices.has(index)) {
      return this;
    }
    const newIndices = new Set(this._revealedIndices);
    newIndices.add(index);
    return this.setRevealedIndices(newIndices);
  }

  setCorrectGuessIndices(indices: Set<number>): ImmutableGameState {
    if (this._setsEqual(this._correctGuessIndices, indices)) {
      return this;
    }
    return new ImmutableGameState(
      this._puzzle,
      this._revealedIndices,
      indices,
      this._wrongGuessIndices,
      this._selectedTileIndex,
      this._version + 1,
      this._tiles
    );
  }

  addCorrectGuessIndex(index: number): ImmutableGameState {
    if (this._correctGuessIndices.has(index)) {
      return this;
    }
    const newIndices = new Set(this._correctGuessIndices);
    newIndices.add(index);
    return this.setCorrectGuessIndices(newIndices);
  }

  setWrongGuessIndices(indices: Set<number>): ImmutableGameState {
    if (this._setsEqual(this._wrongGuessIndices, indices)) {
      return this;
    }
    return new ImmutableGameState(
      this._puzzle,
      this._revealedIndices,
      this._correctGuessIndices,
      indices,
      this._selectedTileIndex,
      this._version + 1,
      this._tiles
    );
  }

  addWrongGuessIndex(index: number): ImmutableGameState {
    if (this._wrongGuessIndices.has(index)) {
      return this;
    }
    const newIndices = new Set(this._wrongGuessIndices);
    newIndices.add(index);
    return this.setWrongGuessIndices(newIndices);
  }

  setSelectedTileIndex(index: number | null): ImmutableGameState {
    if (this._selectedTileIndex === index) {
      return this;
    }
    return new ImmutableGameState(
      this._puzzle,
      this._revealedIndices,
      this._correctGuessIndices,
      this._wrongGuessIndices,
      index,
      this._version + 1,
      this._tiles
    );
  }

  // Batch update method for multiple changes
  update(changes: {
    puzzle?: Puzzle | null;
    revealedIndices?: Set<number>;
    correctGuessIndices?: Set<number>;
    wrongGuessIndices?: Set<number>;
    selectedTileIndex?: number | null;
  }): ImmutableGameState {
    let hasChanges = false;
    
    const puzzle = changes.puzzle !== undefined ? changes.puzzle : this._puzzle;
    const revealedIndices = changes.revealedIndices !== undefined ? changes.revealedIndices : this._revealedIndices;
    const correctGuessIndices = changes.correctGuessIndices !== undefined ? changes.correctGuessIndices : this._correctGuessIndices;
    const wrongGuessIndices = changes.wrongGuessIndices !== undefined ? changes.wrongGuessIndices : this._wrongGuessIndices;
    const selectedTileIndex = changes.selectedTileIndex !== undefined ? changes.selectedTileIndex : this._selectedTileIndex;

    if (puzzle !== this._puzzle) hasChanges = true;
    if (changes.revealedIndices && !this._setsEqual(this._revealedIndices, changes.revealedIndices)) hasChanges = true;
    if (changes.correctGuessIndices && !this._setsEqual(this._correctGuessIndices, changes.correctGuessIndices)) hasChanges = true;
    if (changes.wrongGuessIndices && !this._setsEqual(this._wrongGuessIndices, changes.wrongGuessIndices)) hasChanges = true;
    if (selectedTileIndex !== this._selectedTileIndex) hasChanges = true;

    if (!hasChanges) {
      return this;
    }

    return new ImmutableGameState(
      puzzle,
      revealedIndices,
      correctGuessIndices,
      wrongGuessIndices,
      selectedTileIndex,
      this._version + 1,
      puzzle === this._puzzle ? this._tiles : undefined
    );
  }

  // Change detection methods for React optimization
  hasChanged(other: ImmutableGameState): boolean {
    return this._version !== other._version;
  }

  hasPuzzleChanged(other: ImmutableGameState): boolean {
    return this._puzzle !== other._puzzle;
  }

  hasTileStateChanged(other: ImmutableGameState): boolean {
    return (
      !this._setsEqual(this._revealedIndices, other._revealedIndices) ||
      !this._setsEqual(this._correctGuessIndices, other._correctGuessIndices) ||
      !this._setsEqual(this._wrongGuessIndices, other._wrongGuessIndices)
    );
  }

  hasSelectionChanged(other: ImmutableGameState): boolean {
    return this._selectedTileIndex !== other._selectedTileIndex;
  }

  // Tile-specific change detection for individual tile optimization
  hasTileChanged(tileIndex: number, other: ImmutableGameState): boolean {
    if (this._puzzle !== other._puzzle) {
      return true;
    }

    const wasRevealed = other._revealedIndices.has(tileIndex);
    const isRevealed = this._revealedIndices.has(tileIndex);
    
    const wasCorrect = other._correctGuessIndices.has(tileIndex);
    const isCorrect = this._correctGuessIndices.has(tileIndex);
    
    const wasWrong = other._wrongGuessIndices.has(tileIndex);
    const isWrong = this._wrongGuessIndices.has(tileIndex);
    
    const wasSelected = other._selectedTileIndex === tileIndex;
    const isSelected = this._selectedTileIndex === tileIndex;

    return (
      wasRevealed !== isRevealed ||
      wasCorrect !== isCorrect ||
      wasWrong !== isWrong ||
      wasSelected !== isSelected
    );
  }

  // Utility methods
  getTileState(tileIndex: number): {
    isRevealed: boolean;
    isCorrect: boolean;
    isWrong: boolean;
    isSelected: boolean;
    tile: PuzzlePublicTile | null;
  } {
    return {
      isRevealed: this._revealedIndices.has(tileIndex),
      isCorrect: this._correctGuessIndices.has(tileIndex),
      isWrong: this._wrongGuessIndices.has(tileIndex),
      isSelected: this._selectedTileIndex === tileIndex,
      tile: this._tiles[tileIndex] || null,
    };
  }

  // Create a snapshot for debugging
  toSnapshot(): {
    puzzle: Puzzle | null;
    revealedIndices: number[];
    correctGuessIndices: number[];
    wrongGuessIndices: number[];
    selectedTileIndex: number | null;
    version: number;
  } {
    return {
      puzzle: this._puzzle,
      revealedIndices: Array.from(this._revealedIndices),
      correctGuessIndices: Array.from(this._correctGuessIndices),
      wrongGuessIndices: Array.from(this._wrongGuessIndices),
      selectedTileIndex: this._selectedTileIndex,
      version: this._version,
    };
  }

  // Static factory methods
  static empty(): ImmutableGameState {
    return new ImmutableGameState();
  }

  static fromPuzzle(puzzle: Puzzle): ImmutableGameState {
    return new ImmutableGameState(puzzle);
  }

  // Private helper methods
  private _setsEqual<T>(set1: ReadonlySet<T>, set2: ReadonlySet<T> | Set<T>): boolean {
    if (set1.size !== set2.size) {
      return false;
    }
    for (const item of set1) {
      if (!set2.has(item)) {
        return false;
      }
    }
    return true;
  }
}

