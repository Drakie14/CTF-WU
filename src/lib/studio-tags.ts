import { slugify } from './content/slug';

/** Một tag đã có trong blog cùng số bài dùng nó. */
export interface TagTerm {
  name: string;
  count: number;
}

/** slug → cách viết dùng nhiều nhất. "csrf"/"CSRF", ".htaccess"/"htaccess" về chung một tag. */
export type TagVocabulary = Map<string, TagTerm>;

const tagKey = (tag: string) => slugify(tag.trim().replace(/^#/, '')) || tag.trim().toLowerCase();

export function buildVocabulary(...sources: Iterable<TagTerm>[]): TagVocabulary {
  const variants = new Map<string, Map<string, number>>();
  for (const source of sources) {
    for (const { name, count } of source) {
      const clean = name.trim();
      if (!clean) continue;
      const key = tagKey(clean);
      const seen = variants.get(key) ?? new Map<string, number>();
      seen.set(clean, (seen.get(clean) ?? 0) + count);
      variants.set(key, seen);
    }
  }
  const vocabulary: TagVocabulary = new Map();
  for (const [key, seen] of variants) {
    let best: TagTerm = { name: '', count: -1 };
    let total = 0;
    for (const [name, count] of seen) { total += count; if (count > best.count) best = { name, count }; }
    vocabulary.set(key, { name: best.name, count: total });
  }
  return vocabulary;
}

/** Cách viết chuẩn theo blog; tag chưa từng dùng thì giữ nguyên. */
export const canonicalTag = (tag: string, vocabulary: TagVocabulary) => vocabulary.get(tagKey(tag))?.name ?? tag.trim();

/** Category trong frontmatter → tag cùng tên mà các bài cũ vẫn gắn ("Web", "OSINT"…). */
const CATEGORY_TAGS: Readonly<Record<string, string>> = {
  web: 'Web', crypto: 'Crypto', misc: 'Misc', osint: 'OSINT', forensics: 'Forensics',
  pwn: 'Pwn', rev: 'Reverse Engineering', mobile: 'Mobile', cloud: 'Cloud',
};

/**
 * Dấu hiệu kỹ thuật → tag. `min` là số lần khớp tối thiểu (mặc định 1) cho dấu hiệu dễ gặp tình cờ.
 * Tên tag ở đây chỉ là mặc định: nếu blog đã có cách viết khác cùng slug thì dùng cách viết của blog.
 */
const RULES: ReadonlyArray<{ tag: string; patterns: RegExp[]; min?: number }> = [
  { tag: 'XSS', patterns: [/\bxss\b/gi, /cross[- ]site scripting/gi, /<script\b/gi, /\bon(?:error|load|focus|mouseover)\s*=/gi, /\balert\s*\(/gi], min: 2 },
  { tag: 'SQL Injection', patterns: [/\bsqli\b/gi, /sql[- ]injection/gi, /'\s*or\s+'?1'?\s*=\s*'?1/gi, /\bunion\s+(?:all\s+)?select\b/gi] },
  { tag: 'UNION', patterns: [/\bunion\s+(?:all\s+)?select\b/gi] },
  { tag: 'NoSQL', patterns: [/\bnosql\b/gi, /["']?\$(?:ne|gt|regex|where)["']?\s*:/gi] },
  { tag: 'MongoDB', patterns: [/\bmongo(?:db|ose)?\b/gi] },
  { tag: 'SQLite', patterns: [/\bsqlite3?\b/gi, /\bsqlite_master\b/gi] },
  { tag: 'Path Traversal', patterns: [/path[- ]traversal/gi, /directory[- ]traversal/gi, /(?:\.\.\/){2,}/g, /\.\.%2f/gi] },
  { tag: 'LFI', patterns: [/\blfi\b/gi, /local file inclusion/gi, /php:\/\/filter/gi] },
  { tag: 'Command Injection', patterns: [/command[- ]injection/gi, /\bos\.system\s*\(/gi, /\bshell\s*=\s*True\b/g, /\b(?:exec|shell_exec|passthru|popen)\s*\(/gi] },
  { tag: 'RCE', patterns: [/\brce\b/gi, /remote code execution/gi, /reverse shell/gi] },
  { tag: 'SSTI', patterns: [/\bssti\b/gi, /template injection/gi, /\{\{\s*7\s*\*\s*7\s*\}\}/g, /__class__\.__mro__|__subclasses__\(\)/g] },
  { tag: 'SSRF', patterns: [/\bssrf\b/gi, /server[- ]side request forgery/gi, /169\.254\.169\.254/g] },
  { tag: 'CSRF', patterns: [/\bcsrf\b/gi, /cross[- ]site request forgery/gi] },
  { tag: 'IDOR', patterns: [/\bidor\b/gi, /insecure direct object/gi] },
  { tag: 'Broken Access Control', patterns: [/broken access control/gi] },
  { tag: 'Auth Bypass', patterns: [/auth(?:entication)?[- ]bypass/gi, /bypass (?:the )?(?:login|auth)/gi] },
  { tag: 'JWT', patterns: [/\bjwt\b/gi, /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}/g] },
  { tag: 'OAuth', patterns: [/\boauth\s?2?\b/gi] },
  { tag: 'OIDC', patterns: [/\boidc\b/gi, /openid connect/gi] },
  { tag: 'Prototype Pollution', patterns: [/prototype pollution/gi, /__proto__/g, /constructor\.prototype/g] },
  { tag: 'GraphQL', patterns: [/\bgraphql\b/gi, /\bgraphiql\b/gi] },
  { tag: 'Introspection', patterns: [/\bintrospection\b/gi, /__schema\b/g] },
  { tag: 'File Upload', patterns: [/file upload/gi, /\bmove_uploaded_file\b/g, /multipart\/form-data/gi] },
  { tag: '.htaccess', patterns: [/\.htaccess\b/gi] },
  { tag: 'Type Juggling', patterns: [/type juggling/gi, /loose comparison/gi] },
  { tag: 'Deserialization', patterns: [/deserializ/gi, /\bunserialize\s*\(/gi, /\bpickle\.loads?\b/g] },
  { tag: 'XXE', patterns: [/\bxxe\b/gi, /<!ENTITY\b/g] },
  { tag: 'Race Condition', patterns: [/race condition/gi] },
  { tag: 'Open Redirect', patterns: [/open redirect/gi] },
  { tag: 'Header Injection', patterns: [/header injection/gi, /\bcrlf\b/gi] },
  { tag: 'CSS Injection', patterns: [/css injection/gi] },
  { tag: 'postMessage', patterns: [/\bpostMessage\s*\(/g] },
  { tag: 'Brute Force', patterns: [/brute[- ]?forc/gi] },
  { tag: 'Flask', patterns: [/\bflask\b/gi], min: 2 },
  { tag: 'DAV', patterns: [/\bwebdav\b/gi, /\bPROPFIND\b/g] },
  { tag: 'Flask Session', patterns: [/flask[- ]unsign/gi, /flask session/gi] },
  { tag: 'PHP', patterns: [/<\?php\b/gi, /\$_(?:GET|POST|REQUEST|COOKIE|FILES|SERVER)\b/g, /\.php\b/gi], min: 2 },
  { tag: 'Node.js', patterns: [/\bnode\.?js\b/gi, /require\(\s*['"]express['"]\s*\)/g, /\bexpress\(\)/g] },
  { tag: 'Steganography', patterns: [/steganograph/gi, /\b(?:steghide|zsteg|stegsolve|stegseek)\b/gi] },
  { tag: 'Metadata', patterns: [/\bexiftool\b/gi, /\bexif\b/gi] },
  { tag: 'Geolocation', patterns: [/geolocat/gi, /street view/gi] },
  { tag: 'Spectrogram', patterns: [/spectrogram/gi] },
  { tag: 'RSA', patterns: [/\brsa\b/gi] },
  { tag: 'AES-GCM', patterns: [/\baes[- ]gcm\b/gi] },
  { tag: 'AES', patterns: [/\baes(?:[- ](?:ecb|cbc|ctr))?\b/gi], min: 2 },
  { tag: 'Vigenère', patterns: [/vigen[eè]re/gi] },
  { tag: 'Base64', patterns: [/\bbase64\b/gi, /\batob\s*\(|\bb64decode\b/g], min: 2 },
  { tag: 'Buffer Overflow', patterns: [/buffer overflow/gi, /\bbof\b/gi] },
  { tag: 'ROP', patterns: [/\brop\b(?: chain)?/gi, /\bret2(?:libc|win|plt)\b/gi] },
  { tag: 'Format String', patterns: [/format string/gi, /%\d*\$[npsx]/g] },
  { tag: 'CVE', patterns: [/\bCVE-\d{4}-\d{4,}\b/gi] },
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/** Tag đã có trong blog → regex tìm chính tên tag (khoảng trắng/gạch nối/gạch dưới coi như nhau). */
function termPattern(name: string): RegExp {
  const body = name.trim().split(/[\s_-]+/).map(escapeRegExp).join('[\\s_-]*');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * Tag "rõ nghĩa" (nhiều chữ, viết hoa kiểu acronym, có số hay ký tự đặc biệt) chỉ cần nhắc một lần.
 * Từ đơn thường như "Cookie", "Header", "Timeout" dễ xuất hiện tình cờ nên phải lặp lại nhiều hơn.
 */
const isDistinctive = (name: string) => /[\s\-_.@/=\d]/.test(name.trim()) || /[A-Z].*[A-Z]/.test(name) || /^[a-z]+[A-Z]/.test(name);
/** Từ gần như bài web nào cũng nhắc: chỉ gắn khi xuất hiện ở tiêu đề/heading hoặc rất dày đặc. */
const GENERIC = new Set(['base64', 'cookie', 'header', 'authorization', 'json', 'timeout', 'markdown', 'graph', 'puzzle', 'certificate', 'misc', 'web', 'crypto']);
/** Tên hàm/biến làm tag ("os.path.join", "shell=True") hay xuất hiện trong code minh hoạ, cần lặp lại mới tính. */
const isCodeToken = (name: string) => /^[\w$]+(?:[.=][\w$]+)+$/.test(name) && !/^[A-Z]/.test(name);
function threshold(name: string) {
  if (GENERIC.has(tagKey(name))) return 6;
  if (isCodeToken(name)) return 3;
  return isDistinctive(name) ? 1 : 4;
}
/** Bỏ URL (link tham khảo PortSwigger, MDN…) để tên site không bị nhận nhầm là tag. */
const stripUrls = (text: string) => text.replace(/\]\([^)]*\)/g, ']').replace(/\bhttps?:\/\/\S+/gi, ' ');

export interface TagSuggestionInput {
  title: string;
  body: string;
  category?: string;
  /** Tên giải: bỏ khỏi văn bản khi so khớp ("CSS CTF" không có nghĩa là tag CSS). */
  ctf?: string;
  /** Tags người dùng đã nhập. */
  current: string[];
}

export interface TagSuggestion {
  /** Danh sách cuối: tag category, tag đã nhập (đã chuẩn hoá cách viết), rồi tag mới theo điểm. */
  tags: string[];
  added: string[];
  /** Tag đã nhập bị đổi sang cách viết của blog, dạng [cũ, mới]. */
  renamed: Array<[string, string]>;
}

export function suggestTags(input: TagSuggestionInput, vocabulary: TagVocabulary, limit = 8): TagSuggestion {
  const ctfName = input.ctf?.trim() ? new RegExp(escapeRegExp(input.ctf.trim()), 'gi') : undefined;
  const clean = (text: string) => (ctfName ? stripUrls(text).replace(ctfName, ' ') : stripUrls(text));
  const title = clean(input.title);
  const body = clean(input.body);
  const headings = body.match(/^#{1,6}\s.*$/gm)?.join('\n') ?? '';
  const scores = new Map<string, { name: string; score: number }>();
  const bump = (name: string, score: number) => {
    const key = tagKey(name);
    const entry = scores.get(key) ?? { name: canonicalTag(name, vocabulary), score: 0 };
    entry.score = Math.max(entry.score, score);
    scores.set(key, entry);
  };
  const weigh = (pattern: RegExp) => count(title, pattern) * 3 + count(headings, pattern) * 2 + Math.min(count(body, pattern), 5);

  for (const rule of RULES) {
    const hits = rule.patterns.reduce((sum, pattern) => sum + weigh(pattern), 0);
    if (hits >= Math.max(rule.min ?? 1, GENERIC.has(tagKey(rule.tag)) ? threshold(rule.tag) : 1)) bump(rule.tag, hits + 2);
  }
  for (const id of new Set((`${title}\n${body}`.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((cve) => cve.toUpperCase()))) bump(id, 6);
  for (const term of vocabulary.values()) {
    if (term.name.length < 3 && !/^[A-Z0-9]+$/.test(term.name)) continue;
    const score = weigh(termPattern(term.name));
    if (score >= threshold(term.name)) bump(term.name, score + Math.min(term.count, 3));
  }

  const categoryTag = input.category ? CATEGORY_TAGS[input.category.toLowerCase()] : undefined;
  const ordered: string[] = [];
  const keys = new Set<string>();
  const push = (name: string) => { const key = tagKey(name); if (key && !keys.has(key)) { keys.add(key); ordered.push(name); } };
  const renamed: Array<[string, string]> = [];

  if (categoryTag) push(canonicalTag(categoryTag, vocabulary));
  for (const tag of input.current) {
    const name = canonicalTag(tag, vocabulary);
    if (name !== tag.trim()) renamed.push([tag.trim(), name]);
    push(name);
  }
  const existing = ordered.length;
  [...scores.entries()]
    .filter(([key]) => !keys.has(key))
    .sort((a, b) => b[1].score - a[1].score || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .forEach(([, entry]) => push(entry.name));

  const added = ordered.slice(existing);
  if (categoryTag && !input.current.some((tag) => tagKey(tag) === tagKey(categoryTag))) added.unshift(ordered[0]);
  return { tags: ordered, added, renamed };
}
