# web-apps — AI Onboarding Reference

This is not a README. It covers the non-obvious: conventions, gotchas, cross-repo wiring, and patterns that aren't visible from filenames alone.

---

## What this repo is

A multi-editor document suite — 5 editors (document, spreadsheet, presentation, pdf, visio) sharing a common Backbone MVC framework. The editors are iframe-hosted and communicate with the host application via a message protocol (`Gateway.js`). The actual document rendering engine is **sdkjs** — a separate repo that lives at `../../sdkjs` (or `../sdkjs` from the DocumentServer root). web-apps is the UI shell; sdkjs is the brain.

---

## Directory layout

```
apps/
  common/          — shared components, controllers, utilities
  api/documents/   — public DocsAPI (external host calls this to init editors)
  documenteditor/
  spreadsheeteditor/
  presentationeditor/
  pdfeditor/
  visioeditor/
build/             — Grunt config (desktop build)
vendor/            — jQuery, Backbone, RequireJS, Underscore, Socket.io
theme/             — branding config injected at build time
translation/       — Python tools for locale string extraction
```

Each editor follows the same internal pattern:
- `main/` — full desktop UI
- `embed/` — stripped embedding mode
- `forms/` — form-filling mode
- `mobile/` — separate webpack build (NOT Grunt)

---

## Dev environment — starting up and rebuilding

All commands run from `DocumentServer/develop/` on the host unless stated otherwise.

**Start the stack:**
```bash
make local    # desktop browser + iOS simulator (localhost)
make mobile   # injects host LAN IP — needed for Android emulators and physical devices
```

Both spin up three Docker containers (`eo` on :8080, `nextcloud` on :8081, `onlyoffice` on :8082) and immediately `exec` into a shell inside `eo` — so you land inside the container ready to build.

**Rebuild JS after source changes** (already inside `eo`):
```bash
make sdkjs          # rebuild sdkjs — needed after changes to sdkjs/common/*.js, sdkjs/word/, etc.
make web-apps-dev   # faster dev rebuild of web-apps — use during iteration
make web-apps       # full web-apps build — use before cutting a release
```

`make sdkjs` followed by `make web-apps-dev` is the typical inner-loop for editing sdkjs + web-apps together. The volume mount (`../:/develop`) means your local edits are immediately visible inside the container — you just need the in-container build to deploy them to the served location.

**Re-enter the container if you've exited:**
```bash
docker compose exec eo bash   # from develop/ on the host
```

---

## Build system

**Build commands live in the parent DocumentServer repo**, not here. See `DocumentServer/develop/` for the Makefile targets that orchestrate the full build — including sdkjs compilation, web-apps bundling, and server packaging. Run builds from there, not from inside web-apps directly.

**Desktop:** Grunt (`/build/Gruntfile.js`, 1000+ lines) handles the web-apps portion. Key stages in order:
1. Theme injection — brand placeholders (`{{PUBLISHER_NAME}}` etc.) replaced from `theme/{THEME}/meta/config.json`
2. LESS compilation — each editor's `resources/less/app.less` imports shared common + theme overrides
3. RequireJS optimisation — bundles modules into minified JS
4. Sprite generation — icons consolidated via grunt-spritesmith / grunt-svg-sprite

**Mobile:** webpack with `DefinePlugin` for branding — separate pipeline, separate output.

If the SDK build fails, the web-apps Grunt build may still complete with broken links — build parallelism means errors don't always propagate cleanly.

---

## How sdkjs connects

At runtime, RequireJS aliases point into the SDK:
```js
sdk: '../../sdkjs/word/sdk-all-min'  // in app.js
```

Controllers register SDK callbacks:
```js
this.api.asc_registerCallback('asc_onContextMenu', handler);
this.api.asc_registerCallback('asc_onPropertiesChange', handler);
```

Constants, types, and drawing primitives are defined in sdkjs and exported onto global namespaces:
```js
window["AscFormat"].CFormControlPr_checked_unchecked = ...
window["Asc"].c_oAscSelectionDialogType = ...
```

**When reviewing web-apps code that uses raw integer or string constants, always check whether sdkjs already exports a named constant for it.** Main export locations in sdkjs: `common/Drawings/Format/Controls.js`, `cell/apiDefines.js`, `common/apiCommon.js`.

---

## View / Controller / API wiring

Pattern is Backbone-style with a patched Controller that acts as an event bus:

1. `Main.js` — root controller, orchestrates everything, hosts customisation hooks
2. Controllers call `addListeners()` to wire view events and SDK callbacks
3. Views extend `Common.UI.BaseView`; templates are underscore `_.template()` strings loaded via RequireJS `text!` plugin
4. `Gateway.js` — host-to-iframe messaging (`opendocument`, `applyeditrights`, `showmessage` etc.)
5. `api.js` — public `DocsAPI` object the host app calls to initialise the editor

Typical flow:
> toolbar button click → controller listener → API call (`this.api.asc_doSomething()`) → SDK updates model → SDK fires `asc_onPropertiesChange` → RightMenu controller updates panel

---

## Toolbar, Right Panel, Context Menu

**Toolbar:** Extends `Common.UI.Mixtbar`. Button availability is gated by an `enumLock` state machine — keys like `editCell`, `selImage`, `lostConnect` enable/disable buttons. See the top of each editor's `Toolbar.js` for the lock set.

**Right Panel:** Tabbed panel views (Character, Paragraph, Image, Chart etc.). Controller listens for `Common.Utils.documentSettingsType.*` events and swaps the active panel. Each panel is a separate view class under `app/view/`.

**Context Menu:** `contextmenu` DOM event → `Main.onContextMenu()` → SDK fires `asc_onContextMenu` with a context object → controller builds `Common.UI.Menu` dynamically based on context type.

**Extending any of these:** follow the existing pattern exactly — register the menu item in the view, wire the click handler in the controller's `addListeners()`, gate visibility in `fillMenuProps()` or equivalent.

---

## Locale / i18n

Strings live in per-editor JSON files:
```
apps/[editor]/main/locale/en.json
apps/[editor]/mobile/locale/en.json
```

Format — flat keys using dotted namespace paths:
```json
"SSE.Views.Toolbar.capInsertCheckBox": "Check Box",
"Common.Controllers.Main.textUntitled": "Untitled"
```

At runtime, `Common.Locale.apply(lang, callback)` loads locale data and injects strings by traversing the dotted key path into the global object. A key like `"SSE.Views.Toolbar.capInsertCheckBox"` sets `SSE.Views.Toolbar.capInsertCheckBox` on the global.

**Critical:** string constants for view captions, hints, and labels live **only** in the locale JSON — there are no JS fallback properties on the view classes. Don't flag missing JS fallbacks as bugs; it's the established convention.

**Also critical:** locale files are auto-generated. PRs that include wholesale locale rebuilds are noise — the actual feature additions will be buried in hundreds of unrelated entries. Always check that locale changes are scoped to new keys only.

---

## Code quality — where to look before writing anything

**The codebase is the style guide.** Before writing a new toolbar button, dialog, context menu item, or right-panel, find the nearest existing analogous feature and follow its structure exactly — same file layout, same event wiring pattern, same enumLock usage. Don't infer conventions from scratch.

**For UI components**, read the source in `apps/common/main/lib/component/` before using anything. The available components include `Button`, `ComboBox`, `Menu`, `MenuItem`, `RadioBox`, `CheckBox`, `InputField`, `MetricSpinner`, `ColorPalette`, `DataView`, `ListView` and more. Each file is self-documenting — the constructor options and events are visible directly. Don't reach for a raw DOM element if a component already exists.

**For SDK API surface**, the `asc_*` methods and callbacks are defined in sdkjs at `../sdkjs`. Before calling or registering a callback, check the source — don't guess parameter shapes. The main surfaces:
- `common/Drawings/Format/Controls.js` — form controls, drawing constants
- `cell/apiDefines.js` — spreadsheet-specific enums and types
- `common/apiCommon.js` — shared API types exposed to web-apps
- Each editor's `sdk-all.js` — the full compiled API surface for that editor type

**For understanding what a feature is supposed to do**, the built-in help files are a fast reference: `apps/[editor]/main/resources/help/en/` contains HTML pages documenting every editor feature from a user perspective. Useful for checking intended behaviour before implementing.

---

## Non-obvious gotchas

**SDK callback timing.** The SDK can fire callbacks before child controllers have finished wiring their listeners in `addListeners()`. Early subscribers registered in `Main.initialize()` get priority. Late-wired listeners in child controllers may miss events fired during startup.

**RequireJS `text!` plugin.** Template files are loaded as strings via `text!path/to/template.template`. A wrong path silently succeeds at bundle time but gives an undefined template at runtime.

**Locale key namespace must match the global.** A key `"Common.Views.RightMenu.tipX"` requires that `Common.Views.RightMenu` exists as a global object when locale is applied. Misnaming a view class will silently fail to inject strings — the property just doesn't land anywhere.

**PDF and Visio are read-only.** Don't assume feature parity across editors. Spreadsheet has pivot tables, slicers, filters (extra enumLock states). Presentation has slide sorter. Each editor's toolbar and right panel differ substantially.

**LESS theme overrides.** Theme LESS files live in `common/main/resources/less/themes/{THEME}/` and are copied there by the build task. Editing a `.less` file post-build won't affect theming until you rebuild.

**Branding is injected at two stages:** Grunt `jsreplacements` for desktop (static at build time), webpack `DefinePlugin` for mobile. Environment variables override `config.json`, which overrides hardcoded defaults.

**`theme/{THEME}/meta/config.json` is the single source of truth for brand data** — publisher name, support URLs, logo filenames, attribution etc. Both the Grunt pipeline (`jsreplacements` / `appendThemeFiles`) and the mobile webpack pipeline (`build/theme.config.mjs` → `DefinePlugin` + `less-loader` globalVars) read the same file. Any new brand field must be added to `config.json` and wired in both pipelines. Adding it to only one is a silent bug — the other build will fall back to ONLYOFFICE defaults.

**SVG sprite entry points — three files per editor must stay in sync.** Each editor has three HTML entry points that include SVG sprites: `index.html` (dev), `index_loader.html` (dev loader), and `index.html.deploy` (production, uses `<inline>` tags processed by `grunt-inline`). When adding a new SVG sprite, all three must be updated. Missing an update to `.deploy` is the most common failure — the dev build works fine and production silently breaks.

---

## Key files

| File | Purpose |
|------|---------|
| `build/Gruntfile.js` | Entire desktop build orchestration |
| `apps/common/Gateway.js` | Host ↔ iframe messaging protocol |
| `apps/api/documents/api.js` | Public editor initialisation API |
| `apps/[editor]/main/app.js` | RequireJS config + SDK path aliases |
| `apps/[editor]/main/app/controller/Main.js` | Root controller, customisation hooks |
| `apps/common/locale.js` | String injection logic |
| `theme/{THEME}/meta/config.json` | Branding config |

---

## Cross-repo relationships

| Repo | Relationship |
|------|-------------|
| `sdkjs` | Engine — provides rendering, document model, and all `asc_*` API methods. Lives at `../sdkjs`. |
| `DocumentServer/server` | Hosts the editors; handles file I/O, collaboration, and the WOPI layer |
| `eurooffice-nextcloud` | Nextcloud integration — wraps the editors in a Nextcloud app |
| `office` (Nextcloud) | Document hub/overview UI — thin Vue app, no shared code with web-apps at build time |
