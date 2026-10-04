---
title: wannanime
date: 2026-10-04
ctf: Giới thiệu ngành
category: web
difficulty: medium
tags:
  - Flask Session
  - SQL Injection
  - UNION
  - Path Traversal
  - os.path.join
---

## Đề bài
File: [wannanime](https://github.com/Drakie14/Challenges/blob/aochinh26/wannanime.zip)

## Solution
Truy cập trang web, ta thấy giao diện sau:

![image](https://hackmd.io/_uploads/rJ0nI7RqGl.png)

Ta đăng kí thử 1 tài khoản rồi log in:

![image](https://hackmd.io/_uploads/S1OzuXA5Gx.png)

`username: 67` và `password: 1`

Sau khi login ta thấy dashboard như sau:

![image](https://hackmd.io/_uploads/HkPu_mR9ze.png)

### Session

Check thử cookie, ta thấy session có 1 đoạn giống như Base64 encoded:

![image](https://hackmd.io/_uploads/SynH57R9Gl.png)

-> ==`eyJyb2xlIjoidXNlciIsInVzZXJuYW1lIjoiNjcifQ`.asCoQQ.UB3Ea2R7OTEoDHM1zIxh9t2Qiyc==

![image](https://hackmd.io/_uploads/BJAEnmAczx.png)

Mà trong `init.sql` có:

```sql!
INSERT INTO users (username, password, role) VALUES ('admin', 'this_is_fake_admin_password_will_be_change_in_prod', 'admin');
```

và trong `app.py` có route `/admin`:

```python!
@app.get('/admin')
def admin():
    if ('username' not in session or session['username'] != 'admin'):
        return 'Bạn không phải admin'
    filename = request.args.get('filename', None)
```

-> Ta cần `role : admin` để truy cập vào route này.

#### Sửa trực tiếp

Ta **ngây thơ** thử thay role từ user thành admin, Base64 encode rồi ném lại vào cookie session xem được không:

![image](https://hackmd.io/_uploads/S1dXAQR9fe.png)

-> ==`eyJyb2xlIjoiYWRtaW4iLCJ1c2VybmFtZSI6IjY3In0=`.asCoQQ.UB3Ea2R7OTEoDHM1zIxh9t2Qiyc==

Bấm F5 để refresh nhưng lại trả ta về trang chủ -> Thất bại.

Nhận thấy token của Flask gắn liền với 1 user cố định (được ký bằng `SECRET_KEY` của server) nên nếu đổi payload thì cũng phải tạo Flask token mới — điều ta không thể làm được khi không có key.

#### Thử chèn input thông qua username để đạt được role `admin`

Ta thử cách khác với payload sau:

`username: ","role":"admin` và `password: 1`

![image](https://hackmd.io/_uploads/B1cRb4A9zl.png)

Sau khi đăng nhập thu được cookie session: ==`eyJyb2xlIjoidXNlciIsInVzZXJuYW1lIjoiXCIsXCJyb2xlXCI6XCJhZG1pbiJ9`.asCx8g.ruEyLft8646w9bsK_CaineiWyIM==

![image](https://hackmd.io/_uploads/ry7w9VRcfg.png)

Nhận thấy `"` đã bị escaped. Sau đó thử với `\` thì nhận thấy cũng bị escaped.

=> Ta từ bỏ hướng kiểm soát session.

## SQL Injection

Sau khi thử kiểm soát cookie session thất bại, ta quay trở lại với việc đọc code.

Ở các route như `/register` và `/login` sử dụng `%s` làm placeholder cho các values nên ta không thể sử dụng các route này để SQL Injection.

**Nhưng** ở route `/dashboard` có tồn tại:

```python!
count = math.ceil(cursor.execute(f"SELECT * FROM anime WHERE LOWER(title) REGEXP '{keyword}' or LOWER(description) REGEXP '{keyword}'") / size)
```

Với [cursor.execute](https://www.mcobject.com/docs/Content/Programming/Python/Classes/Cursor/execute.htm) thực hiện lệnh SQL nằm trong, input của user được truyền thẳng vào thông qua param `keyword`.

-> Có khả năng khai thác thông qua SQL Injection.

### Thoát khỏi SQL string để chèn SQL code

Ta thấy dấu `'` bị cấm khi inspect đoạn code sau tại route `/dashboard`:

```python!
if ("'" in keyword):
    return render_template('not_found.html')
```

=> Không thể thoát khỏi query `REGEXP` một cách trực tiếp bằng `'` được.

Nhận thấy `keyword` xuất hiện 2 lần trên cùng 1 dòng lệnh SQL, ta tìm cách để khai thác.

Ta thấy trên dòng lệnh này có 4 dấu `'`, ta đánh số thứ tự từ 1 tới 4 để dễ nhận biết và phân biệt. Có `(1,2)` và `(3,4)` đi với nhau tạo 2 string.

Nhận thấy việc để `\` ở cuối sẽ biến `'` thứ 2 bị escaped thành string.

-> Payload: `\`

-> Python:

```python!
count = math.ceil(cursor.execute(f"SELECT * FROM anime WHERE LOWER(title) REGEXP '\' or LOWER(description) REGEXP '\'") / size)
```

Tạo cặp `(1,3)` là 1 chuỗi string dài:

-> `'\' or LOWER(description) REGEXP '`

### SQL code để lấy password của admin

Sau khi thoát khỏi được SQL string, giờ ta cần tìm cách thực hiện một query khác ngay trên 1 dòng lệnh.

#### `INSERT INTO users (username, password, role)`

Vào lúc làm bài thì thay vì suy nghĩ đến việc sử dụng ==SELECT== để lấy về password của admin, ta lại suy nghĩ đến việc đăng kí 1 user với role là admin.

Đáng tiếc thay sau một lúc lâu tìm kiếm và thử nghiệm thì ta nghĩ việc thực hiện nhiều query khác nhau trên 1 câu lệnh là không thể.

#### `UNION`

May mắn thay sau khi kiên trì tìm kiếm, ta tìm được query ==UNION== để ghép 2 query ==SELECT== lại với nhau.

Tài liệu tham khảo thêm về UNION:
1. https://support.microsoft.com/vi-vn/access/use-a-union-query-to-combine-multiple-queries-into-a-single-result
2. https://www.w3schools.com/sql/sql_union.asp

Trước tiên, ta thử đọc hết thông tin của users bằng payload sau:

-> `UNION SELECT * FROM users -- \`

Code python có dạng như sau:

-> ==count = math.ceil(cursor.execute(f"SELECT * FROM anime WHERE LOWER(title) REGEXP `'UNION SELECT * FROM users -- \' or LOWER(description) REGEXP '`UNION SELECT * FROM users -- \'") / size)==

Nhận thấy trang trả về `not_found.html` thay vì thông tin của user. Ta lại quay về đọc thêm về ==UNION== và tìm được rằng:

:::warning
Nhớ rằng ==UNION== đặc biệt yêu cầu mọi ==SELECT== phải có chung số cột.
![image](https://hackmd.io/_uploads/HyvxkL0qMg.png)
:::

Giờ ta quan sát `init.sql`, nhận thấy:

1. `anime` có 5 cột (id, title, image_url, genres, description)
![image](https://hackmd.io/_uploads/SkWheVyjMl.png)

2. `users` có 4 cột (id, username, password, role)
![image](https://hackmd.io/_uploads/Sy_TGaRcMx.png)

Đó là lí do tại sao `SELECT * FROM anime` lại không thể ==UNION== với `SELECT * FROM users`.

Ta thử lại với payload khác:

`UNION SELECT id, username, password, role, NULL FROM users -- \`

Lần này SQL Injection đã kích hoạt thành công và trả về thông tin như sau:

![image](https://hackmd.io/_uploads/HkCNnEksGx.png)

| username | password |
| -------- | -------- |
| admin    | this_is_fake_admin_password_will_be_change_in_prod |
| 67       | 1 |
| ","role:"admin | 1 |

## Path Traversal

Bây giờ ta đăng nhập vào account `admin`.

Tại route `/admin` mà chỉ có riêng user với role `admin` vào được, ta đọc source code:

![image](https://hackmd.io/_uploads/r1khkSJizg.png)

Nhận thấy web cấm `../` để leo lên các file trước.

### Encode `../`

Ta đã thử và áp dụng các phương pháp trong [Link](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Directory%20Traversal/README.md#methodology) để tìm cách bypass phương pháp bảo mật này.

Nhưng tất cả đều trả về một kết quả duy nhất: THẤT BẠI (╥﹏╥)

### os.path.join()

Thế là ta lại đi research về hàm [os.path.join](https://docs.python.org/3/library/os.path.html#os.path.join) thì nhận thấy nếu `filename` là [absolute path](https://www.linuxfoundation.org/blog/blog/classic-sysadmin-absolute-path-vs-relative-path-in-linux-unix) thì vẫn sẽ đọc được file.

![image](https://hackmd.io/_uploads/S1IC4Skozg.png)

Đây là một trường hợp kinh điển đã được nhắc đến trong PortSwigger:

![image](https://hackmd.io/_uploads/S1VwmBkjMl.png)

Vậy ta thử với [/etc/passwd](https://www.cyberciti.biz/faq/understanding-etcpasswd-file-format/) và thu được đoạn response khả nghi:

```
ctf:x:1000:1000::/this_is_fake_directory_in_prod_this_is_random:/bin/sh
```

![image](https://hackmd.io/_uploads/BkfaJ4SJsGg.png)

Vậy phân tích đoạn response trên:
1. Username: `ctf`
2. Password: `x`
3. User ID (UID): `1000`
4. Group ID (GID): `1000`
5. User ID Info (GECOS): ` `
6. Home directory: `/this_is_fake_directory_in_prod_this_is_random`
7. Command/shell: `/bin/sh`

Vậy ta đã có Home directory để dùng absolute path.

-> URL: `/admin?filename=/this_is_fake_directory_in_prod_this_is_random/flag.txt`

![image](https://hackmd.io/_uploads/ByE9wryifx.png)

-> Flag:

```
flag{fake_flag}
```
