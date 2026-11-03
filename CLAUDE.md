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
  difficulty: Bronze 3    # thang Dreamhack: Sprout | Bronze/Silver/Gold/Platinum/Diamond/Master 4..1 (1 là khó nhất)
  tags: [Web, Cookie]
  ```
  Loader có fallback khi metadata sai; `npm run build` chạy strict và fail nếu có warning. Dùng `npm run content:check` để rà metadata, `npm run validate` để kiểm tra đầy đủ.
- Kiểm tra sau khi sửa: `npm run build` (lỗi cú pháp markdown, ảnh hỏng, code fence lạ đều hiện ở warning).

## Văn phong

Giữ giọng viết tự nhiên của tác giả. Có thể tham khảo [`XSS.md`](src/content/posts/PortSwigger/XSS.md) cùng các bài Dreamhack, aochinh26, OverTheWire; không ép mọi bài theo một khuôn.

- Ngôi xưng linh hoạt: "ta", "tôi", "mình" hoặc cách kể phù hợp ngữ cảnh. Không tự đổi ngôi xưng ở bài cũ.
- Đề bài giữ nguyên bản gốc; không tự dịch hoặc sửa định dạng.
- Solution đi theo cách giải thực tế: đọc source, quan sát giao diện, thử-sai hoặc giải thích cơ chế. Không bắt buộc mở bằng một câu cố định hay phải có ảnh nếu không cần thiết.
- Có thể dùng `-> Payload:`, `-> Flag:`, `-> URL:` và danh sách đánh số khi giúp giải thích rõ hơn; không bắt buộc.
- Thuật ngữ kỹ thuật giữ tiếng Anh khi phù hợp. Thêm link tham khảo khi hữu ích.
- Có thể tiếp tục giải thích sau payload/flag, thêm nhận xét hoặc kết luận nếu tác giả muốn.
- Chữ đậm, callout và heading được dùng vừa phải để hỗ trợ việc đọc; ưu tiên câu chữ rõ ràng, tránh nhãn giật gân và đoạn văn khuôn mẫu.
- Khi rà bài cũ, chỉ sửa metadata sai lệch nếu đó là phạm vi được yêu cầu. Giữ nguyên nội dung, văn phong, payload và flag, kể cả placeholder/test flag, trừ khi tác giả yêu cầu sửa trực tiếp.

## Cú pháp markdown (HackMD)

- Code block có dấu `!` để tự xuống dòng: ` ```html! `, ` ```javascript! `, ` ```bash! `, ` ```python! `.
- Ảnh: `![image](url)`. Ảnh remote (hackmd.io, imgur) được tải về `remote-images/` lúc build; thư mục này được commit để build không phụ thuộc HackMD, bài mới có ảnh remote thì build local rồi commit kèm file mới trong đó.
- Callout: `:::info`, `:::success`, `:::warning`, `:::danger` ... `:::`. Blockquote `>` cho giải thích sâu; `<center>...</center>` để vẽ luồng suy luận.

## Nội dung & flag

- Với bài mới, ưu tiên flag thật nếu đã có; ghi rõ khi chỉ xác minh được trên local. Khi rà bài cũ, giữ nguyên flag/placeholder hiện có trừ khi tác giả yêu cầu sửa; không tự chạy exploit hay tìm flag thay thế.
- Khi chỉnh giọng cho bài cũ: chỉ sửa văn phong/cấu trúc, **không đổi nội dung kỹ thuật, payload hay flag**.
- **Không bao giờ tự xoá bài writeup** (file hoặc thư mục trong `src/content/posts`) khi chưa hỏi tác giả, kể cả khi yêu cầu có chữ "bỏ"/"xoá". Yêu cầu mơ hồ thì hiểu là sửa nội dung trong bài; muốn xoá thì hỏi trước và nêu rõ tên bài.

## Git

- Remote `github.com/Drakie14/CTF-WU`, branch `main`. Có standing consent: tự `commit`/`push`/`pull --rebase`, không cần hỏi.
- Kéo về bằng `npm run sync` thay cho `git pull --rebase`. Studio publish thẳng lên GitHub nhưng vẫn ghi file vào `src/content/posts` local, nên các file đó là untracked và làm `git pull` báo "untracked working tree files would be overwritten". `npm run sync` chỉ gỡ những file giống hệt bản trên origin rồi pull; gặp file khác bản origin thì dừng và liệt kê, khi đó hỏi tác giả.
- Commit message tiếng Việt: `content: ...` / `content(<Giải>): ...` cho bài viết; `feat:` / `fix:` / `perf:` cho code blog.
- Dừng lại hỏi khi có conflict hoặc thao tác mất dữ liệu (force-push, `reset --hard`, xoá bài).

## Phạm vi

Chỉ làm trong `/mnt/d/Projects/Blog` và `/mnt/d/Security/CTF`. Không truy cập thư mục khác trên `/mnt/d`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
