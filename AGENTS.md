# web-apps — Euro-Office

@../AGENTS.md

Guidance for AI agents working in **web-apps** — the editor UIs and DocsAPI gateway for
Euro-Office Document Server. This is the canonical instruction file; `CLAUDE.md` points here.
For the sibling SDK, see `../sdkjs/AGENTS.md` (sibling repo in the dev workspace).

## What this repo is

The front-end of Euro-Office Document Server: the **desktop** and **mobile** editor UIs plus
`api.js`, the DocsAPI gateway that host integrations embed via `<script>`. Hard fork of
`ONLYOFFICE/web-apps`, rebranded to Euro-Office. Licensed **AGPL-3.0**.

Five desktop editors — **documenteditor**, **spreadsheeteditor**, **presentationeditor**,
**pdfeditor**, **visioeditor** (plus **appforms**, the document-editor forms variant). All
except **pdfeditor** also have a mobile front-end. The client-side document engine itself lives
in the sibling **sdkjs** repo and loads via `<script>`; it is not built here.

## Two build systems

web-apps has **two independent front-end build pipelines**. Get this wrong and nothing else
makes sense.

### Desktop — Backbone + AMD → RequireJS (r.js), via Grunt

- Desktop editor code is **Backbone** built on **AMD modules** (`define()` / `require()`) —
  hundreds of them. It is **not** plain-script concatenation, and it is **not** ES modules.
- Bundled per editor by the **r.js optimiser** (`grunt-contrib-requirejs`). The entry point and
  options live in **`build/<editor>.json`** (e.g. `build/documenteditor.json`), not in
  `Gruntfile.js`. r.js discovers files automatically via `findNestedDependencies: true` — there
  is **no** hand-maintained source array.
- Templates are loaded at runtime via the `requirejs-text` (`text!`) loader plugin.
- Symbols live on global `window` namespaces: `Common.*` (shared) plus one per editor —
  `DE` (documenteditor), `SSE` (spreadsheeteditor), `PE` (presentationeditor),
  `PDFE` (pdfeditor), `VE` (visioeditor). `Asc` / `AscCommon` come from sdkjs.

### Mobile — React + Framework7 → webpack 5

- Mobile editors are **React 19 + Framework7 8.x** (with MobX), ES modules / JSX, sources under
  `apps/<editor>/mobile/src/` (documenteditor, spreadsheeteditor, presentationeditor,
  visioeditor — **pdfeditor has no mobile front-end**).
- Built by **webpack 5** (`vendor/framework7-react/build/webpack.config.js`) with Babel,
  Terser, and Workbox (`workbox-webpack-plugin ^7.3.0`).

### Theme contract (shared by both)

`theme/<name>/meta/config.json` is the single source of truth for brand data — both pipelines
read from it. Desktop: the Grunt `deploy-theme` task uses `_themVal()` which resolves each
value with priority **env var > `config.json` > `''`** (empty value hides the element in
templates) → LESS variables + JS token replacement. Mobile: webpack imports `themeGlobalVars` /
`themeDefines` from `build/theme.config.mjs` → `DefinePlugin` + `less-loader` `globalVars`.
Don't duplicate brand tokens elsewhere — they all derive from `config.json`.

## Build & run

Builds run **inside the `eo` dev container**, never on the host, and you **never rebuild the
Docker image to test a change** — the repo is bind-mounted. For the full Docker dev-environment
setup (starting the container, healthcheck, Nextcloud connector), see the DocumentServer repo's
`AGENTS.md` — note this resolves only inside the DocumentServer dev workspace; a standalone
clone of web-apps has no parent file.

The in-container Makefile drives the web-apps build — it runs `npm ci` + grunt itself, so you
do not run those by hand:

```sh
docker compose exec -T eo make web-apps       # full build (installs npm deps; needed first time)
docker compose exec -T eo make web-apps-dev   # fast rebuild — skips npm install / babel / imagemin
```

Pass **`PRODUCT_VERSION`** (e.g. `PRODUCT_VERSION=9.3.0 make web-apps`) or `api.js` reports
`4.3.0` and Euro-Office rejects it. `SKIP_MOBILE=1` skips the mobile webpack pass (~40 s on a
warm rebuild).

## Gotchas

- **`translation/merge_and_check.py` rewrites locale JSON** on every `make web-apps` /
  `make web-apps-dev` run. The changes appear in `git status` on the host. Don't commit them
  unless you intentionally changed translation strings.
- **`deploy/` is build output** (gitignored) — anything written there is overwritten on the
  next build.
- **`api.js` resolves subresource paths relative to its own URL** (`apps/api/documents/api.js`).
  Serving it from an unexpected path or with a version prefix silently breaks editor loading —
  the host integration's `<script>` URL must match exactly.
- **Mobile and desktop are separate pipelines.** A change to `apps/common/` may need to be
  reflected in both `apps/common/main/` (desktop) and `apps/common/mobile/` (mobile).
- **The service worker caches aggressively.** Test mobile changes in incognito or hard-reset the
  SW in devtools — two `app.js` versions visible in devtools means a cache conflict.

## Rules

- **Never** run the build on the host — use `make` inside the `eo` container.
- **Never** rebuild the Docker image to test a change — the checkout is bind-mounted.
- **Never** edit files under `deploy/` — build output.
- **Never** commit locale JSON rewrites from `merge_and_check.py` unless you changed strings.
- **Never** use `npm install` in `build/` — use `npm ci` to respect the pinned lockfile.
- **Never** edit `vendor/` by hand — it is checked-in, not npm-managed.

## Findings

There is no committed findings store on `main` yet — a portable, cross-tool knowledge store is
proposed in [#108](https://github.com/Euro-Office/web-apps/issues/108). Until it lands, this
file is the only in-repo guidance.
