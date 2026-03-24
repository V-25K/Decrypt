import { afterEach, describe, expect, it, vi } from 'vitest';
import { generatePuzzlePhrase } from './ai';

type GeneratePuzzlePhraseParams = Parameters<typeof generatePuzzlePhrase>[0];

const baseParams = (): GeneratePuzzlePhraseParams => ({
  levelId: 'lvl_0042',
  difficulty: 5,
  apiKey: 'test-key',
  difficultyLabel: 'difficulty 5 of 10',
  safetyMode: 'strict',
  preferredType: 'MOVIE_LINE',
});

const geminiResponseWithText = (text: string) => ({
  candidates: [
    {
      content: {
        parts: [{ text }],
      },
    },
  ],
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generatePuzzlePhrase', () => {
  it('throws when API key is missing', async () => {
    await expect(
      generatePuzzlePhrase({
        ...baseParams(),
        apiKey: '',
      })
    ).rejects.toThrow('Gemini API key missing');
  });

  it('performs one API call per invocation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('upstream error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generatePuzzlePhrase(baseParams())).rejects.toThrow(
      'response status=500'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logs invalid JSON syntax with a dedicated message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            '{"target_string":"THE QUICK BROWN FOX JUMPS OVER LAZY DOGS","author":"AUTHOR",}'
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(generatePuzzlePhrase(baseParams())).rejects.toThrow(
      'invalid JSON syntax'
    );
    expect(warnSpy).toHaveBeenCalledWith('[generatePuzzlePhrase] invalid JSON syntax');
  });

  it('rejects payloads missing challenge_type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'THE QUICK BROWN FOX JUMPS OVER LAZY DOGS',
              author: 'AUTHOR',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generatePuzzlePhrase(baseParams())).rejects.toThrow(
      'payload schema mismatch'
    );
  });

  it('accepts valid payloads that satisfy all constraints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'THE QUICK BROWN FOX JUMPS OVER LAZY DOGS',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const phrase = await generatePuzzlePhrase(baseParams());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(phrase).toEqual({
      text: 'THE QUICK BROWN FOX JUMPS OVER LAZY DOGS',
      author: 'TEST AUTHOR',
      challengeType: 'MOVIE_LINE',
    });
  });
});
