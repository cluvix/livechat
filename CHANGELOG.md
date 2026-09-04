# Changelog

All notable changes to this widget will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/cluvix/cluvix-livechat-widget/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/cluvix/cluvix-livechat-widget/releases/tag/v1.0.0
