---
title: Chrono II
date: 2026-10-01
ctf: CSS CTF
category: crypto
difficulty: medium
tags:
  - Crypto
  - Vigenère
  - Known-plaintext
  - Keystream
---

## Đề bài
We have again intercepted their talk and the cipher text, but this time it seems like its always changing. Help us!

"The Time is ticking, it will never stop, no one will ever decrypt it"

http://34.116.80.78:8001

Flag Format: `CSSCTF{...}`

## Solution

### Quan sát ban đầu

Mở `http://34.116.80.78:8001` là một chiếc đồng hồ, bên cạnh là log `/api/feed`: mỗi giây thêm một bản ghi `{timestamp, ciphertext}`, cửa sổ luôn giữ **60 bản ghi / 60 giây liên tiếp**. Ciphertext đổi liên tục nên nhìn như "không thể giải".

Hai nhận xét then chốt:

1. **Plaintext là cố định.** Mọi ciphertext đều có dạng `CSSCTF{3_5_9_5_6}` (độ dài các nhóm giống hệt nhau). Đây chính là **một flag duy nhất** bị mã hóa bằng nhiều key khác nhau — key mới đổi mỗi giây, còn flag thì không.

2. **Dãy ciphertext lặp lại.** Capture hôm nay và hôm trước cho cùng một dãy 60 ciphertext (chỉ khác timestamp hiển thị). Nghĩa là key không phụ thuộc thời gian thực; đây là một dãy cố định trượt qua cửa sổ 60 giây → giải được hoàn toàn offline.

Vì prefix `CSSCTF` đã biết, với mỗi bản ghi `r` ta lấy ngay được 6 giá trị key đầu:

```
key(r, c) = ciphertext[r][c] - "CSSCTF"[c]   (mod 26),  c = 0..5
```

### Cấu trúc keystream

Xếp 6 cột key này theo các bản ghi, ta thấy các cột chỉ là bản dịch (rotation) của nhau — tức là tồn tại **một keystream chung `M`**, và mỗi vị trí ký tự chỉ lấy một phần tử của `M`. Dò độ lệch giữa các cột cho ra:

```
key(r, c) = M[(r + 43*c) mod 77]
```

với `c` là **thứ tự ký tự alnum** (bỏ qua `{ _ }`, nhưng vẫn đếm các chữ số trong flag). Chu kỳ là **77** chứ không phải 60: cửa sổ 60 giây chỉ là một đoạn trượt của dãy dài 77 phần tử. Đúng tinh thần Chrono I — *"every second hides a secret"* — mỗi giây là một mảnh của cùng một keystream.

6 cột đã biết × 60 bản ghi phủ trọn cả 77 chỉ số của `M`, nên dựng lại `M` đầy đủ rồi giải mọi vị trí còn lại. Vì flag cố định, mỗi vị trí phải cho **cùng một ký tự ở cả 60 bản ghi** — đây vừa là cách giải vừa là cách kiểm chứng.

```python
import json
from collections import Counter
# urllib.request.urlopen("http://34.116.80.78:8001/api/feed") hoặc dùng feed đã lưu
data = json.load(open("feed.json"))
N, known = 77, "CSSCTF"

# 1. Dựng keystream M (period 77) từ prefix đã biết
M = {}
for r in range(60):
    ct = data[r]["ciphertext"]
    for c in range(6):
        M[(r + 43 * c) % N] = (ord(ct[c].lower()) - ord(known[c].lower())) % 26
assert len(M) == 77

# 2. Giải từng vị trí, bỏ phiếu 60/60
sample = data[0]["ciphertext"]
flag, o = [], -1
for pos, ch in enumerate(sample):
    if not ch.isalnum():
        flag.append(ch); continue
    o += 1
    votes = Counter()
    for r in range(60):
        cc = data[r]["ciphertext"][pos]
        k = M[(r + 43 * o) % N]
        if cc.isalpha():
            b = ord("A") if cc.isupper() else ord("a")
            votes[chr((ord(cc) - b - k) % 26 + b)] += 1
        else:                                  # chữ số: mod 10
            votes[str((int(cc) - k) % 10)] += 1
    ch_best, cnt = votes.most_common(1)[0]
    assert cnt == 60                           # đồng thuận tuyệt đối => flag thật
    flag.append(ch_best)

print("".join(flag))   # CSSCTF{th3_cl0ck_r3m3mb3rs_3very_s3c0nd}
```

Mọi vị trí đều đồng thuận 60/60; chạy trên một cửa sổ `/api/feed` khác (điểm bắt đầu khác) vẫn ra đúng flag đó.

## Flag

```
CSSCTF{th3_cl0ck_r3m3mb3rs_3very_s3c0nd}
```
