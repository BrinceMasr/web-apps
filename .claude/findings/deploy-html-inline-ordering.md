# Pipeline ordering trap: deploy-html.js must be followed by inline-svgs.js

## What fails

If `deploy-html.js` runs but `inline-svgs.js` does **not** run immediately after, all editors
show "Not supported version" (or a blank page with no UI) in the browser.

## Root cause

`deploy-html.js` copies `*.html.deploy` → `*.html` and substitutes `@@SRC_ROOT@@` with
the absolute filesystem path (`/develop/web-apps`). The resulting HTML contains script tags
like:

```html
<script src="/develop/web-apps/apps/common/main/lib/util/desktopinit.js?__inline=true"></script>
```

That path is a **filesystem path, not a URL**. The browser cannot fetch it (404). The
`desktopinit.js` / `themeinit.js` inline scripts are `<head>` prerequisites; without them
the main app bundle fails to initialise, producing the version-gate error or blank page.

`inline-svgs.js` resolves these tags by reading the file at that filesystem path and
replacing the `<script src="…">` tag with an inline `<script>` block containing the file
content. Only after that step is the HTML browser-safe.

## Trigger

This was first observed during the Gap 1 overwrite test (2026-06-15):

1. `deploy-common.js` ran — OK
2. `deploy-html.js` ran — OK (rewrote HTML in BUILD_ROOT)
3. nginx reloaded
4. **`inline-svgs.js` was NOT re-run** — HTML still had un-inlined `?__inline=true` tags
5. Browser: "Not supported version" / blank page on all editors

## Fix

Always run `inline-svgs.js` immediately after `deploy-html.js`. The Phase E pipeline order
is load-bearing:

```
deploy-common.js → deploy-html.js → inline-svgs.js → webpack
```

In CI (`.github/workflows/build.yml`) and in the Makefile, these two steps must be adjacent
with no intervening step that could reset the HTML.

## Additional note

Service worker aggressively caches — after fixing this, always test in a fresh **incognito
window** or hard-reset the SW in devtools. A cached copy of the broken HTML will persist and
make it appear the fix didn't work.
