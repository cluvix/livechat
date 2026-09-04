# Troubleshooting

Symptom → cause → how to check → how to fix. Every entry gives a concrete `curl` command or a DevTools
step, so you can tell the causes apart instead of guessing.

Replace `YOUR_HOST` with the value of `data-host`, `YOUR_SITE_KEY` with the site key, and
`ALLOWED_ORIGIN` with an origin from the site's allow-list.

**A 30-second triage.** Open the customer page, then in DevTools:

1. **Console** — the widget logs its fatal configuration errors with a `[cluvix-livechat]` prefix.
2. **Elements** — search for `<script ... widget.js>` and for the Shadow DOM host appended to `<body>`.
3. **Network** — filter by `livechat`. You should see `POST /api/client/livechat/session` (only after the
   panel is opened), `GET /api/client/livechat/campaigns`, and an `eventsource`/`sse` row that stays
   *pending* — a pending SSE row is healthy, that's the open stream.
4. **Application → Storage** — the `cluvix_lc_*` keys tell you which storage branch is in effect.

---

- [The widget doesn't appear at all](#the-widget-doesnt-appear-at-all)
- [Not connecting / 403](#not-connecting--403)
- [Panel shows "page not found"](#panel-shows-page-not-found)
- ["Send message" stays disabled](#send-message-stays-disabled)
- [No realtime messages](#no-realtime-messages)
- [Messages rejected with 429](#messages-rejected-with-429)
- [Staff can't see the conversation](#staff-cant-see-the-conversation)
- [Logo doesn't show](#logo-doesnt-show)
- [Text on the brand colour looks wrong](#text-on-the-brand-colour-looks-wrong)
- [Wrong language](#wrong-language)
- [History lost after reload](#history-lost-after-reload)
- [iOS keyboard covers the composer](#ios-keyboard-covers-the-composer)
- [Dark mode](#dark-mode)
- [Mixed content over http](#mixed-content-over-http)
- [Campaign never appears](#campaign-never-appears)

---

## The widget doesn't appear at all

No launcher, no console noise about the network — the script simply produced nothing.

### Cause 1 — `data-site-key` missing or empty

**Check.** Console shows:

```
[cluvix-livechat] missing data-site-key on the <script> tag — widget NOT loaded.
```

**Fix.** Add the attribute. Get the exact snippet from the connect dialog **in the Cluvix app** rather than
retyping the key.

### Cause 2 — `data-host` is not a bare origin

`data-host` must be `scheme://host[:port]` with no path, query, fragment or credentials. `https:` is always
accepted; `http:` only for `localhost` / `127.0.0.1`. Anything else and the widget refuses to mount, on
purpose — a wrong host produces a widget that looks alive but can never connect.

**Check.** Console shows:

```
[cluvix-livechat] invalid data-host: "https://example.com/chat" — expected a bare origin like
https://host[:port] (http is only allowed for localhost/127.0.0.1). Widget NOT loaded.
```

**Fix.** Strip the trailing path/slash: `https://example.com`, not `https://example.com/` with a path.

### Cause 3 — the host page's CSP blocks the script

**Check.** Console shows a CSP violation naming `script-src` and the widget host. In DevTools →
Network the request for `widget.js` never appears at all (blocked before it is sent).

**Fix.** On the **customer's** site, allow the widget host in the CSP. The widget needs:

- `script-src` — the origin serving `widget.js`;
- `frame-src` (or `child-src`) — the `data-host` origin, for the iframe;
- `img-src` — the origin of `logo_url` / campaign avatars, if you use them.

The widget's own CSS lives inside a Shadow DOM and inside the iframe, so `style-src` on the host page is
usually not involved — but a `style-src` without `'unsafe-inline'` on the *host page* will block the
Shadow DOM `<style>`; add the host's own nonce/hash policy accordingly.

### Cause 4 — a stale cached `widget.js`

`widget.js` is served with `Cache-Control: public, max-age=3600`, so a browser or CDN can serve a version
up to an hour old.

**Check.**

```bash
curl -sI https://YOUR_HOST/widget.js | grep -iE 'cache-control|age|etag'
curl -s  https://YOUR_HOST/widget.version.json
curl -s  https://YOUR_HOST/widget.js | shasum -a 256   # compare with sha256_js above
```

**Fix.** Hard-reload with cache disabled (DevTools → Network → *Disable cache*), and purge the CDN if you
have one. If the checksums disagree with `widget.version.json`, the deploy itself is incomplete — re-run
`scripts/sync_widget.sh <tag>` (see [Operations §B4](./OPERATIONS.md#b4-deploy--sync-the-widget)).

### Cause 5 — the script tag is in a place that never executes

An `async` script inside a container that is replaced by a client-side router, or injected after
`DOMContentLoaded` in a way that loses `document.currentScript`. The loader falls back to
`script[data-site-key][src*="widget.js"]`, so the tag must still be **in the document** and its `src` must
still contain `widget.js`.

**Check.** In the Console: `document.querySelector('script[data-site-key]')` — `null` means the tag isn't
there.

---

## Not connecting / 403

The launcher appears, the panel opens, and it shows the offline text
("Hiện kênh trò chuyện không khả dụng." / "This chat channel is currently unavailable.") or the generic
"Không kết nối được, vui lòng thử lại sau." / "Could not connect, please try again later."

The difference matters: the first one is `session_error {disabled: true}` — the backend answered **403** or
sent no valid envelope. The second is a network/transport failure.

**Every** 403 reason returns the same message on purpose (so the endpoint cannot be used to enumerate which
site keys exist or whether identity is enabled). To tell them apart you must read the backend's security
log.

**Check — reproduce the handshake:**

```bash
curl -si -X POST https://YOUR_HOST/api/client/livechat/session \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://ALLOWED_ORIGIN' \
  -d '{"site_key":"YOUR_SITE_KEY"}'
```

**Check — read the reason** (ops, on the backend host). Look for the structured events
`livechat_site_rejected` and `livechat_identity_rejected`:

```bash
# Security events are persisted by the backend seclog sink into MySQL table `security_audit_log`
# (the text log only carries Error level, so these Info-level events are NOT in it).
mysql -e "SELECT created_at, event, ip, detail FROM security_audit_log
          WHERE event IN ('livechat_site_rejected','livechat_identity_rejected')
          ORDER BY id DESC LIMIT 50;" <db_name>
```

| `reason` in the log | What actually happened | Fix |
|---|---|---|
| `site_not_found` | `site_key` doesn't exist (typo, wrong environment, wrong tenant). | Re-copy the snippet from the connect dialog **in the Cluvix app**. |
| `site_not_connected` | The site exists but its status is not `connected` — disabled or revoked. | Re-enable it in the Cluvix app. Note this also closes every already-issued JWT's write path immediately, not just new handshakes. |
| `origin_not_allowed` | The `Origin` header isn't in `allowed_origins`. Missing `Origin` and an empty allow-list both land here. | Add the exact origin — see [Operations §A2](./OPERATIONS.md#a2-allowed_origins-rules). `example.com` and `www.example.com` are different. |
| `identity_required` | The site has `identity_mandatory` on, but the handshake had no `identity`. | Either make the partner page emit `data-user-id`/`data-user-hash` (or call `setUser`), or turn `mandatory` off. |
| `identity_disabled` | The page sent `identity` but the site has identity switched off. Deliberately refused rather than silently downgraded to anonymous. | Enable identity on the site, or remove the identity attributes from the page. |
| `secret_undecryptable` | `EMR_CONFIG_ENCRYPTION_KEY` is missing or has been changed since the secret was stored. This is a **server configuration** fault, not the customer's. | Restore the original key. If it is genuinely lost, rotate the identity secret and re-distribute it to the partner. |
| `hash_format` | `identifier_hash` is not exactly 64 hex characters. | Hex-encode the HMAC output; don't base64 it, don't truncate it. |
| `hash_mismatch` | The signature doesn't verify. | Almost always one of: the wrong secret; the HMAC computed over the wrong string; or the key taken as 32 bytes decoded from hex instead of the **ASCII string** of the secret. Verify against the [test vector in the README](../README.md#example-computing-the-hash-server-side). |
| `identifier_length` | `identifier` empty or > 128 characters. | Use a stable short identifier (user id, email). |
| `campaigns_site_unavailable` / `campaigns_origin_not_allowed` | The same two checks, hit by `GET /campaigns`. | Same fixes as above. |

**Also check the client side.** A malformed `data-user-*` never reaches the server at all — the loader
rejects it locally and falls back to anonymous:

```
[cluvix-livechat] invalid data-user-id/data-user-hash (identifier 1..128 chars, hash 64 hex) —
identity ignored, falling back to an anonymous chat.
```

and from `setUser()`:

```
[cluvix-livechat] setUser: expected {identifier (1..128 chars), identifier_hash (64 hex)} — call ignored.
[cluvix-livechat] setUser ignored: called too often (at most once per 2s).
```

**429 instead of 403.** `{"code":429,…}` on the handshake means the `(site_key, IP)` bucket is full —
default 120/minute. Behind a proxy without `TRUSTED_PROXIES`, the per-IP tier is switched off entirely, so
if you *do* see 429 the IP is being read correctly and the traffic is real. See
[Operations → environment](./OPERATIONS.md#backend-environment).

---

## Panel shows "page not found"

The launcher works, the panel opens, and inside it you see the **Angular app's** router error instead of
the chat UI.

**Cause.** The visitor's browser has a Cluvix service worker installed (they have logged into the app on
that domain at some point). `widget.html` in an iframe is a `navigate` request, so the SW answered it with
the SPA's `index.html`.

**Check.**

```bash
# the server itself must return the widget page, not the SPA shell
curl -s https://YOUR_HOST/widget.html | head -20     # expect <title>Cluvix Livechat</title>
```

In the visitor's browser: DevTools → Application → Service Workers. If a worker is listed and the
`widget.html` request in the Network tab shows *(from ServiceWorker)*, that is the cause.

**Fix.**

- The fix is `NON_SPA_EXACT = ['/widget.html']` in `frontend/src/custom-ngsw-worker.js` — verify the entry
  is still there and that the deployed worker contains it.
- For an already-affected browser: DevTools → Application → Service Workers → *Unregister* (or *Update*),
  then reload. Newly deployed workers take over on their own once activated.

---

## "Send message" stays disabled

The pre-chat form is filled in, but the primary button never enables.

**Cause 1 — a field you didn't notice is required.** The button only enables when **every displayed
field** validates. `require_name`, `require_phone` and `require_message` each add a field, and all default
to **true**.

**Cause 2 — phone format vs `phone_region`.** With `phone_region: 'VN'` (the default) the widget accepts a
Vietnamese mobile — `+84` or `0`, then `3/5/7/8/9`, then 8 digits — **or** E.164 (`+`, first digit 1–9,
7–15 digits total). With `phone_region: 'INTL'` it accepts **E.164 only**, so a local `0912345678` is
rejected. Spaces, dots, dashes and parentheses are stripped before matching, so formatting isn't the
problem.

**Check.** In DevTools → Console, inside the iframe context (select `widget.html` in the frame selector at
the top of the Console panel), inspect which fields carry `aria-invalid="true"`:

```js
document.querySelectorAll('[aria-invalid="true"]')
```

**Fix.**

- Serving a mostly-Vietnamese audience → keep `phone_region: VN`; it already accepts international
  numbers in E.164, so switching to `INTL` only makes things stricter.
- Don't want to ask for a phone at all → turn `require_phone` off in the Cluvix app.
- Note the backend validates independently and answers `422` on a mismatch, so relaxing the widget without
  relaxing the site's configuration will not help.

---

## No realtime messages

Sending works and the message reaches the inbox, but staff replies only show up after a reload.

**Cause 1 — the proxy buffers or times out the SSE stream.**

**Check.**

```bash
# a healthy stream: text/event-stream, no buffering, "event: connected" arrives immediately,
# then ":ping" roughly every 25 seconds. Ctrl-C to stop.
curl -N -si "https://YOUR_HOST/api/client/livechat/sse?token=VISITOR_JWT" | head -20
```

Take `VISITOR_JWT` from the `visitor_jwt` in the handshake response, or from the `?token=` of the SSE
request in the Network tab. Expect `Content-Type: text/event-stream` and `X-Accel-Buffering: no`. If the
headers arrive but nothing follows for a long time, buffering is on somewhere.

**Fix.** In nginx, the SSE location needs `proxy_buffering off`, `proxy_cache off`,
`chunked_transfer_encoding off`, `add_header X-Accel-Buffering no`, and `proxy_read_timeout`/
`proxy_send_timeout` well above the 25 s heartbeat (Cluvix uses 3600 s). It must be an **exact-match**
location so a generic `^~ /api/client/` block with `limit_req` doesn't swallow it. Full snippet in
[Operations §B2](./OPERATIONS.md#b2-nginx).

**Cause 2 — the SSE connection cap.** Default **3 concurrent connections per IP** and **2000 total**; over
the cap the server answers `429` ("Quá nhiều kết nối, vui lòng thử lại sau."). Note that if
`TRUSTED_PROXIES` is unset, *every* visitor looks like `127.0.0.1` — the code detects this and switches the
per-IP tier **off** rather than letting three connections serve the whole world, but it also means you have
no per-IP protection at all. Set `TRUSTED_PROXIES` and look for this one-time startup warning:

```
TRUSTED_PROXIES chưa cấu hình, rate limit/cap theo IP bị tắt
```

**Cause 3 — the visitor really does have several tabs open.** Three tabs of the same site is the cap. Close
the extra tabs, or raise `VISITOR_SSE_MAX_CONN_PER_IP`.

**Cause 4 — nothing is wrong.** A stream with no events for **15 minutes** is closed by the server's idle
sweeper, and the widget reconnects with backoff (2 s → 30 s). If the disconnect lasted more than 3 s, the
widget refetches history on reconnect, so no message is lost — you may simply be watching that recovery.

**How to confirm it's the widget and not the backend.** In the Network tab, select the SSE request →
*EventStream*. If events appear there but the panel doesn't update, it's a widget bug — please
[report it](../SUPPORT.md).

---

## Messages rejected with 429

The bubble shows "Gửi lỗi · chạm để thử lại" / "Failed · tap to retry".

**Cause.** A rate limit. Two independent tiers apply to `POST /message`: **10 per minute per
conversation** (`LIVECHAT_RATE_VISITOR`) and **30 per minute per `(site_key, IP)`** (`LIVECHAT_RATE_IP`),
in a 60-second sliding window.

**Check.** Network → the `/message` request → Response. The envelope is HTTP 200 with `"code": 429`:

```bash
curl -s -X POST https://YOUR_HOST/api/client/livechat/message \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer VISITOR_JWT' \
  -d '{"client_echo_id":"probe-1","text":"hi"}'
```

**Fix.**

- Tapping the failed bubble retries with the **same** `client_echo_id`, so a retry that succeeds after a
  partial write cannot produce a duplicate.
- A whole office behind one NAT can legitimately share the per-IP bucket. Raise `LIVECHAT_RATE_IP` — but
  first make sure `TRUSTED_PROXIES` is set, otherwise the IP tier isn't really per-IP.
- Not a 429? Check the other rejections, which come back as `422`: text longer than **4000 runes**, an
  empty text, or a `client_echo_id` that isn't 1–64 characters of `[A-Za-z0-9_-]`.

---

## Staff can't see the conversation

The visitor's message is saved (it appears in the visitor's own history after a reload) but a staff member
doesn't see it in the inbox.

**Cause 1 — assignment-based visibility.** The Omnichat inbox has a `VIEW_MODE` option (`user_option`
id 24) which defaults to **"by assignment"**: a staff member sees only conversations assigned to them
(plus unassigned ones), unless they hold the "view all" permission. A brand-new livechat conversation is
unassigned.

**Check / fix — in the Cluvix app:** switch `VIEW_MODE` to open, grant the "view all" permission to the
role, or assign the conversation. Note the setting is cached for ~30 s, so a change is not instant.

**Cause 2 — company scope.** The conversation belongs to the company that owns the livechat site. A staff
member whose active company is a different one will not see it.

**Check / fix.** Confirm the staff member's active company matches the company the site was created under.

**Cause 3 — it's an internal note.** Internal notes (`src = 2`) are deliberately invisible to the visitor;
the reverse is not a thing — every visitor message reaches the inbox.

---

## Logo doesn't show

The header falls back to the brand's initial letter.

**Cause 1 — not `https`.** `logo_url` is accepted by the backend only when the scheme is `https:`, and the
widget re-checks the protocol before assigning it to `src`. An `http:` URL is silently ignored on both
sides.

**Cause 2 — the image fails to load** (404, hotlink protection, an ad-blocker, a CDN that requires a
`Referer`). The widget replaces a broken image with the brand initial at the same size, on purpose — a
broken-image icon in a chat header looks worse than an initial.

**Cause 3 — over 1 MB at upload time**, so the upload never succeeded.

**Check.**

```bash
curl -sI 'https://CDN/path/logo.png' | grep -iE 'HTTP/|content-type|content-length'
```

In the browser, Network → filter *Img* — a `404`/`403` row for the logo URL is the confirmation.

**Fix.** Re-upload through the Cluvix app (≤ 1 MB; the type is validated from the file's magic bytes, so a
renamed file is rejected), or paste an `https` URL that is publicly reachable without a `Referer` check.
Also allow the image origin in the host page's `img-src` CSP.

---

## Text on the brand colour looks wrong

"Too dark", "not my brand colour", "the header is a different shade from the one I configured".

**Cause — that's the contrast rule, and it is intentional.** `primary_color` is used exactly as given for
details that carry no text (focus ring, highlights). For any surface **with text on it** the widget darkens
the colour in 1% steps until white text reaches WCAG 2.1 AA (4.5:1), then picks white or `#111827` —
whichever contrasts better. The darkening is capped at 50 steps (≈ 60% of the original lightness), so very
light brand colours (yellow, pale grey) keep their colour and get **dark** text instead of being darkened
beyond recognition.

**Check.** In the iframe's Console:

```js
getComputedStyle(document.documentElement).getPropertyValue('--lc-primary')        // exactly what you configured
getComputedStyle(document.documentElement).getPropertyValue('--lc-primary-strong') // the darkened surface colour
getComputedStyle(document.documentElement).getPropertyValue('--lc-on-primary')     // the chosen text colour
```

**Fix.** If `--lc-primary-strong` is far from `--lc-primary`, your brand colour did not reach AA with white
text. Choosing a darker brand colour in the Cluvix app makes the two converge. There is no switch to turn
the rule off: a valid brand colour must never produce unreadable text.

**Not this?** If a colour is rejected on save entirely, `primary_color` must be `#RGB` or `#RRGGBB` — free
text is refused because the value is injected into CSS.

---

## Wrong language

Vietnamese where you expected English, or the reverse.

**Cause — the resolution order.** First match wins: `widget_theme.locale` (set in the Cluvix app) → the
**host page's** `<html lang>` → `navigator.language` → `vi`. Matching is on the base subtag, so `en-GB`
resolves to `en`; anything that isn't `vi` or `en` falls through to the next source.

**Check.** On the host page: `document.documentElement.lang`. In the iframe:
`document.documentElement.lang` again — the app sets it to the locale that was actually applied.

**Fix.**

- To pin the language regardless of the visitor, set `widget_theme.locale` in the Cluvix app — it wins over
  everything else.
- To follow the page, leave `locale` unset and make sure the page has a correct `<html lang="en">`.
- Only `vi` and `en` exist. A page in `fr` with no `widget_theme.locale` will show Vietnamese.
- After changing `locale` in the admin, an already-open tab keeps the cached theme until the next
  handshake; reload the page.

---

## History lost after reload

The visitor reloads and the conversation starts empty.

**Cause 1 — a pre-chat site, and the tab was closed.** When `pre_chat_form.enabled` is true, the resume
token lives in **`sessionStorage`**, which dies with the tab. This is deliberate: on a shared or reception
computer the next person must not be able to reopen a previous visitor's (potentially medical)
conversation. A plain reload in the *same* tab keeps it; a new tab does not.

**Cause 2 — the 30-day rules.** On a site without pre-chat, the token lives in `localStorage` with a
**30-day** client-side TTL, and the backend independently refuses to resume an anonymous conversation whose
last activity is older than **30 days** — it opens a new one instead.

**Cause 3 — identity sessions don't store a token at all.** For a verified identity the widget deliberately
does not persist `visitor_token`; the conversation is resumed by the **identifier** on the next handshake.
If the page stops emitting `data-user-id`/`data-user-hash` (or stops calling `setUser`), the visitor
becomes anonymous again and gets a **new** conversation. Identity is memory-only and never survives a
reload on its own.

**Cause 4 — storage is unavailable.** Private mode, "block all cookies", or a hardened profile. The widget
catches every storage error and keeps working for the current session, so the symptom is exactly this:
everything works until reload.

**Check.** DevTools → Application → Local Storage / Session Storage on the **host page's** origin:

- `cluvix_lc_token_<siteKey>` — present in `localStorage` as `{"token":"…","ts":…}` on a no-pre-chat site,
  in `sessionStorage` as a bare token on a pre-chat site;
- `cluvix_lc_open_<siteKey>`, `cluvix_lc_cfg_<siteKey>` — panel state and cached config.

And on the **iframe's** origin: `cluvix_lc_prechat_<siteKey>` (pre-chat completed) and
`cluvix_lc_snooze_<siteKey>`.

**Fix.** Nothing to fix if it's cause 1, 2 or 3 — that's the designed behaviour. For a site where visitors
should reliably resume across tabs, either turn the pre-chat form off, or use identity verification, which
resumes across devices as well.

**Not this?** "Chatting as `<name>`" plus an empty history right after login is the documented v2
limitation: an anonymous conversation is **not** merged into the authenticated one; `setUser` starts a new
conversation. See [v2 limitations](../README.md#v2-limitations).

---

## iOS keyboard covers the composer

**Cause.** iOS Safari does not shrink the layout viewport when the on-screen keyboard opens, so a
full-screen panel keeps its full height and the composer ends up behind the keyboard.

**What the widget does.** Below 480 px, while the panel is open, the loader pins the frame to
`window.visualViewport` (height and `offsetTop`) and releases it on close. Inputs are 16 px on phones so
iOS doesn't zoom on focus, and the header/composer/footer respect `env(safe-area-inset-*)` on notched
devices.

**Check.** In the iframe's Console on the device (Safari remote inspector):

```js
window.visualViewport.height   // shrinks when the keyboard opens
```

and on the host page, inspect the frame wrapper inside the Shadow DOM — while the keyboard is open it
should carry an inline `height`/`top`.

**Fix if it still misbehaves.** The pinning only applies at ≤ 480 px and only for the **full** panel (not
the compact campaign preview). A host page that sets its own `position: fixed` / transform on `<body>` can
break the fixed positioning of any floating widget — test with those styles removed. If it reproduces on a
plain page, that's a bug worth [reporting](../SUPPORT.md).

---

## Dark mode

**Expected behaviour.** Every neutral colour is a CSS custom property with a dark palette applied from
`prefers-color-scheme`. `color_scheme: 'auto'` (default) follows the visitor's operating system;
`'light'`/`'dark'` pin it.

**Symptom: the widget is dark but the site is light (or vice versa).** The widget follows the **visitor's
OS**, not the host page's theme. A site with its own dark-mode toggle that does not change the OS setting
will diverge.

**Fix.** Pin `color_scheme` to `light` or `dark` in the Cluvix app to match the site.

**Check which mode is active.** In the iframe's Console:

```js
document.documentElement.dataset.lcScheme   // "light" / "dark" when pinned; undefined when "auto"
matchMedia('(prefers-color-scheme: dark)').matches
```

**Symptom: the unread badge has a white halo on a dark page.** The badge ring follows the same
`color_scheme` decision — if it looks wrong, the site is probably pinned to `light` while the page is dark.

---

## Mixed content over http

**Symptom.** The site is served over `http://` and the browser blocks the widget, or the site is `https`
and the console reports mixed content.

**Cause.** A `https` page cannot load subresources over `http`, and the site's `allowed_origins` cannot
contain an `http` origin anyway — `http://` is only accepted for `localhost` / `127.0.0.1`.

**Check.**

```bash
curl -sI http://CUSTOMER_SITE/ | grep -i location   # is there an https redirect at all?
```

Console shows `Mixed Content: The page at 'https://…' was loaded over HTTPS, but requested an insecure …`.

**Fix.** Serve the customer's site over `https`, and use `https` in both `src` and `data-host`. There is no
supported `http` production configuration.

---

## Campaign never appears

See [CAMPAIGNS.md → Why a campaign doesn't fire](./CAMPAIGNS.md#why-a-campaign-doesnt-fire) for the full
list of guards (panel closed, no message yet in the session, not snoozed, URL match, timer, the
bypass-cache re-check). The two quickest checks:

```bash
# is the campaign returned at all?
curl -s -H 'Origin: https://ALLOWED_ORIGIN' \
  'https://YOUR_HOST/api/client/livechat/campaigns?site_key=YOUR_SITE_KEY'
```

and in the host page's Console, clear the snooze:

```js
localStorage.removeItem('cluvix_lc_campaigns_YOUR_SITE_KEY')   // drop the 1-hour list cache
```

(the snooze key `cluvix_lc_snooze_<siteKey>` lives on the **iframe's** origin — clear it from the iframe's
Console context, or wait an hour.)

---

## Still stuck?

Collect the information listed in [SUPPORT.md](../SUPPORT.md#what-to-include) — the version from
`widget.version.json`, the host, the browser, the console and network logs, and whether a service worker is
installed — and open an issue.
