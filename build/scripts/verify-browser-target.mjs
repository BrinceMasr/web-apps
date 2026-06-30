#!/usr/bin/env node
/**
 * (c) Copyright Ascensio System SIA 2010-2024
 *
 * This program is a free software product. You can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License (AGPL)
 * version 3 as published by the Free Software Foundation. In accordance with
 * Section 7(a) of the GNU AGPL its Section 15 shall be amended to the effect
 * that Ascensio System SIA expressly excludes the warranty of non-infringement
 * of any third-party rights.
 *
 * This program is distributed WITHOUT ANY WARRANTY; without even the implied
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. For
 * details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 */

/**
 * Check D — browser target consistency gate.
 *
 * Asserts that no mobile build config carries a hardcoded browser target and
 * that all consumers import from browser-floor.mjs (the single source of truth).
 * Fails the build if a literal target is re-introduced.
 *
 * Run as part of Phase 5 gates, after webpack (BUILD_ROOT not needed).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '../..');
const F7_DIR    = path.join(ROOT, 'vendor', 'framework7-react');

let failed = false;

function fail(msg) {
    console.error(`verify-browser-target: FAIL  ${msg}`);
    failed = true;
}

function ok(msg) {
    console.log(`verify-browser-target: ok    ${msg}`);
}

// ---- 1. No browserslist key in package.json ---------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(F7_DIR, 'package.json'), 'utf8'));
if (pkg.browserslist) {
    fail('vendor/framework7-react/package.json still has a "browserslist" key — delete it, floor lives in browser-floor.mjs');
} else {
    ok('package.json has no browserslist key');
}

// ---- 2. Config files import from browser-floor.mjs -------------------------
const CONFIGS = [
    path.join(F7_DIR, 'build', 'webpack.config.js'),
    path.join(F7_DIR, 'babel.config.js'),
    path.join(F7_DIR, 'postcss.config.js'),
];

for (const cfg of CONFIGS) {
    const rel = path.relative(ROOT, cfg);
    const src = fs.readFileSync(cfg, 'utf8');
    if (!src.includes('browser-floor.mjs')) {
        fail(`${rel} does not import from browser-floor.mjs`);
    } else {
        ok(`${rel} imports browser-floor.mjs`);
    }
}

// ---- 3. No hardcoded ES-year target in webpack.config.js -------------------
const wpSrc = fs.readFileSync(path.join(F7_DIR, 'build', 'webpack.config.js'), 'utf8');
if (/target:\s*['"]es20\d{2}['"]/.test(wpSrc)) {
    fail('vendor/framework7-react/build/webpack.config.js has a hardcoded ES-year target string — use ESBUILD_TARGET from browser-floor.mjs');
} else {
    ok('webpack.config.js has no hardcoded ES-year target');
}

// ---- 4. No hardcoded browserslist string in babel.config.js ----------------
const babelSrc = fs.readFileSync(path.join(F7_DIR, 'babel.config.js'), 'utf8');
if (/targets:\s*['"]/.test(babelSrc)) {
    fail('vendor/framework7-react/babel.config.js has a hardcoded targets string — use BROWSERSLIST from browser-floor.mjs');
} else {
    ok('babel.config.js has no hardcoded targets string');
}

// ---- 5. ESBUILD_TARGET and BROWSERSLIST have consistent Safari floor --------
const { ESBUILD_TARGET, BROWSERSLIST } = await import('../browser-floor.mjs');

if (!ESBUILD_TARGET.some(t => /^safari/.test(t))) {
    fail('ESBUILD_TARGET has no safari entry — floor may be wrong');
} else {
    ok(`ESBUILD_TARGET safari entry: ${ESBUILD_TARGET.filter(t => /^safari/.test(t)).join(', ')}`);
}

if (!BROWSERSLIST.some(q => /Safari|iOS/i.test(q))) {
    fail('BROWSERSLIST has no iOS/Safari entry — floor may be wrong');
} else {
    ok(`BROWSERSLIST iOS/Safari entries: ${BROWSERSLIST.filter(q => /Safari|iOS/i.test(q)).join(', ')}`);
}

// ---- result -----------------------------------------------------------------
if (failed) {
    console.error('verify-browser-target: FAILED — fix hardcoded targets and re-run');
    process.exit(1);
}

console.log('verify-browser-target: all checks passed');
