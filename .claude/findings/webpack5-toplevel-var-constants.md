# Finding: Top-level `var` constants outside `define()` not visible as globals

Two distinct forms of this pattern exist in the codebase, each with its own fix rule.

---

## Form 1: `c_*` object-literal constants

### Symptom

`ReferenceError: c_paragraphLinerule is not defined` (or any `c_*` constant) at runtime, in views or controllers that reference these as bare globals.

### Root cause

Files declare shared constants at the **top of the file, before `define()`**:

```js
var c_paragraphLinerule = {
    LINERULE_LEAST: 0,
    ...
};

define(['core', 'editor/view/DocumentHolder'], function() {
    'use strict';
    // controller logic here — uses c_paragraphLinerule as bare global
});
```

Under r.js concatenation, top-level `var` IS `window.*`. Under webpack, every file is a module factory — top-level `var` is factory-local and never reaches `window`. Other modules that reference `c_paragraphLinerule` as a bare global get `ReferenceError`.

### The 9 affected constants (all object literals)

`c_oAscFrameWrap`, `c_oHyperlinkType`, `c_pageNumPosition`, `c_paragraphLinerule`, `c_paragraphSpecial`, `c_paragraphTextAlignment`, `c_tableAlign`, `c_tableBorder`, `c_tableWrap`

Consumer blast radius: ~30 files. `c_paragraphLinerule` appears in 16 files across all editors including `apps/common/main/lib/controller/ReviewChanges.js`.

### Fix rule

```js
{
  search: '^var (c_[a-zA-Z]+) = \\{',
  replace: 'var $1 = window.$1 = {',
  flags: 'gm',
}
```

---

## Form 2: ALL_CAPS primitive constants

### Symptom

`ReferenceError: MENU_SCALE_PART is not defined` (or `SCALE_MIN`, `MENU_BASE_WIDTH`, `FONT_TYPE_RECENT`) at runtime, typically in `Viewport.js` or `Fonts.js`.

### Root cause

Same pattern, but with numeric values instead of object literals:

```js
var SCALE_MIN = 40;          // RightMenu.js, before define()
var MENU_SCALE_PART = 260;
var MENU_BASE_WIDTH = 220;

define([...], function() { ... });
```

These are used cross-file: `Viewport.js` references `SCALE_MIN` as a bare global, `Fonts.js` references `FONT_TYPE_RECENT`. Under webpack, factory scoping hides them.

**NOT matched by the `c_*` rule** (which requires `= \{`).

### Affected files

| Constant | Declared in | Used in |
|---|---|---|
| `SCALE_MIN` | `{de,sse,ppe,pdf}/view/RightMenu.js` | `Viewport.js` (×4) |
| `MENU_SCALE_PART` | `{de,sse,ppe,pdf}/view/RightMenu.js` | `Viewport.js` (×4) |
| `MENU_BASE_WIDTH` | `{de,sse,ppe,pdf}/view/RightMenu.js` | `Viewport.js` (×4) |
| `FONT_TYPE_RECENT` | `common/lib/component/ComboBoxFonts.js` | `common/lib/controller/Fonts.js` |

### Fix rule

```js
{
  search: '^var ([A-Z][A-Z0-9_]+) = ',
  replace: 'var $1 = window.$1 = ',
  flags: 'gm',
}
```

### `^` anchor is critical for both rules

`LeftMenu.js` files also declare `var SCALE_MIN = 40` and `var MENU_SCALE_PART = 300`, but **inside** the `define()` factory (indented, e.g. `    var SCALE_MIN`). The `^` anchor with `m` flag ensures only column-0 declarations are promoted. Indented inside-define vars must NOT be promoted — their module-local binding is correct and their values differ (300 vs 260).

Similarly for `c_*`: without `^`, the regex would also match 5 indented `c_oAscMathMainTypeStrings` locals (one per editor) that would clobber each other on `window`.

---

## Both fixes live in `build/theme.config.mjs` — `themeReplacements()` function.
