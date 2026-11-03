import { DIFFICULTIES } from './content/constants';
import { slugify } from './content/slug';
interface LearningPost {
  id: string;
  data: { tags: string[]; difficulty: string; date: Date };
}
export const TRACKS = [
  {
    id: 'xss',
    title: 'XSS',
    description: 'Từ input phản chiếu tới filter bypass và policy của browser.',
    stages: [
      { title: 'Context và cách input đi vào trang', tags: ['Reflected XSS', 'Stored XSS', 'DOM XSS'] },
      { title: 'Filter và HTML parser', tags: ['XSS', 'Filter Bypass', 'CSP Bypass'] },
    ],
  },
  {
    id: 'injection',
    title: 'Injection',
    description: 'Theo dấu dữ liệu từ input tới câu truy vấn, template và command.',
    stages: [
      {
        title: 'Query và cách dữ liệu được ghép',
        tags: ['SQL Injection', 'SQLi', 'NoSQL Injection', 'GraphQL'],
      },
      { title: 'Template và command', tags: ['SSTI', 'Command Injection', 'RCE'] },
    ],
  },
  {
    id: 'access',
    title: 'Access control',
    description: 'Đọc cách ứng dụng nhận diện user và kiểm tra quyền truy cập.',
    stages: [
      { title: 'Session, cookie và request', tags: ['Cookie', 'JWT', 'CSRF', 'Authentication Bypass'] },
      { title: 'Object và file', tags: ['IDOR', 'Path Traversal', 'File Upload', 'SSRF'] },
    ],
  },
] as const;
export function learningStages<P extends LearningPost>(track: (typeof TRACKS)[number], posts: P[]) {
  const used = new Set<string>();
  const tier = (d: string) => {
    const i = (DIFFICULTIES as readonly string[]).indexOf(d);
    return i < 0 ? 100 : i;
  };
  return track.stages.map((stage) => ({
    ...stage,
    posts: posts
      .filter(
        (post) =>
          !used.has(post.id) &&
          post.data.tags.some((tag) =>
            (stage.tags as readonly string[]).some((t) => slugify(t) === slugify(tag)),
          ),
      )
      .sort(
        (a, b) =>
          tier(a.data.difficulty) - tier(b.data.difficulty) || a.data.date.getTime() - b.data.date.getTime(),
      )
      .filter((post) => {
        used.add(post.id);
        return true;
      }),
  }));
}
