---
title: 12345678!
date: 2026-09-27
ctf: CSAW' 26 QUALS
category: misc
difficulty: easy
tags:
  - Steganography
  - Audio
  - Spectrogram
---

## Đề bài 
listen....when you find the answer it will glisten.....
File: [12345678.wav](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/12345678.wav)
## Solution 
Ta sử dụng `Audacity` để mở file
![image](https://hackmd.io/_uploads/rklVV0J9Mg.png)

Ta `duplicate` và đổi `track visualization` thành `spectrogram` để kiểm tra
![image](https://hackmd.io/_uploads/BJhcVAJqze.png)

Phát hiện được đoạn mật mã sau: `dV9uMzNkXw==` 
![image](https://hackmd.io/_uploads/S1PRQC1qfg.png)

Ta dễ dàng nhận ra đây là đoạn mã được Base64 encode. Sau khi decode ta thu được: `u_n33d_`
![image](https://hackmd.io/_uploads/By1o66J9ze.png)

Sau đó, lắng nghe đoạn audio và nhận ra 
đoạn âm thanh từ 3s->22s nghe như âm thanh bị reverse

Sau khi reverse thì có file [12345678_reversed.wav](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/12345678_reversed.wav) sau
Ta nghe được có người nói rằng: “2 parts `1n_0rd3r_`”

Kiểm tra metadata của file thì ta có được chuỗi Base64-encoded khác
![image](https://hackmd.io/_uploads/ByKS9CJ5Ml.png)
Decode ta có được: `2_5t3@1_`

Sau khi tìm ra 3 phần của flag thì ta thấy ở mỗi phần đều có `_` ở cuối nên chứng tỏ vẫn chưa kết thúc

Ta thử `amplify` file gốc và nhận thấy từ 25s->35s có người nói gì đó nhưng với pitch rất cao 

Ta giảm pitch của đoạn đó xuống thu được file [12345678bit](https://github.com/Drakie14/Challenges/blob/CSAW'-26-QUALS/12345678bit.wav) và nghe ra `2_f1nd`

Vậy là đã tìm được phần kết thúc, giờ ta phải ghép lại thành câu có nghĩa 

-> Flag: `csaw{1n_0rd3r_2_5t3@1_u_n33d_2_f1nd}`
