import { TAG_SYSTEM, parseTagReply, parseTagSummary, tagPromptData, type TagPromptInput } from './tag-prompt';

/**
 * Model có free tier của Gemini API, mạnh nhất trước (theo bảng giá ngày 22/10/2026:
 * 3.8 Flash là model free mạnh nhất; Pro mới như 3.1 Pro / Gemini 4 không có free tier).
 * Model đầu hết lượt (429), quá tải (5xx) hoặc bị gỡ (404) thì thử model kế tiếp.
 */
export const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-3.6-flash', 'gemini-2.5-flash'] as const;

export interface GeminiTagResult {
  tags: string[];
  model: string;
  /** Model hiểu lời giải thế nào: hiện cho tác giả để soát tag có đúng ý không. */
  summary?: string;
  /** Model mạnh hơn bị bỏ qua và lý do (hết lượt, quá lâu…), để tác giả biết vì sao tag đến từ model yếu hơn. */
  skipped?: string[];
}

interface GeminiResponse {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
  error?: { message?: string; status?: string };
}

const RETRY_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

/** Hỏi Gemini bộ tag cho bài. Key sai hoặc mọi model đều lỗi thì ném lỗi để Studio giữ gợi ý offline. */
/**
 * Chọn tag là việc nhẹ nên cho model suy nghĩ ít: đây là chỗ tốn thời gian nhất.
 * Gemini 3.x dùng `thinkingLevel`, 2.5 dùng `thinkingBudget` (2.5 Pro tối thiểu 128).
 */
export function thinkingFor(model: string): Record<string, unknown> {
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: 'low' };
  return { thinkingBudget: /pro/.test(model) ? 128 : 0 };
}

/**
 * Mỗi model chờ tối đa chừng này rồi mới chuyển model kế tiếp. Gợi ý chạy nền nên chờ lâu cũng không chặn ai;
 * cắt sớm thì model mạnh nhất (hay chậm lúc đông) bị bỏ qua và tag rơi về model yếu hơn.
 */
const MODEL_TIMEOUT_MS = 120_000;

export async function geminiSuggestTags(input: TagPromptInput & { apiKey: string }, fetchImpl: typeof fetch = fetch): Promise<GeminiTagResult> {
  const prompt = tagPromptData(input);
  const requestBody = (model: string, thinking: boolean) => JSON.stringify({
    systemInstruction: { parts: [{ text: TAG_SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      // Token suy nghĩ cũng tính vào giới hạn này.
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        // summary đứng trước để model tóm lời giải rồi mới chọn tag.
        properties: { summary: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
        propertyOrdering: ['summary', 'tags'],
        required: ['summary', 'tags'],
      },
      ...(thinking ? { thinkingConfig: thinkingFor(model) } : {}),
    },
  });
  const failures: string[] = [];
  for (const model of GEMINI_MODELS) {
    let response: Response;
    let data: GeminiResponse;
    let thinking = true;
    for (;;) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
      try {
        response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': input.apiKey },
          body: requestBody(model, thinking),
          signal: controller.signal,
        });
        data = (await response.json().catch(() => ({}))) as GeminiResponse;
      } catch (error) {
        if (controller.signal.aborted) { response = new Response(null, { status: 408 }); data = {}; break; }
        throw new Error(`Không kết nối được Gemini (${error instanceof Error ? error.message : String(error)}).`);
      } finally {
        clearTimeout(timer);
      }
      // Model không nhận tuỳ chọn suy nghĩ này: hỏi lại không kèm nó.
      if (thinking && response.status === 400 && /thinking/i.test(data.error?.message ?? '')) { thinking = false; continue; }
      break;
    }
    if (!response.ok) {
      const message = data.error?.message ?? response.statusText;
      if (/api key/i.test(message) || response.status === 401 || response.status === 403) {
        throw new Error(`Key Gemini không dùng được: ${message}`);
      }
      if (!RETRY_STATUS.has(response.status)) throw new Error(`Gemini ${response.status}: ${message}`);
      failures.push(`${model}: ${response.status === 429 ? 'hết lượt free' : response.status === 408 ? 'quá lâu' : `${response.status}`}`);
      continue;
    }
    if (data.promptFeedback?.blockReason) {
      failures.push(`${model}: bị chặn (${data.promptFeedback.blockReason})`);
      continue;
    }
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts ?? []).filter((part) => !part.thought).map((part) => part.text ?? '').join('');
    const tags = parseTagReply(text);
    const summary = parseTagSummary(text);
    if (tags.length) return { tags, model, ...(summary ? { summary } : {}), ...(failures.length ? { skipped: failures } : {}) };
    failures.push(`${model}: không trả tag${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}`);
  }
  throw new Error(`Gemini không trả được tag. ${failures.join('; ')}.`);
}
