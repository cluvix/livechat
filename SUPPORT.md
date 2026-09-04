# Support

Thanks for using the Cluvix Livechat Widget. Before opening anything, the docs usually have the answer:

| I want to… | Read |
|---|---|
| Embed the widget, know the data attributes and the API contract | [README.md](./README.md) |
| Understand what actually happens end to end | [docs/HOW_IT_WORKS.md](./docs/HOW_IT_WORKS.md) |
| Create/configure a site, deploy, roll back | [docs/OPERATIONS.md](./docs/OPERATIONS.md) |
| Fix a concrete symptom | [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) |
| Configure proactive messages | [docs/CAMPAIGNS.md](./docs/CAMPAIGNS.md) |
| Contribute code | [CONTRIBUTING.md](./CONTRIBUTING.md) |

## Where to ask

- **Bug in the widget** — open a [GitHub issue](https://github.com/cluvix/livechat/issues) using the
  **Bug report** template.
- **Integration question** ("how do I…", "is X supported") — open an issue using the
  **Integration question** template. If GitHub Discussions is enabled on the repository, prefer it for
  open-ended questions; issues are for things with a definite answer or a fix.
- **Security vulnerability** — **do not** open a public issue. Follow [SECURITY.md](./SECURITY.md).
- **Your Cluvix account, billing, a specific conversation, or staff-side inbox behaviour** — this is the
  wrong place; contact Cluvix support through your usual channel.

## What we support here

**In scope** — this repository is the client-side widget: the `widget.js` loader and the `widget.html`
app.

- The launcher, panel, pre-chat form, message list, campaign preview, theming, dark mode, accessibility.
- The `data-*` attributes, `window.cluvixChat`, and the `cluvix-chat:*` events.
- The `postMessage` protocol between loader and iframe.
- The widget's use of the `/api/client/livechat/*` endpoints — including "the widget mishandles this
  response".
- Documentation in this repository.

**Out of scope here** — the Cluvix backend and admin app live in a separate, private repository.

- Creating or configuring a site, campaigns, identity secrets, staff permissions, the Omnichat inbox.
- Server deployment (nginx, environment variables, the service worker) — though
  [docs/OPERATIONS.md](./docs/OPERATIONS.md) documents what the widget needs from them, and a
  documentation error there is in scope.
- Backend behaviour you can only observe through this widget's API surface is a grey area: a report is
  still welcome and useful, we just may have to fix it elsewhere and only tell you it's done.

We can't debug a live production site for you, and we can't access your logs — so the more of the
information below you include, the faster this goes.

## What to include

Copy this into the issue and fill it in:

1. **Widget version.** From the deployment: `curl -s https://YOUR_HOST/widget.version.json` — paste the
   whole object (`version`, `sha256_js`, `sha256_html`, `synced_at`). If you build from source, the git
   commit instead.
2. **Host.** Is `widget.js` served from the same origin as `data-host`, or from a separate CDN? Is there a
   reverse proxy in front? (Redact real hostnames if you must, but keep the *shape*: same-origin vs
   cross-origin, https vs http.)
3. **Browser and OS**, including exact version, and whether it reproduces in another browser and in a
   private window.
4. **Console output.** Anything prefixed `[cluvix-livechat]`, plus CSP violations and errors from the
   **iframe's** console context (DevTools → Console → frame selector → `widget.html`) — the two contexts
   log different things.
5. **Network log.** The relevant rows for `/api/client/livechat/*`: status, the response envelope's `code`
   and `message`, and for SSE issues the *EventStream* tab contents.
   **Redact `visitor_jwt`, the `?token=` query value, and `identifier_hash`** — never paste them into a
   public issue.
6. **Service worker.** DevTools → Application → Service Workers: is one registered on that origin? Did the
   failing request show *(from ServiceWorker)*? (This is the usual cause of the panel showing a
   "page not found".)
7. **Configuration that matters**, with secrets removed: the script tag (`data-site-key` masked),
   `widget_theme` and `pre_chat_form` values, whether identity is enabled/mandatory, and whether campaigns
   are in play.
8. **Steps to reproduce**, what you expected, and what happened. A minimal page that reproduces it is the
   single most useful thing you can provide.

**Never include** in a public issue: the `identity_secret`, a `visitor_jwt`, an SSE `?token=`, an
`identifier_hash`, or real visitor personal data (names, phone numbers, message contents).

## Response expectations

This is maintained alongside a commercial product; issues are triaged as time allows, and there is no SLA
on GitHub. Security reports are prioritised — see [SECURITY.md](./SECURITY.md) for that path. Only the
latest published `1.x` release receives fixes.
