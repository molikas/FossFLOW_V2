# Axoview Canvas Interaction Guidelines

**Last updated:** 2026-08-21 (section index added; content last revised 2026-07-23 — §5.9 per-element interaction contract + new-element checklist, folded from the retired `canvas-interaction-baseline.md` + `canvas-interaction-behavior-map.md` tacticals and reconciled against code) · revision history: `git log --follow docs/guidelines/canvas-interaction.md`
**Status:** Living reference. Update when the interaction layer evolves.
**Audience:** Anyone (or any agent) touching canvas input — event routing, hit-testing, modes, drag, selection, or the gestures on top of them.

This is the **input contract** for Axoview's canvas — the third of the three canvas references, and the sibling of:

- [ux-principles.md](ux-principles.md) — the **design language** (what the chrome looks like and how it behaves).
- **This doc** — **how input works** (what happens between a pointer and the model).
- [canvas-rendering-guidelines.md](canvas-rendering-guidelines.md) — the **pixels** inside the canvas region (the WebGL2 substrate's fidelity contract).

The decisions live in ADRs — [0006](../adr/0006-canvas-selection-contract.md) (selection), [0018](../adr/0018-touch-pen-gesture-contract.md) (touch/pen), [0022](../adr/0022-canvas-pointer-interaction-model.md) (pointer model), [0023](../adr/0023-off-grid-positioning-and-collision.md) (off-grid + collision), [0027](../adr/0027-canvas-context-menu.md) (context menu), [0031](../adr/0031-floating-label-entity-model.md) (Label). **This doc is the contract those decisions produced** — the thing you read before changing input code, so you don't silently break an invariant that cost a real bug to learn.

> **Citations are by file + symbol, deliberately.** The predecessor docs pinned `file:line` anchors and every one of them drifted within a month. Grep the symbol.

## Contents

Read the section that covers the code you're about to change — the invariants are section-local.

1. [The dispatch spine](#1-the-dispatch-spine) — the one pipeline every canvas gesture flows through
2. [The `isRendererInteraction` gate](#2-the-isrendererinteraction-gate) — what separates canvas input from chrome input
3. [The load-bearing layout](#3-the-load-bearing-layout) — the DOM stack the hit-testing depends on
4. [Mode registry](#4-mode-registry) — the 13 modes, and the four that carry contracts: [CURSOR](#41-cursor--the-hub) · [DRAG_ITEMS](#42-drag_items--the-css-preview-move) · [CONNECTOR](#43-connector--create) · [PAN](#44-pan--and-the-read-only-click-surface) · [keybindings](#45-keybindings)
5. [Algorithm contracts](#5-algorithm-contracts) — screen→tile, node-drag collision, nearest-free-tile, group-drag math, the connector router, anchor and item hit-testing, 2D ↔ ISO parity, and the [new-element checklist](#59-per-element-interaction-contract--the-new-element-checklist)
6. [Perf invariants — the load-bearing set](#6-perf-invariants--the-load-bearing-set) — the [CSS-only drag preview](#61-the-css-only-drag-preview--the-most-fragile-invariant-set) (most fragile), drag transactions, the closed-form router, render isolation, the [open GC cliff](#65-the-open-gc-cliff--do-not-worsen), RAF throttle, how to measure
7. [Selection invariants](#7-selection-invariants) — what must stay true across every selection path
8. [Abort / commit semantics](#8-abort--commit-semantics) — including [undo/redo as two independent patch stacks](#81-undoredo-is-two-independent-patch-stacks)
9. [Reference implementations & guards](#9-reference-implementations--guards) — the files to mirror and the tests that pin them

---

## 1. The dispatch spine

Every canvas gesture flows through one pipeline ([`useInteractionManager.ts`](../../packages/axoview-lib/src/interaction/useInteractionManager.ts)):

```
window mousedown/mousemove/mouseup ─┐
window touchstart/move/end ─(synth)─┤→ onMouseEvent(SlimMouseEvent)
window contextmenu ─────────────────┘        │
rendererEl wheel → onScroll (zoom)           │
                                             ▼
                        usePanHandlers  (button 1/2, ctrl/alt/empty-area)
                                             │ (if not consumed)
                                             ▼
                        getMouse(clientX/Y → screen → tile)
                                             │ (mousemove RAF-throttled)
                                             ▼
                        processMouseUpdate → builds State → mode.exit/entry
                                             │
                                             ▼
              modes[uiState.mode.type].{mousedown|mousemove|mouseup}(State)
```

Four facts the whole layer hangs on:

1. **`SlimMouseEvent`** ([`types/common.ts`](../../packages/axoview-lib/src/types/common.ts)) is the internal adapter — a `Pick` of `MouseEvent` (`clientX/Y`, `target`, `type`, `button`, modifiers, `preventDefault`). **Every mode reducer is written against it**, branching on `e.type`. Keeping this shape stable is what keeps the mode unit tests green and device-agnostic.
2. **Mode `exit`/`entry` run lazily on the *next* event**, not at `setMode` time: `processMouseUpdate` compares the live mode to the last-run reducer and, on mismatch, calls the old `exit` then the new `entry`. **A keyboard-only mode switch doesn't run `exit` until the next mouse event** — load-bearing for the abort semantics in §7.
3. **`hasMovedTile(mouse)` is delta-based and one RAF frame stale** ([`utils/isoMath.ts`](../../packages/axoview-lib/src/utils/isoMath.ts)). `Cursor.mousemove` deliberately **bypasses** it for drag-start (comparing `position.tile` to `mousedown.tile` directly) to avoid a half-tile lag; every other move handler gates on it and inherits the staleness.
4. **`getMouse`** ([`utils/renderer.ts`](../../packages/axoview-lib/src/utils/renderer.ts)) derives `position.screen` (`clientX − elementLeft`, zoom-independent CSS px), `position.tile` (via the injected `screenToTile`), `delta`, and `mousedown` (set on down, carried through move, cleared on up).

---

## 2. The `isRendererInteraction` gate

`processMouseUpdate` computes:

```ts
isRendererInteraction = rendererRef.current === e.target || isAnchorOverlay
```

where `rendererRef.current` is the **`canvas-interactions` Box** and `isAnchorOverlay` is true when the target is inside `[data-anchor-id]`.

- **`mousedown` / `mouseup` handlers gate on it** — that is how clicks on overlay chrome that bubble to `window` get ignored.
- **`mousemove` handlers deliberately do NOT** — which is why a drag keeps working while the pointer strays over a node or anchor. This "moves fire anywhere" property comes from binding on `window`; **any move to scoped listeners must replace it with `setPointerCapture`**, or drags break the moment the cursor leaves the box.

**How each surface satisfies the gate:** nodes / rectangles / textboxes are `pointer-events:none` or painted below, so a click on them hit-tests through to the interactions box (`e.target === box` ✓). Waypoint anchors are `auto` but carry `data-anchor-id` (`isAnchorOverlay` ✓). Connector labels are `auto` and handle their own `onClick` for links — not a canvas-gate path.

---

## 3. The load-bearing layout

`Axoview.tsx` renders the canvas and the overlay as **siblings** inside a `position:relative` wrapper:

```
<Box position:absolute inset:0>
  <Renderer/>     ← containerRef === uiState.rendererEl (the canvas subtree)
  <UiOverlay/>    ← sibling, painted ON TOP; root is pointer-events:none
</Box>
```

**Key invariant:** every diagram-interaction element lives inside the `rendererEl` subtree; every piece of *chrome* (annotation layer, tabs, docks) lives in `UiOverlay`, a separate subtree with `pointerEvents:'none'` at the root, re-enabling `auto` only on specific interactive children. Canvas-area pointers therefore fall through the overlay to the Renderer.

**Bind listeners to the Renderer container (`rendererEl`), never to the inner `canvas-interactions` Box alone.** The container is the common ancestor of the interactions box, the connector-anchor overlay, and the connector labels. Binding to the box alone breaks connector reconnect, waypoint drag, and linked-label clicks — they are *siblings* of the box, not descendants. The CSS guardrails (`touch-action` / `user-select` / `-webkit-touch-callout`) go on the **container** for the same reason.

> **The paint layers are WebGL now.** Since [ADR 0038](../adr/0038-webgl-instanced-render-substrate.md), nodes, labels, connector bodies and rectangle bodies are drawn on the **GPU** (`glSpriteBatch`), not as per-item DOM. Only the selected ∪ dragged item gets a DOM overlay. **This does not change the input model** — hit-testing was always **tile-based**, never DOM-target-based, which is exactly why the substrate could be swapped underneath it. The one full-area `pointer-events:auto` surface is still the `canvas-interactions` Box; the only elements that intercept pointers themselves are **waypoint anchors** and **linked connector labels**.

---

## 4. Mode registry

`modes` maps **13** reducer keys to `ModeActions` ([`interaction/modes/`](../../packages/axoview-lib/src/interaction/modes/)). `INTERACTIONS_DISABLED` is a **14th** state with no reducer — the input effect early-returns and binds **no listeners at all** (`NON_INTERACTIVE`). Preserve that guard.

| Mode | Drag-txn? | Model writes | Commits on |
|---|---|---|---|
| `CURSOR` | n/a (delegates) | selection only | mouseup |
| `DRAG_ITEMS` | **yes** (entry/exit) | **none mid-drag** — CSS preview (§6.1) | mouseup |
| `LASSO` · `FREEHAND_LASSO` | n/a | none | mouseup (mirrors `selectedIds`) |
| `CONNECTOR` | **yes** | **per-frame** ⚠ (§6.5) | 2nd click / mouseup |
| `RECONNECT_ANCHOR` | **yes** | **per-frame** ⚠ (§6.5) | mouseup |
| `RECTANGLE.DRAW` · `RECTANGLE.TRANSFORM` | **yes** | per-frame, bracketed | mouseup |
| `TEXTBOX.TRANSFORM` | **yes** | per-frame, bracketed | mouseup |
| `TEXTBOX` | no (not needed) | `mousemove` is a **no-op** | mouseup (select, or delete if off-canvas) |
| `LABEL` | no (not needed) | `mousemove` is a **no-op** | mouseup (`createLabel`) |
| `PLACE_ICON` | no (one `transaction`) | none until commit | mouseup (`placeIcon`) |
| `PAN` | n/a | none (scroll only) | n/a |
| `INTERACTIONS_DISABLED` | — | — | no listeners bound |

### 4.1 CURSOR — the hub

- **`mousedown`** (gated): if a CONNECTOR is selected and the click resolves to one of its anchors, claim it first — **endpoint → `RECONNECT_ANCHOR`**; **waypoint + Alt → splice it**; **waypoint plain → arm a drag**. Otherwise record `mousedownItem` / `mousedownHandled`.
- **`mousemove`**: no mousedown → hover cursor. Mousedown + tile changed → promote: pressed item → `resolveDragItems` (the **whole** multi-selection if it contains the pressed item) → **`DRAG_ITEMS`**; no item but `mousedownHandled` → **`LASSO`**.
- **`mouseup`** (gated): `mousedownItem && !hasMovedTile` → `resolveClickSelection` (left = replace, Ctrl/⌘ = toggle). Else clear selection.

**Left-click selects; it never opens a command surface.** The context menu is right-click / long-press only ([ADR 0027](../adr/0027-canvas-context-menu.md)), and the details panel opens on **double-click** ([ADR 0022](../adr/0022-canvas-pointer-interaction-model.md) §3) — selection alone does not open it.

### 4.2 DRAG_ITEMS — the CSS-preview move

The perf-critical mode. `entry` opens a **drag transaction** and clears the preview maps; `mousemove` computes `mouseOffset = position.tile − mousedown.tile` and moves items via CSS vars; `mouseup` commits tiles via `batchUpdateViewItemTiles` + `commitDragTransaction`. Full invariants in §6.1.

**Split abort semantics (§7):** `exit` discards the CSS **node** preview (nodes were never written → they snap back to origin) but **commits** any textbox/rectangle/anchor moves already written per-frame. A programmatic mode change mid-drag therefore aborts node moves and keeps non-node moves.

### 4.3 CONNECTOR — create

`uiState.connectorInteractionMode` defaults to **`'click'`**; `'drag'` is opt-in. Click-mode: 1st press creates + arms (a free-floating start is allowed — a stray empty click is reverted on `mouseup`, not blocked); 2nd press sets the target anchor and commits. Drag-mode: create on down, complete on up.

### 4.4 PAN — and the read-only click surface

`mousemove` with `mousedown` adds `delta.screen` to `scroll.position` via `setScroll`. In **`EXPLORABLE_READONLY`** (the starting mode there), a **click without drag opens the read-only info popover** for an item with content. `EDITABLE` starts in `CURSOR`; `NON_INTERACTIVE` binds nothing.

### 4.5 Keybindings

Dispatch order matters — earlier handlers consume. `Escape` (panel-clear → selection-clear → connector-abort) and `Delete`/`Backspace` run **before** the editable-target guard; everything below is **skipped on INPUT / TEXTAREA / contentEditable / `.ql-editor`**: undo/redo, cut/copy/paste, Ctrl+A, F1/F2, tool hotkeys (`s m n r c t`), Ctrl+`]`/`[` z-order, and arrow/wasd/ijkl pan.

**The keydown effect's dep array is a perf invariant** — scene/layer are read through refs to keep it stable. Guarded by `interactionManager.depStability.test.tsx`.

---

## 5. Algorithm contracts

### 5.1 screen → tile
`getMouse` → `position.screen` (`clientX/Y − rendererEl.left/top`) → `position.tile` via the **injected** `screenToTile`. `screenToIso` floors, so a tile owns the half-open region toward +x/−y. **Cost:** O(1), once per RAF-throttled event.

### 5.2 Node-drag collision (`computeNodeUpdates`)
Per frame: `target = initialTile + mouseOffset` (rigid translate from tiles captured once at drag start); build `externalOccupied` as a `Set` of `"x,y"` for every **non-dragged** item (the model is stale during drag, but non-dragged items haven't moved, so their tiles are authoritative); if **any** target collides → **return `null` ⇒ no node moves this frame** (all-or-nothing, cursor `not-allowed`).

**Boundary:** dropping onto an occupied tile freezes the **whole group** at its last valid preview — there is **no nearest-free fallback** (contrast §5.3). **Preview == committed tile:** collision frames are skipped, so `previewTiles` always holds the last non-colliding position and `mouseup` commits exactly that — never the raw cursor tile. **Cost:** O(D + E) per frame with a fresh `Set` per frame.

**Asymmetry to know:** node members are collision-gated; **textbox / rectangle / anchor members are not** — they translate through occupied tiles freely.

### 5.3 `findNearestUnoccupiedTile` (PLACE_ICON)
Builds an occupied `Set` once (O(N)) then spirals out to `maxDistance=10`. Placement **never overlaps** — unlike DRAG_ITEMS, which refuses the frame instead. The group variant reserves each found tile so a batch can't self-collide.

### 5.4 Group-drag math
`resolveDragItems` returns the whole `selectedIds` when the pressed item is in a len>1 selection. `collectDragInitialPositions` snapshots each member's start once; **free-floating `CONNECTOR_ANCHOR` members must be seeded from their `ref.tile`** — omitting that seed is what pinched connector paths when Ctrl+A pulled waypoints in. Every member translates by the same `mouseOffset`, so the group moves rigidly.

### 5.5 Connector router
`getConnectorPath` resolves anchors → tiles, bounds them, and calls **`findPath`** per consecutive pair. **`findPath` is closed-form** ([`utils/pathfinder.ts`](../../packages/axoview-lib/src/utils/pathfinder.ts)): step diagonally until one axis matches, then orthogonally — the A*-equivalent answer on an obstacle-free grid **with zero per-call allocation**. `gridSize` is retained for signature compat and **ignored**.

> **Never reintroduce a pathfinding library here.** The closed-form walker replaced A*-over-a-freshly-allocated-grid-per-tick; that swap is load-bearing (§6.3).

`getAnchorTile`: `ref.item` → O(1) lookup; `ref.anchor` → **recurses** through `getAllAnchors` (allocates a flattened array — a sharp edge if anchor-to-anchor refs proliferate); `ref.tile` → literal. **Throws** if none resolve; callers catch and mark the connector `unroutable`.

### 5.6 Anchor hit-testing — by-id, then by-tile
The overlay sets `data-anchor-id`; `processMouseUpdate` lifts it to `mouse.targetAnchorId`. `findClickedConnectorAnchor` prefers the **DOM id** (the hit ring exceeds one tile at low zoom) and **falls back to tile-equality** (using the path-junction tile for node-attached endpoints, so the handle stays reachable). **Endpoint** (index 0 / last) → `RECONNECT_ANCHOR`; **middle** → waypoint (Alt-splice or drag). **Endpoints are never spliceable** — it would drop the connector below 2 anchors and corrupt the scene.

### 5.7 Hit detection (`getItemAtTile`)
A WeakMap tile-index keyed on the **`scene.items` array identity** — built O(N) once per identity, O(1) lookups, GC'd when the array is replaced. Textboxes / connectors / rectangles fall through to **O(N) scans** (connectors check every path tile; rectangles scan reversed so top-most wins).

**Interaction with drag:** during a CSS-preview node drag the items array identity is **stable** (model unwritten) → the index stays warm. During per-frame reducer writes (connector / reconnect) the array is **replaced every frame** → the index is **rebuilt O(N) per frame**.

### 5.8 2D ↔ ISO parity
**Parity holds across every interaction surface.** The canvas-mode split is implemented once, in the `CoordinateTransformStrategy` pair ([`utils/coordinateTransforms.ts`](../../packages/axoview-lib/src/utils/coordinateTransforms.ts)), selected by `CanvasModeProvider`; both the **interaction** layer (`getMouse` ← injected mode-aware `screenToTile`) and the **render** layer consume the same strategy. Connectors route in **tile space** (projection-independent) and are projected only at render.

Two latent traps:

- **Duplicated projection math.** `DragItems.tileDeltaToPixels` reimplements both projections' delta math instead of deriving from the strategy's `toScreen`. It matches *today*, but a strategy change wouldn't propagate → drag preview would diverge from rendering in one mode. Derive from the active strategy.
- **`getMouse`'s default `screenToTileFn` is ISO-hardcoded.** It is only safe because `useInteractionManager` always injects the mode-aware fn. **Always inject `useCanvasMode().screenToTile`** — a handler that calls `getMouse` without it silently snaps via ISO in 2D.

### 5.9 Per-element interaction contract — the new-element checklist

Every placeable element must be wired into the **same set of surfaces**, and the exact wiring differs by whether it renders to the **DOM** or to a **WebGL canvas**. The recurring bug (Labels, twice) is a new element type wired into *some* surfaces and silently missing others — and the gaps don't show up in tests that assert the model flag, only in what the user sees. This is the matrix; grep the symbols, they don't drift.

| Element (ref type) | Render layer | Live **drag preview** (before mouseup) | Lasso hit | Group-drag seed → commit |
|---|---|---|---|---|
| Node (`ITEM`) | `NodesCanvas` (WebGL) + DOM `Node` overlay for the selected/dragged one | CSS `--ff-drag-dx/dy` on the DOM `[data-drag-id]` node | tile (`isWithinBounds` / `isPointInPolygon`) | `seedDragItemPosition` → `initialTiles`; `batchUpdateViewItemTiles` |
| Rectangle (`RECTANGLE`) | `RectanglesCanvas` (WebGL); Renderer lifts the **dragged** rect to a DOM `Rectangle` | CSS `--ff-drag-*` on the DOM wrapper | AABB overlap (`doBoundsOverlap`) | `seedDragItemPosition` → `initialRectangles`; `batchUpdateRectangles` |
| Text box (`TEXTBOX`) | DOM | CSS `--ff-drag-*` | full bounds (`getTextBoxEndTile` + overlap) | `seedDragItemPosition` → `initialTiles`; `batchUpdateTextBoxTiles` |
| Floating Label (`LABEL`) | `LabelsCanvas` (WebGL) — **no DOM element** | **UI-state channel**: `labelMove` (single, from `LabelHitLayer`) / `labelMoves` (group, from `DragItems`) → `LabelsCanvas` redraws the chip | tile (anchor `tile`) | `seedDragItemPosition` `LABEL` branch → `initialTiles`; `batchUpdateLabelTiles` **+ `clearLabelMoves`** |
| Connector (`CONNECTOR` / `CONNECTOR_ANCHOR`) | `ConnectorsCanvas` (WebGL); DOM `Connector` for the selected one | `scene.previewConnectorPaths` (synthetic scene path, one call/frame) | path-hit (`segmentIntersects*`) + tile-bound waypoint/endpoint capture (I-2) | endpoints ride their nodes; tile-bound anchors seeded from `ref.tile`; committed per-connector |

**The load-bearing distinction — preview channel by render layer:**

- **DOM elements move for free.** They carry a CSS `--ff-drag-*` transform on their `[data-drag-id]` wrapper (§6.1), so the compositor moves them with no model write.
- **Canvas-drawn elements have no DOM node to translate**, so they need an **explicit preview channel** that the canvas layer reads each frame: Labels use `labelMove`/`labelMoves` (UI state), connectors use `previewConnectorPaths` (scene state). **Forgetting this is the "the element doesn't move when I drag it, then jumps into place on release" bug** — the commit path is fine, only the live preview is missing. A canvas element with no preview channel *looks* broken even though the model is correct.

**Checklist when you add a new placeable element** — wire ALL of these, then add altitude-correct tests (assert the observable, never just the model flag):

1. **Render + visibility gate.** Filter the render layer by `layers.length === 0 || visibleIds.has(id)` — **not** `visibleIds.size === 0` (that empties when everything is on a hidden layer, showing all). Same gate on any hit-proxy.
2. **Hit-testing.** Add it to `getItemAtTile` if it needs geometric click/hover selection.
3. **Both lasso collectors** — `Lasso.getItemsInBounds` **and** `FreehandLasso.getItemsInFreehandBounds`. Guarded by [`lassoDragParity.test.ts`](../../packages/axoview-lib/src/interaction/modes/__tests__/lassoDragParity.test.ts) — add the type to its `EXPECTED_TYPES`.
4. **Group-drag seed + commit** — a branch in `Cursor.seedDragItemPosition` (into `initialTiles`/`initialRectangles`) **and** in `DragItems` (preview accumulation + `mouseup` batch-commit). Guarded by `DragItems.modes.test.ts`.
5. **Live drag preview channel** appropriate to the render layer (see the distinction above). Canvas elements: publish during `mousemove`, **clear on both `mouseup` (after commit) and `exit` (escaped drag)**.
6. **Interactable gate on every interaction path** (§7 I-1) — hover (`updateHoverCursor` + `HoverOutline`), click, select-all, context menu.
7. **Off-grid (ADR 0023)** — if it can be unsnapped, thread its `offset` through the render layer, the transform-controls frame (`TransformControls` `offset` prop), and the drag preview/commit.

---

## 6. Perf invariants — the load-bearing set

**Performance is the product.** Each rule below cost a real bug. The React/DOM-layer diagnostic playbook is [perf-troubleshooting.md](perf-troubleshooting.md); the GPU substrate's is [canvas-rendering-guidelines.md](canvas-rendering-guidelines.md).

### 6.1 The CSS-only drag preview — the most fragile invariant set
During a node drag **the model is not written**. Node position moves via `--ff-drag-dx/dy` CSS variables on `[data-drag-id]` elements (compositor-only — no React, no immer, no layout); connector geometry is recomputed against a **synthetic view** and written straight to `scene.connectors[].path` via `previewConnectorPaths`, wrapped in **`flushSync`** so wires don't lag the nodes by a frame. Tiles commit once on `mouseup`. *(This fix took the multi-drag cliff from 19s to 0s.)*

The contract, all five parts:

1. `view.items[].tile` and `anchors[].ref.tile` are **stale until mouseup**.
2. Live node position lives **only** in the `--ff-drag-dx/dy` DOM vars.
3. Live connector geometry lives **only** in `scene.connectors[].path`.
4. **`data-drag-id` is part of the contract** — removing it breaks DOM targeting.
5. **One** `previewConnectorPaths` call per frame, covering items **and** waypoints.

**A rewrite that moves nodes by writing the model per pointermove reinstates the cliff.** If a touch/pen path routes through different code, it must replicate (2)–(5) or it won't get the perf — and two writers to `scene.connectors[].path` in one frame reintroduce flicker. Guarded by `css-preview-mid-drag.spec.ts`.

### 6.2 Drag transactions — one gesture, one undo entry
`beginDragTransaction` opens one history bracket and **freezes `pendingPre`** on both stores so per-tick `set()` skips `produceWithPatches`; commit consumes it and pushes **one** entry. **Invariant:** N per-tick writes → **1** undo entry + **0** patch-generation cost mid-drag.

**Leak risk:** if `entry`/`exit` don't pair exactly once, the bracket leaks open → `saveToHistoryBeforeChange` stays suppressed for *subsequent* edits, silently dropping their undo history. Guarded by `connector.dragPerf.test.tsx` ("40 ticks → exactly 1 history entry").

### 6.3 Closed-form router — zero allocation per tick
See §5.5. The `<1500ms / 40 ticks` bound in `connector.dragPerf.test.tsx` catches an order-of-magnitude regression (A* put this in the multi-second range on the same fixture).

### 6.4 Render isolation — keep `useScene()` out of hot components
`Node` is a thin position shell; the heavy tree is `NodeContent`, memoized on stable primitive props. Critically it uses **`useSceneActions()`, not `useScene()`** — `useScene()` subscribes shallow to `{views,…}`, which **ticks every drag frame** and defeats the memo gate. **Don't thread new per-pointer state through any slice the SceneLayers subscribe to**, or every node re-renders per frame again.

Likewise, **pan and zoom must never trigger a React render of the scene tree**: `SceneLayer` subscribes to the store and writes `transform` **directly to the DOM ref**. Any new pan/zoom path (touch pan, pinch) **must** drive `uiState.scroll`/`setZoom` through the same store, exactly as `Pan.mousemove` does.

### 6.5 The open GC cliff — do not worsen
`CONNECTOR.mousemove` and `RECONNECT_ANCHOR.mousemove` call `scene.updateConnector` **every frame**, which runs `produce()` over the whole model plus a nested `produce` in `syncConnector` (~100–200KB/clone, ~12MB/s at 60fps). A sustained (≥50s, no commit) connector drag climbs to ~336MB and stalls ~5s before a stop-the-world GC — **open**, tracked in [known_issues.md](../../known_issues.md). The drag transaction removed the *patch* cost, not the *clone* cost.

**Keep these two modes' per-frame writes no more frequent than today** (RAF-throttled), and ideally route them through the §6.1 preview path. A second per-frame writer brings the cliff sooner.

### 6.6 RAF throttle
`useRAFThrottle` coalesces `mousemove` to **one** processed update per animation frame (latest-wins); down/up flush immediately. **Invariant:** move reducers run **≤ once per frame** regardless of device rate — a 1000Hz pen would otherwise run the router 1000×/s. `pointermove` fires far denser than `mousemove`, so **any pointer work must stay on the throttle and flush on down/up/cancel**. The e2e harness's per-event `requestAnimationFrame` await *depends* on this throttle existing.

### 6.7 Measuring
The device-agnostic anchor is `connector.dragPerf.test.tsx` against the 80-node/120-connector `perf-stress-diagram.json` fixture — it exercises the scene-action layer directly (no DOM), so it survives input-layer changes. For the §6.1/§6.6 invariants there is **no automated perf test**: use the `DiagnosticsOverlay` + `?perfprobe=1` render probe on the same fixture.

> **An interactive FPS floor cannot be captured headlessly.** Synthetic drags await a RAF per event and are paced by the automation IPC roundtrip, so the overlay's FPS reflects the *automation cadence*, not interactive rendering. Reporting that as a perf floor is fabrication. Heap/GC during a driven drag *is* real signal; FPS needs a human + DevTools.

---

## 7. Selection invariants

- **I-1 — `isItemInteractable`.** Locked/hidden items are non-interactive ([ux-principles §4.3](ux-principles.md)). Consulted by `Cursor.mousedown`, Lasso/FreehandLasso bounds, `onContextMenu`, and Ctrl+A. **Every new selection path MUST consult it** — one that skips it is the bug.
- **I-2 — `getConnectorWaypointRefs`.** A connector carries its **tile-bound waypoints** into any selection ([ADR 0006](../adr/0006-canvas-selection-contract.md), [ux-principles §4.4](ux-principles.md)). Endpoints ride their nodes automatically; tile-bound waypoints don't — omitting them pinches multi-drag and orphans on delete.
- **I-3 — single-source selection.** `selectedIds.length === 1 ⇔ itemControls` mirrors it. Every selection path goes through `setSelectedIds` / `setItemControls` — **never a new slice**.

---

## 8. Abort / commit semantics

| Mode | Commits on | Discards on |
|---|---|---|
| `CURSOR` | mouseup (selection write) | — |
| `DRAG_ITEMS` | mouseup (`batchUpdate` + commit) | `exit` discards the **node** preview; textbox/rect/anchor already committed |
| `CONNECTOR` | 2nd click / drag mouseup | **Escape** (`deleteConnector`) |
| `RECONNECT_ANCHOR` | per-frame + mouseup | none — per-frame writes stick |
| `RECTANGLE.DRAW` / `.TRANSFORM` | mouseup (bracketed) | none — abort leaves last state |
| `TEXTBOX` | mouseup (select) | mouseup off-canvas → `deleteTextBox` |
| `LABEL` / `PLACE_ICON` | mouseup (create/place) | n/a |
| `LASSO` / `FREEHAND` | mouseup (mirror `selectedIds`) | empty drag → `CURSOR` |

**Known divergences — real, current, and worth knowing before you design a cancel gesture:**

- **Only `CONNECTOR` has a true Escape-abort.** Every other mutating mode ignores Escape. `DRAG_ITEMS` does **not** abort on Escape — the mode persists and the next mouseup commits the move.
- **There is no `rollbackDragTransaction`.** `useSceneActions` exposes only `begin`/`commit`; every `exit` safety-net **commits**. Node CSS-preview drags abort-to-origin *by accident* (the preview is discarded and the model was never written); per-frame reducer drags **commit in place**. **A uniform "cancel restores origin" needs a new rollback primitive the codebase lacks** — don't promise one in a design without building it.
- **Mid-drag tool-hotkey is an undocumented partial abort.** Pressing `r` during a node drag runs `DragItems.exit` on the next event → nodes snap back, other item types commit. Works by side effect, not by design.

### 8.1 Undo/redo is TWO independent patch stacks
Node and connector drags write **both** `modelStore.history` (tiles, anchors, rectangles, textbox model) and `sceneStore.history` (connector paths, scene textboxes). `useHistory.undo/redo` drives both — model first, then scene — each **independently gated** by its own `canUndo/canRedo`. A drag transaction brackets **both** stores, so a gesture that touches both pushes one paired entry per stack.

**One keystroke must revert exactly one logical action.** The dual stacks skewing apart was a real P0 (D-7); the fix is sequence-stamping via [`stores/historySequence.ts`](../../packages/axoview-lib/src/stores/historySequence.ts) (`allocateHistorySequence`), consumed by `useHistory`. Don't add a store write that bypasses it.

> **Still open:** cross-view undo (D-9) — the scene store holds only the current view but its history stack is global and unscoped, so undoing after a page switch can apply patches to the wrong view. Tracked in [known_issues.md](../../known_issues.md).

---

## 9. Reference implementations & guards

**Read these first when in doubt:**

| Concern | Reference |
|---|---|
| Dispatch, gate, keybindings | [`interaction/useInteractionManager.ts`](../../packages/axoview-lib/src/interaction/useInteractionManager.ts) |
| Pan / zoom / right-drag / context menu | [`interaction/usePanHandlers.ts`](../../packages/axoview-lib/src/interaction/usePanHandlers.ts) |
| The hub mode | [`interaction/modes/Cursor.ts`](../../packages/axoview-lib/src/interaction/modes/Cursor.ts) |
| The CSS-preview drag | [`interaction/modes/DragItems.ts`](../../packages/axoview-lib/src/interaction/modes/DragItems.ts) + [`hooks/useSceneActions.ts`](../../packages/axoview-lib/src/hooks/useSceneActions.ts) |
| Coordinate strategies (2D/ISO) | [`utils/coordinateTransforms.ts`](../../packages/axoview-lib/src/utils/coordinateTransforms.ts) |
| Router | [`utils/pathfinder.ts`](../../packages/axoview-lib/src/utils/pathfinder.ts) · [`utils/isoMath.ts`](../../packages/axoview-lib/src/utils/isoMath.ts) |

**The guards that pin this contract** (see [testing.md](testing.md) for the full catalogue): `Cursor.modes.test.ts` · `DragItems.modes.test.ts` · `connector.dragPerf.test.tsx` · `connector.renderIsolation.test.tsx` · `interactionManager.depStability.test.tsx` · `useRAFThrottle.cleanup.test.ts` · `css-preview-mid-drag.spec.ts` · `rectangleDrawTransform.modes.test.ts` · `rectangleTextbox.dragPerf.test.tsx` · touch specs under the `chromium-touch` project (`TouchPOM.ts`).

**Known guard gaps:** no automated test asserts the two-writer waypoint race (§6.1, visual-only), that `pointermove` is actually throttled under load (§6.6), or that pan/zoom causes zero scene re-renders (§6.4). Those three are render-probe manual checks.
