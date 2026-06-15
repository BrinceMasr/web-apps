# deploy-common.js runtime bugs (found during overwrite test, 2026-06-15)

Three bugs found by running the full pipeline against a live Nextcloud instance.
All three are now fixed.

---

## Bug 1 — PRODUCT_VERSION hardcoded to 4.3.0 (root cause of "Not supported version")

### Symptom
All editors fail immediately with "Not supported version" dialog. No editor iframe loads.

### Root cause
`deploy-common.js` line 58 was:
```js
const PKG_VERSION = COMMON_JSON.version;  // always "4.3.0"
```

The eurooffice Nextcloud app (`src/editor.js`) loads `api.js` and checks:
```js
const docsVersion = DocsAPI.DocEditor.version().split('.')
if ((docsVersion[0] < 6) || ...) {
    showMessage('Not supported version')
    return  // never creates the editor iframe
}
```

`4 < 6` is true → error fires, editor never loads.

### Cause of the gap
The Gruntfile (line 358) reads:
```js
packageFile.version = (process.env['PRODUCT_VERSION'] || packageFile.version)
```
picking up `PRODUCT_VERSION=9.2.1` from the container environment. Our script was
reading `common.json`'s `version` field directly, ignoring the env var.

### Fix
```js
const PKG_VERSION = process.env.PRODUCT_VERSION || COMMON_JSON.version;
```

The script comment already documented the intended usage
(`PRODUCT_VERSION=9.2.1 node scripts/deploy-common.js`) but the code never consumed it.

**Always pass `PRODUCT_VERSION` when running deploy-common.js:**
```
BUILD_ROOT=/var/www/... PRODUCT_VERSION=9.2.1 node scripts/deploy-common.js
```

---

## Bug 2 — @@SRC_ROOT@@ not replaced in apps/common/*.html

### Symptom
After the version check passes, the PDF editor (and any editor using the common
iframe) shows a blank iframe with 404 errors:
```
GET .../web-apps/apps/common/@@SRC_ROOT@@/apps/common/main/lib/util/themeinit.js?__inline=true 404
Uncaught ReferenceError: listenApiMsg is not defined
```

### Root cause
`deployAppsCommon()` was copying `apps/common/index.html.deploy` → `apps/common/index.html`
with a raw `fs.copyFileSync`, NOT replacing `@@SRC_ROOT@@`. The `?__inline=true` script
tags were left with literal `@@SRC_ROOT@@` in the src attribute.

### Fix
Changed the copy loop to read → replace → write:
```js
const content  = fs.readFileSync(path.join(src, f), 'utf8');
const replaced = content.replace(/@@SRC_ROOT@@/g, REPO_ROOT);
fs.writeFileSync(path.join(out, f.replace('.html.deploy', '.html')), replaced, 'utf8');
```

---

## Bug 3 — inline-svgs.js did not cover apps/common/

### Symptom
Even after Bug 2 fix, `apps/common/index.html` would have replaced `@@SRC_ROOT@@`
with the filesystem path `/develop/web-apps` but the three `?__inline=true` script
tags would still be external `<script src="/develop/web-apps/apps/common/...">` tags
that the browser cannot fetch.

### Root cause
`inline-svgs.js` DIRS array did not include `apps/common/`. The script only covered the
6 editor `main/`/`forms/` dirs.

### Fix
Added `{ editor: 'common', subpath: '' }` to DIRS in `inline-svgs.js`. The script now
processes `apps/common/index.html` and inlines 3 scripts (themeinit.js, htmlutils.js,
checkExtendedPDF.js). Total substitution count went from 112 → 115.

---

## Secondary fix — @@SRC_ROOT@@ in apps/api/ HTML files

`deployAPI()` was calling `replaceTokensInJS()` (`.js` files only). The `preload.html`
and `cache-scripts.html` in `apps/api/documents/` contain `@@SRC_ROOT@@` that grunt
replaces via `replace:cachescripts`. Added a separate `.html` pass:
```js
replaceTokensIn(apiOut, [[/@@SRC_ROOT@@/g, REPO_ROOT]], { exts: ['.html'] });
```

This does not affect the editor load path (only `DocsAPI.DocEditor.warmUp()`), but
is needed for correctness.

---

## Pipeline run order (canonical, post-fix)

```
PRODUCT_VERSION=9.2.1 BUILD_ROOT=... node scripts/deploy-common.js
BUILD_ROOT=... node scripts/deploy-html.js
BUILD_ROOT=... node scripts/inline-svgs.js
```

`PRODUCT_VERSION` is available in the eo container environment; in CI it must be
explicitly set (same as `PRODUCT_VERSION` is set for webpack string-replace-loader).
