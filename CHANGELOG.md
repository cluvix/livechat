# Changelog

All notable changes to this widget will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/cluvix/livechat/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/cluvix/livechat/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/cluvix/livechat/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/cluvix/livechat/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/cluvix/livechat/releases/tag/v1.0.0
