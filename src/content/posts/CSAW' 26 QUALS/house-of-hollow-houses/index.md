---
title: House of Hollow Houses
date: 2026-09-27
ctf: CSAW' 26 QUALS
category: misc
difficulty: easy
tags:
  - Web Enumeration
  - Steganography
  - Puzzle
---

### Đề bài
A labyrinth of "hollow" rooms served as a static website — each room links to others, and the flag lies waiting in the sanctum. Players wander the interlinked rooms (and read what the pages are quietly telling them) to find the way in. Hosted service on port 8000.

https://hollow-houses.ctf.csaw.io/
### Solution 
## Trang chủ
Đây là một bài ctf thú vị được giải mã thông qua việc người lần lượt truy cập các đường URL được ẩn giấu trong lời mô tả của trang

Ta nhận thấy đây là một trang web có chứa thông tin về các phòng với các font chữ khác nhau và rất nhiều đường link URL nhằm gây nhiễu user

Trước tiên, ta thử craw các đường dẫn URL của website với
1. Googlebot: sử dụng `site:hollow-houses.ctf.csaw.io/`.
Không trả về kết quả gì.
2. `https://hollow-houses.ctf.csaw.io/sitemap.xml` là một file XML mà website dùng để liệt kê các URL quan trọng của mình, chủ yếu để các search engine như Google/Bing dễ phát hiện và lập chỉ mục.
Kết quả trả về là 404.

Ta quay trở lại với việc làm thủ công và đọc trang web, phát hiện được đoạn văn đáng ngờ `The obedient have always been answered first, and the answer issued to them is a catalogue, organised alphabetically, of every place the atrium is not. The catalogue is, by long custom, kept at the front gate, in a small text file the house permits to be read by anyone who knows to ask for it. It is, of course, a complete list.` 
Trong challenge này có hai dấu hiệu kết hợp:
1. `the obedient`
→ gợi đến crawler/bot.
3. `at the front gate, in a small text file`
→ một file text ở root/front gate.

Vậy ta phải truy cập [/robots.txt/](https://hollow-houses.ctf.csaw.io/robots.txt)
## Kẻ phục tùng (The obedient)
với [robots.txt](https://www.cloudflare.com/learning/bots/what-is-robots-txt/#how-does-a-robotstxt-file-work) là một file chuẩn đặt ở root của website: https://hollow-houses.ctf.csaw.io/robots.txt

Kết quả trả về:
```!
User-agent: *
Disallow: /atrium/

# the obedient have been answered.
```

Vì ở đây `Disallow: /atrium/` chứng tỏ rằng `/atrium/` là 1 đường dẫn URL quan trọng, ta đã tìm được căn phòng tiếp theo

-> Ta truy cập đường dẫn [/atrium/](https://hollow-houses.ctf.csaw.io/atrium/)

## Giếng trời (Atrium)


```html!
<p>
    <span class="h">O</span>
    ften the visitors look only at what shines. They are escorted, gently, back to the threshold, and the house arranges for them to remember nothing of the visit.
</p>
<p>
    <span class="h">S</span>
    ometimes a word holds another word inside it, the way a coffin holds a coffin, the way a room holds a room.
</p>
<p>
    <span class="h">S</span>
    elect what you cannot see. This is the instruction the house gives most often, and which the visitors most often decline.
</p>
<p>
    <span class="h">U</span>
    nder every floor is a floor. Under that floor is a name. Under the name is the person the name once belonged to.
</p>
<p>
    <span class="h">A</span>
    sk the room what it is, and the room, on a good day, will tell you. Ask politely. Ask in lower case.
</p>
<p>
    <span class="h">R</span>
    ooms are not buildings. Rooms are sentences. You are reading one now.
</p>
<p>
    <span class="h">Y</span>
    ou are nearly through. The next chamber is named for what we keep when there is nothing else left.
</p>
```

Ta thấy chữ cái đầu tiên của mỗi dòng đều được cố ý làm mờ gần với màu tường rất đáng ngờ
-> Ta truy cập đường dẫn [/ossuary/](https://hollow-houses.ctf.csaw.io/ossuary/)

## Nơi chôn cất (Ossuary)
Trang này có chứa một đoạn mật mã khó hiểu và đáng ngờ ở giữa trang
`d2hhdCB0aGUgbWlycm9yIHNlZXMsIHRoZSBtaXJyb3Iga2VlcHM=`

Ngoài ra còn có gợi ý về cách giải mã ở cuối 
`sixty-four letters in the alphabet of refusal. one room in the answer.`
Ta liền nghĩ đến ngay `Base 64`

Truy cập [CyberChef](https://gchq.github.io/CyberChef/) và thử decode đoạn mật mã này
![image](https://hackmd.io/_uploads/rkkGvSAYMg.png)

Trong trang đã nói rất rõ về chỉ dẫn đến căn phòng tiếp theo:
`The rite, on decoding, is a sentence.
The sentence contains a noun.
The noun is the name of the next room.`

Mà ở trong câu `what the mirror sees, the mirror keeps` có noun chính là `mirror`
-> Ta truy cập đường dẫn [/mirror/](https://hollow-houses.ctf.csaw.io/mirror/)
## Chiếc gương (Mirror)
Ở trang này tất cả các chữ cái đều bị lật ngược lại

Vì vậy ta đọc source để xem thông tin của trang, nhận thấy trang này đã chỉ rõ room tiếp theo
```html!
<p>
The next chamber is called the
<a href="/wellspring/">wellspring</a>.
It lies beneath this one, in a sense that has nothing to do with elevation.
Knock once, in lower case. Enter.
Do not speak above the water.
</p>
```
-> Ta truy cập đường dẫn [/wellspring/](https://hollow-houses.ctf.csaw.io/wellspring/)
## Suối nguồn (Wellspring)
Khi xem trang, ta nhận thấy mỗi dòng câu đều có những khoảng cách kì lạ và có tần suất lặp lại riêng biệt 

Ta liên tưởng đến mật mã Morse:
- Trong mỗi dòng:
    1. 1 space giữa hai từ → `.`
    2. 3 spaces → `-`
- Mỗi dòng tương ứng với một ký tự Morse
- Dòng trống → ngăn cách các từ

Decode toàn bộ ta thu được kết quả sau 
`THE FLAG LIES WAITING IN THE SANCTUM`

Ta truy cập đường dẫn [/sanctum/](https://hollow-houses.ctf.csaw.io/sanctum/)
## Thánh địa (Sanctum)
Đến trang này thì ta thu được flag: 
`csaw{w4nd3r3r_0f_th3_h0ll0w_h0us3}`

>Funfact: đề bài đã mô tả rằng flag nằm ở `sanctum`.
>`"the flag lies waiting in the sanctum"`
