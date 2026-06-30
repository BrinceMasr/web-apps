/**
 * SINGLE SOURCE OF TRUTH — supported-browser floor for mobile editors.
 *
 * Nextcloud policy: iOS 17 (Safari 17) + Android 9 (updatable WebView = Chrome 111+).
 * Binding constraint: Safari 17 ↔ ES2022. Never hardcode a target in any
 * webpack/babel/postcss config — verify-browser-target.mjs fails the build if you do.
 *
 * SCOPE: mobile editors only. The desktop editors are NOT governed by this file —
 * they ship the legacy OnlyOffice source un-transpiled (Terser minify-only,
 * mangle:false, no babel/esbuild target, no autoprefixer), so they have no explicit
 * floor to centralise; desktop's floor is implicit in its source. Do NOT "unify"
 * desktop onto this floor — transpiling the desktop source would risk the dynamic
 * property-access / `var Common = Common || {}` patterns (see build/README.md, the
 * "esbuild deferred for desktop" note).
 */

export const BROWSERSLIST   = ['iOS >= 17', 'Safari >= 17', 'and_chr >= 111', 'not dead'];
export const ESBUILD_TARGET = ['safari17', 'chrome111'];

// ── Gate contracts ───────────────────────────────────────────────────────────
// Data consumed by build/scripts/verify-browser-target.mjs. The gate is a generic
// runner: all the "what to check" lives here, next to the floor it guards — adding
// a consumer or an engine is a new row, never a code change in the gate.

// Each config must import this file AND wire the floor via the named export
// (positive assertion — the value is the import, never a literal). New consumer? Add a row.
export const TARGET_CONTRACTS = [
  { file: 'vendor/framework7-react/build/webpack.config.js', wires: /target:\s*ESBUILD_TARGET\b/, label: 'webpack esbuild target' },
  { file: 'vendor/framework7-react/babel.config.js',         wires: /targets:\s*BROWSERSLIST\b/,  label: 'babel preset-env targets' },
  { file: 'vendor/framework7-react/postcss.config.js',       wires: /browsers:\s*BROWSERSLIST\b/, label: 'postcss browsers' },
];

// Engines the floor must cover in BOTH lists. New engine (e.g. Firefox)? Add a row.
export const REQUIRED_ENGINES = [
  { label: 'iOS/Safari',     esbuild: /^safari/, browserslist: /Safari|iOS/i },
  { label: 'Android/Chrome', esbuild: /^chrome/, browserslist: /and_chr|android|chrome/i },
];
