# Contributing

Thanks for considering a contribution to the Cluvix Livechat Widget.

## Ground rules

- **No new runtime dependency.** The widget is deliberately vanilla TypeScript (no framework) to keep
  the bundle small (target ≤ 50 KB gzip for `widget.js` + `widget.html` combined, enforced by
  `npm run size`). devDependencies (build tooling, types) are fine; anything imported at runtime by
  `src/` is not, unless discussed first in an issue.
- **Keep the public contract stable.** `window.cluvixChat` (the JS API), the `cluvix-chat:*` events, the
  `data-*` attributes, and the `/api/client/livechat/*` request/response shapes documented in
  [README.md](./README.md) are what integrators build against. Breaking changes need a major version
  bump and a CHANGELOG entry explaining the migration.
- **Self-contained build output.** `widget.js` is a single IIFE, `widget.html` is a single self-contained
  HTML file (CSS/JS inlined) — no extra hashed asset files. Don't change the build to emit more than
  these two files without updating `scripts/size.mjs` and the docs.

## Setup

```bash
npm install
```

## Workflow

```bash
npm run type-check   # tsc --noEmit — must be clean before opening a PR
npm run build:widget # full build (type-check + loader + app)
npm run size          # gzip-size gate — must stay under the 50 KB budget printed by the script
npm run dev            # serves dev/ on http://localhost:5500 for manual testing against a real backend
```

There is no unit test runner configured in this package yet; manual verification through `dev/` against
a running backend is the current bar for a change that touches runtime behavior. If you add automated
tests, wire them into `npm run build:widget` (or a new `npm test` script) so CI catches regressions.

## Commit messages

Please use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`,
`chore:`, `refactor:`, …) — this keeps the CHANGELOG easy to derive and makes the history readable for
integrators who only care about a subset of changes.

## Before opening a PR

1. `npm run type-check` passes.
2. `npm run build:widget` passes.
3. `npm run size` passes (or you've explained in the PR why the budget needs to move, with the new
   numbers).
4. Update [CHANGELOG.md](./CHANGELOG.md) under `[Unreleased]` for any user-visible change.
5. Update [README.md](./README.md) + [README.vi.md](./README.vi.md) together — the Vietnamese README is
   a full translation, not a summary, so please keep both in sync.

## Working inside erp-cluvix

This repository is **also** a `git subtree` inside Cluvix's private monorepo, at `frontend/widget/`.
That directory and this repository must stay byte-identical — they are the same tree, synced in two
directions. Everything below concerns Cluvix maintainers working in the monorepo; outside
contributors can ignore it and work here as in any normal repo.

### Rule

> **Never change `frontend/widget/` in erp-cluvix without pushing the change back out through
> `git subtree push`.** A change that lands only in the monorepo is invisible to every external
> consumer and will be silently overwritten by the next `git subtree pull`.

If you cannot push right away (e.g. the change is entangled with private monorepo work), stop and
split the change instead — put the widget part in its own commit so it can be pushed on its own.

### Commands

All commands run **inside `frontend/`** (which is its own git repository, nested in erp-cluvix — it
is *not* a submodule, so `git status` at the erp-cluvix root does not show it):

```bash
# one-time: register the open-source repo as a remote
git -C frontend remote add widget-oss https://github.com/cluvix/livechat.git

# bring public changes (external PRs, releases) into the monorepo
git -C frontend subtree pull --prefix=widget widget-oss main --squash

# publish monorepo changes to the public repo
git -C frontend subtree push --prefix=widget widget-oss main
```

The `widget-oss` branch produced by `git -C frontend subtree split --prefix=widget -b widget-oss` is
kept around so subsequent pushes are incremental instead of re-walking the whole history.

### Build output

The Vite configs write to `../../public` by default — that is erp-cluvix's `public/` directory, which
is how the monorepo consumes the widget during development. Standalone builds (and CI) set
`WIDGET_OUT_DIR=dist` instead. Consequently:

- `npm run build:widget` from inside the monorepo **modifies `public/widget.js` and
  `public/widget.html` in erp-cluvix**. That is expected, but those files belong to the release flow
  (`scripts/sync_widget.sh` in erp-cluvix) — do not commit a locally-built pair as if it were a
  release.
- Released builds are pulled by tag: `scripts/sync_widget.sh v1.2.3` downloads the release assets,
  verifies `SHA256SUMS`, and records what landed in `public/widget.version.json`.

## Reporting a security issue

Do not open a public issue — see [SECURITY.md](./SECURITY.md).
