import {
  communityActionResponseSchema,
  communitySubmissionListResponseSchema,
  communitySubmissionPreviewInputSchema,
  communitySubmissionPreviewSchema,
  communitySubmissionInputSchema,
  communitySubmitRequestedEditInputSchema,
  communityWithdrawInputSchema,
} from '../../../shared/community';
import {
  listMyCommunitySubmissions,
  previewCommunitySubmission,
  submitCommunitySubmission,
  submitRequestedCommunityEdit,
  withdrawCommunitySubmission,
} from '../../core/community';
import { router } from '../base';
import { authedProcedure } from '../procedures';

export const communityRouter = router({
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
});
