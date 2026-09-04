---
name: Bug report
about: The widget behaves incorrectly
title: ''
labels: bug
assignees: ''
---

<!--
Before filing: docs/TROUBLESHOOTING.md covers the common symptoms (widget not appearing, 403 on the
handshake, "page not found" inside the panel, no realtime, 429, logo/locale/dark-mode issues) with a
concrete check for each. If one of those matches, the fix is probably already there.

NEVER paste secrets: no identity_secret, no visitor_jwt, no SSE ?token= value, no identifier_hash,
no real visitor names / phone numbers / message contents. Redact them.
-->

## What happened

<!-- What you saw. Include the exact on-screen text if the widget showed an error state. -->

## What you expected

## Steps to reproduce

1.
2.
3.

<!-- A minimal page that reproduces it is the single most useful thing you can provide. -->

## Widget version

<!-- curl -s https://YOUR_HOST/widget.version.json — paste the whole object.
     If you build from source, give the git commit instead. -->

```json

```

## Environment

- **Browser + version:**
- **OS + version:**
- **Reproduces in another browser?**
- **Reproduces in a private window?**
- **`widget.js` origin vs `data-host`:** <!-- same origin, or a separate CDN? -->
- **Reverse proxy in front of the backend?**
- **Service worker registered on that origin?** <!-- DevTools → Application → Service Workers.
      Did the failing request show "(from ServiceWorker)"? -->

## Embed snippet

<!-- Mask the site key. Keep the attributes you actually use. -->

```html
<script src="https://YOUR_HOST/widget.js" data-site-key="xxxx…" data-host="https://YOUR_HOST" async></script>
```

## Configuration

<!-- Values from the Cluvix admin that could be involved — remove anything secret. -->

- `widget_theme` (locale, color_scheme, primary_color, position, logo_url…):
- `pre_chat_form` (enabled, require_*, phone_region):
- Identity verification: enabled? mandatory?
- Campaigns involved?

## Console output

<!-- Anything prefixed [cluvix-livechat], plus CSP violations.
     Check BOTH contexts: the host page, and the iframe (DevTools → Console → frame selector → widget.html). -->

```

```

## Network / SSE

<!-- Rows for /api/client/livechat/*: status + the response envelope's "code" and "message".
     For realtime issues, the EventStream tab contents.
     Redact visitor_jwt and the ?token= value. -->

```

```
