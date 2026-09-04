---
name: Integration question
about: "How do I…?" / "Is X supported?" while embedding the widget
title: ''
labels: question
assignees: ''
---

<!--
Please check the docs first — they are written for exactly this:

  README.md                  embedding, data attributes, public JS API, API contract, HMAC recipes
  docs/HOW_IT_WORKS.md       end-to-end flow, postMessage protocol, storage, limits, locale/theme
  docs/OPERATIONS.md         creating a site, allowed_origins rules, environment, nginx, deploy
  docs/TROUBLESHOOTING.md    symptom → cause → check → fix
  docs/CAMPAIGNS.md          proactive messages
  SUPPORT.md                 what is in scope here vs. what belongs to Cluvix support

Scope reminder: this repository is the client-side widget. Questions about your Cluvix account, billing,
a specific conversation, staff permissions, or the Omnichat inbox belong with Cluvix support, not here.

NEVER paste secrets: no identity_secret, no visitor_jwt, no SSE ?token= value, no identifier_hash,
no real visitor personal data.
-->

## Question

## What I'm trying to achieve

<!-- The end goal, not just the immediate blocker — there is often a simpler path. -->

## What I've tried

<!-- Including which doc sections you already read, so we don't send you back to them. -->

## Setup

- **Widget version:** <!-- curl -s https://YOUR_HOST/widget.version.json -->
- **How the widget is embedded:** <!-- script tag, with the site key masked -->
- **`widget.js` origin vs `data-host`:** <!-- same origin, or a separate CDN? -->
- **Host site stack:** <!-- plain HTML, Next.js, WordPress, an SPA router… -->
- **Identity verification:** <!-- not used / enabled / mandatory -->
- **Relevant configuration:** <!-- widget_theme, pre_chat_form, campaigns — secrets removed -->

## Anything in the console?

```

```
