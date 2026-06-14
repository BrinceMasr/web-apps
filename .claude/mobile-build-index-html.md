# Mobile Build: Committed webpack output in index.html

## Status: TODO — deferred during iOS keyboard fix branch

## What's happening

`apps/documenteditor/mobile/index.html` is a committed webpack build artifact. It contains a content-hashed `<link>` injected by HtmlWebpackPlugin:

```html
<link href="css/app.4f55353d1ddb632ad4eb.css" rel="stylesheet">
```

The `.gitignore` intentionally excludes the actual build outputs:
```
apps/**/mobile/dist/**      ← app.js gitignored
apps/**/mobile/css/*.*      ← css/app.[hash].css gitignored
```

So `index.html` is tracked as a "manifest" of the current CSS hash, while the large JS/CSS files it references are not.

## Why this is a problem

Every CSS source change that alters the content hash requires:
1. A rebuild (`npm run deploy-word`)
2. Committing the updated `index.html` with the new hash

If you skip step 2, the deployed `<link>` points to a file that no longer exists. This caused the FAB regression investigated in PR #74 — the hash changed due to the `app.less` fix, and `index.html` had to be manually re-committed.

## Preferred fix

Configure webpack to output `app.css` with a **stable filename** (no content hash):

```js
// webpack config — MiniCssExtractPlugin
new MiniCssExtractPlugin({ filename: 'css/app.css' })
```

Then load it the same way `framework7.css` is loaded — via `load_stylesheet()` in `index.html`'s body script — and remove the `<link>` from the `<head>` entirely. Cache-bust via deploy timestamp or query string at the call site if needed.

Alternatively: keep the hash but move the source template to `src/index.html.tmpl` and add the webpack-output `index.html` to `.gitignore`.

## Related

- PR #74: `fix(ios): keyboard overlay exit + build chunk + FAB visibility` — the FAB regression (commit `62ac583c6c`) was a direct consequence of this pattern
- Commit `dfeedeafa3` — changed dynamic to static LESS import, which caused webpack to inject the `<link>` and update `index.html`
