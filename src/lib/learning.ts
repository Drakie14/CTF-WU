import { DIFFICULTIES } from './content/constants';
import { slugify } from './content/slug';

interface LearningPost {
  id: string;
  data: { tags: string[]; difficulty: string; date: Date };
}

export const TRACKS = [
  {
    id: 'xss', title: 'XSS', description: 'Theo dấu input, hiểu browser rồi đi qua các lớp filter.',
    stages: [
      { id: 'xss-stage-1', title: 'XSS cơ bản', icon: 'browser', prerequisite: 'Bắt đầu với HTML, JavaScript và cách input xuất hiện trong trang.', tags: ['Reflected XSS', 'Stored XSS'] },
      { id: 'xss-reflected', title: 'Reflected XSS', icon: 'code', prerequisite: 'Xác định context trước khi chọn payload.', tags: ['Reflected XSS'] },
      { id: 'xss-stored', title: 'Stored XSS', icon: 'database', prerequisite: 'Theo dõi input được lưu và render lại ở đâu.', tags: ['Stored XSS'] },
      { id: 'xss-parser', title: 'SVG & parser', icon: 'code', prerequisite: 'Đọc cách browser xử lý element và script ngoài HTML thông thường.', tags: ['SVG', 'PyScript'] },
      { id: 'xss-stage-2', title: 'Filter bypass', icon: 'filter', prerequisite: 'Hiểu context, encode và escape trước khi thử vượt filter.', tags: ['Filter Bypass'] },
      { id: 'xss-extension', title: 'Browser extension', icon: 'browser', prerequisite: 'Theo dõi dữ liệu đi qua trang web và extension.', tags: ['Browser Extension'] },
      { id: 'xss-auth', title: 'Bot & xác thực', icon: 'shield', prerequisite: 'Kết hợp XSS với cách bot gửi request và quyền truy cập.', tags: ['Authorization Header', 'Basic Auth'] },
    ],
  },
  {
    id: 'injection', title: 'Injection', description: 'Từ câu truy vấn tới template, command và dữ liệu phía server.',
    stages: [
      { id: 'injection-stage-1', title: 'SQL Injection', icon: 'database', prerequisite: 'Hiểu cách input được ghép vào câu truy vấn.', tags: ['SQL Injection', 'SQLi'] },
      { id: 'injection-union', title: 'UNION', icon: 'database', prerequisite: 'Đọc kết quả truy vấn và xác định số cột.', tags: ['UNION'] },
      { id: 'injection-sqlite', title: 'SQLite', icon: 'database', prerequisite: 'Làm quen với schema và các đặc điểm của SQLite.', tags: ['SQLite'] },
      { id: 'injection-graphql', title: 'GraphQL', icon: 'api', prerequisite: 'Đọc query, object và cách API kiểm tra quyền.', tags: ['GraphQL'] },
      { id: 'injection-stage-2', title: 'Template injection', icon: 'code', prerequisite: 'Phân biệt dữ liệu với biểu thức được template engine thực thi.', tags: ['SSTI', 'Jinja2', 'Handlebars'] },
      { id: 'injection-command', title: 'Command injection', icon: 'terminal', prerequisite: 'Đọc shell syntax và cách ứng dụng chạy command.', tags: ['Command Injection'] },
      { id: 'injection-deserialization', title: 'Deserialization', icon: 'bug', prerequisite: 'Theo dõi object được khôi phục từ dữ liệu do user gửi.', tags: ['Deserialization'] },
      { id: 'injection-prototype', title: 'Prototype pollution', icon: 'bug', prerequisite: 'Hiểu object, prototype và cách ứng dụng merge dữ liệu.', tags: ['Prototype Pollution'] },
    ],
  },
  {
    id: 'access', title: 'Access control', description: 'Từ danh tính và session tới tài nguyên mà ứng dụng cho phép truy cập.',
    stages: [
      { id: 'access-stage-1', title: 'Cookie & session', icon: 'key', prerequisite: 'Đọc cookie và cách ứng dụng nhận diện user.', tags: ['Cookie Tampering', 'Flask Session', 'Cookie', 'flask-unsign'] },
      { id: 'access-jwt', title: 'JWT & OIDC', icon: 'key', prerequisite: 'Phân biệt token, chữ ký và nguồn xác thực.', tags: ['JWT', 'OIDC'] },
      { id: 'access-stage-2', title: 'IDOR', icon: 'shield', prerequisite: 'Kiểm tra ai được phép đọc và sửa từng object.', tags: ['IDOR', 'ObjectId'] },
      { id: 'access-functions', title: 'Quyền chức năng', icon: 'shield', prerequisite: 'Theo dõi quyền truy cập ở từng API và chức năng.', tags: ['BFLA', 'Broken Access Control', 'Auth Bypass', 'Authentication Bypass'] },
      { id: 'access-csrf', title: 'CSRF', icon: 'browser', prerequisite: 'Hiểu cookie, origin và request do browser tự gửi.', tags: ['CSRF'] },
      { id: 'access-files', title: 'Path traversal', icon: 'folder', prerequisite: 'Đọc cách ứng dụng ghép và chuẩn hóa đường dẫn.', tags: ['Path Traversal', 'LFI'] },
      { id: 'access-upload', title: 'File upload', icon: 'upload', prerequisite: 'Theo dấu file từ khi upload tới lúc được phục vụ hoặc thực thi.', tags: ['File Upload', 'Web Shell'] },
      { id: 'access-ssrf', title: 'SSRF', icon: 'world', prerequisite: 'Xác định server có thể gửi request tới những tài nguyên nào.', tags: ['SSRF'] },
    ],
  },
] as const;

export function learningStages<P extends LearningPost>(track: (typeof TRACKS)[number], posts: P[]) {
  const tier = (difficulty: string) => {
    const i = (DIFFICULTIES as readonly string[]).indexOf(difficulty);
    return i < 0 ? DIFFICULTIES.length : i;
  };
  return track.stages.map(stage => ({
    ...stage,
    // Một write-up có thể dạy nhiều kỹ thuật, nên được tham chiếu ở các chặng liên quan.
    posts: posts.filter(post => post.data.tags.some(tag =>
      (stage.tags as readonly string[]).some(t => slugify(t) === slugify(tag)),
    )).sort((a, b) => tier(a.data.difficulty) - tier(b.data.difficulty) || a.data.date.getTime() - b.data.date.getTime()),
  }));
}

/** Ba điểm mỗi hàng, đổi chiều ở khúc cua để giữ một đường đi liên tục. */
export function journeyLayout(count: number) {
  const points = Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / 3);
    const col = row % 2 ? 2 - i % 3 : i % 3;
    return { x: 90 + col * 210, y: 56 + row * 164 };
  });
  const path = points.map((p, i) => {
    if (!i) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    if (p.y === prev.y) return `H ${p.x}`;
    const edge = p.x === 90 ? 20 : 580;
    return `C ${edge} ${prev.y}, ${edge} ${p.y}, ${p.x} ${p.y}`;
  }).join(' ');
  return { points, path, height: Math.max(1, Math.ceil(count / 3)) * 164 };
}
