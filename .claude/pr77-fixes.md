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
