import { existsSync, promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Loader, LoaderContext } from 'astro/loaders';
import { preprocessHackmd } from '../markdown/preprocess';
import { formatWarning, normalizeFrontmatter, splitFrontmatter } from './frontmatter';
import { getGitFirstCommitDates, pathKey } from './git-dates';
import { getPathInfo } from './paths';
import { readingTimeMinutes } from './text';

/**
 * Content loader cho collection `posts`.
 *
 * Vì sao không dùng `glob()` của Astro:
 * - `glob()` throw khi YAML frontmatter hỏng → build fail (vi phạm mục 8);
 * - cần slug theo tên file/thư mục (bỏ thư mục CTF) và báo duplicate slug rõ ràng;
 * - cần đường dẫn file để suy ra title/CTF/date và in warning đúng file.
 *
 * Markdown vẫn được render bằng pipeline đã cấu hình trong `astro.config.mjs`
 * (qua `renderMarkdown`), nên ảnh local `./img.png` vẫn được `astro:assets` tối ưu.
 */

export interface PostsLoaderOptions {
  /** Thư mục bài viết, tương đối so với project root. */
  base: string;
  /** Thư mục bổ sung (ví dụ fixtures) — chỉ dùng khi được truyền vào. */
  extraBases?: string[];
}

interface SourceFile {
  absPath: string;
  baseDir: string;
}

async function listMarkdownFiles(baseDir: string): Promise<SourceFile[]> {
  if (!existsSync(baseDir)) return [];
  const entries = await fs.readdir(baseDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.md$/i.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
    .filter((abs) => !path.relative(baseDir, abs).split(/[\\/]/).some((seg) => seg.startsWith('.')))
    .sort()
    .map((absPath) => ({ absPath, baseDir }));
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export class DuplicateSlugError extends Error {
  constructor(slug: string, a: string, b: string) {
    super(`Duplicate post slug "${slug}":\n  - ${a}\n  - ${b}\nRename one of the files/folders so every post has a unique slug.`);
    this.name = 'DuplicateSlugError';
  }
}

/** Tìm slug trùng; throw {@link DuplicateSlugError} chỉ rõ hai file. */
export function assertUniqueSlugs(items: Array<{ slug: string; file: string }>): void {
  const seen = new Map<string, string>();
  for (const { slug, file } of items) {
    const prev = seen.get(slug);
    if (prev) throw new DuplicateSlugError(slug, prev, file);
    seen.set(slug, file);
  }
}

export function postsLoader(options: PostsLoaderOptions): Loader {
  return {
    name: 'ctf-posts-loader',
    load: async (ctx) => {
      await loadAll(ctx, options);
      if (!ctx.watcher) return;
      const root = fileURLToPath(ctx.config.root);
      const dirs = [options.base, ...(options.extraBases ?? [])].map((b) => path.resolve(root, b));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onEvent = (changed: string) => {
        if (!dirs.some((d) => !path.relative(d, changed).startsWith('..'))) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          loadAll(ctx, options).catch((err: unknown) => ctx.logger.error(String(err)));
        }, 100);
      };
      for (const d of dirs) ctx.watcher.add(d);
      ctx.watcher.on('add', onEvent);
      ctx.watcher.on('change', onEvent);
      ctx.watcher.on('unlink', onEvent);
    },
  };
}

async function loadAll(ctx: LoaderContext, options: PostsLoaderOptions): Promise<void> {
  const { store, logger, config, parseData, renderMarkdown } = ctx;
  const root = fileURLToPath(config.root);
  const bases = [options.base, ...(options.extraBases ?? [])].map((b) => path.resolve(root, b));
  const files = (await Promise.all(bases.map(listMarkdownFiles))).flat();

  const infos = files.map((f) => ({
    ...f,
    info: getPathInfo(f.baseDir, f.absPath),
    relToRoot: toPosix(path.relative(root, f.absPath)),
  }));

  // Duplicate slug là lỗi build duy nhất được phép (mục 8, 16).
  assertUniqueSlugs(infos.map((i) => ({ slug: i.info.slug, file: i.relToRoot })));

  const gitDates = new Map<string, Date>();
  for (const b of bases) {
    for (const [k, v] of getGitFirstCommitDates(b, (m) => logger.info(m))) gitDates.set(k, v);
  }

  const untouched = new Set(store.keys());

  for (const item of infos) {
    const { absPath, info, relToRoot } = item;
    const raw = await fs.readFile(absPath, 'utf8');
    const split = splitFrontmatter(raw);
    if (split.error) {
      logger.warn(formatWarning({ file: relToRoot, field: 'frontmatter', message: `${split.error}; frontmatter ignored` }));
    }

    const gitDate = gitDates.get(pathKey(absPath));
    const { data: fm, warnings } = normalizeFrontmatter(split.data, {
      file: relToRoot,
      baseName: info.baseName,
      folderCtf: info.folderCtf,
      fallbackDate: gitDate ?? statSync(absPath).mtime,
      fallbackDateSource: gitDate ? 'git' : 'mtime',
    });

    // Cover: chỉ chấp nhận file local tồn tại (ảnh remote xử lý ở pipeline ảnh).
    let cover: string | undefined;
    if (fm.cover) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(fm.cover) || fm.cover.startsWith('/')) {
        warnings.push({ file: relToRoot, field: 'cover', message: 'only local relative image paths are supported', value: fm.cover, fallback: 'no cover' });
      } else if (!existsSync(path.resolve(path.dirname(absPath), fm.cover))) {
        warnings.push({ file: relToRoot, field: 'cover', message: 'file not found', value: fm.cover, fallback: 'no cover' });
      } else {
        cover = fm.cover.startsWith('.') ? fm.cover : `./${fm.cover}`;
      }
    }
    for (const w of warnings) logger.warn(formatWarning(w));

    // Frontmatter chuẩn hóa được truyền cho pipeline Markdown (dạng JSON — là YAML hợp lệ).
    const renderFrontmatter = { title: fm.titleInferred ? '' : fm.title, sourceFile: relToRoot };
    const body = preprocessHackmd(split.body, (message) => logger.warn(`[markdown] ${relToRoot} — ${message}`));
    const rendered = await renderMarkdown(`---\n${JSON.stringify(renderFrontmatter)}\n---\n${body}`, {
      fileURL: pathToFileURL(absPath),
    });

    const summaryInferred = !fm.summary;
    const data = await parseData({
      id: info.slug,
      filePath: absPath,
      data: {
        title: fm.title,
        titleInferred: fm.titleInferred,
        date: fm.date,
        dateSource: fm.dateSource,
        ctf: fm.ctf,
        ctfInferred: fm.ctfInferred,
        category: fm.category,
        difficulty: fm.difficulty,
        points: fm.points,
        tags: fm.tags,
        summary: fm.summary || String(rendered.metadata?.frontmatter?.autoSummary ?? ''),
        summaryInferred,
        ...(cover ? { cover } : {}),
        readingTime: readingTimeMinutes(split.body),
        sourcePath: relToRoot,
      },
    });

    untouched.delete(info.slug);
    store.set({
      id: info.slug,
      data,
      body: split.body,
      filePath: relToRoot,
      // Digest bao gồm dữ liệu đã chuẩn hóa + HTML: store bỏ qua cập nhật nếu digest không đổi,
      // nên chỉ hash `raw` sẽ giữ lại dữ liệu cũ khi fallback date / pipeline thay đổi.
      digest: ctx.generateDigest(JSON.stringify({ raw, data, html: rendered.html })),
      rendered,
      assetImports: rendered.metadata?.imagePaths ?? [],
    });
  }

  for (const id of untouched) store.delete(id);
}
