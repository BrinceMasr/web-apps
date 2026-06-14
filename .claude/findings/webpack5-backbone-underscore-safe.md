# Finding: Backbone and Underscore are SAFE under webpack — do not add fixes for them

## Summary

Backbone and Underscore are bundled (via `resolve.alias`, not externals). Both survive the webpack factory `this !== window` problem. **Do not add string-replace-loader rules for either.**

## Backbone

Backbone's UMD wrapper uses `self` for global detection, not `this`:

```js
var n = typeof self == "object" && self.self === self && self || ...
```

In a browser, `self === window`, so `n.Backbone = window.Backbone` is set correctly even inside a webpack factory. The `self` global is always `window` in browser context regardless of how the function is called.

Confirmed in the compiled bundle: `n.Backbone = r(n, i, t, e)` with `n` resolving to `self`.

**202 files reference bare `Backbone.*`** (controllers, views, models). They all rely on `window.Backbone` being set — this works correctly because of the `self` detection.

## Underscore

Underscore's UMD wrapper selects the CommonJS branch inside webpack (`module.exports = factory()`). The argument `this`/`n` is unused in that branch. Additionally, `app.js` line 119 explicitly sets `window._ = _` after requiring underscore.

Confirmed in the bundle.

## Why this matters

When debugging a `ReferenceError: Backbone is not defined` or `_ is not defined`, the cause is NOT the same IIFE-with-`this` pattern as keymaster. Look elsewhere (missing `define` dep, load order, etc.) before adding a string-replace fix.
