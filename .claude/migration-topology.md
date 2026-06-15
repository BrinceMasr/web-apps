# Migration topology — build/webpack-migration branch

Artifacts introduced by the migration work on this branch, as distinct from pre-existing repo content.
Use this file to orient quickly at the start of a session without re-reading git log.

---

## Files added by the migration

### webpack configs
| File | Commit | Status |
|------|--------|--------|
| `build/webpack.documenteditor.mjs` | `a82a79a1ef` | runtime-validated in browser |
| `build/webpack.spreadsheeteditor.mjs` | `a82a79a1ef` | build-validated; deployed to eo container |
| `build/webpack.presentationeditor.mjs` | `a82a79a1ef` | build-validated; deployed to eo container |
| `build/webpack.visioeditor.mjs` | `a82a79a1ef` | build-validated |
| `build/webpack.pdfeditor.mjs` | `a82a79a1ef` | runtime-validated; PRODUCT_VERSION mismatch was root cause of skeleton UI (see findings) |
| `build/webpack.forms.mjs` | `034096236a` | Phase C — forms editor via `editorConfig('documenteditor', {subpath:'forms'})` |
| `build/webpack.editor.factory.mjs` | `a82a79a1ef`, extended `034096236a` | Shared factory: `editorConfig(editorName, opts={})`. `opts.subpath` (default `main`) and `opts.lessEntry` support forms. Adds `themeFormVars()` to LESS globals when `subpath === 'forms'`. |

### Build scripts
| File | Commit | Notes |
|------|--------|-------|
| `build/scripts/inline-svgs.js` | earlier | **permanent infrastructure** — replaces grunt-inline's `<inline src="..."/>` SVG injection. Globs `*.html` in each editor's main BUILD_ROOT dir. Run after grunt, before webpack in CI and Makefile. Hard-fails on missing SVGs or zero substitutions. |
| `build/scripts/deploy-theme-images.js` | `72c711da4f` | Phase A — replaces grunt `deploy-theme-images`. Copies `theme/{THEME}/assets/img/**` to common + each editor mobile dir. Conditionally copies embed logo. Soft-skips if theme img dir absent. |
| `build/scripts/deploy-embed.js` | `af958d16e1` | Phase B — replaces grunt `embed-app-init` for doc, spreadsheet, presentation, visio (NOT pdf). Steps: clean → terser concat+minify JS → less.render CSS → copy locale + HTML → `@@SRC_ROOT@@` replace → inline `?__inline=true` scripts → rm img dir. Added `less` dep to `build/package.json`. |
| `build/scripts/deploy-common.js` | this session | **Gap 2** — replaces 14 grunt common.json deploy tasks: sdk (sdkjs-assets copy), api (copy + `{{PRODUCT_VERSION}}` token replace), apps-common (alphabetletters/themes/help/images/SVGs), jquery, megapixel, socketio, xregexp, underscore, iscroll, fetch, es6-promise, requirejs (terser minify), common-embed, monaco. Images copied without imagemin/svgmin optimisation. Add to CI/Makefile in Phase E. |
| `build/scripts/baseline.js` | `6633d584`, extended `d22a89a3` | **MIGRATION TOOL — remove at completion.** Build-output snapshot/diff. `--scan-tokens` scans .js/.css for unreplaced `{{TOKEN}}` strings. |
| `build/scripts/baseline.json` | `24f9a049` | **MIGRATION TOOL — remove at completion.** Baseline snapshot from grunt build. |
| `build/scripts/perf-report.js` | `4d2c76da17` | **MIGRATION TOOL — remove at completion.** Captures build time, asset sizes, module counts. |

### Documentation (untracked — not committed per project convention)
| File | Notes |
|------|-------|
| `migration-plan.md` | full step-by-step plan with advisor review log |
| `grunt-removal-plan.md` | Phase A–E plan with advisor review; status table, gap analysis |

---

## Files modified by the migration

### CI — `.github/workflows/build.yml`
Full pipeline (current state):
1. Checkout + Node 20 setup
2. `sprites.sh`
3. `npm install`
4. Translation merge
5. `grunt --skip-imagemin`
6. `node scripts/inline-svgs.js`
7. `THEME=euro-office node scripts/deploy-theme-images.js` — Phase A
8. `node scripts/deploy-embed.js` — Phase B
9. Mobile build — 4 editors in parallel (`TARGET_EDITOR={word,cell,slide,visio} node build/build.js`) — Phase D
10. webpack — 6 configs in parallel (doc, spreadsheet, presentation, visio, pdf, forms) — Phase C adds forms

### Build system
- `build/theme.config.mjs` — `themeReplacements()`, `themeDefines()`, `themeGlobalVars()`, `themeFormVars()` (added Phase C — uses absolute source paths for LESS `data-uri()` at compile time; reads `forms_logo_light`/`forms_logo_dark` from theme meta).
- `build/package.json` — added webpack 5 deps, string-replace-loader 3.3.0, `less ^4.2.0` (Phase B).
- `build/Gruntfile.js` — IE removal (Step 4.0), chcp removal (Step 4.2), sdkjs preflight assertion (Step 4.7).
- `build/common.json` — removed iecompat copy task.

### Source HTML templates
Phase D-era additions — webpack require pre-config (`var require = {baseUrl, paths, shim}`) added to all active editors' `index.html.deploy` and `index_loader.html.deploy`. Forms `index.html.deploy` also updated: CSS ref changed from `app-all.css` → `app.css` (grunt output vs webpack output naming).

### Makefile — DocumentServer repo (`build/makefile-webpack-product-version` branch)
Commit `e5b09e3` adds to both `web-apps` and `web-apps-dev` targets (after grunt):
1. `BUILD_ROOT=$(EO_ROOT) node scripts/inline-svgs.js`
2. `BUILD_ROOT=$(EO_ROOT) THEME=euro-office node scripts/deploy-theme-images.js`
3. `BUILD_ROOT=$(EO_ROOT) node scripts/deploy-embed.js`
4. Mobile subshell: `npm install` then 4 parallel `node build/build.js` (one per editor)
5. webpack block extended with `webpack.forms.mjs`

---

## Container setup notes

- DocumentServer repo is mounted at `/develop` inside the `eo` container (`EO_DEV=/develop`).
- `DocumentServer/develop/setup/Makefile` → `/develop/develop/setup/Makefile` (double-develop is correct, not a typo).
- `docker-compose.yml` bind-mounts `./setup/Makefile:/Makefile` so `make web-apps-dev` works from `/` in the container.
- **macOS Docker Desktop gotcha**: switching git branches replaces the bind-mounted file on disk (new inode). The container's `/Makefile` mount goes stale — `ls /Makefile` → "No such file or directory" but `find` still lists it (the mount entry exists, the file content is inaccessible). Fix: `docker compose restart eo` to re-establish the mount.

---

## CI status (as of 2026-06-15)

All steps pass on self-hosted runner. Confirmed clean via `make web-apps-dev` in eo container:
- grunt: all editors (doc, spreadsheet, presentation, pdf, visio) — ~5m (sequential)
- inline-svgs: 11 HTML files, 108 substitutions — <1s
- deploy-theme-images: embed logo + common/mobile images — <1s
- deploy-embed: 4 editors — ~2s
- mobile: 4 editors in parallel — ~50s (npm install cached after first run)
- webpack: 6 configs in parallel — doc 30s, spreadsheet 31s, presentation 28s, visio 18s, pdf 27s, forms 14s

During transition, mobile builds twice: once via grunt's `exec:webpack_app_build` (sequential), once via our new parallel block. Both produce identical output. The duplicate run disappears in Phase E when grunt's mobile task is removed.

---

## Human testing notes

- **Service worker aggressively caches** — always test in incognito or hard-reset SW in devtools. Two `app.js` versions in devtools = SW cache conflict.
- **Identifying the active build** — In devtools, `app.js` line 1 shows `Version: X.Y.Z (build:N)`. Webpack local builds show `build:0` unless `BUILD_NUMBER` is set.
- **Forms webpack test** — open a PDF fillable form in Nextcloud. Forms toolbar should appear; check iframe console for errors. `this.view` undefined guard: pre-existing upstream bug in `FormsTab.getView()` when plain PDF opened (not form-creator mode); SDK error handler catches it.

---

## Known gaps blocking Phase E (grunt removal)

| Gap | Script | Replaces | Status |
|-----|--------|---------|--------|
| **Gap 2** | `build/scripts/deploy-common.js` | 14 grunt sub-tasks: vendor scripts, API, SDK assets, apps-common HTML copy | **written** — add to CI/Makefile in Phase E |
| **Gap 1** | `build/scripts/deploy-html.js` | `deploy-app-main`: `*.html.deploy` → `.html`, `@@SRC_ROOT@@` + `{{TOKEN}}` replacement | pending |

Both must be done before Phase E. Order: Gap 2 first (vendor copy is a prerequisite for the editors to boot), then Gap 1.

## Phase E checklist (do not start until Gap 1 + Gap 2 done and CI-green)

1. `git rm build/Gruntfile.js`
2. `git rm build/appforms.js`
3. Remove grunt + grunt-plugin devDeps from `build/package.json`
4. Assess `build/*.json` configs — keep if webpack references them, delete if grunt-only
5. Remove grunt step from `.github/workflows/build.yml`
6. Remove grunt call from Makefile (DocumentServer repo)
7. `npm install` in `build/` to update `package-lock.json`
8. Full CI run — must be green
9. Smoke test all 6 editors in eo container

## Parked / known non-blocking issues

| Issue | Notes |
|-------|-------|
| `dark-logo_s.svg` / `warnings_s.svg` 404 | CSS relative path resolves to wrong depth — pre-existing or webpack output path difference |
| `themes_thumbnail@2x.png` 404 | `sdkjs/common/Images/` — outside web-apps scope |
| Transitions.js icon panel blank | `btn-transition-*` icons — CSS class template not updated for SVG migration |
| `data-uri()` skip warnings | LESS reads image files at compile time; paths not resolved in container — pre-existing |
| `mangle: false` revisit | Safe default; inflates bundle vs grunt. Revisit: `mangle: {keep_classnames:true, keep_fnames:true}` |
| `{{TOKEN}}` scan as webpack plugin | Currently in `baseline.js` (migration tool). Fold into build before `baseline.js` deleted |
| Consolidate planning docs | `grunt-removal-plan.md` + `migration-plan.md` → update `.claude/` at Phase E completion, then delete |
