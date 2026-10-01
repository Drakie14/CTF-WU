# CTF Write-ups

Blog lưu trữ CTF write-up cá nhân: **static site** (Astro) deploy miễn phí trên **Cloudflare Pages**
từ một **GitHub public repository**. Viết bài trên HackMD → tải file `.md` → thả vào repo → website
tự build lại. Không database, không server, không serverless function, chi phí 0đ.

- Bố cục chia đôi: danh sách bài dạng **cung tròn** bên trái, nội dung bên phải; View Transitions.
- Tương thích HackMD: callout, spoiler, `==mark==`, `[TOC]`, emoji, kích thước ảnh, code block
  `lang!`… (xem [HackMD syntax](#hackmd-syntax)).
- Frontmatter **không bắt buộc**; tag/CTF hoàn toàn dynamic; ảnh remote được tải về lúc build.
- Mục lục tự tạo từ heading `#`, `##`, `###` (thu gọn ở góc phải bài).
- Tìm kiếm Pagefind, sitemap, RSS feed `/rss.xml` (không có link trên giao diện), `/admin` (Sveltia CMS)
  không cần server.
- `/admin/import/`: import **một** file `.md` của cả giải → tự tách thành từng bài theo `# Category` /
  `## Challenge` (xem [Import một file .md nhiều bài](#import-một-file-md-nhiều-bài)).

## Mục lục

- [Local development](#local-development)
- [Đăng bài từ HackMD](#đăng-bài-từ-hackmd)
- [GitHub + Cloudflare](#github--cloudflare)
- [Domain](#domain)
- [Security](#security)
- [Tags](#tags)
- [Code block](#code-block)
- [HackMD syntax](#hackmd-syntax)
- [Admin (Sveltia CMS)](#admin-sveltia-cms)
  - [Import một file .md nhiều bài](#import-một-file-md-nhiều-bài)
- [Lệnh npm](#lệnh-npm)
- [Kiểm tra chất lượng](#kiểm-tra-chất-lượng)
- [Version](#version)

---

## Local development

### Windows

1. Cài **Node.js 24 LTS** (file cài đặt từ <https://nodejs.org>, hoặc `nvm-windows`: `nvm install 24`
   rồi `nvm use 24`). Project cần Node ≥ 22.22.3; `.nvmrc` ghi `24`.
2. Cài **Git for Windows** (<https://git-scm.com>). Nên để Git tự đổi xuống dòng
   (mặc định); `.gitattributes` đã ép các file `.md`/`.yml` dùng LF.
3. Mở **PowerShell** (hoặc Terminal của VS Code) trong thư mục project, ví dụ `D:\Blog`:

```powershell
npm install
npm run dev
```

4. Mở <http://localhost:4321>. Sửa file trong `src/content/posts` → trang tự reload.

Mọi npm script đều chạy bằng Node.js nên dùng được trên cả Windows (PowerShell/cmd), macOS và Linux.

### Build thử giống production

```powershell
npm run build     # build ra dist/ + tạo index Pagefind
npm run preview   # xem bản build tại http://localhost:4321
npm run verify    # quét dist/: XSS, ảnh remote, link hỏng, SEO/RSS/sitemap
```

### Biến môi trường

| Biến | Mặc định | Dùng cho |
| --- | --- | --- |
| `SITE_URL` | `https://drakie14-ctf-wu.pages.dev` | canonical URL, Open Graph, RSS, sitemap, `robots.txt` |

Đặt trên Cloudflare Pages (xem bên dưới). Không có secret nào cần đặt.

---

## Đăng bài từ HackMD

**Không bao giờ cần sửa source code, config hay danh sách bài.** Website tự phát hiện mọi file
`.md` trong `src/content/posts/`.

1. HackMD → menu **⋯** → **Download** → **Markdown** (`.md`).
2. Đặt file vào `src/content/posts/`. Ba cấu trúc đều hợp lệ và có thể trộn lẫn:

   ```
   src/content/posts/
   ├── another-writeup.md                 # một file
   ├── dom-xss/
   │   ├── index.md                       # thư mục bài (ảnh/file đính kèm để cạnh)
   │   └── devtools.png
   └── CSAW Quals 2026/                   # thư mục CTF → tự suy ra ctf: "CSAW Quals 2026"
       └── dino2auth/
           ├── index.md
           ├── screenshot.png
           └── solve.py
   ```

3. Trên GitHub: vào thư mục `src/content/posts` → **Add file** → **Upload files** → kéo thả file
   `.md` (hoặc cả thư mục bài kèm ảnh) → **Commit changes**.
4. Cloudflare Pages tự build (1–2 phút) → website cập nhật: bài xuất hiện ở trang chủ, `/ctf/...`,
   `/category/...`, `/tags/...`, `/archive`, RSS, sitemap và search.

Có thể dùng [`/admin`](#admin-sveltia-cms) thay cho bước 2–3. Note HackMD chứa **cả giải** (nhiều
challenge trong một file)? Dùng [`/admin/import/`](#import-một-file-md-nhiều-bài) để tự tách thành
từng bài riêng, phân loại theo heading `#`.

### Frontmatter mẫu (tất cả đều không bắt buộc)

```yaml
---
title: Tên bài
date: 2026-09-25
ctf: Tên giải
category: web
tags: [tag1, tag2]
---
```

Field khác được hỗ trợ: `difficulty` (`easy|medium|hard|insane`), `points` (số nguyên),
`summary` (hoặc `description` như HackMD), `cover: ./cover.png`.

| Trường hợp | Kết quả |
| --- | --- |
| **Quên frontmatter** | Build **vẫn thành công** (có warning). Bài vào nhóm **“Chưa phân loại”** đầu danh sách. |
| Thiếu `title` | Dùng tên file/thư mục làm title (không lấy heading `# ...`). |
| Thiếu `date` | Ngày commit đầu tiên của file (Git), nếu không có thì ngày sửa file. |
| Thiếu `ctf` | Suy ra từ thư mục CTF cha, nếu không có thì để trống. |
| Thiếu `summary` | Lấy đoạn văn đầu tiên (không bao giờ lấy nội dung spoiler/callout). |
| Field sai / key lạ | Warning ghi rõ file, field, giá trị, default được dùng; build tiếp tục. |
| Hai bài trùng slug | **Build fail** (lỗi duy nhất làm dừng build). |

- `category` hợp lệ: `web, pwn, crypto, rev, forensics, misc, osint, mobile, cloud` (không phân biệt hoa thường).
- Mọi ngày được hiểu theo giờ Việt Nam (**Asia/Ho_Chi_Minh**): `date: 2026-09-25` luôn hiển thị 25/09/2026.
- Nếu heading `# ...` đầu tiên trùng chính xác `title`, heading đó được ẩn để không lặp.

### Ảnh và file đính kèm

- **Ảnh local** để cạnh file `.md`: `![](./flag.png)`. Được tối ưu sang WebP có `srcset`, width/height.
- **Ảnh remote** (`https://hackmd.io/_uploads/...`, imgur…): được **tải về lúc build**, tối ưu như ảnh
  local; HTML production không còn URL remote. Bạn không phải tự tải hay quản lý thư mục ảnh.
  Ảnh tải về được cache trong `.cache/` (đã gitignore). Tải lỗi → warning ghi rõ bài + URL, hiển thị
  alt text, build không fail.
- **File đính kèm** (`[solve.py](./solve.py)`, `chall.zip`…) để cạnh bài → được chép vào
  `/attachments/...` và luôn tải xuống (không bao giờ chạy trên domain của site).

---

## GitHub + Cloudflare

### 1. Tạo repo và push

1. Trên GitHub: **New repository** → đặt tên (ví dụ `ctf-writeups`) → **Public** → không tạo README.
2. Trong thư mục project (PowerShell):

```powershell
git init            # nếu chưa là Git repo
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/ctf-writeups.git
git push -u origin main
```

`.gitignore` đã loại `node_modules`, `dist`, `.astro`, cache ảnh remote, fixtures, `.env*`,
`PROMPT.md`… Kiểm tra lại bằng `git status` trước khi commit.

### 2. Kết nối Cloudflare Pages

1. <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → chọn repo vừa tạo.
2. Cấu hình build:

| Mục | Giá trị |
| --- | --- |
| Framework preset | `Astro` (hoặc None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(để trống)* |
| Environment variables | `NODE_VERSION` = `24` (build image v3 cũng đọc `.nvmrc`), `SITE_URL` = `https://<project>.pages.dev` |

3. **Save and Deploy**. Từ đó mỗi lần push/commit (kể cả qua GitHub Web UI hoặc `/admin`) sẽ tự build lại.

`public/_headers` được Cloudflare áp dụng tự động: CSP, security headers và cache
(`/_astro/*` cache 1 năm immutable, HTML `max-age=0, must-revalidate`). Brotli/gzip và CDN do
Cloudflare lo.

### 3. Git history (ngày đăng tự động)

Bài không có `date:` lấy ngày commit đầu tiên của file từ Git. Nếu Cloudflare clone dạng shallow,
bước build tự chạy `git fetch --unshallow` (chỉ khi phát hiện `CF_PAGES`/`CI`). Nếu vẫn không lấy
được history thì dùng ngày sửa file — trên máy build đó là **thời điểm clone**, nên ngày có thể sai.
Để chắc chắn, **nên ghi `date:` trong frontmatter**. Build không bao giờ fail vì lý do này.

---

## Domain

- **Đổi subdomain `.pages.dev`**: tên subdomain lấy theo tên project Cloudflare Pages, chỉ đặt được
  lúc tạo project. Muốn đổi: tạo project mới với tên khác (kết nối cùng repo) rồi xóa project cũ.
- **Gắn custom domain**: project → **Custom domains** → **Set up a custom domain** → nhập domain
  (ví dụ `blog.example.com`) → làm theo hướng dẫn DNS (domain đã ở Cloudflare thì tự tạo bản ghi;
  nếu không, thêm `CNAME blog → <project>.pages.dev` ở nhà cung cấp DNS).
- Sau khi đổi domain: sửa biến môi trường **`SITE_URL`** thành domain mới → **Retry deployment**
  để canonical URL, RSS, sitemap và `robots.txt` dùng domain mới.

---

## Security

> ⚠️ **Repository là public.** Mọi file bạn commit — và **toàn bộ commit history** — ai cũng xem
> được, kể cả sau khi bạn xóa file ở commit sau.

- **Chỉ đăng write-up khi CTF đã kết thúc** (và giải cho phép công bố).
- **Không commit** token, password, API key, cookie, flag của giải đang diễn ra hay bất kỳ secret nào.
  Nếu lỡ commit: coi như đã lộ → **thu hồi/đổi ngay**; xóa khỏi history là chưa đủ.
- **Không commit challenge file có bản quyền** (binary, source, đề bài) nếu tác giả không cho phép.
- Không có secret nào trong `public/admin/config.yml`, `.env` hay build output. Token của `/admin`
  chỉ nằm trong trình duyệt của bạn.
- Bật **2FA** cho tài khoản GitHub và Cloudflare.

### Cách site tự bảo vệ

- Raw HTML trong Markdown đi qua `rehype-sanitize` với allowlist: bỏ `<script>`, `<iframe>`, mọi
  thuộc tính `on*`, URL `javascript:`, `style` chứa `url(...)`. Payload XSS trong code block vẫn hiển
  thị nguyên văn dạng text (đây là blog CTF). Có test (`tests/markdown/xss.test.ts`) và
  `npm run verify` quét lại toàn bộ `dist/`.
- **CSP chặt cho trang public** (`public/_headers`): `script-src 'self'` — **không `unsafe-inline`**.
  Astro/View Transitions không cần script inline: mọi script (kể cả `ClientRouter`) được bundle thành
  file `/_astro/*.js` dạng `type="module"`; build đã cấu hình không bao giờ inline JS nên không cần
  hash. `'wasm-unsafe-eval'` chỉ cho phép WebAssembly của Pagefind (không cho `eval` JS).
  `style-src` có `'unsafe-inline'` vì Astro inline CSS nhỏ vào `<style>` và giao diện dùng biến CSS
  trong thuộc tính `style` (màu tag, vị trí particle) — không ảnh hưởng tới script.
  `img-src 'self' data:` (ảnh remote đã được tải về lúc build), `frame-src 'none'`,
  `frame-ancestors 'none'`, cùng `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- `/admin` có CSP riêng (xem [CSP của `/admin`](#csp-của-admin)), không nới lỏng CSP public.
- Link ngoài có `rel="noopener noreferrer"`. HackMD embed (`{%youtube%}`…) không bao giờ tạo iframe.

---

## Tags

Tags **hoàn toàn dynamic** — không có danh sách tag nào trong code hay config:

```yaml
tags: [xss, javascript, dom]
tags: "sqli, jwt"          # chuỗi cũng được, tự tách theo dấu phẩy
```

- Thêm tag mới trực tiếp trong Markdown hoặc trong CMS → build → trang `/tags/<tag>` tự xuất hiện.
  **Không cần sửa source code.**
- Chuẩn hóa: bỏ khoảng trắng thừa, không phân biệt hoa thường (`SQLi` và `sqli` là một tag, hiển
  thị theo cách viết xuất hiện nhiều nhất).
- URL dạng slug: chữ thường, bỏ dấu tiếng Việt, khoảng trắng → `-`, `c++` → `cpp`, `c#` → `csharp`
  (ví dụ `dom xss` → `/tags/dom-xss/`). Hai tag khác nhau nhưng ra cùng slug → gộp lại + warning.
- CTF cũng tương tự: tên thư mục/`ctf:` hiển thị nguyên văn, URL `/ctf/<slug>`.

---

## Code block

Hỗ trợ **mọi ngôn ngữ Shiki có sẵn** (theme `github-dark-default`, đạt tương phản WCAG AA). Góc trên
hiển thị nhãn ngôn ngữ và nút **Copy**; không có số dòng.

````markdown
```python
dòng dài sẽ cuộn ngang trong khung code (mặc định)
```

```python!
dòng dài sẽ tự xuống dòng, giống HackMD — hậu tố ! dùng được với mọi ngôn ngữ và alias (py!, sh!…)
```
````

- ` ```python= `, ` ```python=12 `, ` ```= `: hậu tố `=` (số dòng của HackMD) được bỏ qua.
- Không có ngôn ngữ → plaintext. Ngôn ngữ lạ (ví dụ ` ```abcxyz `) → hiển thị plaintext, giữ nhãn
  `ABCXYZ`, warning lúc build ghi rõ file; build không fail.
- `sh`/`zsh`/`console`/`terminal` có dòng bắt đầu bằng `$ ` → tô màu kiểu shell session.
- Chỉ ngôn ngữ thực sự xuất hiện trong content mới được nạp vào Shiki (build nhanh).

### Alias (không phân biệt hoa thường)

| Viết trong Markdown | Ngôn ngữ |
| --- | --- |
| `py`, `py3`, `python3` | python |
| `js` / `ts` | javascript / typescript |
| `sh`, `zsh`, `shell`, `console`, `terminal` | bash (hoặc shell session nếu có `$ `) |
| `ps`, `ps1`, `pwsh` | powershell |
| `c++`, `cc`, `cxx`, `hpp` | cpp |
| `h` | c |
| `yml` | yaml |
| `text`, `txt`, `plain` | plaintext |
| `cmd` | bat |
| `x86`, `x86asm`, `assembly`, `nasm`, `masm` | asm |
| `dockerfile` | docker |
| `sol` | solidity |

Alias sẵn có của Shiki (`rb`, `rs`, `kt`, `md`…) vẫn hoạt động.

**Thêm alias mới:** sửa **một file duy nhất** `src/config/code-languages.ts`, thêm một dòng vào
`LANGUAGE_ALIASES`, ví dụ `vuejs: 'vue',` (value là id ngôn ngữ Shiki — <https://shiki.style/languages>).
Nhãn hiển thị tùy chỉnh ở `LANGUAGE_LABELS` cùng file. Không cần sửa code xử lý.

---

## HackMD syntax

File `.md` tải từ HackMD hiển thị đúng mà không phải sửa tay.

### Được hỗ trợ

| Cú pháp | Kết quả |
| --- | --- |
| Một Enter trong đoạn văn | Xuống dòng `<br>` (giống HackMD) |
| `:::info` / `:::success` / `:::warning` / `:::danger` … `:::` | Callout có viền trái, icon, màu tương ứng; lồng nhau được |
| `> [!NOTE]` / `> [!TIP]` / `> [!WARNING]` | Callout kiểu GitHub |
| `:::spoiler Tiêu đề` … `:::` | `<details>` thu gọn mặc định; lồng nhau được; không có tiêu đề → tiêu đề mặc định |
| `==highlight==` | `<mark>` |
| `[TOC]`, `[toc]` | Bị xóa — blog tự tạo mục lục từ heading `#`, `##`, `###` ở góc phải bài (heading đang đọc được làm nổi) |
| ` ```lang `, ` ```lang! ` | Xem [Code block](#code-block) |
| `:smile:`, `:tada:` … | Emoji |
| `![alt](url =300x)`, `=300x200`, `=x200` | Đặt width/height cho ảnh |
| Bảng GFM, task list, footnote, strikethrough, autolink | Như GitHub; bảng rộng cuộn ngang |
| Raw HTML an toàn (`<details>`, `<summary>`, `<mark>`, `<kbd>`, `<sub>`, `<sup>`, `<img>`…) | Giữ lại sau khi sanitize |
| Metadata HackMD trong frontmatter (`lang`, `breaks`, `robots`, `GA`, `disqus`, `type`, `slideOptions`, `author`…) | Bỏ qua im lặng (`tags`, `title`, `description` của HackMD vẫn được dùng) |

### Bị bỏ qua / chuyển đổi (luôn có warning, không fail build)

| Cú pháp | Xử lý |
| --- | --- |
| `{%youtube id %}`, `{%vimeo %}`, `{%gist %}`, `{%hackmd %}`, `{%slideshare %}`, `{%speakerdeck %}`, `{%pdf url %}`, `{%figma url %}` | Thành **link thường** (không bao giờ là iframe) |
| `{% ... %}` khác | Bỏ qua |
| Hậu tố `=` trong ` ```python= `, ` ```python=12 ` | Bỏ qua (không có số dòng) |
| `<script>`, `<iframe>`, `on*=`, `javascript:` … | Bị loại khi sanitize |

Cú pháp bên trong code block/inline code không bao giờ bị xử lý.

---

## Admin (Sveltia CMS)

`/admin/` là Sveltia CMS **self-host**: `npm run dev`/`npm run build` tự chạy `scripts/copy-cms.mjs`
để chép bundle từ `node_modules/@sveltia/cms` (version khóa trong `package-lock.json`) vào
`public/admin/`. Không tải CMS từ CDN; JavaScript của CMS chỉ nạp ở `/admin`. File bundle đã được
gitignore. Ngoài CMS còn có trang [`/admin/import/`](#import-một-file-md-nhiều-bài) để import một file
`.md` nhiều bài.

### Trước khi dùng trên production

`backend.repo` trong `public/admin/config.yml` phải là `<tài-khoản-github>/<tên-repo>` của bạn (hiện là
`Drakie14/CTF-WU`, nhánh `main`). Đổi repo thì sửa ở đây, commit và push — `/admin/import/` cũng đọc
repo/nhánh từ file này.

### Authentication — không cần OAuth proxy / server

Sveltia CMS hiện **chưa hỗ trợ PKCE** với GitHub (GitHub chưa cho phép), còn OAuth thông thường cần
một server trung gian. Vì vậy `/admin` chỉ bật **đăng nhập bằng GitHub Personal Access Token**
(`auth_methods: [token]`), chạy hoàn toàn trên trình duyệt:

1. Mở `https://<site>/admin/` → **Sign In Using Access Token**.
2. Tạo token **fine-grained** trên GitHub (*Settings → Developer settings → Personal access tokens →
   Fine-grained tokens*): **Repository access** chỉ chọn repo blog; **Permissions → Contents:
   Read and write**. Đặt thời hạn ngắn và gia hạn khi cần.
3. Dán token vào hộp thoại. Token được lưu trong `localStorage` của trình duyệt đó, gửi thẳng tới
   `api.github.com`; **không** nằm trong repo, `config.yml`, `.env` hay build output.
4. Đăng xuất (menu tài khoản → **Sign Out**) trên máy lạ để xóa token.
5. **Bật 2FA cho GitHub** (*Settings → Password and authentication → Two-factor authentication*):
   ai có quyền vào tài khoản đều có thể tạo token sửa blog.

Khi chạy local (`npm run dev`, mở `http://localhost:4321/admin/index.html` — dev server của Astro
không tự trả `index.html` cho thư mục trong `public/`, nên `/admin/` sẽ ra 404; bản build/`npm run preview`
và Cloudflare Pages thì mở `/admin/` bình thường) có thể chọn
**Work with Local Repository** (Chrome/Edge) để sửa trực tiếp thư mục project, không cần token.

### Tạo và sửa bài

1. **Write-ups** → **New**.
2. **Title** (bắt buộc trên form CMS — chỉ ở CMS; file Markdown không có title vẫn build được).
3. **Phân loại**: chọn **Category** và **Difficulty** trong dropdown, nhập **Points**, **Date**
   (bỏ trống → ngày commit đầu tiên).
4. **Tags**: bấm **Add tag** để thêm, sửa trực tiếp trong ô, bấm **×** để xóa. Gõ tag chưa từng có
   cũng được — trang `/tags/<tag>` tự xuất hiện sau khi build.
5. **CTF**:
   - CTF **có sẵn** dạng thư mục: chọn ở ô **Parent Folder** đầu form (bài trong thư mục CTF tự nhận
     tên CTF, để trống ô CTF).
   - **CTF mới**: gõ tên vào ô **CTF** → trang `/ctf/<slug>` tự được tạo.
6. **Tạo bài từ HackMD**: HackMD → copy toàn bộ Markdown (hoặc mở file `.md` đã tải) → dán vào ô
   **Nội dung (Markdown/HackMD)**. Nếu nội dung HackMD có sẵn frontmatter, bỏ khối `---…---` đó và
   điền các ô tương ứng trên form.
7. **Ảnh**: upload ở ô **Ảnh trong bài** (nhiều ảnh) hoặc **Cover**; ảnh được lưu **cạnh `index.md`**
   của bài. Chèn vào thân bài bằng `![](./ten-anh.png)`. Key `images:` mà CMS ghi vào frontmatter chỉ
   để CMS quản lý ảnh; website bỏ qua key này. Ảnh remote của HackMD (`https://hackmd.io/_uploads/…`)
   để nguyên — build tự tải về.
8. **Save** → CMS commit lên GitHub → Cloudflare tự build.

Lọc bài: cây thư mục CTF bên trái; menu **Filter** → “Chưa phân loại”, “Chưa có CTF”, “Category: …”;
menu **Group** → CTF / Category / Difficulty.

### Import một file .md nhiều bài

Note HackMD thường gom **cả giải** vào một file: mỗi `# Category` là một mảng, mỗi `## Challenge` là
một bài. Trang `/admin/import/` tách file đó thành từng bài riêng và commit tất cả trong **một commit**:

1. Đăng nhập `/admin/` một lần trên trình duyệt đó — trang import dùng lại token Sveltia đã lưu. Chưa
   đăng nhập thì trang hiện ô nhập token (fine-grained, **Contents: Read and write**); token này chỉ
   dùng trong trang, không được lưu.
2. Mở `https://<site>/admin/import/` (link cũng có trong mô tả collection **Write-ups**) → kéo thả
   file `.md`, hoặc paste Markdown từ HackMD.
3. Xem trước: sửa **CTF**, **Ngày**, và title / category / slug của từng bài; bỏ tick bài không muốn đăng.
4. **Commit N bài lên GitHub** → Cloudflare tự build. Bài mới cũng hiện trong CMS (collection
   **Write-ups**, thư mục CTF).

```markdown
---
title: NNS CTF          # tên CTF (ưu tiên ctf:, không có thì lấy tên file)
date: 2026-09-20        # tùy chọn — gán cho mọi bài (tags: cũng vậy)
---

# Web                   ← category web
## NNS Travel           ← bài 1
...
## File monster (misc)  ← bài 2, category ghi đè thành misc
...
# Reversing             ← category rev (alias)
## Crackme              ← bài 3
```

Kết quả: `src/content/posts/NNS CTF/nns-travel/index.md`, `…/file-monster/index.md`, … mỗi file có
frontmatter `title`, `ctf`, `category` (và `date`, `tags` nếu file gốc có).

| Trong file gốc | Xử lý |
| --- | --- |
| `# Web`, `# WEB`, `# Reversing`… | Category của các bài bên dưới: không phân biệt hoa thường, nhận alias (`reverse`, `forensic`, `binary`, `cryptography`…). `#` không khớp category (ví dụ `# Labs`) → bài không có category, chọn tay trong bảng xem trước. |
| `## Tên challenge` | Một bài. `## Tên (misc)` → category `misc`, title bỏ phần `(misc)`. `## ` rỗng bị bỏ qua. |
| Nội dung giữa `#` và `##` đầu tiên | Ghép vào đầu bài đầu tiên của nhóm; nhóm không có `##` nào thì chính nhóm thành một bài. |
| `#`, `##` trong code block | Không bao giờ bị tách (ví dụ dòng `# comment` trong script). |
| `####`, `#####` trong bài | Tùy chọn **Nâng heading** (mặc định bật): heading nông nhất thành `##` để mục lục có mục. Bỏ tick để giữ nguyên. |

- **Trùng slug** (lỗi duy nhất làm build fail) bị chặn trước khi commit: trang đọc danh sách bài trong
  repo, slug đã có → tự thêm tiền tố CTF (`nns-ctf-ass`); vẫn sửa tay được. Trang cảnh báo khi bài
  có vẻ **đã import rồi**, dừng lại nếu repo vừa thay đổi giữa lúc xem trước và lúc commit, và khóa
  nút sau khi commit xong (chọn file khác để import tiếp).
- Công cụ chỉ **thêm** file. Nếu bản gộp của giải đã nằm trong repo (ví dụ `posts/CTF/NNS CTF.md`),
  xóa nó (CMS → **Write-ups (file .md đơn)**, hoặc GitHub) để không có hai bản.
- Ảnh đường dẫn tương đối (`![](./a.png)`) không được chép theo → trang cảnh báo; upload lại ảnh qua
  CMS. Ảnh HackMD (`https://hackmd.io/_uploads/…`) không bị ảnh hưởng.
- Chạy local: `npm run dev` → `http://localhost:4321/admin/import/`. Commit vẫn ghi thẳng lên repo
  GitHub trong `backend.repo`, kể cả khi chạy local.
- Logic tách nằm ở `src/lib/content/split-ctf.ts` (test: `tests/content/split-ctf.test.ts`); trang ở
  `src/pages/admin/import.astro`.

### Giới hạn về cấu trúc thư mục (mục 66.5-C)

| Cấu trúc | Collection | Ghi chú |
| --- | --- | --- |
| `posts/<slug>/index.md` | **Write-ups** | Bài mới luôn được tạo ở đây (hoặc trong thư mục CTF chọn ở Parent Folder). |
| `posts/<ctf>/<slug>/index.md` | **Write-ups** | Thư mục CTF hiện thành cây bên trái. Bài tạo bởi `/admin/import/` có dạng này. |
| `posts/<slug>.md`, `posts/<ctf>/<slug>.md` | **Write-ups (file .md đơn)** | Chỉ sửa, không tạo mới. |

- Collection dạng thư mục lồng (nested) của Sveltia không đọc được file `.md` đơn, nên dạng
  `<slug>.md` được quản lý bằng collection thứ hai. Collection này chỉ đọc sâu 2 cấp
  (`nested.depth: 2`); để 3 thì các bài `<ctf>/<slug>/index.md` cũng khớp và bị liệt kê hai lần.
- Sveltia **không tạo được thư mục CTF mới**. CTF mới được tạo bằng ô **CTF** (bài lưu ở
  `posts/<slug>/index.md` với `ctf:` trong frontmatter). Muốn gom vào thư mục CTF riêng, tạo thư mục
  qua GitHub Web UI — hoặc dùng [`/admin/import/`](#import-một-file-md-nhiều-bài), trang này tự tạo
  thư mục `posts/<CTF>/`.

### CMS không viết lại Markdown HackMD

Thân bài dùng widget `text` (văn bản thô), **không** dùng Markdown/rich-text editor, nên callout,
spoiler, code fence, `[TOC]`, `{%youtube%}`, raw HTML… được giữ nguyên từng byte. Chỉ khối
frontmatter được Sveltia ghi lại (ví dụ `tags: [a, b]` thành danh sách nhiều dòng); key lạ như
`description`, `lang` vẫn được giữ. Sveltia luôn ghi file với xuống dòng LF — `.gitattributes`
ép LF cho `*.md` để tránh diff toàn file trên Windows. Test: `tests/cms/roundtrip.test.ts`.

### CSP của `/admin`

`/admin/*` có CSP riêng trong `public/_headers` (tách khỏi CSP public bằng `! Content-Security-Policy`):
`script-src 'self'` (không `unsafe-inline`/`unsafe-eval`), `connect-src` cho `api.github.com`,
`www.githubstatus.com` và `unpkg.com/@sveltia/` (bundle không kèm bản dịch giao diện: Sveltia tải
`locales/vi.json`… từ unpkg theo ngôn ngữ trình duyệt; bị chặn thì CMS retry vô hạn và treo trang trắng
với trình duyệt không phải tiếng Anh — chỉ là fetch JSON, không phải script), `img-src` cho `*.githubusercontent.com`, `font-src` cho `cdn.jsdelivr.net`
(font giao diện mà bundle Sveltia tham chiếu cố định; chỉ là font, không phải script), kèm
`X-Robots-Tag: noindex`, `<meta name="robots" content="noindex">` và `Disallow: /admin` trong
`robots.txt`. CSP của trang public không thay đổi. `/admin/import/` nằm dưới cùng CSP này: script của
trang được bundle thành `/_astro/*.js` (`script-src 'self'`) và chỉ gọi `api.github.com`.

---

## Lệnh npm

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Dev server `http://localhost:4321` |
| `npm run build` | Build `dist/` + index Pagefind |
| `npm run preview` | Xem bản build |
| `npm run check` | Type check (`astro check`, TypeScript strict) |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run lint` | ESLint |
| `npm run verify` | Quét `dist/` (hoặc `npm run verify -- dist-fixtures`) |
| `npm run generate:fixtures` | Sinh 200 bài giả lập vào `fixtures/` (gitignored) |
| `npm run build:fixtures` / `npm run dev:fixtures` | Build/dev kèm fixtures → `dist-fixtures/` (không đụng `dist/` production) |
| `npm run clean:fixtures` | Xóa `fixtures/` và `dist-fixtures/` |
| `npm run lighthouse` | Lighthouse CI (`lighthouserc.json`, chạy trên `npm run preview`) |

## Kiểm tra chất lượng

- **Test** (`tests/`): pipeline Markdown/HackMD, alias ngôn ngữ, XSS, frontmatter, tag, múi giờ,
  round-trip CMS, config CMS/CSP, tách file CTF cho `/admin/import/`.
- **Lighthouse**: `npm run lighthouse` cần Chrome/Chromium. Nếu không tự tìm thấy, đặt
  `CHROME_PATH` tới file chạy của Chrome. Mục tiêu ≥ 95 cho Performance/Accessibility/Best
  Practices/SEO (chế độ mobile).
- **Fixtures**: `npm run build:fixtures` để thử danh sách cong và hiệu năng build với 200 bài.
- **Knip**: `npx knip` tìm dependency/file/export không dùng (cấu hình ở `knip.json`; `@sveltia/cms`
  được dùng qua `scripts/copy-cms.mjs` nên được khai báo ngoại lệ).

## Version

Version thực tế đang dùng (khóa trong `package-lock.json`, không tự ý nâng):

| Package | Version |
| --- | --- |
| Node.js | 24 (`.nvmrc`), yêu cầu ≥ 22.22.3 |
| astro | 7.3.5 |
| @astrojs/markdown-remark | 7.3.1 |
| @astrojs/rss | 4.0.19 |
| @astrojs/sitemap | 3.7.4 |
| @sveltia/cms | 0.221.1 |
| shiki | 4.4.3 |
| sharp | 0.35.4 |
| pagefind | 1.5.2 |
| tailwindcss / @tailwindcss/vite | 4.3.3 |
| typescript | 6.0.3 |
| vitest | 5.0.2 |
| eslint / typescript-eslint / eslint-plugin-astro | 10.11.0 / 8.70.1 / 3.2.1 |
| @astrojs/check | 0.9.10 |
| @lhci/cli | 0.15.1 |
| rehype-raw / rehype-sanitize | 7.0.0 / 6.0.0 |
| remark-breaks / remark-gemoji | 4.0.0 / 8.0.0 |
| unified / unist-util-visit / vfile / yaml | 11.0.5 / 5.1.0 / 6.0.3 / 2.9.1 |
| @fontsource-variable/jetbrains-mono / lexend | 5.3.0 / 5.3.0 |

Font được self-host qua Fontsource (có subset tiếng Việt, `font-display: swap`), không dùng Google Fonts.
