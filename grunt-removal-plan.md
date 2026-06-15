# Grunt Removal — Remaining Work Plan

Branch: `build/webpack-migration`
Goal: eliminate grunt entirely from the build pipeline.

## Advisor review (2026-06-15)

Two hard blockers were identified that were missing from the original phase list:

- **Gap 1 — main HTML pipeline:** `deploy-app-main` copies `*.html.deploy` → `.html`, substitutes `@@SRC_ROOT@@` and all `{{TOKEN}}` replacements (PUBLISHER_URL, SUPPORT_EMAIL, etc.) in both JS output and HTML. webpack only replaces tokens in JS (via `string-replace-loader`). `inline-svgs.js` hard-errors if `.html` is absent (it currently relies on grunt having run first). Must add `deploy-html.js` Node script before Phase E.
- **Gap 2 — common.json chain:** 14 sub-tasks copying vendor scripts, API, SDK assets, and apps-common HTML. Without these, editors cannot boot. Must add `deploy-common.js` Node script before Phase E.

Additionally:
- Phase B embed: grunt-inline inlines `?__inline=true` scripts (same pattern as `inline-svgs.js`), NOT `<link>`/`<script src>` tags. Extend `inline-svgs.js` to walk embed dirs — no new inline implementation needed.
- Phase C forms: `bootstrap` alias NOT needed — grep confirmed bootstrap is listed in appforms.json paths but never actually `require()`'d anywhere in forms source. `themeFormVars` IS needed; uses absolute source paths for LESS `data-uri()` at compile time.
- Phase D mobile: parallel is safe — webpack.config.js writes direct to `apps/<editor>/mobile`.
- `inline-svgs.js` hardcodes `main`; must be extended to also process `documenteditor/forms` and embed dirs.

## Revised remaining tasks (correct order)

| Phase | Task | Replaces | Approach | Status |
|-------|------|----------|----------|--------|
| **Gap 2** | common.json chain | 14 vendor/api/sdk copy tasks | Node script `deploy-common.js` | pending |
| **Gap 1** | main HTML pipeline | `deploy-app-main` HTML copy + token replace | Node script `deploy-html.js` | pending |
| A | deploy-theme-images | grunt task | Node script | **done** `72c711da4f` |
| B | deploy-app-embed | grunt task | Node script | **done** `af958d16e1` |
| C | forms build | `appforms.js` + r.js | webpack config | **done** `034096236a` — needs browser test |
| D | mobile direct-call | `exec:webpack_install` + `exec:webpack_app_build` | CI step (parallel) | **done** `<this commit>` — transition only (see note) |
| E | grunt removal | — | delete files + packages | pending (after Gap 1 + Gap 2) |

Gap 2 and Gap 1 must be done before Phase E.

**Phase D transition note:** The direct mobile build outputs to the SOURCE TREE (`apps/{editor}/mobile`), not to `BUILD_ROOT`. Grunt's `copy:webpack-dist` (inside `deploy-app-mobile`) still copies it across. The direct CI step runs alongside grunt during the transition. In Phase E, grunt's `deploy-app-mobile` is removed and `copy:webpack-dist` equivalent moves to Gap 2 (`deploy-common.js`).

## Notes to consolidate at end (do not commit yet)

- `grunt-removal-plan.md` — this file
- `advisor-fixes-plan.md` — advisor review of the earlier phase fixes

Consolidate into `.claude/migration-topology.md` update and a final summary finding at migration completion.

---

## Phase A: deploy-theme-images

### What grunt does

Source: `theme/{THEME}/assets/img/**/*` (THEME defaults to `euro-office`).

Destinations:
```
$BUILD_ROOT/web-apps/apps/common/main/resources/img/
$BUILD_ROOT/web-apps/apps/common/mobile/resources/img/
$BUILD_ROOT/web-apps/apps/{doc,sheet,presentation,visio}editor/mobile/resources/img/
```
Conditional: if `theme/{THEME}/assets/img/embed/logo.svg` exists, copies it to each editor's `embed/resources/img/logo.svg`.

### Replacement

**New file: `build/scripts/deploy-theme-images.js`**

- Mirrors the Gruntfile task exactly
- Uses only Node `fs` builtins — no new npm dependencies
- Reads `THEME` and `BUILD_ROOT` env vars (same as other scripts)
- Exits 0 (soft-skip) if the theme img dir doesn't exist (local dev without theme repo)
- Exits 1 if `BUILD_ROOT` is unset (same guard as inline-svgs.js)

**CI change (`.github/workflows/build.yml`):**
Add step after `inline-svgs.js`:
```yaml
- name: Deploy theme images
  run: |
    cd web-apps/build
    THEME=euro-office node scripts/deploy-theme-images.js
```

**Makefile change (DocumentServer repo, branch `build/makefile-webpack-product-version`):**
Add `node build/scripts/deploy-theme-images.js` after `node build/scripts/inline-svgs.js`.

### Test gate
After running: verify `$BUILD_ROOT/web-apps/apps/common/main/resources/img/` contains theme images. Spot-check one editor mobile path.

---

## Phase B: deploy-app-embed

### What grunt does (per editor: doc, spreadsheet, presentation, visio — NOT pdf)

1. `clean:prebuild` — rm `$BUILD_ROOT/web-apps/apps/{editor}/embed`
2. `terser` — concat JS source list → terser minify → `embed/app-all.js`
3. `less` — compile `embed/resources/less/application.less` → `embed/resources/css/app-all.css`
4. `copy` — locale, `index.html.deploy` → `.html`, common embed images into `embed/resources/img/`
5. `replace:indexhtml` — `@@SRC_ROOT@@` in HTML
6. `inline` — inline CSS/JS references into HTML (grunt-inline: `<link>` → `<style>`, `<script src>` → `<script>` inline)
7. `clean:postbuild` — rm `embed/resources/img` (images were only needed for the inline step)

JS source list (documenteditor, from `documenteditor.json`):
```
apps/common/locale.js, common/Gateway.js, common/Analytics.js
apps/common/main/lib/mods/{dropdown,modal,tooltip}.js
apps/common/embed/lib/**/*.js
apps/documenteditor/embed/js/{SearchBar,ApplicationView,ApplicationController,application}.js
```
Other editors have equivalent lists in their own `.json` files.

### Key question before implementing

Does the embed `index.html` actually reference `app-all.js` and `app-all.css` via `<link>`/`<script src>` tags that grunt-inline replaces? Or are they already inline? **Read `apps/documenteditor/embed/index.html.deploy` before writing the inline step.**

### Option 1 (recommended): Node script

**New file: `build/scripts/deploy-embed.js`**

Reads config from each editor's `build/{editor}.json` (the same files grunt uses). Steps:

1. `rm -rf $BUILD_ROOT/web-apps/apps/{editor}/embed` (clean)
2. Read JS source list from `{editor}.json.embed.js.src`
3. Concat + terser-minify → `embed/app-all.js`
4. less.render(`application.less`, { modifyVars: themeVars }) → `embed/resources/css/app-all.css`
5. Copy locale, HTML
6. Replace `@@SRC_ROOT@@`
7. Inline CSS/JS into HTML
8. `rm -rf embed/resources/img`

**New devDependencies in `build/package.json`:**
```json
"terser": "^5.0.0",
"less": "^4.0.0"
```
(Currently only transitive via terser-webpack-plugin and less-loader; make explicit.)

Script loops all four editors, or accepts `--editor=documenteditor` for per-editor builds.

### Option 2: webpack config

Embed JS has no AMD module graph — just flat concatenation. A webpack config would need `entry` as an ordered array and would add AMD scaffolding for no benefit. Still needs separate LESS compile and inline steps. Not recommended.

### Test gate
After running: open `http://localhost/web-apps/apps/documenteditor/embed/index.html` in browser. Embed viewer should show the document toolbar.

---

## Phase C: forms build

### What grunt does (documenteditor/forms only)

Same AMD pattern as main editors. From `appforms.json`:
- Entry: `apps/documenteditor/forms/app.js` → `$BUILD_ROOT/web-apps/apps/documenteditor/forms/app.js`
- Postload: `apps/documenteditor/forms/app_pack.js` → `forms/code.js`
- LESS: `forms/resources/less/application.less` → `forms/resources/css/app-all.css`
- Locale copy: `forms/locale/` → `forms/locale/`
- HTML: `forms/index.html.deploy` → `forms/index.html` (inline SVGs via grunt-inline)

`app_pack.js` last line: `Common.NotificationCenter.trigger('app-pack:loaded')` — identical to main editors.

### Replacement: extend factory + new config

**Factory change in `build/webpack.editor.factory.mjs`:**

```js
// Currently: editorConfig(editorName)
// New signature:
export function editorConfig(editorName, opts = {}) {
    const subpath = opts.subpath || 'main';
    const OUT_DIR = path.join(BUILD_ROOT, `web-apps/apps/${editorName}/${subpath}`);
    const appEntry  = opts.appEntry  || path.join(APPS_ROOT, `${editorName}/${subpath}/app.js`);
    const codeEntry = opts.codeEntry || path.join(APPS_ROOT, `${editorName}/${subpath}/app_pack.js`);
    const lessEntry = opts.lessEntry || path.join(APPS_ROOT, `${editorName}/${subpath}/resources/less/application.less`);
    // ... rest of config unchanged
}
```

**New file: `build/webpack.forms.mjs`:**
```js
import { editorConfig } from './webpack.editor.factory.mjs';
export default editorConfig('documenteditor', {
    subpath:   'forms',
    // LESS entry and locale dirs follow from subpath automatically
});
```

**LESS theming:** forms uses additional LESS vars (`themeFormVars` in the grunt config). These need to be added to `theme.config.mjs` alongside the existing `themeGlobalVars()`.

**All webpack 5 AMD fixes apply** — same string-replace-loader rules, same `var Common` fix, same `keymaster.js` UMD guard, same `locale.js` parser crash fix. No new problems expected (same code patterns as main editors).

**inline-svgs.js:** script already looks for `index.html.deploy` in `forms` if a forms BUILD_ROOT dir exists. Verify the glob catches `documenteditor/forms/index.html.deploy`.

### Test gate
Open a PDF fillable form document in Nextcloud. Forms toolbar should appear. Interact with a form field. Check the iframe console for errors.

---

## Phase D: mobile direct-call

### What grunt does

Part of `deploy-app-mobile`, per editor:
1. `cd vendor/framework7-react && npm i --include=dev --production=false`
2. `cd vendor/framework7-react && npm run deploy-{word|cell|slide|visio}`
   - `word` → documenteditor, `cell` → spreadsheeteditor, `slide` → presentationeditor, `visio` → visioeditor

The npm run scripts in `vendor/framework7-react/package.json` set `TARGET_EDITOR` and call `node build/build.js`.
`build/build.js` rimrafs `./www/`, then runs webpack (`vendor/framework7-react/build/webpack.config.js`).
webpack.config.js maps `TARGET_EDITOR` back to an editor name and writes output to `../../apps/{editor}/mobile`.

### Parallelism risk

`build.js` calls `rimraf('./www/')` on a shared `vendor/framework7-react/www/` directory. If four runs execute in parallel they will clobber each other's intermediate output. **Must run sequentially** (or verify `www/` is not used — check webpack.config.js `output.path`).

If webpack.config.js output.path goes directly to `apps/{editor}/mobile` (not via `www/`), parallel is safe. Otherwise, sequential.

### Replacement

```bash
# Install once
cd web-apps/vendor/framework7-react
npm install --include=dev --production=false

# Build all four editors (sequential for safety; parallelise after verifying output paths)
NODE_ENV=production TARGET_EDITOR=word  node build/build.js
NODE_ENV=production TARGET_EDITOR=cell  node build/build.js
NODE_ENV=production TARGET_EDITOR=slide node build/build.js
NODE_ENV=production TARGET_EDITOR=visio node build/build.js
```

**CI change:** Add as a separate step after the webpack step.
**Makefile change:** Add after inline-svgs.js / webpack steps in DocumentServer repo.

### Test gate
Check `apps/{documenteditor,spreadsheeteditor,presentationeditor,visioeditor}/mobile/` directories have been populated in `$BUILD_ROOT`.

---

## Phase E: grunt removal

Only after A–D are CI-green and browser-validated.

1. `git rm build/Gruntfile.js`
2. `git rm build/appforms.js`
3. Remove from `build/package.json`:
   - `grunt`, `grunt-cli`
   - `grunt-contrib-{clean,concat,copy,cssmin,htmlmin,imagemin,less,requirejs,svgmin}`
   - `grunt-exec`, `grunt-json-minify`, `grunt-text-replace`, `time-grunt`
4. Assess `build/*.json` configs (documenteditor.json etc.): keep if webpack configs reference them; delete if grunt-only.
5. Remove grunt step from `.github/workflows/build.yml`
6. Remove grunt call from Makefile (DocumentServer repo)
7. `npm install` in `build/` to update `package-lock.json`
8. Full CI run — must be green
9. Smoke test all five editors + forms in the `eo` container

---

## Open questions for advisor

1. **Phase B inline step**: Before implementing the inline step, should we read `apps/documenteditor/embed/index.html.deploy` to confirm what `grunt-inline` is actually inlining? If it just inlines a single `<link>` and `<script>`, a 10-line regex is sufficient. If it's more complex, we need a more robust parser.

2. **Phase B terser/less deps**: These are already transitive deps of our existing packages. Is making them explicit in `package.json` the right call, or should we require() them from inside the existing package (terser from `terser-webpack-plugin/node_modules/terser`)?

3. **Phase C factory opts**: The `opts.subpath` approach adds one parameter. Is there a case for `formsConfig()` being a fully separate function instead, given LESS vars differ and locale paths differ? Or is the shared code volume high enough to justify the opts pattern?

4. **Phase D sequential vs parallel**: Is it known whether `vendor/framework7-react/build/build.js` outputs to `./www/` as an intermediate or writes directly to `apps/{editor}/mobile`? This determines whether the 4 runs can be parallelised (saving ~3× wall-clock time).

5. **Phase B is it used?**: Embed viewer is in the full build. In Euro Office Nextcloud context, is the embed path actually exercised (e.g. by the Nextcloud Richdocuments `embed` mode)? If not, is it acceptable to defer embed replacement to a follow-up PR?
