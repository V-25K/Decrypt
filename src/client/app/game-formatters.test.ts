import { describe, expect, it } from 'vitest';
import { formatDifficultyLabel } from './game-formatters';

describe('formatDifficultyLabel', () => {
  it('matches the shared difficulty tier boundaries', () => {
    expect(formatDifficultyLabel(2)).toBe('Easy');
    expect(formatDifficultyLabel(5)).toBe('Medium');
    expect(formatDifficultyLabel(6)).toBe('Hard');
    expect(formatDifficultyLabel(8)).toBe('Hard');
    expect(formatDifficultyLabel(9)).toBe('Expert');
  });
});
