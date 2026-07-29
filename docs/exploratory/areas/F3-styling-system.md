# F3 — Styling system (docked strip, bulk styling, color picker, style round-trips)

**Status:** OPEN · **Counted hypotheses:** 0 / 10 · **Bugs:** 0 · **Hypothesis ID prefix:** `STYL-`

**Scope:** Docked style-controls strip (ADR 0030), element text-style field convention (ADR 0033), unified color picker + standard palette (ADR 0039), bulk-style target derivation on mixed/homogeneous selections, per-type style fields surviving save/undo/copy.

**Code:**
- `packages/axoview-lib/src/components/TopBarStyleControls/`
- `packages/axoview-lib/src/components/ColorSelector/`
- `packages/axoview-lib/src/components/LabelSettings/ + ConnectorSettings/`
- `packages/axoview-lib/src/utils/bulkStyleTarget`

**Dedupe baseline:** [coverage-baseline.md](../coverage-baseline.md) sections — E2E: *Bulk styling*, *Toolbar layout*; Unit: *Lib UI components*. Then grep the suites directly.

## Related harvested invariants (keyword-matched hint list — scan the [full table](../coverage-baseline.md#invariants) too)

- **(ADR 0023 addendum B + renderedGeometry.contract.test.ts)** No file outside utils/renderedGeometry.ts may hand-roll tile+offset composition; an offset must never be rounded into a tile. → *The contract test greps three specific regex patterns (offset?.x ?? 0, base.x + it.offset.x, ${it.offset.x}px). A new composition written as `const {x: ox = 0} = item.offset ?? {}; left = px.x + ox` evades all three regexes while violating the invariant — the regex gate rots silently as coding style shifts.*
- **(ADR 0022 §4 / ADR 0034 §1 (commit contracts))** Inline editors commit on left-click-away and cancel on right-click-away/Escape; clicks inside the strip or any MUI portal overlay must NOT end a text-box edit session. → *The click-away allowlist is selector-based (.MuiPopper-root etc.): a new overlay (the ADR 0039 color-picker popover, a future emoji picker) rendered with a different portal class ends the edit session mid-formatting, committing a half-styled box. useInlineRename.test covers canvas click-away; no test clicks each strip popover type during a live text-box session.*
- **(ADR 0034 §5 rule 7 (content fidelity))** Sanitizer allowlist ≥ editor format whitelist; any textBox.content editor round-trips losslessly; commits sanitize write-side. → *Add a new Quill format (e.g. range background-color, mirroring the existing range color) without extending the DOMPurify profile: the write-side sanitize silently strips it on commit, so formatting applied in the editor vanishes at rest. The align style-attributor survival is pinned by test; no generic allowlist⊇whitelist assertion exists, so each new format re-opens the hole.*
- **(ADR 0039 §2/§3 (color model))** Grid clicks commit free-form hex; stored preset-IDs remain read-only legacy resolved via resolveHex; Transparent/No-color offered only where clearing is valid, with the rectangle-border absent-derives-stroke nuance preserved. → *Clear a rectangle border via the Transparent swatch: writing an explicit transparent sentinel vs deleting borderColor are different states — absent derives a stroke, sentinel means none. A bulk fan-out that normalizes 'no color' to one representation flips borders on legacy diagrams whose absent borderColor was rendering a derived stroke. ColorPickerBody tests check swatch UI, not the absent-vs-sentinel write semantics per surface.*
- **(technical-review-2026-07-29 §3 finding 2 / known_issues (runtime import cycle))** The Axoview → UiOverlay → ExportImageDialog → Axoview value cycle is safe ONLY while every binding is referenced lazily inside function bodies; a module-eval-time read becomes a TDZ crash at import. → *Add a module-level const in ExportImageDialog that touches an Axoview export (a default prop, a decorator, a memoized style derived from the component): the app crashes at boot with a stack pointing at an innocent consumer. Unit tests import modules individually (different eval order than the bundle), so only a full app boot catches it — and the cycle-count ratchet at 47 doesn't distinguish lazy-safe from eval-time reads.*
- **(canvas-interaction.md §2 (isRendererInteraction gate))** mousedown/mouseup gate on isRendererInteraction; mousemove deliberately does NOT — any move to scoped listeners must replace window-binding with setPointerCapture or drags break when the cursor leaves the box. → *A drag that strays over a NEW overlay child that stops propagation (a future minimap, the annotation palette when open in edit mode): moves keep flowing (window-bound) but the mouseup lands gated-out if the overlay swallows it → the drag never commits and DRAG_ITEMS stays armed, committing on the NEXT unrelated mouseup. No test releases a drag over each overlay surface.*

## Known coverage gaps (from the baseline inventory)

- (Bulk styling) Bulk color/style changes
- (Bulk styling) Bulk styling including rectangles/textboxes/labels in the mix
- (Bulk styling) Redo of a bulk style entry
- (Bulk styling) Style copy between elements (format painter)
- (Toolbar layout) Toolbar button enable/disable state vs selection type
- (Toolbar layout) Toolbar behavior in touch viewports
- (Lib UI components) zero-test lib components: Renderer/Renderer.tsx, SceneLayer, Grid (formula tested only via perf grep-free math), AnnotationLayer/AnnotationLayer.tsx, AnnotationPalette, CanvasContextMenu, ConnectorAnchorOverlay, ConnectorSettings, LayersPanel, ZoomControls, SettingsDialog, ZoomSettings, HotkeySettings, IconPackSettings, HelpDialog, LeftDock, BottomDock, RightSidebar.tsx, DragAndDrop, ModeHint, PreviewLayerSwitcher, PreviewCanvasModeToggle, TopBarStyleControls, ElementLinkCard, CanvasCompositorOverlay, DOMErrorBoundary, Cursor, Lasso/FreehandLasso overlays, Svg, UiElement
- (Lib UI components) ItemControls panels (NodeSettings/ConnectorSettings/RectangleSettings/TextBoxSettings etc.) have only the two-section parity test — no per-control behavior tests
- (Lib UI components) ExportImageDialog behavior beyond waitForIconsDrawn is covered only by static source-grep tests (initialLoad/memo)

## Hypotheses

| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|

## Product questions (SUSPECT verdicts)

*none yet*
