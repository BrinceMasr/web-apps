# Euro Office — web-apps

AGPL fork of OnlyOffice DocumentServer for Nextcloud. Build system being migrated from Grunt+r.js to webpack 5.

## Active work

Branch `build/webpack-migration` — webpack 5 migration for desktop editors.
Full plan: `migration-plan.md` (untracked, local only — not committed per project convention).

## Orientation

- **Dev container**: `eo` — `make web-apps-dev` from `DocumentServer/develop/setup/`. `BUILD_ROOT=/var/www/onlyoffice/documentserver`. Makefile lives in the `DocumentServer` repo, not here.
- **Four webpack editors**: documenteditor, spreadsheeteditor, presentationeditor, visioeditor. Configs: `build/webpack.<editor>.mjs`.
- **Theme contract**: `build/theme.config.mjs` exports `themeReplacements()`, `themeDefines()`, `themeGlobalVars()`. Single source of truth for all brand/token substitution. Do NOT duplicate token tables elsewhere.
- **grunt still runs first** — grunt and webpack both write to `BUILD_ROOT`. `output.clean: false` in all webpack configs. Order is load-bearing: grunt → webpack. Reversing it or running webpack alone leaves stale grunt output.
- **Service worker aggressively caches** — always test in incognito or hard-reset SW in devtools. Two `app.js` versions in devtools = cache conflict.
- **Locale files** — changed by CI translation-merge step; large locale diffs are expected, not regressions.

## Files to read first in a new session

| File | What it covers |
|------|---------------|
| `.claude/migration-topology.md` | Every file the migration added/changed, commit refs, known gaps |
| `.claude/findings/` | **Individual technical findings** — read before debugging any runtime issue |
| `migration-plan.md` | Full step-by-step plan with advisor review log and current status |

## Technical findings

**Always check `.claude/findings/` before debugging a runtime failure** — the issues catalogued there are non-obvious and took significant debugging to diagnose. Re-discovering them from scratch wastes hours.

| File | Problem |
|------|---------|
| [`webpack5-var-common-scoping.md`](.claude/findings/webpack5-var-common-scoping.md) | `var Common` namespace guard fails in webpack factory (117 files) |
| [`webpack5-locale-amd-parser-crash.md`](.claude/findings/webpack5-locale-amd-parser-crash.md) | `locale.js` crashes webpack AMD parser during build |
| [`webpack5-keymaster-umd-guard.md`](.claude/findings/webpack5-keymaster-umd-guard.md) | `keymaster.js` ReferenceError + `window.key` never set |
| [`webpack5-toplevel-var-constants.md`](.claude/findings/webpack5-toplevel-var-constants.md) | `var c_*` constants outside `define()` invisible as globals (~30 consumers) |
| [`webpack5-backbone-underscore-safe.md`](.claude/findings/webpack5-backbone-underscore-safe.md) | Backbone/Underscore are SAFE — do not add fixes for them |
| [`webpack5-bare-common-global-contract.md`](.claude/findings/webpack5-bare-common-global-contract.md) | 58 files use bare `Common.*` — load-order invariant |
| [`deploy-html-inline-ordering.md`](.claude/findings/deploy-html-inline-ordering.md) | `deploy-html.js` must be followed immediately by `inline-svgs.js` — running deploy-html alone leaves `?__inline=true` script tags as unreachable filesystem URLs → "Not supported version" / blank page on all editors |
| [`deploy-common-bugs.md`](.claude/findings/deploy-common-bugs.md) | Three bugs found in deploy-common.js during overwrite test: (1) `PRODUCT_VERSION` env var ignored → api.js reports `4.3.0`, eurooffice rejects `< 6`; (2) `@@SRC_ROOT@@` not replaced in `apps/common/*.html`; (3) `inline-svgs.js` must cover `apps/common/` — all fixed |

## Parked / known issues (not blocking)

| Issue | Notes |
|-------|-------|
| `dark-logo_s.svg` / `warnings_s.svg` 404 | CSS relative path resolves to e.g. `presentationeditor/main/common/main/…` — 2-level-up path assumed a different CSS output directory. Pre-existing or webpack output path difference. Same pattern in all editors. |
| `themes_thumbnail@2x.png` 404 | `sdkjs/common/Images/…` — outside web-apps scope, sdkjs issue. |
| Transitions.js icon panel blank | All `btn-transition-*` icons invisible — CSS-class template not updated for SVG migration. See `.claude/icon-migration.md`. |
| `FormsTab.getView()` throws when opening PDF | `FormsTab.setConfig` (which sets `this.view`) is only called when `config.isFormCreator`. `Toolbar.onDocumentReady` calls `FormsTab.getView()` whenever `isPDFForm`. When user opens a plain PDF (not form-creator), `this.view` is undefined, `getView()` throws instead of returning `undefined`. SDK global error handler catches it. Pre-existing upstream bug — not caused by webpack migration. Fix: guard `_viewsCache` in base `getView`, or move FormsTab view creation to `onLaunch`. |

## Hard rules (do not deviate)

- Do not switch Node versions locally — breaks Claude and other tools
- Do not commit planning/analysis docs — only code and `.claude/` notes
- Do not use `noParse` for `locale.js` — superseded by string-replace-loader (see findings)
- Use `claude-opus-4-8` for advisor reviews — Fable model is not available
- All git commits must be signed: `git commit -s`
