import type { ChallengeCandidate } from './ai';
import {
  contentTokenSignature,
  isNearDuplicateSignature,
  normalizeContent,
  sanitizePhrase,
} from './content';
import type { ChallengeType } from '../../shared/game';
import type { ValidationPipeline } from './validation-pipeline';

export type CandidateSignatureEntry = {
  normalizedSignature: string;
  tokenSignature: string | null;
};

export type FilteredChallengeCandidate = {
  text: string;
  author: string;
  challengeType: ChallengeType;
  normalizedSignature: string;
  tokenSignature: string;
  reservationOwnerToken?: string;
};

export type CandidateFilterDecision = {
  candidateIndex: number;
  accepted: boolean;
  reason: string | null;
  normalizedSignature?: string;
  reservationOwnerToken?: string;
  filteredCandidate?: FilteredChallengeCandidate;
};

export type FilterCandidateBatchResult = {
  accepted: FilteredChallengeCandidate[];
  decisions: CandidateFilterDecision[];
};

export const filterCandidateBatch = (params: {
  candidates: ChallengeCandidate[];
  preferredType: ChallengeType;
  difficulty: number;
  pipeline: ValidationPipeline;
  recentSignatureEntries: CandidateSignatureEntry[];
}): FilterCandidateBatchResult => {
  const accepted: FilteredChallengeCandidate[] = [];
  const acceptedSignatureEntries: CandidateSignatureEntry[] = [];
  const decisions: CandidateFilterDecision[] = [];

  for (let candidateIndex = 0; candidateIndex < params.candidates.length; candidateIndex += 1) {
    const candidate = params.candidates[candidateIndex];
    if (!candidate) {
      continue;
    }

    if (candidate.challengeType !== params.preferredType) {
      decisions.push({
        candidateIndex,
        accepted: false,
        reason: `challenge type mismatch (expected ${params.preferredType} got ${candidate.challengeType})`,
      });
      continue;
    }

    const text = sanitizePhrase(candidate.text);
    const normalizedSignature = normalizeContent(text);
    const tokenSignature = contentTokenSignature(text);
    const phase1 = params.pipeline.phase1(text, params.difficulty);
    if (!phase1.valid) {
      decisions.push({
        candidateIndex,
        accepted: false,
        reason: phase1.reasons.join('; '),
        normalizedSignature: normalizedSignature.length > 0 ? normalizedSignature : undefined,
        reservationOwnerToken: candidate.reservationOwnerToken,
      });
      continue;
    }

    if (normalizedSignature.length === 0) {
      decisions.push({
        candidateIndex,
        accepted: false,
        reason: 'empty signature',
        reservationOwnerToken: candidate.reservationOwnerToken,
      });
      continue;
    }

    const batchDuplicate = isNearDuplicateSignature({
      candidateNormalizedSignature: normalizedSignature,
      candidateTokenSignature: tokenSignature,
      recent: acceptedSignatureEntries,
    });
    if (batchDuplicate.duplicate) {
      decisions.push({
        candidateIndex,
        accepted: false,
        reason: `duplicate within batch: ${batchDuplicate.reason ?? 'near duplicate'}`,
        normalizedSignature,
        reservationOwnerToken: candidate.reservationOwnerToken,
      });
      continue;
    }

    const historicalDuplicate = isNearDuplicateSignature({
      candidateNormalizedSignature: normalizedSignature,
      candidateTokenSignature: tokenSignature,
      recent: params.recentSignatureEntries,
    });
    if (historicalDuplicate.duplicate) {
      decisions.push({
        candidateIndex,
        accepted: false,
        reason: historicalDuplicate.reason ?? 'duplicate',
        normalizedSignature,
        reservationOwnerToken: candidate.reservationOwnerToken,
      });
      continue;
    }

    const filteredCandidate = {
      text,
      author: candidate.author,
      challengeType: candidate.challengeType,
      normalizedSignature,
      tokenSignature,
      reservationOwnerToken: candidate.reservationOwnerToken,
    };
    accepted.push(filteredCandidate);
    acceptedSignatureEntries.push({
      normalizedSignature,
      tokenSignature,
    });
    decisions.push({
      candidateIndex,
      accepted: true,
      reason: null,
      filteredCandidate,
    });
  }

  return {
    accepted,
    decisions,
  };
};
