# Changelog

All notable changes to this widget will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.4] - 2026-09-04

### Changed

- Internal refactor only — no behavior change. The public contract is untouched: CSS class names, ARIA
  attributes, every user-visible string, the `UiCallbacks` shape and every `WidgetUI` method `main.ts`
  calls are byte-identical, as is the XSS discipline (`textContent` / `escapeText` / `escapeAttr` /
  https-only image URLs).
- `src/app/ui.ts` (692 lines, a single ~550-line `WidgetUI` class) is now a ~190-line facade over
  `src/app/ui/`: `types.ts` (`UiCallbacks`, `CampaignPreviewCallbacks`, `RenderMsg`), `markup.ts`
  (escaping, https URL filter, SVG icons, the pre-chat `field()` builder, app CSS injection), `brand.ts`
  (brand name/initial, logo, image-error fallbacks, header and footer markup — pure functions taking
  `theme`/`strings`), `prechat.ts` (`PreChatView` + `isValidPhone`/`setInvalid`), `chat-list.ts`
  (`ChatList`: message state, grouping, bubbles, time/status line, retry button, typing indicator,
  `aria-live` region), `composer.ts` (`Composer` + `focusComposer`) and `preview.ts` (campaign
  compact-preview). `WidgetUI` keeps theming and screen assembly and delegates the rest.

## [1.3.3] - 2026-09-04

### Changed

- Internal refactor only — no behavior change. The public contract is untouched: `postMessage` protocol,
  `data-*` attributes, the `window.cluvixChat` JS API, CustomEvent names, CSS class names and every
  user-visible string are byte-identical.
- `src/loader.ts` (949 lines, a single ~700-line `start()` holding ~30 closures) is now a ~80-line
  assembly root over `src/loader/`: `bootstrap.ts` (data-attr parsing + validation), `state.ts` (one
  `LoaderState` object replacing the closure variables), `storage.ts`, `css.ts` (`shadowCss`,
  `badgeRingCss`, icon), `frame.ts` (Shadow DOM host, launcher, frame open/close animation,
  compact-preview, `visualViewport` fit, badge, focus), `session.ts` (handshake broker, resume-token
  storage, identity/`setUser`), `campaigns-bridge.ts` (campaign fetch/cache + URL tracking),
  `bridge.ts` (postMessage in/out + public CustomEvents) and `api.ts` (`window.cluvixChat` + call queue).
  The build output is still a single IIFE `widget.js` from the same `src/loader.ts` entry.

### Fixed

- The iframe app appended a duplicate `<style>` tag with the whole app CSS to `<head>` every time
  `WidgetUI` was constructed — i.e. on each `resetForNewConversation()`. It is now injected once
  (guarded by the `lc-app-css` element id).

## [1.3.2] - 2026-09-04

### Security

- The iframe app (`main.ts`) accepted any `postMessage` whose `event.source === window.parent`, without
  checking `event.origin` — a page embedding `widget.html` in its own (different) iframe could impersonate
  the loader. It now locks a `trustedOrigin` from the first valid message's `event.origin` and rejects any
  later message from a different origin; outgoing `postMessage` calls never use `'*'` — before an origin is
  known, only the initial `ready` handshake is allowed a `document.referrer`-derived guess, and is skipped
  entirely when there is no referrer.
- `visitor_token` no longer sits in `localStorage` indefinitely. Sites with `pre_chat_form.enabled` now
  store it in `sessionStorage` (per-tab — a shared computer no longer resumes a previous visitor's medical
  conversation); sites without pre-chat keep `localStorage` but the entry now expires after 30 days. The
  iframe's own "pre-chat done" flag (`cluvix_lc_prechat_*`) follows the same rule.
- `sse.ts` now reacts to the backend's `expired` SSE event (sent right before it closes the connection on
  JWT expiry) by re-handshaking immediately, instead of waiting for two consecutive `onerror` failures. The
  backend's periodic `:ping` heartbeat comment needs no handling — `EventSource` ignores it per spec.

## [1.3.1] - 2026-09-04

### Fixed
- Composer/pre-chat placeholders had no explicit colour and inherited black text colour, unreadable in
  dark mode; now always `--lc-muted` (`opacity:1` — Firefox otherwise dims placeholders further).
- Truncated brand name and subtitle in the header had no way to read the full text; both now carry a
  `title` tooltip when non-empty.
- The campaign compact-preview body was a `<div onclick>` — a dead click target for keyboard users and
  invisible to assistive tech. It is now a real `<button>` (reset to look unstyled), keeps its own
  `aria-label` (sender + message, truncated to 80 chars), and the dismiss `×` stays a separate button.
- Header had no visual separation from the message list on plain flat brand colours; added a 1px bottom
  line (`--lc-header-line`, theme-aware for dark mode).

### Changed
- Launcher pill grew from 52px to 56px tall with a softer two-layer shadow (was one flat shadow); the
  compact-preview offset above it grew from 72px to 76px to match.

## [1.3.0] - 2026-09-04

### Added
- Dark mode. Every neutral colour of the panel is a CSS custom property (`--lc-bg`, `--lc-surface`,
  `--lc-surface-2`, `--lc-text`, `--lc-muted`, `--lc-line`, `--lc-in-bg`, `--lc-danger`) with a dark
  palette applied from `prefers-color-scheme` — the widget follows the visitor's operating system with no
  configuration. New `widget_theme.color_scheme` (`auto` | `light` | `dark`, default `auto`) forces one
  mode; the muted colour was checked to 6.5:1 on the dark message surface (AA needs 4.5:1). The launcher
  panel no longer flashes a white frame before the iframe paints, and the unread badge ring follows the
  scheme instead of being hardcoded white.
- `widget_theme.launcher_offset_x` / `launcher_offset_y` (px, default 20, clamped 0..200): distance from
  the launcher to the screen edges. The panel (desktop) and the campaign preview follow the same offsets.

### Fixed
- Pre-chat validation no longer shifts the layout: the error line always reserves its row and only toggles
  `visibility` (was `display:none`). Each input now points at its error with `aria-describedby`, carries
  `aria-invalid`, and the error line is a `role="alert"`.
- iOS keyboard no longer covers the composer: while the panel is open on a phone, it is pinned to
  `window.visualViewport` (height + offsetTop) and released on close. Desktop and the compact campaign
  preview are untouched.
- iOS no longer zooms the page when an input is focused: inputs and the composer are 16px on phones
  (14px from 481px up, matching the loader's mobile breakpoint). The composer grows to 120px (was 96px).
- Notched phones: the header, composer, footer and launcher respect `env(safe-area-inset-*)`, so nothing
  hides behind the home indicator or the status bar.
- Typing/loading dots stop animating under `prefers-reduced-motion: reduce` (they stay visible, dimmed).
- A logo (or campaign avatar) that fails to load is replaced by the brand/sender initial at the same size
  instead of leaving a broken image. Campaign avatars now go through the same https-only check as
  `logo_url`.

## [1.2.0] - 2026-09-04

### Fixed
- Footer no longer glues its text to the link ("Powered byCluvixHealth"): the flex layout that turned the text node and the `<a>` into two flex items is gone.
- Text on the brand colour is now chosen with real WCAG relative luminance instead of the YIQ approximation, which mis-judged saturated colours (white on `#1677ff` was 4.1:1, below AA).
- Screen readers no longer re-read the whole conversation on every incoming message: `aria-live` moved off the message log (rebuilt from scratch on each render) onto a dedicated visually-hidden live region that announces only the new message.
- Keyboard/focus around open & close: the launcher exposes `aria-expanded`/`aria-haspopup="dialog"`, the panel is a labelled `role="dialog"`, opening moves focus into the panel (and into the composer), closing returns focus to the launcher, and `Escape` closes the panel from both the host page and inside the iframe.
- The "failed · tap to retry" line is a real `<button>` (was a `<div>`, unreachable by keyboard) and is now the single retry target — the failed bubble no longer captures clicks. Status/time lines were bumped to 12px and the muted colour darkened to `#565f6b` for AA on the message background.

### Added
- `widget_theme.locale` (`vi` | `en`) and full English strings. Locale is resolved as `widget_theme.locale` → host page `<html lang>` → `navigator.language` → `vi`, decided by the loader and passed to the iframe with the session; message times follow the locale.
- `pre_chat_form.phone_region` (`VN` | `INTL`): `VN` (default) accepts a Vietnamese mobile number or E.164, `INTL` accepts E.164 only — international visitors are no longer rejected.
- README/README.vi: a "Theme & localization" section documenting every theme and pre-chat field, the automatic contrast rule, and the locale order.

### Changed
- Every surface painted with the brand colour (header, visitor bubble, send button, primary button, launcher, campaign avatar) now uses an auto-darkened `--lc-primary-strong` with a computed `--lc-on-primary` instead of hardcoded white text; the unread badge moved to `#dc2626` (4.83:1 with white).
- Dead launcher CSS from before the panel replaced the launcher on open (the "collapse to a circle" rules and the close icon inside the launcher) removed.

## [1.1.1] - 2026-09-04

### Changed
- The chat panel now opens in place of the launcher (launcher hidden while open, shown again after closing with the header X) instead of floating above it. Campaign compact-preview keeps floating above the launcher.

## [1.1.0] - 2026-09-04

### Changed
- Launcher is now a pill with a text label (default "Tư vấn", configurable via `widget_theme.launcher_label`) instead of an icon-only circle; collapses to the round close button while the panel is open.
- Send status ("Đang gửi…", "Gửi lỗi · chạm để thử lại") moved out of the visitor bubble to a small line below it; "Đã gửi" is merged into the group time line. Text inside the primary-colour bubble was hard to read.

### Added
- README: HMAC identity examples for C#/.NET and Java (same test vector, Java verified on JDK 24).
- Open-source release preparation: README (EN/VI), LICENSE, SECURITY, CONTRIBUTING, dev demo, package
  metadata for standalone `npm install`.

## [1.0.0]

Full v2 rewrite of the widget — a new UI, brand customization, self-host support, and identity
verification.

### Added

- New vanilla-TS UI (`src/app`): pre-chat form, message list, composer, header with logo/brand/subtitle,
  online/offline indicator, proactive-campaign preview (compact bubble).
- Theming: `primary_color`, `position` (left/right), `greeting_text`, `offline_text`,
  `launcher_label`, `logo_url`, `brand_name`, `subtitle` — configurable from the Cluvix admin.
- `data-host`: decouples the origin serving `widget.js` from the backend origin (`/api/*` +
  `widget.html`), enabling CDN-hosted loaders and clearer self-hosting.
- Public JS API on `window.cluvixChat`: `open()`, `close()`, `toggle()`, `setUser()`, `on()`/`off()`.
- Public `CustomEvent`s on `window`: `cluvix-chat:ready|opened|closed|message`.
- Identity verification (HMAC-SHA256, server-signed): `data-user-id` / `data-user-hash` /
  `data-user-name` / `data-user-phone` / `data-user-email` attributes, `setUser()` for post-load
  identity, and a matching `identity` field on `POST /session`. Authenticated conversations resume
  across devices/browsers by identifier.
- Proactive campaigns: URL-pattern + time-on-page matching, cached list, compact preview bubble.
- Open/close animation (scale + fade, respects `prefers-reduced-motion`).
- Unread badge, SSE-based realtime (`connected`, `new_message`, `staff_typing`).

### Changed

- Widget bundle rebuilt from scratch (previous version's markup/CSS/behavior fully replaced).

### Security

- Handshake failures (bad site, disallowed origin, identity mismatch) all return one generic error —
  no oracle for enumerating valid `site_key`s or identities.
- Identity is kept in memory only, never persisted to `localStorage`.
- Per-IP rate limiting on `/session`; per-visitor and per-IP rate limiting on `/message`.

[Unreleased]: https://github.com/cluvix/livechat/compare/v1.3.4...HEAD
[1.3.4]: https://github.com/cluvix/livechat/compare/v1.3.3...v1.3.4
[1.3.3]: https://github.com/cluvix/livechat/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/cluvix/livechat/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/cluvix/livechat/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/cluvix/livechat/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/cluvix/livechat/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/cluvix/livechat/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/cluvix/livechat/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/cluvix/livechat/releases/tag/v1.0.0
