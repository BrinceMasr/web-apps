# Build system deep-dive report

Findings from Step 2 of the webpack 5 migration — deep read of local plugins, configs, and the live mobile webpack config.

---

## grunt-inline (local plugin)

**Path:** `build/plugins/grunt-inline/tasks/inline.js`

The plugin rewrites HTML at post-build time. It recognises four inline patterns, all gated on either an `__inline` query string suffix or the `<inline>` element:

| Pattern | Trigger | Output |
|---------|---------|--------|
| `<inline src="file.svg"/>` | Always (no query needed) | Raw file content spliced in verbatim |
| `<script src="file.js?__inline">` | `?__inline` on `src` | `<script>` wrapping file content; optionally UglifyJS-minified (mangle: false) |
| `<link href="file.css?__inline">` | `?__inline` on `href` | `<style>` wrapping content; CleanCSS-processed if `cssmin` option set |
| `<img src="file.png?__inline">` | `?__inline` on `src` | `data:` URI via `datauri` package |

**SVG sprite injection** is the load-bearing use. Each editor's HTML template contains an `<inline src="…/toolbar/icons.svg"/>` element; at build time grunt-inline splices the entire SVG symbol file into the page. This is why the sprite build (`sprites.sh`) must run before the main grunt build.

**Webpack migration impact:** webpack has no native equivalent of `<inline>`. Three options in increasing complexity:

1. **Keep grunt-inline as a post-webpack HTML pass** — webpack emits the HTML, grunt-inline processes it. Simplest; preserves the existing template as-is; requires the Gruntfile to remain in the loop for HTML processing.
2. **HtmlWebpackPlugin template function** — read and embed the SVG file during webpack config evaluation (`fs.readFileSync`) and inject it through a custom HtmlWebpackPlugin template or `templateParameters`. Eliminates the grunt-inline dependency entirely.
3. **Custom webpack plugin** — tap into `emit`/`processAssets` to post-process HTML output in the webpack pipeline.

Option 2 is the cleanest path for a full webpack migration and is directly analogous to how the mobile config already handles `skeleton`, `htmlscript`, and `checkerscript` template vars via `fs.readFileSync` in the plugin options.

---

## Mobile webpack config — desktop contract

**Path:** `vendor/framework7-react/build/webpack.config.js`

The live mobile config establishes the theme contract that the desktop config must replicate.

### `DefinePlugin` keys

```js
__PRODUCT_VERSION__: JSON.stringify(
    process.env.PRODUCT_VERSION
        ? (process.env.BUILD_NUMBER
            ? `${process.env.PRODUCT_VERSION}.${process.env.BUILD_NUMBER}`
            : process.env.PRODUCT_VERSION)
        : '6.2.0.123d'
)
```

Plus all 11 keys from `themeDefines()` (see `build/theme.config.mjs`).

### BannerPlugin (version comment)

```js
new webpack.BannerPlugin(`\n* Version: ${process.env.PRODUCT_VERSION} (build: ${process.env.BUILD_NUMBER})\n`)
```

This produces the `* Version: 9.2.1 (build:1171)` header visible in the browser console — the verification signal used to confirm a new build is live.

### Externals

`jquery` is externalised as the `jQuery` global. Desktop must do the same — `require.js` loads jQuery separately; the webpack bundle must not bundle it.

### LESS theme contract

```js
globalVars: {
    "common-image-path": env === 'production' ? `../../../${editor}/mobile/resources/img` : '...',
    "app-image-path":    env === 'production' ? '../resources/img'                         : '...',
    ...themeGlobalVars(env, editor),
}
```

Desktop LESS vars use `app-image-const-path` and `common-image-const-path` (compile-time) vs `app-image-path` / `common-image-path` (runtime-relative). The desktop webpack config must mirror this distinction in the `less-loader` `globalVars` block.

### SVG handling

Mobile uses `svg-sprite-loader` which processes SVG imports as symbol sprites at bundle time. Desktop uses pre-built SVG sprite files (from `sprites.sh`) that are static assets — not imported via webpack. The desktop config must **not** apply `svg-sprite-loader` to the main app; it should treat SVG sprites as static `CopyWebpackPlugin` targets (same as the existing Grunt copy tasks).

### CSS output naming

Mobile uses `[name].[contenthash].css` for CSS output. The desktop plan uses fixed (no content-hash) filenames — Grunt copies the CSS by known paths, and the HTML templates reference fixed paths. The desktop webpack config must use `[name].css` (no hash).

### Output filenames

No content-hash on JS either: `filename: 'dist/js/[name].js'`. Desktop follows the same pattern.

### Babel scope

Mobile `babel-loader` includes only `mobile/src`, `common/mobile/lib`, framework7 packages, and optional `web-apps-mobile` addon paths. Desktop app code is AMD (not transpiled by Babel in the current build); for the webpack migration the decision is whether to add `babel-loader` for desktop source. Given the AMD → ESM shim approach, most code will be wrapped in AMD-compatible `define()` calls initially — Babel is not required in Phase 1.

---

## r.js configuration shape

**Representative file:** `build/documenteditor.json`

Each editor JSON has three build targets — `main`, `embed`, and `mobile`.

### `main` target (r.js)

Two r.js runs per editor:

| Run | Config key | Entry | Output | Purpose |
|-----|------------|-------|--------|---------|
| 1 | `main.js.requirejs` | `app.js` | `app.js` | Full application bundle |
| 2 | `main.js.postload` | `app_pack.js` | `code.js` | Lazy-loaded second chunk |

Key `paths` entries that are excluded from the bundle (`empty:`):

- `xregexp` — vendored separately, loaded at runtime
- `socketio` — loaded via separate vendor copy
- `coapisettings` — runtime config injected by the server
- `allfonts` — loaded separately (sdk asset)
- `sdk` — sdkjs, loaded separately
- `api` — API adapter, loaded separately

**Webpack migration mapping:**

| r.js concept | webpack equivalent |
|---|---|
| `paths: { x: 'empty:' }` | `externals: { x: ... }` or globals via `ProvidePlugin` |
| `shim: { backbone: { exports: 'Backbone' } }` | `imports-loader` + `exports-loader` or `ProvidePlugin` |
| `shim: { underscore: { exports: '_' } }` | `externals: { underscore: '_' }` (it's already a global in the page) |
| `postload` second r.js run → `code.js` | Second webpack `entry` point or `import()` split point |
| `baseUrl: '../apps/'` | `context: path.resolve(__dirname, '../apps/')` + `resolve.alias` |

### `embed` target

Simple file concatenation (not r.js) — `embed.js.src` is an explicit ordered array of JS files merged into `app-all.js`. This does not need r.js migration; it can stay as Grunt `concat` or be migrated to a webpack `entry` with explicit imports in a thin entry file.

### `mobile` target

Grunt only copies the webpack output (`dist/js/app.js`, CSS) to `$BUILD_ROOT`. The webpack build for mobile runs separately. No r.js involved.

---

## LESS variables: compile-time vs runtime paths

From `documenteditor.json` `main.less.vars`:

```json
{
    "app-image-const-path":    "'../img'",
    "common-image-const-path": "'../../../../common/main/resources/img'",
    "app-image-path":          "'$BUILD_ROOT/web-apps/apps/documenteditor/main/resources/img'",
    "common-image-path":       "'$BUILD_ROOT/web-apps/apps/documenteditor/main/resources/img'"
}
```

The `*-const-path` vars are relative paths baked into CSS for use in `url()` references (browser-resolved). The `*-path` vars are absolute filesystem paths used during imagemin (Grunt-only). The webpack `less-loader` `globalVars` block only needs the `*-const-path` values — the imagemin paths are irrelevant to the CSS output.

---

## Sprites build

**Path:** `build/sprites/Gruntfile.js`

- PNG sprites: **disabled** (grunt-spritesmith commented out)
- SVG sprites only, three categories:
  - Per-editor: `common/main/resources/img/toolbar/icons.svg` (inline symbol mode)
  - Global: all-editors combined (backward compat)
  - Docformats: separate sprite with SVGO
- SVGO transform disabled in global `svg_sprite` task due to a callback bug on Node 18
- Sprites are pre-built via `sprites.sh` before the main Grunt build (and before the CI webpack build)

Webpack does not touch sprites; they are static assets. `CopyWebpackPlugin` in the desktop webpack config should mirror the existing `svgicons` copy tasks in the editor JSON configs.

---

## `themeDefines()` extension needed for desktop

Current `themeDefines()` exports 11 keys (from `build/theme.config.mjs`). Desktop webpack needs ~10 more:

```
HELP_CENTER_WEB_*, SUGGEST_URL, API_URL_EDITING_CALLBACK,
COEDITING_DESKTOP, PLUGIN_LINK*, DEFAULT_LANG, APP_COPYRIGHT
```

These are currently substituted by Grunt's `replace:writeVersion` and LESS `var()` substitution. For Step 5 they need to be added to `themeDefines()` so both mobile and desktop configs share a single source of truth.
