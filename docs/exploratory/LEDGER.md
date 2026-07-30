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
| R5 | [DOM overlays & presentation parity (labels, hit proxies, grid, compositor)](areas/R5-dom-overlays-parity.md) | DONE | 13 / 10 | 7 | 0 | 9/23/14 |
| A1 | [Diagram lifecycle: open/save/dirty/autosave state machine](areas/A1-diagram-lifecycle.md) | DONE | 15 / 10 | 14 | 0 | 10/20/14 |
| A2 | [Storage providers & places model (local/session/Drive, move-to-Drive)](areas/A2-storage-places.md) | DONE | 15 / 10 | 13 | 1 | 17/7/8 |
| A3 | [Project ZIP & import/export (JSON, ZIP, image)](areas/A3-zip-import-export.md) | DONE | 15 / 10 | 11 | 1 | 9/9/6 |
| A4 | [File explorer, folders & multi-diagram management](areas/A4-file-explorer-multidiagram.md) | OPEN | 0 / 10 | 0 | 0 | 9/3/14 |
| A5 | [App chrome: boot, dialogs, settings, i18n, theming, storage hygiene](areas/A5-app-chrome-boot-i18n.md) | OPEN | 0 / 10 | 0 | 0 | 10/6/14 |
| S1 | [Google identity & token lifecycle (GIS auth store, gates)](areas/S1-google-identity-auth.md) | DONE | 16 / 10 | 12 | 1 | 7/7/6 |
| S2 | [Share backend: session snapshots, routes, Express/Worker parity](areas/S2-share-backend.md) | DONE | 15 / 10 | 12 | 1 | 9/6/9 |
| S3 | [Drive-native sharing & readonly preview ladder](areas/S3-drive-sharing-preview.md) | DONE | 15 / 10 | 10 | 1 | 10/14/9 |
| F1 | [Text, labels-as-text & rich-text editing (inline canvas edit, notes, sanitization)](areas/F1-text-richtext-editing.md) | DONE | 16 / 10 | 10 | 1 | 0/9/12 |
| F2 | [View/preview/presenter modes & annotation overlay](areas/F2-view-modes-annotations.md) | DONE | 13 / 10 | 9 | 2 | 0/14/16 |
| F3 | [Styling system (docked strip, bulk styling, color picker, style round-trips)](areas/F3-styling-system.md) | DONE | 10 / 10 | 3 | 3 | 0/6/9 |
| F4 | [Layers panel & z-order (visibility, locking, assignment, ordering)](areas/F4-layers-zorder.md) | DONE | 10 / 10 | 4 | 0 | 0/17/16 |
| F5 | [Icons & catalog (packs, custom icons, merge-on-load, icon resize)](areas/F5-icons-catalog.md) | DONE | 10 / 10 | 6 | 0 | 0/7/11 |

## Wave order (suggested)

Engine (E1–E4) and interaction (I1–I5) first — highest seam density and everything downstream depends on them; then rendering (R1–R5), app shell (A1–A5), share/backend (S1–S3), feature cuts (F1–F5). Any order is fine as long as LEDGER stays current; areas are independent by design.

## Infrastructure status

- [x] `packages/axoview-e2e/playwright.explore.config.ts` + `fixtures/explore.fixture.ts` (console/pageerror oracle, `expectStoreInvariants`, schema oracle) — built 2026-07-29
- [x] `packages/axoview-lib/jest.explore.config.js` + `'/__explore__/'` added to the default config's `testPathIgnorePatterns`
- [x] Root scripts: `explore:e2e`, `explore:unit`
- [x] First shared-oracle helper landed and used by ≥1 probe (`tests-exploratory/_rig/rig.explore.spec.ts`)
- [x] **Backend + worker T1 rigs** — `packages/axoview-backend/jest.explore.config.js` and `packages/axoview-worker/jest.explore.config.cjs` + root scripts `explore:unit:backend` / `explore:unit:worker` — built 2026-07-30 for S2. **Zero touch to existing configs:** both default configs already carry an explicit `testMatch` scoped to `__tests__/**`, so an `__explore__` tree can never be swept in (unlike the lib and app configs, which had no `testMatch`). Verified after the touch: backend default suite 7 suites / 102 tests, worker 4 / 124 — both green and unchanged. Backend is native ESM — the `jest` global is NOT injected, so `jest.setTimeout` throws; pass a per-test timeout as the third `test()` argument instead.
- [x] **Real-Express T2 tier** — `share-08-09-10-14.explore.spec.js` boots the actual `server.js` as a child process against a temp `STORAGE_PATH` and speaks HTTP to it (readiness polled on `/healthz`, `node:http` where a header browsers forbid must be set). `server.js` calls `app.listen()` at import and exports nothing, so a child process is the only way to reach the middleware stack without touching product code — this is what closed the baseline's "Express wiring itself is untested" gap.
- [x] **App-package T1 rig** — `packages/axoview-app/jest.explore.config.js` + `'/__explore__/'` added to `packages/axoview-app/jest.config.js`'s `testPathIgnorePatterns` + root script `explore:unit:app` — built 2026-07-30 for the S/A tracks, whose code lives in `axoview-app`, not `axoview-lib`. Same three-line shape as the lib config. **Quarantine verified:** the default app Jest lists the same 26 files before/after, and `npm test --workspace=packages/axoview-app` stays 26 suites / 268 tests green. Shared harness: `src/__explore__/S1/harness.ts` — `resetAuth()` (also drains the MODULE-level `pendingAuthTimeout`), `installBridge()`, `seedNearExpirySession()`/`seedHealthySession()`, `waiterCount()`, and `settle()`, a timer-free "did this promise settle?" oracle (what AUTH-01 needed).

**Quarantine verified 2026-07-29:** default lib Jest lists the same 155 files before/after the `testPathIgnorePatterns` touch; the default Playwright config lists 178 tests in 75 files, none under `tests-exploratory/`. Probe artifacts nest under the already-gitignored `test-results/explore` and `playwright-report/explore`.

**Rig note — a probe that throws during SETUP reports as a confirmed bug.** `it.failing` / `test.fail()` only distinguish pass from fail, so any environment or provider error inside the body looks like evidence. Two traps found so far: (a) jsdom has no canvas 2D context; (b) `useCopyPaste` needs `<ClipboardProvider>` (`ClipboardProviders` in `__explore__/E3/harness.tsx`). **Always pair an `it.failing` with a passing characterization test that positively asserts the observed end state** — that is what caught both. Specifically:

**jsdom has no canvas 2D context.** `getTextBoxDimensions` throws `Could not get canvas context`, so ANY T1 probe touching text boxes must call `installCanvasStub()` (`src/__explore__/canvasStub.ts`) first. This is a campaign-specific trap: an `it.failing` probe whose body throws during *setup* reports as a confirmed bug. Two E1 probes were briefly recorded on that false evidence on 2026-07-29 and re-verified with the stub (verdicts unchanged, now backed by explicit characterization tests). `canvasStub.explore.test.ts` guards the stub itself.

**Oracles available to probes** (`fixtures/explore.fixture.ts`): `exploreTest` (blank-diagram boot) / `exploreAppTest` (raw `/app` boot), both auto-asserting the console/pageerror oracle in teardown; `expectStoreInvariants(page)` (INV-1…INV-12), `expectSchemaClean(page)`, `expectModelHealthy(page)` = both. **INV-11 added by I1/PTR-11** (no `selectedIds` entry may sit on a hidden or locked layer); **INV-12 added by R4/RND-12** (every connector on the active view has a scene entry — without one it renders on neither side of the DOM/GPU hybrid while staying hit-testable). **Grow INV-* as areas confirm cross-store bugs.**

## Standing threads from the share/backend block (S1-S3)

Recorded 2026-07-30. A new area should ask whether its surface reproduces these
rather than re-deriving them.

S-a. **The exit ramps are one function written several times, and each forgets a
different part of the ritual.** `signOut` / `markExpired` / `markDriveScopeMissing` /
`_onToken`'s scope-less hard stop all park the auth session, and between them they
drop waiter draining, timeout clearing, `_absorbStaleError` and the profile hint in
different combinations (nine of S1's twelve bugs). Same shape at the route layer:
`deleteDiagram` cascades to the public snapshot, the soft delete the UI actually
performs does not (SHARE-06). Whenever an area has several ways to reach one state,
diff the rituals.

S-b. **Nothing serialises a read-modify-write.** `folders.json` (SHARE-03) and
`shareDiagram` (SHARE-04) both read, mutate and write with no lock or version; the
adapter's tmp+rename gives file atomicity, which is the wrong granularity. The
existing suites are all sequential, so `Promise.all` of two identical calls is a
one-line probe that no area has run yet.

S-c. **The wiring around a well-tested handler is where the handler's contract
dies.** `routes.js` has 111 tests and returns `{error}` JSON throughout; the Express
app has no error middleware, so body-parser failures return HTML with a stack trace
(SHARE-08), and CORS withholds the response without blocking the request (SHARE-09).
Test the middleware stack, not just the handler.

S-d. **A typed failure is only as good as what the caller does with it.** Every S3
bug but one is caller-side: the ladder classifies four terminal causes and the gate
renders one message (DRV-02), the Picker distinguishes wrong-file from cancel and the
gate does not (DRV-03), `afterGrant` decides recoverable-vs-terminal and nothing ever
clears it (DRV-01). The service-level suites all stop at the return value.

S-e. **Enum coverage stops at the values the happy path produces.** `type:'domain'`
is declared and unhandled (DRV-04); `meta.size` absent reads as zero (SHARE-07); a
proxy 400 is unclassified (DRV-12). For any union an area touches, enumerate the
declared values and check each has a branch.

S-f. **Two harvested "invariants" were stale.** The worker's resourceKey allowlist is
`{1,120}`, not the `{10,120}` [coverage-baseline.md](coverage-baseline.md) records
(DRV-11), and `getFileShareMeta` — the only reader of `resourceKey` — has no caller at
all (DRV-15). Verify a harvested invariant against the source before building a probe
on it.

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
| AUTH-13 | Should a profile hint with no usable `email` arm the boot reconnect at all? | **OPEN** — `loadProfileHint()` validates `name`'s type only, and `fetchUserInfo` persists `email: data.email &#124;&#124; ''`, so an email-less hint arms the very hint-less `prompt:''` the `login_hint` exists to avoid; recommendation in the area file |
| DRV-05 | How should a partially-failed link revocation be reported? | **OPEN** — `setAnyoneWithLink(false)` deletes anyone-permissions serially with no rollback and the dialog skips its refresh on a throw, so a mid-loop failure leaves the file link-readable with a pre-delete list on screen; damaging only when a file carries >1 `anyone` entry, which Drive rarely produces. Recommendation (a `catch`-side refresh either way) in the area file |
| SHARE-10 | Should `ENABLE_SERVER_STORAGE=false` revoke already-published share links? | **OPEN** — as-built the public snapshot read is exempt (`requireStorage:false`) so links keep serving while every other route 503s, and `DELETE …/share` 503s too, leaving no route to revoke. Either reading is defensible; the asymmetry is not. Recommendation in the area file |
| STYL-02 | Should a mixed multi-selection show an indeterminate format state, and should one press APPLY rather than clear? | **OPEN** — today the button shows the representative's value and one press clears the format everywhere; every peer tool treats mixed as "apply to all". Falls out of the STYL-01 fix. Recommendation in the area file |
| STYL-03 | Which representation is "no colour" — the string `'transparent'` or an absent field? | **OPEN** — rectangle fill/border write the sentinel, label/text-box background and text-box border delete the field; both work, neither is written down. The rectangle BORDER genuinely needs the sentinel (absent derives a stroke), so the rule is not "always absent". Recommendation in the area file |
| STYL-08 | Should the bulk representative be the first selected item, or something stable? | **OPEN** — `bulk.ids[0]` is `selectedIds[0]`, which for a lasso is scene order; reversing the same selection changes what the strip shows and (with STYL-01/02 unfixed) what it writes. Recommendation in the area file |
| VIEW-08 | Should `canvasMode` be one shared preference, or scoped per surface (editor vs `/display` viewer)? | **OPEN** — one `axoview_user_settings.canvasMode` is shared by both toggles through `useCanvasModeToggle`, so a viewer's choice is the projection the editor then opens in. Recommendation (keep shared, fix the doc wording) in the area file |
| VIEW-13 | Should the annotation palette's Clear be undoable? | **OPEN** — it drops every stroke AND the redo stack in one write, beside the palette's own Undo/Redo pair. Falls out of the VIEW-07 operation-log fix for free |
| TXT-07 | Should a floating Label follow the text box's empty-entity lifecycle instead of keeping the placeholder word "Label"? | **OPEN** — placed-then-Escape leaves a literal `Label` chip, and clearing the text then committing silently restores it; both are deliberate in code but are the opposite of what the same two gestures do to a text box, and the revert is silent. Recommendation in the area file |
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
| OVL-02 | The readable-labels counter-scale is computed from the base-font CONSTANT by both consumers, so an enlarged label is scaled up again and a shrunken one is left illegible | *The "keep labels readable" scale ignores a node's own label font size* |
| OVL-03 | `useImageAspect` has no `onerror`, so a dead icon url leaves the ADR-0044 selection outline square forever and is re-fetched on every mount (the mirror of GPU-03) | *The selection outline has no icon-load failure path and re-fetches dead urls* |
| OVL-06 | In present mode a node's name chip has no hit proxy — no link card, no notes hover — while a floating Label's does | *A node's name chip is inert in present mode while a floating Label's is not* |
| OVL-10 | The placement ghost anchors at the bare tile and ignores the ADR-0023 residual, so with snap off it previews the wrong cell | *The placement ghost ignores the off-grid residual* |
| OVL-12 | `NodeLabelHitLayer` does not apply the readable-labels counter-scale its sibling `LabelHitLayer` does — the chip grows, the grab box does not | *The node-name grab box does not follow the readable-labels counter-scale* |
| OVL-13 | `NodeLabelHitLayer` filters `visibleIds` but never `lockedIds`, so a locked layer still exposes its nodes' label drag and inline rename | *A locked layer still exposes its nodes' label drag and rename handles* |
| DRV-01 | `driveAfterGrantRef` is cleared only when the route unmounts, so after one Picker pick a not-yet-propagated Drive grant maps 403/404 to terminal `not-found` — and the terminal state's only action navigates away from the link | *A slow Drive grant turns the Picker rung into a dead end* |
| DRV-02 | Trashed, too-large, post-grant 403 and post-grant 404 all collapse into `not-found`, so four causes — two of them not what it says, one of them fixed by waiting — render one generic message | *Four different reasons a shared Drive diagram will not open render one message* |
| DRV-03 | A Picker pick of the wrong file resolves `'cancelled'`, the same value as a deliberate cancel, and the gate has no branch for it — the viewer gets the same wall with no message | *Picking the wrong file in the Drive Picker does nothing and says nothing* |
| DRV-04 | `getAccessOverview` reasons about `anyone`/`user`/`group` but not `type:'domain'`, so a diagram the whole Workspace domain can open reports as restricted with nobody on it | *A domain-shared Drive diagram is reported as "restricted"* |
| DRV-06 | The toolbar's quick-copy shows the SUCCESS toast when the ACL read FAILED (`shared &#124;&#124; !driveOverview`) while the Manage dialog warns on the same unknown — two copy paths, opposite truthfulness | *Copying a Drive link reports success when the app could not read the access list* |
| DRV-07 | The anonymous read proxy's 200 carries `Cache-Control: public, max-age=60`, so un-sharing a diagram leaves it readable from a viewer's browser for a minute — and `public` authorises shared caches too | *Revoking a Drive share link leaves the diagram readable from cache* |
| DRV-08 | `runAction` swallows the throw, so `handleAdd`'s tail always runs: a failed add clears the typed email and writes it into the autocomplete history, indistinguishable from success | *A failed "add person" clears the email field and remembers the address anyway* |
| DRV-09 | An in-diagram link on a shared route navigates to `/display/<id>` with the OWNER's id, resolved against the recipient's own storage — a dead link with generic failure copy | *A link inside a shared diagram dead-ends for the recipient* |
| DRV-12 | A proxy `400 bad-file-id` is unclassified and falls through, so a truncated Drive link walks the viewer through sign-in and then a Picker grant for an id Drive rejects as malformed | *A malformed Drive link asks the viewer to sign in and then to grant access* |
| DRV-14 | `LocalStorageProvider.shareDiagram` throws a bare `Share failed: <status>` and the toolbar renders `err.message` verbatim, so a diagram deleted between open and share shows the user `Share failed: 404` | *A failed share shows the raw string "Share failed: 404"* |
| SHARE-01 | A full PUT save replaces the whole document, so the first autosave after sharing strips `shareUuid` — the live snapshot is orphaned and the next Share mints a second uuid neither unshare nor delete can reach | *The first autosave after sharing orphans the public snapshot* |
| SHARE-02 | `assertId` accepts the reserved keys the fs adapter flattens into, so `PUT /api/diagrams/folders` overwrites the entire folder tree with a diagram document — and `listDiagramMeta` hides the diagram that did it | *A diagram id can overwrite the folder tree — reserved storage keys are not reserved* |
| SHARE-03 | Every folder route read-modify-writes the whole `folders.json` with no lock, so two concurrent requests both report success and one is silently discarded | *Concurrent folder writes silently lose one another (folders.json has no locking)* |
| SHARE-04 | Two overlapping shares each mint a uuid and publish a snapshot; only one is recorded, leaving a live public snapshot no unshare or delete can reach | *Two simultaneous shares publish two snapshots and record one* |
| SHARE-05 | A non-recursive folder delete removes only the target row, leaving child folders with a dangling `parentId` and their diagrams unswept — invisible in the tree but still published | *A non-recursive folder delete orphans its whole subtree* |
| SHARE-06 | The file explorer's delete is a PATCH soft-delete that preserves `shareUuid`, so trashing a shared diagram leaves its public link serving — and Unshare lives on the open diagram, which a trashed one cannot be | *Trashing a shared diagram leaves its public link live, and unreachable* |
| SHARE-07 | The worker read proxy's cap is `Number(meta.size ?? '0')`, so a Drive file reporting no size (or a non-numeric one) passes as 0 bytes and streams unbounded — its `trashed` sibling on the same read fails closed | *The anonymous Drive proxy's 10 MB cap is skipped when Drive reports no file size* |
| SHARE-08 | Express mounts no error middleware, so a malformed or oversized body returns an HTML error page with a stack trace instead of the `{error}` JSON every client parses — the worker's `bodyLimit`/`onError` sibling gets both right | *A malformed or oversized request body returns an HTML error page with a stack trace* |
| SHARE-09 | CORS withholds the response, not the request: a CORS-safelisted cross-origin POST publishes snapshots and creates documents on the default `AUTH_MODE=none` deployment with no preflight to refuse | *The CORS allowlist does not stop cross-origin writes — a web page can publish your diagrams* |
| SHARE-11 | The snapshot's hand-written field whitelist drops `requiredPacks` (plus `description`/`version`), and with lean-save having stripped the pack icons the viewer's fallback resolver cannot recover them — a shared diagram renders with unresolved icons | *A shared diagram loses its icon packs and its description* |
| SHARE-12 | The `/display/p` dead-end tells whoever opens the link to "Deploy via Docker or Cloudflare" — operator advice shown to recipients, and false for Cloudflare, which hardcodes `serverStorage:false` | *A share link opened on the wrong deployment tells the recipient to deploy a server* |
| SHARE-15 | `patchDiagram` does not protect `shareUuid`, so one diagram can be pointed at another's snapshot — unsharing it kills the victim's link, re-sharing republishes the victim's link with the impostor's content | *A PATCH can point one diagram at another's share link, or publish over it* |
| AUTH-01 | `markDriveScopeMissing()` drains no waiters and clears no timeout (its `markExpired()` sibling does both), so a scope-403 during a refresh leaves the awaiting Drive write pending forever — no error, no toast, no timeout | *A Drive scope-403 during a token refresh hangs the awaiting write forever* |
| AUTH-02 | `grantDriveAccess()` pins `_absorbStaleError: false` where `signIn()` derives it, so completing the consent screen can end in UNAUTHENTICATED + a "Sign-in cancelled" toast with the grant discarded | *"Grant Drive access" can end in a signed-out session with a "Sign-in cancelled" toast* |
| AUTH-03 | The stuck-popup timeout routes through `_onError`, which absorbs it when a superseded silent request is flagged — the timer is consumed, nothing re-arms, and AUTHENTICATING becomes permanent (reload-only recovery) | *The stuck-popup auth timeout is swallowed by the stale-error absorber* |
| AUTH-04 | `markExpired()` has no in-flight guard: a stale Drive 401 during an interactive sign-in flips to SESSION_EXPIRED, pushes a second expired toast mid-popup, and discards the grant the user then completes | *A stale Drive 401 during sign-in discards the sign-in the user just completed* |
| AUTH-05 | A failed `userinfo` fetch leaves `user` null, and `AuthControl` gates the signed-in branch on `!!user` — a working Drive session renders the never-signed-in person icon with no sign-out affordance and no remembered account | *A userinfo failure makes a working Google session render as signed out, with no way to sign out* |
| AUTH-06 | The scope-less hard stop `resolve()`s its waiters, which then read the token it just nulled, so in-flight Drive writes fail "Not signed in to Google" (401) at the same instant the blocking re-consent dialog opens | *A scope-less grant fails in-flight Drive writes as "Not signed in" behind the re-consent dialog* |
| AUTH-07 | `signIn()` is not idempotent — a second click (LocalModeBanner, the expired toast) opens a second GIS popup, and closing the first cancels the second's grant | *A second sign-in click opens a second Google popup, and closing the first cancels it* |
| AUTH-08 | `request()` throws status 403 for both the retriable rate-limit and the permanent scope case, and the one consumer that acts on a 403 treats it as missing scope — an exhausted rate limit parks a healthy session in DRIVE_ACCESS_REQUIRED and nulls a valid token | *An exhausted Drive rate limit is mistaken for a missing scope and parks the session* |
| AUTH-09 | The provider wires 401→`markExpired()` but has no 403→`markDriveScopeMissing()` twin, so an out-of-band scope revocation reaches the re-consent dialog only from "New diagram" — save, load, list, rename and the manifest all dead-end | *A revoked Drive scope only reaches the re-consent dialog from "new diagram"* |
| AUTH-11 | `DriveDisplayGate.handleSwitchAccount()` signs out before signing in, so cancelling the chooser leaves the viewer strictly worse off — the gate loses the email it was explaining with and the avatar's reconnect affordance | *Cancelling "Use a different Google account" signs the viewer out of the account that was working* |
| AUTH-12 | `markDriveScopeMissing()` keeps the profile hint its `_onToken` twin deliberately clears, so reloading out of the blocking dialog re-arms the boot reconnect straight back into it | *A mid-session Drive scope loss keeps the account remembered, so a reload walks back into the blocking dialog* |
| AUTH-16 | `signOut()` clears neither the `axoview-drive-root` cache nor the provider's in-memory `rootFolderId`, so a second account reads and writes into the first account's Drive folder for the life of the page | *Signing in as a second Google account reuses the first account's Drive root folder id* |
| OVL-14 | `NUDGEABLE_TYPES` omits LABEL, so arrow keys pan instead of moving a selected Label — and a mixed node+Label selection comes apart | *Arrow keys cannot move a floating Label — they pan the canvas instead* |
| TXT-01/02 | A multi-row text box whose rows are plain-text newlines or `<div>`/`<br>` measures ONE row tall (and, for plain text, all lines wide) — selection outline and hit area cover only the first row | *A multi-row text box whose rows are not `<p>`/`<li>` measures one row tall* |
| TXT-04 | Undo after abandoning a new text box brings back an invisible 1×1 ghost box — selectable, saved, exported | *Undo after abandoning a new text box brings back an invisible ghost box* |
| TXT-05 | A Layers rename moves a node's canvas text for a node created in-session (`seedNodeLabel` is a load-path-only seed, and the render still falls back `label ?? name`) | *Renaming a node in Layers moves its canvas text — but only until the diagram is reloaded* |
| TXT-06 | Pressing any strip control mid-inline-rename ends the session — `useInlineRename` has no strip/portal allowlist, its `TextBoxInlineEditor` sibling does | *Pressing any strip control while renaming a label ends the rename* |
| TXT-08 | Escape after a mid-session strip change keeps the element-level half (vertical align, size, spacing) and discards the Quill-routed half — visible inside a single alignment control | *Escape after a mid-edit style change keeps half of it* |
| TXT-09 | ZIP/JSON import rewrites diagram ids but not the `#diagram:<id>` hrefs inside text-box content HTML — imported in-text diagram links dead-end | *An imported project's in-text diagram links point at the diagrams you imported FROM* |
| TXT-13 | Strip B (on) then B (off) over a partly-bold text box unwraps EVERY bold run — two presses flatten per-word formatting | *Two strip presses flatten a text box's per-word formatting* |
| TXT-14 | A text box whose plain text starts with `<` loses that token to the HTML sniff + sanitizer, permanently after one load; the claimed escape guard is unreachable | *A text box whose text starts with '<' silently loses that token* |
| TXT-15 | The empty-box discard calls `setItemControls(null)`, which does not clear `selectedIds` — the deleted box stays selected (INV-2) | *Discarding an empty text box leaves it selected — `setItemControls(null)` is a half-deselect* |
| VIEW-01/02 | Annotation ink survives a diagram switch and a page switch — neither `resetUiState` nor `setView` owns the `annotation` slice | *Annotation ink follows you to the next diagram, and to the next page* |
| VIEW-03 | An iso↔2D switch re-projects the diagram out from under the ink (strokes are scene-canvas px, the overlay rebuilds on scroll/zoom only) | *Switching projection leaves the annotation ink behind* |
| VIEW-04 | A click with the pencil/highlighter commits an invisible 1-point stroke — the shape/segment branch rejects the same degenerate case | *A click with the annotation pen leaves an invisible stroke* |
| VIEW-05 | `INFO_TYPES` has no `'LABEL'`, so a floating Label's link/notes are unreachable in present mode — while `deriveItemInfo` handles the type completely | *A floating Label's link and notes are unreachable in present mode* |
| VIEW-06 | `toHref` prefixes `mailto:`/`tel:`/`#` into dead `https://…` URLs; its sibling `normalizeWebLinkUrl` passes them through | *The view-mode popover mangles a mailto: or tel: link* |
| VIEW-07 | Erasing an annotation stroke is not undoable and the next Undo destroys a different stroke; an erase also wipes a pending redo | *Erasing an annotation stroke cannot be undone — and Undo then deletes a different one* |
| VIEW-09 | `setHideViewControls` has no caller anywhere (dead feature), and wiring it as-is strands an armed annotation tool with its palette gone | *"Hide view controls" has no writer, and would trap an armed annotation tool if it did* |
| VIEW-11 | `ItemControlsManager` forwards `readOnly` to the node branch only — connector/text box/label/rectangle panels are fully editable in view mode | *Every element panel except the node's is fully editable in view mode* |
| STYL-01/06 | Bolding a multi-selection wipes its italic/underline/strike — the label branches fan out the representative's whole format quartet, and the text-box branch takes its direction from the representative too | *Bolding a multi-selection wipes its italic and underline* |
| STYL-05 | The text-box border OPACITY slider does not seed a default `borderColor` the way its style/width siblings do, so it renders nothing and leaves an orphan value | *The text-box border opacity slider does nothing on a box with no border* |
| LAY-01 | `layer.order` reaches the paint key for NODES only — reordering layers moves nodes and leaves labels/rectangles where they were | *Reordering layers moves the nodes and nothing else* |
| LAY-03 | There is no active-layer concept: every newly placed element lands unassigned, whatever the Layers panel shows as selected | *New elements never join a layer* |
| LAY-05 | Deleting a hidden layer unassigns its members, and an unassigned entity is unconditionally visible — so the delete reveals everything the layer was hiding | *Deleting a hidden layer reveals everything it was hiding* |
| LAY-11 | `assignLayerToItems` filters by bare id across all five entity collections, so an id shared by two entities moves both (CLIP-01's newest consumer) | *Assigning a layer moves every entity that shares the id* |
| ICON-01/02 | ADR 0003 lean-save exists twice and the export half is inert (the lib's bundled-fixture list is empty), so "Export as JSON" writes the whole icon catalog | *"Export as JSON" writes the entire icon catalog into the file* |
| ICON-04 | `loadEnabledPacks` guards the JSON parse but not the shape, so a corrupt preference reaches `loadIconPack` and throws `Unknown icon pack` on every boot | *A corrupt icon-pack preference breaks icon loading instead of falling back* |
| ICON-05 | `iconPackManager`'s localStorage readers are unguarded, unlike the lib's `persistedSettings`, so a blocked store crashes them | *The icon-pack manager crashes when localStorage is unavailable* |
| ICON-06 | `scanIconUsage` skips soft-deleted diagrams, so the icon-delete gate reports "unused" for an icon a trashed diagram still references | *Deleting an icon says it is unused when only a trashed diagram uses it* |
| ICON-08 | On a resized node the drawn icon extends outside its one-tile footprint and that visible area is inert — ADR 0044's visual-only resize vs the tile-sized hit test | *A resized icon is only clickable on its original tile* |
