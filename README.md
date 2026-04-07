An "experimental" community fork of [FossFLOW](https://github.com/stan-smith/FossFLOW) with expanded editing features, file management, full internationalisation, and performance improvements. Source and issue tracker: [github.com/molikas/FossFLOW_V2](https://github.com/molikas/FossFLOW_V2).

**Performance highlight:** On a real 85-node / 54-connector diagram, idle FPS improved from 5–18 to a consistent 60 fps after fixing two root-cause render bugs. See the [Performance section](#performance) below.

---

## What This Fork Adds

### Editing

- **Cut, copy and paste** — `Ctrl+C` copies, `Ctrl+X` cuts, `Ctrl+V` pastes at cursor. Works on any combination of nodes, connectors, rectangles, and text boxes. Connectors between pasted nodes are included automatically. Full undo/redo support.
- **Freehand lasso selection** — Draw a freehand polygon to select items, in addition to the standard rectangular lasso.
- **Drag precision** — Dragging responds instantly, tracks the grab point, and stops cleanly at the last valid position when blocked.
- **Delete key** — `Delete` or `Backspace` removes selected items.
- **Undo/redo** — Full multi-step history for all canvas changes.
- **Multi-view diagrams** — Multiple named views (tabs) within a single file, each an independent canvas.

### Nodes and text

- **Node panel — Details / Style / Notes tabs** — Selecting a node opens a 300 px side panel with three tabs. *Details*: name, caption (short text shown on the canvas below the node name), and optional link. *Style*: icon picker, icon size, label font/color/height. *Notes*: full-height rich-text editor for private documentation — never shown on the canvas itself.
- **Caption vs Notes** — "Caption" is canvas-visible text (subtitle under the node name). "Notes" is hidden documentation only accessible in the panel. Both fields are rich-text (Quill), stored separately in the model.
- **Floating action bar** — When a node is selected in edit mode a compact pill bar appears above the node on the canvas with six icon buttons: Style, Edit name, Link, Notes (opens the Notes tab), **Start connector** (draws a new connector from this node and returns to the selector after connecting), Delete.
- **Note indicator dot** — Nodes with non-empty Notes show a small blue dot at the top-right of their icon on the canvas.
- **Read-only node panel** — In `EXPLORABLE_READONLY` mode, clicking a node opens a single-scroll panel showing **Caption** and **Notes** sections (only when non-empty). Header shows the node icon, name, and optional link button. Nodes with no caption and no notes are not clickable at all — the panel stays closed.
- **Double-click to place node or group** — Double-clicking empty canvas opens a compact "Add" popover at the cursor. A **Group** button at the top creates a background rectangle (used to visually group nodes). Below it, an icon picker lets you place a node — selecting an icon places it and immediately opens its Details tab for naming. Single left-click on empty canvas just deselects; no context menu.
- **Clickable node links** — Attach a URL to any node; its label becomes a clickable link in the diagram.
- **Node label font size and color** — Adjust font size and text color from the Style tab.
- **Text box rich text and color** — Text boxes support bold, italic, bullet lists, headers, and more. Text color is adjustable. The box auto-expands to fit its content.
- **Connector label styling** — Per-label font size (8–24 px), text color, and position control. The color section is clearly labelled "Line Color" to distinguish it from label color.
- **Connector anchor handles** — Selecting a connector shows glass-morphism anchor circles at each endpoint and waypoint (source = filled dot, target = hollow ring). Click any handle to enter reconnect mode; move the mouse to live-preview the new route, then click to finalize. Endpoint handles are always visible above node icons.

### Canvas and navigation

- **Right-click to pan** — Right-click drag pans the canvas; release to resume the active tool.
- **Default zoom 90%** — Opens with a little breathing room.

### File management

- **Save / Save As** — Save directly to a named file. Save As always prompts for a new name and creates a new file.
- **Diagrams panel** — Browse, load, and delete all saved diagrams from a single panel. Share any diagram as a read-only link.
- **Save status indicator** — Shows when the diagram was last saved and whether there are unsaved changes. Displayed in the toolbar right section as `Saved at HH:MM`, `Saved yesterday at HH:MM`, or `Saved Mon DD at HH:MM` for older diagrams. A `•` dot appears when there are pending changes. No auto-save — only explicit Save updates the timestamp.
- **Save confirmation toast** — A brief `✓ [Name] saved` notification slides up from the bottom on every explicit save.
- **Share link** — Generates a read-only URL for the current diagram (requires server storage).

### Performance

**Idle / editing (85-node / 54-connector diagram):**

| Metric | Before | After |
|--------|--------|-------|
| Idle FPS | 5–18 fps | 60 fps |
| FPS during editing | 5–18 fps | 48–60 fps |
| Long tasks at session start | ~195 | ~6 |
| Long task rate (idle) | 6.4 / sec | ~0 / sec |
| Long task rate (editing) | 6–10 / sec | ~1.6 / sec |
| Diagram load recovery | Permanently degraded | Recovers to 60 fps within 1 s |

**Paste performance (2026-03-31 session — measured with DiagnosticsOverlay):**

| Scenario | Before (sync paste) | After (async paste) |
|----------|--------------------|--------------------|
| ~113 nodes / 441 connectors | FPS drops to 5, hard freeze | 60 fps maintained, no freeze |
| ~280 nodes / 1132 connectors | Short hard freeze, instant 60fps recovery | Negligible initial delay, 9 s background routing |
| ~560 nodes / 2264 connectors | 30+ s main-thread block ("page unresponsive") | rAF yields prevent tab kill; routing completes in ~90 batches |

*How it works:* The async path (Fix 6) dequeues A* pathfinding out of the paste transaction into `requestAnimationFrame` batches of 25 connectors each. Each connector appears routed as its batch completes. The browser stays responsive between batches, eliminating the main-thread block that triggered Chrome's "page is unresponsive" dialog. A* results are cached (LRU, 2 000 entries) so repeated paste of the same topology is instant. For the "1k node" edge case the routing window is still noticeable (~9 s), but the tab stays alive and a progress toast counts completion percentage.

### Internationalisation (i18n)

- **12 languages** — English (default), Chinese Simplified, German, French, Spanish, Italian, Portuguese (Brazil), Polish, Turkish, Russian, Hindi, Indonesian, Bengali.
- Language selector in the toolbar shows the active language name and switches instantly without reload.
- All UI text localised: toolbar buttons (Save / Diagrams / Share / Preview), save-status timestamps, Save As dialog, Share popover, Diagrams Manager, tool tooltips (Select / Lasso / Pan / Rectangle / Connector etc.), icon selector search, QuickIconSelector help text, node panel tabs, zoom controls, export image dialog, settings panels, connector/lasso hint tooltips, and all alert/confirmation strings.

### Quality-of-life

- Editing a node no longer adds an empty description block to its canvas label.
- Language selector stays on screen — dropdown anchors to the right edge of the button and shows the active language name.
- Lasso hint auto-dismisses after first use.
- Lasso tool activates correctly on first canvas click — no longer reverts to pointer before drawing the selection box.
- Help dialog (`F1` / `?`) documents all keyboard shortcuts.
- Session-only storage shows a dismissible warning banner.

---

## Code Coverage

```bash
npm test --workspace=packages/fossflow-lib -- --coverage
```

HTML report: `packages/fossflow-lib/coverage/lcov-report/index.html`. Current global statement coverage ~32%. Thresholds set at 10% global minimum — intentionally low while the suite grows. Additional static analysis tools (ESLint, Knip, `npm audit`) output to `reports/`.

---

## Getting Started

Requires [Docker Desktop](https://www.docker.com/get-started/) and [Git](https://git-scm.com/downloads). No Node.js needed.

```bash
git clone https://github.com/molikas/FossFLOW_V2.git
cd FossFLOW_V2
docker compose -f compose.dev.yml up --build   # first run — takes 3–5 min
```

Open **http://localhost:3000**. Subsequent starts omit `--build`.

To stop: `Ctrl+C`, or `docker compose -f compose.dev.yml down` from another terminal.

Diagrams are saved to a `diagrams/` folder in the project directory.

---

## [Unreleased]

### 2026-04-06

#### Internationalisation — complete UI localisation

All remaining hardcoded English strings have been replaced with i18n keys across both the library and application packages.

**fossflow-app (react-i18next, `app` namespace):**
- **Toolbar buttons:** Save, Load, Diagrams, Share — wired to `t('nav.save')` etc.
- **Preview tooltip:** context-aware (`Save first to preview` / `Save & Preview` / `Preview`) — all three states localised.
- **Share popover:** title, hint text, Copy / ✓ Copied! button.
- **Save As dialog:** title, subtitle, filename placeholder, Save / Cancel buttons.
- **Save-status label:** `formatSavedAt()` output now uses `t('status.savedAt')` etc. with `time`, `month`, `day`, `year` interpolation. "Unsaved" also localised.
- **Diagrams Manager:** title, storage badges, "Last modified", loading text, empty state, Open / Delete buttons, share link tooltip, delete confirmation, error messages — all localised in `DiagramManager.tsx` via `useTranslation('app')`.
- **Language selector:** now shows the active language's display name (e.g. "中文 (简体)") instead of the generic "A/文" glyph.
- **All 11 non-English JSON files** updated with the new keys (proper translations for all major languages; English fallback for hi-IN and bn-BD).

**fossflow-lib (localeStore, TypeScript locale files):**
- **ToolMenu tooltips:** `toolMenu` namespace added to `LocaleProps` and all 13 locale TS files. All 10 tool name props (Undo, Redo, Select, Lasso select, Freehand lasso, Pan, Add item, Rectangle, Connector, Text) wired to `t()`.
- **QuickIconSelector:** `quickIconSelector` namespace added. "RECENTLY USED", search placeholder, "SEARCH RESULTS ({n} icons)", "No icons found matching…", and both help-text variants wired. Interpolation uses `.replace()` since the lib's `t()` does not support object params.
- **zh-CN.ts viewTabs fix:** `addPage`, `deletePage`, `renameDiagram` were English placeholders — corrected to Chinese.

#### Bug fix — ExportImageDialog blank preview on first open

On the first open, the export preview showed only the background colour with no diagram elements. Toggling any checkbox (Show Grid, Expand Descriptions) triggered a re-export that worked correctly.

**Root cause:** `exportImage()` was called after a fixed 100 ms timeout + double `requestAnimationFrame` on mount. This fired before the hidden Isoflow instance had finished populating its model store, so `html2canvas` captured an empty canvas.

**Fix:** The hidden Isoflow now receives `onModelUpdated={handleHiddenIsoflowReady}`. On the first call, `isoflowLoadedRef` is set and `isoflowReadySignal` is incremented. A dedicated initial-load effect watches this signal and fires a single `requestAnimationFrame` to export — by this point Isoflow has painted at least one frame with diagram data. A separate options-change effect is guarded by `isoflowLoadedRef.current` so it only runs after the initial export is complete. Both effects call `exportImage` through a stable `exportImageRef` to avoid dependency-array churn.

#### Tests

- New: `exportImageDialog.initialLoad.test.ts` — 8 assertions pinning the ready-signal mechanism (ref guard, signal state, `onModelUpdated` wiring, `exportImageRef` pattern, unconditional Isoflow mount).
- New: `i18n.localeCompleteness.test.ts` — iterates all 13 locale TS files and asserts every top-level namespace from `en-US.ts` is present. Catches missing sections at CI time rather than at runtime.
- New: `toolMenu.i18n.test.ts` — 11 assertions verifying no hardcoded English tool-name strings remain and all use `t()` from `toolMenu` namespace.
- New: `quickIconSelector.i18n.test.ts` — 12 assertions verifying all six hardcoded strings are gone and `.replace()` interpolation is used for parameterised strings.
- Test count: 683 → 729, 68 → 72 suites, all passing.

### 2026-03-31

#### Performance

Nine targeted optimizations, all measured with the in-app DiagnosticsOverlay:

**History (Fix 5 — committed)**
- `modelStore` and `sceneStore` history switched from full-snapshot arrays to Immer `produceWithPatches` patch pairs. Memory for a 50-entry undo stack drops from O(N × 50 × model_size) to O(50 × diff_size). Undo/redo now apply/invert the stored diff rather than swapping full snapshots — correct, deterministic round-trips.

**Paste (Fix 6 + A/B/C)**
- **Async A\* pathfinding (Fix 6):** Connector routing dequeued out of the paste transaction into `requestAnimationFrame` batches of 25 connectors each. Eliminates the main-thread block that caused Chrome's "page is unresponsive" dialog at ~1 000 + connectors. Each connector appears as its batch completes; a progress toast shows routing % for pastes ≥ 500 connectors.
- **Per-connector sceneStore subscription (Fix A):** Each `<Connector>` component subscribes only to its own path slice (`state.connectors[id]?.path`) with reference equality. Async path writes re-render only the one connector that just received its route — not all N. Raw view connectors passed to the renderer; merged (`hitConnectors`) used only for interaction/hit-testing.
- **A\* LRU cache (Fix B):** Path results cached in a 2 000-entry `Map` keyed by `from,to,gridSize`. Repeated paste of the same topology resolves instantly without re-running A\*.
- **`startTransition` on paste (Fix C):** Wrap `scene.pasteItems` in React's `startTransition` so the resulting render is deprioritised — UI stays responsive to input during the initial store write.

**Other fixes (committed)**
- **WeakMap item index (Fix 1):** `useModelItem` and `getItemAtTile` build a `Map<id, item>` once per unique array reference via a module-level `WeakMap` — O(1) lookup, GC'd automatically.
- **`findNearestUnoccupiedTile` rewrite (Fix 2):** Builds a `Set<"x,y">` of occupied tiles once; eliminates the O(N) `getItemAtTile` call inside every ring step.
- **Zustand transaction batching (Fix 3):** `scene.transaction()` buffers intermediate states in a `pendingStateRef`, flushes as two `setState` calls at the end instead of 2 × N writes.
- **Viewport culling (Fix 4):** `Renderer.tsx` computes tile-space bounds via `storeApi.subscribe()` (no React re-renders on pan/zoom unless the visible tile range actually changes). Items and connectors outside the viewport are filtered before render.

**Outcome:** On an ~113-node / 441-connector paste, FPS stays at 60 (previously froze to 5). On ~280-node / 1 132-connector paste, routing completes in ~9 s in background with no freeze (previously a hard main-thread block). The "page is unresponsive" threshold is no longer reached because rAF yields between batches.

#### Tests

- Fixed 4 test failures introduced by the performance refactors: `renderer.test.ts` mock updated for `hitConnectors`, `useHistory.realStore.test.tsx` redo round-trip fixed (patch store now uses original entry instead of recomputing patches), `useScene.listShape.test.tsx` and `useScene.referenceStability.test.tsx` updated to reflect that DEFAULTS merging moved from the list into the `<Connector>` component, and that `hitConnectors` (not `connectors`) updates on scene store changes.
- Test count: 683 tests, 68 suites, all passing.

### 2026-03-30

#### Code Quality & Security

- **Static analysis pipeline established:** ESLint (flat config, v10), Knip (dead code / unused exports), and `npm audit` are now configured and running at root. Reports output to `reports/` to keep console noise minimal.
- **Conditional hooks bug fixed (Connector.tsx):** `useIsoProjection` and 7 `useMemo` calls were invoked after an early `if (!color) return null` guard — a React Rules of Hooks violation causing latent state-corruption risk. All hooks are now called unconditionally before any early return.
- **Stale closure fixed (useCopyPaste):** `showNotification` was a plain function re-created each render, causing `handleCopy`, `handleCut`, and `handlePaste` callbacks to close over a stale reference. Wrapped in `useCallback([uiStateApi])`.
- **CVE patches:** `npm audit fix` resolved a path-to-regexp ReDoS (high) and a yaml stack-overflow (moderate). Quill XSS (high) documented as accepted risk — fixing requires a breaking downgrade of `react-quill-new`.
- **14 dead files removed:** Knip identified and confirmed unreferenced: `EditorPage.tsx`, `minimalIcons.ts`, `usePersistedDiagram.ts`, `NodeControls.tsx`, `NodeSettings.tsx`, `Header.tsx`, `useWindowUtils.ts`, `RichTextEditor/index.ts`, `index-docker.tsx`, `service-worker.js`, and 4 stale docs-config files.
- **Unused imports cleaned up:** Removed `Slider`, `Typography`, `Divider`, `FormControlLabel`, `CoordsUtils`, `IconPackName`, `mergeDiagramData`, `extractSavableData` from their respective files. Unused local vars prefixed `_` per ESLint convention.
- **Debug logging removed:** Operational `console.log` calls stripped from `useInitialDataManager` — only errors remain.
- **Locale type completeness fixed:** `addNodeGroupAction` / `addNodeGroupShortcut` / `addNodeGroupDescription` added to `LocaleProps` type and all 11 non-English locale files (English placeholder text).
- **Code coverage infrastructure:** Jest already configured with Istanbul (via `ts-jest`) — line, branch, function, and statement coverage available via `npm test -- --coverage`. HTML report output to `packages/fossflow-lib/coverage/`. Thresholds currently set at 10% global minimums. See [Code Coverage](#code-coverage) below.

### 2026-03-29

#### Features

- **Node panel — 3-tab redesign (Details / Style / Notes):** Replaced single-scroll accordion panel with a clean tab layout. *Details* tab: Name field, Caption (short rich-text shown on canvas), optional link. *Style* tab: Icon picker (inline, no mode switch), icon size slider, label font size/color/height. *Notes* tab: full-height rich-text editor (Quill, ~14 lines). Edit mode shows all three tabs; read-only mode shows a single-scroll panel (no tabs). Panel is 300 px wide.
- **Caption vs Notes naming:** The former "Description" field is now called **Caption** (signals that it appears visually on the canvas under the node name). The **Notes** field is private documentation shown only in the panel. Both are HTML-based rich text stored separately in `ModelItem`.
- **`notes` field on nodes:** `ModelItem` carries an optional `notes` rich-text field (HTML string, no max length) backed by the Zod schema. Backwards-compatible — old diagrams without `notes` load fine.
- **Notes tab sizing:** Notes editor fills the full tab height (~300 px / ~14 lines); Caption editor is compact (80 px / ~3 lines) to signal brevity.
- **Floating action bar:** When a node is selected in editable mode, a compact pill bar appears above the node on the isometric canvas with five icon buttons: Style (opens Style tab), Edit name (focuses name field in Details), Link (toggle/focus link), Notes (opens Notes tab; lights up primary when notes exist), Delete. Bar tracks the node as it scrolls and zooms.
- **Note indicator dot:** Nodes with non-empty Notes show a small blue dot at the top-right of their icon on the canvas.
- **Read-only node panel — single-scroll:** In `EXPLORABLE_READONLY` mode, clicking a node opens a single-scroll panel (no tabs): header with node icon + name + optional link button, then **Caption** and **Notes** sections only when non-empty. Nodes with neither caption nor notes are not clickable — the panel stays closed.
- **Save & Preview button:** Eye icon in the toolbar (edit mode only). If there are unsaved changes, silently saves first (shows the save toast), then opens `/display/{id}` in a new browser tab. Tooltip adapts: *"Save & Preview"* when dirty, *"Preview"* when already saved, *"Save first to preview"* when no diagram exists yet.
- **Double-click to add node or group:** Double-clicking empty canvas opens a compact "Add" popover at the cursor. A **Group** button at the top creates a background rectangle for visually grouping nodes. Below it, an icon picker lets you place a node — selecting an icon places it and opens its Details tab for naming. Single left-click on empty canvas now just deselects (no context menu, no ambiguity).
- **Help dialog updated:** "Add Node / Group — Double-click (empty area)" entry added to the shortcuts table so the double-click gesture is discoverable.
- **MUI toolbar:** Toolbar in `fossflow-app` fully rewritten with MUI components — `Button`, `Divider`, `Chip`, `Popover`, `Alert`, `Typography`. Custom Bootstrap-era CSS classes removed from `App.css`.
- **Toolbar button hierarchy:** Save is `variant="contained"` (primary, blue). Diagrams and Share are `variant="outlined"` — consistent secondary actions.
- **Theme density:** MUI theme tightened (`spacing: 6`, `fontSize: 14`, `borderRadius: 6`, global `size: 'small'` defaults for Button, TextField, Slider). Section padding reduced across all control panels.

#### Bug Fixes

- **Double-click inconsistency:** Single left-click on empty canvas previously opened a context menu, which conflicted with double-click. Timer-based disambiguation was unreliable. Fixed by removing the context menu from left-click entirely — single click deselects, double-click adds.
- **Lasso tool reverted to pointer on first click:** Fixed: `mousedown` with no existing selection is now a no-op; `mousemove` builds the selection box. Clicking outside an existing selection clears it and stays in lasso mode.
- **Sporadic canvas drag — ghost image bug:** Root cause: browser `dragstart` on SVG/`<img>` elements hijacked `mousemove`. Fixed by calling `preventDefault()` on `dragstart` on the renderer container.
- **aria-hidden focus warnings:** `MainMenu` and `QuickAddNodePopover` were triggering browser accessibility warnings on close. Fixed by restoring/blurring focus before the modal hides.
- **Build error (TAB_READONLY_NOTES):** Stale constant reference from read-only tab removal caused a TypeScript build failure. Removed.
- **Pan.ts — model not destructured:** `mouseup` handler referenced `model.items` without destructuring `model`. Fixed.

#### Tests

- New suite: `dragStart.prevention.test.ts` — pins `dragstart` handler on `rendererEl`, not `window`.
- New suite: `quickAdd.groupButton.test.ts` — 10 tests covering Group rectangle creation args and node placement contracts.
- Updated: `Cursor.modes.test.ts` — left-click on empty canvas asserts `setItemControls(null)` and `setContextMenu` NOT called.
- Updated: `Lasso.modes.test.ts`, `toolMenu.propagation.test.tsx` — corrected lasso `mousedown` behaviour.
- Updated: `saveTracking.isAfterLoad.test.ts` — tightened auto-save regex to avoid cross-function false positives.
- Test count: 572 → 585, 59 → 61 suites, all passing.

---

### 2026-03-27

#### Features

- **Toolbar UX overhaul:** 3-section layout (actions left, spacer center, language right). Three focused buttons: **Save** (direct save if associated, Save As for new diagrams), **Diagrams** (load + manage, opens server or session dialog automatically), **Share** (copies read-only URL; disabled when no server storage or no saved diagram).
- **Save status tracking:** Save button is disabled when there are no unsaved changes and a file is already associated. Enabled immediately on any user edit to any view (including adding views or editing view 2+). Auto-save removed entirely — only an explicit Save updates the last-saved timestamp and clears the dirty indicator.
- **Save status label:** Toolbar right section shows context-aware last-saved time: `Saved at HH:MM` (today), `Saved yesterday at HH:MM`, `Saved Mon DD at HH:MM` (this year), or `Saved Mon DD, YYYY at HH:MM` (older). A `•` dot appends when unsaved changes exist. Positioned before the language selector with a divider.
- **Save confirmation toast:** Brief `✓ [Name] saved` notification slides up from the bottom-center of the screen on every explicit save, auto-dismisses after 2.5 s.
- **Diagrams manager:** Merged Load + Storage Manager into a single "Diagrams" button. Manager is load-only (no in-dialog save). Per-row share button copies a read-only URL; shows a green ✓ for 2 seconds after copying.
- **Dismissible session warning banner:** Amber banner below the toolbar warns when running in session-only storage mode. Dismissed per tab via `sessionStorage`; never shown again in that tab once dismissed.
- **Community edition splash screen:** Welcome notification updated with community edition branding, fork repository link, and GitHub issues prompt.

#### Bug Fixes

- **Duplicate diagram title removed:** Title was shown in both the toolbar center and the ViewTabs bar at the bottom. Toolbar center title removed — ViewTabs is the single source.
- **Multi-view save tracking:** Changes to any view (including creating a new view, adding nodes to view 2+) now correctly enable the Save button. Root cause: `isoflowRef.current.load()` triggered `onModelUpdated` → `hasUnsavedChanges=true`, and then auto-save reset it 5 seconds later, masking changes. Fixed with `isAfterLoadRef` pattern — suppresses the first post-load callback — and removing `setHasUnsavedChanges(false)` from auto-save.
- **Undo/redo icon colors:** Were inverted — disabled state appeared dark/prominent, enabled state appeared light/muted. Fixed to industry norm: enabled=`grey.700` (dark, prominent), disabled=`grey.400` (muted), active=`grey.200` (light on coloured background).
- **Diagram title rename from canvas disabled:** ViewTabs title card is now read-only. The diagram name is managed at the file level via Save/Save As. Page (view tab) names remain renameable inline.
- **Language dropdown off-screen:** Dropdown was anchored `left:0`, extending off the right edge of the viewport. Fixed to `right:0` so it opens leftward and stays fully visible.

#### Tests

- New suites: `IconButton.color.test.tsx`, `viewTabs.titleReadonly.test.ts`, `splashScreen.communityEdition.test.ts`, `languageDropdown.positioning.test.ts`, `saveTracking.isAfterLoad.test.ts`
- Test count: 545 → 572, 54 → 59 suites, all passing

#### Polish / Console

- **Verbose logging removed:** Operational `console.log` calls stripped from `storageService` and `App` — only errors remain. Reduces console noise in production.
- **Old-format icon migration:** Diagrams saved before the full-icon-set format was introduced are silently re-saved on first load so subsequent loads no longer re-run the merge path.
- **aria-hidden focus warning fixed:** MUI context menu was setting `aria-hidden` on its modal root while a descendant still held focus, triggering a browser accessibility warning. Focus is now moved back to the anchor element before the menu closes.

---

### 2026-03-25

#### Features

- **Cut (`Ctrl+X`):** Cuts the selection to the clipboard and removes it from the canvas. Works with single-item and multi-item lasso selections. Supports full undo/redo — `Ctrl+Z` restores the deleted items while the clipboard retains the payload for subsequent pastes.

#### Bug Fixes

- **Node header link:** Clicking a node URL now opens it in a new tab. Bare URLs (e.g. `www.google.com`) are normalised to include `https://` before opening.
- **Rectangle z-order after paste:** Pasting a stack of rectangles now preserves the original visual layering.
- **Stacked rectangle hit-testing:** Clicking at a tile covered by multiple rectangles now selects the visually topmost one.
- **Save as creates a new file:** Saving under a different name now creates a new file instead of overwriting the current diagram.
- **Connector waypoints move with lasso drag:** Tile-based connector waypoints (mid-connector anchors not attached to a node) now move with the selection during lasso and freehand-lasso drags.
- **Lasso drag when clicking on a node within selection:** Clicking on a node element (rather than empty canvas) inside a lasso selection now correctly starts a group drag instead of redrawing the lasso from that node's tile. Previously, `isRendererInteraction = false` caused the mousedown to be ignored, so the next mousemove treated it as a new lasso stroke — clearing the selection and losing waypoints from it.

#### Tests

- `useCopyPaste.test.ts` +7 tests (11 → 18); `keyboard.dispatch.test.tsx` +3 (25 → 28); `shortcuts.test.ts` +1 (6 → 7); `renderer.test.ts` +4; `Lasso.modes.test.ts` +3
- Test count: 537 → 545, 54 suites, all passing
- **Note:** E2E tests are not currently passing and will be addressed in a separate session.

---

### 2026-03-24

#### Performance

- **`onModelUpdated` double-fire fix:** Added shallow equality to the model selector in `Isoflow.tsx`. Without it, every user action fired `onModelUpdated` twice, driving 6.4 long tasks/sec at idle. After fix: ~0/sec idle, consistent 60 fps.
- **`iconPackManager` prop churn fix:** Memoized the `iconPackManager` prop in `App.tsx`. The inline object literal was recreated on every render, causing a Zustand store write feedback loop.
- **DiagnosticsOverlay:** Collapsible performance overlay (bottom-right). Shows live FPS, JS heap, long task count, and item counts. Downloadable in compact or human-readable JSON. Always-on in dev; off by default in prod with a `localStorage` toggle.

#### Features

- **Connector label font size:** Per-label font size slider (8–24 px) with a companion position slider.
- **Connector label color:** Per-label text color picker with palette presets and a custom color input.
- **TextBox rich text editing:** Text boxes use the same Quill-based editor as node descriptions — bold, italic, lists, headers, links, and more. Max content length raised to 1000 characters.
- **TextBox auto-height:** Text boxes expand downward to fit their content.
- **TextBox text color:** Text color picker with palette presets, custom picker, and reset to default.
- **Node label color:** Node canvas labels have a text color picker in the settings panel.
- **Consistent color picker UI:** All label/text color pickers use the same visual style as the connector line color section.

#### Tests

- `connector.test.ts` +6; `views.test.ts` +2; `textBox.test.ts` +2
- Test count: 517 → 527, 54 suites, all passing

---

### 2026-03-22

#### Features

- **Right-click pan:** Single right-click deselects and dismisses item controls; right-click drag pans; releasing restores the previous tool. Gated by the existing `rightClickPan` setting.
- **Default zoom 90%:** Canvas loads at 90% zoom for better initial framing.

#### Bug Fixes

- **Node description empty-state:** Clearing all text from a node description now correctly collapses the canvas label.
- **Service worker stale-build loop:** Replaced the legacy CRA service worker with a self-unregistering cleanup SW. FossFLOW is not a PWA and does not need offline caching.
- **StrictMode double-load:** Initial data effect now fires only once per genuine prop change, not on React 18 StrictMode's double-mount.
- **Storage dev bypass:** Fixed a failed JSON parse + 5-second timeout on every dev reload caused by an env variable that was not statically inlined.

#### Performance

- **Subscription tightening:** Zustand equality functions added to mouse-state selectors; reactive subscription removed from `usePanHandlers` — eliminates render churn on every mouse move.
- **Grid off Zustand:** `Grid.tsx` reads scroll position via `useRef` + resize observer instead of Zustand — removes per-frame store writes during pan.

#### Tests

- `usePanHandlers.test.ts` +7 (13 → 20)
- Test count: (covered in 2026-03-20 baseline)

---

### 2026-03-20

#### Features

- **Copy/paste toasts:** Snackbar notifications for copy, paste, and empty-clipboard paste.
- **Connector mode indicator:** Toolbar shows a "Click" / "Drag" chip next to the Connector button.
- **Settings consolidation:** Pan, Zoom, and Labels settings merged into a single "Canvas" tab — settings dialog reduced from 6 tabs to 4.

#### Bug Fixes

- **Pan settings toggles inverted:** All 4 mouse-button pan toggles were displaying inverted state.
- **Right-click context menu removed:** Right-click is reserved for pan; the canvas context menu is gone.
- **Toolbar click triggering canvas actions:** Toolbar clicks could propagate to the interaction manager and trigger spurious canvas actions.
- **"Add Node" menu appearing on mode transitions:** Switching from Pan → Select incorrectly triggered the empty-canvas context menu.
- **Copy/paste centroid bug:** Centroid calculation now includes rectangles and text boxes — pasted groups land at the correct position.
- **Orphaned connector anchors on paste:** Connectors pasted without their anchored items now have orphaned references cleanly detached.
- **Fixed shortcuts deduplicated:** `Ctrl+C/V/Z/Y` strings are now a single source of truth in `src/config/shortcuts.ts`.
- **Zustand deprecated API warning:** Replaced `useStore(store, selector, equalityFn)` with `useStoreWithEqualityFn` across all stores.
- **Quill "bullet" format warning:** Removed unregistered `'bullet'` alias from the RichTextEditor formats array.
- **i18n short-code locale 404:** Added `load: 'currentOnly'` to i18next config — stops a spurious 404 request on load.
- **`createModelItem` double-write:** Removed a redundant `updateModelItem` call; the item was already fully written.

#### Tests

- New suites: `toolMenu.propagation`, `Lasso.modes`, `Cursor.modes`, `connector`, `shortcuts.test`, `settings.defaults`, `uiOverlay.editorModes`, `modelItem`, `RichTextEditor.formats`, `zustand.deprecation`, `i18n.config`, `usePanHandlers`, `useCopyPaste`, `useHistory.realStore`, `connector schema`, `renderer`
- Test count: 402 → 507, 54 suites, all passing

#### Docs

- **`regression_tests.md`** (new): full reference for all 54 test suites — production targets, classifications, coverage notes, and known gaps.
- **`current_architecture.md`**: Test audit and runtime issue sections updated.

---

### 2026-03-19

#### Bug Fixes

- **Security:** Pinned `react-quill-new` to avoid the Quill XSS vulnerability (GHSA-v3m3-f69x-jf25). The affected method (`getSemanticHTML()`) is not used by FossFLOW.

#### Performance

- **SVG Export Optimizer:** Exported SVG size reduced ~20% (~940 kB → ~750 kB) by stripping irrelevant CSS, rounding float coordinates, and pruning `display:none` subtrees.

#### Chores

- Removed unused dependencies from `fossflow-lib` (`auto-bind`, `paper`, `dom-to-image`, `react-hook-form`, `react-router-dom`, `recharts`, `css-loader`, `style-loader`).
- Bundle size: 3,438 kB → 3,403 kB (−35 kB).

---

### 2026-03-18

#### Features

- **Node header links:** Set a URL on any node to make its name a clickable link.
- **Diagram management:** Imperative diagram loading, multi-view management, and diagram/view renaming.
- **Interaction controls:** Right-click pan, delete key, lasso selection, context menu restore.
- **Help dialog:** Updated to reflect all new interaction controls.

#### Performance

- **Render cycle elimination:** Pan/zoom no longer triggers component re-renders. `memo` added to scene layer components.
- **Hotspot fixes:** Dependency stability, resize observer, and RAF throttle CPU hotspots addressed.
- **Render isolation:** N-1 through N-5, H-3, M-1 hotspots eliminated — connector render isolation, label selector consolidation, export dialog memo.

#### Tests

- Performance-refactoring regression baseline: 381 tests across 42 suites covering render isolation, dependency stability, RAF throttle, resize observer, and more.
