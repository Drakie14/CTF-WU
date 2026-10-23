import Anthropic from '@anthropic-ai/sdk';
import { TAG_SYSTEM, tagPromptData, type TagPromptInput } from './tag-prompt';

export interface AiTagInput extends TagPromptInput {
  apiKey: string;
}

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
    system: TAG_SYSTEM,
    messages: [{
      role: 'user',
      content: tagPromptData(input),
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude từ chối gợi ý tag cho bài này.');
  if (response.stop_reason === 'max_tokens') throw new Error('Claude trả lời bị cắt giữa chừng.');
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const parsed = JSON.parse(text) as { tags?: unknown };
  return Array.isArray(parsed.tags) ? parsed.tags.filter((tag): tag is string => typeof tag === 'string') : [];
}
