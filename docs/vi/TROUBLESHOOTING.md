# Khắc phục sự cố

Triệu chứng → nguyên nhân → cách kiểm → cách sửa. Mỗi mục đều kèm một lệnh `curl` cụ thể hoặc một bước
DevTools, để phân biệt được các nguyên nhân thay vì đoán.

Thay `YOUR_HOST` bằng giá trị của `data-host`, `YOUR_SITE_KEY` bằng site key, và `ALLOWED_ORIGIN` bằng một
origin trong danh sách cho phép của site.

**Chẩn đoán 30 giây.** Mở trang khách hàng rồi vào DevTools:

1. **Console** — widget ghi các lỗi cấu hình chí mạng với tiền tố `[cluvix-livechat]`.
2. **Elements** — tìm `<script ... widget.js>` và host Shadow DOM được gắn vào `<body>`.
3. **Network** — lọc theo `livechat`. Bạn nên thấy `POST /api/client/livechat/session` (chỉ sau khi mở
   khung), `GET /api/client/livechat/campaigns`, và một dòng `eventsource`/`sse` ở trạng thái *pending* —
   dòng SSE pending là bình thường, đó chính là stream đang mở.
4. **Application → Storage** — các khoá `cluvix_lc_*` cho biết nhánh lưu trữ nào đang có hiệu lực.

---

- [Widget không hiện](#widget-không-hiện)
- [Không kết nối được / 403](#không-kết-nối-được--403)
- [Khung hiện "trang không tồn tại"](#khung-hiện-trang-không-tồn-tại)
- [Nút "Gửi tin nhắn" mãi bị vô hiệu](#nút-gửi-tin-nhắn-mãi-bị-vô-hiệu)
- [Không nhận tin realtime](#không-nhận-tin-realtime)
- [Tin nhắn bị 429](#tin-nhắn-bị-429)
- [Nhân viên không thấy hội thoại](#nhân-viên-không-thấy-hội-thoại)
- [Logo không hiện](#logo-không-hiện)
- [Màu chữ trên nền thương hiệu trông sai](#màu-chữ-trên-nền-thương-hiệu-trông-sai)
- [Sai ngôn ngữ](#sai-ngôn-ngữ)
- [Mất lịch sử sau khi tải lại](#mất-lịch-sử-sau-khi-tải-lại)
- [Bàn phím iOS che ô soạn tin](#bàn-phím-ios-che-ô-soạn-tin)
- [Chế độ tối](#chế-độ-tối)
- [Mixed content khi chạy http](#mixed-content-khi-chạy-http)
- [Campaign không bao giờ hiện](#campaign-không-bao-giờ-hiện)

---

## Widget không hiện

Không có nút mở chat, console cũng không kêu gì về mạng — script đơn giản là không sinh ra gì.

### Nguyên nhân 1 — thiếu hoặc rỗng `data-site-key`

**Cách kiểm.** Console hiện:

```
[cluvix-livechat] missing data-site-key on the <script> tag — widget NOT loaded.
```

**Cách sửa.** Thêm thuộc tính đó. Lấy đúng snippet từ hộp thoại kết nối **trong app Cluvix** thay vì gõ
tay lại site key.

### Nguyên nhân 2 — `data-host` không phải origin thuần

`data-host` phải là `scheme://host[:port]`, không path, query, fragment hay thông tin đăng nhập. `https:`
luôn được nhận; `http:` chỉ cho `localhost` / `127.0.0.1`. Khác đi thì widget từ chối mount, có chủ đích —
host sai sinh ra một widget trông như còn sống nhưng không bao giờ kết nối được.

**Cách kiểm.** Console hiện:

```
[cluvix-livechat] invalid data-host: "https://example.com/chat" — expected a bare origin like
https://host[:port] (http is only allowed for localhost/127.0.0.1). Widget NOT loaded.
```

**Cách sửa.** Bỏ phần path/dấu gạch cuối: `https://example.com`, không phải `https://example.com/` kèm
path.

### Nguyên nhân 3 — CSP của trang chủ nhà chặn script

**Cách kiểm.** Console báo vi phạm CSP nêu `script-src` và host widget. Trong DevTools → Network, request
tới `widget.js` không hề xuất hiện (bị chặn trước khi gửi).

**Cách sửa.** Trên site **của khách hàng**, cho phép host widget trong CSP. Widget cần:

- `script-src` — origin phục vụ `widget.js`;
- `frame-src` (hoặc `child-src`) — origin `data-host`, cho iframe;
- `img-src` — origin của `logo_url` / avatar campaign, nếu bạn dùng chúng.

CSS của widget nằm trong Shadow DOM và trong iframe, nên `style-src` của trang chủ nhà thường không liên
quan — nhưng `style-src` không có `'unsafe-inline'` trên *trang chủ nhà* sẽ chặn thẻ `<style>` của Shadow
DOM; hãy bổ sung nonce/hash tương ứng.

### Nguyên nhân 4 — `widget.js` cũ còn trong cache

`widget.js` được phục vụ với `Cache-Control: public, max-age=3600`, nên trình duyệt hoặc CDN có thể trả về
một bản cũ tới một giờ.

**Cách kiểm.**

```bash
curl -sI https://YOUR_HOST/widget.js | grep -iE 'cache-control|age|etag'
curl -s  https://YOUR_HOST/widget.version.json
curl -s  https://YOUR_HOST/widget.js | shasum -a 256   # so với sha256_js ở trên
```

**Cách sửa.** Hard-reload với cache tắt (DevTools → Network → *Disable cache*), và purge CDN nếu có. Nếu
checksum lệch với `widget.version.json` thì bản deploy chưa trọn — chạy lại
`scripts/sync_widget.sh <tag>` (xem [Vận hành §B4](./OPERATIONS.md#b4-deploy--đồng-bộ-widget)).

### Nguyên nhân 5 — thẻ script nằm ở chỗ không bao giờ chạy

Thẻ `async` nằm trong một khối bị router client-side thay thế, hoặc được chèn sau `DOMContentLoaded` theo
cách làm mất `document.currentScript`. Loader có fallback về
`script[data-site-key][src*="widget.js"]`, nên thẻ vẫn phải **nằm trong tài liệu** và `src` của nó vẫn phải
chứa `widget.js`.

**Cách kiểm.** Trong Console: `document.querySelector('script[data-site-key]')` — trả `null` nghĩa là thẻ
không có ở đó.

---

## Không kết nối được / 403

Nút mở chat hiện, khung mở ra, và nó hiển thị text ngoại tuyến ("Hiện kênh trò chuyện không khả dụng.") hoặc
câu chung "Không kết nối được, vui lòng thử lại sau."

Khác biệt này quan trọng: câu đầu là `session_error {disabled: true}` — backend trả **403** hoặc không gửi
envelope hợp lệ. Câu sau là lỗi mạng/truyền tải.

**Mọi** lý do 403 đều trả cùng một thông điệp, có chủ đích (để endpoint không bị dùng để dò xem site key
nào có thật hay site nào đã bật identity). Muốn phân biệt thì phải đọc nhật ký bảo mật của backend.

**Cách kiểm — tái hiện handshake:**

```bash
curl -si -X POST https://YOUR_HOST/api/client/livechat/session \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://ALLOWED_ORIGIN' \
  -d '{"site_key":"YOUR_SITE_KEY"}'
```

**Cách kiểm — đọc lý do** (ops, trên máy chủ backend). Tìm các sự kiện có cấu trúc
`livechat_site_rejected` và `livechat_identity_rejected`:

```bash
# Sự kiện bảo mật được backend ghi qua seclog sink vào bảng MySQL `security_audit_log`
# (file log text chỉ giữ mức Error, nên các sự kiện Info này KHÔNG nằm trong file log).
mysql -e "SELECT created_at, event, ip, detail FROM security_audit_log
          WHERE event IN ('livechat_site_rejected','livechat_identity_rejected')
          ORDER BY id DESC LIMIT 50;" <db_name>
```

| `reason` trong log | Thực tế đã xảy ra chuyện gì | Cách sửa |
|---|---|---|
| `site_not_found` | `site_key` không tồn tại (gõ nhầm, sai môi trường, sai tenant). | Sao chép lại snippet từ hộp thoại kết nối **trong app Cluvix**. |
| `site_not_connected` | Site có tồn tại nhưng trạng thái không phải `connected` — đã tắt hoặc bị thu hồi. | Bật lại trong app Cluvix. Lưu ý điều này cũng đóng ngay đường ghi của mọi JWT đã phát, chứ không chỉ chặn handshake mới. |
| `origin_not_allowed` | Header `Origin` không nằm trong `allowed_origins`. Thiếu `Origin` và danh sách rỗng cũng rơi vào đây. | Thêm đúng origin đó — xem [Vận hành §A2](./OPERATIONS.md#a2-luật-allowed_origins). `example.com` và `www.example.com` là khác nhau. |
| `identity_required` | Site bật `identity_mandatory` nhưng handshake không có `identity`. | Hoặc làm cho trang đối tác phát `data-user-id`/`data-user-hash` (hoặc gọi `setUser`), hoặc tắt `mandatory`. |
| `identity_disabled` | Trang gửi `identity` nhưng site đang tắt identity. Cố ý từ chối chứ không âm thầm hạ về ẩn danh. | Bật identity trên site, hoặc gỡ các thuộc tính identity khỏi trang. |
| `secret_undecryptable` | `EMR_CONFIG_ENCRYPTION_KEY` thiếu hoặc đã bị đổi kể từ khi secret được lưu. Đây là lỗi **cấu hình phía server**, không phải lỗi của khách. | Khôi phục khoá gốc. Nếu mất thật thì xoay identity secret và phát lại cho đối tác. |
| `hash_format` | `identifier_hash` không đúng 64 ký tự hex. | Mã hoá hex đầu ra HMAC; đừng base64, đừng cắt ngắn. |
| `hash_mismatch` | Chữ ký không khớp. | Gần như luôn là một trong: sai secret; tính HMAC trên sai chuỗi; hoặc lấy khoá là 32 byte giải từ hex thay vì **chuỗi ASCII** của secret. Đối chiếu với [test vector trong README](../../README.vi.md#ví-dụ-tính-hash-phía-server). |
| `identifier_length` | `identifier` rỗng hoặc > 128 ký tự. | Dùng một identifier ngắn và ổn định (user id, email). |
| `campaigns_site_unavailable` / `campaigns_origin_not_allowed` | Vẫn hai lớp kiểm đó, nhưng do `GET /campaigns` chạm phải. | Cách sửa như trên. |

**Kiểm cả phía client.** `data-user-*` sai định dạng thì không bao giờ tới server — loader tự từ chối tại
chỗ và rơi về ẩn danh:

```
[cluvix-livechat] invalid data-user-id/data-user-hash (identifier 1..128 chars, hash 64 hex) —
identity ignored, falling back to an anonymous chat.
```

và từ `setUser()`:

```
[cluvix-livechat] setUser: expected {identifier (1..128 chars), identifier_hash (64 hex)} — call ignored.
[cluvix-livechat] setUser ignored: called too often (at most once per 2s).
```

**429 thay vì 403.** `{"code":429,…}` ở handshake nghĩa là bucket `(site_key, IP)` đã đầy — mặc định
120/phút. Sau proxy mà không có `TRUSTED_PROXIES` thì tầng theo IP bị tắt hẳn, nên nếu bạn *có* thấy 429
thì IP đang được đọc đúng và lưu lượng là thật. Xem
[Vận hành → biến môi trường](./OPERATIONS.md#biến-môi-trường-backend).

---

## Khung hiện "trang không tồn tại"

Nút mở chat chạy, khung mở ra, và bên trong hiện lỗi router của **app Angular** thay vì giao diện chat.

**Nguyên nhân.** Trình duyệt của khách đã cài service worker của Cluvix (họ từng đăng nhập app trên domain
đó). `widget.html` trong iframe là request `navigate`, nên SW trả về `index.html` của SPA.

**Cách kiểm.**

```bash
# bản thân server phải trả trang widget, không phải vỏ SPA
curl -s https://YOUR_HOST/widget.html | head -20     # kỳ vọng <title>Cluvix Livechat</title>
```

Trên trình duyệt của khách: DevTools → Application → Service Workers. Nếu có worker được liệt kê và
request `widget.html` trong tab Network hiện *(from ServiceWorker)*, đó chính là nguyên nhân.

**Cách sửa.**

- Bản vá là `NON_SPA_EXACT = ['/widget.html']` trong `frontend/src/custom-ngsw-worker.js` — kiểm tra mục
  này còn nguyên và worker đang deploy có chứa nó.
- Với trình duyệt đã dính: DevTools → Application → Service Workers → *Unregister* (hoặc *Update*), rồi
  tải lại. Worker mới deploy sẽ tự tiếp quản khi đã kích hoạt.

---

## Nút "Gửi tin nhắn" mãi bị vô hiệu

Form pre-chat đã điền nhưng nút chính không bao giờ bật.

**Nguyên nhân 1 — có một ô bắt buộc mà bạn không để ý.** Nút chỉ bật khi **mọi ô đang hiện** đều hợp lệ.
`require_name`, `require_phone` và `require_message` mỗi cái thêm một ô, và cả ba đều mặc định **true**.

**Nguyên nhân 2 — định dạng SĐT so với `phone_region`.** Với `phone_region: 'VN'` (mặc định), widget chấp
nhận số di động Việt Nam — `+84` hoặc `0`, rồi `3/5/7/8/9`, rồi 8 chữ số — **hoặc** E.164 (`+`, chữ số đầu
1–9, tổng 7–15 chữ số). Với `phone_region: 'INTL'` thì **chỉ** chấp nhận E.164, nên số nội địa
`0912345678` bị từ chối. Khoảng trắng, dấu chấm, gạch ngang và ngoặc đơn đều bị bỏ trước khi khớp, nên
cách trình bày không phải vấn đề.

**Cách kiểm.** Trong DevTools → Console, ở ngữ cảnh iframe (chọn `widget.html` trong bộ chọn frame ở đầu
panel Console), xem ô nào đang mang `aria-invalid="true"`:

```js
document.querySelectorAll('[aria-invalid="true"]')
```

**Cách sửa.**

- Phục vụ chủ yếu khách Việt Nam → giữ `phone_region: VN`; nó đã chấp nhận số quốc tế dạng E.164, nên đổi
  sang `INTL` chỉ làm chặt hơn.
- Không muốn hỏi SĐT → tắt `require_phone` trong app Cluvix.
- Lưu ý backend validate độc lập và trả `422` khi lệch, nên nới lỏng phía widget mà không nới cấu hình
  site thì vô ích.

---

## Không nhận tin realtime

Gửi tin thì được và tin tới hộp thư, nhưng câu trả lời của nhân viên chỉ hiện sau khi tải lại trang.

**Nguyên nhân 1 — proxy buffer hoặc timeout stream SSE.**

**Cách kiểm.**

```bash
# stream khoẻ: text/event-stream, không buffering, "event: connected" tới ngay,
# rồi ":ping" khoảng mỗi 25 giây. Ctrl-C để dừng.
curl -N -si "https://YOUR_HOST/api/client/livechat/sse?token=VISITOR_JWT" | head -20
```

Lấy `VISITOR_JWT` từ `visitor_jwt` trong response handshake, hoặc từ `?token=` của request SSE trong tab
Network. Kỳ vọng `Content-Type: text/event-stream` và `X-Accel-Buffering: no`. Nếu header tới mà sau đó im
lặng rất lâu thì có chỗ nào đó đang bật buffering.

**Cách sửa.** Trong nginx, location SSE cần `proxy_buffering off`, `proxy_cache off`,
`chunked_transfer_encoding off`, `add_header X-Accel-Buffering no`, và `proxy_read_timeout`/
`proxy_send_timeout` cao hơn hẳn nhịp tim 25 s (Cluvix dùng 3600 s). Nó phải là location **exact-match** để
khối `^~ /api/client/` chung có `limit_req` không nuốt mất. Đoạn cấu hình đầy đủ ở
[Vận hành §B2](./OPERATIONS.md#b2-nginx).

**Nguyên nhân 2 — cap kết nối SSE.** Mặc định **3 kết nối đồng thời mỗi IP** và **2000 tổng**; vượt cap
thì server trả `429` ("Quá nhiều kết nối, vui lòng thử lại sau."). Lưu ý nếu `TRUSTED_PROXIES` chưa set
thì *mọi* khách đều trông như `127.0.0.1` — mã phát hiện điều đó và **tắt** tầng theo IP thay vì để ba kết
nối phục vụ cả thế giới, nhưng cũng có nghĩa bạn hoàn toàn không còn bảo vệ theo IP. Hãy set
`TRUSTED_PROXIES` và tìm cảnh báo một lần này lúc khởi động:

```
TRUSTED_PROXIES chưa cấu hình, rate limit/cap theo IP bị tắt
```

**Nguyên nhân 3 — khách thật sự đang mở nhiều tab.** Ba tab của cùng một site là chạm trần. Đóng bớt tab,
hoặc nâng `VISITOR_SSE_MAX_CONN_PER_IP`.

**Nguyên nhân 4 — không có gì sai cả.** Stream không có sự kiện nào trong **15 phút** sẽ bị bộ quét idle
của server đóng, và widget kết nối lại với backoff (2 s → 30 s). Nếu lần mất kết nối kéo dài quá 3 s,
widget nạp lại lịch sử khi kết nối lại, nên không mất tin — có thể bạn chỉ đang chứng kiến quá trình hồi
phục đó.

**Cách xác nhận là lỗi widget chứ không phải backend.** Trong tab Network, chọn request SSE →
*EventStream*. Nếu sự kiện xuất hiện ở đó mà khung không cập nhật thì là lỗi widget — xin hãy
[báo lại](../../SUPPORT.md).

---

## Tin nhắn bị 429

Bong bóng hiện "Gửi lỗi · chạm để thử lại".

**Nguyên nhân.** Một rate limit. Hai tầng độc lập áp cho `POST /message`: **10 mỗi phút mỗi hội thoại**
(`LIVECHAT_RATE_VISITOR`) và **30 mỗi phút mỗi `(site_key, IP)`** (`LIVECHAT_RATE_IP`), trong cửa sổ trượt
60 giây.

**Cách kiểm.** Network → request `/message` → Response. Envelope là HTTP 200 với `"code": 429`:

```bash
curl -s -X POST https://YOUR_HOST/api/client/livechat/message \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer VISITOR_JWT' \
  -d '{"client_echo_id":"probe-1","text":"hi"}'
```

**Cách sửa.**

- Chạm vào bong bóng lỗi sẽ gửi lại với **cùng** `client_echo_id`, nên một lần thử lại thành công sau khi
  ghi dở dang không thể sinh ra tin trùng.
- Cả một văn phòng sau một NAT có thể dùng chung bucket theo IP một cách chính đáng. Hãy nâng
  `LIVECHAT_RATE_IP` — nhưng trước hết phải chắc `TRUSTED_PROXIES` đã set, nếu không thì tầng IP không
  thật sự là per-IP.
- Không phải 429? Hãy kiểm các lý do từ chối khác, chúng trả `422`: nội dung dài hơn **4000 ký tự**, nội
  dung rỗng, hoặc `client_echo_id` không nằm trong 1–64 ký tự `[A-Za-z0-9_-]`.

---

## Nhân viên không thấy hội thoại

Tin của khách đã được lưu (tải lại thì vẫn thấy trong lịch sử của chính khách) nhưng nhân viên không thấy
nó trong hộp thư.

**Nguyên nhân 1 — hiển thị theo phân công.** Hộp thư Omnichat có option `VIEW_MODE` (`user_option` id 24)
mặc định là **"theo phân công"**: nhân viên chỉ thấy hội thoại được giao cho mình (cộng các hội thoại chưa
phân công), trừ khi họ có quyền "xem tất cả". Hội thoại livechat mới tinh thì chưa được phân công.

**Cách kiểm / sửa — trong app Cluvix:** chuyển `VIEW_MODE` sang chế độ mở, cấp quyền "xem tất cả" cho vai
trò đó, hoặc phân công hội thoại. Lưu ý thiết lập này được cache khoảng 30 s nên đổi không có hiệu lực tức
thì.

**Nguyên nhân 2 — phạm vi công ty.** Hội thoại thuộc công ty sở hữu site livechat. Nhân viên đang ở công ty
hoạt động khác sẽ không thấy nó.

**Cách kiểm / sửa.** Xác nhận công ty đang hoạt động của nhân viên trùng với công ty mà site được tạo dưới.

**Nguyên nhân 3 — đó là ghi chú nội bộ.** Ghi chú nội bộ (`src = 2`) cố ý không hiện cho khách; chiều ngược
lại thì không có chuyện đó — mọi tin của khách đều tới hộp thư.

---

## Logo không hiện

Header rơi về chữ cái đầu của thương hiệu.

**Nguyên nhân 1 — không phải `https`.** `logo_url` chỉ được backend chấp nhận khi scheme là `https:`, và
widget kiểm lại protocol trước khi gán vào `src`. URL `http:` bị bỏ qua im lặng ở cả hai phía.

**Nguyên nhân 2 — ảnh tải lỗi** (404, chặn hotlink, trình chặn quảng cáo, CDN đòi `Referer`). Widget thay
ảnh hỏng bằng chữ cái đầu ở cùng kích thước, có chủ đích — biểu tượng ảnh vỡ trong header chat còn xấu hơn
một chữ cái.

**Nguyên nhân 3 — quá 1 MB lúc upload**, nên bản upload chưa từng thành công.

**Cách kiểm.**

```bash
curl -sI 'https://CDN/path/logo.png' | grep -iE 'HTTP/|content-type|content-length'
```

Trong trình duyệt, Network → lọc *Img* — một dòng `404`/`403` cho URL logo là bằng chứng.

**Cách sửa.** Upload lại qua app Cluvix (≤ 1 MB; kiểu file được kiểm từ magic bytes nên file đổi tên sẽ bị
từ chối), hoặc dán một URL `https` truy cập công khai được mà không cần kiểm `Referer`. Đồng thời cho phép
origin của ảnh trong CSP `img-src` của trang chủ nhà.

---

## Màu chữ trên nền thương hiệu trông sai

"Tối quá", "không phải màu thương hiệu của tôi", "header có sắc độ khác với màu tôi cấu hình".

**Nguyên nhân — đó chính là luật tương phản, và nó cố ý như vậy.** `primary_color` được dùng đúng nguyên
vẹn cho các chi tiết không có chữ (viền focus, highlight). Với mọi bề mặt **có chữ trên đó**, widget làm
tối màu theo bước 1% cho tới khi chữ trắng đạt WCAG 2.1 AA (4.5:1), rồi chọn trắng hoặc `#111827` — bên nào
tương phản tốt hơn. Việc làm tối bị chặn ở 50 bước (≈ 60% độ sáng gốc), nên màu thương hiệu rất sáng (vàng,
xám nhạt) giữ nguyên màu và nhận chữ **tối** thay vì bị làm tối tới mức không nhận ra.

**Cách kiểm.** Trong Console của iframe:

```js
getComputedStyle(document.documentElement).getPropertyValue('--lc-primary')        // đúng thứ bạn cấu hình
getComputedStyle(document.documentElement).getPropertyValue('--lc-primary-strong') // màu nền đã làm tối
getComputedStyle(document.documentElement).getPropertyValue('--lc-on-primary')     // màu chữ đã chọn
```

**Cách sửa.** Nếu `--lc-primary-strong` cách xa `--lc-primary`, nghĩa là màu thương hiệu của bạn không đạt
AA với chữ trắng. Chọn một màu thương hiệu tối hơn trong app Cluvix thì hai giá trị sẽ hội tụ. Không có
công tắc tắt luật này: một màu thương hiệu hợp lệ không bao giờ được phép tạo ra chữ không đọc nổi.

**Không phải cái này?** Nếu màu bị từ chối ngay lúc lưu thì `primary_color` phải là `#RGB` hoặc `#RRGGBB` —
chuỗi tự do bị từ chối vì giá trị này được nhúng vào CSS.

---

## Sai ngôn ngữ

Hiện tiếng Việt trong khi bạn mong tiếng Anh, hoặc ngược lại.

**Nguyên nhân — thứ tự suy diễn.** Khớp đầu tiên thắng: `widget_theme.locale` (đặt trong app Cluvix) →
`<html lang>` của **trang chủ nhà** → `navigator.language` → `vi`. Khớp theo subtag gốc nên `en-GB` ra
`en`; thứ gì không phải `vi` hay `en` sẽ rơi xuống nguồn kế tiếp.

**Cách kiểm.** Trên trang chủ nhà: `document.documentElement.lang`. Trong iframe: cũng
`document.documentElement.lang` — app đặt nó thành locale thật sự đang áp.

**Cách sửa.**

- Muốn ghim ngôn ngữ bất kể khách là ai thì đặt `widget_theme.locale` trong app Cluvix — nó thắng mọi thứ
  còn lại.
- Muốn đi theo trang thì để trống `locale` và bảo đảm trang có `<html lang="en">` đúng.
- Chỉ có `vi` và `en`. Một trang `fr` mà không đặt `widget_theme.locale` sẽ hiện tiếng Việt.
- Sau khi đổi `locale` trong admin, tab đang mở vẫn giữ theme đã cache tới lần handshake kế; hãy tải lại
  trang.

---

## Mất lịch sử sau khi tải lại

Khách tải lại trang và hội thoại bắt đầu trống trơn.

**Nguyên nhân 1 — site có pre-chat, và tab đã bị đóng.** Khi `pre_chat_form.enabled` bật, resume token nằm
ở **`sessionStorage`**, tức chết cùng tab. Đây là chủ đích: trên máy dùng chung hay máy ở quầy lễ tân,
người sau không được phép mở lại hội thoại (có thể mang thông tin y tế) của người trước. Tải lại trong
*cùng* tab thì vẫn giữ; tab mới thì không.

**Nguyên nhân 2 — hai luật 30 ngày.** Trên site không có pre-chat, token nằm ở `localStorage` với TTL
**30 ngày** phía client, và backend độc lập từ chối resume một hội thoại ẩn danh có hoạt động gần nhất cũ
hơn **30 ngày** — nó mở hội thoại mới.

**Nguyên nhân 3 — phiên identity không lưu token nào cả.** Với identity đã xác thực, widget cố ý không lưu
`visitor_token`; hội thoại được resume bằng **identifier** ở lần handshake kế. Nếu trang ngừng phát
`data-user-id`/`data-user-hash` (hoặc ngừng gọi `setUser`), khách trở lại ẩn danh và nhận một hội thoại
**mới**. Identity chỉ nằm trong bộ nhớ và không bao giờ tự sống qua một lần tải lại.

**Nguyên nhân 4 — storage không dùng được.** Chế độ ẩn danh, "chặn mọi cookie", hoặc profile siết chặt.
Widget bắt mọi lỗi storage và vẫn chạy cho phiên hiện tại, nên triệu chứng đúng y như vậy: mọi thứ chạy tốt
tới lúc tải lại.

**Cách kiểm.** DevTools → Application → Local Storage / Session Storage trên origin của **trang chủ nhà**:

- `cluvix_lc_token_<siteKey>` — có trong `localStorage` dạng `{"token":"…","ts":…}` với site không pre-chat,
  trong `sessionStorage` dạng chuỗi trần với site có pre-chat;
- `cluvix_lc_open_<siteKey>`, `cluvix_lc_cfg_<siteKey>` — trạng thái khung và config đã cache.

Và trên origin của **iframe**: `cluvix_lc_prechat_<siteKey>` (đã hoàn tất pre-chat) và
`cluvix_lc_snooze_<siteKey>`.

**Cách sửa.** Không có gì phải sửa nếu là nguyên nhân 1, 2 hoặc 3 — đó là hành vi thiết kế. Với site cần
khách resume được xuyên tab một cách chắc chắn, hoặc tắt form pre-chat, hoặc dùng identity verification —
cái này còn resume được xuyên thiết bị.

**Không phải cái này?** "Bạn đang trò chuyện với tư cách `<tên>`" kèm lịch sử trống ngay sau khi đăng nhập
là giới hạn v2 đã ghi rõ: hội thoại ẩn danh **không** được gộp vào hội thoại đã xác thực; `setUser` mở một
hội thoại mới. Xem [Giới hạn v2](../../README.vi.md#giới-hạn-v2).

---

## Bàn phím iOS che ô soạn tin

**Nguyên nhân.** Safari iOS không thu nhỏ layout viewport khi bàn phím ảo bật, nên khung toàn màn hình giữ
nguyên chiều cao và ô soạn tin rơi ra sau bàn phím.

**Widget làm gì.** Dưới 480 px, khi khung đang mở, loader ghim khung theo `window.visualViewport` (chiều
cao và `offsetTop`) và nhả ra khi đóng. Ô nhập là 16 px trên điện thoại để iOS không zoom khi focus, và
header/composer/footer tôn trọng `env(safe-area-inset-*)` trên máy có tai thỏ.

**Cách kiểm.** Trong Console của iframe trên thiết bị (Safari remote inspector):

```js
window.visualViewport.height   // co lại khi bàn phím bật
```

và trên trang chủ nhà, xem phần tử bọc khung bên trong Shadow DOM — khi bàn phím đang mở nó phải mang
`height`/`top` inline.

**Cách sửa nếu vẫn sai.** Việc ghim chỉ áp ở ≤ 480 px và chỉ cho khung **đầy đủ** (không cho compact
preview của campaign). Trang chủ nhà tự đặt `position: fixed` / transform lên `<body>` có thể phá vị trí
fixed của mọi widget nổi — hãy thử gỡ các style đó. Nếu tái hiện được trên một trang trơn thì đó là lỗi
đáng [báo lại](../../SUPPORT.md).

---

## Chế độ tối

**Hành vi kỳ vọng.** Mọi màu trung tính là CSS custom property có bảng màu tối, áp theo
`prefers-color-scheme`. `color_scheme: 'auto'` (mặc định) theo hệ điều hành của khách; `'light'`/`'dark'`
ép cứng.

**Triệu chứng: widget tối trong khi site sáng (hoặc ngược lại).** Widget theo **hệ điều hành của khách**,
không theo theme của trang chủ nhà. Một site có công tắc dark-mode riêng mà không đổi thiết lập hệ điều
hành sẽ lệch nhau.

**Cách sửa.** Ghim `color_scheme` về `light` hoặc `dark` trong app Cluvix cho khớp với site.

**Kiểm xem chế độ nào đang chạy.** Trong Console của iframe:

```js
document.documentElement.dataset.lcScheme   // "light" / "dark" khi ghim; undefined khi "auto"
matchMedia('(prefers-color-scheme: dark)').matches
```

**Triệu chứng: badge chưa đọc có quầng trắng trên trang nền tối.** Vòng viền badge theo cùng quyết định
`color_scheme` — nếu trông sai thì nhiều khả năng site đang ghim `light` trong khi trang thì tối.

---

## Mixed content khi chạy http

**Triệu chứng.** Site chạy `http://` và trình duyệt chặn widget, hoặc site chạy `https` và console báo
mixed content.

**Nguyên nhân.** Trang `https` không tải được tài nguyên con qua `http`, và `allowed_origins` của site
cũng không thể chứa origin `http` — `http://` chỉ được chấp nhận cho `localhost` / `127.0.0.1`.

**Cách kiểm.**

```bash
curl -sI http://CUSTOMER_SITE/ | grep -i location   # có redirect sang https không?
```

Console hiện `Mixed Content: The page at 'https://…' was loaded over HTTPS, but requested an insecure …`.

**Cách sửa.** Phục vụ site khách hàng qua `https`, và dùng `https` ở cả `src` lẫn `data-host`. Không có
cấu hình `http` nào được hỗ trợ ở production.

---

## Campaign không bao giờ hiện

Xem [CAMPAIGNS.md → Vì sao campaign không nổ](./CAMPAIGNS.md#vì-sao-campaign-không-nổ) cho danh sách đầy đủ
các điều kiện chặn (khung đang đóng, phiên chưa có tin nào, không snooze, URL khớp, hẹn giờ, lượt kiểm lại
bỏ cache). Hai cách kiểm nhanh nhất:

```bash
# campaign có được trả về không?
curl -s -H 'Origin: https://ALLOWED_ORIGIN' \
  'https://YOUR_HOST/api/client/livechat/campaigns?site_key=YOUR_SITE_KEY'
```

và trong Console của trang chủ nhà, xoá cache:

```js
localStorage.removeItem('cluvix_lc_campaigns_YOUR_SITE_KEY')   // bỏ cache danh sách 1 giờ
```

(khoá snooze `cluvix_lc_snooze_<siteKey>` nằm trên origin của **iframe** — xoá từ ngữ cảnh Console của
iframe, hoặc chờ một giờ.)

---

## Vẫn tắc?

Thu thập các thông tin liệt kê trong [SUPPORT.md](../../SUPPORT.md#what-to-include) — version từ
`widget.version.json`, host, trình duyệt, log console và network, và có service worker hay không — rồi mở
một issue.
