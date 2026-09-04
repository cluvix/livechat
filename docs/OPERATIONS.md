# Operations runbook

For two audiences:

- **clinic administrators** who create and configure a livechat site **in the Cluvix app**;
- **ops** who deploy the Cluvix backend and publish `widget.js` / `widget.html`.

Anything marked *in the Cluvix app* is done in the Cluvix admin UI and lives outside this repository.

- [Part A — Administrator](#part-a--administrator)
  - [A1. Create a livechat site](#a1-create-a-livechat-site)
  - [A2. `allowed_origins` rules](#a2-allowed_origins-rules)
  - [A3. Get the site key and snippet](#a3-get-the-site-key-and-snippet)
  - [A4. Theme, pre-chat, logo](#a4-theme-pre-chat-logo)
  - [A5. Identity verification](#a5-identity-verification)
  - [A6. Campaigns](#a6-campaigns)
- [Part B — Ops](#part-b--ops)
  - [B1. Backend environment](#backend-environment)
  - [B2. nginx](#b2-nginx)
  - [B3. Service worker](#b3-service-worker)
  - [B4. Deploy / sync the widget](#b4-deploy--sync-the-widget)
  - [B5. Rollback](#b5-rollback)
  - [B6. Upgrading — widget ↔ backend compatibility](#b6-upgrading--widget--backend-compatibility)
- [Go-live checklist](#go-live-checklist)

---

## Part A — Administrator

### A1. Create a livechat site

**In the Cluvix app:** *Settings → Connected channels (`/config/omni-channel`) → Livechat card → create a livechat channel.*

Fields on create (`POST /config/omni-channel/livechat`):

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Display name of the site. Also becomes the initial `widget_theme.brand_name` when you don't set one. |
| `allowed_origins` | yes | At least one origin — see [A2](#a2-allowed_origins-rules). An empty list means **nothing is allowed**, not "everything". |
| `branch_id` | no | Must belong to the active company. |
| `widget_theme` | no | Any subset; unspecified sub-fields take the defaults (`primary_color: #1677ff`, `position: right`, `locale: vi`, `color_scheme: auto`, localized greeting/offline text). |
| `pre_chat_form` | no | Defaults: `enabled`, `require_name`, `require_phone`, `require_message` all **true**, `phone_region: VN`. |

The company is always taken from the active session, never from the request body. The site is created with
status `connected`; `site_key` is a random 32-hex string generated server-side.

On update (`PUT …/livechat/:accountId`) only `name`, `allowed_origins`, `widget_theme` and `pre_chat_form`
are writable — `site_key`, company, branch and channel are locked. A JSON field you don't send keeps its
current value.

Validation that will reject an update:

- `primary_color` must be `#RGB` or `#RRGGBB` (it is injected into CSS on the visitor's page, so free-form
  strings are refused); empty is allowed and means "use the default".
- `greeting_text` ≤ 300, `brand_name` ≤ 80, `subtitle` ≤ 120 characters.
- `position` ∈ `left | right`; `locale` ∈ `vi | en`; `color_scheme` ∈ `auto | light | dark`;
  `phone_region` ∈ `VN | INTL`.
- `launcher_offset_x` / `launcher_offset_y` ∈ `0..200`.
- `logo_url` must be `https:` (no whitespace anywhere) and ≤ 500 characters.

### A2. `allowed_origins` rules

Each entry is a **bare origin** — `scheme://host[:port]`, nothing else:

- no path, query, fragment or `user:pass@`;
- **no wildcards** (`https://*.example.com` is rejected);
- `https://` for anything real; `http://` is accepted **only** for `localhost` and `127.0.0.1` (local
  development);
- duplicates are removed; the value is stored lower-cased.

At handshake time both sides are normalized before comparison — lower-cased, trailing slash stripped, and
a default port (`:443` on https, `:80` on http) stripped — so `https://shop.example.com` and
`https://shop.example.com:443/` match each other.

Practical consequences:

- **Every** hostname the visitor's browser can show must be listed: `https://example.com` and
  `https://www.example.com` are different origins.
- A staging domain is a separate entry.
- A `file://` page or an origin-less context sends no `Origin` header and is always rejected.

### A3. Get the site key and snippet

The create/update response contains `site_key`, a ready-made `snippet`, plus `snippet_host` and
`snippet_host_source`. The snippet is:

```html
<script src="{host}/widget.js" data-site-key="{site_key}" data-host="{host}" async></script>
```

`{host}` comes from `PUBLIC_BASE_URL` when it is set to a valid bare origin
(`snippet_host_source: "public_base_url"`); otherwise the backend falls back to the company callback URL
or the request `Host` (`snippet_host_source: "fallback"`). **If you see `fallback`, verify the host before
handing the snippet to a customer** — a wrong host produces a widget that loads but never connects.

`site_key` is public by design (it ships in page source). It is not a secret; the protection is the
`Origin` allow-list plus rate limiting.

### A4. Theme, pre-chat, logo

Theme and pre-chat fields are documented in the [README](../README.md#theme--localization); the resolution
rules (locale, contrast, dark mode) are in [How it works §10](./HOW_IT_WORKS.md#10-locale-theme-dark-mode).

**Logo** (`POST …/livechat/:accountId/logo`, multipart field `file`):

- **≤ 1 MB**, and the type is decided from the file's **magic bytes**, not from the filename or the
  `Content-Type` header — a `.txt` renamed to `.png` is rejected;
- stored on S3 as public-read under `livechat/logo/<company_id>/<account_id>/…`, and the resulting URL is
  written into `widget_theme.logo_url`;
- the previous logo is deleted afterwards on a best-effort basis, and only when the URL belongs to
  Cluvix's own bucket — a URL an admin pasted by hand is never touched;
- `DELETE …/logo` clears `logo_url` and is idempotent.

If the logo fails to load in a visitor's browser (404, hotlink protection, blocked CDN), the widget
substitutes the brand initial at the same size — never a broken image.

### A5. Identity verification

**In the Cluvix app:** the connect dialog's Identity panel.

| Action | Endpoint | Behaviour |
|---|---|---|
| Enable | `POST …/identity` `{action:"enable", mandatory?}` | Generates the secret. **The plaintext secret is returned exactly once** — copy it immediately; it can never be read back. Enabling on a site that already has identity returns `409` rather than silently rotating. |
| Rotate | `POST …/identity` `{action:"rotate", mandatory?}` | New secret, returned once. **Every previously issued hash stops working immediately** — coordinate with the partner site. Rotating a site that never enabled identity returns `422`. |
| Disable | `POST …/identity` `{action:"disable"}` | Removes the secret and forces `mandatory` back to off. Idempotent. |
| Toggle mandatory | `PATCH …/identity` `{mandatory:bool}` | `422` if identity is not enabled — turning `mandatory` on without a secret would reject *every* handshake. |

Only `secret_last4` is ever readable afterwards, for matching against the copy your partner holds. The
security log records enable/rotate/disable/mandatory changes with the account id, never the secret.

`mandatory: true` means a handshake **without** `identity` is refused. Turn it on only once the partner's
pages reliably emit `data-user-id`/`data-user-hash` (or call `setUser`) — otherwise anonymous visitors see
the offline state.

Give the partner: the secret (over a secure channel), and the
[HMAC recipes in the README](../README.md#example-computing-the-hash-server-side), including the note that
the HMAC key is the **ASCII string** of the secret, not 32 bytes decoded from hex.

### A6. Campaigns

See [CAMPAIGNS.md](./CAMPAIGNS.md) for the four admin endpoints, the matching rules and the current
limitations.

---

## Part B — Ops

### Backend environment

| Variable | Required | Effect if wrong/missing |
|---|---|---|
| `JWT_LIVECHAT_KEY` | **yes in production** | HMAC key for the visitor JWT, separate from the staff/partner keys so a visitor token can never be used against another API. Empty still signs, but is not secure. Generate with `openssl rand -hex 32`. |
| `EMR_CONFIG_ENCRYPTION_KEY` | **yes in production** | Encrypts `identity_secret` at rest (marker `enc:v1:`). Missing → the secret cannot be decrypted, every identity handshake fails with the generic 403 (reason `secret_undecryptable` in the security log) and `secret_last4` shows empty. **Changing this key makes every already-encrypted value unreadable.** |
| `TRUSTED_PROXIES` | **yes behind a proxy** | Without it, gin ignores `X-Forwarded-For` and every request looks like `127.0.0.1`. The widget code detects that and **disables the per-IP tiers** (rate limit and SSE connection cap) rather than turning them into one global bucket — it logs `TRUSTED_PROXIES chưa cấu hình, rate limit/cap theo IP bị tắt` once per process. Set it to your proxy's address (e.g. `127.0.0.1`). |
| `PUBLIC_BASE_URL` | recommended | Bare origin of the backend, used as `data-host` and `src` in the generated snippet. Must have no path/query/fragment/credentials, or it is ignored with a one-time warning and the snippet falls back (see [A3](#a3-get-the-site-key-and-snippet)). |
| `LIVECHAT_RATE_SESSION_IP` | no | Handshake limit per `(site_key, IP)` per minute. Default **120**. |
| `LIVECHAT_RATE_VISITOR` | no | Messages per conversation per minute. Default **10**. |
| `LIVECHAT_RATE_IP` | no | Messages per `(site_key, IP)` per minute. Default **30**. |
| `LIVECHAT_RATE_READ` | no | `GET /messages` per conversation per minute. Default **60**. |
| `VISITOR_SSE_MAX_CONN_PER_IP` | no | SSE connections per IP. Default **3**. |
| `VISITOR_SSE_TOTAL_CAP` | no | SSE connections in total. Default **2000**. |

All rate values fall back to the default when unset, unparseable, or `<= 0`. Rate limiting is
**fail-open**: if Redis is down, requests pass rather than being blocked.

> Note: the comment next to `LIVECHAT_RATE_READ` in `backend/.env.example` says the variable is not read
> yet. That comment is stale — the read limiter does read it. Trust the code (`ratelimit.go`).

### B2. nginx

Three exact-match locations matter. `location =` beats a regex location regardless of declaration order.

**`/widget.html`** — the iframe entry point, embedded on customer sites:

- `Cache-Control: no-cache` (entry point, must always be fresh);
- `Content-Security-Policy: frame-ancestors *;` — deliberately embeddable from any origin. Embedding is
  **not** restricted here; it is restricted at `POST /api/client/livechat/session` by the `Origin`
  allow-list;
- **do not** add `X-Frame-Options` here — `SAMEORIGIN`/`DENY` directly contradicts `frame-ancestors *`.

**`/widget.js`** — `Cache-Control: public, max-age=3600` (**1 hour, not `immutable`**): unlike Angular's
hash-named bundles this filename is stable, so a bad release must be revocable within an hour.
`Access-Control-Allow-Origin: *` is set for consistency (a `<script src>` doesn't need CORS, but a site may
`fetch` the version file alongside it).

**`/widget.version.json`** — `no-cache, no-store, must-revalidate`, else a version check reads the old
answer.

**`/api/client/livechat/sse`** — declared as an exact match so it is not swallowed by the `^~
/api/client/` block:

- `proxy_buffering off`, `proxy_cache off`, `chunked_transfer_encoding off`,
  `add_header X-Accel-Buffering no` — buffering destroys "realtime"; the backend also sends
  `X-Accel-Buffering: no` itself;
- `proxy_read_timeout 3600s` / `proxy_send_timeout 3600s` — the backend's heartbeat is every 25 s, so a
  low proxy timeout only produces spurious reconnects;
- **no `limit_req`** — this is one long-lived connection, not a REST call; per-visitor/IP limiting is done
  in the application (`LIVECHAT_RATE_*`);
- `proxy_http_version 1.1` comes from `proxy_params`; declaring it again in the same context is an nginx
  configuration error.

Reference: `host/nginx/srv-103.155.161.54/app.cluvixsolutions.com.conf` in the Cluvix monorepo.

### B3. Service worker

The Angular app registers a service worker. `widget.html` loaded in an iframe is a `navigate` request, so
without an exception the SW would answer it with the SPA's `index.html` and the visitor would see the
Angular router's "page not found" **inside the chat panel**.

The exception is `NON_SPA_EXACT = ['/widget.html']` in `frontend/src/custom-ngsw-worker.js`. When
changing that file, keep the entry. Any browser that installed an older SW keeps serving from it until the
new SW activates — see
[Troubleshooting: panel shows "page not found"](./TROUBLESHOOTING.md#panel-shows-page-not-found).

### B4. Deploy / sync the widget

The Cluvix monorepo consumes **build output**, never source, through one script:

```bash
scripts/sync_widget.sh v1.3.4      # download release assets, verify SHA256SUMS, write into public/
scripts/sync_widget.sh --local     # build from frontend/widget — development only
```

It writes exactly three files and nothing else: `public/widget.js`, `public/widget.html`, and
`public/widget.version.json` (`{version, sha256_js, sha256_html, synced_at}`). A checksum mismatch aborts
before anything is copied. `--local` stamps the version as `local-<git sha>` — never ship that as a
release.

`WIDGET_REPO` overrides the GitHub repo (default `cluvix/livechat`).

Verify after deploying:

```bash
# 1. the version file the site advertises
curl -s https://YOUR_HOST/widget.version.json

# 2. widget.js is served, cached for an hour, and CORS-open
curl -sI https://YOUR_HOST/widget.js | grep -iE 'HTTP/|cache-control|access-control-allow-origin'

# 3. widget.html is embeddable and not cached
curl -sI https://YOUR_HOST/widget.html | grep -iE 'HTTP/|cache-control|content-security-policy|x-frame-options'
#    expect: frame-ancestors *   and NO X-Frame-Options line

# 4. the deployed bytes match what the version file recorded
curl -s https://YOUR_HOST/widget.js | shasum -a 256

# 5. handshake from an allowed origin (replace both values)
curl -s -X POST https://YOUR_HOST/api/client/livechat/session \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://ALLOWED_ORIGIN' \
  -d '{"site_key":"YOUR_SITE_KEY"}' | head -c 400

# 6. the same request from a disallowed origin must be a generic 403
curl -s -X POST https://YOUR_HOST/api/client/livechat/session \
  -H 'Content-Type: application/json' -H 'Origin: https://not-allowed.example' \
  -d '{"site_key":"YOUR_SITE_KEY"}'
```

### B5. Rollback

1. Re-run the sync with the previous tag: `scripts/sync_widget.sh v1.3.3`.
2. Confirm `public/widget.version.json` shows the old version and the checksums changed.
3. Because `widget.js` is cached for up to an hour at the edge and in browsers, expect up to **1 hour**
   before every visitor is back on the old bundle. `widget.html` is `no-cache`, so it flips immediately.
4. Both files must move **together** — the loader and the app share `src/shared/` (the postMessage
   protocol and the type shapes). Never mix `widget.js` from one release with `widget.html` from another.

There is no backend rollback needed for a widget-only rollback: every field the widget reads is optional
on both sides (see below).

### B6. Upgrading — widget ↔ backend compatibility

The contract is **additive**. Every field introduced after 1.0.0 is optional on the wire, and both sides
degrade instead of failing:

- a **newer widget against an older backend** sees the field missing and applies its documented default;
- an **older widget against a newer backend** ignores fields it does not know.

| Widget version | Backend capability it consumes | Behaviour when the backend does not provide it |
|---|---|---|
| 1.0.0 | `POST /session` (`site_key`, `Origin` allow-list, `identity`), `/message`, `/messages`, `/typing`, `/sse`, `/campaigns`, `/campaigns/:id/trigger`; `widget_theme` `primary_color`/`position`/`greeting_text`/`offline_text`/`launcher_label`/`logo_url`/`brand_name`/`subtitle`; `pre_chat_form` `enabled`/`require_name`/`require_phone`/`require_message` | Baseline — these endpoints are required. |
| 1.1.0 – 1.1.1 | none beyond 1.0.0 (UI-only changes) | — |
| 1.2.0 | `widget_theme.locale`, `pre_chat_form.phone_region` | Locale falls back to `<html lang>` → `navigator.language` → `vi`; phone validation falls back to `VN`. |
| 1.3.0 | `widget_theme.color_scheme`, `launcher_offset_x`, `launcher_offset_y` | `auto` (follows the visitor's OS) and `20 px` offsets. |
| 1.3.1 – 1.3.4 | none beyond 1.3.0 (fixes and internal refactors) | — |

Two behaviours are worth confirming exist on the backend before relying on them, because the widget's
handling of them is not a fallback but an optimisation: the SSE `:ping` heartbeat and the `expired` event.
Without `expired`, the widget still recovers from an expired JWT — it just waits for two consecutive
connection errors instead of reacting immediately.

To build the upgrade note for a specific jump, read [CHANGELOG.md](../CHANGELOG.md) between the two tags:
`### Added` entries name the new config fields (all optional), `### Security` and `### Fixed` entries tell
you what a visitor will notice.

---

## Go-live checklist

1. `JWT_LIVECHAT_KEY` and `EMR_CONFIG_ENCRYPTION_KEY` set in the backend environment.
2. `TRUSTED_PROXIES` set — otherwise every per-IP protection is off (check the startup warning).
3. `PUBLIC_BASE_URL` set to the real backend origin, and the create/update response reports
   `snippet_host_source: "public_base_url"`.
4. nginx: `/widget.html` (`no-cache` + `frame-ancestors *`, no `X-Frame-Options`), `/widget.js`
   (`max-age=3600`), `/widget.version.json` (`no-cache`), `/api/client/livechat/sse` (exact match, no
   buffering, 3600 s timeouts, no `limit_req`).
5. `NON_SPA_EXACT` in the service worker still contains `/widget.html`.
6. `scripts/sync_widget.sh <tag>` run against a real release tag; `public/widget.version.json` matches the
   checksums served in production.
7. Site created with the correct `allowed_origins` — every hostname visitors actually see, `https` only
   (except `localhost` in development).
8. The snippet is on the customer page before `</body>`, with `data-site-key` and `data-host` filled in,
   and the customer's CSP `script-src` allows the widget host.
9. Smoke test from the real site: launcher appears → open → send a message → it arrives in the Omnichat
   inbox → the staff reply appears within seconds without a reload.
10. Identity (if used): partner computes the hash server-side, `secret_last4` matches, and `mandatory` is
    only enabled after the partner's pages reliably emit the identity.

---

## See also

- [How it works](./HOW_IT_WORKS.md) — the flow these settings control.
- [Troubleshooting](./TROUBLESHOOTING.md) — when the checklist passes but it still doesn't work.
- [Campaigns](./CAMPAIGNS.md) — proactive messages.
- [SUPPORT.md](../SUPPORT.md) — where to ask.
