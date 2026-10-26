import { describe, expect, it } from 'vitest';
import { GEMINI_MODELS, geminiSuggestTags, thinkingFor } from '../../src/lib/studio-gemini-tags';

const input = { apiKey: 'k', title: 'X', body: 'Body', vocabulary: ['XSS'], current: [] };
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const answer = (text: string, extra: object = {}) => json(200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'thinking…', thought: true }, { text }] } }], ...extra });

function fakeFetch(responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return responses.shift()!;
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe('geminiSuggestTags', () => {
  it('asks the strongest free model first and skips thought parts', async () => {
    const { calls, impl } = fakeFetch([answer('{"tags": ["SSTI", "Jinja2"]}')]);
    await expect(geminiSuggestTags(input, impl)).resolves.toEqual({ tags: ['SSTI', 'Jinja2'], model: GEMINI_MODELS[0] });
    expect(calls[0]!.url).toContain(`/models/${GEMINI_MODELS[0]}:generateContent`);
    expect((calls[0]!.init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].text).toContain('<existing_tags>');
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
  });

  it('asks for a summary before the tags and returns it', async () => {
    const { calls, impl } = fakeFetch([answer('{"summary": "SSTI in Jinja2 via the name field", "tags": ["SSTI", "Jinja2"]}')]);
    await expect(geminiSuggestTags(input, impl)).resolves.toEqual({ tags: ['SSTI', 'Jinja2'], model: GEMINI_MODELS[0], summary: 'SSTI in Jinja2 via the name field' });
    expect(JSON.parse(String(calls[0]!.init.body)).generationConfig.responseSchema.propertyOrdering).toEqual(['summary', 'difficulty', 'tags']);
  });

  it('returns the difficulty on the Dreamhack scale and drops unknown levels', async () => {
    const { impl } = fakeFetch([answer('{"summary": "s", "difficulty": "silver 2", "tags": ["XSS"]}'), answer('{"difficulty": "Hard", "tags": ["XSS"]}')]);
    await expect(geminiSuggestTags(input, impl)).resolves.toMatchObject({ difficulty: 'Silver 2', tags: ['XSS'] });
    expect(await geminiSuggestTags(input, impl)).not.toHaveProperty('difficulty');
  });

  it('keeps thinking short per model family and drops it when a model rejects it', async () => {
    expect(thinkingFor('gemini-2.5-pro')).toEqual({ thinkingBudget: 128 });
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 });
    const { calls, impl } = fakeFetch([json(400, { error: { message: 'Unknown name "thinkingLevel" at generation_config.thinking_config' } }), answer('{"tags": ["XSS"]}')]);
    await expect(geminiSuggestTags(input, impl)).resolves.toEqual({ tags: ['XSS'], model: GEMINI_MODELS[0] });
    expect(JSON.parse(String(calls[1]!.init.body)).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('falls back to the next model when the free quota runs out', async () => {
    const { calls, impl } = fakeFetch([json(429, { error: { message: 'quota' } }), answer('{"tags": ["XSS"]}')]);
    await expect(geminiSuggestTags(input, impl)).resolves.toEqual({ tags: ['XSS'], model: GEMINI_MODELS[1], skipped: [`${GEMINI_MODELS[0]}: hết lượt free`] });
    expect(calls).toHaveLength(2);
  });

  it('stops at once on a bad key', async () => {
    const { calls, impl } = fakeFetch([json(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })]);
    await expect(geminiSuggestTags(input, impl)).rejects.toThrow(/Key Gemini/);
    expect(calls).toHaveLength(1);
  });

  it('reports every model when none answers', async () => {
    const { impl } = fakeFetch(GEMINI_MODELS.map(() => json(503, {})));
    await expect(geminiSuggestTags(input, impl)).rejects.toThrow(/gemini-3\.8-flash: 503.*gemini-2\.5-flash: 503/);
  });
});
