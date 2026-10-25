---
title: MongoBoard
date: 2026-10-14
ctf: Dreamhack
category: web
difficulty: Bronze 3
tags:
  - MongoDB
  - ObjectId
  - IDOR
---

# Đề bài
This is a bulletin board composed of node and mongodb.
Earn FLAG by reading secret posts.

* MongoDB < 4.0.0

https://dreamhack.io/wargame/challenges/128
# Solution
Truy cập bài ta có giao diện sau
![image](https://hackmd.io/_uploads/HJ90Jdcofx.png)
Nhấn thử vào bài `Hello` thì bắt được tín hiệu sau
![image](https://hackmd.io/_uploads/rJQt8d5iMl.png)


Đọc source thấy khi truy cập vào endpoint `/api/board` thì thu được các field như `_id`, `title`, `author`, `secret` và `publishdate`
![image](https://hackmd.io/_uploads/SykFEd9jGg.png)
Và khi cung cấp `_id` cụ thể thì sẽ đọc được field `body`, là nơi ẩn chứa flag mà tác giả bài này đang giấu đi

Truy cập thử thì ta thấy `FLAG` chứa `_id` = null nên ta phải tái tạo lại `_id` để lấy flag
![image](https://hackmd.io/_uploads/SJpHmOcjfg.png)

Quan sát thấy `_id` có dạng gần tương tự nhau nên dự đoán có thể có quy luật riêng. Đi research thì nhận thấy `Mongodb` cấp id bằng method [ObjectId()](https://www.mongodb.com/docs/manual/reference/method/objectid/#objectid-mongosh-method)
MongoDB ObjectId có 24 ký tự hex, chia thành ba phần:
```
8 ký tự timestamp | 10 ký tự ngẫu nhiên | 6 ký tự bộ đếm
```
1. Unix Timestamp là số giây từ Unix epoch
2. Phần ngẫu nhiên thường giữ nguyên giữa các ID được tạo bởi cùng tiến trình
3. Bộ đếm tăng dần. 

Đây là cấu trúc `ObjectId` nhưng 12 byte -> 24 hex lên
![image](https://hackmd.io/_uploads/rJjFJt5iGx.png)


Vậy trước hết ta convert thời gian tạo thành Timestamp bằng tool [epochconverter](https://www.epochconverter.com/hex)
![image](https://hackmd.io/_uploads/Bki_H95sze.png)
-> `6accee9a`
-> `16380d287c`
-> `68e466`
=> `_id` = `6accee9a16380d287c68e466`

Rồi `GET /api/board/6accee9a16380d287c68e466` thì ta có được field `body` chính là flag ta cần tìm
![image](https://hackmd.io/_uploads/HJbXeGojMl.png)
(Ở đây tôi dùng `_id` khác vì đây là 1 sever khác)