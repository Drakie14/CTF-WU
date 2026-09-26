import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { CATEGORIES, DIFFICULTIES } from './lib/content/constants';
import { postsLoader } from './lib/content/loader';

/**
 * Fixtures (200 bài giả lập) chỉ được nạp khi đặt biến môi trường
 * `CTF_FIXTURES=1` — không bao giờ lọt vào build production thông thường.
 */
const extraBases = process.env.CTF_FIXTURES === '1' ? ['fixtures/posts'] : [];

/**
 * Loader đã chuẩn hóa dữ liệu và in warning; schema chỉ là lớp bảo vệ cuối:
 * mọi field đều có `.catch()` nên dữ liệu sai KHÔNG BAO GIỜ làm build fail.
 */
const posts = defineCollection({
  loader: postsLoader({ base: 'src/content/posts', extraBases }),
  schema: ({ image }) =>
    z.object({
      title: z.string().catch(''),
      titleInferred: z.boolean().catch(true),
      date: z.coerce.date().catch(() => new Date()),
      dateSource: z.enum(['frontmatter', 'git', 'mtime']).catch('mtime'),
      ctf: z.string().catch(''),
      ctfInferred: z.boolean().catch(false),
      category: z.enum([...CATEGORIES, '']).catch(''),
      difficulty: z.enum([...DIFFICULTIES, '']).catch(''),
      points: z.number().int().nonnegative().nullable().catch(null),
      tags: z.array(z.string()).catch([]),
      summary: z.string().catch(''),
      summaryInferred: z.boolean().catch(true),
      cover: image().optional().catch(undefined),
      readingTime: z.number().int().positive().catch(1),
      sourcePath: z.string().catch(''),
    }),
});

export const collections = { posts };
