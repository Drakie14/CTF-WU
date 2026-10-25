---
title: Bypass IF
date: 2026-10-14
ctf: Dreamhack
category: web
difficulty: Bronze 3
tags:
  - Command Injection
  - Timeout
---

# Đề bài
Admin's `KEY` is required! Enter an appropriate `KEY` value to obtain a flag.

The flag format is DH {...} This is it.
https://dreamhack.io/wargame/challenges/1151
# Solution 
Đọc source code, thấy admin có key bị ẩn và guest có key công khai
![image](https://hackmd.io/_uploads/HyHku7jsMe.png)
-> `guest_key` = `084e0343a0486ff05530df6c705c8bb4`
![image](https://hackmd.io/_uploads/H17wuXssMe.png)

![image](https://hackmd.io/_uploads/rkFI_mioGg.png)

Vậy nhận ra chỉ cần tìm được key của admin thì sẽ lấy được flag
![image](https://hackmd.io/_uploads/HkluzuQijzx.png)
Thấy có khi ta gửi cmd thì sau 5s, nếu lệnh vẫn chưa chạy thì hiện key
-> ta chỉ cần gửi `cmd` sleep >5s để kích hoạt lỗi timeout
![image](https://hackmd.io/_uploads/Byjou7iszx.png)
-> admin key: 
`409ac0d96943d3da52f176ae9ff2b974409ac0d96943d3da52f176ae9ff2b974`
![image](https://hackmd.io/_uploads/rk9nDXijzl.png)
-> Flag:
`DH{9c73a5122e06f1f7a245dbe628ba96ba68a8317de36dba45f1373a3b9a631b92}`