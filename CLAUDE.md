# CLAUDE.md — Blog CTF Writeups

Repo blog CTF cá nhân của Hiếu. Bài viết nằm trong `src/content/posts/<Giải>/...`.

## Văn phong viết writeup (quan trọng)

Bài mẫu chuẩn — **chính là văn phong của tác giả**: [`src/content/posts/PortSwigger/XSS.md`](src/content/posts/PortSwigger/XSS.md). Mọi bài mới hoặc chỉnh sửa phải bám theo:

- **Ngôi xưng:** luôn dùng **"ta"** (không "mình"/"tôi"/"chúng ta"). VD: "ta thấy", "ta nhận thấy", "ta thử nhập".
- **Cấu trúc mỗi bài/lab:** `## Tên` → `#### Đề bài` (giữ **nguyên** đề gốc tiếng Anh) → `#### Solution`.
- **Mở đầu solution:** "Truy cập vào lab, ta thấy:" + ảnh; "Thử nhập payload `1`" để quan sát input được chèn ở đâu; trích **đoạn source code cần lưu ý** rồi chỉ ra "input của user đã được chèn vào ở đoạn này".
- **Dẫn tới đáp án bằng mũi tên:** `-> Payload: ...` / `-> Flag: ...` / `-> URL: ...`.
- **Giải thích payload:** đánh số **1. 2. 3.** mổ xẻ từng thành phần làm gì (`` `"` để đóng attribute ``, "tận dụng `\">` còn dư của source").
- **Code block:** cú pháp HackMD với dấu `!` — ` ```html! `, ` ```javascript! `, ` ```bash! `; ảnh `![image](url)`.
- **Callout HackMD:** `:::warning`, `:::info` ... `:::`; blockquote `>` cho giải thích sâu; `<center>...</center>` để vẽ luồng suy luận.
- **Giọng điệu:** giảng giải, tự đặt câu hỏi tu từ rồi trả lời ("Vậy `template string` là gì?"); giải thích **cơ chế đằng sau**, không chỉ nêu đáp án.
- **Thuật ngữ kỹ thuật giữ tiếng Anh** chèn trong câu Việt: attribute, event, source, sink, parser, encode/escape, element, tag, payload. Từ quen dùng: "tận dụng", "... còn dư", "thoát khỏi", "kích hoạt event", "chèn mã độc", "trick parser", "con đường vòng", "kinh điển", "May mắn thay".
- **KHÔNG thêm mục "Bài học"/"Kết luận"** ở cuối — kết bài dừng ngay ở payload/flag cuối.
- Chèn **link tham khảo inline** (PortSwigger, w3schools, MDN, spec) khi giới thiệu khái niệm mới.

## Nội dung & flag

- **Luôn ưu tiên flag thật**, không để placeholder `NNS{...}` / `csaw{...}` nếu có thể lấy được (chạy exploit với server còn live, tra writeup khác/CTFtime, hoặc hỏi tác giả). Chỉ để placeholder khi thực sự không còn cách và nói rõ.
- Khi **chỉnh giọng** cho bài cũ: chỉ sửa văn phong/cấu trúc, **không đổi nội dung kỹ thuật, payload hay flag**.

## Git

- Repo: remote `github.com/Drakie14/CTF-WU`, branch `main`. Có standing consent: tự `commit`/`push`/`pull` (rebase) — không cần hỏi. Commit message tiếng Việt: `content: ...`, `content(<Giải>): ...`.
- Dừng lại hỏi khi có **conflict** hoặc thao tác **mất dữ liệu** (force-push, reset --hard).

## Phạm vi

- Chỉ làm trong `/mnt/d/Hiếu/Blog` và `/mnt/d/Hiếu/CTF`. Không truy cập phần khác của `/mnt/d/Hiếu`.
