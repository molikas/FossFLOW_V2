# ADR 0006 — Canvas Selection Contract (single + multi)

**Status:** Accepted
**Date:** 2026-05-16
**Supersedes:** implicit single-selection assumption baked into [`ItemControls`](../../packages/axoview-lib/src/types/ui.ts)
**Superseded by:** none

## Context

Two MQA items (#8 and #9) asked for behaviour the existing selection model couldn't express:

- **#8** — Ctrl+click adds/removes an item from the selection; Ctrl+A selects everything.
- **#9** — The properties panel auto-hides when more than one item is selected (since per-item fields can't be applied meaningfully to a heterogeneous selection).

Until this ADR, canvas selection lived in `uiState.itemControls: ItemControls | null` — single-item by construction. Multi-select existed only **inside** the `LASSO` / `FREEHAND_LASSO` modes via `mode.selection.items: ItemReference[]`, and was wiped when the user switched tools. There was no way to ask "what is selected" from outside a lasso mode.

The plan considered three architectures (see `docs/tactical/mqa-design-shakeout.md`): convert `itemControls` to an array, add a separate `selectedIds`, or repurpose lasso mode for everything. The first sprays branching across every consumer of `itemControls`; the third has bad UX (Ctrl+click silently changes the active tool). We chose the second.

## Decision

### 1. Two cooperating slices, one invariant

`uiState` gains a new slice:

```ts
selectedIds: ItemReference[];   // persistent multi-selection on the canvas
```

`itemControls` keeps its existing shape and continues to drive the right-side properties panel.

**Invariant:** when `selectedIds.length === 1`, `itemControls` mirrors that single item. When the length is 0 or > 1, `itemControls` is `null`. The store actions enforce this in both directions — callers that already use `setItemControls` (e.g. layer-row clicks) keep working; multi-select callers go through `setSelectedIds` / `toggleSelected` / `clearSelection`.

This means the panel-mounting code, the rename helpers, the F2 binding, and every existing consumer of `itemControls` is **unchanged**. Only multi-select-aware code reads `selectedIds`. *(The floating NodeActionBar was also an `itemControls` consumer at adoption time; it was removed in the 2026-06-25 shake-out — see [ADR 0027](0027-canvas-context-menu.md) addendum — without affecting this invariant.)*

### 2. Gesture matrix

| Gesture | Outcome |
|---|---|
| Left-click an item | replaces selection with `[item]` |
| Ctrl/⌘+click an item | toggles `item` in/out of `selectedIds` |
| **Ctrl/⌘+click a connector** | toggles the connector **plus its tile-bound waypoint anchors** in/out of `selectedIds` as one group — `Cursor.ts` `toggleConnectorGroupSelection`, with the group built from `getConnectorWaypointRefs`. ([ux-principles §4.4](../guidelines/ux-principles.md) documents this and names this ADR as its full contract.) |
| **Shift+click an item** (2026-06-30, #10) | toggles `item` in/out of `selectedIds` — Shift is an additive-select modifier alongside Ctrl/⌘ (it was unbound on canvas; verified collision-free). Threaded via `uiState.mouse.modifiers?.shift` (§6). |
| Left-click empty canvas | clears selection |
| Ctrl/⌘+A | selects every visible + unlocked item in the active view |
| Esc (no panel, no in-flight connector) | clears selection |
| Lasso / freehand lasso (mouseup) | mirrors `mode.selection.items` into `selectedIds` |
| Drag any item already in `selectedIds` (len > 1) | drags the whole selection |
| Delete / Backspace (selection len > 1) | deletes every selected item |

### 3. Locked / hidden items are off-limits — across every path

Ctrl+A and lasso both consult `isItemInteractable` (built from `layerContext.lockedIds` + `visibleIds`). This is the same gate already documented in [ux-principles §4.3](../guidelines/ux-principles.md#43-locked--hidden-layer-items-are-non-interactive--across-every-selection-path). Multi-selection adds **no new bypass** — selectedIds can only ever contain interactable refs.

### 4. Properties panel auto-hide

`selectedIds.length === 1` → panel mounts for that item. Anything else → panel closes. There's no special case for "homogeneous N > 1" (e.g. three nodes): bulk editing isn't in scope and showing one item's values for many would mislead. A future enhancement may add a slim bulk-action bar; this ADR doesn't commit to one.

### 5. Visual contract

- **Single selection** continues to render `TransformControls` (resize handles + dashed outline). Unchanged.
- **Multi-selection** renders the same dashed outline around **each** selected node / rectangle / text box — but without resize anchors (no bulk transform in this commit). Connectors don't get a transform-box; they were never selectable via transform handles.
- The **lasso marquee** still shows its dashed rectangle while a lasso is active. The post-lasso state is now redundantly visualised by the per-item outlines; both can coexist.
- **BottomDock left zone** shows a quiet `"N selected"` label (body2 / secondary) when `length > 1`. This anchors any future bulk-action UI (delete all, group, align, etc.) without committing to one now.

### 6. Modifier-key threading

Mode actions don't currently receive the raw `SlimMouseEvent`. To branch on Ctrl-click inside `Cursor.mouseup` without changing the `ModeActionsAction` signature for every mode, we attach the latest modifiers to `uiState.mouse.modifiers` (optional field, set on every canvas mouse event by `useInteractionManager`). Mode actions read `uiState.mouse.modifiers?.ctrl ?? false`.

This is the only widening of the `Mouse` type from this change. Existing tests that construct mock `Mouse` objects continue to compile because the field is optional.

### 7. 2026-06-18 addendum — lasso hit-testing, endpoint capture, panel mirror, and the open/select split

Four refinements from the 2026-06-18 canvas-UX overhaul work (recorded in git history; there is no standalone `canvas-ux-overhaul.md` tactical — that path never existed):

- **Lasso intersection semantics (#16).** Rectangles are selected on **any overlap** with the marquee, not only when all four corners are enclosed ([Lasso.ts](../../packages/axoview-lib/src/interaction/modes/Lasso.ts)); textboxes are hit on their **full bounds**, not just the origin tile ([Lasso.ts](../../packages/axoview-lib/src/interaction/modes/Lasso.ts)). The old all-corners-enclosed rule is replaced because users read marquee-touch as selection (a lasso through the middle of a long rectangle or text body must select it).
- **Endpoint/start-anchor capture (#2).** A connector's endpoint (start/end) anchors become lasso-capturable for **movement** (not splicing — splicing an endpoint still corrupts the path), so a free-floating start anchor can be selected.
- **Panel ↔ canvas multi-select mirror (#13).** The [LayersPanel](../../packages/axoview-lib/src/components/LayersPanel/LayersPanel.tsx) reads `uiState.selectedIds` (not only LASSO-mode selection at [LayersPanel.tsx](../../packages/axoview-lib/src/components/LayersPanel/LayersPanel.tsx)), so a canvas Ctrl-multi-select highlights the matching rows. Dragging any row that is part of a multi-selection assigns the **whole** selection to the target layer (bulk `assignLayerToItems`, not just the dragged item at [LayersPanel.tsx](../../packages/axoview-lib/src/components/LayersPanel/LayersPanel.tsx)).
- **Open/select split (refines §4).** Per [ADR 0022](0022-canvas-pointer-interaction-model.md), `selectedIds.length === 1` no longer auto-opens the details panel — selection drives **highlight + action bar** only; the panel opens on explicit **double-click**. The §4 invariant (`itemControls` mirrors a single selection) still holds for *deriving* the panel target; it just no longer *mounts* the panel on single-click. **LayersPanel mirrors this** (§4.1 two-way sync): a row's single-click selects (highlight + canvas sync + action bar), double-click opens the details panel — so the panel-open gesture is consistent across canvas and panel. **Implementation constraint (2026-06-20, from the T3 perf fix — commit c875b652):** the LayersPanel row `handleItemClick` was made identity-stable by reading its churny `mode`/`itemControls` closures from a ref (empty-dep `useCallback`) so a selection re-renders 2 rows, not all N. When this single/double split is implemented, the new `onDoubleClick` (and the reworked `onClick`) **must preserve that pattern** or the O(N)-re-render regression returns. (View mode is intentionally exempt — its click-to-pin `ViewModeInfoPopover`, ADR 0012, is a presentation read surface, not selection.)
- **Lasso select-through (accepted trade-off).** Intersection semantics mean a marquee dragged *across* a large background rectangle now also selects it. This is intended — the complaint was the inverse (a lasso through a rectangle's middle failing to select). Figma-style **directional** lasso (drag-right = contain, drag-left = intersect) is a deferred refinement, not shipped here.

New acceptance criteria: lasso through the middle of a long rectangle / over a text body selects it; canvas Ctrl-multi-select highlights LayersPanel rows; dragging a multi-selected row assigns every selected item to the layer; single-click does not mount the Properties panel; LayersPanel row double-click opens the panel (single-click only selects).

### 8. 2026-07-04 addendum — selection chrome hidden during `DRAG_ITEMS` (RECT-1)

Refines §5's visual contract. While a move is in flight (`mode === 'DRAG_ITEMS'`), [`TransformControlsManager`](../../packages/axoview-lib/src/components/TransformControlsManager/TransformControlsManager.tsx) renders **nothing** — the selection bounds/anchors disappear for the duration of the drag and reappear where the selection lands (the Lucid/Figma convention). This applies to **every** item type (node / rectangle / text box / floating Label).

**Why:** an item move is a **CSS-only compositor preview** (`--ff-drag-dx/dy`, [ADR 0023](0023-off-grid-positioning-and-collision.md)) — the model tile commits only on mouseup. Model-driven chrome (which reads the committed tile) would otherwise sit **frozen at the origin tile** for the whole drag while the item follows the cursor, so the bounds visibly detach from the item (the RECT-1 report: *"when you drag the text the resize box stays in the original place"*). Returning null for the drag duration is both cheaper and correct. Probe-verified mid-drag (anchor count 0 while `--ff-drag-dx` is applied) with a clean post-drop commit (commit `1bac431`).

New acceptance criterion: during a single- or multi-item drag, no transform bounds/anchors render at the origin tile; they reappear at the drop location on mouseup.

### 9. 2026-07-14 addendum — stronger, consistent selected / hover treatment (cluster A)

Supersedes §5's "dashed outline." The dashed 2px ring drawn **at** the element footprint was the owner's most-repeated complaint — *"I can't tell what's selected"* (owner #1/#9; the 2026-06-30 persona-sweep cluster A, proposals A1/A3, previously unshipped — sweep doc retired 2026-07-14, in git history). It coincided with the element's own border and, in the same accent blue, vanished on a coloured fill (e.g. a blue rectangle with a red border).

New visual contract for the shared [`TransformControls`](../../packages/axoview-lib/src/components/TransformControlsManager/TransformControls.tsx) primitive (node / rectangle / text box, single **and** multi-select):

- **Selected** = three stacked strokes drawn **just outside** the element edge (`SELECT_OUTSET`), so the ring *frames* the element instead of hiding behind its border: a soft accent **glow**, a **white contrast under-ring** (so the accent reads on any fill/border), and a **bold solid** accent ring (was a faint dashed box). `overflow: visible` on the chrome `<svg>` lets the outset ring escape the footprint-sized viewport.
- **Hover** ([`HoverOutline`](../../packages/axoview-lib/src/components/TransformControlsManager/HoverOutline.tsx), `subtle`) = a single lighter accent outline over a faint white under-stroke, also outset — a clear but distinctly lighter "a click will grab this" affordance. Rest < hover < selected now read as three ranked states. Hover stays scoped to ITEM + RECTANGLE (a bounding box reads oddly on a thin connector / small chip — unchanged).
- **Connector** selection keeps its existing on-element accent halo ([`Connector.tsx`](../../packages/axoview-lib/src/components/SceneLayers/Connectors/Connector.tsx), the already-shipped A2); **floating Label** ([`LabelTransformControls`](../../packages/axoview-lib/src/components/TransformControlsManager/LabelTransformControls.tsx)) gains the same white-contrast edge + accent glow so every item type speaks one selection language ([ux-principles §5](../guidelines/ux-principles.md#5-item-type-parity) parity).

Single accent constant unchanged (`TRANSFORM_CONTROLS_COLOR = #0392ff`); the drag-hide rule (§8) and the pointer/panel gestures (§2, §7) are untouched. This is a DOM/SVG-overlay change (not the GPU substrate, ADR 0038), so it is legible in jsdom but its *look* still needs a real-browser screenshot check.

New acceptance criterion: a selected element shows a solid, high-contrast accent ring offset outside its own border (visible on a coloured fill); a hovered-but-unselected node/rectangle shows a lighter outset outline; both hide during `DRAG_ITEMS`.

### 10. 2026-07-31 addendum — the marquee honours the additive modifier (SEL-15)

Amends the §2 gesture matrix row *"Lasso / freehand lasso (mouseup) | mirrors
`mode.selection.items` into `selectedIds`"*, which now reads:

| Gesture | Outcome |
|---|---|
| Lasso / freehand lasso (mouseup) | replaces `selectedIds` with `mode.selection.items` |
| **Shift/Ctrl/⌘ + lasso** (2026-07-31, SEL-15) | **UNION**s `mode.selection.items` into the existing `selectedIds`, de-duped by `(type, id)`, existing members keeping their order |

**Why.** The 2026-07 exploratory campaign (I3/SEL-15) found that this ADR taught
the additive rule on one gesture and broke it on the other: §2 makes
Shift/Ctrl/⌘ additive **on click** (§6 threads the flag through
`uiState.mouse.modifiers`), while a second marquee replaced the selection even
with the modifier held. Axoview was the outlier *because* it had taught the rule
— a user who learns Shift=add from clicking expects it on a marquee.

**Industry practice (researched 2026-07-29).** Shift+drag extends the selection
in Figma, Miro, Lucidchart, draw.io, Illustrator, Sketch, Inkscape and Blender;
Finder and Windows File Explorer do it with Cmd/Ctrl+drag. Owner ruling
2026-07-30 ([rulings table](../reviews/exploratory-2026-07.md#owner-rulings-2026-07-30)): adopt.

**Scope.** A UNION, not a toggle. A *subtract* modifier (Alt/Option in the Adobe
family, Ctrl in Blender) is a common second tier but is not baseline and was not
ruled, so a lasso can extend a selection but never trim one.

**Implementation.** `mergeMarqueeSelection` + `isAdditiveModifier`
([`utils/selectableRefs.ts`](../../packages/axoview-lib/src/utils/selectableRefs.ts)),
called from both `Lasso.mouseup` and `FreehandLasso.mouseup` — the two handlers
are otherwise hand-maintained twins and had already drifted in other ways (the
rectangular lasso returns to CURSOR on mouseup; the freehand one stays armed).
`isAdditiveModifier` reads the same three keys the click path honours, from the
same place, so the two gestures cannot disagree again.

This supersedes the "Negative / open" bullet below that recorded marquee-replaces
as matching user expectations.

New acceptance criterion: a second marquee with Shift held selects the union of
both catches; without a modifier it still replaces.

## Consequences

### Positive

- Existing single-item consumers (NodePanel, ConnectorControls, RectangleControls, TextBoxControls, two-way layer-row sync) need **zero changes**. The contract is additive.
- Lasso modes become a richer producer (they mirror into `selectedIds`), but the lasso *modes themselves* are unchanged — same in-mode visuals, same drag-from-selection behaviour.
- Bulk delete works uniformly: the keyboard handler now has one path for "many items selected" regardless of whether they came from Ctrl+click, Ctrl+A, or a finished lasso.
- The auto-hide rule for the panel is a pure derivation. There's no "should panel close?" decision scattered across call sites.

### Negative / open

- **No bulk style / resize affordance** yet. Multi-select-aware bulk actions are intentionally deferred (per the MQA plan). The BottomDock badge is the placeholder anchor when we're ready.
- **Single-item selection currently triggers two store writes** when reached via `setSelectedIds([ref])`: one for `selectedIds`, one for the auto-derived `itemControls`. Acceptable; both are in the same `set(...)` call so React renders once.
- ~~**Mode-driven selection (lasso) and persistent selection can momentarily disagree** if the user starts a new lasso while a Ctrl+click selection is active. The lasso's mouseup overwrites `selectedIds`, which matches user expectations (a new lasso replaces the prior selection).~~ **Superseded by §10 (2026-07-31):** it matched expectations only for an *unmodified* marquee. With the additive modifier held it did not, and that inconsistency was I3/SEL-15.

## Files changed by this ADR's adoption

- [`types/ui.ts`](../../packages/axoview-lib/src/types/ui.ts) — new `selectedIds`, new actions, optional `Mouse.modifiers`.
- [`stores/uiStateStore.tsx`](../../packages/axoview-lib/src/stores/uiStateStore.tsx) — `setSelectedIds` / `toggleSelected` / `clearSelection`; `setItemControls` keeps `selectedIds` coherent for single-item updates.
- [`interaction/modes/Cursor.ts`](../../packages/axoview-lib/src/interaction/modes/Cursor.ts) — Ctrl+click branch; multi-drag from `selectedIds`.
- [`interaction/modes/Lasso.ts`](../../packages/axoview-lib/src/interaction/modes/Lasso.ts) + [`FreehandLasso.ts`](../../packages/axoview-lib/src/interaction/modes/FreehandLasso.ts) — mirror selection into `selectedIds` on finalise.
- [`interaction/useInteractionManager.ts`](../../packages/axoview-lib/src/interaction/useInteractionManager.ts) — modifier capture, Ctrl+A, Esc extension, Delete extension.
- [`components/TransformControlsManager/TransformControlsManager.tsx`](../../packages/axoview-lib/src/components/TransformControlsManager/TransformControlsManager.tsx) — render outline per selected item when `length > 1`.
- [`components/BottomDock/BottomDock.tsx`](../../packages/axoview-lib/src/components/BottomDock/BottomDock.tsx) — `"N selected"` badge.

## See also

- MQA tactical plan — items #8 + #9, where the user-facing requirements were captured.
- [ux-principles §4](../guidelines/ux-principles.md#4-selection-model) — sets the panel ↔ canvas sync rule and the locked/hidden invariant this ADR inherits.
- ADR-0005 — toolbar layout contract; the BottomDock badge is one example of a "named region" gaining a new owner.
