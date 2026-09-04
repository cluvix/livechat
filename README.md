# Cluvix Livechat Widget

Embeddable livechat widget: a small vanilla-TS loader (`widget.js`) plus a single self-contained
iframe app (`widget.html`). No framework, no runtime dependency, target ≤ 50 KB gzip total. Designed
to sit on **any** website your visitors use, backed by a Cluvix (or Cluvix-compatible) server.

[Tiếng Việt](./README.vi.md)

## Quick start

Add one script tag to your site, right before `</body>`:

```html
<script
  src="https://YOUR_BACKEND/widget.js"
  data-site-key="YOUR_SITE_KEY"
  data-host="https://YOUR_BACKEND"
  async
></script>
```

`YOUR_SITE_KEY` is issued when you create a livechat channel in the Cluvix admin (Config → Omni-channel
→ Livechat) — the connect dialog gives you the exact snippet, already filled in, including `data-host`.

## Data attributes

| Attribute | Required | Description |
|---|---|---|
| `data-site-key` | yes | Public site key identifying your livechat channel. Not a secret — safe to ship in HTML. |
| `data-host` | no | Origin of the backend that serves `/api/*` and `widget.html` (e.g. `https://chat.example.com`). Must be a bare origin (`scheme://host[:port]`, no path/query). `http://` is only accepted for `localhost`/`127.0.0.1`. If omitted, the widget uses the origin `widget.js` itself was loaded from. See [Self-hosting](#self-hosting) below — this is why the attribute exists. |
| `data-user-id` | no | Identity verification — the visitor's identifier at your system (email, user id…), 1–128 chars. See [Identity verification](#identity-verification). |
| `data-user-hash` | no | `hex(HMAC-SHA256(identity_secret, identifier))`, computed on **your server**. Required together with `data-user-id`. |
| `data-user-name` | no | Optional display name, prefilled once (never overwrites a name the visitor already has). |
| `data-user-phone` | no | Optional phone (VN mobile format), prefilled once. |
| `data-user-email` | no | Accepted by the widget/API today but **not yet persisted** by the backend (v2 has no email column on the conversation) — reserved for a future release. |

Missing or malformed `data-host`/identity attributes fail closed: the widget logs a `console.error` and
either doesn't mount (`data-host`) or falls back to an anonymous session (identity).


## Theme & localization

Everything below is configured **in the Cluvix admin** (Config → Omni-channel → Livechat), not in the
script tag — the backend returns it in `POST /session` and the widget applies it live.

### `widget_theme`

| Field | Type | Description |
|---|---|---|
| `primary_color` | hex | Brand colour. Surfaces that carry text (header, visitor bubble, send button, primary button, launcher) are painted with an automatically **darkened** variant so the text on them always reaches WCAG 2.1 AA (4.5:1) — see below. |
| `position` | `left` \| `right` | Which bottom corner the launcher/panel sits in. |
| `greeting_text` | string | First message shown in the panel. Defaults to a localized greeting. |
| `offline_text` | string | Shown when the channel is unavailable. Defaults to a localized text. |
| `launcher_label` | string | Text on the launcher pill. Defaults to "Tư vấn" (vi) / "Chat with us" (en). |
| `logo_url` | https URL | Logo in the header/avatars. Only `https:` URLs are accepted; anything else falls back to the brand initial. |
| `brand_name` | string | Title in the header. Falls back to `launcher_label`, then a localized default. |
| `subtitle` | string | Line under the title. When empty, the widget shows the live online/offline status instead. |
| `locale` | `vi` \| `en` | UI language. Optional — see [Locale](#locale) below. |
| `color_scheme` | `auto` \| `light` \| `dark` | Light/dark mode. `auto` (default) follows the visitor's operating system (`prefers-color-scheme`); `light`/`dark` force one. Optional — omitted means `auto`. |
| `launcher_offset_x` | number | Distance in **px** from the launcher to the left/right edge (whichever `position` says). Default `20`, clamped to `0..200`; non-finite values fall back to the default. The panel (desktop) and the campaign preview follow the same offsets. |
| `launcher_offset_y` | number | Distance in **px** from the launcher to the bottom edge. Default `20`, clamped to `0..200`. The safe-area inset of notched phones is added on top of it. |

**Dark mode.** All neutral colours (backgrounds, text, borders, inputs) are CSS custom properties with a
dark palette applied automatically when the visitor's OS asks for dark mode — nothing to configure.
`color_scheme` only overrides that decision. `primary_color` is untouched by the mode: it keeps going
through the same contrast rule below in both palettes.

**Automatic contrast.** `primary_color` is used as-is only for details without text (focus ring,
highlights). For any surface with text on it the widget darkens the colour in 1% steps until white text
reaches 4.5:1, and picks white or `#111827` — whichever contrasts better — as the text colour. Very
light brands (yellow, light grey) are never darkened beyond recognition: they keep their colour and get
dark text instead. So a valid brand colour can never produce unreadable text.

### `pre_chat_form`

| Field | Type | Description |
|---|---|---|
| `enabled` | bool | Ask for details before the first message. |
| `require_name` | bool | Show + require the name field. |
| `require_phone` | bool | Show + require the phone field. |
| `require_message` | bool | Show + require the first-message field. |
| `phone_region` | `VN` \| `INTL` | Phone validation. `VN` (default) accepts a Vietnamese mobile number **or** E.164 (`+14155552671`); `INTL` accepts E.164 only. Optional — omitted means `VN`. |

### Locale

The UI language is resolved in this order, first match wins:

1. `widget_theme.locale` from the admin,
2. the `lang` attribute of the host page's `<html>` element,
3. `navigator.language`,
4. `vi`.

The loader resolves it (only the loader can read the host page's `lang`) and passes it to the iframe
together with the session, which also sets `document.documentElement.lang` accordingly. Times in the
message list are formatted with `Intl.DateTimeFormat` for that locale.

## Public JS API

```js
window.cluvixChat.open();      // open the chat panel
window.cluvixChat.close();     // close it
window.cluvixChat.toggle();    // toggle
window.cluvixChat.setUser({    // attach/replace identity after page load (e.g. right after your own login)
  identifier: 'user-42@example.com',
  identifier_hash: '<64 hex signed by YOUR server>',
  name: 'Jane Doe',
  phone: '0900000000',
});
window.cluvixChat.on('ready',  () => {});   // widget mounted, API ready
window.cluvixChat.on('opened', () => {});
window.cluvixChat.on('closed', () => {});
window.cluvixChat.on('message', (e) => {}); // staff sent a message — e.detail = { conversation_id, sent_at } only, NO content
window.cluvixChat.off('opened', fn);        // unsubscribe
```

Calls made before the widget has mounted (script loaded `async`, page not ready yet) are queued and run
right after the `ready` event fires. `on`/`off` are thin sugar over
`window.addEventListener('cluvix-chat:<name>', ...)` / `removeEventListener`, so plain
`addEventListener` works too.

`setUser()` is throttled to once per 2 seconds, and is a no-op when both `identifier` and
`identifier_hash` already match the identity currently in effect (and the previous handshake didn't
fail) — this avoids a re-handshake storm from code that calls it on every render.

Identity is kept **in memory only** (never `localStorage`) — reloading the page without re-supplying
`data-user-*`/`setUser()` starts a fresh anonymous session. This is deliberate: a shared/kiosk browser
must not resume someone else's authenticated conversation from disk.

## Identity verification

By default every visitor is anonymous — the widget generates a random token and the backend tracks the
conversation by that token in `localStorage`. If your site already knows who the visitor is (they're
logged in), you can attach an **identity** so the same person gets the same conversation across
devices/browsers, and staff sees "chatting as `<name>`" in the widget.

The model (same shape as Chatwoot's `hmac_token`, Intercom's `user_hash`, Crisp's `signature`):

- Your backend has a **`identity_secret`** — generated by an admin in the Cluvix connect dialog
  (Identity panel), shown to you **once**, and stored by Cluvix only in encrypted form.
- For each visitor, your **server** (never the browser) computes:
  `identifier_hash = hex(HMAC-SHA256(identity_secret, identifier))`, where `identifier` is any stable
  string that identifies the visitor in your system (user id, email…), 1–128 characters.
- Your page renders `identifier` + `identifier_hash` into `data-user-id` / `data-user-hash` (or calls
  `cluvixChat.setUser({...})`). The Cluvix backend recomputes the HMAC with its own copy of the secret
  and compares it in constant time. A mismatch (or a site with identity disabled) fails the whole
  session with a generic error — it never reveals which check failed.

> **⚠ NEVER put `identity_secret` in HTML, client-side JavaScript, a public repo, or any code that
> ships to the browser.** Only `identifier` and `identifier_hash` belong on the page — the hash is safe
> to expose (it can't be reversed into the secret), the secret itself must never leave your server.

The identity hash does not expire (no `exp` claim in v2 — see [Security](#security-notes) below for the
trade-off). Rotating the secret in the connect dialog immediately invalidates every previously-issued
hash.

### Example: computing the hash server-side

Same test vector in every language below, so you can sanity-check your implementation:

```
secret     = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
identifier = "user-42"
expected   = "a63cb3bd204a755b540eda8a223d431f92f5aa347b397df1401e3901fdf6e659"
```

> This vector is for testing only — never use it as a real `identity_secret`.

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

> The HMAC key is the **ASCII string** of the secret (64 characters as issued), not 32 bytes decoded
> from hex — a common mistake when porting between languages.

## Self-hosting

`widget.js` can be served from anywhere (your CDN, a different subdomain…), but **`widget.html` must be
served from the same origin as `data-host`**: the iframe calls `/api/*` on that origin without CORS, and
the backend checks the request `Origin` header for the initial handshake. If `data-host` points at a
backend that isn't actually serving `/widget.html` + `/api/client/livechat/*`, the widget fails to load
data (visible as a persistent "offline" state, browser console shows the fetch error).

In this repo, `npm run build:widget` (see [Build](#build)) emits both `widget.js` and `widget.html`
directly into `../../public` (the parent app's static folder), the default when developing inside the
monorepo. When you consume this package standalone (outside the monorepo), you are responsible for
publishing the build output next to your own backend — an `WIDGET_OUT_DIR` override for a cleaner
standalone workflow is tracked separately and not yet part of this release.

## API contract

All endpoints below live under `/api/client/livechat/` on the backend named by `data-host`. This is a
public, unauthenticated-by-design surface (protected by `site_key` + `Origin` allow-list, rate limits,
and a scoped, visitor-only JWT) — it's what the loader talks to, and it's documented here so it's easy
to build your own client, or verify the widget's own behavior.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/session` | none (issues JWT) | Handshake: resolve `site_key`, verify `Origin`, optionally verify `identity`, create/resume the conversation, return `visitor_jwt` + config. |
| GET | `/campaigns?site_key=` | none | Proactive-message previews (`enabled` campaigns), used before the visitor has opened the chat. |
| GET | `/sse?token=` | visitor JWT (query param) | Server-Sent Events stream: `connected`, `new_message` (staff), `staff_typing`. |
| POST | `/message` | visitor JWT | Send a visitor message. |
| GET | `/messages?offset=&limit=` | visitor JWT | Paginated message history for the visitor's own conversation. |
| POST | `/typing` | visitor JWT | Notify staff the visitor is typing. No persistence. |
| POST | `/campaigns/:id/trigger` | visitor JWT | Visitor clicked a campaign preview — creates the opening message once (idempotent). |

The visitor JWT (returned by `/session` as `visitor_jwt`) is bound to exactly one `conversation_id` —
every authenticated endpoint reads the conversation from the token, never from the request body, so a
JWT can never be used to read or write a different visitor's conversation.

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

- `visitor_token` — the token from a previous session, to resume an **anonymous** conversation. Ignored
  whenever `identity` is present.
- `pre_chat` — optional name/phone collected by a pre-chat form.
- `identity` — see [Identity verification](#identity-verification). `email` is accepted but not yet
  stored by the backend in v2.

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

Every failure mode of `/session` (unknown `site_key`, disabled site, disallowed `Origin`, identity
required but missing, identity disabled on the site, bad hash format, wrong signature) returns the
**same** generic 403 message — this is deliberate, so the endpoint can't be used to probe which
`site_key`s exist or whether identity is enabled on a given site.

## Project structure

Two independent bundles share `src/shared/`:

```
src/
├─ loader.ts            entry → widget.js (IIFE on the customer page; the only session broker)
├─ loader/
│  ├─ bootstrap.ts      data-* attributes, data-host validation, identity attrs
│  ├─ state.ts          single LoaderState object (locale/theme resolution)
│  ├─ session.ts        handshake (/session), resume token (sessionStorage / localStorage + TTL), setUser
│  ├─ frame-dom.ts      Shadow DOM host, launcher, frame wrapper
│  ├─ frame.ts          open/close, compact preview, focus management, iframe mount
│  ├─ frame-anim.ts     open/close transition + prefers-reduced-motion
│  ├─ viewport.ts       visualViewport fit for mobile keyboards
│  ├─ theme.ts          launcher label/colour, unread badge
│  ├─ css.ts            shadow CSS, badge ring, launcher offset
│  ├─ bridge.ts         postMessage ↔ iframe (origin-locked), CustomEvent emitter
│  ├─ api.ts            window.cluvixChat (open/close/toggle/setUser/on/off) + pre-ready queue
│  ├─ campaigns-bridge.ts  campaign fetch/cache + SPA URL tracking
│  ├─ storage.ts, constants.ts, types.ts
├─ app/
│  ├─ main.ts           entry → widget.html (iframe app): session, history, optimistic send, SSE
│  ├─ ui.ts             WidgetUI facade (theme CSS vars, screens)
│  ├─ ui/
│  │  ├─ chat-list.ts   message groups, send status, typing indicator, sr-live region, retry
│  │  ├─ prechat.ts     pre-chat form (name / phone / message) + validation
│  │  ├─ composer.ts    textarea + send button
│  │  ├─ preview.ts     campaign compact preview
│  │  ├─ brand.ts       logo / avatar / header / footer markup (pure functions)
│  │  ├─ markup.ts      escapeText / escapeAttr / safeHttpsUrl, icons, field builder, CSS inject
│  │  └─ types.ts
│  ├─ api.ts, sse.ts, store.ts, campaigns.ts, styles.ts
└─ shared/
   ├─ strings.ts        vi / en dictionaries + locale resolution (used by both bundles)
   ├─ color.ts          WCAG contrast helpers (on-primary colour, auto-darkened primary)
   ├─ protocol.ts       loader ↔ iframe postMessage protocol
   └─ types.ts          theme / pre-chat / session shapes (mirrors the backend)
```

Rules of thumb: anything that runs on the customer page lives in `loader/`; anything inside the iframe
lives in `app/`; nothing user-facing is hard-coded outside `shared/strings.ts`; every string that reaches
the DOM goes through `textContent` or `escapeText`/`escapeAttr`.

## Build

```bash
npm run type-check   # tsc --noEmit
npm run build:widget # type-check + build:loader (widget.js) + build:app (widget.html)
npm run size          # gzip-size gate, fails if widget.js + widget.html together exceed 50 KB gzip
```

## Dev / local testing

```bash
npm run dev # serves dev/ on http://localhost:5500 (no extra runtime dependency)
```

Open `http://localhost:5500`, use the on-page form to point the demo at your backend + site key (see
`dev/index.html`), and remember to add `http://localhost:5500` to that site's `allowed_origins`.

## v2 limitations

- **No attachments** — text only.
- **No merge between anonymous and authenticated sessions** — a visitor who chats anonymously and then
  logs in (identity attached via `setUser`) gets a **new** conversation; the previous anonymous history
  is not carried over. The widget shows "chatting as `<name>`" once identity is verified so this is
  visible to the visitor.
- **Fixed "Powered by Cluvix" footer** in the chat panel — not configurable in v2.
- **UI available in Vietnamese and English only** (`vi`/`en`, both LTR) — see
  [Theme & localization](#theme--localization). No RTL support.
- Identity hashes don't expire (no `exp`/replay protection) — see
  [Security notes](#security-notes).

## Security notes

See [SECURITY.md](./SECURITY.md) for how to report a vulnerability. In short:

- `site_key` is a public key, not a secret — protection comes from the `Origin` allow-list + rate
  limiting, same model as most livechat widgets (Chatwoot `website_token`, Intercom `app_id`, Crisp
  `website_id`).
- `identity_secret` must never leave your server; only the derived hash is sent to the browser.
- The identity hash has no expiry in v2 — anyone who obtains a valid `(identifier, identifier_hash)`
  pair (e.g. via a leak on the partner site) can open that visitor's conversation until the secret is
  rotated. Don't log or expose the hash anywhere it doesn't need to be.
- All handshake failures return one generic 403 (no oracle for enumerating sites/identities).
- `postMessage` between the loader and the iframe is origin-locked: the iframe trusts only the origin of
  the first valid message it receives and never posts to `'*'`.
- `visitor_token` lives in `sessionStorage` (per-tab) when `pre_chat_form.enabled` is true; otherwise it
  stays in `localStorage` but expires after 30 days.
- The realtime stream sends a `:ping` heartbeat comment and an `expired` event before closing on JWT
  expiry, so the widget re-handshakes immediately instead of guessing from connection errors.

## License

[MIT](./LICENSE)
