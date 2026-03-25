This work aims to improve UX and other friction and experiment. This is for personal use and maybe "inspiration" for the original project...
All code is generated using Claude with sanity check reviews + manual testing. I cannot guarantee the code 100% makes sense for the long term project vision, rather it focuses on eliminating friction fast.

**Performance highlight:** On a real 85-node / 54-connector diagram, idle FPS improved from 5–18 fps to a consistent 60 fps after fixing two root-cause render bugs. Long tasks dropped from ~195 at session start (6.4/sec baseline) to ~6 at start (~0/sec idle). Normal editing (adding nodes, connecting them, undoing) now runs at 48–60 fps. See the [Performance section](#performance) below for details.


See original project: FossFLOW for details more details

---

## What This Fork Adds

This fork extends the original Isoflow project with new features and fixes that improve the day-to-day diagramming experience. Here is what you get:

### Editing improvements

- **Copy and paste** — Select any combination of nodes, connectors, rectangles, and text boxes, then paste them anywhere on the canvas with `Ctrl+C` / `Ctrl+V`. Pasted items appear centered around your mouse cursor. Connectors between pasted nodes are included automatically, complete with their waypoints.
- **Freehand lasso selection** — In addition to the rectangular lasso, you can draw a freehand polygon to select exactly the items you want, even in a crowded diagram.
- **Dragging feels right** — Dragging nodes, text boxes, and rectangles now responds the instant you move, tracks your grab point precisely, and stops at the last valid position when blocked by another element rather than jumping around. The blue highlight tile always stays in sync with the cursor while dragging.
- **Delete key** — Press `Delete` or `Backspace` to remove the selected item(s) directly from the canvas.
- **Undo/redo** — Full multi-step undo and redo for all canvas changes.
- **Multi-view diagrams** — Create multiple named views (tabs) within a single file. Each view is an independent canvas.

### Node and text customisation

- **Clickable links on nodes** — Attach a URL to any node's name. The label becomes a clickable link in the diagram, useful for linking to documentation, tickets, or external resources.
- **Node label font size and color** — Adjust the font size and text color of a node's canvas label from the node settings panel. Color presets match the diagram palette, with a custom color picker for anything else.
- **Text box rich text and color** — Text boxes support the same rich text editor as node descriptions: bold, italic, bullet lists, headers, and more. Text color is adjustable per text box using the same palette + custom picker. The box expands downward to fit its content automatically.
- **Connector label styling** — Each connector label has its own font size slider (8–24 px) and text color picker. The label position along the connector is set via both a slider and a number input. The connector color section is clearly labelled "Line Color" to avoid confusion with label color.

### Navigation and canvas

- **Right-click to pan** — Hold right-click and drag to pan the canvas. Release to go back to what you were doing. No need to switch to a pan tool.
- **Sensible default zoom** — The canvas opens at 90% zoom so you immediately have some room to work with.
- **Context menu** — Right-click on an empty area of the canvas to quickly add a node or rectangle without reaching for the toolbar.

### Performance

Two root-cause render bugs were found and fixed using a built-in diagnostics overlay. The improvements are measurable on diagrams you'd actually use day-to-day — not just empty canvases.

**Test diagram:** 85 nodes, 54 connectors, 10 text boxes (a realistic mid-size architecture diagram).

| Metric | Before fixes | After fixes |
|--------|-------------|-------------|
| Idle FPS | 5–18 fps | 60 fps |
| FPS during normal editing | 5–18 fps (never recovered) | 48–60 fps |
| Long tasks at session start | ~195 | ~6 |
| Long task rate (idle) | 6.4 / sec | ~0 / sec |
| Long task rate (editing) | 6–10 / sec | ~1.6 / sec |
| Diagram load recovery | Permanently degraded | Recovers to 60 fps within 1 s |

**Root causes fixed:**

1. **`onModelUpdated` double-firing** — `modelFromModelStore` was called without a shallow equality check. Every `saveToHistory` call (fired before every user action) produced a new object reference and triggered `onModelUpdated` twice per action, cascading into continuous re-renders. Fix: `shallow` equality selector in `useModelStore`.
2. **`iconPackManager` prop churn** — The icon pack manager prop was an inline object literal, recreated on every `App` render. This caused `setIconPackManager` to write to the Zustand store on every render, creating a feedback loop. Fix: `useMemo` + `useCallback`.

**Remaining known issue:** Sustained drag on an 85-node diagram still drops FPS to 8–17 fps with 8–12 long tasks/sec. Root cause: `uiState.mouse` updates at 60 fps during drag, and multiple scene components subscribe to it and re-render on every frame. Needs viewport culling or render isolation of mouse-position-dependent components.

- **Diagnostics overlay** — A collapsible performance overlay (bottom-right corner) shows live FPS, JS heap usage, long task count, scene item counts, and a timestamped event log. Two download formats: compact AI-friendly JSON and labelled human-readable JSON. Enabled by default in development; disabled by default in production with a toggle that persists in `localStorage`. The overlay auto-detects 9 event categories: GC events, FPS degradation/recovery, long-task bursts, drag start/end, undo/redo, zoom changes, view switches, tab visibility changes, and memory pressure warnings.

### Quality-of-life fixes

- **Clicking a node to edit it no longer adds an empty description block** to the node's label on the canvas.
- **Language dropdown opens on click**, not on hover — it no longer pops open accidentally when you move the mouse past it.
- **Lasso selection tip** auto-dismisses after you use it once, so it does not get in the way every session.
- **Help dialog** (`F1` or `?`) documents all keyboard shortcuts including copy/paste.

---

## Getting Started

Everything runs inside Docker — you do not need Node.js or npm installed on your machine.

### Prerequisites

| Tool | Where to get it | Notes |
|------|----------------|-------|
| **Docker Desktop** | [docker.com/get-started](https://www.docker.com/get-started/) | Includes Docker Compose. Windows and Mac: install Docker Desktop. Linux: install [Docker Engine](https://docs.docker.com/engine/install/) + the [Compose plugin](https://docs.docker.com/compose/install/). |
| **Git** | [git-scm.com](https://git-scm.com/downloads) | Windows: Git for Windows. Mac: comes with Xcode Command Line Tools (`xcode-select --install`). Linux: `sudo apt install git` / `sudo dnf install git`. |

### Step 1 — Clone the repository

Open a terminal (Command Prompt or PowerShell on Windows, Terminal on Mac/Linux) and run:

```bash
git clone https://github.com/molikas/FossFLOW_V2.git
cd FossFLOW_V2
```

### Step 2 — Build and run (first time only)

This downloads all dependencies and builds the app inside Docker. It takes 3–5 minutes the first time.

```bash
docker compose -f compose.dev.yml up --build
```

Once you see `Starting nginx...` in the output, open your browser and go to:

**[http://localhost:3000](http://localhost:3000)**

### Step 3 — Subsequent runs

After the first build you can start the app much faster without rebuilding:

```bash
docker compose -f compose.dev.yml up
```

### Stopping the app

Press `Ctrl+C` in the terminal where the app is running, or run this from another terminal in the same folder:

```bash
docker compose -f compose.dev.yml down
```

### Where your diagrams are saved

All diagrams are saved automatically to a `diagrams/` folder inside the `FossFLOW_V2` directory on your machine. This folder is created the first time you save a diagram. Your data stays on your machine and is not sent anywhere.

To back up your diagrams, copy the `diagrams/` folder to another location.

---

## [Unreleased]

### 2026-03-24

#### Performance

- **`onModelUpdated` double-fire fix:** Added `shallow` equality to `useModelStore` model selector in `Isoflow.tsx`. Without it, `saveToHistory` (called before every user action) produced a new object reference and fired `onModelUpdated` twice per action, cascading into continuous renders. On an 85-node diagram this was the primary driver of 6.4 long tasks/sec at idle. After fix: ~0/sec idle, 60 fps.
- **`iconPackManager` prop churn fix:** Memoized the `iconPackManager` prop object and its callback in `App.tsx` with `useMemo`/`useCallback`. The inline object literal was recreated on every `App` render, causing `setIconPackManager` to write to the Zustand store on every render, creating a feedback loop.
- **DiagnosticsOverlay:** Collapsible performance monitoring overlay (bottom-right pill button). Shows live FPS (color-coded), JS heap MB, long task count, node/connector/textbox counts, and a timestamped event log. Downloads in AI-compact (array-of-arrays, token-efficient) or human-readable (labelled JSON, summary stats) formats. Always-on in dev; disabled by default in prod with a `localStorage`-persisted toggle. Memory ceiling: ~56 KB max (600-sample circular buffer + 300-event log). Detects 9 event categories automatically: GC, FPS degradation/recovery, long-task burst, drag start/end, undo/redo, zoom change, view switch, tab visibility, memory warning.

#### Features

- **Connector label font size:** Each label on a connector has its own font-size slider (8–24 px). The label position field gains a companion slider so position can be adjusted by dragging or typing.
- **Connector label color:** Per-label text color picker using the scene palette swatches (circle buttons, matching the line color selector) plus a custom color input with eyedropper. Defaults to black. Section previously labelled "Color" renamed to "Line Color" to avoid ambiguity.
- **TextBox rich text editing:** The text box editor now uses the same Quill-based `RichTextEditor` as node descriptions — supports bold, italic, underline, strikethrough, lists, headers, block-quote, and links. Content schema max length raised from 100 to 1000 characters to accommodate formatted text.
- **TextBox auto-height:** The canvas text box element now expands downward to fit its content. Height is calculated from the number of paragraph/list block elements × font size in tiles. The placement tile stays as the drag/select handle; extra lines grow below it.
- **TextBox text color:** Text boxes have a text color picker (same palette + custom picker as connector labels). Defaults to black; reset button returns to default.
- **Node label color:** Node canvas labels have a text color picker in the settings panel, shown when the node has a name. Uses the same `LabelColorPicker` component for consistency.
- **Consistent color picker UI:** All label/text color pickers (`LabelColorPicker`) use the same visual style as the connector line color section — preset palette circles, "Custom color" toggle switch, `CustomColorInput` with color swatch and hex field.

#### Tests

- **`connectorLabelSchema` suite** (`connector.test.ts`, +6 tests): validates minimal label, optional fontSize within 8–24 range, rejects out-of-range fontSize, optional labelColor, missing id failure
- **`viewItemSchema` labelColor** (`views.test.ts`, +2 tests): accepts optional `labelColor`; omitting it still passes
- **`textBoxSchema` color** (`textBox.test.ts`, +2 tests): accepts optional `color` field; omitting it still passes
- Test count: 517 → 527, 54 suites, all passing

---

### 2026-03-22

#### Features
- **Transient right-click pan (FF-001):** Single right-click deselects selection and dismisses item controls panel; right-click drag pans the canvas; releasing the right button restores whichever tool was active before the pan started (Select, Connector, Lasso, etc.). Behaviour gated by the existing `rightClickPan` pan setting — if disabled, right-click is still consumed (no context menu / add-node panel) but has no pan or deselect side-effects
- **Default zoom 90%:** Canvas loads at 90% zoom instead of 100% for better initial viewport framing

#### Bug Fixes
- **Node description empty-state:** Clearing all text from a node's description in the editor now correctly collapses the canvas label. HTML-strip check replaces the previous fragile exact-string comparison — handles all Quill empty variants (`<p><br></p>`, whitespace-only, etc.)
- **Service worker stale-build loop:** Replaced the legacy CRA cache-first service worker with a self-unregistering cleanup SW that clears all caches on activate. `index.tsx` always unregisters. FossFLOW is not a PWA and does not need offline caching
- **StrictMode double-load:** `Isoflow.tsx` now uses a `loadRef` pattern to ensure the initial-data effect fires only once per genuine prop change, not on React 18 StrictMode's double-mount
- **Storage dev bypass:** `storageService.ts` now uses `process.env.NODE_ENV !== 'production'` (rsbuild statically replaces this) instead of `import.meta.env.DEV` which was not inlined and caused a failed JSON parse + 5-second timeout on every dev reload

#### Performance
- **Subscription tightening (R-1):** Zustand equality functions added to mouse-state selectors in interaction hooks; reactive subscription removed from `usePanHandlers` — eliminates render churn on every mouse move
- **Grid off Zustand (R-2):** `Grid.tsx` reads scroll position via `useRef` + resize-observer instead of subscribing to Zustand scroll state — removes per-frame store writes during pan

#### Tests
- **usePanHandlers suite extended (+7 tests, 13 → 20):** Right-click deferred pan — threshold exceeded → enters PAN; below threshold → suppresses processMouseUpdate; right-click without drag → deselect path (closes itemControls, clears mousedown state, returns true); right-drag then release → restores previous mode (CURSOR); right-drag from CONNECTOR mode → restores CONNECTOR; mousemove after pan started → returns false; LASSO right-click without drag → clears lasso selection

---

### 2026-03-20

#### Features
- **Copy/paste toasts:** Snackbar notifications for copy ("Copied N items"), paste ("Pasted N items"), and empty-clipboard paste ("Nothing to paste")
- **Connector mode indicator:** Toolbar shows a "Click" / "Drag" chip next to the Connector button so the active interaction mode is always visible
- **Settings consolidation:** Pan, Zoom, and Labels settings merged into a single "Canvas" tab — settings dialog reduced from 6 tabs to 4 (Hotkeys · Canvas · Connector · Icon Packs)
- **SMNRCT hotkey description:** Dropdown now explains the SMNRCT and "None" profiles inline

#### Bug Fixes
- **Pan settings toggles inverted:** All 4 mouse-button toggles (middle, right, ctrl, alt click pan) were displaying inverted state — fixed
- **Right-click context menu removed:** Right-click no longer opens a canvas context menu; right-click is reserved for pan only
- **Undo/Redo removed from main menu:** Were duplicated — already available in the toolbar and via keyboard shortcuts
- **ImportHintTooltip hardcoded position:** Tooltip now positions dynamically below the toolbar instead of at a fixed offset
- **ConnectorHintTooltip auto-dismiss:** Tooltip now permanently dismisses after the user leaves connector mode for the first time (mirrors LassoHintTooltip behaviour)
- **Copy/paste centroid bug:** Centroid calculation now includes rectangles (midpoint of from/to) and textboxes, not just icon nodes — pasted groups land at the correct position relative to the mouse
- **Orphaned connector anchors on paste:** Connectors pasted without their anchored items now have the orphaned anchor reference detached cleanly
- **Fixed shortcuts deduplicated:** Ctrl+C/V/Z/Y strings extracted to `src/config/shortcuts.ts` — single source of truth imported by both HotkeySettings and HelpDialog
- **Toolbar click triggering canvas actions:** Clicking any toolbar button while in Lasso, FreehandLasso, or other modes could propagate to the window-level interaction manager and trigger spurious canvas actions (e.g. opening the "Add Node" context menu). Fixed with three layers of defence:
  - ToolMenu wrapper gains `onMouseDown stopPropagation` (matches existing ControlsContainer pattern)
  - `Lasso.mousedown` and `FreehandLasso.mousedown` gain `isRendererInteraction` guard (all other mode handlers already had this)
  - `Lasso.mouseup` and `FreehandLasso.mouseup` gain `!mouse.mousedown` guard — toolbar clicks never record a canvas mousedown, so stray mouseups are safely ignored
- **"Add Node" context menu appearing on mode transitions:** Switching from Pan → Select, or exiting pan via left-click, incorrectly triggered the empty-canvas context menu. Fixed by adding `mousedownHandled?: boolean` to `CursorMode` — the context menu now only opens when `Cursor.mousedown` explicitly processed the initiating click

#### Bug Fixes (easy wins)
- **Zustand deprecated API warning:** Replaced `useStore(store, selector, equalityFn)` with `useStoreWithEqualityFn` from `zustand/traditional` in all three stores (`uiStateStore`, `modelStore`, `sceneStore`) — eliminates `[DEPRECATED]` console warning on every load
- **Quill "bullet" format warning:** Removed `'bullet'` from `RichTextEditor` formats array — it was an unregistered alias causing `quill Cannot register "bullet"` on every TextBox open. Bullet list toolbar button and functionality unaffected
- **i18n short-code locale 404:** Added `load: 'currentOnly'` to i18next config — stops the spurious `/i18n/app/en.json` request that always 404d before falling back to `en-US`
- **`createModelItem` double-write:** Removed redundant `updateModelItem` call after `push` in the model item reducer — the item was already fully written; the second write was a no-op scan+spread

#### Tests
- **Toolbar propagation regression suite** (`toolMenu.propagation.test.tsx`): B/C tests upgraded from inline replicas to real `Lasso.ts` module imports — regressions in the actual file now caught
- **Lasso mode suite** (`Lasso.modes.test.ts`, +15 tests): full contract coverage of mousedown/mouseup/mousemove including all guards
- **Cursor mode suite** (`Cursor.modes.test.ts`, +16 tests): full contract coverage including `mousedownHandled` flag, context menu gate, and all mode transitions
- **Connector reducer rewrite** (`connector.test.ts`, +21 tests): replaced stale `{from,to}` anchor format with real `ConnectorAnchor[]` array format; tests now cover the actual API
- **Shortcuts constants** (`shortcuts.test.ts`, +7 tests): regression guard for all 6 `FIXED_SHORTCUTS` values
- **Settings defaults** (`settings.defaults.test.ts`, +14 tests): pin default hotkey profile, pan/zoom settings, keyboard pan speed
- **uiOverlay editor modes** (`uiOverlay.editorModes.test.ts`): clarified as semi-valid with explicit note to verify against production mapping
- **Model item reducer** (`modelItem.test.ts`, +5 tests): double-write regression guard, immutability check, sparse-array behavior pin
- **RichTextEditor formats** (`RichTextEditor.formats.test.ts`, +4 tests): 'bullet' absent, 'list' present, count pinned
- **Zustand deprecation smoke test** (`zustand.deprecation.test.ts`, +4 tests): warn spy + source-file assertion across all 3 stores
- **i18n config pin** (`i18n.config.test.ts`, +3 tests): load option and fallbackLng pinned
- **Pan handlers** (`usePanHandlers.test.ts`, +13 tests): all 9 handleMouseDown bypass conditions + handleMouseUp full coverage; pan cycle test (middle-click starts, mouseUp ends)
- **Copy/paste** (`useCopyPaste.test.ts`, +10 tests): handleCopy (LASSO selection, itemControls, centroid including rects/textboxes, connector auto-include); handlePaste (null clipboard warning, ID remapping, orphan anchor detach, offset, LASSO mode set)
- **History real-store** (`useHistory.realStore.test.tsx`, +7 tests): undo/redo round-trip with real Zustand stores; overflow cap at 50 entries; redo cleared after new mutation; transaction single-checkpoint guarantee; nested transaction guard
- **Connector schema ref contracts** (`connector.test.ts`, +5 tests): anchorSchema tile-only ref, empty ref, simultaneous item+tile (no exclusivity guard documented); connectorSchema 0/1 anchor count (min is app-level invariant only)
- **Zoom boundaries** (`renderer.test.ts`, +7 tests): `incrementZoom`/`decrementZoom` clamped at MIN\_ZOOM/MAX\_ZOOM; correct step size; no float drift across full range
- Test count: 402 → 507, 54 suites, all passing

#### Docs
- **`regression_tests.md`** (new): full reference document for all 54 test suites — production targets, test counts, VALID/SEMI-VALID classifications, coverage notes per suite, and known coverage gaps index
- **`current_architecture.md`**: Section 3 (Test Audit) updated with all new suites (rounds 1–3); Section 7 runtime issues updated to mark 7d/7e/7g as resolved

---

### 2026-03-19

#### Bug Fixes
- **Security:** Resolve Quill XSS vulnerability (GHSA-v3m3-f69x-jf25) — pinned `react-quill-new` to avoid affected `quill@2.0.3` (vulnerability is in `getSemanticHTML()`, not used by FossFLOW)

#### Performance
- **SVG Export Optimizer — Phase 1/2/3:** Reduce exported SVG size from ~940 KB to ~750 KB (~20% reduction)
  - Phase 1: Strip irrelevant CSS properties (vendor prefixes, animation, transition, scroll, print props)
  - Phase 2: Round floating-point coordinates to 2 decimal places (layout-safe, skips width/height/font-size etc.)
  - Phase 3: Prune `display:none` subtrees before serialization

#### Chores
- Remove unused dependencies from `fossflow-lib`: `auto-bind`, `paper`, `dom-to-image` (old fork), `react-hook-form`, `react-router-dom`, `recharts`, `css-loader`, `style-loader`, `@types/dom-to-image`
- Move `dom-to-image-more` from root to `fossflow-lib` where it is actually imported
- Bundle size reduced: 3,438 kB → 3,403 kB (−35 kB)

---

### 2026-03-18

#### Features
- **Node header links:** Add clickable hyperlink support to node header labels — set a URL on any node to make its name a clickable link in the diagram
- **Diagram management:** Imperative diagram loading, multi-view management, and diagram/view renaming
- **Interaction controls:**
  - Right-click toggles pan tool; left-click exits back to select mode
  - Delete key shortcut for removing selected elements
  - Lasso (rubber-band) selection of multiple elements
  - Context menu restore
- **Help dialog:** Update help dialog to reflect new interaction controls (pan, select, lasso, delete)

#### Performance
- **Render cycle elimination:** Remove React render cycle for pan/zoom operations; add `memo` to scene layer components — pan/zoom no longer triggers component re-renders
- **Hotspot fixes:** Address CPU/memory hotspots identified in architecture review (dependency stability, resize observer, RAF throttle)
- **Render isolation:** Eliminate N-1 through N-5, H-3, M-1 render hotspots — connector render isolation, expandable label selector consolidation, export dialog memo

#### Tests
- Add performance-refactoring regression baseline suite (381 tests, 42 test suites) covering: grid background formula, keyboard dispatch, UI overlay editor modes, RAF throttle cleanup, resize observer lifecycle, scene list shape, reference stability, view operations integration, connector render isolation, expandable label selector consolidation, export image dialog memo, GSAP dependency, interaction manager dependency stability, renderer size shared observer
