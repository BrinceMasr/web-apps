#!/usr/bin/env node
/**
 * perf-report.js — webpack performance baseline
 *
 * Runs all four webpack configs sequentially, captures build stats and asset
 * sizes (raw + gzip), and emits a markdown report.
 *
 * Usage:
 *   node scripts/perf-report.js [--out <file>]
 *
 * Options:
 *   --out <file>   Write report to file (default: stdout)
 *
 * In CI all four editors run in parallel; sequential timing here gives
 * per-editor isolation. Parallel wall-clock ≈ slowest single editor.
 *
 * MIGRATION TOOL — remove at migration completion.
 */

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { gzipSync } from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR  = path.resolve(__dirname, '..');
const DEPLOY_DIR = path.resolve(BUILD_DIR, '../deploy/web-apps/apps');

const EDITORS = [
    { name: 'documenteditor',     config: 'webpack.documenteditor.js' },
    { name: 'spreadsheeteditor',  config: 'webpack.spreadsheeteditor.js' },
    { name: 'presentationeditor', config: 'webpack.presentationeditor.js' },
    { name: 'visioeditor',        config: 'webpack.visioeditor.js' },
];

const TRACKED_ASSETS = ['app.js', 'code.js', 'resources/css/app.css'];

const args   = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(bytes) {
    if (bytes === null || bytes === undefined) return 'n/a';
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
    return `${(bytes / 1024).toFixed(1)} KiB`;
}

function rawSize(filePath) {
    try { return statSync(filePath).size; } catch { return null; }
}

function gzSize(filePath) {
    try { return gzipSync(readFileSync(filePath), { level: 9 }).length; } catch { return null; }
}

// ─── build ────────────────────────────────────────────────────────────────────

const results = [];

for (const editor of EDITORS) {
    process.stderr.write(`  building ${editor.name}...`);
    const t0 = Date.now();

    const proc = spawnSync(
        'npx',
        ['webpack', '--config', editor.config, '--json'],
        {
            cwd: BUILD_DIR,
            env: { ...process.env, THEME: process.env.THEME || 'euro-office', NODE_ENV: 'production' },
            maxBuffer: 64 * 1024 * 1024,
        }
    );

    const elapsed = Date.now() - t0;

    let stats;
    try {
        stats = JSON.parse(proc.stdout.toString());
    } catch {
        process.stderr.write(` FAILED (stats parse error)\n`);
        results.push({ editor, elapsed, error: 'stats parse error' });
        continue;
    }

    if (stats.errors && stats.errors.length > 0) {
        process.stderr.write(` FAILED\n`);
        stats.errors.forEach(e => process.stderr.write(`    ${e.message}\n`));
        results.push({ editor, elapsed, error: stats.errors[0].message });
        continue;
    }

    const editorOut = path.join(DEPLOY_DIR, editor.name, 'main');
    const assets = {};
    for (const name of TRACKED_ASSETS) {
        const p = path.join(editorOut, name);
        assets[name] = { raw: rawSize(p), gz: gzSize(p) };
    }

    process.stderr.write(` ${(stats.time / 1000).toFixed(1)}s (wall ${(elapsed / 1000).toFixed(1)}s)\n`);
    results.push({
        editor,
        elapsed,
        buildTime:   stats.time,
        moduleCount: stats.modules ? stats.modules.length : 0,
        assets,
        error:       null,
    });
}

// ─── report ───────────────────────────────────────────────────────────────────

const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
const lines = [];

lines.push('# Webpack Performance Report');
lines.push(`Generated: ${now}`);
lines.push('');

// Build times
lines.push('## Build Times');
lines.push('');
lines.push('| Editor | webpack time | wall-clock |');
lines.push('|--------|-------------|------------|');

let maxWall = 0;
let totalSeq = 0;
for (const r of results) {
    if (r.error) {
        lines.push(`| ${r.editor.name} | ERROR | – |`);
        continue;
    }
    maxWall  = Math.max(maxWall, r.elapsed);
    totalSeq += r.elapsed;
    lines.push(`| ${r.editor.name} | ${(r.buildTime / 1000).toFixed(1)}s | ${(r.elapsed / 1000).toFixed(1)}s |`);
}
lines.push(`| **sequential total** | – | **${(totalSeq / 1000).toFixed(1)}s** |`);
lines.push(`| **parallel (CI)** | – | **~${(maxWall / 1000).toFixed(1)}s** |`);
lines.push('');
lines.push('> webpack time: webpack\'s own measurement. wall-clock: includes spawn + npm overhead.');
lines.push('');

// Per-editor asset sizes
lines.push('## Bundle Sizes');
lines.push('');

for (const r of results) {
    if (r.error) {
        lines.push(`### ${r.editor.name} — ERROR`);
        lines.push('');
        continue;
    }

    lines.push(`### ${r.editor.name}`);
    lines.push('');
    lines.push('| Asset | Raw | Gzip |');
    lines.push('|-------|-----|------|');

    let totalRaw = 0, totalGz = 0;
    for (const [name, sizes] of Object.entries(r.assets)) {
        if (sizes.raw !== null) totalRaw += sizes.raw;
        if (sizes.gz  !== null) totalGz  += sizes.gz;
        lines.push(`| \`${name}\` | ${fmt(sizes.raw)} | ${fmt(sizes.gz)} |`);
    }
    lines.push(`| **Total** | **${fmt(totalRaw)}** | **${fmt(totalGz)}** |`);
    lines.push('');
    lines.push(`Modules: ${r.moduleCount}`);
    lines.push('');
}

// Summary
lines.push('## Summary');
lines.push('');
lines.push('| Editor | app.js | app.js gz | code.js | code.js gz | CSS | CSS gz | Modules | Build |');
lines.push('|--------|--------|-----------|---------|------------|-----|--------|---------|-------|');

for (const r of results) {
    if (r.error) {
        lines.push(`| ${r.editor.name} | ERROR | | | | | | | |`);
        continue;
    }
    const app  = r.assets['app.js'];
    const code = r.assets['code.js'];
    const css  = r.assets['resources/css/app.css'];
    lines.push(
        `| ${r.editor.name} | ${fmt(app.raw)} | ${fmt(app.gz)} | ${fmt(code.raw)} | ${fmt(code.gz)} | ${fmt(css.raw)} | ${fmt(css.gz)} | ${r.moduleCount} | ${(r.buildTime / 1000).toFixed(1)}s |`
    );
}

lines.push('');
lines.push('---');
lines.push('');
lines.push('> `mangle: false` is currently set — bundles are larger than they will be at migration completion.');
lines.push('> Grunt runs all four editors sequentially in ~3m 30s (CI log 2026-06-14).');

const report = lines.join('\n') + '\n';

if (outFile) {
    writeFileSync(outFile, report);
    process.stderr.write(`Report written to ${outFile}\n`);
} else {
    process.stdout.write(report);
}
