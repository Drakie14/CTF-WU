/**
 * Tiền xử lý chuỗi Markdown HackMD TRƯỚC khi parse — chỉ cho những cú pháp mà
 * CommonMark không thể biểu diễn dưới dạng node:
 *
 * 1. Container `:::info|success|warning|danger` và `:::spoiler Tiêu đề`
 *    (hỗ trợ lồng nhau) → khối HTML `<div class="callout ...">` / `<details>`.
 *    Nội dung bên trong vẫn là Markdown (có dòng trống bao quanh) và vẫn đi qua
 *    rehype-sanitize như mọi HTML khác.
 * 2. Nhúng HackMD `{%youtube id %}`, `{%gist ... %}`, `{% ... %}` → link thường
 *    hoặc bỏ qua, kèm warning. Làm ở bước này vì GFM autolink sẽ tách URL bên
 *    trong `{% ... %}` thành node riêng nếu để tới bước remark.
 * 3. Kích thước ảnh `![alt](url =300x)` / `=300x200` / `=x200` → chuyển thành
 *    title đặc biệt `"=300x"`, được plugin remark đọc để đặt width/height.
 *
 * Nội dung trong code fence (``` hoặc ~~~) và inline code không bị động tới.
 */

export type PreprocessWarn = (message: string) => void;

const DIRECTIVE_RE = /\{%\s*([\w-]*)\s*([^%]*?)\s*%\}/g;

/** Nhúng HackMD `{%name arg %}`: chỉ render thành link thường (KHÔNG iframe). */
const DIRECTIVE_LINKS: Record<string, { label: string; url: (arg: string) => string | null }> = {
  youtube: { label: 'YouTube', url: (a) => (/^[\w-]{6,20}$/.test(a) ? `https://www.youtube.com/watch?v=${a}` : null) },
  vimeo: { label: 'Vimeo', url: (a) => (/^\d+$/.test(a) ? `https://vimeo.com/${a}` : null) },
  gist: { label: 'Gist', url: (a) => (/^[\w-]+(\/[\w-]+)?$/.test(a) ? `https://gist.github.com/${a}` : null) },
  hackmd: { label: 'HackMD', url: (a) => (/^[\w@/-]+$/.test(a) ? `https://hackmd.io/${a}` : null) },
  slideshare: { label: 'SlideShare', url: (a) => (/^[\w/-]+$/.test(a) ? `https://www.slideshare.net/${a}` : null) },
  speakerdeck: { label: 'Speaker Deck', url: (a) => (/^[\w/-]+$/.test(a) ? `https://speakerdeck.com/${a}` : null) },
  pdf: { label: 'PDF', url: (a) => (/^https?:\/\/\S+$/.test(a) ? a : null) },
  figma: { label: 'Figma', url: (a) => (/^https:\/\/(www\.)?figma\.com\/\S+$/.test(a) ? a : null) },
};

function escapeMdLabel(s: string): string {
  return s.replace(/[[\]\\*_`<>]/g, (c) => `\\${c}`);
}

function convertDirectives(s: string, warn: PreprocessWarn): string {
  if (!s.includes('{%')) return s;
  return s.replace(DIRECTIVE_RE, (whole, rawName: string, rawArg: string) => {
    const arg = rawArg.trim();
    const def = DIRECTIVE_LINKS[rawName.toLowerCase()];
    const url = def?.url(arg) ?? null;
    if (def && url) {
      warn(`HackMD embed ${whole} rendered as a plain link (embeds/iframes are not supported)`);
      return `[${escapeMdLabel(`${def.label}: ${arg}`)}](<${url.replace(/[<>\s]/g, encodeURIComponent)}>)`;
    }
    warn(`unsupported HackMD directive ${whole} ignored`);
    return '';
  });
}

const CALLOUT_TYPES = new Set(['info', 'success', 'warning', 'danger']);

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const CONTAINER_OPEN_RE = /^ {0,3}(:{3,})\s*([a-zA-Z]+)\b[ \t]*(.*?)\s*$/;
const CONTAINER_CLOSE_RE = /^ {0,3}(:{3,})\s*$/;
const IMAGE_SIZE_RE = /(!\[[^\]\n]*\]\(\s*)(<[^>\n]*>|[^\s()]+)\s+=(\d*)x(\d*)\s*\)/g;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Áp dụng `fn` cho phần nằm ngoài inline code của một dòng. */
function outsideInlineCode(line: string, fn: (s: string) => string): string {
  if (!line.includes('`')) return fn(line);
  let out = '';
  let i = 0;
  while (i < line.length) {
    const tick = line.indexOf('`', i);
    if (tick === -1) {
      out += fn(line.slice(i));
      break;
    }
    out += fn(line.slice(i, tick));
    const run = /^`+/.exec(line.slice(tick))![0];
    const close = line.indexOf(run, tick + run.length);
    if (close === -1) {
      out += line.slice(tick);
      break;
    }
    out += line.slice(tick, close + run.length);
    i = close + run.length;
  }
  return out;
}

function convertImageSizes(s: string): string {
  return s.replace(IMAGE_SIZE_RE, (m, open: string, url: string, w: string, h: string) =>
    w || h ? `${open}${url} "=${w}x${h}")` : m,
  );
}

interface OpenContainer {
  type: string;
  markerLength: number;
}

export function preprocessHackmd(markdown: string, warn: PreprocessWarn = () => {}): string {
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  const stack: OpenContainer[] = [];
  let fence: string | null = null;

  const close = (c: OpenContainer) => {
    out.push('', c.type === 'spoiler' ? '</details>' : '</div>', '');
  };

  for (const line of lines) {
    if (fence) {
      out.push(line);
      const m = FENCE_RE.exec(line);
      if (m && m[1]![0] === fence[0] && m[1]!.length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    const fm = FENCE_RE.exec(line);
    // CommonMark: info string của fence dùng backtick không được chứa backtick (```a``` là inline code).
    if (fm && !(fm[1]![0] === '`' && line.slice(line.indexOf(fm[1]!) + fm[1]!.length).includes('`'))) {
      fence = fm[1]!;
      out.push(line);
      continue;
    }

    const open = CONTAINER_OPEN_RE.exec(line);
    if (open) {
      const type = open[2]!.toLowerCase();
      if (type === 'spoiler') {
        const title = open[3] || 'Spoiler';
        stack.push({ type, markerLength: open[1]!.length });
        out.push('', `<details class="spoiler"><summary>${escapeHtml(title)}</summary>`, '');
        continue;
      }
      if (CALLOUT_TYPES.has(type)) {
        stack.push({ type, markerLength: open[1]!.length });
        out.push('', `<div class="callout callout-${type}">`, '');
        continue;
      }
    }

    if (stack.length && CONTAINER_CLOSE_RE.test(line)) {
      close(stack.pop()!);
      continue;
    }

    out.push(outsideInlineCode(line, (part) => convertImageSizes(convertDirectives(part, warn))));
  }

  // Container chưa đóng ở cuối file → tự đóng (HackMD cũng coi như kết thúc).
  while (stack.length) close(stack.pop()!);

  return out.join(eol);
}
