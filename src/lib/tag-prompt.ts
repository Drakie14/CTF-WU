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
  ctf?: string;
  difficulty?: string;
  /** Bài Dreamhack có link challenge: độ khó là tier chính thức, làm mốc chấm chắc nhất. */
  official?: boolean;
  tags: string[];
}

export const TAG_SYSTEM = `You tag CTF write-ups for a personal blog and rate how hard each challenge is.

Fill the JSON answer in this order:
1. "summary": one English sentence describing the solution: the bug, where it lives, and the trick that turns it into the flag (e.g. "Reflected XSS in a search parameter, escaping a JS string with </script> and stealing the bot's cookie via fetch"). Base it on the Solution part, not on guesses from the title.
2. "difficultyReason": at most 20 words: name the 1-2 closest rated examples and say whether this challenge is easier, the same or harder, and why.
3. "difficulty": the level on the Dreamhack scale.
4. "tags": derived from the summary.

# Difficulty
Scale, easiest to hardest: Sprout; Bronze 4, 3, 2, 1; Silver 4 … 1; Gold 4 … 1; Platinum 4 … 1; Diamond 4 … 1; Master 4 … 1. Inside a tier, 4 is the easiest and 1 the hardest.

Rate by comparison with the rated examples, not by feel:
- Examples marked "Dreamhack official" carry the real Dreamhack level: they define what each level means. The other examples are the author's own ratings of CTF challenges on the same scale: they show how the author applies it.
- Find the 1-2 examples whose solution is closest to this one (same bug class, similar mechanism; official examples first). Start from their level, then move up or down by comparing:
  - how many steps are chained before the flag;
  - whether a filter, WAF or sanitizer had to be bypassed, and how obscure the bypass is;
  - whether the source code was given or the target was a black box;
  - whether a custom script, brute force or a tuned exploit was needed;
  - whether it relies on niche knowledge (a CVE, a parser or library quirk, real reversing or math).
  One extra hurdle is about one level (Bronze 3 → Bronze 2); a whole extra stage or a niche trick is about one tier (Bronze → Silver).
- A solve count, point value or level shown in the challenge statement is a strong hint.
- Ignore the length of the write-up and the number of failed attempts.
- Rough reference when no example is close: Sprout = one obvious step; Bronze = one well-known bug in its textbook form; Silver = a known bug behind a filter, or two chained steps; Gold = several non-obvious steps or a niche quirk; Platinum and above = research-level, rare on this blog.

# Tags
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
- Write-ups often test and rule out wrong paths first (sections like "Loại các hướng sai", "hướng sai", "thử … nhưng không được", "không phải …"). An attack class that was tried and ruled out (e.g. "{{7*7}} is not evaluated -> not SSTI") must never be a tag or appear in the summary as part of the solution, even if it is discussed at length.
- Tags are in English, Title Case or the conventional spelling (e.g. "JWT", "postMessage", "os.path.join"), at most 4 words.
- The write-up is in Vietnamese with English technical terms; judge by what the solution does, not by how often a word appears.
- Before answering, check each tag: would a reader searching for it want this write-up? Drop the ones that only appear in passing.

Example answer for a write-up where an uploaded SVG runs JavaScript that steals the admin bot's cookie:
{"summary": "Stored XSS through an uploaded SVG whose script sends the admin bot's cookie to a webhook", "difficultyReason": "Like the closest official XSS example (Bronze 3) plus an SVG upload to get past the filter: one level harder", "difficulty": "Bronze 2", "tags": ["XSS", "SVG", "Cookie Stealing"]}
Not tags like ["Web", "Dreamhack", "JavaScript", "Upload", "Bot"].

Answer with JSON only.`;

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

/** Từ có trong gần như mọi bài (cũng là danh sách "generic words" trong TAG_SYSTEM): khớp chúng không nói lên bài giống nhau. */
const GENERIC_TAGS = new Set(['cookie', 'header', 'json', 'base64', 'linux', 'login', 'token', 'api']);

/** Tag xuất hiện như một từ riêng trong bài (không khớp "Go" bên trong "Google"). */
const mentions = (text: string, tag: string) => new RegExp(`(?<![\\p{L}\\p{N}])${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(text);

/**
 * Ví dụ giống bài này nhất lên đầu: tag của ví dụ có mặt trong bài, cùng category, có tier chính thức.
 * Blog lớn hơn MAX_EXAMPLES thì phần bị cắt là ví dụ ít liên quan nhất.
 */
export function rankExamples(examples: TagExample[], body: string, category?: string): TagExample[] {
  const score = (example: TagExample) =>
    example.tags.filter((tag) => !GENERIC_TAGS.has(tag.toLowerCase()) && mentions(body, tag)).length * 3 +
    (category && example.category === category ? 2 : 0) +
    Number(Boolean(example.official));
  return examples.map((example) => ({ example, score: score(example) })).sort((a, b) => b.score - a.score).map(({ example }) => example);
}

/** Phần dữ liệu của prompt (tag sẵn có, bài viết, tag đã gõ). */
export function tagPromptData(input: TagPromptInput): string {
  const attr = (value = '') => value.replace(/"/g, "'");
  const vocabulary = input.vocabulary
    .map((term) => (typeof term === 'string' ? { name: term, count: 0 } : term))
    .sort((a, b) => b.count - a.count)
    .map(({ name, count }) => (count ? `${name} (${count})` : name));
  const own = input.title.trim().toLowerCase();
  const examples = rankExamples(
    (input.examples ?? []).filter((example) => example.tags.length && example.title.trim().toLowerCase() !== own),
    input.body,
    input.category,
  )
    .slice(0, MAX_EXAMPLES)
    .map((example) => {
      const source = example.official ? 'Dreamhack official' : example.ctf;
      const meta = [example.category, example.difficulty, source].filter(Boolean).join(' · ');
      return `- ${example.title}${meta ? ` [${meta}]` : ''}: ${example.tags.join(', ')}`;
    });
  return [
    `<existing_tags>\n${vocabulary.join(', ')}\n</existing_tags>`,
    examples.length ? `<tagged_examples>\nHow the author tagged and rated other write-ups on this blog, most similar first:\n${examples.join('\n')}\n</tagged_examples>` : '',
    `<writeup title="${attr(input.title)}" category="${attr(input.category)}" ctf="${attr(input.ctf)}">\n${compactBody(input.body)}\n</writeup>`,
    input.current.length ? `Tags the author already typed (keep them unless clearly wrong): ${input.current.join(', ')}` : '',
    input.difficulty ? `Difficulty is fixed by the author: ${input.difficulty}. Return it unchanged with difficultyReason "fixed by the author".` : '',
  ].filter(Boolean).join('\n\n');
}

/** Một field chuỗi trong JSON model trả (có thể nằm trong code fence hoặc lẫn chữ); không có thì rỗng. */
function replyField(reply: string, key: string): string {
  const match = /\{[\s\S]*\}/.exec(reply.replace(/```[a-z]*\n?/gi, ''))?.[0];
  if (!match) return '';
  try {
    const value = (JSON.parse(match) as Record<string, unknown>)[key];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

/** Độ khó model chấm, chuẩn hoá về thang Dreamhack; sai thang thì `undefined`. */
export const parseTagDifficulty = (reply: string): Difficulty | undefined => toDifficulty(replyField(reply, 'difficulty'));

/** Lý do model chọn độ khó (so với ví dụ nào). */
export const parseTagReason = (reply: string) => replyField(reply, 'difficultyReason');

/** Câu tóm tắt lời giải model viết trước khi chọn tag (rỗng nếu không có). */
export const parseTagSummary = (reply: string) => replyField(reply, 'summary');

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
