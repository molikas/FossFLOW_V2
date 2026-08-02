# Regression Test Suite Reference

**Last updated:** 2026-07-31 (exploratory remediation wave 3 — interaction & rendering correctness)
**Unit / integration totals** (measured 2026-07-31 via per-workspace `npm test`):

| Workspace | Passing | Suites |
|---|---|---|
| `axoview-lib` | 2022 (+1 skipped) | 175 |
| `axoview-app` | 423 | 39 |
| `axoview-backend` | 134 | 9 |
| `axoview-worker` | 129 | 4 |
| **Total** | **2708 (+1 skipped)** | **227** |

*(Wave 3 of the exploratory remediation, 2026-07-31: lib `+188` / `+13` suites —
the whole delta is lib, because the I-block and R-block are both lib code. All
of it probes promoted out of the quarantined lane under the ADR 0047 §2 flip
rule, plus the layer-filter class gate. See "Exploratory remediation wave 3"
below.)*

*(Wave 2 of the exploratory remediation, 2026-07-30: lib `+6` / `+1` suite, app
`+14` / `+1`, backend `+32` / `+2`, worker `+5`. All of it probes promoted out
of the quarantined lane under the ADR 0047 §2 flip rule, plus four class gates.
See "Exploratory remediation wave 2" below.)*

*(lib `+43` / `+4` suites and app `+88` / `+8` suites on 2026-07-30 — wave 1 of the
exploratory-campaign remediation, all of it probes promoted out of the
quarantined lane under the ADR 0047 §2 flip rule, plus the model identity/range
class gate. See the additions below.)*

> Most of the lib delta since the 2026-07-15 measurement (1544→1737, 150→155) predates this sync — it accumulated across the intervening waves and was simply never re-measured. The 2026-07-28 session itself added only the two `driveSharing` policy-rejection cases (app 266→268).

*(lib `+22` / `+1` suite on 2026-07-19: the on-canvas icon-resize `NODE.TRANSFORM` suite + `iconScale` schema round-trips — see the ADR 0044 additions below.)*

*(lib `+179` / `+4` suites on 2026-07-23 → **1723 (+1 skipped) / 154**: the ADR 0023 off-grid rendered-geometry hardening — invariant, contract, off-grid context-menu and shared label-pointer suites; see the additions below.)*

**Run:** `npm test --workspace=packages/<pkg>` per package, or `npm test --workspaces` for all. The v1.1 wave added the backend + worker server-runtime suites — the only **high**-severity gap the post-v1.0.0 review named — plus the app-side error-UX, startup-timeout, parallelism-contract, file-explorer-delete, share-URL, and backend-routes contract suites. The single skipped test is `leanSave bundledFixtures[0]` (see [known_issues.md](../../known_issues.md)).

E2E suite lives at [`packages/axoview-e2e/`](../../packages/axoview-e2e/) (Playwright, 83 spec files covering canonical journeys J1–J20 + the v1.1 cross-interaction additions + the Phase 6 presentation/annotation specs + the Phase 6.5 touch/pen specs + the labels & text-styling productization specs). Touch specs run under a dedicated `chromium-touch` project (`hasTouch: true`, `testMatch: /touch-.*\.spec\.ts/`) and drive real touch via CDP `Input.dispatchTouchEvent`; the default `chromium` project ignores them. Runs on PRs + master push via [`.github/workflows/e2e-playwright.yml`](../../.github/workflows/e2e-playwright.yml). Locally: `npm run test:e2e:ci` from repo root, or `npx playwright test --ui` from the package. The legacy Python/Selenium suite at `e2e-tests/` was deleted 2026-05-23 (audit C.2 I9; the T1-rewrite tactical was retired along with the rest of `docs/tactical/`).

**CI execution model — sharding (2026-07-10, PR #66).** The suite runs at `workers: 1` because the shared rsbuild dev server can't take parallel HMR clients (a 2-worker "Loading-Axoview" stall is documented in the config). CI parallelism is therefore achieved by **sharding across runners**: [`e2e-playwright.yml`](../../.github/workflows/e2e-playwright.yml) fans the run out over 4 jobs via a `shard` matrix, each running `--shard=i/4` at `workers: 1`. Within a runner the execution is byte-for-byte the sequential local flow, so the fan-out is machine-level, not context-level — no new flake risk. This cut the E2E wall-clock **~20m28s → ~6m30s (≈3.2×)**. Per-shard blob reports merge into one HTML report only on failure. Two invariants keep this safe for the future:

- **Keep `fullyParallel: false`.** Playwright then shards at *file* granularity, so every spec file (and its serial/stateful tests) stays wholly inside one shard. Flipping it to `true` would split files across shards **and** reintroduce the dev-server concurrent-context flake — don't, without re-architecting the server first.
- **Don't swap the dev server for a precompiled prod bundle to raise `workers`.** A `NODE_ENV=production` build tree-shakes out the `window.__axoview__` debug bridge that ~every spec reads (gated in `Axoview.tsx` by `enableDebugTools || exposeStoreBridge || NODE_ENV !== 'production'`); the whole suite would fail on `waitForDebugBridge`. If that route is ever needed for within-runner parallelism, re-expose the bridge via `exposeStoreBridge` behind a **CI-only build flag** (never the Cloudflare prod build).

To scale further, raise the shard count (`SHARD_TOTAL` + the matrix list in the workflow, kept in sync) — diminishing past ~6 shards because a fixed ~3 min setup (npm ci + build:lib + Playwright install + dev-server boot) is paid per shard.

### Exploratory remediation wave 5 — page-stamped history (2026-08-02)

**HIST-10 + HIST-04, one change** — [`useHistory.pageStamp.test.tsx`](../../packages/axoview-lib/src/hooks/__tests__/useHistory.pageStamp.test.tsx)
(15 cases, real stores) and [`undo-page-navigation.spec.ts`](../../packages/axoview-e2e/tests/undo-page-navigation.spec.ts)
(5 cases). History entries carry the page they were recorded on; undo/redo
switches to it. Design + owner sign-off:
[`wave5-brief-hist-10-page-stamped-entries.md`](../tactical/wave5-brief-hist-10-page-stamped-entries.md).

Four things worth carrying forward:

1. **Two assertions the sign-off made mandatory, and why they are the right two.**
   *Both stores stamp the same page for one logical action* — they read one
   register at one boundary, so a disagreement means the boundary moved, not that
   a store drifted. *Navigation records no history* — the failure mode is a
   LOOP: an undo that pushes an entry leaves the next Ctrl+Z something to eat and
   the stack never drains. The sharp form of the second is "an undo that
   navigated did not GROW either past stack", not "the drain terminated": a plant
   that pushes one entry per navigation still drains, so the loop-bound assertion
   alone passes while the growth assertion fails.
2. **Red-verify by planting the defect where it would actually live.** Killing
   the scene half's stamp reddens the agreement check; making
   `navigateToEntryView` write history reddens the growth check; making it return
   `false` reddens four of the five e2e cases. The one that stays green
   (`redo brings the page back`) is honest — it asserts the page returns and the
   active id resolves, neither of which needs navigation.
3. **A fix can close a bug in a NEIGHBOURING area without being aimed at it.**
   HIST-09/D-9 (a cross-page undo writing the previous page's cached connector
   paths into the page on screen) flipped to passing untouched, because the step
   now lands on the page the entry belongs to and SYNC_SCENEs it. That coverage
   existed only in the probe, so it was promoted — asserting the ORPHAN COUNT,
   not the navigation — before the probe was retired. **Ask what a flipped probe
   proved that your promoted regression does not**, in both directions: the
   sibling case in wave 4 was a probe going red without its bug being fixed.
4. **A guard can be unreachable through the public API and still be right.** The
   `model.views has it` check almost never fires, because every inverse patch
   replaces the whole `views` array — an undo that steps past a page removal
   *restores* the page. The reachable case is HIST-03's half-step, and the test
   has to construct it (drop the model half, then remove the page with a
   `skipHistory` write). A first attempt asserted the guard on a setup the coarse
   patch simply undid, and passed for the wrong reason until the premise was
   checked.

### Exploratory remediation wave 4 — running the e2e gate (rig notes, 2026-07-31)

Three things cost this wave hours of wall clock. All three are rig, not product.

1. **Never start a second Playwright run while a full one is in flight.** They
   share the dev-server port; the first run does not fail, it **hangs
   indefinitely** with an empty log and no error. Run targeted specs *or* the
   full suite, never both at once.
2. **`npm run build:lib` over a live dev server poisons it.** The rsbuild dev
   server desyncs from `dist/` and caches `Can't resolve 'axoview'`, which
   presents as *every* test failing at `waitForAppReady` — indistinguishable
   from a boot-time product crash until you read the page snapshot. This is the
   same gotcha the perf harness documents (see "Engine performance harness →
   Gotcha" below, which is why `npm run perf` owns its own server lifecycle).
   Kill every stray `node` process, rebuild, *then* start Playwright.
3. **This machine ran ~4× slower than wave 3's baseline** on 2026-07-31 —
   `bulk-style.spec.ts` took 42 s against the 30 s default and passed at
   120 s. The wave-4 gate was therefore run with `--timeout=120000` **on the
   command line only**. Do NOT commit a raised timeout as a default: a silently
   raised global timeout masks real regressions the day the machine is healthy
   again. **Do not compare a wave-4 wall-clock against wave 3's 34.8 min**
   naively; the per-test cost was anomalous, not the suite.

The one genuine finding underneath the noise is recorded with GPU-01/GPU-03 in
known_issues.md: `gpu-icon-recovery.spec.ts`'s recovery test was racing the
layer's own retry cascade (`MAX_ICON_LOAD_ATTEMPTS`), which burns back-to-back
without any help from `forceRebuilds`. Fixed spec-side; the reconciliation was
deliberately left alone.

### Exploratory remediation wave 4 — consistency & decided UX (2026-07-31)

The F-block (text/rich-text, view modes & annotations, styling, layers, icons),
the E2 reducer remainder, and the A4/A5 areas the campaign close-out added. Same
flip rule: each probe was promoted as its bug was fixed and trimmed out of the
lane.

**Class gates landed** (ADR 0047 §3), each verified able to go red before it was
committed:

- **[`bulkStyleFanOut.contract.test.ts`](../../packages/axoview-lib/src/utils/__tests__/bulkStyleFanOut.contract.test.ts)** · 24 tests · **CLASS GATE** for *"bulk styling is representative-in / everyone-out"* (F3 standing thread F-c). The docked strip read ONE member of a homogeneous bulk (`bulk.ids[0]`) and wrote the derived value to all of them — right for an absolute value, wrong for anything derived, and it produced four filed bugs at once (STYL-01 payload, STYL-02/06 direction, STYL-08 order-dependence). Four sections: the B/I/U/S field maps are complete and every field exists on its zod schema; a source scan proves the strip never hand-writes a format field (the maps live in `utils/bulkStyleTarget.ts`, so a literal `isBold:` means a writer went around them); a sweep proves every derivation is order-independent; and §4 gates the neighbouring sibling-drift class STYL-05 came from — all three text-box Border writers go through one seeded helper. One detail is load-bearing: the connector label's bare `bold`/`italic`/`underline` fields are also the FormatName keys the derivation is written in, so scanning for them by name would flag every read — `strikethrough` is the tell instead, and a quartet revert necessarily names it.

- **[`leanSaveSingleImplementation.contract.test.ts`](../../packages/axoview-app/src/services/__tests__/leanSaveSingleImplementation.contract.test.ts)** · 15 tests · **CLASS GATE** for *"the same rule implemented on both sides of the app/lib boundary"* (ADR 0003 addendum 2026-08-01). ADR 0003's lean-save existed **three** times: the lib's ran against an empty fixture and stripped nothing (so JSON export wrote the whole loaded icon catalog), the app's carried its own stricter rule, and the app's **jest mock stubbed it as the identity function** — so the app's own tests could not see either behaviour. Four sections: one definition, in the lib, catalog-parameterised; no app-side re-implementation; no lib-side catalog; and §4 **runs both halves on the same input**, which is the property no source scan can see. §4 is what caught the identity-stub mock, an id-keyed composition that kept or dropped every icon sharing an id together, and the one legitimate SAVE/EXPORT divergence (an unloaded pack icon) — now pinned with its reason instead of papered over. **Verified red twice:** once for a planted duplicate, and again after the first version exempted `leanModel.ts` wholesale and so missed a duplicate planted in the very file it used to live in.

- **[`jestExpectArity.contract.test.ts`](../../packages/axoview-lib/src/__tests__/jestExpectArity.contract.test.ts)** · 9 tests · **CLASS GATE** for *"a probe written in the Playwright `expect(value, 'message')` style is red in Jest whatever the code does"*. Wave 3 lost a verdict to this: an OVL-14 probe read as a confirmed bug and the code was fine — the most expensive kind of rig fault, because it looks like evidence. Scans all four workspaces' Jest-context test files **including the quarantined lane, as data** (reading it breaks no part of the ADR 0047 §1 quarantine, and it is the only way a main-suite gate can protect a tree that is excluded from execution, tsc and knip). Playwright specs are out of scope — the form is legal there. **A regex cannot do this job:** `expect(keyIn(layers, 'high'))` has a comma and a quote inside its single argument, and every false positive the naive pattern produced on this repo was that shape; the gate finds a comma at paren depth zero, outside strings, template `${…}` and comments. Two CONTROLs stop a path typo making it vacuously green.

- **[`TextBoxInlineEditor.commitContract.test.tsx`](../../packages/axoview-lib/src/components/SceneLayers/TextBoxes/__tests__/TextBoxInlineEditor.commitContract.test.tsx)** · 6 tests · **REGRESSION PIN**, own file because the class is silent data loss. `finish('commit')` with no TEXT change fell through to `onCancel()` — dead-equivalent behaviour until TXT-08 gave cancel a real job, at which point a session that changed only styling was discarded by a left-click-away. Verified red against the old `&& changedRef.current`. The durable lesson is in the file header: **when a branch that was previously indistinguishable from its sibling gains behaviour, every caller that fell into it "harmlessly" becomes a live defect.**

Promoted suites — lib:

- **[`bulkStyleDerivation.test.ts`](../../packages/axoview-lib/src/utils/__tests__/bulkStyleDerivation.test.ts)** · the STYL-01/02/06/08 derivations: tri-state, `nextToggleValue`, `deriveSharedValue`, the one-field patch and the three naming schemes.
- **[`stripSliderRanges.test.ts`](../../packages/axoview-lib/src/utils/__tests__/stripSliderRanges.test.ts)** · the STYL-10 sweep (every strip slider's endpoints against the schema field it writes) and the STYL-12 opacity round trip. Neither was a bug; both are the generalised form of the connector-label 24→40 S1-brick lesson, so they belong in the main suite rather than a lane that only runs on demand. **When you add a slider to the strip, add its row.**

E2E: **[`bulk-format-mixed.spec.ts`](../../packages/axoview-e2e/tests/bulk-format-mixed.spec.ts)** · 5 tests · the strip driven through its real controls — a Bold press over a mixed bulk leaves italic alone (STYL-01), a mixed bulk reads `aria-pressed="mixed"` and one press applies rather than clears (STYL-02), the reversed selection gives the same result (STYL-08), the fan-out stays one undo entry (STYL-07), and clearing a rectangle fill writes an absent colour with the legacy preset cleared alongside it (STYL-03 ruling, ADR 0039 addendum).

The F1 text cluster + the E2 no-op reducer fix (ADR 0034 addendum 2026-07-31):

- **[`textBoxContentVocabulary.test.ts`](../../packages/axoview-lib/src/utils/__tests__/textBoxContentVocabulary.test.ts)** · 14 tests · the gap between the content vocabulary the EDITOR emits (Quill: `<p>`/`<li>` only) and the vocabulary the supported INPUT surfaces can store — plain text with newlines, `<div>` rows, `<br>` breaks. Measurement that models fewer rows than the render paints leaves every row after the first outside its own selection outline, transform box and `getItemAtTile` (TXT-01/02). Also the TXT-14 sniff: **`<T>` is not HTML**, and a tag-SHAPE regex does not say so (tag names are case-insensitive, so `<T>` matches `[a-z]` under `/i`) — the discriminator has to be the tag NAME.
- **[`noOpUpdate.test.ts`](../../packages/axoview-lib/src/stores/reducers/__tests__/noOpUpdate.test.ts)** · 12 tests · RED-06. The dispatcher honours the "nothing happened" signal, AND the `update*` reducers actually give it for an identical write. The comparison is deliberately primitive-only — an object-valued update counts as a change without inspection, because a deep compare on the drag hot path would cost more than the write it avoids.
- **[`useInlineRename.test.tsx`](../../packages/axoview-lib/src/hooks/__tests__/useInlineRename.test.tsx)** · +1 test, 3 rewritten · TXT-06 moved the AUTHORITY on ending a rename session from `blur` to the explicit press-away/key handlers. **Focus leaving is not the user leaving:** a plain mousedown on a strip control moves focus, and a hook that reads that blur as "commit" ends the rename however carefully its press-away listener allow-lists the strip.
- **[`modelItem.test.ts`](../../packages/axoview-lib/src/stores/reducers/__tests__/modelItem.test.ts)** · +3 · TXT-05, the ADR 0032 label seed at the creation chokepoint.
- App: **[`projectZipEmbeddedLinks.test.ts`](../../packages/axoview-app/src/services/project/__tests__/projectZipEmbeddedLinks.test.ts)** · 8 tests · TXT-09/10. The importer rewrites cross-diagram refs by SENTINEL as well as by key, so an `#diagram:<id>` inside a text box's HTML is covered by construction rather than by someone remembering.

E2E: **[`text-entity-lifecycle.spec.ts`](../../packages/axoview-e2e/tests/text-entity-lifecycle.spec.ts)** · 6 tests · the provisional-entity lifecycle (TXT-04/05/07/15) and **[`inline-edit-session-scope.spec.ts`](../../packages/axoview-e2e/tests/inline-edit-session-scope.spec.ts)** · 4 tests · the session boundary (TXT-06/08). Both carry CONTROL cases — a text-box session for the Label test to be compared against, and a COMMITTED session beside the cancelled one — because the fixes are about a *difference* between two paths and a test of one path alone cannot see it.

**A main-suite POM contract changed with this wave — `CanvasPOM.placeLabelAt`.**
The TXT-07 ruling removed the `'Label'` placeholder: placement seeds EMPTY text
and a Label whose first edit session ends without text is discarded. So the
helper now **types probe text and commits by default**, exactly like
`placeTextBoxAt`, with a `keepEditing: true` opt-out. Eight specs were adjusted
for the new contract, and the split is deliberate:

- **`keepEditing: true`** — `bulk-format-mixed`, `inline-edit-session-scope`, `text-entity-lifecycle`, `renderer-overlay-parity`. These drive the placement session themselves (they type, format or cancel inside it), so handing them a committed chip would test something else.
- **default (commits)** — `label-entity`, `label-edit-and-placement-cancel`, `element-link-card`, `connector-dot-and-label-placement`, `readonly-enforcement`, `touch-gesture-interrupts`. For these a Label is *setup* for a different assertion (z-order, select, delete, the link card, the read-only panel), and the old "place, then Escape the seeded placeholder" idiom would now leave nothing to select.

None of the eight was rewritten away from what it tested; `label-entity`'s
placement test still counts one Label per placement, and the cancel describe
never places a Label at all (it arms and cancels the MODE).

The F4 layers cluster:

- **[`layerRenderOrder.test.ts`](../../packages/axoview-lib/src/utils/__tests__/layerRenderOrder.test.ts)** · 5 tests · LAY-01. Only the node layers keyed their sort on `resolveRenderOrder`; `LabelsCanvas` and `Rectangles` sorted on `zIndex` alone, so the Layers panel looked like it controlled paint order for every element type and controlled it for one. Carries the zIndex-only comparator as a **CONTROL**, so the test demonstrably distinguishes the two keys rather than asserting into a vacuum.
- **[`layerAssignment.test.ts`](../../packages/axoview-lib/src/stores/reducers/__tests__/layerAssignment.test.ts)** · 9 tests · LAY-11 and the LAY-03 placement chokepoint. The fixture deliberately gives a node, a rectangle and a label the **same id** — the shape `assignLayerToItems` used to move all three of, because the caller's `ItemReference` type was dropped on the way in and one id-set was applied across all five collections.
- **[`deleteLayerContents.test.ts`](../../packages/axoview-lib/src/stores/reducers/__tests__/deleteLayerContents.test.ts)** · 15 tests · LAY-05 implementing the E2/RED-13 ruling — the two are one change because they are one gesture. The last describe **transcribes `useLayerContext`'s visibility derivation** (`!layer || layer.visible`) so the inversion is demonstrated rather than asserted from memory: a member of a hidden layer is hidden before the delete and visible after "keep contents", which is precisely what the dialog's Alert exists to warn about.

### Exploratory remediation wave 3 — interaction & rendering correctness (2026-07-31)

The I-block (pointer, touch, selection, connectors, pan/menu) and the R-block
(projection, WebGL, GPU layers, renderer, overlays). Same flip rule: each probe
was promoted as its bug was fixed and trimmed out of the lane.

**One class gate landed** (ADR 0047 §3), verified able to go red before it was
committed:

- **[`layerFilter.contract.test.ts`](../../packages/axoview-lib/src/components/SceneLayers/__tests__/layerFilter.contract.test.ts)** · 38 tests · **CLASS GATE** for *"layer visible/locked filter re-application in new paint/affordance layers"*. Four layers had drifted, each added at a different time by someone without the rule in front of them: `ConnectorLabels` had no filter at all (RND-02), `NodeLabelHitLayer` had the visible half and not the locked half (OVL-13), `TransformControlsManager` consulted `lockedIds` and never `visibleIds` (CTX-06). The gate enumerates every paint/affordance layer with what its filter must cover **and why** — HIDDEN means nothing belonging to the entity may draw; LOCKED means only the gestures that *mutate* it are withheld, so a paint-only layer has no reason to read `lockedIds`. A new layer with no table entry fails on the enumeration; a listed layer that drops its filter fails on the scan. Two details are load-bearing and were both found by checking the gate could go red rather than by reasoning: the scan strips **comments** (these files explain their filters at length, and the two that warn *"NOT `visibleIds.size`"* would fail a negative scan for saying exactly the right thing) **and import statements** (the first version passed with the filter deleted, because `import { useLayerContext } …` still contained the word — a gate satisfied by an unused import is a gate that cannot fail).

Promoted suites — lib:

- **[`keyboardScope.test.ts`](../../packages/axoview-lib/src/interaction/__tests__/keyboardScope.test.ts)** + **[`canvas-keyboard-scope.spec.ts`](../../packages/axoview-e2e/tests/canvas-keyboard-scope.spec.ts)** (13 e2e) · the canvas keydown dispatcher listens on `document`, so it also ran while a modal dialog was open or a text selection the app does not own was live. `isModalDialogOpen()` deliberately does **not** match `role="menu"` — a menu is the app's own surface and its shortcuts should keep working.
- **[`connectorHitTest.test.ts`](../../packages/axoview-lib/src/interaction/modes/__tests__/connectorHitTest.test.ts)** + **[`connector-integrity.spec.ts`](../../packages/axoview-e2e/tests/connector-integrity.spec.ts)** (10 e2e) · degenerate connectors, parallel fan-out, and the reconnect abort path, which had no revert at all.
- **[`mergeMarqueeSelection.test.ts`](../../packages/axoview-lib/src/utils/__tests__/mergeMarqueeSelection.test.ts)** + **[`selection-group-rules.spec.ts`](../../packages/axoview-e2e/tests/selection-group-rules.spec.ts)** (8 e2e) · SEL-15 additive marquee (ADR 0006 §10 addendum) and the group-integrity rules around it.
- **[`canvasDropTarget.test.ts`](../../packages/axoview-lib/src/utils/__tests__/canvasDropTarget.test.ts)** + **[`touch-gesture-interrupts.spec.ts`](../../packages/axoview-e2e/tests/touch-gesture-interrupts.spec.ts)** (15 e2e) · the shared `endPointer(e, {cancelled})` (TCH-06 + TCH-14) and one canvas-drop test shared by the three placement modes.
- **[`reprojectOffset.test.ts`](../../packages/axoview-lib/src/utils/__tests__/reprojectOffset.test.ts)**, **[`projectBounds.test.ts`](../../packages/axoview-lib/src/utils/__tests__/projectBounds.test.ts)**, **[`hitPaintOrder.test.ts`](../../packages/axoview-lib/src/utils/__tests__/hitPaintOrder.test.ts)**, **[`fitToView.test.ts`](../../packages/axoview-lib/src/utils/__tests__/fitToView.test.ts)** + **[`projection-geometry.spec.ts`](../../packages/axoview-e2e/tests/projection-geometry.spec.ts)** (5 e2e) · the R1 cluster. `getFitToViewParams` had **no** production unit test before this wave, which is how it kept a missing `MIN_ZOOM` floor.
- **[`glSpriteBatch.atlas.test.ts`](../../packages/axoview-lib/src/webgl/__tests__/glSpriteBatch.atlas.test.ts)**, **[`itemRaster.ellipsize.test.ts`](../../packages/axoview-lib/src/webgl/__tests__/itemRaster.ellipsize.test.ts)** + **[`gpu-icon-recovery.spec.ts`](../../packages/axoview-e2e/tests/gpu-icon-recovery.spec.ts)** (2 e2e) · the atlas never staying unpacked, and the icon-decode failure path that used to hold `data-all-icons-drawn` at false for a whole session.
- **[`useImageAspect.test.tsx`](../../packages/axoview-lib/src/hooks/__tests__/useImageAspect.test.tsx)** · 7 tests · the hook the ADR 0044 selection outline sizes itself from, which had no failure path: a dead url was re-requested on **every** mount of every outline naming it. The exact inverse of GPU-03, where a transient failure *was* cached as permanent — the two icon caches got the trade-off wrong in opposite directions.
- **[`TransformControlsManager.layerGate.test.tsx`](../../packages/axoview-lib/src/components/TransformControlsManager/__tests__/TransformControlsManager.layerGate.test.tsx)** · the CTX-06 half of the layer-filter class.

E2E: **[`renderer-overlay-parity.spec.ts`](../../packages/axoview-e2e/tests/renderer-overlay-parity.spec.ts)** · 8 tests · the behavioural half of the layer-filter class, which the static gate cannot reach: the gate can see that a filter *exists*, not that it removes anything on screen. Covers hidden-layer connector chips (RND-02), promotion for an id containing the join separator (RND-04), the LOD band applying to the promoted node too (RND-05), the RND-14 reveal-then-act cull bypass, present-mode hover proxies (OVL-06), the counter-scaled grab box (OVL-12) and the locked-layer handle (OVL-13). Every test asserts its precondition — the layer really is hidden/locked, the cull really fired, the counter-scale really is engaged — so a setup that silently did not happen cannot read as a pass.

Suite total **250 passed (34.8 min), exit 0** — up from wave 2's 189, the
difference being wave 3's seven promoted e2e specs and the touch-project
additions.

**A second rig lesson, after wave 2's CDP one.** Jest's `expect` throws
`"Expect takes at most one argument."`, so a probe written in the Playwright
`expect(value, 'message')` style is red whatever the code does. One OVL-14 probe
was, and would have stayed red after any fix. A scan of every Jest suite in the
repo found it to be the only occurrence, and Playwright's 178 uses (including
the campaign's e2e invariant fixture) are unaffected — had that form not worked
there, every explore spec would have failed at the fixture rather than at its
assertions. Promotion is what surfaced it: flipping a probe re-runs it against
fixed code, which is precisely the check that catches a probe red for the wrong
reason.

### Exploratory remediation wave 2 — trust & security (2026-07-30)

The S-track (Google identity, share backend, Drive sharing) plus the read-only
enforcement class and MOP-01's copy identity. Same flip rule as wave 1: each
probe was promoted as its bug was fixed, and the lane files retired.

**Four class gates landed** (ADR 0047 §3) — each verified able to go red before
it was committed, per the 2026-07-29 audit's "a green gate that cannot fail"
finding:

- **[`readonlySurfaces.contract.test.ts`](../../packages/axoview-lib/src/interaction/__tests__/readonlySurfaces.contract.test.ts)** · 31 tests · **CLASS GATE**, keyboard half, **per-surface opt-in**. `EXPLORABLE_READONLY` was enforced surface-by-surface from memory, so most canvas shortcuts mutated a read-only diagram. Every keydown delegate now carries an explicit `viewer` / `editor` access class in [`readonlyPolicy.ts`](../../packages/axoview-lib/src/interaction/readonlyPolicy.ts), and the gate cross-checks that table against the dispatcher's *source*: a new shortcut with no access class fails, and so does an `editor` surface whose call site does not consult the policy. Verified red by unwrapping the z-order guard. I1/PTR-01/02/03.
- **[`readonlyPanels.contract.test.tsx`](../../packages/axoview-lib/src/components/ItemControls/__tests__/readonlyPanels.contract.test.tsx)** · 17 tests · **CLASS GATE**, panel half. Renders all five element panels in *both* modes and scans `ItemControlsManager` for the `readOnly` forwarding, so a sixth panel — or a regressed fifth — fails without anyone remembering to write a test. Verified red by dropping the prop from the LABEL branch. F2/VIEW-11.
- **[`externalLinks.contract.test.ts`](../../packages/axoview-lib/src/__tests__/externalLinks.contract.test.ts)** (lib, 5 tests) and [its app twin](../../packages/axoview-app/src/__tests__/externalLinks.contract.test.ts) (4 tests) · **CLASS GATE** for the blind spot ADR 0029 leaves: the rel-forcing hook lives *inside* `sanitizeHtml`, so React-built link surfaces get `target=_blank` from their own JSX and the sanitizer tests cannot see them. Every surface was already compliant — this pins the property rather than fixing a defect. Two gates so each package fails on its own files. Verified red by removing a `rel` from `AboutTab`. F1 invariant list.

Promoted suites:

- **[`authStore.sessionIntegrity.test.ts`](../../packages/axoview-app/src/stores/__tests__/authStore.sessionIntegrity.test.ts)** · 20 tests · the auth state machine with a SECOND actor arriving mid-request — a Drive 401, a scope-403, a second sign-in click, the safety-net timeout. The existing `authStore.test.ts` drives one request at a time, which is why this area's whole seam was invisible to it. S1/AUTH-01..05, 07, 11, 12, 13, 16.
- **[`GoogleDriveProvider.authFailures.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/GoogleDriveProvider.authFailures.test.ts)** · 8 tests · `request()` is where an HTTP answer becomes an auth *decision*, and three of the four it made were wrong the same way — a status code treated as if it named the cause. Pins the 403 split (scope vs rate limit vs neither), that a withheld token in `DRIVE_ACCESS_REQUIRED` reads as a scope problem rather than "not signed in", and that sign-out invalidates the per-account Drive root caches. S1/AUTH-06, 08, 09, 16.
- **[`AuthControl.identity.test.tsx`](../../packages/axoview-app/src/components/__tests__/AuthControl.identity.test.tsx)** · 3 tests · the DOM consequence AUTH-05 was actually about: a session whose one `userinfo` call failed must still render its Sign out control. `AuthControl` had no unit test at all.
- **[`routes.shareIntegrity.spec.js`](../../packages/axoview-backend/src/__tests__/routes.shareIntegrity.spec.js)** · 25 tests · what the route layer does when "one well-formed request at a time" stops holding: a concurrent second request, a reserved id, a body carrying a server-owned field, a source diagram since trashed. S2/SHARE-01..06, 11, 15.
- **[`server.wiring.spec.js`](../../packages/axoview-backend/src/__tests__/server.wiring.spec.js)** · 7 tests · boots the real `server.js` as a child process and speaks HTTP to it, because middleware ordering and the `requireStorage` route flags cannot be answered at the handler tier. The CORS leg asserts the diagram is genuinely **not published**, not merely that the response was withheld — the distinction SHARE-09 exists for. S2/SHARE-08, 09, 10.

Existing suites absorbed the rest: `drivePublicRead.test.ts` (+4, and its toy
`'fid'` fixture replaced with a realistic Drive id, which the new DRV-12 shape
check correctly refuses), `driveSharing.test.ts` (+6), `drivePicker.test.ts`
(the wrong-file outcome), `LocalStorageProvider.test.ts` (+4),
`importedBlob.test.ts` (+6, MOP-01), `app.spec.ts` (worker, +5),
`routes.config.spec.js` and the worker's config test (the CHR-08 key). New:
[`appBase.publicBase.test.ts`](../../packages/axoview-app/src/__tests__/appBase.publicBase.test.ts)
· 10 tests · the CHR-08 configured-base ruling, including that both link
builders inherit it and fall back together.

E2E: **[`readonly-enforcement.spec.ts`](../../packages/axoview-e2e/tests/readonly-enforcement.spec.ts)** · 9 tests · the read-only class through the real app — real keystrokes, real mouse, real store. Carries a 60 s per-test timeout because every leg boots a blank diagram and places a node through the real palette before it can reach read-only. Suite total **189 passed, exit 0**.

**Why the full run still matters, even with the class gates.** Wave 2's CTX-15
fix made a dormant `Pan.mouseup` branch reachable for the first time — and that
branch had its own latent bug (a window-bound listener with no
`isRendererInteraction` check) which nothing had ever been able to expose. Both
unit gates missed it and so did the new read-only spec, because all of them
click the canvas. It took a journey that clicks real app chrome (J5.3, the
linked-diagram link in the read-only NodePanel) to surface it. Un-deadening a
code path is a change to that path; budget for the full suite when a change
revives one.

### Exploratory remediation wave 1 — save path, storage places, layer history (2026-07-30)

Promoted from the 2026-07 campaign's quarantined probe lane as each bug was
fixed (ADR 0047 §2). All five are behavioural suites over the real hook,
provider or store — none of them mock the thing under test.

- **[`useAutoSave.test.ts`](../../packages/axoview-app/src/hooks/__tests__/useAutoSave.test.ts)** · 11 tests · the debounced write path, which had none. Pins flush-not-cancel on unmount / `enabled:false` / `resetStatus()`, the failed-write re-queue, `saveNow()` awaiting an in-flight write and reporting its own outcome, and write serialisation (an older write can neither land after nor report "saved" over a newer one). A1/LIFE-01, 05, 06, 07, 08, 09.
- **[`DiagramLifecycleProvider.save.test.tsx`](../../packages/axoview-app/src/providers/__tests__/DiagramLifecycleProvider.save.test.tsx)** · 10 tests · the real provider under jsdom (a closure read and a `beforeunload` listener are not observable below the component). Manual save inside the debounce window, retry after a failed autosave, the single unsaved-work guard, the two rename paths, and the create-blank flush. A1/LIFE-02, 03, 04, 09, 12, 14.
- **[`AppStorageContext.place.test.tsx`](../../packages/axoview-app/src/providers/__tests__/AppStorageContext.place.test.tsx)** · 1 test · the active place survives a provider remount, because the `StorageManager` singleton owns it. A2/STOR-12.
- **[`StorageManager.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/StorageManager.test.ts)** · 3 tests · the provider registry, which had none: active-id reporting, unknown-provider refusal, and `setServerStorage` reaching every registered provider. A2/STOR-10.
- **[`useLayerActions.history.test.tsx`](../../packages/axoview-lib/src/hooks/__tests__/useLayerActions.history.test.tsx)** · 4 tests · a layer op is its own logical action: fresh sequence, one action per Ctrl+Z, no stranded text-box scene size, no orphan scene connector on the next undo. E1/HIST-01.

- **[`historyBrackets.test.tsx`](../../packages/axoview-lib/src/hooks/__tests__/historyBrackets.test.tsx)** · 9 tests · the transaction / drag brackets and the pre-snapshot they arm, driven through TWO `useSceneActions()` instances under one provider pair — the configuration the app actually runs, and the one a per-hook ref could not model. Pins that a foreign mid-drag write does not move where undo lands, that `useHistory.transaction` groups scene CRUD into one entry, that a throwing reducer leaves no armed snapshot, that a new action clears both redo stacks, that a leaked drag bracket is recoverable, and that a write made inside a bracket by another route survives the commit. E1/HIST-02, 05, 06, 07, 08; E3/SCN-08.
- **[`repairModel.test.ts`](../../packages/axoview-lib/src/utils/__tests__/repairModel.test.ts)** · 13 tests · the identity/range repair applied on the way in, per the owner's repair-don't-reject ruling. Every case asserts both that the violation is gone AND that the model still parses — including the non-finite coordinate, which the schema rejects, so those files do not open at all today. Carries the "a clean file is byte-identical" control that stops the repair firing spuriously. E4/CLIP-01, E4/CLIP-15, E2/RED-03.
- **[`leanModel.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/leanModel.test.ts)** · 5 tests · what ADR 0003 lean-save may and may not discard. A2/STOR-14.
- **[`importedBlob.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/importedBlob.test.ts)** · 5 tests · the field whitelist an imported document passes through. A3/ZIP-06.
- **[`useFileTree.orphans.test.ts`](../../packages/axoview-app/src/hooks/__tests__/useFileTree.orphans.test.ts)** · 4 tests · a Drive diagram whose folder is not in the tree is re-homed to root rather than vanishing. A2/STOR-13.
- **[`modelIdentity.contract.test.ts`](../../packages/axoview-lib/src/schemas/__tests__/modelIdentity.contract.test.ts)** · 11 tests · **CLASS GATE** (ADR 0047 §3) for the campaign's biggest cross-area finding: the model has reference-integrity checks but no identity or range checks. It scans for the *class*, not the individual bugs — the range half derives the bounded fields from `viewItemSchema` through `safeParse`, so adding a schema bound without a write-site clamp fails it, and it asserts the discovery found something so it cannot become a vacuous green. Verified red by removing the `iconScale` clamp. The identity half pins `layer.order` as a permutation of 0..n-1 across every layer mutation, the refusal of a layer id that names no layer, and that a default page name is never one already on screen. E2/RED-03/04/05, E3/SCN-13, E4/CLIP-13.

Three existing suites absorbed the rest rather than growing new files:
`useRuntimeConfig.test.ts` (+2, the STOR-11 ruling — a transport failure is never
cached, a received response still is), `ImportErrorDialog.test.tsx` (+6, A3/ZIP-08
— each failure class gets copy that is true for it, with both fall-through
controls), and **`projectZip.test.ts` (+16)**, which now covers the whole A3
project-ZIP block: the cyclic folder graph (ZIP-01), what the archive does and
does not contain (ZIP-07, ZIP-11, ZIP-13, ZIP-15), replaceAll's
create-before-delete ordering (ZIP-03), folder ordering across a round trip
(ZIP-10) and cross-diagram links (ZIP-02). New:
[`importSummary.test.ts`](../../packages/axoview-app/src/utils/__tests__/importSummary.test.ts)
· 6 tests · the import toast reports what actually landed, and names both kinds
of shortfall (A3/ZIP-05, ZIP-02).

**The lane stays out of CI.** Wave 1 also excluded `src/__explore__` from both
packages' `tsconfig.json`: `npm run lint` is `tsc --noEmit` and was sweeping the
probes in, so the CI type-check gate had been red since the campaign branch
merged. Probes are still type-checked per-file by ts-jest when they run.

### ADR 0023 hardening additions — off-grid rendered geometry (2026-07-23)

Follow-up to the seven-bug off-grid cluster fixed in `8ee54861`. **Why these exist, in one line:** ADR 0023's own acceptance tests assert the *data model* (tile stays integer, `offset` is committed), and every one of those seven bugs shipped green under them — they all lived in the gap between where an item is DRAWN and where it is FRAMED / HIT-TESTED. These suites assert that gap. Each file carries a "Why this exists" header; the ADR 0023 addendum (2026-07-23) names the invariant suite as the new acceptance surface for off-grid geometry.

| Suite | Type | Covers |
|---|---|---|
| `utils/__tests__/renderedGeometry.invariant.test.tsx` | lib unit | **The test that would have caught all seven.** 162 cases — element kind × offset corpus × canvas mode — asserting RENDERED ARTIFACTS, never helper-vs-helper: `Node`'s `--ff-x`/`--ff-off-x` CSS vars, the selection chrome and hover outline SVG boxes, the node label proxy's rect, the iso-ring chrome shift, the WebGL rectangle vertex tuple, and real `getItemAtTile` calls (hit at the drawn centre, miss at the vacated cell). Expectations derive from the raw projection, so they stay independent of `renderedGeometry`. Tolerance is 1e-6 px, not 0.5: jsdom does no layout, and at 0.5 px the corpus's sub-pixel case would survive a consumer dropping the offset entirely. A one-time mutation gate (recorded in the header) proved it red. |
| `utils/__tests__/renderedGeometry.contract.test.ts` | lib unit | Source-scan gate: no file outside `utils/renderedGeometry.ts` may hand-roll an offset composition (three patterns — `offset?.x ?? 0`, `base.x + it.offset.x`, `${it.offset.x}px` in a translate). Each pattern is pinned by a positive AND negative sample, so a rotted regex can't pass silently while enforcing nothing. Precedent: `backendRoutes.contract.test.ts`. |
| `interaction/__tests__/usePanHandlers.offGridMenu.test.ts` | lib unit | Right-click target resolution against the REAL `getItemAtTile` — a separate file because the sibling `usePanHandlers.test.ts` stubs it and so cannot see this bug class. Cursor on the drawn body → ITEM menu; the cell a tile away → CANVAS menu. |
| `components/SceneLayers/__tests__/labelPointerContract.test.tsx` | lib unit | One `describe.each` over BOTH label hit-proxies (`LabelHitLayer`, `NodeLabelHitLayer`), because bug #7 was sibling drift between them: the primary-button guard and the "the proxy swallows the press, so it must own the context menu" pairing. Polyfills `PointerEvent` — without it RTL drops `button` and the guard passes for the wrong reason. |
| `tests/off-grid-pointer.spec.ts` | e2e | The sub-tile regime, real `page.mouse` (a tile-centre→tile-centre drag structurally cannot exercise it): a non-tile-multiple drag moves the DOM box by exactly that delta; hover outline, selection chrome and the item menu land on the drawn position while the vacated cell opens the canvas menu; the node's name chip is grabbable and right-clickable where it is drawn. |
| `tests/snap-grid.spec.ts` (extended) | e2e | Three cases on top of the ADR's model assertions: the lasso-accumulate repro (select several, move twice, each still opens its own item menu), an off-grid item surviving reload as PAINTED rather than merely stored, and the freeze test pinning that turning global snap ON does **not** re-snap existing off-grid items (open product question — see PLAN.md). |

Shared e2e helpers live in [`packages/axoview-e2e/helpers/offGrid.ts`](../../packages/axoview-e2e/helpers/offGrid.ts); the load-bearing one is `drawnClientPoint`, since a spec that can only address an item's grid cell cannot see any of this.

### ADR 0044 additions — on-canvas icon resize (2026-07-19)

| Suite | Type | Covers |
|---|---|---|
| `interaction/__tests__/TransformNode.test.ts` | unit | The `NODE.TRANSFORM` mode — drag→scale (clamp `[0.3, 2.5]`, per-corner outward sign, `1/zoom` sensitivity), the uniform group factor (relative sizes preserved across N targets), commit-once-per-gesture inside one transaction, and the exit safety net. Preview-only (no per-frame model write). |
| `schemas/__tests__/views.test.ts` (extended) | unit | Per-node `iconScale` round-trips + hard bounds; absent = valid (zero-migration). |

### ADR 0042 additions — Drive-native sharing & read-only preview (2026-07-14)

E2E for the [ADR 0042](../adr/0042-drive-native-sharing-and-readonly-preview.md) Drive display route, driven with **mocked** googleapis fetches (so it runs headless — unlike the real-OAuth Drive provider suites below).

| Suite | Type | Covers |
|---|---|---|
| `drive-display.spec.ts` | E2E | `/display/drive/:driveFileId` route (ADR 0042): anonymous **key-read** render in **View-Only** mode; the **needs-sign-in gate** (never the `LocalModeShareError` dialog); `resourceKey` header propagation (`X-Goog-Drive-Resource-Keys`) from a `?resourceKey=` link |

### UX-sweep fixes — floating-Label interaction wiring (2026-07-10)

Shipped with the 2026-07-10 ADR 0028 persona-sweep triage (sweep doc retired 2026-07-14; see git history). Closes the verifier-flagged gap "no test exercises single-label Delete."

| Suite | Type | Covers |
|---|---|---|
| `interaction/__tests__/handleDeleteKey.test.ts` | lib unit | **L-1** — the Delete/Backspace dispatch extracted to [`handleDeleteKey.ts`](../../packages/axoview-lib/src/interaction/handleDeleteKey.ts): per-type dispatch (ITEM/CONNECTOR/TEXTBOX/RECTANGLE/**LABEL**) routes to its delete action; single-Label Delete calls `deleteLabel` + clears the panel; the contentEditable-focus guard blocks delete mid inline-edit; `isEditableTarget` truth table |
| `label-entity.spec.ts` (extended) | E2E | **L-1** select + Delete removes the Label; **L-3** clicking a Label does not auto-open the Properties dock (`rightSidebarOpen` stays false); **L-2** right-click opens the item context menu (`variant:'item'`, `target.type:'LABEL'`) |

### Phase 3A/3B additions — Google Drive storage & places model (2026-07-05 → 2026-07-06)

New/extended suites shipped with [ADRs 0035–0037](../adr/) (app `+40` unit across `+3` suites; worker `+3`; lib `+2`). No Drive E2E — real OAuth can't run headless, so the owner live-test matrix is the UI gate (e2e is PR-only anyway).

| Suite | Type | Covers |
|---|---|---|
| `stores/__tests__/authStore.test.ts` | app unit | GIS state machine, `getValidToken()` piggyback, profile-hint persistence, **token-never-persisted `localStorage.setItem` spy**, silent-reconnect quiet failure, `login_hint` on silent requests, granular-consent `driveScopeGranted` tracking |
| `services/storage/__tests__/GoogleDriveProvider.test.ts` | app unit | Drive API mapping (jest fetch-mock), root discovery/stale-cache recovery, backoff + 403 classification, 401 → SESSION_EXPIRED, trash semantics, lean-save |
| `services/storage/__tests__/driveTransfer.test.ts` | app unit | move-to-Drive create→verify→delete contract, folder-path recreation with reuse, name-collision `copySuffix`, partial-failure keeps source |
| `src/__tests__/cfAccessJwt.spec.ts` (extended) | worker unit | RS256 signature-verify happy + invalid-signature paths (catalogued fold-in from PLAN) |
| `utils/__tests__/sanitizeHtml.test.ts` (extended) | lib unit | hardening round additions (ba0666a) |

### v1.1 close-out gates (2026-06-10)

Two CI gates hardened at the v1.1 close-out (`@typescript-eslint/no-explicit-any` → `error`; Knip → hard-fail). The full CI-gate inventory + lint-debt detail — including the latent ~17 `tsc --noEmit` fixture-type errors confined to `__perf_refactor_regression__/*.test.ts(x)` — lives in [technical-review-2026-06.md §8b/§8e/§11](../reviews/technical-review-2026-06.md#8-quality-kpis-aggregate); not restated here.

### Phase 6 additions — Presentation & Annotation (2026-06-12)

New suites shipped with [ADRs 0012–0015](../adr/) (lib `+39` / app `+7` unit; `+6` E2E specs):

| Suite | Type | Covers |
|---|---|---|
| `utils/__tests__/coordinateTransforms.test.ts` (extended) | lib unit | `fromCanvasPoint` round-trip + `getCanvasModeSwitchScroll` recenter math (iso↔2D zoom preservation) |
| `utils/__tests__/labelScale.test.ts` | lib unit | "keep labels readable" counter-scale math |
| `utils/__tests__/previewLayerVisibility.test.ts` | lib unit | preview layer override merge (solo wins; else `layer.visible` minus hidden) |
| `utils/__tests__/annotationGeometry.test.ts` | lib unit | annotation screen↔scene math, polyline/arrow/rect path builders |
| `utils/__tests__/annotationPersistence.test.ts` | lib unit | **load-bearing:** annotation data never reaches the saved model (whitelist + lean-save) |
| `components/ViewModeInfoPopover/__tests__/hasInfoPopoverContent.test.ts` | lib unit | popover content gate + `toHref` link normalisation |
| `__perf_refactor_regression__/annotationOpenReset.contract.test.ts` | lib unit | opening annotation resets the armed canvas tool + selection |
| `components/__tests__/EmptyStateScreen.test.tsx` | app unit | whole-card click target, no nested button, a11y name |
| `services/project/__tests__/projectZip.test.ts` (extended) | app unit | zero annotation bytes in any exported zip entry |
| `canvas-mode-zoom-preserve.spec.ts` | E2E | zoom % + center preserved across iso↔2D round-trip |
| `empty-state-clickable-card.spec.ts` | E2E | whole empty-state card clickable; no nested button |
| `readable-labels.spec.ts` | E2E | label toggle persists + counter-scales at low zoom |
| `preview-layer-switcher.spec.ts` | E2E | toggle/solo are UI-only + non-dirty in view mode |
| `view-mode-info-popover.spec.ts` | E2E | hover preview, pin content + link, X/Esc close, **side-anchor right + flip-left near edge** |
| `annotation-overlay.spec.ts` | E2E | pen toggle, draw, undo/redo, close-retains, Select pass-through, group fly-outs, preview pan-block, model stays annotation-free |

### Phase 6.5 additions — Touch & pen gesture contract (2026-06-14)

New suites shipped with [ADR 0018](../adr/0018-touch-pen-gesture-contract.md) — the Pointer-Events touch/pen rewrite (direct manipulation) + the D-7 dual-stack undo fix (lib `+32` unit / `+4` suites; `+10` E2E specs):

| Suite | Type | Covers |
|---|---|---|
| `__perf_refactor_regression__/touchGesture.test.ts` | lib unit | tap-slop classifier (`exceedsTapSlop`) + touch gesture config constants |
| `__perf_refactor_regression__/undo.dualStackSkew.test.tsx` | lib unit | **load-bearing:** D-7 model/scene dual-stack undo can't skew — logical-action sequence stamping keeps both stacks aligned across interleaved edits |
| `__perf_refactor_regression__/rectangleDrawTransform.modes.test.ts` | lib unit | rectangle draw + transform route through the immer-free batch updater (one history entry, no per-frame full-state clone) |
| `__perf_refactor_regression__/rectangleTextbox.dragPerf.test.tsx` | lib unit | rectangle/textbox drag uses `batchUpdate*` (immer-free structural copy) — pins the 7fps→smooth drag perf fix |
| `touch-tap-select.spec.ts` | E2E | tap a node selects; tap empty clears |
| `touch-tap-vs-pan.spec.ts` | E2E | one-finger drag pans (scroll changes) and does not select |
| `touch-drag-move.spec.ts` | E2E | one-finger drag starting on a node moves it (direct manipulation, no corner jump) |
| `touch-pinch-zoom.spec.ts` | E2E | two-finger pinch zooms in/out, clamped to [0.1, 1] |
| `touch-lasso-select.spec.ts` | E2E | LASSO/FREEHAND tool modes own the one-finger drag (marquee select, not pan) |
| `touch-resize.spec.ts` | E2E | dragging a transform handle resizes a rectangle (does not pan) |
| `touch-longpress.spec.ts` | E2E | hold on a node opens its action bar **during** the hold; hold-on-empty-then-drag arms a one-shot marquee lasso |
| `touch-palette-drag.spec.ts` | E2E | drag an Elements-panel icon onto the canvas to place it; preview ghost is suppressed until the drag engages, then tracks the finger |
| `css-preview-mid-drag.spec.ts` | E2E | CSS drag-preview transform applied mid-drag (no per-frame store write) |
| `undo-redo-dual-stack.spec.ts` | E2E | end-to-end D-7: interleaved model + scene edits undo/redo in the correct order |

### Pre-T3 hardening additions (2026-06-16) — ADR 0021

New suites + extensions shipped with the paste-O(N) + pre-T3 render/drag wave ([ADR 0021](../adr/0021-paste-algorithmic-perf-and-spatial-index.md); PR #48 paste, #49 pre-T3):

| Suite | Type | Covers |
|---|---|---|
| `__perf_refactor_regression__/paste.bulkPerf.test.tsx` | lib unit | **load-bearing:** bulk paste is O(N+C) — `validateView` called exactly once, 2N nodes placed with no stacking, exactly one undo entry, under a per-node call-count budget (pins the O(N³) freeze fix) |
| `utils/__tests__/spatialIndex.test.ts` | lib unit | derived `TileIndex` — `at`/`isOccupied`/`insert`/`move`/`remove`/`range` + a brute-force occupancy invariant (the index agrees with a linear scan over random layouts) |
| `utils/__tests__/findNearestUnoccupiedTile.test.ts` | lib unit | rigid-stamp placement — a row pasted on itself shifts by one offset to clear space (keeps the block's shape, never collapses to one tile); degenerate dense case stamps at the target offset |
| `hooks/__tests__/useHistory.test.tsx` + `useHistory.realStore.test.tsx` (extended) | lib unit | scoped post-undo/redo D-8 connector re-sync — early-returns when no active-view connector path is empty (uiState store added to both wrappers); D-7 dual-stack coordination unchanged |
| `__perf_refactor_regression__/DragItems.modes.test.ts` (extended) | lib unit | rectangle / text-box drag is CSS-var-only during the move + a single `batchUpdate*` commit on mouseup (no per-frame store write) |
| `canvas-node-render.spec.ts` | E2E | Canvas2D node sprite centred on its tile + label connector stalk; `data-draw-count` anti-cheat reads == N at fit-to-view |
| `perf/engine-perf.spec.ts` (paste-on-top scenario) | perf harness | real Ctrl+C/Ctrl+V paste-on-top adds exactly N → 2N nodes; honest draw-count guard (see [ADR 0020](../adr/0020-engine-perf-harness-and-measurement-protocol.md)) |

CI: [`perf-smoke.yml`](../../.github/workflows/perf-smoke.yml) runs a small-N `npm run perf` on PRs so a regression in the measured render/paste path trips CI.

---

### Connector real-mouse + free-line additions (2026-06-22) — ADR 0022 addendum

The connector "locked / can't place" regression slipped through because every canvas E2E dispatches **synthetic** PointerEvents on the `canvas-interactions` box (forcing `isRendererInteraction` and only firing move+down+up at one point). The new spec drives **real `page.mouse`** so it exercises the actual `elementFromPoint` hit-test and real drag gestures:

| Suite | Type | Covers |
|---|---|---|
| `connector-realmouse.spec.ts` | E2E | **real-mouse** connector draw: a DRAG from a node commits + doesn't lock the tool; a DRAG between two nodes connects; a DRAG between two EMPTY tiles draws a free-floating (tile↔tile) line; a lone CLICK on empty creates nothing (stray-click guard); + an `elementFromPoint` guard that a node press resolves to `canvas-interactions` (catches z-order regressions) |
| `interaction/__tests__/Connector.test.ts` (extended) | lib unit | click-mode first press arms a tile-anchored connector on empty (free-floating start, ADR 0022 addendum) |
| `__perf_refactor_regression__/Connector.modes.test.ts` (extended) | lib unit | click-mode `mouseup`: drag completes (node OR empty start); lone empty click reverts the provisional connector; lone node click stays armed |

---

### Shake-out additions (2026-06-25)

UI bug-fix pass: removed the floating `NodeActionBar` (right-click context menu becomes the sole per-item surface, + "Add note"), moved ViewTabs into the BottomDock, and gave the canvas inline-rename editors a click-away commit contract (ADR 0022 §4).

| Suite | Type | Covers |
|---|---|---|
| `hooks/__tests__/useInlineRename.test.tsx` | lib unit | inline-rename click-away contract (ADR 0022 §4): Enter + plain blur (left-click-away) COMMIT; Escape + right-click-away CANCEL; capture-phase pointerdown blurs before the canvas deselect unmounts the editor; pointerdown inside the editor is ignored; Shift+Enter newline in multiline mode |
| `multiSelect.contract.test.ts` · `annotationOpenReset.contract.test.ts` (updated) | lib unit | dropped the `itemActionBarOpen` assertions — single-select is now purely select-only (derives the panel TARGET, mounts no surface) after the action-bar removal |
| `contextmenu-scope.spec.ts` · `label-drag.spec.ts` · `touch-longpress.spec.ts` (updated) | E2E | de-referenced the removed `itemActionBarOpen` store slice; contextmenu-scope now pins only the preventDefault scoping (its ADR 0018 purpose); long-press still asserts the context menu opens |

---

### Labels & text-styling productization (2026-07-05) — ADRs 0030–0034

Shipped on `integration` with [ADRs 0030–0034](../adr/) + the 5-persona UX-sweep fixes + the RT (rich-text dedupe / inline canvas editing) rounds. The cycle's suites are folded into the totals above. The table below is the durable catalogue; the RT-round rows (inline editing, link cards, rotate/border) land after the initial UX-sweep block.

| Suite | Type | Covers |
|---|---|---|
| `schemas/__tests__/label.test.ts` · `stores/reducers/__tests__/label.test.ts` | lib unit | floating **Label** entity ([ADR 0031](../adr/0031-floating-label-entity-model.md)) — schema round-trip + create/update/nudge-z reducers |
| `schemas/__tests__/notes.test.ts` | lib unit | `notes` on rectangle/textbox/label (parity with node/connector) |
| `utils/__tests__/foldNodeDescription.test.ts` | lib unit | Option-A `description`→`notes` fold ([ADR 0032](../adr/0032-node-name-caption-label-model.md)) — idempotent, block-separator, empty-skip |
| `utils/__tests__/seedNodeLabel.test.ts` · `seedConnectorLabel.test.ts` | lib unit | `label = name` / `name`→`labels[]` load seeds — idempotent via marker (the zero-migration seed pattern) |
| `utils/__tests__/bulkStyleTarget.test.ts` | lib unit | homogeneous bulk-target derivation for the strip ([ADR 0030](../adr/0030-docked-style-controls-strip.md) §2 amendment) |
| `ColorSelector/__tests__/ColorPickerBody.test.tsx` | lib unit | unified colour picker ([ADR 0039](../adr/0039-unified-color-picker-and-standard-palette.md)) — standard-grid render, hex-on-click, active-swatch (case-insensitive) match, grid-first custom reveal, contextual Transparent (fill/border/background only; absent for text). Replaces the removed dead-`ColorSelector` suite. |
| `IsoTileArea/__tests__/IsoTileArea.borderInset.test.tsx` | lib unit | rectangle border inset by `strokeWidth/2` (no clip on canvas/export) |
| `interaction/__tests__/TextBox.test.ts` · `Label.test.ts` | lib unit | placement mode contract — arm-vs-place gating (arming tap creates nothing → no double-placement), exactly-one-create on a canvas release, drag-from-panel places, wrong-mode guard (added 2026-07-02) |
| `label-entity.spec.ts` · `label-edit-and-placement-cancel.spec.ts` | E2E | Label placement, inline-edit, placement cancel (right-click/Escape) |
| `node-label-decouple.spec.ts` · `connector-parity.spec.ts` · `connector-dot-and-label-placement.spec.ts` | E2E | node + connector name↔label decouple; connector Details/Notes parity; dot marker + 1-tile connector + label placement |
| `bulk-style.spec.ts` · `cross-type-label-size.spec.ts` | E2E | bulk styling on a homogeneous selection; cross-type label sizing on a mixed selection |
| `connector-selection-clarity.spec.ts` · `canvas-selection-polish.spec.ts` | E2E | connector halo/exact-hit; selection polish (lasso reset, dbl-click label edit) |
| `rectangle-overlap-select.spec.ts` · `rectangle-zorder-menu.spec.ts` | E2E | overlapping-rectangle top-most select; rectangle z-order via context menu |
| `presenter-hover-notes.spec.ts` | E2E | view-mode hover popover shows only when the node has notes |
| `utils/__tests__/foldTextBoxStyleFlags.test.ts` · `richTextTransform.test.ts` · `quillListAutofill.test.ts` · `quillLinkShortcut.test.ts` · `isoMath.richtext.test.ts` | lib unit | inline canvas text editing ([ADR 0034](../adr/0034-inline-canvas-text-editing-and-dual-scope-strip-formatting.md)) — legacy `is*` flag fold into content, whole-content/range B-I-U-S + align transforms, markdown list autofill, `normalizeWebLinkUrl`/`expandToWord` link helpers, line-spacing/greedy-wrap geometry |
| `schemas/__tests__/textBox.test.ts` (extended) | lib unit | **S1-brick guard:** the ADR 0034 text-styling fields (`lineHeight`/`width`/`height`/`border*`/`verticalAlign`/`orientation`) round-trip, and the large unbounded values the strip can write MUST parse — a re-introduced cap fails the test (the connector-label 24→40 brick lesson) |
| `components/TransformControlsManager/__tests__/TransformControlsManager.dragChrome.test.tsx` | lib unit | **RECT-1:** selection bounds/anchors render nothing while `mode==='DRAG_ITEMS'` (every item type) and reappear at rest |
| `textbox-text-edit-move.spec.ts` · `element-link-card.spec.ts` · `rotate-border.spec.ts` · `toolbar-overflow.spec.ts` | E2E | inline text edit (commit/cancel/empty-box lifecycle/resize/paste/align/link card), Ctrl+K link cards for all label types, rotate handle + text-box border, toolbar style-slot overflow |

> **Placement-coverage (F2):** `TextBox.ts`/`Label.ts` mode arm-vs-place gating is unit-covered (`interaction/__tests__/{TextBox,Label}.test.ts`), and **right-click-cancel for TEXTBOX/LABEL/PLACE_ICON is now covered** (`usePanHandlers.test.ts`). Still open: the placement mode-hint pill + mouse-ghost render tests (pure-view; best covered by the ADR 0028 UX journey pass).
> **Resolved (2026-07-02):** the previously-red `multi-select-drag-lasso.spec.ts` mixed-marquee case is now green — the test built its marquee from a screen-space bbox that iso-inverted to a thin diagonal band and dropped the rectangle; rebuilt tile-first (the product Lasso code was sound).

---

## Quick Reference

| Layer | Suites | Tests |
|---|---|---|
| Interaction / Mode System | 6 | 87 |
| Scene / Hooks | 6 | 63 |
| Reducers | 6 | 85 |
| Schemas / Validation | 9 | 56 |
| Components | 11 | 48 |
| Perf / Render Isolation | 8 | 36 |
| Utilities & Config (incl. lean save) | 9 | 80 |
| Stores & Infrastructure | 4 | 67 |
| **Standalone app config** | **1** | **3** |
| **Total** | **60** | **525** |

(This Quick Reference is a by-layer breakdown of the **`axoview-lib`** suite snapshotted earlier in the wave, so its per-suite counts lag; the current `axoview-lib` figure is the **1522** in the totals table above. App-side suites — projectZip, LocalStorageProvider, lean-save/requiredPacks regressions, and the productization-audit additions — count under `axoview-app`; server-runtime suites under `axoview-backend` / `axoview-worker`.)

---

## Engine performance harness (2026-06-15) — ADR 0020

The engine-perf harness is the committed, reproducible measurement rig for the render
(T2) and simulation (T3) work. The decision + protocol are durable in
[ADR 0020](../adr/0020-engine-perf-harness-and-measurement-protocol.md); this is the
how-to.

- **Run:** `npm run perf` (config `packages/axoview-e2e/perf/perf.config.ts`). It
  **owns its server lifecycle** — `build:lib && dev` fresh — so it never measures a
  stale `dist/`. It drives the real app in real Chromium via the debug bridge
  (`window.__axoview__`), scripts a bulk-paste (spawn) and a synthetic drag, and writes
  `perf-results/baseline.md` (p50/p95/mean/longest/settle/long-task per N, the idle
  guardrail, and the machine **calibration index**).
- **Env knobs:** `PERF_N` (e.g. `500,1000,2000`), `PERF_REPEATS`, `PERF_WARMUP`,
  `PERF_IDLE_MS`; diagnostics `PERF_PROFILE`/`PERF_CPUPROFILE` (spawn),
  `PERF_DRAGPROFILE` (drag), `PERF_RENDERPROBE`, `PERF_NOLABEL`, `PERF_NOCONN`.
- **Measurement discipline (load-bearing):** cross-session machine drift was measured at
  ~22% (≫ the ~2–5% within-run noise), so every keep/revert is a **same-session A/B with
  a matching calibration index** — never a fresh run vs a prior-session baseline. A
  result inside the noise band is not a change. One `decision-log.md` row per hypothesis.
- **Anti-cheat:** the canvas node layer publishes a per-frame draw count on
  `data-draw-count`; the harness asserts it `== N` at fit-to-view (no off-screen cull
  shrinking the benchmark). `perf-results/baseline.md` is rewritten by **every** run incl.
  partial/diagnostic ones — `git checkout -- perf-results/baseline.md` after any non-full
  run; only a clean full idle run updates it.
- **Gotcha:** the rsbuild dev server desyncs from `dist/` after `build:lib` ("Can't
  resolve 'axoview'"). Let `npm run perf` own the lifecycle; do not `PERF_REUSE` against a
  hand-started server unless it was just rebuilt + restarted. Kill stray :3000 listeners
  between runs.

The running record (committed): [perf-results/baseline.md](../../perf-results/baseline.md)
(certified numbers) and [perf-results/decision-log.md](../../perf-results/decision-log.md)
(one row per hypothesis; the resume point is its tail).

## Branch additions (2026-05-19) — Startup perf + splash screen

| Suite | Coverage |
|---|---|
| [`packages/axoview-app/src/hooks/__tests__/useRuntimeConfig.test.ts`](../../packages/axoview-app/src/hooks/__tests__/useRuntimeConfig.test.ts) | 3 tests pinning `fetchRuntimeConfig` behavior: falls back to defaults on fetch rejection; aborts a hanging fetch via `AbortSignal.timeout(800)` within ~1 s (the load-bearing assertion — caps Chrome/Windows dual-stack connect-probe latency); singleton cache returns the same instance and hits fetch only once. |
| [`packages/axoview-app/src/providers/__tests__/AppStorageContext.test.tsx`](../../packages/axoview-app/src/providers/__tests__/AppStorageContext.test.tsx) | Render-based regression for the `Promise.all` parallelism contract: with both `/api/config` and `/api/storage/status` mocked to delay 200 ms, fetches must be initiated within 50 ms of each other and `isInitialized` flips to `true` within ~1.8 × the per-probe delay (≈360 ms, not the sequential ≈400 ms). Catches a regression to `await … await …`. |
| [`packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts) (extended) | Adds `isAvailable() aborts a hanging /api/storage/status probe within ~1 s and stays offline` — the mirror of the `useRuntimeConfig` timeout pin for the second startup probe. |

> Note: `jest.setup.js` now polyfills `AbortSignal.timeout` because jsdom 20 (bundled with `jest-environment-jsdom@29`) ships an `AbortSignal` missing the static `.timeout()` method. Without the polyfill, the `timeoutSignal()` helper in `LocalStorageProvider.ts` falls back to `undefined` in tests and the abort path can't be observed.

## Branch additions (2026-05-17) — MQA design shake-out (#19, #20, #8/#9)

| Suite | Coverage |
|---|---|
| [`packages/axoview-lib/src/__perf_refactor_regression__/multiSelect.contract.test.ts`](../../packages/axoview-lib/src/__perf_refactor_regression__/multiSelect.contract.test.ts) | 6 store-level tests pinning ADR-0006 invariants: `setSelectedIds([])` clears both slices; `setSelectedIds([single])` opens panel; `setSelectedIds([>1])` auto-hides panel (MQA #9); `toggleSelected` add/remove + auto-reopen on count→1; `clearSelection`; and `setItemControls(single)` mirroring into `selectedIds` for the layer-row click path. |
| [`packages/axoview-lib/src/utils/__tests__/connectorSelection.test.ts`](../../packages/axoview-lib/src/utils/__tests__/connectorSelection.test.ts) | 8 unit tests pinning the connector-with-waypoint helpers: `getConnectorWaypointRefs` (tile-bound middle anchors only, never endpoints), `isUserFacingRef` / `countUserFacingRefs` (waypoints don't inflate the badge), `filterUserFacingRefs` (drops waypoint refs for assign-to-layer dispatch). |
| [`packages/axoview-lib/src/__perf_refactor_regression__/Cursor.waypointGestures.test.ts`](../../packages/axoview-lib/src/__perf_refactor_regression__/Cursor.waypointGestures.test.ts) | 6 mode-action regression tests for MQA #8/#9 + waypoint-removal: Alt+click splice removes the clicked waypoint; subsequent mouseup preserves the connector selection (no spurious `clearSelection`); plain click still sets up drag; DOM-driven `targetAnchorId` lookup wins over tile-equality so off-tile clicks within the 32 px hit ring still resolve; Ctrl+click on a connector toggles connector + its waypoints as one atomic group. |

## Branch additions (2026-05-15 → 2026-05-16) — MQA Bundle B + follow-ups

| Suite | Coverage |
|---|---|
| [`packages/axoview-lib/src/__perf_refactor_regression__/connector.createUndoRedo.test.tsx`](../../packages/axoview-lib/src/__perf_refactor_regression__/connector.createUndoRedo.test.tsx) | Real-store regression for MQA #5. Exercises the full begin / createConnector / updateConnector×N / commit / undo path on `ModelProvider` + `SceneProvider` + `UiStateProvider`, asserts both stores' `canRedo()` are true after undo, and that the connector reappears after redo. Pins the load-bearing scene-store undo/redo invariant ([architecture.md §2g](architecture.md#2g-history-system)). |
| [`packages/axoview-lib/src/__perf_refactor_regression__/node.linkTooltipDedup.test.tsx`](../../packages/axoview-lib/src/__perf_refactor_regression__/node.linkTooltipDedup.test.ts) | Structural pin for MQA #22 + #25 final design: no chip / no click-Popover; bottom-right link badge is `pointerEvents: 'none'`; Pan.ts opens the readOnly NodePanel on body click for any content-bearing node; default cursor in EXPLORABLE_READONLY is `default`; NodePanel header renders the node name as a clickable link with URL in tooltip; LINKED DIAGRAM body section with resolved-name link or unresolved-id error. |
| [`packages/axoview-lib/src/__perf_refactor_regression__/f2.rendererScope.test.ts`](../../packages/axoview-lib/src/__perf_refactor_regression__/f2.rendererScope.test.ts) | MQA #13. Asserts the F2 → `inlineEditNodeName` dispatch in `useInteractionManager` is scoped to keystrokes originating inside the renderer, so a canvas-selected item can no longer steal focus from the file-explorer's edit input. |
| [`packages/axoview-app/src/utils/__tests__/shareUrl.test.ts`](../../packages/axoview-app/src/utils/__tests__/shareUrl.test.ts) | MQA #24. `shareUrlFromUuid(uuid)` always returns `window.location.origin + /display/p/<uuid>`; never leaks the backend port. |
| [`packages/axoview-app/src/components/fileExplorer/__tests__/delete.contract.test.ts`](../../packages/axoview-app/src/components/fileExplorer/__tests__/delete.contract.test.ts) | MQA #18. Calling-order contract: `notifyDiagramDeletedFromTree(id)` must fire **before** the storage delete in both `FileExplorer.confirmDelete` and `DiagramManager.confirmDelete`, and the provider implementation must cancel autosave, clear the scratch buffer, and reset `currentDiagram`. |
| [`packages/axoview-app/src/services/storage/__tests__/backendRoutes.contract.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/backendRoutes.contract.test.ts) | MQA #21. Source-level contract: `createFolder` and `createDiagram` in `packages/axoview-backend/src/routes.js` use random-suffix ids (`Math.random().toString(36)`) with a collision-retry loop, so sequential project-import bursts can't collide on `Date.now()`. |
| [`packages/axoview-lib/src/__perf_refactor_regression__/Pan.modes.test.ts`](../../packages/axoview-lib/src/__perf_refactor_regression__/Pan.modes.test.ts) | Extended for MQA #22 / #25: cursor switches between `default` (EXPLORABLE_READONLY) and `grab` (EDITABLE) on entry; mousedown does not flip to `grabbing` in preview; body click in preview opens panel for any content-bearing node including link-only. |
| [`packages/axoview-lib/src/components/RichTextEditor/__tests__/RichTextEditor.formats.test.ts`](../../packages/axoview-lib/src/components/RichTextEditor/__tests__/RichTextEditor.formats.test.ts) | Extended for MQA #12, **flipped by the ADR 0034 addendum (2026-07-03)**: markdown list autofill is back ON. Pins that BOTH rich surfaces (Notes `RichTextEditor` + on-canvas `TextBoxInlineEditor`) wire the ONE shared `buildListAutofillBinding` and that the old noop override never returns. Behavior itself is covered by [`quillListAutofill.test.ts`](../../packages/axoview-lib/src/utils/__tests__/quillListAutofill.test.ts) (prefix regex incl. checkbox exclusion; delta/history choreography making Ctrl+Z restore the literal typed text; mid-line and no-list-format guards). |
| [`packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts) | Extended for MQA #14. Session-mode `renameDiagram` mirrors the new name into both the diagrams listing **and** the per-diagram blob (`blob.title` + `blob.name`). Corrupted-blob path leaves the listing rename in place without crashing. |

## Branch additions (2026-05-10)

| Suite | Coverage |
|---|---|
| [`packages/axoview-lib/src/__perf_refactor_regression__/connector.dragPerf.test.tsx`](../../packages/axoview-lib/src/__perf_refactor_regression__/connector.dragPerf.test.tsx) | 4 tests against the real provider stack (`ModelProvider` + `SceneProvider` + `UiStateProvider`): drag transaction collapses N tile updates into 1 history entry; baseline (no transaction) still pushes N entries; `pendingPre` stays alive across intermediate ticks (per-tick history.past stays flat); 40-tick drag completes under 1500 ms. The fixture is loaded from [`packages/axoview-lib/src/__perf_refactor_regression__/fixtures/perf-stress-diagram.json`](../../packages/axoview-lib/src/__perf_refactor_regression__/fixtures/perf-stress-diagram.json) and `modelSchema.safeParse`'d on setup — the file cannot drift out of schema. (Relocated 2026-05-23 from `packages/axoview-e2e/fixtures/` when the legacy e2e suite was deleted; this test is the sole consumer.) |

---

## Branch additions (2026-04-29 → 2026-05-02)

New suites shipped with Phase 5* + the session-mode UX revamp:

| Suite | Coverage |
|---|---|
| [`packages/axoview-lib/src/utils/__tests__/leanSave.test.ts`](../../packages/axoview-lib/src/utils/__tests__/leanSave.test.ts) | ADR 0003 round-trip identity (strip-then-merge), strip drops pure duplicates, custom + override icons preserved, empty `icons[]` produces full catalog after merge, `requiredPacks` derivation from full icons, **preservation contract for already-lean inputs** (the regression that broke icon-pack auto-load on import) |
| [`packages/axoview-app/src/services/project/__tests__/projectZip.test.ts`](../../packages/axoview-app/src/services/project/__tests__/projectZip.test.ts) | ADR 0001 round-trip (export → parse → import → identical workspace modulo IDs and `lastModified`), ID rewriting + cross-reference update, malformed zip rejection, unknown version rejection, replace-all typed-confirm gate |
| [`packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts`](../../packages/axoview-app/src/services/storage/__tests__/LocalStorageProvider.test.ts) (updated) | Unique-id minting (random suffix prevents same-ms collisions), `sessionSaveDiagram` preserves existing `folderId` when payload doesn't carry one |

---

## Classifications

| Symbol | Meaning |
|---|---|
| ✅ VALID | Tests the real production module directly |
| ⚠️ SEMI-VALID | Tests a manually-maintained local copy of a production constant; contract is tested but divergence is possible |

---

## Layer 1 — Interaction / Mode System

These tests cover the mode state machine, mouse event routing, and keyboard dispatch. They use real module imports with minimal mocking (`src/utils` only).

### [Cursor.modes.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/Cursor.modes.test.ts) · 16 tests · ✅ VALID

**Production target:** `src/interaction/modes/Cursor.ts`

| Group | What's covered |
|---|---|
| `Cursor.mousedown` (4) | isRendererInteraction guard; item-at-tile sets mousedownItem + mousedownHandled; empty canvas clears itemControls |
| `Cursor.mouseup` (7) | mousedownHandled gate — context menu only opens when flag is true; external setMode doesn't open menu; mousedownItem reset after mouseup; item select sets itemControls |
| `Cursor.mousemove` (5) | tile-move with mousedown item → DRAG_ITEMS; tile-move on empty → LASSO; no move → no transition |

**Why this exists:** The `mousedownHandled` flag was introduced to prevent spurious context-menu openings after external `setMode()` calls (e.g. exiting Connector mode). Without this test, any refactor that touches `Cursor.mouseup` risks re-introducing that regression.

---

### [Lasso.modes.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/Lasso.modes.test.ts) · 15 tests · ✅ VALID

**Production target:** `src/interaction/modes/Lasso.ts`

| Group | What's covered |
|---|---|
| `Lasso.mousedown` (5) | isRendererInteraction=false → no-op; canvas click with no selection → CURSOR; click within selection bounds → isDragging=true; click outside selection → CURSOR |
| `Lasso.mouseup` (5) | mouse.mousedown=null (toolbar click) → no-op; mousedown set, no selection → CURSOR; mousedown set, selection with items → stays LASSO, isDragging reset |
| `Lasso.mousemove` (5) | isDragging path; selection bounds update; hasMovedTile gate |

**Why this exists:** Lasso was the last mode to gain the `isRendererInteraction` guard. Before the fix, a ToolMenu click while in LASSO mode propagated to the window listener, triggered `Lasso.mousedown`, and caused a spurious mode switch.

---

### [toolMenu.propagation.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/toolMenu.propagation.test.tsx) · 8 tests · ✅ VALID

**Production targets:** `src/interaction/modes/Lasso.ts`, ToolMenu `onMouseDown` wrapper in `UiOverlay.tsx`

| Group | What's covered |
|---|---|
| Fix A — stopPropagation (2) | mousedown inside ToolMenu Box does NOT reach window; mousedown outside does reach window |
| Fix B — isRendererInteraction guard (3) | Real Lasso.mousedown with isRendererInteraction=false; =true with no selection; non-LASSO mode is no-op |
| Fix C — mouse.mousedown guard (3) | Real Lasso.mouseup with null mousedown; set mousedown no selection → CURSOR; set mousedown with selection → stays LASSO |

**Why this exists:** Pinned as three distinct A/B/C fixes for the toolbar-click-to-context-menu bug (2026-03-20). Each fix can be independently regressed.

---

### [keyboard.dispatch.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/keyboard.dispatch.test.tsx) · 25 tests · ✅ VALID

**Production targets:** `src/interaction/useInteractionManager.ts`, `src/interaction/usePanHandlers.ts`

Covers: keyboard shortcut dispatch, pan key combos, Delete key, Escape key, mode-specific key guards, `INTERACTIONS_DISABLED` early-return, event listener registration/cleanup.

---

### [interactionManager.depStability.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/interactionManager.depStability.test.tsx) · 2 tests · ✅ VALID

**Production target:** `src/interaction/useInteractionManager.ts`

Pins that `useCallback`/`useMemo` dependency arrays in `useInteractionManager` do not reference unstable values (guards the M-1 render hotspot fix).

---

### [usePanHandlers.test.ts](../../packages/axoview-lib/src/interaction/__tests__/usePanHandlers.test.ts) · 20 tests · ✅ VALID

**Production target:** `src/interaction/usePanHandlers.ts`

| Group | What's covered |
|---|---|
| `handleMouseDown` bypass conditions (10) | All 9 pan-trigger conditions: PAN mode left-click returns true; middle/right-click with setting on/off; ctrl-click; alt-click; emptyArea click (target=rendererEl, no item); regular left-click → false; right-click deferred — returns true but does NOT immediately set PAN mode |
| `handleMouseDown` full cycle (1) | middle-click starts pan; mouseUp ends pan; setMode called with CURSOR |
| `handleMouseMove` — deferred right-drag pan (4) | drag beyond 4px threshold → enters PAN, returns false; below threshold → suppresses processMouseUpdate (returns true); mousemove without prior right-down → false; mousemove after pan started → false |
| `handleMouseUp` (5) | not panning, no right-down → false; right-click without drag → closes itemControls + clears mousedown state + returns true; right-drag then release → exits PAN, restores CURSOR; right-drag from CONNECTOR mode → restores CONNECTOR; middle-click pan ends on mouseup; right-click without drag in LASSO mode → clears lasso selection |

**Why this exists:** `handleMouseDown` is the bypass path — when it returns `true`, `processMouseUpdate` is skipped entirely. The transient right-click pan model (FF-001) adds deferred pan entry, threshold guarding in `handleMouseMove`, and a right-click-without-drag deselect path — all three branches must be independently tested so a refactor can't silently remove the threshold guard or reintroduce the immediate-PAN behaviour.

---

## Layer 2 — Scene / Hooks

These tests cover the public API of `useScene`, view operations, clipboard history, and the initialization sequence.

### [useScene.listShape.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/useScene.listShape.test.tsx) · 17 tests · ✅ VALID

**Production target:** `src/hooks/useScene.ts`

Covers: `currentView` shape contract (items, connectors, rectangles, textBoxes arrays); `allViews` list; `DEFAULTS` merging; empty-view edge cases.

---

### [useScene.referenceStability.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/useScene.referenceStability.test.tsx) · 7 tests · ✅ VALID

**Production target:** `src/hooks/useScene.ts`

Covers: `currentView` reference stability — object identity must not change when unrelated store data changes; guards the C-2 render hotspot where every store write caused a full scene re-render.

---

### [viewOps.integration.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/viewOps.integration.test.tsx) · 16 tests · ✅ VALID

**Production target:** `src/stores/reducers/view.ts`

Covers: `createView`, `updateView`, `deleteView`, `setActiveView` full lifecycle including edge cases (delete active view, rename to same name, delete only view).

---

### [useHistory.test.tsx](../../packages/axoview-lib/src/hooks/__tests__/useHistory.test.tsx) · 16 tests · ✅ VALID

**Production target:** `src/hooks/useHistory.ts`

Covers (mocked stores): `saveToHistory`/`undo`/`redo` delegation to stores; `canUndo`/`canRedo` flags; `transaction()` blocks nested saves; `isInTransaction` flag; error recovery in transaction.

---

### [useHistory.realStore.test.tsx](../../packages/axoview-lib/src/hooks/__tests__/useHistory.realStore.test.tsx) · 7 tests · ✅ VALID

**Production targets:** `src/hooks/useHistory.ts`, `src/stores/modelStore.tsx`

Uses real `ModelProvider` + `SceneProvider` wrappers — tests actual Zustand store behavior that mock-based tests cannot catch.

| Group | What's covered |
|---|---|
| Real undo/redo (3) | `actions.set()` → `undo()` restores previous title; `canUndo` false on fresh store, true after mutation; redo stack cleared after new mutation |
| Overflow (1) | After 51 mutations, `history.past.length` stays ≤ 50 (oldest entry dropped by `shift()`) |
| Redo round-trip (1) | `undo()` then `redo()` returns to the later value |
| Transaction real-store (2) | `transaction()` produces exactly 1 checkpoint for 3 ops; nested transaction produces only 1 checkpoint |

---

### [useHistory.pageStamp.test.tsx](../../packages/axoview-lib/src/hooks/__tests__/useHistory.pageStamp.test.tsx) · 15 tests · ✅ VALID

**Production target:** `src/stores/historySequence.ts`, both stores' entry
construction, `useHistory.undo/redo`, `useSceneActions.createView`.

E1/HIST-10 (owner ruling "always navigate", 2026-07-30) and E1/HIST-04 riding it.
Real stores — the behaviour is a stamp written by two stores, consumed by
`useHistory`, and acted on through `useSceneActions.switchView`, so the mocked
suite above cannot see it.

| Group | What's covered |
|---|---|
| Navigation (7) | Undo of a delete of the ACTIVE page returns to it; an edit on another page is undone WITH the switch; redo goes to the page the action was ORIGINALLY on (§5 Q2); every step navigates, so two undos move twice (§5 Q1); an entry with NO stamp stays put (`undefined` ≠ `views[0]`); a stamp naming a page no longer in the model does not navigate; a HALF-stepped action still navigates (§5 Q3, fail-visible over fail-silent) |
| Stamp agreement (2) — **mandatory** | Every `seq` present on both stacks carries the same `viewId` on both, with a CONTROL asserting the comparison set is non-empty; the stamp is the page active at RECORD time, and moving does not rewrite it |
| No history from navigation (3) — **mandatory** | `setView` pushes nothing onto either stack; an undo that NAVIGATED does not GROW either past stack (the sharp one — see below); repeated undo drains in exactly the number of logical actions recorded |
| HIST-04 (3) | `createView` records exactly one entry, symmetric with `deleteView`; Ctrl+Z after "New page" removes the page (not the action before it) and leaves the active view resolvable; redo restores it |

**Why the growth assertion and not just the drain.** The failure mode is an undo
loop, but a plant that pushes one entry per navigation still drains — each undo
eats the one before it. Only "did not grow" catches it. The drain bound is a
runaway guard, not the detector.

---

### [useInitialDataManager.test.tsx](../../packages/axoview-lib/src/hooks/__tests__/useInitialDataManager.test.tsx) · 8 tests · ✅ VALID

**Production target:** `src/hooks/useInitialDataManager.ts`

Covers: orphaned connector filtering on load (connectors referencing non-existent items are removed); `isReady` flag lifecycle; initial data merging with defaults.

---

## Layer 3 — Reducers

All reducer tests use real Immer-based functions with no mocking of the reducer logic itself. They verify immutability (input state unchanged), return-value correctness, and cascade behavior.

### [connector.test.ts](../../packages/axoview-lib/src/stores/reducers/__tests__/connector.test.ts) · 21 tests · ✅ VALID

**Production target:** `src/stores/reducers/connector.ts`

Covers: `createConnector`, `updateConnector`, `deleteConnector`, `syncConnector` (including error path — empty path on `getConnectorPath` throw, connector NOT deleted). All use the correct `ConnectorAnchor[]` array schema.

> **Note:** This suite was rewritten from scratch (2026-03-20) after the original had stale `{ from, to }` anchor format that never matched the real `anchorSchema`.

---

### [modelItem.test.ts](../../packages/axoview-lib/src/stores/reducers/__tests__/modelItem.test.ts) · 8 tests · ✅ VALID

**Production target:** `src/stores/reducers/modelItem.ts`

| Group | What's covered |
|---|---|
| Core CRUD (3) | create, update, delete basic correctness |
| Double-write regression (3) | Item appears exactly once; stored value equals input; input state not mutated |
| Sparse array pin (2) | Deleted item not findable; `array.length` unchanged after `delete` — documents the §10 known sparse-array behavior so a future `splice` fix changes this assertion intentionally |

---

### [viewItem.test.ts](../../packages/axoview-lib/src/stores/reducers/__tests__/viewItem.test.ts) · 21 tests · ✅ VALID

**Production target:** `src/stores/reducers/viewItem.ts`

Covers: `createViewItem`, `updateViewItem`, `deleteViewItem` with connector cascade (item referenced by connector at both anchors → connector deleted once); batch-delete cascade; not-found throws.

---

### [view.test.ts](../../packages/axoview-lib/src/stores/reducers/__tests__/view.test.ts) · 13 tests · ✅ VALID

**Production target:** `src/stores/reducers/view.ts`

Covers: view CRUD, action dispatcher, rename idempotency, delete-with-items cascade.

---

### [rectangle.test.ts](../../packages/axoview-lib/src/stores/reducers/__tests__/rectangle.test.ts) · 20 tests · ✅ VALID

**Production target:** `src/stores/reducers/rectangle.ts`

Covers: CRUD, sync with scene store, immutability, not-found throws.

---

### [textBox.test.ts](../../packages/axoview-lib/src/stores/reducers/__tests__/textBox.test.ts) · 23 tests · ✅ VALID

**Production target:** `src/stores/reducers/textBox.ts`

Covers: CRUD with scene sync contract, content update, immutability.

---

## Layer 4 — Schemas / Validation

All schema tests use Zod's `.parse()` / `.safeParse()` directly. They act as living documentation of the data model contracts.

| File | Production target | Tests | What's pinned |
|---|---|---|---|
| [colors.test.ts](../../packages/axoview-lib/src/schemas/__tests__/colors.test.ts) | `schemas/colors.ts` | 4 | colorSchema fields, colorsSchema array |
| [layer.test.ts](../../packages/axoview-lib/src/schemas/__tests__/layer.test.ts) | `schemas/layer.ts` | 9 | layerSchema required fields (id, visible, locked, order); order must be integer; round-trip; layersSchema empty array + invalid member |
| [connector.test.ts](../../packages/axoview-lib/src/schemas/__tests__/connector.test.ts) | `schemas/connector.ts` | 9 | anchorSchema (valid anchor, missing id); anchorSchema ref contracts (tile-only, empty ref, simultaneous item+tile — no exclusivity guard at schema level); connectorSchema (valid, missing anchors); connector anchor count (0 anchors allowed, 1 anchor allowed — minimum is app-level invariant only) |
| [icons.test.ts](../../packages/axoview-lib/src/schemas/__tests__/icons.test.ts) | `schemas/icons.ts` | 4 | iconSchema, iconsSchema |
| [modelItems.test.ts](../../packages/axoview-lib/src/schemas/__tests__/modelItems.test.ts) | `schemas/modelItems.ts` | 10 | modelItemSchema including `headerLink` optional URL field |
| [rectangle.test.ts](../../packages/axoview-lib/src/schemas/__tests__/rectangle.test.ts) | `schemas/rectangle.ts` | 2 | rectangleSchema required fields |
| [textBox.test.ts](../../packages/axoview-lib/src/schemas/__tests__/textBox.test.ts) | `schemas/textBox.ts` | 2 | textBoxSchema required fields |
| [validation.test.ts](../../packages/axoview-lib/src/schemas/__tests__/validation.test.ts) | `schemas/validation.ts` | 10 | Full model validation, Zod coercion, invalid model rejection |
| [views.test.ts](../../packages/axoview-lib/src/schemas/__tests__/views.test.ts) | `schemas/views.ts` | 6 | viewItemSchema, viewSchema, viewsSchema |

**Total: 56 tests** (layer.test.ts added; prior count was 47)

---

## Layer 5 — Components

### [uiOverlay.editorModes.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/uiOverlay.editorModes.test.ts) · 19 tests · ⚠️ SEMI-VALID

**Production target:** `src/components/UiOverlay/UiOverlay.tsx` (`EDITOR_MODE_MAPPING`)

Covers: tool visibility per editor mode (EDITABLE, EXPLORABLE_READONLY, NON_INTERACTIVE); VIEW_TITLE/VIEW_TABS mutual exclusion; ITEM_CONTROLS only in EDITABLE; ZOOM_CONTROLS in every non-empty mode.

> **Limitation:** `EDITOR_MODE_MAPPING` is a private module-level constant in `UiOverlay.tsx`. The full component cannot be imported in Jest without pulling in MUI's `createTheme` at module load time (incompatible with jsdom). The local constant in this test was **manually verified** against production on 2026-03-20.
> **To make VALID:** Extract `EDITOR_MODE_MAPPING` to `src/config/editorModeMapping.ts` with no MUI/React dependencies.

---

### [RichTextEditor.formats.test.ts](../../packages/axoview-lib/src/components/RichTextEditor/__tests__/RichTextEditor.formats.test.ts) · 4 tests · ✅ VALID

**Production target:** `src/components/RichTextEditor/RichTextEditor.tsx` (`formats` export)

Covers: `'bullet'` absent (Quill unregistered alias); `'list'` present; all 9 expected formats present; count pin.

---

### [ColorPickerBody.test.tsx](../../packages/axoview-lib/src/components/ColorSelector/__tests__/ColorPickerBody.test.tsx) · 12 tests · ✅ VALID
### [CustomColorInput.test.tsx](../../packages/axoview-lib/src/components/ColorSelector/__tests__/CustomColorInput.test.tsx) · 11 tests · ✅ VALID

**Production targets:** `ColorPickerBody`, `CustomColorInput` (the unified color surface — [ADR 0039](../adr/0039-unified-color-picker-and-standard-palette.md))

Covers: color picker render, hex input validation, EyeDropper API integration, onChange callbacks, cancel handling.

---

### Smaller component suites

| File | Production target | Tests |
|---|---|---|
| [DebugUtils.test.tsx](../../packages/axoview-lib/src/components/DebugUtils/__tests__/DebugUtils.test.tsx) | `DebugUtils` | 2 |
| [LineItem.test.tsx](../../packages/axoview-lib/src/components/DebugUtils/__tests__/LineItem.test.tsx) | `LineItem` | 2 |
| [SizeIndicator.test.tsx](../../packages/axoview-lib/src/components/DebugUtils/__tests__/SizeIndicator.test.tsx) | `SizeIndicator` | 2 |
| [Value.test.tsx](../../packages/axoview-lib/src/components/DebugUtils/__tests__/Value.test.tsx) | `Value` | 2 |
| [Icon.test.tsx](../../packages/axoview-lib/src/components/ItemControls/IconSelectionControls/__tests__/Icon.test.tsx) | `IconSelectionControls/Icon` | 2 |
| [Label.test.tsx](../../packages/axoview-lib/src/components/Label/__tests__/Label.test.tsx) | `Label` | 4 |

---

## Layer 6 — Perf / Render Isolation

These tests pin the fixes from the performance refactoring session. They primarily use source-code analysis (regex on file contents) to enforce structural contracts that can't be expressed as runtime behavior tests.

| File | Production target | Tests | What's pinned |
|---|---|---|---|
| [connector.renderIsolation.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/connector.renderIsolation.test.tsx) | `Connectors.tsx`, `Connector.tsx` | 5 | N-2/N-3: `Connector` is `React.memo`; `Connectors` passes stable selector |
| [expandableLabel.selectorConsolidation.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/expandableLabel.selectorConsolidation.test.tsx) | `ExpandableLabel.tsx` | 3 | N-4: single `useUiStateStore` call (was two — caused double re-render) |
| [exportImageDialog.memo.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/exportImageDialog.memo.test.ts) | `ExportImageDialog.tsx` | 2 | H-3: component is wrapped in `React.memo` |
| [grid.backgroundFormula.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/grid.backgroundFormula.test.ts) | `Grid.tsx` | 14 | C-1: CSS background-size formula, tile size, zoom scaling |
| [gsap.dependency.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/gsap.dependency.test.ts) | `package.json`, source files | 2 | N-5: GSAP removed from dependencies; no remaining imports |
| [rendererSize.sharedObserver.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/rendererSize.sharedObserver.test.tsx) | `uiStateStore.tsx` | 4 | N-1: single ResizeObserver writes `rendererSize`; all other components read from store |
| [useRAFThrottle.cleanup.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/useRAFThrottle.cleanup.test.ts) | `src/interaction/useRAFThrottle.ts` | 8 | M-2: RAF handle cancelled on unmount; no stale callbacks; throttle contract |
| [useResizeObserver.lifecycle.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/useResizeObserver.lifecycle.test.ts) | `src/hooks/useResizeObserver.ts` | 10 | H-2: observer registered on mount, disconnected on unmount, reconnected on ref change |

---

## Layer 7 — Utilities & Config

### [svgOptimizer.test.ts](../../packages/axoview-lib/src/utils/__tests__/svgOptimizer.test.ts) · 30 tests · ✅ VALID

**Production target:** `src/utils/svgOptimizer.ts`

Covers all three SVG export optimization phases:
- Phase 1 — `stripIrrelevantProperties`: removes vendor prefixes, animation, transition, scroll, print props; preserves layout props
- Phase 2 — `roundNumbers` / `roundStyleDeclarations`: 2 decimal place rounding, skips width/height/font-size
- Phase 3 — `pruneHiddenElements`: removes `display:none` subtrees before serialization

---

### [keyboard.dispatch.test.tsx](../../packages/axoview-lib/src/__perf_refactor_regression__/keyboard.dispatch.test.tsx) · 25 tests · ✅ VALID

(See Layer 1 — listed here also as it covers utility-level keyboard routing.)

---

### [shortcuts.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/shortcuts.test.ts) · 7 tests · ✅ VALID

**Production target:** `src/config/shortcuts.ts`

Pins all `FIXED_SHORTCUTS` constant values (Ctrl+C, Ctrl+V, Ctrl+Z, Ctrl+Y, Delete, Escape). Any accidental rename or value change is immediately caught.

---

### [settings.defaults.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/settings.defaults.test.ts) · 14 tests · ✅ VALID

**Production targets:** `src/config/hotkeys.ts`, `src/config/panSettings.ts`, `src/config/zoomSettings.ts`

Pins: `DEFAULT_HOTKEY_PROFILE = 'smnrct'`; all pan toggle defaults (middleClick, rightClick, ctrlClick, altClick, emptyAreaClick); zoom min/max/step defaults; keyboard pan speed.

---

### [i18n.config.test.ts](../../packages/axoview-lib/src/__perf_refactor_regression__/i18n.config.test.ts) · 3 tests · ✅ VALID

**Production target:** `packages/axoview-app/src/i18n.ts`

Pins `load: 'currentOnly'` (prevents short-code `en` 404) and `fallbackLng: 'en-US'`.

---

### Utility unit suites

| File | Production target | Tests | What's covered |
|---|---|---|---|
| [renderer.test.ts](../../packages/axoview-lib/src/utils/__tests__/renderer.test.ts) | `utils/renderer.ts` | 16 | Grid subset, bounds checking, screen-to-isometric coordinate conversion; `incrementZoom`/`decrementZoom` boundary enforcement (clamped at MIN_ZOOM/MAX_ZOOM, correct step, no float drift across full range) |
| [common.test.ts](../../packages/axoview-lib/src/utils/__tests__/common.test.ts) | `utils/common.ts` | 1 | `clamp()` function |
| [immer.test.ts](../../packages/axoview-lib/src/utils/__tests__/immer.test.ts) | Immer (third-party) | 2 | Array reference stability with Immer drafts |

---

## Layer 8 — Stores & Infrastructure

### [zustand.deprecation.test.ts](../../packages/axoview-lib/src/stores/__tests__/zustand.deprecation.test.ts) · 4 tests · ✅ VALID

**Production targets:** `stores/uiStateStore.tsx`, `stores/modelStore.tsx`, `stores/sceneStore.tsx`

Covers: no `[DEPRECATED]` console.warn fired when loading any of the 3 stores; source-file assertion that `useStoreWithEqualityFn` is used (not the deprecated `useStore`).

---

### [clipboard.test.ts](../../packages/axoview-lib/src/clipboard/__tests__/clipboard.test.ts) · 7 tests · ✅ VALID

**Production target:** `src/clipboard/clipboard.ts`

Covers: `setClipboard` / `getClipboard` round-trip; null/undefined handling; clipboard payload shape contract.

---

### [useCopyPaste.test.ts](../../packages/axoview-lib/src/clipboard/__tests__/useCopyPaste.test.ts) · 10 tests · ✅ VALID

**Production target:** `src/clipboard/useCopyPaste.ts`

| Group | What's covered |
|---|---|
| `handleCopy` (5) | LASSO selection gathered + centroid computed; itemControls single-item copy; empty selection → no clipboard write; centroid includes rectangle midpoints and textbox tiles (not just nodes); connector auto-include when both anchors in selected set |
| `handlePaste` (5) | Null clipboard → 'Nothing to paste' warning; IDs remapped (pasted items get new IDs); orphan detach — anchor referencing item not in clipboard has item ref removed; offset = original tile + (mouse − centroid); sets LASSO mode with all pasted refs |

**Why this exists:** `handlePaste` is the most complex operation in the codebase — ID remapping, anchor detachment, centroid offset, collision avoidance, and multi-type batch paste all in one function. Any refactor risks regressing the ID/anchor plumbing.

---

---

## Known Coverage Gaps

The highest-regression-risk paths still without a real-module regression test:

| Priority | Gap | Why it matters |
|---|---|---|
| High | `useScene.deleteSelectedItems` | Cascade across mixed item types in one transaction. |
| High | `useScene.pasteItems` | Requires all 3 Providers + real model data; transaction atomicity. |
| Medium | `CURSOR → DRAG_ITEMS` / `CURSOR → LASSO` transitions | mousemove-while-mousedown paths — real-module tests missing |
| Medium | Image-export label legibility (B2) at fit-to-view zoom | Regressed once (`readableLabels` prop dropped); the export "Show labels" checkbox is tested, the low-zoom label *render* is not — the same regression would pass. e2e. |
| Medium | Connector Details "Add label" — no canvas-editor fall-through | The capture-phase click fall-through (`c98a1be`) deletes the just-added label; no test drives the panel "Add label" path. e2e. |
| Medium | "Add note" opens Notes for rectangle / textbox / label | `panelParity` covers node+connector; the three types that were actually broken aren't driven via the context menu. e2e. |
| Low | Text-color dual-scope + no-color border picker (`absentIsNoColor`) | Strip-only integration behaviors: the whole-content vs range color scope, and the No-color-swatch conflation on an absent (derived) rectangle border, are unasserted. e2e. |

> **Productization regression-coverage note (2026-07-05):** a full `master..integration` fix-commit audit confirmed the cycle's regressions are largely covered; the two highest-risk uncovered gaps (RECT-1 drag-chrome, the text-box schema S1-brick class) were closed with the unit suites above. The four rows just added are the remaining **e2e-only** gaps — catalogued (not silently dropped) with the exact spec + assertion so they can be closed as a fast follow.

The full standing-gap register (with risk/complexity) is in [known_issues.md](../../known_issues.md) and [technical-review-2026-06.md §11](../reviews/technical-review-2026-06.md#11-open-known-issues); the architectural framing is in [architecture.md §5](architecture.md#5-tests-gaps--quality).

---

## How to Run

```bash
npm test --workspace=packages/axoview-lib              # all lib tests
npx jest <pattern> --no-coverage                       # one suite, e.g. Cursor.modes
npm test --workspace=packages/axoview-lib -- --coverage # with coverage
```

Run from `packages/axoview-lib/`. HTML coverage report at `packages/axoview-lib/coverage/lcov-report/index.html`. **Measured 2026-07-29:** statements 40.2 % · branches 28.5 % · functions 34.6 % · lines 40.2 %. Floors in [`jest.config.js`](../../packages/axoview-lib/jest.config.js) are a **ratchet**, deliberately set ~6pp under measured reality so the tested core cannot silently erode — global **34 / 23 / 29 / 34**, with `stores/reducers/` (85 stmts / 65 branches) and `schemas/` (95 / 90) carrying their own higher floors. *(This line previously read "~32 %; thresholds floored at 10 %" — both figures had gone stale; the floors were re-ratcheted from 30/20/25/30 on 2026-07-29 after coverage rose without them following, widening the intended slack to ~10pp. **Re-measure and re-tighten whenever coverage moves up materially** — that is the maintenance this gate needs to keep working.)* Aggregate KPIs (test:source ratio, LOC, lint debt, complexity baseline) and the static-analysis report locations are in [technical-review-2026-06.md §8](../reviews/technical-review-2026-06.md#8-quality-kpis-aggregate).

## Label counter-scale — one derivation, six consumers (2026-08-02, R5/OVL-02)

`labelSettings.labelCounterScaleFor` is the **only** place the "keep labels
readable" factor is computed. Six layers consume it — two GPU (`NodesCanvas`,
`LabelsCanvas`), three DOM hit/proxy (`LabelHitLayer`, `NodeLabelHitLayer`,
`ConnectorLabel`) and `ExpandableLabel` — and they must always move together:
the paint layers draw the chip while the hit layers size the box that grabs it,
so a factor that changes on one side alone puts the grab box somewhere other
than the thing it proxies.

Two mechanisms carry it, and a change to either needs the other checked:

- **GPU:** per INSTANCE via `i_misc.w`, not the `u_counterScale` uniform (one
  uniform per draw can only be right for a default-sized label). The uniform is
  the fallback for an instance that packs no value.
- **DOM:** per ELEMENT via `data-label-font` + a store subscription, not one
  `--axoview-label-scale` on a shared `display: contents` wrapper.

[`labelCounterScale.contract.test.ts`](../../packages/axoview-lib/src/config/__tests__/labelCounterScale.contract.test.ts)
enforces all of it. Its exemption names the **function**, not the file — see the
gate-authoring rule below.

## Gate authoring — an exemption names the CALL SITE, never the FILE (2026-08-01)

A dual-implementation gate has to exempt its one legitimate implementation. Do
that by naming the **function**, not the file it lives in.

Wave 4's lean-save gate exempted `leanModel.ts` wholesale, because the one
permitted composition legitimately lives there — and a duplicate planted in that
same file passed clean on the first red-check. A file-level exemption is a hole
shaped exactly like the bug, since a duplicate's natural home *is* the file that
already owns the concern.

Corollary: **red-verify a gate by planting the defect where it actually lived**,
not in a convenient neighbouring file. The OVL-02 gate above was verified three
ways, one of which was a second derivation planted inside its own exempted file.
