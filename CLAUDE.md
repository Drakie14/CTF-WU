# CLAUDE.md — Blog CTF Writeups

Blog CTF cá nhân của Hiếu (Astro). Bài viết nằm trong `src/content/posts/<Giải>/`.

## Cấu trúc bài

- Bài lẻ: `src/content/posts/<Giải>/<slug>/index.md`, ảnh để cạnh file (`./01-home.png`). Heading: `## Đề bài` → `## Solution`.
- Bài gom nhiều lab (VD [`PortSwigger/XSS.md`](src/content/posts/PortSwigger/XSS.md)): mỗi lab là `## Tên lab` → `#### Đề bài` → `#### Solution`.
- Frontmatter:
  ```yaml
  title: Absurd Admin
  date: 2026-09-29
  ctf: CSS CTF            # trùng tên thư mục giải
  category: web           # web | pwn | crypto | rev | forensics | misc | osint | mobile | cloud
  difficulty: easy        # easy | medium | hard | insane
  tags: [Web, Cookie]
  ```
  Dữ liệu sai không làm build fail mà chỉ in warning ra log, nên phải tự kiểm tra lại.
- Kiểm tra sau khi sửa: `npm run build` (lỗi cú pháp markdown, ảnh hỏng, code fence lạ đều hiện ở warning).

## Văn phong (quan trọng)

Bài mẫu chuẩn là [`XSS.md`](src/content/posts/PortSwigger/XSS.md), chính là văn phong của tác giả. Bài mới hoặc bài được chỉnh sửa phải bám theo:

- **Ngôi xưng:** luôn dùng "ta" (không "mình", "tôi", "chúng ta"). VD: "ta thấy", "ta nhận thấy", "ta thử nhập".
- **Đề bài:** giữ nguyên đề gốc tiếng Anh, không dịch, không sửa định dạng.
- **Mở đầu Solution:** "Truy cập vào lab/challenge, ta thấy:" + ảnh. Với bài web có input phản chiếu: "Thử nhập payload `1`" để xem input bị chèn vào đâu, trích đoạn source cần lưu ý, rồi chỉ ra "input của user đã được chèn vào ở đoạn này". Bài không thuộc dạng này thì không gượng ép.
- **Dẫn tới đáp án bằng mũi tên:** `-> Payload: ...` / `-> Flag: ...` / `-> URL: ...`.
- **Giải thích payload:** đánh số 1. 2. 3., mổ xẻ từng thành phần làm gì (`` `"` để đóng attribute ``, "tận dụng `\">` còn dư của source").
- **Giọng điệu:** giảng giải, tự đặt câu hỏi tu từ rồi trả lời ("Vậy `template string` là gì?"); giải thích cơ chế đằng sau chứ không chỉ nêu đáp án.
- **Thuật ngữ kỹ thuật giữ tiếng Anh** chèn trong câu Việt: attribute, event, source, sink, parser, encode/escape, element, tag, payload. Từ quen dùng: "tận dụng", "... còn dư", "thoát khỏi", "kích hoạt event", "chèn mã độc", "trick parser", "con đường vòng", "kinh điển", "May mắn thay".
- **Link tham khảo inline** (PortSwigger, w3schools, MDN, spec) khi giới thiệu khái niệm mới.
- **Kết bài** dừng ngay ở payload/flag cuối. Không thêm mục "Bài học"/"Kết luận".

### Tránh văn AI

- **Không dùng chữ đậm `**...**`** trong lời viết, kể cả nhãn kiểu "**Bước 1 —**", "**Bẫy quan trọng:**", "**Fix đúng cách:**". Muốn nhấn mạnh thì dùng câu chữ hoặc `inline code`. Chỉ giữ chữ đậm có sẵn trong đề gốc.
- Không mở câu bằng nhãn kiểu "Điểm chí mạng:", "Lưu ý quan trọng:"; viết thành đoạn văn liền mạch như XSS.md.

## Cú pháp markdown (HackMD)

- Code block có dấu `!` để tự xuống dòng: ` ```html! `, ` ```javascript! `, ` ```bash! `, ` ```python! `.
- Ảnh: `![image](url)`. Ảnh remote (hackmd.io, imgur) được tải về lúc build.
- Callout: `:::info`, `:::success`, `:::warning`, `:::danger` ... `:::`. Blockquote `>` cho giải thích sâu; `<center>...</center>` để vẽ luồng suy luận.

## Nội dung & flag

- **Luôn ưu tiên flag thật**, không để placeholder `NNS{...}` / `csaw{...}` nếu lấy được (chạy exploit khi server còn live, tra writeup khác/CTFtime, hoặc hỏi tác giả). Chỉ để placeholder khi thực sự không còn cách, và nói rõ.
- Khi chỉnh giọng cho bài cũ: chỉ sửa văn phong/cấu trúc, **không đổi nội dung kỹ thuật, payload hay flag**.
- **Không bao giờ tự xoá bài writeup** (file hoặc thư mục trong `src/content/posts`) khi chưa hỏi tác giả, kể cả khi yêu cầu có chữ "bỏ"/"xoá". Yêu cầu mơ hồ thì hiểu là sửa nội dung trong bài; muốn xoá thì hỏi trước và nêu rõ tên bài.

## Git

- Remote `github.com/Drakie14/CTF-WU`, branch `main`. Có standing consent: tự `commit`/`push`/`pull --rebase`, không cần hỏi.
- Commit message tiếng Việt: `content: ...` / `content(<Giải>): ...` cho bài viết; `feat:` / `fix:` / `perf:` cho code blog.
- Dừng lại hỏi khi có conflict hoặc thao tác mất dữ liệu (force-push, `reset --hard`, xoá bài).

## Phạm vi

Chỉ làm trong `/mnt/d/Hiếu/blog` và `/mnt/d/Hiếu/CTF`. Không truy cập phần khác của `/mnt/d/Hiếu`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
