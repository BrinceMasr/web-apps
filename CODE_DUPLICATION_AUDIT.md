# Code Duplication Audit

_Date: 2026-06-14 · Scope: `apps/` JavaScript (desktop `main/app` + mobile)_

## TL;DR

Yes — there is substantial, structural duplication that can be restructured for
reuse. The dominant source is the **per-editor clone architecture**: the five
editor apps (`documenteditor`, `spreadsheeteditor`, `presentationeditor`,
`pdfeditor`, `visioeditor`) each carry their own copy of largely-identical
models, collections, views and controllers, differing mostly by their global
namespace token (`DE` / `SSE` / `PE` / `PDFE` / `VE`).

- **~52,600 duplicated lines** across **94 redundant file copies** in the
  desktop `main/app` trees (same-named files ≥50% similar).
- **~4,100 additional duplicated lines** across **19 file copies** in the mobile
  trees.
- A sharing mechanism already exists and is proven: `apps/common/main/lib/`
  (namespace `Common.*`) hosts ~50 shared dialogs/utilities. The refactor path is
  to extend that pattern; it has simply been applied inconsistently.

> Note: total app JS is ~410k LOC, so this is not a claim that 13% of the code is
> dead-removable — much of the near-duplicate code has small, real per-editor
> deltas. The realistically removable portion is the Tier 1 set plus the shared
> core of Tier 2 (see below).

---

## How this was measured

Same-named files were grouped across the five `apps/<editor>/main/app` trees
(and separately across `apps/<editor>/mobile`). For each group, pairwise
line-level similarity was computed (`difflib.SequenceMatcher`). "Redundant lines"
= lines that match the first copy, summed over the extra copies. A file is marked
**TRIVIAL** when every copy is byte-identical after normalizing away the
namespace token and the editor path string — i.e. dedup carries no behavioral
risk.

---

## Tier 1 — Trivial dedup (namespace-only differences)

These differ *only* by `DE`/`SSE`/`PE`/`PDFE` and a require-path string. Pure
mechanical extraction, near-zero risk. Verified example: the three
`model/ShapeGroup.js` copies are byte-identical apart from the `DE.`/`SSE.`/`PE.`
prefix.

| File (under `main/app/`) | Copies | LOC | Editors |
|---|---|---|---|
| `model/ShapeGroup.js` | 4 | 59 | DE, SSE, PE, PDFE |
| `model/EquationGroup.js` | 4 | 62 | DE, SSE, PE, PDFE |
| `collection/ShapeGroups.js` | 4 | 44 | DE, SSE, PE, PDFE |
| `collection/EquationGroups.js` | 4 | 43 | DE, SSE, PE, PDFE |
| `model/Pages.js` | 3 | 40 | DE, PE, PDFE |
| `collection/Navigation.js` | 2 | 41 | DE, PDFE |
| `view/PageThumbnails.js` | 2 | 149 | DE, PDFE |
| `controller/PageThumbnails.js` | 2 | 117 | DE, PDFE |
| `view/Navigation.js` | 2 | 262 | DE, PDFE |
| `controller/Navigation.js` | 2 | 304 | DE, PDFE |
| `view/ChartSettingsAdvanced.js` | 2 | 1516 | PE, PDFE (only ~10 differing lines) |

**Restructuring:** move the definition into `apps/common/main/lib/{model,collection,view,controller}/`
under the `Common.*` namespace. Each editor keeps a tiny shim that aliases
`Common.Models.ShapeGroup` to `DE.Models.ShapeGroup` (or, better, references the
`Common.*` symbol directly at the call sites). This mirrors how
`apps/common/main/lib/view/InsertTableDialog.js` etc. are already shared.

---

## Tier 2 — High-value near-duplicates (80–95% similar)

Large view files cloned with small, real per-editor deltas. High payoff; needs a
shared base + editor overrides and per-editor UI testing.

| File (`main/app/view/`) | Copies | LOC each | Avg sim | Redundant lines |
|---|---|---|---|---|
| `ShapeSettings.js` | 4 | 2339 | 0.85 | 6081 |
| `TextArtSettings.js` | 4 | 1860 | 0.83 | 4088 |
| `TableSettings.js` | 3 | 925 | 0.88 | 1576 |
| `ShapeSettingsAdvanced.js` | 3 | 930 | 0.81 | 1318 |
| `SignatureSettings.js` | 3 | 446 | 0.86 | 782 |
| `ParagraphSettingsAdvanced.js` | 4 | 1050 | 0.74 | 2128 |
| `ImageSettings.js` | 4 | 720 | 0.72 | 1372 |
| `RightMenu.js` | 4 | 398 | 0.74 | 856 |
| `FileMenu.js` | 5 | 720 | 0.84 | 2504 |

Example delta: `presentationeditor`'s `TextArtSettings.js` adds pattern/texture/
blip-fill controls that `documenteditor`'s copy lacks; otherwise the render
wiring, slider handlers and color logic are identical.

**Restructuring:** introduce `Common.Views.<Name>Base` containing the shared
render/wiring/handlers, with editors subclassing and overriding only the
feature-specific bits (extra panels, capability flags). Migrate one file fully,
verify in all editors, then template the rest.

---

## Tier 3 — Architectural near-duplicates (50–70% similar)

The big controllers and panels. Highest absolute redundancy, highest risk —
each is effectively its own refactoring project.

| File | Copies | LOC each | Avg sim | Redundant lines |
|---|---|---|---|---|
| `view/FileMenuPanels.js` | 5 | 3016 | 0.68 | 8797 |
| `controller/Main.js` | 5 | 3119 | 0.52 | 6114 |
| `controller/LeftMenu.js` | 5 | 947 | 0.59 | 2390 |
| `view/ChartSettings.js` | 4 | 1190 | 0.62 | 2185 |
| `controller/Search.js` | 5 | 517 | 0.74 | 1635 |
| `view/LeftMenu.js` | 5 | 485 | 0.77 | 1613 |
| `controller/Print.js` | 5 | 634 | 0.51 | 1415 |
| `controller/Viewport.js` | 5 | 389 | 0.71 | 1128 |
| `controller/RightMenu.js` | 4 | 537 | 0.57 | 904 |
| `view/HyperlinkSettingsDialog.js` | 4 | 527 | 0.52 | 709 |
| `view/ParagraphSettings.js` | 4 | 484 | 0.66 | 665 |

**Restructuring:** these mix shared scaffolding with heavy editor-specific logic.
Best tackled incrementally — extract self-contained shared helpers (e.g. common
`Search` wiring, `Viewport` setup, `Print` option plumbing) into
`apps/common/main/lib/controller/` mixins rather than attempting a single
big-bang base class.

---

## Mobile trees (separate follow-up)

`apps/<editor>/mobile` shows the same pattern: **19 same-named files >60% similar
across editors (~4,100 redundant lines)**. Worth a dedicated scan once the
desktop Tier 1/2 pattern is established, since the mobile stack (React) would use
a different sharing mechanism (shared components/hooks) than the desktop Backbone
code.

---

## Recommended sequencing

1. **Tier 1** — mechanical moves into `apps/common`. Low risk, removes ~1,000+
   lines, and establishes the alias/shim convention. Includes the near-identical
   `ChartSettingsAdvanced.js` (PE/PDFE).
2. **Tier 2** — one pilot file end-to-end (suggest `SignatureSettings.js`, the
   smallest at 446 LOC / 0.86 sim), verify across editors, then replicate.
3. **Tier 3** — extract shared helpers opportunistically; avoid a single large
   rewrite of `Main.js`/`FileMenuPanels.js`.
4. **Mobile** — separate audit + React-component extraction.

Each step should be guarded by building/running the affected editors, since the
RequireJS module graph and per-editor namespace aliasing are the main failure
modes.
