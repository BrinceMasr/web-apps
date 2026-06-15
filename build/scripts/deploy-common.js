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

'use strict';

// Replaces grunt's common.json deploy task chain: api, sdk, apps-common,
// vendor scripts (jquery, megapixel, socketio, xregexp, underscore, iscroll,
// fetch, es6-promise, requirejs), common-embed, and monaco.
//
// Run from web-apps/build/ instead of grunt once Phase E grunt removal is done:
//   BUILD_ROOT=/var/www/... PRODUCT_VERSION=9.2.1 node scripts/deploy-common.js
//
// BUILD_ROOT must be set. Image files are copied without optimisation
// (grunt's imagemin/svgmin steps are not replicated here).

const fs   = require('fs');
const path = require('path');
const { minify } = require('terser');

const REPO_ROOT  = path.resolve(__dirname, '..', '..');
const BUILD_ROOT = process.env.BUILD_ROOT;
const SDKJS_ROOT = path.resolve(REPO_ROOT, '..', 'sdkjs');

if (!BUILD_ROOT) {
    console.error('deploy-common: BUILD_ROOT must be set');
    process.exit(1);
}

const COMMON_JSON    = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'build', 'common.json'), 'utf8'));
const PKG_VERSION    = COMMON_JSON.version;
const CUSTOMER_NAME  = process.env.APP_CUSTOMER_NAME || 'ONLYOFFICE';
const APPS_SRC       = path.join(REPO_ROOT, 'apps');
const VENDOR_SRC     = path.join(REPO_ROOT, 'vendor');
const BUILD_OUT      = path.join(BUILD_ROOT, 'web-apps');

// ---- helpers ----------------------------------------------------------------

function cleanDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
    if (!fs.existsSync(src)) return;
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
}

// Convert a glob pattern to a RegExp.
// Supports: *, **, {a,b,c}, literal chars. Does not support ? or character classes.
function globToRegex(pattern) {
    // Brace expansion: {a,b} → (a|b)
    pattern = pattern.replace(/\{([^}]+)\}/g, (_, list) => `(${list.split(',').join('|')})`);
    // Escape regex special chars (not *, which we handle below)
    pattern = pattern.replace(/[.+^$[\]\\]/g, '\\$&');
    // **/  (globstar with trailing slash) → any path prefix, including empty
    pattern = pattern.replace(/\*\*\//g, '(.*\\/)?');
    // Remaining ** (at end, no trailing slash) → any string
    pattern = pattern.replace(/\*\*/g, '.*');
    // * → any non-separator chars
    pattern = pattern.replace(/\*/g, '[^/]*');
    return new RegExp('^' + pattern + '$');
}

function matchesAny(relPath, patterns) {
    return patterns.some(p => globToRegex(p).test(relPath));
}

// Walk srcDir recursively and yield [relPath, absPath] for every file.
function* walkDir(srcDir, rel) {
    if (!fs.existsSync(srcDir)) return;
    rel = rel || '';
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const childRel = rel ? `${rel}/${entry.name}` : entry.name;
        const childAbs = path.join(srcDir, entry.name);
        if (entry.isDirectory()) {
            yield* walkDir(childAbs, childRel);
        } else {
            yield [childRel, childAbs];
        }
    }
}

// Copy files from srcDir to destDir preserving relative paths.
// include: file must match at least one pattern (OR logic); omit to include all
// exclude: file is skipped if it matches any pattern
function copyDirFiltered(srcDir, destDir, { include, exclude } = {}) {
    for (const [rel, abs] of walkDir(srcDir)) {
        if (include && !matchesAny(rel, include)) continue;
        if (exclude && matchesAny(rel, exclude)) continue;
        const dest = path.join(destDir, rel);
        ensureDir(path.dirname(dest));
        fs.copyFileSync(abs, dest);
    }
}

function copyDir(srcDir, destDir) {
    copyDirFiltered(srcDir, destDir);
}

// Replace tokens in every .js file under dir.
function replaceTokensInJS(dir, replacements) {
    for (const [rel, abs] of walkDir(dir)) {
        if (!rel.endsWith('.js')) continue;
        let content = fs.readFileSync(abs, 'utf8');
        let changed  = false;
        for (const [from, to] of replacements) {
            const next = content.replace(from, to);
            if (next !== content) { content = next; changed = true; }
        }
        if (changed) fs.writeFileSync(abs, content, 'utf8');
    }
}

// ---- tasks ------------------------------------------------------------------

function deploySDK() {
    const sdkOut = path.join(BUILD_ROOT, 'sdkjs-assets');
    cleanDir(sdkOut);

    // common: images, native, libfont
    const commonSrc = path.join(SDKJS_ROOT, 'common');
    const commonOut = path.join(sdkOut, 'common');
    for (const pattern of ['Images/*', 'Images/placeholders/*', 'Images/content_controls/*',
                           'Native/*.js', 'libfont/js/fonts.*', 'libfont/wasm/fonts.*']) {
        copyDirFiltered(commonSrc, commonOut, { include: [pattern] });
    }

    // word: sdk-*.js
    copyDirFiltered(path.join(SDKJS_ROOT, 'word'), path.join(sdkOut, 'word'),
        { include: ['sdk-*.js'] });

    // cell: css and sdk-*.js
    copyDirFiltered(path.join(SDKJS_ROOT, 'cell', 'css'), path.join(sdkOut, 'cell', 'css'),
        { include: ['*.css'] });
    copyDirFiltered(path.join(SDKJS_ROOT, 'cell'), path.join(sdkOut, 'cell'),
        { include: ['sdk-*.js'] });

    // slide: themes tree and sdk-*.js
    copyDir(path.join(SDKJS_ROOT, 'slide', 'themes'), path.join(sdkOut, 'slide', 'themes'));
    copyDirFiltered(path.join(SDKJS_ROOT, 'slide'), path.join(sdkOut, 'slide'),
        { include: ['sdk-*.js'] });

    // desktop: AllFonts.js
    copyFile(
        path.join(SDKJS_ROOT, 'common', 'HtmlFileInternal', 'AllFonts.js'),
        path.join(commonOut, 'AllFonts.js')
    );

    console.log('deploy-common: sdk done');
}

function deployAPI() {
    const apiSrc = path.join(APPS_SRC, 'api');
    const apiOut = path.join(BUILD_OUT, 'apps', 'api');

    cleanDir(apiOut);

    // copy all except .desktop files
    copyDirFiltered(apiSrc, apiOut, { exclude: ['**/*.desktop'] });

    // desktop variant: index.html.desktop → documents/index.html
    copyFile(
        path.join(apiSrc, 'documents', 'index.html.desktop'),
        path.join(apiOut, 'documents', 'index.html')
    );

    // replicate grunt's replace:writeVersion — substitute tokens in deployed JS
    replaceTokensInJS(apiOut, [
        [/\{\{PRODUCT_VERSION\}\}/g, PKG_VERSION],
        [/\{\{APP_CUSTOMER_NAME\}\}/g, CUSTOMER_NAME],
    ]);

    console.log('deploy-common: api done');
}

function deployAppsCommon() {
    const src = path.join(APPS_SRC, 'common');
    const out = path.join(BUILD_OUT, 'apps', 'common');

    cleanDir(out);

    // alphabetletters
    copyDirFiltered(
        path.join(src, 'main', 'resources', 'alphabetletters'),
        path.join(out, 'main', 'resources', 'alphabetletters'),
        { include: ['*.json'] }
    );

    // themes.json
    copyFile(
        path.join(src, 'main', 'resources', 'themes', 'themes.json'),
        path.join(out, 'main', 'resources', 'themes', 'themes.json')
    );

    // help: images/html/css (excluding *_ variant dirs and src/ dirs), plus search JS
    copyDirFiltered(
        path.join(src, 'main', 'resources', 'help'),
        path.join(out, 'main', 'resources', 'help'),
        {
            include:  ['**/*.{png,jpg,gif,html,css}', 'search/js/**/*.js'],
            exclude:  ['*_/**', '**/src/**'],
        }
    );

    // indexhtml: *.html.deploy → *.html
    const htmlSrcDir = src;
    const htmlOutDir = out;
    ensureDir(htmlOutDir);
    for (const f of fs.readdirSync(htmlSrcDir)) {
        if (!f.endsWith('.html.deploy')) continue;
        fs.copyFileSync(
            path.join(htmlSrcDir, f),
            path.join(htmlOutDir, f.replace('.html.deploy', '.html'))
        );
    }

    // images and SVGs (without optimisation — imagemin/svgmin not replicated)
    copyDirFiltered(
        path.join(src, 'main', 'resources', 'img'),
        path.join(out, 'main', 'resources', 'img'),
        {
            include: ['**/*.{png,jpg,gif}', '**/*.svg'],
            exclude: ['toolbar/**/*x/**/*'],
        }
    );

    console.log('deploy-common: apps-common done');
}

function deployJQuery() {
    const vendorOut = path.join(BUILD_OUT, 'vendor', 'jquery');
    cleanDir(vendorOut);
    copyFile(
        path.join(VENDOR_SRC, 'jquery', 'jquery.min.js'),
        path.join(vendorOut, 'jquery.min.js')
    );
    copyFile(
        path.join(VENDOR_SRC, 'jquery.browser', 'dist', 'jquery.browser.min.js'),
        path.join(vendorOut, 'jquery.browser.min.js')
    );
    console.log('deploy-common: jquery done');
}

function deploySimpleVendor(name, srcRel, destRel) {
    const vendorOut = path.join(BUILD_OUT, 'vendor', name);
    cleanDir(vendorOut);
    copyFile(path.join(VENDOR_SRC, srcRel), path.join(BUILD_OUT, destRel));
}

async function deployRequireJS() {
    const requireOut = path.join(BUILD_OUT, 'vendor', 'requirejs');
    cleanDir(requireOut);

    const src     = fs.readFileSync(path.join(VENDOR_SRC, 'requirejs', 'require.js'), 'utf8');
    const result  = await minify(src, { compress: true, mangle: true, format: { comments: false } });
    const destPath = path.join(requireOut, 'require.js');
    ensureDir(requireOut);
    fs.writeFileSync(destPath, result.code, 'utf8');
    console.log('deploy-common: requirejs done');
}

function deployCommonEmbed() {
    const embedOut = path.join(BUILD_OUT, 'apps', 'common', 'embed');
    cleanDir(embedOut);
    copyFile(
        path.join(APPS_SRC, 'common', 'embed', 'resources', 'img', 'logo.svg'),
        path.join(embedOut, 'resources', 'img', 'logo.svg')
    );
    console.log('deploy-common: common-embed done');
}

function deployMonaco() {
    const monacoOut = path.join(BUILD_OUT, 'vendor', 'monaco');
    cleanDir(monacoOut);
    copyDir(path.join(VENDOR_SRC, 'monaco'), monacoOut);
    console.log('deploy-common: monaco done');
}

// ---- main -------------------------------------------------------------------

(async () => {
    deploySDK();
    deployAPI();
    deployAppsCommon();

    // vendor: simple single-file copies (name, src-relative-to-vendor/, dest-relative-to-BUILD_OUT/)
    const simpleVendors = [
        ['megapixel',   'megapixel/megapix-image-min.js',          'vendor/megapixel/megapix-image-min.js'],
        ['socketio',    'socketio/socket.io.min.js',                'vendor/socketio/socket.io.min.js'],
        ['xregexp',     'xregexp/xregexp-all-min.js',               'vendor/xregexp/xregexp-all-min.js'],
        ['underscore',  'underscore/underscore-min.js',             'vendor/underscore/underscore-min.js'],
        ['iscroll',     'iscroll/iscroll.min.js',                   'vendor/iscroll/iscroll.min.js'],
        ['fetch',       'fetch/fetch.umd.js',                       'vendor/fetch/fetch.umd.js'],
        ['es6-promise', 'es6-promise/es6-promise.auto.min.js',      'vendor/es6-promise/es6-promise.auto.min.js'],
    ];
    for (const [name, src, dest] of simpleVendors) {
        deploySimpleVendor(name, src, dest);
        console.log(`deploy-common: ${name} done`);
    }

    deployJQuery();
    await deployRequireJS();
    deployCommonEmbed();
    deployMonaco();

    console.log('deploy-common: all tasks done');
})().catch(err => {
    console.error('deploy-common failed:', err.message || err);
    process.exit(1);
});
