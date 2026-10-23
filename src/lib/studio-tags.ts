import { slugify } from './content/slug';

/** Một tag đã có trong blog cùng số bài dùng nó. */
export interface TagTerm {
  name: string;
  count: number;
}

/** slug → cách viết dùng nhiều nhất. "csrf"/"CSRF", ".htaccess"/"htaccess" về chung một tag. */
export type TagVocabulary = Map<string, TagTerm>;

export const tagKey = (tag: string) => slugify(tag.trim().replace(/^#/, '')) || tag.trim().toLowerCase();

/**
 * Tên mảng ("Web", "Misc"…) không phải tag: frontmatter đã có `category`. Tags chỉ gồm lỗ hổng và keyword.
 * Bỏ khỏi từ điển, gợi ý, và khỏi tags đã nhập khi bấm "Tự thêm tags".
 */
const CATEGORY_KEYS = new Set([
  'web', 'web-exploitation', 'misc', 'miscellaneous', 'crypto', 'cryptography', 'osint', 'forensics', 'pwn', 'binary-exploitation',
  'rev', 'reverse', 'reversing', 'reverse-engineering', 'mobile', 'cloud', 'ctf', 'writeup',
]);
export const isCategoryTag = (tag: string) => CATEGORY_KEYS.has(tagKey(tag));

export function buildVocabulary(...sources: Iterable<TagTerm>[]): TagVocabulary {
  const variants = new Map<string, Map<string, number>>();
  for (const source of sources) {
    for (const { name, count } of source) {
      const clean = name.trim();
      if (!clean || isCategoryTag(clean)) continue;
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

type Rule = { tag: string; patterns: RegExp[]; min?: number };
/** `names`: tên lỗ hổng; `signs`: payload/hàm đặc trưng, đếm cả trong code. */
type VulnRule = { tag: string; names: RegExp[]; signs?: RegExp[]; signMin?: number };

/**
 * Lỗ hổng: đứng đầu danh sách tags. Nhận khi tên lỗ hổng nằm ở tiêu đề/heading, được nhắc 2 lần trong lời giải thích
 * (bỏ câu phủ định kiểu "không phải SSTI"), nhắc 1 lần kèm payload, hoặc payload xuất hiện đủ `signMin` lần (mặc định 3).
 */
const VULNS: readonly VulnRule[] = [
  { tag: 'XSS', names: [/\bxss\b/gi, /cross[- ]site scripting/gi], signs: [/<script\b/gi, /\bon(?:error|load|focus|mouseover|toggle)\s*=/gi, /\balert\s*\(/gi], signMin: 5 },
  { tag: 'Reflected XSS', names: [/reflected xss/gi, /reflected cross[- ]site/gi] },
  { tag: 'Stored XSS', names: [/stored xss/gi, /stored cross[- ]site/gi] },
  { tag: 'DOM XSS', names: [/dom[- ](?:based )?xss/gi] },
  { tag: 'SQL Injection', names: [/\bsqli\b/gi, /sql[- ]injection/gi], signs: [/'\s*or\s+'?1'?\s*=\s*'?1/gi, /\bunion\s+(?:all\s+)?select\b/gi, /\binformation_schema\b/gi, /\bsqlite_master\b/gi, /'\s*--\s/g] },
  { tag: 'UNION', names: [/union[- ]based/gi], signs: [/\bunion\s+(?:all\s+)?select\b/gi], signMin: 1 },
  { tag: 'Blind SQL Injection', names: [/blind sql/gi, /time[- ]based sql/gi, /boolean[- ]based sql/gi] },
  { tag: 'NoSQL', names: [/\bnosql(?:i| injection)?\b/gi], signs: [/["']?\$(?:ne|gt|regex|where|nin)["']?\s*:/gi], signMin: 2 },
  { tag: 'SSJI', names: [/\bssji\b/gi, /server[- ]side javascript injection/gi], signs: [/\$where/g], signMin: 2 },
  { tag: 'Command Injection', names: [/command[- ]injection/gi, /os command/gi], signs: [/\bos\.system\s*\(/gi, /\bshell\s*=\s*True\b/g, /\b(?:shell_exec|passthru|popen|proc_open)\s*\(/gi, /\bchild_process\b/g, /;\s*(?:cat|ls|id|whoami)\b/g] },
  { tag: 'RCE', names: [/\brce\b/gi, /remote code execution/gi], signs: [/reverse shell/gi] },
  { tag: 'SSTI', names: [/\bssti\b/gi, /template injection/gi], signs: [/\{\{\s*7\s*\*\s*7\s*\}\}/g, /__class__\.__mro__|__subclasses__\(\)/g, /render_template_string/g, /\bcycler\.__init__|lipsum\.__globals__/g] },
  { tag: 'SSRF', names: [/\bssrf\b/gi, /server[- ]side request forgery/gi], signs: [/169\.254\.169\.254/g, /metadata\.google\.internal/gi, /gopher:\/\//gi], signMin: 1 },
  { tag: 'CSRF', names: [/\bcsrf\b/gi, /cross[- ]site request forgery/gi] },
  { tag: 'IDOR', names: [/\bidor\b/gi, /insecure direct object/gi, /\bbola\b/gi] },
  { tag: 'BFLA', names: [/\bbfla\b/gi, /broken function level/gi] },
  { tag: 'Broken Access Control', names: [/broken access control/gi] },
  { tag: 'Auth Bypass', names: [/auth(?:entication)?[- ]bypass/gi, /bypass (?:the )?(?:login|auth)/gi] },
  { tag: 'Path Traversal', names: [/path[- ]traversal/gi, /directory[- ]traversal/gi], signs: [/(?:\.\.\/){2,}/g, /\.\.%2f/gi, /(?:\.\.\\){2,}/g], signMin: 1 },
  { tag: 'LFI', names: [/\blfi\b/gi, /local file inclusion/gi], signs: [/php:\/\/filter/gi], signMin: 1 },
  { tag: 'RFI', names: [/\brfi\b/gi, /remote file inclusion/gi] },
  { tag: 'File Upload', names: [/file upload/gi, /upload (?:shell|webshell)/gi], signs: [/\bmove_uploaded_file\b/g, /\bwebshell\b/gi] },
  { tag: 'XXE', names: [/\bxxe\b/gi], signs: [/<!ENTITY\b/g], signMin: 1 },
  { tag: 'Deserialization', names: [/deserializ/gi], signs: [/\bunserialize\s*\(/gi, /\bpickle\.loads?\b/g, /\byaml\.load\s*\(/g, /\bO:\d+:"/g], signMin: 2 },
  { tag: 'Prototype Pollution', names: [/prototype pollution/gi], signs: [/__proto__/g, /constructor\.prototype/g, /constructor\[["']prototype/g], signMin: 1 },
  { tag: 'Type Juggling', names: [/type juggling/gi, /loose comparison/gi], signs: [/\b0e\d{5,}\b/g] },
  { tag: 'Race Condition', names: [/race condition/gi, /\btoctou\b/gi] },
  { tag: 'Open Redirect', names: [/open redirect/gi] },
  { tag: 'Header Injection', names: [/header injection/gi, /\bcrlf\b/gi], signs: [/%0d%0a/gi] },
  { tag: 'Host Header Injection', names: [/host header (?:injection|attack|poisoning)/gi] },
  { tag: 'CSS Injection', names: [/css injection/gi], signs: [/@import\b/g, /input\[value[\^$*]?=/g] },
  { tag: 'HTML Injection', names: [/html injection/gi, /dangling markup/gi] },
  { tag: 'DOM Clobbering', names: [/dom clobbering/gi] },
  { tag: 'CORS', names: [/cors misconfig/gi], signs: [/access-control-allow-(?:origin|credentials)/gi] },
  { tag: 'Clickjacking', names: [/clickjacking/gi] },
  { tag: 'Cache Poisoning', names: [/cache poisoning/gi, /cache deception/gi] },
  { tag: 'Request Smuggling', names: [/request smuggling/gi], signs: [/\bCL\.TE\b|\bTE\.CL\b/g] },
  { tag: 'Mass Assignment', names: [/mass assignment/gi] },
  { tag: 'Logic Bug', names: [/logic (?:bug|flaw)/gi, /business logic/gi, /lỗi logic/gi] },
  { tag: 'Information Disclosure', names: [/information disclosure/gi, /source (?:code )?leak/gi], signs: [/\.git\/(?:HEAD|config)\b/g] },
  { tag: 'Brute Force', names: [/brute[- ]?forc/gi] },
  { tag: 'Insecure Randomness', names: [/insecure random/gi, /predictable (?:random|token|seed)/gi] },
  { tag: 'Hash Length Extension', names: [/length extension/gi], signs: [/\bhashpump\b/gi] },
  { tag: 'Padding Oracle', names: [/padding oracle/gi] },
  { tag: 'Session Fixation', names: [/session fixation/gi] },
  { tag: 'Zip Slip', names: [/zip ?slip/gi] },
  { tag: 'ReDoS', names: [/\bredos\b/gi, /catastrophic backtracking/gi] },
  { tag: 'XS-Leaks', names: [/\bxs-?leaks?\b/gi, /cross[- ]site leak/gi] },
  { tag: 'LDAP Injection', names: [/ldap injection/gi] },
  { tag: 'XPath Injection', names: [/xpath injection/gi] },
  { tag: 'Buffer Overflow', names: [/buffer overflow/gi, /\bbof\b/gi] },
  { tag: 'Format String', names: [/format string/gi], signs: [/%\d*\$[npsx]/g] },
  { tag: 'ROP', names: [/\brop chain\b/gi], signs: [/\bret2(?:libc|win|plt)\b/gi, /\bROPgadget\b/g], signMin: 1 },
];

/**
 * Keyword: công nghệ, thư viện, hàm/sink liên quan tới bug. Đứng sau lỗ hổng.
 * Từ dễ gặp tình cờ thì đặt `min` cao.
 */
const KEYWORDS: readonly Rule[] = [
  { tag: 'PHP', patterns: [/<\?php\b/gi, /\$_(?:GET|POST|REQUEST|COOKIE|FILES|SERVER)\b/g, /\.php\b/gi], min: 3 },
  { tag: 'Node.js', patterns: [/\bnode\.?js\b/gi, /require\(\s*['"]express['"]\s*\)/g, /\bexpress\(\)/g] },
  { tag: 'Flask', patterns: [/\bflask\b/gi], min: 3 },
  { tag: 'Flask Session', patterns: [/flask[- ]unsign/gi, /flask session/gi] },
  { tag: 'Django', patterns: [/\bdjango\b/gi], min: 2 },
  { tag: 'FastAPI', patterns: [/\bfastapi\b/gi], min: 2 },
  { tag: 'Spring', patterns: [/\bspring ?boot\b/gi, /\bspring framework\b/gi] },
  { tag: 'Laravel', patterns: [/\blaravel\b/gi], min: 2 },
  { tag: 'Jinja2', patterns: [/\bjinja2?\b/gi], min: 2 },
  { tag: 'Handlebars', patterns: [/\bhandlebars\b/gi], min: 2 },
  { tag: 'EJS', patterns: [/\bejs\b/gi], min: 2 },
  { tag: 'Pug', patterns: [/\bpug\b/gi], min: 2 },
  { tag: 'Twig', patterns: [/\btwig\b/gi], min: 2 },
  { tag: 'MongoDB', patterns: [/\bmongo(?:db|ose)?\b/gi] },
  { tag: 'SQLite', patterns: [/\bsqlite3?\b/gi, /\bsqlite_master\b/gi] },
  { tag: 'MySQL', patterns: [/\bmysql\b/gi, /\bmariadb\b/gi], min: 2 },
  { tag: 'PostgreSQL', patterns: [/\bpostgres(?:ql)?\b/gi], min: 2 },
  { tag: 'Redis', patterns: [/\bredis\b/gi], min: 2 },
  { tag: 'GraphQL', patterns: [/\bgraphql\b/gi, /\bgraphiql\b/gi] },
  { tag: 'Introspection', patterns: [/\bintrospection\b/gi, /__schema\b/g] },
  { tag: 'JWT', patterns: [/\bjwt\b/gi, /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}/g], min: 2 },
  { tag: 'OAuth', patterns: [/\boauth\s?2?\b/gi] },
  { tag: 'OIDC', patterns: [/\boidc\b/gi, /openid connect/gi] },
  { tag: 'WebSocket', patterns: [/\bwebsockets?\b/gi], min: 2 },
  { tag: 'postMessage', patterns: [/\bpostMessage\s*\(/g, /\bpostMessage\b/g], min: 2 },
  { tag: '.htaccess', patterns: [/\.htaccess\b/gi] },
  { tag: 'DAV', patterns: [/\bwebdav\b/gi, /\bPROPFIND\b/g] },
  { tag: 'Nginx', patterns: [/\bnginx\b/gi], min: 2 },
  { tag: 'Docker', patterns: [/\bdocker(?:file)?\b/gi], min: 3 },
  { tag: 'CVE', patterns: [/\bCVE-\d{4}-\d{4,}\b/gi] },
  { tag: 'Steganography', patterns: [/steganograph/gi, /\b(?:steghide|zsteg|stegsolve|stegseek)\b/gi] },
  { tag: 'Metadata', patterns: [/\bexiftool\b/gi, /\bexif\b/gi] },
  { tag: 'Geolocation', patterns: [/geolocat/gi, /street view/gi] },
  { tag: 'Spectrogram', patterns: [/spectrogram/gi] },
  { tag: 'RSA', patterns: [/\brsa\b/gi] },
  { tag: 'AES-GCM', patterns: [/\baes[- ]gcm\b/gi] },
  { tag: 'AES', patterns: [/\baes(?:[- ](?:ecb|cbc|ctr))?\b/gi], min: 2 },
  { tag: 'Vigenère', patterns: [/vigen[eè]re/gi] },
];

/**
 * Hàm/sink/định danh đáng chú ý: thành keyword khi tác giả nhắc trong lời giải thích (`inline code` 2 lần, chữ thường 3 lần,
 * hoặc ở tiêu đề/heading). Không tính code block dán nguyên source, vì source nào cũng có cả đống hàm.
 */
const SINKS = [
  'os.path.join', 'shell=True', 'subprocess', 'os.system', 'render_template_string', 'pickle', 'yaml.load',
  'unserialize', 'file_get_contents', 'preg_replace', 'parse_str', 'strcmp',
  'innerHTML', 'outerHTML', 'document.write', 'dangerouslySetInnerHTML', 'location.href', 'srcdoc', 'Object.assign',
  'child_process', '$where', 'ObjectId', '@import', 'x5c',
];
const SINK_KEYS = new Map(SINKS.map((sink) => [sink.toLowerCase(), sink]));

const VULN_KEYS = new Set(VULNS.map((rule) => tagKey(rule.tag)));
/** Tag lấy từ từ điển blog không có rule: đoán là lỗ hổng nếu tên mang chữ đặc trưng. */
const VULN_WORDS = /injection|traversal|bypass|pollution|overflow|forgery|smuggling|poisoning|juggling|deserializ|race condition|redirect|access control|disclosure|upload|brute force|logic bug|takeover|clobbering|\b(?:xss|csrf|ssrf|idor|xxe|ssti|lfi|rfi|rce|bfla|bola|sqli)\b/i;
const isVuln = (name: string) => VULN_KEYS.has(tagKey(name)) || VULN_WORDS.test(name);

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/** Tag đã có trong blog → regex tìm chính tên tag (khoảng trắng/gạch nối/gạch dưới coi như nhau). */
function termPattern(name: string): RegExp {
  const body = name.trim().split(/[\s_-]+/).map(escapeRegExp).join('[\\s_-]*');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * Tag "rõ nghĩa" (nhiều chữ, viết hoa kiểu acronym, có số hay ký tự đặc biệt) cần nhắc 2 lần trong bài.
 * Từ đơn thường dễ xuất hiện tình cờ nên phải lặp lại nhiều hơn.
 */
const isDistinctive = (name: string) => /[\s\-_.@/=\d]/.test(name.trim()) || /[A-Z].*[A-Z]/.test(name) || /^[a-z]+[A-Z]/.test(name);
/** Từ gần như bài web nào cũng nhắc (Cookie, Header…): không tự gắn, trừ khi nằm ở tiêu đề. Muốn thì chọn trong gợi ý. */
const GENERIC = new Set(['base64', 'cookie', 'header', 'authorization', 'json', 'timeout', 'markdown', 'graph', 'puzzle', 'certificate', 'source-code-review', 'client-side', 'linux', 'admin', 'login', 'session', 'token', 'api']);
/** Tên hàm/biến làm tag ("os.path.join", "shell=True") hay xuất hiện trong code minh hoạ, cần lặp lại mới tính. */
const isCodeToken = (name: string) => /^[\w$]+(?:[.=][\w$]+)+$/.test(name) && !/^[A-Z]/.test(name);
const threshold = (name: string) => (isCodeToken(name) ? 3 : isDistinctive(name) ? 2 : 4);
/** Bỏ URL (link tham khảo PortSwigger, MDN…) và flag (`CSS{...}`, `DH{...}`) để tên site/tiền tố flag không thành tag. */
const stripNoise = (text: string) => text
  .replace(/\]\([^)]*\)/g, ']').replace(/\bhttps?:\/\/\S+/gi, ' ')
  .replace(/\b[A-Za-z][\w-]{0,15}\{[^}\n]{3,}\}/g, ' ');
/** Phần lời giải thích: bỏ code block và ảnh, giữ inline code. */
const prose = (text: string) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1\s*$/gm, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
/** Câu phủ định ("không phải SSTI", "not vulnerable to XSS") không phải bằng chứng. */
const NEGATION = /không phải|chẳng phải|không bị|không dính|loại trừ|\bnot\b|n't\b/i;
const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n/);
const affirmed = (text: string) => sentences(text).filter((sentence) => !NEGATION.test(sentence)).join('\n');
/** Câu gọi tên lỗ hổng ("Đây chính là lỗ hổng `Broken Access Control`") nặng ngang heading. */
const DECLARES = /lỗ hổng|\blỗi\b|khai thác|tấn công|vulnerab|exploit|\battack/i;

/**
 * Khái niệm mới (chưa có rule, chưa có trong từ điển blog): lấy từ những chỗ tác giả chủ động giới thiệu khái niệm theo văn phong blog:
 * câu hỏi tu từ "Vậy `X` là gì?", "lỗ hổng/kỹ thuật `X`", và link tham khảo tới trang tài liệu/kiến thức.
 */
const QUESTION = /^(?:#{1,6}\s*)?(?:\d+\.\s*)?(?:vậy|thế|một câu hỏi[^,]*,)?\s*(.+?)\s*(?:là gì|là cái gì|hoạt động (?:ra )?sao|hoạt động như thế nào)\s*\??\s*$/i;
const INTRODUCES = /(?:lỗ hổng|kỹ thuật(?: tấn công)?|technique|attack|cơ chế|tính năng|khái niệm)\s+`([^`\n]{2,40})`/gi;
const REFERENCE_HOSTS = /(?:^|\.)(?:portswigger\.net|owasp\.org|hacktricks\.(?:xyz|wiki)|cwe\.mitre\.org|developer\.mozilla\.org|wikipedia\.org|w3schools\.com|geeksforgeeks\.org|docs\.python\.org|nodejs\.org|php\.net|swisskey\.github\.io|github\.com\/swisskyrepo)$/i;
/** Chữ hay gặp trong link/câu hỏi nhưng không phải khái niệm. */
const NOT_CONCEPT = new Set([
  'image', 'here', 'link', 'this', 'docs', 'documentation', 'example', 'examples', 'cheat-sheet', 'source', 'source-code', 'payload',
  'flag', 'challenge', 'lab', 'writeup', 'write-up', 'solution', 'code', 'file', 'files', 'the', 'it', 'nay', 'do', 'string', 'main',
  'object', 'value', 'property', 'function', 'input', 'output', 'data', 'list', 'request', 'response', 'server', 'client', 'page', 'website',
  'expression', 'expressions', 'variable', 'variables', 'method', 'parameter', 'parameters',
  // Tên trang tham khảo.
  'portswigger', 'owasp', 'mdn', 'wikipedia', 'w3schools', 'hacktricks', 'geeksforgeeks', 'payloadsallthethings',
]);
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
const FILE_LIKE = /\.(?:zip|gz|tar|tgz|7z|rar|png|jpe?g|gif|txt|pcap(?:ng)?|py|js|ts|php|html?|md|json|ya?ml|sh|exe|bin|elf|apk|pdf)$/i;

/** Chuẩn hoá một cụm thành tên tag, hoặc undefined nếu không giống tên khái niệm. */
function conceptName(raw: string): string | undefined {
  const name = raw.replace(/`/g, '').replace(/^[\s"'“”*_]+|[\s"'“”*_:,.?!]+$/g, '').replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 32 || VIETNAMESE.test(name) || FILE_LIKE.test(name)) return undefined;
  if (!/^[\p{L}\d][\p{L}\d .+#@=_-]*$/u.test(name) || !/\p{L}/u.test(name)) return undefined;
  if (name.split(' ').length > 4 || /^(?:list|types?|examples?) of\b/i.test(name) || NOT_CONCEPT.has(tagKey(name)) || isCategoryTag(name)) return undefined;
  return name;
}

/** Ứng viên khái niệm trong bài, kèm điểm: câu hỏi tu từ 5, "lỗ hổng `X`" 5, link tham khảo 3; ở tiêu đề/heading cộng thêm 3. */
export function extractConcepts(title: string, body: string): Map<string, { name: string; score: number }> {
  const found = new Map<string, { name: string; score: number }>();
  const add = (raw: string, score: number) => {
    const name = conceptName(raw);
    if (!name) return;
    const key = tagKey(name);
    const entry = found.get(key) ?? { name, score: 0 };
    entry.score += score;
    found.set(key, entry);
  };
  const text = prose(body);
  for (const line of `${title}\n${text}`.split('\n')) {
    const heading = /^#{1,6}\s/.test(line) || line === title;
    for (const sentence of sentences(line)) {
      const question = QUESTION.exec(sentence.trim());
      if (!question) continue;
      const spans = [...question[1].matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
      // Câu hỏi gom cả loạt khái niệm ("`object`, `property`, `value` là gì?") là phần giải nghĩa phụ, không phải chủ đề bài.
      if (spans.length > 2) continue;
      for (const span of spans.length ? spans : [question[1]]) add(span, heading ? 8 : 5);
    }
    for (const [, span] of line.matchAll(INTRODUCES)) add(span, heading ? 8 : 5);
    for (const [, label, url] of line.matchAll(/(?<!!)\[([^\]\n]{2,60})\]\((https?:\/\/[^)\s]+)\)/g)) {
      let host = '';
      try { const parsed = new URL(url); host = parsed.hostname + (parsed.hostname === 'github.com' ? `/${parsed.pathname.split('/')[1] ?? ''}` : ''); } catch { continue; }
      if (REFERENCE_HOSTS.test(host)) add(label, heading ? 6 : 3);
    }
  }
  // Khái niệm thật thì được nhắc lại trong bài; nhắc thêm mỗi lần cộng 1 (tối đa 4).
  for (const entry of found.values()) entry.score += Math.max(Math.min(count(text, termPattern(entry.name)) - 1, 4), 0);
  return found;
}

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
  /** Danh sách cuối: lỗ hổng trước, keyword sau; trong mỗi nhóm tag đã nhập đứng trước tag mới. */
  tags: string[];
  added: string[];
  /** Phần của `added` chưa từng có trong blog (khái niệm mới lấy từ bài), để tác giả soát lại. */
  novel: string[];
  /** Tag tên mảng ("Web", "Misc"…) đã bị bỏ. */
  removed: string[];
  /** Tag đã nhập bị đổi sang cách viết của blog, dạng [cũ, mới]. */
  renamed: Array<[string, string]>;
}

export function suggestTags(input: TagSuggestionInput, vocabulary: TagVocabulary, limit = 8, novelLimit = 2): TagSuggestion {
  const ctfName = input.ctf?.trim() ? new RegExp(escapeRegExp(input.ctf.trim()), 'gi') : undefined;
  const clean = (text: string) => (ctfName ? stripNoise(text).replace(ctfName, ' ') : stripNoise(text));
  const title = affirmed(clean(input.title));
  const body = clean(input.body);
  const explained = affirmed(prose(body));
  const headings = explained.match(/^#{1,6}\s.*$/gm)?.join('\n') ?? '';
  const scores = new Map<string, { name: string; score: number }>();
  const bump = (name: string, score: number) => {
    const key = tagKey(name);
    if (isCategoryTag(name)) return;
    const entry = scores.get(key) ?? { name: canonicalTag(name, vocabulary), score: 0 };
    entry.score = Math.max(entry.score, score);
    scores.set(key, entry);
  };
  /** Tiêu đề/heading là chủ đề bài: một lần ở đó nặng hơn nhiều lần rải rác trong thân bài. */
  const weigh = (patterns: RegExp[], text = explained) => {
    const strong = patterns.reduce((sum, pattern) => sum + count(title, pattern) + count(headings, pattern), 0);
    const plain = patterns.reduce((sum, pattern) => sum + count(text, pattern), 0);
    return { strong, plain, score: strong * 4 + Math.min(plain, 6) };
  };

  const declared = sentences(explained).filter((sentence) => DECLARES.test(sentence)).join('\n');
  for (const rule of VULNS) {
    const names = weigh(rule.names);
    names.strong += rule.names.reduce((sum, pattern) => sum + count(declared, pattern), 0);
    const signs = rule.signs ? weigh(rule.signs, body).plain : 0;
    if (names.strong || names.plain >= 2 || (names.plain && signs) || signs >= (rule.signMin ?? 3)) bump(rule.tag, names.score + Math.min(signs, 6) + 4);
  }
  for (const rule of KEYWORDS) {
    const hit = weigh(rule.patterns, body);
    if (hit.strong || hit.plain >= (rule.min ?? 1)) bump(rule.tag, hit.score + 2);
  }
  for (const id of new Set((`${title}\n${body}`.match(/\bCVE-\d{4}-\d{4,}\b/gi) ?? []).map((cve) => cve.toUpperCase()))) bump(id, 8);
  for (const term of vocabulary.values()) {
    if (term.name.length < 3 && !/^[A-Z0-9]+$/.test(term.name)) continue;
    const generic = GENERIC.has(tagKey(term.name));
    const pattern = termPattern(term.name);
    const hit = weigh([pattern], body);
    if (generic ? count(title, pattern) > 0 : hit.strong || hit.plain >= threshold(term.name)) bump(term.name, hit.score + Math.min(term.count, 3));
  }
  // Sink trong inline code tính 1.5 điểm, chữ thường 1 điểm, tiêu đề/heading 3 điểm; đủ 3 điểm thì gắn.
  const spans = new Map<string, number>();
  for (const [, code] of explained.matchAll(/`([^`\n]+)`/g)) {
    const sink = SINK_KEYS.get(code.trim().replace(/\(\)$/, '').toLowerCase());
    if (sink) spans.set(sink, (spans.get(sink) ?? 0) + 1);
  }
  for (const sink of SINKS) {
    const { strong, plain } = weigh([new RegExp(`(?<![\\w.$@])${escapeRegExp(sink)}(?![\\w$])`, 'g')]);
    const inline = spans.get(sink) ?? 0;
    const points = inline * 1.5 + (plain - inline) + strong * 3;
    if (points >= 3) bump(sink, points);
  }
  // Khái niệm tác giả tự giới thiệu: trùng tag sẵn có thì về cách viết của blog, còn lại là tag mới (tối đa `novelLimit`).
  const ctfKey = input.ctf?.trim() ? tagKey(input.ctf) : '';
  const novel = new Set<string>();
  const concepts = [...extractConcepts(input.title, input.body).entries()]
    .filter(([key, entry]) => entry.score >= 4 && key !== ctfKey && !GENERIC.has(key))
    .sort((a, b) => b[1].score - a[1].score);
  for (const [key, entry] of concepts) {
    if (scores.has(key) || vocabulary.has(key)) bump(entry.name, entry.score);
    else if (novel.size < novelLimit) { novel.add(key); bump(entry.name, entry.score); }
  }

  const renamed: Array<[string, string]> = [];
  const removed: string[] = [];
  const keys = new Set<string>();
  const current: string[] = [];
  for (const tag of input.current) {
    if (isCategoryTag(tag)) { removed.push(tag.trim()); continue; }
    const name = canonicalTag(tag, vocabulary);
    if (name !== tag.trim()) renamed.push([tag.trim(), name]);
    if (keys.has(tagKey(name))) continue;
    keys.add(tagKey(name));
    current.push(name);
  }
  // Tag mới xếp sau tag có rule/có trong blog để không chiếm chỗ của chúng.
  const fresh = [...scores.entries()]
    .filter(([key]) => !keys.has(key))
    .sort((a, b) => Number(novel.has(a[0])) - Number(novel.has(b[0])) || b[1].score - a[1].score || a[1].name.localeCompare(b[1].name))
    .map(([, entry]) => entry.name);
  // Lỗ hổng ưu tiên chỗ trống; keyword lấp phần còn lại.
  const room = Math.max(limit - current.length, 0);
  const freshVulns = fresh.filter(isVuln).slice(0, room);
  const freshKeywords = fresh.filter((name) => !isVuln(name)).slice(0, room - freshVulns.length);
  const tags = [...current.filter(isVuln), ...freshVulns, ...current.filter((name) => !isVuln(name)), ...freshKeywords];
  const added = [...freshVulns, ...freshKeywords];
  return { tags, added, novel: added.filter((name) => novel.has(tagKey(name))), removed, renamed };
}

/**
 * Gộp tag Claude gợi ý vào kết quả offline: tag tác giả đã nhập giữ nguyên, tag AI ưu tiên trước,
 * tag offline sẵn có trong blog lấp chỗ còn trống. Tag AI cũng đi qua cách viết của blog và bộ lọc tên mảng.
 */
export function mergeAiTags(base: TagSuggestion, ai: string[], vocabulary: TagVocabulary, limit = 8): TagSuggestion {
  const typed = base.tags.filter((name) => !base.added.includes(name));
  const keys = new Set(typed.map(tagKey));
  const removed = [...base.removed];
  const fresh: string[] = [];
  const take = (name: string) => {
    const key = tagKey(name);
    if (!name.trim() || keys.has(key)) return;
    keys.add(key);
    fresh.push(name);
  };
  for (const tag of ai) {
    if (isCategoryTag(tag)) continue;
    take(canonicalTag(tag, vocabulary).replace(/\s+/g, ' ').trim());
  }
  // AI đã đọc cả bài: chỉ bù bằng gợi ý offline khi AI trả quá ít tag, để không lẫn tag lệch chủ đề.
  if (fresh.length < 3) for (const name of base.added) if (!base.novel.includes(name)) take(name);
  const room = Math.max(limit - typed.length, 0);
  const freshVulns = fresh.filter(isVuln).slice(0, room);
  const freshKeywords = fresh.filter((name) => !isVuln(name)).slice(0, room - freshVulns.length);
  const tags = [...typed.filter(isVuln), ...freshVulns, ...typed.filter((name) => !isVuln(name)), ...freshKeywords];
  const added = [...freshVulns, ...freshKeywords];
  return { tags, added, novel: added.filter((name) => !vocabulary.has(tagKey(name))), removed, renamed: base.renamed };
}
