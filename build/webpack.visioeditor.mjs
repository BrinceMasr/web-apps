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
 * warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR  PURPOSE. For
 * details, see the GNU AGPL at: http://www.gnu.org/licenses/agpl-3.0.html
 */

/**
 * webpack 5 build config — visioeditor desktop (Phase 1 spike)
 *
 * AMD handling:
 *  - require.config() calls in source are no-ops; webpack ignores them.
 *  - define([deps], factory) is handled natively by webpack 5.
 *  - require([deps], callback) in entry files creates async chunks by default.
 *    SPIKE VALIDATION ITEM: confirm these chunks load correctly at runtime,
 *    or add an eager-require preprocessor loader if chunk names break packaging.
 *  - text! plugin: NormalModuleReplacementPlugin strips the prefix; .template
 *    files are served as raw strings via asset/source.
 */

import webpack from 'webpack';
import path from 'path';
import { fileURLToPath } from 'url';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { themeDefines, themeGlobalVars, themeReplacements } from './theme.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env.NODE_ENV || 'production';

const BUILD_ROOT = process.env.BUILD_ROOT
    ? path.resolve(process.env.BUILD_ROOT)
    : path.resolve(__dirname, '../deploy');

const APPS_ROOT   = path.resolve(__dirname, '../apps');
const VENDOR_ROOT = path.resolve(__dirname, '../vendor');
const OUT_DIR     = path.join(BUILD_ROOT, 'web-apps/apps/visioeditor/main');

const productVersion = process.env.PRODUCT_VERSION
    ? `${process.env.PRODUCT_VERSION}${process.env.BUILD_NUMBER ? `.${process.env.BUILD_NUMBER}` : ''}`
    : '0.0.0';

export default {
    mode: env,

    entry: {
        app: {
            import: [
                // LESS compiled alongside JS; MiniCssExtractPlugin pulls it to resources/css/app.css
                path.join(APPS_ROOT, 'visioeditor/main/resources/less/app.less'),
                path.join(APPS_ROOT, 'visioeditor/main/app.js'),
            ],
            // Emit app.js as a named AMD module so require.js can load it with
            // externals (sdk, socketio, etc.) resolved as AMD dependencies.
            // Without this, webpack emits a plain IIFE and AMD externals compile
            // to `module.exports = undefined`.
            library: { type: 'amd', name: 'app' },
        },
        code: {
            import: path.join(APPS_ROOT, 'visioeditor/main/app_pack.js'),
            // Shares the webpack runtime with 'app' — define()-registered
            // classes from app.js are visible to code.js without double-bundling.
            dependOn: 'app',
        },
    },

    output: {
        path: OUT_DIR,
        filename: '[name].js',
        chunkFilename: '[name].chunk.js',
        publicPath: '',
        clean: false,
        // Prevent async chunk files — all AMD require([...], cb) must land in app.js/code.js.
        // DocumentServer packaging copies output by exact filename; extra chunk files
        // would be silently missing from the deployed package.
        asyncChunks: false,
    },

    resolve: {
        extensions: ['.js'],
        // r.js paths config translated to webpack aliases.
        // baseUrl was '../apps/' in the r.js build config, so paths here
        // are relative to APPS_ROOT.
        alias: {
            underscore:       path.join(VENDOR_ROOT, 'underscore/underscore-min.js'),
            backbone:         path.join(VENDOR_ROOT, 'backbone/backbone-min.js'),
            perfectscrollbar: path.join(APPS_ROOT,   'common/main/lib/mods/perfect-scrollbar.js'),
            jmousewheel:      path.join(VENDOR_ROOT, 'perfect-scrollbar/src/jquery.mousewheel.js'),
            core:             path.join(APPS_ROOT,   'common/main/lib/core/application.js'),
            notification:     path.join(APPS_ROOT,   'common/main/lib/core/NotificationCenter.js'),
            keymaster:        path.join(APPS_ROOT,   'common/main/lib/core/keymaster.js'),
            tip:              path.join(APPS_ROOT,   'common/main/lib/util/Tip.js'),
            localstorage:     path.join(APPS_ROOT,   'common/main/lib/util/LocalStorage.js'),
            analytics:        path.join(APPS_ROOT,   'common/Analytics.js'),
            gateway:          path.join(APPS_ROOT,   'common/Gateway.js'),
            locale:           path.join(APPS_ROOT,   'common/locale.js'),
            irregularstack:   path.join(APPS_ROOT,   'common/IrregularStack.js'),
        },
        // Mirrors r.js baseUrl: unaliased module IDs resolve against APPS_ROOT first.
        modules: [APPS_ROOT, 'node_modules'],
    },

    // r.js `empty:` paths are excluded from the bundle.
    // Provided at runtime by DocumentServer (sdkjs, socketio, etc.).
    // externalsType: 'amd' makes webpack generate `require('sdk')` AMD stubs
    // instead of the broken `void 0` produced by the per-key { amd: 'sdk' }
    // multi-format object when library.type is only set per-entry.
    externalsType: 'amd',
    externals: {
        jquery:        'jquery',
        xregexp:       'xregexp',
        socketio:      'socketio',
        coapisettings: 'coapisettings',
        allfonts:      'allfonts',
        sdk:           'sdk',
        api:           'api',
    },

    module: {
        rules: [
            {
                test: /\.js$/,
                include: APPS_ROOT,
                loader: 'string-replace-loader',
                options: { multiple: themeReplacements(productVersion) },
            },

            {
                // locale.js contains a dead fetch/Promise polyfill branch that uses
                // require([...], cb) inside an IIFE body, which crashes the AMD parser
                // (addPresentationalDependency TypeError). Remove it — fetch and Promise
                // are always native in modern browsers.
                test: /common[/\\]locale\.js$/,
                loader: 'string-replace-loader',
                options: {
                    multiple: [
                        {
                            search: 'if \\( !window\\.fetch \\) \\{[\\s\\S]*?\\} else _requireLang\\(\\);',
                            replace: '    _requireLang();',
                            flags: 'g',
                        },
                    ],
                },
            },

            {
                test: /main[/\\]app\.js$/,
                parser: { requireJs: true },
            },

            // text! AMD plugin → asset/source (raw string).
            // NormalModuleReplacementPlugin below strips the 'text!' prefix before
            // this rule runs, so the test matches the bare filename.
            {
                test: /\.template$/,
                type: 'asset/source',
            },

            // LESS → CSS (extracted to resources/css/app.css)
            {
                test: /\.less$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    { loader: 'css-loader', options: { url: false } },
                    {
                        loader: 'less-loader',
                        options: {
                            lessOptions: {
                                javascriptEnabled: true,
                                globalVars: {
                                    // Compile-time path vars (browser-relative, for url() in CSS)
                                    'app-image-const-path':    "'../img'",
                                    'common-image-const-path': "'../../../../common/main/resources/img'",
                                    ...themeGlobalVars(env, 'visioeditor'),
                                },
                            },
                        },
                    },
                ],
            },
        ],
    },

    plugins: [
        // Strips 'text!' prefix from AMD dependency strings before module resolution.
        // Anchored to the start of the request string — avoids false hits on
        // operators like (text !== false).
        new webpack.NormalModuleReplacementPlugin(
            /^text!/,
            resource => { resource.request = resource.request.replace(/^text!/, ''); }
        ),

        new webpack.DefinePlugin({
            __PRODUCT_VERSION__: JSON.stringify(productVersion),
            ...themeDefines(),
        }),

        // AGPL compliance: Terser strips all comments by default.
        // BannerPlugin re-adds the version header; Terser is configured below
        // to preserve comments matching the AGPL pattern.
        new webpack.BannerPlugin({
            banner: `\n* (c) Copyright Ascensio System SIA 2010-2024\n* Version: ${productVersion}\n`,
            entryOnly: true,
            raw: false,
        }),

        new MiniCssExtractPlugin({
            // Output matches the path the existing HTML template links to.
            filename: 'resources/css/[name].css',
        }),

        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.join(APPS_ROOT, 'visioeditor/main/locale'),
                    to:   path.join(OUT_DIR, 'locale'),
                },
            ],
        }),
    ],

    optimization: {
        // Do not split chunks — all code must land in app.js and code.js.
        // DocumentServer packaging copies these files by exact name; extra
        // chunk files would be silently missing from the package.
        splitChunks: false,

        minimize: env === 'production',
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        // Preserve AGPL and copyright headers (BannerPlugin adds one;
                        // source files may also carry per-file headers).
                        comments: /AGPL|Copyright|Ascensio|License/i,
                    },
                    compress: {
                        drop_console: env === 'production',
                    },
                    mangle: false,
                },
            }),
        ],
    },

    devtool: env === 'production' ? false : 'source-map',
};
