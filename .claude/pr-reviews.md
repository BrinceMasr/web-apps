# PR Review Notes

---

## PR #66 — feature: add UI support for the checkbox (spreadsheet editor)

**Author:** DmySyz  
**Status:** Draft  
**URL:** https://github.com/Euro-Office/web-apps/pull/66

### What it does
Adds a checkbox form control to the spreadsheet editor toolbar (Insert tab). Clicking inserts a checkbox on the sheet via `api.asc_addCheckBoxOnSheet()`. Right-clicking an inserted checkbox shows a "Format Control" context menu item that opens `CheckBoxSettingsDialog` (new) to set checked state and cell link.

### Files changed (non-locale)
- `controller/DocumentHolderExt.js` — adds `onCheckBoxAdvanced` handler, `ischeckboxmenu` detection in `fillMenuProps`
- `controller/RightMenu.js` — adds `continue` guard to skip right panel for form controls
- `controller/Toolbar.js` — adds `onInsertCheckBoxClick`
- `template/Toolbar.template` — adds `slot-btn-inscheckbox`
- `view/CheckBoxSettingsDialog.js` — new dialog (extends `AdvancedSettingsWindow`)
- `view/DocumentHolderExt.js` — defines `mnuCheckBoxAdvanced` menu item
- `view/Toolbar.js` — defines `btnInsertCheckBox`
- `app_dev.js`, `app_pack.js` — registers new view

### Issues flagged

1. **Raw property access in `_setDefaults`**  
   `props.checked` is accessed directly. Everywhere else props objects use `asc_getXxx()` getter methods. Fragile if the SDK renames the property.

2. **Hardcoded state constants**  
   `CHECKED_UNCHECKED = 0`, `CHECKED_CHECKED = 1`, `CHECKED_MIXED = 2` are re-declared locally with a comment pointing to `CFormControlPr_checked_*` in Controls.js. Should use an `Asc.*` enum instead.

3. **No right-panel for checkbox**  
   `RightMenu.js` deliberately skips form controls (`continue` guard), so selecting a checkbox shows nothing in the right panel. Confirm this is intentional, not an omission.

4. **No mobile coverage**  
   `apps/spreadsheeteditor/mobile/` is untouched. Insert button and context menu dialog both need mobile equivalents.

5. **Locale files inflated**  
   49k+ line additions because all 44 locale files were committed wholesale, not just the new checkbox keys. Also includes unrelated keys (Solver, DataTab, etc.) confirming full locale rebuilds were committed rather than deltas.

---

## PR #77 — Feature/smart picker

**Author:** Christoph Schaefer  
**Status:** Open  
**URL:** https://github.com/Euro-Office/web-apps/pull/77  
**Verdict:** Block merge — two confirmed regressions unrelated to the feature

---

### Human overview

This PR adds a Smart Picker toolbar button to the Document, Presentation, and Spreadsheet editors. Clicking it fires the existing `onRequestSmartPicker` gateway event, passing selected text and a new `source` tag (`'toolbar'` or `'contextmenu'`). The feature itself is small and well-scoped. The problem is that the DocumentEditor changes contain two accidental regressions that break unrelated functionality, plus a silent behaviour change to link insertion.

**The two blockers to fix before merge:**

1. In `apps/documenteditor/main/resources/img/toolbar/icons.svg`, the `btn-zoomdown` and `btn-zoomup` SVG symbols were deleted and replaced by the new `btn-smart-picker` symbol instead of appended. These symbols are referenced by `StatusBar.template`, `FormSettings.js`, `FormsTab.js`, and `Toolbar.js` — the status bar zoom buttons and form zoom controls will render broken icons.

2. In `apps/documenteditor/main/app/controller/Toolbar.js` around line 426, five existing event bindings were replaced by the single smart-picker binding instead of added alongside them. The five removed bindings — for the symbol character picker, content-controls colour (no-colour option), content-controls colour picker, and line-numbers menu (item selection and show state) — are not re-added anywhere else on the branch. All five features will silently stop working in the document editor.

**Other issues worth addressing:**

- The `insertLink` gateway handler in the DocumentEditor was changed from creating a proper `CHyperlinkProperty` hyperlink to pasting plain text via `pluginMethod_PasteText`. The Presentation and Spreadsheet editors still use the hyperlink API. Links inserted via the Gateway will no longer be clickable in the document editor.
- The button is always forced visible via `setVisible(true)` with no check for whether the Nextcloud Assistant feature is available on the instance. The existing NC assistant flow uses the `setAssistantAvailable` gateway event for this — the new button should mirror that pattern.
- The `btn-smart-picker` SVG symbols added to all three `icons.svg` files are dead code. The button uses `iconCls: 'toolbar__icon btn-nc-assistant'`; `Button.js` extracts `btn-nc-assistant` from that string and renders `<use href="#btn-nc-assistant">`. A `btn-nc-assistant` symbol already exists in all three sprites. The new `btn-smart-picker` entries are never referenced.
- `btn-nc-assistant.svg` (v2/2.5x) was re-saved from Inkscape, adding ~35 lines of editor metadata (`sodipodi:namedview`, `inkscape:*`) with no rendering effect. The path also uses hardcoded `stroke:#000000` instead of `currentColor`, so it won't respond to theme changes.
- Control-group registration is inconsistent across editors: DE adds the button only to `paragraphControls`; PE adds it to both `paragraphControls` and `lockControls`; SSE adds it to neither.

---

### AI validation prompt

> I'm reviewing a pull request and want you to validate some findings. Please fetch the diff from `https://github.com/Euro-Office/web-apps/pull/77` and check the following specific claims. For each one, tell me whether the diff confirms it, refutes it, or is inconclusive.
>
> **Claim 1 — Zoom icons deleted from DocumentEditor sprite**
> In `apps/documenteditor/main/resources/img/toolbar/icons.svg`, the symbols `btn-zoomdown` and `btn-zoomup` are removed by this PR (replaced rather than appended). Cross-check: in the same PR, `apps/presentationeditor/main/resources/img/toolbar/icons.svg` and `apps/spreadsheeteditor/main/resources/img/toolbar/icons.svg` keep both symbols intact. Also check whether `apps/documenteditor/main/app/template/StatusBar.template` and `apps/documenteditor/main/app/view/FormSettings.js` contain `<use href="#btn-zoomdown">` or `<use href="#btn-zoomup">` (or `iconCls` references to them) — if so, removal is a live regression.
>
> **Claim 2 — Five event bindings removed from DocumentEditor Toolbar controller**
> In `apps/documenteditor/main/app/controller/Toolbar.js`, the following five `.on(...)` bindings are deleted and not re-added anywhere else in the diff:
> - `toolbar.mnuInsertSymbolsPicker.on('item:click', _.bind(this.onInsertSymbolItemClick, this))`
> - `toolbar.mnuNoControlsColor.on('click', _.bind(this.onNoControlsColor, this))`
> - `toolbar.mnuControlsColorPicker.on('select', _.bind(this.onSelectControlsColor, this))`
> - `toolbar.btnLineNumbers.menu.on('item:click', _.bind(this.onLineNumbersSelect, this))`
> - `toolbar.btnLineNumbers.menu.on('show:after', _.bind(this.onLineNumbersShow, this))`
> Confirm these are removed and not moved elsewhere in the same file or any other changed file.
>
> **Claim 3 — insertLink changed to plain-text paste in DocumentEditor only**
> In `apps/documenteditor/main/app/controller/Toolbar.js`, the `insertLink` function previously created an `Asc.CHyperlinkProperty` and called `this.api.add_Hyperlink(props)`. The PR replaces this with `this.api["pluginMethod_PasteText"](data)`. Confirm the Presentation and Spreadsheet editors' `insertLink` functions are unchanged and still use the hyperlink API.
>
> **Claim 4 — btn-smart-picker sprite entries are dead code**
> The buttons in all three editors use `iconCls: 'toolbar__icon btn-nc-assistant'`. The new SVG symbols added to the sprite files use `id="btn-smart-picker"`. Confirm that no `<use href="#btn-smart-picker">` or `iconCls` reference to `btn-smart-picker` appears anywhere in the diff, making the new symbols unreferenced.
>
> **Claim 5 — No feature-availability guard on setVisible**
> In all three Toolbar controllers, `btnSmartPicker.setVisible(true)` is called unconditionally after render. Confirm there is no check against a config flag, app option, or `setAssistantAvailable` event result before this call.

---

### Fixes

#### Fix 1 — Restore zoom icons in `apps/documenteditor/main/resources/img/toolbar/icons.svg`

The `btn-smart-picker` symbol replaced the zoom symbols instead of following them. Change:

```diff
-</symbol><symbol viewBox="0 0 24 24" fill="currentColor" id="btn-smart-picker" xmlns="http://www.w3.org/2000/svg">
-    <path d="M19,1L17.74,3.75L15,5L17.74,6.26L19,9L20.25,6.26L23,5L20.25,3.75M9,4L6.5,9.5L1,12L6.5,14.5L9,20L11.5,14.5L17,12L11.5,9.5M19,15L17.74,17.74L15,19L17.74,20.25L19,23L20.25,20.25L23,19L20.25,17.74"/>
+</symbol><symbol viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" id="btn-zoomdown" xmlns="http://www.w3.org/2000/svg">
+    <path d="M17.5 11.5h-12" class="icon-stroke-gray-primary"/>
+</symbol><symbol viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" fill="none" id="btn-zoomup" xmlns="http://www.w3.org/2000/svg">
+    <path d="M11.5 5.5v6m0 0v6m0-6h6m-6 0h-6" class="icon-stroke-gray-primary"/>
 </symbol></svg>
```

The `btn-smart-picker` entry can be dropped entirely — see Fix 5.

---

#### Fix 2 — Restore the five missing bindings in `apps/documenteditor/main/app/controller/Toolbar.js`

```diff
             toolbar.btnInsertSymbol.menu.items[2].on('click',           _.bind(this.onInsertSymbolClick, this));
+            toolbar.mnuInsertSymbolsPicker.on('item:click',             _.bind(this.onInsertSymbolItemClick, this));
+            toolbar.mnuNoControlsColor.on('click',                      _.bind(this.onNoControlsColor, this));
+            toolbar.mnuControlsColorPicker.on('select',                 _.bind(this.onSelectControlsColor, this));
+            toolbar.btnLineNumbers.menu.on('item:click',                _.bind(this.onLineNumbersSelect, this));
+            toolbar.btnLineNumbers.menu.on('show:after',                _.bind(this.onLineNumbersShow, this));
             toolbar.btnSmartPicker.on('click',                          _.bind(this.onSmartPickerClick, this));
```

---

#### Fix 3 — Revert `insertLink` in `apps/documenteditor/main/app/controller/Toolbar.js`

Keep the null guard; revert the body to the hyperlink API:

```diff
         insertLink: function(data) { // gateway
-            if (!this.api) {
-                return;
-            }
-            // Use pluginMethod_PasteText to insert the link as plain text
-            if (typeof this.api["pluginMethod_PasteText"] === 'function') {
-                this.api["pluginMethod_PasteText"](data);
-            }
+            if (!this.api) return;
+            var props = new Asc.CHyperlinkProperty();
+            props.put_Value(data);
+            props.put_Bookmark(null);
+            props.put_Text(data);
+            this.api.add_Hyperlink(props);
             Common.NotificationCenter.trigger('storage:link-insert', data);
         },
```

---

#### Fix 4 — Feature-availability guard (all three Toolbar controllers)

The existing pattern: `DocumentHolder.js` sets `view.ncAssistantAvailable` when `setassistantavailable` fires; the context menu item reads it on each open. The toolbar button should follow the same signal.

In each editor's `Toolbar.js` controller, replace the unconditional `setVisible(true)` block:

```diff
-            // Smart Picker button visibility: always visible (provider selection).
-            if (me.toolbar.btnSmartPicker) {
-                me.toolbar.btnSmartPicker.setVisible(true);
-            }
+            Common.Gateway.on('setassistantavailable', function(available) {
+                me.toolbar.btnSmartPicker && me.toolbar.btnSmartPicker.setVisible(!!available);
+            });
```

The button is hidden by default and only appears once Nextcloud reports the assistant is available — consistent with the context menu item.

---

#### Fix 5 — Remove dead `btn-smart-picker` sprite entries

The button resolves to `btn-nc-assistant` (already present in all three sprites). Remove the unused `btn-smart-picker` symbol from all three files:

- `apps/documenteditor/main/resources/img/toolbar/icons.svg`
- `apps/presentationeditor/main/resources/img/toolbar/icons.svg`
- `apps/spreadsheeteditor/main/resources/img/toolbar/icons.svg`

```diff
-</symbol><symbol viewBox="0 0 24 24" fill="currentColor" id="btn-smart-picker" xmlns="http://www.w3.org/2000/svg">
-    <path d="M19,1L17.74,3.75L15,5L17.74,6.26L19,9L20.25,6.26L23,5L20.25,3.75M9,4L6.5,9.5L1,12L6.5,14.5L9,20L11.5,14.5L17,12L11.5,9.5M19,15L17.74,17.74L15,19L17.74,20.25L19,23L20.25,20.25L23,19L20.25,17.74"/>
 </symbol>
```

---

#### Fix 6 — Clean `apps/common/main/resources/img/toolbar/v2/2.5x/btn-nc-assistant.svg`

Strip Inkscape metadata and replace the hardcoded `stroke:#000000` with `currentColor`:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <path
    d="M 17.385,3.538 16.416,5.653 14.308,6.615 16.416,7.584 17.385,9.692 18.347,7.584 20.462,6.615 18.347,5.653 Z M 9.692,5.846 7.769,10.077 3.538,12 7.769,13.923 9.692,18.154 11.615,13.923 15.847,12 11.615,10.077 Z m 7.693,8.462 -0.969,2.108 -2.108,0.969 2.108,0.962 0.969,2.116 0.962,-2.116 2.116,-0.962 -2.116,-0.969 z"
    stroke="currentColor" stroke-width="0.6" stroke-linejoin="round"/>
</svg>
```

---

#### Fix 7 — Align `paragraphControls`/`lockControls` registration

**DocumentEditor** `apps/documenteditor/main/app/view/Toolbar.js` — add to `lockControls`:

```diff
                 this.paragraphControls.push(this.btnSmartPicker);
+                this.lockControls.push(this.btnSmartPicker);
```

**SpreadsheetEditor** `apps/spreadsheeteditor/main/app/view/Toolbar.js` — add both (after the `btnSmartPicker` constructor block):

```diff
+                me.paragraphControls.push(me.btnSmartPicker);
+                me.lockControls.push(me.btnSmartPicker);
```

---

## PR #56 — fix: Fix show-password toggle in PasswordField

**Author:** wapec (Bohdan Baranov)  
**Status:** Approved (Julius, 2026-06-10)  
**Branch:** `fix/password-field-type-typo`  
**URL:** https://github.com/Euro-Office/web-apps/pull/56

---

### What it does

Two fixes to the `PasswordField` component used in the document-protection and file-encryption dialogs:

1. Fixes the input type typo: `type={isShowPassword ? 'type' : 'password'}` → `type={isShowPassword ? 'text' : 'password'}` (the old value `"type"` is not a valid HTML input type, so the password was never revealed).
2. Makes the show/hide toggle visible on iOS. Previously the toggle was guarded by `{!isIos ? <span> : null}`, so it was hidden on iOS entirely. The PR removes that guard, adds iOS-specific icon imports (`IconShowPasswordIos`/`IconHidePasswordIos`), and adds a `.password-field` CSS block to `app-ios.less` with flex layout and 24×24 icon sizing.

---

### Julius's comments (2026-06-10)

Julius approved but flagged two gaps:

1. The PR description claims `<button>` + `aria-pressed` + `aria-label` were implemented, but the actual code still uses `<span onClick>` with no accessibility attributes and no keyboard behaviour.
2. Asked whether the test plan checklist was verified during development.

---

### Review findings

> **Scope note:** Findings are against the PR diff only. Pre-existing lines that the diff does not touch are noted as such.

**1. CONFIRMED — Toggle span is completely keyboard-inaccessible** *(corroborates Julius)*  
`PasswordField.jsx` line 33 — in diff  
`<span onClick={toggleShowPassword} className='password-field__toggle'>` has no `tabIndex`, no `role`, no `aria-pressed`, no `aria-label`, and no `onKeyDown`. A `<span>` is not in the browser's tab order and carries no implicit ARIA role, so keyboard-only users cannot reach or activate the control, and screen readers receive no semantics. Julius flagged the same gap; this confirms it and provides the concrete fix: replace with `<button type="button" aria-pressed={isShowPassword} aria-label={...}>`.

**2. MINOR — `.password-field__toggle` wrapper has no sizing or cursor rules** *(new finding)*  
`app-ios.less` line 106, `app-material.less` line 147 — in diff  
Neither LESS block defines any rules for `&__toggle`. The 24×24 minimum dimensions added by this PR are on `&__icon` (the inner SVG), not on the tappable wrapper. At 24px the wrapper meets WCAG 2.5.8 AA (24px minimum) but falls short of the stricter Apple HIG ≥44pt target. Adding `min-width: 44px; min-height: 44px` (or equivalent padding) to `&__toggle` in both files would meet the HIG bar.

**3. NIT — `maxLength || null` coerces `0` to no limit** *(pre-existing, not changed by this PR)*  
`PasswordField.jsx` line 36 — not in diff  
`maxLength={maxLength || null}` treats `maxLength={0}` as falsy. No current caller passes `0` so this is not a live bug. The safer operator is `maxLength ?? null`. Low priority: mention only if opening the file to fix Finding 1 anyway.

**iOS icon imports confirmed:** `apps/common/mobile/resources/icons/ios/icon-show-password.svg` and `icon-hide-password.svg` both exist.

---

### Suggested comment text for the PR

> **Keyboard accessibility still missing**
>
> The PR description claims a `<button>` with `aria-pressed` and `aria-label` was used — Julius already noted the discrepancy. Since Julius's approval is already in, this is the main thing worth resolving before merge.
>
> Replacing the `<span>` with a native `<button type="button">` takes about 5 lines and delivers everything promised in the description: keyboard focus, Enter/Space activation, `aria-pressed` state, and a translatable `aria-label`. The i18n keys (`textShowPassword` / `textHidePassword`) would need to be added to `en.json`; the CI merge script propagates them to all other locales automatically.
>
> The `.password-field__toggle` class also has no CSS rules anywhere — no cursor, no explicit sizing on the wrapper. The 24×24 minimum is on the inner SVG only. The wrapper sits at the WCAG 2.5.8 AA floor (24px) but doesn't reach the Apple HIG ≥44pt target. Adding `min-width: 44px; min-height: 44px` (or equivalent padding) to `&__toggle` in both LESS files would close that gap.

---

## PR #31 — feature/smart-picker (eurooffice-nextcloud)

**Author:** Christoph Schaefer  
**Status:** Open  
**URL:** https://github.com/Euro-Office/eurooffice-nextcloud/pull/31  
**Verdict:** Block merge — build artifact with broken CSS imports; link insertion bypasses documented API

**Post-review correction (2026-06-05):** Finding 1 was overstated. The iframe traversal is functional: `api.js:1286` confirms `iframe.name = "frameEditor"` and `api.js:412` confirms `parentOrigin = window.location.origin` (Nextcloud origin), so the Gateway origin check passes. The concern is maintainability (undocumented internal name), not correctness. Finding 2/Fix 2 was wrong: `getLinkWithPicker` returns `Promise<string>` (confirmed from installed package source at `referencePickerModal-D9HwChP3.mjs:1337`), so `linkText` is always identical to `linkUrl` — no data is dropped.

---

### What it does

Companion PR to web-apps #77. Extends the Nextcloud-side listener to branch on the `source` field of `editorRequestSmartPicker`:
- `'contextmenu'` → existing `openAssistantForm` flow (unchanged)
- toolbar button → opens `getLinkWithPicker` (from `@nextcloud/vue`) and inserts the picked URL as a hyperlink into the editor via a new `_doInsertLink` function

Also adds `parentOrigin` to both iframe `src` URLs in `main.js`, and routes `onSmartPickerRequest` parameters to `editor.js`.

---

### Human overview

The branching logic and picker invocation are broadly correct. The implementation of `_doInsertLink` uses raw iframe traversal instead of the DocsAPI method that already exists for this purpose — it happens to work (confirmed post-review), but depends on an undocumented internal iframe name that could break with any DocsAPI update. There is also a committed build artifact with broken CSS imports.

**Two blockers before merge:**

1. `_doInsertLink` depends on undocumented DocsAPI internal (`iframe.name = "frameEditor"`) and uses `postMessage('*')` — correct alternative is `docEditor.insertLink()` at `api.js:934` (see Finding 1)
2. `css/eurooffice-listener.css` imports two content-hashed chunk files that don't exist in the repo (see Finding 4)

**Post-review correction (2026-06-05):** Finding 1 was originally stated as "non-functional / BLOCKER" — incorrect. The traversal works because `api.js:1286` hardcodes `iframe.name = "frameEditor"` and `api.js:412` sets `parentOrigin = window.location.origin` so the Gateway origin check passes. The correct severity is "should-fix" on maintainability grounds.

---

### AI validation prompt

> I'm reviewing a pull request on Euro-Office/eurooffice-nextcloud (PR #31) and want you to validate some findings. Fetch the diff at `https://github.com/Euro-Office/eurooffice-nextcloud/pull/31` and check each claim.
>
> **Claim 1 — `_doInsertLink` bypasses the DocsAPI**
> The new `_doInsertLink` function in `src/listener.js` accesses `document.getElementById('euroofficeFrame').contentWindow.document.querySelector('iframe[name="frameEditor"]')` and calls `postMessage(JSON.stringify({command:'insertLink', data:link}), '*')` on the result. The established pattern for all other inbound editor commands in this file is to call a method on `OCA.Eurooffice.docEditor` (e.g. `docEditor.insertImage`, `docEditor.setMailMergeRecipients`). Check whether `OCA.Eurooffice.docEditor.insertLink` would be the correct alternative (verify by checking apps/api/documents/api.js in the web-apps repo for an `insertLink` export on DocEditor).
>
> **Claim 2 — `linkText` is captured then silently dropped**
> `onSmartPickerRequest` extracts both `linkUrl` and `linkText` from the picker result and calls `OCA.Eurooffice.onInsertLink(linkUrl, linkText)`. But `onInsertLink`'s signature ignores the second argument — only `link` (the URL) is queued and forwarded. The link text is lost, so the inserted hyperlink will always show the raw URL as its display text.
>
> **Claim 3 — `getLinkWithPicker` return value handling is over-defensive**
> The code applies a triple fallback: `(pickerResult.link?.url) || pickerResult.url || pickerResult`. This suggests uncertainty about the return type. According to `@nextcloud/vue` NcRichText, `getLinkWithPicker` returns a plain `string` — the picked URL. Confirm whether the object-shape fallbacks are needed or dead code.
>
> **Claim 4 — Committed build artifact with missing chunk files**
> `css/eurooffice-listener.css` (new file) contains only:
> ```
> @import './listener-BTOFXrU2.chunk.css';
> @import './NcModal-DHryP_87-CF_U7_I9.chunk.css';
> ```
> Check whether `listener-BTOFXrU2.chunk.css` and `NcModal-DHryP_87-CF_U7_I9.chunk.css` exist anywhere in the diff or the current repo `css/` directory.

---

### Fixes

#### Fix 1 — Replace `_doInsertLink` with the DocsAPI method

`docEditor.insertLink(data)` is defined at `apps/api/documents/api.js:934` in the web-apps repo. It uses the internal `_sendCommand` mechanism — the same path used by `insertImage`, `setMailMergeRecipients`, and all other inbound commands. It sends `{command:'insertLink', data:data}` to the editor frame via the established postMessage infrastructure, bypassing any cross-origin concerns and the fragility of hard-coded internal iframe names.

Replace the entire `_doInsertLink` function:

```diff
-OCA.Eurooffice._doInsertLink = function(link) {
-    if (!link) return;
-    const euroofficeFrame = document.getElementById('euroofficeFrame')
-    if (euroofficeFrame && euroofficeFrame.contentWindow) {
-        // The Document Server creates an iframe with name="frameEditor" inside euroofficeFrame
-        // The Gateway.js that handles commands lives inside frameEditor
-        const frameEditor = euroofficeFrame.contentWindow.document.querySelector('iframe[name="frameEditor"]')
-        if (frameEditor && frameEditor.contentWindow) {
-            frameEditor.contentWindow.postMessage(JSON.stringify({
-                command: 'insertLink',
-                data: link,
-            }), '*')
-        }
-    }
-}
+OCA.Eurooffice._doInsertLink = function(link) {
+    if (!link) return;
+    const frame = document.querySelector(OCA.Eurooffice.frameSelector)
+    if (frame && frame.contentWindow && frame.contentWindow.OCA?.Eurooffice?.docEditor) {
+        frame.contentWindow.OCA.Eurooffice.docEditor.insertLink(link)
+    }
+}
```

This also removes the `document.getElementById('euroofficeFrame')` hard-coded ID, using the existing `OCA.Eurooffice.frameSelector` pattern consistent with every other function in the file.

---

#### Fix 2 — Pass link text through to the editor

`linkText` is captured from the picker but dropped by `onInsertLink`. Thread it through:

```diff
-OCA.Eurooffice.onInsertLink = function(link, linkText) {
-    if (OCA.Eurooffice._isDocumentReady) {
-        OCA.Eurooffice._doInsertLink(link)
-    } else {
-        OCA.Eurooffice._pendingInsertLinks.push(link)
-    }
-}
+OCA.Eurooffice.onInsertLink = function(link, linkText) {
+    const payload = { url: link, text: linkText || link }
+    if (OCA.Eurooffice._isDocumentReady) {
+        OCA.Eurooffice._doInsertLink(payload)
+    } else {
+        OCA.Eurooffice._pendingInsertLinks.push(payload)
+    }
+}
```

Note: the web-apps Toolbar `insertLink` handler also needs to unpack `{url, text}` rather than treating `data` as a plain string — coordinate with web-apps PR #77.

---

#### Fix 3 — Clarify `getLinkWithPicker` return type

`getLinkWithPicker` returns `Promise<string>` (the picked URL). The triple-fallback object destructuring is dead code. If the return type is confirmed as a plain string, simplify:

```diff
-const pickerResult = await getLinkWithPicker('eurooffice', false);
-if (pickerResult) {
-    // getLinkWithPicker returns { link: { url, text, source }, ... } or just { url, text }
-    const linkUrl = (pickerResult.link && pickerResult.link.url) || pickerResult.url || pickerResult;
-    const linkText = (pickerResult.link && pickerResult.link.text) || pickerResult.text || linkUrl;
-    OCA.Eurooffice.onInsertLink(linkUrl, linkText);
-}
+const linkUrl = await getLinkWithPicker('eurooffice', false);
+if (linkUrl) {
+    OCA.Eurooffice.onInsertLink(linkUrl, linkUrl);
+}
```

Also confirm whether `'eurooffice'` as the first argument is intentional — it pre-filters the picker to a specific provider instead of showing the full Smart Picker provider selection modal. Pass `null` if the full selection is desired.

---

#### Fix 4 — Remove the committed build artifact

`css/eurooffice-listener.css` is a generated file and its referenced chunk files don't exist in the repo. Remove it from the commit. If the Nextcloud app store requires pre-built CSS, all chunk files must also be committed and `eurooffice-listener.css` should be added to `.gitignore` during development.

---

#### Fix 5 — Fix `else` block indentation in `onSmartPickerRequest`

The `else` branch is indented at 2 tab stops where the enclosing `try` block uses 3. This is a style error (it parses correctly) but should be consistent with the surrounding code. Re-indent the `else` body to 3 tabs so it aligns with the `if` block above it.

---

#### Fix 6 — Reset `_isDocumentReady` and `_pendingInsertLinks` on document change

If the user opens a second document in the same tab, `_isDocumentReady` remains `true` and `_pendingInsertLinks` is never cleared. Add a reset in whatever close/unload handler is appropriate:

```diff
 OCA.Eurooffice.onDocumentReady = function() {
     OCA.Eurooffice.setViewport()
     OCA.Eurooffice._isDocumentReady = true
     ...
 }
+
+// Reset readiness state when document closes so a new session starts clean
+OCA.Eurooffice.onRequestClose = (function(original) {
+    return function() {
+        OCA.Eurooffice._isDocumentReady = false
+        OCA.Eurooffice._pendingInsertLinks = []
+        original.call(this)
+    }
+})(OCA.Eurooffice.onRequestClose)
```
