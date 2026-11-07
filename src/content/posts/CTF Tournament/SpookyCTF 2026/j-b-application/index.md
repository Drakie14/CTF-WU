---
{
  title: J*b Application,
  date: 2026-11-07,
  ctf: SpookyCTF 2026,
  category: web,
  difficulty: Bronze 4,
  tags: [ Logic Bug, Regex, re.match, Source Code Review ]
}
---

# Đề bài
Welcome to the future of job applications! Here at AI Slop, we pride ourselves on streamlining the application process and helping candidates find their perfect role at our company using our AI-powered hiring platform. Submit your application and have our AI Slop screening system evaluate your life. We at AI Slop look forward to working with you in the future!

http://3.22.226.215
# Solution 
![image.png](./image.png)
Review source code của `app.py`:
```python3
valid_letter = re.match(
    r"^[A-Za-z0-9 .,!?'-]{1,40}",
    coverletter
)

...

if "[[AI-REVIEW: ACCEPT]]" in coverletter:
    session["accepted"] = True
    return redirect(url_for("accepted"))
```
Vậy cover letter phải có đoạn string `[[AI-REVIEW: ACCEPT]]` và thỏa điều kiện của regex `^[A-Za-z0-9 .,!?'-]{1,40}`
![2-image.png](./2-image.png)
-> Chỉ cần từ đầu tiên thỏa điều kiện là được 
![4-image.png](./4-image.png)
![3-image.png](./3-image.png)
-> Flag:
`spooky{l0v3_ai&j0b_4pplic4t10ns}`
