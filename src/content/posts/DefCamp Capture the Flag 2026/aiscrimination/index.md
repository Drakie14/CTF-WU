---
title: AIscrimination - Inclusion Design System
date: 2026-09-19
ctf: DefCamp Capture the Flag 2026
category: web
difficulty: medium
tags:
  - Web
  - CSS Injection
  - LFI
  - "@import"
---

## Đề bài

Inclusion Design System — a platform that renders everyone's identity as a shared design fragment.

> What is the flag hidden by the inclusion design system?

Flag Format: `CTF{sha256}`

## Solution

Truy cập vào challenge, ta thấy một landing page bình thường, phần có ích bắt đầu từ form `/join`. Form này nhận ba trường: `display_name`, `comment` và `statement`. Gửi một profile hợp lệ, server trả về redirect kèm session cookie, và từ đó ta có một `profile_id` để xem lại hồ sơ của mình tại:

```http!
GET /people/<profile_id>
```

Trong response của profile, ta để ý thấy hai thứ đáng chú ý:

```html!
<span class="imported-fragment"></span>
<link rel="stylesheet" href="/assets/cards/<profile_id>/identity.css">
```

Mỗi profile có một stylesheet **riêng**, và nội dung CSS này phản ánh lại đúng cái `statement` mà ta đã gửi. Thử gửi một statement bình thường như `I belong here.`, ta mở file `identity.css` lên và thấy nó được render thành pseudo-element:

```css!
.identity-card::after {
  content: "I belong here.";
}
```

Input của user đã được chèn vào ở đoạn này — tức là `statement` không chỉ nằm trong HTML, nó còn đi thẳng vào một **CSS renderer phía server** rồi được nhét vào trong `content: "..."`.

### Loại các hướng sai

Phản xạ đầu tiên khi thấy input echo lại là thử SSTI. Ta nhập `{{7*7}}`:

```css!
.identity-card::after {
  content: "{{7*7}}";
}
```

Payload vẫn xuất hiện nguyên dạng, không bị evaluate — vậy đây không phải Jinja/SSTI. Các route kinh điển kiểu `/flag`, `/flag.txt`, static path hay vài biến thể traversal trên HTTP đều không trả về gì. Điều này cho ta phân biệt rõ **hai namespace** khác nhau:

1. HTTP route của web app.
2. File path mà cái renderer server-side kia có thể đọc được.

May mắn thay, bài editorial tại `/posts/reused-component` để lại một clue khá rõ: style fragment không còn bị copy thủ công nữa, và path rules được mô tả là *"intuitive"*. Đáng chú ý nhất là câu:

> If the renderer can find it, the renderer will include it. I hate that sentence.

Chữ *"inclusion"* trong tên bài, cộng với câu *"the renderer will include it"* — tất cả đang trỏ về một hướng: ta cần điều khiển **CSS import resolver** của server, chứ không phải đi mò endpoint flag.

### Break out khỏi CSS string và kích hoạt `@import`

Vì `statement` được nhét vào giữa `content: "..."`, ta có thể thoát khỏi chuỗi đó để chèn declaration mới. Payload cho `statement`:

```css!
x"; } @import url("/static/feed.css"); /*
```

Ta mổ xẻ từng thành phần:

1. `x"` đóng chuỗi CSS `content: "..."` còn dư của source.
2. `; }` đóng nốt declaration và rule hiện tại.
3. `@import url("...")` chèn một CSS import mà renderer sẽ phải xử lý.
4. `/*` comment toàn bộ phần template còn lại để output vẫn parse được.

Kết quả render ra không còn là statement echo lại nữa, mà server thay directive bằng một marker design fragment — chứng tỏ `@import` **đã được parse và resolve ở phía server**.

### Từ `@import` tới local file read

Vậy giờ câu hỏi là: resolver này đọc được gì? Thử import theo relative path `@import url("flag.css")` chỉ nhận lại marker *"design fragment unavailable"*, relative traversal cũng không ăn thua. Nhưng khi ta đưa thẳng một **absolute filesystem path**:

```css!
@import url("/etc/passwd");
```

thì nội dung `/etc/passwd` chui thẳng vào CSS pseudo-element — ta đọc được các dòng `root:x:0:0:...` và một user tên `ctf`. Đây là bằng chứng trực tiếp cho **local file read** qua CSS import resolver: renderer tin tưởng tuyệt đối đường dẫn trong `@import` và cho phép cả absolute path.

Có user `ctf` rồi, path flag gần như hiện ra trước mắt. Payload LFI tối giản cuối cùng:

```css!
x"; } @import url("/home/ctf/flag.txt"); /*
```

-> `/flag.txt` gọi như HTTP route thì vô dụng, nhưng gọi như absolute path trong `@import` mới đúng là primitive ta cần. Đọc lại `identity.css` của profile vừa tạo (nhớ lấy đúng `profile_id` decode từ session của chính request `/join`, đừng vớ nhầm profile cũ ở trang chủ), ta trích được chuỗi `CTF{...}` mà server đã render vào trong `content`.

-> Flag: `CTF{5bb9cb8b8ff43e243fe85fceaf646e7ba6a5c80250e96678be2aa71add38eb97}`
