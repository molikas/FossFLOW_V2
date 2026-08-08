# Coverage baseline & invariants harvest

**Generated:** 2026-07-29 from the 8-agent mapping workflow (do not hand-edit the inventories — annotate corrections inline as blockquotes instead, so the provenance stays clear).
**Purpose:** the dedupe reference for the novelty rule in [APPROACH.md](APPROACH.md) §1 — a hypothesis only counts if none of the behaviors below already asserts it — plus the harvested invariants that seed hypothesis generation.

> The inventories are a compressed map made by reading test titles and skimming assertions. Before ruling a hypothesis DUPLICATE, open the named spec and confirm the assertion actually covers it — and before counting one as novel, grep beyond this file (tests move).

## E2E coverage (packages/axoview-e2e/tests/, 75 specs)

### Smoke / app boot / empty state

**Files:** `packages/axoview-e2e/tests/smoke.spec.ts`, `packages/axoview-e2e/tests/empty-state-clickable-card.spec.ts`

**Asserted behaviors:**
- J1: place 3 icons, Ctrl+S save, reload -> same 3 icons persist
- J20: empty state renders; New button opens a blank diagram
- J20: empty-state Import button triggers the file chooser
- Clicking the create card's icon region (not just the pill) opens a blank diagram
- Import card contains no nested button (single interactive element)

**Conspicuous gaps:**
- First-run onboarding/hint-tooltip content (fixture dismisses them, never asserts them)
- Boot with a corrupted localStorage session (recovery path)
- Multiple tabs open on the same local session (storage race)

### Landing / routing / 404

**Files:** `packages/axoview-e2e/tests/landing-navigation.spec.ts`

**Asserted behaviors:**
- Landing renders at / with crawlable hero and CTAs into /app
- 'Open Axoview' CTA boots the editor at /app
- Editor brand mark navigates back to landing at /
- Unknown /app route shows graceful 404 instead of spinning
- 404 'Go to Axoview' link returns to the editor
- Legal pages share landing chrome and link back to / and /app

**Conspicuous gaps:**
- Browser back/forward across landing <-> app transitions
- Deep-link into /app with an in-progress session (state preserved?)

### Connectors

**Files:** `packages/axoview-e2e/tests/connector.spec.ts`, `packages/axoview-e2e/tests/connector-creation.spec.ts`, `packages/axoview-e2e/tests/connector-deep.spec.ts`, `packages/axoview-e2e/tests/connector-dot-and-label-placement.spec.ts`, `packages/axoview-e2e/tests/connector-parity.spec.ts`, `packages/axoview-e2e/tests/connector-realmouse.spec.ts`, `packages/axoview-e2e/tests/connector-selection-clarity.spec.ts`, `packages/axoview-e2e/tests/lasso-connector-delete.spec.ts`

**Asserted behaviors:**
- J2: draw connector between two icons; undo removes it, redo restores it
- Icon-to-icon connector gets item-bound anchors at BOTH ends
- Icon-to-free-tile connector: item-bound start, tile-bound end
- Escape after first click discards the in-flight connector (cancel mid-drag)
- Delete key on a selected connector removes only the connector; endpoint items survive
- Connector with both anchors on one tile paints a dot marker
- F2 on a connector adds a new midpoint label and inline-edits it (name<->label decouple)
- Real-mouse drag from a single node commits a connector and does not lock the tool
- Real-mouse drag between two nodes connects them
- Real-mouse drag between two EMPTY tiles draws a free-floating connector (both ends tile-bound)
- Lone click on empty canvas creates NO connector (stray-click guard)
- Selecting a connector shows the halo; clicking an empty adjacent tile clears it
- Partial lasso over free-tile connector + Delete leaves a clean scene (no orphans), placement still works after
- Lasso strip crossing a connector path selects it even when both endpoints are outside the marquee
- Lasso captures a free-tile connector's endpoints; dragging the selection moves them rigidly (no splice)
- Connector -> icon-place -> undo leaves NO orphaned/invisible connector (dual-stack skew, in undo-redo-dual-stack.spec)

**Conspicuous gaps:**
- Dragging an existing endpoint to re-anchor onto a different node/tile
- Adding/removing/dragging waypoints on an existing connector path (waypoint FOLLOW during group drag is covered; direct waypoint editing is not)
- Connector styling: color, width, line style, arrowheads/direction
- Deleting an endpoint NODE directly (not via lasso) and asserting the attached connector cascades
- Dragging/repositioning an existing connector midpoint label
- Self-loop or multiple parallel connectors between the same node pair
- Connector copy/paste

### Rectangles

**Files:** `packages/axoview-e2e/tests/shapes.spec.ts`, `packages/axoview-e2e/tests/rectangle-ops.spec.ts`, `packages/axoview-e2e/tests/rectangle-move-resize.spec.ts`, `packages/axoview-e2e/tests/rectangle-overlap-select.spec.ts`, `packages/axoview-e2e/tests/rectangle-overlap-zorder.spec.ts`, `packages/axoview-e2e/tests/rectangle-zorder-menu.spec.ts`, `packages/axoview-e2e/tests/rotate-border.spec.ts`

**Asserted behaviors:**
- J3: draw rectangle + place textbox, save, reload -> both persist with the SAME entity ids
- Delete on a selected rectangle removes it; other rectangles survive
- Rectangle MOVE: interior drag translates from+to corners by the same delta
- Rectangle RESIZE: BOTTOM_RIGHT handle drag updates the bottom-right corner only
- RIGHT edge-midpoint drag grows width only (height fixed) — tested in BOTH ISOMETRIC and 2D
- TOP edge-midpoint drag grows height only (width fixed) — ISOMETRIC only
- Clicking the overlap of two rectangles selects the one drawn on top (newest)
- Item over rectangle: click on item-tile selects the ITEM; click on bare rect-tile selects the RECTANGLE
- Context menu Bring forward / Send backward nudges rectangle zIndex
- Rectangle ROTATE handle transposes the footprint about its center
- Right-click cancels an armed RECTANGLE.DRAW back to CURSOR (in label-edit-and-placement-cancel.spec)

**Conspicuous gaps:**
- Rectangle fill/border/color styling
- LEFT/BOTTOM edges and the other three corner handles
- TOP edge resize in 2D projection
- Inverted drag (resize past zero / crossing the opposite edge)
- Rectangle copy/paste/duplicate
- Undo of a rectangle resize or rotate
- Zero-size / single-tile rectangle draw commit-vs-discard

### Textboxes

**Files:** `packages/axoview-e2e/tests/textbox-ops.spec.ts`, `packages/axoview-e2e/tests/textbox-text-edit-move.spec.ts`, `packages/axoview-e2e/tests/rotate-border.spec.ts`

**Asserted behaviors:**
- Delete on a selected textbox removes it; other textboxes survive
- Typing into on-canvas editor + click-away commits model.textBoxes[].content
- Escape on a never-committed box discards it (empty-box lifecycle)
- Escape on re-edit of a committed box reverts without touching the model
- '- ' autoformats into a bullet list that commits as <ul>
- Alignment control writes text-align + verticalAlign
- Transform bounds hug the placeholder then track the draft live during edit
- Ctrl+K opens INLINE link card at the word under the caret; Enter applies
- Protocol-less URLs are forgiven; unlink removes the anchor
- Run-axis resize anchors set a manual width; content wraps and height grows
- External rich-HTML paste is normalized (scripts/handlers stripped, formatting kept)
- Textbox MOVE: interior drag translates textbox.tile by the same delta
- Textbox ROTATE handle flips orientation X<->Y and back
- Strip Border popover writes border style + seeds a default color

**Conspicuous gaps:**
- Bold/italic/underline inline formatting controls
- Font family/size/color on a textbox
- Undo/redo during or immediately after a text edit session
- Clicking a committed link inside a textbox (edit mode vs view mode behavior)
- Very long content overflow/clipping behavior
- Textbox copy/paste as an entity

### Floating labels + node labels

**Files:** `packages/axoview-e2e/tests/label-entity.spec.ts`, `packages/axoview-e2e/tests/label-drag.spec.ts`, `packages/axoview-e2e/tests/label-edit-and-placement-cancel.spec.ts`, `packages/axoview-e2e/tests/node-label-decouple.spec.ts`, `packages/axoview-e2e/tests/readable-labels.spec.ts`, `packages/axoview-e2e/tests/connector-dot-and-label-placement.spec.ts`, `packages/axoview-e2e/tests/canvas-selection-polish.spec.ts`

**Asserted behaviors:**
- Arming the Label tool + one click creates exactly one Label
- Label paints on LabelsCanvas, DOM-after NodesCanvas (above nodes)
- A press anywhere on the chip selects the Label (full-chip hit target)
- Delete removes a selected Label (L-1)
- Clicking a Label does NOT auto-open the Properties dock (L-3)
- Right-clicking a Label opens its item context menu (L-2)
- Placing a label selects it but leaves the right Details deck closed
- Node-label drag below the node is ONE undo entry and persists across reload
- An UNSELECTED node's label can be dragged without changing selection
- Double-clicking a floating label chip edits it inline; F2 edits the selected label inline
- Escape cancels an armed LABEL tool back to CURSOR
- On-canvas node label reads `label` field, decoupled from identity `name`
- Double-clicking a node label enters inline rename
- Aa toggle flips readableLabels and persists across reload
- Node label counter-scales at low zoom only when readableLabels is on
- ISOMETRIC: labelled node paints its dotted label stalk on the canvas (canvas-node-render.spec)

**Conspicuous gaps:**
- Label styling (color/font/size on a single label)
- Multi-line label text
- Label copy/paste/duplicate
- Undo of a label TEXT edit (drag undo covered, text-edit undo not)
- Label stalk rendering in 2D projection
- Label behavior when its anchor node is deleted

### Selection / lasso / multi-select

**Files:** `packages/axoview-e2e/tests/multi-select-drag.spec.ts`, `packages/axoview-e2e/tests/multi-select-drag-lasso.spec.ts`, `packages/axoview-e2e/tests/canvas-selection-polish.spec.ts`, `packages/axoview-e2e/tests/layers-multiselect.spec.ts`

**Asserted behaviors:**
- Ctrl+A + drag preserves relative item positions across the group
- Waypoint follows a multi-select drag (Ctrl+A variant, named regression class)
- Pure-lasso variant: lasso a group with a waypoint, drag it, waypoint follows
- Lasso through the MIDDLE of a long rectangle selects it (intersection, not full-enclosure)
- One marquee over a rectangle AND a textbox selects both (mixed types)
- Lasso completes back to CURSOR; an empty click inside the completed box clears the selection
- Canvas Ctrl-multi-select highlights the matching layers-panel rows (KR3)
- Ctrl+A selects every interactable item in the active view (hotkeys.spec)

**Conspicuous gaps:**
- Shift-click / Ctrl-click to ADD a single item to an existing selection on canvas
- Ctrl-click toggle-DESELECT of an already-selected item
- Lasso with modifier to extend an existing selection
- Ctrl+A exclusion of hidden/locked-layer items
- Marquee auto-scroll when dragging past the viewport edge
- Selection preserved (or intentionally cleared) across projection toggle

### Drag / collision / off-grid / snap

**Files:** `packages/axoview-e2e/tests/drag-collision.spec.ts`, `packages/axoview-e2e/tests/off-grid-pointer.spec.ts`, `packages/axoview-e2e/tests/snap-grid.spec.ts`, `packages/axoview-e2e/tests/css-preview-mid-drag.spec.ts`, `packages/axoview-e2e/tests/iso-helper-smoke.spec.ts`

**Asserted behaviors:**
- Dragging a node onto an occupied tile is rejected; both nodes keep original tiles
- Sub-tile drag moves the element by EXACTLY the pointer delta
- Hover, selection chrome and context menu resolve at the DRAWN (offset) position
- A node's name chip is grabbable and right-clickable where it is drawn
- Global snap OFF: a drag commits a px offset while the tile stays integer
- Per-item Unsnap (context menu) allows overlap with a neighbour without collision
- Global snap-to-grid toggle round-trips persisted settings across reload
- Lasso-move accumulates offsets; every moved item still opens its OWN context menu
- An off-grid item survives reload at its DRAWN position (render, not just model)
- Turning global snap ON does NOT re-snap items that are already off-grid
- Mid-drag the model tile is unchanged while [data-drag-id] carries the --ff-drag CSS var (CSS-preview drag)
- tileToScreen helper roundtrips an item tile back to a click that selects it

**Conspicuous gaps:**
- Escape mid-node-drag cancels and restores the origin position
- Multi-select drop where only SOME target tiles are occupied (partial collision)
- Collision semantics between a node and an off-grid/unsnapped neighbour during drag
- Drag at extreme zoom-out / near canvas edge
- An explicit 're-snap this item' action

### Undo/redo / clipboard / hotkeys / modes

**Files:** `packages/axoview-e2e/tests/undo-redo-cross-cutting.spec.ts`, `packages/axoview-e2e/tests/undo-redo-dual-stack.spec.ts`, `packages/axoview-e2e/tests/hotkeys.spec.ts`, `packages/axoview-e2e/tests/z-order.spec.ts`, `packages/axoview-e2e/tests/mode-transitions.spec.ts`

**Asserted behaviors:**
- place -> place -> connector -> undo x3 -> redo x3 round-trips cleanly
- connector -> place -> undo leaves NO orphaned/invisible connector (dual-stack skew D-7)
- Ctrl+S persists the current diagram to localStorage
- Ctrl+Z undoes the last placement; Ctrl+Y redoes it
- Ctrl+C then Ctrl+V duplicates the selected item (count=2, history grows)
- Ctrl+X removes the view item; Ctrl+V restores it from the clipboard
- Delete removes the selected item from the canvas
- Ctrl+] / Ctrl+[ increment / decrement the selected item zIndex
- l/c/m/s hotkeys cycle LASSO -> CONNECTOR -> PAN -> CURSOR cleanly
- Esc from idle CONNECTOR mode returns to CURSOR (F-01)

**Conspicuous gaps:**
- Undo of a DELETE that restores an item together with its attached connectors
- Undo of resize, rotate, z-order, or style operations
- Redo-stack invalidation after undo-then-new-action
- Paste POSITION semantics (only counts asserted, not where the paste lands)
- Copy/paste of a multi-item selection or across diagrams
- History depth cap / memory behavior on long sessions

### Canvas projection modes / rendering / viewport

**Files:** `packages/axoview-e2e/tests/canvas-modes.spec.ts`, `packages/axoview-e2e/tests/canvas-mode-zoom-preserve.spec.ts`, `packages/axoview-e2e/tests/canvas-node-render.spec.ts`, `packages/axoview-e2e/tests/viewport.spec.ts`

**Asserted behaviors:**
- J19: ToolMenu button toggles ISOMETRIC <-> 2D <-> ISOMETRIC
- Zoom % survives an iso<->2D switch and round-trip; center tile preserved
- ISOMETRIC and 2D: selecting must not move the node; a click on the icon selects it (render == DOM/hit-test)
- ISOMETRIC: labelled node paints its dotted label stalk on the canvas
- Arrow keys pan scroll.position in all four directions
- canvas-zoom-in / canvas-zoom-out buttons adjust zoom in opposite directions
- Fit-to-view after zoom+pan returns zoom to a fit-driven (different) value

**Conspicuous gaps:**
- Mouse-wheel zoom anchoring at the cursor position
- Zoom clamp bounds via buttons/wheel (only touch pinch asserts [0.1,1])
- Fit-to-view exact framing (all items visible) — only 'value changed' asserted
- Projection mode persistence across reload
- 2D label stalk rendering parity

### Layers

**Files:** `packages/axoview-e2e/tests/layers.spec.ts`, `packages/axoview-e2e/tests/layers-multiselect.spec.ts`, `packages/axoview-e2e/tests/preview-layer-switcher.spec.ts`

**Asserted behaviors:**
- J6: drag item onto a new layer; hiding the layer flips its visible flag
- J6: locking the assigned layer prevents drag in CURSOR mode
- J6: a locked layer strips the selected element's transform handles
- J6: a node on the ONLY hidden layer stops painting, repaints on re-toggle
- KR4: dragging ONE row of a multi-selection assigns the WHOLE selection to the layer
- KR3: canvas Ctrl-multi-select highlights matching panel rows
- View-mode layer switcher renders only in view mode with >=2 layers; toggle + solo are UI-only and non-dirty
- Global hide-labels toggle hides name labels live; UI-only, non-dirty, persists across mode switches

**Conspicuous gaps:**
- Layer rename, delete, and reorder
- Layer visibility/lock state round-trip through save/reload and export
- Assign-to-layer via context menu (only panel drag covered)
- Locked layer vs Delete key, lasso capture, and Ctrl+A
- Which layer NEW items land on (active-layer semantics)
- Hidden-layer items vs export image output

### Touch

**Files:** `packages/axoview-e2e/tests/touch-drag-move.spec.ts`, `packages/axoview-e2e/tests/touch-lasso-select.spec.ts`, `packages/axoview-e2e/tests/touch-longpress.spec.ts`, `packages/axoview-e2e/tests/touch-palette-drag.spec.ts`, `packages/axoview-e2e/tests/touch-pinch-zoom.spec.ts`, `packages/axoview-e2e/tests/touch-resize.spec.ts`, `packages/axoview-e2e/tests/touch-tap-select.spec.ts`, `packages/axoview-e2e/tests/touch-tap-vs-pan.spec.ts`

**Asserted behaviors:**
- One-finger drag starting on a node moves it toward the drop; no corner jump
- One-finger drag in LASSO mode selects the enclosed node (does not pan)
- Long-press on a node opens its context menu and selects it
- Long-press on empty then drag does a marquee lasso select
- Press palette icon, drag onto canvas, release -> node placed
- PLACE_ICON preview ghost tracks the finger during the drag
- Pinch out zooms in, pinch in zooms out, clamped to [0.1, 1]
- Dragging a corner transform handle resizes the rectangle (does not pan)
- Tap a node selects it; tap empty clears selection
- One-finger drag on empty canvas pans and does not select

**Conspicuous gaps:**
- Drawing a connector by touch
- Double-tap to inline-edit/rename (label, textbox)
- Touch text editing with the on-screen keyboard
- Two-finger pan (vs pinch) discrimination
- Long-press on a connector or floating label
- Touch drag onto an occupied tile (collision) and touch off-grid sub-tile moves
- Touch interactions in view/presenter mode

### Import / export / custom icons

**Files:** `packages/axoview-e2e/tests/import-export-json.spec.ts`, `packages/axoview-e2e/tests/import-export-zip.spec.ts`, `packages/axoview-e2e/tests/import-export-image.spec.ts`, `packages/axoview-e2e/tests/import-error.spec.ts`, `packages/axoview-e2e/tests/icons.spec.ts`

**Asserted behaviors:**
- J7: import a JSON diagram from the empty-state Import button
- J8: export current diagram as JSON; downloaded file round-trips
- J9: import a project ZIP from the empty-state Import button
- J10: export project ZIP downloads; re-import round-trips into a clean session
- Malformed-JSON import surfaces ImportErrorDialog; dismiss leaves the tree empty
- #9: Download as SVG produces a valid, parseable SVG file
- #18: high-DPI selection export still yields a preview, never blank
- #19: 'Show labels' is an explicit export option
- #10: canvas-drawn icon nodes are present in the export PNG, not just connectors
- J11: import a custom icon and drop it on the canvas
- J12: deleting an in-use custom icon surfaces a usage warning and removes it

**Conspicuous gaps:**
- Corrupt/invalid ZIP import error path (only bad JSON covered)
- Import into a NON-empty session (merge/replace semantics)
- Export PNG dimensions/scale options
- Export honoring hidden layers and off-grid offsets (visual fidelity)
- JSON schema-version migration on import of older files
- Custom icon that is malformed/oversized; icon persistence in ZIP round-trip

### Share + Drive display

**Files:** `packages/axoview-e2e/tests/share.spec.ts`, `packages/axoview-e2e/tests/share-error.spec.ts`, `packages/axoview-e2e/tests/drive-display.spec.ts`

**Asserted behaviors:**
- J13: /display/p/<fake-uuid> in Local mode shows share-error dialog; dismissing strips the URL
- J14: share popover stays open on inside-click; Copy writes URL to clipboard; incognito context renders the readonly view (mocked backend)
- Failing share POST from the file-tree surfaces ShareErrorDialog; 'Try again' recovers on success
- Dismissing ShareErrorDialog closes it without retrying
- Drive public-proxy rung renders the diagram read-only (canvas + View-Only chip, no editor chrome)
- drivePublicPreview:false + unreadable file lands the sign-in gate, never LocalModeShareError
- Trashed Drive file -> proxy 410 -> 'could not open', NOT the sign-in gate
- Transient upstream failure -> proxy 503 -> Retry, NOT the sign-in gate (anonymous)
- ?resourceKey=<rk> rides the proxy request as a query param

**Conspicuous gaps:**
- Re-sharing the same diagram (same UUID vs new link)
- Share link revocation/expiry
- Interactions inside the shared readonly view (zoom/pan/layer switching)
- Signed-in (OAuth) Drive rung — only the anonymous proxy path is tested
- Sharing a diagram that links to other diagrams (link behavior in shared view)

### Save + error dialogs

**Files:** `packages/axoview-e2e/tests/save-error.spec.ts`

**Asserted behaviors:**
- A failing save write shows SaveErrorDialog; dismiss leaves the editor intact
- 'Try again' re-runs the save and the dialog closes once the write succeeds

**Conspicuous gaps:**
- localStorage quota-exceeded specific path
- Autosave / dirty indicator behavior
- Unsaved-changes warning when navigating away or switching diagrams

### Dialogs / settings / help / diagnostics

**Files:** `packages/axoview-e2e/tests/dialogs.spec.ts`

**Asserted behaviors:**
- J16: Settings dialog opens, renders the expected tab list, closes via Escape and close button
- J17: Help dialog opens via dock + F1, lists the B-4 canonical shortcuts, closes cleanly
- J18: diagnostics toggle shows the performance overlay; overlay x button hides it

**Conspicuous gaps:**
- Any settings VALUE change taking effect (only shell/tab-list is asserted; snap toggle is tested separately in snap-grid.spec)
- Per-tab settings content
- Dialog focus trap / keyboard navigation

### File explorer / diagram management

**Files:** `packages/axoview-e2e/tests/rename.spec.ts`, `packages/axoview-e2e/tests/file-explorer-delete.spec.ts`, `packages/axoview-e2e/tests/file-explorer-new-folder.spec.ts`

**Asserted behaviors:**
- J4: F2 renames the diagram; new name persists across reload
- J4: Escape during inline rename preserves the original name
- Right-click + Delete + confirm removes the diagram row
- Right-click on EMPTY tree space opens the same menu for the open diagram
- Empty-space menu: New folder creates at root via the inline name input
- New-folder button + typing name + Enter creates a folder row

**Conspicuous gaps:**
- Dragging a diagram into/out of a folder
- Folder rename and folder delete (incl. non-empty folder)
- Deleting the currently-open diagram (what the editor shows after)
- Duplicate diagram/folder names
- Creating a NEW diagram from the explorer while one is open

### Multi-diagram links + element links

**Files:** `packages/axoview-e2e/tests/multi-diagram.spec.ts`, `packages/axoview-e2e/tests/element-link-card.spec.ts`

**Asserted behaviors:**
- J5.1: link picker filters out the current diagram from options
- J5.2: open-linked-diagram swaps the editor onto DiagramB (no URL change)
- J5.3: NodePanel link in readonly preview navigates to /display/<linkedDiagramId>
- J5.4: Back-to-editing on the readonly toolbar returns to the editor
- J5.5: opening a different diagram clears the right-sidebar item controls
- Floating Label: Ctrl+K mid-rename opens the inline card; Enter applies headerLink
- Strip Link popover (element mode): Enter confirms and closes
- Unselected canvas-painted node with headerLink renders link-styled; hover raises the card

**Conspicuous gaps:**
- Link to a diagram that is later DELETED (broken link)
- Circular diagram links (A->B->A)
- Removing/clearing an existing diagram link
- headerLink survival through export/import round-trips

### View / presenter mode

**Files:** `packages/axoview-e2e/tests/view-mode-info-popover.spec.ts`, `packages/axoview-e2e/tests/presenter-hover-notes.spec.ts`

**Asserted behaviors:**
- Pinned popover shows name + clickable headerLink + notes; X and Esc close it
- Hovering an item shows an unpinned preview; moving away closes it
- Rectangle and textbox with notes show the popover (notes parity)
- Floating-label chip shows its notes; an OFFSET chip anchors the popover at the chip
- Popover side-anchors RIGHT of the item; flips LEFT near the right viewport edge
- Presenter hover popover appears only when the node has notes

**Conspicuous gaps:**
- Connector notes popover in view mode
- Popover behavior while zoomed far out / during pan
- Assertion that view mode strips ALL editing affordances (only toolbar Back tested)
- Keyboard access to popovers

### Annotation overlay

**Files:** `packages/axoview-e2e/tests/annotation-overlay.spec.ts`

**Asserted behaviors:**
- Pen toggles the palette; pencil draws a stroke; undo/redo strokes; close hides+retains; select tool is pass-through; clear wipes
- Drawn strokes never enter the saved model (model JSON contains no annotation/strokes)
- Group fly-outs select variants (Draw -> highlighter, Shapes -> ellipse)
- In preview mode a left-drag draws and does NOT pan the canvas

**Conspicuous gaps:**
- Eraser tool
- Stroke color/width options
- Annotation retention across projection toggle and diagram switch
- Annotation drawing via touch

### Context menu scoping

**Files:** `packages/axoview-e2e/tests/contextmenu-scope.spec.ts`

**Asserted behaviors:**
- Off-canvas right-click keeps its native browser menu (no preventDefault)
- Right-click over a canvas node is swallowed by the window-bound listener (positive control)

**Conspicuous gaps:**
- Menu ITEM contents per element type (beyond zIndex, Unsnap, Delete paths tested elsewhere)
- Menu dismissal on scroll/zoom/click-away
- Context menu near viewport edges (flip/clamp)

### Bulk styling

**Files:** `packages/axoview-e2e/tests/bulk-style.spec.ts`, `packages/axoview-e2e/tests/cross-type-label-size.spec.ts`

**Asserted behaviors:**
- Bulk font-size stepper bumps every selected node in ONE undo entry
- Label-size bump on mixed node + connection selection changes both in ONE undo

**Conspicuous gaps:**
- Bulk color/style changes
- Bulk styling including rectangles/textboxes/labels in the mix
- Redo of a bulk style entry
- Style copy between elements (format painter)

### Toolbar layout

**Files:** `packages/axoview-e2e/tests/toolbar-overflow.spec.ts`

**Asserted behaviors:**
- Groups 3+4 stay reachable at every viewport width; the style slot absorbs the squeeze by scrolling

**Conspicuous gaps:**
- Toolbar button enable/disable state vs selection type
- Toolbar behavior in touch viewports

### Performance

**Files:** `packages/axoview-e2e/perf/engine-perf.spec.ts`, `packages/axoview-e2e/perf/perf.config.ts`

**Asserted behaviors:**
- Engine perf baseline: bulk-spawn + drag across N items (separate perf config, not a functional gate)

**Conspicuous gaps:**
- Perf thresholds that FAIL the suite on regression
- Zoom/pan frame-rate measurement
- Large-diagram load time

### Test scaffolding (POM / helpers / fixtures)

**Files:** `packages/axoview-e2e/pom/AppToolbarPOM.ts`, `packages/axoview-e2e/pom/CanvasPOM.ts`, `packages/axoview-e2e/pom/DiagramLinkPOM.ts`, `packages/axoview-e2e/pom/DialogsPOM.ts`, `packages/axoview-e2e/pom/EmptyStateScreenPOM.ts`, `packages/axoview-e2e/pom/FileExplorerPOM.ts`, `packages/axoview-e2e/pom/HelpDialogPOM.ts`, `packages/axoview-e2e/pom/LayersPanelPOM.ts`, `packages/axoview-e2e/pom/SettingsDialogPOM.ts`, `packages/axoview-e2e/pom/TouchPOM.ts`, `packages/axoview-e2e/pom/_pending.md`, `packages/axoview-e2e/helpers/offGrid.ts`, `packages/axoview-e2e/helpers/place.ts`, `packages/axoview-e2e/helpers/projectZip.ts`, `packages/axoview-e2e/helpers/selectors.ts`, `packages/axoview-e2e/helpers/store.ts`, `packages/axoview-e2e/fixtures/app.fixture.ts`

**Asserted behaviors:**
- AppToolbarPOM: save (click + hotkey), export menu (JSON/ZIP/image), share popover (open/close/url/copy), preview + back-to-editing
- CanvasPOM: synthetic dispatchAt/clickAt/dragFromTo on the interactions layer; rectangle-mode switch; textbox place/commit/dismiss; label placement; canvas-mode toggle; tileToScreen coordinate mapping
- DiagramLinkPOM: link popover, picker options list, select linked diagram, open-linked-diagram
- DialogsPOM: ZIP-export confirm, import-icons confirm, delete-icon confirm, LocalModeShareError, SaveError (dismiss/retry), ImportError, ShareError (dismiss/retry)
- EmptyStateScreenPOM: create/import buttons + create-card-top click
- FileExplorerPOM: open panel, row by name+type, select row, renameDiagram, rename input
- HelpDialogPOM + SettingsDialogPOM: open via trigger, shortcut-row / tab locators, close via button or Escape
- LayersPanelPOM: addLayer, layer/item row locators, dragItemToLayer, toggleVisibility, toggleLock
- TouchPOM: tapTile/tapPoint, dragAbsolute, dragOneFinger, hold, holdThenDrag, pinch (CDP touch)
- helpers/offGrid: getOffGridItems, setSnapToGrid, getContextMenu, getHoveredItemId, drawnClientPoint, realDrag, placeIconRealMouse, closeElementsPanel, hoverAt
- helpers/place: placeIconViaMouse, clearCanvasForTouch
- helpers/projectZip: buildSampleProjectZip, parseProjectZip, SAMPLE_PROJECT_FIXTURE
- helpers/selectors: byAxoviewId (data-axoview-id), byLibTestId
- helpers/store: __axoview__ debug-bridge readers — uiMode, scroll, zoom, itemControls, model item/connector counts, view rectangle/textbox/item counts, model history length, waitForDebugBridge
- fixtures/app.fixture: appTest + canvasReadyTest (AppPage with dismissHintTooltips); JSON fixtures sample-diagram, invalid-diagram, view-mode-info-diagram
- pom/_pending.md: running register of every data-axoview-id retrofit and its motivating spec (ADR 0008 Decision 5)

**Conspicuous gaps:**
- No ConnectorPOM (connector specs use raw dispatch + store helpers)
- No ContextMenuPOM (each spec locates menu items ad hoc via offGrid.getContextMenu)
- No PropertiesDock / right-sidebar POM
- No annotation-overlay POM
- No keyboard-only navigation helpers

## Unit / integration coverage (Jest, all workspaces)

### Backend (Express/Docker) storage + share API

**Files:** `packages/axoview-backend/src/__tests__/routes.diagrams.spec.js`, `packages/axoview-backend/src/__tests__/routes.folders.spec.js`, `packages/axoview-backend/src/__tests__/routes.share.spec.js`, `packages/axoview-backend/src/__tests__/routes.config.spec.js`, `packages/axoview-backend/src/__tests__/routes.tree-manifest.spec.js`, `packages/axoview-backend/src/__tests__/HttpError.spec.js`, `packages/axoview-backend/src/__tests__/adapters/fs.spec.js`, `packages/axoview-backend/src/__tests__/helpers/memoryAdapter.js`

**Asserted behaviors:**
- fs adapter: get returns null on absent key, round-trips bytes, rejects invalid keys (KEY_PATTERN), propagates non-ENOENT I/O errors
- fs adapter put: atomic write (no .tmp residue), creates parent dirs, overwrites, last-writer-wins on sequential same-key puts (ADR 0010 D7)
- fs adapter delete idempotent on missing key; list returns [] on missing dir, prefixed keys, root files on empty prefix
- listDiagramMeta: skips reserved keys, mtime fallback for lastModified, skips unparseable JSON, name fallback chain data.name→title→'Untitled Diagram'
- diagrams CRUD: list excludes reserved keys, get 404/400, create auto-id vs caller id, 409 on duplicate id, distinct ids on rapid bursts (MQA #21)
- saveDiagram PUT-semantics create-if-missing + lastModified refresh; patchDiagram merges keeping id, 404/400
- moveDiagram sets/nulls folderId, 404/400 incl. invalid targetFolderId
- deleteDiagram cascades to public/<uuid> snapshot when shareUuid set, ignores malformed shareUuid
- folders: list handles array shape, legacy {folders:[]} coercion, parentId filter, unexpected-shape fallback
- createFolder/renameFolder/moveFolder/deleteFolder validation (400 name/parentId/id), 404 missing, recursive delete sweeps descendants + orphan diagrams + share-snapshot cascade (MQA #14), boolean|string 'true' recursive flag
- shareDiagram: new uuid+snapshot, reuse valid uuid without touching lastModified, regenerate malformed uuid, snapshot field defaults + non-array coercion to [], fitToScreen honoured
- unshareDiagram: removes snapshot + strips shareUuid + refreshes lastModified, no-op success without shareUuid, malformed uuid skips cascade
- getPublicSnapshot: 404 missing, 400 on uuid <21 / >64 chars / disallowed chars
- getConfig: documented default shape, env reflection, drivePublicPreview always false + no raw key on Express (ADR 0042 §8), serverStorage default true, survives null ctx
- tree-manifest get/save with {folders:[]} default
- HttpError string→{error} body + status; object body pass-through; default message fallback

**Conspicuous gaps:**
- routes.js Express wiring itself (middleware order, JSON body limits, error handler) is untested — only the extracted route handler functions are exercised against the in-memory adapter

### Cloudflare Worker API + auth

**Files:** `packages/axoview-worker/src/__tests__/app.spec.ts`, `packages/axoview-worker/src/__tests__/authMiddleware.spec.ts`, `packages/axoview-worker/src/__tests__/cfAccessJwt.spec.ts`, `packages/axoview-worker/src/__tests__/isPublicRoute.spec.ts`

**Asserted behaviors:**
- GET /api/config defaults + env reflection; drivePublicPreview reflects GOOGLE_API_KEY presence without exposing key (ADR 0043 #3); serverStorage hardcoded false (storage-less Worker)
- /api/public/drive/:fileId proxy: 503 no key, 400 malformed id, 200 metadata-then-content with SERVER key, 410 trashed (body never read), 404 not-public, 503 on transient 5xx/429, 413 over size cap, resourceKey forwarded as header, bypasses shared-token auth
- /api/* catch-all 503 sink; public diagrams namespace cutout still 503; auth (401) fires before 503 sink; config bypasses auth
- secureHeaders present on success and error paths; non-/api routes 404; onError logs method+path+errorName and returns JSON 500
- probe-fingerprint matrix: api probes → 503 (or 401 in shared-token), non-api probes → 404, no 500 leak
- authMiddleware: public-route bypass in every mode; mode none default; shared-token exact Bearer match, 401 on mismatch/missing/non-Bearer/empty token, 500 on missing secret; cf-access 500 on missing team domain/aud, 401 on missing/malformed/undecodable JWT; unknown mode 500
- verifyCfAccessJwt: valid sig true, foreign-key/tampered false, unknown kid false, expired exp false (injected clock), aud mismatch short-circuits, aud array accepted, iss strict equality (substring rejected), absent iss/exp false
- isPublicRoute: GET-only /api/config; diagram uuid 21–64 char bounds and charset; drive fileId 10–120 bounds; non-GET methods private; trailing segments rejected; all other routes private

### App storage providers, transfer & storage context

**Files:** `packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts`, `packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.test.ts`, `packages/axoview-app/src/services/storage/__tests__/driveTransfer.test.ts`, `packages/axoview-app/src/services/storage/__tests__/backendRoutes.contract.test.ts`, `packages/axoview-app/src/providers/__tests__/AppStorageContext.test.tsx`

**Asserted behaviors:**
- LocalStorageProvider: list/save/create/delete/move REST bodies, sessionStorage fallback when server down, soft delete = PATCH deletedAt vs hard DELETE, session rename syncs blob.title+name and tolerates corrupt blob
- LocalStorageProvider lean-save: strips pack icons keeping imported ones (ADR 0003), derives requiredPacks from items×icons, preserves requiredPacks on already-lean input
- GoogleDriveProvider: Drive file→DiagramMeta mapping excl. manifest, media GET/PATCH, create-in-root, trash-not-delete, moveItem parent swap, nextPageToken drain
- GoogleDriveProvider errors: 401→SESSION_EXPIRED, 503 retried then success, retry exhaustion, permanent 403 fail-fast with Google's message, rate-limit 403 retried, token only via getValidToken (unauth throws pre-fetch)
- GoogleDriveProvider root: adopts existing marker folder, not-configured when absent, configureRoot adopts+renames vs creates
- driveTransfer move: create-on-Drive-then-delete order, failed create keeps source, folder path recreation with reuse, explicit target skips recreation, name-collision copy suffix, source id stripped
- backendRoutes.contract greps routes.js for random-suffix + collision-check id generation (MQA #21)
- AppStorageProvider issues a single /api/config probe and derives mode from serverStorage flag

**Conspicuous gaps:**
- packages/axoview-app/src/services/storage/StorageManager.ts — zero tests (provider selection/failover orchestration)
- packages/axoview-app/src/services/storage/leanModel.ts — zero tests
- packages/axoview-app/src/services/iconPackManager.ts and iconUsage.ts — zero tests

### App Google Drive services (picker, public read, sharing)

**Files:** `packages/axoview-app/src/services/drive/__tests__/drivePicker.test.ts`, `packages/axoview-app/src/services/drive/__tests__/drivePublicRead.test.ts`, `packages/axoview-app/src/services/drive/__tests__/driveSharing.test.ts`, `packages/axoview-app/src/services/drive/__tests__/gapiLoader.test.ts`, `packages/axoview-app/src/services/drive/__tests__/recentShareEmails.test.ts`

**Asserted behaviors:**
- drivePicker: typed 'unavailable'/'no-token'/'load-failed' rejections, appId/token/key/fileIds wiring, PICKED-different-file → cancelled (wrong grant), CANCEL → cancelled
- drivePublicRead ladder: proxy-first then Bearer token rung; publicPreview=false skips proxy; afterGrant skips proxy; 410/413 terminal not-found (no token rung); proxy 503 → transient Retry for anonymous viewer (never sign-in gate); signed-out + no preview → needs-signin with zero fetches
- drivePublicRead resourceKey rides proxy URL and token header; failure map: 403/404→needs-grant, post-grant 404→not-found, 401→needs-signin + arms auth expiry, 403 rateLimit→transient, 5xx/network→transient
- driveSharing: preview URL building (origin+basename+/display/drive/<id>, encoded resourceKey), share-meta fetch + DriveShareError surfacing, permission list pagination drain, anyone-with-link summary/overview mapping, enable/disable anyone permission, add person (role/notify/emailMessage variants), policy-rejection empty-message fallback, remove 404-as-success, every call rejects when signed out
- gapiLoader resolves on callback, passes config object, rejects (never hangs) on onerror/ontimeout
- recentShareEmails: MRU order, case-insensitive dedupe, blank trim, cap 20, tolerates corrupt storage

### App auth + notification stores

**Files:** `packages/axoview-app/src/stores/__tests__/authStore.test.ts`, `packages/axoview-app/src/stores/__tests__/notificationStore.test.ts`

**Asserted behaviors:**
- authStore signIn state machine incl. AUTHENTICATING→AUTHENTICATED, denial→UNAUTHENTICATED + info notice, stuck-request timeout recovery
- granular consent: driveScopeGranted tracks actually-granted scopes, grantDriveAccess re-consents with prompt:consent, markDriveScopeMissing parks session, identity-only reconnect shows dialog + forgets account, scope-less legacy GIS shape no false alarm
- token lifecycle: never persisted to localStorage, getValidToken healthy/near-expiry silent refresh/null-when-unauth, failed refresh → SESSION_EXPIRED + persistent notice, markExpired exactly-once and settles in-flight refresh
- signOut clears+revokes, settles in-flight refresh, late grant cannot resurrect session
- silent reconnect: profile hint persisted (identity only) and cleared on signOut, RECONNECTING→AUTHENTICATED, quiet degradation (no toast, hint kept), getValidToken piggybacks on in-flight reconnect, late reconnect error cannot cancel interactive signIn (single-error absorption)
- notificationStore: id generation, severity autoDismiss defaults (success 3s / info 4s / error+warning sticky), explicit override, dismiss/dismissAll, max-3-visible queue with drain

**Conspicuous gaps:**
- packages/axoview-app/src/stores/diagnosticsStore.ts — zero tests

### App project ZIP import/export

**Files:** `packages/axoview-app/src/services/project/__tests__/projectZip.test.ts`

**Asserted behaviors:**
- export→import round-trip identical modulo IDs (ADR 0001); export carries zero annotation data (ADR 0014)
- rewriteIds rewrites folder parentId chains + diagram folderIds
- importProject replaceAll wipes workspace first; failed parse leaves storage untouched
- parseProject typed errors: BAD_ZIP, NO_MANIFEST, BAD_FORMAT, UNSUPPORTED_VERSION, MISSING_DIAGRAM
- export scopes: folder subtree only, single diagram with no folders
- legacy 'fossflow-project' format accepted and importable; new exports emit 'axoview-project' + filename prefix; unknown formats still rejected

### App utils, runtime config & shell components/dialogs

**Files:** `packages/axoview-app/src/utils/__tests__/fileOperations.test.ts`, `packages/axoview-app/src/utils/__tests__/migrationShim.test.ts`, `packages/axoview-app/src/utils/__tests__/shareUrl.test.ts`, `packages/axoview-app/src/hooks/__tests__/useRuntimeConfig.test.ts`, `packages/axoview-app/src/components/__tests__/DiagnosticsOverlay.helpers.test.ts`, `packages/axoview-app/src/components/__tests__/DriveAccessRequiredDialog.test.tsx`, `packages/axoview-app/src/components/__tests__/DriveShareManageDialog.test.tsx`, `packages/axoview-app/src/components/__tests__/EmptyStateScreen.test.tsx`, `packages/axoview-app/src/components/__tests__/ImportErrorDialog.test.tsx`, `packages/axoview-app/src/components/__tests__/SaveErrorDialog.test.tsx`, `packages/axoview-app/src/components/__tests__/ShareErrorDialog.test.tsx`, `packages/axoview-app/src/components/fileExplorer/__tests__/delete.contract.test.ts`, `packages/axoview-app/scripts/__tests__/generateMaterialIconPack.test.ts`

**Asserted behaviors:**
- fileOperations: sequentialName suffix increment, copySuffix ' - Copy (n)', sanitizeName illegal chars/trim/'Untitled' fallback, case-sensitive collision detect, countDescendants nested, propagateDirty folder rollup
- migrationShim: fossflow_*→axoview_* local+session key copy+delete, run-once, never overwrites existing new key, ignores unrelated keys
- shareUrl anchored to window origin under /app base, never leaks backend port 3001 (MQA #24)
- useRuntimeConfig: default on fetch reject, drivePublicPreview+projectNumber reflection without raw key, PUBLIC_ build-time fallback when backend nulls, ~1s AbortSignal timeout fallback, cross-call caching
- DiagnosticsOverlay helpers: fps colour bands, 300-event ring buffer, AI/human report builders, scene-delta/fps-hysteresis/long-task/gc/memory/zoom/view/undo-redo/drag event detectors, scene-count + UI + history snapshot readers with no-bridge defaults
- error dialogs (Import/Save/Share): closed renders nothing, headline+body, primary/secondary action routing, Escape/backdrop → onDismiss, data-axoview-id contract hooks
- DriveAccessRequiredDialog hidden while healthy, blocks with grant/cancel; DriveShareManageDialog owner row non-removable, add/remove permission flows, viewer-link invite, copy preview URL, inline load error, no write when reflecting existing anyone-grant, autocomplete history
- EmptyStateScreen: POM data-axoview-id contract, single interactive card (no nested button), accessible name, create/import click targets, /privacy + /terms links
- delete-current-diagram contract (MQA #18): notifyDiagramDeletedFromTree exists on context, cancels autosave + clears scratch, called before storage delete in FileExplorer and DiagramManager (source-grep contract)
- generateMaterialIconPack: >1000 icons, required fields, non-empty unique ids, valid svg data URLs

**Conspicuous gaps:**
- packages/axoview-app/src/hooks/useAutoSave.ts and useFileTree.ts — zero tests (autosave debounce/dirty logic, tree building)
- packages/axoview-app/src/providers/DiagramLifecycleProvider.tsx and AuthProvider.tsx — only source-grep contract tests, no behavioral tests of load/save/dirty lifecycle
- packages/axoview-app/src/components/DiagramManager.tsx and fileExplorer/FileExplorer.tsx, FileTreeNode.tsx, FileTreeToolbar.tsx, ImportDialog.tsx, ContextMenuItems.tsx, ExportProjectZipDialog.tsx, SessionStorageGauge.tsx — zero behavioral tests (rename/move/DnD/context menus)
- app shell components with zero tests: AppToolbar.tsx, AuthControl.tsx, ErrorBoundary.tsx, LoadDialog.tsx, SaveDialog.tsx, ExportPopover.tsx, ExportSingleDiagramDialog.tsx, MigrateSessionDialog.tsx, DriveDisplayGate.tsx, DriveSetupGate.tsx, DriveRootFolderDialog.tsx, NotificationStack.tsx, StatusCluster.tsx, LocalModeBanner.tsx, LocalModeShareErrorDialog.tsx, PublicShareLoadErrorDialog.tsx, ReadonlyLoadErrorDialog.tsx, ConfirmDialog.tsx, NotFound.tsx
- packages/axoview-app/src/utils/apiBaseUrl.ts, authDebug.ts, bootScreen.ts, downloadBlob.ts, isoGridBackground.ts — zero tests; also diagramUtils.ts, appBase.ts, serviceWorkerRegistration.ts

### Lib zod schemas + model validation

**Files:** `packages/axoview-lib/src/schemas/__tests__/colors.test.ts`, `packages/axoview-lib/src/schemas/__tests__/connector.test.ts`, `packages/axoview-lib/src/schemas/__tests__/icons.test.ts`, `packages/axoview-lib/src/schemas/__tests__/label.test.ts`, `packages/axoview-lib/src/schemas/__tests__/layer.test.ts`, `packages/axoview-lib/src/schemas/__tests__/modelItems.test.ts`, `packages/axoview-lib/src/schemas/__tests__/notes.test.ts`, `packages/axoview-lib/src/schemas/__tests__/offGridRoundTrip.test.ts`, `packages/axoview-lib/src/schemas/__tests__/rectangle.test.ts`, `packages/axoview-lib/src/schemas/__tests__/textBox.test.ts`, `packages/axoview-lib/src/schemas/__tests__/validation.test.ts`, `packages/axoview-lib/src/schemas/__tests__/views.test.ts`

**Asserted behaviors:**
- connector: anchor ref optionality (tile-only, empty, item+tile no exclusivity guard documented), label fontSize 8–40 bound, labelColor, headerLink ≤2048, name ≤200, notes ≤50000, nameSeeded marker round-trip, 0/1 anchors allowed at schema level, anchors array cap (import-DoS, ADR 0029)
- label schema: first-class fields round-trip (ADR 0031), backgroundOpacity [0,1], lean omission of styling, headerLink optional, retired variant/content fields stripped
- modelItems: headerLink ≤2048 boundary incl. exactly-2048, on-canvas label optional/distinct/empty-hides-chip (ADR 0032), items array cap
- views/viewItem: labelColor/zIndex integer/layerId optionality, off-grid offset/snap/collides round-trip + lean omission (ADR 0023), iconScale [0.1,3] bounds (ADR 0044), layers field optional + invalid layer rejected, items array cap
- rectangle/textBox: off-grid fields, zIndex integer, fill/border opacity [0,1], ADR 0034 text-styling fields, unbounded-geometry S1-brick guard, borderStyle/verticalAlign enum rejection
- notes field parity across rectangle/textBox/label (separate from content/text, optional)
- off-grid export/import round-trip: preserves snap/collides/offset; legacy diagrams default snapped/colliding; saved snap=false survives
- cross-reference validation: connector anchor→invalid item/anchor fails, <2 anchors fails, cross-connector anchor ref passes, invalid color refs fail, modelSchema title required
- colors/icons/layers: required-field failures, array element validation, round-trips

### Lib store reducers + zustand stores

**Files:** `packages/axoview-lib/src/stores/reducers/__tests__/connector.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/label.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/layer.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/modelItem.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/rectangle.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/textBox.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/view.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/viewItem.test.ts`, `packages/axoview-lib/src/stores/reducers/__tests__/viewReducers.branches.test.ts`, `packages/axoview-lib/src/stores/__tests__/sceneStore.test.ts`, `packages/axoview-lib/src/stores/__tests__/zustand.deprecation.test.ts`

**Asserted behaviors:**
- connector reducer: delete from model+scene, syncConnector writes computed path and stores empty path (never throws) on getConnectorPath error, updateConnector re-syncs only on anchor change, createConnector unshifts + scene entry, throw-on-missing, input immutability
- label reducer model-only (no scene entry), array init, update preserves others, delete isolation, throws on missing
- layer reducer: create order=length, update name/visible/locked, unknown-id no-op, delete unassigns layerId from items+connectors, reorderLayers positional, assignLayerToItems set/unset, reorderViewItem zIndex
- modelItem: add/update/delete, no double-write, sparse-array delete pin (length unchanged, documented current behavior)
- rectangle/textBox reducers: create (array init, full property set), partial update preservation, sync-to-scene triggers (content/fontSize yes, color no), delete isolation, throw-on-missing, immutability, multi-op sequences
- viewItem: delete cascades associated connectors (only referencing ones, shared-connector dedupe in batch delete), tile-position update refreshes connectors, view validation on create/update
- view reducer + dispatcher: CRUD, VIEW_DEFAULTS, lastUpdated timestamp set on mutating actions but skipped for SYNC_SCENE/DELETE_VIEW, syncScene calls syncConnector/syncTextBox per entity
- sceneStore history: canUndo/canRedo, undo/redo move entries between past/future, skipHistory, future cleared on new change, 50-entry cap, clearHistory invalidates pendingPre, saveToHistory diff capture
- zustand deprecation guard: all three stores load without deprecated-API warning and use useStoreWithEqualityFn

**Conspicuous gaps:**
- packages/axoview-lib/src/stores/historySequence.ts — zero direct tests
- packages/axoview-lib/src/stores/localeStore.tsx — zero tests (translation lookup/namespace fallback)
- packages/axoview-lib/src/stores/uiStateStore.tsx — only indirectly tested via multiSelect.contract; most UI-state actions untested directly

### Lib geometry, coordinates, hit-testing & spatial utils

**Files:** `packages/axoview-lib/src/utils/__tests__/isoMath.test.ts`, `packages/axoview-lib/src/utils/__tests__/coordinateTransforms.test.ts`, `packages/axoview-lib/src/utils/__tests__/renderer.test.ts`, `packages/axoview-lib/src/utils/__tests__/renderOrder.test.ts`, `packages/axoview-lib/src/utils/__tests__/renderTarget.test.ts`, `packages/axoview-lib/src/utils/__tests__/pointInPolygon.test.ts`, `packages/axoview-lib/src/utils/__tests__/segmentIntersection.test.ts`, `packages/axoview-lib/src/utils/__tests__/spatialIndex.test.ts`, `packages/axoview-lib/src/utils/__tests__/findNearestUnoccupiedTile.test.ts`, `packages/axoview-lib/src/utils/__tests__/viewportCenterTile.test.ts`, `packages/axoview-lib/src/utils/__tests__/annotationGeometry.test.ts`, `packages/axoview-lib/src/utils/__tests__/resolvePlacement.test.ts`, `packages/axoview-lib/src/utils/__tests__/renderedGeometry.contract.test.ts`, `packages/axoview-lib/src/utils/__tests__/renderedGeometry.invariant.test.tsx`, `packages/axoview-lib/src/utils/__tests__/common.test.ts`, `packages/axoview-lib/src/utils/__tests__/immer.test.ts`

**Asserted behaviors:**
- isoMath: tile position origin offsets (CENTER/TOP/BOTTOM/LEFT/RIGHT), isoToScreen centring, grid subset, bounds inclusion (edge/reversed/single-tile), doBoundsOverlap incl. #16 middle-cross + touching, bounding box + offset expansion, iso matrix X/Y orientation + CSS, zoom inc/dec 0.05 clamped to [0.1,1] no float drift, connector direction icon rotations for all 8 headings, anchor-at-tile lookup, anchor parent throw
- coordinateTransforms: iso and 2D toScreen mappings + fromScreen inverse round-trips (known pixel→tile cases in both), fromCanvasPoint round-trip, getCanvasModeSwitchScroll keeps centre tile centred both directions + identity + zoom-0 degenerate, makeTilePositionFn 2D origin offsets, strategy metadata
- renderer utils: screenToIso across center/corner/zoom/scroll combos, getItemAtTile stacked-rectangle zIndex + newest-wins tiebreak, connector ±1 tolerance halo suppressed beside node endpoints but kept mid-line and at free endpoints, exact-match mode for click selection (#5)
- renderOrder: layer bucket > zIndex > isoDepth precedence, negative depth, findLayer lookups
- renderTarget/backingStore: dimension + area cap clamping, longest-side governs, zero/negative/non-finite normalisation, dpr clamp for 4K/8K high-DPI
- pointInPolygon ray-cast incl. degenerate <3 vertices and negative coords; screenPathToTilePath mapping; createSmoothPath M/L/Q/Z structure
- segmentIntersection: crossing/parallel/T-touch/collinear cases, segment-vs-rect (through/inside/endpoint/boundary/outside, corner order agnostic), segment-vs-polygon, 2026-05-25 lasso-crosses-connector regression
- TileIndex: occupancy, multi-id tiles, move/remove, inclusive bbox range with negatives, buildTileIndex skips non-colliding (ADR 0023), brute-force invariant after random ops
- findNearestUnoccupiedTile single + group: maxDistance respect, non-ITEM tiles free, rigid-stamp block relayout, paste-on-self shift, never stacks
- annotationGeometry: screen↔scene inverse, polyline path, arrowhead wings, rect normalisation, point-segment distance clamp, eraser hit incl. hollow rect interior miss + highlighter footprint
- resolvePlacement (ADR 0023): snap clears offset, unsnapped/global-off keep px offset (#20/#12), integer tile invariant, itemCollides defaults/implication/override, cursorTileResidual zoom division, connectorEndpointVertexDelta mode-aware inversion
- renderedGeometry: static contract — single offset-composition site, allowlist grep over repo; runtime invariant matrix per offset corpus — node paints/frames/hovers/hit-tests at tile+offset, label hit proxy, iso-ring chrome, WebGL rect corner parity with DOM, textbox + rectangle hit zones
- common: clamp, getColorVariant greyscale/hued dark variants; immer array equivalence sanity

**Conspicuous gaps:**
- packages/axoview-lib/src/utils/pathfinder.ts — zero tests (connector path routing algorithm)
- packages/axoview-lib/src/utils/hitDetection.ts — zero direct tests (only exercised indirectly through renderer.test getItemAtTile)
- packages/axoview-lib/src/utils/coordsUtils.ts, sizeUtils.ts, selectableRefs.ts, labelChip.ts, connectorLabels.ts, renderProbe.ts, tooltipWithShortcut.ts — zero tests

### Lib rich-text / HTML / sanitization utils

**Files:** `packages/axoview-lib/src/utils/__tests__/richTextTransform.test.ts`, `packages/axoview-lib/src/utils/__tests__/sanitizeHtml.test.ts`, `packages/axoview-lib/src/utils/__tests__/htmlToPlainText.test.ts`, `packages/axoview-lib/src/utils/__tests__/stripHtml.test.ts`, `packages/axoview-lib/src/utils/__tests__/quillLinkShortcut.test.ts`, `packages/axoview-lib/src/utils/__tests__/quillListAutofill.test.ts`, `packages/axoview-lib/src/utils/__tests__/isoMath.richtext.test.ts`, `packages/axoview-lib/src/utils/__tests__/foldTextBoxStyleFlags.test.ts`, `packages/axoview-lib/src/utils/__tests__/foldNodeDescription.test.ts`, `packages/axoview-lib/src/utils/__tests__/seedNodeLabel.test.ts`, `packages/axoview-lib/src/utils/__tests__/seedConnectorLabel.test.ts`

**Asserted behaviors:**
- richTextTransform: escape+wrap plain text, blank lines as <p><br></p>, whole-content format detection (only when entire content carries it, mixed lists rejected), inline apply/remove incl. synonym tags + round-trip, list conversion (paragraphs/plain/headers/re-type/unwrap), align apply/read (left=absent, keeps unrelated styles, mixed→null, survives list toggle), nbsp normalization
- sanitizeHtml: strips <script>/<svg onload>/inline handlers/img onerror, no executable tag after reassembly, preserves Quill formatting + text-align styles, forces rel=noopener noreferrer overriding attacker rel
- htmlToPlainText decode-only vs strip+decode paths: named/numeric entities, left-to-right decode, List<T> survives name path, A1 caption fix; stripHtmlTags fixpoint guard + idempotence
- quillLinkShortcut: https:// forgiveness on bare domains, scheme-preserving pass-through, null on blank, caret word-expansion (middle/end/start/whitespace/out-of-range clamp), Ctrl+K binding open/expand/whitespace-consume/selection fallback
- quillListAutofill: prefix regex matrix ('-','*','1.','12.','  -' match; '[ ]','a.','-x' etc. don't), space-key binding converts to bullet/ordered list undo-safely, mid-line no-op, unregistered-format propagation
- text metrics (isoMath.richtext): line-spacing 1.2 parity constant, weighted HTML line counting (p/li spacing override, legacy h1–h3 weights, li via wrapper), splitIntoMeasurableBlocks per-block scale+list indent + blank <p><br></p> retention, greedy word-wrap core incl. over-long word hard-break and zero-width guard, manual width/height (width verbatim + 1-tile floor, height as minimum never clips)
- migration folds: textbox style flags → wrapped HTML idempotently, node description → notes with separator idempotently, node/connector name → label seed (placement/style carry, legacy label migration, no re-seed, empty-label preservation, non-object pass-through)

### Lib persistence/export utils (lean save, model fix, SVG/image export)

**Files:** `packages/axoview-lib/src/utils/__tests__/leanSave.test.ts`, `packages/axoview-lib/src/utils/__tests__/model.test.ts`, `packages/axoview-lib/src/utils/__tests__/annotationPersistence.test.ts`, `packages/axoview-lib/src/utils/__tests__/exportOptions.test.ts`, `packages/axoview-lib/src/utils/__tests__/svgOptimizer.test.ts`, `packages/axoview-lib/src/components/ExportImageDialog/__tests__/waitForIconsDrawn.test.ts`

**Asserted behaviors:**
- stripDefaultIcons/mergeBundledFixtures: drops pure duplicates, preserves custom + overridden defaults, strip→merge round-trip, memoized fixture map (ADR 0002/0003)
- fixModel removes 0/1-anchor connectors across multiple views leaving valid ones, no mutation; modelFromModelStore maps required fields, excludes store-only fields and annotation data (ADR 0014)
- exportAsSVG: native SVG when toSvg succeeds, raster fallback on 'Failed to fetch', no cacheBust passed (deployed trigger)
- svgOptimizer: strips vendor/animation/will-change/logical/print/scroll props, preserves layout-critical + white-space + font-smoothing + locale, 2dp rounding of transform-only values (never width/height/inset/padding/font metrics), utf8ToBase64 unicode + lone-surrogate + large-string safety, unknown data-URL pass-through, display:none subtree pruning
- waitForIconsDrawn: never resolves while canvas absent (regression), resolves on drawn, false on timeout, immediate when already drawn

### Lib label/selection/visibility utils

**Files:** `packages/axoview-lib/src/utils/__tests__/labelPosition.test.ts`, `packages/axoview-lib/src/utils/__tests__/labelScale.test.ts`, `packages/axoview-lib/src/utils/__tests__/previewLabelVisibility.test.ts`, `packages/axoview-lib/src/utils/__tests__/previewLayerVisibility.test.ts`, `packages/axoview-lib/src/utils/__tests__/bulkStyleTarget.test.ts`, `packages/axoview-lib/src/utils/__tests__/connectorSelection.test.ts`

**Asserted behaviors:**
- labelPosition: above/below placement by offset sign with origin flip, CENTER -50% translate, zero-offset no stalk, offset clamping, drag → offset conversion scaled 1/zoom crossing zero, degenerate-zoom no-op
- labelScale counter-scale: off→1, above threshold→1, holds on-screen floor below threshold, maxCounterScale clamp, degenerate input guards, never shrinks
- preview label visibility: model showLabel authoritative when hide-labels off; hide-labels forces hidden in every mode
- preview layer visibility: base model visibility, hidden-set override, solo wins (reveals model-hidden, hides unassigned)
- bulk style gate (ADR 0030 §2): null for empty/single/heterogeneous selections, {type,ids} for homogeneous, selection order preserved
- connector selection refs: waypoint refs = tile-bound middles only (endpoints never), movement refs additionally include tile-bound endpoints, user-facing ref counting/filtering treats CONNECTOR_ANCHOR as implementation detail

### Lib interaction modes + keyboard/pan handlers

**Files:** `packages/axoview-lib/src/interaction/__tests__/Connector.test.ts`, `packages/axoview-lib/src/interaction/__tests__/Cursor.getAnchorOrdering.test.ts`, `packages/axoview-lib/src/interaction/__tests__/DrawRectangle.test.ts`, `packages/axoview-lib/src/interaction/__tests__/FreehandLasso.test.ts`, `packages/axoview-lib/src/interaction/__tests__/handleArrowKey.test.ts`, `packages/axoview-lib/src/interaction/__tests__/handleDeleteKey.test.ts`, `packages/axoview-lib/src/interaction/__tests__/handleEscapeKey.test.ts`, `packages/axoview-lib/src/interaction/__tests__/Label.test.ts`, `packages/axoview-lib/src/interaction/__tests__/PlaceIcon.test.ts`, `packages/axoview-lib/src/interaction/__tests__/TextBox.test.ts`, `packages/axoview-lib/src/interaction/__tests__/toolHotkeys.test.ts`, `packages/axoview-lib/src/interaction/__tests__/TransformNode.test.ts`, `packages/axoview-lib/src/interaction/__tests__/TransformRectangle.test.ts`, `packages/axoview-lib/src/interaction/__tests__/usePanHandlers.test.ts`, `packages/axoview-lib/src/interaction/__tests__/usePanHandlers.offGridMenu.test.ts`, `packages/axoview-lib/src/interaction/modes/__tests__/Lasso.intersection.test.ts`, `packages/axoview-lib/src/interaction/modes/__tests__/lassoDragParity.test.ts`, `packages/axoview-lib/src/interaction/modes/__tests__/TransformTextBox.test.ts`

**Asserted behaviors:**
- Connector click-mode first press arms free-floating tile anchor on empty canvas or item anchor on node; non-renderer guard
- Cursor.getAnchorOrdering: exact path index, nearest-index for off-path grabs (never throws), rounds to closer neighbour
- DrawRectangle: crosshair entry/exit, exit commits abandoned draw, create on mousedown, immer-free batch resize on mousemove, guards (no move / null id / null mousedown / wrong mode), mouseup → CURSOR
- FreehandLasso: path start on renderer only, drag-within-selection → DRAG_ITEMS, click-outside clears + restarts, throttle threshold, <3 points no selection, screenToTile polygon conversion, floating Label captured by anchor tile (ADR 0031)
- handleArrowKey (B6): pans with no nudge-able selection, nudges items/rectangles/textboxes one tile in single transaction, connector-only selection pans, non-arrow not consumed
- handleDeleteKey: per-type dispatch incl. LABEL (L-1 fix), no-op when empty, Delete/Backspace parity, suppressed during contentEditable inline edit, isEditableTarget matrix
- handleEscapeKey priority: abort in-flight connector > close panel > clear multi-selection; idle tool modes exit to CURSOR (F-01), DRAG_ITEMS excluded, two-Esc full reset
- Label/TextBox placement: canvas release creates exactly one + selects (panel/deck closed) + returns to CURSOR, off-canvas no-move tap only arms, drag-from-panel past tap-slop places, mousemove no-op
- PlaceIcon: places at nearest unoccupied tile, B1 arming-tap vs drag-from-panel, no-tile-found still exits to CURSOR, guards
- toolHotkeys: plain key resolves, Ctrl/Cmd suppresses (#17) regardless of letter, unmapped/null returns null
- TransformNode (ADR 0044): corner-drag scale up/down with per-corner outward sign, clamp [0.3,2.5], 1/zoom projection safety, GROUP uniform factor, preview-only during drag, single-transaction commit on mouseup, exit safety-net commit
- TransformRectangle: entry/exit drag-transaction (one undo entry), corner + ADR 0026 edge-midpoint drags keep opposite edge fixed, guards, mouseup → CURSOR
- TransformTextBox rectangle-style resize in both orientations (near-edge tile follow, far-edge fixed), corner two-axis write, 1-tile floor clamp, no-op when unchanged, commit before CURSOR
- Lasso intersection (#16): rectangle ANY-overlap through middle, textbox full-bounds body hit, mixed marquee, free-floating endpoint captured as CONNECTOR_ANCHOR while node-bound excluded (#2); Lasso⇄Freehand entity-type parity
- usePanHandlers: pan-mode left-click bypass, middle-click pan cycle, deferred right-drag pan with slop threshold, right-tap context menus (empty canvas / item select / bulk menu), mode restore after pan (CURSOR and CONNECTOR), lasso right-click clears, draw-tool modes, off-grid right-tap targets drawn body vs vacated grid cell (ADR 0023 #6), off-renderer right-click not armed

**Conspicuous gaps:**
- packages/axoview-lib/src/interaction/useInteractionManager.ts — only static source-grep checks (dep arrays, F2 scope) plus keyboard dispatch; no direct behavioral tests of the event plumbing/mode routing itself

### Lib clipboard (copy/cut/paste)

**Files:** `packages/axoview-lib/src/clipboard/__tests__/clipboard.test.ts`, `packages/axoview-lib/src/clipboard/__tests__/useCopyPaste.test.ts`

**Asserted behaviors:**
- clipboard module: has/get/set lifecycle, overwrite, model+view item payload shape, centroid accuracy
- handleCopy: LASSO selection with centroid (incl. rectangle midpoints + textbox tiles), single-item panel copy, empty-selection early return, connector auto-include when both anchors selected
- handlePaste: null clipboard → warning notification, ID remap uniqueness, orphan anchor detach, tile offset = mouse − centroid, connector tile waypoints offset, CURSOR mode after paste, clipboard order forwarded (z-order reverse happens in useScene.pasteItems)
- handleCut: same payload as copy, deleteSelectedItems / deleteViewItem per path, mode reset + panel clear, 'Cut N items' notification, empty-selection no-op

### Lib hooks

**Files:** `packages/axoview-lib/src/hooks/__tests__/useHistory.test.tsx`, `packages/axoview-lib/src/hooks/__tests__/useHistory.realStore.test.tsx`, `packages/axoview-lib/src/hooks/__tests__/useInitialDataManager.test.tsx`, `packages/axoview-lib/src/hooks/__tests__/useInlineRename.test.tsx`, `packages/axoview-lib/src/hooks/__tests__/useIsoProjection.twoDY.test.tsx`

**Asserted behaviors:**
- useHistory (mocked stores): dual-store undo/redo dispatch, transaction saves before not during, nested-transaction prevention, error tolerance, clear, capability checks across both stores
- useHistory (real modelStore): undo restores value, canUndo transitions, redo stack cleared by new mutation, 50-entry cap, undo/redo round-trips with no-op sets, transaction = 1 checkpoint for 3 ops, nested transaction single checkpoint
- useInitialDataManager load hygiene: filters orphaned connectors (invalid item refs, mixed refs, all-invalid), keeps anchor-to-anchor refs, original initialData not mutated, validation errors handled, rejected/oversized import surfaces notification (ux §6.3)
- useInlineRename: Enter commits via blur, Escape cancels, plain blur commits, Shift+Enter newline, outside left-pointerdown commits vs right-pointerdown cancels, inside pointerdown keeps focus
- useIsoProjection 2D-Y (MQA #11): no transform for X, rotate(90)+translateX for Y with correct order and top-left origin, iso matrices untouched in ISOMETRIC mode

**Conspicuous gaps:**
- zero-test hooks in packages/axoview-lib/src/hooks/: useDiagramUtils.ts (fit-to-screen), useDirtyTracker.ts, useConnector.ts, useSceneActions.ts, useSceneData.ts, useModelItem.ts, useViewItem.ts, useView.ts, useRectangle.ts, useTextBox.ts, useTextBoxProps.ts, useLabel.ts, useLayerActions.ts, useLayerContext.ts, useIcon.tsx, useIconCategories.ts, useIconFiltering.ts, useImageAspect.ts, useKeyboardIconPlacement.ts, useCanvasModeToggle.ts, useColor.ts
- useScene.ts is covered only via __perf_refactor_regression__ list-shape/reference-stability tests; pasteItems/action surface has no direct unit tests outside paste.bulkPerf

### Lib WebGL rendering

**Files:** `packages/axoview-lib/src/webgl/__tests__/atlasUV.test.ts`, `packages/axoview-lib/src/webgl/__tests__/lineStyle.test.ts`

**Asserted behaviors:**
- atlasUVRect: half-texel inset origin/span, no gutter bleed, symmetric inset (finding #2), 1px slot collapses to texel centre, [0,1] normalisation
- walkDots: spacing placement, arc-length phase continuity across corners, epsilon spacing no-op (no div-by-0), degenerate segments skipped, tiny spacing terminates at span cap (finding #4)
- walkDashes: on-span emission, corner-straddling dash split at vertex, epsilon/tiny period guards
- buildAaLineQuad: centred quad fattened by 2·feather, orthogonal perpendicular basis at any angle, zero-length collapse without NaN

**Conspicuous gaps:**
- packages/axoview-lib/src/webgl/glSpriteBatch.ts — zero tests (batching/draw-call assembly)
- packages/axoview-lib/src/webgl/itemRaster.ts — zero tests (icon rasterization to atlas)
- packages/axoview-lib/src/webgl/contextLoss.ts — zero tests (context-loss recovery)

### Lib UI components

**Files:** `packages/axoview-lib/src/components/ColorSelector/__tests__/ColorPickerBody.test.tsx`, `packages/axoview-lib/src/components/ColorSelector/__tests__/CustomColorInput.test.tsx`, `packages/axoview-lib/src/components/DebugUtils/__tests__/DebugUtils.test.tsx`, `packages/axoview-lib/src/components/IconButton/__tests__/IconButton.color.test.tsx`, `packages/axoview-lib/src/components/IsoTileArea/__tests__/IsoTileArea.borderInset.test.tsx`, `packages/axoview-lib/src/components/ItemControls/IconSelectionControls/__tests__/Icon.test.tsx`, `packages/axoview-lib/src/components/ItemControls/IconSelectionControls/__tests__/IconGrid.test.tsx`, `packages/axoview-lib/src/components/ItemControls/__tests__/panelParity.test.tsx`, `packages/axoview-lib/src/components/Label/__tests__/Label.test.tsx`, `packages/axoview-lib/src/components/NodeActionBar/__tests__/NodeActionBar.helpers.test.ts`, `packages/axoview-lib/src/components/RichTextEditor/__tests__/RichTextEditor.formats.test.ts`, `packages/axoview-lib/src/components/SceneLayers/Nodes/__tests__/NodesCanvas.scrollSync.test.tsx`, `packages/axoview-lib/src/components/SceneLayers/__tests__/labelPointerContract.test.tsx`, `packages/axoview-lib/src/components/TransformControlsManager/__tests__/TransformControlsManager.dragChrome.test.tsx`, `packages/axoview-lib/src/components/ViewModeInfoPopover/__tests__/deriveItemInfo.test.ts`, `packages/axoview-lib/src/components/ViewModeInfoPopover/__tests__/hasInfoPopoverContent.test.ts`

**Asserted behaviors:**
- ColorPickerBody: swatch grid render/click/active aria-pressed (case-insensitive), single checkmark (ADR 0039), grid-first custom input reveal + seeding, contextual transparent/no-color swatch incl. absentIsNoColor semantics per field type
- CustomColorInput: hex validation gating onChange, invalid-blur revert, prop sync, EyeDropper pick/cancel/unsupported
- IconButton iconColor precedence: active > disabled > default with distinct grey levels
- IsoTileArea border inset (B3): half-stroke inset, corner-radius reduction, clamp at 0 for oversized stroke, full-bleed when strokeless
- IconSelectionControls: img render flat/iso, button labelled by icon name, roving tabindex honored/forwarded ref, Enter/Space activation, arrow-key grid nav (±1/±5) with edge clamp, Enter places focused icon at viewport centre
- panelParity: node and connector panels both render shared Notes + Metadata deck sections
- Label component: dotted line pointerEvents none, hidden at labelHeight 0 / showLine false, children render
- NodeActionBar helpers: hasVisibleText HTML matrix (whitespace-only tags false, unterminated '<' true), PANEL_EVENT type→event map, dispatch isolation per type
- RichTextEditor formats config: 'list' not 'bullet', 11-format count pin, both editors wire shared list-autofill binding
- NodesCanvas: repaints synchronously in same tick as setScroll/setZoom (rubber-band regression)
- label pointer contract (per layer): PRIMARY press arms move, RIGHT/MIDDLE don't, layer owns context menu + preventDefault
- TransformControlsManager RECT-1: chrome hidden during single and multi DRAG_ITEMS, rendered at rest
- ViewModeInfoPopover: per-type derivation (ITEM/CONNECTOR/TEXTBOX/LABEL/RECTANGLE notes parity, headerLink presence per schema, anchor placement), content gate (name/notes/headerLink any-of), toHref https:// prefixing

**Conspicuous gaps:**
- zero-test lib components: Renderer/Renderer.tsx, SceneLayer, Grid (formula tested only via perf grep-free math), AnnotationLayer/AnnotationLayer.tsx, AnnotationPalette, CanvasContextMenu, ConnectorAnchorOverlay, ConnectorSettings, LayersPanel, ZoomControls, SettingsDialog, ZoomSettings, HotkeySettings, IconPackSettings, HelpDialog, LeftDock, BottomDock, RightSidebar.tsx, DragAndDrop, ModeHint, PreviewLayerSwitcher, PreviewCanvasModeToggle, TopBarStyleControls, ElementLinkCard, CanvasCompositorOverlay, DOMErrorBoundary, Cursor, Lasso/FreehandLasso overlays, Svg, UiElement
- ItemControls panels (NodeSettings/ConnectorSettings/RectangleSettings/TextBoxSettings etc.) have only the two-section parity test — no per-control behavior tests
- ExportImageDialog behavior beyond waitForIconsDrawn is covered only by static source-grep tests (initialLoad/memo)

### Lib perf/refactor regression suite (__perf_refactor_regression__)

**Files:** `packages/axoview-lib/src/__perf_refactor_regression__/Connector.modes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/Cursor.modes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/Cursor.waypointGestures.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/DragItems.modes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/Lasso.modes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/Pan.modes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/ReconnectAnchor.modes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/rectangleDrawTransform.modes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/connector.dragPerf.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/connector.createUndoRedo.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/connector.renderIsolation.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/lasso.bulkPerf.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/paste.bulkPerf.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/rectangleTextbox.dragPerf.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/undo.dualStackSkew.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/keyboard.dispatch.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/multiSelect.contract.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/annotationOpenReset.contract.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/node.linkTooltipDedup.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/uiOverlay.editorModes.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/useScene.listShape.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/useScene.referenceStability.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/viewOps.integration.test.tsx`, `packages/axoview-lib/src/__perf_refactor_regression__/useResizeObserver.lifecycle.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/useRAFThrottle.cleanup.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/touchGesture.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/shortcuts.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/settings.defaults.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/i18n.config.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/i18n.localeCompleteness.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/grid.backgroundFormula.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/quickAdd.groupButton.test.ts`, `packages/axoview-lib/src/__perf_refactor_regression__/toolMenu.propagation.test.tsx`

**Asserted behaviors:**
- Connector mode full lifecycle: click-mode arm/finalize/revert (stray-click guard, node-start stays armed), drag-mode create/commit, connectorDefaults apply+reset, returnToCursor one-shot, mousemove second-anchor tile/item snapping, guards
- Cursor mode: mousedown item/empty handling, Shift-click additive like Ctrl (#10), plain-click replace, empty-canvas deselect, outside-canvas drag no panel dismiss, hover A3, DRAG_ITEMS transition incl. sub-tile slop, LASSO transition, connector endpoint press → RECONNECT_ANCHOR
- Cursor waypoint gestures (ADR-0006): Alt+click splices waypoint (even unselected, DOM-driven targetAnchorId, no spurious clearSelection), Ctrl+click toggles connector+waypoints as unit
- DragItems: entry/exit transaction + cursor/userSelect, collision → not-allowed cursor, CSS-preview-only mousemove (no model writes) with previewConnectorPaths, batch commits on mouseup (view items, rectangles, textboxes, labels, waypoints), reconnect path via scene.transaction, floating-label preview cleared on exit
- Lasso mode: guards, reset/isDragging branches, marquee → CURSOR keeping selection, CONNECTOR_ANCHOR collection rules (middle waypoints yes, endpoints no — 2026-05-25 regressions), path-hit selection of node-bound connectors crossing the rect + unresolvable-ref resilience, initialTiles recording
- Pan mode: cursor semantics per editor mode, scroll delta application, EXPLORABLE_READONLY slop threshold (M2), readonly click opens panel on description/notes/linked-diagram content and clears otherwise
- ReconnectAnchor: live preview retarget tile/item touching only matching anchor, mouseup → CURSOR keeping connector selected
- immer-free rectangle draw/resize: batchUpdateRectangles path, transaction commits at mouseup/exit
- perf budgets: connector drag N ticks → 1 history entry + <1500ms, lasso marquee frames over bulk scene < budget, bulk paste single validation + budget + one reversible undo entry, structural sharing (untouched-view identity)
- undo semantics: connector create undo/redo restores canRedo on both stores, D-7 dual-stack skew stays coherent under hazardous interleave
- keyboard dispatch (H-1): Ctrl+Z/Y/Shift+Z/X/C/V exact single dispatch with capability gating, Delete/Backspace only in CURSOR mode, arrow-key pan scroll math, one keydown listener
- multi-select contract: setSelectedIds/toggleSelected/clearSelection slice coherence, panel auto-open only on double-click path, >1 selection auto-hides dock (MQA #9), view-mode no auto-open (ADR 0012)
- annotation-open resets armed tool to mode default + clears selection; draw-tool arming resets in-flight lasso; close leaves canvas mode; palette closes on editor-mode switch keeping strokes
- readonly node UX (MQA #22/#25): no hover chip/popover, passive link badge, panel name-as-link, LINKED DIAGRAM section incl. unresolvable error
- UiOverlay editor-mode tool matrices (EDITABLE/EXPLORABLE_READONLY/NON_INTERACTIVE) with invariants
- useScene selectors: list shapes with DEFAULTS merging precedence (scene > model > defaults), currentView fallback, reference stability matrix (stable on rename/title, changes on add/remove/scene-update)
- view ops integration on real store: CRUD + full lifecycle immutability
- useResizeObserver: lifecycle observe/disconnect/no-leak/no-setState-after-unmount, debounce never suppresses single event; useRAFThrottle: coalescing, cleanup cancels, flush sync
- touch tap-slop classifier (ADR 0018 D5): radial pixel slop with override
- static contracts (source-grep style): render isolation memoization (Connector/Connectors/ExportImageDialog), selector consolidation, gsap absence, i18n config + locale completeness + hardcoded-string bans (ToolMenu/QuickIconSelector/splash), ViewTabs title read-only, saveTracking isAfterLoadRef, dragstart prevention, language dropdown CSS, fixed shortcuts/hotkey scheme/zoom defaults, grid background formula math, QuickAdd rectangle/icon creation logic, ToolMenu stopPropagation

**Conspicuous gaps:**
- many contracts here are source-text greps rather than behavior (exportImageDialog.initialLoad, f2.rendererScope, interactionManager.depStability, saveTracking, viewTabs, i18n, toolMenu/quickIconSelector string bans) — they pin implementation text, not runtime behavior; renames could silently weaken them

## Invariants

54 contracts harvested from ADRs, guidelines, known_issues.md and the 2026-07 technical reviews. Each row is a hypothesis seed: the violation idea is a *starting point*, not the only way the contract can break.

| # | Source | Invariant | Violation idea |
|---|--------|-----------|----------------|
| 1 | ADR 0006 §1 / canvas-interaction.md §7 I-3 | selectedIds.length === 1 ⇔ itemControls mirrors that item; length 0 or >1 ⇒ itemControls is null, and every selection path goes through setSelectedIds/setItemControls — never a new slice. | Delete one item of a 2-item multi-selection via the context menu's bulk Delete: if the store drops the deleted ref but doesn't re-derive itemControls when length falls to 1, the panel target and F2/Delete dispatch point at nothing while selectedIds says one item. multiSelect.contract.test.ts only exercises setSelectedIds/toggleSelected directly, not post-delete re-derivation. |
| 2 | ADR 0006 §3 / canvas-interaction.md §7 I-1 | selectedIds can only ever contain interactable refs — locked/hidden-layer items are excluded from every selection path (Ctrl+A, lasso, click, context menu). | Select 5 items, then toggle their layer to hidden (or locked) in the LayersPanel while the selection is live: nothing re-validates selectedIds on a layer-state change, so Delete or a group drag then mutates now-hidden/locked items. All guards test the acquisition paths, not selection invalidation on layer toggle. |
| 3 | ADR 0006 §2 + canvas-interaction.md I-2 (getConnectorWaypointRefs) | Ctrl/⌘+click toggles a connector plus its tile-bound waypoints in/out of the selection as one atomic group; a connector always carries its waypoints into any selection. | Ctrl+click a selected connector to toggle it OFF: if the toggle removes only the connector ref and leaves its waypoint CONNECTOR_ANCHOR refs in selectedIds, a subsequent group drag translates orphan waypoints and pinches the path. Cursor.waypointGestures.test.ts covers the toggle-ON atomic group, not the removal symmetric. |
| 4 | canvas-interaction.md §5.2 (computeNodeUpdates) | Node-group drag collision is all-or-nothing — any colliding target means NO node moves that frame; preview always holds the last non-colliding position, and that exact position commits on mouseup. | Mixed group (nodes + rectangle) dragged into a collision: nodes freeze at the last valid preview but textbox/rectangle/anchor members are explicitly not collision-gated and keep translating — on mouseup the group's rigid relative offsets are torn apart. DragItems tests assert the node all-or-nothing rule in isolation, never mixed-type group rigidity across a blocked frame. |
| 5 | canvas-interaction.md §5.4 | Group-drag members are seeded once at drag start; free-floating CONNECTOR_ANCHOR members must be seeded from their ref.tile or paths pinch. | A new selection source (e.g. a future context-menu 'Select all in layer' or a paste-then-drag flow) that populates selectedIds without running collectDragInitialPositions' anchor-seed branch reproduces the historical Ctrl+A pinch — tests cover the Ctrl+A path only. |
| 6 | canvas-interaction.md §6.1 (CSS-only drag preview, 5-part contract) | During a node drag the model is never written; live position lives only in --ff-drag-dx/dy vars and scene.connectors[].path via exactly ONE previewConnectorPaths call per frame wrapped in flushSync. | Any new per-frame feature during drag (alignment guides, auto-pan at canvas edge, live distance readout) that issues a second scene.connectors[].path write per frame reintroduces wire flicker. The doc itself says the two-writer race has NO automated test — visual-only. |
| 7 | canvas-interaction.md §6.2 (drag transactions) | beginDragTransaction/commitDragTransaction must pair exactly once per gesture; a leaked bracket suppresses saveToHistoryBeforeChange for ALL subsequent edits, silently dropping undo history. | Start a node drag, then lose the mouseup (release outside the window / alt-tab / browser context-menu steals the event): exit runs lazily only on the NEXT mouse event, so if the user's next action is keyboard-only (Delete, Ctrl+Z), the bracket may stay open and later edits produce no undo entries. connector.dragPerf.test.tsx tests the happy 40-tick path, never a lost mouseup. |
| 8 | canvas-interaction.md §8 + ADR 0022 addendum | Escape dispatch order is panel-clear → selection-clear → connector-abort (§4.5), while ADR 0022 says Esc returns to Select 'after first aborting an in-progress connector' — only CONNECTOR has a true Escape-abort. | With a multi-selection active AND an in-flight connector (possible: draw connector while selection persists), one Escape may clear the selection instead of aborting the connector, or vice versa — the two documents state contradictory priority orders, and no test pins Escape behavior with both states simultaneously live. |
| 9 | canvas-interaction.md §8 (no rollbackDragTransaction) | Every mode exit safety-net COMMITS; node CSS-preview drags abort-to-origin only by accident. A mid-drag tool hotkey is an undocumented partial abort: nodes snap back, textbox/rect/anchor moves commit. | Press 'r' mid multi-drag of nodes+textboxes: nodes revert, textboxes commit their translation → the group's relative layout silently corrupts, with ONE history entry that undo can't cleanly revert to the pre-drag state for the node members (they never wrote). No test exercises tool-hotkey-mid-drag. |
| 10 | canvas-interaction.md §8.1 + known_issues D-9 | One keystroke reverts exactly one logical action across both history stacks (sequence stamping); scene history is global but the scene store holds only the current view. | Edit on Page 1, switch to Page 2, Ctrl+Z: the scene patch applies to Page 2's scene (phantom/stale scene.connectors[id]) while the model undo reverts Page 1 — documented open (D-9) with NO e2e repro committed. Any new page-switch path (e.g. cross-diagram link navigation within a file) widens the window. |
| 11 | ADR 0021 item 7 (D-8 fix) + D-9 | After undo/redo, resyncScene re-routes connectors with missing/empty paths — but only in the ACTIVE view. | Paste connectors on Page 1 → switch to Page 2 before async routing completes → undo/redo: resyncScene scans only the active view, so Page 1's pasted connectors stay pathless (invisible) until a later edit touches them. useHistory tests exercise single-view scenarios only. |
| 12 | canvas-interaction.md §6.6 (RAF throttle) | Move reducers run at most once per animation frame regardless of device event rate; down/up flush immediately. | A new pointer path (pen with pointerrawupdate, or a touch handler added outside useRAFThrottle) drives Connector.mousemove at device rate → the per-frame model clone (§6.5 GC cliff) arrives in seconds instead of ~50s. The doc explicitly lists 'pointermove actually throttled under load' as an untested guard gap. |
| 13 | ADR 0023 §1 + §7 acceptance / clipboard | Off-grid fields (offset/snap/collides) survive every persistence and duplication path; absent fields default to snapped/colliding. | Ctrl+C/Ctrl+V (or context-menu Duplicate) of an unsnapped off-grid node: clipboard.ts/useCopyPaste reconstruct view items — if they omit offset/snap/collides, the paste silently re-snaps and re-enables collision. The ADR's round-trip test covers export→import, and ADR 0044 names clipboard as 'the real risk site' for iconScale — the same hole exists for the 0023 trio with no clipboard round-trip test. |
| 14 | ADR 0023 addendum B + renderedGeometry.contract.test.ts | No file outside utils/renderedGeometry.ts may hand-roll tile+offset composition; an offset must never be rounded into a tile. | The contract test greps three specific regex patterns (offset?.x ?? 0, base.x + it.offset.x, ${it.offset.x}px). A new composition written as `const {x: ox = 0} = item.offset ?? {}; left = px.x + ox` evades all three regexes while violating the invariant — the regex gate rots silently as coding style shifts. |
| 15 | ADR 0023 Consequences + addendum D | A connector anchored to an offset/unsnapped node must resolve to the RENDERED (offset) endpoint on both the WebGL bulk path and the DOM selected path. | Select a connector attached to an off-grid node: the sparse DOM <Connector> (selection halo) and the WebGL ConnectorsCanvas body must agree on the endpoint. If one resolves via bare tile and the other via rendered position, selecting/deselecting makes the wire visibly jump at the node. The invariant suite asserts DOM/WebGL equality for rectangle vertices, not connector endpoints at offset nodes. |
| 16 | testing.md ADR 0023 additions (snap-grid.spec freeze test) | Turning global snap ON does not re-snap existing off-grid items. | A future load-time normalization or 'cleanup' migration that drops offset when snap is globally on — the e2e freeze test covers the toggle in-session, but a load-path normalization (e.g. in useInitialDataManager, where seeds already run) would re-snap on reload and no reload-with-global-snap-on test exists. |
| 17 | canvas-interaction.md §5.9 checklist item 1 + rendering §15 | Render/hit gates must filter by `layers.length === 0 \|\| visibleIds.has(id)` — NOT `visibleIds.size === 0` (which empties when every item's layer is hidden, showing all). | Hide ALL layers in the Layers panel: any layer using the `visibleIds.size === 0` escape-hatch predicate suddenly renders everything (paint layers use exactly `visibleIds.size > 0 && !visibleIds.has(id)`). No test hides every layer at once — all layer-visibility tests toggle one layer with others visible. |
| 18 | rendering guidelines §15 | Every component that paints an entity or exposes an interactive affordance re-applies the layer visible/locked filter itself — it is never inherited; locked-layer items may be selected but get a ring with NO transform handles. | The label hit-proxies (LabelHitLayer/NodeLabelHitLayer) and the new ADR 0044 ScreenBoxTransformControls/size-readout pill are affordance layers added after the §15 sweep — if any iterates the raw scene list, a hidden layer's label chip stays grabbable (invisible drag) or a locked node still shows resize handles. The §15 fix audited RectanglesCanvas + ConnectorAnchorOverlay + TransformControlsManager; nothing prevents the next overlay from skipping the filter. |
| 19 | rendering guidelines §10 + ADR 0038 §5 | buildInstances runs only on scene/geometry change or LOD crossing; pan/zoom is one uniform write + one draw call, and data-build-count must stay flat across a pan. | Adding visibleIds/lockedIds to a canvas's rebuild deps (per §15) with an unstable Set identity recreated on every store tick → geometry rebuilds per frame during pan. The anti-cheat only runs in the perf harness (PR-time, small-N), so an identity-instability regression on a rarely-run path ships green. |
| 20 | rendering guidelines §8 | Any GPU layer whose geometry is projected must list strategy.projectionName in its rebuild deps; a DOM hit-proxy and its GPU paint must share one projection. | Switch iso→2D in VIEW mode using the new viewer projection toggle (PR #84): if any of the four bulk canvases (or a future one) omits projectionName from deps, its paint stays in the old projection while hit-proxies move — the exact Labels bug, now reachable from a brand-new code path (PreviewCanvasModeToggle) that no e2e drives through all four layers. |
| 21 | technical-review-2026-07-29 finding #5 (useCanvasModeToggle) | Exactly ONE useCanvasModeToggle consumer may be live at a time — two mounted simultaneously each apply the scroll correction, double-jumping the viewport. | A future surface (mobile chrome, export dialog's hidden Axoview instance, or the present-chrome toggle rendered alongside ToolMenu in some mode combination) mounts a second consumer: every projection switch jumps the viewport by 2× the correction. The invariant is comment-only; the review names it as the same unenforced-invariant class as the 0023 offset cluster, with the contract-test remedy still unwritten. |
| 22 | ADR 0013 (preview layer switcher) | Preview layer toggles/solo are a UI-only override merged into visibleIds; they never mutate or save layer.visible, and the override clears on leaving preview. | Enter present mode, solo a layer, then leave via browser back-navigation or a cross-diagram link click (not the mode toggle): if the override clears only on the mode-toggle path, the stale solo override could suppress layers in the editor or leak into the next present session. previewLayerVisibility.test.ts tests the merge math; the e2e tests toggle+non-dirty, not exit-path clearing. |
| 23 | ADR 0014 (ephemeral annotation overlay) | Annotation strokes never enter ANY persistence path — session save, server save, Drive save, export JSON, project zip — and image export excludes them (deferred inclusion). | Export PNG while the annotation pen is open with strokes drawn: the exporter serializes DOM via dom-to-image — if the capture root includes the annotation SVG layer (a full-area sibling in UiOverlay), strokes bake into the 'clean' export. projectZip.test.ts asserts zero annotation bytes in the zip; no test asserts the image-export capture root excludes the overlay. Drive saves are also newer than the whitelist tests. |
| 24 | ADR 0022 §1/§3 + as-built note | Single left-click is select-only; the details panel opens ONLY on double-click; right-tap opens the context menu, never the panel. | The ADR's own as-built note admits no details-interaction.spec was ever created — double-click-opens-panel and name-drag-across-panel-keeps-it-open have zero e2e coverage. A refactor of resolveClickSelection that re-mirrors itemControls into an auto-open (the pre-0022 behavior) would ship green through the whole suite. |
| 25 | ADR 0022 §4 / ADR 0034 §1 (commit contracts) | Inline editors commit on left-click-away and cancel on right-click-away/Escape; clicks inside the strip or any MUI portal overlay must NOT end a text-box edit session. | The click-away allowlist is selector-based (.MuiPopper-root etc.): a new overlay (the ADR 0039 color-picker popover, a future emoji picker) rendered with a different portal class ends the edit session mid-formatting, committing a half-styled box. useInlineRename.test covers canvas click-away; no test clicks each strip popover type during a live text-box session. |
| 26 | ADR 0034 §1 + Lucid-parity pass (empty-box lifecycle) | An edit session that ends still-empty deletes the text box — commit-empty and cancel-on-never-committed alike; no invisible zero-width ghost may remain. | End a session whose content is Quill's structural residue (`<p><br></p>`, or whitespace-only after &nbsp; normalization): if the emptiness check compares raw HTML rather than stripped text, an invisible ghost box survives, is lasso-selectable, and counts in Ctrl+A. Tests cover the plain-empty case, not the structural-residue cases. |
| 27 | ADR 0034 §4 + testing.md S1-brick guard | No dead writes: every strip write must be schema-legal at the write site — a strip range wider than a schema cap bricks saved diagrams at safeParse on reload (the connector-label 24→40 lesson). | ADR 0044 group icon-resize: a uniform factor multiplies each member's startScale preserving ratios — a member already at 2.5× times factor 1.3 commits 3.25, outside the schema's hard [0.1,3] → the whole diagram fails safeParse on next load. TransformNode.test covers the single-node clamp; nothing asserts per-member clamping under group factor multiplication (and per-member clamping would itself violate 'relative sizes preserved'). |
| 28 | ADR 0034 §5 rule 7 (content fidelity) | Sanitizer allowlist ≥ editor format whitelist; any textBox.content editor round-trips losslessly; commits sanitize write-side. | Add a new Quill format (e.g. range background-color, mirroring the existing range color) without extending the DOMPurify profile: the write-side sanitize silently strips it on commit, so formatting applied in the editor vanishes at rest. The align style-attributor survival is pinned by test; no generic allowlist⊇whitelist assertion exists, so each new format re-opens the hole. |
| 29 | ADR 0034 round-2 (normalizeQuillHtmlSpaces) | &nbsp;-serialized spaces are converted to real spaces on commit AND on load, so fixed-width boxes wrap; auto boxes render `pre`, fixed boxes `pre-wrap`. | A read-only path that loads content without the editor-load normalization — the /display/drive viewer or a share-snapshot render — shows a legacy &nbsp;-heavy fixed-width box as one unbreakable line overflowing the box. Load normalization lives in the editing load chokepoint; no test loads legacy content through the read-only display routes. |
| 30 | ADR 0032 amendment (label ?? name fallback + seed) | Render source = label ?? name; seedNodeLabel copies name→label at LOAD so renaming identity name in Layers never moves canvas text. | Create a node in-session (QuickAdd: name='Untitled', no label), then rename it in the Layers panel WITHOUT reloading: the seed only runs at load, the fallback renders name — so the canvas text moves with the identity rename, reproducing the exact #1 cross-persona confusion the amendment fixed, but only for never-reloaded nodes. Seed tests are load-path only. |
| 31 | ADR 0032 connector amendment §4 (nameSeeded marker) | The name→labels[] seed is idempotent via a nameSeeded marker stamped on every connector the pass touches; a name typed later is pure identity and never re-seeded. | Paste a connector from the clipboard (or import a zip diagram) whose reconstruction drops the nameSeeded marker while keeping name: the next load re-seeds name into a midpoint label — duplicate label chips appear after every paste→save→reload cycle. Seed idempotency tests never route through clipboard/zip reconstruction. |
| 32 | ADR 0001 import semantics §1 | Project-zip import rewrites every ID and updates all cross-references: folderId, parentId, and cross-diagram link refs inside diagram models. | Cross-diagram links now also live in Quill content HTML (ADR 0034 link-to-diagram in text runs and link cards) and in connector labels' headerLink — the importer's rewrite list predates these surfaces ('item-level link fields, view connector refs'). Import a zip whose text-box content links to a sibling diagram: the href still carries the OLD id → dead link. projectZip.test asserts ID rewriting for the original ref sites only. |
| 33 | ADR 0003 (lean icon save) | Default-catalog icons are stripped from every save and rehydrated on load; custom AND override icons are preserved verbatim. | An icon-pack version bump changes a bundled icon's base64: the strip's duplicate detection (compare against current catalog) now sees a user's diagram icon (saved from the OLD pack) as non-duplicate and keeps it — or worse, a normalization change makes a user's deliberate override compare equal and get stripped, silently reverting their customization on save. leanSave.test compares against a fixed fixture catalog, never a drifted one. |
| 34 | features.md requiredPacks + ADR 0003 | Lean saves persist requiredPacks so importers auto-load the right icon packs before merging; icons render on first paint after re-import. | Ctrl+C a Material-icon node in diagram A, Ctrl+V into diagram B which never loaded the Material pack: paste inserts the view item but B's requiredPacks derivation and icon catalog may not gain the pack/icon → save B, reload → tombstone. No test pastes across diagrams with disjoint loaded packs. |
| 35 | ADR 0037 §2 (active provider follows open diagram) | Switching the open diagram to another place flushes the pending autosave to the OLD place before setting the new active provider. | With a dirty session diagram (debounced autosave pending), immediately open a Drive diagram: if the flush is fire-and-forget rather than awaited before the provider swap, the session autosave either writes through the Drive provider (wrong place) or is cancelled (silent data loss). driveTransfer/authStore tests don't cover the open-diagram provider-swap flush ordering. |
| 36 | ADR 0037 §5 (move semantics) | Move-to-Drive is create → verify returned id → only then delete from source; a failed item stays in session and is reported; moving the OPEN diagram reopens it from its new Drive id. | Move the open dirty diagram: create+verify succeed, source delete succeeds, then the reopen-from-Drive fetch fails (token expired mid-flow): the canvas still shows the old session-backed state with a currentDiagram id that no longer exists anywhere → next autosave targets a deleted id. driveTransfer.test covers create/verify/delete ordering, not the reopen leg. |
| 37 | ADR 0036 §2 + known_issues (root-folder detection) | ADR 0036 promises the provider detects a deleted/trashed Drive root folder; as-built, isAvailable() only checks auth and the cached root id is never revalidated. | Trash the app folder in Drive's own UI mid-session: autosaves keep 200-OK patching files in the trash for the rest of the session; loss surfaces only at next full listing. The cheap fix (invalidate on zero-listing or 404) is catalogued but unimplemented — any test asserting 'save succeeded ⇒ durable' is false here. |
| 38 | ADR 0035 / authStore.test.ts | The Google token is NEVER persisted — only the identity/profile hint survives reloads; silent reconnect re-mints via GIS. | The regression test spies on localStorage.setItem only. A convenience change that stashes the token in sessionStorage, IndexedDB, or a cookie (e.g. to survive the popup-blocker boot problem) evades the spy entirely and ships green while violating the ADR's central security contract. |
| 39 | ADR 0011 §1 (error UX contract) | Every failure-of-intent (user clicked/typed/dragged) surfaces an explicit Dialog; notification-toast-only handling and silent .catch(() => {}) are forbidden for such paths. | Click 'Copy share link' in a context where navigator.clipboard.writeText rejects (non-secure context, permissions policy): the catalogued S1–S20 silent surfaces are still open, and new Drive-share paths added since B-9a (copy preview link, Manage-access actions) have never been audited — a rejection likely dies in a toast or a swallowed catch, and no test asserts dialog-vs-toast classification for new surfaces. |
| 40 | ADR 0029 + sanitizeHtml hook | User-authored HTML is sanitized before the single dangerouslySetInnerHTML sink, and the sanitizer forces rel='noopener noreferrer' on every anchor with href. | The rel-forcing hook lives inside sanitizeHtml — link surfaces built directly in React (view-mode popover headerLink, connector-label link chips, TextBoxLinkCard's 'open in new tab') get target=_blank from their own JSX; any of them omitting rel=noopener reintroduces reverse-tabnabbing on user-supplied URLs, invisible to the sanitizer tests which only cover the HTML path. |
| 41 | ADR 0039 §2/§3 (color model) | Grid clicks commit free-form hex; stored preset-IDs remain read-only legacy resolved via resolveHex; Transparent/No-color offered only where clearing is valid, with the rectangle-border absent-derives-stroke nuance preserved. | Clear a rectangle border via the Transparent swatch: writing an explicit transparent sentinel vs deleting borderColor are different states — absent derives a stroke, sentinel means none. A bulk fan-out that normalizes 'no color' to one representation flips borders on legacy diagrams whose absent borderColor was rendering a derived stroke. ColorPickerBody tests check swatch UI, not the absent-vs-sentinel write semantics per surface. |
| 42 | ADR 0044 §4 (iconScale resolution order) | Every render reader resolves viewItem.iconScale ?? icon.scale ?? 1 — DOM icon paths, WebGL NodesCanvas, selection-ring extent, and image export must agree. | A reader outside the four audited ones — the hover outline box, NodeLabelHitLayer's chip stalk anchor, or the ADR 0012 popover's side-anchor offset — computes extent from icon.scale only: a per-node-resized icon shows a ring/label/popover anchored to the wrong extent. Unit tests cover the mode math and schema round-trip; a missed reader is visual-only and CI is pixel-blind (§11). |
| 43 | ADR 0044 §6 + ADR 0023 addendum (hit-testing) | Icon resize is visual-only — the node keeps a single-tile footprint for collision/hit/anchoring; meanwhile off-grid hit-testing compares px against RENDERED footprints. | An enlarged (2.5×) off-grid node: getItemAtTile's px footprint test and the tile-footprint rule pull in opposite directions — if hover/selection chrome traces the scaled extent (ADR 0044 third pass) but click hit-testing stays tile-sized, the user can hover-highlight a spot they cannot click. The renderedGeometry invariant suite's corpus predates iconScale and doesn't parametrize over it. |
| 44 | ADR 0031 §2 + ADR 0038 fold | A floating Label renders ABOVE nodes (cross-layer z-order was the reason Labels became a first-class entity). | The z-order is now encoded in the mount order of sibling WebGL canvases in Renderer.tsx — a refactor that reorders canvas mounting (or an overlay inserted between them, like CanvasCompositorOverlay tweaks) silently puts labels back under nodes. Tests assert model zIndex fields; nothing asserts the paint stacking of LabelsCanvas over NodesCanvas. |
| 45 | canvas-interaction.md §5.9 checklist item 5 (Label preview channel) | Canvas-drawn elements publish a live drag preview channel (labelMove/labelMoves) that must be cleared on BOTH mouseup (after commit) and exit (escaped drag). | Abort a group drag containing Labels via a mid-drag tool hotkey (DragItems.exit path): if clearLabelMoves runs only in the mouseup handler, the stale labelMoves map keeps painting Labels at the aborted offset while the model has them at origin — 'the element jumps when I next touch it'. DragItems.modes.test covers the commit path; the escaped-drag clear is the checklist's own warned gap. |
| 46 | ADR 0027 §4 + as-built note | The context menu is the SOLE per-item command surface; no command is reachable only via a removed gesture; the catalogue keeps item-type parity (unsnap/collision/Add note for every eligible type). | The ADR's as-built note admits there is NO unit test for CanvasContextMenu and only 'Unsnap from grid' is e2e-exercised. A new element type or a menu refactor that drops 'Disable collision' or 'Add note' for one type orphans that command entirely (its old surfaces are deleted) and every suite stays green. |
| 47 | ADR 0012 + known_issues (passive badges) | View-mode clickability: a node is clickable when it has link, headerLink, description, or notes; the info popover shows for any content-bearing item with parity across node/connector/rectangle/text box; items with no content show nothing. | Floating Labels (added after ADR 0012) carry headerLink — if the view-mode popover/click path never gained a LABEL branch, a linked Label is dead in present mode (hover shows pointing-finger via one path but click opens nothing). The parity tests enumerate the original four types; nothing asserts the fifth. |
| 48 | ADR 0042 §2 + worker app.ts (resourceKey fix) | The public Drive read-proxy validates fileId and (since 2026-07-29) resourceKey on the allowlist /^[A-Za-z0-9_-]{10,120}$/, with a malformed resourceKey DROPPED so 'no valid request regresses'. | Google resource keys can be shorter than 10 chars or contain other legal characters — a legitimate short resourceKey now gets silently dropped, so an 'anyone with the link' file that REQUIRES the key returns 404 from Drive and the viewer hits the auth-gate ladder with no hint. The worker test verifies the drop behavior, not that real-world resourceKey formats pass the same regex as fileIds. |
| 49 | technical-review-2026-07-29 §3 finding 2 / known_issues (runtime import cycle) | The Axoview → UiOverlay → ExportImageDialog → Axoview value cycle is safe ONLY while every binding is referenced lazily inside function bodies; a module-eval-time read becomes a TDZ crash at import. | Add a module-level const in ExportImageDialog that touches an Axoview export (a default prop, a decorator, a memoized style derived from the component): the app crashes at boot with a stack pointing at an innocent consumer. Unit tests import modules individually (different eval order than the bundle), so only a full app boot catches it — and the cycle-count ratchet at 47 doesn't distinguish lazy-safe from eval-time reads. |
| 50 | memory/audit-gate-false-greens + technical-review-2026-07-29 §8 | A green gate must be demonstrably ABLE to go red — the madge and bundle gates each spent months structurally incapable of failing while reporting pass. | The new ratchets (cycle count 47, bundle-budget.json) are baseline files: a refactor that legitimately reduces cycles to 40 without lowering the baseline re-opens headroom for 7 silent new cycles; and check-bundle-budget.js measuring gzip -9 vs rsbuild's own numbers means a chunk-naming change could move bytes into a chunk the script doesn't glob. No negative test re-runs periodically to prove the gates still fail on injected violations. |
| 51 | ADR 0022 addendum (arrow keys) + ADR 0006 | Arrow keys nudge a selected ITEM/RECTANGLE/TEXTBOX one tile per press as a single-undo transaction; with nothing selected they pan. | Arrow-nudge a selected floating LABEL or an off-grid (offset) item: Labels are absent from the enumerated nudge types (the recurring wired-into-some-surfaces bug), and nudging an off-grid item by one integer tile while keeping its offset may collide-check against the wrong cell. No test nudges a Label or an offset item. |
| 52 | features.md (viewer-controlled projection, PR #84) | canvasMode in view-only mode is viewer-local UI state persisted only to that viewer's localStorage — switching projection can neither dirty nor save the diagram. | A viewer switches to 2D on the /display route; the localStorage key is shared with the editor — the OWNER later opens the editor in the same browser and their diagram opens in 2D with a recentered scroll they never chose, and if any editor-side code treats canvasMode as model-adjacent (e.g. included in a future save payload or dirty-diff), a pure viewer action dirties the document. Tests assert non-dirty in view mode only, not the shared-key bleed into edit mode. |
| 53 | canvas-interaction.md §2 (isRendererInteraction gate) | mousedown/mouseup gate on isRendererInteraction; mousemove deliberately does NOT — any move to scoped listeners must replace window-binding with setPointerCapture or drags break when the cursor leaves the box. | A drag that strays over a NEW overlay child that stops propagation (a future minimap, the annotation palette when open in edit mode): moves keep flowing (window-bound) but the mouseup lands gated-out if the overlay swallows it → the drag never commits and DRAG_ITEMS stays armed, committing on the NEXT unrelated mouseup. No test releases a drag over each overlay surface. |
| 54 | local-mode autosave / session keys (known_issues e2e entry + features.md) | Session-place work autosaves to localStorage and survives reloads; explorer persistence is a coherent triple (axoview-diagrams, axoview-last-opened, axoview-last-opened-data). | A quota-exceeded write during autosave (5MB cap, gauge at 90%+): if the three keys are written non-atomically and one write throws, axoview-last-opened can point at an entry missing from axoview-diagrams — reload lands on the empty state or the wrong diagram while the save indicator claimed success. LocalStorageProvider tests never inject QuotaExceededError mid-triple. |
