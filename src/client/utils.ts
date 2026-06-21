import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type TokenTile = {
  isLetter: boolean;
  displayChar: string;
};

type NavigableTokenTile = TokenTile & {
  index: number;
  isLocked?: boolean;
};

export type PuzzleRenderToken<TTile extends TokenTile> =
  | {
    type: 'word';
    key: string;
    tiles: TTile[];
  }
  | {
    type: 'separator';
    key: string;
    tile: TTile;
  };

export const tokenizePuzzleTiles = <TTile extends TokenTile>(
  tiles: TTile[]
): PuzzleRenderToken<TTile>[] => {
  const tokens: PuzzleRenderToken<TTile>[] = [];
  let current: TTile[] = [];
  let wordIndex = 0;
  let separatorIndex = 0;

  const pushWord = () => {
    if (current.length === 0) {
      return;
    }
    tokens.push({
      type: 'word',
      key: `word-${wordIndex}`,
      tiles: current,
    });
    wordIndex += 1;
    current = [];
  };

  for (const tile of tiles) {
    if (!tile.isLetter) {
      pushWord();
      tokens.push({
        type: 'separator',
        key: `separator-${separatorIndex}`,
        tile,
      });
      separatorIndex += 1;
      continue;
    }
    current.push(tile);
  }

  pushWord();
  return tokens;
};

const trimLineEdges = <TTile extends TokenTile>(
  line: PuzzleRenderToken<TTile>[]
): PuzzleRenderToken<TTile>[] => {
  let start = 0;
  let end = line.length;

  while (start < end) {
    const token = line[start];
    if (token?.type === 'separator' && token.tile.displayChar === ' ') {
      start += 1;
      continue;
    }
    break;
  }

  while (end > start) {
    const token = line[end - 1];
    if (token?.type === 'separator' && token.tile.displayChar === ' ') {
      end -= 1;
      continue;
    }
    break;
  }

  return line.slice(start, end);
};

export const chunkPuzzleTokensByWordLimit = <TTile extends TokenTile>(
  tokens: PuzzleRenderToken<TTile>[],
  maxWordsPerLine: number
): PuzzleRenderToken<TTile>[][] => {
  if (tokens.length === 0 || maxWordsPerLine < 1) {
    return [tokens];
  }

  const lines: PuzzleRenderToken<TTile>[][] = [[]];
  let wordsInLine = 0;

  for (const token of tokens) {
    let currentLine = lines[lines.length - 1];
    if (!currentLine) {
      currentLine = [];
      lines.push(currentLine);
    }

    if (token.type === 'word') {
      if (wordsInLine >= maxWordsPerLine && currentLine.length > 0) {
        currentLine = trimLineEdges(currentLine);
        lines[lines.length - 1] = currentLine;
        currentLine = [];
        lines.push(currentLine);
        wordsInLine = 0;
      }
      currentLine.push(token);
      wordsInLine += 1;
      continue;
    }

    if (currentLine.length === 0 && token.tile.displayChar === ' ') {
      continue;
    }
    currentLine.push(token);
  }

  const cleaned = lines.map((line) => trimLineEdges(line)).filter((line) => line.length > 0);
  if (cleaned.length === 0) {
    return [tokens];
  }
  return cleaned;
};

export type PuzzleLineSegment<TTile extends TokenTile> =
  | { kind: 'space'; key: string; token: PuzzleRenderToken<TTile> }
  | { kind: 'group'; key: string; tokens: PuzzleRenderToken<TTile>[] };

/**
 * Groups a line's tokens so each run of non-space tokens — a word plus any
 * punctuation touching it — renders as one non-wrapping unit, with spaces as the
 * only wrap points. This keeps punctuation from dropping to the next line away
 * from the word it belongs to (punctuation is a real solving clue), while words
 * still wrap normally at spaces.
 */
export const groupLineTokensBySpaces = <TTile extends TokenTile>(
  line: PuzzleRenderToken<TTile>[]
): PuzzleLineSegment<TTile>[] => {
  const segments: PuzzleLineSegment<TTile>[] = [];
  let current: PuzzleRenderToken<TTile>[] = [];

  const flush = () => {
    const first = current[0];
    if (first) {
      segments.push({ kind: 'group', key: `group-${first.key}`, tokens: current });
      current = [];
    }
  };

  for (const token of line) {
    if (token.type === 'separator' && token.tile.displayChar === ' ') {
      flush();
      segments.push({ kind: 'space', key: token.key, token });
    } else {
      current.push(token);
    }
  }
  flush();
  return segments;
};

export const getPuzzleNavigableTileRows = <TTile extends NavigableTokenTile>(
  puzzleTokenLines: PuzzleRenderToken<TTile>[][],
  maxColumns: number
): number[][] => {
  const rows: number[][] = [];
  const safeMaxColumns = Math.max(1, maxColumns);

  for (const line of puzzleTokenLines) {
    const lineRows: number[][] = [[]];
    for (const token of line) {
      if (token.type !== 'word') {
        continue;
      }

      for (let index = 0; index < token.tiles.length; index += safeMaxColumns) {
        const rowIndex = Math.floor(index / safeMaxColumns);
        if (!lineRows[rowIndex]) {
          lineRows[rowIndex] = [];
        }
        const row = lineRows[rowIndex];
        if (!row) {
          continue;
        }
        row.push(
          ...token.tiles
            .slice(index, index + safeMaxColumns)
            .filter(
              (tile) => tile.isLetter && !tile.isLocked && tile.displayChar === '_'
            )
            .map((tile) => tile.index)
        );
      }
    }
    rows.push(...lineRows.filter((row) => row.length > 0));
  }

  return rows;
};
