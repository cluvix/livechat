# Sổ tay vận hành

Dành cho hai nhóm người đọc:

- **quản trị viên phòng khám** tạo và cấu hình site livechat **trong app Cluvix**;
- **ops** triển khai backend Cluvix và phát hành `widget.js` / `widget.html`.

Chỗ nào ghi *trong app Cluvix* nghĩa là làm trong giao diện quản trị Cluvix, nằm ngoài repo này.

- [Phần A — Quản trị viên](#phần-a--quản-trị-viên)
  - [A1. Tạo site livechat](#a1-tạo-site-livechat)
  - [A2. Luật `allowed_origins`](#a2-luật-allowed_origins)
  - [A3. Lấy site key và snippet](#a3-lấy-site-key-và-snippet)
  - [A4. Theme, pre-chat, logo](#a4-theme-pre-chat-logo)
  - [A5. Identity verification](#a5-identity-verification)
  - [A6. Chiến dịch](#a6-chiến-dịch)
- [Phần B — Ops](#phần-b--ops)
  - [B1. Biến môi trường backend](#biến-môi-trường-backend)
  - [B2. nginx](#b2-nginx)
  - [B3. Service worker](#b3-service-worker)
  - [B4. Deploy / đồng bộ widget](#b4-deploy--đồng-bộ-widget)
  - [B5. Rollback](#b5-rollback)
  - [B6. Nâng cấp — tương thích widget ↔ backend](#b6-nâng-cấp--tương-thích-widget--backend)
- [Checklist go-live](#checklist-go-live)

---

## Phần A — Quản trị viên

### A1. Tạo site livechat

**Trong app Cluvix:** *Cấu hình → Kênh kết nối (`/config/omni-channel`) → thẻ Livechat → tạo kênh livechat.*

Các trường khi tạo (`POST /config/omni-channel/livechat`):

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `name` | có | Tên hiển thị của site. Cũng thành `widget_theme.brand_name` ban đầu khi bạn chưa đặt riêng. |
| `allowed_origins` | có | Ít nhất một origin — xem [A2](#a2-luật-allowed_origins). Danh sách rỗng nghĩa là **không cho phép gì cả**, không phải "cho phép hết". |
| `branch_id` | không | Phải thuộc công ty đang hoạt động. |
| `widget_theme` | không | Tập con bất kỳ; trường con không khai sẽ lấy mặc định (`primary_color: #1677ff`, `position: right`, `locale: vi`, `color_scheme: auto`, chuỗi chào/ngoại tuyến theo ngôn ngữ). |
| `pre_chat_form` | không | Mặc định: `enabled`, `require_name`, `require_phone`, `require_message` đều **true**, `phone_region: VN`. |

Công ty LUÔN lấy từ phiên đang hoạt động, không bao giờ từ thân request. Site được tạo với trạng thái
`connected`; `site_key` là chuỗi 32 ký tự hex ngẫu nhiên do server sinh.

Khi cập nhật (`PUT …/livechat/:accountId`) chỉ `name`, `allowed_origins`, `widget_theme` và `pre_chat_form`
ghi được — `site_key`, công ty, chi nhánh và kênh đều bị khoá. Trường JSON không gửi thì giữ nguyên giá trị
hiện tại.

Các luật validate sẽ khiến bản cập nhật bị từ chối:

- `primary_color` phải là `#RGB` hoặc `#RRGGBB` (giá trị này được nhúng vào CSS trên trang của khách, nên
  chuỗi tự do bị từ chối); để trống là hợp lệ và có nghĩa "dùng màu mặc định".
- `greeting_text` ≤ 300, `brand_name` ≤ 80, `subtitle` ≤ 120 ký tự.
- `position` ∈ `left | right`; `locale` ∈ `vi | en`; `color_scheme` ∈ `auto | light | dark`;
  `phone_region` ∈ `VN | INTL`.
- `launcher_offset_x` / `launcher_offset_y` ∈ `0..200`.
- `logo_url` phải là `https:` (không có khoảng trắng ở bất kỳ đâu) và ≤ 500 ký tự.

### A2. Luật `allowed_origins`

Mỗi phần tử là một **origin thuần** — `scheme://host[:port]`, không gì thêm:

- không path, query, fragment hay `user:pass@`;
- **không wildcard** (`https://*.example.com` bị từ chối);
- `https://` cho mọi thứ thật; `http://` **chỉ** chấp nhận cho `localhost` và `127.0.0.1` (dev cục bộ);
- trùng lặp bị loại; giá trị lưu ở dạng chữ thường.

Lúc handshake, cả hai phía đều được chuẩn hoá trước khi so — hạ chữ thường, bỏ dấu `/` cuối, và bỏ port mặc
định (`:443` với https, `:80` với http) — nên `https://shop.example.com` và `https://shop.example.com:443/`
khớp nhau.

Hệ quả thực tế:

- **Mọi** hostname mà trình duyệt khách có thể hiển thị đều phải được khai: `https://example.com` và
  `https://www.example.com` là hai origin khác nhau.
- Domain staging là một mục riêng.
- Trang `file://` hoặc ngữ cảnh không có origin sẽ không gửi header `Origin` và luôn bị từ chối.

### A3. Lấy site key và snippet

Response create/update chứa `site_key`, một `snippet` sẵn dùng, cùng `snippet_host` và
`snippet_host_source`. Snippet là:

```html
<script src="{host}/widget.js" data-site-key="{site_key}" data-host="{host}" async></script>
```

`{host}` lấy từ `PUBLIC_BASE_URL` khi biến này là một origin thuần hợp lệ
(`snippet_host_source: "public_base_url"`); ngược lại backend rơi về callback URL của công ty hoặc `Host`
của request (`snippet_host_source: "fallback"`). **Thấy `fallback` thì phải kiểm host trước khi giao
snippet cho khách hàng** — host sai sinh ra một widget tải được nhưng không bao giờ kết nối.

`site_key` là công khai theo thiết kế (nó nằm trong mã nguồn trang). Nó không phải bí mật; lớp bảo vệ là
danh sách `Origin` cho phép cộng với rate limit.

### A4. Theme, pre-chat, logo

Các trường theme và pre-chat được mô tả trong [README](../../README.vi.md#theme--đa-ngôn-ngữ); luật suy
diễn (locale, tương phản, chế độ tối) nằm ở
[Widget hoạt động thế nào §10](./HOW_IT_WORKS.md#10-locale-theme-chế-độ-tối).

**Logo** (`POST …/livechat/:accountId/logo`, multipart trường `file`):

- **≤ 1 MB**, và kiểu file được quyết định từ **magic bytes**, không phải từ tên file hay header
  `Content-Type` — file `.txt` đổi tên thành `.png` sẽ bị từ chối;
- lưu trên S3 dạng public-read dưới `livechat/logo/<company_id>/<account_id>/…`, và URL kết quả được ghi
  vào `widget_theme.logo_url`;
- logo cũ được xoá sau đó theo kiểu best-effort, và chỉ khi URL thuộc chính bucket của Cluvix — URL admin
  tự dán tay thì không bao giờ bị đụng tới;
- `DELETE …/logo` xoá `logo_url` và idempotent.

Nếu logo tải lỗi trên trình duyệt khách (404, chặn hotlink, CDN bị chặn), widget thay bằng chữ cái đầu của
thương hiệu ở đúng kích thước — không bao giờ để lại ô ảnh vỡ.

### A5. Identity verification

**Trong app Cluvix:** panel Identity trong hộp thoại kết nối.

| Hành động | Endpoint | Hành vi |
|---|---|---|
| Bật | `POST …/identity` `{action:"enable", mandatory?}` | Sinh secret. **Secret dạng thô chỉ trả về đúng một lần** — sao chép ngay; sau đó không bao giờ đọc lại được. Bật lại trên site đã có identity sẽ trả `409` thay vì âm thầm xoay khoá. |
| Xoay | `POST …/identity` `{action:"rotate", mandatory?}` | Secret mới, cũng chỉ trả về một lần. **Mọi hash đã phát trước đó ngừng hoạt động ngay lập tức** — phải phối hợp với site đối tác. Xoay trên site chưa từng bật identity trả `422`. |
| Tắt | `POST …/identity` `{action:"disable"}` | Xoá secret và ép `mandatory` về tắt. Idempotent. |
| Bật/tắt bắt buộc | `PATCH …/identity` `{mandatory:bool}` | `422` nếu identity chưa bật — bật `mandatory` mà không có secret sẽ từ chối *mọi* handshake. |

Sau đó chỉ còn đọc được `secret_last4`, để đối chiếu với bản mà đối tác đang giữ. Nhật ký bảo mật ghi lại
các thao tác bật/xoay/tắt/đổi cờ kèm id account, không bao giờ kèm secret.

`mandatory: true` nghĩa là handshake **không** kèm `identity` sẽ bị từ chối. Chỉ bật khi các trang của đối
tác đã phát `data-user-id`/`data-user-hash` (hoặc gọi `setUser`) một cách chắc chắn — nếu không, khách ẩn
danh sẽ thấy trạng thái ngoại tuyến.

Cần đưa cho đối tác: secret (qua kênh an toàn), và
[các đoạn mã tính HMAC trong README](../../README.vi.md#ví-dụ-tính-hash-phía-server), bao gồm cả lưu ý rằng
khoá HMAC là **chuỗi ASCII** của secret, không phải 32 byte giải mã từ hex.

### A6. Chiến dịch

Xem [CAMPAIGNS.md](./CAMPAIGNS.md) cho bốn endpoint quản trị, luật khớp và các giới hạn hiện tại.

---

## Phần B — Ops

### Biến môi trường backend

| Biến | Bắt buộc | Hậu quả khi sai/thiếu |
|---|---|---|
| `JWT_LIVECHAT_KEY` | **có, ở production** | Khoá HMAC cho visitor JWT, tách riêng khỏi khoá staff/partner để token của khách không bao giờ dùng chéo được sang API khác. Để rỗng vẫn ký được nhưng KHÔNG an toàn. Sinh bằng `openssl rand -hex 32`. |
| `EMR_CONFIG_ENCRYPTION_KEY` | **có, ở production** | Mã hoá `identity_secret` khi lưu (marker `enc:v1:`). Thiếu → không giải mã được secret, mọi handshake identity thất bại với 403 chung (lý do `secret_undecryptable` trong nhật ký bảo mật) và `secret_last4` hiện rỗng. **Đổi khoá này làm mọi giá trị đã mã hoá không đọc được nữa.** |
| `TRUSTED_PROXIES` | **có, khi chạy sau proxy** | Thiếu nó thì gin bỏ qua `X-Forwarded-For` và mọi request đều trông như `127.0.0.1`. Mã phát hiện điều đó và **tắt các tầng theo IP** (rate limit và cap kết nối SSE) thay vì biến chúng thành một bucket toàn cục — ghi một lần cảnh báo `TRUSTED_PROXIES chưa cấu hình, rate limit/cap theo IP bị tắt`. Đặt đúng địa chỉ proxy (vd `127.0.0.1`). |
| `PUBLIC_BASE_URL` | nên có | Origin thuần của backend, dùng làm `data-host` và `src` trong snippet sinh ra. Không được có path/query/fragment/credentials, nếu sai thì bị bỏ qua kèm một cảnh báo và snippet rơi về fallback (xem [A3](#a3-lấy-site-key-và-snippet)). |
| `LIVECHAT_RATE_SESSION_IP` | không | Trần handshake theo `(site_key, IP)` mỗi phút. Mặc định **120**. |
| `LIVECHAT_RATE_VISITOR` | không | Tin nhắn mỗi hội thoại mỗi phút. Mặc định **10**. |
| `LIVECHAT_RATE_IP` | không | Tin nhắn mỗi `(site_key, IP)` mỗi phút. Mặc định **30**. |
| `LIVECHAT_RATE_READ` | không | `GET /messages` mỗi hội thoại mỗi phút. Mặc định **60**. |
| `VISITOR_SSE_MAX_CONN_PER_IP` | không | Kết nối SSE mỗi IP. Mặc định **3**. |
| `VISITOR_SSE_TOTAL_CAP` | không | Tổng kết nối SSE. Mặc định **2000**. |

Mọi giá trị rate đều rơi về mặc định khi không set, không parse được, hoặc `<= 0`. Rate limit là
**fail-open**: Redis chết thì request được cho qua chứ không bị chặn.

> Lưu ý: dòng chú thích cạnh `LIVECHAT_RATE_READ` trong `backend/.env.example` nói rằng biến này chưa được
> code đọc. Chú thích đó đã cũ — bộ giới hạn đọc có đọc biến này. Hãy tin mã nguồn (`ratelimit.go`).

### B2. nginx

Ba location exact-match là quan trọng. `location =` thắng location regex bất kể thứ tự khai báo.

**`/widget.html`** — điểm vào của iframe, được nhúng trên site khách hàng:

- `Cache-Control: no-cache` (điểm vào, luôn phải mới);
- `Content-Security-Policy: frame-ancestors *;` — cố ý cho nhúng từ mọi origin. Việc nhúng **không** bị
  chặn ở đây; nó bị chặn tại `POST /api/client/livechat/session` bằng danh sách `Origin` cho phép;
- **không** thêm `X-Frame-Options` ở đây — `SAMEORIGIN`/`DENY` mâu thuẫn trực tiếp với `frame-ancestors *`.

**`/widget.js`** — `Cache-Control: public, max-age=3600` (**1 giờ, không `immutable`**): khác bundle Angular
có hash trong tên, tên file này cố định, nên một bản lỗi phải thu hồi được trong vòng một giờ.
`Access-Control-Allow-Origin: *` đặt cho nhất quán (bản thân `<script src>` không cần CORS, nhưng site khách
có thể `fetch` file version cùng lúc).

**`/widget.version.json`** — `no-cache, no-store, must-revalidate`, nếu không thì kiểm tra version lại đọc
đúng câu trả lời cũ.

**`/api/client/livechat/sse`** — khai dạng exact match để không bị khối `^~ /api/client/` nuốt mất:

- `proxy_buffering off`, `proxy_cache off`, `chunked_transfer_encoding off`,
  `add_header X-Accel-Buffering no` — buffering giết chết "realtime"; backend cũng tự gửi
  `X-Accel-Buffering: no`;
- `proxy_read_timeout 3600s` / `proxy_send_timeout 3600s` — nhịp tim của backend là 25 s, nên timeout proxy
  thấp chỉ sinh ra các lượt reconnect oan;
- **không `limit_req`** — đây là một kết nối giữ lâu, không phải REST call; giới hạn theo khách/IP đã làm ở
  tầng ứng dụng (`LIVECHAT_RATE_*`);
- `proxy_http_version 1.1` đã có trong `proxy_params`; khai lại trong cùng context là lỗi cấu hình nginx.

Tham chiếu: `host/nginx/srv-103.155.161.54/app.cluvixsolutions.com.conf` trong monorepo Cluvix.

### B3. Service worker

App Angular có đăng ký service worker. `widget.html` tải trong iframe là một request `navigate`, nên nếu
không có ngoại lệ thì SW sẽ trả về `index.html` của SPA và khách sẽ thấy lỗi "trang không tồn tại" của
router Angular **ngay bên trong khung chat**.

Ngoại lệ đó là `NON_SPA_EXACT = ['/widget.html']` trong `frontend/src/custom-ngsw-worker.js`. Khi sửa file
đó, giữ nguyên mục này. Trình duyệt đã cài SW cũ vẫn phục vụ từ bản cũ tới khi SW mới kích hoạt — xem
[Khung hiện "trang không tồn tại"](./TROUBLESHOOTING.md#khung-hiện-trang-không-tồn-tại).

### B4. Deploy / đồng bộ widget

Monorepo Cluvix tiêu thụ **bản build**, không bao giờ tiêu thụ mã nguồn, qua đúng một script:

```bash
scripts/sync_widget.sh v1.3.4      # tải asset của release, verify SHA256SUMS, ghi vào public/
scripts/sync_widget.sh --local     # build từ frontend/widget — chỉ dùng khi dev
```

Nó ghi đúng ba file và không gì khác: `public/widget.js`, `public/widget.html`, và
`public/widget.version.json` (`{version, sha256_js, sha256_html, synced_at}`). Checksum lệch thì dừng trước
khi copy bất cứ thứ gì. `--local` đóng dấu version là `local-<git sha>` — đừng bao giờ phát hành bản đó.

`WIDGET_REPO` ghi đè repo GitHub (mặc định `cluvix/livechat`).

Kiểm tra sau khi deploy:

```bash
# 1. version mà site đang công bố
curl -s https://YOUR_HOST/widget.version.json

# 2. widget.js được phục vụ, cache 1 giờ, và mở CORS
curl -sI https://YOUR_HOST/widget.js | grep -iE 'HTTP/|cache-control|access-control-allow-origin'

# 3. widget.html nhúng được và không bị cache
curl -sI https://YOUR_HOST/widget.html | grep -iE 'HTTP/|cache-control|content-security-policy|x-frame-options'
#    kỳ vọng: frame-ancestors *   và KHÔNG có dòng X-Frame-Options

# 4. byte đang phục vụ khớp với thứ file version ghi lại
curl -s https://YOUR_HOST/widget.js | shasum -a 256

# 5. handshake từ một origin được phép (thay cả hai giá trị)
curl -s -X POST https://YOUR_HOST/api/client/livechat/session \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://ALLOWED_ORIGIN' \
  -d '{"site_key":"YOUR_SITE_KEY"}' | head -c 400

# 6. cùng request đó từ origin không được phép phải là 403 chung
curl -s -X POST https://YOUR_HOST/api/client/livechat/session \
  -H 'Content-Type: application/json' -H 'Origin: https://not-allowed.example' \
  -d '{"site_key":"YOUR_SITE_KEY"}'
```

### B5. Rollback

1. Chạy lại sync với tag trước đó: `scripts/sync_widget.sh v1.3.3`.
2. Xác nhận `public/widget.version.json` hiện version cũ và checksum đã đổi.
3. Vì `widget.js` được cache tới một giờ ở edge và trong trình duyệt, hãy chờ tối đa **1 giờ** để mọi khách
   quay về bundle cũ. `widget.html` là `no-cache` nên đổi ngay lập tức.
4. Hai file phải đi **cùng nhau** — loader và app dùng chung `src/shared/` (giao thức postMessage và các
   kiểu dữ liệu). Đừng bao giờ trộn `widget.js` của bản này với `widget.html` của bản khác.

Rollback riêng widget không cần rollback backend: mọi trường widget đọc đều là tuỳ chọn ở cả hai phía (xem
dưới).

### B6. Nâng cấp — tương thích widget ↔ backend

Contract là **cộng thêm**. Mọi trường ra đời sau 1.0.0 đều tuỳ chọn trên đường truyền, và cả hai phía đều
thoái lui êm thay vì hỏng:

- **widget mới trên backend cũ** thấy trường thiếu và áp mặc định đã ghi trong tài liệu;
- **widget cũ trên backend mới** bỏ qua các trường nó không biết.

| Bản widget | Khả năng backend mà nó tiêu thụ | Hành vi khi backend không cung cấp |
|---|---|---|
| 1.0.0 | `POST /session` (`site_key`, danh sách `Origin`, `identity`), `/message`, `/messages`, `/typing`, `/sse`, `/campaigns`, `/campaigns/:id/trigger`; `widget_theme` `primary_color`/`position`/`greeting_text`/`offline_text`/`launcher_label`/`logo_url`/`brand_name`/`subtitle`; `pre_chat_form` `enabled`/`require_name`/`require_phone`/`require_message` | Nền tảng — các endpoint này là bắt buộc. |
| 1.1.0 – 1.1.1 | không gì ngoài 1.0.0 (chỉ đổi UI) | — |
| 1.2.0 | `widget_theme.locale`, `pre_chat_form.phone_region` | Locale rơi về `<html lang>` → `navigator.language` → `vi`; validate SĐT rơi về `VN`. |
| 1.3.0 | `widget_theme.color_scheme`, `launcher_offset_x`, `launcher_offset_y` | `auto` (theo hệ điều hành khách) và offset `20 px`. |
| 1.3.1 – 1.3.4 | không gì ngoài 1.3.0 (sửa lỗi và refactor nội bộ) | — |

Có hai hành vi nên xác nhận backend có hỗ trợ trước khi dựa vào, vì cách widget xử lý chúng không phải
fallback mà là tối ưu: nhịp tim `:ping` của SSE và sự kiện `expired`. Không có `expired`, widget vẫn hồi
phục được khi JWT hết hạn — nó chỉ phải chờ hai lỗi kết nối liên tiếp thay vì phản ứng ngay.

Để dựng ghi chú nâng cấp cho một bước nhảy cụ thể, đọc [CHANGELOG.md](../../CHANGELOG.md) giữa hai tag: mục
`### Added` nêu các trường cấu hình mới (đều tuỳ chọn), mục `### Security` và `### Fixed` cho biết khách sẽ
thấy khác gì.

---

## Checklist go-live

1. `JWT_LIVECHAT_KEY` và `EMR_CONFIG_ENCRYPTION_KEY` đã set trong môi trường backend.
2. `TRUSTED_PROXIES` đã set — nếu không thì mọi lớp bảo vệ theo IP đều tắt (kiểm cảnh báo lúc khởi động).
3. `PUBLIC_BASE_URL` trỏ đúng origin backend thật, và response create/update báo
   `snippet_host_source: "public_base_url"`.
4. nginx: `/widget.html` (`no-cache` + `frame-ancestors *`, không `X-Frame-Options`), `/widget.js`
   (`max-age=3600`), `/widget.version.json` (`no-cache`), `/api/client/livechat/sse` (exact match, không
   buffering, timeout 3600 s, không `limit_req`).
5. `NON_SPA_EXACT` trong service worker vẫn còn `/widget.html`.
6. Đã chạy `scripts/sync_widget.sh <tag>` với một tag release thật; `public/widget.version.json` khớp
   checksum đang phục vụ trên production.
7. Site được tạo với `allowed_origins` đúng — mọi hostname khách thật sự thấy, chỉ `https` (trừ
   `localhost` khi dev).
8. Snippet đã nằm trên trang khách hàng ngay trước `</body>`, có `data-site-key` và `data-host`, và CSP
   `script-src` của khách cho phép host widget.
9. Smoke test từ site thật: nút mở chat hiện → mở → gửi một tin → tin về tới hộp thư Omnichat → câu trả
   lời của nhân viên hiện ra trong vài giây mà không cần tải lại trang.
10. Identity (nếu dùng): đối tác tính hash phía server, `secret_last4` khớp, và `mandatory` chỉ bật sau khi
    các trang của đối tác đã phát identity một cách chắc chắn.

---

## Xem thêm

- [Widget hoạt động thế nào](./HOW_IT_WORKS.md) — luồng mà các thiết lập này điều khiển.
- [Khắc phục sự cố](./TROUBLESHOOTING.md) — khi checklist đã qua mà vẫn không chạy.
- [Chiến dịch](./CAMPAIGNS.md) — tin chủ động.
- [SUPPORT.md](../../SUPPORT.md) — hỏi ở đâu.
