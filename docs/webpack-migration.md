# webpack migration reference

Grunt + r.js replaced by webpack 5 + Node.js scripts across all desktop editors.
Branch: `build/webpack-migration`. Merged: 2026-06-15.

---

## What changed

**Before**: Grunt orchestrated everything — AMD bundling via r.js, asset copy, HTML processing, minification, theme substitution, sprite generation.

**After**: Six webpack configs (one per editor) handle JS/CSS bundling. Six Node.js scripts handle everything else. A parallel orchestrator (`build/scripts/build-pipeline.js`) replaces the sequential Makefile chain.

**CI time**: ~7 minutes → ~2 minutes (cold runner).

**Editors covered**: documenteditor, spreadsheeteditor, presentationeditor, visioeditor, pdfeditor, forms.

---

## Running the build

```bash
# In the eo container, from web-apps/build/
PRODUCT_VERSION=9.2.1 BUILD_ROOT=/var/www/onlyoffice/documentserver THEME=euro-office node scripts/build-pipeline.js

# Or via Makefile (DocumentServer repo)
make web-apps-dev
SKIP_MOBILE=1 make web-apps-dev   # skip ~90s mobile build when only touching desktop code
```

`PRODUCT_VERSION` is required and must match the SDK version (see gotcha #1 below).

---

## Pipeline overview

```
Phase 1 (all parallel):
  sprites.sh
  deploy-common       vendor scripts, API, SDK assets, apps-common HTML
  deploy-html         *.html.deploy → *.html, @@SRC_ROOT@@ substitution
  deploy-reporter     presentation reporter view minification
  deploy-theme-img    brand/theme image copy
  deploy-embed        embed API builds
  webpack ×6          JS + CSS bundles for each editor
  mobile ×4           framework7-react builds (word, cell, slide, visio)

Phase 2 (after Phase 1):
  deploy-resources    per-editor help, images, symboltable, watermark
  inline-svgs         replaces <inline src="...svg"/> and ?__inline=true in HTML
```

The ordering invariant: `deploy-html` must complete before `inline-svgs` runs. Never run `deploy-html` in isolation against a live `BUILD_ROOT` without following it with `inline-svgs` — you will get broken editors. See gotcha #5.

---

## Gotchas

These took significant debugging to find. Read before touching the build.

### 1. `PRODUCT_VERSION` must be ≥ 6

EuroOffice rejects editors reporting a version below 6. The fallback in `common.json` is `4.3.0`. Always set `PRODUCT_VERSION` explicitly. The pipeline will fail fast if it's missing or too low.

### 2. `mangle: false` is not optional

117 source files use `var Common = Common || {}` as a namespace guard. Webpack's module factory changes the scoping so the guard never fires — name mangling then silently breaks `Common.*` access across the entire editor. `mangle: false` in `webpack.editor.factory.mjs` is load-bearing. Do not remove it without first auditing all `var Common` patterns.

### 3. `locale.js` crashes webpack's AMD parser

The locale files use an AMD `define()` pattern that trips webpack's built-in AMD parser. Fixed with `string-replace-loader` rewriting the pattern before webpack sees it. Do not use `noParse` — it was tried and breaks more than it fixes.

### 4. `keymaster.js` UMD guard

`keymaster.js` uses `this` as the UMD global context. In webpack's strict-mode module scope, `this` is `undefined`. The guard never sets `window.key`. Fixed via an alias to a patched copy.

### 5. SVG sprites are baked into the HTML at build time

Deployed HTML comes from `index.html.deploy` (not `index.html`). It uses `<inline src="...svg"/>` tags that `inline-svgs.js` replaces with raw SVG content. The deployed page has no network requests for icon files — they are embedded. There is no SVGInjector at runtime. If you see `<img class="inline-svg">` in page source, you are looking at the un-built source file.

### 6. `deploy-html` + `inline-svgs` are a unit

Running `deploy-html.js` alone regenerates HTML from `.html.deploy` templates but leaves `?__inline=true` script tags as broken filesystem paths. This produces "Not supported version" / blank pages across all editors. Always run `inline-svgs.js` immediately after any `deploy-html.js` run.

### 7. `apps/common/` must be included in inline-svgs scope

The common `index.html` also has inline tags. If `inline-svgs.js` only covers editor dirs, the PDF viewer breaks (`listenApiMsg is not defined`) — a subtle failure with a non-obvious cause.

### 8. Service worker caches aggressively

Always test in incognito or disable the SW in DevTools → Application → Service Workers. Stale `app.js` from a previous build will persist invisibly. Two `app.js` entries in DevTools Sources = cache conflict.

### 9. `output.clean: false` is intentional

All six webpack configs share a single `BUILD_ROOT`. Setting `clean: true` would wipe sibling editors' output. Leave it false.

---

## Known issues (pre-existing, not caused by migration)

| Issue | Notes |
|-------|-------|
| `dark-logo_s.svg` / `warnings_s.svg` 404 | CSS path resolves to wrong depth — pre-existing in all editors |
| `themes_thumbnail@2x.png` 404 | In `sdkjs/common/Images/` — outside web-apps scope |
| Transitions panel icons blank | `btn-transition-*` CSS classes not updated for SVG sprite migration |
| `FormsTab.getView()` throws on plain PDF | Pre-existing OnlyOffice upstream bug — SDK error handler catches it |

---

## Tracked follow-ups

- [#106](https://github.com/Euro-Office/web-apps/issues/106) — Replace grunt-inline SVG/script embedding with cached external assets (duplicate copyright headers, no independent caching)
- [#107](https://github.com/Euro-Office/web-apps/issues/107) — Evaluate esbuild as TerserPlugin replacement for mobile builds

---

## Files added by the migration

| File | Purpose |
|------|---------|
| `build/webpack.{editor}.mjs` | Per-editor webpack config (6 files) |
| `build/webpack.editor.factory.mjs` | Shared config factory |
| `build/theme.config.mjs` | Brand token substitution — single source of truth |
| `build/scripts/build-pipeline.js` | Parallel build orchestrator |
| `build/scripts/deploy-common.js` | Vendor scripts, API, SDK assets, apps-common HTML |
| `build/scripts/deploy-html.js` | HTML template deployment |
| `build/scripts/inline-svgs.js` | Build-time SVG/script inlining |
| `build/scripts/deploy-resources.js` | Per-editor resource copy |
| `build/scripts/deploy-reporter.js` | Presentation reporter view |
| `build/scripts/deploy-theme-images.js` | Theme/brand images |
| `build/scripts/deploy-embed.js` | Embed API builds |
| `build/scripts/lib/build-utils.js` | Shared helpers |

---

*Developed with Claude Code (Anthropic) — AI-assisted analysis, debugging, and implementation.*
