import { z } from 'zod';
import {
  type ChallengeType,
  challengeTypeSchema,
} from '../../shared/game.ts';
import {
  difficultyToTier,
  exceedsPuzzleTotalLength,
  type HardnessBoundsByTier,
  hasWordLongerThan,
  looksLikeAllowedAuthor,
  maxPuzzleTotalLength,
  minPlayablePuzzleTotalLength,
  maxPuzzleAuthorLength,
  looksLikeAllowedPhrase,
  maxPuzzleWordLength,
  quotePromptProfileForDifficulty,
  sanitizeAuthor,
  sanitizePhrase,
} from './content.ts';

const geminiResponseSchema = z.object({
  candidates: z.array(
    z.object({
      content: z.object({
        parts: z.array(
          z.object({
            text: z.string(),
          })
        ),
      }),
    })
  ),
});

// Batch generation types
export type ChallengeCandidate = {
  text: string;
  author: string;
  challengeType: ChallengeType;
};

export type BatchGenerationResult = {
  candidates: ChallengeCandidate[];
  totalRequested: number;
  totalReturned: number;
};

const batchPayloadSchema = z.array(
  z.object({
    target_string: z.string().min(3),
    author: z.string().min(1),
    challenge_type: z.string().min(1),
  })
);

const bannedExactWords = [
  'FUCK',
  'SHIT',
  'BITCH',
  'ASSHOLE',
  'BASTARD',
  'SLUR',
  'HATE',
  'KILL',
  'SUICIDE',
  'RAPE',
];
const bannedSubstrings = [
  'NIGG',
  'FAGG',
  'CUNT',
  'WHORE',
  'KYS',
];
export const aiChallengeTypePool: ChallengeType[] = [
  'QUOTE',
  'LYRIC_LINE',
  'MOVIE_LINE',
  'ANIME_LINE',
  'SPEECH_LINE',
  'BOOK_LINE',
  'TV_LINE',
  'SAYING',
  'PROVERB',
];

const containsBannedContent = (input: string): boolean => {
  const upper = input.toUpperCase();
  const exactWords = upper.split(/[^A-Z0-9]+/).filter((token) => token.length > 0);
  const hasExactMatch = bannedExactWords.some((word) => exactWords.includes(word));
  if (hasExactMatch) {
    return true;
  }
  return bannedSubstrings.some((fragment) => upper.includes(fragment));
};

type GeminiSafetySetting = {
  category:
    | 'HARM_CATEGORY_HATE_SPEECH'
    | 'HARM_CATEGORY_HARASSMENT'
    | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
    | 'HARM_CATEGORY_DANGEROUS_CONTENT'
    | 'HARM_CATEGORY_CIVIC_INTEGRITY';
  threshold:
    | 'BLOCK_LOW_AND_ABOVE'
    | 'BLOCK_MEDIUM_AND_ABOVE'
    | 'BLOCK_ONLY_HIGH';
};

const normalizeSafetyMode = (safetyMode: unknown): string => {
  if (typeof safetyMode === 'string') {
    const normalized = safetyMode.trim().toLowerCase();
    return normalized.length > 0 ? normalized : 'strict';
  }
  if (typeof safetyMode === 'number' || typeof safetyMode === 'boolean') {
    return `${safetyMode}`.trim().toLowerCase();
  }
  if (Array.isArray(safetyMode)) {
    const firstString = safetyMode.find((entry): entry is string => typeof entry === 'string');
    if (firstString) {
      const normalized = firstString.trim().toLowerCase();
      return normalized.length > 0 ? normalized : 'strict';
    }
  }
  if (safetyMode && typeof safetyMode === 'object') {
    const candidate = Reflect.get(safetyMode, 'value');
    if (typeof candidate === 'string') {
      const normalized = candidate.trim().toLowerCase();
      return normalized.length > 0 ? normalized : 'strict';
    }
  }
  return 'strict';
};

const safetyThresholdForMode = (
  safetyMode: unknown
): GeminiSafetySetting['threshold'] => {
  const normalized = normalizeSafetyMode(safetyMode);
  if (normalized === 'strict') {
    return 'BLOCK_LOW_AND_ABOVE';
  }
  if (normalized === 'relaxed' || normalized === 'lenient') {
    return 'BLOCK_ONLY_HIGH';
  }
  return 'BLOCK_MEDIUM_AND_ABOVE';
};

const geminiSafetySettingsForMode = (
  safetyMode: unknown
): GeminiSafetySetting[] => {
  const threshold = safetyThresholdForMode(safetyMode);
  return [
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold,
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold,
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold,
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold,
    },
    {
      category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
      threshold,
    },
  ];
};

const extractJson = (input: string): string | null => {
  // Try to extract array first (for batch responses)
  const arrayStart = input.indexOf('[');
  const arrayEnd = input.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return input.slice(arrayStart, arrayEnd + 1);
  }
  
  // Fall back to object extraction (for single responses)
  const objStart = input.indexOf('{');
  const objEnd = input.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    return input.slice(objStart, objEnd + 1);
  }
  
  return null;
};

const parseChallengeType = (raw: string | undefined): ChallengeType | null => {
  const normalized = (raw ?? '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z_]/g, '')
    .trim();
  const parsed = challengeTypeSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readErrorField = (error: unknown, field: string): unknown =>
  isRecord(error) ? error[field] : undefined;

const describeRequestError = (error: unknown): string => {
  if (error instanceof Error) {
    const parts = [`name=${error.name ?? 'Error'}`, `message=${error.message}`];
    const code = readErrorField(error, 'code');
    const errno = readErrorField(error, 'errno');
    const details = readErrorField(error, 'details');
    const causeField = readErrorField(error, 'cause');
    if (code !== undefined) {
      parts.push(`code=${String(code)}`);
    }
    if (errno !== undefined) {
      parts.push(`errno=${String(errno)}`);
    }
    if (details !== undefined) {
      parts.push(`details=${String(details)}`);
    }
    if (causeField !== undefined) {
      const cause =
        causeField instanceof Error
          ? `${causeField.name}: ${causeField.message}`
          : String(causeField);
      parts.push(`cause=${cause}`);
    }
    return parts.join(' ');
  }
  return `value=${String(error)}`;
};

const preferredPromptLengthBounds = (
  difficulty: number,
): { min: number; max: number } => {
  const tier = difficultyToTier(difficulty);
  if (tier === 'warmup') {
    return { min: 14, max: 26 };
  }
  if (tier === 'medium') {
    return { min: 22, max: 38 };
  }
  if (tier === 'hard') {
    return { min: 28, max: 48 };
  }
  return { min: 32, max: maxPuzzleTotalLength };
};

const flexiblePromptLengthBounds = (
  difficulty: number
): { min: number; max: number } => {
  const tier = difficultyToTier(difficulty);
  if (tier === 'warmup') {
    return { min: minPlayablePuzzleTotalLength, max: 32 };
  }
  if (tier === 'medium') {
    return { min: 18, max: 46 };
  }
  if (tier === 'hard') {
    return { min: 20, max: maxPuzzleTotalLength };
  }
  return { min: 24, max: maxPuzzleTotalLength };
};

const temperatureForDifficulty = (difficulty: number): number => {
  const tier = difficultyToTier(difficulty);
  if (tier === 'warmup') {
    return 0.3;
  }
  if (tier === 'medium') {
    return 0.45;
  }
  if (tier === 'hard') {
    return 0.55;
  }
  return 0.65;
};

export const generatePuzzlePhraseBatch = async (params: {
  levelId: string;
  difficulty: number;
  apiKey: string;
  difficultyLabel: string;
  safetyMode: string;
  preferredType: ChallengeType;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
  batchSize: number;
}): Promise<BatchGenerationResult> => {
  if (!params.apiKey) {
    throw new Error('Gemini API key missing for generatePuzzlePhraseBatch');
  }

  // Log batch generation start
  console.log('[generatePuzzlePhraseBatch] Starting batch generation', {
    levelId: params.levelId,
    difficulty: params.difficulty,
    difficultyLabel: params.difficultyLabel,
    preferredType: params.preferredType,
    batchSize: params.batchSize,
  });

  const tier = difficultyToTier(params.difficulty);
  const promptProfile = quotePromptProfileForDifficulty(
    params.difficulty,
    params.hardnessBoundsByTier
  );
  const preferredBounds = preferredPromptLengthBounds(params.difficulty);
  const flexibleBounds = flexiblePromptLengthBounds(params.difficulty);
  const challengeTypeList = aiChallengeTypePool.join(', ');

  const promptRules = {
    output_keys: ['target_string', 'author', 'challenge_type'],
    allowed_challenge_types: aiChallengeTypePool,
      difficulty: {
        label: params.difficultyLabel,
        value: params.difficulty,
        tier,
      length_policy: 'soft_recommendation_not_hard_gate',
      preferred_bounds_by_tier: {
        warmup: [14, 26],
        medium: [22, 38],
        hard: [28, 48],
        expert: [32, maxPuzzleTotalLength],
      },
      flexible_bounds_by_tier: {
        warmup: [minPlayablePuzzleTotalLength, 32],
        medium: [18, 46],
        hard: [20, maxPuzzleTotalLength],
        expert: [24, maxPuzzleTotalLength],
      },
      playable_bounds: [minPlayablePuzzleTotalLength, maxPuzzleTotalLength],
      active_preferred_bounds: [preferredBounds.min, preferredBounds.max],
      active_flexible_bounds: [flexibleBounds.min, flexibleBounds.max],
    },
    constraints: {
      uppercase: true,
      family_safe: true,
      real_verifiable_phrase_only: true,
      allowed_charset: "A-Z0-9 ,.'!?;:()-",
      banned_exact_words: bannedExactWords,
      banned_substrings: bannedSubstrings,
      max_total_length: maxPuzzleTotalLength,
      max_token_length: maxPuzzleWordLength,
      recommended_word_count_range: [
        promptProfile.wordCountBounds.min,
        promptProfile.wordCountBounds.max,
      ],
      recommended_letter_count_range: [
        promptProfile.letterBounds.min,
        promptProfile.letterBounds.max,
      ],
      recommended_min_unique_words: promptProfile.recommendedMinUniqueWords,
      recommended_unique_letter_range: [
        promptProfile.uniqueLetterBounds.min,
        promptProfile.uniqueLetterBounds.max,
      ],
      target_crypto_hardness_range: [
        promptProfile.cryptoHardnessBounds.min,
        promptProfile.cryptoHardnessBounds.max,
      ],
      repeated_whole_words: 'avoid',
      requires_repeated_letter: true,
    },
    hints: {
      preferred_challenge_type: params.preferredType,
      preferred_type_mode: 'strict_required',
      safety_mode: params.safetyMode,
      level_id: params.levelId,
      style_guidance:
        tier === 'warmup'
          ? 'Prefer a clue-friendly line with familiar patterns. It can run a little longer if repetition keeps it easy.'
          : tier === 'medium'
            ? 'Prefer a balanced full thought. Medium can be shorter if variety is high, or longer if the wording stays clue-friendly.'
            : tier === 'hard'
              ? 'Prefer a demanding line with strong variety. Hard does not need to be long if the letter mix is naturally tricky.'
              : 'Prefer a naturally difficult line with very high variety and low redundancy, but do not force length for its own sake.',
      cryptogram_guidance:
        tier === 'warmup'
          ? 'Prefer repeated common letters and at least one clue-friendly word; repetition is acceptable when it makes the puzzle gentler.'
          : tier === 'medium'
            ? 'Balance repetition and variety; clue-friendly repetition is fine if the phrase still feels fresh.'
            : tier === 'hard'
              ? 'Prefer high letter variety and less obvious clue structure, but a shorter line can still work if its cryptographic hardness is strong.'
              : 'Push toward maximal letter variety and sparse clue structure while still sounding natural; shorter but brutal lines are welcome.',
    },
  };

  const endpoint = new URL(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  );
  endpoint.searchParams.set('key', params.apiKey);
  
  const instruction =
    `Return JSON array with exactly ${params.batchSize} candidates. ` +
    'Format: [{target_string, author, challenge_type}, ...]. ' +
    'Each candidate must be independent and meet all constraints. ' +
    'Output keys per candidate: target_string, author, challenge_type. ' +
    `challenge_type must be one of: ${challengeTypeList}. ` +
    'challenge_type must equal preferred_challenge_type. ' +
    `Target ${promptProfile.wordCountBounds.min}-${promptProfile.wordCountBounds.max} words, ` +
    `${promptProfile.letterBounds.min}-${promptProfile.letterBounds.max} letters, and ` +
    `usually ${preferredBounds.min}-${preferredBounds.max} total characters. ` +
    `Anything within ${flexibleBounds.min}-${flexibleBounds.max} total characters is allowed if the phrase naturally fits the tier's hardness and clue profile. ` +
    `Use at least ${promptProfile.recommendedMinUniqueWords} unique words and avoid repeating whole words. ` +
    `Target ${promptProfile.uniqueLetterBounds.min}-${promptProfile.uniqueLetterBounds.max} unique letters and ` +
    `hardness ${promptProfile.cryptoHardnessBounds.min.toFixed(2)}-${promptProfile.cryptoHardnessBounds.max.toFixed(2)}. ` +
    'Do not force hard or expert lines to be long just to seem difficult, and do not force warmup or medium lines to be short if repetition keeps them fair. ' +
    'Every word should be short enough for mobile and the phrase must contain at least one repeated letter overall. ' +
    `RULES=${JSON.stringify(promptRules)}`;

  let response: Response;
  try {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        safetySettings: geminiSafetySettingsForMode(params.safetyMode),
        contents: [
          {
            parts: [{ text: instruction }],
          },
        ],
        generationConfig: {
          temperature: temperatureForDifficulty(params.difficulty),
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('[generatePuzzlePhraseBatch] request timed out after 30 seconds');
    }
    throw new Error(
      `[generatePuzzlePhraseBatch] request failed: ${describeRequestError(error)}`
    );
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const bodyPreview = responseText.trim().slice(0, 300);
    throw new Error(
      `[generatePuzzlePhraseBatch] response status=${response.status} body=${bodyPreview || 'empty'}`
    );
  }

  const raw = await response.json();
  const parsed = geminiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('[generatePuzzlePhraseBatch] invalid Gemini response shape');
  }

  const candidate = parsed.data.candidates[0];
  const candidateText = candidate?.content.parts[0]?.text ?? '';
  
  // Enhanced logging for debugging
  console.log('[generatePuzzlePhraseBatch] Raw response preview:', {
    length: candidateText.length,
    preview: candidateText.slice(0, 300),
    hasArrayBrackets: candidateText.includes('[') && candidateText.includes(']'),
    hasObjectBrackets: candidateText.includes('{') && candidateText.includes('}'),
  });
  
  const extracted = extractJson(candidateText);
  if (!extracted) {
    console.error('[generatePuzzlePhraseBatch] Failed to extract JSON', {
      candidateTextLength: candidateText.length,
      candidateTextPreview: candidateText.slice(0, 500),
    });
    throw new Error('[generatePuzzlePhraseBatch] missing JSON payload');
  }

  let payloadArray: unknown;
  try {
    payloadArray = JSON.parse(extracted);
  } catch (parseError) {
    console.error('[generatePuzzlePhraseBatch] JSON parse failed', {
      extractedLength: extracted.length,
      extractedPreview: extracted.slice(0, 500),
      parseError: parseError instanceof Error ? parseError.message : 'unknown',
      rawResponsePreview: candidateText.slice(0, 500),
    });
    throw new Error('[generatePuzzlePhraseBatch] invalid JSON syntax');
  }

  const payloadParsed = batchPayloadSchema.safeParse(payloadArray);
  if (!payloadParsed.success) {
    // Try wrapping in array if Gemini returned a single object instead of an array
    const singleObjectSchema = z.object({
      target_string: z.string().min(3),
      author: z.string().min(1),
      challenge_type: z.string().min(1),
    });
    const singleParsed = singleObjectSchema.safeParse(payloadArray);
    if (singleParsed.success) {
      console.warn('[generatePuzzlePhraseBatch] Gemini returned single object instead of array, wrapping in array');
      payloadArray = [singleParsed.data];
    } else {
      console.error('[generatePuzzlePhraseBatch] Payload schema mismatch', {
        zodError: payloadParsed.error.message,
        payloadPreview: JSON.stringify(payloadArray).slice(0, 300),
      });
      throw new Error('[generatePuzzlePhraseBatch] payload schema mismatch');
    }
  }

  const validCandidates: ChallengeCandidate[] = [];
  const rejectionReasons: Record<string, number> = {};
  const dataToProcess = Array.isArray(payloadArray) ? payloadArray : (payloadParsed.success ? payloadParsed.data : []);

  for (let i = 0; i < dataToProcess.length; i++) {
    const item = dataToProcess[i];
    if (!item) continue;
    
    try {
      const text = sanitizePhrase(item.target_string);
      const author = sanitizeAuthor(item.author || 'UNKNOWN');
      const challengeType = parseChallengeType(item.challenge_type);

      if (!challengeType) {
        const reason = 'invalid_challenge_type';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: invalid challenge_type`
        );
        continue;
      }

      if (!looksLikeAllowedPhrase(text)) {
        const reason = 'disallowed_charset_text';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: disallowed charset in text`
        );
        continue;
      }

      if (!looksLikeAllowedAuthor(author)) {
        const reason = 'disallowed_charset_author';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: disallowed charset in author`
        );
        continue;
      }

      if (author.length > maxPuzzleAuthorLength) {
        const reason = 'author_too_long';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: author too long`
        );
        continue;
      }

      if (containsBannedContent(text)) {
        const reason = 'banned_word_text';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: banned word in text`
        );
        continue;
      }

      if (containsBannedContent(author)) {
        const reason = 'banned_word_author';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: banned word in author`
        );
        continue;
      }

      if (hasWordLongerThan(text, maxPuzzleWordLength)) {
        const reason = 'word_too_long';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: word too long`
        );
        continue;
      }

      if (exceedsPuzzleTotalLength(text, maxPuzzleTotalLength)) {
        const reason = 'total_length_exceeded';
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        console.warn(
          `[generatePuzzlePhraseBatch] candidate ${i + 1} rejected: total length exceeded`
        );
        continue;
      }

      validCandidates.push({ text, author, challengeType });
    } catch (error) {
      const reason = 'parsing_failed';
      rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
      console.warn(
        `[generatePuzzlePhraseBatch] candidate ${i + 1} parsing failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`
      );
      continue;
    }
  }

  // Log batch generation result
  console.log('[generatePuzzlePhraseBatch] Batch generation complete', {
    levelId: params.levelId,
    totalRequested: params.batchSize,
    totalReturned: validCandidates.length,
    totalRejected: params.batchSize - validCandidates.length,
    rejectionReasons,
    successRate: ((validCandidates.length / params.batchSize) * 100).toFixed(1) + '%',
  });

  return {
    candidates: validCandidates,
    totalRequested: params.batchSize,
    totalReturned: validCandidates.length,
  };
};

export const generatePuzzlePhrase = async (params: {
  levelId: string;
  difficulty: number;
  apiKey: string;
  difficultyLabel: string;
  safetyMode: string;
  preferredType: ChallengeType;
  hardnessBoundsByTier?: Partial<HardnessBoundsByTier>;
}): Promise<{
  text: string;
  author: string;
  challengeType: ChallengeType;
}> => {
  if (!params.apiKey) {
    throw new Error('Gemini API key missing for generatePuzzlePhrase');
  }

  try {
    const batchResult = await generatePuzzlePhraseBatch({
      ...params,
      batchSize: 1,
    });
    const candidate = batchResult.candidates[0];
    if (!candidate) {
      throw new Error('[generatePuzzlePhrase] missing candidate in single-item batch');
    }
    return candidate;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    const message = error.message.replace(
      /\[generatePuzzlePhraseBatch\]/g,
      '[generatePuzzlePhrase]'
    );
    if (message.includes('invalid JSON syntax')) {
      console.warn('[generatePuzzlePhrase] invalid JSON syntax');
    }
    throw new Error(message);
  }
};
