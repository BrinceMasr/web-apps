# `insertImage` and the missing-`c` fallback

Context: review of PR #70 (`feat: add edit image from storage on mobile editors`),
https://github.com/Euro-Office/web-apps/pull/70 — review posted 2026-06-10.

## The API contract

`docEditor.insertImage(data)` is a public, integrator-facing method (relayed via
`apps/common/Gateway.js` → `'insertimage'` event). It has **two calling patterns**,
and only one of them carries a `c` command:

### Pattern 1 — response to an editor request (`c` always present)

1. User taps "Picture from Storage" in the editor UI.
2. Editor fires `onRequestInsertImage` with `{c: 'add'}` or `{c: 'change'}`
   (`Common.Gateway.requestInsertImage(command)`).
3. Integrator opens its file picker and calls back
   `insertImage({c: <echoed back>, images: [...]})`.

`c` is a correlation token: it tells the editor which of its own requests this
answers. This is the flow PR #70 adds for mobile.

### Pattern 2 — proactive insertion (no `c` to echo)

The integrator may call `insertImage({images: [...]})` **unprompted** — e.g. an
"insert signature stamp" button in the host application's own UI. There was no
request, so there is no command to echo back.

- Defaulting to **"change"** would be dangerous: it applies to whatever object is
  currently selected and could silently clobber an image the user never asked to
  replace.
- **"Add"** is the only safe interpretation — "here's an image, insert it."

## The established contract in code

- Desktop: `apps/documenteditor/main/app/controller/Toolbar.js:1970`
  ```js
  if (data && data._urls && (!data.c || data.c=='add')) { ... }
  ```
  The `!data.c ||` exists precisely to honor pattern 2.
- Mobile (pre-PR #70): all three editors called `insertImageFromStorage(data)`
  unconditionally, and its guard has the same `(!data.c || data.c === 'add')`.
- Backward-compat policy is visible in the same desktop handler: it still accepts
  the deprecated `url` parameter with an "Obsolete: ... use 'images' instead"
  console warning. `insertImage` predates its current shape; `c` was bolted on
  when change/watermark/etc. flows arrived. Integrations written before that — or
  lazily since — omit `c` and have always gotten an insert.

## The PR #70 regression and fix

The new dispatch in the three mobile `Main.jsx` files:

```js
if(data.c === 'add')        this.insertImageFromStorage(data);
else if(data.c === 'change') this.replaceImageFromStorage(data);
```

Pattern 1 always supplies `c`, so the new feature works — but pattern 2
(proactive insert, no `c`) silently does nothing where it used to insert.

**Fix** (requested inline on the PR):

- Dispatch: `if (!data.c || data.c === 'add')` — absence means "add" by contract.
  - `apps/documenteditor/mobile/src/controller/Main.jsx:592`
  - `apps/presentationeditor/mobile/src/controller/Main.jsx:658`
  - `apps/spreadsheeteditor/mobile/src/controller/Main.jsx:806`
- `replaceImageFromStorage` inner guard: **drop** its `!data.c ||` clause —
  a missing command must never trigger a replace.
  - DE `:1054`, PE `:554`, SSE `:617`

## Related notes from the same review

- DE/PE replace uses `asc_CImgProperty` + `put_ImageUrl` + `ImgApply`; SSE uses
  `asc_setGraphicObjectProps` — both match their desktop counterparts.
  `put_ImageUrl` is an explicit alias of `asc_putImageUrl` in the cell SDK.
- `canRequestInsertImage` gates only the UI entries; the `insertImage` gateway
  handler is live regardless of the flag (same trust model as desktop).
- Desktop reads the flag as truthy (`Main.js:458`); mobile PR uses `=== true`
  (stricter, functionally identical for boolean configs).
