/**
 * SINGLE SOURCE OF TRUTH — supported-browser floor for mobile editors.
 *
 * Nextcloud policy: iOS 17 (Safari 17) + Android 9 (updatable WebView = Chrome 111+).
 * Binding constraint: Safari 17 ↔ ES2022. Never hardcode a target in any
 * webpack/babel/postcss config — verify-browser-target.mjs fails the build if you do.
 */

export const BROWSERSLIST   = ['iOS >= 17', 'Safari >= 17', 'and_chr >= 111', 'not dead'];
export const ESBUILD_TARGET = ['safari17', 'chrome111'];
