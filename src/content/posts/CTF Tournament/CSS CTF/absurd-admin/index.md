---
title: Absurd Admin
date: 2026-09-29
ctf: CSS CTF
category: web
difficulty: Bronze 4
tags:
  - Broken Access Control
  - Cookie Tampering
---

## Đề bài
AI generated this website for us. It's super duper secure!

https://first-flag-absurd-admin.netlify.app/

Flag Format: `FirstFlag{<flag>}`
## Solution
Truy cập vào challenge, ta thấy trang chủ yêu cầu đăng nhập để xem thông tin tài khoản:

![image](./01-home.png)

Vào `/login`, có tài khoản mặc định `guest / guest67`:

![image](./02-login.png)

Đăng nhập bằng `guest`, ta vào được nhưng nhận thông báo `guest does not have access to the flag` 
-> Ta cần là `admin` mới xem được flag.

![image](./03-guest-view.png)

Vậy câu hỏi là: server dựa vào đâu để biết "ta là ai"? Ta mở DevTools tab Network (hoặc dùng `curl`) để soi response của `POST /api/login`, đoạn cần lưu ý là header `Set-Cookie`:

![image](./terminal-curl.png)

```http!
set-cookie: logged_in=guest; Path=/; HttpOnly; SameSite=Lax
```

Ta nhận thấy server lưu thẳng tên đăng nhập vào giá trị cookie mà không ký (sign), không mã hoá, không dùng session id ngẫu nhiên. Khi tải trang chủ, server đọc luôn `logged_in` để quyết định quyền. 
-> Lỗ hổng `Broken Access Control` 

-> Ta chỉ cần sửa cookie `logged_in` từ `guest` thành `admin`.

DevTools -> tab Application -> Cookies -> sửa `logged_in` thành `admin` -> `F5`. Flag hiện ngay trên trang:
![image](./04-admin-flag.png)
-> Flag: `FirstFlag{ch0c0lat3CH1PCookie5}`
