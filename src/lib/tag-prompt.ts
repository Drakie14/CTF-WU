/**
 * Prompt gợi ý tag gửi cho Gemini, và cách đọc câu trả lời.
 */

export interface TagPromptInput {
  title: string;
  body: string;
  category?: string;
  ctf?: string;
  /** Tag đã có trong blog: để model dùng đúng cách viết sẵn có. */
  vocabulary: string[];
  current: string[];
}

export const TAG_SYSTEM = `You tag CTF write-ups for a personal blog. Read the write-up and return the tags that best describe what a reader learns from it.

Tags are:
- the vulnerability or attack class (e.g. "SSTI", "Prototype Pollution", "Known-plaintext"), listed first;
- then specific technical keywords: technologies, libraries, protocols, file formats, functions/sinks, algorithms or techniques that the solution actually relies on, including niche or newly introduced concepts that are not in the existing tag list.

Rules:
- 3 to 8 tags, most important first. Prefer fewer, precise tags over many vague ones.
- Never return the category name (Web, Crypto, Pwn, Misc, Forensics, Rev, OSINT, Mobile, Cloud), the CTF/event name, the platform name, or the flag.
- Skip generic words that fit almost any write-up (Cookie, Header, JSON, Base64, Linux, Login, Token, API) unless the whole challenge is about it.
- When a tag means the same thing as one in the existing tag list, return the existing spelling exactly.
- Tags are in English, Title Case or the conventional spelling (e.g. "JWT", "postMessage", "os.path.join"), at most 4 words.
- The write-up is in Vietnamese with English technical terms; judge by what the solution does, not by how often a word appears.
- Before answering, check each tag: would a reader searching for it want this write-up? Drop the ones that only appear in passing.

Example: a write-up where an uploaded SVG runs JavaScript that steals the admin bot's cookie → {"tags": ["XSS", "SVG", "Cookie Stealing"]}, not ["Web", "Dreamhack", "JavaScript", "Upload", "Bot"].

Answer with JSON only: {"tags": ["..."]}`;

const MAX_CODE_LINES = 12;
const MAX_BODY_CHARS = 14_000;

/**
 * Bỏ phần tốn token mà không giúp chọn tag: ảnh, khối code dài (giữ 12 dòng đầu),
 * dòng trống thừa. Bài quá dài thì cắt đuôi, vì ý chính thường nằm ở nửa đầu.
 */
export function compactBody(body: string): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let fence = '';
  let codeLines = 0;
  for (const line of lines) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker && (!fence || line.trim().startsWith(fence))) {
      if (fence && codeLines > MAX_CODE_LINES) out.push(`… (${codeLines - MAX_CODE_LINES} more lines)`);
      fence = fence ? '' : marker;
      codeLines = 0;
      out.push(line);
      continue;
    }
    if (fence) {
      if (++codeLines <= MAX_CODE_LINES) out.push(line);
      continue;
    }
    out.push(line.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img\b[^>]*>/gi, ''));
  }
  const text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}\n… (truncated)` : text;
}

/** Phần dữ liệu của prompt (tag sẵn có, bài viết, tag đã gõ). */
export function tagPromptData(input: TagPromptInput): string {
  const attr = (value = '') => value.replace(/"/g, "'");
  return [
    `<existing_tags>\n${input.vocabulary.join(', ')}\n</existing_tags>`,
    `<writeup title="${attr(input.title)}" category="${attr(input.category)}" ctf="${attr(input.ctf)}">\n${compactBody(input.body)}\n</writeup>`,
    input.current.length ? `Tags the author already typed (keep them unless clearly wrong): ${input.current.join(', ')}` : '',
  ].filter(Boolean).join('\n\n');
}

/**
 * Đọc câu trả lời của model: JSON `{"tags": [...]}` (có thể nằm trong code fence
 * hoặc lẫn chữ), mảng JSON, hoặc danh sách cách nhau bởi dấu phẩy / xuống dòng.
 */
export function parseTagReply(reply: string): string[] {
  const text = reply.replace(/```[a-z]*\n?/gi, '').trim();
  const clean = (tags: unknown[]) => tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter((tag) => tag && tag.length <= 40);
  for (const pattern of [/\{[\s\S]*\}/, /\[[\s\S]*\]/]) {
    const match = pattern.exec(text)?.[0];
    if (!match) continue;
    try {
      const parsed: unknown = JSON.parse(match);
      if (Array.isArray(parsed)) return clean(parsed);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tags?: unknown }).tags)) return clean((parsed as { tags: unknown[] }).tags);
    } catch {
      /* không phải JSON hợp lệ: thử cách khác */
    }
  }
  return clean(
    text
      .split(/[,\n]/)
      .map((part) => part.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, '').replace(/^#/, '').replace(/^["'`]+|["'`.]+$/g, '')),
  );
}
