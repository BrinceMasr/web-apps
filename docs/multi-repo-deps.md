# Multi-repo build dependencies

## Runtime checkout requirements

The `web-apps` build (Grunt) requires one sibling repository to be present alongside it in the `DocumentServer` checkout. A preflight assertion in `build/Gruntfile.js` will fail loudly if it is missing.

| Repo | Path relative to `web-apps/` | Used for |
|------|------------------------------|----------|
| `sdkjs` | `../sdkjs/` | SDK asset copy tasks (`common.json` copies `sdkjs/common/`, `sdkjs/word/`, `sdkjs/cell/`, `sdkjs/slide/` into `$BUILD_ROOT/sdkjs-assets/`) |

Repos listed in the original plan as deps (`core`, `core-fonts`, `dictionaries`, `document-templates`) are **not** referenced from the web-apps Grunt build. They are used by other DocumentServer components.

## imagemin: baseline vs production note

The baseline (`build/scripts/baseline.json`) was captured with `--skip-imagemin`. CI also runs with `--skip-imagemin`. This means:

- **CI baseline diff** — always consistent; no imagemin output in either side.
- **x86 production bake** (`web-apps.bake.Dockerfile`) — runs imagemin on non-ARM64 targets. PNG sizes will be ~20–50% smaller than the baseline. The baseline diff step **must not run against a production bake output** — it will false-fail on every image.

If a production bake gate is needed, capture a separate baseline from an x86 bake run and gate against that.

## webpack migration: resolve.alias

When migrating editors to webpack, `sdkjs` is the only cross-repo dependency to wire into `resolve.alias`. The path is:

```js
resolve: {
    alias: {
        // Points to the sdkjs checkout next to web-apps
        'sdkjs': path.resolve(__dirname, '../../sdkjs'),
    }
}
```

Grunt resolves these paths at build time via `$BUILD_ROOT` copy tasks. webpack must wire them up front in config. A missing alias silently produces a smaller bundle — the preflight in Gruntfile.js catches a missing checkout, but webpack config errors won't fire until a module actually tries to import from the alias.

## Optional: OO_BRANDING

If the `OO_BRANDING` env var is set, Gruntfile.js will attempt to load per-editor JSON overrides from `../../$OO_BRANDING/web-apps-pro/build/`. This is a proprietary branding extension path and is not required for standard builds. Not relevant to the webpack migration.
