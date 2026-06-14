# Finding: `var Common` namespace guard fails in webpack factory (117 files)

## Symptom

Various runtime errors immediately on editor load, depending on which module evaluates first:
- `TypeError: Cannot read properties of undefined (reading 'apply')` at `Common.Locale.apply(callback)` in `locale.js`
- `TypeError: Cannot set properties of undefined (setting 'CheckBoxTemplate')` in UI component files
- Silent: modules successfully define properties on a factory-local `Common` object that no other module can see

Editors show skeleton UI but never fully load. No obvious build-time error.

## Root cause

**webpack module factory scope.** webpack wraps every module in a factory function:
```js
(module, exports, __webpack_require__) => {
  // module code here
}
```
Inside this factory, `var` declarations are **function-scoped** — they never become `window` properties, regardless of where they appear in the source.

The codebase uses a namespace guard pattern in 117 files:
```js
if (Common === undefined) var Common = {};
Common.SomeNamespace = { ... };
```
In a classic browser `<script>` context, `var Common` at module top-level becomes `window.Common`, so this works as an accumulating namespace. Under webpack, `var Common` creates a factory-local variable. The module sets `Common.SomeNamespace` on its own local copy. `window.Common` is never touched. The next module that expects `window.Common.SomeNamespace` to exist finds `undefined`.

This affects **all** modules using the guard — 117 files across all editors.

## Why it was hidden

Prior to the fix, `locale.js` was excluded from webpack processing via `noParse: /locale\.js$/`. This bypassed the AMD parser (needed to avoid a different crash — see `webpack5-locale-amd-parser-crash.md`) but still wrapped the file in a factory function. `var Common = {}` in `locale.js` became factory-local. `Common.Locale` was set on the local copy. `app.js` called `window.Common.Locale.apply(...)` and failed immediately. This masked the same bug in the 116 other files.

## Fix

Global `string-replace-loader` rule in `themeReplacements()` in `build/theme.config.mjs`:

```js
{
  search: 'if \\(Common === undefined\\)(?:\\s*\\{)?\\s+var Common = \\{\\};(?:\\s*\\})?',
  replace: 'window.Common = window.Common || {};\nvar Common = window.Common;',
  flags: 'g',
},
```

Applied to all `.js` files under `APPS_ROOT` via the rule in all four webpack configs. The regex handles three variants:
- No braces: `if (Common === undefined) var Common = {};`
- With braces: `if (Common === undefined) { var Common = {}; }`
- Nested (inside `define()` factory): same patterns

The replacement ensures `window.Common` is the accumulating namespace, and the local `var Common` is just a reference alias so existing code does not need to change.

## Where the fix lives

`build/theme.config.mjs` — `themeReplacements()` function, first entry in the returned array.

Applied via `webpack.{editor}.mjs` rule:
```js
{
  test: /\.js$/,
  include: APPS_ROOT,
  loader: 'string-replace-loader',
  options: { multiple: themeReplacements(productVersion) },
},
```

## Do not regress

- Do not remove the `string-replace-loader` rule from any editor's webpack config.
- Do not use `noParse` for `locale.js` — it was the original workaround that hid this bug without fixing it. See `webpack5-locale-amd-parser-crash.md` for the correct fix.
