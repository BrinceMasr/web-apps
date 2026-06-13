# ADR-0001: Accessibility Phase 1 — Button/ComboBox contracts

Status: Proposed
Date: 2026-04-15
Context: Euro-Office NVDA accessibility work (ticket: screen-reader labels across all editors)

## Why

Screen reader (NVDA) support across the 5 editors is inconsistent. Root cause is not "missing labels" — it's structural bugs in the shared component layer (`Common.UI.Button` and siblings). Before any per-editor or per-locale sweep, we need framework-level contracts so downstream phases don't duplicate work or fight the components.

This ADR locks in the decisions Phase 1 must honour. Phases 2–6 inherit them.

## Contracts

### 1. Accessible-name resolution order

```
explicit ariaLabel  >  hint[0] (HTML-stripped)  >  visible caption  >  iconCls-derived fallback
```

For split buttons, the menu half resolves to `hint[1]` (if provided) or `"{main label} menu"` as fallback. The empty `<span class="sr-only">` in the split-button template must be populated, not removed.

### 2. Do not clobber existing aria-label

If the element arrives with `aria-label` already set (typically from a template binding), leave it. Templates own the accessible name of elements they declare; the component augments only when the template is silent.

### 3. Re-apply on every mutation

Every public mutator must route through a single internal helper `applyAccessibleName()`:

- `render()` (both template and `el:`-wrap paths)
- `setCaption()`
- `setIconCls()`
- `updateHint()` / `createHint()`
- `toggle()` (for `aria-pressed`)
- `setDisabled()` (for `aria-disabled` and tabindex)

`updateHint()` must update aria-label **regardless** of whether the button has a caption. The current `if (!this.caption)` guard at Button.js:938 is removed.

### 4. `aria-pressed` / `aria-expanded` go on the `<button>`, not the wrapper

- `aria-pressed` moves off `cmpEl` (which is a `<div class="btn-group">` for menu/split buttons) onto the actual `<button>` element. Menu-toggle buttons (currently excluded by the `!me.menu` guard at Button.js:630) are included.
- `aria-expanded` is wired via existing `show.bs.dropdown` / `hide.bs.dropdown` handlers at Button.js:586–587. Currently set once to `false` and never flipped.

### 5. HTML-strip hint text before using as aria-label

Hint values may contain `<br>`, shortcut parentheticals, and entities. aria-label is plain-text only. Strip at the helper, not at every call site. This also means locale strategy can default to reuse.

### 6. Locale strategy: reuse `tip*` keys

Default: use the existing `tip*`/`cap*` localized strings as the aria-label source, stripped per §5. Net-new `aria*` keys are added only where the tooltip is a demonstrably bad SR label (single-char glyphs, brand names). Target: fewer than 50 new keys across all 40+ locales.

### 7. Phase 5 hooks land as no-op stubs in Phase 1

Two stubs added now, used later:

- `Common.UI.announce(text, priority)` — writes into a persistent hidden `aria-live` region. No-op in Phase 1 but callable.
- `Common.UI.Accessibility.isScreenReaderMode()` — returns false in Phase 1; Phase 5 wires persistence and the shortcut.

Labels ship always-on. The SR-mode toggle from Phase 5 gates only the verbose live-region announcements, not the presence of aria attributes.

## Non-goals for Phase 1

- No locale file edits. §5 + §6 remove the need.
- No template edits. Those are Phase 2.
- No `role="toolbar"` / `role="menubar"` wrapper changes. Navigation semantics review is Phase 2.
- No Menu.js / MenuItem.js changes — Phase 2.
- No refactor of `toggle()` / `setCaption()` signatures.

## Risks

- **Tooltip + aria-describedby interaction:** Bootstrap 3 tooltip writes `aria-describedby` on show. Per ARIA spec, `aria-label` wins for the accessible name, but JAWS has historically leaked both. Smoke test NVDA+Firefox and JAWS+Chrome before merge.
- **Scaling / theme re-render:** some code paths rebuild DOM after initial render. `applyAccessibleName()` must be called from every such path. Enumerated in §3.
- **Empty `.sr-only` span in split-button template:** historically orphaned. Filling it changes what NVDA announces on the dropdown half. Expected behaviour — document in PR.
- **No test harness exists.** Validation for Phase 1 is manual (NVDA walkthrough of one editor per day the PR is open). A Puppeteer+axe-core harness is a separate deliverable that should land before Phase 3.

## Out of scope, flagged for later ADRs

- Combo-box keyboard model (ARIA 1.2 combobox pattern vs. current implementation).
- Menu vs. listbox semantics for color pickers and font-size dropdowns.
- Live-region wording conventions (terseness, deduplication window).
- High-contrast / focus-ring visibility.

## Acceptance

Phase 1 is complete when:

1. `Common.UI.Button`, `Common.UI.ComboBox`, `Common.UI.ColorButton`, `Common.UI.MetricSpinner`, `Common.UI.InputField` all route through `applyAccessibleName()` on the mutations listed in §3.
2. Split buttons announce both halves distinctly under NVDA.
3. `aria-pressed` and `aria-expanded` reflect current state on menu/split/toggle buttons.
4. No locale file has been modified.
5. `Common.UI.announce` and `Common.UI.Accessibility.isScreenReaderMode` exist as callable stubs.
6. Manual NVDA walkthrough of the Document editor ribbon shows every button labelled.
