---
title: Roundtrip test
date: 2026-09-01
ctf: HackMD Roundtrip CTF
category: misc
tags: [roundtrip, hackmd]
description: "Mô tả kiểu HackMD (key không có trong CMS form)"
lang: vi-VN
---

# Roundtrip HackMD

[TOC]

Dòng có hai dấu cách cuối  
dòng tiếp theo (line break).

:::info
**Callout** với `code` và [link](https://example.com)
:::

:::spoiler Bấm để xem flag
flag{h4ckmd_r0undtr1p}
:::

==highlight== và ~~gạch~~, emoji :smile: :tada:

| a | b |
|:--|--:|
| 1 | 2 |

~~~python=
print("tab\tinside")
	indented_with_tab = True
~~~

```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
```

{%youtube dQw4w9WgXcQ %}

:::warning
> [!NOTE]
> blockquote callout
:::

- [ ] task
- [x] done

$$
E = mc^2
$$

[^1]: footnote

<span style="color:red">raw span</span>
<img src=x onerror=alert(1)>

![](./flag.png =300x)

<details><summary>raw html</summary>

*  bullet với 2 dấu cách
    - lồng 4 dấu cách

</details>

Dòng cuối không có newline
