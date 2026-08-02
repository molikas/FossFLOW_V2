# ADR 0044 — On-Canvas Per-Node Icon Resize (Node Transform Handles)

**Status:** Accepted
**Date:** 2026-07-19
**Supersedes:** [ADR 0030 §1](0030-docked-style-controls-strip.md) (icon size as strip-owned styling) + its §2 single-target Icon-size gating — icon size becomes **per-node on-canvas geometry** and the strip Icon-size control is removed; §1's other styling ownership, the **Change icon** control, and §2–§4 otherwise stand.
**Superseded by:** none

*(Non-supersession context: extends [ADR 0026](0026-rectangle-edge-transform-handles.md)'s transform-handle pattern to nodes; the per-node field mirrors the optional zero-migration view-item pattern of [ADR 0023](0023-off-grid-positioning-and-collision.md); the selection ring coupling is governed by [ADR 0006 §9](0006-canvas-selection-contract.md) / [ux-principles §4.2](../guidelines/ux-principles.md); the field must round-trip through [ADR 0001](0001-project-zip-format.md) zip + [ADR 0003](0003-session-storage-lean-icon-save.md) lean save; the WebGL reader is [ADR 0038](0038-webgl-instanced-render-substrate.md).)*

## Context

Today a node's icon size is **not a per-node property.** It is `scale` on the **shared icon asset** ([`schemas/icons.ts`](../../packages/axoview-lib/src/schemas/icons.ts) — `scale: z.number().min(0.1).max(3).optional()`), so editing it resizes **every node that uses that icon**. The only editor is a slider in the top-bar style strip ([`TopBarStyleControls.tsx`](../../packages/axoview-lib/src/components/TopBarStyleControls/TopBarStyleControls.tsx) `IconSizeControl`, range `0.3–2.5×`), which writes the shared field via `applyIconScale` and carries a tooltip warning that the edit is non-local (`iconSizeBulk`).

The owner wants to **resize a node's icon directly on the canvas** by dragging a handle, *instead of* reaching for the top-bar slider (design discussion 2026-07-19). Direct manipulation — "grab **this** node and make it bigger" — implies **per-node** semantics the model does not have. So this is not merely a new gesture over the old field; it is a small model change plus a surface reclassification.

Two facts make it tractable rather than a rewrite:

1. **The transform-handle machinery already exists** for rectangles and text boxes ([ADR 0026](0026-rectangle-edge-transform-handles.md)): the shared [`TransformControls`](../../packages/axoview-lib/src/components/TransformControlsManager/TransformControls.tsx) / [`TransformAnchor`](../../packages/axoview-lib/src/components/TransformControlsManager/TransformAnchor.tsx) chrome, the `RECTANGLE.TRANSFORM` mode ([`TransformRectangle.ts`](../../packages/axoview-lib/src/interaction/modes/Rectangle/TransformRectangle.ts)) with its `beginDragTransaction → per-frame batch write → commitDragTransaction` = **one undo entry** choreography, and the anchor→mode wiring in [`RectangleTransformControls.tsx`](../../packages/axoview-lib/src/components/TransformControlsManager/RectangleTransformControls.tsx). **Nodes already reuse the selection *ring*** via [`NodeTransformControls.tsx`](../../packages/axoview-lib/src/components/TransformControlsManager/NodeTransformControls.tsx) but pass **no `onAnchorMouseDown`**, so they render no handles, and there is **no `NODE.TRANSFORM` mode** (grep-confirmed absent).
2. **Icon size is really *geometry*, not *styling*.** Rectangles already put geometry (size) on the canvas and style (colour/border) in the strip. Moving icon size onto the canvas brings nodes into **geometry parity** with rectangles and resolves a latent coherence break: [ADR 0030](0030-docked-style-controls-strip.md) forbids a styling control living in two surfaces, so a canvas handle *plus* a strip slider would be illegal **as styling** — legal only once icon size is reclassified as geometry (and then the strip control is redundant).

## Decision

### 1. Icon size becomes a per-node property (shared asset stays as the fallback default)

Add an optional field to [`viewItemSchema`](../../packages/axoview-lib/src/schemas/views.ts):

```ts
// Per-node icon scale multiplier (ADR 0044). Optional / absent = fall back to
// the shared icon asset's `scale`, i.e. today's behaviour byte-for-byte.
// Overrides icons[].scale for THIS node only. Same hard bounds as icons[].scale.
iconScale: z.number().min(0.1).max(3).optional()
```

**Resolution order at every render site:** `viewItem.iconScale ?? icon.scale ?? 1`.

This is **zero-migration** (the master-merge gate): old files have no `iconScale`, so they render exactly as today through the shared `icon.scale`. It mirrors the ADR 0023 off-grid fields (`offset`/`snap`/`collides`) and the label-styling fields already on `viewItemSchema` — an optional, lean-saved, nearest-sibling addition.

### 2. A `NODE.TRANSFORM` mode, mirroring `TransformRectangle`

- New `NODE.TRANSFORM` entry in the [`types/ui.ts`](../../packages/axoview-lib/src/types/ui.ts) mode union and a `TransformNode.ts` reducer registered in [`useInteractionManager.ts`](../../packages/axoview-lib/src/interaction/useInteractionManager.ts) modes map, structurally mirroring `TransformRectangle`: `entry` opens `scene.beginDragTransaction()`; `mousemove` computes the new scale and writes the single view-item inside the open transaction; `mouseup` runs `commitDragTransaction()` then `setMode(CURSOR)`. **One gesture → one undo entry.**
- **Corner handles only, uniform scale.** Icons are square glyphs; a one-axis edge handle would distort them. `NodeTransformControls` passes `onAnchorMouseDown` **and restricts `anchorPositions` to the four corners** (the existing `TransformControls` filter). Scaling is uniform about the **node's tile centre**, so the node stays on its tile.
- **Single target.** Like `RECTANGLE.TRANSFORM`, the mode acts on one node (the strip control it replaces was single-target too). Group/proportional resize on a multi-selection is out of scope (see Consequences).
- **Clamp** the drag result to `[0.3, 2.5]` (the established UI bounds) inside the schema's hard `[0.1, 3]`.

### 3. Drag delta → scale is projection-safe (identical in iso and 2D)

The on-screen width of an icon is `PROJ_W · k · scale · widthScale · zoom` (`k` = 0.8 iso / 0.7 non-iso; `widthScale` = 0.817 iso / 1.0 in 2D). Inverting for a pointer drag:

```
Δscale = Δpx_css / (PROJ_W · k · widthScale · zoom)
```

`widthScale` is the **same** `hypot(getTilePosition({1,0}) − getTilePosition({0,0})) / UNPROJECTED_TILE_SIZE` probe the stroke-width code in `ConnectorsCanvas`/`RectanglesCanvas` already uses — it is the single term that makes the mapping identical in both projections. Use the sub-tile precise screen delta (like `DragItems.preciseDelta`), not the whole-tile bounds math the rectangle mode uses (a node is a single tile).

### 4. Thread the per-node scale through all render readers; couple the selection ring to it

The **selected** node renders via the DOM path; **unselected** nodes via the WebGL batch. Both must read `viewItem.iconScale ?? icon.scale ?? 1` or the live-dragged node and the committed node render at different sizes. The four readers:

- DOM: [`useIcon.tsx`](../../packages/axoview-lib/src/hooks/useIcon.tsx) → [`IsometricIcon.tsx`](../../packages/axoview-lib/src/components/SceneLayers/Nodes/Node/IconTypes/IsometricIcon.tsx) / [`NonIsometricIcon.tsx`](../../packages/axoview-lib/src/components/SceneLayers/Nodes/Node/IconTypes/NonIsometricIcon.tsx)
- WebGL: [`nodeEmitter.ts`](../../packages/axoview-lib/src/webgl/scene/nodeEmitter.ts) (`const scale = ...` choke point in `emit`; it was `NodesCanvas.buildInstances` until the ADR 0038 §8 canvas merge moved it here)

**Live drag = DOM only, commit rebuilds the GL batch** (set `geomDirtyRef`) — the same perf shape as the existing CSS-preview move; the GL rebuild happens once, on `mouseup`.

**Couple the selection ring to the scaled extent.** Today [`TransformControls`](../../packages/axoview-lib/src/components/TransformControlsManager/TransformControls.tsx) sizes the diamond from the **tile** (100×100), with zero coupling to icon size — so an enlarged icon would poke out of its own selection ring, and the corner handles would sit inside the icon. The ring/handle extent must derive from the node's **scaled icon extent**, not the bare tile.

### 5. Remove the strip Icon-size control; reclassify icon size as geometry

Delete `IconSizeControl`, its `StripButton`, the `applyIconScale` writer, the `PhotoSizeSelectLarge`/`IconSizeIcon` import, and the now-dead i18n keys `iconSize` / `iconSizeBulk` / `iconSizeDisabled` (13 locales + the `axoviewProps.ts` type). The strip's **Change icon** control stays. This is the supersession of ADR 0030 §1's "icon size" styling entry recorded in the header.

### 6. Footprint is unchanged — visual scale only

Resizing scales the sprite; the node keeps its **single-tile** footprint for collision, hit-testing, and connector anchoring — identical to what the slider does today. This is **not** multi-tile nodes. (Known pre-existing limitation, now more visible: a large icon overflows its tile, but its clickable hit-area is still the tile — the same as an enlarged icon under the old slider.)

### 7. Persistence must round-trip (owner requirement, 2026-07-19)

`iconScale` rides inside the view item, so it serialises/parses through `viewItemSchema` automatically. But it must be verified end-to-end — the explicit acceptance target — through: **project zip** (ADR 0001), **session/server lean save** (ADR 0003 — `leanSave.ts` strips only duplicate *icons*, never view-item fields, so this is safe by construction but tested anyway), **Drive save**, **clipboard copy/paste** (`clipboard.ts` / `useCopyPaste.ts` reconstruct view items — the real risk site), and **image export** (renders through `NodesCanvas`, so it follows automatically once §4's reader lands).

**2026-07-19 (UX follow-up — first-use feedback):** two refinements, superseding §2's "group resize out of scope":

- **Group resize.** A **homogeneous** node multi-selection shows **one bounding-box control** (each member keeps its selection ring; per-node handles are suppressed so it reads as "grab the group, not one node"). Dragging applies a single uniform scale **factor** to every selected node, **preserving their relative sizes** — the same model as the strip's homogeneous bulk ([ADR 0030](0030-docked-style-controls-strip.md)) and the label-size stepper. Committed in one `transaction` = **one** undo entry. Implementation: `NODE.TRANSFORM` carries `targets: {id, startScale}[]`; `uiState.iconScaleDrag` becomes a node→scale **map**; a **mixed-type** selection shows rings with **no** node resize handles (a cross-type resize isn't meaningful). Note this is resize-the-**selected**-nodes — distinct from the shared-asset "resize every node using this icon" the removed slider did, which stays gone.
- **Live size readout.** The transform chrome shows a `1.4×` pill below the selection **during the drag** (restores the numeric feedback the slider gave). A group shows the **representative** (first-selected) node's scale, per the strip's bulk-display convention.

**2026-07-19 (second UX pass — screenshots + tool research):**

- **Selection outline is a screen-space box that hugs the icon.** A node's icon is a 3-D isometric **sprite**; a flat tile-plane diamond can't wrap it (a large icon escapes upward — the reported "box doesn't follow the outline"). Nodes now use a screen-aligned rectangle ([`ScreenBoxTransformControls`](../../packages/axoview-lib/src/components/TransformControlsManager/ScreenBoxTransformControls.tsx)) sized to the icon's rendered bounds: centre = tile centre, width = `PROJECTED_TILE_SIZE.width · k · scale` (`k` = 0.8 iso / 0.7 non-iso, mirroring the render), height via the image's natural aspect ([`useImageAspect`](../../packages/axoview-lib/src/hooks/useImageAspect.ts)). Handles land on the icon's visual corners at any scale; **hover uses the same box**. Rectangles / text boxes keep the iso diamond (they're flat on the tile plane). The readout is now **screen-pixel-stable** (counter-scaled `1/zoom`) and larger, so it stays legible at any zoom and clears the cursor.
- **Group model confirmed by tool research** (Lucid, draw.io, Figma, Excalidraw, Miro): the universal drag default is **proportional/relative** — every tool preserves each object's relative size; **"make them the same size" is always a separate "Match size" menu command, never the drag**. Axoview keeps this relative behaviour but, unlike the design tools, **does not reposition** (scale in place) — tile placement + connectors are semantic, so spreading nodes on resize would disrupt deliberate layout. Owner-ratified deviation (2026-07-19). A future context-menu "Match size" could cover the same-size case.

**2026-07-19 (third UX pass — "trace each shape"):** the selection/hover rim now follows one rule across all box-shaped types: it **traces the element's real shape on the canvas**. **Flat** elements lying in the tile plane — rectangles, text boxes, and **flat/Material (non-isometric) icons** — get the **iso diamond** (tight, native to the iso look). Only **standing isometric icons** (3-D sprites a flat diamond can't wrap) get the **screen box**. This fixed the Material-icon rim, which had wrongly been given the 3-D screen box. Hover was extended to **text boxes** so every box-shaped type shows a hover rim; **labels** (small upright chip) and **connectors** (thin line) stay excluded — a bounding box reads oddly on them. The size readout is screen-pixel-stable on both node shapes. Chosen over a fully-uniform "screen box for everything" (which loosens the fit on flat iso shapes and would rework the rectangle/text resize handles + supersede ADR 0006 §9). Consistent with the [ADR 0006 §9](0006-canvas-selection-contract.md) ring language (accent + white under-stroke) — only the ring's **shape** now matches the element's geometry.

## Consequences

**Positive:**
- Direct manipulation matches the mental model; nodes reach geometry parity with rectangles/text boxes.
- Zero-migration, zero-risk to existing files; reuses a proven, undo-correct handle pattern.
- Closes the ADR 0030 "styling in two surfaces" coherence gap by reclassifying rather than duplicating.
- On a narrow viewport where the strip overflows, sizing is still reachable (it's on the canvas).

**Negative / risks:**
- **Loss of "resize every same-icon node at once."** The shared `icon.scale` remains the fallback default (still respected, still round-trips) but is no longer *editable from the UI*. Bulk same-icon resize is dropped. Mitigations, in preference order: accept it (per-node is the model now); later add multi-select group resize; a context-menu "reset icon size" to clear a per-node override. **Owner accepted this trade in the 2026-07-19 decision.**
- **Loss of precise numeric entry** (the slider showed `1.0×`). Direct drag is approximate. If precision is later wanted, a numeric field is legal now that icon size is geometry (it would not violate ADR 0030) — deferred.
- Two render paths must stay in sync on the new field, or the live-drag DOM node and the committed GL node diverge — pinned by the acceptance tests.
- Large `scale` magnifies a ≤256 px atlas tile (`ICON_ATLAS_CAP`), so a very large icon may soften; raise the cap only if the clamp ceiling makes it visible.

## Implementation notes (non-binding)

- Files: `schemas/views.ts` (field) · `hooks/useIcon.tsx` + `IconTypes/*` + `webgl/scene/nodeEmitter.ts` (readers) · `types/ui.ts` (mode type) · `interaction/modes/Node/TransformNode.ts` (new, mirror `Rectangle/TransformRectangle.ts`) · `useInteractionManager.ts` (register) · `NodeTransformControls.tsx` (wire `onAnchorMouseDown` + corner-only) · `TransformControls.tsx` (ring/handle extent from scaled icon) · `TopBarStyleControls.tsx` (delete control) · `i18n/*` + `types/axoviewProps.ts` (delete 3 keys).
- Precedent worth reading first: [`NodeLabelHitLayer.tsx`](../../packages/axoview-lib/src/components/SceneLayers/Nodes/NodeLabelHitLayer.tsx) — the closest existing "DOM handle drives a per-node view-item property, committed once" pattern, if a full mode feels heavy.
- Coalesce the live drag into one undo entry via the drag transaction (or `freezePendingPre`/`unfreezePendingPre` on `modelStore`) — do **not** write one `modelStore.set` per pointer tick.

## Acceptance criteria

- **Unit (`TransformNode.test.ts`, mirror `TransformRectangle.test.ts`):** a corner drag changes `viewItem.iconScale`, uniform about centre; result clamped to `[0.3, 2.5]`; a drag is exactly **one** history entry; resolution falls back to `icon.scale` then `1` when `iconScale` is absent.
- **Unit (extend [`schemas/__tests__/views.test.ts`](../../packages/axoview-lib/src/schemas/__tests__/views.test.ts)):** a view item with `iconScale` round-trips through parse; absent `iconScale` still valid.
- **Persistence:** `iconScale` survives **copy/paste** and a **project-zip export→import** round-trip (the two real risk sites); a lean-saved file with a per-node override reloads at the overridden size.
- **e2e (extend the transform/`rectangle-ops` suite):** drag a node corner resizes only that node in **iso and 2D**; a sibling using the same icon is unchanged; the size persists across save/reload.
- **Manual (real browser — CI can't see GPU output):** live DOM drag and committed GL node render at the same size; the selection ring wraps the enlarged icon; the strip has no Icon-size control and nothing looks broken where it was.
- **Build + lib/app typecheck + i18n key-parity clean.**
- **Unit (group, 2026-07-19):** one drag over N targets yields one uniform factor (relative sizes preserved — a node started 1.5× another stays 1.5×) and commits N `iconScale` writes; a mixed/empty target set is a no-op.
- **Manual (group + readout):** a multi-selected node group shows one bounding box + a `×` size pill and resizes all together; a mixed selection shows rings but no node resize handles.
