This work aims to improve UX and other friction and experiment. This is for personal use and maybe "inspiration" for the original project...
All code is generated using Claude with sanity check reviews + manual testing. I cannot guarantee the code 100% makes sense for the long term project vision, rather it focuses on eliminating friction fast.


See original project: FossFLOW for details more details
## [Unreleased]

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

#### Tests
- **Toolbar propagation regression suite** (`toolMenu.propagation.test.tsx`): B/C tests upgraded from inline replicas to real `Lasso.ts` module imports — regressions in the actual file now caught
- **Lasso mode suite** (`Lasso.modes.test.ts`, +14 tests): full contract coverage of mousedown/mouseup/mousemove including all guards
- **Cursor mode suite** (`Cursor.modes.test.ts`, +12 tests): full contract coverage including `mousedownHandled` flag, context menu gate, and all mode transitions
- **Connector reducer rewrite** (`connector.test.ts`): replaced stale `{from,to}` anchor format with real `ConnectorAnchor[]` array format; tests now cover the actual API
- **Shortcuts constants** (`shortcuts.test.ts`, +7 tests): regression guard for all 6 `FIXED_SHORTCUTS` values
- **Settings defaults** (`settings.defaults.test.ts`, +11 tests): pin default hotkey profile, pan/zoom settings, keyboard pan speed
- **uiOverlay editor modes** (`uiOverlay.editorModes.test.ts`): clarified as semi-valid with explicit note to verify against production mapping
- Test count: 402 → 449, 48 suites, all passing

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
