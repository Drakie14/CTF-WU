/**
 * Prompt gợi ý tag và đánh giá độ khó gửi cho Gemini, và cách đọc câu trả lời.
 */

import { toDifficulty, type Difficulty } from './content/constants';

export interface TagPromptInput {
  title: string;
  body: string;
  category?: string;
  ctf?: string;
  /** Độ khó tác giả đã chọn (nếu có). */
  difficulty?: string;
  /** Tag đã có trong blog: để model dùng đúng cách viết sẵn có. Có `count` thì tag hay dùng được ưu tiên. */
  vocabulary: Array<string | { name: string; count: number }>;
  current: string[];
  /** Bài khác đã gắn tag (few-shot): để model bắt đúng độ chi tiết và cách đặt tag của tác giả. */
  examples?: TagExample[];
}

export interface TagExample {
  title: string;
  category?: string;
  difficulty?: string;
  tags: string[];
}

export const TAG_SYSTEM = `You tag CTF write-ups for a personal blog and rate how hard each challenge is. Read the write-up, rate its difficulty and return the tags that best describe what a reader learns from it.

Work in three steps, all in the JSON answer:
1. "summary": one English sentence describing the solution: the bug, where it lives, and the trick that turns it into the flag (e.g. "Reflected XSS in a search parameter, escaping a JS string with </script> and stealing the bot's cookie via fetch"). Base it on the Solution part, not on guesses from the title.
2. "difficulty": rate the challenge from that summary and the solution steps.
3. "tags": derive them from that summary.

Difficulty uses the Dreamhack scale, easiest to hardest: Sprout, Bronze 4, Bronze 3, Bronze 2, Bronze 1, Silver 4 … Silver 1, Gold 4 … Gold 1, Platinum 4 … Platinum 1, Diamond 4 … Diamond 1, Master 4 … Master 1. Inside a tier, 4 is the easiest and 1 the hardest.
- Sprout: one obvious step a beginner finds at once (read the source, decode Base64, view a hidden field).
- Bronze: one well-known bug used in its textbook form; Bronze 4 needs no bypass, Bronze 1 needs a small twist or a short script.
- Silver: the known bug sits behind a filter or needs a bypass, or two steps are chained; usually a custom script or payload crafting.
- Gold: several non-obvious steps chained, a niche library or parser quirk, real reversing or math, or an exploit that must be tuned.
- Platinum and above: novel research-level tricks, long exploit chains or heavy reversing; rare on this blog.
- Judge by what the solution actually needed (number of steps, how obscure the trick is, how much code, reversing or math), not by how long the write-up is.
- When the challenge statement shows a level, solve count or point value, treat it as a strong hint.
- Calibrate against the author's rated examples (the level in brackets): match how they rate similar techniques. Most write-ups here are Bronze or Silver; go Gold or higher only when the solution clearly chains several non-obvious steps.
- If the author already chose a difficulty, keep it unless the solution clearly contradicts it.

Tags are:
- the vulnerability or attack class (e.g. "SSTI", "Prototype Pollution", "Known-plaintext"), listed first;
- then specific technical keywords: technologies, libraries, protocols, file formats, functions/sinks, algorithms or techniques that the solution actually relies on, including niche or newly introduced concepts that are not in the existing tag list.

Rules:
- 3 to 8 tags, most important first. Prefer fewer, precise tags over many vague ones.
- Never return the category name (Web, Crypto, Pwn, Misc, Forensics, Rev, OSINT, Mobile, Cloud), the CTF/event name, the platform name, or the flag.
- Skip generic words that fit almost any write-up (Cookie, Header, JSON, Base64, Linux, Login, Token, API) unless the whole challenge is about it.
- When a tag means the same thing as one in the existing tag list, return the existing spelling exactly (e.g. return "SQLi" if the list has "SQLi", not "SQL Injection"). The number after each existing tag is how many write-ups use it; prefer established tags when they fit equally well.
- Match the granularity of the author's tagged examples: one tag for the attack class, then the concrete mechanism (the sink, the filter that was bypassed, the library or primitive abused). Add a bypass tag (e.g. "Filter Bypass", "WAF Bypass") only when getting around a defense is a real step of the solution.
- A word that only appears in the challenge statement, a failed attempt or an aside is not a tag; the tags must describe what actually led to the flag.
- Tags are in English, Title Case or the conventional spelling (e.g. "JWT", "postMessage", "os.path.join"), at most 4 words.
- The write-up is in Vietnamese with English technical terms; judge by what the solution does, not by how often a word appears.
- Before answering, check each tag: would a reader searching for it want this write-up? Drop the ones that only appear in passing.

Example: a write-up where an uploaded SVG runs JavaScript that steals the admin bot's cookie → {"difficulty": "Bronze 2", "tags": ["XSS", "SVG", "Cookie Stealing"]}, not ["Web", "Dreamhack", "JavaScript", "Upload", "Bot"].

Answer with JSON only: {"summary": "...", "difficulty": "Bronze 3", "tags": ["..."]}`;

const MAX_CODE_LINES = 12;
const MAX_BODY_CHARS = 14_000;
/** Bài quá dài: giữ phần đầu (đề bài, phân tích) và phần cuối (payload, flag). */
const TAIL_CHARS = 5_000;
const MAX_EXAMPLES = 40;

/**
 * Bỏ phần tốn token mà không giúp chọn tag: ảnh, khối code dài (giữ 12 dòng đầu),
 * dòng trống thừa. Bài quá dài thì cắt khúc giữa, vì đề bài ở đầu còn payload/flag ở cuối.
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
  if (text.length <= MAX_BODY_CHARS) return text;
  return `${text.slice(0, MAX_BODY_CHARS - TAIL_CHARS)}\n… (middle truncated)\n${text.slice(-TAIL_CHARS)}`;
}

/** Phần dữ liệu của prompt (tag sẵn có, bài viết, tag đã gõ). */
export function tagPromptData(input: TagPromptInput): string {
  const attr = (value = '') => value.replace(/"/g, "'");
  const vocabulary = input.vocabulary
    .map((term) => (typeof term === 'string' ? { name: term, count: 0 } : term))
    .sort((a, b) => b.count - a.count)
    .map(({ name, count }) => (count ? `${name} (${count})` : name));
  const own = input.title.trim().toLowerCase();
  const examples = (input.examples ?? [])
    .filter((example) => example.tags.length && example.title.trim().toLowerCase() !== own)
    .slice(0, MAX_EXAMPLES)
    .map((example) => {
      const meta = [example.category, example.difficulty].filter(Boolean).join(' · ');
      return `- ${example.title}${meta ? ` [${meta}]` : ''}: ${example.tags.join(', ')}`;
    });
  return [
    `<existing_tags>\n${vocabulary.join(', ')}\n</existing_tags>`,
    examples.length ? `<tagged_examples>\nHow the author tagged and rated other write-ups on this blog:\n${examples.join('\n')}\n</tagged_examples>` : '',
    `<writeup title="${attr(input.title)}" category="${attr(input.category)}" ctf="${attr(input.ctf)}">\n${compactBody(input.body)}\n</writeup>`,
    input.current.length ? `Tags the author already typed (keep them unless clearly wrong): ${input.current.join(', ')}` : '',
    input.difficulty ? `Difficulty the author already chose: ${input.difficulty}` : '',
  ].filter(Boolean).join('\n\n');
}

/** Độ khó model chấm, chuẩn hoá về thang Dreamhack; sai thang thì `undefined`. */
export function parseTagDifficulty(reply: string): Difficulty | undefined {
  const match = /\{[\s\S]*\}/.exec(reply.replace(/```[a-z]*\n?/gi, ''))?.[0];
  if (!match) return undefined;
  try {
    const value = (JSON.parse(match) as { difficulty?: unknown }).difficulty;
    return typeof value === 'string' ? toDifficulty(value) : undefined;
  } catch {
    return undefined;
  }
}

/** Câu tóm tắt lời giải model viết trước khi chọn tag (rỗng nếu không có). */
export function parseTagSummary(reply: string): string {
  const match = /\{[\s\S]*\}/.exec(reply.replace(/```[a-z]*\n?/gi, ''))?.[0];
  if (!match) return '';
  try {
    const summary = (JSON.parse(match) as { summary?: unknown }).summary;
    return typeof summary === 'string' ? summary.trim() : '';
  } catch {
    return '';
  }
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
