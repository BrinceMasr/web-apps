# Finding: `keymaster.js` UMD export guard ReferenceError

## Symptom

`ReferenceError: key is not defined` thrown in SS (spreadsheeteditor), PPT (presentationeditor), PDF (pdfeditor) at runtime — in the minified `app.js`, typically deep in the bundle during initial module evaluation. Doc editor unaffected (see below).

Stack trace points into the compiled webpack bundle, not a legible source line.

## Root cause

`apps/common/main/lib/core/keymaster.js` line 360:
```js
if(typeof module !== 'undefined') module.exports = key;
```

This is a UMD (Universal Module Definition) export guard. The intent:
- In Node.js / CommonJS: `typeof module` is `'object'` — export the `key` function.
- In a browser `<script>` tag: `typeof module` is `'undefined'` — skip the export, `key` is already on `window` via `global.key = assignKey` set on line 348.

**Under webpack**, `module` is always injected into the factory scope. `typeof module` is always `'object'`, making the guard always true. The bare identifier `key` has no lexical declaration in the enclosing scope — it was intended to resolve as `window.key` (via the global assignment on line 348), but webpack's factory `global` / `this` is not `window`. Result: `ReferenceError`.

The correct export target is the locally-declared function `assignKey` (line 348: `global.key = assignKey`).

## Why only SS/PPT/PDF — not doc editor

Prior to fixing the `var Common` scoping bug (see `webpack5-var-common-scoping.md`), **all** editors crashed immediately at `Common.Locale.apply(callback)` before reaching the Shortcuts/keymaster module chain. Once that fix allowed editors to boot further, the keymaster bug became visible in SS/PPT/PDF. Doc editor either evaluates `keymaster.js` later in its module chain (where the `key` identifier has already been set on `window`) or simply doesn't trigger the code path on first boot — but the bug exists in doc editor too.

## Fix — two rules in `themeReplacements()` in `build/theme.config.mjs`

### Rule 1: UMD export guard
```js
{
  search: "if(typeof module !== 'undefined') module.exports = key;",
  replace: "if(typeof module !== 'undefined') module.exports = assignKey;",
},
```

### Rule 2: Global binding — `window.key` never set
A second, related issue: keymaster's IIFE is `(function(global){...})(this)`. Inside a webpack factory, `this` is `module.exports` (a plain `{}`), not `window`. So `global.key = assignKey` (line 348) sets the property on the factory's local exports object — `window.key` is never touched.

All callers of `window.key.*` in the codebase (`Shortcuts.js:86`, `DocumentHolderExt.js:4287`, `Toolbar.js:1291`) then get `TypeError: Cannot set properties of undefined`. The sequence of errors is: var Common crash → keymaster ReferenceError → `window.key.filter` TypeError — each fix unmasked the next.

```js
{
  search: 'global.key = assignKey;',
  replace: 'global.key = assignKey; window.key = assignKey;',
},
```

`global.key = assignKey` is unique to keymaster.js across the entire codebase, so this rule is safe as a global replacement. It mirrors the assignment to `window`, ensuring all `window.key.*` callers work regardless of what `global` is in the webpack context.

The source file `apps/common/main/lib/core/keymaster.js` is **not** modified. Both fixes are purely in the build config.

## Where the fix lives

`build/theme.config.mjs` — `themeReplacements()` function, entries 2 and 3 in the returned array.

## Broader pattern

This is a latent UMD/webpack incompatibility. Any library that uses `typeof module !== 'undefined'` as a CommonJS export guard and references `window.*` globals in the export expression will fail the same way under webpack. If similar `ReferenceError` failures appear in other library files, check `lib/core/` and `vendor/` for the same pattern.
