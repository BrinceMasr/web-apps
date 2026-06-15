# Migration topology — build/webpack-migration branch

Artifacts introduced by the migration work on this branch, as distinct from pre-existing repo content.
Use this file to orient quickly at the start of a session without re-reading git log.

---

## Files added by the migration

### webpack configs (Step 5)
| File | Status | Notes |
|------|--------|-------|
| `build/webpack.visioeditor.js` | committed `59e0a5df` → fixed `511272702a` | spike; visioeditor not in Euro Office, build-validated only |
| `build/webpack.documenteditor.js` | committed `e9935cf7` | runtime-validated in browser |
| `build/webpack.spreadsheeteditor.js` | committed `c154957f` | build-validated; deployed to eo container |
| `build/webpack.presentationeditor.js` | committed `c154957f` | build-validated; deployed to eo container |

### Build scripts (Step 1 + Step 5)
**These are migration tools. They are NOT permanent project infrastructure and must be removed from the repo when migration is complete.**

| File | Status | Notes |
|------|--------|-------|
| `build/scripts/baseline.js` | committed `6633d584`, extended `d22a89a3` | **MIGRATION TOOL — remove at completion.** Build-output snapshot/diff. `--scan-tokens` mode added (`d22a89a3`): scans .js/.css output for unreplaced `{{TOKEN}}` strings. Run locally during migration, not in CI. |
| `build/scripts/baseline.json` | committed `24f9a049` | **MIGRATION TOOL — remove at completion.** Baseline snapshot from grunt build in eo container (post IE-removal). Used with `baseline.js --diff` locally. |
| `build/scripts/perf-report.js` | committed `4d2c76da17` | **MIGRATION TOOL — remove at completion.** Runs all four webpack configs, captures build time, asset sizes (raw + gzip), module counts. Outputs markdown. Usage: `node scripts/perf-report.js [--out file]` |
| `build/scripts/smoke-test.md` | **untracked** (removed from git `9c1a1eb8`) | Manual smoke-test checklist — kept locally only, already not in repo |

### Documentation (untracked — not committed per user instruction)
| File | Notes |
|------|-------|
| `migration-plan.md` | full step-by-step plan with advisor review log; removed from git `1266234d3` |
| `docs/` | build-system-report.md, multi-repo-deps.md, ADR, release-process-report — removed from git `9c1a1eb8`. `docs/multi-repo-deps.md` was subsequently re-added committed `dc7c2791a5` (it is repo content, not planning) |

---

## Files modified by the migration

### CI (Step 1)
- `.github/workflows/build.yml` — Node 16→20, `THEME=euro-office`, `--skip-imagemin` flag, baseline diff step added. Commit `8a0d2bfd50`.

### Build system (Step 4 cleanup + Step 5)
- `build/Gruntfile.js` — Step 4.0: IE removal (terser:iecompat, babel tasks, replace:writeVersion ie/ branch). Step 4.2: chcp removal. Step 4.7: sdkjs preflight assertion.
- `build/common.json` — Step 4.0: removed iecompat copy task entry.
- `build/package.json` — Step 5: added webpack deps (webpack, webpack-cli, css-loader, less-loader, mini-css-extract-plugin, terser-webpack-plugin, copy-webpack-plugin, **string-replace-loader 3.3.0** `36d3060d`).
- `build/theme.config.mjs` — Step 5: added `themeReplacements(productVersion)` export (`36d3060d`): 19-entry string-replace-loader 'multiple' array covering all `{{TOKEN}}` forms. Env var > config.json > stock default precedence, matching Gruntfile `_themVal`. Includes `{{HELP_CENTER_WEB_VE}}` (visioeditor-specific, absent from Gruntfile jsreplacements).
- `build/.bowerrc`, `build/bower.json` — Step 4.1: deleted.
- `docs/multi-repo-deps.md` — Step 4.7: added multi-repo input dependency documentation.

### Source HTML templates (Step 4.0 + Step 5)
Step 4.0 (IE removal — collapsed `isIEBrowser` conditionals and removed `document.write` IE script injections):
- `apps/documenteditor/main/index.html.deploy`
- `apps/documenteditor/main/index_loader.html.deploy`
- `apps/documenteditor/forms/index.html.deploy`
- `apps/spreadsheeteditor/main/index.html.deploy`
- `apps/spreadsheeteditor/main/index_loader.html.deploy`
- `apps/spreadsheeteditor/main/index_internal.html.deploy`
- `apps/presentationeditor/main/index.html.deploy`
- `apps/presentationeditor/main/index_loader.html.deploy`
- `apps/pdfeditor/main/index.html.deploy`
- `apps/pdfeditor/main/index_loader.html.deploy`
- `apps/visioeditor/main/index.html.deploy`
- `apps/visioeditor/main/index_loader.html.deploy` *(IE removal only — webpack pre-config NOT yet applied)*

Step 5 (webpack require pre-config — `var require = {baseUrl, paths, shim}` added so require.js can resolve AMD externals before factory runs):

`index.html.deploy` (all four):
- `apps/documenteditor/main/index.html.deploy` — commit `e9935cf7`
- `apps/spreadsheeteditor/main/index.html.deploy` — commit `c154957f`
- `apps/presentationeditor/main/index.html.deploy` — commit `c154957f`
- `apps/visioeditor/main/index.html.deploy` — commit `511272702a`

`index_loader.html.deploy` (three active editors — commit `b8ee169103`):
- `apps/documenteditor/main/index_loader.html.deploy` ✓
- `apps/spreadsheeteditor/main/index_loader.html.deploy` ✓
- `apps/presentationeditor/main/index_loader.html.deploy` ✓
- `apps/visioeditor/main/index_loader.html.deploy` — **pre-config NOT applied** (visioeditor not in Euro Office; IE removal only)

### Source app.js files (Step 4.0 — IE removal)
- `apps/documenteditor/main/app.js`
- `apps/documenteditor/forms/app.js`
- `apps/spreadsheeteditor/main/app.js`
- `apps/presentationeditor/main/app.js`
- `apps/pdfeditor/main/app.js`
- `apps/visioeditor/main/app.js`

### Deleted files
- `apps/common/main/lib/util/fix-ie-compat.js` — Step 4.0
- `build/.bowerrc` — Step 4.1
- `build/bower.json` — Step 4.1

---

## What mocha is doing here

`mocha` is listed in `build/package.json` devDependencies. There are **zero** `.test.js` / `.spec.js` files anywhere in the project. No `test` script entry exists in `package.json`. Mocha was there before the migration and is completely unused.

---

## CI status (as of 2026-06-14)

Both grunt and webpack steps pass on the self-hosted runner. Confirmed clean:
- grunt: all editors (doc, spreadsheet, presentation, pdf, visioeditor) — 3m 29s
- webpack: doc, spreadsheet, presentation in parallel — ~27s
- visioeditor is built by grunt (maintains parity with upstream); no webpack config for it in our step
- grunt also runs its own internal webpack per editor for mobile/framework7 builds (`exec:webpack_app_build`)
- Note: locale files are larger in CI than local because the translation merge step runs first in CI — correct behaviour

## Human testing notes

- **Service worker caches `app.js`** — OnlyOffice/EuroOffice ships its own legacy service worker (`document_editor_service_worker.js`) that aggressively caches editor assets. Testing a new webpack build without clearing the SW cache will silently serve an older build. Always test in a private/incognito window on first load, or hard-reset the service worker in devtools before testing. Two `app.js` versions visible in devtools = SW cache + fresh request conflict.
- **HMR on the full editor build is not practical** — the full AMD/requirejs/legacy service worker stack blocks the HMR websocket injection path. HMR has been achieved by isolating individual components outside the full editor harness (stubbing AMD dependencies, running in a minimal webpack-dev-server environment). Iterative testing of the full build requires a full rebuild and SW cache clear.
- **Identifying the active build** — In devtools, `app.js` line 1 shows `Version: X.Y.Z (build:N)`. The webpack build carries the `BUILD_NUMBER` from CI; a locally built `app.js` shows `build:0` unless `BUILD_NUMBER` is set.

## Known gaps (as of 2026-06-14)

- **grunt-inline SVG sprite injection** — still done by grunt; webpack output has data-uri "file not found" warnings because sprites aren't present at webpack build time. Needed before grunt can be fully retired for the three active editors.
- **pdfeditor webpack config** — `build/webpack.pdfeditor.mjs` added and runtime-validated (`app:ready` fires, code.js loads, document renders). PRODUCT_VERSION mismatch was the root cause of skeleton UI; see `findings/webpack5-pdfeditor-runtime-debug.md`. appforms config still deferred.
- **`mangle: false` revisit** — intentional safety choice now; inflates bundle size vs grunt baseline. Revisit after performance baseline is established.
- **Config triplication** — three webpack configs near-identical. Consider `webpack.editor.factory.mjs(editorName, sdkPath)`.
- **`baseline.js` --scan-tokens** — migration tool, run locally only. Must be removed from repo at migration completion.
- **`visioeditor/main/index_loader.html.deploy`** — webpack pre-config applied (commit `de927813df`). Visioeditor added to CI webpack step for parity.
- **Performance measurement** — `perf-report.js` captures webpack metrics. Grunt comparison requires a grunt-only deploy (run in eo container, then point script at that output). Webpack parallel wall-clock: ~3.2s vs grunt sequential: ~3m 30s.
- **`{{TOKEN}}` scan** — lives in migration-only `baseline.js`. Should be folded into the webpack build as a failing plugin before `baseline.js` is deleted, so the guarantee survives migration completion.
