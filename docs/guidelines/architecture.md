# Axoview — Architecture Reference

**Last updated:** 2026-08-21 (rev 31 — header changelog collapsed to this line; the ADR count and the test totals replaced with pointers to the files that measure them) · revision history: `git log --follow docs/guidelines/architecture.md`
**Codebase root:** `packages/axoview-lib/src` (library) · `packages/axoview-app/src` (application shell) · `packages/axoview-backend/src` (Express + fs adapter) · `packages/axoview-worker/src` (Hono + Cloudflare Pages Functions)

**Purpose:** This is the **orientation map** — what the codebase contains and where each piece lives, tight enough to read in five minutes before touching a surface. It is deliberately *not* the comprehensive reference: decisions live in ADRs, the deep architectural narrative + file-by-file inventory + KPIs live in the frozen technical review, the test catalogue lives in `testing.md`, and runtime issues live in `known_issues.md`. Each section below points to its deeper source.

**Where the depth lives:**

| You want… | Read |
|---|---|
| The *decision* behind a contract (why it works this way) | [docs/adr/](../adr/) — one per contract |
| Quality KPIs, `/audit` scorecard, gate audit | [technical-review-2026-07-29.md](../reviews/technical-review-2026-07-29.md) — the standing full-audit baseline (v3.7.0) |
| Deep architecture narrative, sequence diagrams, file-by-file inventory | the retired 2026-06 review — git history (the review series keeps latest + landmarks; see [docs/README.md](../README.md)). §2 below is the maintained orientation |
| The WebGL2 render-substrate fold in depth | [ADR 0038](../adr/0038-webgl-instanced-render-substrate.md) (the scoped 2026-07-08 review is retired — git history) |
| The full regression-suite catalogue (every suite, its contract, gaps) | [testing.md](testing.md) |
| Open runtime issues, deferred fixes, perf cliffs | [known_issues.md](../../known_issues.md) + [perf-troubleshooting.md](perf-troubleshooting.md) |
| GPU/canvas pixel-fidelity rules | [canvas-rendering-guidelines.md](canvas-rendering-guidelines.md) |
| From-scratch deploy walkthrough | [deployment.md](../deployment.md) |
| Design language (UI surfaces) | [ux-principles.md](ux-principles.md) |
| Strategic phase roadmap | [PLAN.md](../../PLAN.md) |
| How a working session runs (skill cadence) | [workflow.md](../workflow.md) |

> **Review currency:** every review above is frozen at its cut point and the released line is now **v3.7.0** (2026-07-14) — none covers Drive storage (ADRs 0035–0037), the landing/`/app` split (0040–0041), or Drive-native sharing (0042–0043). For those, this map + the ADRs are the current truth.

---

## Table of Contents

1. [Feature Inventory](#1-feature-inventory)
2. [Architecture Map](#2-architecture-map) — [2a Store](#2a-store-layer) · [2b Modes](#2b-mode-state-machine) · [2c Scene API](#2c-scene-api) · [2d Reducers](#2d-reducer-layer) · [2e Schema](#2e-schema-layer) · [2f Clipboard](#2f-clipboard-module) · [2g History](#2g-history-system) · [2h Component Tree](#2h-component-tree) · [2i Event Propagation](#2i-event-propagation) · [2j Config](#2j-configuration-layer) · [2k i18n](#2k-internationalisation-i18n-layer) · [2l App Providers](#2l-axoview-app-provider-decomposition) · [2m Deployment Contract](#2m-deployment--api-contract) · [2n Workspace Bundles](#2n-workspace-bundles--lean-icon-save)
3. [Performance Architecture](#3-performance-architecture)
4. [Lessons Learned](#4-lessons-learned)
5. [Tests, Gaps & Quality](#5-tests-gaps--quality)

---

## 1. Feature Inventory

A "what exists and where it lives" map. The deep behavioural contracts (gotchas, invariants) for the load-bearing ones are in the ADRs and Lessons Learned — cross-referenced inline. Implementation detail that drifts with the code is intentionally **not** restated here; the source is truth.

### Canvas Interaction Modes

| Feature | Source | Entry Point |
|---|---|---|
| **Cursor / Select** | `interaction/modes/Cursor.ts` | `useInteractionManager` → Cursor mode |
| **Multi-select (`selectedIds`)** | `stores/uiStateStore.tsx`, `utils/connectorSelection.ts` | `setSelectedIds` / `toggleSelected` / `clearSelection`; Ctrl+click, Ctrl+A, Lasso mirror |
| **Pan** | `interaction/modes/Pan.ts`, `interaction/usePanHandlers.ts` | `usePanHandlers` bypass before `processMouseUpdate` |
| **Lasso** | `interaction/modes/Lasso.ts` | Mode dispatch in `processMouseUpdate` |
| **Freehand Lasso** | `interaction/modes/FreehandLasso.ts` | Mode dispatch in `processMouseUpdate` |
| **Drag Items** | `interaction/modes/DragItems.ts` | From `Cursor.mousemove` (mousedown + moved tile) |
| **Connector** | `interaction/modes/Connector.ts` | ToolMenu / hotkey / Elements panel card |
| **Place Icon** | `interaction/modes/PlaceIcon.ts` | ToolMenu "Add item" / Elements drag |
| **Draw / Transform Rectangle** | `interaction/modes/Rectangle/` | Elements panel card / `TransformAnchor.tsx` |
| **TextBox** | `interaction/modes/TextBox.ts` | Hotkey / Elements panel |
| **Reconnect Anchor** | `interaction/modes/ReconnectAnchor.ts` | Anchor-handle mousedown |
| **Touch / pen gestures** | `interaction/useInteractionManager.ts` (touch state machine) | Pointer Events → synthetic `SlimMouseEvent` forwarded into the modes above |

**The contracts that matter** are locked in [ADR 0006 — Canvas Selection Contract](../adr/0006-canvas-selection-contract.md) (the single + multi-select gesture matrix, connector-waypoint grouping, `getConnectorWaypointRefs` invariant) and [ux-principles §4](ux-principles.md). Touch/pen input (tap-select, drag-to-move/reconnect, two-finger pinch, long-press context menu, hold-then-drag lasso, drag-from-panel placement) is a Pointer-Events state machine that disambiguates by what's under the finger at down and forwards synthetic mouse events into the same modes — locked in [ADR 0018 — Touch/Pen Gesture Contract](../adr/0018-touch-pen-gesture-contract.md) and [ux-principles §9](ux-principles.md); the mouse path is unchanged. The high-frequency drag-performance design (CSS-preview path, `previewAnchorTiles`, the stale-model race) is documented in [perf-troubleshooting.md](perf-troubleshooting.md) and summarised in [§3](#3-performance-architecture). The `isRendererInteraction` / `mousedownHandled` guards are explained in [§2b](#2b-mode-state-machine) and [§4](#4-lessons-learned).

### Clipboard · History · Views

| Feature | Source | Entry |
|---|---|---|
| **Copy / Cut / Paste** | `clipboard/useCopyPaste.ts` | `Ctrl+C/X/V` in `useInteractionManager` keydown |
| **Undo / Redo** | `hooks/useHistory.ts` + model/scene stores | `Ctrl+Z` / `Ctrl+Y` / ToolMenu |
| **Multi-view** | `stores/reducers/view.ts`, `hooks/useScene.ts` | ViewTabs UI (EDITABLE only) |

Model and scene maintain **independent** patch-pair history stacks (max 50 each) — see [§2g](#2g-history-system). `createView` is **not** undoable (known gap). Clipboard mechanics (centroid, ID remap, anchor detachment) are in [§2f](#2f-clipboard-module). The diagram title in ViewTabs is read-only (managed at the file level via Save / Save As, 2026-03-27); page (view tab) names remain renameable inline.

### Model Data

- **Items (nodes)**: `ModelItem` (id, name, description?, notes?, headerLink?, icon?) + `ViewItem` (id, tile, labelHeight, labelFontSize, labelColor) — always a pair. `description` is the **Caption** (rich-text shown on canvas, Zod max 50,000 chars); `notes` is private panel-only documentation (no max). Both optional HTML strings from Quill — old diagrams load fine.
- **Connectors**: anchors array, color, style, lineType, labels, showArrow. Scene layer stores computed `path`.
- **Rectangles**: from/to tile coords, color, customColor. Pure model.
- **TextBoxes**: tile, content, fontSize, orientation. Scene stores computed `size`.
- **Labels**: `ConnectorLabel[]` (id, text, position 0-100, height, line, showLine).
- **Icons** (`model.icons`): conflates the side-dock catalog (bundled fixtures) and per-diagram persistence (custom + overrides). Lean save strips bundled fixtures on write; load-time merge rehydrates them. See [§2n](#2n-workspace-bundles--lean-icon-save) + ADRs 0002/0003.
- **`requiredPacks: string[]`** (optional, model-level): non-isoflow icon collections the model references; consulted by importers before the ADR-0002 merge. Derived-but-preserved (see [§2n](#2n-workspace-bundles--lean-icon-save)).

### Inline Rename

| Surface | Trigger | Component |
|---|---|---|
| **Node label** | F2 · double-click label | `SceneLayers/Nodes/Node/Node.tsx` (`inlineEditNodeName` CustomEvent) |
| **TextBox** | F2 · double-click label | `SceneLayers/TextBoxes/TextBox.tsx` |
| **File tree** | F2 · context-menu Rename | `components/fileExplorer/` → `react-arborist` |

Double-click rename in the file tree does not work (F2 / context-menu workaround) — tracked in [known_issues.md](../../known_issues.md).

### Styling, Labels & Canvas Text (ADRs 0030–0034)

The labels & text-styling productization cycle's subsystems. The **docked style strip is the single styling writer** — never re-add styling to a panel (ADR 0030). Text-box `content` HTML is DOMPurify-sanitized at load / seed / commit / render (ADR 0029); link URLs are scheme-forced to `https?:` / `mailto:` / `tel:` / `#` at every write and render sink.

| Feature | Source | Entry Point |
|---|---|---|
| **Docked style strip** (canonical styling surface) | `components/TopBarStyleControls/TopBarStyleControls.tsx` | Portaled into the ADR 0005 Group-1 "Format" slot; edits the selected item / homogeneous bulk. [ADR 0030](../adr/0030-docked-style-controls-strip.md) |
| **Floating Label entity** | `schemas/label.ts`, `stores/reducers/label.ts`, `components/SceneLayers/` Label layer | Elements panel / placement mode; renders above the node layer. [ADR 0031](../adr/0031-floating-label-entity-model.md) |
| **Node/connector name↔label decouple** | `utils/seedNodeLabel.ts`, `utils/seedConnectorLabel.ts` | Load-time idempotent seed (`useInitialDataManager`); `label`/`labels[]` = on-canvas text, `name` = Layers identity. [ADR 0032](../adr/0032-node-name-caption-label-model.md) |
| **Inline canvas text editing + dual-scope strip formatting** | `components/SceneLayers/TextBoxes/TextBoxInlineEditor.tsx`, `utils/richTextTransform.ts`, `utils/quillListAutofill.ts`, `utils/foldTextBoxStyleFlags.ts` | Double-click / F2 / place-and-type; strip B/I/U/S applies whole-content (selected) or live range (editing). [ADR 0034](../adr/0034-inline-canvas-text-editing-and-dual-scope-strip-formatting.md) |
| **Inline link cards** | `components/SceneLayers/TextBoxes/TextBoxLinkCard.tsx`, `ElementLinkCard`, `utils/quillLinkShortcut.ts` | Ctrl/Cmd+K or caret-in-link; body-portaled Popper; web URL (`normalizeWebLinkUrl`) or `#diagram:<id>` fragment nav. [ADR 0034](../adr/0034-inline-canvas-text-editing-and-dual-scope-strip-formatting.md) |

### Workspace I/O (ADRs 0001–0003)

| Feature | Source | Notes |
|---|---|---|
| **Project zip export / parse / import** | `axoview-app/src/services/project/projectZip.ts` | Three scopes/destinations; manifest validated before mutation; IDs always rewritten. [ADR 0001](../adr/0001-project-zip-format.md). |
| **Lean icon save** | `axoview-lib/src/utils/leanSave.ts` → `stripDefaultIcons` | Drops pure duplicates of `bundledFixtures.byId`. [ADR 0003](../adr/0003-session-storage-lean-icon-save.md). |
| **Load-time icon merge** | `axoview-lib/src/hooks/useInitialDataManager.ts` | `bundledFixtures ∪ model.icons`, runs every load. [ADR 0002](../adr/0002-icon-catalog-merge-on-load.md). |
| **Delete imported icon + workspace usage scan** | `ItemControls/IconSelectionControls/Icon.tsx`, `LeftDock/DeleteIconConfirmDialog.tsx`, `axoview-app/src/services/iconUsage.ts` | Hover-× on imported tiles; `TOMBSTONE_ICON` fallback for unresolved ids. Per-diagram scoping is a known gap (see [known_issues.md](../../known_issues.md)). |
| **Session storage gauge / banner** | `fileExplorer/SessionStorageGauge.tsx`, `SessionModeBanner.tsx` | Listens to custom `axoview-session-changed` Event. |
| **`sessionWorkUnexported` flag** | `DiagramLifecycleProvider` | Drives `beforeunload` in session mode; clears only on project-zip export. |

### Settings

| Setting | Config File | Default |
|---|---|---|
| Hotkey profile | `config/hotkeys.ts` | `'smnrct'` (s/m/n/r/c/t = select/pan/addItem/rect/connector/text; l=lasso, f=freehand) |
| Pan toggles (middle/right/ctrl/alt/emptyArea/arrows/wasd/ijkl, speed) | `config/panSettings.ts` | middle+right+arrows on; rest off; speed 20 px |
| Zoom to cursor | `config/zoomSettings.ts` | `true` |
| Connector interaction mode | `types/ui.ts` | `'click'` (vs `'drag'`) |
| Fixed shortcuts | `config/shortcuts.ts` | cut/copy/paste/undo/redo/help (non-configurable) |

Persistence flow + canonical type location (`types/settings.ts`) in [§2j](#2j-configuration-layer).

### UI Overlays

| Overlay | Component | Shown When |
|---|---|---|
| Dialogs (Export/Help/Settings) | `ExportImageDialog`, `HelpDialog`, `SettingsDialog` | `uiState.dialog` set |
| Notification snackbar | `NotificationSnackbar` (lib) · `NotificationStack` (app) | `uiState.notification` / `notificationStore` |
| Context menu | `CanvasContextMenu` (ADR 0027) | `uiState.contextMenu` set (right-click tap / long-press; the sole per-item command surface — Details/Rename/Add note/cut/copy/layer/z-order/delete) |
| Item controls panel | `ItemControlsManager` → `NodePanel` | `uiState.itemControls` set; EDITABLE = 2-tab (Details/Notes) — styling moved to the docked strip ([ADR 0030](../adr/0030-docked-style-controls-strip.md)), identity name in a collapsed Metadata section ([ADR 0032](../adr/0032-node-name-caption-label-model.md)); READONLY = single-scroll |
| Quick add popover | `QuickAddNodePopover` | EDITABLE; on `canvasEmptyDblClick` |
| Preview button | toolbar `IconButton` | EDITABLE + server storage + saved diagram |
| ToolMenu | `ToolMenu` | EDITABLE; Undo/Redo/Select/Lasso/Freehand/Pan/Connector (Rectangle + Text moved to Elements panel) |
| ZoomControls / ViewTabs / ViewTitle / hint tooltips | — | per editor mode (see Editor Modes below) |

Overlay region/ownership rules are locked in [ADR 0005 — Toolbar & Dock Layout Contract](../adr/0005-toolbar-and-dock-layout-contract.md) and [ux-principles §8](ux-principles.md).

### Export · Icon Packs · Canvas Modes

- **Export**: `ExportImageDialog` → `utils/exportOptions.ts`, `dom-to-image-more`. SVG optimizer in 3 phases (strip CSS, round floats, prune `display:none`) — see [testing.md `svgOptimizer.test.ts`](testing.md).
- **Icon packs**: `AxoviewProps.iconPackManager` (lib) + `axoview-app/src/services/iconPackManager.ts` (`useIconPackManager`). Lazy-loading by default — canvas renders immediately; unloaded packs appear as one-click load buttons in the Elements panel. `loadPacksForDiagram(items)` auto-loads referenced packs on diagram load.
- **Canvas modes** (`ISOMETRIC` / `2D`): renderer parameterised over a `CoordinateTransformStrategy` (`utils/coordinateTransforms.ts`); `CanvasModeContext` exposes the active strategy. `canvasMode` is a persisted setting; toggling **preserves the user's zoom and viewport center** — `getCanvasModeSwitchScroll` re-projects the tile under the viewport center (each strategy's `fromCanvasPoint`/`toScreen`) and recomputes `scroll`, rather than force-fitting (which made zoom "pop"; tactical locked decision #6). Adding a third mode is one strategy implementation away.
  - *2026-07-28:* the toggle + that scroll correction moved out of `ToolMenu` into `hooks/useCanvasModeToggle.ts`, because view-only mode never mounts `ToolMenu` — surfacing the button there alone would have dropped the correction and made a viewer's zoom "pop", the exact regression decision #6 exists to prevent. **Invariant: exactly one live consumer of the hook.** Its effect applies the scroll correction on every `canvasMode` transition, so two mounted at once would apply it twice. That holds structurally today — `EDITOR_MODE_MAPPING` grants `TOOL_MENU` to `EDITABLE` only, and `PreviewCanvasModeToggle` renders only in `EXPLORABLE_READONLY` — but a third mount site must either replace one of those or move the effect to a single always-mounted owner.

### Storage Providers · File Explorer · Cross-Diagram Links

- **Storage**: all ops route through `StorageManager` → active `StorageProvider`. Two shipped providers: `LocalStorageProvider` (server-backed when `/api/storage/*` reachable, else `sessionStorage`) and `GoogleDriveProvider` (2026-07-05/06 — see §2o). **Storage is per-diagram ("places model"), not a global mode**: the manager's active provider silently follows the open diagram ([ADR 0037](../adr/0037-storage-places-model.md)). Backend folder CRUD + tree-manifest in `axoview-backend/server.js`. Contract: [ADR 0010 — Session Backend Contract](../adr/0010-session-backend-contract.md).
- **File Explorer** (`axoview-app`, not lib): VS Code-style 280 px panel — `FileExplorerLayout`, `FileExplorer` (`react-arborist`), `FileTreeToolbar`, `ContextMenuItems`, `useFileTree`, `EmptyStateScreen`. Inline create/rename via a `__pending__` node; drag-and-drop with name-collision detection. Dual-place mode composes both providers' trees as synthetic place-root sections in ONE arborist tree, with per-section state rows (skeletons / sign-in / reconnect / error / setup / scope / empty) and cross-place DnD (session → Drive).
- **Cross-diagram links**: a node stores a reference to another workspace diagram (`linkedDiagrams` via `AxoviewProps`). In EXPLORABLE_READONLY, clicking opens the target in a new tab; a blue badge signals the link.

### Editor Modes

| Mode | Interactions |
|---|---|
| `EDITABLE` | All modes; ToolMenu, ItemControls tabs, ViewTabs (in bottom dock), right-click context menu, double-click popover |
| `EXPLORABLE_READONLY` | Pan + Zoom; click a node with caption/notes opens single-scroll readonly panel; ViewTabs shown |
| `NON_INTERACTIVE` | No interactions, no UI tools (`INTERACTIONS_DISABLED` mode) |

Starting mode from `getStartingMode()` in `utils`.

---

## 2. Architecture Map

> The store topology, package graph, component tree, and sequence flows were diagrammed in depth in the retired 2026-06 review §3–§4 (git history). This section is the maintained orientation summary and the formal mode + store definitions.

### 2a. Store Layer

Four Zustand stores in the lib (`modelStore`, `sceneStore`, `uiStateStore`, `localeStore`) + one in the app (`notificationStore`). All use the **`createStore`-inside-`useRef`-inside-Provider** pattern: one instance per provider-tree mount, read via `useStoreWithEqualityFn(selector)`; `…StoreApi()` returns the raw store for imperative `getState()`/`setState()`.

**Why context-based, not a global singleton:** multiple independent `<Axoview>` instances on one page get separate state trees. Singletons would bleed state between instances; the context pattern also gives SSR safety and per-test isolation. Testing implication: components must be wrapped in the provider tree (or the store hooks mocked) — the hooks throw outside a Provider.

| Store | Persistence | Holds |
|---|---|---|
| `modelStore` | saved in diagram | `version, title, description, colors, icons, items, views` + patch-pair `history` |
| `sceneStore` | derived (computed) | `{ connectors, textBoxes }` — paths + sizes; independent history stack |
| `uiStateStore` | settings → `localStorage` | mode, zoom, scroll, mouse, `selectedIds` + `itemControls`, dialog, dirty flag, settings |
| `localeStore` | localStorage | current locale + dictionary |
| `notificationStore` (app) | none | side-effect notifications, max 3 visible, FIFO |

History stores **diffs** (Immer `{ patches, inversePatches }` pairs), not snapshots — see [§2g](#2g-history-system). The detailed `uiState` field/action catalogue drifts with the code; read `stores/uiStateStore.tsx` for the current shape.

### 2b. Mode State Machine

**11 mode types** (the canonical formal definition):

`INTERACTIONS_DISABLED` · `CURSOR` · `DRAG_ITEMS` · `PAN` · `PLACE_ICON` · `CONNECTOR` · `RECTANGLE.DRAW` · `RECTANGLE.TRANSFORM` · `TEXTBOX` · `LASSO` · `FREEHAND_LASSO`

```
CURSOR ──(mousedown on item + mousemove)──→ DRAG_ITEMS
CURSOR ──(mousedown on empty + mousemove)─→ LASSO
DRAG_ITEMS ──(mouseup)────────────────────→ CURSOR
LASSO ──(mousedown inside selection)──────→ DRAG_ITEMS
LASSO ──(mouseup no sel / mousedown out)──→ CURSOR
RECTANGLE.* / TEXTBOX / PLACE_ICON ──(mouseup)──→ CURSOR
Any ──(hotkey)────────────────────────────→ target mode
Any ──(middle/right/ctrl/alt/empty mousedown)──→ PAN (via usePanHandlers)
PAN ──(left-click)────────────────────────→ CURSOR
```

The dispatcher in `useInteractionManager.ts` is a **module-handler map** (one handler module per mode in `interaction/modes/`), not an inline switch — the v1.1 Sonar wave drove its cognitive complexity 131 → <16 without altering a transition.

**Three guards thread through every handler** (the load-bearing ones; full debugging history in [§4](#4-lessons-learned)):

- **`isRendererInteraction = (rendererRef.current === e.target)`** — true *only* on empty-canvas clicks, because the transparent interaction div sits **below** the Nodes layer in DOM order (Nodes/Connectors/Rectangles capture their own clicks). Used on mousedown by Cursor, Pan, Connector, PlaceIcon, DrawRectangle, Lasso, FreehandLasso.
- **`mouse.mousedown` guard** (Lasso/FreehandLasso mouseup) — null when a toolbar click stopped propagation before `processMouseUpdate`; makes those mouseups no-ops.
- **`mousedownHandled` flag** (CursorMode) — set true by `Cursor.mousedown`; the context menu opens only when it is true, so an external `setMode({type:'CURSOR'})` followed by a mouseup can't spuriously open it. Timestamp alternatives fail (mode change + mouseup can land in the same ms).

Entry/exit lifecycle fires inside `processMouseUpdate` when `reducerTypeRef.current !== uiState.mode.type` (a ref, not reactive state). Pan has a **bypass path**: `usePanHandlers.handleMouseDown` returns `true` for pan gestures and skips `processMouseUpdate` entirely (no entry/exit, no `isRendererInteraction`). Transient right-click pan (FF-001) defers PAN entry until a 4 px drag threshold; right-click without drag is a deselect.

### 2c. Scene API

`hooks/useScene.ts` is a 13-line combiner of `useSceneData.ts` (read selectors: `currentView`, `items`, `connectors`, `hitConnectors`, `rectangles`, `textBoxes`) and `useSceneActions.ts` (writes + `transaction()` + `computePathsAsync` + `pasteItems`). Callers see one unified API.

Every mutating method calls `saveToHistoryBeforeChange()` first **unless inside a `transaction()`** (which collapses N operations into one checkpoint). All mutations go through pure reducers, then `setState()` with store-level `skipHistory=true`. Inside a transaction, `getState()` returns `pendingStateRef` so sequential action calls see each other's writes without explicit state threading.

Notable: `createView` does **not** checkpoint (gap — not undoable); `updateViewItem` runs `validateView` and **throws** on failure (no catch in `DragItems.mousemove`); `createConnector` accepts `skipPathfinding=true` for async paste; `pasteItems` routes connector paths through rAF-batched `computePathsAsync`.

### 2d. Reducer Layer

All reducers are **pure**: `(payload, context) → State` via Immer `produce()` — no I/O, no store reads, no async. `State = { model, scene }` (always both); `ViewReducerContext = { viewId, state }`.

Key behaviours: `deleteModelItem` uses `delete` (leaves a **sparse array** — see [§4](#4-lessons-learned)); `deleteViewItem` cascades connector removal from model + scene; `syncConnector` calls `getConnectorPath` and on error stores an empty path + `unroutable=true` (**never throws**); `updateView` uses `Object.assign(view.value, updates)` to preserve memo stability. Layer reducers (`CREATE_LAYER`…`ASSIGN_LAYER_TO_ITEMS`, `REORDER_VIEWITEM`) dispatch via `useLayerActions` directly.

### 2e. Schema Layer

`src/schemas/`, **Zod**. `modelSchema` runs `validateModel()` as a `.superRefine()` — referential-integrity checks: item `icon` exists in `model.icons`; connector colors exist; anchor `ref.item`/`ref.anchor` resolve in view items/anchors; connector has **≥ 2** anchors; an anchor has **exactly one** ref key (item OR anchor OR tile). Note: the 2-anchor minimum and ref-exclusivity are **app-level invariants**, not enforced at the schema level (see [testing.md `schemas/connector.test.ts`](testing.md)).

### 2f. Clipboard Module

Instance-scoped via `ClipboardProvider` (`clipboard/ClipboardContext.tsx`) — a `useRef<ClipboardPayload>` exposed through `get()`/`set()`/`has()`, mounted inside `<Axoview>` (no cross-instance bleed; replaced the old module-level singleton that caused test-order bugs). `useClipboard()` throws outside the provider.

Payload = `{ items[{modelItem,viewItem}], connectors[], rectangles[], textBoxes[], centroid }`. Paste: builds an `idMap`, mints new IDs for all entities, remaps in-selection connector `ref.item` and detaches out-of-selection ones (`ref.item = undefined`), preserves `ref.tile`, collision-avoids via `findNearestUnoccupiedTilesForGroup`, then switches to a synthetic LASSO selection of the pasted refs. **Gap:** connector-only selection has centroid `{0,0}` (offsets from tile 0,0). Full contract: [testing.md `useCopyPaste.test.ts`](testing.md).

### 2g. History System

Model and scene stores each keep an independent `{ past, future, maxHistorySize: 50 }` of Immer patch pairs. A **checkpoint** = one `saveToHistoryBeforeChange()` (calls `saveToHistory()` on both stores); `transaction()` guarantees one checkpoint for N ops. `undo()` applies `inversePatches` and pushes the **original entry** to `future`; `redo()` applies `patches` and pushes it back to `past` — no recomputation.

**Load-bearing invariant (2026-05-16):** any history-bearing store **must** push the *original* entry to `future` on undo (not a recomputed one), with `patches: current→applied` and `inversePatches: applied→current`. A recomputed-direction bug in `sceneStore.undo` once broke redo for actions touching *both* stores (connectors rendered with an empty path after redo — invisible). Pinned by `connector.createUndoRedo.test.tsx`. `canUndo = modelCanUndo || sceneCanUndo` (either store enables the button). Drag transactions (`beginDragTransaction`/`commitDragTransaction` in `useSceneActions.ts`) collapse a whole drag into one entry via a `pendingPreFrozen` flag.

### 2h. Component Tree

Full mermaid tree in the retired 2026-06 review §3d (git history). Provider order (from `Axoview.tsx`): Theme → Locale → Model → Scene → UiState → Clipboard → CanvasMode → LayerContext → App(inner), with `LeftDockSlot` / `RightSidebarSlot` / `BottomDockSlot` as absolute-positioned siblings.

**The one ordering insight that matters:** in `Renderer.tsx` the transparent `interactionsRef` interaction div sits **below** the Nodes + TransformControls SceneLayers, so `e.target === interactionsRef.current` is true only for empty-canvas clicks — the basis of the `isRendererInteraction` guard ([§2b](#2b-mode-state-machine)). `UiOverlay` is a sibling of `Renderer` and absolutely positions all UI relative to `rendererSize`.

Dock components: `LeftDock` (Elements / Layers tabs, `activeLeftTab`), `RightSidebar` (`itemControls` properties, `rightSidebarOpen`), and the per-view **Layer system** (`view.layers: Layer[]`; `LayerContextProvider` derives `visibleIds`/`lockedIds`/grouping; `useLayerActions` dispatches view reducers). Read those component files for current props — they drift.

**View-mode info popover** (ADR 0012): in `EXPLORABLE_READONLY` the right editing dock no longer auto-opens on selection (`setItemControls`/`setSelectedIds` gate `rightSidebarOpen` on editor mode). Instead `ViewModeInfoPopover` (a **screen-space** overlay in `UiOverlay`, positioned by a store subscription — not inside the zoom-scaled SceneLayer) surfaces an item's name / read-only notes / `headerLink`: hover (via `getItemAtTile` on `mouse.position.tile`, with a hover-intent delay) → preview; click (selection) → pinned, closed by X / Esc / click-away. It is **side-anchored** (right of the item, vertically centered) with **edge-flip** (left near the viewport edge) + vertical clamp, via `getTilePosition` origin RIGHT/LEFT so the offset is correct in both ISO and 2D. Parity across node/connector/rectangle/textbox; gated by `hasInfoPopoverContent` (name, notes, or headerLink).

**Ephemeral annotation overlay** (ADR 0014): a "paint on top" scratch layer available in `EDITABLE` + `EXPLORABLE_READONLY` (never `NON_INTERACTIVE`). State lives in `uiState.annotation` (`{ open, tool, color, thickness, strokes[], redoStack[] }`) — **only** in uiState, never in the Model, so no save/export/zip path can reach it (the whitelist in `modelFromModelStore` is the boundary; asserted in `annotationPersistence.test.ts` + the projectZip suite). `AnnotationLayer` is a screen-space SVG that captures pointer input **only while a draw/eraser tool is active** (the `select` tool is pass-through, so canvas selection/pan stay intact); strokes are drawn in **scene-canvas coordinates** inside a `<g>` mirroring the SceneLayer transform (direct store subscription → no re-render on pan/zoom). A **native** left-button block on the layer stops the window-level pan handlers from panning while drawing (React `stopPropagation` can't stop a native `window` listener); right-drag pan + wheel zoom still pass. `AnnotationPalette` is the **fixed** control beneath a pen toggle: an Excalidraw-style strip — Select · Draw · Shapes · Eraser, with Draw/Shapes variants behind hover fly-outs — plus colors, thickness, undo/redo, Clear. The pen is the single open/collapse toggle; **opening it resets the armed canvas tool + selection** (`setAnnotationOpen`). Closing hides the drawing but retains strokes; Clear is the only wipe; reload clears everything. Pure geometry in `utils/annotationGeometry.ts`.

**Preview-mode layer switcher** (ADR 0013): in `EXPLORABLE_READONLY`, `PreviewLayerSwitcher` (bottom-left `UiOverlay` overlay, shown only with ≥2 layers) drives a UI-only `uiState.previewLayerOverrides` (`{ hiddenLayerIds, soloLayerId }`). `LayerContextProvider` merges it into `visibleIds` via `isEntityVisibleInPreview` (solo wins; else base `layer.visible` minus hidden) — **only in view mode; `EDITABLE` derivation is unchanged**. The override never mutates `layer.visible`, is never persisted/saved (presenting can't dirty the diagram), and is cleared on `setView`/`setEditorMode`.

### 2i. Event Propagation

Window-level listeners in `useInteractionManager` capture **all** mouse/touch/key events globally (not on the Renderer element) so handlers fire even outside the canvas; `isRendererInteraction` then filters canvas-specific logic. Scoped exceptions: `rendererEl.wheel` (zoom), `rendererEl.dragstart` (prevent native drag hijack).

**`stopPropagation` points that must be maintained** — each prevents an overlay click from reaching the window listener:

1. `ControlsContainer.tsx` (ItemControls panel)
2. ToolMenu Box wrapper in `UiOverlay.tsx`
3. `NodePanel.tsx` (`onMouseDown` + `onContextMenu`)

Custom-event buses: `nodePanel` (context-menu "Add note" → panel Notes-tab focus), `canvasEmptyDblClick` (interaction manager → QuickAddNodePopover), `inlineEditNodeName` (F2 → Node/TextBox/ConnectorLabel inline rename, see `useInlineRename`). Touch events are synthesized to mouse events; `touchend` zeroes `clientX/Y` (a known wrong-position bug for touch).

### 2j. Configuration Layer

`config/*.ts` re-export their types from `types/settings.ts` (the **canonical** location for `HotkeyProfile`, `PanSettings`, `ZoomSettings`, `LabelSettings`) for backwards compat. `config/persistedSettings.ts` reads/writes `localStorage['axoview_user_settings']` (errors silently swallowed for SSR/private-browsing safety) and persists the 7 settings fields (incl. `readableLabels` — the opt-in "keep labels readable" toggle, ADR 0015). `UiStateProvider` hydrates them at init with `?? default`; `Axoview.tsx` saves them on change via a `shallow`-equality `useEffect`.

Coordinate/render math lives in three focused files split out of the old 866-line `renderer.ts`: `utils/isoMath.ts` (pure coordinate math), `utils/hitDetection.ts` (WeakMap spatial index, O(1) `getItemAtTile`), `utils/renderer.ts` (screen-space helpers + barrel re-exports — existing import sites unchanged).

### 2k. Internationalisation (i18n) Layer

**Two systems, one per package**, connected by the `locale` prop on `<Axoview>`:

- **axoview-app** — `react-i18next` v17 + `i18next-http-backend`, namespace `app`, JSON files (11 languages) copied to `build/i18n/app/`. `load: 'currentOnly'` (prevents short-code 404), `fallbackLng: 'en-US'`.
- **axoview-lib** — `localeStore` (Zustand), TS locale files (14 languages: en-US + 13). `allLocales` from `i18n/index.ts`; App derives `currentLocale` and passes it as the `locale` prop. The lib's `t()` returns a plain string with **no** parameter support — callers do `.replace('{count}', value)` manually.

Completeness is enforced by `i18n.localeCompleteness.test.ts` (every locale file must contain every top-level namespace from `en-US.ts`).

### 2l. axoview-app Provider Decomposition

`App.tsx` was decomposed (Phase 0A) into a composition root over two domain providers:

- **`AppStorageContext`** — the only place that touches storage init (`isServerStorage`, `isInitialized`, `StorageManager`). Boot does a single `GET /api/config` probe with an **800 ms `AbortSignal.timeout`** (caps Chrome/Windows dual-stack connect latency); `serverStorage` selects server-backed vs sessionStorage. An inline splash in `public/index.html` covers the cold-start gap.
- **`DiagramLifecycleProvider`** — diagram state, save / Save As / load / delete, keyboard shortcuts, `beforeunload` guard, icon-pack manager, save/discard/load + the ADR-0011 error dialogs.

> ⚠️ **Correction (from the 2026-06 review §3b, retired — git history):** the "103-line pure-composition `App.tsx`" this section once claimed is **stale** — `App.tsx` is ~442 LOC and carries the React Router tree, error/export/import dialogs, and icon-usage scanning.

### 2m. Deployment & API Contract

Three targets (local dev, Docker, Cloudflare Pages) from one codebase, sharing one `/api/*` HTTP contract; the frontend is byte-identical at the network boundary. **The durable contract is locked in [ADR 0009 — Deployment Topology](../adr/0009-deployment-topology.md) and [ADR 0010 — Session Backend Contract](../adr/0010-session-backend-contract.md).** Current-state route list, the key-based `StorageAdapter` interface, auth modes, and the Hono/Express split were diagrammed in the retired 2026-06 review §5–§6 (git history); the from-scratch walkthrough is in [deployment.md](../deployment.md). This doc no longer restates them.

Two routing facts post-date that frozen review and are **not** in it:

- **The site root is no longer the app** ([ADR 0040](../adr/0040-marketing-landing-and-spa-crawlability.md) / [0041](../adr/0041-discoverability-metadata-and-social-sharing.md), shipped v3.6.0). `/` serves an indexed marketing landing page; **the editor SPA moved to `/app`** (built as `app.html`, React Router `basename=/app`, assets at `/static`). Legacy `/display/*` links 301 to `/app/display/*` (`_redirects` + nginx + a dev-server fallback). Anything that hardcodes the editor at `/` is wrong — including older walkthrough docs.
- **Anonymous Drive preview is worker-only** ([ADR 0042](../adr/0042-drive-native-sharing-and-readonly-preview.md) / [0043](../adr/0043-deferred-backend-for-google-api-hardening.md)). `/display/drive/:id` renders a Drive file read through a **server read-proxy** (`/api/public/drive/:id`) so `GOOGLE_API_KEY` stays a Cloudflare **secret** and never reaches the browser; it honours Drive trash (delete kills the link, restore revives it). **The Cloudflare Worker implements this proxy; the Express/Docker target does not** — self-hosted deployments have no anonymous-preview path.

### 2n. Workspace Bundles & Lean Icon Save

Three load-bearing ADRs lock the persistence contract — read them when touching `services/project/`, `LocalStorageProvider`, `useInitialDataManager`, or `utils/leanSave.ts`:

| ADR | Concern |
|---|---|
| [0001](../adr/0001-project-zip-format.md) | Project zip format (manifest + `diagrams/<id>.json` + `tree-manifest.json`); ID rewriting; destination picker |
| [0002](../adr/0002-icon-catalog-merge-on-load.md) | `sideDockCatalog = bundledFixtures ∪ model.icons`; merge runs every load |
| [0003](../adr/0003-session-storage-lean-icon-save.md) | Strip default-catalog icons on every write; preserve custom + overrides; `requiredPacks` companion field |

The contract is **symmetric**: 0003 strips at write time, 0002 rehydrates at read time. Either side broken in isolation surfaces as "side dock empties after load" or "every diagram gets fatter on every save"; both directions are pinned by round-trip unit tests. `requiredPacks` is **derived-but-preserved** — re-derived only when every `item.icon` resolves against `model.icons`, otherwise preserved verbatim so a lean round-trip (autosave-before-packs-load, import-then-save) doesn't blow it away.

### 2o. Google Identity & Drive Storage (places model)

Shipped 2026-07-05/06 — three ADRs lock it: [0035](../adr/0035-google-identity-and-drive-authorization.md) (GIS implicit-flow token model), [0036](../adr/0036-google-drive-storage-provider.md) (Drive provider), [0037](../adr/0037-storage-places-model.md) (places model, supersedes 0036 §6). Load-bearing invariants:

- **Token custody**: the access token lives in `authStore` (zustand, never persisted); `getValidToken()` is the sole accessor and piggybacks on any in-flight GIS request. A `localStorage.setItem` spy in the unit suite enforces token-never-persisted. The **profile hint** (`axoview-google-profile`) persists identity ONLY — it pre-renders the avatar and arms the boot silent reconnect (`RECONNECTING` state; popup-blocked boots arm a one-shot gesture retry). `driveScopeGranted` tracks granular consent — a user can grant identity without `drive.file` (every Drive call then 403s; the explorer shows a "Grant access" row, not a dead retry).
- **Places, not modes**: `activeProviderId` means "the open diagram's place". `openDiagramById`/`handleCreateBlankDiagram` take a `placeId`; every `remoteStorageActive` branch keys off the open diagram with no per-branch routing. Sign-out flushes/closes the Drive-side diagram BEFORE revoking (`handleGoogleSignedOut(afterClose)`).
- **Drive mapping**: app files carry `appProperties.axoview`; the root folder carries `axoviewRoot` (root travels with the account, localStorage id is only a boot cache). Read ops use `resolveRoot()` (never creates — a tree load can't race the first-connect dialog into duplicate roots); writes use `ensureRoot()`. Delete = Drive trash. Moves between places are create→verify→delete-source (`driveTransfer`).
- **Coordination is event-driven** across mounts: `'axoview-drive-root-ready'` (setup gate → migration dialog), `'axoview-open-migrate'`, `'axoview-drive-setup'`.

---

## 3. Performance Architecture

The codebase has been through several perf passes; the **diagnostic narratives and current state live in [perf-troubleshooting.md](perf-troubleshooting.md)** and the runtime-metrics baseline in the retired 2026-06 review §8g (git history). The structural fixes still in force:

- **O(1) item lookup** — module-level `WeakMap<items[], Map<id,item>>` cache (`useModelItem`, `getItemAtTile`).
- **Patch-pair history** — diffs not snapshots ([§2g](#2g-history-system)).
- **Zustand transaction batching** — `transaction()` buffers in `pendingStateRef`, flushes as 2 `setState` calls regardless of N.
- **Viewport culling** — `Renderer.tsx` filters off-screen items/connectors via a coarse tile-bounds subscriber that bypasses React render until the range changes.
- **WebGL2 instanced substrate (T4, [ADR 0038](../adr/0038-webgl-instanced-render-substrate.md)) — the SOLE bulk renderer.** Nodes, floating labels, connector bodies and rectangle bodies are drawn by `glSpriteBatch` from a texture atlas, with the tile→screen transform computed in the vertex shader — so navigation is **O(1) on the CPU at any N** and panning holds 60 fps to ~20,000 nodes. **Since the 2026-08-02 canvas merge (ADR 0038 §8) all four entity kinds share ONE WebGL2 context and ONE sorted draw** — `SceneCanvas` sorts every bulk entity through `compareSceneDrawOrder` (layer ▸ z-index ▸ type rank ▸ iso depth) and issues **one `drawArraysInstanced` per atlas page**, typically one per frame, where there used to be four contexts stacked by mount order at fixed CSS z-indices. That is what makes `zIndex` and `layer.order` cross an entity type at all; the picker (`utils/hitDetection.ts`) resolves the same three tiers from the same comparator, so renderer and picker agree by construction (gated by `pickerAgreement.contract.test.ts`). The DOM `<Node>` (`Nodes.tsx`/`Node/Node.tsx`) survives only as a **sparse overlay** for the selected ∪ dragged item (keeps F2 inline-rename, the readable-labels counter-scale, and the `--ff-drag` drag preview). A browser without WebGL2 gets the `WebGLUnsupportedScreen` gate.
  - **Superseded:** the earlier Canvas2D node layer (T2, [ADR 0019](../adr/0019-canvas2d-node-render-layer.md)) **and its fallback path were removed** in the 2026-07-08 fold (PR #63, v3.5.0) — ADR 0019 is *superseded in part* (the bulk-substrate decision only). There is no Canvas2D/DOM bulk fallback and no A/B knob.
  - **Fidelity is a contract, not a detail** — a sprite is a *cached texture*, not a per-frame re-raster, so the atlas must stay a premultiplied-alpha pipeline end-to-end, line styles are geometry, and stroke widths need projection scaling. The hard-won rules live in [canvas-rendering-guidelines.md](canvas-rendering-guidelines.md); **CI cannot see any of it** — every visual change needs a real-browser check.
  - Measured by the engine-perf harness ([testing.md](testing.md), [ADR 0020](../adr/0020-engine-perf-harness-and-measurement-protocol.md)), whose anti-cheat is re-pointed at the GPU `drawCount`.
- **Per-connector path subscription** — each `<Connector>` subscribes to its own `scene.connectors[id].path`; an async path write re-renders only that one.
- **Closed-form connector router** (`utils/pathfinder.ts`) + **drag transactions** — replaced per-tick A\* + per-tile history entries; collapsed a drag to one undo entry.
- **CSS-preview drag path** — multi-element drags mutate `--ff-drag-dx/dy` CSS variables + `previewAnchorTiles` directly (compositor-only, no React/immer per frame); committed to the model only on mouseup. The `previewAnchorTiles` map exists specifically to keep `syncConnector` from running against stale model tiles mid-drag. Rectangles + text boxes now drag the same way (one `batchUpdate*` commit on drop).
- **Batched atomic paste (ADR 0021)** — `useSceneActions.pasteItems` assembles the N-scale arrays in one structural pass and calls `validateView` **once** (was a per-node `createViewItem → validateView` loop = O(N³); froze on a ~150-node paste-on-top). Still one undo entry; `validateView` ref-existence checks are Set-based (O(N+M)).
- **Derived `TileIndex` (ADR 0021)** — `utils/spatialIndex.ts`, a uniform-grid hash for O(1) occupancy/placement, **built from the `items` array** (recomputed when it changes, *not* mutated from reducers) so undo/redo applying immer patches straight to the store can't desync it. Paste placement is a rigid-stamp ring-walk over it (the whole block shifts to the first clear offset).
- **Canvas render-order sort cache (ADR 0021)** — `SceneCanvas` caches its sorted draw list keyed on `(rectangles, connectors, nodes, labels, layers, visibleIds, skipIds)` reference identities (+ an O(1) `layerId→order` map), so pan/zoom frames don't re-sort with a per-comparison `findLayer`. The map matters more since the merge: the sort now walks **every** bulk entity rather than one type's worth, so a linear `findLayer` per entity would be an O(entities × layers) cost the merge introduced. `hitDetection` caches the same lookup the same way, keyed on the `layers` array reference.

**Known cliff (deferred):** a sustained drag (≳50 s without committing) accumulates ~12 MB/s of immer-cloned state → a GC stall. Refactor design (keep the preview in `scene.connectors[id]` only until commit) is in [known_issues.md](../../known_issues.md). The `DiagnosticsOverlay` (`axoview-app/src/components/DiagnosticsOverlay.tsx`) is the in-app tool that produced these measurements — a low-overhead, always-available FPS/heap/long-task recorder with AI-compact + human-readable downloads (disabled by default in prod, always on in dev).

---

## 4. Lessons Learned

Durable "don't re-introduce this" knowledge — non-obvious fixes whose *why* isn't visible in the code. Each is symptom → root cause → fix. The full diagnostic stories for the perf items are in [perf-troubleshooting.md](perf-troubleshooting.md).

1. **Quill mount-time `onChange`** — ReactQuill fires `onChange` once on mount with the initial content, creating a phantom history checkpoint. Fix: `RichTextEditor` ignores the first `onChange` via an `isFirstRender` ref.

2. **Quill needs an explicit pixel height** — `flex:1`/`height:auto` collapses the editor to one line (Quill caches `offsetHeight` at init). Fix: always pass `height` in px (Notes 300, Caption 80, default 120).

3. **ToolMenu click → spurious context menu (2026-03-20)** — a ToolMenu button click propagated to the window listener, ran `Cursor.mousedown` (set `mousedownHandled`), and the following mouseup opened the context menu. Three-layer fix: `stopPropagation` on the ToolMenu Box; `isRendererInteraction` guard on `Lasso.mousedown`; `mouse.mousedown` guard on Lasso/FreehandLasso mouseup.

4. **`mousedownHandled` flag** — external `setMode({type:'CURSOR'})` (after placing an icon, finishing a connector, Escape) enters cursor mode with no preceding mousedown; without the flag the next mouseup opens the context menu. The flag captures *intent* (a real mousedown was processed); timestamp thresholds fail because mode-change + mouseup can share a millisecond.

5. **`setMode` must not clear `contextMenu`** — attempts to clear the context menu inside `setMode` regressed (type-preserving `CURSOR→CURSOR` updates and pan-exit both stomped a just-set menu). Correct abstraction: keep `setMode` a plain `set({ mode })` and gate the menu on `mousedownHandled`.

6. **`isRendererInteraction` checks the interaction div, not "the canvas"** — `rendererRef.current` is the transparent below-Nodes div; clicking a Node/Connector/Rectangle targets *that* element, so the guard is true only on empty grid. (Same fact anchors [§2b](#2b-mode-state-machine).)

7. **`reducerTypeRef` timing** — `processMouseUpdate` reads `uiStateApi.getState()` at entry; a prior handler's synchronous `setMode()` is already visible there while `reducerTypeRef.current` still holds the old type — which is exactly how the entry/exit transition is detected.

8. **Pan bypass path** — `usePanHandlers.handleMouseDown` returning `true` skips `processMouseUpdate`, so Pan's own `entry()` fires on the next event (first mousemove). Acceptable because `startPan` already set the cursor.

9. **Dev server reads the lib's `dist/`, not source** — editing `axoview-lib/src` is invisible until `npm run build:lib`; no hot-reload for lib changes. (See memory `project_dev_lib_rebuild`.)

10. **`deleteModelItem` uses `delete`, not `splice`** — leaves a sparse array (`length` includes holes). `forEach`/`map` skip holes, `find` works, but code assuming `length === count` can break. All other reducers `splice`.

11. **`NonIsometricIcon` must use `top: 0`** — the iso CSS matrix (`transformOrigin: top left`) rotates the tile so the left vertex lands at the element origin; `top:-halfH` shifts the icon ~41 px up *before* the matrix, rendering it elevated.

12. **`ConnectorMode.returnToCursor` must survive the first-click `setMode`** — click-mode's first-click `setMode` overwrites the mode object; the flag must be explicitly forwarded or it's lost before the second click.

13. **Scene-store undo/redo entries travel pre→post** — the load-bearing history invariant; full statement in [§2g](#2g-history-system).

14. **Stacking-context trap: `transform: translateZ(0)` on Axoview's outer Box (2026-05-09)** — any non-`none` transform creates a stacking context, trapping inner z-indexes (LeftDock 20, BottomDock 20) so an app-level sibling at `zIndex:5` (`EmptyStateScreen`) wins regardless. **Fix is geometric, not z-index:** position overlays to leave the chrome's pixels uncovered (`top:0,left:40,right:0,bottom:40`). A second trap: `.axoview-container > div { height:100% }` in `App.css` overrode inline `bottom:40` on the new siblings (removed). Heuristic: if you're fighting z-index across the `Axoview` boundary, reach for geometric exclusion. (Referenced by [ux-principles §8.4](ux-principles.md).)

15. **Unroutable connectors are now visible** — `syncConnector` wraps `getConnectorPath` in try/catch, emits `console.warn`, sets `unroutable=true`, and `<Connector>` renders a dashed-red indicator. Previously these were silent zero-size ghosts.

---

## 5. Tests, Gaps & Quality

The per-suite test catalogue, layer breakdown, classifications (VALID / SEMI-VALID), and current coverage gaps are maintained in **[docs/guidelines/testing.md](testing.md)** — that is the source of truth for counts and what each suite pins. Aggregate KPIs live in the **[2026-07-29 review](../reviews/technical-review-2026-07-29.md)** (health scorecard §1a, `/audit` pass §9); the older per-wave KPI series (2026-05/06/07 reviews) is retired to git history.

Suite counts, per-suite contracts, classifications and coverage gaps live in **[testing.md](testing.md)** — that is the only place they are measured; nothing here restates a number. The v1.1 wave closed the server-runtime test gap (the only **high**-severity item the post-v1.0.0 review named).

**Code-quality infrastructure:** ESLint v10 (flat config; `@typescript-eslint/no-explicit-any` is now **error**, baseline driven 144 → 0), Knip v6 (**hard-fail** in CI since 2026-06-10), and Jest coverage floors (global **34 / 23 / 29 / 34** statements/branches/functions/lines, re-ratcheted 2026-07-29 to sit ~6pp under measured reality; `stores/reducers/` and `schemas/` carry their own higher floors). Reports land in `reports/`.

**Enforced ratchets (2026-07-29).** Three checks were promoted out of the `/audit` skill into CI ([`test.yml`](../../.github/workflows/test.yml)) after the [2026-07-29 review](../reviews/technical-review-2026-07-29.md) found two of them were *structurally incapable of failing*:

| Gate | Command | Asserts | Baseline |
|---|---|---|---|
| Circular deps | `npm run check:cycles` | **file count ≥280** *then* cycles ≤ baseline | [`scripts/cycles-baseline.json`](../../scripts/cycles-baseline.json) |
| Bundle budget | `npm run check:bundle` | editor boot-critical gzip, total + per-chunk | [`scripts/bundle-budget.json`](../../scripts/bundle-budget.json) |
| Advisories | `npm run check:audit` | every `npm audit` finding fixed **or** allowlisted with a written reason + tripwire | [`scripts/audit-allowlist.json`](../../scripts/audit-allowlist.json) |

The load-bearing pattern is the **denominator assertion**: `check:cycles` verifies the module graph actually contains ≥280 files before it trusts the cycle count, because the bug it replaced was a truthful "no cycles" reported over 16 of 293 files (madge could not resolve the `src/…` alias without `--ts-config`). Any gate that can be starved of input must assert its input volume. Both scripts exit **2** ("gate broken") rather than **0** when they measure nothing — a green over an empty measurement is the failure mode, not a pass.

Prettier was **removed** as a gate in the same change: 156 drifting files, never in CI, and `prettier` already sat in Knip's `ignoreDependencies`. A measurement with no consumer trains people to skim past red. The v1.1 Sonar wave drove down cyclomatic complexity across the hot files (capstone `useInteractionManager.ts` 131 → <16) behind the ADR-0006 selection contract and the `__perf_refactor_regression__` baseline as guardrails. Full CI-gate + lint-debt detail: the v1.1-era inventory migrated into [testing.md](testing.md) ("v1.1 close-out gates"); the current gates are [test.yml](../../.github/workflows/test.yml) + the ratchets above.

**Standing functional gaps** (carried, product-decision pending): `createView` not undoable · `updateViewItem` throws mid-drag (no catch in `DragItems`) · connector-only clipboard centroid = `{0,0}` · `deleteModelItem` sparse array · touch `mouseup` zeroed coordinates · imported icons scoped per-diagram. Tracked with full risk/complexity in [known_issues.md](../../known_issues.md).

*End of document. This is the orientation map; the deep references it points to are the source of truth.*
