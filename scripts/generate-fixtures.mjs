// Sinh 200 bài giả lập vào `fixtures/posts/` (đã gitignore) để test danh sách cong,
// rendering và hiệu năng build. Chỉ được nạp khi chạy với CTF_FIXTURES=1.
// Cross-platform: chỉ dùng Node.js API.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'fixtures', 'posts');
const COUNT = Number(process.argv[2] ?? 200);

const CTFS = ['Fixture CTF 2024', 'Fixture Quals 2025', 'Giải Thử Nghiệm', 'Mock Finals', 'Sample Jam', 'Practice Arena'];
const CATEGORIES = ['web', 'pwn', 'crypto', 'rev', 'forensics', 'misc', 'osint', 'mobile', 'cloud'];
const DIFFS = ['easy', 'medium', 'hard', 'insane'];
const TAGS = ['sqli', 'xss', 'rop', 'heap', 'rsa', 'aes', 'jwt', 'ssrf', 'race', 'stego', 'pcap', 'z3', 'angr', 'deserialization'];
const LANGS = ['python', 'c', 'cpp', 'js', 'sh', 'php', 'sql', 'rust', 'go', 'asm', 'python!', 'unknownlang'];

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

rmSync(out, { recursive: true, force: true });
for (let i = 1; i <= COUNT; i++) {
  const n = String(i).padStart(3, '0');
  const unsorted = i % 23 === 0;
  const ctf = pick(CTFS);
  const category = pick(CATEGORIES);
  const day = String((i % 28) + 1).padStart(2, '0');
  const month = String((i % 12) + 1).padStart(2, '0');
  const tags = [...new Set([pick(TAGS), pick(TAGS), pick(TAGS)])];
  const lang = pick(LANGS);
  const fm = unsorted
    ? '' // bài "Chưa phân loại": không có frontmatter
    : `---\ntitle: "Fixture challenge ${n} ${pick(['baby', 'revenge', 'hardened', 'ultimate'])}"\ndate: 2025-${month}-${day}\ncategory: ${category}\ndifficulty: ${pick(DIFFS)}\npoints: ${50 + Math.floor(rand() * 450)}\ntags: [${tags.join(', ')}]\n---\n`;
  const body = `# Fixture ${n}

Đây là bài giả lập số ${n} dùng để test danh sách dài, danh sách cong và hiệu năng build.
Dòng thứ hai của paragraph :rocket:

:::info
Callout trong fixture ${n}.
:::

## Phân tích

\`\`\`${lang}
print("fixture ${n}") # ${'x'.repeat(120)}
\`\`\`

:::spoiler Flag
\`FIXTURE{${n}}\`
:::

## Kết luận

==Highlight== và [TOC] trong fixture.
`;
  const dir = unsorted ? path.join(out, `fixture-${n}`) : path.join(out, ctf, `fixture-${n}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.md'), fm + body);
}
console.log(`Generated ${COUNT} fixture posts in ${path.relative(root, out)}`);
