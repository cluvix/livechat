# Security Policy

## Reporting a vulnerability

<!-- TODO(cluvix): user chưa xác nhận địa chỉ email nhận báo lỗi bảo mật — dùng placeholder dưới đây,
     đổi lại đúng địa chỉ thật trước khi công khai repo. -->

Please **do not** open a public GitHub issue for a security vulnerability.

Instead, report it privately through either channel:

- Email **contact@cluvixsolutions.com** with a description of the issue, steps to reproduce, and (if
  possible) the affected version/commit.
- Or open a [GitHub private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
  on this repository, once it is public — this notifies maintainers without disclosing the issue
  publicly.

We aim to acknowledge new reports within a few business days and keep you updated as we work on a fix.
Please give us a reasonable amount of time to address the issue before any public disclosure.

## Scope

This repository is the client-side widget (`widget.js` loader + `widget.html` app). It talks to a
Cluvix backend over the public API documented in [README.md](./README.md#api-contract) — vulnerabilities
in that backend's implementation are in scope too, but note the backend itself lives in a separate,
private repository; a report about backend behavior observed through this widget's API surface is still
useful and welcome here.

## What's already accounted for (please still report, but read this first)

- **`site_key` is a public key, not a secret.** It is meant to be visible in page source — this is not
  a vulnerability by itself. The actual protection is the `Origin` allow-list configured per site, plus
  rate limiting.
- **No client-side secret ever exists.** `identity_secret` lives only on the partner's server and inside
  Cluvix's encrypted storage; the widget never receives or reads it. If you find a code path where the
  secret (rather than the derived hash) reaches the browser, that's a real, high-severity bug — please
  report it.
- **Generic 403 on every handshake failure.** `POST /session` intentionally returns the same error
  message whether the `site_key` doesn't exist, the site is disabled, the `Origin` is disallowed, or an
  `identity` hash is wrong — so the endpoint doesn't leak which case applies. This is by design, not a
  bug to report (unless you find a way the responses *do* differ in a way that leaks information, e.g.
  timing).
- **Rate limiting is fail-open.** If the rate-limit backend (Redis) is unavailable, requests are allowed
  through rather than blocked, to avoid taking the whole chat down. This is a deliberate availability
  trade-off.
- **Identity hashes don't expire in v2** (no `exp`/replay protection, unlike a JWT). This is a known,
  documented trade-off — see [README.md](./README.md#security-notes) — not something we need a report
  for, but a concrete way to exploit it (beyond "the secret leaked") is still useful information.

## Supported versions

Only the latest published `1.x` release is actively supported with security fixes.
