import {
  communityActionResponseSchema,
  communityAutoFixInputSchema,
  communityAutoFixResponseSchema,
  communityCreatorProgressResponseSchema,
  communityLineFitInputSchema,
  communityLineFitReportSchema,
  communitySubmissionListResponseSchema,
  communitySubmissionPreviewInputSchema,
  communitySubmissionPreviewSchema,
  communitySubmissionInputSchema,
  communitySubmitRequestedEditInputSchema,
  communityVoteInputSchema,
  communityVoteResponseSchema,
  communityVoteStateInputSchema,
  communityVoteStateResponseSchema,
  communityWithdrawInputSchema,
} from '../../../shared/community';
import {
  autoFixCommunityManualLayout,
  fitCommunityLine,
  getCommunityVoteState,
  getMyCommunityCreatorProgress,
  listMyCommunitySubmissions,
  previewCommunitySubmission,
  recordCommunityVote,
  submitCommunitySubmission,
  submitRequestedCommunityEdit,
  withdrawCommunitySubmission,
} from '../../core/community';
import { router } from '../base';
import { authedProcedure } from '../procedures';

export const communityRouter = router({
  fitLine: authedProcedure
    .input(communityLineFitInputSchema)
    .query(async ({ input }) =>
      communityLineFitReportSchema.parse(await fitCommunityLine(input))
    ),
  autoFixManualLayout: authedProcedure
    .input(communityAutoFixInputSchema)
    .mutation(async ({ input }) =>
      communityAutoFixResponseSchema.parse(
        await autoFixCommunityManualLayout(input)
      )
    ),
  previewSubmission: authedProcedure
    .input(communitySubmissionPreviewInputSchema)
    .query(async ({ input }) =>
      communitySubmissionPreviewSchema.parse(
        await previewCommunitySubmission(input)
      )
    ),
  submit: authedProcedure
    .input(communitySubmissionInputSchema)
    .mutation(async ({ input }) => {
      const submission = await submitCommunitySubmission(input);
      return communityActionResponseSchema.parse({
        success: true,
        message: 'Submission sent for moderator review.',
        submission,
      });
    }),
  listMine: authedProcedure.query(async () =>
    communitySubmissionListResponseSchema.parse({
      submissions: await listMyCommunitySubmissions(50),
    })
  ),
  withdraw: authedProcedure
    .input(communityWithdrawInputSchema)
    .mutation(async ({ input }) => {
      const submission = await withdrawCommunitySubmission(input.submissionId);
      return communityActionResponseSchema.parse({
        success: true,
        message: 'Submission withdrawn.',
        submission,
      });
    }),
  submitRequestedEdit: authedProcedure
    .input(communitySubmitRequestedEditInputSchema)
    .mutation(async ({ input }) => {
      const submission = await submitRequestedCommunityEdit(input);
      return communityActionResponseSchema.parse({
        success: true,
        message: 'Revision sent for moderator review.',
        submission,
      });
    }),
  vote: authedProcedure
    .input(communityVoteInputSchema)
    .output(communityVoteResponseSchema)
    .mutation(async ({ input }) =>
      communityVoteResponseSchema.parse(
        await recordCommunityVote({ levelId: input.levelId, vote: input.vote })
      )
    ),
  getVoteState: authedProcedure
    .input(communityVoteStateInputSchema)
    .output(communityVoteStateResponseSchema)
    .query(async ({ input }) =>
      communityVoteStateResponseSchema.parse(
        await getCommunityVoteState(input.levelId)
      )
    ),
  getMyCreatorProgress: authedProcedure
    .output(communityCreatorProgressResponseSchema)
    .query(async () =>
      communityCreatorProgressResponseSchema.parse(
        await getMyCommunityCreatorProgress()
      )
    ),
});
