# Diagnostic: pdfeditor webpack runtime — editor never becomes interactive

## Symptom

Skeleton UI (frame/toolbar DOM) renders. Full editor (document area, active controls) never
appears. `code.js` never appears in the Network tab. No JS errors visible (user has been
looking at the Nextcloud parent-frame console, NOT the pdfeditor iframe console — this may
be hiding the root error).

## Definitive proof: code.js is never loaded

`window.require(['pdfeditor/main/code'], cb)` is the call that fetches `code.js`.
It lives in `LaunchController.load_scripts`, called from `on_app_ready`.
`on_app_ready` subscribes to `'app:ready'` in `LaunchController.init()`.
`'app:ready'` fires from `Main.onDocumentContentReady()` (line 1028 of Main.js):

```js
Common.NotificationCenter.trigger('app:ready', this.appOptions);
```

`onDocumentContentReady` is the SDK callback `asc_onDocumentContentReady`. For it to fire,
the full chain below must succeed:

```
Viewport.onLaunch()
  └─ new Asc.PDFEditorApi({...})        ← creates SDK API object (Viewport.js:132)
       └─ Viewport.getApi() → non-null
            └─ Main.onLaunch() line 140: this.api = Viewport.getApi()
                 └─ if (this.api) {      ← GATE: entire block skipped if api is null/undefined
                      ...
                      Common.Gateway.appReady()   ← line 214
                    }
                         └─ postMessage to Nextcloud parent
                              └─ Nextcloud sends 'init' → loadConfig()
                                   └─ Nextcloud sends 'opendocument' → loadDocument()
                                        └─ api.asc_setDocInfo(docInfo)
                                             └─ asc_getEditorPermissions callback
                                                  └─ api.asc_LoadDocument()
                                                       └─ asc_onDocumentContentReady fires
                                                            └─ trigger('app:ready')
                                                                 └─ load_scripts → code.js
```

## Most likely failure points (in probability order)

### 1. Exception in Viewport.onLaunch() AFTER skeleton DOM renders

`Viewport.onLaunch()` line 129 renders the skeleton DOM (which IS visible).
Line 132 then does:

```js
this.api = new Asc.PDFEditorApi({
    'id-view'  : 'editor_sdk',
    'translate': this.getApplication().getController('Main').translationTable,
    'isRtlInterface': Common.UI.isRTL()
});
```

If this throws (e.g. `Asc.PDFEditorApi` undefined, `Common.UI.isRTL` not a function,
`translationTable` access throws), the exception propagates to `launchControllers()`.

`launchControllers` has NO try/catch:
```js
launchControllers: function() {
    _.each(this.controllers, function(ctrl, id) {
        ctrl.onLaunch(this);   // no try/catch — exception stops the loop
    }, this);
},
```

Viewport is the FIRST controller in the list. If it throws, every subsequent controller
(including Main) never runs. `Common.Gateway.appReady()` never fires. Game over.

Candidates for what throws:
- `Asc` is not defined or `Asc.PDFEditorApi` is not a constructor  
  (SDK not loaded, or SDK version mismatch with the source code)
- `Common.UI` is undefined or `Common.UI.isRTL` is missing  
  (UI modules failed to load in webpack bundle)
- `Common.UI.isRTL()` throws because it calls `window.ltr` or reads something unset

### 2. api is null/undefined after constructor (unlikely)

If the constructor succeeds but returns a falsy value. Very unlikely for a `new` call.

### 3. Common.Gateway.appReady() silently fails

If the postMessage to the parent fails (e.g. cross-origin issue in the Nextcloud setup).
Unlikely since the grunt build works identically.

### 4. SDK fires asc_onDocumentContentReady but something later throws

Least likely given code.js is never loaded at all.

## Diagnostic steps needed

**Primary:** Check the pdfeditor iframe console, NOT the Nextcloud parent frame.

In Chrome DevTools: top-left context selector (usually shows "top") → switch to the
pdfeditor iframe URL (e.g. `...documentserver.../web-apps/apps/pdfeditor/main/index.html?...`).
Any uncaught exception here will pinpoint the failure.

**Network tab in iframe context:** Does `app.js` appear and return 200? Does `locale/en.json`
appear? If locale/en.json loads, the AMD factory ran and `app.start()` was reached.

## What changed from grunt→webpack that could cause Viewport.onLaunch() to throw

The webpack bundle is evaluated inside the AMD factory. Module evaluation order differs
from the grunt/r.js bundle. Key things webpack might evaluate differently:

- `Common.UI` namespace: built up incrementally as modules load. If the module that
  defines `Common.UI.isRTL` (or `Common.UI` itself) hasn't evaluated yet when
  Viewport.onLaunch() fires, `Common.UI.isRTL` is undefined.
  
  With the `var Common` fix, `window.Common` is shared across modules. But if a module
  that SETS `Common.UI.isRTL = function(){}` is evaluated AFTER Viewport.onLaunch() runs,
  it would still be undefined at call time.

- `Common.localStorage.setId('pdf')` runs at MODULE EVALUATION TIME (Main.js line 70-72,
  outside initialize/onLaunch). If `Common.localStorage` isn't ready at module eval time,
  this could throw. (Though this runs during callback2, not onLaunch, so it's probably fine.)

## Previously diagnosed issues (do NOT re-fix these)

- `code` entry `dependOn: 'app'` bug — FIXED. code.js is now `define("pdfeditor/main/code", [], ...)`.
- `var Common` guard — FIXED via string-replace-loader. All ~117 files emit to window.Common.
- `locale.js` AMD parser crash — FIXED via string-replace-loader.
- `keymaster.js` ReferenceError — FIXED.
- Top-level `var c_*` constants — FIXED.
- Backbone/Underscore — confirmed SAFE, do not add fixes.

## Approach recommendation for advisor review

Consider: does the webpack bundle evaluate modules in an order that means some `Common.UI.*`
properties are missing when Viewport.onLaunch() references them?

Key question: does `Common.UI.isRTL` exist by the time Viewport.onLaunch() is called?
Grep for where `Common.UI.isRTL` is defined. If it's in a module that is loaded LAZILY
(via async require inside the bundle) rather than synchronously, it might not be set yet.

Alternative: is there a simpler explanation — does `Asc` itself have a problem?
Could the SDK be initialized correctly (grunt) but fail when called with webpack's module
evaluation order (e.g. if the SDK reads `window.Common` or `window.Backbone` during its
initialization and those aren't set up identically)?

## RESOLVED: Root cause was version mismatch

### Diagnostic journey

The debugging session took several wrong turns that are worth documenting to avoid repeating them.

**Wrong frame trap.** All initial console diagnostics were run in the Nextcloud parent frame, not
the pdfeditor iframe. `typeof Asc.PDFEditorApi` returned `ReferenceError: Asc is not defined`
in the parent — completely expected, since `Asc` is only set in the iframe. Meanwhile, error
messages from inside the editor were invisible. To reach the editor console:
- Chrome DevTools → top-left context selector (shows "top") → select the iframe URL
  (`...documentserver.../web-apps/apps/pdfeditor/main/index.html?...`)
- The "switching top > PDF Editor" UI change does NOT switch the console context — you must
  explicitly select the iframe in the context dropdown.

**Hypothesis 1 (Viewport.onLaunch throws) — RULED OUT.** Initial suspicion was that
`new Asc.PDFEditorApi({...})` threw because `Asc` was undefined or `Common.UI.isRTL` was missing.
Confirmed working: in the correct iframe context, `typeof window.Asc` → `'object'`,
`PDFE.getController('Viewport').api` → large live API object with document info.

**Hypothesis 2 (Gateway.appReady fails) — not investigated (bypassed by finding root cause).**

**Actual root cause — version mismatch in onServerVersion().**

`onServerVersion()` (Main.js:2294) compares `txtVersionNum` (the string rendered in the About
panel, injected from `__PRODUCT_VERSION__`) against `buildVersion` returned by the SDK
(`asc_getBuildVersion()` → `'9.2.1'` on the container).

The webpack DefinePlugin default:
```js
const productVersion = process.env.PRODUCT_VERSION
    ? `${process.env.PRODUCT_VERSION}...`
    : '0.0.0';   // ← this is what gets embedded when PRODUCT_VERSION is not set
```

With `PRODUCT_VERSION` unset (the default for a local `npx webpack` run), `__PRODUCT_VERSION__`
becomes `'0.0.0'`. The About panel shows `'0.0.0'`. `onServerVersion` compares `'0.0.0'` against
`'9.2.1'` — mismatch — sets `this.changeServerVersion = true`, then immediately returns `true`.

This blocks `onEditorPermissions()` at line 1310:
```js
if ( this.onServerVersion(params.asc_getBuildVersion()) || !this.onLanguageLoaded()) return;
// ↑ returns here — asc_LoadDocument() is never called
```

Without `asc_LoadDocument()`:
- `asc_onDocumentContentReady` never fires
- `onDocumentContentReady` never calls `trigger('app:ready')`
- `LaunchController.on_app_ready` never runs
- `window.require(['pdfeditor/main/code'], cb)` never executes
- `code.js` never appears in the Network tab
- Skeleton UI persists indefinitely

`window.compareVersions` exists as a bypass but is only set by coapisettings in some
configurations. Do NOT rely on it for dev builds.

### Fix

Build with `PRODUCT_VERSION` set to match the container's DocumentServer version:

```sh
cd build && PRODUCT_VERSION=9.2.1 NODE_ENV=development node_modules/.bin/webpack --config webpack.pdfeditor.mjs
```

### Permanent fix in the Makefile

Both `web-apps` and `web-apps-dev` Makefile targets now define:
```makefile
PRODUCT_VERSION ?= 9.2.1
```
and pass `PRODUCT_VERSION=$(PRODUCT_VERSION)` to every webpack command. Override on upgrade:
```sh
PRODUCT_VERSION=9.3.0 make web-apps-dev
```

This fix is committed to `build/makefile-webpack-product-version` in the DocumentServer repo
(branched from origin/main, not local main — local main had a diverged Apache proxy commit).

### Why `0.0.0` was silent in other editors

All four webpack configs had the same `'0.0.0'` default. documenteditor, spreadsheeteditor, and
presentationeditor were all blocked by the same bug — they just hadn't been runtime-tested yet.
pdfeditor was the first editor exercised end-to-end with a real document through Nextcloud.
