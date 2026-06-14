# Icon Migration: PNG Sprites → SVG Symbols

Commit `8da675d900` (chore: remove obsolete DPI-scaled PNG toolbar icon spritesheets)
removed all PNG sprite sheets. This left many places in the codebase still using
`<i class="icon toolbar__icon btn-xxx">` or `<div class="icon toolbar__icon btn-xxx">`
elements with no CSS backing.

All fixes replace these with:
```html
<svg class="icon uni-scale"><use href="#btn-xxx"></use></svg>
```

SVG symbols are defined per-editor in `apps/{editor}/main/resources/img/toolbar/icons.svg`
and injected into the DOM at startup. `btn-*` icons use CSS `currentColor` for theming.

---

## How SVG sprites are loaded

`index_loader.html` for each editor includes:
```html
<script src="../../../vendor/svg-injector/svg-injector.min.js"></script>
<img class="inline-svg" src="resources/img/toolbar/icons.svg">
...
<script>
    var svgpoints = document.querySelectorAll('img.inline-svg');
    SVGInjector(svgpoints);
</script>
```
`SVGInjector` (vendor lib) fetches each SVG and replaces the `<img>` with inline `<svg>` so `<use href="#symbol-id">` references resolve. `Common.Utils.injectSvgIcons()` in controllers is a no-op stub — injection happens at load time via the loader HTML, not at runtime.

---

## CSS sizing for btn-* icons in sidebar buttons

`.btn-category .icon { width: @x-small-btn-icon-size; height: @x-small-btn-icon-size; }` in `buttons.less` sizes `svg.icon.uni-scale` elements inside sidebar tab buttons — so `uni-scale` works correctly there (unlike in the animation picker where the container has `:not(svg)` exclusion rules).

`common.less` sets `svg.icon { fill: none; }` globally. Safe for `btn-*` icons because they are stroke-based (use `stroke="currentColor"` and `class="icon-stroke-gray-primary"` on paths). Never affects animation icons because those have explicit `fill` attributes on their paths and don't carry `class="icon"`.

---

## Legacy iconCls prefix `toolbar__icon btn-xxx`

Several JS files (`ShapeSettings.js` in pdf/document/spreadsheet/presentation editors, `Toolbar.js` in spreadsheet editor, `ChartSettings.js` in spreadsheet editor, `SideMenu.js`) still use `iconCls: 'toolbar__icon btn-menu-xxx'`. Button.js regex `/btn-[^\s]+/` correctly extracts `btn-menu-xxx` and renders `<svg class="icon uni-scale">`, so these work despite the prefix. The `toolbar__icon` portion is ignored at render time — it has no CSS backing post-sprite-removal but causes no harm.

---

## Files fixed (branch: fix/presentation-click-offset, merged to main)

### RightMenu templates — all 4 editors
Pattern: `<i class="icon toolbar__icon btn-xxx">&nbsp;</i>`
→ `<svg class="icon uni-scale"><use href="#btn-xxx"></use></svg>`

- `apps/documenteditor/main/app/template/RightMenu.template`
- `apps/presentationeditor/main/app/template/RightMenu.template`
- `apps/spreadsheeteditor/main/app/template/RightMenu.template`
- `apps/pdfeditor/main/app/template/RightMenu.template`

### StatusBar templates — all 5 editors + CellEditor
Same `<i>` → `<svg>` pattern.

- `apps/documenteditor/main/app/template/StatusBar.template`
- `apps/presentationeditor/main/app/template/StatusBar.template`
- `apps/spreadsheeteditor/main/app/template/StatusBar.template`
- `apps/pdfeditor/main/app/template/StatusBar.template`
- `apps/visioeditor/main/app/template/StatusBar.template`
- `apps/spreadsheeteditor/main/app/template/CellEditor.template`

### Tab.js (common)
`apps/common/main/lib/component/Tab.js` line ~51
Old: icon as `className` on a bare `<div class="toolbar__icon iconCls">`
New: `<div class="toolbar__icon"><svg class="icon uni-scale"><use href="#iconCls"></use></svg></div>`

Note: `btn-*` regex in `Button.js` only handles `btn-*` prefixed icons automatically.
Tab icons needed manual SVG wrapping.

### PluginDlg.js (common)
`apps/common/main/lib/view/PluginDlg.js` lines 211, 229
Old: `$('<div id="..." class="tool custom toolbar__icon ' + iconCls + '"></div>')`
New: `$('<div id="..." class="tool custom toolbar__icon"><svg class="icon uni-scale"><use href="#' + iconCls + '"></use></svg></div>')`

### DocumentPreview.js (presentation editor)
`apps/presentationeditor/main/app/view/DocumentPreview.js` lines 70-72, 88, 90
5 buttons: prev/play/next/fullscreen/close — `<i>` → `<svg>`, preserving `icon-rtl` class on SVG.

### LanguageDialog.js (common)
`apps/common/main/lib/view/LanguageDialog.js` lines 86, 98
`btn-ic-docspell` icon. Line 86 was a `<span>`, line 98 was a conditional `<i>`.
Preserve `spellcheck-lang` class on SVG.

### ShortcutsDialog.js (common)
`apps/common/main/lib/view/ShortcutsDialog.js` lines 99, 103
`btn-lock` (preserve `icon-lock` class) and `btn-edit`.

### ShortcutsEditDialog.js (common)
`apps/common/main/lib/view/ShortcutsEditDialog.js` lines 238, 240
`btn-menu-about` (preserve `lock-info-icon` class) and `btn-cc-remove`.

### AutoFilterDialog.js (spreadsheet editor)
`apps/spreadsheeteditor/main/app/view/AutoFilterDialog.js` line ~1619
Tree caret: `<i class="icon toolbar__icon btn-tree-caret <% if (!isExpanded) { %>up<% } %>"`
→ `<svg class="icon uni-scale btn-tree-caret<% if (!isExpanded) { %> up<% } %>"><use href="#btn-tree-caret"></use></svg>`
The `up` modifier class goes on the SVG element itself (not inside).

### Statusbar.js (document editor, lowercase b)
`apps/documenteditor/main/app/view/Statusbar.js` line ~262
Spellcheck icon conditional: the SVG renders `<use>` only when spellcheck is on.
File was renamed `StatusBar.js` → `Statusbar.js` (commit `290e7c96d5`);
always use lowercase `b` path when git-adding.

---

## Animation panel icons (branch: fix/presentation-click-offset)

### Problem
`apps/presentationeditor/main/app/view/Animation.js` (lines 204, 516) and
`apps/presentationeditor/main/app/view/AnimationDialog.js` (line 95)
use `animation-*` prefixed icons (e.g. `animation-entrance-appear`).

These are NOT `btn-*` icons — they are full-colour SVG symbols with
explicit `fill="#..."` attributes on their paths. They must NOT use
`<svg class="icon uni-scale">` or `<svg class="svg-icon">` because:

1. `uni-scale` has no width/height — SVG defaults to 300px wide.
2. `svg-icon` sets `fill: currentColor` which overrides the explicit
   fill colours (SVG presentation attributes have lower CSS specificity).
3. The CSS rule `.icon:not(svg)` in `combo-dataview.less` explicitly
   excludes SVG elements from the x-huge icon size constraint.

### Fix
Use explicit SVG attributes — no CSS class:
```html
<svg width="28" height="28"><use href="#animation-entrance-appear"></use></svg>
```
All animation symbols have `viewBox="0 0 28 28"`, so 28×28 is correct.
AnimationDialog.js wraps with `<% if (iconCls) { %>...<% } %>` since
iconCls may be absent there.

---

---

## Unfixed: Transitions.js ComboDataView itemTemplate (presentation editor)

`apps/presentationeditor/main/app/view/Transitions.js` line 142 uses the old CSS-class pattern:

```js
itemTemplate: _.template([
    '<div class="btn_item x-huge" id="<%= id %>" style="width:88px;height:40px;">',
    '<div class="icon toolbar__icon options__icon <%= imageUrl %>"></div>',  // ← legacy CSS class
    '<div class="caption"><%= title %></div>',
    '</div>'
].join(''))
```

All 11 transition icons (`btn-transition-none`, `btn-transition-morph`, etc.) are blank because:
- Their CSS classes have no backing (PNG sprites removed in `8da675d900`)
- `app.css` has zero `btn-transition-*` rules
- The SVG symbols DO exist in `icons.svg` — symbol IDs match the `imageUrl` values

**Probable fix:** Replace the `<div class="... <%= imageUrl %>">` with the SVG pattern, sized explicitly to match the 88×40 item container:
```js
'<svg class="icon uni-scale options__icon"><use href="#<%= imageUrl %>"></use></svg>',
```
Confirm `options__icon` LESS rule provides the right size, or set explicit `width`/`height` on the SVG. Verify that `uni-scale` + `options__icon` together don't conflict (see `.icon:not(svg)` exclusion rules described in the Animation panel icons section).

---

## Key rules for future icon work

- Always check if the icon ID exists as a `<symbol>` in the relevant `icons.svg`
  before replacing; the symbol names match the old CSS class names.
- `btn-*` icons: use `<svg class="icon uni-scale"><use href="#btn-xxx"></use></svg>`
- `animation-*` icons: use `<svg width="28" height="28"><use href="#..."></use></svg>`
- Never add `fill: currentColor` class to animation icons — they use explicit colours.
- When adding SVG to a flex/grid item container, confirm the container's CSS
  doesn't have `:not(svg)` size rules that would leave the SVG unsized.
