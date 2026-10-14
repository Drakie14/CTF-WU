# Đề bài 
Simple but typical image uploader!
https://dreamhack.io/wargame/challenges/2624
# Solution
## Lỗ hổng về logic trong code
Trước tiên ta đọc code của bài, bắt đầu với `upload.php`, thấy đoạn code sau có lỗ hổng
```php
if (!in_array($mime_type, $allowed_mimes) && !in_array($check_extension, $allowed_extensions)) {
        die("<script>alert('Only images allowed.'); history.back();</script>");
    }
```
Vì code sử dụng `&&` (AND) để check file được upload có phải là ảnh không thông qua 2 phần (`mime_type` và `extension`)

Vậy ta có thể up loại file khác bằng cách giữ nguyên 1 trong 2 điều kiện kiểm tra là của loại file ảnh

## Vậy file gì sẽ được thực thi?
Đoc tiếp code của `upload.php`, thấy [move_uploaded_file](https://www.w3schools.com/php/func_filesystem_move_uploaded_file.asp) vào `target_path` là folder `uploads/`
```php
$upload_dir = "uploads/";
```
Mà trong folder `uploads` tồn tại [.htaccess](https://httpd.apache.org/docs/2.2/howto/htaccess.html) 
### File `.htaccess`
`.htaccess` là file cấu hình theo thư mục của Apache. Nó nằm trong một thư mục và Apache đọc lại mỗi khi có request tới thư mục đó, nên có hiệu lực mà không cần khởi động lại server.

Các chỉ thị trong file áp dụng cho thư mục chứa nó và các thư mục con. Mỗi chỉ thị có thể nhắm vào một nhóm file cụ thể.

Điều kiện để nó hoạt động: Apache phải cho phép ghi đè cấu hình qua `AllowOverride`. Bài này đã bật `AllowOverride All` trong Dockerfile.

```
AddType application/x-httpd-php .php .phtml .php3 .php4 .php5 .inc

Options +Indexes

<Files "*">
    Allow from all
</Files>

<FilesMatch "\.php">
    SetHandler application/x-httpd-php
</FilesMatch>
```
* `AddType application/x-httpd-php .php .phtml ...`: gán các đuôi này cho handler PHP, tức là báo Apache chạy các file này bằng PHP.
* `Options +Indexes`: bật liệt kê thư mục. Ai truy cập `uploads/` sẽ thấy danh sách file, kể cả `info.json`.
* `<Files "*"> Allow from all`: cho phép truy cập mọi file (cú pháp Apache 2.2, Apache 2.4 dùng Require all granted).
* `<FilesMatch "\.php"> SetHandler application/x-httpd-php`: mọi file khớp `.php` được đưa cho PHP xử lý.

File này làm cho các file `.php` trong `uploads/` được thực thi, còn file `.gif`, `.jpg` vẫn được trả về như ảnh bình thường.

### Exploit chain
Kết hợp lại, `.htaccess` làm cho file `.php` trong `uploads/` được thực thi. Khi `upload.php` cho phép lưu file `.php` (do lỗi điều kiện), `.htaccess` này biến nó thành mã chạy được trên server.

-> Tạo file `.php` có chứa [signature header](https://en.wikipedia.org/wiki/List_of_file_signatures)  của loại file ảnh
-> khi`finfo_file()`nhận diện thì sẽ nhận diện ra [MIME type](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types) được cho phép
:::warning
**Lưu ý**: `finfo_file()` nhận diện MIME từ byte đầu tiên, không từ chuỗi chữ mà bạn viết.

Trường hợp 1: `image/gif<?php ...`
- Các byte đầu là chữ ASCII `i m a g e / g i f`, không phải chữ ký GIF.
- Chữ ký GIF là `47 49 46 38` (`GIF8`). Chuỗi này bắt đầu bằng `69 6D 61 67` (`imag`), nên không khớp.
- `finfo` trả về `text/plain`, không nằm trong `$allowed_mimes`.

Trường hợp 2: `GIF87a<?php ...`
- Hai byte đầu là `47 49 46` ... `GIF`, và `GIF87a` là chữ ký GIF hợp lệ.
- `finfo` nhận ra đây là GIF và trả về `image/gif`, nằm trong danh sách cho phép.

Nếu bạn muốn kiểm tra trên máy: 
`printf 'image/gif<?php' | file -` sẽ cho `text/plain`
`printf 'GIF87a<?php' | file -` cho `image/gif`.
:::
Trong file đó, sau khi thêm header để code treat như là phải ảnh, ta sử dụng hàm [readfile](https://www.w3schools.com/php/func_filesystem_readfile.asp) tại đoạn lệnh php ở sau để đọc file `flag.txt` ở thư mục hiện tại
-> Payload:
`GIF89A<? readfile("flag.txt"); ?>`

Sau khi tạo, upload file lên web
![image](https://hackmd.io/_uploads/BJaJ6N2iMx.png)
![image](https://hackmd.io/_uploads/rkcqaEnjGl.png)
Vậy sau khi nhấn vào xem file ở `Gallery` thì flag sẽ hiện ra 
![image](https://hackmd.io/_uploads/HJjQaN3sMg.png)
![image](https://hackmd.io/_uploads/BJqrpV2sMg.png)
![image](https://hackmd.io/_uploads/B1ZLTV2iGl.png)
-> Flag: 
`DH{testflag}`
