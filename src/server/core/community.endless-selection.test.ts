import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  redisMock,
  getCompletedLevelsMock,
  getFailedLevelsMock,
  getChallengeEvaluationMock,
} = vi.hoisted(() => ({
  redisMock: {
    zRange: vi.fn(),
    hGetAll: vi.fn(),
    zScore: vi.fn(),
  },
  getCompletedLevelsMock: vi.fn(),
  getFailedLevelsMock: vi.fn(),
  getChallengeEvaluationMock: vi.fn(),
}));

vi.mock('@devvit/web/server', () => ({
  context: {
    userId: 't2_user',
    username: 'tester',
    subredditName: 'decrypttest_dev',
  },
  reddit: {
    getSnoovatarUrl: vi.fn(),
  },
  redis: redisMock,
}));

vi.mock('./state', () => ({
  getCompletedLevels: getCompletedLevelsMock,
  getFailedLevels: getFailedLevelsMock,
  getUserProfile: vi.fn(),
  saveUserProfile: vi.fn(),
}));

vi.mock('./generator', () => ({
  buildAndSaveManualPuzzle: vi.fn(),
  buildManualPuzzleWithSolverFallback: vi.fn(),
  publishDailyPost: vi.fn(),
}));

vi.mock('./engagement', () => ({
  getLevelEngagement: vi.fn().mockResolvedValue({
    plays: 0,
    wins: 0,
    winRatePct: 0,
  }),
}));

vi.mock('./challenge-evaluation', () => ({
  buildChallengeEvaluation: vi.fn(),
  getChallengeEvaluation: getChallengeEvaluationMock,
}));

import { getNextCommunityEndlessLevelId } from './community';

const submissionHash = (params: {
  submissionId: string;
  levelId: string;
  category?: string;
  targetDifficulty?: number;
  reviewedAt?: number;
}) => ({
  authorId: 't2_author',
  authorName: 'maker',
  title: 'Puzzle',
  text: 'This is a valid community cipher text',
  normalizedSig: params.submissionId,
  tokenSig: params.submissionId,
  category: params.category ?? 'QUOTE',
  attribution: 'Source',
  targetDifficulty: `${params.targetDifficulty ?? 5}`,
  suggestedTier: 'medium',
  status: 'approved',
  submittedAt: '1000',
  reviewedBy: 'mod',
  reviewedAt: `${params.reviewedAt ?? 1000}`,
  rejectionReason: '',
  levelId: params.levelId,
});

const evaluationFor = (params: {
  levelId: string;
  staticDifficulty: number;
  calibratedDifficulty: number;
  shadowDifficulty?: number;
  shadowUncertainty?: number;
  shadowPlayCount?: number;
}) => ({
  levelId: params.levelId,
  difficultyBreakdown: {
    staticDifficulty: params.staticDifficulty,
    calibratedDifficulty: params.calibratedDifficulty,
  },
  shadowRatingSnapshot:
    params.shadowDifficulty === undefined
      ? null
      : {
          itemDifficultyRating: params.shadowDifficulty,
          itemUncertainty: params.shadowUncertainty ?? 0.3,
          itemPlayCount: params.shadowPlayCount ?? 40,
        },
});

const mockApprovedSubmissions = (submissions: Array<{
  submissionId: string;
  levelId: string;
  targetDifficulty?: number;
  reviewedAt?: number;
}>): void => {
  redisMock.zRange.mockResolvedValue(
    submissions.map((submission, index) => ({
      member: submission.submissionId,
      score: submission.reviewedAt ?? index + 1,
    }))
  );
  redisMock.hGetAll.mockImplementation(async (key: string) => {
    const submission = submissions.find((candidate) =>
      key.endsWith(candidate.submissionId)
    );
    return submission
      ? submissionHash({
          submissionId: submission.submissionId,
          levelId: submission.levelId,
          targetDifficulty: submission.targetDifficulty,
          reviewedAt: submission.reviewedAt,
        })
      : {};
  });
};

describe('community endless selection', () => {
  beforeEach(() => {
    redisMock.zRange.mockReset();
    redisMock.hGetAll.mockReset();
    redisMock.zScore.mockReset();
    getCompletedLevelsMock.mockReset();
    getFailedLevelsMock.mockReset();
    getChallengeEvaluationMock.mockReset();
    getFailedLevelsMock.mockResolvedValue(new Set<string>());
    getChallengeEvaluationMock.mockResolvedValue(null);
  });

  it('skips the latest completed puzzle and selects the latest open puzzle', async () => {
    redisMock.zRange.mockResolvedValue([
      { member: 'submission-old-open', score: 100 },
      { member: 'submission-second-open', score: 200 },
      { member: 'submission-latest-completed', score: 300 },
    ]);
    redisMock.hGetAll.mockImplementation(async (key: string) => {
      if (key.endsWith('submission-latest-completed')) {
        return submissionHash({
          submissionId: 'submission-latest-completed',
          levelId: 'level-latest-completed',
          reviewedAt: 300,
        });
      }
      if (key.endsWith('submission-second-open')) {
        return submissionHash({
          submissionId: 'submission-second-open',
          levelId: 'level-second-open',
          reviewedAt: 200,
        });
      }
      return submissionHash({
        submissionId: 'submission-old-open',
        levelId: 'level-old-open',
        reviewedAt: 100,
      });
    });
    getCompletedLevelsMock.mockResolvedValue(new Set<string>(['level-latest-completed']));
    redisMock.zScore.mockResolvedValue(null);

    const selected = await getNextCommunityEndlessLevelId({
      userId: 't2_user',
      endlessSort: 'latest',
    });

    expect(selected).toEqual({
      levelId: 'level-second-open',
      reason: 'available',
    });
  });

  it('treats string zset scores as played and skips them', async () => {
    redisMock.zRange.mockResolvedValue([
      { member: 'submission-played', score: '300' },
      { member: 'submission-open', score: '200' },
    ]);
    redisMock.hGetAll.mockImplementation(async (key: string) => {
      if (key.endsWith('submission-played')) {
        return submissionHash({
          submissionId: 'submission-played',
          levelId: 'level-played',
          reviewedAt: 300,
        });
      }
      return submissionHash({
        submissionId: 'submission-open',
        levelId: 'level-open',
        reviewedAt: 200,
      });
    });
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    redisMock.zScore.mockImplementation(async (_key: string, levelId: string) =>
      levelId === 'level-played' ? '12345' : null
    );

    const selected = await getNextCommunityEndlessLevelId({
      userId: 't2_user',
      endlessSort: 'latest',
    });

    expect(selected).toEqual({
      levelId: 'level-open',
      reason: 'available',
    });
  });

  it('selects a low-difficulty endless match for low-rated players', async () => {
    mockApprovedSubmissions([
      { submissionId: 'submission-low', levelId: 'level-low', targetDifficulty: 2 },
      { submissionId: 'submission-mid', levelId: 'level-mid', targetDifficulty: 5 },
      { submissionId: 'submission-high', levelId: 'level-high', targetDifficulty: 9 },
    ]);
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    redisMock.zScore.mockResolvedValue(null);

    const selected = await getNextCommunityEndlessLevelId({
      userId: 't2_user',
      endlessSort: 'random',
      playerRating: 390,
    });

    expect(selected).toEqual({
      levelId: 'level-low',
      reason: 'available',
    });
  });

  it('uses calibrated evaluation difficulty for mid-rated endless matching', async () => {
    mockApprovedSubmissions([
      {
        submissionId: 'submission-stale-static',
        levelId: 'level-calibrated-mid',
        targetDifficulty: 2,
      },
      { submissionId: 'submission-hard', levelId: 'level-hard', targetDifficulty: 9 },
    ]);
    const evaluations = new Map<string, unknown>([
      [
        'level-calibrated-mid',
        evaluationFor({
          levelId: 'level-calibrated-mid',
          staticDifficulty: 2,
          calibratedDifficulty: 5,
        }),
      ],
      [
        'level-hard',
        evaluationFor({
          levelId: 'level-hard',
          staticDifficulty: 9,
          calibratedDifficulty: 9,
        }),
      ],
    ]);
    getChallengeEvaluationMock.mockImplementation(
      async (levelId: string) => evaluations.get(levelId) ?? null
    );
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    redisMock.zScore.mockResolvedValue(null);

    const selected = await getNextCommunityEndlessLevelId({
      userId: 't2_user',
      endlessSort: 'random',
      playerRating: 575,
    });

    expect(selected).toEqual({
      levelId: 'level-calibrated-mid',
      reason: 'available',
    });
  });

  it('uses ready shadow difficulty to surface harder matches for high-rated players', async () => {
    mockApprovedSubmissions([
      {
        submissionId: 'submission-shadow-hard',
        levelId: 'level-shadow-hard',
        targetDifficulty: 5,
        reviewedAt: 200,
      },
      {
        submissionId: 'submission-static-medium',
        levelId: 'level-static-medium',
        targetDifficulty: 6,
        reviewedAt: 100,
      },
    ]);
    const evaluations = new Map<string, unknown>([
      [
        'level-shadow-hard',
        evaluationFor({
          levelId: 'level-shadow-hard',
          staticDifficulty: 5,
          calibratedDifficulty: 6,
          shadowDifficulty: 10,
          shadowUncertainty: 0.1,
          shadowPlayCount: 45,
        }),
      ],
      [
        'level-static-medium',
        evaluationFor({
          levelId: 'level-static-medium',
          staticDifficulty: 6,
          calibratedDifficulty: 6,
        }),
      ],
    ]);
    getChallengeEvaluationMock.mockImplementation(
      async (levelId: string) => evaluations.get(levelId) ?? null
    );
    getCompletedLevelsMock.mockResolvedValue(new Set<string>());
    redisMock.zScore.mockResolvedValue(null);

    const selected = await getNextCommunityEndlessLevelId({
      userId: 't2_user',
      endlessSort: 'random',
      playerRating: 800,
    });

    expect(selected).toEqual({
      levelId: 'level-shadow-hard',
      reason: 'available',
    });
  });
});
