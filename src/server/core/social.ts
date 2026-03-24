import { context, reddit } from '@devvit/web/server';
import { computeScore } from './leaderboard';

const sanitizeLines = (lines: string[]): string =>
  lines
    .map((line) => line.replace(/[\r\n]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

const formatDuration = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const shareResultAsComment = async (params: {
  levelId: string;
  solveSeconds: number;
  mistakes: number;
  heartsRemaining: number;
  usedPowerups: number;
  score: number | null;
}): Promise<{ success: boolean; reason: string | null; commentId: string | null }> => {
  const postId = context.postId;
  if (!postId) {
    return { success: false, reason: 'Missing post context.', commentId: null };
  }

  const score =
    typeof params.score === 'number'
      ? params.score
      : computeScore({
          solveSeconds: params.solveSeconds,
          mistakes: params.mistakes,
          usedPowerups: params.usedPowerups,
        });
  const summary = sanitizeLines([
    'Cleared the challenge!',
    `Score: ${score}`,
    `Powerups used: ${params.usedPowerups}`,
    `Mistakes: ${params.mistakes}`,
    `Time: ${formatDuration(params.solveSeconds)}`,
  ]);

  try {
    const comment = await reddit.submitComment({
      id: postId,
      text: summary,
      runAs: 'USER',
    });
    return { success: true, reason: null, commentId: comment.id };
  } catch (_error) {
    return { success: false, reason: 'Failed to submit comment.', commentId: null };
  }
};
