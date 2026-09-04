# Cluvix Livechat Widget

Widget livechat nhúng vào website: một loader vanilla-TS nhỏ gọn (`widget.js`) cộng với một iframe app
tự chứa (`widget.html`). Không dùng framework, không có runtime dependency, mục tiêu ≤ 50 KB gzip cho cả
hai file. Thiết kế để chạy được trên **bất kỳ** website nào khách của bạn dùng, nói chuyện với backend
Cluvix (hoặc backend tương thích Cluvix).

[English](./README.md)

## Bắt đầu nhanh

Thêm 1 thẻ script vào trang, ngay trước `</body>`:

```html
<script
  src="https://BACKEND_CUA_BAN/widget.js"
  data-site-key="SITE_KEY_CUA_BAN"
  data-host="https://BACKEND_CUA_BAN"
  async
></script>
```

`SITE_KEY_CUA_BAN` được cấp khi bạn tạo kênh livechat trong trang quản trị Cluvix (Cấu hình → Tổng đài
đa kênh → Livechat) — dialog kết nối sẽ đưa cho bạn đúng snippet, đã điền sẵn, kèm `data-host`.

## Data attributes

| Attribute | Bắt buộc | Mô tả |
|---|---|---|
| `data-site-key` | có | Public site key định danh kênh livechat của bạn. Không phải secret — an toàn khi để trong HTML. |
| `data-host` | không | Origin của backend phục vụ `/api/*` và `widget.html` (vd `https://chat.example.com`). Phải là origin thuần (`scheme://host[:port]`, không path/query). `http://` chỉ được chấp nhận cho `localhost`/`127.0.0.1`. Nếu bỏ trống, widget dùng đúng origin đã tải `widget.js`. Xem mục [Tự host](#tự-host) bên dưới — đó là lý do attribute này tồn tại. |
| `data-user-id` | không | Identity verification — định danh của khách tại hệ thống của bạn (email, user id…), 1–128 ký tự. Xem [Identity verification](#identity-verification). |
| `data-user-hash` | không | `hex(HMAC-SHA256(identity_secret, identifier))`, tính trên **server của bạn**. Bắt buộc đi kèm `data-user-id`. |
| `data-user-name` | không | Tên hiển thị (tuỳ chọn), chỉ điền 1 lần (không bao giờ ghi đè tên khách đã có sẵn). |
| `data-user-phone` | không | Số điện thoại (tuỳ chọn, định dạng di động VN), chỉ điền 1 lần. |
| `data-user-email` | không | Widget/API hiện đã nhận nhưng **backend chưa lưu** (v2 chưa có cột email ở hội thoại) — dành cho bản sau. |

Thiếu hoặc sai định dạng `data-host`/identity thì widget fail-closed: in `console.error` và hoặc không
mount (`data-host`), hoặc rơi về phiên ẩn danh (identity).

## Public JS API

```js
window.cluvixChat.open();      // mở khung chat
window.cluvixChat.close();     // đóng
window.cluvixChat.toggle();    // đảo trạng thái
window.cluvixChat.setUser({    // gắn/thay identity sau khi trang đã tải (vd ngay sau khi khách đăng nhập)
  identifier: 'user-42@example.com',
  identifier_hash: '<64 hex do SERVER của bạn ký>',
  name: 'Nguyễn Văn A',
  phone: '0900000000',
});
window.cluvixChat.on('ready',  () => {});   // widget đã mount, API sẵn sàng
window.cluvixChat.on('opened', () => {});
window.cluvixChat.on('closed', () => {});
window.cluvixChat.on('message', (e) => {}); // nhân viên vừa gửi tin — e.detail = { conversation_id, sent_at } CHỈ metadata, KHÔNG có nội dung
window.cluvixChat.off('opened', fn);        // huỷ đăng ký
```

Lệnh gọi TRƯỚC khi widget mount xong (script tải `async`, trang chưa sẵn sàng) được xếp hàng và chạy
ngay sau khi sự kiện `ready` phát ra. `on`/`off` chỉ là lớp đường (sugar) mỏng trên
`window.addEventListener('cluvix-chat:<name>', ...)` / `removeEventListener`, nên dùng thẳng
`addEventListener` cũng được.

`setUser()` bị throttle tối đa 1 lần/2 giây, và là no-op khi CẢ `identifier` VÀ `identifier_hash` đều
trùng identity đang áp dụng (và lượt handshake trước đó không lỗi) — tránh bão re-handshake khi code gọi
nó ở mỗi lần render.

Identity CHỈ được giữ **trong bộ nhớ** (không bao giờ `localStorage`) — reload trang mà không gửi lại
`data-user-*`/gọi lại `setUser()` sẽ bắt đầu phiên ẩn danh mới. Đây là chủ đích: máy dùng chung/kiosk
không được phép tự resume hội thoại đã xác thực của người khác từ ổ đĩa.

## Identity verification

Mặc định mọi khách là ẩn danh — widget sinh 1 token ngẫu nhiên và backend theo dõi hội thoại bằng token
đó trong `localStorage`. Nếu website của bạn đã biết khách là ai (đã đăng nhập), bạn có thể gắn
**identity** để cùng một người có cùng một hội thoại xuyên thiết bị/trình duyệt, và nhân viên thấy "đang
chat với tư cách `<tên>`" trong widget.

Mô hình (cùng hình dạng với `hmac_token` của Chatwoot, `user_hash` của Intercom, `signature` của Crisp):

- Backend của bạn có một **`identity_secret`** — được admin sinh ra trong dialog kết nối Cluvix (panel
  Identity), hiện ra cho bạn **đúng 1 lần**, và Cluvix chỉ lưu lại dưới dạng đã mã hoá.
- Với mỗi khách, **server của bạn** (không bao giờ là trình duyệt) tính:
  `identifier_hash = hex(HMAC-SHA256(identity_secret, identifier))`, trong đó `identifier` là chuỗi ổn
  định bất kỳ định danh khách trong hệ thống của bạn (user id, email…), 1–128 ký tự.
- Trang của bạn render `identifier` + `identifier_hash` vào `data-user-id` / `data-user-hash` (hoặc gọi
  `cluvixChat.setUser({...})`). Backend Cluvix tính lại HMAC bằng bản sao secret của chính nó và so sánh
  theo kiểu constant-time. Sai khớp (hoặc site chưa bật identity) sẽ làm cả phiên fail với một lỗi chung
  chung — không bao giờ tiết lộ bước nào sai.

> **⚠ TUYỆT ĐỐI KHÔNG đặt `identity_secret` trong HTML, JavaScript phía client, repo công khai, hay bất
> kỳ code nào được gửi tới trình duyệt.** Chỉ `identifier` và `identifier_hash` thuộc về trang — hash an
> toàn để lộ ra (không thể đảo ngược lại thành secret), còn chính secret thì không bao giờ được rời khỏi
> server của bạn.

Hash identity không có hạn dùng (v2 không có claim `exp`/chống replay — xem đánh đổi ở mục
[Ghi chú bảo mật](#ghi-chú-bảo-mật) bên dưới). Xoay secret trong dialog kết nối sẽ vô hiệu hoá ngay lập
tức mọi hash đã cấp trước đó.

### Ví dụ: tính hash phía server

Dùng chung 1 vector test cho mọi ngôn ngữ dưới đây, để bạn tự đối chiếu cài đặt của mình:

```
secret     = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
identifier = "user-42"
expected   = "a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659"
```

> Vector này CHỈ để kiểm tra — tuyệt đối không dùng làm `identity_secret` thật.

**Node.js**

```js
const crypto = require('crypto');
const hash = crypto
  .createHmac('sha256', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')
  .update('user-42')
  .digest('hex');
// => a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659
```

**Go**

```go
import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
)

mac := hmac.New(sha256.New, []byte("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"))
mac.Write([]byte("user-42"))
hash := hex.EncodeToString(mac.Sum(nil))
// => a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659
```

**PHP**

```php
$hash = hash_hmac(
    'sha256',
    'user-42',
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
);
// => a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659
```

**Python**

```python
import hmac, hashlib

hash_ = hmac.new(
    b'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    b'user-42',
    hashlib.sha256,
).hexdigest()
# => a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659
```

> Key HMAC là **chuỗi ASCII** của secret (64 ký tự như đã cấp), KHÔNG phải 32 byte giải mã từ hex — lỗi
> thường gặp khi chuyển đổi giữa các ngôn ngữ.

## Tự host

`widget.js` có thể serve từ bất cứ đâu (CDN riêng, subdomain khác…), nhưng **`widget.html` PHẢI được
serve CÙNG origin với `data-host`**: iframe gọi `/api/*` trên chính origin đó mà không qua CORS, và
backend kiểm header `Origin` của request cho lượt handshake đầu. Nếu `data-host` trỏ tới một backend
thực ra không serve `/widget.html` + `/api/client/livechat/*`, widget sẽ không tải được dữ liệu (biểu
hiện: trạng thái "offline" dai dẳng, console trình duyệt hiện lỗi fetch).

Trong repo này, `npm run build:widget` (xem [Build](#build)) xuất cả `widget.js` lẫn `widget.html` thẳng
vào `../../public` (thư mục static của app cha), mặc định khi phát triển trong monorepo. Khi bạn dùng
package này ĐỘC LẬP (ngoài monorepo), bạn phải tự lo việc publish output build đó cạnh backend của mình
— cờ override `WIDGET_OUT_DIR` cho quy trình standalone gọn hơn đang được theo dõi riêng và CHƯA nằm
trong bản này.

## Contract API

Mọi endpoint dưới đây nằm dưới `/api/client/livechat/` trên backend được `data-host` trỏ tới. Đây là bề
mặt public, cố ý KHÔNG auth (bảo vệ bằng `site_key` + allow-list `Origin`, rate limit, và JWT chỉ-dành-
cho-visitor có scope hẹp) — đây là những gì loader nói chuyện, và được tài liệu hoá ở đây để bạn dễ tự
viết client riêng, hoặc tự kiểm chứng hành vi của widget.

| Method | Path | Auth | Mục đích |
|---|---|---|---|
| POST | `/session` | không (phát JWT) | Handshake: resolve `site_key`, kiểm `Origin`, verify `identity` (nếu có), tạo/resume hội thoại, trả `visitor_jwt` + config. |
| GET | `/campaigns?site_key=` | không | Preview tin nhắn chủ động (campaign `enabled`), dùng TRƯỚC khi khách mở chat. |
| GET | `/sse?token=` | JWT visitor (query param) | Stream Server-Sent Events: `connected`, `new_message` (từ nhân viên), `staff_typing`. |
| POST | `/message` | JWT visitor | Khách gửi tin nhắn. |
| GET | `/messages?offset=&limit=` | JWT visitor | Lịch sử tin nhắn phân trang, đúng hội thoại của khách. |
| POST | `/typing` | JWT visitor | Báo cho nhân viên biết khách đang gõ. Không lưu lại. |
| POST | `/campaigns/:id/trigger` | JWT visitor | Khách bấm vào preview campaign — tạo tin mở đầu đúng 1 lần (idempotent). |

JWT visitor (trả về từ `/session` dưới tên `visitor_jwt`) gắn cứng đúng 1 `conversation_id` — mọi
endpoint có auth đọc hội thoại TỪ token, không bao giờ từ request body, nên 1 JWT không bao giờ đọc/ghi
được hội thoại của khách khác.

### `POST /session`

Request body:

```json
{
  "site_key": "…",
  "visitor_token": "…",
  "pre_chat": { "name": "…", "phone": "…" },
  "identity": {
    "identifier": "…",
    "identifier_hash": "…",
    "name": "…",
    "phone": "…",
    "email": "…"
  }
}
```

- `visitor_token` — token của phiên trước, để resume hội thoại **ẩn danh**. Bị BỎ QUA khi có `identity`.
- `pre_chat` — tên/số điện thoại thu được từ form pre-chat (tuỳ chọn).
- `identity` — xem [Identity verification](#identity-verification). `email` được nhận nhưng backend
  chưa lưu ở v2.

Response (`.data`):

```json
{
  "visitor_jwt": "…",
  "visitor_token": "…",
  "conversation_id": 123,
  "identity_verified": false,
  "display_name": "…",
  "config": {
    "widget_theme": { "primary_color": "#1677ff", "position": "right", "greeting_text": "…", "offline_text": "…" },
    "pre_chat_form": { "enabled": true, "require_name": true, "require_phone": true, "require_message": true }
  }
}
```

Mọi kiểu lỗi của `/session` (không tìm thấy `site_key`, site bị tắt, `Origin` không được phép, bắt buộc
identity mà thiếu, site chưa bật identity, sai định dạng hash, sai chữ ký) đều trả về CÙNG MỘT thông
điệp lỗi 403 chung chung — đây là chủ đích, để endpoint không thể bị dùng để dò xem `site_key` nào tồn
tại hay site nào đã bật identity.

## Build

```bash
npm run type-check   # tsc --noEmit
npm run build:widget # type-check + build:loader (widget.js) + build:app (widget.html)
npm run size          # gate gzip-size, fail nếu widget.js + widget.html cộng lại vượt 50 KB gzip
```

## Dev / test local

```bash
npm run dev # serve dev/ ở http://localhost:5500 (không thêm runtime dependency)
```

Mở `http://localhost:5500`, dùng form trên trang để trỏ demo tới backend + site key của bạn (xem
`dev/index.html`), và nhớ thêm `http://localhost:5500` vào `allowed_origins` của site đó.

## Giới hạn v2

- **Không hỗ trợ đính kèm file** — chỉ văn bản.
- **Không gộp phiên ẩn danh↔xác thực** — khách chat ẩn danh rồi mới đăng nhập (gắn identity qua
  `setUser`) sẽ có hội thoại **MỚI**; lịch sử ẩn danh trước đó KHÔNG được chuyển sang. Widget hiện "đang
  chat với tư cách `<tên>`" khi identity đã xác thực nên khách nhìn thấy được điều này.
- **Footer "Powered by Cluvix" cố định** trong khung chat — v2 không cấu hình được.
- Hash identity không có hạn dùng (không `exp`/chống replay) — xem
  [Ghi chú bảo mật](#ghi-chú-bảo-mật).

## Ghi chú bảo mật

Xem [SECURITY.md](./SECURITY.md) để biết cách báo lỗi bảo mật. Tóm tắt:

- `site_key` là public key, không phải secret — được bảo vệ bằng allow-list `Origin` + rate limit, cùng
  mô hình với đa số widget livechat khác (`website_token` của Chatwoot, `app_id` của Intercom,
  `website_id` của Crisp).
- `identity_secret` không bao giờ được rời khỏi server của bạn; chỉ hash suy ra từ nó được gửi tới trình
  duyệt.
- Hash identity không có hạn dùng ở v2 — ai lấy được cặp `(identifier, identifier_hash)` hợp lệ (vd rò
  rỉ từ trang partner) có thể mở hội thoại của khách đó cho tới khi secret được xoay. Đừng log hay để lộ
  hash ở bất cứ đâu không cần thiết.
- Mọi lỗi handshake trả về đúng 1 mã 403 chung chung (không có oracle để dò site/identity).

## License

[MIT](./LICENSE)
