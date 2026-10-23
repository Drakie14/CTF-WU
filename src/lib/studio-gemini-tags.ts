import { TAG_SYSTEM, parseTagReply, tagPromptData, type TagPromptInput } from './tag-prompt';

/**
 * Model có free tier của Gemini API, mạnh nhất trước (theo bảng giá ngày 22/10/2026:
 * 3.8 Flash là model free mạnh nhất; Pro mới như 3.1 Pro / Gemini 4 không có free tier).
 * Model đầu hết lượt (429), quá tải (5xx) hoặc bị gỡ (404) thì thử model kế tiếp.
 */
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-3.6-flash', 'gemini-2.5-flash'] as const;

export interface GeminiTagResult {
  tags: string[];
  model: string;
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  error?: { message?: string; status?: string };
}

const RETRY_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

/** Hỏi Gemini bộ tag cho bài. Key sai hoặc mọi model đều lỗi thì ném lỗi để Studio giữ gợi ý offline. */
export async function geminiSuggestTags(input: TagPromptInput & { apiKey: string }, fetchImpl: typeof fetch = fetch): Promise<GeminiTagResult> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: TAG_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: tagPromptData(input) }] }],
    generationConfig: {
      // Token suy nghĩ cũng tính vào giới hạn này, nên để rộng tay.
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
        required: ['tags'],
      },
    },
  });
  const failures: string[] = [];
  for (const model of GEMINI_MODELS) {
    let response: Response;
    try {
      response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
        body,
      });
    } catch (error) {
      throw new Error(`Không kết nối được Gemini (${error instanceof Error ? error.message : String(error)}).`);
    }
    const data = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) {
      const message = data.error?.message ?? response.statusText;
      if (/api key/i.test(message) || response.status === 401 || response.status === 403) {
        throw new Error(`Key Gemini không dùng được: ${message}`);
      }
      if (!RETRY_STATUS.has(response.status)) throw new Error(`Gemini ${response.status}: ${message}`);
      failures.push(`${model}: ${response.status === 429 ? 'hết lượt free' : `${response.status}`}`);
      continue;
    }
    if (data.promptFeedback?.blockReason) {
      failures.push(`${model}: bị chặn (${data.promptFeedback.blockReason})`);
      continue;
    }
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? '').join('');
    const tags = parseTagReply(text);
    if (tags.length) return { tags, model };
    failures.push(`${model}: không trả tag${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}`);
  }
  throw new Error(`Gemini không trả được tag. ${failures.join('; ')}.`);
}
