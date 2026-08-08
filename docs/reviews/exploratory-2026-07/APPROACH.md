# Exploratory Testing Campaign — Approach

**Status:** Draft (design approved pending owner review) · **Created:** 2026-07-29
**Goal:** Find bugs and inconsistent behaviour through a hypothesis-and-verification driven exploration of every functional area. Performance is explicitly out of scope ([the perf harness](../adr/0020-engine-perf-harness-and-measurement-protocol.md) owns that). "No stone unturned" is operationalized as: every area in the inventory below carries **≥ 10 novel, falsifiable hypotheses**, each verified by an executable probe.

---

## 1. Core loop

Every unit of work is one hypothesis through this pipeline:

```
PROPOSE → NOVELTY-CHECK → PROBE → VERDICT → RECORD
```

1. **Propose.** A hypothesis is a *falsifiable prediction of a specific failure*, not a test wish. Template: *"Under conditions C, operation O produces incorrect result R / violates invariant I."* "Connectors work correctly" is not a hypothesis; *"a connector anchored to a node keeps pointing at the node's old tile after the node is moved via arrow-key nudge (sync path only wired for drag)"* is.
2. **Novelty-check.** A hypothesis only counts toward an area's quota if **no existing test already asserts the behaviour**. Check [coverage-baseline.md](coverage-baseline.md), then grep `packages/axoview-e2e/tests/` and `**/__tests__/` for the relevant terms. Record the 1–3 *nearest existing tests* and one line on why they don't cover it. If an existing test covers it → mark `DUPLICATE`, it does not count, move on.
3. **Probe.** Write the cheapest executable check that could falsify the hypothesis (tiers in §3). Timebox: if a probe takes more than ~45 min to build, record `DEFERRED` with the blocker and move on — breadth beats depth here.
4. **Verdict.** One of:
   - `BUG` — probe demonstrates incorrect behaviour. File it (§6).
   - `SUSPECT` — behaviour is questionable but no spec/ADR says which way is intended. Goes to the area file's *product questions* list; counts toward quota.
   - `FALSIFIED` — prediction disproven, behaviour correct. Counts toward quota (a genuinely-probed wrong guess is paid-for knowledge).
   - `DUPLICATE` — existing test already covers it. Does **not** count.
   - `DEFERRED` — couldn't verify (needs live OAuth, needs >45 min rig, etc.). Does not count until probed; record what a manual test would look like.
5. **Record.** Update the area file and [LEDGER.md](LEDGER.md) immediately (not at session end — sessions can die; see the token-efficiency lesson in project memory).

**Standing rule — anomaly capture:** anything odd noticed *while* probing (console warning, flicker, wrong cursor, stale panel) becomes a new `PROPOSED` hypothesis in the ledger, even mid-probe. This is where exploratory testing earns its name — the ledger is allowed to grow faster than it shrinks.

**Standing rule — don't fix while hunting.** Confirmed bugs are filed, not fixed, during an exploration wave (a fix wave is a separate session/branch). Exception: a trivial issue that blocks further probing of the same area.

---

## 2. Hypothesis record format

Each area gets a file `docs/exploratory/areas/<NN>-<slug>.md` with one table row per hypothesis:

```markdown
| ID | Hypothesis | Source | Nearest existing tests | Probe | Verdict | Evidence |
|----|-----------|--------|------------------------|-------|---------|----------|
| CON-03 | Deleting a node mid connector-drag leaves a dangling provisional connector in the scene store | interleaving heuristic | Connector.modes.test.ts (no delete interleave) | tests-exploratory/connectors/con-03.explore.spec.ts | BUG | scene.connectors has orphan ref; console error on next render |
```

- **ID:** `<AREA>-<NN>`, stable forever, never reused.
- **Source:** which generator produced it (§5) — ADR contract, bug-class recurrence, interleaving matrix, boundary, parity, persistence, cross-feature, anomaly-capture.
- **Evidence:** for `BUG`, expected vs actual in one line + pointer to the probe and, once filed, the known_issues.md anchor.

---

## 3. Probe tiers — cheapest tool that can falsify

| Tier | Harness | Use for | Cost |
|------|---------|---------|------|
| **T1 — unit/integration probe** | Jest, real providers/stores (`ModelProvider`+`SceneProvider`+`UiStateProvider` pattern from `useHistory.realStore.test.tsx`) | reducers, stores, schemas, utils, hooks, history, clipboard serialization | seconds |
| **T2 — bridge-driven e2e probe** | Playwright + `window.__axoview__` (ui/model/scene store APIs) + POMs | UI flows where DOM and store must agree; cross-store invariants after interactions | ~10–30 s each |
| **T3 — real-input e2e probe** | Playwright real `page.mouse` / CDP touch (`connector-realmouse.spec.ts` pattern) | hit-testing, pointer-capture, drag thresholds, z-order-over-canvas — anything where synthetic dispatch lies | ~10–30 s each |

**Tier discipline:** hypotheses about *event routing, hit-testing or gestures* MUST use T3 — this repo has already shipped a regression that synthetic-event tests structurally could not see (the connector "locked tool" bug, [ADR 0022 addendum](../adr/0022-canvas-pointer-interaction-model.md)). Everything else takes the cheapest tier that can falsify.

---

## 4. Oracle catalogue — how a probe knows something is wrong

Build these once as shared helpers, then every probe gets them nearly free:

1. **Crash/console oracle (universal, automatic).** The exploratory Playwright fixture attaches `page.on('pageerror')` and `console.error`/React-warning listeners; any uncaught error or error-log during a probe is a finding *regardless of what the probe was hunting*. (Allow-list the known `__fossflow__` deprecation warning.)
2. **Cross-store consistency oracle.** `expectStoreInvariants(page)` — via the debug bridge, assert e.g.: every scene connector path has a backing model connector; every `selectedIds` entry resolves to an existing item; active view/layer exist; no orphaned view-items. Exact invariant list to be grown as areas are explored — every confirmed cross-store bug adds its invariant here.
3. **Schema oracle.** After a probe's mutations, the exported model must `modelSchema.safeParse` clean. Catches operations that write states the loader would later reject — a silent data-corruption class.
4. **Round-trip oracles.** Save→load (lean-save merge), export→import (JSON and ZIP), undo→redo→undo idempotence, copy→paste structural equality, iso↔2D↔iso, reload-persistence. A round trip that isn't the identity (modulo documented ID rewriting) is a finding.
5. **Differential (parity) oracles.** The same logical operation performed through different routes must produce the same model delta: mouse vs keyboard vs touch vs context-menu; on-grid vs off-grid position; SVG vs Canvas2D vs WebGL substrate for rendered geometry; edit-mode vs the operation being unavailable-and-inert in view-mode.
6. **Metamorphic oracles.** Operation order/framing shouldn't matter where the model is concerned: op-then-zoom ≡ zoom-then-op; move A then B ≡ move B then A (disjoint targets); style-then-select ≡ select-then-style.

---

## 5. Hypothesis generators — the "no stone unturned" engine

Applied per area until the quota is comfortably exceeded (aim to *propose* ~15 to *count* 10):

1. **ADR-contract violations.** Each ADR states contracts; hypothesize concrete silent violations (seed list: [invariants harvest](coverage-baseline.md#invariants)).
2. **Bug-class recurrence.** Every bug class this repo has already shipped, applied to surfaces it hasn't been checked on yet:
   - *offset-omission* — a consumer of item geometry ignores `offset` (ADR 0023's seven-bug cluster; probe NEW consumers: export image, annotation overlay, spatial index…)
   - *sibling drift* — two parallel implementations of the same contract diverge (LabelHitLayer vs NodeLabelHitLayer precedent; find other sibling pairs)
   - *mode-transition race* — tool/mode switched mid-gesture leaves stale state (`mousedownHandled` precedent)
   - *synthetic-vs-real input* — behaviour differs under real hit-testing (connector-lock precedent)
   - *dual-stack skew* — model vs scene history desync (D-7 precedent; probe un-probed action types)
   - *unthemed-surface / missing-i18n* — new app surfaces skip theme or locale wiring (known_issues classes; probe newest surfaces)
   - *stale derived cache* — memo/index not invalidated (spatial TileIndex, raster caches, label measurement)
3. **Interleaving matrix.** {every in-flight gesture: drag, lasso, connector-draw, resize, rotate, inline-edit, placement} × {every interrupt: Escape, tool hotkey, Delete, undo hotkey, context-menu, layer toggle, view switch, mode toggle, tab blur, reload}. Most cells are unprobed territory.
4. **Boundary & degenerate inputs.** Zero-size/negative rects, 1-tile and self-referencing connectors, empty/whitespace/10k-char/RTL/emoji text, zoom clamped extremes, coincident items, 0/1/many layers, empty diagram for every bulk op.
5. **Cross-feature pairs.** Features shipped in different waves rarely got tested *together*: off-grid × {lasso, paste, z-order, export}; labels × {undo, layers, locking}; multi-select × {every single-item feature}; view-mode × {every mutation path — must be inert}.
6. **Persistence sweep.** Every schema field a recent wave added × lean-save round-trip × zip round-trip × share/display path.
7. **Anomaly capture.** (§1 standing rule.)

---

## 6. Filing verdicts

- **`BUG`** → entry in [known_issues.md](../../known_issues.md) following its existing format (Symptom / Root cause if known / Workaround / Status: Open), tagged `**Found by:** exploratory campaign <ID>`. First cross-check it isn't already registered — a confirmed *known* issue is recorded in the ledger as `BUG (known)` and counts, but doesn't get a duplicate entry.
- The repro probe stays in the exploratory tree marked **`test.fail()`** (expected-fail): the suite stays green while red, and when someone fixes the bug the probe flips to unexpected-pass — a built-in fix detector and promotion prompt.
- **`FALSIFIED`** probes with real regression value may be *promoted* into the main suites later (explicit, curated step — the main suite stays lean; promotion is not automatic).
- **`SUSPECT`** → product-questions list at the foot of the area file; owner triages.

---

## 7. Infrastructure (built once, first session)

```
docs/exploratory/
  APPROACH.md            ← this document
  LEDGER.md              ← campaign index: per-area counts + status (the resume point)
  coverage-baseline.md   ← existing-test coverage map + invariants harvest (dedupe reference)
  areas/<NN>-<slug>.md   ← hypothesis tables
packages/axoview-e2e/
  playwright.explore.config.ts   ← separate config; NOT run by CI (CI keeps running the default config untouched)
  tests-exploratory/<area>/*.explore.spec.ts
  fixtures/explore.fixture.ts    ← app fixture + console/pageerror oracle + expectStoreInvariants + schema oracle
packages/axoview-lib/
  jest.explore.config.js         ← extends jest.config.js, testMatch **/__explore__/**
  src/**/__explore__/*.explore.test.ts(x)
```

> Quarantine mechanics: the lib `jest.config.js` has **no `testMatch`**, so Jest's defaults would sweep `*.explore.test.ts` into `npm test`. The one required touch to existing config is adding `'/__explore__/'` to its `testPathIgnorePatterns`; `jest.explore.config.js` extends it, drops that ignore and sets `testMatch: ['**/__explore__/**/*.explore.test.{ts,tsx}']` (and no coverage thresholds — probes must never feed the coverage ratchet). Playwright needs no touch at all: the main config's `testDir: './tests'` never sees `tests-exploratory/`.

Run commands (root `package.json`): `npm run explore:e2e`, `npm run explore:unit`. The exploratory trees are **quarantined from CI and from the default local suites** — a red or flaky probe never blocks the regression gates. Playwright constraints inherited from the main config: `workers: 1`, shared dev server, debug bridge available only in dev builds.

---

## 8. Execution model

- **Wave = one area.** A session picks the next `OPEN` area from LEDGER.md, reads its code + coverage baseline, proposes hypotheses (recorded `PROPOSED` *before* probing starts), probes, records verdicts, files bugs, updates LEDGER.md — incrementally, after every hypothesis.
- **Definition of done (area):** ≥ 10 counted hypotheses (BUG/SUSPECT/FALSIFIED), every proposed hypothesis carries a verdict or an explicit `DEFERRED` reason, and any new invariant learned is added to the shared oracle helper.
- **Definition of done (campaign):** every area closed, plus one final *completeness-critic* pass: re-read LEDGER.md and known_issues.md asking "which seam between two closed areas did no hypothesis cross?" — its output is a last mop-up wave.
- Sessions are delegation-friendly: everything a cold-started agent needs is APPROACH.md + LEDGER.md + the area file. No conversational context required.

---

## 9. Out of scope / not-a-finding

Performance and perceived latency (perf harness owns it); flake in the *existing* suites; visual taste with no contract behind it; anything already registered `Status: Open` in known_issues.md (confirming one is fine, re-filing it is not); behaviours already asserted by an existing test (the novelty rule).

---

## 10. Area inventory

27 areas — 22 following the subsystem grain (from the 2026-07-29 8-agent code/coverage/invariants mapping) plus 5 *feature cuts* (F1–F5) that deliberately cross subsystem lines, because features shipped in different waves fail at their intersections. Quota: **≥ 10 counted hypotheses each → ≥ 270 campaign-wide.** Per-area detail — scope, code paths, seed seams, matched invariants, known coverage gaps, and the hypothesis table — lives in `areas/<ID>-<slug>.md`; live status in [LEDGER.md](LEDGER.md).

| ID | Area | Grain |
|----|------|-------|
| E1 | History & undo/redo engine (dual-store patches) | engine |
| E2 | Reducers & cross-store cascades | engine |
| E3 | Scene actions, transactions & paste assembly | engine |
| E4 | Clipboard, schemas, initial load & session/UI state | engine |
| I1 | Pointer pipeline, mode dispatcher & keyboard routing | interaction |
| I2 | Touch & pen gesture state machine | interaction |
| I3 | Selection, drag engine & lasso/freehand marquee | interaction |
| I4 | Connector draw, reconnect & waypoint interactions | interaction |
| I5 | Pan/right-click, context menu, placement tools & transform handles | interaction |
| R1 | Projection & coordinate transforms (iso/2D/screen, off-grid) | rendering |
| R2 | WebGL sprite-batch substrate (atlas, shaders, context loss) | rendering |
| R3 | Bulk GPU scene layers (build/invalidation, style parity, LOD) | rendering |
| R4 | Renderer orchestration (culling, hybrid promotion, fit-to-view) | rendering |
| R5 | DOM overlays & presentation parity (labels, hit proxies, grid, compositor) | rendering |
| A1 | Diagram lifecycle: open/save/dirty/autosave state machine | app shell |
| A2 | Storage providers & places model (local/session/Drive, move-to-Drive) | app shell |
| A3 | Project ZIP & import/export (JSON, ZIP, image) | app shell |
| A4 | File explorer, folders & multi-diagram management | app shell |
| A5 | App chrome: boot, dialogs, settings, i18n, theming, storage hygiene | app shell |
| S1 | Google identity & token lifecycle (GIS auth store, gates) | share/backend |
| S2 | Share backend: session snapshots, routes, Express/Worker parity | share/backend |
| S3 | Drive-native sharing & readonly preview ladder | share/backend |
| F1 | Text, labels-as-text & rich-text editing | feature cut |
| F2 | View/preview/presenter modes & annotation overlay | feature cut |
| F3 | Styling system (strip, bulk styling, color picker, round-trips) | feature cut |
| F4 | Layers panel & z-order (visibility, locking, assignment, ordering) | feature cut |
| F5 | Icons & catalog (packs, custom icons, merge-on-load, resize) | feature cut |

Adjacent-area overlaps (A2↔S1↔A5 auth/storage seams; F-cuts vs their subsystem parents) are expected: the novelty rule plus a ledger-wide ID scan before proposing keeps a hypothesis from being counted twice.
