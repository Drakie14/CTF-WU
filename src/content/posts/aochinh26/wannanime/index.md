---
title: wannanime
draft: false
date: 2026-10-04
ctf: aochinh26
category: web
difficulty: Silver 2
tags:
  - Flask Session
  - SQL Injection
  - UNION
  - Path Traversal
  - os.path.join
---

# Đề bài
File: [wannanime](https://github.com/Drakie14/Challenges/blob/aochinh26/wannanime.zip)

# Solution
Truy cập trang web, ta thấy giao diện sau:

![image](https://hackmd.io/_uploads/HJl-UsL3fe.png)

Ta đăng kí thử 1 tài khoản rồi log in:

![image](https://hackmd.io/_uploads/HJXzLiUhfl.png)

`username: 67` và `password: 1`

Sau khi login ta thấy dashboard như sau:

![image](https://hackmd.io/_uploads/Skl3rLjI2zg.png)

## CSRF
Check thử cookie, ta thấy session có 1 đoạn giống như Base64 encoded:

![image](https://hackmd.io/_uploads/ByzHPoI3fe.png)

-> session: 
==`eyJyb2xlIjoidXNlciIsInVzZXJuYW1lIjoiNjcifQ`.atkmMw.HwkHX_h-hY6cHqREpJM6EKsdnR4==

![image](https://hackmd.io/_uploads/HJp7PjL2ze.png)

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

### Sửa trực tiếp

Ta thử thay role từ user thành admin, Base64 encode rồi ném lại vào cookie session xem được không:

![image](https://hackmd.io/_uploads/ryKDvsUnfe.png)

-> ==`eyJyb2xlIjoiYWRtaW4iLCJ1c2VybmFtZSI6IjY3In0=`.atkmMw.HwkHX_h-hY6cHqREpJM6EKsdnR4==

Bấm F5 để refresh nhưng lại trả ta về trang chủ -> Thất bại.

Nhận thấy token của Flask gắn liền với 1 user cố định (được ký bằng `SECRET_KEY` của server) nên nếu đổi payload thì cũng phải tạo Flask token mới — điều ta không thể làm được khi không có key.

### Thử chèn input thông qua username để đạt được role `admin`

Ta thử cách khác với payload sau:

`username: ","role":"admin` và `password: 1`

![image](https://hackmd.io/_uploads/SkN9wiLnfl.png)

Sau khi đăng nhập thu được cookie session: ==`eyJyb2xlIjoidXNlciIsInVzZXJuYW1lIjoiXCIsXCJyb2xlXCI6XCJhZG1pbiJ9`.atknmg.s5-MPtCD75TTIDlYoYVhviXPa8Y==

![image](https://hackmd.io/_uploads/rk04ti8nGe.png)

Nhận thấy `"` đã bị escaped. Sau đó thử với `\` thì nhận thấy cũng bị escaped.

=> Ta từ bỏ hướng kiểm soát session.

## SQL Injection

Sau khi thử kiểm soát cookie session thất bại, ta quay trở lại với việc đọc code.

Ở các route như `/register` và `/login` sử dụng `%s` làm placeholder cho các values nên ta không thể sử dụng các route này để SQL Injection.

Nhưng ở route `/dashboard` có tồn tại:

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

### Dùng `comment` để phần dư `\'` không gây lỗi

Trong SQL, máy nhận biết comment trên 1 dòng thông qua `--` 
Vì vậy payload của ta phải luôn có `-- \` ở cuối.

### SQL code để lấy password của admin

Sau khi thoát khỏi được SQL string và không gây lỗi, giờ ta cần tìm cách thực hiện một query khác ngay trên 1 dòng lệnh.

### `INSERT INTO users (username, password, role)`

Vào lúc làm bài thì thay vì suy nghĩ đến việc sử dụng ==SELECT== để lấy về password của admin, tôi lại lỡ suy nghĩ đến con đường vòng là đăng kí 1 user với role là admin.

Đáng tiếc thay sau một lúc lâu tìm kiếm và thử nghiệm thì nhận ra việc thực hiện nhiều query khác nhau trên 1 câu lệnh là không thể.

### `UNION`

Sau khi kiên trì tìm kiếm, ta tìm được query ==UNION== để ghép 2 query ==SELECT== lại với nhau.

Tài liệu tham khảo thêm về UNION:
1. https://support.microsoft.com/vi-vn/access/use-a-union-query-to-combine-multiple-queries-into-a-single-result
2. https://www.w3schools.com/sql/sql_union.asp

Trước tiên, ta thử đọc hết thông tin của users bằng payload sau:

-> `UNION SELECT * FROM users -- \`

Code python có dạng như sau:

-> ==count = math.ceil(cursor.execute(f"SELECT * FROM anime WHERE LOWER(title) REGEXP `'UNION SELECT * FROM users -- \' or LOWER(description) REGEXP '`UNION SELECT * FROM users -- \' ") / size)==

Nhận thấy trang trả về `not_found.html` thay vì thông tin của user. Ta lại quay về đọc thêm về ==UNION== và tìm được rằng:

:::warning
Nhớ rằng ==UNION== đặc biệt yêu cầu mọi ==SELECT== phải có chung số cột và chung kiểu dữ liệu
![image](https://hackmd.io/_uploads/SJfDFjUhfe.png)
:::

Giờ ta quan sát `init.sql`, nhận thấy:

1. `anime` có 5 cột (id, title, image_url, genres, description)
```sql
CREATE TABLE IF NOT EXISTS anime (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    genres TEXT NOT NULL,
    description TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

2. `users` có 4 cột (id, username, password, role)
```sql
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    role VARCHAR(10) NOT NULL DEFAULT 'user'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

Đó là lí do tại sao `SELECT * FROM anime` lại không thể ==UNION== với `SELECT * FROM users`.

Ta thử lại với payload khác:

`UNION SELECT password, password, password, password, password FROM users -- \`

:::warning
Sử dụng `password` hết để chỉ hiển thị password thay vì các thông tin dư thừa khác và khiến kiểu dữ liệu của 2 bên ==SELECT== giống nhau
:::

Lần này SQL Injection đã kích hoạt thành công và trả về thông tin như sau:

![image](https://hackmd.io/_uploads/rkU69i82Me.png)

-> admin password: `this_is_fake_admin_password_will_be_change_in_prod`
## Path Traversal

Bây giờ ta đăng nhập vào account `admin`.

Tại route `/admin` mà chỉ có riêng user với role `admin` vào được, ta đọc source code:
```python
@app.get('/admin')
def admin():
    if ('username' not in session or session['username'] != 'admin'):
        return 'Bạn không phải admin'
    filename = request.args.get('filename', None)

    if filename is None:
        return 'No filename provided', 400

    while '../' in filename:
        filename = filename.replace('../', '')

    return open(os.path.join('files/', filename),'rb').read()
```

Nhận thấy web cấm `../` để leo lên các file trước.

### Encode `../`

Ta đã thử và áp dụng các phương pháp trong [Link](https://github.com/swisskyrepo/PayloadsAllTheThings/blob/master/Directory%20Traversal/README.md#methodology) để tìm cách bypass phương pháp bảo mật này.

Nhưng tất cả đều trả về một kết quả duy nhất: THẤT BẠI (╥﹏╥)

### os.path.join()

Thế là ta lại đi research về hàm [os.path.join](https://docs.python.org/3/library/os.path.html#os.path.join) thì nhận thấy nếu `filename` là [absolute path](https://www.linuxfoundation.org/blog/blog/classic-sysadmin-absolute-path-vs-relative-path-in-linux-unix) thì vẫn sẽ đọc được file.

![image](https://hackmd.io/_uploads/B1OQhsU2Gl.png)

Đây là một trường hợp kinh điển đã được nhắc đến trong PortSwigger:

![image](https://hackmd.io/_uploads/H1SY3sI3fx.png)

Vậy ta thử với [/etc/passwd](https://www.cyberciti.biz/faq/understanding-etcpasswd-file-format/) và thu được đoạn response khả nghi:

```
ctf:x:1000:1000::/this_is_fake_directory_in_prod_this_is_random:/bin/sh
```

![image](https://hackmd.io/_uploads/HJM-as8nMe.png)

Vậy phân tích đoạn response trên:
1. Username: `ctf`
2. Password: `x`
3. User ID (UID): `1000`
4. Group ID (GID): `1000`
5. User ID Info (GECOS): ` `
6. Home directory: `/this_is_fake_directory_in_prod_this_is_random`
7. Command/shell: `/bin/sh`

Vậy ta đã có Home directory để dùng absolute path.

-> URL: 
```
/admin?filename=/this_is_fake_directory_in_prod_this_is_random/flag.txt
```

![image](https://hackmd.io/_uploads/HkHN6iUnfe.png)

-> Flag:

```
flag{fake_flag}
```
