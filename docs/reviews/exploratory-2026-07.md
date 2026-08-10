# Exploratory testing campaign — 2026-07 (frozen review)

**Status:** Frozen-on-publish 2026-08-09 · campaign CLOSED 2026-07-30 · remediation program CLOSED 2026-08-09 · **Owner:** molikas

A hypothesis-and-verification exploratory campaign over all 27 functional areas of
Axoview, and the seven-wave remediation program that fixed what it found. This
single file is the campaign's durable record, in the frozen-review style: it
replaces the former `docs/reviews/exploratory-2026-07/` working tree (LEDGER, 27
area files, APPROACH, DECISIONS, coverage-baseline), which was **deleted
2026-08-09 — git history is the archive** for the per-hypothesis tables, the
per-bug evidence and the method document. Per-bug detail lives in
[known_issues.md](../../known_issues.md) (`Found by: exploratory campaign <ID>`);
the method lives on as the [`/explore`](../../.claude/commands/explore.md) skill,
governed by [ADR 0047](../adr/0047-exploratory-testing-program.md).

**The one section here that is not frozen is [the delta anchor](#delta-anchor--last-sweep)** —
`/explore`'s delta mode reads it and each sweep updates it as its last act.

## Results

| | |
|---|---|
| Counted hypotheses | 385 (383 area rows + 2 cross-area mop-up) |
| Bugs confirmed | 240 |
| Product questions raised | 22 — all ruled 2026-07-30 ([rulings below](#owner-rulings-2026-07-30)) |
| `known_issues.md` entries | 190 at campaign close; 204 tagged entries as of this freeze (remediation filed splits and corrections) |
| Areas | 27, all DONE, plus one cross-area mop-up wave |
| Remediation | waves 0–7 on `remediation/exploratory-campaign` (PR #86); ~15 class gates, each red-verified |
| Final tally | 204 filed `known_issues` entries; all Fixed **except 4 accepted open by owner ruling** ([tally below](#final-tally-2026-08-10-mop-up)) |

Every confirmed bug carried a committed `it.failing` / `test.fail()` repro in the
quarantined probe lane. As fixes landed, each probe was promoted to a main suite
or retired with a recorded reason (the ADR 0047 §2 flip rule); between campaigns
the lane holds only open-bug repros plus the named reusable rigs.

## Heat map

Hypotheses and bug counts from the campaign ledger; entry counts from
`grep "Found by:" known_issues.md` by ID prefix (an entry can cover several
hypothesis IDs, so entries ≤ bugs).

| Area | Scope | Hyp. | Bugs | Entries | Dominant defect classes |
|---|---|---|---|---|---|
| E1 | History & undo/redo engine (dual-store patches) | 15 | 9 | 8 (HIST) | dual-stack skew / independent trimming · leaked history brackets · global history vs per-view scene · dead grouping API |
| E2 | Reducers & cross-store cascades | 15 | 10 | 9 (RED) | delete-cascade omissions feeding the poison-view amplifier · identity/range unvalidated · selection not re-validated on layer change |
| E3 | Scene actions, transactions & paste assembly | 15 | 12 | 10 (SCN) | ids not regenerated on copy · validation ordering · drag-only contract by comment · per-view scene vs global writers |
| E4 | Clipboard, schemas, initial load & session/UI state | 15 | 12 | 8 (CLIP) | identity/range unvalidated (the block's headline) · write sites wider than the schema · one bad ref bricks the load · subscription leaks |
| I1 | Pointer pipeline, mode dispatcher & keyboard routing | 15 | 10 | 7 (PTR) | un-scoped window keydown dispatcher · mode-transition races · keyboard paths missing the layer gates · synthetic-vs-real input |
| I2 | Touch & pen gesture state machine | 15 | 7 | 6 (TCH) | mouse/touch sibling drift · wrong containment test · half-open press bookkeeping · tile-less entities invisible to the machine |
| I3 | Selection, drag engine & lasso/freehand marquee | 15 | 4 | 4 (SEL) | offset-omission (keyboard consumer) · splice outside the drag transaction · mixed-group collision tearing · destructive keybinding leak |
| I4 | Connector draw, reconnect & waypoint interactions | 15 | 8 | 6 (CONN) | no abort ramps · degenerate connectors rejected nowhere · interactability gate omitted from hit-tests · id churn in a live gesture |
| I5 | Pan/right-click, context menu, placement & transform | 14 | 5 | 4 (CTX) | "was this on the canvas?" answered three ways · mode-restore lists gone stale · hidden-layer state omitted from chrome · read-only inverted |
| R1 | Projection & coordinate transforms (iso/2D, off-grid) | 15 | 6 | 4 (PROJ) | `getProjectBounds` enumeration/offset omissions · hit order vs paint order inside one function · correct helper with exactly one caller |
| R2 | WebGL sprite-batch substrate (atlas, context loss) | 13 | 4 | 2 (GL) | derived cache with no eviction · silent failure with no signal · boundary amplifiers · "right about the code, inert in the product" |
| R3 | Bulk GPU scene layers (build/invalidation, LOD) | 15 | 7 | 4 (GPU) | icon pipeline with no failure path · draw vs hit thresholds decided in two files · bulk-vs-DOM parity drift · icon-only readiness signals |
| R4 | Renderer orchestration (culling, hybrid, fit-to-view) | 15 | 9 | 7 (RND) | mount order as implicit z-order · layer/LOD gate missing on one sibling · fourth `getProjectBounds` omission · unclamped fit-to-view |
| R5 | DOM overlays & presentation parity (hit proxies, grid) | 13 | 7 | 7 (OVL) | one component written twice, one copy maintained · callers feeding a constant to shared math · offset-omission (8th member) · hardcoded type sets |
| A1 | Diagram lifecycle: open/save/dirty/autosave | 15 | 14 | 13 (LIFE) | error-path state loss with no retry · unflushed async lifecycle · exit-ramp ritual drift · readonly not inert |
| A2 | Storage providers & places model (local/session/Drive) | 15 | 13 | 14 (STOR) | sibling drift across the three provider paths · silent fallbacks · non-idempotent retry, non-atomic transfer · unguarded parses |
| A3 | Project ZIP & import/export (JSON, ZIP, image) | 15 | 11 | 11 (ZIP) | unbounded walks on degenerate input · non-transactional destructive ops · rewrite scope too narrow · typed failures collapsed by callers |
| A4 | File explorer, folders & multi-diagram management | 16 | 15 | 9 (FEX) | capabilities implemented-but-unreachable end to end · orphan invisibility · destructive step before the durable one · stale identity resolution |
| A5 | App chrome: boot, dialogs, settings, i18n, theming | 12 | 10 | 8 (CHR) | prefix/keyspace confusion in the safety hatch · inert safety nets · environment sniffing · locale drift both directions · one helper written five times |
| S1 | Google identity & token lifecycle (GIS auth store) | 16 | 12 | 12 (AUTH) | twin state-machine transitions drifted · absorb-flag interleavings · missing in-flight guards · stale derived caches across identity change |
| S2 | Share backend: snapshots, routes, Express/Worker parity | 15 | 12 | 12 (SHARE) | unserialised read-modify-writes · full-replace drops server-owned fields · reserved keys unvalidated · the wiring around a tested handler |
| S3 | Drive-native sharing & readonly preview ladder | 15 | 10 | 10 (DRV) | typed-failure collapse at the ladder · sticky cross-read state · callers ignoring resolved outcomes · enum coverage stops at the happy path |
| F1 | Text, labels-as-text & rich-text editing | 16 | 10 | 9 (TXT) | two editing implementations, the plain-text sibling unmaintained · stale measures over legacy input · non-idempotent round trips · sniff-then-write-back |
| F2 | View/preview/presenter modes & annotation overlay | 13 | 9 | 8 (VIEW) | ephemeral state no reset path owns · type sets stop at the original four · destructive ops outside the undo model · readonly as per-surface opt-in |
| F3 | Styling system (strip, bulk styling, color picker) | 10 | 3 | 2 (STYL) | representative-in / everyone-out bulk styling · sibling drift inside one popover · absent-vs-sentinel storage split |
| F4 | Layers panel & z-order (visibility, locking, order) | 10 | 4 | 4 (LAY) | boolean layer flags wired through, structural parts not · id/type unvalidated in a bulk mutation |
| F5 | Icons & catalog (packs, custom icons, merge-on-load) | 10 | 6 | 5 (ICON) | one contract implemented twice across the app/lib line · dead code behind a live contract · unvalidated persisted preferences · soft-delete excluded from scans |
| MOP | Cross-area mop-up (completeness-critic pass) | 2 | 1 | 1 (MOP) | copied `shareUuid` = one snapshot claimed by two documents · plus one record correction (see below) |

## The areas, in one paragraph each

**E1 — History & undo/redo.** Two 50-entry stacks (model + scene) that must step
as one logical action, and mostly don't: independent trimming splits an action's
halves (HIST-03), a leaked drag bracket suppresses later history (HIST-06), a
per-hook-instance `dragInProgress` lets a foreign write corrupt the entry
(HIST-07), and `useHistory().transaction` had no product caller at all (HIST-08).
The wave-5 fix stamped every entry with its page (HIST-10 ruling) — implemented
through a shared logical-action register rather than the brief's `uiState.view`
read, a stronger guarantee than designed. HIST-03's probe also falsified the old
D-7 claim that the trim sub-case was already resolved.

**E2 — Reducers & cascades.** The delete cascade misses anchor-to-anchor
connectors (RED-07/14), nothing validates layer references (RED-03), and layer
`order` values collide after delete/partial-reorder (RED-04/05) — all amplified
by RED-02: one invalid entity anywhere makes every later edit throw. RED-01 is
structural corruption (an `undefined` slot in `model.items` that bricks view and
save). The family's gate is `modelIdentity.contract.test.ts`.

**E3 — Scene actions & paste.** Paste keeps original anchor ids (SCN-03/04) and
source-page `layerId`s (SCN-14), validates before rectangles/text/labels land
(SCN-06), and the "drag-only" batch updaters enforce their contract by comment
alone (SCN-07). The scene store is per-active-view but three writers ignored
that (SCN-08/09/15 — the async sibling of D-9).

**E4 — Clipboard, schemas & load.** The block's headline class: **reference
integrity is checked; identity and range integrity are not** — duplicate ids
(CLIP-01), unknown icon refs (CLIP-14), unbounded tiles (CLIP-15), a write site
wider than the schema cap that bricks the next load (CLIP-13), and one
unresolvable anchor ref that makes the whole diagram refuse to open (CLIP-02).
Fixed under the owner's **repair-don't-reject** ruling (write sites refuse new
violations; `repairModel.ts` heals files already in the wild). The good news was
real too: the ADR 0023 off-grid trio and `iconScale` both round-trip the
clipboard intact.

**I1 — Pointer & keyboard routing.** One shape, four bugs: a `window` keydown
dispatcher whose only scope check was `isEditableTarget`, so it fired in
read-only mode (PTR-01/02/03), behind modals (PTR-05), over text selections
(PTR-12) and on locked layers (PTR-11). PTR-14 was a synthetic-vs-real divide —
`Ctrl+Shift+]` arrives as `}` on a real keyboard, and `z-order.spec.ts` was a
false green. INV-11 (no selected id on a hidden/locked layer) entered the oracle
set here.

**I2 — Touch & pen.** Touch is a second implementation of every interaction, and
it drifts: no touch route into text editing (TCH-12), no pinch→pan demotion on
cancel (TCH-14), rect-containment instead of hit-testing on the palette drop
(TCH-05), pen hover dropped by the touch machine (TCH-04). The forwarding design
itself held — the bugs were all in the touch machine's own code. Fixed around a
shared `endPointer` helper (TCH-06 ruling).

**I3 — Selection & drag.** Solid at the core (nine falsifications, including
all-or-nothing group collision and additive click selection), thin at the seams:
arrow-nudge erases the ADR 0023 `offset` (SEL-01), a connector-body drag splices
its waypoint outside the transaction (SEL-02), mixed node+rectangle groups tear
on collision (SEL-04), and a live freehand-lasso selection made Backspace
destructive in every text field (SEL-07).

**I4 — Connectors.** The connector tool trusted geometry and distrusted nothing
else: reconnect mode had no exit at all (CONN-01/02), degenerate connectors were
creatable four ways and rejected none (CONN-07/10/13), duplicate routes made the
second connector permanently unclickable (CONN-11), and its hit-tests carried no
interactability gate, so locked/hidden nodes were connectable (CONN-15).

**I5 — Pan, menus, placement, transforms.** "Was this dropped on the canvas?"
was asked three ways and answered right by none (CTX-01 mouse placement, TCH-05
touch, vs `isRendererInteraction`); `endPan` reconstructed modes from a
five-case list that had gone stale (CTX-03/04); the group transform box ignored
`visibleIds` (CTX-06); and read-only was inverted in both directions — mutating
keyboard paths open (PTR-01..03) while the one read-only interaction it should
offer was unreachable (CTX-15).

**R1 — Projection & transforms.** One un-audited function, `getProjectBounds`,
carried three independent omissions (PROJ-01/02/04; RND-09 later found a
fourth); item hit-testing scanned array order while the rectangle branch of the
same function sorted by paint order (PROJ-10); and
`connectorEndpointVertexDelta` was a correct helper with exactly one caller —
the DOM renderer — so the WebGL path jumped at off-grid nodes (PROJ-12).
**Record correction (2026-08-02):** wave 3's "not a gap in practice" rationale
for leaving the layer tier out of the picker was wrong — it holds for nodes
only; rectangles/labels/connectors overlap across layers freely. The
renderer/picker-agreement gate names that shape as deliberately excluded, and
the layer-tier threading was routed to the program's final sweep (PROJ-10
residual).

**R2 — WebGL substrate.** The chip atlas had no eviction — every rename or
restyle leaked a slot (GL-05, mechanism: key churn, not the version parameter),
overflow skipped chips with no signal (GL-02), a small `MAX_TEXTURE_SIZE`
amplified both (GL-12), and a context that passed the capability gate but failed
shader link rendered nothing forever (GL-07). The area's recurring falsification
shape — "right about the code, inert in the product" — and its biggest rig
yield: the mapper's "pixel-blind to CI" note was **false** (the bulk canvases
are `preserveDrawingBuffer: true`, so pixel read-back works), which is what made
the R3–R5 oracles possible.

**R3 — GPU scene layers.** The icon pipeline had no failure path (GPU-01/03 — a
transient fetch failure cached as permanent), draw visibility and hit visibility
were decided in two files with different zoom thresholds (GPU-04/05), the bulk
and DOM renderings drifted where each decided something alone (GPU-09/15), and
at 300 floating labels the layer silently drew 276 while every readiness signal
read complete (GPU-14). GPU-13 — cross-type z-order inert across four stacked
canvases — became the owner-ruled canvas merge (below).

**R4 — Renderer orchestration.** Mount order was the real z-order: hybrid
promotion restacked selected elements above every canvas (RND-13/15, closed by
the canvas merge), the interactions box sat above resting text boxes so in-text
links were unclickable (RND-07), `ConnectorLabels` was the one scene layer that
never consulted `useLayerContext` (RND-02), and fit-to-view clamped only the
upper zoom bound and measured the dock-covered container (RND-01/06).

**R5 — DOM overlays.** The standing thread: `LabelHitLayer` and
`NodeLabelHitLayer` are one component written twice, and only the first was
maintained — the second missed the `lockedIds` gate (OVL-13), the counter-scale
(OVL-12), and the read-only hover branch (OVL-06); both publish identical
`data-` hooks, so nothing can tell them apart but entity id. Also: both
readable-labels consumers fed the shared math a constant (OVL-02), the placement
ghost ignored the off-grid residual (OVL-10, the class's eighth member), and
`NUDGEABLE_TYPES` omitted LABEL (OVL-14).

**A1 — Diagram lifecycle.** Fourteen bugs from 15 hypotheses — the autosave
machine lost state on every error path (LIFE-01..04), never flushed or cancelled
its async work (LIFE-05..08), and its exit ramps drifted (LIFE-09/12/13).
Read-only was not inert (LIFE-11: Ctrl+S on `/display` writes), and one
unguarded `JSON.parse` at boot crash-looped the app (LIFE-10). The A1 harness
(real provider under jsdom) became the load-bearing rig for the whole app-shell
track.

**A2 — Storage & places.** Sibling drift across the local/session/Drive provider
paths (lean-save applied by some writers, `deleteFolder` meaning three things,
manifest read/write disagreeing about authority), silent fallbacks (one failed
server list silently swapped the workspace for the empty session one, STOR-04),
a replaying multipart POST minting duplicate Drive files (STOR-08), and
non-atomic move-to-Drive (STOR-09/FEX-13). The area also discharged a recorded
record-correction: thirteen promised entries that had never reached
known_issues.md.

**A3 — ZIP & import/export.** A folder-parent cycle froze the tab (ZIP-01 — the
sibling walker in the same file was cycle-guarded), `replaceAll` was
non-transactional (ZIP-03), id rewriting missed out-of-scope refs (ZIP-02) and
in-text `#diagram:` hrefs (TXT-09), nine bespoke error messages collapsed to one
constant dialog line (ZIP-08), and three shapes of bad blob met three different
fates, two of them silent (ZIP-15).

**A4 — File explorer.** The dead-path sweep: the entire soft-delete/trash
machine was implemented at every layer and called by nothing (FEX-02), folders
could never reach the trash (FEX-06), and the tree manifest was write-only end
to end (FEX-03, with ZIP-10). Orphans produced elsewhere were invisible but
still counted (FEX-01). The explorer's own gestures did the destructive step
first (FEX-08/16), abandoned multi-item drags mid-loop (FEX-10), and resolved
identity from stale or defaulted state (FEX-11/12).

**A5 — App chrome & i18n.** The quota-full "Clear All Diagrams" swept the
*config* prefix — deleting settings and no diagrams (CHR-01/03) — beside a
storage gauge measuring the wrong store (CHR-02) and an export-all reading a
dead key (CHR-04). `apiBaseUrl()` sniffed the environment by port and broke the
Docker deployment against its own CSP (CHR-07). Every shipped locale was missing
strings and carried keys en-US had dropped (CHR-09/10), and one download helper
existed five times (CHR-11 — the dual-implementation class at its widest).
Deliberately scoped away from the auth seams (S1/S3's 31 counted, 22 bugs).

**S1 — Identity & tokens.** Nine of twelve bugs were one shape: the auth store's
exit ramps are one ritual written several times, each forgetting a different
part — waiter draining, timeout clearing, `_absorbStaleError`, the profile hint
(AUTH-01/02/03/06/12). Plus missing in-flight guards that discarded a completed
sign-in (AUTH-04/07), a rate limit misread as missing scope (AUTH-08), and a
Drive root cache surviving an account switch (AUTH-16). One recorded cause was
corrected during the fix: the real signal was the outstanding superseded GIS
request, not the parked status — the promoted test caught the first fix version.

**S2 — Share backend.** Nothing serialised a read-modify-write (`folders.json`,
`shareDiagram` — SHARE-03/04), the full-PUT save dropped server-owned fields so
the first autosave after sharing orphaned the public snapshot (SHARE-01/15),
reserved storage keys were writable as diagram ids (SHARE-02), and the wiring
around a 111-test route handler was where its contract died: no Express error
middleware (SHARE-08), CORS withholding responses without blocking requests
(SHARE-09). Two remediation caveats are recorded in the entries: the
SHARE-03/04 fix is a single-process mutex, and SHARE-11's whitelist was inverted
to a deny-list rather than schema-derived (deliberately, to keep the backend
dependency-free).

**S3 — Drive sharing & preview ladder.** Almost every bug was caller-side: the
ladder classified four terminal causes and the gate rendered one message
(DRV-02), the Picker distinguished wrong-file from cancel and the gate had no
branch for it (DRV-03), `afterGrant` was never cleared (DRV-01), `type:'domain'`
was declared and unhandled (DRV-04), and the anonymous proxy's `public,
max-age=60` kept revoked diagrams readable (DRV-07). Two harvested invariants
were stale (thread S-f), including a `resourceKey` validator that never had the
documented floor (DRV-11).

**F1 — Text & rich text.** Standing thread: two implementations of one editing
contract, and the second is always the plain-text sibling — Quill's
`TextBoxInlineEditor` got every refinement; the floating-Label / node-name /
connector-label `useInlineRename` inherited none (TXT-06/07). Legacy plain-text
content measured one row tall (TXT-01/02), whole-content toggles flattened
per-word formatting (TXT-13), and the HTML sniff ate leading `<` tokens
permanently on load (TXT-14). A residual risk is recorded, deliberately not
filed: `notes` round-trips unsanitized, safe only under the current consumer set.

**F2 — View modes & annotation.** Annotation ink survived diagram and page
switches because no reset path owned the slice (VIEW-01/02), re-projection left
strokes behind (VIEW-03), erase lived outside the undo model and destroyed redo
(VIEW-07), `INFO_TYPES` stopped at the original four types (VIEW-05), and every
element panel except the node's was editable in view mode (VIEW-11 — thread F-b:
`EXPLORABLE_READONLY` was a per-surface opt-in that nothing enumerates, later
closed by the `readonlyPolicy` class gate).

**F3 — Styling.** Lowest bug yield; the value concentrated in the rulings. The
class: bulk styling is representative-in / everyone-out — a toggle's direction
and payload both derived from `selectedIds[0]` (STYL-01/06, STYL-02/08 rulings).
The relative font-size stepper — the one control reading each target's own value
— was the shape the others wanted.

**F4 — Layers & z-order.** The boolean flags (visible/locked) were wired
through; the structural parts were not — `layer.order` reached the paint key for
nodes only (LAY-01, completed cross-type by the canvas merge), no active-layer
concept existed (LAY-03), deleting a hidden layer revealed what it hid (LAY-05),
and `assignLayerToItems` matched bare ids across all five entity collections
(LAY-11).

**F5 — Icons & catalog.** The app/lib boundary was where one contract got
implemented twice: lean-save existed in both packages with the lib's half inert
against an empty bundled catalog (ICON-01/02), storage-access guarding existed
only on the lib side (ICON-05), unvalidated pack preferences reached a throwing
loader (ICON-04), and the icon-delete usage scan skipped trashed diagrams
(ICON-06). ICON-08 (resized icon inert outside its tile) stands as a documented
ADR 0044 trade-off.

**Mop-up.** The completeness-critic pass over closed-area pairs found MOP-01
(copy/import carried `shareUuid`, so two documents claimed one public snapshot)
and one **record correction** (MOP-02): two filed entries contradicted each
other about which delete the explorer performs — the explorer hard-deletes;
SHARE-06's route-level gap was real but unreachable from the UI. Frozen records
go stale against the code; corrections belong in the entries themselves.

## Standing threads (the durable generators)

The campaign's durable output is not the bug list — it is the recurring shapes,
each of which closed several bugs at once. The `/explore` skill carries them
forward as hypothesis generators (§7); a new area should ask whether its surface
reproduces them rather than re-derive them.

- **One fact stored twice with different lifetimes**, and only one writer updates it.
- **Sibling drift** — two implementations of one contract, only one maintained. The single highest-yield generator (mouse/touch, DOM/GPU, app/lib, Express/Worker, the two hit-proxy layers, the two inline editors).
- **A per-surface opt-in that nothing enumerates**, so each new surface starts in the wrong state (readonly, layer gates, theme/i18n wiring).
- **One geometry, two derivations** — the second re-derives what a shared helper knows, and drifts.
- **The exit ramps are one function written several times**, each forgetting a different part of the ritual (auth store, history brackets, pan restore, autosave flush).
- **Identity and range integrity are unvalidated** — reference integrity is checked; identity and bounds are not.
- **Implemented but reachable from nowhere** — a capability wired at every layer with no caller (soft delete, `getFileShareMeta`, `setHideViewControls`; grep for the caller before predicting behaviour).

## Owner rulings (2026-07-30)

Decided 2026-07-30 in the owner review of all 21 open product questions (SEL-12
was closed 2026-07-29 in-wave); A5/CHR-08 was added and ruled the same day at
the campaign close-out, making 22. Each was presented with how the industry
handles the case and which option is most consistent with contracts Axoview
already established. All 22 were subsequently **implemented as ruled** by the
remediation program (waves 1–6).

| ID | Decision | Basis |
|----|----------|-------|
| SEL-15 | **Adopt additive marquee** — Shift/Ctrl+drag extends the selection, merging into `selectedIds` in `Lasso`/`FreehandLasso` mouseup. | Near-universal (Figma, Miro, Lucid, draw.io, Adobe, Sketch, Inkscape, Blender); our click path already taught Shift=add (ADR 0006 amendment). ADR 0006 gesture matrix to be amended. |
| TCH-06 | **Adopt** — `onTouchPointerCancel` resets `lastTapTime`/`lastTapItem`; build the shared `endPointer(e, {cancelled})` helper together with filed bug TCH-14. | Android `GestureDetector` and iOS `UITapGestureRecognizer` both abort multi-tap on cancel. |
| STYL-02 | **Adopt** — mixed selection renders indeterminate (`all/some/none` derivation), first press applies to all (`next = !all`). | Word/Docs/Slides/Figma/Lucid standard; same derivation fixes the direction half of filed STYL-06. |
| RND-14 | **Adopt reveal-then-act** — keyboard commands on an off-screen selection scroll it into view and work; cheap form: promoted `hybridIds` bypass the viewport cull. | VS Code/Figma/Miro/Finder all reveal before acting; silent no-op F2 is the worst of the options. |
| TXT-07 | **Adopt full text-box lifecycle parity for Labels** — abandoned first edit discards the Label (no "Label" placeholder left behind); emptying an existing Label then committing deletes it (undoable). The silent revert goes. | Figma/Miro/Lucid/draw.io discard/delete empty text elements; our own text box already implements exactly this contract (ADR 0034 §1). |
| VIEW-13 | **Adopt** — annotation Clear becomes an entry in the annotation operation log (built on the VIEW-07 restructure), so it is undoable like the Undo/Redo pair beside it. | PowerPoint/OneNote ink-clear is undoable; a bin adjacent to undo controls sets the expectation. |
| DRV-05 | **Adopt** — `runAction` refreshes the ACL list in its `catch` too; `setAnyoneWithLink(false)` collects per-permission outcomes and reports "link may still be active" when at least one delete survived. | Cloud UIs re-read authoritative state after any mutation attempt (Drive's own UI does). |
| STOR-11 | **Adopt cache-success-only** — `fetchRuntimeConfig` caches only actually-received responses; a timeout falls back for that caller but the next caller re-probes (`inflight` still dedupes concurrent boot). | Config/flag SDK practice (Firebase Remote Config, LaunchDarkly): time out to a fallback, never latch the timeout as the answer. Preserves ADR 0009 D2's single-probe fast path. |
| HIST-08 | **Delegate** — `useHistory().transaction` delegates to the working `useSceneActions.transaction`; one grouping primitive, no silent no-op. | Editor frameworks ship exactly one grouping primitive (ProseMirror, Yjs). Delegation over deletion because the lib exports the hook. |
| STYL-03 | **Absent = no colour is the rule** — migrate rectangle *fill* to absent; rectangle *border* keeps the `'transparent'` sentinel as the one documented exception (absent there means "derive a stroke"). Record in ADR 0039. | No external consensus (SVG `none` vs Figma empty fills) — internal consistency call. |
| STYL-08 | **Adopt Mixed display** — heterogeneous absolute values show "Mixed", never `selectedIds[0]`'s value. With STYL-02, toggles stop depending on a representative entirely. | Universal in Word/Docs/Figma/Lucid. |
| ZIP-09 | **One import flow** — every entry point opens `ImportDialog`; empty tree preselects root instead of skipping the dialog; the resolved destination place is named on screen and passed explicitly (no path reads the active provider while another reads the selected row). | Industry: one import flow, destination explicit; destructive capability (replaceAll) must not appear/disappear on incidental state. |
| PROJ-07 | **Re-project the off-grid offset on ISO↔2D switch** (`toScreen_new(fromCanvasPoint_old(offset))`) — preserves the item's logical sub-tile position. | Same principle and same map the viewport centre already uses (`getCanvasModeSwitchScroll`). ADR 0023 addendum needed. |
| PROJ-06 | **Switch to the exact projection ratio** for ISO area quads; accept the one-time pixel movement. | Removes the 1.4 px/20-tile seam against nodes; CI is pixel-blind so the move costs nothing; frozen-wrong-constant is drift, not a contract. |
| RED-13 | **Confirm with both outcomes** — deleting a non-empty layer asks "Keep contents (unassign)" vs "Delete contents too", with an extra warning when the layer is hidden. | Tag-model layer tools ask (Visio) or refuse (AutoCAD); ownership-model tools delete contents. Axoview layers are tags → Visio pattern. |
| HIST-10 | **Always navigate** — each history entry is stamped with the active page; undo/redo switches to that page when it targets a non-active one. Covers page create/delete *and* the invisible cross-page content undo. | Undo must make its effect visible (PowerPoint selects the restored slide; Figma navigates on undo). |
| HIST-15 | **Silent cap, documented** — keep `MAX_HISTORY_SIZE=50`, no UI. Revisit the cap only after the coarse-patch granularity (E1 close-out note) is fixed. | Industry is uniformly silent about history caps (Photoshop 50, Word ~100). |
| GPU-13 | **Build cross-type depth.** ⚠ Decided *against* the cheap recommendation: the owner wants real global z-order (connector can sit above a node), matching draw.io/Lucid. This is a renderer restructure — single canvas or per-entity depth across the four bulk canvases (ADR 0038 amendment + design pass required before any code). | draw.io/Lucid have global z-order; current controls look global and are silently inert cross-type. |
| SHARE-10 | **Keep reads + allow revoke** — `GET /api/public/diagrams/:uuid` stays exempt from `ENABLE_SERVER_STORAGE=false`, and `DELETE /api/diagrams/:id/share` becomes exempt alongside it, so revocation is always reachable. Document the pair in `docs/deployment.md`. | Published artifacts surviving an API kill-switch is normal (S3/Pages/publish-to-web); unpublish must always remain reachable. The pair moves together. |
| AUTH-13 | **Require email in the hint** — a profile hint is valid only with non-empty `name` AND `email`; otherwise drop it and render the never-signed-in control. Also stop persisting empty-email profiles at the `fetchUserInfo` write site. | OIDC practice: no silent auth without a usable `login_hint`; never show a "remembered" account that can neither be displayed nor reconnected. |
| VIEW-08 | **Viewer session-only** — one shared `canvasMode` key; `/display` reads it as the default but its toggle no longer persists. Editor persistence unchanged; no migration. features.md wording corrected as part of the change. | Viewer-context settings don't reconfigure the authoring environment (Figma prototype viewer, playback prefs, presenter toggles). |
| CHR-08 | **Optional public base + page-origin fallback** — add an optional public base URL to the runtime config `useRuntimeConfig` already fetches; `appDisplayBase()` uses it when set and falls back to `window.location.origin` otherwise. Both link builders (public-snapshot `shareUrl.ts`, Drive `driveSharing.ts`) inherit it. No behaviour change for single-origin deployments. | Standard for products that mint shareable links (GitLab `external_url`, Grafana `root_url`, Sentry `system.url-prefix`, Discourse `hostname`): resolve against configured base, fall back to the request/page origin. Keeps the fix that made page-origin win over the backend-derived host, and stops preview/staging/LAN origins leaking into durable links. |

One ruling had already been made in-wave: **SEL-12** (2026-07-29) — lassoing
off-screen items is not a requirement; the observation was pinned as intended
behaviour.

## Wave-5 design sign-offs (2026-08-02)

The two design-gated larges each got a brief and an explicit owner sign-off
before code. The full briefs (`docs/tactical/wave5-brief-gpu-13-cross-type-depth.md`,
`docs/tactical/wave5-brief-hist-10-page-stamped-entries.md`) are retired to git
history; the sign-off content — the part with standing authority — is preserved
here.

### GPU-13 — cross-type z-depth (the canvas merge)

The brief established that Option B (per-entity depth across four contexts)
cannot work — four WebGL2 contexts share no depth buffer — so the honest framing
is "merge the contexts, then choose an ordering mechanism inside".

**Owner sign-off:** **Option A (single canvas) approved, measurement-first** —
with the reframe that the measurement gates the **mechanism, not the merge**: a
bad draw-call run-length result selects depth-buffer two-pass ordering inside
the merged context; it never un-merges the canvases.

- **Selection is order-preserving** (§7 Q1): selecting never changes the
  document's paint order; only selection chrome floats. The Figma /
  Illustrator / draw.io norm, and a deliberate change to the then-current
  behaviour (the hybrid overlay used to lift the whole element).
- **Connector labels are out of scope** (§7 Q2): in-scope ≈ +30–40% project
  scope for a defect nobody filed. The resulting inconsistency (floating Labels
  participate in cross-type depth, connector chips float above everything) is
  documented in ADR 0038 §8 with a named follow-up trigger: pull chips into the
  sort if a user-filed stacking defect involves them.
- **Mid-wave approvals:** session boundary (measurements + dated ADR 0038 §8
  amendment first, merge implementation in a fresh session — a partially-merged
  renderer never lands); the `data-nodes-drawn` anti-cheat rename with the
  perf-harness assertion updated in the same change; `atlasStats()` as
  shared-substrate instrumentation; and the amendment must carry **all three
  measured numbers** (run-length, atlas occupancy, buildInstances single-pass) —
  if any measurement contradicts sorted-draw, stop and ping the owner.
- **Picker-gate scope:** the renderer/picker-agreement gate covers the
  zIndex/iso-depth tiers; the layer tier is excluded — with two corrections: the
  exclusion rationale must not claim the divergence cannot manifest (it holds
  for nodes only), and the divergence is **PROJ-10's residual**, annotated in
  its entry and routed to the program final sweep as its own small item.

### HIST-10 — page-stamped history entries

**Owner sign-off:** entry shape approved on all three design properties
(optional record-time `viewId`; `undefined` means "stay put", never "navigate to
`views[0]`"; per-store stamp / per-action consume, with the agreement
assertion). The four open questions, answered as recommended:

1. **Each undo step navigates**, including rapid sequences that move the
   viewport back and forth (PowerPoint behaviour).
2. **A redo stamps the page the action was originally performed on**; there is
   no separate "page I pressed undo from".
3. **Navigate on a half-stepped action** — fail-visible beats fail-silent;
   HIST-03's own fix retires the case.
4. **Layer operations are page-scoped by construction.**

Sequencing approved: entry shape + stamping, then navigation, then HIST-04
riding it — one PR; HIST-03 strictly separate (a trimming bug, not a navigation
one). Mid-wave addition: HIST-03 must not fall between sessions — it lands the
same session or is named first in the resume point.

## Final tally (2026-08-10, mop-up wave)

Locked decision #1 was "all 240 fixed, no triage-to-backlog." The owner's
2026-08-10 review of PR #86 found the wave-6 close-out claim overstated: the
remediation waves fixed root-cause *clusters*, and ~18 out-of-cluster entries
had stayed `Open` silently while no wave reported an open-entry tally. The
mop-up wave (wave 7) closed them and made the completion claim true.

**The register (grep-verifiable):**

```bash
grep -c '\*\*Found by:\*\* exploratory campaign' known_issues.md          # 204 filed entries
grep -c 'accepted open by owner ruling 2026-08-10' known_issues.md        # 4  accepted open
```

| Disposition | Count | Notes |
|---|---|---|
| Fixed / dispositioned-fixed | 200 | 18 closed by the mop-up wave (SCN/CLIP paste + selection + session clusters, LIFE app-shell, CLIP-02 load repair); the rest across waves 1–6. CLIP-14/15's "Partially fixed" header was corrected — both halves were already fixed. |
| Accepted open by owner ruling 2026-08-10 | 4 | see below |

The **4 accepted open** — each a deliberate non-fix, each with its fix detector
as a committed expected-fail (or, for the dead-code case, a grep contract):

| ID | Reason accepted open | Detector |
|----|----------------------|----------|
| GPU-15 | Cosmetic (rounded rectangle corners are square on the bulk paint); not worth the shader work yet. | `tests/rectangle-corner-radius-parity.spec.ts` (`test.fail`) |
| RND-07 | A link in a resting text box needs a new interaction surface (promote the box above the interactions box), not a tail fix. | `tests/text-box-resting-link-navigation.spec.ts` (`test.fail`) |
| ICON-08 | A documented ADR 0044 §6 trade-off: icon resize is visual-only, hit area stays tile-sized. | `tests/resized-icon-hit-area.spec.ts` (`test.fail`) |
| VIEW-09a | Dead code / product-surface decision: `setHideViewControls` has no caller; wiring a control is new product, not remediation. | grep contract (no runtime symptom to repro) |

Two corrections to the mop-up's own inputs, recorded rather than silent (the
"evidence is reliable, diagnoses are hypotheses" rule applied to the plan):
**OVL-02 was already Fixed** in wave 4 (2026-08-02), not open — the first of its
two staged `Status` lines was stale; and **VIEW-09a** is the fourth accepted-open
entry, in OVL-02's place on the owner's provisional list.

## Program lessons

What the program cost and returned: 240 confirmed bugs fixed across waves 1–7,
22 rulings implemented, a dozen recorded root causes *corrected* while being
fixed, ~15 class gates landed (each verified able to go red), and one substrate
restructure (the canvas merge) that a bug cluster justified but no performance
argument would have. Yield ran ~0.6 bugs per counted hypothesis; the `/explore`
skill's delta mode is what makes that repeatable at delta cost.

1. **A gate the lane is excluded from is a gate nobody watches.** The lane's
   `tsc --noEmit` exclusion was broken for two waves and its knip exclusion for
   two more, both silently. Check exit codes, not output, at every wave
   boundary.
2. **The evidence is reliable; the diagnoses are hypotheses.** Remediation
   corrected a dozen recorded root causes while fixing them (AUTH-02's real
   signal, PROJ-10's wrong exclusion rationale, GL-05's key churn, FEX-07's
   named-wrong failure mode). Re-derive the cause, then correct the entry in
   place.
3. **A frozen record and the register drift.** A2's thirteen promised entries
   had never reached known_issues.md; MOP-02 found two filed entries
   contradicting each other. Check both ends before trusting a count; write
   corrections into the entries themselves.
4. **Class gates must scan, not enumerate; exemptions name call sites, never
   files; red-verify by planting the defect where it actually lived.** Several
   gates were found incapable of failing until rebuilt this way (the full rules
   live in the skill's §10).
5. **Promote what the probe proved, not what the fix touched.** Promotion is a
   typecheck event (the lane is tsc/knip-excluded, the main suites are not), a
   structural characterization can only be retired, and a fix can invalidate a
   neighbouring probe's premise — those need an explicit disposition or the
   finding evaporates silently.

## Delta anchor — LAST-SWEEP

`/explore`'s delta mode scopes a wave by diffing the working branch against the
commit recorded here. **A sweep updates this section as its last act.** This is
the one part of this frozen review that is maintained forward.

| Field | Value |
|---|---|
| **Anchor commit** | `9fa70364` |
| **Anchor subject** | `chore(explore): land the 2026-07 exploratory campaign record and probe lane` |
| **Anchor date** | 2026-07-30 |
| **Swept by** | the 2026-07 campaign (all 27 areas + a cross-area mop-up) |
| **Recorded** | 2026-08-08, remediation wave 6 |

The anchor is the last point at which the whole tree had been swept. Everything
after it is the remediation program's own work (waves 1–6: ~240 fixes, the
canvas merge, five design-gated restructures), and **none of that has been
explored** — it is a large delta and the natural first target.

```bash
git diff --stat 9fa70364..HEAD -- 'packages/*/src'
git log --oneline 9fa70364..HEAD
```

**How to update:** at the end of a sweep, replace the table with the commit
swept to, the date, and one line naming the areas covered; append the previous
row to the history below.

**Coverage baseline:** the campaign's ~110 KB `coverage-baseline.md` was a
regenerated artifact and was deleted with the tree — a new sweep **re-derives**
the coverage map for the areas in scope (which files have direct tests, which
are exercised only transitively, which invariants the ADRs state) instead of
maintaining a hand-edited file. Verify a harvested invariant against the source
before building a probe on it; two of the original harvest's invariants were
stale and one named a function with no caller.

### Scheduling notes (headless)

The runtime contract is **Claude Code under the owner's subscription** (ADR 0047
§4): interactively via `/explore`, or headless via `claude -p "/explore"` from
the repo root. Execution paths that bill a metered API key are out of contract.
Verified on this machine 2026-08-08 (CLI 2.1.220, no `ANTHROPIC_API_KEY`): a
cold `-p` run resolved `/explore` as a project command and loaded the skill.

> **`claude` is NOT on PATH here.** It is installed at
> `C:\Users\molik\.local\bin\claude.exe`; both `where claude` and `which claude`
> come back empty. A Task Scheduler action given the bare program name fails
> with an error that reads like a broken install. **Use the absolute path.**

Task Scheduler wiring: Program `C:\Users\molik\.local\bin\claude.exe` ·
Arguments `-p "/explore"` · Start in `c:\mytemp\axoview-minor-fix\axoview`.
Three caveats: there is **no `--max-turns`** on this CLI (bound the task with a
"stop if it runs longer than" limit); headless runs cannot answer a question
(the skill's headless clause applies — pick delta mode, record the choice, put
owner questions in the report); a scheduled run inherits no interactive OAuth
(interactively-authenticated MCP connectors are simply absent — nothing in the
method needs one).

### Sweep history

| Swept to | Date | By | Scope |
|---|---|---|---|
| `9fa70364` | 2026-07-30 | 2026-07 campaign | all 27 areas + cross-area mop-up |
