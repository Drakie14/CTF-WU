import Anthropic from '@anthropic-ai/sdk';

export interface AiTagInput {
  apiKey: string;
  title: string;
  body: string;
  category?: string;
  ctf?: string;
  /** Tag đã có trong blog: để Claude dùng đúng cách viết sẵn có. */
  vocabulary: string[];
  current: string[];
}

const SYSTEM = `You tag CTF write-ups for a personal blog. Read the write-up and return the tags that best describe what a reader learns from it.

Tags are:
- the vulnerability or attack class (e.g. "SSTI", "Prototype Pollution", "Known-plaintext"), listed first;
- then specific technical keywords: technologies, libraries, protocols, file formats, functions/sinks, algorithms or techniques that the solution actually relies on, including niche or newly introduced concepts that are not in the existing tag list.

Rules:
- 3 to 8 tags, most important first. Prefer fewer, precise tags over many vague ones.
- Never return the category name (Web, Crypto, Pwn, Misc, Forensics, Rev, OSINT, Mobile, Cloud), the CTF/event name, the platform name, or the flag.
- Skip generic words that fit almost any write-up (Cookie, Header, JSON, Base64, Linux, Login, Token, API) unless the whole challenge is about it.
- When a tag means the same thing as one in the existing tag list, return the existing spelling exactly.
- Tags are in English, Title Case or the conventional spelling (e.g. "JWT", "postMessage", "os.path.join"), at most 4 words.`;

/** Hỏi Claude bộ tag cho bài. Lỗi mạng/key sai/refusal thì ném lỗi để Studio giữ kết quả offline. */
export async function aiSuggestTags(input: AiTagInput): Promise<string[]> {
  const client = new Anthropic({ apiKey: input.apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { tags: { type: 'array', items: { type: 'string' } } },
          required: ['tags'],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        `<existing_tags>\n${input.vocabulary.join(', ')}\n</existing_tags>`,
        `<writeup title="${input.title.replace(/"/g, "'")}" category="${input.category ?? ''}" ctf="${(input.ctf ?? '').replace(/"/g, "'")}">\n${input.body}\n</writeup>`,
        input.current.length ? `Tags the author already typed (keep them unless clearly wrong): ${input.current.join(', ')}` : '',
      ].filter(Boolean).join('\n\n'),
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude từ chối gợi ý tag cho bài này.');
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const parsed = JSON.parse(text) as { tags?: unknown };
  return Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === 'string') : [];
}
