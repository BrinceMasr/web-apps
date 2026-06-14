# Finding: `locale.js` crashes webpack AMD parser during build

## Symptom

webpack build throws during parsing of `apps/common/locale.js`:
```
TypeError: Cannot read properties of undefined (reading 'addPresentationalDependency')
```
Build exits non-zero. No output produced.

## Root cause

`locale.js` contains a dead polyfill branch (lines ~171–180 in the original source):
```js
if ( !window.fetch ) {
    require([polyfillList], function() {
        _requireLang();
    });
} else _requireLang();
```

The `require([...], callback)` call here is AMD syntax — but it appears **inside a plain IIFE body**, not inside a `define()` factory. webpack's AMD parser plugin (`RequireJsStuffPlugin` / AMD handling hooks) processes `require([...], cb)` by registering a "presentational dependency" on the **current module's factory context**. When there is no enclosing `define()` factory, that context is `undefined`, and the `.addPresentationalDependency()` call throws.

The polyfill branch is dead code: `fetch` and `Promise` are always native in all target browsers (modern Chrome, Firefox, Safari, Edge). The `if (!window.fetch)` branch never executes.

## Fix

A `string-replace-loader` rule that strips the dead branch before the AMD parser sees it:

```js
{
  test: /common[/\\]locale\.js$/,
  loader: 'string-replace-loader',
  options: {
    multiple: [
      {
        search: 'if \\( !window\\.fetch \\) \\{[\\s\\S]*?\\} else _requireLang\\(\\);',
        replace: '    _requireLang();',
        flags: 'g',
      },
    ],
  },
},
```

This rule is in all four `build/webpack.{editor}.mjs` configs immediately after the global `themeReplacements` rule.

## Prior approach — do not use

The original workaround was `noParse: /locale\.js$/` in the webpack config. This bypasses AMD parsing for the file entirely, but still wraps it in a webpack module factory. The consequence: the `var Common = {}` namespace guard in `locale.js` becomes factory-local (not `window.Common`), silently breaking `Common.Locale` across all editors. See `webpack5-var-common-scoping.md`.

**Never use `noParse` for `locale.js`.**

## Where the fix lives

`build/webpack.documenteditor.mjs` (and spreadsheet, presentation, visio) — the `locale.js`-specific `string-replace-loader` rule block.

The source file `apps/common/locale.js` is **not** modified — the fix is entirely in the build config.
