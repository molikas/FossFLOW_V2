# Exploratory campaign ledger

**Method:** [APPROACH.md](APPROACH.md) · **Dedupe/seed reference:** [coverage-baseline.md](coverage-baseline.md) · **Generated:** 2026-07-29

This file is the campaign's resume point. Update the row (and the area file) **after every hypothesis verdict**, not at session end. Statuses: `OPEN` → `IN PROGRESS` → `DONE` (≥10 counted, all proposed rows resolved or DEFERRED-with-reason).

| Area | Name | Status | Counted | Bugs | Suspects | Seeds (seams/invariants/gaps) |
|------|------|--------|---------|------|----------|-------------------------------|
| E1 | [History & undo/redo engine (dual-store patches)](areas/E1-history-undo-redo.md) | DONE | 15 / 10 | 9 | 3 | 8/5/12 |
| E2 | [Reducers & cross-store cascades](areas/E2-reducers-cascades.md) | DONE | 15 / 10 | 10 | 1 | 8/7/8 |
| E3 | [Scene actions, transactions & paste assembly](areas/E3-scene-actions-paste.md) | DONE | 15 / 10 | 12 | 0 | 9/8/7 |
| E4 | [Clipboard, schemas, initial load & session/UI state](areas/E4-clipboard-schemas-load.md) | DONE | 15 / 10 | 12 | 0 | 8/22/6 |
| I1 | [Pointer pipeline, mode dispatcher & keyboard routing](areas/I1-pointer-modes-keyboard.md) | DONE | 15 / 10 | 10 | 0 | 10/20/10 |
| I2 | [Touch & pen gesture state machine](areas/I2-touch-pen-gestures.md) | DONE | 15 / 10 | 7 | 1 | 10/22/8 |
| I3 | [Selection, drag engine & lasso/freehand marquee](areas/I3-selection-drag-lasso.md) | DONE | 15 / 10 | 4 | 1 | 10/20/14 |
| I4 | [Connector draw, reconnect & waypoint interactions](areas/I4-connector-interactions.md) | DONE | 15 / 10 | 8 | 0 | 9/19/11 |
| I5 | [Pan/right-click, context menu, placement tools & transform handles](areas/I5-pan-menu-placement-transform.md) | DONE | 14 / 10 | 5 | 0 | 11/15/17 |
| R1 | [Projection & coordinate transforms (iso/2D/screen, off-grid)](areas/R1-projection-transforms.md) | DONE | 15 / 10 | 6 | 2 | 8/12/13 |
| R2 | [WebGL sprite-batch substrate (atlas, shaders, context loss)](areas/R2-webgl-substrate.md) | DONE | 13 / 10 | 4 | 0 | 9/3/8 |
| R3 | [Bulk GPU scene layers (build/invalidation, style parity, LOD)](areas/R3-gpu-scene-layers.md) | DONE | 15 / 10 | 7 | 1 | 10/6/11 |
| R4 | [Renderer orchestration (culling, hybrid promotion, fit-to-view)](areas/R4-renderer-orchestration.md) | DONE | 15 / 10 | 9 | 1 | 10/0/11 |
| R5 | [DOM overlays & presentation parity (labels, hit proxies, grid, compositor)](areas/R5-dom-overlays-parity.md) | IN PROGRESS | 0 / 10 | 0 | 0 | 9/23/14 |
| A1 | [Diagram lifecycle: open/save/dirty/autosave state machine](areas/A1-diagram-lifecycle.md) | OPEN | 0 / 10 | 0 | 0 | 10/20/14 |
| A2 | [Storage providers & places model (local/session/Drive, move-to-Drive)](areas/A2-storage-places.md) | OPEN | 0 / 10 | 0 | 0 | 17/7/8 |
| A3 | [Project ZIP & import/export (JSON, ZIP, image)](areas/A3-zip-import-export.md) | OPEN | 0 / 10 | 0 | 0 | 9/9/6 |
| A4 | [File explorer, folders & multi-diagram management](areas/A4-file-explorer-multidiagram.md) | OPEN | 0 / 10 | 0 | 0 | 9/3/14 |
| A5 | [App chrome: boot, dialogs, settings, i18n, theming, storage hygiene](areas/A5-app-chrome-boot-i18n.md) | OPEN | 0 / 10 | 0 | 0 | 10/6/14 |
| S1 | [Google identity & token lifecycle (GIS auth store, gates)](areas/S1-google-identity-auth.md) | OPEN | 0 / 10 | 0 | 0 | 7/7/6 |
| S2 | [Share backend: session snapshots, routes, Express/Worker parity](areas/S2-share-backend.md) | OPEN | 0 / 10 | 0 | 0 | 9/6/9 |
| S3 | [Drive-native sharing & readonly preview ladder](areas/S3-drive-sharing-preview.md) | OPEN | 0 / 10 | 0 | 0 | 10/14/9 |
| F1 | [Text, labels-as-text & rich-text editing (inline canvas edit, notes, sanitization)](areas/F1-text-richtext-editing.md) | OPEN | 0 / 10 | 0 | 0 | 0/9/12 |
| F2 | [View/preview/presenter modes & annotation overlay](areas/F2-view-modes-annotations.md) | OPEN | 0 / 10 | 0 | 0 | 0/14/16 |
| F3 | [Styling system (docked strip, bulk styling, color picker, style round-trips)](areas/F3-styling-system.md) | OPEN | 0 / 10 | 0 | 0 | 0/6/9 |
| F4 | [Layers panel & z-order (visibility, locking, assignment, ordering)](areas/F4-layers-zorder.md) | OPEN | 0 / 10 | 0 | 0 | 0/17/16 |
| F5 | [Icons & catalog (packs, custom icons, merge-on-load, icon resize)](areas/F5-icons-catalog.md) | OPEN | 0 / 10 | 0 | 0 | 0/7/11 |

## Wave order (suggested)

Engine (E1–E4) and interaction (I1–I5) first — highest seam density and everything downstream depends on them; then rendering (R1–R5), app shell (A1–A5), share/backend (S1–S3), feature cuts (F1–F5). Any order is fine as long as LEDGER stays current; areas are independent by design.

## Infrastructure status

- [x] `packages/axoview-e2e/playwright.explore.config.ts` + `fixtures/explore.fixture.ts` (console/pageerror oracle, `expectStoreInvariants`, schema oracle) — built 2026-07-29
- [x] `packages/axoview-lib/jest.explore.config.js` + `'/__explore__/'` added to the default config's `testPathIgnorePatterns`
- [x] Root scripts: `explore:e2e`, `explore:unit`
- [x] First shared-oracle helper landed and used by ≥1 probe (`tests-exploratory/_rig/rig.explore.spec.ts`)

**Quarantine verified 2026-07-29:** default lib Jest lists the same 155 files before/after the `testPathIgnorePatterns` touch; the default Playwright config lists 178 tests in 75 files, none under `tests-exploratory/`. Probe artifacts nest under the already-gitignored `test-results/explore` and `playwright-report/explore`.

**Rig note — a probe that throws during SETUP reports as a confirmed bug.** `it.failing` / `test.fail()` only distinguish pass from fail, so any environment or provider error inside the body looks like evidence. Two traps found so far: (a) jsdom has no canvas 2D context; (b) `useCopyPaste` needs `<ClipboardProvider>` (`ClipboardProviders` in `__explore__/E3/harness.tsx`). **Always pair an `it.failing` with a passing characterization test that positively asserts the observed end state** — that is what caught both. Specifically:

**jsdom has no canvas 2D context.** `getTextBoxDimensions` throws `Could not get canvas context`, so ANY T1 probe touching text boxes must call `installCanvasStub()` (`src/__explore__/canvasStub.ts`) first. This is a campaign-specific trap: an `it.failing` probe whose body throws during *setup* reports as a confirmed bug. Two E1 probes were briefly recorded on that false evidence on 2026-07-29 and re-verified with the stub (verdicts unchanged, now backed by explicit characterization tests). `canvasStub.explore.test.ts` guards the stub itself.

**Oracles available to probes** (`fixtures/explore.fixture.ts`): `exploreTest` (blank-diagram boot) / `exploreAppTest` (raw `/app` boot), both auto-asserting the console/pageerror oracle in teardown; `expectStoreInvariants(page)` (INV-1…INV-12), `expectSchemaClean(page)`, `expectModelHealthy(page)` = both. **INV-11 added by I1/PTR-11** (no `selectedIds` entry may sit on a hidden or locked layer); **INV-12 added by R4/RND-12** (every connector on the active view has a scene entry — without one it renders on neither side of the DOM/GPU hybrid while staying hit-testable). **Grow INV-* as areas confirm cross-store bugs.**

## Cross-area mop-up (final wave)

After all areas are DONE: completeness-critic pass per APPROACH §8 — list the area *pairs* no hypothesis crossed, propose one hypothesis per suspicious pair.

## Open product questions (owner triage)

| ID | Question | State |
|----|----------|-------|
| SEL-15 | Should a marquee honour the additive modifier (Shift/Ctrl/Cmd) the click path already honours? | **OPEN** — industry standard is yes (Figma, Miro, Lucidchart, draw.io, Illustrator, Sketch, Inkscape, Blender, Finder, File Explorer); recommendation recorded in the area file |
| TCH-06 | Should a cancelled press break the double-tap streak? | **OPEN** — industry standard is yes (Android `GestureDetector.cancel()`, iOS `touchesCancelled`); same handler omission as the filed TCH-14, so cheap to fix together |
| PROJ-06 | Should the ISO area quads use the exact projection ratio (0.7075 / 0.4095) instead of the 3-decimal constants? | **OPEN** — drift is hypot(0.05, 0.05) px per tile of width; a 20-tile rectangle's far corner is 1.41 px from the tile it claims. Never flips a hit-test; the constants were kept deliberately so an extraction changed no pixel |
| PROJ-07 | Should the off-grid `offset` be re-projected on an iso↔2D switch? | **OPEN** — it is not: a residual inside the ISO tile diamond can sit outside the 2D tile square, so the item is drawn over a neighbouring cell in 2D. Recommendation (with reasoning) in the area file |
| RND-14 | What should a keyboard command (F2 rename, the label-drag handle, the element link card) do when its target is selected but scrolled out of view? Today it silently does nothing — the promoted DOM copy those affordances live on is filtered through the viewport cull | **OPEN** — recommendation (scroll into view, or exempt promoted ids from the cull) in the area file |
| GPU-13 | Should a per-element `zIndex` be able to cross an entity type (lift a connector above a node)? | **OPEN** — it cannot: all four bulk canvases share one stacking context and cross-type order is fixed by mount order, so the z-order controls are silently inert across types |
| SEL-12 | Should the marquee auto-scroll at the viewport edge? | **CLOSED 2026-07-29 — by design.** Lassoing off-screen items is not a requirement; the probe now pins the no-auto-scroll behaviour as intended |

## Bugs filed

| ID | Symptom | known_issues.md anchor |
|----|---------|------------------------|
| HIST-01 | Layer/z-order ops inherit the previous action's history sequence, so one Ctrl+Z reverts two actions (strands a text box's scene size; orphans a scene connector on the next undo) | *Layer / z-order ops inherit the previous action's history sequence — one Ctrl+Z reverts two actions* |
| HIST-02 | A new model-only action clears only the model redo stack, so Redo stays armed and resurrects an undone connector's scene path (orphan `scene.connectors[id]`) | *Redo stays armed on the scene stack after a new action, resurrecting an undone connector's path* |
| HIST-03 | The two 50-entry stacks trim independently, so one logical action's halves are evicted at different times; draining history strands a text box with no scene size (falsifies the D-7 entry's "trim sub-case resolved" claim) | *Independent 50-entry history trimming splits one logical action across the two stacks* |
| HIST-04 | Creating a page records no history entry, so Ctrl+Z after "New page" silently reverts the previous action and leaves the page | *Creating a page is not undoable, and Ctrl+Z after it silently reverts the previous action* |
| HIST-05 | A failed edit leaves the undo snapshot armed, so the next page switch records a phantom scene history entry | *A failed edit arms the undo snapshot; the next page switch records a phantom history entry* |
| HIST-06 | After a leaked drag bracket later edits record no history AND the next Ctrl+Z destroys them (patches are whole-subtree replaces) | *A leaked drag bracket makes later edits un-undoable, and the next Ctrl+Z destroys them* |
| HIST-07 | `dragInProgress` is per-hook-instance, so a mid-drag write from another component corrupts the drag's undo entry (undo lands mid-drag) | *A mid-drag edit from another component corrupts the drag's undo entry* |
| HIST-09 | Cross-page undo writes the previous page's cached connector path into the page now on screen (**known** — D-9; this is its first committed repro, no new entry) | *Undo desync … (D-7)* → residual **D-9** |
| HIST-13 | Deleting a selected item leaves `uiState.selectedIds` pointing at the dead id (INV-2), through undo and redo, until the next click | *Deleting a selected item leaves it selected — `uiState.selectedIds` keeps the dead id* |
| RED-01 | `deleteModelItem` leaves an `undefined` slot in `model.items`; `validateView` then throws on it, making the view un-editable and the model unloadable (exported API, no in-app caller yet) | *`deleteModelItem` corrupts the model: the deleted slot stays as `undefined`…* |
| RED-02 | One pre-existing invalid entity anywhere in a view makes every node move AND every node placement throw (`updateViewItem` validates the whole view and throws on the first issue) | *One invalid entity anywhere in a view makes every node move and every node placement throw* |
| RED-03 | A `layerId` naming no layer is accepted by the reducer and passes both `validateView` and `modelSchema`, so dangling layer refs save and reload intact | *Nothing validates layer references — a `layerId` naming no layer is accepted, saved and reloaded* |
| RED-04/05 | Layer `order` values collide — `createLayer` after a `deleteLayer`, and any partial `reorderLayers` list — leaving the stacking order of the pair undefined | *Layer `order` values collide — after a delete, or after a partial reorder* |
| RED-06 | Every timestamped action stamps `lastUpdated` even when the reducer changed nothing, so a same-name rename or a redundant style write dirties the diagram and burns an undo step | *No-op edits dirty the diagram and burn an undo step (every action stamps `lastUpdated`)* |
| RED-07 | The delete cascade misses anchor-to-anchor connector chains, leaving a dangling ref that poisons the view (RED-02) and a permanently unroutable connector | *Deleting a node leaves anchor-to-anchor connectors dangling and permanently unroutable* |
| RED-08 | Deleting a node leaks its `model.items` entry forever — orphans grow without bound and ship in every save and export | *Deleted nodes leak their model items — `model.items` grows forever and ships in every save* |
| RED-14 | Deleting a connector orphans any sibling anchored to its anchors — dangling ref, unroutable connector, and the view stops accepting edits (RED-02) | *Deleting a connector orphans any connector anchored to it (anchor-to-anchor)* |
| RED-15 | Hiding or locking a layer leaves the entities it covers in `selectedIds`, so Delete still removes items the user can no longer see or edit | *Hiding or locking a layer does not drop the entities it covers from the live selection* |
| SCN-03/04 | Paste keeps the original connector anchor ids, so one waypoint delete pinches both copies and the original's waypoint becomes unaddressable | *Paste does not regenerate connector anchor ids — the clone shares them with the original* |
| SCN-06 | Paste validates the view before rectangles/text boxes/labels are layered on, so a pasted rectangle with a dangling colour ref lands and poisons the view | *Paste validates the view before rectangles, text boxes and labels are added — so those land unchecked* |
| SCN-07 | The batch drag updaters enforce their "drag-only" contract by comment alone — an out-of-drag call moves the node for real with no undo entry and no validation | *The batch drag updaters are "drag-only" by convention only — an out-of-drag call is un-undoable* |
| SCN-08 | `previewConnectorPaths` bypasses the open transaction's pending state, so a preview issued inside a transaction is erased by the commit | *Connector previews written during a transaction are erased by the commit* |
| SCN-09 | A dangling `ui.view` makes the canvas render page 1 while every edit throws — the read facade falls back, the write facade does not | *A dangling active view makes reads and writes disagree* |
| SCN-10 | The RED-01 hole makes `useModelItem` throw for EVERY subscriber (consumer half of RED-01 — no separate entry) | *`deleteModelItem` corrupts the model…* |
| SCN-11 | One stale `ITEM` ref throws inside the delete transaction and discards the entire multi-delete | *One stale item reference discards an entire multi-delete* |
| SCN-12 | An invalid paste is abandoned with a console.warn and no notification — Ctrl+V appears to do nothing | *An invalid paste is abandoned silently — Ctrl+V appears to do nothing* |
| SCN-13 | New pages are named from `views.length`, so a delete in the middle makes the next page duplicate an existing name | *New pages can duplicate an existing page name* |
| SCN-14 | Pasting onto another page carries the source page's `layerId`, leaving a dangling layer ref no check catches | *Pasting onto another page carries the source page's layer assignment* |
| SCN-15 | Switching pages during async connector routing writes the old page's paths into the new page's scene (async sibling of D-9) | *Switching pages during async connector routing…* |
| CLIP-01 | Duplicate item / view ids pass every validation layer; one copy becomes permanently unreachable but is saved and re-exported | *Nothing enforces id uniqueness — duplicate item or view ids load clean…* |
| CLIP-02 | The load filter checks item refs only, so a connector anchored to a dropped connector's anchor survives and makes the WHOLE diagram refuse to open | *One connector with an unresolvable anchor-to-anchor ref makes the whole diagram refuse to open* |
| CLIP-04/05/06 | `useDirtyTracker` leaks a subscription per diagram open, never resets `isDirtyRef`, and ignores edits made in its 100 ms startup window | *`useDirtyTracker` leaks a subscription per diagram open, and the dirty flag is never reset* |
| CLIP-08 | A `preserveViewport` reload keeps the previous model's selection (INV-2), feeding SCN-11's throwing delete | *A `preserveViewport` reload keeps the previous model's selection* |
| CLIP-09 | Deleting a solo'd layer leaves its id in `previewLayerOverrides`, blanking the preview until a page switch | *Deleting a layer leaves it solo'd in the preview overrides — the canvas can go blank* |
| CLIP-10 | The single notification slot lets a success toast bury an unread error (ADR 0011 contract) | *The notification slot has no queue — a later toast silently buries an unread error* |
| CLIP-13 | `updateViewItem` accepts an `iconScale` outside the schema's `[0.1,3]`, so a group resize saves a diagram that then refuses to load | *A group icon-resize can commit a scale outside the schema cap, bricking the next load* |
| CLIP-14/15 | Unknown icon references and unbounded tile coordinates both pass schema + validateView | *Icon references and tile coordinates are unvalidated* |
| CTX-01 | A mouse palette drag released over a panel places the element at the tile the panel is covering (no over-canvas check on the mouse path at all) | *A mouse palette drag released over a panel places the element behind the panel* |
| CTX-03/04 | Panning drops the armed tool — always for a middle-drag, and for TEXTBOX/LABEL on a right-drag | *Panning drops the armed tool — always for a middle-drag, and for half the tools on a right-drag* |
| CTX-06 | The group resize box is drawn around items on a hidden layer (`TransformControlsManager` consults `lockedIds` but not `visibleIds`) | *The group resize box is drawn around items on a hidden layer* |
| CTX-15 | In view-only mode a left-click on a content-bearing item opens nothing — PAN owns the click, so the ADR-0012 popover is unreachable for a viewer | *In view-only mode a left-click on a content-bearing item opens nothing* |
| CONN-01/02 | The endpoint-reconnect mode has no way out — Escape restores nothing and leaves you in it; an off-canvas release neither commits nor exits | *The endpoint-reconnect mode has no way out* |
| CONN-04 | The connector’s end anchor is regenerated with a fresh id on every tile move while drawing | *The connector’s end anchor is given a brand-new id on every tile move while drawing* |
| CONN-07/13 | A stray click while the connector tool is armed commits a zero-length (drag mode) or half-attached (click mode) connector — the documented empty-click revert does not exist | *A stray click while the connector tool is armed leaves a permanent half-attached or zero-length connector* |
| CONN-10 | A node can be connected to itself — a zero-length self-loop that validates clean and saves | *A node can be connected to itself, producing a zero-length self-loop that validates clean* |
| CONN-11 | Two connectors between the same node pair get byte-identical routes, so the second is permanently unclickable | *Two connectors between the same pair of nodes get byte-identical routes* |
| CONN-15 | A connector can be anchored to a node on a locked (or hidden) layer — the connector hit-test has no interactability gate | *A connector can be anchored to a node on a locked layer* |
| SEL-01 | Arrow-nudging an off-grid item erases its sub-tile `offset` and snaps it to the grid (ADR 0023 offset-omission class, keyboard consumer) | *Arrow-nudging an off-grid item erases its sub-tile offset and snaps it to the grid* |
| SEL-02 | A connector-body drag splices its waypoint OUTSIDE the drag transaction — two history entries per gesture, and one undo leaves the stray waypoint | *Starting a drag on a connector body splices a waypoint outside the drag transaction* |
| SEL-04 | A mixed node + rectangle group dragged into a collision tears: the node is blocked, the rectangle keeps going, both commit | *A mixed node + rectangle group dragged into a collision tears apart* |
| SEL-07 | With a freehand-lasso selection live, Backspace in ANY text field deletes the canvas selection (the lasso delete branch skips the editable-target guard) | *A live freehand-lasso selection makes Backspace destructive in every text field* |
| TCH-02/03 | The long-press menu leaves `mouse.mousedown`/`mousedownItem` populated after the lift, and a tap-away inside 700 ms cannot dismiss it | *The long-press context menu leaves the press half-open, and cannot be dismissed for 700 ms* |
| TCH-04 | Pen hover produces no hover cursor, hover outline or `hoveredItem` — pen is routed into the touch machine, which drops moves without a press | *Pen hover does nothing — no hover cursor, no hover outline, no `hoveredItem`* |
| TCH-05 | A touch palette drag released back onto the Elements panel places a node at the tile behind the panel (rect containment, not hit-testing) | *A touch palette drag released back onto the Elements panel places a node behind the panel* |
| TCH-09 | A floating Label has no long-press menu on touch, and no fallback either — every Label command is unreachable by touch | *A floating Label has no long-press menu on touch — the press never reaches the gesture machine* |
| TCH-12 | Double-tapping a text box opens the Details deck instead of the on-canvas editor — touch cannot edit text at all | *Double-tapping a text box opens the Details deck instead of editing it* |
| TCH-14 | Cancelling one finger mid-pinch strands the other: no pan, no zoom until it lifts (`onTouchPointerUp` demotes to pan, `onTouchPointerCancel` does not) | *Cancelling one finger during a pinch strands the other* |
| PTR-07/08 | A tool hotkey or Ctrl+A during a connector draw strands the half-drawn connector (self-anchored, unabortable, and Ctrl+A selects it) | *A tool hotkey or Ctrl+A during a connector draw strands the half-drawn connector* |
| PTR-11 | The arrow keys nudge items on a locked layer (the mouse path is gated, the keyboard path is not) | *The arrow keys nudge items on a locked layer* |
| PTR-10 | An undo taken mid-drag is unrecoverable — the gesture’s commit clears the redo stack | *An undo taken during a drag is unrecoverable — the gesture’s commit destroys the redo entry* |
| PTR-05 | An open modal dialog does not shield the canvas — Delete destroys the selected item behind it | *An open modal dialog does not shield the canvas — Delete destroys the item behind it* |
| PTR-12 | Ctrl+C over any non-input text selection is preventDefaulted, so copying text out of the app silently does nothing | *Ctrl+C is hijacked everywhere — copying text out of the app silently does nothing* |
| PTR-14 | Ctrl+Shift+] / Ctrl+Shift+[ (bring to front / send to back) are dead on a real keyboard — the guard tests `e.key`, which is `}`/`{` when shifted; `z-order.spec.ts` is a false green | *Ctrl+Shift+] / Ctrl+Shift+[ … do nothing on a real keyboard* |
| PTR-01/02/03 | Read-only (`EXPLORABLE_READONLY`, the `/display` viewer route) is fully keyboard-editable — tool hotkeys arm drawing tools, Delete destroys items, Ctrl+C/V duplicates them | *Read-only mode is keyboard-editable — the keydown dispatcher has no `editorMode` gate* |
| PROJ-01/02/04 | The project bounding box mis-frames the diagram: text boxes extend the wrong way in tile-Y, floating labels are not enumerated, and a pixel extent gets the inclusive tile-count +1 (fit-to-view and Export Image both) | *The project bounding box mis-frames the diagram: text boxes extend the wrong way, labels are not counted* |
| PROJ-05 | A 2D Y-orientation text box draws one tile thick but claims its full row count, so multi-row boxes paint outside themselves and empty canvas beside them is clickable | *A 2D Y-orientation text box draws one tile thick but claims its full row count* |
| PROJ-10 | Clicking two stacked nodes selects the one drawn underneath — item hit-testing scans `scene.items` array order and ignores zIndex/layer/isoDepth (the rectangle branch of the same function does sort) | *Clicking two stacked nodes selects the one drawn underneath (item hit-testing ignores z-order)* |
| PROJ-12 | Selecting a connector attached to an off-grid node makes the wire jump at that node — only the DOM renderer applies `connectorEndpointVertexDelta`, the WebGL bulk path never reads `offset` | *Selecting a connector attached to an off-grid node makes the wire jump at that node* |
| GL-02/05/12 | The chip atlas has no eviction: every rename or restyle leaks a slot, and when it finally overflows the affected chips are skipped with no signal and no scheduled rebuild (a small `MAX_TEXTURE_SIZE` brings it much closer) | *The chip atlas has no eviction — renaming nodes leaks slots until labels stop drawing* |
| GL-07 | A GPU layer whose sprite batch fails to build renders nothing, permanently, behind a capability gate that has already passed — one `console.warn` and no retry | *A GPU layer that fails to build renders nothing, silently* |
| GPU-04 | A floating Label paints at any zoom but its hit proxy is gone below 0.4 — visible, and completely inert | *A floating Label is visible but inert below zoom 0.4* |
| RND-01 | Fit-to-view clamps only the UPPER zoom bound, so a large diagram fits below `MIN_ZOOM` (0.083 at 100 tiles) — a zoom no button, wheel or pinch will produce, and the first pinch snaps it away | *Fit-to-view can zoom below the floor every other zoom path enforces* |
| RND-02 | Hiding a layer removes its connectors' bodies but leaves their label chips painted — `ConnectorLabels` is the one scene layer that never consults `useLayerContext` | *Hiding a layer leaves its connectors' label chips on the canvas* |
| RND-04 | The hybrid promotion keys are comma-joined id strings, so an imported id containing a comma is neither promoted to the DOM overlay nor skipped on the bulk — the node has no drag preview and freezes until release | *An imported element whose id contains a comma has no drag preview* |
| RND-05 | Below the label LOD zoom the bulk drops every name chip while the DOM-promoted (selected) node keeps its own — one labelled node on a nameless diagram | *Below the label LOD zoom the selected node still shows its name* |
| RND-06 | Fit-to-view measures the renderer container, which the docks overlay — after a fit the leftmost content sits behind the Elements panel | *Fit-to-view frames the diagram into the whole window, docks included* |
| RND-07 | A link inside a resting text box is unclickable: the full-viewport interactions box is mounted above the TextBoxes layer, so ADR 0034's `#diagram:` navigation handler is unreachable code | *A link inside a text box cannot be clicked* |
| RND-09 | Fit-to-view does not reserve room for a raised node name chip (+280 px vs 3 tiles of padding) — a fourth omission in `getProjectBounds` | *The project bounding box mis-frames the diagram…* → item 4 |
| RND-13/15 | Hybrid promotion restacks: a selected or dragged element is drawn in a DOM overlay mounted above its bulk canvas, so it jumps in front of every node — and of the floating-Label canvas — until deselected | *Selecting an element restacks it above the rest of the diagram* |
