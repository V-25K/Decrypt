import { z } from 'zod';
import {
  type ChallengeType,
  challengeTypeSchema,
} from '../../shared/game.ts';
import {
  difficultyToTier,
  exceedsPuzzleTotalLength,
  hasWordLongerThan,
  maxPuzzleTotalLength,
  looksLikeAllowedPhrase,
  maxPuzzleWordLength,
  quotePromptProfileForDifficulty,
  sanitizePhrase,
  validateQuoteForPhase1,
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

const puzzlePayloadSchema = z.object({
  target_string: z.string().min(3),
  author: z.string().min(1),
  challenge_type: z.string().min(1),
});

const bannedWords = ['FUCK', 'SHIT', 'BITCH', 'SLUR', 'HATE', 'KILL'];
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

const containsBannedWord = (input: string): boolean => {
  const upper = input.toUpperCase();
  return bannedWords.some((word) => upper.includes(word));
};

const extractJson = (input: string): string | null => {
  const start = input.indexOf('{');
  const end = input.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    return null;
  }
  return input.slice(start, end + 1);
};

const parseChallengeType = (raw: string | undefined): ChallengeType | null => {
  const normalized = (raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z _-]/g, '')
    .replace(/[\s-]+/g, '_')
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

const difficultyLengthBounds = (difficulty: number): { min: number; max: number } => {
  const tier = difficultyToTier(difficulty);
  if (tier === 'easy') {
    return { min: 15, max: 35 };
  }
  if (tier === 'medium') {
    return { min: 36, max: maxPuzzleTotalLength };
  }
  return { min: 46, max: maxPuzzleTotalLength };
};

export const generatePuzzlePhrase = async (params: {
  levelId: string;
  difficulty: number;
  apiKey: string;
  difficultyLabel: string;
  safetyMode: string;
  preferredType: ChallengeType;
}): Promise<{
  text: string;
  author: string;
  challengeType: ChallengeType;
}> => {
  if (!params.apiKey) {
    throw new Error('Gemini API key missing for generatePuzzlePhrase');
  }

  const bounds = difficultyLengthBounds(params.difficulty);
  const tier = difficultyToTier(params.difficulty);
  const promptProfile = quotePromptProfileForDifficulty(params.difficulty);
  const challengeTypeList = aiChallengeTypePool.join(', ');

  const promptRules = {
    output_keys: ['target_string', 'author', 'challenge_type'],
    allowed_challenge_types: aiChallengeTypePool,
    difficulty: {
      label: params.difficultyLabel,
      value: params.difficulty,
      tier,
      bounds_by_tier: {
        easy: [15, 35],
        medium: [36, maxPuzzleTotalLength],
        hard: [46, maxPuzzleTotalLength],
      },
      active_bounds: [bounds.min, bounds.max],
    },
    constraints: {
      uppercase: true,
      family_safe: true,
      real_verifiable_phrase_only: true,
      allowed_charset: "A-Z0-9 ,.'!?;:()-",
      banned_words: bannedWords,
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
      repeated_whole_words: 'avoid',
      requires_repeated_letter: true,
    },
    hints: {
      preferred_challenge_type: params.preferredType,
      preferred_type_mode: 'strict_required',
      safety_mode: params.safetyMode,
      level_id: params.levelId,
      style_guidance:
        tier === 'easy'
          ? 'Prefer a short, punchy saying or quote fragment. Avoid long clauses.'
          : tier === 'medium'
            ? 'Prefer a compact full thought with strong word variety.'
            : 'Prefer a dense but still natural line with high word variety.',
    },
  };
  const endpoint = new URL(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  );
  endpoint.searchParams.set('key', params.apiKey);
  const instruction =
    'Return JSON only. No markdown or prose. ' +
    'Output keys: target_string, author, challenge_type. ' +
    `challenge_type must be one of: ${challengeTypeList}. ` +
    'challenge_type must equal preferred_challenge_type. ' +
    `Target ${promptProfile.wordCountBounds.min}-${promptProfile.wordCountBounds.max} words, ` +
    `${promptProfile.letterBounds.min}-${promptProfile.letterBounds.max} letters, and ` +
    `${bounds.min}-${bounds.max} total characters. ` +
    `Use at least ${promptProfile.recommendedMinUniqueWords} unique words and avoid repeating whole words. ` +
    'Every word should be short enough for mobile and the phrase must contain at least one repeated letter overall. ' +
    `RULES=${JSON.stringify(promptRules)}`;

  let response: Response;
  try {
    response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: instruction }],
          },
        ],
        generationConfig: {
          temperature: 0.45,
          responseMimeType: 'application/json',
        },
      }),
    });
  } catch (error) {
    throw new Error(
      `[generatePuzzlePhrase] request failed: ${describeRequestError(error)}`
    );
  }

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    const bodyPreview = responseText.trim().slice(0, 300);
    throw new Error(
      `[generatePuzzlePhrase] response status=${response.status} body=${bodyPreview || 'empty'}`
    );
  }

  const raw = await response.json();
  const parsed = geminiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('[generatePuzzlePhrase] invalid Gemini response shape');
  }

  const candidate = parsed.data.candidates[0];
  const candidateText = candidate?.content.parts[0]?.text ?? '';
  const extracted = extractJson(candidateText);
  if (!extracted) {
    throw new Error('[generatePuzzlePhrase] missing JSON payload');
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(extracted);
  } catch {
    console.warn('[generatePuzzlePhrase] invalid JSON syntax');
    throw new Error('[generatePuzzlePhrase] invalid JSON syntax');
  }

  const payload = puzzlePayloadSchema.safeParse(payloadRaw);
  if (!payload.success) {
    throw new Error('[generatePuzzlePhrase] payload schema mismatch');
  }

  const text = sanitizePhrase(payload.data.target_string);
  const author = sanitizePhrase(payload.data.author || 'UNKNOWN');
  const challengeType = parseChallengeType(payload.data.challenge_type);
  if (!challengeType) {
    throw new Error('[generatePuzzlePhrase] challenge_type invalid');
  }

  if (!looksLikeAllowedPhrase(text)) {
    throw new Error('[generatePuzzlePhrase] rejected text by allowed charset');
  }
  if (containsBannedWord(text)) {
    throw new Error('[generatePuzzlePhrase] rejected banned word');
  }
  if (hasWordLongerThan(text, maxPuzzleWordLength)) {
    throw new Error('[generatePuzzlePhrase] rejected oversized token');
  }
  if (exceedsPuzzleTotalLength(text, maxPuzzleTotalLength)) {
    throw new Error('[generatePuzzlePhrase] rejected total length');
  }

  const phase1Validation = validateQuoteForPhase1(text, params.difficulty);
  if (!phase1Validation.valid) {
    throw new Error(
      `[generatePuzzlePhrase] rejected phase1 rules: ${phase1Validation.reasons.join('; ')}`
    );
  }

  return {
    text,
    author: author || 'UNKNOWN',
    challengeType,
  };
};
