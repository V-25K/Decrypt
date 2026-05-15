import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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

  it('performs API calls with retry on transient failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'models/gemini-2.5-flash',
          }),
          { status: 200 }
        )
      )
      .mockResolvedValue(new Response('upstream error', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generatePuzzlePhrase(baseParams())).rejects.toThrow(
      'response status=500'
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(
      fetchMock.mock.calls.filter(([, request]) => request?.method === 'POST')
    ).toHaveLength(3);
  });

  it('redacts API keys from nested Gemini request errors before logging or rethrowing', async () => {
    const leakedKey = 'AIzaSyAYbAoypG5dlcwy5vJYlXDZjsMxhP21--w';
    const leakedUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${leakedKey}`;
    const fetchError = Object.assign(
      new Error(
        `2 UNKNOWN: grpc invocation failed; Post "${leakedUrl}": http status 503 Service Unavailable`
      ),
      {
        code: 2,
        details: `Post "${leakedUrl}": http status 503 Service Unavailable`,
        cause: new Error(`Post "${leakedUrl}": http status 503 Service Unavailable`),
      }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            name: 'models/gemini-2.5-flash',
          }),
          { status: 200 }
        )
      )
      .mockRejectedValue(fetchError);
    vi.stubGlobal('fetch', fetchMock);

    let thrown: Error | null = null;
    try {
      await generatePuzzlePhrase({
        ...baseParams(),
        apiKey: leakedKey,
      });
    } catch (error) {
      thrown = error as Error;
    }

    expect(thrown).toBeTruthy();
    expect(thrown?.message).toContain('key=[REDACTED]');
    expect(thrown?.message).not.toContain(leakedKey);
    expect(thrown?.message).not.toContain(leakedUrl);
  });

  it('logs invalid JSON syntax with a dedicated message', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
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
    const warnSpy = vi.spyOn(console, 'warn');

    await expect(generatePuzzlePhrase(baseParams())).rejects.toThrow(
      '[generatePuzzlePhrase] invalid JSON syntax'
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
              target_string: 'NEVER SETTLE FOR LESS THAN YOUR BEST TODAY',
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
      text: 'NEVER SETTLE FOR LESS THAN YOUR BEST TODAY',
      author: 'TEST AUTHOR',
      challengeType: 'MOVIE_LINE',
    });
  });

  it('uses a lower temperature for easy difficulty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'SEE THE TREE BY THE SEA',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generatePuzzlePhrase({
      ...baseParams(),
      difficulty: 2,
      difficultyLabel: 'difficulty 2 of 10',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body ? JSON.parse(String(request.body)) : null;
    expect(body?.generationConfig?.temperature).toBe(0.3);
  });

  it('uses a higher temperature for expert difficulty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'BOLD THINKERS NAVIGATE UNCERTAIN WORLDS WITH GRIT',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generatePuzzlePhrase({
      ...baseParams(),
      difficulty: 9,
      difficultyLabel: 'difficulty 9 of 10',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body ? JSON.parse(String(request.body)) : null;
    expect(body?.generationConfig?.temperature).toBe(0.65);
  });

  it('uses flexible prompt guidance instead of forcing the old hard length bands', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'CRYPTIC JAZZ PHANTOMS VEX BRIGHT MINDS AT MIDNIGHT',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generatePuzzlePhrase({
      ...baseParams(),
      difficulty: 8,
      difficultyLabel: 'difficulty 8 of 10',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body ? JSON.parse(String(request.body)) : null;
    const instruction = body?.contents?.[0]?.parts?.[0]?.text ?? '';

    expect(instruction).toContain('usually 28-48 total characters');
    expect(instruction).toContain('Anything within 20-');
    expect(instruction).toContain('Do not force hard or expert lines to be long');
    expect(instruction).toContain('"length_policy":"soft_recommendation_not_hard_gate"');
  });

  it('passes Gemini safety settings derived from the requested safety mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'NEVER SETTLE FOR LESS THAN YOUR BEST TODAY',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generatePuzzlePhrase(baseParams());

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body ? JSON.parse(String(request.body)) : null;
    expect(body?.safetySettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        }),
        expect.objectContaining({
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        }),
      ])
    );
  });

  it('normalizes object-shaped safety modes before building safety settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'NEVER SETTLE FOR LESS THAN YOUR BEST TODAY',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await generatePuzzlePhrase({
      ...baseParams(),
      safetyMode: { value: 'strict' } as unknown as string,
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body ? JSON.parse(String(request.body)) : null;
    expect(body?.safetySettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_LOW_AND_ABOVE',
        }),
      ])
    );
  });

  it('rejects candidates containing banned exact words', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'NEVER KILL THE VIBE TONIGHT',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generatePuzzlePhrase(baseParams())).rejects.toThrow(
      'missing candidate in single-item batch'
    );
  });

  it('rejects candidates containing banned substrings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          geminiResponseWithText(
            JSON.stringify({
              target_string: 'BRIGHT CUNTFISH COMETS GLOW',
              author: 'TEST AUTHOR',
              challenge_type: 'MOVIE_LINE',
            })
          )
        ),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(generatePuzzlePhrase(baseParams())).rejects.toThrow(
      'missing candidate in single-item batch'
    );
  });
});
