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

import webpack from 'webpack';
import path from 'path';
import { fileURLToPath } from 'url';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import { themeDefines, themeGlobalVars } from './theme.config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = process.env.NODE_ENV || 'production';

const BUILD_ROOT = process.env.BUILD_ROOT
    ? path.resolve(process.env.BUILD_ROOT)
    : path.resolve(__dirname, '../deploy');

const APPS_ROOT   = path.resolve(__dirname, '../apps');
const VENDOR_ROOT = path.resolve(__dirname, '../vendor');
const OUT_DIR     = path.join(BUILD_ROOT, 'web-apps/apps/presentationeditor/main');

const productVersion = process.env.PRODUCT_VERSION
    ? `${process.env.PRODUCT_VERSION}${process.env.BUILD_NUMBER ? `.${process.env.BUILD_NUMBER}` : ''}`
    : '0.0.0';

export default {
    mode: env,

    entry: {
        app: {
            import: [
                path.join(APPS_ROOT, 'presentationeditor/main/resources/less/app.less'),
                path.join(APPS_ROOT, 'presentationeditor/main/app.js'),
            ],
            library: { type: 'amd', name: 'app' },
        },
        code: {
            import: path.join(APPS_ROOT, 'presentationeditor/main/app_pack.js'),
            dependOn: 'app',
        },
    },

    output: {
        path: OUT_DIR,
        filename: '[name].js',
        chunkFilename: '[name].chunk.js',
        publicPath: '',
        clean: false,
        asyncChunks: false,
    },

    resolve: {
        extensions: ['.js'],
        alias: {
            jquery:           path.join(VENDOR_ROOT, 'jquery/jquery.min.js'),
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
        modules: [APPS_ROOT, 'node_modules'],
    },

    externalsType: 'amd',
    externals: {
        xregexp:       'xregexp',
        socketio:      'socketio',
        coapisettings: 'coapisettings',
        allfonts:      'allfonts',
        sdk:           'sdk',
        api:           'api',
    },

    module: {
        noParse: /apps[/\\]common[/\\]locale\.js$/,

        rules: [
            {
                test: /controller[/\\]LaunchController\.js$/,
                parser: { amd: false },
            },
            {
                test: /\.template$/,
                type: 'asset/source',
            },
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
                                    'app-image-const-path':    "'../img'",
                                    'common-image-const-path': "'../../../../common/main/resources/img'",
                                    ...themeGlobalVars(env, 'presentationeditor'),
                                },
                            },
                        },
                    },
                ],
            },
        ],
    },

    plugins: [
        new webpack.NormalModuleReplacementPlugin(
            /^text!/,
            resource => { resource.request = resource.request.replace(/^text!/, ''); }
        ),

        new webpack.DefinePlugin({
            __PRODUCT_VERSION__: JSON.stringify(productVersion),
            ...themeDefines(),
        }),

        new webpack.BannerPlugin({
            banner: `\n* (c) Copyright Ascensio System SIA 2010-2024\n* Version: ${productVersion}\n`,
            entryOnly: true,
            raw: false,
        }),

        new MiniCssExtractPlugin({
            filename: 'resources/css/[name].css',
        }),

        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.join(APPS_ROOT, 'presentationeditor/main/locale'),
                    to:   path.join(OUT_DIR, 'locale'),
                },
            ],
        }),
    ],

    optimization: {
        splitChunks: false,
        minimize: env === 'production',
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
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
