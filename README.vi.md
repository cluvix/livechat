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

## Tài liệu

| Tài liệu | Dành cho | Nội dung |
|---|---|---|
| [Widget hoạt động thế nào](./docs/vi/HOW_IT_WORKS.md) | mọi người | Luồng đầu-cuối, giao thức `postMessage` loader ↔ iframe, lưu trữ phía client, rate limit, cách suy diễn locale/theme/chế độ tối. |
| [Vận hành](./docs/vi/OPERATIONS.md) | admin + ops | Tạo site, luật `allowed_origins`, identity secret, campaign, biến môi trường backend, nginx, service worker, deploy/rollback/nâng cấp, checklist go-live. |
| [Khắc phục sự cố](./docs/vi/TROUBLESHOOTING.md) | mọi người | Triệu chứng → nguyên nhân → cách kiểm → cách sửa, mỗi mục kèm lệnh `curl` hoặc bước DevTools. |
| [Chiến dịch](./docs/vi/CAMPAIGNS.md) | admin | Tin chủ động: cấu hình, luật khớp URL/thời gian, snooze, idempotency, giới hạn hiện tại. |
| [Support](./SUPPORT.md) | mọi người | Hỏi ở đâu, phạm vi hỗ trợ, và cần kèm thông tin gì khi báo lỗi (tiếng Anh). |

Bản tiếng Anh nằm ở [`docs/`](./docs/), cùng tên file.

### Tóm tắt trong 5 dòng

1. `widget.js` chạy trên trang của bạn, đọc các thuộc tính `data-*`, và vẽ nút mở chat trong một Shadow DOM.
2. Mở khung sẽ khiến **loader** gọi `POST /session` — chỉ trang của bạn mới mang đúng `Origin` mà backend
   kiểm — và nhận về visitor JWT hạn 1 giờ cùng cấu hình theme/pre-chat của site.
3. Loader trao phiên đó cho iframe `widget.html` qua kênh `postMessage` khoá origin; iframe giữ giao diện
   chat và mọi lời gọi có xác thực bằng JWT.
4. Tin nhắn đi ra qua `POST /message` (optimistic, gửi lại với cùng `client_echo_id`) và quay về qua một
   stream SSE có nhịp tim, kết nối lại theo backoff, và nạp bù lịch sử sau khi mất kết nối.
5. Hai phần tuỳ chọn chồng lên trên: identity verification (HMAC, ký ở server của bạn) cho một hội thoại đi
   theo con người xuyên thiết bị, và chiến dịch chủ động khớp hoàn toàn trong trình duyệt.

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


## Theme & đa ngôn ngữ

Toàn bộ mục dưới đây cấu hình **ở admin Cluvix** (Cấu hình → Kênh kết nối (`/config/omni-channel`) → thẻ Livechat), KHÔNG đặt trong
thẻ script — backend trả về trong `POST /session` và widget áp dụng ngay.

### `widget_theme`

| Field | Kiểu | Mô tả |
|---|---|---|
| `primary_color` | hex | Màu thương hiệu. Các bề mặt CÓ CHỮ (header, bong bóng của khách, nút gửi, nút chính, nút mở chat) được tô bằng biến thể **tối hơn** tự tính, để chữ trên đó luôn đạt WCAG 2.1 AA (4.5:1) — xem bên dưới. |
| `position` | `left` \| `right` | Góc dưới đặt nút mở chat/khung chat. |
| `greeting_text` | string | Câu chào đầu khung chat. Bỏ trống → câu chào mặc định theo locale. |
| `offline_text` | string | Hiện khi kênh không khả dụng. Bỏ trống → text mặc định theo locale. |
| `launcher_label` | string | Chữ trên nút mở chat. Mặc định "Tư vấn" (vi) / "Chat with us" (en). |
| `logo_url` | URL https | Logo ở header/avatar. CHỈ nhận `https:`; khác thì rơi về chữ cái đầu thương hiệu. |
| `brand_name` | string | Tiêu đề header. Bỏ trống → `launcher_label`, rồi tới mặc định theo locale. |
| `subtitle` | string | Dòng dưới tiêu đề. Bỏ trống → widget hiện trạng thái trực tuyến/ngoại tuyến. |
| `locale` | `vi` \| `en` | Ngôn ngữ UI. Tuỳ chọn — xem [Locale](#locale) bên dưới. |
| `color_scheme` | `auto` \| `light` \| `dark` | Chế độ sáng/tối. `auto` (mặc định) theo hệ điều hành của khách (`prefers-color-scheme`); `light`/`dark` ép cứng. Tuỳ chọn — thiếu field ⇒ `auto`. |
| `launcher_offset_x` | number | Khoảng cách **px** từ nút mở chat tới mép trái/phải (theo `position`). Mặc định `20`, clamp `0..200`; giá trị không phải số hữu hạn ⇒ dùng mặc định. Khung chat (desktop) và bong bóng campaign dùng chung offset này. |
| `launcher_offset_y` | number | Khoảng cách **px** từ nút mở chat tới mép dưới. Mặc định `20`, clamp `0..200`. Máy có tai thỏ được cộng thêm safe-area inset. |

**Chế độ tối.** Mọi màu trung tính (nền, chữ, viền, ô nhập) đều là biến CSS và tự đổi sang bảng màu tối
khi hệ điều hành của khách đang ở chế độ tối — không cần cấu hình gì. `color_scheme` chỉ dùng khi muốn ép
khác đi. `primary_color` KHÔNG bị chế độ đổi màu: cả 2 bảng đều đi qua đúng luật contrast dưới đây.

**Tự bảo đảm contrast.** `primary_color` chỉ giữ nguyên ở các chi tiết KHÔNG có chữ (viền focus,
highlight). Với mọi bề mặt có chữ, widget làm tối màu theo bước 1% tới khi chữ trắng đạt 4.5:1, rồi chọn
chữ trắng hay `#111827` tuỳ bên nào tương phản cao hơn. Màu quá sáng (vàng, xám nhạt) KHÔNG bị làm tối
tới mức mất nhận diện: giữ nguyên màu và dùng chữ tối. Nhờ vậy không có màu hợp lệ nào cho ra chữ khó đọc.

### `pre_chat_form`

| Field | Kiểu | Mô tả |
|---|---|---|
| `enabled` | bool | Hỏi thông tin trước tin nhắn đầu tiên. |
| `require_name` | bool | Hiện + bắt buộc ô họ tên. |
| `require_phone` | bool | Hiện + bắt buộc ô số điện thoại. |
| `require_message` | bool | Hiện + bắt buộc ô tin nhắn đầu. |
| `phone_region` | `VN` \| `INTL` | Cách validate SĐT. `VN` (mặc định) nhận số di động VN **hoặc** E.164 (`+14155552671`); `INTL` chỉ nhận E.164. Tuỳ chọn — thiếu field ⇒ `VN`. |

### Locale

Ngôn ngữ UI suy diễn theo thứ tự, gặp cái nào hợp lệ thì dừng:

1. `widget_theme.locale` từ admin,
2. thuộc tính `lang` trên `<html>` của trang khách,
3. `navigator.language`,
4. `vi`.

Loader là nơi chốt (chỉ loader đọc được `lang` của trang khách) rồi gửi xuống iframe kèm session; iframe
set `document.documentElement.lang` tương ứng. Giờ trong danh sách tin format bằng
`Intl.DateTimeFormat` theo đúng locale đó.

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

**C# / .NET**

```csharp
using System.Security.Cryptography;
using System.Text;

var key = Encoding.ASCII.GetBytes("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
using var hmac = new HMACSHA256(key);
var hash = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes("user-42"))).ToLowerInvariant();
// => a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659
```

**Java**

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

Mac mac = Mac.getInstance("HmacSHA256");
mac.init(new SecretKeySpec(
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII),
    "HmacSHA256"));
String hash = HexFormat.of().formatHex(mac.doFinal("user-42".getBytes(StandardCharsets.UTF_8)));
// => a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659
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
    "widget_theme": { "primary_color": "#1677ff", "position": "right", "greeting_text": "…", "offline_text": "…", "locale": "vi" },
    "pre_chat_form": { "enabled": true, "require_name": true, "require_phone": true, "require_message": true, "phone_region": "VN" }
  }
}
```

Mọi kiểu lỗi của `/session` (không tìm thấy `site_key`, site bị tắt, `Origin` không được phép, bắt buộc
identity mà thiếu, site chưa bật identity, sai định dạng hash, sai chữ ký) đều trả về CÙNG MỘT thông
điệp lỗi 403 chung chung — đây là chủ đích, để endpoint không thể bị dùng để dò xem `site_key` nào tồn
tại hay site nào đã bật identity.

## Cấu trúc mã nguồn

Hai bundle độc lập dùng chung `src/shared/`:

```
src/
├─ loader.ts            entry → widget.js (IIFE chạy trên trang khách; nơi duy nhất làm handshake)
├─ loader/
│  ├─ bootstrap.ts      đọc data-*, validate data-host, identity attrs
│  ├─ state.ts          một object LoaderState duy nhất (chốt locale/theme)
│  ├─ session.ts        handshake (/session), resume token (sessionStorage / localStorage + TTL), setUser
│  ├─ frame-dom.ts      Shadow DOM host, nút launcher, khung iframe
│  ├─ frame.ts          mở/đóng, compact preview, quản lý focus, mount iframe
│  ├─ frame-anim.ts     animation mở/đóng + prefers-reduced-motion
│  ├─ viewport.ts       bám visualViewport khi bàn phím mobile bật
│  ├─ theme.ts          nhãn/màu launcher, badge chưa đọc
│  ├─ css.ts            CSS trong shadow, vòng badge, offset launcher
│  ├─ bridge.ts         postMessage ↔ iframe (khoá origin), phát CustomEvent
│  ├─ api.ts            window.cluvixChat (open/close/toggle/setUser/on/off) + hàng đợi trước ready
│  ├─ campaigns-bridge.ts  tải/cache campaign + theo dõi URL SPA
│  ├─ storage.ts, constants.ts, types.ts
├─ app/
│  ├─ main.ts           entry → widget.html (app trong iframe): phiên, lịch sử, gửi optimistic, SSE
│  ├─ ui.ts             facade WidgetUI (CSS var theme, các màn hình)
│  ├─ ui/
│  │  ├─ chat-list.ts   nhóm tin, trạng thái gửi, typing, vùng sr-live, gửi lại
│  │  ├─ prechat.ts     form pre-chat (tên / SĐT / tin nhắn) + validate
│  │  ├─ composer.ts    ô nhập + nút gửi
│  │  ├─ preview.ts     compact preview của campaign
│  │  ├─ brand.ts       markup logo / avatar / header / footer (hàm thuần)
│  │  ├─ markup.ts      escapeText / escapeAttr / safeHttpsUrl, icon, field builder, inject CSS
│  │  └─ types.ts
│  ├─ api.ts, sse.ts, store.ts, campaigns.ts, styles.ts
└─ shared/
   ├─ strings.ts        từ điển vi / en + suy diễn locale (cả 2 bundle dùng)
   ├─ color.ts          helper contrast WCAG (màu chữ trên primary, primary tự tối)
   ├─ protocol.ts       giao thức postMessage loader ↔ iframe
   └─ types.ts          shape theme / pre-chat / session (khớp backend)
```

Nguyên tắc: thứ chạy trên trang khách nằm ở `loader/`; thứ chạy trong iframe nằm ở `app/`; không chuỗi
hiển thị nào nằm ngoài `shared/strings.ts`; mọi chuỗi ra DOM đều qua `textContent` hoặc `escapeText`/`escapeAttr`.

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
- **UI chỉ có tiếng Việt và tiếng Anh** (`vi`/`en`, đều LTR) — xem
  [Theme & đa ngôn ngữ](#theme--đa-ngôn-ngữ). Chưa hỗ trợ RTL.
- Hash identity không có hạn dùng (không `exp`/chống replay) — xem
  [Ghi chú bảo mật](#ghi-chú-bảo-mật).
- **Campaign chỉ theo website và `only_business_hours` chưa được áp dụng** — cờ này có lưu nhưng widget
  chưa có nguồn giờ làm việc thật nên luôn coi là "trong giờ". Không phân nhóm khách, không có khung lịch
  phát, không có thống kê campaign, và không polyfill `URLPattern` (trình duyệt cũ rơi về glob `*` đơn
  giản). Xem [Chiến dịch](./docs/vi/CAMPAIGNS.md#giới-hạn-hiện-tại).
- **Danh sách campaign được cache 1 giờ**, nên campaign vừa bật có thể mất tới chừng đó mới tới được khách.
  Tắt một campaign thì có hiệu lực nhanh — có lượt kiểm lại bỏ cache ngay trước khi hiện preview.
- **Trường `email` trong `identity` được nhận nhưng chưa lưu** ở v2.
- **Trạng thái mở/đóng của khung chỉ được khôi phục trên desktop** (dưới 480 px không bao giờ tự mở).

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
- `postMessage` giữa loader và iframe bị khoá theo origin: iframe chỉ tin origin của message hợp lệ đầu
  tiên nhận được, không bao giờ post tới `'*'`.
- `visitor_token` lưu ở `sessionStorage` (theo tab) khi `pre_chat_form.enabled` bật; ngược lại vẫn lưu
  `localStorage` nhưng hết hạn sau 30 ngày.
- Kênh realtime gửi heartbeat comment `:ping` và event `expired` trước khi đóng lúc JWT hết hạn, để widget
  xin cấp lại JWT ngay thay vì phải đoán qua lỗi kết nối.

## License

[MIT](./LICENSE)
