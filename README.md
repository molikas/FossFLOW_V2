An "exprimental" community fork of [FossFLOW](https://github.com/stan-smith/FossFLOW) with expanded editing features, file management, and performance improvements. Source and issue tracker: [github.com/molikas/FossFLOW_V2](https://github.com/molikas/FossFLOW_V2).

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
- **Floating action bar** — When a node is selected in edit mode a compact pill bar appears above the node on the canvas with five icon buttons: Style, Edit name, Link, Notes (opens the Notes tab), Delete.
- **Note indicator dot** — Nodes with non-empty Notes show a small blue dot at the top-right of their icon on the canvas.
- **Read-only node panel** — In `EXPLORABLE_READONLY` mode, clicking a node opens a single-scroll panel showing **Caption** and **Notes** sections (only when non-empty). Header shows the node icon, name, and optional link button. Nodes with no caption and no notes are not clickable at all — the panel stays closed.
- **Double-click to place node or group** — Double-clicking empty canvas opens a compact "Add" popover at the cursor. A **Group** button at the top creates a background rectangle (used to visually group nodes). Below it, an icon picker lets you place a node — selecting an icon places it and immediately opens its Details tab for naming. Single left-click on empty canvas just deselects; no context menu.
- **Clickable node links** — Attach a URL to any node; its label becomes a clickable link in the diagram.
- **Node label font size and color** — Adjust font size and text color from the Style tab.
- **Text box rich text and color** — Text boxes support bold, italic, bullet lists, headers, and more. Text color is adjustable. The box auto-expands to fit its content.
- **Connector label styling** — Per-label font size (8–24 px), text color, and position control. The color section is clearly labelled "Line Color" to distinguish it from label color.

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

Measured on an 85-node / 54-connector diagram:

| Metric | Before | After |
|--------|--------|-------|
| Idle FPS | 5–18 fps | 60 fps |
| FPS during editing | 5–18 fps | 48–60 fps |
| Long tasks at session start | ~195 | ~6 |
| Long task rate (idle) | 6.4 / sec | ~0 / sec |
| Long task rate (editing) | 6–10 / sec | ~1.6 / sec |
| Diagram load recovery | Permanently degraded | Recovers to 60 fps within 1 s |

### Quality-of-life

- Editing a node no longer adds an empty description block to its canvas label.
- Language selector stays on screen — dropdown anchors to the right edge of the button.
- Lasso hint auto-dismisses after first use.
- Lasso tool activates correctly on first canvas click — no longer reverts to pointer before drawing the selection box.
- Help dialog (`F1` / `?`) documents all keyboard shortcuts.
- Session-only storage shows a dismissible warning banner.

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

### 2026-03-29

#### Features

- **Node panel — 3-tab redesign (Details / Style / Notes):** Replaced single-scroll accordion panel with a clean tab layout. *Details* tab: Name field, Caption (short rich-text shown on canvas), optional link. *Style* tab: Icon picker (inline, no mode switch), icon size slider, label font size/color/height. *Notes* tab: full-height rich-text editor (Quill, ~14 lines). Edit mode shows all three tabs; read-only mode shows a single-scroll panel (no tabs). Panel is 300 px wide.
- **Caption vs Notes naming:** The former "Description" field is now called **Caption** (signals that it appears visually on the canvas under the node name). The **Notes** field is private documentation shown only in the panel. Both are HTML-based rich text stored separately in `ModelItem`.
- **`notes` field on nodes:** `ModelItem` carries an optional `notes` rich-text field (HTML string, no max length) backed by the Zod schema. Backwards-compatible — old diagrams without `notes` load fine.
- **Notes tab sizing:** Notes editor fills the full tab height (~300 px / ~14 lines); Caption editor is compact (80 px / ~3 lines) to signal brevity.
- **Floating action bar:** When a node is selected in editable mode, a compact pill bar appears above the node on the isometric canvas with five icon buttons: Style (opens Style tab), Edit name (focuses name field in Details), Link (toggle/focus link), Notes (opens Notes tab; lights up primary when notes exist), Delete. Bar tracks the node as it scrolls and zooms.
- **Note indicator dot:** Nodes with non-empty Notes show a small blue dot at the top-right of their icon on the canvas.
- **Read-only node panel — single-scroll:** In `EXPLORABLE_READONLY` mode, clicking a node opens a single-scroll panel (no tabs) showing the node icon + name + optional link in the header, then **Caption** and **Notes** sections only when non-empty, separated by a divider. Nodes with neither caption nor notes are not clickable — the panel stays closed.
- **Preview button:** Eye icon in the toolbar (edit mode only) opens the current diagram in a new browser tab at `/display/{id}` — instant view-only preview without leaving the editor. Disabled with tooltip "Save first to preview" when the diagram has not yet been saved.
- **Double-click to add node or group:** Double-clicking empty canvas opens a compact "Add" popover at the cursor. A **Group** button at the top creates a background rectangle for visually grouping nodes. Below it, an icon picker lets you place a node — selecting an icon places it and opens its Details tab for naming. Single left-click on empty canvas now just deselects (no context menu).
- **MUI toolbar:** Toolbar in `fossflow-app` fully rewritten with MUI components — `Button`, `Divider`, `Chip`, `Popover`, `Alert`, `Typography`. Custom Bootstrap-era CSS classes removed from `App.css`.
- **Toolbar button hierarchy:** Save is `variant="contained"` (primary, blue). Diagrams and Share are `variant="outlined"` — consistent secondary actions. Eliminates the former gray-blob `contained color="inherit"` style on the Diagrams button.
- **Theme density:** MUI theme tightened (`spacing: 6`, `fontSize: 14`, `borderRadius: 6`, global `size: 'small'` defaults for Button, TextField, Slider). Section padding reduced across all control panels.

#### Bug Fixes

- **Lasso tool reverted to pointer on first click:** Activating the lasso tool and clicking on the canvas immediately reset the mode to CURSOR before any drag could begin. Fixed: `mousedown` with no existing selection is now a no-op; `mousemove` builds the selection box. Clicking outside an existing selection clears it and stays in lasso mode.
- **Sporadic canvas drag — ghost image bug:** Dragging nodes or multi-selections would occasionally cause the entire canvas to slide as a browser ghost image. Root cause: browser `dragstart` on SVG icons and `<img>` elements hijacked `mousemove` events. Fixed by calling `preventDefault()` on `dragstart` on the renderer container element (not `window`).
- **aria-hidden focus warnings:** `MainMenu` and `QuickAddNodePopover` were triggering browser accessibility warnings ("Blocked aria-hidden on an element because its descendant retained focus") when closing. Fixed: `MainMenu.onClose` restores focus to the anchor button before hiding; `QuickAddNodePopover.handleClose` blurs the active element before unmounting. Same pattern already used in `ContextMenu`.

#### Tests

- New suite: `dragStart.prevention.test.ts` — pins `dragstart` handler on `rendererEl`, not `window`, and verifies cleanup.
- New suite: `quickAdd.groupButton.test.ts` — contracts for Group rectangle creation (color selection, tile args, guard against empty colors) and node placement (tile, empty name, shared id, icon id). 10 tests.
- Updated: `Lasso.modes.test.ts`, `toolMenu.propagation.test.tsx` — reflect corrected lasso `mousedown` behaviour.
- Updated: `Cursor.modes.test.ts` — single left-click on empty canvas now asserts `setItemControls(null)` is called and `setContextMenu` is NOT called (context menu removed from left-click).
- Test count: 572 → 585, 59 → 61 suites, all passing.

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
