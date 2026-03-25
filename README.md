A personal fork of [FossFLOW](https://github.com/molikas/FossFLOW) focused on UX polish, performance, and editing quality. All code is AI-assisted with manual review and testing.

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

- **Clickable node links** — Attach a URL to any node; its label becomes a clickable link in the diagram.
- **Node label font size and color** — Adjust font size and text color from the node settings panel.
- **Text box rich text and color** — Text boxes support bold, italic, bullet lists, headers, and more. Text color is adjustable. The box auto-expands to fit its content.
- **Connector label styling** — Per-label font size (8–24 px), text color, and position control. The color section is clearly labelled "Line Color" to distinguish it from label color.

### Canvas and navigation

- **Right-click to pan** — Right-click drag pans the canvas; release to resume the active tool.
- **Default zoom 90%** — Opens with a little breathing room.
- **Context menu** — Right-click on empty canvas to quickly add a node or rectangle.

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
- Language dropdown opens on click, not hover.
- Lasso hint auto-dismisses after first use.
- Help dialog (`F1` / `?`) documents all keyboard shortcuts.

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

### 2026-03-25

#### Features

- **Cut (`Ctrl+X`):** Cuts the selection to the clipboard and removes it from the canvas. Works with single-item and multi-item lasso selections. Supports full undo/redo — `Ctrl+Z` restores the deleted items while the clipboard retains the payload for subsequent pastes.

#### Bug Fixes

- **Node header link:** Clicking a node URL now opens it in a new tab. Bare URLs (e.g. `www.google.com`) are normalised to include `https://` before opening.
- **Rectangle z-order after paste:** Pasting a stack of rectangles now preserves the original visual layering.
- **Stacked rectangle hit-testing:** Clicking at a tile covered by multiple rectangles now selects the visually topmost one.
- **Save as creates a new file:** Saving under a different name now creates a new file instead of overwriting the current diagram.
- **Connector waypoints move with lasso drag:** Tile-based connector waypoints (mid-connector anchors not attached to a node) now move with the selection during lasso and freehand-lasso drags.

#### Tests

- `useCopyPaste.test.ts` +7 tests (11 → 18); `keyboard.dispatch.test.tsx` +3 (25 → 28); `shortcuts.test.ts` +1 (6 → 7); `renderer.test.ts` +4; `Lasso.modes.test.ts` +3
- Test count: 537 → 545, 54 suites, all passing

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
