# Finding: `code` webpack entry must output AMD, not a chunk push

## Symptom

Editor loads skeleton UI (toolbar/sidebar DOM never rendered). No console errors.
`locale/en.json` is fetched (AMD factory ran, locale module executed) but the app never
becomes interactive. `Common.Controllers.LaunchController.isScriptLoaded()` returns false
permanently.

## Root cause

All five editors use this startup contract:

```
app.js  (AMD module, loaded by require.js data-main)
 └─ locale loads → require([controllers], cb)
      └─ cb: app.postLaunchScripts = ['<editor>/main/code']
             app.start()
               └─ LaunchController.init()
                    └─ on 'app:ready' → window.require({waitSeconds:0},
                                          ['<editor>/main/code'], cb)
                                            └─ code.js loads
                                                 └─ app_pack callback →
                                                      trigger('app-pack:loaded')
                                                        └─ trigger('script:loaded')
                                                             └─ editor interactive
```

`LaunchController` only calls `trigger('script:loaded')` via **two paths**:

1. `on_app_pack_loaded`: triggered by `'app-pack:loaded'` notification, which fires
   from the `require([...], callback)` callback at the bottom of `app_pack.js`.

2. `window.less` check in the `require(postLaunchScripts, cb)` callback — only true
   in development mode with LESS in the browser. Never true in our build.

**Path 1 is the only live path.** For it to work, `code.js` must execute the
`app_pack.js` entry module when loaded.

**With `dependOn: 'app'`** (`webpack.editor.mjs` before the fix), `code.js` output is:

```js
(self["webpackChunkcommon"] = self["webpackChunkcommon"] || []).push([["code"], {modules}]);
```

This registers modules in webpack's runtime via the overridden push (set by `app.js`'s
AMD factory). But it does **not** execute the app_pack.js entry module. webpack's
normal chunk loading mechanism calls `__webpack_require__.O` to run startup entries,
but that happens via `<script>` tags added by webpack itself — not when an external
runtime (require.js) loads the file. So `app_pack.js`'s callback never runs,
`'app-pack:loaded'` never fires, and the editor waits forever.

## Fix

Change the `code` webpack entry from `dependOn: 'app'` to a standalone AMD module:

```js
// BEFORE (broken):
code: {
    import: path.join(APPS_ROOT, '<editor>/main/app_pack.js'),
    dependOn: 'app',
},

// AFTER (correct):
code: {
    import: path.join(APPS_ROOT, '<editor>/main/app_pack.js'),
    library: { type: 'amd', name: '<editor>/main/code' },
},
```

With `library: { type: 'amd', name: '<editor>/main/code' }`, webpack outputs:

```js
define("<editor>/main/code", [], () => {
    // webpack bootstrap (self-contained runtime, no dependOn)
    // evaluate entry: app_pack.js top-level require([...modules...], cb)
    //   cb fires (microtask): Common.NotificationCenter.trigger('app-pack:loaded')
    return exports;
});
```

When require.js loads `code.js`:
1. Sees `define(...)` → valid AMD module
2. Calls factory (empty deps array → immediate)
3. Factory: webpack bootstrap runs, app_pack modules evaluate, app_pack callback fires
4. `'app-pack:loaded'` → LaunchController → `'script:loaded'` → editor interactive

## Notes

- `backbone` and `underscore` are **not** in `externals` (they are webpack aliases), so
  they are bundled inside `code.js`. This duplicates ~50 KB vs `app.js`, which is
  acceptable — they have no cross-bundle shared state that would cause identity issues.
- The `window["webpackChunkcommon"]` global is set by `app.js`'s runtime inside its AMD
  factory. `code.js`'s runtime also touches it (its own AMD factory runs later), but
  with `asyncChunks: false` neither bundle pushes any runtime chunks after init, so the
  mutual overwrite of the push override is harmless.
- `waitSeconds: 0` in `window.require({waitSeconds: 0}, ...)` means require.js waits
  indefinitely. With the old `dependOn` code.js, the `define()` was never called and
  require.js silently resolved the module as `undefined` — but the `app_pack.js` entry
  never ran, so `'app-pack:loaded'` never fired.

## Applies to

All five editors: documenteditor, spreadsheeteditor, presentationeditor, visioeditor,
pdfeditor. Fixed in all five `build/webpack.<editor>.mjs` configs simultaneously.
