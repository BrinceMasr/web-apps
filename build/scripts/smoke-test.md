# Manual Smoke Test Checklist

Run this against the dev environment (`make local`) after any build change.
Pass = all boxes checked with no console errors. Fail = stop, investigate before merging.

Open browser devtools before starting. Any uncaught JS error is a failure.

---

## Deploy new build to running container

The web-apps files are baked into the `eo` image, not volume-mounted. After a build
change, deploy the new output directly into the running container:

```bash
docker exec eo bash -c "cd /develop/web-apps/build && THEME=euro-office BUILD_ROOT=/var/www/onlyoffice/documentserver grunt --skip-imagemin"
```

This builds inside the container (Node 18, grunt available) against the mounted source
at `/develop` and writes output directly to the serve path.

## Verify new code is loaded

Before testing, confirm the new build is actually being served:

1. Open devtools → Network tab, disable cache
2. Hard refresh: **Cmd+Shift+R**
3. Open any editor, find `app.js` in Network requests
4. Click it → Preview → check the copyright banner at the top shows the expected build number
   (e.g. `Version: 9.2.1 (build:NNN)` — the build number increments each run)

If the build number hasn't changed, the container is still serving the old build.

---

## Setup
- [ ] `make local` running, Nextcloud accessible at http://localhost:8080
- [ ] New build deployed to container (see above)
- [ ] Build number confirmed in devtools
- [ ] Logged in as admin
- [ ] Test files available: one .docx, one .xlsx, one .pptx, one .pdf

---

## Document Editor
- [ ] Open a .docx — editor loads, toolbar visible
- [ ] Type a word — text appears in document
- [ ] Change font size — change applies
- [ ] Save (Ctrl+S or autosave) — no error toast
- [ ] Close and reopen — edits persisted

## Spreadsheet Editor
- [ ] Open a .xlsx — editor loads, sheet tabs visible
- [ ] Click a cell and type — value appears
- [ ] Enter a formula (`=SUM(A1:A3)`) — evaluates correctly
- [ ] Save — no error toast

## Presentation Editor
- [ ] Open a .pptx — editor loads, slide panel visible
- [ ] Click slide text — text cursor appears
- [ ] Add a new slide — slide appears in panel
- [ ] Save — no error toast

## PDF Editor
- [ ] Open a .pdf — document renders
- [ ] Scroll through pages — no blank pages or rendering errors
- [ ] Add a comment/annotation — annotation appears

## Visio Editor
- [ ] Open a .vsdx (or create new) — editor loads
- [ ] Canvas visible, toolbar present
- [ ] No JS errors on load

## Forms (appforms)
- [ ] Open a .docxf or .oform — form editor loads
- [ ] Form fields visible and interactive

## Embed mode (spot check one editor)
- [ ] Load the embed URL for document editor — stripped UI loads correctly

## Mobile (spot check, use browser devtools device mode)
- [ ] Open a .docx in mobile view — mobile editor loads
- [ ] Basic tap interaction works

---

## After each check
- [ ] No uncaught errors in browser console
- [ ] No failed network requests (404s on JS/CSS bundles)
- [ ] Editor UI matches pre-change appearance (no missing icons, broken layout)
