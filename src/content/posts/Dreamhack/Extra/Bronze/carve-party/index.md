---
title: Carve Party
date: 2026-10-23
ctf: Bronze
category: web
difficulty: Bronze 4
tags:
  - Client-side
  - XOR
---

# Đề bài
To celebrate the Halloween party, we have prepared pumpkins! Click the pumpkin 10000 times to get a flag!
https://dreamhack.io/wargame/challenges/96
# Solution 
Khi ta truy cập `index.html` thấy ta cần phải bấm 10000 lần để lấy flag
Nhưng mà đó là cách làm khi đã vào bước đường cùng ಠ‿ಠ

Ta quan sát source code và cùng phân tích logic của trang web này:
1. Đầu tiên khai báo 3 biến: `pumpkin`, `counter` và `pie`
2. function `make` để làm cho pumpkin hiện ra flag
3. function `click` để đảm bảo người chơi nhấn 10000 lần mới lấy được flag

Phần quan trọng nhất nằm ở function `click`, nhận thấy click 100 lần thì pumpkin được xor với pie 1 lần. Vậy ta có thể viết 1 script để chủ động xor với số lần đúng theo như function để lấy về flag

10000 lần click và mỗi 100 lần sẽ xor 1 lần, vậy ta chỉ cần tạo một vòng lặp for với bước nhảy 100

```python
pumpkin = [ 124, 112, 59, 73, 167, 100, 105, 75, 59, 23, 16, 181, 165, 104, 43, 49, 118, 71, 112, 169, 43, 53 ];
counter = 0
pie = 1
for counter in range(0,10000,100):
    for i in range(len(pumpkin)):
        pumpkin[i] ^= pie
        pie = ((pie ^ 0xff) + (i * 10)) & 0xff
print("".join([chr(i) for i in pumpkin]))
```
-> Flag: 
`DH{I_lik3_pumpk1n_pi3}`
