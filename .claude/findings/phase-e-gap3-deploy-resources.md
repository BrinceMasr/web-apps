# Phase E — Gap 3+4: deploy-resources.js + deploy-reporter.js

Discovered by advisor review (2026-06-15). Updated with second advisor review corrections.

---

## What grunt does that nothing else covers

### deploy-app-main (per editor: doc, spreadsheet, presentation, visio, pdf)

**Raster images** (`imagemin.images-app` — `images-common` is DEAD CONFIG, commented out in Gruntfile:622-626):
- `apps/<editor>/main/resources/img/**/*.{png,jpg,gif,ico}` excl `toolbar/**/*x/**/*` → BUILD_ROOT img
- In CI: **plain copy** (not optimized) because CI runs `grunt --skip-imagemin`
- SVGmin is NEVER gated by `--skip-imagemin` — svgo always runs in both CI and local

**SVGs** (`svgmin` → `svgicons.common`):
- `apps/<editor>/main/resources/img/**/*.svg` excl `toolbar/**/*x/**/*` → BUILD_ROOT img (svgo-optimized)
- `svgicons.clean` in the editor JSONs is DEAD CONFIG — grunt does NOT delete non-`_s.svg`. All SVGs kept.

**spreadsheeteditor cursor files** (`imagemin.images-common` first entry — this ONE entry IS live):
- `sdkjs/word/Images/**/*.cur` → `apps/spreadsheeteditor/main/Images/` (cursor files for cell editing)
- Note: the `apps/common/main/resources/img/**` entry in `images-common` for each editor is the dead config

**Non-locale localization copy** (`copy:localization`, excluding locale/ entries handled by webpack CopyWebpackPlugin):
- documenteditor: `resources/watermark/*.json`, `resources/numbering/*.json`, `apps/common/main/resources/symboltable/*`
- spreadsheeteditor: `resources/formula-lang/*`, `apps/common/main/resources/symboltable/*`
- presentationeditor: `apps/common/main/resources/symboltable/*`
- visioeditor, pdfeditor: nothing (localization array only has locale/ which webpack handles)
- `entry.src = "*"` in JSON maps to top-level-only glob (non-recursive) — must NOT expand to `**`

**Help copy** (`copy:help`):
- `apps/<editor>/main/resources/help/**` excl `*_/**` and `**/src/**` → BUILD_ROOT resources/help/

**prepareHelp** (`replace:prepareHelp` — runs AFTER help copy, on BUILD_ROOT files):
- Target: `resources/help/ru/**/*.htm*` in BUILD_ROOT
- Tokens (three only — indexhtml replacements are commented out in Gruntfile:686-688):
  - `{{COEDITING_DESKTOP}}` → `_encode(process.env.COEDITING_DESKTOP) || 'Подключиться к облаку'`
  - `{{PLUGIN_LINK}}` → `_encode(process.env.PLUGIN_LINK) || 'https://api.onlyoffice.com/plugin/basic'`
  - `{{PLUGIN_LINK_MACROS}}` → `_encode(process.env.PLUGIN_LINK_MACROS) || 'https://api.onlyoffice.com/plugin/macros'`
  - `_encode(x) || default` semantics: encode THEN fallback — empty/unset → raw default (un-encoded)

**json-minify**: intentionally omitted (gzip handles it; cosmetic only)

### deploy-reporter (presentationeditor only)

1. Terser-minify `apps/presentationeditor/main/app.reporter.js` → BUILD_ROOT
   - Options: `mangle:false`, `format:{comments:false}`, plus AGPL copyright preamble (required — omitting it is an AGPL compliance gap)
   - Use `PKG_VERSION` for version in preamble (same precedence as deploy-common.js: `PRODUCT_VERSION` env || JSON version)
2. `index.reporter.html.deploy` → `index.reporter.html` with `@@SRC_ROOT@@` replacement — **already handled by deploy-html.js** (it globs all `*.html.deploy` in each editor main dir)
3. Inline `?__inline=true` in `index.reporter.html` — **already handled by inline-svgs.js** once the `.reporter.html` exclusion is removed

---

## Script design decisions (advisor-reviewed)

### Shared utils module: YES — extract to `build/scripts/lib/build-utils.js`

Extract: `walkDir`, `globToRegex`, `matchesAny`, `copyDirFiltered`, `optimizeImages`, `writeSVG`, `writeRaster`, `replaceTokensIn`, `ensureDir`, `SVGO_CONFIG`.

Rationale: `globToRegex` has load-bearing limitations (no `?` or char classes) and `SVGO_CONFIG` has a non-obvious `removeHiddenElems:false` quirk. Duplicating across scripts guarantees divergence. Extract once.

### `optimizeImages` extension for rastersOnly/svgOnly modes

```javascript
async function optimizeImages(srcDir, destDir, {
    exclude = [],
    rastersOnly = false,  // skip SVGs (for --skip-imagemin mode)
    svgOnly = false,      // skip rasters (not currently used)
} = {})
```

`--skip-imagemin` must gate **rasters only** — SVGs always go through svgo to match grunt (svgmin is never skipped by grunt's `--skip-imagemin` flag).

### `--skip-imagemin` behavior in deploy-resources.js

- With `--skip-imagemin`: plain `copyDirFiltered` for rasters; svgo still runs for SVGs
- Without: `sharp` optimize rasters + svgo SVGs
- CI must pass `--skip-imagemin` (matching current grunt CI behavior: `grunt --skip-imagemin`)
- Local/release builds may omit it

### inline-svgs.js: remove `.reporter.html` exclusion

```javascript
// Remove this:
.filter(f => f.endsWith('.html') && !f.includes('.reporter.'))
// Replace with:
.filter(f => f.endsWith('.html'))
```

`index.reporter.html` has one `?__inline=true` tag (`device_scale.js`, malformed 6-level-up path) — inline-svgs.js already warn+skips malformed paths. Per-editor aggregate substitution count still passes because `index.html` in the same dir has substitutions.

---

## Phase E implementation plan (advisor-reviewed, ready to execute)

### Prerequisites

Before writing the scripts, extract `build/scripts/lib/build-utils.js` from `deploy-common.js`.

### Commit sequence (web-apps repo)

1. `refactor(build): extract shared helpers to build/scripts/lib/build-utils.js`
   - Move: `walkDir`, `globToRegex`, `matchesAny`, `copyDirFiltered`, `optimizeImages` (extended with rastersOnly/svgOnly), `writeSVG`, `writeRaster`, `replaceTokensIn`, `ensureDir`, `SVGO_CONFIG`
   - Update `deploy-common.js` to require the shared lib; verify output identical
2. `feat(build): add deploy-resources.js — per-editor main/resources copy`
   - New script using shared lib
   - run alongside grunt in eo container, diff BUILD_ROOT — must pass `node scripts/baseline.js --scan-tokens`
3. `feat(build): add deploy-reporter.js — presentationeditor reporter view`
   - New script (terser-minify app.reporter.js only; deploy-html + inline-svgs handle the rest)
   - Remove `.reporter.html` exclusion from inline-svgs.js in same commit
4. `ci: add deploy-resources/deploy-reporter to pipeline, add PRODUCT_VERSION` 
   - Insert after grunt (both run; new scripts run AFTER grunt so their output is the live one)
   - Add `PRODUCT_VERSION` to CI job `env:` block (currently missing — latent bug)
   - CI must be green with grunt still present
5. `ci: remove grunt step from build.yml` — IRREVERSIBLE; only after step 4 is green
6. `build: remove grunt + grunt-plugin deps from package.json` + regenerated `package-lock.json`
   - Verify before removing: `iconv-lite`, `lodash`, `vinyl-fs` (grep — may still be used)
   - Keep: `sharp`, `svgo`, `terser`, all webpack deps, `iconsprite`/sprites tooling
   - Same commit as `appforms.js` and `appforms.json` deletion (appforms.js must not be deleted before Gruntfile.js)
7. `build: delete Gruntfile.js, appforms.js, appforms.json, test*.json` (`git rm`)
8. `docs(.claude): update migration-topology for Phase E completion`

*(Separate PR in DocumentServer repo):*
- Makefile: replace `grunt --skip-imagemin` with:
  ```
  PRODUCT_VERSION=$(PRODUCT_VERSION) BUILD_ROOT=$(EO_ROOT) node scripts/deploy-common.js && \
  BUILD_ROOT=$(EO_ROOT) node scripts/deploy-resources.js --skip-imagemin && \
  BUILD_ROOT=$(EO_ROOT) node scripts/deploy-reporter.js && \
  BUILD_ROOT=$(EO_ROOT) node scripts/deploy-html.js && \
  ```
  (existing `inline-svgs.js` line follows; `--skip-imagemin` matches previous grunt `--skip-imagemin`)

### Dual-run ordering invariant (step 4)

**grunt must run BEFORE new scripts.** New scripts overwrite grunt's output — that is what gets validated by CI and the smoke test. Running new scripts first would leave grunt's output as the final artifact and never validate the replacements.

### Verification before step 5

1. Run pipeline in eo container WITHOUT grunt, check all 6 editors load in incognito
2. `node scripts/baseline.js --scan-tokens` — zero unreplaced tokens
3. Insert → Symbol: symbol picker populated (symboltable)
4. F1 (help): help content loads (help copy)
5. Page Layout → Watermark/Numbering: preset thumbnails visible
6. Presentation F5 → Switch to Presenter view: reporter view loads

### Packages confirmed safe to remove from package.json

`grunt`, `grunt-babel`, `grunt-contrib-clean`, `grunt-contrib-concat`, `grunt-contrib-copy`, `grunt-contrib-cssmin`, `grunt-contrib-htmlmin`, `grunt-contrib-imagemin`, `grunt-contrib-less`, `grunt-contrib-requirejs`, `grunt-contrib-uglify`, `grunt-exec`, `grunt-inline` (file:plugins/grunt-inline), `grunt-json-minify`, `grunt-spritesmith`, `grunt-svg-sprite`, `grunt-svgmin`, `grunt-terser`, `grunt-text-replace`, `time-grunt` (devDep)

**Grep before removing:** `iconv-lite`, `lodash`, `vinyl-fs`

**Keep:** `sharp`, `svgo`, `terser`, all webpack deps, `less`/`less-*`, `@babel/*`, `iconsprite` (sprites.sh), `overrides` (security pins)

---

## apply_common_img_to_per_editor: DEAD CONFIG — do NOT implement

The plan initially included copying `apps/common/main/resources/img/**` into each per-editor img dir, based on the `imagemin.images-common` JSON entries. The second advisor review confirmed this is commented-out dead config in the live Gruntfile (line ~622-626): `// .concat(packageFile['main']['imagemin']['images-common'])  skip copy images from common to editor in 7.2`. Do not implement. The common img dir is already deployed to `apps/common/main/resources/img/` in BUILD_ROOT by `deploy-common.js deployAppsCommon()`.
