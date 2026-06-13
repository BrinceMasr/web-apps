---
title: Build System Analysis — Euro Office / DocumentServer web-apps
date: 2026-06-12
scope: web-apps/build + server/Gruntfile + sdkjs/Makefile + server/Makefile
purpose: Understand the current Grunt-based pipeline with a view to replacement
reviewed_by: Fable (claude-fable-5), 2026-06-12
---

# Build System Analysis

## Executive Summary

The build system is a **multi-layer Make → Grunt pipeline** inherited from OnlyOffice. It is functional but composed of tooling that is 10–12 years old at its core. Several components are deprecated or unmaintained. The biggest obstacle to replacement is **AMD/RequireJS** — the entire desktop editor front-end is written with AMD `define()`/`require()` syntax. However, two key facts narrow the options considerably: (1) the **mobile editors already run on webpack 5**, which the team already operates and maintains; and (2) **sdkjs uses Google Closure Compiler**, not r.js — it sits outside the bundler migration scope entirely. The recommended path is incremental consolidation of the desktop front-end onto webpack 5, which supports AMD natively and already shares a theme contract with the mobile pipeline.

---

## Layer Map

```
develop/Makefile          ← dev environment (Docker Compose) — not production build
    │
build/Makefile            ← Vagrant test VMs only — not part of daily build
    │
sdkjs/Makefile            ← builds sdkjs layer (word/sdk-all.js etc.)
    │   └── sdkjs/build/  → grunt → Google Closure Compiler  ← CLOSURE, NOT r.js
    │
server/Makefile           ← builds Node.js server layer
    │   └── server/       → npm install → grunt
    │
web-apps/build/           ← builds desktop editor front-ends (AMD/Backbone)
    │   └── Gruntfile.js  → r.js per-editor component builds
    │
vendor/framework7-react/  ← mobile editor front-ends — webpack 5 + React
        └── build/webpack.config.js
```

**Output target:** `../build_tools/out/<linux_64|win_64>/onlyoffice/documentserver/`  
Note: `../build_tools/` is an *output path convention* only — nothing is read from it as an input. The real input dependencies are: `../core/` (built, provides allfontsgen/allthemesgen binaries), `../dictionaries/`, `../document-templates/`, `../core-fonts/`.

---

## What Each Layer Does

### `develop/Makefile` — Development Environment

Not part of the production build. Orchestrates Docker Compose for local development:

| Target | Purpose |
|--------|---------|
| `make local` | Start containers, wait for NC + EO ready, align URLs |
| `make mobile` | Same but injects detected LAN IP for Android/physical devices |
| `make next` | Test against NC master or a specific stable branch |
| `make build` | Rebuild the EO Docker image via `buildx bake develop` |
| `make refresh-urls` | Re-align `DocumentServerUrl` and `trusted_domains` after IP change |
| `make wipe-nc` | Drop the NC data volume for a clean install |

Notable: `refresh-urls` polls both the EO healthcheck and `occ config:app:get eurooffice DocumentServerUrl` in a loop before applying config — handles first-boot timing correctly.

---

### `sdkjs/Makefile` — SDK JavaScript Layer

Builds the core document rendering engine JS (sdkjs). Calls Grunt from `sdkjs/build/`.

**Key fact: sdkjs uses Google Closure Compiler (`google-closure-compiler@20240317.0.0`), not r.js.** The code is global-namespace JS concatenated and compiled through Closure, likely relying on externs and Closure-specific optimization semantics. This is an entirely different risk universe from UI bundling.

Key output: `word/sdk-all.js` (and equivalents for spreadsheet/presentation).

Has a `desktop` target (`sdkjs/Makefile:54-55`) that passes `--desktop=true` to Grunt. The `--desktop` flag flips a copy task variant in `web-apps/build/Gruntfile.js:997-998` — the desktop-critical path is mostly Closure compilation + file copying. This is less risky than it initially appears.

**Migration boundary: sdkjs/Closure is out of scope for the bundler migration. It must not be touched.**

---

### `server/Makefile` — Node.js Server Layer

Builds and assembles the Node.js server components. Key details:

**Branding env vars (overridable, but defaults still reference OnlyOffice):**
```makefile
PRODUCT_VERSION   ?= 0.0.0
BUILD_NUMBER      ?= 0
PUBLISHER_NAME    ?= Ascensio System SIA        # ← needs changing for fork
PUBLISHER_URL     ?= https://www.onlyoffice.com/ # ← needs changing for fork
DOCUMENT_ROOT     ?= /var/www/onlyoffice/documentserver  # ← needs changing
```

**Build sequence (via `$(GRUNT_FILES)` target):**
1. `npm install` in `server/`
2. `grunt` with env vars injected
3. Copy `./build/server/*` to `OUTPUT`

**Post-Grunt assembly (`all` target):**
- Copies dictionaries, tools (allfontsgen/allthemesgen binaries), schema files, core fonts, document templates, licence files, branding assets (welcome/, info/)
- Patches `buildVersion`, `buildNumber`, `buildDate` directly into `commondefines.js` and `license.js` via `sed` — fragile; see Problem 6 below

**`install` target (system-level, run as root):**
1. Creates `onlyoffice` user and directories
2. Copies built artefacts to `DOCUMENT_ROOT`
3. Moves config to `/etc/onlyoffice/documentserver`
4. Sets ownership to `onlyoffice:onlyoffice`
5. Runs `allfontsgen` (font index generation) as the `onlyoffice` user
6. Runs `allthemesgen` (slide theme image generation) as the `onlyoffice` user
7. Creates symlinks for shared `.so` libs from `FileConverter/bin/` into `/lib/`

---

### `server/Gruntfile.js` — Server Grunt Build

Relatively simple. Pulls task config entirely from `package.json` (not inline in Gruntfile).

**Addon system:** `--addon=<path>` flag allows external directories to deep-merge their own `package.json` into the main config. Arrays are concatenated; objects are deep-merged. This is the extension point for branding or custom builds.

**Tasks:**

| Task | Plugin | Purpose |
|------|--------|---------|
| `clean` | grunt-contrib-clean | Remove previous output |
| `mkdir` | grunt-mkdir | Create output directories |
| `copy` | grunt-contrib-copy | Copy files to output |
| `comments` | grunt-stripcomments | Strip JS comments from output files |
| `usebanner` | grunt-banner | Inject copyright header (from env vars) |
| `checkDependencies` | grunt-check-dependencies | Install npm deps for each sub-package listed in `package.npm` |

**Default task:** `clean → mkdir → copy → comments → usebanner → checkDependencies`

**Develop task:** `build-develop → copy` (skips stripping/banner — faster for dev)

---

### `server/package.json` — Server npm Workspace

Six sub-packages managed as separate npm installs (not a true npm workspace):

| Package | Purpose |
|---------|---------|
| `Common` | Shared utilities |
| `DocService` | Core document service |
| `FileConverter` | Format conversion |
| `Metrics` | Telemetry |
| `AdminPanel/server` | Admin backend |
| `AdminPanel/client` | Admin frontend |

`npm run build` = `run-p install:*` — parallel `npm ci` across all six. No actual compilation here; this just ensures deps are present before Grunt runs.

**Dev tooling (modern, not inherited):** ESLint 9, Prettier 3.4, Jest 29, Husky 8, lint-staged. Already in good shape.

**License tooling:** `license-report` + `license-downloader` — generates third-party licence manifests per sub-package. Relevant for AGPL compliance.

---

### `web-apps/build/Gruntfile.js` — Desktop Editor Front-End Build

The most complex layer. Handles all five desktop editors: document, spreadsheet, presentation, PDF, visio — plus appforms. The framework is **Backbone** (not just AMD module syntax — dynamic patterns like string-based template loading and runtime `require()` calls must be accounted for in any migration).

**Per-editor config files:**
- `documenteditor.json`
- `spreadsheeteditor.json`
- `presentationeditor.json`
- `pdfeditor.json`
- `visioeditor.json`
- `appforms.json`
- `common.json` (shared)

**Branding injection** via `_themVal()` helper — priority order:
1. Environment variable (e.g. `SUPPORT_EMAIL`)
2. `theme/<name>/meta/config.json` key (single source of truth, shared with mobile webpack pipeline)
3. Empty string (hides the element in templates)

**Token substitution** (`jsreplacements` array): Placeholders like `{{SUPPORT_EMAIL}}`, `{{SUPPORT_URL}}` are replaced throughout JS/HTML at build time.

**Platform encoding handling:** Windows-specific CP866/1251/1252 detection via `chcp`, with `iconv-lite` for non-UTF-8 systems. Retained from OnlyOffice's Windows build support. Given Linux-first priority, the `chcp` call (`Gruntfile.js:45`) is dead weight and should be removed.

**Grunt plugins in use:**

| Plugin | Purpose | Age/Status |
|--------|---------|-----------|
| `grunt-contrib-less` | LESS → CSS | Active |
| `grunt-contrib-requirejs` | AMD bundle (r.js) at `:566` | **Legacy — replace with webpack** |
| `grunt-babel` + `@babel/preset-env` | ES6+ transpilation | Active (webpack handles this natively) |
| `grunt-contrib-uglify` / `grunt-terser` | JS minification | Active (terser is current) |
| `grunt-contrib-concat` | File concatenation | Active |
| `grunt-contrib-cssmin` | CSS minification | Active |
| `grunt-contrib-htmlmin` | HTML minification | Active |
| `grunt-contrib-imagemin` | Image optimisation | **CVEs in v4 dep tree — replace with `sharp`/`svgo`** |
| `grunt-spritesmith` | Bitmap sprite generation | Possibly dead — PNG sprites may already be removed |
| `grunt-svg-sprite` + `grunt-svgmin` | SVG sprite generation | Active |
| `grunt-text-replace` | Token substitution | Old (0.4.0, ~2014) — replace |
| `grunt-json-minify` | JSON minification | Old |
| `grunt-inline` | **Local plugin** — inlines assets | **Opaque — not on npm** |
| `iconsprite` | **Local plugin** — sprite tooling | **Opaque — not on npm** |
| `time-grunt` | Build timing | Old (devDep) |

**Bower:** `bower.json` and `.bowerrc` are present but **confirmed dead** — no references in Gruntfile or `package.json`. Vendored packages (jquery, backbone, underscore, requirejs-text, etc.) are committed under `web-apps/vendor/`. Delete `bower.json` and `.bowerrc` now.

---

### `vendor/framework7-react/` — Mobile Editor Front-End (webpack 5)

The mobile editors run on a **completely separate, modern pipeline**: webpack 5.98, webpack-dev-server 5, React + Framework7 8.x, terser-webpack-plugin, Workbox. This is a live, maintained stack that the team already operates.

The theme contract is shared: `theme/<name>/meta/config.json` is the single source of truth for brand data. The desktop Gruntfile reads it via `_themVal()` (LESS variables + JS token replacement); the mobile webpack pipeline reads it via DefinePlugin + less-loader globalVars. **Any replacement for the desktop pipeline must preserve this contract exactly.**

---

## Key Problems for Replacement

### 1. AMD/RequireJS + `text!` Loader Plugin

The desktop editors use AMD module syntax (`define()` / `require()`). r.js bundles them via `grunt-contrib-requirejs` (`:566`). Approximately 557 files in `web-apps/apps/` contain `define(`.

**Critical detail the naive AMD count misses:** AMD loader plugins, specifically `requirejs-text` (the `text!` prefix), are used to load templates at runtime. Webpack does not handle `text!` natively — it requires a resolve alias or a small custom loader shim. This is the actual hard edge of the AMD problem, not the `define()` syntax itself (which webpack 5 handles natively).

The framework is Backbone, which uses dynamic `require()` patterns. Any cost estimate for AMD → ESM must account for this, not just the module syntax.

### 2. Local Plugins — `grunt-inline` and `iconsprite`

Referenced as `file:plugins/grunt-inline` and `file:sprites` in `package.json`. Local, undocumented, not auditable from npm. Before any replacement work, their behaviour must be understood:
- What does `grunt-inline` actually inline, and where? (Likely CSS/JS inlining into HTML at `:174-221`)
- What does `iconsprite` do differently from `grunt-svg-sprite`? May be vestigial alongside the PNG sprite removal.

### 3. Hard-Coded OnlyOffice Identity

All are overridable via env vars, but wrong defaults produce wrong output silently:

| File | Value needing change |
|------|---------------------|
| `server/Makefile` | `PUBLISHER_NAME`, `PUBLISHER_URL`, `DOCUMENT_ROOT` |
| `sdkjs/Makefile` | `PUBLISHER_NAME`, `PUBLISHER_URL` |
| `web-apps/build/Gruntfile.js` | Copyright header fallback string |
| `server/package.json` | `"homepage": "https://www.onlyoffice.com"` |
| `web-apps/build/package.json` | `"homepage": "http://www.onlyoffice.com"` |

Note: the theme `config.json` system is already the live source of truth for user-visible brand data. The wrong Makefile defaults are a cosmetic debt item, not a structural build problem.

### 4. Bower — Confirmed Dead

Vendored packages are committed to `web-apps/vendor/`. Bower is not invoked in the current build. Delete `bower.json` and `.bowerrc`. No further investigation needed.

### 5. `grunt-text-replace` (v0.4.0, ~2014)

Token replacement is central to branding. The replacement is 5 lines of Node or a webpack DefinePlugin entry.

### 6. `sed` Patching of Built JS Files

```makefile
sed "s|\(const buildVersion = \).*|\1'${PRODUCT_VERSION}';|" -i $(COMMON_DEFINES_JS)
```

In-place `sed` of artifact internals after Grunt runs. Couples the Makefile to built-file string format — silent breakage if the format changes. Should be build-time injection (webpack define/replace) before artifacts are written, not after.

### 7. `grunt-contrib-imagemin` — CVEs

v4 drags a tree of unmaintained imagemin plugins with recurring security vulnerabilities. Replace with `sharp` or `svgo` CLI regardless of which bundler path is chosen.

### 8. Windows `chcp` Remnant

`Gruntfile.js:45` shells out to `chcp` (Windows codepage detection). Dead code given the Linux-first priority. Remove.

### 9. Multi-Repo Implicit Input Dependencies

The build assumes these siblings exist (none are declared or verified):
- `../core/` — built, provides `allfontsgen`, `allthemesgen` binaries
- `../dictionaries/`
- `../document-templates/`
- `../core-fonts/`

(`../build_tools/` is output-only — nothing reads from it.)

---

## What to Preserve in Any Replacement

| Feature | Why |
|---------|-----|
| **Addon merge system** | Useful extension point for branding/custom builds |
| **`theme/<name>/meta/config.json` contract** | Single source of truth for brand data across desktop and mobile pipelines — both must read the same file |
| **Per-editor component build structure** | Five editors build independently; keep it |
| **`develop/Makefile` Docker orchestration** | Already well-designed; out of scope |
| **License reporting pipeline** | Needed for AGPL compliance; already modern |
| **`desktop` build mode** | Near-term priority; becomes a webpack mode/env flag |
| **`e2e/` test suite** | Migration gate — each editor validated before and after |

---

## Replacement Options

### Option A — Minimal: Replace Grunt tasks, keep r.js

Replace Grunt orchestration with `npm scripts` + direct CLI invocations. Keep r.js for AMD bundling.

- Grunt → `run-s` / `run-p`
- grunt-contrib-less → `lessc` CLI
- grunt-terser → `terser` CLI
- grunt-contrib-cssmin → `clean-css-cli`
- grunt-text-replace → small Node script
- grunt-spritesmith → `spritesmith` CLI
- r.js stays in place

**Pros:** Lowest risk; no codebase changes; unblocks all other work immediately  
**Cons:** Still owns r.js (frozen upstream); no HMR for desktop dev; no path toward ESM; doesn't converge with the mobile webpack pipeline  
**Verdict:** Acceptable stopgap only — spends effort to stand still

---

### ~~Option B — Vite with AMD compatibility shim~~ — REJECTED

Two bundlers (Vite dev + r.js prod) with different AMD semantics in a 557-module, five-editor codebase. Dev/prod divergence bugs in a document editor are the kind that only appear under real user load. AMD shims for Vite are not production-proven at this scale. Do not pursue.

---

### Option C — Full ESM migration + Vite

Convert all AMD modules to ESM; replace the entire pipeline with Vite.

**Pros:** Modern stack; best long-term position; enables tree-shaking  
**Cons:** Big-bang rewrite across five editors + shared Backbone layer; blocks product work for an extended period  
**Verdict:** Correct *destination*, wrong *move* for a two-person team that must not block the product. Reframe as the eventual end-state reached incrementally via Option D.

---

### Option D — Incremental consolidation onto webpack 5 ✓ RECOMMENDED

The mobile editors already run on webpack 5. Webpack 5 parses AMD `define()`/`require()` natively. Consolidate the desktop front-end onto the same bundler, one editor at a time.

**Phase 1:** Replace the Grunt task zoo (less, cssmin, htmlmin, sprites, text-replace, inline) with webpack loaders/plugins and small scripts. Swap r.js for webpack's native AMD handling per editor, using `e2e/` as the migration gate. The `text!` loader-plugin issue is bounded and well-trodden — write a small webpack loader shim.

**Phase 2:** Opportunistic AMD → ESM conversion. New code is written as ESM; existing modules convert when touched. No freeze required.

**Phase 3 (optional):** If webpack build times become a bottleneck, **Rspack** is a drop-in webpack-API-compatible Rust rewrite with AMD support (verify against current release before committing). This is a speed upgrade that doesn't require revisiting Phase 1 or 2.

The `--desktop` target becomes a webpack `mode`/env flag. sdkjs/Closure is untouched throughout all phases.

**Key advantages:**
- Team already operates webpack — no new operational knowledge required
- AMD → ESM becomes incremental, not a project
- Theme contract (`config.json` → DefinePlugin/less-loader) already exists in the mobile pipeline; replicate it for desktop
- Four build technologies (Make, Grunt, r.js, webpack) converge toward two (Make, webpack)
- Sourcemaps: webpack sourcemaps are significantly better than r.js's; this is a concrete dev-experience win from day one

---

## Immediate Low-Hanging Fruit

These are independent of the bundler decision and can be done now:

1. **Delete Bower** — `bower.json` and `.bowerrc`; confirmed dead; vendored packages are in `web-apps/vendor/`
2. **Replace `grunt-contrib-imagemin`** — recurring CVEs; replace with `sharp`/`svgo` CLI
3. **Remove `chcp` call** — `Gruntfile.js:45`; Windows codepage detection; dead on Linux
4. **Document local plugins** — reverse-engineer `grunt-inline` and `iconsprite`; confirm whether `grunt-spritesmith`/`iconsprite` are still load-bearing or vestigial
5. **Replace `grunt-text-replace`** — 12 years old; 5 lines of Node
6. **Move `sed` patching into build-time injection** — before Grunt, not after; remove the coupling to artifact internals
7. **Fix Makefile branding defaults** — `PUBLISHER_NAME`, `PUBLISHER_URL`, `DOCUMENT_ROOT`
8. **Measure build wall time per editor** — establishes the baseline for the migration business case; record it before changing anything
9. **Document multi-repo input dependencies** — `../core/`, `../dictionaries/`, `../document-templates/`, `../core-fonts/`

---

## Artifacts Examined

| File | Notes |
|------|-------|
| `develop/Makefile` | Dev environment |
| `build/Makefile` | Vagrant test targets only |
| `sdkjs/Makefile` | SDK JS build — Closure Compiler, not r.js |
| `sdkjs/build/Gruntfile.js` | Closure invocation at `:188` |
| `server/Makefile` | Server assembly + install |
| `server/Gruntfile.js` | Server Grunt config |
| `server/package.json` | Server npm workspace |
| `web-apps/build/Gruntfile.js` | Desktop front-end Grunt — r.js at `:566`, desktop flag at `:997`, theme at `:174-221` |
| `web-apps/build/package.json` | Desktop front-end npm deps |
| `web-apps/build/bower.json` | Bower — confirmed dead |
| `web-apps/build/theme.config.mjs` | Branding config (referenced, not read in full) |
| `web-apps/build/*.json` | Per-editor build configs (listed) |
| `vendor/framework7-react/build/webpack.config.js` | Live webpack 5 pipeline for mobile editors |

---

## Step 1 Findings (baseline capture, 2026-06-13)

### Build environment
- **Docker bake image**: Ubuntu 24.04, Node 20 (from nodesource), grunt-cli global
- **Running `eo` container**: Node 18.19.1, grunt-cli — the deployed build output lives at `/var/www/onlyoffice/documentserver/web-apps/apps/`
- **Local machine**: Node 25.2.1 — do not switch versions; build runs in Docker
- **CI workflow** (`.github/workflows/Build.yml`): specifies `NODE_VERSION: 16` — **this is stale**. The actual build uses Node 20 via Docker. The CI YAML should be updated to match.

### Build output structure
- **16,706 total files** across all editors
- **20 JS bundles** tracked with module manifests
- **7,102 files hashed** (locale JSON, SVG, GIF, ICO, .htm help docs)
- **9,565 files size-tracked** (HTML, PNG, CSS, other)
- **19 source maps** skipped (tool-dependent output)

### Module counts per bundle
| Bundle | Modules |
|--------|---------|
| `documenteditor/main/app.js` (2.1MB) | 183 |
| `spreadsheeteditor/main/app.js` (2.2MB) | 189 |
| `presentationeditor/main/app.js` (1.9MB) | 180 |
| `pdfeditor/main/app.js` (1.8MB) | 170 |
| `visioeditor/main/app.js` (860KB) | 92 |
| `documenteditor/main/code.js` | 92 |
| `spreadsheeteditor/main/code.js` | 118 |
| `presentationeditor/main/code.js` | 61 |
| `pdfeditor/main/code.js` | 56 |
| `visioeditor/main/code.js` | 16 |
| `documenteditor/forms/app.js` | 64 |
| `documenteditor/forms/code.js` | 9 |

**Visioeditor confirmed smallest** (92 + 16 = 108 modules total). Correct first migration target.

### Embed and mobile bundles
- **Embed bundles** (`app-all.js`) have **0 named AMD modules** — they use a different concatenation format (global namespace, not AMD `define()`). The module manifest approach does not apply to them; size tracking only.
- **Mobile bundles** (`dist/js/app.js`) are **webpack 5 output** — show 2 define() matches (AMD shims within webpack output), not meaningful as a module count. Size tracking only.

### Branding
- All bundles carry the copyright banner: `Ascensio System SIA 2026 / http://www.onlyoffice.com` — confirms low-hanging fruit item 4.5 (fix Makefile defaults) is still outstanding.

### Locale JSON
- Locale files are **formatted, not minified** despite `grunt-json-minify` being in the pipeline. Either json-minify is not applied to locale files, or they are formatted as part of source. Safe to hash.

### Determinism check
- Not yet run. Would require rebuilding the Docker image twice and diffing outputs — deferred. The baseline is captured from the deployed `eo` container which was built from the current source.

### Baseline files
- `build/scripts/baseline.js` — the diff script
- `build/scripts/baseline.json` — the captured baseline (2.1MB; 16,706 files)

---

## Review Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1 | 2026-06-12 | Claude Sonnet | Initial analysis |
| v2 | 2026-06-12 | Fable (claude-fable-5) | Added: webpack 5 mobile pipeline fact; Closure Compiler in sdkjs; `text!` AMD plugin caveat; Backbone framework context; imagemin CVEs; chcp removal; build-time baseline; sourcemap benefit; confirmed Bower dead; corrected build_tools claim (output only); rejected Option B; added Option D as recommendation; amended low-hanging fruit list |
