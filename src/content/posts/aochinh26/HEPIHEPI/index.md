---
title: HEPIHEPI
date: 2026-10-05
ctf: aochinh26
category: web
difficulty: medium
tags:
  - Node.js
  - Prototype Pollution
  - dset
  - CVE-2024-21529
  - Path Traversal
  - RCE
---

# Đề bài
Challenge cho sẵn source code một web fansite chạy Node.js + Express. Mục tiêu là đọc được `/flag.txt`, mà file này chỉ `root` đọc được — ta phải gọi binary setuid `readflag` để lấy nội dung, tức là cần đạt được RCE.

# Solution
Truy cập vào challenge, ta thấy một trang fansite của nhóm nhạc HepiHepi:

![image](./01-home.png)
Kiểm tra source code được cho, nhận thấy có file `package.json`
-> Đây là một bài `Node.js`
## Kiểm tra `package.json` -> CVE-2024-21529
Ta kiểm tra file thấy `dependencies` chứa thư viện lạ thuộc bên thứ ba: `dset`

1. Quan sát thấy các thư viện khác ngoài `dset` đều có version có thể tự động nâng minor/patch (có dấu `^` ở trước version), trong khi version của `dset` bị ghim cứng ở `3.1.3`
![image](https://hackmd.io/_uploads/B1RlnPfofe.png)
-> Bài cố ý pin phiên bản này vì nó có lỗ hổng đã biết. 
Thử search `dset 3.1.3 vulnerability CVE` thì hiện ra 
[CVE-2024-21529](https://security.snyk.io/vuln/SNYK-JS-DSET-7116691) ở các phiên bản từ 3.1.4 trở về trước
![image](https://hackmd.io/_uploads/HJtZlufoGe.png)

2. Ta có thể dùng `npm audit` tự động báo luôn package nào có lỗ hổng đã biết
-> Tiện hơn nhiều so với việc kiểm tra toàn bộ dependency một lượt thay vì đọc tay từng thư viện.

:::info
Cách sử dụng như sau:
- `cd` vào thư mục chứa `package.json` (ở đây là `ez_web/src`)
- Nếu chưa có `package-lock.json` thì 
```bash!
npm i --package-lock-only
npm audit
```
- Nếu có rồi thì chỉ cần `npm audit`
:::

![ctf_screenshot_under_1mb](https://hackmd.io/_uploads/rJeC0QdGifx.jpg)

## Prototype Pollution là gì?
### Định nghĩa và ví dụ
Về cơ bản, ==prototype pollution== là lỗ hổng xảy ra khi kẻ tấn công ghi đè hoặc thêm `property` vào `Object.prototype` (`object` gốc dùng chung cho TOÀN BỘ `object` khác trong chương trình)
-> Từ đó `property` đó xuất hiện trên toàn bộ `object` khác (bao gồm mọi `object` hiện tại và cả những `object` sẽ được tạo ra trong tương lai)
Ví dụ dễ hiểu:
```javascript!
// Bình thường — object không có "isAdmin"
const anyObject = {};
console.log(anyObject.isAdmin); // undefined — như mong đợi

// Kẻ tấn công pollute Object.prototype
Object.prototype.isAdmin = true;

// Giờ MỌI object, kể cả cái vừa tạo sau đó, "tự nhiên" có isAdmin = true
const brandNewObject = {};
console.log(brandNewObject.isAdmin); // true  ← nguy hiểm!
```

Sau đó, attacker sẽ sử dụng `gadget` để gọi lại `property` mình đã thêm vào ở bước `prototype pollution`
### Các khái niệm liên quan
Vậy câu hỏi đặt ra là 
1. `object`, `property`, `value`, `keypath` là gì?
2. Cách đạt được `Object.prototype`?
3. Cần bao nhiêu lần `__proto__` để đạt được `Object.prototype`?
4. `gadget` là gì?
-
:::info
`object` (đối tượng) là một cấu trúc dữ liệu gồm các cặp `key: value`

`property` (thuộc tính) là mỗi cặp `key-value` nằm trong object đó.

`keypath` (đường dẫn key) dùng để trỏ tới một `property` nằm sâu bên trong khi `object` bị lồng nhiều cấp
:::
- Để trỏ được tới `Object.prototype` thì ta có các cách như sau, từ cơ bản đến bypass filter
:::info
Giả sử ta có `obj` là [object literals](https://www.geeksforgeeks.org/web-tech/object-literals/) như sau:
```json!
obj = { a: { b: {} } }
```
1. Truy cập trực tiếp:
``` javascript
obj.__proto__ === Object.prototype;  // true
```
``` javascript
obj.["__proto__"] === Object.prototype;  // true
```
2. Truy cập dù thông qua `obj` hay `a` hay `b` đều như nhau
```javascript
obj.__proto__ === Object.prototype;   // true — tầng gốc
obj.a.__proto__ === Object.prototype;   // true — tầng 1
obj.a.b.__proto__ === Object.prototype;   // true — tầng 2
```
3. Nếu `__proto__` bị ban mà không ban `constructor` và `prototype` (Mọi `object literal` có `constructor` trỏ về `Object`)
-> `obj.constructor` = `Object`
-> `obj.constructor.prototype` = `Object.prototype`
```javascript
obj.constructor.prototype === Object.prototype;   // true
```
:::
- Số bước `__proto__` cần đi phụ thuộc vào cách object được tạo
:::info
```javascript
{}.__proto__ === Object.prototype;                        // 1 bước (object literal)
[].__proto__.__proto__ === Object.prototype;              // 2 bước (array → Array.prototype → Object.prototype)
new Foo().__proto__.__proto__ === Object.prototype;       // 2 bước (Foo.prototype → Object.prototype)
Object.create(null).__proto__;                            // undefined — KHÔNG đi được, chuỗi bị cắt
```
:::
- `gadget` = "công cụ có sẵn bị lợi dụng sai mục đích"
:::info
`Gadget` là một đoạn code đã có sẵn trong chương trình/thư viện (không phải do kẻ tấn công viết ra), mà khi bị kích hoạt với đúng điều kiện, nó vô tình thực hiện một hành động nguy hiểm mà lập trình viên gốc không hề có ý định cho phép người dùng điều khiển.
:::

## Phân tích cách hoạt động của thư viện `dset`

Trước tiên, ta cần biết cách thư viện này hoạt động. Đọc [API của `dset`](https://www.npmjs.com/package/dset/v/3.1.3#api).
![image](https://hackmd.io/_uploads/S1I9Jdzsfg.png)
Ta biết `dset` là 1 hàm sinh ra với mục đích truyền `value` vào một `object` thông qua đường dẫn `path`.
Có thể đọc thêm [ví dụ](https://www.npmjs.com/package/dset/v/3.1.3#usage) để hiểu cách hàm `dset` hoạt động

Để hiểu hơn về lỗ hổng của phiên bản, ta so sánh source code giữa 2 phiên bản [3.1.3](https://app.unpkg.com/dset@3.1.3/files/merge/index.js) và [3.1.4](https://app.unpkg.com/dset@3.1.4/files/merge/index.js)
Ở đây tôi sử dụng tool online là [code-diff-viewer](https://tanphatdigital.com/vi/tools/code-diff-viewer)
![image](https://hackmd.io/_uploads/rJ7vu_foMx.png)

Ta nhận thấy `k` được chuyển thủ công về kiểu dữ liệu string trước khi được check an toàn.

Quan sát đoạn code dùng để check:
```javascript
if (k === '__proto__' || k === 'constructor' || k === 'prototype') break;
```
Phép so sánh `===` trong JS là so sánh nghiêm ngặt cả kiểu dữ liệu lẫn giá trị, KHÔNG tự động ép kiểu.
-> Ta phải ép kiểu thủ công với biến `k` chuyển về string trước khi so sánh với string `'__proto__'`, `constructor` và `prototype` để đảm bảo an toàn. Đó chính là cách fix lỗi của version 3.1.4. 

## Phân tích về lỗ hổng ở version 3.1.3 (CVE-2024-21529)
Suy luận từ cách fix lỗi của version 3.1.4, ta biết lỗi của version 3.1.3 nằm ở việc không chuyển về `string` cho trùng kiểu dữ liệu trước mà đã check an toàn.
=> Dẫn tới việc người dùng khai thác thông qua kiểu dữ liệu `array` ở `path`
![image](https://hackmd.io/_uploads/H1kTujGife.png)

Version 3.1.3:
```javascript
function dset(obj, keys, val) {
	keys.split && (keys=keys.split('.'));
	var i=0, l=keys.length, t=obj, x, k;
	while (i < l) {
		k = keys[i++];
		if (k === '__proto__' || k === 'constructor' || k === 'prototype') break;
		t = t[k] = (i === l) ? val : (typeof(x=t[k])===typeof(keys)) ? x : (keys[i]*0 !== 0 || !!~(''+keys[i]).indexOf('.')) ? {} : [];
	}
}

exports.dset = dset;
```
:::warning
Lưu ý: 
- Chỉ có path dạng array `[...,'y','z']` mới khai thác được vì giá trị của đầu có thể là 1 mảng con `['x']`==(nested array)== 
**(Nếu giá trị đầu là `[x]` sẽ gây lỗi ngay lập tức vì chưa khai báo biến `x`)**
-> `keys=[['x'],'y','z']` (thay cho `keys=['x','y','z']`) 
=> `t[k]` = `t[['x']]` (`['x']` bị coerce thành string `'x'`)
<=> `t[k]` = `t['x']` 
(Lúc này đã bypass được bước check an toàn)
- Path dạng string `'x.y.z'` thì chịu vì sau khi split thì cũng chỉ thành `['x','y','z']` chứ không thể nào là `[['x'],'y','z']`
-> Ví dụ:
`ka.hac.u` sau khi split -> `['ka','hac','u']`
(Có cố gắng như nào cũng không biến được về dạng `[['ka'],'hac','u']`)
:::

## Đoạn code sử dụng `dset` có thể khai thác
Quay trở lại với `index.js` của bài, ta thấy route `/change-theme` có sử dụng `dset`
```javascript
app.post('/change-theme', requireSession, (req, res) => {
    const { themeVar, themeVal } = req.body
    if (typeof themeVar !== 'string' || typeof themeVal !== 'string') {
        return res.status(400).send('themeVar and themeVal must be strings')
    }
    lib.dset(sessionStorage, [[req.sessionID], themeVar], themeVal)
    res.send('Change theme successfuly')
})

```
Ở đây, người dùng kiểm soát được `req.sessionID`, `themeVar` và `themeVal` tùy ý. 
ĐẶC BIỆT code có cấu trúc giống ta phân tích ở trên
```javascript!
lib.dset(sessionStorage, [[req.sessionID], themeVar], themeVal)
```
1. object: ==sessionStorage==
2. path: ==`[`[req.sessionID], themeVar`]`==
3. value: ==themeVal==

Khi đó, chỉ cần:
1. `req.sessionID` = `'__proto__'` 
-> Truy cập được `Object.prototype` để gây pollution 
2. `themeVar` = `...`
3. `themVal` = `...`

`themeVar` và `themeVal` tạm thời để đó vì chưa tìm được gadget để bị pollution

## Quá trình truy tìm gadget
### Path Traversal
Bấm vào một thành viên, ta sang trang chi tiết với URL dạng `/member?memberID=member1`: 
![image](./02-member.png)

Ta thấy một chỗ đáng ngờ khi input của user (qua param `memberID`) được truyền vào `require()` mà không hề lọc. 
```javascript!
app.get('/member', requireSession, (req, res) => {
    memberID = req.query.memberID
    memberStats = require(`./members/${memberID}.js`)
    res.render('member', { member: memberStats })
})
```
=> Có thể dùng `Path Traversal` để load một file `.js` bất kỳ trên hệ thống
###
