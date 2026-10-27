---
title: Secret Supernovas
date: 2026-09-30
ctf: CSS CTF
category: web
difficulty: Bronze 1
tags:
  - Broken Access Control
  - IDOR
  - GraphQL
  - Introspection
---

## Đề bài
The Star City Observatory keeps a catalogue of stars, their galaxies, and their owners. Some records are more private than others.

http://34.116.80.78:9982/

Flag Format: `CSSCTF{...}`
## Solution
Truy cập vào challenge, ta thấy một ứng dụng `SvelteKit` tên Star City Observatory, vào `/login` thì trang còn cho luôn tài khoản mặc định `cadet/star`:

![image](./01-login.png)

```html!
<title>Log in · Star City Observatory</title>
...
<p class="hint">Need an account? <code>cadet/star</code>.</p>
```
Đăng nhập xong ta được cấp một cookie `session`, vào trong là một danh mục các ngôi sao với mỗi `Star` có tên, galaxy, class, magnitude:

![image](./02-app.png)

Mò quanh site thì thấy mọi dữ liệu (stars, galaxies, người sở hữu) đều được lấy về qua một endpoint `/graphql`. Thử `GET` thẳng vào đó:
```bash!
curl http://34.116.80.78:9982/graphql
# -> {"errors":[{"message":"Must provide query string." ...}]}
```
-> Server nói thẳng đây là một [GraphQL](https://graphql.org/) endpoint. Với GraphQL, câu hỏi đầu tiên của ta luôn là: schema trông như thế nào? May mắn thay, server bật introspection (tính năng cho phép ta hỏi ngược lại chính schema của nó).

> `introspection` là cơ chế "tự khai báo" của GraphQL: ta gửi một query đặc biệt (`__schema`, `__type`) và server trả về toàn bộ danh sách type, field, argument. 

Ta hỏi danh sách type:
```graphql!
{ __schema { types { name kind } } }
```
Bỏ qua các type built-in, còn lại 4 `OBJECT` đáng chú ý: `Query`, `Star`, `Galaxy`, `Person`. Đào tiếp vào từng type để xem field:

![image](./terminal-introspection.png)

```graphql!
{ __type(name:"Star") {
    fields { name type { name kind ofType { name kind } } }
} }
```
Đoạn cần lưu ý nằm ở type `Star`:
```
id, name, magnitude, classification, spectralClass
galaxy  -> Galaxy
owner   -> Person      <-- một Star trỏ tới người sở hữu là Person
```
Còn type `Person` thì chứa các thông tin cá nhân: `first_name`, `last_name`, `date_of_birth`, `description`. Còn `Query` (các "cửa" để ta truy vấn) thì có:
```
stars             # list toàn bộ Star
star(id)          # 1 Star theo id
galaxies / galaxy(id)
user(id) -> Person   # 1 Person theo id
```

Nhìn vào đây, con đường "thẳng" để đọc thông tin một người là `user(id:...)`. Ta thử:
```graphql!
{ user(id:5) { first_name last_name description } }
```
```json!
{"errors":[{"message":"Permission denied: you may only view your own account.",
  "extensions":{"code":"FORBIDDEN"}}], "data":{"user":null}}
```
-> Resolver `user` có gắn một lớp kiểm tra quyền: *"bạn chỉ được xem tài khoản của chính mình"*. Đi cửa chính bị chặn.

Vậy một câu hỏi mới được sinh ra: lớp phân quyền đó được đặt ở đâu? Ở GraphQL, mỗi field có một `resolver` riêng, và việc kiểm tra quyền phải được cài thủ công ở từng resolver. Tác giả đã nhớ khoá `Query.user`, nhưng field `owner` của `Star` cũng trả về đúng kiểu `Person` đó — liệu nó có được khoá không?

Ta thử đi con đường vòng: thay vì hỏi thẳng `Person`, ta hỏi `Star` rồi men theo quan hệ `owner` để chạm tới `Person`. Mà lúc này ta còn chưa biết chủ nhân nào mới là "người cần moi", nên cứ lấy owner của tất cả các Star một lượt, rồi thêm luôn field `description` vào cho đỡ mất công:
```graphql!
{ stars { id name owner { id first_name last_name description } } }
```
  Lần này server trả về toàn bộ `owner` của các `star`, và họ là dàn nhân vật của series *Arrow* (bối cảnh Star City): Felicity Smoak, John Diggle, Thea Queen, Laurel Lance...

![image](./terminal-flag.png)

```json!
{ "id": 5, "first_name": "Laurel", "last_name": "Lance",
  "description": "CSSCTF{we_l000ve_grafs}" }
```

Đây chính là lỗ hổng [Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) (BOLA/IDOR) trong ngữ cảnh GraphQL: cùng một object `Person` nhưng có hai con đường tới nó (`Query.user` và `Star.owner`), tác giả chỉ vá đúng một cửa. Ta đọc được `Person(id:5)` mà lẽ ra bị cấm, chỉ nhờ đi qua một `Star` mà mình được phép xem.

-> Flag: `CSSCTF{we_l000ve_grafs}`
