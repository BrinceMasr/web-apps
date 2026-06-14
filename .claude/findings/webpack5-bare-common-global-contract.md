# Finding: 58 files use bare `Common.*` with no guard — load-order contract

## Summary

After the `var Common` scoping fix, 58 files in the codebase use bare `Common.*` references with **no namespace guard at all** — no `if (Common === undefined)`, no `var Common`, no `window.Common`. They rely entirely on `window.Common` already being initialised by an earlier module.

## Why it works

In non-strict mode (and strict mode for reads), bare `Common` resolves to `window.Common` via the global scope chain. This is only safe because `NotificationCenter.js` (and other early modules with the `var Common` guard) seed `window.Common` before these 58 files execute.

## The load-bearing invariant

`window.Common` **must be seeded before any of these 58 files execute**. The fix in `themeReplacements()`:

```js
replace: 'window.Common = window.Common || {};\nvar Common = window.Common;',
```

ensures this — any file with the guard initialises `window.Common` on first access. Since the modules with guards are loaded as AMD dependencies before the files without guards, the invariant holds.

## Risk

If a future change:
- Removes the `var Common` guard fix from `themeReplacements()`
- Or changes AMD dependency ordering so a bare-`Common` file loads before any guarded file

...then all 58 files will throw `ReferenceError: Common is not defined`.

## Files affected (representative examples)

- `apps/common/main/lib/view/About.js`
- `apps/common/main/lib/view/*Dialog.js` (all dialogs)
- Most controller files across all editors

## Action

No code change needed. Document this as the central contract the entire fix rests on. Do not remove the `themeReplacements()` var Common rule.
