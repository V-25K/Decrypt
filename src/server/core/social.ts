import { context, reddit } from '@devvit/web/server';

const cleanLine = (line: string): string => line.replace(/[\r\n]+/g, ' ').trim();

const formatDuration = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const buildShareBadges = (params: {
  mistakes: number;
  usedPowerups: number;
  heartsRemaining: number;
}): string[] => {
  const badges: string[] = [];
  if (params.mistakes === 0) {
    badges.push('Flawless');
  }
  if (params.usedPowerups === 0) {
    badges.push('No powerups');
  }
  if (params.heartsRemaining >= 2) {
    badges.push('Strong finish');
  }
  return badges;
};

const buildShareComment = (params: {
  solveSeconds: number;
  mistakes: number;
  heartsRemaining: number;
  usedPowerups: number;
  score: number;
}): string => {
  const badges = buildShareBadges(params);
  const lines = [
    `- Score: **${params.score}**`,
    `- Time: **${formatDuration(params.solveSeconds)}**`,
    `- Mistakes: **${params.mistakes}**`,
    `- Powerups: **${params.usedPowerups}**`,
  ];

  if (badges.length > 0) {
    lines.push('', `Highlights: **${badges.join(' | ')}**`);
  }

  lines.push('', 'Can you beat this run?');
  return lines.map(cleanLine).join('\n');
};

const toShareFailureReason = (error: unknown): string => {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) {
      return message;
    }
  }
  return 'Failed to submit comment.';
};

export const shareResultAsComment = async (params: {
  levelId: string;
  solveSeconds: number;
  mistakes: number;
  heartsRemaining: number;
  usedPowerups: number;
  score: number;
}): Promise<{ success: boolean; reason: string | null; commentId: string | null }> => {
  const postId = context.postId;
  if (!postId) {
    return { success: false, reason: 'Missing post context.', commentId: null };
  }

  const summary = buildShareComment({
    solveSeconds: params.solveSeconds,
    mistakes: params.mistakes,
    heartsRemaining: params.heartsRemaining,
    usedPowerups: params.usedPowerups,
    score: params.score,
  });

  try {
    const comment = await reddit.submitComment({
      id: postId,
      text: summary,
      runAs: 'USER',
    });
    return { success: true, reason: null, commentId: comment.id };
  } catch (error) {
    return { success: false, reason: toShareFailureReason(error), commentId: null };
  }
};
