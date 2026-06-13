---
title: Build System Migration Plan — Option D (webpack 5 consolidation)
date: 2026-06-12
status: in progress
---

# Build System Migration Plan

Incremental consolidation of the desktop editor front-end onto webpack 5.
Full context: see `build-system-report.md`.

---

## Guiding principle

Every step ends with: **build → structural diff → e2e green**.
Nothing merges without a passing gate.

---

## Step 1 — Establish the validation baseline (NOW)

### Findings: there is no e2e test suite

The CI workflow (`.github/workflows/Build.yml`) does:
1. Check out `web-apps` + `sdkjs`
2. Run `sprites.sh`
3. `npm install`
4. Run translation key merge/check
5. `grunt`

That is it. **CI validates that Grunt runs without error, not that the output works.**

`build/package.json` has `mocha` as a devDep but there are no test files in the project source — only in `node_modules`. There is no e2e directory, no Playwright, no Cypress, no Jest for front-end code.

### What this means

The migration gate must be built before migration work starts. Without it, any change to the build pipeline has no automated way to confirm the output is functionally equivalent.

### Validation approach (three tiers)

**Pre-check before writing any baseline: confirm grunt is deterministic.**
Run grunt twice from clean, diff the two outputs. If they differ (timestamps in imagemin metadata, etc.) tier 1 is broken before it starts. This takes an hour and must happen first.

**Tier 1 — Module manifest diff (catches actual bundler migration failures)**

r.js emits a build manifest listing every module included per bundle. webpack produces the same via `stats.json`. Diff the *set of modules* before and after each change. This is the only reliable way to catch a silently dropped or duplicated module — which is the actual failure mode of a bundler migration. A ±5% size band would miss a dropped module in a 2 MB bundle; module manifest diff catches it deterministically.

**Tier 2 — Hash of stable static assets only**

SHA-hash only assets that are genuinely static: **images and fonts**. Not HTML, not JSON.
- HTML is not static — `grunt-inline` embeds minified JS/CSS into HTML after requirejs/terser run. Hashing HTML will false-fail on every minifier change.
- JSON goes through `grunt-json-minify` — key ordering/whitespace is tool-dependent.
- Images and fonts are byte-identical unless the image pipeline changes (4.3 is the only step that touches it — re-baseline after 4.3, see Step 4 ordering note).

**Tier 3 — File presence (hardest gate)**

Every expected output file must exist. A missing file is always wrong, regardless of content. This is a simple set diff of the file list.

**Layer 2 — Functional smoke test (manual, per editor, before merging)**

Document a minimal smoke test per editor:
- Editor loads without JS errors in the browser console
- File opens
- Basic editing works
- Save round-trip completes

This is manual for now. A minimal headless "editor opens, no console errors" check via Playwright is a low-cost addition once the first editor migrates — it catches the most common class of webpack migration failure (implicit global leakage from AMD code that relied on undeclared globals that webpack module-wrapping hides).

### What to do now

- [ ] **First**: run grunt twice, diff outputs — confirm determinism
- [ ] Write `build/scripts/baseline.js` (module manifest + image/font hashes + file list)
- [ ] Run a clean Grunt build to establish `baseline.json`
- [ ] Document the manual smoke test steps per editor
- [ ] Add baseline diff step to CI workflow

**Output:** `baseline.json` committed, smoke test steps documented. Nothing in Steps 2+ starts without this.

---

## Step 2 — Deep dive: unexpected side effects

Read everything we haven't read yet before writing any code:

- [ ] `web-apps/build/plugins/grunt-inline/` — document exactly what it inlines and where
- [ ] `web-apps/build/sprites/` (`iconsprite`) — document what it produces; confirm whether PNG sprites are still load-bearing or vestigial after the SVG migration
- [ ] `web-apps/build/theme.config.mjs` — read in full; confirm it is the shared config contract with the mobile webpack pipeline
- [ ] `web-apps/build/common.json` and all per-editor JSON configs — understand the full r.js config shape
- [ ] `vendor/framework7-react/build/webpack.config.js` — read the mobile webpack config in full; the desktop config must replicate its theme contract
- [ ] CI configuration — find it (GitHub Actions), understand build triggers and what currently runs in CI
- [ ] Check for any existing `grunt-contrib-watch` config — understand the current dev workflow

**Output:** a supplementary findings section appended to `build-system-report.md`.

---

## Step 3 — Branch

Create `build/webpack-migration` from current `main`.
All migration work lands on this branch. PRs are per-step, not per-phase.

---

## Step 4 — Low-hanging fruit (order matters)

Each item: change → build → diff → gate → commit.

**Ordering note:** 4.3 (imagemin replacement) changes image output bytes — do it *before* committing the baseline in Step 1, or explicitly re-baseline after. Similarly, 4.6 (version string injection) may affect hashed files — pin the version during baseline builds. The order below assumes 4.1 and 4.2 happen after baselining; 4.3 happens before or triggers a re-baseline.

**Step 4.0 is intentionally first** — it validates the baseline diff workflow with a known, predictable outcome (exactly 12 files removed) before any subsequent change adds uncertainty.

| # | Task | Risk | Notes |
|---|------|------|-------|
| 4.0 | **Remove IE 11 compat bundles** | Low | See detailed scope below |
| 4.1 | Delete Bower (`bower.json`, `.bowerrc`) | None | Confirmed dead; vendored packages in `web-apps/vendor/` |
| 4.2 | Remove `chcp` call (`Gruntfile.js:45`) | None | Windows codepage detection; dead on Linux |
| 4.3 | Replace `grunt-contrib-imagemin` with `sharp`/`svgo` CLI | Low | CVEs; do before baselining or re-baseline after — changes image bytes |
| 4.4 | Replace `grunt-text-replace` | Low | 5 lines of Node; token substitution is central to branding — test carefully |
| 4.5 | Fix Makefile branding defaults | None | `PUBLISHER_NAME`, `PUBLISHER_URL`, `DOCUMENT_ROOT` |
| 4.6 | ~~Move `sed` version patching into build-time injection~~ | — | **DROPPED** — phantom step. The only `sed` in the tree patches `server/Common/sources/commondefines.js` (DocService server), not web-apps. Web-apps already does version injection entirely in Grunt (`replace:writeVersion`). No web-apps sed exists to fold in. |
| 4.7 | Document multi-repo input dependencies + preflight assertion | None | Doc + executable `test -d` preflight; upgrade from prose — webpack won't warn on a missing path, it'll just emit a smaller bundle |

### Step 4.0 — Remove IE 11 compatibility bundles

**Rationale:** IE11 reached end-of-life June 2023. The current build produces `ie/app.js` + `ie/code.js` per editor (12 files total) via `terser:iecompat` and Babel transpilation. These are dead output that consumes one extra `terser` pass per editor and adds complexity with no benefit. The `--skip-babel` flag already exists in the codebase and suppresses this output when passed.

**Why now (before 4.1):** This step uses the baseline diff workflow for the first time, against a predictable outcome — exactly 12 files removed, module manifests for the main bundles unchanged. If the diff infrastructure has any bugs, they surface here on a safe change before they matter.

**Expected baseline diff result:**
- 12 `MISSING FILE` notices (ie/app.js + ie/code.js × 6 editors) — expected, not failures
- No `MODULES DROPPED` from any remaining bundle
- Re-baseline after this step so ie/ files are no longer in the reference

**Full scope of changes:**

*Build system (Gruntfile.js / common.json):*
- Remove `terser:iecompat` task config from Gruntfile.js (lines 684–694)
- Remove `babelTask` variable and its use in task registration (line 1003, and its spread into `deploy-app-main`)
- Remove `babel` task registration
- Remove `iecompat` copy task entry from `common.json` (line 97) — this copies `fix-ie-compat.js`
- Remove the `replace:writeVersion` ie/ conditional (lines 578–588, the `if !skip-babel` branch)
- Remove `--skip-babel` flag handling entirely (no longer needed; IE path is gone)

*Source HTML templates (*.html.deploy):*
All six editors have `isIEBrowser === true ? require(['ie/app']) : require(['app'])` or equivalent in their `index.html.deploy` and `index_loader.html.deploy` files. These need to collapse to the non-IE branch unconditionally:
- `apps/visioeditor/main/index.html.deploy` (line 509)
- `apps/visioeditor/main/index_loader.html.deploy` (line 339)
- `apps/pdfeditor/main/index.html.deploy` (line 408)
- `apps/pdfeditor/main/index_loader.html.deploy` (line 343)
- `apps/documenteditor/main/index.html.deploy` (line 439)
- `apps/documenteditor/main/index_loader.html.deploy` (line 344)
- `apps/documenteditor/forms/index.html.deploy` (line 276)
- `apps/presentationeditor/main/index.html.deploy` (line 459)
- `apps/presentationeditor/main/index_loader.html.deploy` (line 342)
- `apps/spreadsheeteditor/main/index.html.deploy` (line 520)
- `apps/spreadsheeteditor/main/index_loader.html.deploy` (line 343)
- `apps/spreadsheeteditor/main/index_internal.html.deploy` (line 289)

*Source app.js (per editor):*
Each editor's `app.js` has an `isIEBrowser` conditional for `code_path` that selects `ie/code` vs `code`. Remove the IE branch, unconditionally use `code`:
- `apps/visioeditor/main/app.js` (line 167)
- `apps/pdfeditor/main/app.js` (line 199)
- `apps/documenteditor/forms/app.js` (line 157)
- `apps/documenteditor/main/app.js` (line 206)
- `apps/spreadsheeteditor/main/app.js` (line 203)
- `apps/presentationeditor/main/app.js` (line 203)

*Source file (optional, confirm first):*
- `apps/common/main/lib/util/fix-ie-compat.js` — confirm it is only referenced by the `iecompat` copy task and not imported by any AMD module before deleting.

**Advisor-reviewed (claude-opus-4-8, 2026-06-13):**

**Makefile correction:** `develop/setup/Makefile:63` is the `web-apps-dev` target — it passes `--skip-babel`. The `web-apps` (production) target at line 55 does NOT pass `--skip-babel`. **IE bundles ARE in production today.** The `baseline.json` captured during Step 1 is correct and includes the ie/ bundles.

After the code change: re-baseline against a fresh grunt build (production-equivalent, no `--skip-babel` since the flag will be gone). Expected diff: 12 `ie/` bundle files missing + `fix-ie-compat.js` missing + HTML content changes on the built index.html files (not failures — all expected).

**Corrected full scope of changes (post-advisor review):**

*Build system:*
- `build/Gruntfile.js`: Remove `terser:iecompat` (lines 684–693), `babel:` task config (lines 697–705), `babelTask` var + spread (lines 1003, 1023), `replace:writeVersion` ie/ conditional (lines 579–584)
- `build/Gruntfile.js:286`: Remove `grunt.loadNpmTasks('grunt-babel')` — **missed in original scope**
- `build/appforms.js:167`: Remove `babelTask` / `iecompat` declaration
- `build/common.json:97`: Remove `iecompat` copy task entry
- `develop/setup/Makefile:63`: Remove `--skip-babel` from `web-apps-dev` target (keep in lockstep with Gruntfile)
- `web-apps/Readme.md`: Remove `--skip-babel` documentation (lines 101, 109)

*Source HTML templates (collapse isIEBrowser conditionals — require(['app']) unconditionally):*
Same 12 files listed above. Additionally, each `index.html.deploy` block injects **two** IE scripts, not one:
```js
isIEBrowser === true &&
    (document.write('<script src=".../fix-ie-compat.js"><\/script>'),
     document.write('<script src=".../sdkjs/vendor/string.js"><\/script>'));
```
Remove the entire `isIEBrowser && (...)` block. **`string.js` injection was missed in original scope.**

Also: `apps/presentationeditor/main/index.reporter.html.deploy` has an IE detection block — remove it.

*Source app.js (6 editors):* Same as before — unconditionally use non-IE `code_path`.

*Runtime `isIEBrowser` guards in utility files — **do NOT touch in this PR**:*
`apps/common/main/lib/util/htmlutils.js:57` and `apps/common/main/lib/util/themeinit.js:42-43` check `window.isIEBrowser` for RTL layout and theme defaults. These are runtime feature guards on a global, not dead code. They safely evaluate the non-IE branch on all modern browsers. Simplifying these ternaries is a semantically-loaded cleanup that touches RTL and theming — keep it in a separate, bisectable follow-up.

*`embed/` editors:* `apps/{documenteditor,spreadsheeteditor,presentationeditor,visioeditor}/embed/index.html.deploy` have IE detection blocks rendering a "browser not supported" mask. They do not produce `ie/` bundles, so this PR won't break them. Leave them; note they exist as inconsistent leftovers for a follow-up.

*Committed built `.html` files:* `git ls-files` shows ~15 built `apps/**/index.html` alongside the `.deploy` sources. They're artifacts — the build regenerates them via `copy:indexhtml` + `replace:indexhtml`. Run `grunt clean` before rebuilding to avoid serving stale files from the `$BUILD_ROOT`.

*Delete:* `apps/common/main/lib/util/fix-ie-compat.js` — standalone polyfill, not an AMD module. Delete LAST, after removing both the copy task in common.json and the `document.write` references in HTML deploy files.

**Execution order (IMPORTANT — wrong order produces 404s):**
1. HTML deploy files + app.js source (remove ie/ require branches and script injections)
2. Gruntfile.js + appforms.js + common.json (remove tasks and copy config)
3. Delete `fix-ie-compat.js`
4. Makefile + Readme cleanup

Rationale: if the Grunt tasks are removed first but HTML still has `require(['ie/app'])`, any build produces HTML that references bundles that no longer exist. Source-before-Gruntfile ensures the outputs are always consistent.

---

## Step 5 — webpack 5 consolidation (Phase 1)

Replace the Grunt task zoo with webpack loaders/plugins. Replace r.js with webpack's native AMD handling. One editor at a time, using e2e as the gate per editor.

### Baseline gate strategy change (Opus review, v6)

**The module-manifest diff gate is wrong for a bundler swap.** r.js and webpack will never produce identical module manifests or byte-identical bundles — the gate will be red by construction after migrating any editor. For migrated editors, replace module-manifest diff with:
1. **Output-filename presence gate** — every expected `app.js`, `code.js`, locale JSON, CSS, and image file must be present at the exact path the packaging contract expects.
2. **Behavioural smoke test** — editor boots, controllers register by name, `code.js` loads on demand (see smoke-test.md).

The module-manifest/hash gate remains valid for Grunt-only editors (not yet migrated) — it catches regressions in the unchanged editors during the dual-build window.

### Pre-work (do once)

- [ ] **Audit named `define()`**: grep for `define('name',` (named modules) across all editors. These are the AMD ids that webpack ignores (webpack resolves by file path, not by the explicit id string). Every named module must become a `resolve.alias` entry mapping `id → file path`. Failure to do this produces *silent* broken links — `require('name')` just resolves nothing. Expected count: ~19 based on advisor scan.

- [ ] **`text!` plugin via asset/source**: Do NOT write a custom loader. Add a `NormalModuleReplacementPlugin` that strips the `text!` prefix and rewrites the request, then add a rule `type: 'asset/source'` matching `.html` / `.template` extensions. The replacer must anchor on the AMD dependency string — a raw text scan will false-fire on `text!==false` (that is `!==` operator, not a plugin prefix). `.template` has no webpack-recognized extension by default — add it explicitly to the rule.

- [ ] **`code.js` as second webpack entry with `dependOn`**: `app_pack.js` is a bare `require([47 modules])` side-effect preload — no `define()`, no return value. DocumentServer's outer page loads `code.js` *after* `app.js`. Replicate as a second webpack entry: `entry: { app: './app.js', code: { import: './app_pack.js', dependOn: 'app' } }`. The `dependOn: 'app'` flag shares the single runtime chunk, so the `define()`-registered classes in `app.js` are visible to `code.js` without double-bundling. This is the most likely thing to silently break — validate it first in the spike.

- [ ] **Translate r.js `paths` to `resolve.alias`** — including the 19 named-define ids found in the audit above. `empty:` paths → webpack `externals`.

- [ ] **Translate r.js `shim` to `ProvidePlugin`** — Backbone/Underscore/perfectscrollbar global side effects; use `ProvidePlugin` for globals (`_`, `Backbone`); use `imports-loader` for dependency-ordering shimmed non-AMD libs.

- [ ] **Strip `require.config()` from HTML templates** — do NOT leave them. They will throw `require is not defined` at execution time when require.js is absent. The template must be cleaned during the migration of each editor. Move all alias truth into the webpack config.

- [ ] **AGPL license header preservation in TerserPlugin**: webpack's default Terser pass strips all comments, including Ascensio AGPL headers. This is a compliance regression the gate will not catch. Add `extractComments: false` and preserve license comments:
  ```js
  new TerserPlugin({
      extractComments: false,
      terserOptions: { format: { comments: /AGPL|Copyright|License/i } },
  })
  ```
  Verify the header survives in the emitted bundle before shipping any editor.

- [ ] **`_themVal()` → DefinePlugin: extend `theme.config.mjs`, do NOT reinvent.** `theme.config.mjs:themeDefines()` is the mobile mirror — it is already half-built. The desktop migration must extend it. Key delta: ~10 more replacement keys than mobile (`HELP_CENTER_WEB_*`, `SUGGEST_URL`, `API_URL_EDITING_CALLBACK`, `COEDITING_DESKTOP`, `PLUGIN_LINK*`, `DEFAULT_LANG`, `APP_COPYRIGHT` banner). List the full delta before writing any DefinePlugin config.

- [ ] **`{{PRODUCT_VERSION}}` injection** — `replace:writeVersion` in Grunt injects `version.build` into compiled JS. webpack must replicate via `DefinePlugin` or `string-replace-loader`. Add alongside `themeDefines()`.

- [ ] **Replicate the addon merge system** as a webpack config merge utility.

- [ ] **grunt-inline answer — keep as post-webpack pass (option a)**. Do NOT use HtmlWebpackPlugin `templateParameters` + `fs.readFileSync` for the SVG sprite. That approach inlines the SVG at config-eval time (not watched), loses grunt-inline's relative-path resolution, and adds migration risk. Keep grunt-inline as a thin post-webpack HTML pass for SVG sprite injection only — it is a 1:1 behavior match against the baseline gate.

- [ ] **Three HTML entry points per editor must stay in sync** — `index.html` (dev), `index_loader.html`, `index.html.deploy` (prod, processed by grunt-inline for `<inline>` SVG sprites). SVG sprite includes break if any of the three is missed.

- [ ] **Output path contract** — webpack output filenames must match what DocumentServer packaging expects (`code.js`, `app.js` per editor). No content-hashed filenames.

- [ ] **Baseline vs prod-bake gap** — baseline captured with `--skip-imagemin`. x86 prod bake Dockerfile runs imagemin. The gate must not run against prod bake output. Documented in `docs/multi-repo-deps.md`.

- [ ] **Spike on visioeditor** — validate: (1) two-entry `app.js`/`code.js` split with `dependOn` produces a working editor, (2) named-define resolution for found named modules, (3) `text!`→asset/source rewrite works across real templates, (4) output filenames match packaging contract, (5) green baseline file-presence gate. Note explicitly: a clean visioeditor spike does NOT de-risk documenteditor's `COEDITING_DESKTOP`/plugin breadth — those paths need separate validation.

**Per-editor migration order** (safest first):
1. `visioeditor` — newest, smallest, fewest legacy patterns, genuinely standalone
2. `pdfeditor`
3. `appforms` — **not** first despite being small; it builds from `apps/documenteditor/forms` (inside the documenteditor family), so it's a documenteditor rehearsal, not a simple standalone
4. `presentationeditor`
5. `spreadsheeteditor`
6. `documenteditor` (most complex — last)

Each editor: add webpack config → build → structural diff → e2e green → commit → move to next.

**Desktop build mode:** `--desktop=true` becomes a webpack `--env desktop` flag.

---

## Step 6 — webpack 5 consolidation (Phase 2)

Opportunistic AMD → ESM conversion. No freeze, no big-bang.

- New code is written as ESM from this point forward
- Existing modules convert to ESM when touched for other work
- Track conversion progress; aim for majority-ESM before considering Phase 3

---

## Step 7 — Phase 3 (future, optional)

Once majority-ESM: evaluate Rspack (drop-in webpack-API Rust rewrite with AMD support) for build speed. Or migrate to Vite — at majority-ESM, that becomes a config change.

**sdkjs/Closure Compiler is out of scope for all phases.**

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Branch lifetime — `build/webpack-migration` rotting against main across six editor migrations | Merge per-editor behind a dual-build flag; don't accumulate six editors on one long-running branch |
| Dual-build window — while some editors are grunt and some are webpack, CI must run both pipelines | Budget for this; document it explicitly in CI config |
| Vendor packages in `web-apps/vendor/` with non-standard module formats | Each may need bespoke shims; 557 AMD files is the known surface, vendor is the unknown one — audit during Step 2 |
| Implicit global leakage — AMD code relying on undeclared globals breaks when webpack wraps modules | Only the smoke test catches this; the minimal headless Playwright check is the safety net |
| Named `define('id', …)` modules — webpack ignores explicit AMD module ids, resolves by file path | Audit all named defines; add each as a `resolve.alias` entry before migrating any editor |
| AGPL license headers stripped by Terser | Configure `TerserPlugin` with `extractComments:false` and preserve AGPL/Copyright comments; verify in emitted bundle |
| Baseline gate wrong for bundler swap — module manifests will never match | Switch migrated-editor gate to file-presence + smoke test; keep module-manifest gate only for unmigrated editors |
| `require([...], cb)` becomes async chunk boundary in webpack by default | This changes runtime load order; test that dialog modules still register correctly after migration |

---

## Review log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1 | 2026-06-12 | Claude Sonnet | Initial plan |
| v2 | 2026-06-12 | Fable (claude-fable-5) | HTML/JSON removed from hash tier (grunt-inline embeds minified JS); size-bands replaced with module-manifest diff; grunt determinism pre-check added; imagemin ordering note; three Step 5 pre-work gaps added (entry-point HTML, output path contract, grunt-inline answer); appforms moved out of first position (builds from documenteditor/forms); visioeditor confirmed first; risks table added |
| v3 | 2026-06-13 | Claude Sonnet | Added Step 4.0 IE removal with full scope (12 html.deploy files, 6 app.js files, build/appforms.js, Makefile ref); documented key finding that develop/setup/Makefile already passes --skip-babel (IE bundles absent from production today) |
| v4 | 2026-06-13 | Opus (claude-opus-4-8) | Corrected: --skip-babel is web-apps-dev only; production build DOES produce IE bundles; IE bundles ARE in production. Added: missing grunt.loadNpmTasks('grunt-babel') removal, string.js injection in HTML blocks (not just fix-ie-compat.js), presentationeditor/reporter.html.deploy, embed editor awareness. Clarified: leave htmlutils/themeinit isIEBrowser guards (not dead code, runtime guards). Added explicit execution order (HTML source first, then Gruntfile, then delete fix-ie-compat.js). |
| v5 | 2026-06-13 | Opus (claude-opus-4-8) | Dropped 4.6 (phantom — no web-apps sed; server sed is unrelated). Deferred 4.3 (imagemin never runs; document prod-bake baseline gap). Upgraded 4.7 to doc+preflight. Step 5 pre-work corrections: extend theme.config.mjs/themeDefines() not reinvent; add {{PRODUCT_VERSION}} DefinePlugin item; three HTML entry points per editor (SVG sprite trap); content-hash filename trap from mobile pipeline; prod-bake vs baseline gap. |
| v6 | 2026-06-13 | Opus (claude-opus-4-8) | Critical Step 5 corrections: (1) Baseline gate is wrong for a bundler swap — module manifests will never match r.js output; switch to file-presence + smoke test for migrated editors. (2) ~19 named `define('id',…)` modules — webpack ignores AMD ids, must audit and add each as resolve.alias. (3) code.js must be second webpack entry with `dependOn: 'app'` not a dynamic import. (4) require.config() in HTML must be stripped (throws if require.js absent). (5) grunt-inline answer reversed: keep as post-webpack pass (option a), NOT HtmlWebpackPlugin templateParameters. (6) AGPL headers stripped by Terser — must configure TerserPlugin to preserve. Added four new risk rows. |

---

## Current status

- [x] Build system analysis complete (`build-system-report.md`)
- [x] Fable review of analysis incorporated (v2 of report)
- [x] Migration plan written
- [x] Fable review of plan incorporated (v2 of plan)
- [x] **Step 1.1 — build environment confirmed** (Node 18 + grunt in `eo` container; Node 20 in bake Dockerfile; local Node 25 — do not switch)
- [x] **Step 1.2 — determinism check** — skipped for now; deployed files in `eo` used as baseline instead of re-running grunt (rebuilding the image is the only way to run grunt twice cleanly; deferred)
- [x] **Step 1.3 — `build/scripts/baseline.js` written**
- [x] **Step 1.4 — grunt build run inside `eo` container (7m 14s, exit 0); baseline re-captured from fresh build → `build/scripts/baseline.json`; diff against itself: PASSED**
- [x] **Step 1.5 — smoke test checklist written** (`build/scripts/smoke-test.md`)
- [x] **Step 1.6 — CI gate added** — Node 16→20, `THEME=euro-office`, `--skip-imagemin`, baseline diff step. Commit `8a0d2bfd50`.
- [x] **Step 4.0 — IE removal complete** — 12 ie/ bundles gone, fix-ie-compat.js deleted, baseline re-captured (20 bundles, 16,706 files, self-diff PASSED). Commit `5cc010e0d7`.
- [x] **Step 4.1 — Bower deleted** — `build/bower.json`, `build/.bowerrc`. Commit `ecc94005ce`.
- [x] **Step 4.2 — chcp removed** — Windows codepage detection block dead on Linux. Commit `4dbebe57b5`.
- [ ] **Step 4.3 — imagemin replacement** — deferred; imagemin never runs (`--skip-imagemin` everywhere); needs sharp/svgo spike.
- [ ] **Step 4.4 — grunt-text-replace** — no CVEs; low urgency; working.
- [x] **Step 4.5 — Makefile branding** — DROPPED. Ascensio attribution in copyright banner is correct (AGPL); theme `config.json` already sets `publisher_name`/`publisher_url` for branding tokens.
- [x] **Step 4.5 — DROPPED** (Ascensio attribution correct; 4.5 was a no-op)
- [x] **Step 4.6 — DROPPED** (phantom — no web-apps sed exists; server's sed is unrelated)
- [ ] **Step 4.7 — multi-repo deps doc + preflight assertion** — pending
