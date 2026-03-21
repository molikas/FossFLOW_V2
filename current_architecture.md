# FossFLOW (Isoflow) — Current Architecture & Pre-Refactoring Reference

**Date:** 2026-03-20
**Codebase root:** `packages/fossflow-lib/src`
**Purpose:** Comprehensive pre-refactoring reference — feature inventory, architecture map, test audit, gap analysis, lessons learned, and key APIs. Intended as the primary reference for any future architectural changes or major feature additions.

---

## Table of Contents

1. [Feature Inventory](#1-feature-inventory)
2. [Architecture Map](#2-architecture-map)
   - [2a. Store Layer](#2a-store-layer)
   - [2b. Mode State Machine](#2b-mode-state-machine)
   - [2c. Scene API](#2c-scene-api-hooksusescenets)
   - [2d. Reducer Layer](#2d-reducer-layer)
   - [2e. Schema Layer](#2e-schema-layer)
   - [2f. Clipboard Module](#2f-clipboard-module)
   - [2g. History System](#2g-history-system)
   - [2h. Component Tree](#2h-component-tree)
   - [2i. Event Propagation Architecture](#2i-event-propagation-architecture)
   - [2j. Configuration Layer](#2j-configuration-layer)
3. [Test Audit](#3-test-audit)
4. [Gap Analysis](#4-gap-analysis)
5. [Lessons Learned](#5-lessons-learned)
6. [Key APIs for Regression Coverage](#6-key-apis-for-regression-coverage)
7. [Known Runtime Issues & Limitations](#7-known-runtime-issues--limitations)

---

## 1. Feature Inventory

### Canvas Interaction Modes

| Feature | Source | Entry Point | Key Data | Gotchas |
|---|---|---|---|---|
| **Cursor / Select** | `interaction/modes/Cursor.ts` | `useInteractionManager` → `Cursor` mode entry | Reads `uiState.mouse`, `uiState.mode.mousedownItem`, `mousedownHandled`; writes `itemControls`, `contextMenu`, mode transitions | `mousedownHandled` flag distinguishes toolbar clicks (no mousedown fired) from genuine empty-canvas clicks — see Section 5 |
| **Pan** | `interaction/modes/Pan.ts`, `interaction/usePanHandlers.ts` | `usePanHandlers` short-circuits `onMouseEvent` before `processMouseUpdate` | Reads `mouse.delta.screen`, writes `scroll.position`; uses `isPanningRef`, `panMethodRef` | Has a **bypass path** in `onMouseEvent` — middle/right/ctrl/alt/emptyArea clicks call `startPan()` directly and return early without going through `processMouseUpdate` |
| **Lasso** | `interaction/modes/Lasso.ts` | Mode dispatch in `processMouseUpdate` | Reads `mouse.mousedown`, `mouse.position.tile`, `uiState.mode.selection`; writes mode with selection bounds + items array | `mousedown` guard (`!isRendererInteraction`) was **missing** until fixed; `mouseup` guard (`!mouse.mousedown`) was also missing; both caused toolbar-click→context-menu regression |
| **Freehand Lasso** | `interaction/modes/FreehandLasso.ts` | Mode dispatch in `processMouseUpdate` | Reads `mouse.position.screen`, writes `mode.path` (screen coords); on mouseup converts path to tiles via `screenToIso`, runs `isPointInPolygon` | Same missing guards as Lasso — both were added as part of the same fix; uses `rendererEl.getBoundingClientRect()` at mouseup, not `rendererSize` |
| **Drag Items** | `interaction/modes/DragItems.ts` | Transitioned to from Cursor.mousemove when mousedown + moved tile | Reads `mode.items`, `mouse.delta.tile`; calls `scene.transaction()` wrapping updateViewItem, updateTextBox, updateRectangle; handles anchor separately | `isInitialMovement` flag: first frame uses `mousedown.tile` delta, subsequent frames use `mouse.delta.tile`; sets `renderer.style.userSelect = 'none'` on entry |
| **Connector** | `interaction/modes/Connector.ts` | ToolMenu / hotkey → `setMode({type:'CONNECTOR'})` | Reads `connectorInteractionMode`; two sub-flows: click mode (first-click creates+stores `startAnchor`, second-click finalises) vs. drag mode (mousedown creates, mousemove updates anchor[1], mouseup finalises) | Entry calls `setWindowCursor('crosshair')`; Escape in `useInteractionManager` handles in-progress connection cleanup |
| **Place Icon** | `interaction/modes/PlaceIcon.ts` | ToolMenu "Add item" → `setMode({type:'PLACE_ICON', id:null})`; id set when icon selected | On mouseup: calls `findNearestUnoccupiedTile` then `scene.placeIcon()` | If no tile found (`targetTile` is null), no item is placed — silent no-op |
| **Draw Rectangle** | `interaction/modes/Rectangle/DrawRectangle.ts` | ToolMenu "Rectangle" | On mousedown: creates rectangle at cursor; on mousemove: `updateRectangle({to:...})`; on mouseup: → CURSOR | `isRendererInteraction` guard on mousedown |
| **Transform Rectangle** | `interaction/modes/Rectangle/TransformRectangle.ts` | `TransformAnchor.tsx` fires `setMode({type:'RECTANGLE.TRANSFORM'})` | Reads `mode.selectedAnchor` (BOTTOM_LEFT/BOTTOM_RIGHT/TOP_LEFT/TOP_RIGHT); computes new bounds with `getBoundingBox` + `convertBoundsToNamedAnchors` | mousedown handler is empty — the anchor component itself sets the mode |
| **TextBox** | `interaction/modes/TextBox.ts` | Hotkey or ToolMenu "Text" → `createTextBox` then `setMode({type:'TEXTBOX', id})` | On mousemove: `updateTextBox(id, {tile})`; on mouseup: if not renderer interaction → delete; if renderer → `setItemControls({TEXTBOX})` | Entry calls `setWindowCursor('crosshair')` |

### Clipboard

| Feature | Source | Entry Point |
|---|---|---|
| **Copy** | `clipboard/useCopyPaste.ts` | `Ctrl+C` in `useInteractionManager` keydown handler → `handleCopy()` |
| **Paste** | `clipboard/useCopyPaste.ts` | `Ctrl+V` in keydown handler → `handlePaste()` |

Copy reads selection from `LASSO`/`FREEHAND_LASSO` mode or single-item `itemControls`. Paste calls `findNearestUnoccupiedTilesForGroup` for collision avoidance, remaps all IDs, detaches anchors pointing outside the paste selection, and calls `scene.pasteItems()`. After pasting, switches to `LASSO` mode with a synthetic selection of all pasted items.

### History (Undo/Redo)

| Feature | Source | Entry Point |
|---|---|---|
| **Undo** | `hooks/useHistory.ts`, `stores/modelStore.tsx`, `stores/sceneStore.tsx` | `Ctrl+Z` or ToolMenu Undo button |
| **Redo** | Same | `Ctrl+Y` / `Ctrl+Shift+Z` or ToolMenu Redo button |

Both model and scene have **independent** history stacks (past/present/future, max 50 entries each). `useHistory.undo()` attempts both stores; `canUndo = modelCanUndo || sceneCanUndo`.

### Views

| Feature | Source | Entry Point |
|---|---|---|
| **Multi-view** | `stores/reducers/view.ts`, `hooks/useScene.ts` → `createView`, `deleteView` | ViewTabs UI |
| **Rename** | `reducers/view.ts` → `updateView` | ViewTabs inline rename |
| **Switch** | `hooks/useView.ts` → `changeView` | ViewTabs click |
| **Tabs UI** | `components/ViewTabs/ViewTabs.tsx` | Only shown in `EDITABLE` mode |

`createView` does **not** save to history (notable gap). `deleteView` saves to history and auto-switches to `views[0]` if current view is deleted. Cannot delete the last view.

### Model Data

- **Items (nodes)**: `ModelItem` (model layer: id, name, icon) + `ViewItem` (view layer: id, tile, labelHeight). Always a pair.
- **Connectors**: `Connector` (anchors array, color, style, lineType, labels, showArrow). Scene layer stores computed `path` (tiles + bounding rect).
- **Rectangles**: `Rectangle` (from, to tile coords, color, customColor). Pure model — no scene data.
- **TextBoxes**: `TextBox` (tile, content, fontSize, orientation). Scene stores computed `size`.
- **Labels**: Connector labels are `ConnectorLabel[]` (id, text, position 0-100, height, line, showLine).

### Settings

| Setting | Config File | Default |
|---|---|---|
| Hotkey profile | `config/hotkeys.ts` | `'smnrct'` (s=select, m=pan, n=addItem, r=rect, c=connector, t=text, l=lasso, f=freehand) |
| Pan: middleClick | `config/panSettings.ts` | `true` |
| Pan: rightClick | `config/panSettings.ts` | `true` |
| Pan: ctrlClick, altClick, emptyAreaClick | `config/panSettings.ts` | `false` |
| Pan: arrowKeys | `config/panSettings.ts` | `true` |
| Pan: wasd, ijkl | `config/panSettings.ts` | `false` |
| Keyboard pan speed | `config/panSettings.ts` | `20` (px per key) |
| Zoom to cursor | `config/zoomSettings.ts` | `true` |
| Label expand button padding | `config/labelSettings.ts` | `0` |
| Connector interaction mode | `types/ui.ts` → `UiState.connectorInteractionMode` | `'click'` |
| Fixed shortcuts | `config/shortcuts.ts` | copy=Ctrl+C, paste=Ctrl+V, undo=Ctrl+Z, redo=Ctrl+Y/Ctrl+Shift+Z, help=F1 |

### UI Overlays

| Overlay | Component | Shown When |
|---|---|---|
| Dialogs (Export/Help/Settings) | `ExportImageDialog`, `HelpDialog`, `SettingsDialog` | `uiState.dialog === 'EXPORT_IMAGE'/'HELP'/'SETTINGS'` |
| Notification snackbar | `NotificationSnackbar` | `uiState.notification !== null` |
| Context menu | `ContextMenuManager` + `ContextMenu` | `uiState.contextMenu !== null` (currently only `EMPTY` type opens menu) |
| Item controls panel | `ItemControlsManager` | `uiState.itemControls !== null` (EDITABLE only) |
| ToolMenu | `ToolMenu` | EDITABLE mode only |
| MainMenu | `MainMenu` | EDITABLE mode only |
| ZoomControls | `ZoomControls` | EDITABLE + EXPLORABLE_READONLY |
| ViewTabs | `ViewTabs` | EDITABLE only |
| ViewTitle | Typography in `UiOverlay` | EXPLORABLE_READONLY only |
| Hint tooltips (5 types) | `ConnectorHintTooltip`, `ConnectorEmptySpaceTooltip`, `ConnectorRerouteTooltip`, `ImportHintTooltip`, `LassoHintTooltip` | EDITABLE only |
| Lazy loading welcome | `LazyLoadingWelcomeNotification` | When `iconPackManager` is provided |
| Debug utils | `DebugUtils` | `enableDebugTools === true` |

### Export

`ExportImageDialog` → `utils/exportOptions.ts`. Uses `dom-to-image-more` library (declared in `types/dom-to-image-more.d.ts`). SVG export optimizer in 3 phases: strip irrelevant CSS, round float coordinates, prune `display:none` subtrees. Exports at ~750KB after optimization (was ~940KB).

### Icon Packs

`IsoflowProps.iconPackManager` (type `IconPackManagerProps`) is passed from outside. Stored in `uiState.iconPackManager`. `IconSelectionControls` and `IconGrid` consume it. Lazy loading welcome notification shown when present.

### Editor Modes

| Mode | Interactions |
|---|---|
| `EDITABLE` | All modes active; ToolMenu, MainMenu, ItemControls, ViewTabs shown |
| `EXPLORABLE_READONLY` | Pan+Zoom only; no editing tools; ViewTitle shown |
| `NON_INTERACTIVE` | No interactions; no UI tools (`INTERACTIONS_DISABLED` mode) |

Starting mode determined by `getStartingMode()` in `utils`.

---

## 2. Architecture Map

### 2a. Store Layer

#### UiState (`stores/uiStateStore.tsx`)

**Pattern**: `createStore` inside a `useRef` inside `UiStateProvider`. The store instance is created once per provider tree mount, never recreated. `useUiStateStore(selector)` reads from `useContext(UiStateContext)`. `useUiStateStoreApi()` returns the raw store for imperative `getState()`/`setState()` access without subscribing.

**Why context-based (not global singleton):** Multiple independent Isoflow instances on the same page get separate state trees. Global singletons would bleed state between instances. Also enables SSR safety and easy testing (mount with fresh providers).

**UiState fields:**

| Field | Type | Category |
|---|---|---|
| `view` | `string` (current view id) | Transient (UI) |
| `mainMenuOptions` | `MainMenuOptions` | Transient |
| `editorMode` | `'EDITABLE'/'EXPLORABLE_READONLY'/'NON_INTERACTIVE'` | Transient (set from props) |
| `iconCategoriesState` | `IconCollectionState[]` | Transient |
| `mode` | `Mode` (union of 11 mode types) | Transient |
| `dialog` | `'EXPORT_IMAGE'/'HELP'/'SETTINGS' \| null` | Transient |
| `isMainMenuOpen` | `boolean` | Transient |
| `itemControls` | `ItemControls \| null` | Transient |
| `contextMenu` | `ContextMenu \| null` | Transient |
| `zoom` | `number` | Transient (reset on `resetUiState`) |
| `scroll` | `Scroll` (position + offset) | Transient |
| `mouse` | `Mouse` (position screen+tile, mousedown screen+tile, delta screen+tile) | Transient |
| `rendererEl` | `HTMLDivElement \| null` | Transient (DOM ref) |
| `rendererSize` | `Size` | Transient (measured) |
| `enableDebugTools` | `boolean` | Transient (from props) |
| `hotkeyProfile` | `HotkeyProfile` | Settings |
| `panSettings` | `PanSettings` | Settings |
| `zoomSettings` | `ZoomSettings` | Settings |
| `labelSettings` | `LabelSettings` | Settings |
| `connectorInteractionMode` | `'click'/'drag'` | Settings |
| `expandLabels` | `boolean` | Settings (from `renderer.expandLabels` prop) |
| `iconPackManager` | `IconPackManagerProps \| null` | Transient (from props) |
| `notification` | `Notification \| null` | Transient |

**UiState actions — non-trivial ones:**
- `setEditorMode`: also calls `getStartingMode(mode)` to reset mode
- `setIsMainMenuOpen`: also clears `itemControls`
- `incrementZoom`/`decrementZoom`: reads current zoom then applies util function
- `setScroll`: merges `offset` from current state if not provided
- `resetUiState`: resets mode to starting mode, zeros scroll, clears itemControls, resets zoom to 1

#### ModelStore (`stores/modelStore.tsx`)

Same context pattern. Stores `Model` fields inline plus a `history: HistoryState` object.

**Model fields (persistent — serialized/loaded):** `version`, `title`, `description`, `colors`, `icons`, `items`, `views`

**HistoryState:** `{ past: Model[], present: Model, future: Model[], maxHistorySize: 50 }`

**Actions:**
- `set(updates, skipHistory?)`: if `skipHistory` is false, calls `saveToHistory()` first. This is the **primary mutation path**.
- `saveToHistory()`: pushes current snapshot to `past`, clears `future`, trims to 50.
- `undo()`: pops last from `past`, pushes current live state to `future`, restores previous.
- `redo()`: pops first from `future`, pushes current live state to `past`, restores next.
- **Critical subtlety**: Both `undo`/`redo` capture the **live state** (`extractModelData(state)`) inside the Zustand `set()` callback, not the stale `history.present`. This ensures the undo target is the actual current state.

#### SceneStore (`stores/sceneStore.tsx`)

Same structure as ModelStore but stores `Scene` = `{ connectors: {[id]: SceneConnector}, textBoxes: {[id]: SceneTextBox} }`. Scene data is **derived/computed** (connector paths from pathfinder, textbox sizes from content). Scene has its own independent history stack (also 50 entries).

---

### 2b. Mode State Machine

**11 mode types:**

| Mode Type | Represents | Entry Cursor |
|---|---|---|
| `INTERACTIONS_DISABLED` | NON_INTERACTIVE editor mode | — |
| `CURSOR` | Default select mode | arrow |
| `DRAG_ITEMS` | Dragging selected items | default (userSelect: none) |
| `PAN` | Canvas panning | grab / grabbing |
| `PLACE_ICON` | Placing a new icon node | default |
| `CONNECTOR` | Drawing a connector | crosshair |
| `RECTANGLE.DRAW` | Drawing a new rectangle | crosshair |
| `RECTANGLE.TRANSFORM` | Resizing a rectangle | default |
| `TEXTBOX` | Placing/positioning a textbox | crosshair |
| `LASSO` | Rectangular lasso selection | default |
| `FREEHAND_LASSO` | Freehand polygon selection | default |

**State Transitions:**

```
CURSOR ──(mousedown on item, mousemove)──────────────→ DRAG_ITEMS
CURSOR ──(mousedown on empty, mousemove)─────────────→ LASSO
DRAG_ITEMS ──(mouseup)───────────────────────────────→ CURSOR
LASSO ──(mousedown inside selection, mousemove)──────→ DRAG_ITEMS
LASSO ──(mouseup, no selection)──────────────────────→ CURSOR
LASSO ──(mousedown outside selection)────────────────→ CURSOR
FREEHAND_LASSO ──(isDragging + mousemove)────────────→ DRAG_ITEMS
RECTANGLE.DRAW ──(mouseup, id set)───────────────────→ CURSOR
RECTANGLE.TRANSFORM ──(mouseup)──────────────────────→ CURSOR
TEXTBOX ──(mouseup)──────────────────────────────────→ CURSOR
PLACE_ICON ──(mousedown, no id)──────────────────────→ CURSOR
Any ──(hotkey)───────────────────────────────────────→ target mode
PAN ──(left-click)───────────────────────────────────→ CURSOR (via usePanHandlers)
Any ──(middle/right/ctrl/alt/emptyArea mousedown)────→ PAN (via usePanHandlers)
```

**The `isRendererInteraction` guard:**

```typescript
isRendererInteraction: rendererRef.current === e.target
```

`rendererRef.current` is the **transparent interaction div** — a `<Box ref={interactionsRef}>` that is full-width, full-height, absolutely positioned, with no content. It equals `e.target` **only** when the user clicks on the empty canvas background (no scene element captures the event first). When clicking on a Node, Connector, or Rectangle, `e.target` is that element's DOM node. This guard prevents mode handlers from responding to scene-element clicks or UI overlay clicks.

**Modes that use the `isRendererInteraction` guard on mousedown:**
Cursor, Pan, Connector, PlaceIcon, DrawRectangle, Lasso *(recently fixed)*, FreehandLasso *(recently fixed)*

**The `mouse.mousedown` guard (Lasso and FreehandLasso mouseup):**

```typescript
if (!uiState.mouse.mousedown) return; // toolbar click — mousedown was stopped, skip
```

`mouse.mousedown` is only populated when a mousedown fires through `processMouseUpdate`. If the ToolMenu's `onMouseDown={e => e.stopPropagation()}` stops propagation, the window listener never fires, `mouse.mousedown` stays null, and `mouseup` becomes a no-op.

**The `mousedownHandled` flag on CursorMode:**

```typescript
export interface CursorMode {
  type: 'CURSOR';
  mousedownItem: ItemReference | null;
  mousedownHandled?: boolean;
}
```

Set to `true` by `Cursor.mousedown` when a genuine mousedown goes through `processMouseUpdate`. Context menu only opens when `!hasMoved && uiState.mode.mousedownHandled`. Without this flag, calling `setMode({type:'CURSOR'})` from outside (e.g. after closing a dialog) followed by any mouseup would spuriously open the context menu. Timestamp-based alternatives fail because the mode change and subsequent mouseup can happen within the same millisecond.

**The `entry`/`exit` lifecycle:**

Fires inside `processMouseUpdate` when `reducerTypeRef.current !== uiState.mode.type`. This comparison uses a **ref** (not reactive state) to track the previous mode type. Entry fires before the current event's handler; exit fires for the previous mode.

**The `reducerTypeRef` pattern:**

```typescript
const reducerTypeRef = useRef<string | undefined>(undefined);
// Inside processMouseUpdate:
if (reducerTypeRef.current !== uiState.mode.type) {
  // fire exit for old mode, entry for new mode
}
reducerTypeRef.current = uiState.mode.type;
```

Subtle timing: `uiState` inside `processMouseUpdate` is captured at the start of the call via `uiStateApi.getState()` — the state **before** the current event's mutations. Entry/exit detection is correct but the `baseState` passed to handlers has pre-event values.

**The event processing chain:**

```
window ('mousemove'/'mousedown'/'mouseup')
  → onMouseEvent()
    → handlePanMouseDown(e) [if mousedown] → returns true (skip processMouseUpdate) OR false
    → handlePanMouseUp(e) [if mouseup] → returns true (skip) OR false
    → getMouse() → nextMouse
    → if mousemove: scheduleUpdate(nextMouse, e, processMouseUpdate) [RAF throttled]
    → if mousedown/mouseup: flushUpdate() then processMouseUpdate(nextMouse, e)
        → uiStateApi.getState() → uiState (fresh snapshot)
        → check reducerTypeRef for mode change → fire exit/entry
        → getModeFunction(mode, e) → handler
        → handler(baseState)
```

**Pan handler bypass path:**

`usePanHandlers.handleMouseDown` intercepts mousedown for: (a) left-click while in PAN mode (exits pan), (b) middle-click + `middleClickPan`, (c) right-click + `rightClickPan`, (d) ctrl+left + `ctrlClickPan`, (e) alt+left + `altClickPan`, (f) empty-area left + `emptyAreaClickPan`. When it returns `true`, `onMouseEvent` still updates `mouse` state but does **not** call `processMouseUpdate`, so none of the mode handlers see this mousedown.

---

### 2c. Scene API (`hooks/useScene.ts`)

All methods that mutate call `saveToHistoryBeforeChange()` first, unless inside a `transaction()`. All mutations go through pure reducers, then call `setState()` which bypasses store-level history (`skipHistory=true`).

| Method | Undo Checkpoint | Notes |
|---|---|---|
| `createModelItem(item)` | Yes (unless in transaction) | |
| `updateModelItem(id, updates)` | Yes | |
| `deleteModelItem(id)` | Yes | |
| `createViewItem(viewItem, currentState?)` | Yes (unless in transaction) | |
| `updateViewItem(id, updates, currentState?)` | Yes (unless in transaction) | If `tile` changed, cascades connector sync; then `validateView` — **throws on validation failure** |
| `deleteViewItem(id)` | Yes | Cascades: removes connected connectors from model + scene |
| `createConnector(connector)` | Yes | Calls `syncConnector` |
| `updateConnector(id, updates)` | Yes | Calls `syncConnector` if anchors changed |
| `deleteConnector(id)` | Yes | |
| `createTextBox(textBox)` | Yes | Calls `syncTextBox` |
| `updateTextBox(id, updates, currentState?)` | Yes (unless in transaction) | Calls `syncTextBox` if content/fontSize changed |
| `deleteTextBox(id)` | Yes | |
| `createRectangle(rect)` | Yes | |
| `updateRectangle(id, updates, currentState?)` | Yes (unless in transaction) | |
| `deleteRectangle(id)` | Yes | |
| `deleteSelectedItems(items)` | Yes (single checkpoint) | Wraps in `transaction()` |
| `pasteItems(payload)` | Yes (single checkpoint) | Wraps in `transaction()` |
| `transaction(fn)` | Yes (one checkpoint before fn) | Guards `transactionInProgress.current` |
| `placeIcon({modelItem, viewItem})` | Yes (single checkpoint) | Wraps in `transaction()` |
| `createView(partial?)` | **No** | Notable gap — creating a view is not undoable |
| `deleteView(viewId)` | Yes | Auto-switches if current view deleted |
| `updateView(viewId, {name})` | Yes | |
| `switchView(viewId)` | No | Navigation, not mutation |

**`currentState?` parameter pattern**: `updateViewItem`, `updateTextBox`, `updateRectangle` accept an optional `currentState` for chaining multiple updates within a transaction. `DragItems` mode uses this to batch update multiple items in a single model write.

---

### 2d. Reducer Layer

All reducers are **pure functions**: `(payload, context) → State`. No side effects, no store reads, no async. They use **Immer** `produce()` for immutable updates.

**`State` type:** `{ model: Model; scene: Scene }` — always both.
**`ViewReducerContext`:** `{ viewId: string; state: State }` — the view to operate on plus current full state.

| Reducer | Notes |
|---|---|
| `createModelItem(item, state)` | Immediately calls `updateModelItem` after insert — double-write, minor redundancy |
| `updateModelItem(id, updates, state)` | Throws if id not found |
| `deleteModelItem(id, state)` | Uses `delete draft.model.items[index]` — leaves **sparse array** (see gotchas) |
| `createViewItem(viewItem, ctx)` | Inserts at front (`unshift`); calls `updateViewItem` to validate |
| `updateViewItem({id,...}, ctx)` | If `tile` changed, calls `UPDATE_CONNECTOR` on all connected connectors; then `validateView` — **throws on validation failure** |
| `deleteViewItem(id, ctx)` | Cascades: finds connectors via `getConnectorsByViewItem`, removes from model views AND scene |
| `syncConnector(id, ctx)` | Calls `getConnectorPath()`; on error creates empty path `{ tiles:[], rectangle:{from:{0,0},to:{0,0}} }` — **never throws** |
| `syncTextBox(id, ctx)` | Calls `getTextBoxDimensions(textBox)` → scene.textBoxes[id].size |
| `updateView(updates, ctx)` | Uses `Object.assign(view.value, updates)` — fixed from a version that replaced the view reference (breaking memo stability) |
| `syncScene(ctx)` | Rebuilds entire scene from scratch; called during view load |
| `updateViewTimestamp(ctx)` | Sets `view.lastUpdated` — called after every action except SYNC_SCENE and DELETE_VIEW |

---

### 2e. Schema Layer

Located in `src/schemas/`. Uses **Zod** for validation.

| Schema | Key Constraints |
|---|---|
| `modelItemSchema` | `name` via `constrainedStrings.name` (max length); `icon` optional |
| `connectorSchema` | `anchors: z.array(anchorSchema)` (no min at schema level); `labels` max 256; `position: z.number().min(0).max(100)` |
| `anchorSchema` | All ref fields optional (partial): `{item?, anchor?, tile?}` |
| `modelSchema` | Runs `validateModel()` as `.superRefine()` — referential integrity checks |

**`validateModel` referential integrity checks:**
- model item's `icon` must reference an existing icon in `model.icons`
- connector colors must reference existing model colors
- connector anchor `ref.item` references must exist in view items
- connector anchor `ref.anchor` references must exist in all view anchors
- view items must reference existing model items
- connector must have `>= 2` anchors
- anchor can only have **exactly 1** key in `ref` (item OR anchor OR tile, not multiple)

**Key validation gap**: `updateViewItem` runs `validateView` and **throws** on failure. This propagates synchronously up through `useScene` into drag handlers. There is no catch block in `DragItems.mousemove`. A validation failure mid-drag would crash the interaction without user feedback.

---

### 2f. Clipboard Module

**Storage mechanism**: Module-level singleton `let _clipboard: ClipboardPayload | null`. Not persisted to localStorage or browser clipboard API — session-only, cannot paste across browser tabs.

**Data structure `ClipboardPayload`:**
```typescript
{
  items: Array<{ modelItem: ModelItem; viewItem: ViewItem }>;
  connectors: Connector[];
  rectangles: Rectangle[];
  textBoxes: TextBox[];
  centroid: Coords; // tile coords
}
```

**Centroid logic:**
```
allPoints = [...items[].tile, ...rectangles[].center, ...textBoxes[].tile]
centroid.x = round(sum(allPoints.x) / count)
centroid.y = round(sum(allPoints.y) / count)
Rectangle center = { x: round((r.from.x + r.to.x) / 2), y: round((r.from.y + r.to.y) / 2) }
```
**Gap**: If `allPoints` is empty (only connectors selected), centroid = `{0,0}` — connector-only paste would offset from tile 0,0.

**ID remapping on paste:**
- Build `idMap: Map<oldId, newId>` for all items, connectors, rectangles, textboxes.
- New items get new IDs for both `modelItem.id` and `viewItem.id` (same ID for both).
- Connector anchors with `ref.item` in the idMap → remapped to new item ID.
- Connector anchors with `ref.item` NOT in the idMap → `ref.item = undefined` (anchor detachment).
- Connector anchors with `ref.tile` → preserved unchanged.

**Collision avoidance**: `findNearestUnoccupiedTilesForGroup` is called on target positions. If it returns `null`, falls back to raw target tiles.

**Post-paste**: Switches to `LASSO` mode with `startTile: {0,0}, endTile: {0,0}` and all pasted item refs as `selection.items`. Bounds are meaningless — this exists only to enable immediate delete/copy of pasted items.

---

### 2g. History System

**Dual-store history**: Model store and Scene store each maintain independent `{ past: T[], present: T, future: T[], maxHistorySize: 50 }`. The `useHistory` hook coordinates them.

**A checkpoint** = one call to `saveToHistoryBeforeChange()` in `useScene`, which calls both `modelStoreApi.getState().actions.saveToHistory()` and `sceneStoreApi.getState().actions.saveToHistory()`. `transaction()` ensures only one checkpoint for N operations.

**Undo semantics**: `useHistory.undo()` calls `modelActions.undo()` if `canUndo()` and `sceneActions.undo()` if `canUndo()`. These may diverge if one store has more entries (no cross-store synchronization check).

**`canUndo`/`canRedo`**: `modelCanUndo || sceneCanUndo` — true if **either** store has entries. Undo button may be enabled even if only scene (connector paths) has history.

**Limitations:**
1. Model and scene histories can diverge if one fails mid-operation.
2. `createView` does **not** save to history — not undoable.
3. `switchView` does not save to history (intentional: navigation, not mutation).
4. Undo after paste may leave LASSO mode showing pasted items' selection (visual artifact).
5. Max 50 entries per store — very large diagrams lose early history.

---

### 2h. Component Tree

**Provider tree (from `Isoflow.tsx`):**
```
ThemeProvider
  LocaleProvider
    ModelProvider (Zustand context)
      SceneProvider (Zustand context)
        UiStateProvider (Zustand context)
          App (inner component via forwardRef)
            GlobalStyles
            Box (overflow:hidden, relative positioning)
              Renderer
              UiOverlay
```

**`Renderer.tsx` layering (bottom to top, by DOM order):**
```
containerRef Box (position:absolute, full size, z-index:0)
  SceneLayer → <Rectangles>
  SceneLayer → <Lasso>
  <FreehandLasso> (not in SceneLayer — renders SVG overlay)
  Box (grid) → <Grid>
  SceneLayer → <Cursor> (only if showCursor)
  SceneLayer → <Connectors>
  SceneLayer → <TextBoxes>
  SceneLayer → <ConnectorLabels>
  SceneLayer → <SizeIndicator> (debug only)
  [INTERACTION DIV] interactionsRef Box (position:absolute, full size, transparent — hit target for empty canvas)
  SceneLayer → <Nodes>
  SceneLayer → <TransformControlsManager>
```

**Key DOM ordering insight**: The interaction div sits **below** Nodes and TransformControls. Nodes are above it and capture their own events. Only clicks on the empty grid land on the interaction div, making `e.target === interactionsRef.current` true only for empty-canvas clicks.

**`UiOverlay`** is a sibling of `Renderer`. It absolutely positions all UI elements relative to `rendererSize` (from store), renders on top of everything.

**`SceneLayer`** applies the scroll+zoom CSS transform: `translate(scroll.x, scroll.y) scale(zoom)`. All scene elements inherit this.

**Pointer event architecture**: Window-level listeners in `useInteractionManager` capture all mouse events globally (not on the Renderer element). Events fire even when mouse is outside the canvas. `isRendererInteraction` check filters canvas-specific logic.

---

### 2i. Event Propagation Architecture

**Window listeners registered in `useInteractionManager`:**
- `mousemove` → `onMouseEvent`
- `mousedown` → `onMouseEvent`
- `mouseup` → `onMouseEvent`
- `contextmenu` → `onContextMenu` (just calls `e.preventDefault()`)
- `touchstart/touchmove/touchend` → synthesized mouse events → `onMouseEvent`
- `rendererEl.wheel` → zoom handler (passive listener on container, not window)
- `window.keydown` → hotkeys + mode switches

**`stopPropagation` points (must be maintained):**
1. **`ControlsContainer.tsx`**: `onMouseDown={e => e.stopPropagation()}` — prevents ItemControls panel clicks reaching window listener.
2. **ToolMenu Box wrapper** (in `UiOverlay.tsx`): `onMouseDown={(e) => e.stopPropagation()}` — prevents toolbar button clicks reaching window listener.

**Touch event handling:**
Touch events are synthesized: `touchstart` → mousedown (button:0), `touchmove` → mousemove, `touchend` → mouseup with `clientX:0, clientY:0`. The zeroed-out coordinates on `touchend` are problematic: the "mouse position" on release is wrong for touch interactions.

---

### 2j. Configuration Layer

| File | Contents |
|---|---|
| `config/hotkeys.ts` | `HotkeyProfile` = `'qwerty' \| 'smnrct' \| 'none'`; 8 keys: select/pan/addItem/rectangle/connector/text/lasso/freehandLasso; default = `'smnrct'` |
| `config/panSettings.ts` | `PanSettings` 9 fields; defaults: middleClick+rightClick+arrowKeys enabled; speed=20 |
| `config/zoomSettings.ts` | `ZoomSettings` = `{zoomToCursor: boolean}`; default: true |
| `config/labelSettings.ts` | `LabelSettings` = `{expandButtonPadding: number}`; default: 0 |
| `config/shortcuts.ts` | Fixed shortcuts (non-configurable): copy/paste/undo/redo/help |
| `config.ts` | Tile size constants, defaults for View/ViewItem/Connector/TextBox/Rectangle, zoom constants (MIN=0.1, MAX=1, INCREMENT=0.05), initial data |

---

## 3. Test Audit

### Summary Table

| Test File | Status | Reason |
|---|---|---|
| `toolMenu.propagation.test.tsx` — A tests | VALID | Tests actual DOM stopPropagation |
| `toolMenu.propagation.test.tsx` — B/C tests | VALID *(updated 2026-03-20)* | Now imports real `Lasso.ts` module — inline replicas replaced |
| `interactionManager.depStability.test.tsx` | VALID | Source text analysis; would catch dep array regression |
| `useScene.listShape.test.tsx` | VALID | Tests real contract with mocked stores |
| `useScene.referenceStability.test.tsx` | VALID | Memo stability is a real performance contract |
| `viewOps.integration.test.tsx` | VALID | Tests real createView/updateView/deleteView reducers |
| `uiOverlay.editorModes.test.ts` | SEMI-VALID | Tests local constant manually verified against production; importing UiOverlay in Jest not feasible (MUI createTheme at module load time pulls in full theme chain). To make VALID: extract EDITOR_MODE_MAPPING to a standalone config file with no MUI deps. |
| `grid.backgroundFormula.test.ts` | VALID (fragile) | Tests formula replica; would need update if Grid.tsx changes |
| `useRAFThrottle.cleanup.test.ts` | VALID | Tests real module; thorough RAF mock |
| `useResizeObserver.lifecycle.test.ts` | VALID | Thorough lifecycle tests |
| `keyboard.dispatch.test.tsx` | SHALLOW | Tests hand-written replica; placeholder addEventListener test |
| `clipboard/__tests__/clipboard.test.ts` | SHALLOW | Tests only trivial getters/setters; does not test handleCopy/handlePaste |
| `hooks/__tests__/useHistory.test.tsx` | VALID | Tests real hook with mocked store actions |
| `stores/reducers/__tests__/connector.test.ts` | VALID *(rewritten 2026-03-20)* | Fully rewritten with correct `ConnectorAnchor[]` array format and correct `Scene` shape |
| `stores/reducers/__tests__/modelItem.test.ts` | VALID | Uses real fixture and reducer |
| `stores/reducers/__tests__/viewItem.test.ts` — deleteViewItem | VALID | Cascade logic well tested |
| `stores/reducers/__tests__/viewItem.test.ts` — updateViewItem | SHALLOW | Mock returns state unchanged; connector update path never tested |
| `stores/reducers/__tests__/viewItem.test.ts` — createViewItem, batch-delete | VALID | |
| `schemas/__tests__/` | VALID | Self-contained Zod tests |
| `utils/__tests__/` | VALID | Pure function tests |
| `DebugUtils` snapshot tests | SHALLOW | Snapshot tests break on any cosmetic change |
| `connector.renderIsolation.test.tsx` | VALID (likely) | Render isolation is a real performance contract |

**Total test count as of 2026-03-20**: 449 tests across 48 suites.

**New/updated suites (2026-03-20):**
| File | Tests | Classification |
|---|---|---|
| `Lasso.modes.test.ts` | 14 | VALID — real Lasso module |
| `Cursor.modes.test.ts` | 12 | VALID — real Cursor module |
| `shortcuts.test.ts` | 7 | VALID — real constants |
| `settings.defaults.test.ts` | 11 | VALID — real config |
| `toolMenu.propagation.test.tsx` B/C | replaced | VALID — real Lasso.ts (was inline replica) |
| `stores/reducers/__tests__/connector.test.ts` | rewritten | VALID — real array format (was STALE) |

---

## 4. Gap Analysis

### Critical Gaps

**Mode state machine transitions — untested with real modules:**
- No test for `CURSOR → DRAG_ITEMS` (mousemove while mousedown on item)
- No test for `CURSOR → LASSO` (mousemove while mousedown on empty canvas)
- No test for `LASSO → DRAG_ITEMS` (mousemove while isDragging within selection)
- No test for `DRAG_ITEMS → CURSOR` (mouseup)
- No test for `FREEHAND_LASSO → DRAG_ITEMS`
- No test for `RECTANGLE.TRANSFORM → CURSOR` on mouseup
- No test for Pan mode transitions (entry/exit for all 5 pan methods)
- No test for `isRendererInteraction=false` in the **actual mode files** (toolMenu.propagation tests use inline replicas)
- No test for the `reducerTypeRef` entry/exit lifecycle — that `entry()` fires exactly once on mode change
- No test for `mousedownHandled` flag — specifically that it prevents spurious context-menu after external `setMode`

**Scene API mutations — untested:**
- `placeIcon` — no test for two-step model+view creation as single transaction
- `deleteSelectedItems` — no test for full cascade across mixed item types
- `pasteItems` — **no test at all** (most complex operation in codebase)
- `switchView` — no test for UiState.view update
- Transaction nesting in `useScene` (separate `transactionInProgress.current`)

**Store action invariants — untested:**
- `modelStore.undo()` and `redo()` with real Model data (not mocked)
- `sceneStore.undo()` and `redo()`
- History overflow at 50 entries — oldest entry is dropped
- `saveToHistoryBeforeChange` inside transaction: should NOT save if `transactionInProgress.current`
- `setEditorMode` side effect: must reset mode via `getStartingMode()`
- `resetUiState`: must zero scroll, zoom, mode, itemControls

**Clipboard correctness — untested:**
- `handleCopy` with LASSO selection
- `handleCopy` with single `itemControls` selection
- `handleCopy` centroid calculation
- `handlePaste` ID remapping
- `handlePaste` anchor detachment for out-of-selection items
- `handlePaste` with connector-only selection (centroid = 0,0 bug)
- `handlePaste` collision avoidance

**History checkpoints — untested:**
- That `createView` does NOT create a checkpoint
- That `transaction()` saves exactly one checkpoint for N operations
- That undo after paste restores the pre-paste state completely
- Model and scene history staying in sync across operations

### Medium Gaps

- No test that `DEFAULT_HOTKEY_PROFILE` is `'smnrct'`
- No test that zoom min/max boundaries `MIN_ZOOM = 0.1`, `MAX_ZOOM = 1` are respected
- No test that `incrementZoom`/`decrementZoom` respect boundaries
- No test for `anchorSchema` allowing exactly one ref key (the multi-key guard)
- No test for connector with exactly 1 anchor (under the 2-anchor minimum)

### Low Priority

- No rendering tests for `Renderer` component layer order
- No rendering tests for UiOverlay show/hide in each editor mode (current tests check a local constant)
- No test for touch event synthesis
- No accessibility tests

---

## 5. Lessons Learned

### 1. The Quill/ReactQuill Mount-Time onChange Bug

**What happens:** When ReactQuill mounts, it fires its `onChange` callback once during initialization with the initial content, before any user input. In FossFLOW, this fires `saveToHistoryBeforeChange()` on mount — creating a spurious history checkpoint. On undo, the user steps back through this phantom state.

**How fixed:** `RichTextEditor` tracks `isFirstRender` via a ref, ignores the first `onChange` call, and only starts forwarding changes after mount.

**Why non-obvious:** The bug only manifests when the ItemControls panel opens for an existing TextBox. The initial onChange fires synchronously during `useEffect` or inside the ReactQuill constructor.

---

### 2. The ToolMenu Click Propagation Bug (most recent, 2026-03-20)

**Full chain of events:**
1. User is in LASSO mode. Clicks "Select" button in ToolMenu.
2. Button `onClick` fires → `setMode({type:'CURSOR'})`.
3. Window-level `mousedown` fires (stopPropagation was missing on ToolMenu).
4. `processMouseUpdate` runs; mode is now CURSOR (Zustand updates synchronously).
5. `Cursor.mousedown` fires, sets `mousedownHandled = true`, `mousedownItem = null`.
6. Window-level `mouseup` fires → `Cursor.mouseup` → `!hasMoved && mousedownHandled` is true → **context menu opens** spuriously.

**Why hard to find:** ControlsContainer already had stopPropagation (pattern was established) but ToolMenu did not — inconsistency across two similar UI patterns. The bug only manifested under specific mode combinations.

**Three-layer fix:**
- A: Add `onMouseDown={e => e.stopPropagation()}` to ToolMenu Box wrapper in UiOverlay
- B: Add `if (!isRendererInteraction) return` to `Lasso.mousedown` (was missing)
- C: Add `if (!uiState.mouse.mousedown) return` to `Lasso.mouseup` and `FreehandLasso.mouseup` (was missing)

---

### 3. The `mousedownHandled` Flag — Context Menu Spurious Opening

**Problem:** When `setMode({type:'CURSOR'})` is called externally (after placing an icon, after Connector finalized, after Escape), cursor mode is entered without a preceding mousedown. Without `mousedownHandled`, the first subsequent mouseup would satisfy `!hasMoved && !mousedownItem` and open the context menu.

**Why timestamp-based approaches fail:** The mode change and the next mouseup can happen within the same millisecond (e.g., releasing the mouse button that clicked the Connector tool). A fixed threshold either misses rapid clicks or causes false negatives on slow machines.

**How it works:** `mousedownHandled` starts `undefined`/`false`. `Cursor.mousedown` sets it `true`. `Cursor.mouseup` checks `!hasMoved && uiState.mode.mousedownHandled`. After mouseup, it resets `mousedownHandled` to `false` via `produce`. Context menu only opens if: (a) a mousedown was processed through the mode system AND (b) no movement AND (c) mousedown was on empty canvas.

---

### 4. The `setMode` + ContextMenu Interaction (regression chain)

During the fix for the spurious context menu, several attempts created regressions:

**Attempt 1:** Clear `contextMenu` inside `setMode` action in the store. Caused regression: `Cursor.mouseup` calls `setMode(produce(mode, draft => { ... }))` at the end (CURSOR→CURSOR type-preserving update), which cleared the contextMenu that was just set.

**Attempt 2:** Only clear contextMenu when mode TYPE changes in `setMode`. Caused regression: left-click exits pan mode → `endPan()` sets CURSOR mode (type change, clears contextMenu), but then `Cursor.mouseup` fires and would show context menu again because `mousedownHandled` was not yet checking properly.

**Correct solution:** Revert `setMode` to simple `set({ mode })`. Use `mousedownHandled` flag as the semantic gate. This is the right abstraction because it captures intent, not timing.

---

### 5. The `isRendererInteraction` Check — What It Really Checks

`rendererRef.current` is the **transparent interaction div** — the `<Box ref={interactionsRef}>` at the end of `Renderer.tsx` with no content, no explicit pointer-events, full-width/height. It sits **below** the Nodes SceneLayer in DOM order.

When a user clicks on a Node, the DOM event target is the Node's HTML element (above the interaction div). The event never "falls through" to the interaction div. Clicking on a Connector or Rectangle also does NOT set `isRendererInteraction = true` — those have their own click handlers. Only clicking on the empty grid background lands on the interaction div.

---

### 6. Zustand Context Pattern — Testing Implications

FossFLOW ships as a library with multiple independent instances possible. The context pattern (`createStore` inside `useRef` inside Provider) gives each mounted `<Isoflow>` tree its own private store instance.

**Testing implications:**
- Tests cannot simply `import { useUiStateStore }` and use it — the hook throws if there is no Provider.
- Tests must wrap components in all three Providers (`ModelProvider`, `SceneProvider`, `UiStateProvider`), or mock the store hooks.
- The regression tests in `__perf_refactor_regression__` use heavy mocking (`jest.mock('src/stores/modelStore')`).

---

### 7. The `reducerTypeRef` Pattern — Subtle Timing

`reducerTypeRef.current` tracks the mode type from the **last processed event** as a plain `useRef`. `processMouseUpdate` reads `uiState = uiStateApi.getState()` at its start — the state as of the moment the function executes. If a previous event handler called `setMode()` (synchronous Zustand update), a subsequent call to `processMouseUpdate` sees the new mode type from `getState()`, while `reducerTypeRef.current` still has the old value. This correctly detects the transition. The `baseState` passed to `entry()` contains the post-transition `uiState`, which is what the entry handler expects.

---

### 8. The Pan Handler Bypass Path

`usePanHandlers.handleMouseDown` returns `true` for pan-triggering gestures, bypassing `processMouseUpdate` entirely. This means:
1. No mode entry/exit detection for these events.
2. No `isRendererInteraction` check for these events.
3. Pan mode's own `mousedown` handler is **never called** for the initial pan-triggering mousedown.

The first frame of a pan gesture has `mouse.mousedown` correctly set (from the `setMouse` call in the bypass path) but Pan mode's `entry()` fires on the **next** event (first mousemove). Acceptable because `Pan.entry` only sets cursor to 'grab', which `usePanHandlers.startPan` already set.

---

### 9. Dev Server + Lib Build Dependency

**The problem:** The consumer app imports from the lib's **built** output (`dist/`), not TypeScript sources directly. Editing `packages/fossflow-lib/src/` is NOT immediately visible in the dev server. `npm run build:lib` must be run before changes are reflected. Hot-reload does NOT work for library changes.

---

### 10. Critical Gotchas in the Codebase

**`deleteModelItem` uses `delete` not `splice`:**
```typescript
delete draft.model.items[modelItem.index];
```
Creates a **sparse array** (`[item0, undefined, item2]`). `model.items.length` includes holes. `forEach`/`map` skip holes but `find()` works. Subtle bugs possible if code assumes `length === item count`. All other reducers use `splice`.

**`createModelItem` calls `updateModelItem` redundantly:**
The item is pushed then immediately overwritten via `updateModelItem`. A double-write with no effect but wastes an Immer draft creation.

**Connector path with empty tiles:**
`syncConnector` wraps `getConnectorPath` in a try/catch and creates an empty path on error. Connectors with empty paths are not deleted — they remain as "ghost" connectors that are invisible/zero-size and hard to discover or delete.

**`updateViewItem` throws on validation failure:**
A validation failure mid-drag crashes the interaction. No catch block in `DragItems.mousemove`. No user feedback.

**`rendererSize` dual source (historical):**
Before the H-2 perf fix, `rendererSize` was observed by multiple `useResizeObserver` calls. After the fix, only `useInteractionManager` observes it and writes to `uiState.rendererSize`. Other consumers read from the store.

**FreehandLasso reads `rendererEl.getBoundingClientRect()` on mouseup:**
Unlike all other coordinate calculations which use `rendererSize` from the store, `FreehandLasso.mouseup` directly calls `uiState.rendererEl?.getBoundingClientRect()`. Inconsistent but acceptable.

**The `INTERACTIONS_DISABLED` mode:**
No `ModeActions` handler for it in the `modes` map in `useInteractionManager`. The keydown effect early-returns if `modeType === 'INTERACTIONS_DISABLED'`. Window event listeners are not registered. This mode is purely an opt-out flag.

**ViewTabs and EXPLORABLE_READONLY:**
`VIEW_TABS` only shown in `EDITABLE` mode. Users cannot switch views in `EXPLORABLE_READONLY` mode.

**`setIsMainMenuOpen` clears `itemControls`:**
Opening the main menu automatically closes any open item controls panel. May be surprising if the user has unsaved property edits.

---

## 6. Key APIs for Regression Coverage

These functions/methods MUST have regression tests before any refactoring. Listed with contracts and critical edge cases.

### 1. `processMouseUpdate`
**File:** `src/interaction/useInteractionManager.ts`

**Contracts:**
- When `reducerTypeRef.current !== uiState.mode.type`, `exit` fires for old mode and `entry` fires for new mode before current event handler.
- `entry` and `exit` each fire exactly once per mode transition.
- `isRendererInteraction = (rendererRef.current === e.target)` is correctly passed to handlers.
- `mouse` state is updated via `setMouse(nextMouse)` before handler is called.
- `reducerTypeRef.current` is updated to `uiState.mode.type` after handler.

**Critical edge cases:** Mode transitions mid-event; `rendererRef.current === null` early return.

---

### 2. `usePanHandlers.handleMouseDown`
**File:** `src/interaction/usePanHandlers.ts`

**Contracts:**
- Returns `true` and calls `endPan()` when `button === 0 && modeType === 'PAN'`.
- Returns `true` and calls `startPan('middle')` when `button === 1 && panSettings.middleClickPan`.
- Returns `true` and calls `startPan('right')` when `button === 2 && panSettings.rightClickPan`.
- Returns `true` and calls `startPan('ctrl')` when `button === 0 && ctrlKey && panSettings.ctrlClickPan`.
- Returns `true` and calls `startPan('alt')` when `button === 0 && altKey && panSettings.altClickPan`.
- Returns `true` and calls `startPan('empty')` when `button === 0 && isEmptyArea && panSettings.emptyAreaClickPan`.
- Returns `false` for regular left-click when none of the pan settings are triggered.

**Critical edge cases:** `panSettings.middleClickPan = false` → middle click returns false; ctrl+alt pressed simultaneously; `isEmptyArea` when `rendererEl` is null.

---

### 3. `useScene.deleteSelectedItems`
**File:** `src/hooks/useScene.ts`

**Contracts:**
- Deletes nodes (ITEM type): cascades to connected connectors.
- Deletes explicitly selected connectors only if they still exist after node cascade.
- Mixed selection: node + its connector + unrelated connector → node and connected connector deleted, unrelated connector survives.
- Single checkpoint for the entire batch.
- Empty selection: no-op, no history entry.
- Deleting all items sharing a connector: connector not double-deleted.

---

### 4. `useScene.pasteItems`
**File:** `src/hooks/useScene.ts`

**Contracts:**
- Creates all modelItems + viewItems, connectors, rectangles, textboxes in a single transaction.
- Single history checkpoint.
- All items appear in `currentView` after paste.
- Passes through `createModelItem` + `createViewItem` (not direct store writes).

---

### 5. `useCopyPaste.handleCopy`
**File:** `src/clipboard/useCopyPaste.ts`

**Contracts:**
- LASSO selection: copies all items in `mode.selection.items` (ITEM, CONNECTOR, RECTANGLE, TEXTBOX).
- Single ITEM via itemControls: copies that item only.
- Centroid is the mean of all item tiles + rectangle centers + textbox tiles.
- Connector-only selection: centroid falls back to `{0,0}`.
- Empty selection: no clipboard update, no notification.
- `setClipboard` is called with correct payload structure.

---

### 6. `useCopyPaste.handlePaste`
**File:** `src/clipboard/useCopyPaste.ts`

**Contracts:**
- Positions pasted items at `mouseTile + (item.tile - centroid)`.
- All pasted items get new unique IDs (none match clipboard IDs).
- Connector anchor `ref.item` pointing to a copied item → remapped to new ID.
- Connector anchor `ref.item` pointing to an item NOT in clipboard → `ref.item = undefined`.
- Connector anchor with `ref.tile` → preserved unchanged.
- After paste: mode is LASSO with `selection.items` containing all pasted item refs.
- No clipboard: shows warning notification, no paste.

---

### 7. `reducers/viewItem.deleteViewItem`
**File:** `src/stores/reducers/viewItem.ts`

**Contracts:**
- Item removed from `views[viewId].items`.
- All connectors with an anchor `ref.item === id` removed from model.
- Those connectors removed from `scene.connectors`.
- Connectors not referencing `id` are preserved.
- Throws when `id` not found or `viewId` not found.
- Does not mutate input state (Immer immutability).

**Critical edge cases:**
- Item referenced by a connector at both anchor[0] and anchor[1] → connector deleted once, not twice.
- Deleting item A, then item B where they shared a connector: second delete succeeds even though connector was already removed.

---

### 8. `reducers/connector.syncConnector`
**File:** `src/stores/reducers/connector.ts`

**Contracts:**
- Calls `getConnectorPath` with connector's anchors and view.
- Stores result in `scene.connectors[id].path`.
- On `getConnectorPath` throwing: stores empty path `{ tiles:[], rectangle:{from:{0,0},to:{0,0}} }`, does NOT throw.
- Does not remove the connector from model on error.
- Does not mutate input state.

---

### 9. `useHistory` undo/redo coordination
**File:** `src/hooks/useHistory.ts`

**Contracts (with real stores, not mocks):**
- After `saveToHistory()` + model mutation: `undo()` restores the pre-mutation model state.
- After `undo()`: `redo()` returns to the post-mutation state.
- After new mutation following `undo()`: `redo()` is no longer possible (future is cleared).
- `canUndo` / `canRedo` correctly reflect stack state after each operation.
- History overflow at 50 entries: 51st `saveToHistory` drops the oldest entry.
- `transaction()` creates exactly one history entry regardless of how many operations inside.

---

### 10. `Lasso.mousedown` and `Lasso.mouseup`
**File:** `src/interaction/modes/Lasso.ts`

**Contracts (testing the ACTUAL module, not inline replicas):**
- `mousedown` with `isRendererInteraction=false`: no mode change, no action.
- `mousedown` with `isRendererInteraction=true`, no selection: switches to CURSOR.
- `mousedown` within existing selection bounds: sets `isDragging=true`, stays in LASSO.
- `mousedown` outside existing selection: switches to CURSOR.
- `mouseup` with `mouse.mousedown=null` (toolbar click): no action.
- `mouseup` with `mouse.mousedown` set, no selection: switches to CURSOR.
- `mouseup` with `mouse.mousedown` set, selection with items: stays in LASSO, resets `isDragging=false`.

---

### 11. `Cursor.mousedown` and `Cursor.mouseup`
**File:** `src/interaction/modes/Cursor.ts`

**Contracts:**
- `mousedown` with `isRendererInteraction=false`: no action.
- `mousedown` with `isRendererInteraction=true`, item at tile: sets `mousedownItem` and `mousedownHandled=true`.
- `mousedown` with `isRendererInteraction=true`, no item: sets `mousedownItem=null`, `mousedownHandled=true`, clears `itemControls`.
- `mouseup` after mousedown on item, no movement: sets `itemControls` for item type.
- `mouseup` after mousedown on empty, no movement, `mousedownHandled=true`: opens context menu.
- `mouseup` after mode was set externally (`mousedownHandled=false/undefined`): does NOT open context menu.
- `mouseup` always resets `mousedownItem=null`, `mousedownHandled=false`.
- `mousemove` with mousedown on item, moved tile: transitions to `DRAG_ITEMS` mode.
- `mousemove` with mousedown on empty, moved tile: transitions to `LASSO` mode.

---

---

## 7. Known Runtime Issues & Limitations

This section documents observable runtime issues captured from the browser console during development (2026-03-20). All measurements are from the **development build** — RAF/scheduler timings are inflated by development-mode instrumentation but indicate real structural bottlenecks.

---

### 7a. Pan Jitter — RAF Handler Overrun (CRITICAL)

**Symptom:** Pan is noticeably jittery. `requestAnimationFrame` handlers taking 50–168ms (60fps budget is 16ms).

**Console evidence:**
```
[Violation] 'requestAnimationFrame' handler took 168ms  (peak)
[Violation] 'requestAnimationFrame' handler took 50–100ms  (typical during pan)
```
Sources: `react-dom.development.js` and `lib-react.js` — both React render-path violations.

**Root cause analysis:** The RAF handler violations during pan indicate that React is triggering component re-renders inside the RAF callback. Even though pan/zoom was optimized (previous session) to update scroll transform via direct style manipulation rather than Zustand state, something in the render tree is still causing React re-renders that execute synchronously inside the RAF callback. The 50–168ms overrun means each animation frame blocks for 3–10x the available budget.

**Likely culprits (in order of probability):**
1. `uiState.mouse` (position updates every mousemove) is subscribed to by components that don't need it — any component reading `uiState.mouse` re-renders on every mouse move event.
2. `uiState.scroll` is still being written to Zustand on pan (for `setScroll`), triggering subscriber re-renders even if the SceneLayer CSS transform bypasses this.
3. DragItems mode calls `scene.updateViewItem` in a `transaction()` on every mousemove frame — this writes to the model store, triggering all scene subscribers.
4. Connector re-render on every tile change: `syncConnector` runs on every `updateViewItem` call during drag, recalculating connector paths and writing to sceneStore.

**Impact on architecture:** The `useRAFThrottle` hook was added to throttle mousemove processing to one event per animation frame. However, if the work done inside that frame exceeds 16ms, the throttling helps with event queue backlog but does not reduce per-frame render cost.

**Investigation path before refactoring:**
- Audit all `useUiStateStore(selector)` subscriptions — identify which selectors subscribe to `mouse` or `scroll` and whether those components need to re-render on every mouse event.
- Check if `setMouse` (called on every mousemove) triggers any component re-renders. The store write goes to Zustand, which notifies all subscribers synchronously.
- Use React DevTools Profiler to identify which components are rendering inside the pan RAF callbacks.

---

### 7b. React Scheduler Message Handler Overrun (CRITICAL)

**Symptom:** React Scheduler's `MessageChannel` handler (the fiber work loop scheduler) taking 150–805ms.

**Console evidence:**
```
[Violation] 'message' handler took 805ms  (peak)
[Violation] 'message' handler took 150–265ms  (typical)
```
Source: `scheduler.development.js` — this is React's cooperative scheduler running fiber work units.

**Root cause analysis:** React Scheduler uses a `MessageChannel` to schedule non-urgent work. When a Zustand state update triggers a large re-render subtree, React batches this into the scheduler queue. The 150–805ms messages indicate individual render batches (typically during pan/drag operations) are taking far too long. This is likely the same underlying cause as 7a — `setMouse`, `setScroll`, or scene store updates are triggering large portions of the component tree to re-render.

**Key distinction from 7a:** The RAF violation measures the animation frame callback; the message handler violation measures React's batched render execution. Both can be triggered by the same Zustand state write: the write schedules a re-render (message handler) and the re-render runs inside the next RAF callback. This double-violation pattern confirms the render is happening inside the animation frame.

**Mitigation strategy:** Before refactoring, the most impactful change would be to separate "mouse tracking state" (high-frequency, no React subscribers needed) from "diagram state" (lower-frequency, drives rendering). Mouse position during pan should ideally be a `useRef` or a non-reactive variable, not a Zustand state field.

---

### 7c. useInitialDataManager Double Load

**Symptom:** The initialization sequence fires twice on every page load.

**Console evidence:**
```
[useInitialDataManager] loading: Untitled Diagram views: 0
[useInitialDataManager] load complete, isReady=true
[useInitialDataManager] loading: Untitled Diagram views: 0   ← fires again
[useInitialDataManager] load complete, isReady=true
```

**Root cause analysis:** Almost certainly React StrictMode double-invocation in development. React 18 StrictMode intentionally mounts components twice (mount → unmount → remount) to surface side effects in `useEffect`. The double load sequence is harmless in development but confirms that `useInitialDataManager` has a `useEffect` with side effects (loading diagram data) that will fire twice in StrictMode. This is **not a production bug** but means:
1. Any initialization side effects (API calls, storage reads) fire twice in dev.
2. Any cleanup that's missing from the effect's return function could leak.

**Check required before refactoring:** Verify that `useInitialDataManager`'s `useEffect` has a proper cleanup function. If the effect starts an async operation, the cleanup should cancel it on unmount.

---

### 7d. Zustand Deprecated API Warning

**Symptom:** Deprecation warning on every page load.

**Console evidence:**
```
[DEPRECATED] Use `createWithEqualityFn` instead of `create` or use
`useStoreWithEqualityFn` instead of `useStore`. They can be imported from
'zustand/traditional'. https://github.com/pmndrs/zustand/discussions/1937
```
Source: The `useStore(store, selector, equalityFn)` call in `uiStateStore.tsx` (`useUiStateStore` hook).

**Current usage in code:**
```typescript
// stores/uiStateStore.tsx
const value = useStore(store, selector, equalityFn);
```

**Fix when ready:** Replace `useStore` from `zustand` with `useStoreWithEqualityFn` from `zustand/traditional`. This is a low-risk, mechanical change. The behavioral contract is identical — it just uses the "traditional" API that supports equality functions without deprecation.

**Note:** This warning will not affect functionality in the current zustand version but will become an error in a future major release.

---

### 7e. i18n English Locale Parse Failure (Low Severity)

**Symptom:** English locale file fails to load, silently falls back to `en-US`.

**Console evidence:**
```
i18next::backendConnector: loading namespace app for language en failed
  failed parsing /i18n/app/en.json to json
i18next::backendConnector: loaded namespace app for language en-US Object
```

**Root cause:** The server returns an HTML page (likely a 404 or the index.html SPA fallback) for `/i18n/app/en.json`. i18next attempts to parse the HTML as JSON, fails, but successfully falls back to `en-US` which does resolve correctly.

**Impact:** Zero functional impact — `en-US` is the correct locale and loads successfully. The `en` short-code request is unnecessary.

**Fix when ready:** Either add a redirect rule for `/i18n/app/en.json → /i18n/app/en-US.json`, or configure i18next to only request `en-US` without the short-code fallback.

---

### 7f. Server Storage Not Available (Low Severity)

**Symptom:** Storage service falls back to session storage on every load.

**Console evidence:**
```
storageService.ts:55 Server storage not available: SyntaxError: Unexpected token
  '<', "<!DOCTYPE "... is not valid JSON
storageService.ts:233 Using session storage
```

**Root cause:** `storageService.ts` makes an HTTP request to check server-side storage availability. The development server returns the SPA's `index.html` (HTML) for the storage check endpoint, which fails JSON parsing.

**Impact:** Diagrams are stored in session storage only — lost on browser close. This is expected behavior for the development environment. In a production deployment with a proper backend, this endpoint would return a valid JSON response.

**Note for refactoring:** The storage service has a try/catch that handles this gracefully. However, the failed fetch on every page load adds startup latency and a console error. Consider adding a `?dev=true` bypass or configuring a dev proxy rule.

---

### 7g. Quill "bullet" Format Registration Warning (Low Severity)

**Symptom:** Quill logs an error on initialization.

**Console evidence:**
```
quill Cannot register "bullet" specified in "formats" config.
  Are you sure it was registered?
```

**Root cause:** The `react-quill-new` configuration in `RichTextEditor` specifies `formats: ['bullet', ...]` but the Quill instance (as used via `react-quill-new`) does not have the "bullet" format registered in the current package version. "bullet" is typically an alias for the "list" format's bullet variant.

**Impact:** Bullet list formatting may not work correctly in TextBox rich-text editing. Other formats (bold, italic, etc.) are unaffected.

**Note:** The Quill XSS vulnerability (GHSA-v3m3-f69x-jf25) was already addressed by pinning `react-quill-new` to avoid the affected `quill@2.0.3`. This format registration issue may be a side effect of the pinned version.

---

### 7h. Performance Baseline for Regression Testing

**Observed during development build with empty canvas (no nodes):**

| Metric | Observed | Target (production) |
|---|---|---|
| RAF handler duration (pan) | 50–168ms | <16ms |
| React Scheduler message handler | 150–805ms | <50ms |
| RAF violations per second (pan) | ~60 (continuous) | 0 |

**Important caveat:** All violations above are from `react-dom.development.js` and `scheduler.development.js` — the **development build** with full instrumentation, error checking, and StrictMode double-invocations. Production builds with `react-dom.production.min.js` are typically 3–5x faster. However, the 50–168ms RAF violations (3–10x over budget) indicate real structural issues that will still be perceptible in production even if the numbers improve.

**Recommendation:** Before adding any major features, profile the production build to establish a real baseline. The development build numbers confirm there are render-path issues worth addressing in refactoring.

---

*End of document. Last updated: 2026-03-20.*
