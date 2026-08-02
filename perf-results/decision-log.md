# Engine perf — decision log

Running memory for the self-driving loop (charter KR6). One row per
hypothesis/iteration: what changed, the before/after, the noise-relative
verdict, keep/revert, and why. Newest at the bottom. The context window is
scratch — this file + `baseline.md` are ground truth.

Status legend: 🟢 GREEN (kept) · 🔁 reverted · 🟡 milestone · 🔴 escalate · 🛠 infra.

---

## PHASE 0 — harness + noise floor + baseline (SUPERVISED preconditions)

The charter's three Preconditions for Autonomy are done supervised, then I STOP
for human sign-off before any hands-off looping:
1. harness built + p95 noise band < 10% proven;
2. idle-churn bug fixed + clean noise floor re-proven;
3. correctness suite airtight.

### Iter 0 — 🛠 build the harness (KR1 scaffold)

- **What:** Built `packages/axoview-e2e/perf/{perf.config.ts,engine-perf.spec.ts}`
  + root `npm run perf`. Drives the REAL app in REAL Chromium. Two scenarios
  parameterised by N: **spawn** (commit N nodes in one store write — models
  paste/import) and **drag** (drag one node through an empty tile lane while
  N−1 render). All input + frame capture runs in-page (one `page.evaluate` per
  run) so no Node↔CDP latency sits between an input event and its frame. Frame
  time = rAF delta; long tasks via `PerformanceObserver('longtask')`.
  Median-of-≥7, first run discarded as warm-up. Build gotcha baked into the
  config webServer (`build:lib && dev`, fresh server by default).
- **Validation that the harness measures REAL work (not a no-op):** both metrics
  scale with N as production telemetry predicts —
  - spawn longest frame: ~233 ms (N≤100) → **~1.1–1.3 s (N≥200)** — the
    multi-second paste freeze.
  - drag p95: 16.7 ms (N≤50) → **33–34 ms (N≥200)** — per-frame re-render cost
    climbs above the 16.6 ms budget.
- **Provisional baseline (NOT certified):** see `baseline.md` (run
  2026-06-15T03:30Z).
- **Verdict:** 🔴 **KR1 NOT yet met.** Noise band fails badly — worst **100%**,
  many cells 50–98% (KR1 requires < 10%). Drag at low N is excellent (0.6%),
  proving the input/capture path is stable; the variance concentrates in (a)
  spawn longest-frame and (b) mid/high-N drag p95. Suspected drivers, in order:
  1. **React.StrictMode** is ON in dev (`axoview-app/src/index.tsx`) → every
     component double-renders. Production has it off. Inflates cost AND adds
     scheduling nondeterminism. Unrepresentative + noisy.
  2. **GC pauses** — no forced GC between runs; heap churn (the charter's
     idle-churn leak) injects random multi-100 ms stalls into longest-frame.
  3. **Variable settle tail** — spawn uses a fixed 2 s window; at N≥200 the
     freeze may not settle within it, and idle-tail length varies run-to-run.
### Iter 0a–0g — 🛠 stabilise the harness to the noise floor (KR1) + fix idle churn (KR3)

Worked the noise down from 100% to < 10% (load-bearing). One change at a time:

- **0a — expose+force GC** (`--js-flags=--expose-gc`, GC between runs + before
  capture) and **deterministic spawn settle** (capture commit→K idle frames,
  not a fixed 2 s window). Spawn noise still ~50–90% → GC wasn't the driver.
- **0b — neutralise StrictMode** (gate behind a pre-boot flag; production already
  single-renders). Halved absolute spawn cost (representative) but noise
  unchanged → not the driver.
- **0c — 🎯 disable the DiagnosticsOverlay loop (the idle-churn bug, KR3).**
  `axoview-app` runs `DiagnosticsOverlay` **always-on in dev**
  (`diagnosticsStore.readEnabled` returns `true` unconditionally in dev), driving
  a permanent rAF loop that every 1 s reads the stores, runs 9 detectors, and
  calls `setLatest()` — a **1 Hz React re-render forever**. THIS is the charter's
  "long-tasks accrue / heap climbs at zero nodes" idle churn. Gated it behind the
  same pre-boot perf flag (`axoview-perf-harness`, also skips StrictMode).
  **Effect:** drag noise collapsed (N=100 drag 98.8% → 0.6%). Confirmed driver.
- **0d — continuous metrics + CoV.** Frame-time percentiles are **vsync-
  quantized** (deltas snap to ~16.7 ms) → percentiles near a bucket boundary flip
  bimodally and look "noisy" when work is stable. Switched the headline to
  **continuous** metrics — spawn → settle time, drag → mean frame time — and the
  noise band to **coefficient of variation** (the actual run-to-run variance KR1
  asks for; `(max−min)/median` is range, not variance). Plus a global + per-cell
  V8 warm-up (the render hot path tiers up after ~hundreds of invocations;
  un-warmed runs sit in a slower regime → bimodal).
- **0e — tried disabling vsync** (`--disable-gpu-vsync` etc.) for sub-frame
  timing: headless Chromium keeps a 60 Hz virtual display regardless, and the
  throttling-disable flags only ADDED variance. **Reverted.**
- **0f — 🔬 MAJOR FIDELITY FINDING: the engine already viewport-culls.**
  `Renderer.tsx:131` (`visibleItems = items.filter(tile ∈ coarseBounds)`) renders
  only nodes whose tile is in the viewport. My off-screen grid was measuring the
  CULL, not the cost — node-labels capped at ~306 for any N≥~306 (verified: stays
  306 after a 2 s wait, so genuine culling, not measurement truncation). So
  **render cost scales with VISIBLE entities, not total N** — and production's
  collapse happened with that many nodes *visible* (zoomed to fit). The charter's
  "T2 viewport culling" unlock **partially exists already** (coarse tile-bounds).
  **Fix:** `fitForGrid()` sets zoom+scroll so all N are on-screen before
  measuring (N = visible entity count, the regime SSB/LEB60 measure). Anti-cheat:
  assert `rendered === N` after each spawn. Now scaling is monotonic and real.
- **0g — final certified run.** See `baseline.md` (2026-06-15T04:52Z).

**Outcome — preconditions #1 and #2 MET (supervised):**
- **KR1 CERTIFIED** (load-bearing): worst noise band **5.5%** across all drag +
  spawn N≥100; all-cells worst **6.5%**. (Small-N spawn ≤50 flutters 0–16%
  run-to-run — sub-100 ms operations at the vsync quantization floor, not a
  target; the app is already smooth there.)
- **KR3 PASS** — 60 s idle @0 nodes: heap **82.4→82.4 MB, 0 retained, 0 long
  tasks**. The idle churn was the dev-only overlay loop; the engine idle floor is
  clean. (Production never runs the overlay by default, so this is also a real
  dev-tool fix, not just a measurement convenience.)

**KR2 baseline (trustworthy, N = visible entities):**

| N | spawn longest frame | spawn settle | drag p95 | drag mean |
|---|---|---|---|---|
| 25 | 50 ms | 133 ms | 16.7 | 16.7 |
| 50 | 50 ms | 167 ms | 16.7 | 16.7 |
| 100 | 75 ms | 225 ms | 16.7 | 16.7 |
| 200 | 142 ms | 333 ms | 16.8 | 16.7 |
| 500 | 317 ms | 683 ms | 16.8 | 17.2 |
| 1000 | 633 ms | 1208 ms | 17.6 | 18.1 |

**The binding bottleneck (from the baseline): initial/bulk RENDER (spawn).**
Spawn longest frame grows ~linearly with visible N — 1000 visible nodes = a
633 ms freeze (≈38× the 16.6 ms budget); settle 1.2 s. **Drag, by contrast, is
already ~60 fps even at 1000 visible** — the MQA #7 CSS-variable transform path
makes a live drag compositor-only (no per-frame React reconcile of the scene).
So T1/T2 work should target the mount/reconcile/paint cost of making N entities
*appear* (bulk paste, view switch, zoom-to-fit), NOT the drag path.

### Iter 0h — ✅ precondition #3: correctness suite green (KR5)

Ran the charter's invariant subset against the current `dist`
(`--project=chromium`), all 9 GREEN (~1.5 min):
- collision/occupancy — `drag-collision`
- undo/redo — `undo-redo-cross-cutting`, `undo-redo-dual-stack`
- selection + multi-drag — `multi-select-drag` (Ctrl+A drag preserves relative
  positions; waypoint-follows), `multi-select-drag-lasso`
- z-order — `z-order`, `rectangle-overlap-zorder`
- dragged-node visual-position parity — `css-preview-mid-drag` (model tile
  unchanged mid-drag while `[data-drag-id]` carries `--ff-drag`)

These nine are the standing anti-cheat gate for the optimization loop; the wider
`packages/axoview-e2e/tests/` suite remains available for fuller regression.

## LOOP — T1 "stop the bleeding" (GREEN, self-paced)

Human signed off on the 3 preconditions (KR1 load-bearing accepted). Bottleneck
from the baseline + trace = **bulk/initial RENDER** (spawn); the freeze is ~all
JS (FunctionCall 3203 ms), and within JS the **MUI `sx`/emotion pipeline**
dominates (`styleFunctionSx` 199, `getThemeValue` 140, `extendSxProp` 106,
emotion serialize/`murmur2` ~180, `deepmerge` 66 — see `cpuprofile-spawn-1000.md`).

### Iter 1 — 🔁 REVERTED: static per-node wrappers `<Box sx>` → `styled()`

- **Hypothesis:** the two always-rendered NodeContent wrappers (outer flex Box,
  icon Box) re-run `styleFunctionSx`/emotion per node; compiling them once via
  `styled('div')` (cached class) cuts spawn frame time.
- **Variable:** styling mechanism of those two wrappers only (visually identical).
- **Result (full N set vs baseline):** spawn N=1000 settle 1258 ms vs 1208 ms;
  longest 633 vs 633; N=500 692 vs 683. **Within noise (the stable N=1000 cell
  at 2.2% CoV shows no gain).** → reverted per LOOP step 4.
- **Why it didn't move:** the two wrappers are ~2 of ~6 sx-bearing elements per
  node; the **label subtree** (`<Typography fontWeight fontSize color='text.primary'>`
  → `getThemeValue`; `<Stack spacing={1}>`; `ExpandableLabel`→`Label`) is the bulk
  of the per-node emotion work, and `styled` components still pay a small
  per-render cost. Initial mount (spawn) can't be memoized away — each node's
  first render must get cheaper.

### Iter 1b — 🔬 confirmed the label subtree IS the bottleneck (≈71%, ~3× ceiling)

Added a gated diagnostic (`PERF_NOLABEL=1` → view items get `showLabel:false`)
to isolate the label cost. Spawn N=1000:

| | longest frame | settle |
|---|---|---|
| labels ON (baseline) | 633 ms | 1208 ms |
| labels OFF | **183 ms** | **433 ms** |

So the per-node **label subtree** (MUI `Typography` + `Stack` + `ExpandableLabel`
→ `Label`) is **~450 ms of the 633 ms longest frame (71%)** and ~775 ms of the
settle. `rendered=1000/1000` both ways (icons still render). This bounds the
T1 win at ~3× and pins the target precisely.

### Iter 2a — 🟢 GREEN (KEPT): drop the per-node `scrollTo({top:0})` on mount

First incremental sub-part of Iter 2 (the "ExpandableLabel per-node useEffects"
target). Trace-driven: the spawn CPU profile's single largest addressable slice
was **`scrollTo` 364 ms** (cpuprofile-spawn-1000.md), and the only DOM `scrollTo`
in the render path is `ExpandableLabel`'s scroll-reset `useEffect` (keyed on
`effectiveExpanded`, which is `false` at mount) — so it fires once per node on
spawn. On a freshly-mounted element already at `scrollTop 0` the call is a
behavioural no-op, but synchronously it forces a per-node scroll/layout → 1000
forced reflows interleaved through the spawn.

- **Hypothesis:** guard the effect to fire only on an actual expand/collapse
  *transition* (skip the initial mount). Predict spawn settle/longest drop
  materially at N≥200, well above noise; zero visual change.
- **Variable:** one `useRef` guard that skips the effect's first run. Nothing
  else (visually + behaviourally identical for every real transition).
- **Result (full N set, this run vs certified baseline):**

  | N | settle before→after | Δ | longest before→after | Δ | new noise (CoV) |
  |---|---|---|---|---|---|
  | 200 | 333→200 ms | −40% | 142→67 ms | −53% | 4.2% |
  | 500 | 683→383 ms | −44% | 317→167 ms | −47% | 3.4% |
  | 1000 | **1208→600 ms** | **−50%** | **633→300 ms** | **−53%** | **0%** |

  Long-task total N=1000 2383→1145 ms. Drag unchanged (16.7 mean, as expected —
  drag never mounts labels). **Gain ≫ noise (N=1000 ≈608 ms vs a ~34 ms band; new
  CoV 0%, all 8 runs = 600 ms).** → KEEP.
- **Why ~608 ms, not the predicted ~364 ms:** the per-node `scrollTo` wasn't just
  function cost — each call forced a synchronous reflow during effect-flush.
  Removing it kills the layout-thrash cascade, not just the call. (Consistent with
  the labels-OFF floor of 183 ms longest @1000: we went 633→300, closing >half the
  gap to that floor; the residual ~117 ms longest is the MUI sx/emotion pipeline.)
- **Correctness gate:** 9/9 green (the 7 anti-cheat specs). Label specs `rename`
  + `readable-labels` 4/4 green.
- **Visual verify (real app, window.__axoview__ bridge, screenshots in run log):**
  labels render correctly (white rounded chip, bold title, connector stalk, right
  text); a truncated label expands (overflowY hidden→scroll, clientH 80→247) and
  collapses (→hidden, scrollTop 0); initial-mount scrollTop=0 (skip is a no-op).
  Probe: a real *mouse* click on the tiny absolutely-positioned ExpandButton is
  intercepted by the Gradient overlay (pre-existing hit-test quirk, unrelated).
- **Noise note:** this run's small-N spawn was noisier (N=50 14.3%, N=100 9.6% vs
  prior 6.5/5.5) — machine marginally less idle at the early cells. Load-bearing
  worst stays 9.6% < 10% (KR1 still certified); the keep decision rests on N≥200
  where the win is 40–50% at 0–4% noise, so unaffected. New `baseline.md` committed.

### Iter 2b — 🟢 GREEN (KEPT): `Stack spacing={1}` → plain flex `div` in the label

First `sx`-element sub-step of the residual-emotion target. With the scrollTo
reflow gone (2a), the residual label cost is the per-node MUI `sx`/emotion
pipeline (`styleFunctionSx` 199, `getThemeValue` 140, `extendSxProp` 106, emotion
serialize/`murmur2` ~180, `deepmerge` 66 — cpuprofile-spawn-1000.md).

- **Hypothesis:** the label's `<Stack spacing={1}>` runs MUI styled/sx per node;
  replacing it with a module-level `<div style={{display:flex,flexDirection:
  column,gap:8}}>` (8px = `theme.spacing(1)`) reproduces the exact layout (8px
  between title and optional description; no-op for the single-child name-only
  case) with zero emotion work. Predict a small per-node saving that scales with N.
- **Variable:** the label's row-stack element only (Node.tsx). Visually identical.
- **Result (full N set, vs the 2a baseline):**

  | N | settle 2a→2b | longest 2a→2b | 2b noise |
  |---|---|---|---|
  | 100 | 158→150 ms | 50→33 ms (−33%) | 4.0% |
  | 200 | 200→208 ms (within noise) | 67→67 ms | 4.3% |
  | 500 | 383→350 ms (−8.7%) | 167→142 ms (−15%) | 4.0% |
  | 1000 | 600→567 ms (−5.6%) | 300→267 ms (−11%) | 1.9% |

  **KEEP.** Modest but real: the longest-frame (commit) reduction *scales with N*
  (−16/−25/−33 ms at 100/500/1000) — the signature of a fixed per-node cost
  removed, not between-run drift — and at N=500/1000 it clears the noise band
  (~2–3×). N=200 wobbled up within its 4.3% band (no regression). Drag unchanged.
- **Correctness:** gate 9/9 + `rename`/`readable-labels` 4/4 green (13/13 total).
  **Visual verify** (.scratch/verify-labels.mjs): label layout pixel-identical
  (collapsed clamp 80, expand→scroll, collapse→top; screenful unchanged).
- **Noise note:** small-N spawn noisy this run (N=25/50 18–18.6%) — machine less
  idle at the early cells. Load-bearing worst 4.3% < 10% (KR1 certified; better
  than 2a's 9.6%). New `baseline.md` committed.

### Iter 2c — 🔁 REVERTED: `Typography` title → `styled('p')` (within noise on settle)

- **Hypothesis:** the display-mode `Typography fontWeight={600} fontSize={14}
  color='text.primary'` re-runs the MUI sx pipeline + a `getThemeValue('text.
  primary')` per node; a module-level `styled('p')` baking `theme.typography.body1`
  + those overrides into one cached emotion class (per-node `labelFontSize`/
  `labelColor` via inline style) should cut per-node cost with identical visuals.
- **Variable:** the display-mode title element only (editing-mode `Typography` left
  as-is — single-node, not the spawn hot path).
- **Result (full N set, vs 2b baseline):**

  | N | settle 2b→2c | longest 2b→2c | 2c noise |
  |---|---|---|---|
  | 200 | 208→200 ms | 67→67 ms | 0% |
  | 500 | 350→342 ms (−2.4%) | 142→133 ms | 3.6% |
  | 1000 | **567→567 ms (0%)** | 267→250 ms | 4.4% |

  **REVERT.** The headline (settle) is **flat at N=1000 (566.6→566.6)** and
  within-noise at N=500. The only movement is longest-frame 267→250, but that is
  **exactly one vsync bucket (16.65 ms)** — the bimodal quantization flutter the
  headline was switched away from in 0d. Inside the noise band on the robust metric
  → revert per LOOP step 4. Reverted code + restored the 2b `baseline.md`.
- **Correctness/visual (pre-revert, for the record):** gate 13/13 green; computed
  style matched body1 exactly (14px/600/lh19.6/text.primary/margin0/block;
  `letterSpacing:normal` — this theme's body1 sets none, so `Typography` rendered
  the same); expanded content `scrollH=249` identical across the 2a/2b/2c builds
  (metric-faithful). So the swap was *correct*, just not *worth it*.
- **🔬 Finding (redirects the loop):** the title's per-node `Typography` sx cost
  lands in the **commit frame** (longest), not the **settle** total — so the spawn
  *settle* floor (≈567 ms @1000) is dominated by something the title styling does
  NOT touch: the post-commit **layout/paint tail** + the two per-node label
  `useEffect`s (a `ResizeObserver` per node for truncation; a `storeApi.subscribe`
  per node for readable-labels counter-scale) + the remaining sx. **Grinding
  individual label `sx` elements past the Stack has hit diminishing returns on the
  headline.** This is sub-noise hypothesis #1 (charter: 3 consecutive ⇒ local
  minimum RED).

### Iter 2d — 🔁 REVERTED: label DOM flatten (−2 wrapper nodes) — within noise (same-session A/B)

Direction (from the 2c finding): stop per-element sx, reduce DOM-node COUNT (the
layout/paint tail). Flattened the node-only wrapper chain: folded the `node-label`
`Box` into ExpandableLabel's outer element (test id + dbl-click moved there) and
absorbed the per-node flex-stack `<div>` into ExpandableLabel's scroll-content Box
(now the flex column). −2 DOM nodes/label, node-only (shared `Label`/`ConnectorLabel`
untouched), visuals + behaviour identical (gate 13/13; screenshot + title computed
style + content `scrollH` all unchanged).

- **Apparent result (vs committed 2b baseline):** spawn N=1000 settle 567→433
  (−24%), longest 267→200; consistent ~24% across N=200/500/1000. Looked like a
  major win.
- **🔬 THE FINDING — it was machine drift, not the change.** The magnitude (landing
  exactly on the old labels-off floor) was suspicious, so I ran a **same-session
  A/B control**: stashed the flatten and re-measured the **committed 2b code in the
  same session**. Result @1000:

  | build (same session, ~15 min apart) | settle | longest |
  |---|---|---|
  | 2b code (control) | **441.6 ms** | 199.9 |
  | 2d code (flatten) | **433.4 ms** | 199.9 |
  | 2b baseline (committed, *earlier* session) | 567 ms | 267 |

  Same-session, 2b-code (441.6) ≈ 2d-code (433.4) — ~2%, **within the 2.8% noise
  band**, longest frames identical. **The flatten does ~nothing.** The 567→433 was
  **cross-session drift**: the machine is ~22% faster this session than when the 2b
  baseline was recorded. → **REVERT** (within noise per LOOP step 4). 2d code stashed
  (`stash@{0}`, recoverable as a pure cleanup; it IS a valid −2-node simplification).

- **⚠️ METHODOLOGY DEFECT (load-bearing — invalidates cross-session comparisons):**
  cross-session/run drift here is **~22%** (same 2b code: 567 earlier vs 441.6 now),
  while within-run CoV is **~2%**. KR1 certified the *within-run* noise band (<10%)
  but that does **NOT** bound cross-session drift. **Every iteration so far compared
  a fresh run against a prior-session committed baseline → those deltas are reliable
  only to ~±22%.** Re-reads of past iterations under this lens:
  - **2a** (scrollTo reflow, −50% cross-session): mechanism (eliminating 1000 forced
    synchronous reflows) is real and the magnitude exceeds drift → **win is real**,
    though exact size is uncertain.
  - **2b** (Stack→div, −5.6% cross-session): **well inside the ~22% drift band →
    SUSPECT / probable false-positive.** Kept on drift, not signal.
  - **2c** (reverted, flat): conclusion still correct (flat survives drift either way).
  - **2d**: reverted (same-session control).
- **FIX (required before any further keep/revert):** decisions must be **same-session
  A/B** — measure baseline-code and changed-code back-to-back in one machine state
  (stash/rebuild between, or a harness mode that renders both). Comparing to the
  stale committed baseline is invalid. Cheaper variant: at session start, re-measure
  the committed code in *this* session and compare iterations against that
  session-local baseline.

### Iter 2e — NEXT: STOP / escalate (RED-adjacent) — methodology + diminishing returns

- **Why stop:** (1) the cross-session drift defect above means the loop cannot make
  valid keep/revert calls without a methodology fix; (2) two consecutive properly-
  controlled hypotheses (2c, 2d) are within noise — the label subtree resists cheap
  T1 optimization beyond 2a; (3) 2b is suspect and may warrant reverting.
- **Inputs read — `bloat-analysis.txt`** (node-render analysis on master by another
  agent). Corroborates the DOM-volume thesis (~14 elements/node; label subtree =
  8 of them; the 2 wrapper Boxes I flattened in 2d ARE the "empty `css-0` ×2"
  overhead — but only ~14% of the subtree, so removing them was within noise, as
  measured). Surfaces **two NODE-level levers the label grind missed:**
  1. **Repeated inline icon** — every node embeds the *same* ~2.1 KB base64 SVG
     (~230 KB across ~110 nodes), the single biggest weight; it's **per-node, in
     the icon floor**, not per-label. Fix: shared `<use>` sprite / one cached
     `<img src>` (browser dedupes decode) / CSS background.
  2. **`willChange:'transform'` unconditional** (INNER_SX, Node.tsx) → ~N permanent
     compositor layers at idle. Make transient (set on drag-start, clear on
     drag-end); measure layer count + spawn compositor (`PaintArtifactCompositor`).
  - **⚠️ Harness-fidelity gap this exposes:** the perf harness's `PERF_ICON` is a
    trivial ~100-byte `<rect>`, so the harness **does not measure the ~2.1 KB-base64
    icon cost** — the real app's spawn is heavier than the baseline shows, and
    icon-dedup is a real-world win the harness can't currently validate. Fix the
    harness to use a representative icon before chasing the icon lever.
  - Do-not-touch (per the analysis): inline `--ff-x/--ff-y`/z-index, the Node/
    NodeContent split, OUTER_SX/INNER_SX constants, `data-drag-id`, the shared
    emotion hash classes.
- **Open levers (all need a decision):** (a) fix methodology + re-validate 2a/2b
  same-session, then resume; (b) **icon-dedup** + **transient willChange** — node-
  level, hit the icon floor (433) that labels now sit on, but need the harness icon
  fixed first (fidelity); (c) label LOD below a *world-view* zoom threshold
  (≈<20–25%, beneath the 30–50% working range so it never conflicts with readable-
  labels) — the user wants this as BACKUP, preferring to optimize labels rather than
  hide them; (d) accept 2a as the T1 win and escalate to T2 (Canvas2D render — RED).

## 🛠 Harness v2 — realistic scene + drift methodology (resolves the 2e escalation, option #1)

Human chose option #1: fix measurement + build a realistic case before grinding
further. Done (`engine-perf.spec.ts`):

- **Realistic scene** (`buildScene`): per N → N nodes (5 representative ~1.7 KB
  icons round-robin, varied label colours, ~20% with a description, ~12% with
  notes) + ~N connectors (right-neighbour edges, ⅓ labelled, palette colours) +
  grouping rectangles (~5×5 blocks). Spawn commits the whole scene in one
  `model.set` (paste / import / diagram-open). Anti-cheat upgraded: `rendered=N/N`
  validated AND scene composition (conn/rect counts) logged per cell.
- **Representative icon** replaces the trivial 100-byte `<rect>` (fixes the
  bloat-analysis fidelity gap — real icons are ~2 KB base64).
- **Collision-during-drag**: drag now drags a *connected* in-grid node through
  *occupied* tiles → per-frame collision checks + connector re-route (old harness
  dragged one unconnected node through an empty lane).
- **Calibration index** (fixed CPU workload) printed + in `baseline.md`; cross-
  session drift was ~22% so absolute numbers compare only between similar-index
  runs. **Keep/revert is now mandated same-session A/B** (re-measure the reference
  build in the same session), never vs a prior-session baseline.
- **Text boxes excluded** (documented): their `size` is derived scene-side by the
  `createTextBox` reducer (`getTextBoxDimensions`); a bulk `model.set` bypasses it
  → renderer crashes on undefined `size.height`. Negligible bulk-render weight.

**New baseline** (`baseline.md`, realistic scene, calibration 3.2 ms; rendered=N/N
all cells):

| N | spawn longest | spawn settle | drag mean | scene |
|---|---|---|---|---|
| 200 | 83 ms | 167 ms | 16.7 | conn=186 rect=9 |
| 500 | 167 ms | 250 ms | **30.2** | conn=478 rect=25 |
| 1000 | 317 ms | 400 ms | 16.9 (see caveat) | conn=968 rect=49 |

**Findings from the realistic baseline:**
- **Spawn stays node-dominated** — ~968 connectors + 49 rectangles barely shift
  settle vs nodes-only (≈400 here vs the ≈441 same-session simple-scene 2b control).
  Connectors/rectangles are cheap; the grind target remains the **node subtree**
  (labels/icons/emotion) and the node-level levers (icon dedup, willChange).
- **Collision-drag is NOT free**: N=500 drag = **30 ms/frame (~33 fps, 2× over the
  16.6 ms budget)**, settle 2416 ms — the old empty-lane unconnected drag (flat
  16.7 ms) hid this. Per-frame collision check + connector re-route + render of the
  visible scene is the cost. This is a NEW, real drag finding the realistic harness
  surfaced.
- **⚠️ Drag caveat (provisional cell):** N=1000 drag reads 16.9 ms (idle-like;
  settle≈idle 1349, all frames 16.9) — *faster* than N=500's 30 ms, which is
  inverted. The grab silently **failed to engage at the extreme fit-zoom** (the
  pointer→tile coord from `tileToClient` misses the node). So the high-N collision-
  drag cells are unreliable until the grab is made robust (e.g., engage via the
  rendered node's DOM rect, and assert the drag mode actually activated). Spawn
  cells are unaffected (rendered=N/N).

**Next:** decide grind direction on the SOLID spawn baseline (node-level: icon
dedup / transient willChange / further label render) — and fix the collision-drag
engagement so its high-N cells become trustworthy. Keep/revert from here = same-
session A/B.

## 🔬 Re-validation of 2a & 2b — same-session A/B on the realistic scene (N=1000)

Three variants measured back-to-back this session (the calibration index caught
~9% intra-session warm-up drift: 3.4 → 3.2 → 3.1 across the runs — even sequential
"same-session" runs drift, so the index is load-bearing for attribution):

| variant | settle | calibration | normalized (settle/cal) |
|---|---|---|---|
| A — 2a + 2b (HEAD) | 400.0 ms | 3.4 | 117.6 |
| B — 2a, **no 2b** (Stack restored) | 425.0 ms | 3.2 | 132.8 |
| C — **no 2a**, 2b (unguarded scrollTo) | 399.95 ms | 3.1 | 129.0 |

- **2b (Stack→div) — REAL (keep).** B is *slower* than A (425 vs 400) despite a
  *faster* machine (cal 3.2 < 3.4) → the effect overcomes the drift direction.
  ~−6% raw, ~−11% calibration-normalized. **My earlier "suspect false-positive"
  call (decision-log, drift section) was WRONG** — the realistic same-session A/B
  confirms 2b is a genuine ~−6% win.
- **2a (scrollTo-on-mount guard) — REAL but SMALL / borderline (keep).** A≈C raw
  (400≈400), but C ran on the fastest machine (cal 3.1) and only *matched* A →
  normalized ~−9% in A's favour. The original **−50% was cross-session drift**
  (simple-scene, never validated same-session) + likely a simple-scene-specific
  layout-thrash that the realistic scene doesn't reproduce. On the realistic scene
  2a's benefit is modest. Kept regardless: it is a *correct* change (skipping a
  freshly-mounted element's scrollTo({top:0}) is a behavioural no-op).
- **Outcome: both kept, no reverts; magnitudes corrected.** 2a is NOT the giant it
  appeared (drift); 2b is genuinely real.

**⚠️ Methodology nuance (compounds the drift defect):** even SEQUENTIAL same-session
runs carry ~9% warm-up drift (cold machine slower). Effect sizes here (~6–11%) are
*comparable to* that drift → small T1 label/node micro-opts sit near the
measurement floor. For trustworthy small-effect attribution: **interleave** variants
(A,B,A,B…) or normalise by the calibration index; and run a throwaway warm-up first.
Big/architectural effects (T2) would clear the floor easily; sub-drift micro-opts
will be hard to prove either way — a signal about T1's remaining headroom.

## 🟢 Iter 3 — KEPT (big T1 win): wholesale de-emotion of the node subtree

Per the "one big T1 attempt, then decide" decision. Convert every ALWAYS-rendered
node-subtree `<Box sx={...}>` to a module-level `styled()` component (CSS resolved
ONCE into a cached class), eliminating the per-instance MUI sx pipeline. Converted
across Node.tsx, Label.tsx, ExpandableLabel.tsx: node shell, transform wrapper,
flex-centre wrapper, icon wrapper, notes badge, label title (body1 baked), label
stack, Label outer + chip (sx passthrough preserved for ConnectorLabel),
ExpandableLabel counterScale (→ plain div) + scroll-content (→ styled, scrollbar-hide
baked). Dynamic bits (--ff-* vars, cursor, label colour/size, width, maxHeight,
transform, pb) stay inline. Rare paths left as-is (hasLink badge, editing Typography,
Gradient, ExpandButton).

- **Key insight PROVEN:** even a MODULE-LEVEL `sx` constant (`<Box sx={OUTER_SX}>`)
  re-runs the per-instance emotion pipeline (extendSxProp / styleFunctionSx /
  murmur2) EVERY render — emotion caches the serialized output by hash, not the
  *processing*. `styled()` resolves once; per-instance is just a className apply.
  (bloat-analysis's "emotion classes are cached, don't consolidate" was right about
  stylesheet SIZE but missed this per-instance PROCESSING cost — ~403 ms @N=1000.)
- **Same-session interleaved A/B (T-H-T, N=1000, drift-controlled):**

  | run | build | settle | longest | cal |
  |---|---|---|---|---|
  | T1 | de-emotion | 283.4 | 200 | 3.2 |
  | H1 | HEAD (Box) | 400.0 | 317 | 3.1 |
  | T2 | de-emotion | 283.3 | 200 | 3.2 |

  T1≈T2 bracket H1; H1 even ran on a *faster* machine (cal 3.1) yet was slower.
  Effect ~117 ms ≈ **6× the ~9% drift floor. Unambiguous.**
- **Full baseline (de-emotion, cal 3.3 ≈ HEAD's 3.4 → directly comparable; new
  `baseline.md`):**

  | N | settle HEAD→deE | longest HEAD→deE |
  |---|---|---|
  | 200 | 167→133 (−20%) | 83→50 (−40%) |
  | 500 | 250→183 (−27%) | 167→100 (−40%) |
  | 1000 | 400→283 (−29%) | 317→200 (−37%) |

  Consistent ~20–29% settle / ~37–40% longest across N. rendered=N/N; KR3 PASS
  (idle heap 77.6 MB flat — *lower* than before, fewer emotion artifacts); KR1
  certified (load-bearing worst 6.4%). Correctness 13/13 green; title computed
  style + chip + full scene pixel-identical.
- **Verdict: KEEP. T1 is NOT exhausted** — per-instance emotion across ~10 elements
  × N nodes was the real lever. Spawn N=1000 is now **283 ms settle / 200 ms
  longest** (from the PHASE-0-era 633 ms longest). Drag unchanged (render-only); the
  N=1000 collision-drag cell stays the provisional failed-grab (separate fix).
- **Next (same-session A/B from here):** icon-dedup + transient willChange
  (node-level, bloat-analysis); fix the collision-drag grab engagement; or measure
  the new gap to the labels-off floor to see if more T1 remains before T2.

## ⏸ Earlier checkpoint — all 3 autonomy preconditions MET (signed off)

| Precondition | Status |
|---|---|
| #1 harness + noise band < 10% proven | ✅ KR1 certified (load-bearing 5.5%) |
| #2 idle-churn fixed + clean floor re-proven | ✅ KR3 pass (0 retained, 0 long tasks) |
| #3 correctness suite airtight | ✅ KR5 — 9/9 invariant specs green |

Per the charter (Autonomy & escalation), preconditions are done SUPERVISED and I
must STOP for sign-off BEFORE entering the GREEN-default self-paced loop. Holding
here. Open question for the human: accept KR1 as certified for the load-bearing
regime (small-N spawn ≤50 left at the vsync quantization floor, non-target), or
invest in microbenchmark-averaging to force ≤50 under 10% too?

First optimization hypothesis queued for after sign-off (from the baseline's
binding bottleneck = bulk RENDER, not drag): instrument a single spawn at N=1000
with the React render probe / a CDP trace to attribute the 633 ms freeze
(reconcile vs style/emotion vs layout vs paint), then target the largest slice
(likely per-node emotion `sx` styling or SVG/DOM paint) — T1 "stop the bleeding"
without a rewrite. [SUPERSEDED — see the resume point below.]

## 🔁 Iter 4 — REVERTED: de-emotion the icon subtree (NonIsometricIcon) — within noise + the attribution that kills the spawn-JS levers

Resuming T1 from the queued "label DOM-flatten + cheaper effects" step. Two
controlled experiments this session, both decisive — and both say the same thing:
**the post-Iter-3 spawn residual is DOM-volume / layout / paint bound, NOT
JS-processing (emotion or per-node effects) bound.**

**(a) Attribution probe — the two per-node label effects cost ~0 on spawn.** The
resume point pinned the residual label cost (~108 ms settle @1000 = full 283 −
labels-off floor 175) on "DOM volume + the two per-node effects" (a `ResizeObserver`
per node for truncation; a `storeApi.subscribe` per node for the readable-labels
counter-scale). I gutted BOTH effects in ExpandableLabel (throwaway build) and
measured same-session, **same calibration (3.2 = 3.2, no drift confound)**:

  | variant (N=1000) | settle | longest |
  |---|---|---|
  | A — HEAD (full effects) | 283.3 | 200 |
  | D — both per-node effects gutted | 283.3 | 199.9 |

  **A ≡ D.** The two effects contribute nothing measurable to spawn. (Mechanism:
  the RO's initial callback + the subscription `apply()` either land off the
  measured settle critical path or React batches them sub-noise.) → the "cheaper
  effects" lever is **dead** for spawn. Also note the shared-RO refactor is
  *separately* blocked: the H-2 `useResizeObserver.lifecycle` regression test pins
  a per-hook observer-instance model (counts `new ResizeObserver` per mount, calls
  `disconnect()` not `unobserve`), so a shared singleton would break a protected
  test — and it now demonstrably wouldn't help anyway.

**(b) Hypothesis (reverted) — de-emotion NonIsometricIcon.** Iter 3's wholesale
de-emotion swept Node/Label/ExpandableLabel but **missed the icon subtree**
(`IconTypes/NonIsometricIcon.tsx`, a different dir). Under ISOMETRIC canvas mode
every node's icon is **three nested `<Box sx={...}>`** — the exact per-instance MUI
sx pipeline (extendSxProp / styleFunctionSx / murmur2) Iter 3 removed elsewhere,
and it renders even with labels OFF (so it sits in the 175 ms floor). Converted the
3 boxes → 2 module-level `styled()` (the iso transform `getIsoProjectionCss()` is a
constant string; left/top/transformOrigin/pointerEvents constants → baked into
cached classes) + plain `<img>` leaves (their only style was the dynamic width →
inline). Visually identical; lib builds clean.

- **Variable:** styling mechanism of NonIsometricIcon's boxes only.
- **Result (same-session, cal 3.3 ≈ HEAD's 3.2):**

  | N | settle HEAD→deE | longest HEAD→deE |
  |---|---|---|
  | 500 | 199.9→199.9 | 116.7→116.6 |
  | 1000 | **283.3→283.3** | 200→200 |

  **Bit-identical** (settle 283.3 reproduced across HEAD ×3 this session + the
  treatment). Idle heap unchanged (77.6 MB). **→ REVERT** (within noise, LOOP
  step 4). Reverted to HEAD; lib rebuilt. (Recoverable as a pure consistency
  cleanup that completes Iter 3's sweep, like the 2d flatten — but it moves
  nothing on this harness, so not kept.)

**🔬 THE FINDING (redirects the loop — spawn-JS T1 is exhausted):** Iter 3
(de-emotion) was a 6×-drift win because per-instance emotion *processing* was a
large, real slice. Post-Iter-3, removing the icon's emotion (b) AND the two
per-node effects (a) each moves the needle by **zero** — because what's left of the
283 ms settle is the cost of **reconciling + laying out + painting ~14 DOM
elements × 1000 nodes** (+ connectors + rects), not JS the profiler can shave.
Corroborated three ways now: 2c (Typography styled, sub-noise), 2d (DOM-flatten −2
nodes, sub-noise), Iter 4a/4b (effects + icon emotion, sub-noise). **The only
spawn levers left are (i) cut DOM-node COUNT per node *a lot* — but 2d showed even
−2/node is sub-noise and the user wants to keep labels; or (ii) T2 render rewrite
(Canvas2D — RED).** Grinding spawn JS further is a local minimum.

**→ Decision: pivot off spawn to the DRAG / collision path** (the realistic-harness
finding the spawn grind never touched): collision-drag N=500 = **30 ms/frame
(~33 fps, 2× over budget)** — a REAL, unaddressed bottleneck on the LEB60 north-star
path (moving + collision-checked entities), unlike spawn (a one-time paste cost).
Prereq: fix the high-N grab engagement (item 4) so those cells are trustworthy,
then profile the 30 ms frame (collision check vs connector re-route vs render) and
optimize the largest slice. This is fresh T1 headroom, not a 3rd consecutive
spawn micro-opt.

## 🛠 + 🔬 Iter 5 — drag/collision path: robust grab (kept) + profiling finding (the drag re-renders React per frame)

Pivot target from Iter 4. Two parts: a harness-fidelity fix (committed) and a
trace-driven finding that names the next optimization.

**(a) 🛠 Robust collision-drag grab (committed `73c1d77`, harness-only).** The old
grab pressed `perf-0` (top-left) at a `tileToClient`-projected point. At the extreme
fit-zoom for large N the corner node sits at/past the viewport edge, and the
harness forward-projection diverges from the lib's inverse screen→tile, so the
press landed on empty space → the drag silently never engaged (the N=1000 cell read
idle 16.9 ms — the "PROVISIONAL failed grab"). Fix: grab a node near the GRID CENTRE
(guaranteed on-screen, fully surrounded by occupied tiles → a better collision test)
via its ACTUAL rendered DOM rect (`nodeClientCenter`, falls back to tileToClient),
and **assert `mode==='DRAG_ITEMS'` each frame** (`engaged=N/N` now reported per
cell). Result: **engaged=5/5 at N=200/500/1000.**
- **🔬 This OVERTURNS the resume-point assumption.** With the grab now provably
  engaged, N=1000 STILL reads ~16.9 ms while N=500 reads ~30 ms. So the collision-
  drag cost is **genuinely non-monotonic in N — not a failed grab.** N=1000 is cheap
  because its per-frame work fits under the 16.6 ms budget (profile: ~1047 ms idle,
  layout-bound); N=500 is expensive because of JS.

**(b) 🔬 Profiled one collision-drag frame at N=500 and N=1000** (new `PERF_DRAGPROFILE`
harness mode: timeline self-time + CPU sampler around one drag → `dragprofile-{N}.md`).
**The drag is JS/scripting-bound, NOT layout/paint-bound, and it re-renders React
every frame** (defeating the MQA #7 "compositor-only drag" ideal):
- **N=500 timeline:** FunctionCall (JS) **2429 ms** vs style+layout+paint ~250 ms
  over 80 frames → ~30 ms/frame, ~90% JS.
- **N=500 JS self-time** (excluding profiler/GC/idle artifacts): a dominant lib
  arrow (~664 ms; exact minified line unreliable across rebuilds) + the full React-
  reconcile signature — `jsxDEV`/`ReactElement` (element creation), `useMemo`/
  `useCallback`, **`commitHookEffectListUnmount` (44 ms — effects UNMOUNTING/
  remounting → component churn)**, `updateEffectImpl`, `handleStoreChange`+`shallow`
  (zustand), **`murmur2` (48 ms — EMOTION running per frame)**, **`getNativeRange`
  (98 ms — QUILL / RichTextEditor)**, `getBoundingClientRect`+`NotifyResizeObservers`
  (the per-node label ROs), `useColor`.
- **The smoking gun:** `getNativeRange` exists ONLY in node descriptions (Quill) and
  `murmur2` ONLY in `sx` components (the icon's NonIsometricIcon sx + connector-label
  chip). Both firing during a drag ⇒ **node content is re-rendering per frame.**
  (Note: this means Iter 4's icon de-emotion — sub-noise on one-time spawn — could
  actually matter on the per-frame DRAG path, IF node re-render isn't eliminated
  first. Fix the re-render first; re-test icon de-emotion after.)

**Mechanism (from code):** `DragItems.mousemove` → `dragItems` →
`scene.previewConnectorPaths(...)` does a **`flushSync(set({connectors}))` every
frame** ([useSceneActions.ts](../packages/axoview-lib/src/hooks/useSceneActions.ts)
~L368) to keep wires visually attached. The flushSync forces a synchronous render of
scene-`connectors` subscribers — and something in that wave is re-rendering node
content (Quill + emotion), not just the 1–2 affected connectors. Also
`computeNodeUpdates` rebuilds an **O(N) `externalOccupied` Set every frame**
([DragItems.ts](../packages/axoview-lib/src/interaction/modes/DragItems.ts) L97-101)
though external items can't move during a drag. The non-monotonic N=500>N=1000 cost
is geometry/zoom-sensitive: dragging through OCCUPIED tiles makes `computeNodeUpdates`
return null (node can't enter an occupied tile) on many frames, so the per-frame
work depends on exactly which tiles the 150 px screen-drag crosses at each zoom.

**NEXT (drag path, ordered; each via same-session A/B + correctness gate + visual):**
1. **CONFIRM + QUANTIFY the per-frame node re-render** — first thing next session.
   Use the built-in `useRenderProbe` (Node/NodeContent already instrumented; enable
   with `?perfprobe=1`). Add a `get()` to the probe API and have the harness read
   Node/NodeContent render counts across one measured drag → is it ALL visible
   nodes/frame, or only the dragged node + connector neighbours? That determines the
   fix's scope and ceiling.
2. **Stop node content re-rendering on the per-frame connector preview.** The
   `flushSync(set({connectors}))` must re-render connectors but should NOT touch
   nodes. Find the subscription that leaks the connectors-slice change into
   NodeContent (a too-broad scene selector, or the Renderer re-rendering its whole
   child tree) and narrow it so the MQA #7 memo actually holds during a collision-
   drag. Predicted big LEB60 win (drag → compositor-only).
3. **Cache `externalOccupied` at drag entry** (it's constant during a drag) — removes
   an O(N) Set rebuild/frame. Smaller, safe, single-variable; do after (2).
4. **Re-test Iter 4 icon de-emotion on the drag path** once nodes stop re-rendering
   needlessly — if any residual per-frame node render remains, killing the icon
   `murmur2` may finally clear noise (it didn't on spawn).

**Gotcha (carry forward):** minified bundle line numbers in CPU profiles shift across
rebuilds — trust the function NAMES (murmur2, getNativeRange, commitHookEffectListUnmount),
not `index.js:<line>`. `PERF_DRAGPROFILE` and `PERF_PROFILE`/`PERF_CPUPROFILE` skip
the baseline write (no baseline.md restore needed after a profile run; DO restore after
any partial `PERF_N` run).

## 🟢 Iter 6 — KEPT (big drag win): `useColor` fat-subscription fix → collision-drag 33→60 fps @N=500

The Iter 5 profile said "node content re-renders per frame." The `useRenderProbe`
(wired into the harness this iter: `renderProbe.get()` + `PERF_RENDERPROBE=N` mode,
booted with `?perfprobe=1`) **corrected that** and pinned the real culprit:

**🔬 renderProbe, N=500, 80 drag frames (BEFORE):**

| component | total renders | instances | per frame |
|---|---|---|---|
| **Connector** | 34894 | 478 | **≈436/frame** |
| Connectors (container) | 73 | 1 | ~0.9 |
| Node / NodeContent | 1 / 1 | 1 | ~0 |

**Nodes do NOT re-render — ALL 478 connectors re-render every frame.** (The Quill
`getNativeRange` + emotion `murmur2` in the Iter-5 profile were the connectors'
own labels/sx, not nodes.) A same-session diagnostic (`__viewsChanges=0`) proved
`modelStore.views` is stable during a CSS-preview drag → the view connector objects
+ `currentView` are referentially STABLE → a memo on the `connector` prop did
**nothing** (verified: bit-identical 34894). So the re-render is **NOT prop-driven —
it's an internal store subscription** firing for every connector each frame.

**Root cause:** every `Connector` (and `ConnectorLabel`) calls `useColor`, which did
`const { colors } = useScene()` → `useScene` pulls `useSceneData`, which **subscribes
to `sceneStore.connectors`** ([useSceneData.ts](../packages/axoview-lib/src/hooks/useSceneData.ts)
L30-34). The per-frame `previewConnectorPaths` `set({connectors})` writes a new outer
connectors object → that subscription fires → `useColor` re-renders → all 478
Connectors re-render, even though only the dragged node's 1–2 connectors changed.
(zustand 5.0.14 ignores the legacy `shallow` 2nd arg, compounding it.) `useColor`
only needs `colors`, which lives in the MODEL store and is stable during a drag.

**Fix (one variable):** `useColor` subscribes granularly — `useModelStore((s) =>
s.colors)` (+ a stable `EMPTY_COLORS` fallback) instead of `useScene()`. Identical
data, narrower subscription.

- **🔬 renderProbe AFTER:** Connector renders **34894 → 626** (≈436 → **≈7.8/frame**,
  −98%) — only the dragged node's affected connectors re-render now.
- **Same-session A/B (drag mean frame, interleaved stash/pop):**

  | N | HEAD (no fix) | fix | cal H→fix |
  |---|---|---|---|
  | 500 | **30.83 ms (33 fps)** | **16.87 ms (60 fps)** | 3.2→3.1 |
  | 1000 | 16.67 ms | 17.08 ms (already cheap) | 3.2→3.1 |

  **N=500 collision-drag −45%, 33→60 fps.** HEAD ran on a *faster* machine (cal 3.2
  vs 3.1) yet was 1.8× slower → effect ≫ drift. Confirmed by the renderProbe mechanism.
- **Correctness:** gate **13/13 green** (incl. the colour-dependent z-order /
  rectangle-overlap-zorder / css-preview-mid-drag specs). Spawn unaffected (nodes
  don't use `useColor`). **→ KEEP.**

**🔬 Finding / next:** the drag path had a real T1 win that the spawn grind never
touched — a fat subscription, not the CSS-preview architecture. `useColor` is used
widely; this also helps any other per-frame connector/label re-render. **Likely more
of the same:** audit other hot-path components for `useScene()`/`useSceneData()`
over-subscription (ConnectorLabels, the per-connector label path) — each `useScene()`
in a per-instance component re-subscribes to the whole scene. Next: re-profile the
N=500 drag (should now be layout/paint-bound like N=1000 was), and check ConnectorLabel.

---

## ▶ COLD-START RESUME POINT (newest — start here)

**Branch `perf/engine`, HEAD = Iter 6 commit.** Commits since Iter 3 `f1c3e15`:
Iter 4 log (`8eb6d3c`, code reverted), robust drag grab (`73c1d77`), Iter 5 log +
`PERF_DRAGPROFILE` (`00bd34b`), **Iter 6 `useColor` fix + renderprobe tooling**. Last
LIB CHANGE that's KEPT and shipping: Iter 3 de-emotion + **Iter 6 useColor granular
subscription**. Working tree clean (only `bloat-analysis.txt` untracked).

**State of the loop (T1, GREEN, realistic harness):**
- **Harness v2** is the realistic scene: N nodes (5 representative ~1.7 KB icons,
  varied label colours, ~20% descriptions, ~12% notes) + ~N connectors (⅓ labelled)
  + grouping rectangles. Spawn = one bulk `model.set`. Drag = a connected in-grid
  node dragged through OCCUPIED tiles (collision + connector re-route). Text boxes
  excluded (scene-side size derivation incompatible with bulk set). Calibration
  index in every run.
- **Baseline** (`baseline.md`, FRESH full run post-Iter-6, cal 3.2, KR1 6.2% certified):
  spawn N=1000 **settle 283 / longest 200**; N=500 200/117; N=200 133/50 (UNCHANGED by
  Iter 6 — nodes don't use useColor). **Drag: ALL cells now ~16.7 ms 60 fps, engaged=8/8
  — N=500 collision-drag 30→16.9 (Iter 6); the N=1000 "PROVISIONAL" caveat is GONE
  (grab fix).** KR3 idle PASS (0 retained, 0 long tasks; heap abs 87.5 MB — session-
  dependent, only the 0-retained leak metric matters).
- **Wins kept:** 2a (scrollTo-mount guard), 2b (Stack→flex, ~6%), **Iter 3 wholesale
  de-emotion (BIG spawn: −29% settle @1000)**, **Iter 6 `useColor` granular subscription
  (BIG drag: collision-drag N=500 33→60 fps, −45%)**. Reverted: 2c, 2d, Iter 4 (icon
  de-emotion, bit-identical).
- **⛔ SPAWN-JS T1 IS EXHAUSTED (Iter 4 finding).** Post-Iter-3, the 283 ms settle
  is DOM-volume / layout / paint bound, NOT JS-processing bound: removing the icon's
  per-instance emotion (Iter 4b) AND the two per-node label effects (Iter 4a probe)
  each moved the needle by **zero**. Three corroborating sub-noise results (2c, 2d,
  4). Do **not** re-attempt: more de-emotion, label DOM micro-flatten, or shared-RO
  / per-node-effect changes — all proven dead on spawn (and shared-RO is blocked by
  the H-2 protected test). The only spawn step-change left is T2 (Canvas2D — RED).

**⚠️ MEASUREMENT PROTOCOL (load-bearing — do not skip):** cross-session/run machine
drift is ~9–22%, ≫ the ~2% within-run noise. **Every keep/revert decision MUST be a
same-session interleaved A/B** (measure treatment & reference back-to-back in one
session, ideally T-H-T to bracket warm-up drift; check the calibration index is
stable). NEVER compare a fresh run to a prior-session committed baseline. Mechanism:
`git stash` the change → measure HEAD → `git stash pop` → measure treatment; or
`git checkout <commit>~1 -- <file>` for an isolated revert.

**Headroom — spawn (labels-OFF floor, cal 3.2):** N=1000 labels-OFF = 175 ms settle
/ 83 ms longest; full = 283 / 200. The ~108 ms label residual is DOM-volume/paint
bound and **proven resistant to cheap T1** (2c/2d/4 all sub-noise). The 175 ms
icon/connector/rect floor likewise needs T2 to move. **Spawn has no cheap T1
headroom left.**

**Headroom — DRAG (Iter 6 just won here):** collision-drag N=500 was 30 ms/frame
(33 fps) because ALL 478 connectors re-rendered per frame via `useColor`'s fat
`useScene()` subscription (renderProbe-confirmed; nodes were NEVER the issue — the
Iter-5 "node re-render" reading was wrong). Iter 6 made `useColor` granular →
**16.9 ms (60 fps), −45%, renders 436→7.8/frame.** The drag is now ~at budget.

**NEXT (each via same-session A/B + correctness gate + visual):**
1. **Audit other hot-path `useScene()`/`useSceneData()` over-subscriptions** — the
   SAME bug class as Iter 6. `ConnectorLabel` (renders per labelled connector; likely
   calls useColor/useScene → re-renders all per frame too), and any per-instance
   component pulling the whole scene. Use `PERF_RENDERPROBE` + extend `useRenderProbe`
   to those components. Each is a potential drag win.
2. **Re-profile the N=500 drag** (`PERF_DRAGPROFILE=500`) — it should now be layout/
   paint-bound (like N=1000 was), confirming the JS reconcile is gone. If residual JS
   remains, attribute it (the O(N) `externalOccupied` rebuild, or remaining re-renders).
3. **Cache `externalOccupied` at drag entry** (constant during a drag) — removes an
   O(N) Set rebuild/frame. Small/safe; measure if (2) shows it matters.
4. **Re-test Iter 4 icon de-emotion on the drag path** (now that connectors don't
   storm; if any per-frame `murmur2` remains it'd be connector labels, not icons).
5. **Deferred / memory-only:** icon-dedup (<5 KB/entity memory KR) + transient
   willChange. Only if the drag path stalls.

**Gotchas (carry forward):** machine must be IDLE for spawn (calibration index shows
drift); harness owns the dev server (`build:lib && dev` fresh; kill stray :3000
listeners — `Get-NetTCPConnection -LocalPort 3000` then `Stop-Process`); **`baseline.md`
is regenerated by EVERY run incl. partial `PERF_N`/`PERF_NOLABEL` — after any
diagnostic/partial run, `git checkout -- perf-results/baseline.md`**; only a clean
FULL idle run updates it. Visual drivers in `.scratch/` (`verify-labels.mjs`,
`verify-scene.mjs`) for label/scene checks; node label render is `[data-drag-id]`
count (anti-cheat: must == N). Correctness gate (must stay green):
`npx playwright test --config packages/axoview-e2e/playwright.config.ts --project=chromium drag-collision undo-redo-cross-cutting undo-redo-dual-stack multi-select-drag z-order rectangle-overlap-zorder css-preview-mid-drag rename readable-labels`.

**Open strategic question for after the next T1 levers:** once the label-subtree
residual is chased down (or stalls), the remaining floor (icons/connectors/rects =
175 ms @1000) needs T2 (Canvas2D/WebGL render — RED) for a step change. Re-decide
T1-vs-T2 with the then-current headroom.

---

## Iter 7 — T2 entry: connector-canvas prize sizing (DECISIVE NEGATIVE → pivot to nodes)

**Context:** human signed off the RED gate for T2 (Canvas2D render rewrite;
`perf-results/cold-start-t2.md`). Charter requires a written design + a measured
proof-of-concept finding BEFORE the multi-session overhaul. Design:
`perf-results/t2-design.md`. The cold-start suggested spiking the **connector layer**
to Canvas2D first as the cheapest decoupling. Before building a renderer, sized the
prize (LOOP step 7 — instrument, don't guess).

**Hypothesis:** connectors are a meaningful share of the 283 ms @1000 spawn settle,
so a connector→Canvas2D layer is a worthwhile T2 first spike.

**One variable:** scene built WITHOUT connectors (`PERF_NOCONN=1` diagnostic added
to the harness — mirrors `PERF_NOLABEL`; dormant/byte-identical when off). Spawn
only; drag already at 60 fps so not in question.

**Same-session A/B (cal 3.2 both runs — zero drift):**

| N | settle full | settle no-conn | longest full | longest no-conn | conn removed |
|---|---|---|---|---|---|
| 1000 | 283.3 | **283.3** | 200 | **200** | 968 |
| 2000 | 466.6 | **466.6** | 383.3 | **383.3** | 1955 |

**Result: removing ~968 / ~1955 connectors changed spawn by EXACTLY 0 ms.** Not
noise-masked — byte-identical at identical calibration. **→ REJECT the
connector-canvas direction.** A connector rewrite has no prize: spawn 0, drag
already at budget (Iter 6).

**🔬 Root cause (code-path confirmed):** the harness spawn commits via a raw
`model.actions.set({items, views})` (`engine-perf.spec.ts:602`), which bypasses BOTH
connector-routing paths — `changeView`→`syncScene` (sync, on load/view-switch,
`useView.ts:17`) and `computePathsAsync` (rAF-batched 25/frame, on paste,
`useSceneActions.ts:834`). With no route, `sceneStore.connectors[id].path` is empty
and every `<Connector>` early-returns `null` (`Connector.tsx:160`) → ~0 DOM/paint.
The Iter-6 renderProbe "478 connectors" counted the render *function* executing (and
returning null), not painted polylines.

**Real-app validity:** connector routing is deferred + rAF-batched even on a real
paste, so connectors never block initial scene paint; cost amortizes across
post-settle idle frames. Connectors are architecturally NOT on the spawn critical
path. The 0 is a real property, not only a harness artifact — BUT the harness ALSO
doesn't measure connector routing/paint at all (caveat below).

**Correctness gate:** N/A — no shipping-lib change this iteration (harness-only
`PERF_NOCONN` diagnostic + docs). DOM renderer untouched.

**→ PIVOT (proposed, RED — awaiting go-ahead before overhaul):** target the **node
layer**, where the spawn prize is. Connectors-off = 0 change ⇒ the 283 ms @1000 is
nodes + rects; labels-off floor = 175 ms ⇒ labels ≈ 108 ms, icons/rects ≈ 175 ms.
This is SSB-2000 territory and matches the charter. Pragmatic T2 = **hybrid**: canvas
draws icon + shape + static label text + rects (+ connectors, once routed); DOM
retained only for the selected/editing node's live label input. Folding the
connector polyline draw in afterward is trivial (same canvas + same `visibleItems`
cull). The imperative-draw + store-subscription + iso-matrix machinery in
`t2-design.md` is reused as-is; only the target layer changes.

**⚠️ HARNESS CAVEAT (load-bearing for any future connector work):** the spawn metric
does NOT route or paint connectors (bypasses both routing paths). Before ever
revisiting a connector canvas, make the harness route connectors on spawn
(`changeView`/`computePathsAsync` post-set) so the work is measured. Do not read the
0 as "connectors paint for free" — read it as "the harness spawn never paints them."

---

## COLD-START RESUME POINT — updated Iter 7 (SUPERSEDED by Iter 8 below)

**Branch `perf/engine`, HEAD = Iter 7 commit.** T2 RED gate OPEN (human signed off).
Deliverables this session: `t2-design.md` (Canvas2D design + proof metric + FINDING),
`PERF_NOCONN` harness diagnostic, this Iter-7 row. **Connector-canvas direction is
REJECTED with evidence (0 ms spawn prize, drag at budget).** Node-layer-hybrid canvas
is the PROPOSED T2 direction — **PRESENTED to the human, awaiting go-ahead** before
the multi-session overhaul begins (charter RED rule: present the finding first).

**State unchanged from Iter 6** (no shipping-lib change in Iter 7): baseline still
spawn N=1000 283/200, N=500 200/117; drag all-N ~16.7 ms 60 fps; KR3 PASS. Kept wins:
Iter 3 de-emotion (spawn), Iter 6 useColor granular subscription (drag).

**NEXT once node-layer T2 is greenlit:** node-layer Canvas2D PoC behind
`localStorage axoview-canvas-*` flag (default OFF; DOM path byte-identical). Plumb
`PERF_CANVAS=1`→localStorage in `bootApp` for same-session A/B. PoC scope: draw icon
image + static label text to canvas for all N; measure spawn settle/longest A/B at
N=1000/2000 vs DOM; correctness gate stays green with flag off; visual-verify canvas
mode via `.scratch/verify-scene`. Hybrid keeps DOM only for the editing node's label
(readable-labels counter-scale + F2 inline edit — the hard part). See `t2-design.md`
§6 + FINDING for the full plan. **Also: fix the harness to route connectors on spawn**
before measuring any connector draw (caveat above).

**Gotchas unchanged** (see Iter-6 resume point above): same-session A/B + calibration
index mandatory; `git checkout -- perf-results/baseline.md` after any partial/
diagnostic run; correctness gate command above; kill stray :3000 listeners.

---

## Iter 8 — node-layer Canvas2D PoC (DECISIVE GO → build the production hybrid)

**Context:** human greenlit the node-layer T2 direction (RED gate, see
`perf-results/cold-start-t2-poc.md`). Built the PoC: `NodesCanvas.tsx`, an
imperative draw-only `<canvas>` (icon-bitmap cache + static label `fillText`),
behind `localStorage axoview-canvas-nodes` (default OFF); `PERF_CANVAS=1` plumbs it
in `bootApp`. Design + full finding: `t2-design.md` FINDING (Iter 8).

**Hypothesis:** moving the node draw (icon image + static label) to one Canvas2D
layer with an icon-bitmap cache beats the per-node DOM subtree on spawn beyond
noise, holds drag flat.

**One variable:** the `axoview-canvas-nodes` flag (DOM `<Nodes>` vs `<NodesCanvas>`);
DOM path byte-identical when off.

**Same-session A/B — calibration index 3.1 ms BOTH runs (zero drift):**

| metric | DOM ref | canvas | Δ |
|---|---|---|---|
| spawn settle @500 | 200.0 | 133.4 | −33% |
| spawn settle @1000 | 283.4 | **166.6** | **−41% (−117 ms)** |
| spawn longest @1000 | 200.0 | **83.3** | **−58%** |
| spawn settle @2000 | 466.6 | **233.4** | **−50%** |
| spawn longest @2000 | 383.3 | 150.0 | −61% |
| long-task total @1000 | 1099 | **72** | −93% |
| drag mean @1000 / @2000 | 16.87 / 17.29 | 16.67 / 16.67 | flat (60 fps) |
| rendered DOM nodes @1000 | 1000 | 0 | shells gone |

**Result: DECISIVE GO.** Deltas ≫ the ~5% noise band at identical calibration.
Canvas scales sub-linearly (1000→2000: DOM ×1.65, canvas ×1.40). **Canvas settle
@1000 (166.6) is BELOW the DOM labels-off floor (175)** ⇒ the win is real
canvas-vs-DOM, not just dropped descriptions. **→ KEEP the PoC (flag default-off);
proceed to the production node-layer hybrid.**

**Correctness gate (flag OFF): 13/13 GREEN** — DOM path preserved (only addition is
a one-time localStorage read + a render ternary). Flag-ON gate deferred until the
editing-node DOM hybrid exists (F2 edit + readable-labels need a live DOM label).

**Visual parity:** `.scratch/verify-canvas-nodes.mjs` — icons iso-skewed on correct
tiles, labels centered above, colours correct, 0 page errors.

**Honest scope omissions (charter anti-cheat — full list in t2-design FINDING):**
PoC draws icon + static name only. Deferred to production hybrid: description
RichTextEditor (~20%), notes/link badges (~12%), the editing-node DOM hybrid, and
canvas drag-preview movement (the drag A/B measures "scene renders flat with canvas
present", not canvas drag-preview redraw). Harness note: spawn anti-cheat counts 0/N
DOM shells in canvas mode (expected; full scene still committed); drag grab fell back
to `tileToClient` and engaged 5/5.

**Deliverables committed:** `NodesCanvas.tsx`, Renderer flag wiring, `PERF_CANVAS`
harness plumbing, `.scratch/verify-canvas-nodes.mjs`, t2-design FINDING (Iter 8),
this row. Baseline.md untouched (restored after partial runs).

---

## Iter 9 — editing/dragging-node DOM hybrid (flag-ON correctness gate GREEN)

**Context:** Iter-8 PoC GO'd the node-layer canvas but deferred the flag-ON gate
(`t2-design` FINDING). Per `cold-start-t2-hybrid.md` gap #1, build the production
hybrid so the FULL correctness gate passes flag-ON. Empirical first (LOOP step 7):
added an `AXOVIEW_CANVAS_NODES=1`→localStorage bridge to the e2e fixtures (mirrors
`PERF_CANVAS`; off by default ⇒ committed gate untouched) and ran the gate flag-ON on
the Iter-8 HEAD to see EXACTLY what canvas mode breaks. Result: **10/13 pass**; only
`css-preview-mid-drag` (needs `[data-drag-id]` + `--ff-drag`) and `readable-labels`
(needs a DOM `[data-testid="node-label"]`) fail — the other drag/undo/z-order specs
assert via the debug bridge/store and are renderer-agnostic.

**Hypothesis:** rendering the *actively-manipulated* nodes (the single selected node
∪ the drag set) as DOM `<Node>` overlays — and skipping them on the canvas — passes
the flag-ON gate without measurable spawn cost (nothing is selected/dragging during
bulk spawn).

**One variable:** the canvas-mode render path gains a sparse DOM overlay
(`Renderer`: `selectedNodeId` from `itemControls` ∪ `draggingKey` from `mode.items`
while `DRAG_ITEMS` → `hybridNodes`; `NodesCanvas` gains `skipNodes`). DOM path
byte-identical when flag off. Two test-infra changes (not lib): the fixture env
bridge, and a renderer-aware `readable-labels` helper.

**Why the drag set, not just selection (root cause):** dragging an *unselected* node
never sets `itemControls` (selection-on-mousedown only fires for a click, and
`DragItems.mouseup` clears it), so a selection-only hybrid left the dragged node
canvas-only ⇒ `applyCssOffset` found no `[data-drag-id]` and `css-preview-mid-drag`
still failed (observed: 12/13). The dragged ids live in `uiState.mode.items` while
`mode==='DRAG_ITEMS'`; rendering those as DOM gives the dragged node a real
`[data-drag-id]` for `--ff-drag` — which also means the **drag preview is the DOM
compositor path for free** (gap #3 solved for the common single/multi drag; no canvas
per-frame redraw needed).

**readable-labels (honest accounting):** the spec reads `--axoview-label-scale` off
the first node-label's DOM wrapper — absent in canvas mode for an *unselected* node.
The counter-scale genuinely runs on canvas (`computeLabelCounterScale`→`ctx.scale`,
since the PoC). Rather than re-introduce N DOM labels (would erase the win — rejected)
or weaken the assertion, `NodesCanvas` now publishes the *applied* counter-scale as
`data-label-scale` on the `<canvas>` and the spec helper reads it renderer-agnostically
(DOM wrapper when present — flag-off identical; else the canvas attr). Same feature,
same value, different observation surface; documented as the anti-cheat requires.

**Same-session A/B — DOM cal 3.2 ms, canvas cal 3.1 ms (comparable; Iter-8 used 3.1):**

| metric @1000 | DOM ref (flag off) | canvas hybrid (flag on) | Δ |
|---|---|---|---|
| spawn settle | 283.3 | **166.6** | **−41%** |
| spawn longest | 200.0 | **83.3** | **−58%** |
| long-task total | 1127 | **72** | −94% |

**Result: the Iter-8 spawn win is preserved EXACTLY** (canvas settle 166.6 ms,
byte-identical to Iter-8) — the editing/dragging DOM overlay adds zero spawn cost,
as predicted (nothing selected/dragging during bulk spawn ⇒ `hybridIds` null ⇒
identical draw). **→ KEEP.**

**Correctness gate — flag-ON: 13/13 GREEN** (was 10/13: `css-preview-mid-drag` +
both `readable-labels` now pass). **Flag-OFF: 13/13 GREEN** (no regression — DOM path
byte-identical; the `readable-labels` helper reads the DOM wrapper unchanged when
present). This is the milestone the charter RED rule gates on: the canvas path now
passes the full gate flag-ON — present before making canvas default / deleting DOM.

**Deliverables committed:** `Renderer` hybrid wiring (`selectedNodeId`/`draggingKey`/
`hybridNodes`), `NodesCanvas` `skipNodes` + `data-label-scale`, `AXOVIEW_CANVAS_NODES`
fixture bridge, renderer-aware `readable-labels` helper, this row. Baseline.md restored
after partial PERF_N=1000 runs (still 283/200 @1000, flag-off byte-identical).

---

## Iter 10 — descriptions on the canvas (residual win holds; productization step 1)

**Context:** T2 productization greenlit (human: "bank T2, productize it"); ADR-0019
(canvas default substrate) + ADR-0020 (perf harness/protocol) authored. First
fidelity gap to close before the flag-flip: an unselected node with a description was
drawing only its name on the canvas (the PoC drew icon + static name; the
RichTextEditor was deferred). This is the perf-relevant content the PoC dropped (~20%
of nodes carry a description).

**Hypothesis:** drawing the description (HTML-stripped, word-wrapped, clipped to the
80px collapsed content height) below the name on the canvas restores content parity
without eroding the spawn win — because the DOM path pays the expensive RichTextEditor
for the same nodes, whereas the canvas pays cheap `ctx.fillText`.

**One variable:** `NodesCanvas` label draw now renders name (bold) + wrapped
description (regular, left-aligned in the chip), mirroring the DOM LabelStack. No
other path touched.

**Same-session A/B — DOM cal 4.7 ms ↔ canvas cal 4.6 ms (machine busier this session;
ratio is the signal, not the inflated absolutes):**

| metric @1000 | DOM ref | canvas + descriptions | Δ |
|---|---|---|---|
| spawn settle | 366.7 | **200.0** | **−45%** |
| spawn longest | 283.3 | 116.7 | −59% |
| long-task total | 1619 | 159 | −90% |

**Result: the win is intact (−45%, ≫ noise) WITH descriptions** — adding them to the
canvas did not erode it (the DOM pays RichTextEditor for the same ~20% of nodes; the
canvas pays `fillText`). The −41%→−45% shift is calibration/load, not a real gain.
**→ KEEP.**

**Correctness gate — flag-ON 13/13 GREEN** (descriptions don't affect the gated
behaviors; `readable-labels` still green via `data-label-scale`). DOM path untouched
(flag-off byte-identical).

**Honest scope:** notes/link badges are still NOT drawn on the canvas (small affordance
dots; not gate-checked; fiddly to anchor on the iso-skewed icon) — deferred to Iter 11
alongside the connector draw. Description rendering is plain-text (HTML stripped); rich
formatting (bold/lists inside a description) renders as its text content — acceptable
for the label glyph, and the full RichText still shows when the node is selected (DOM
overlay).

**Deliverables:** `NodesCanvas` description draw (`getDescriptionText`, `wrapText`,
chip re-layout), this row. Baseline.md restored after the partial PERF_N=1000 A/B.

---

## Iter 11 — flip default to canvas-only + draw-count anti-cheat (T2 banked)

**Context:** productization. ADR-0019 chose canvas as the default + sole bulk renderer
with the flag REMOVED (human: "remove flag now"). This iter executes the flip.

**Changes (one coherent step — the substrate default, not a perf tuning variable):**
- `Renderer`: removed `readCanvasNodesFlag` + the `canvasNodes` flag + the
  DOM/canvas ternary. `NodesCanvas` is now unconditional; the DOM `<Node>` overlay
  (selected ∪ drag-set, via `hybridNodes`) is the only remaining DOM node render.
- `Nodes.tsx` retained but **narrowed to the sparse overlay mapper** (0–few nodes,
  never N) — its render-order sort is reused by the overlay; deleting it would mean
  reimplementing that inline for no gain. (ADR-0019 said "delete Nodes.tsx"; the
  honest actual is "Nodes.tsx renders only the hybrid overlay" — ADR amended.)
- `NodesCanvas`: publishes a per-frame **draw count** on `data-draw-count`.
- Harness `engine-perf.spec.ts`: anti-cheat now reads `data-draw-count` (== N at
  fit-to-view) instead of the `[data-drag-id]` shell count (which reads ~0 with the
  bulk DOM path gone); removed the dead `PERF_CANVAS` push.
- `app.fixture.ts`: removed the now-dead `AXOVIEW_CANVAS_NODES` gate bridge — the
  e2e gate runs canvas unconditionally.

**Verification (canvas is now the ONLY path — no flag, no env var):**
- **e2e correctness gate: 13/13 GREEN** (`drag-collision`, both `undo-redo`,
  `multi-select-drag`, `z-order`, `rectangle-overlap-zorder`, `css-preview-mid-drag`,
  `rename`, `readable-labels`).
- **lib unit suite: 1110 passed / 105 suites** (1 skipped) — no regression.
- **perf (canvas default, cal 3.4 ms vs the committed DOM baseline 283 @cal 3.2 —
  comparable):** spawn settle @1000 = **166.7 ms (−41%)**, longest 83.3, long-task 79,
  noise 4.4%. **Anti-cheat: `rendered=1000/1000`** (draw count == N) — the canvas
  paints every node, no cull cheat. scene[conn=968 rect=49] committed.

**→ T2 BANKED.** Canvas is the production node renderer.

**Deferred, documented (NOT silent — charter anti-cheat):**
- **notes/link badges** are not drawn on the canvas yet (small affordance dots; not
  gate-checked; pixel-accurate placement on the iso-skewed icon needs a
  screenshot-driven pass). They still appear when a node is selected/dragged (DOM
  overlay). Tracked for a follow-up.
- **connectors** stay on the tested DOM/SVG layer — Iter-7 proved they carry no spawn
  prize and are rAF-batched on real paste; moving them to canvas is unmeasured scope
  (would first need the harness to route connectors on spawn). Not a bottleneck.

**Deliverables:** `Renderer.tsx`, `Nodes.tsx`, `NodesCanvas.tsx`, `engine-perf.spec.ts`,
`app.fixture.ts`, this row. baseline.md restored after the partial PERF_N=1000 run (a
full canvas baseline refresh is queued for the /notes step).

---

## ▶ COLD-START RESUME POINT (newest — start here) — updated Iter 11

**Branch `perf/engine`, HEAD = Iter 11 commit.** **T2 IS BANKED — Canvas2D is the
production node renderer**, default and unconditional (the flag is gone). Productizing
per the `/feature` lifecycle (docs/workflow.md). ADR-0019 (canvas default substrate) +
ADR-0020 (perf harness/protocol) authored + committed. Iter 10 folded descriptions onto
the canvas; **Iter 11 flipped the default, removed the flag + the bulk DOM path, and
added the draw-count anti-cheat.** Verified canvas-only: e2e gate 13/13, lib unit 1110
passed, perf settle @1000 166.7 ms (−41% vs DOM 283), `rendered=1000/1000`.

**State:** Kept wins through Iter 9 + Iter 10 (descriptions) + **Iter 11 (canvas
default, flag removed, anti-cheat)**. The node renderer is `NodesCanvas` for the bulk;
`Nodes.tsx` is now ONLY the sparse hybrid overlay (selected ∪ drag-set); `Node.tsx`
retained. baseline.md still shows the old DOM numbers (283/200) — **refresh it to a full
canvas baseline in the /notes step** (it is now the shipping renderer).

**NEXT (productization tail — getting to the master PR):**
1. **Update ADR-0019** to the actuals (Nodes.tsx retained as overlay mapper, not
   deleted; badges + connector-on-canvas deferred as documented gaps).
2. **/notes** — CHANGELOG, architecture.md (canvas node layer), docs/testing.md perf
   section (the `npm run perf` how-to per ADR-0020), known_issues (badges/connectors
   deferred). Refresh baseline.md with a FULL canvas run.
3. **/feature wrap** — retire the charter tactical + `cold-start-t2*.md`; add the
   PLAN.md line → ADR-0019/0020 (the durable content now lives in the ADRs).
4. **/ship** — PR perf/engine → integration → master; **ping the user at the master PR**
   (they review `integration` manually).

**Deferred (documented gaps, not silent):** notes/link badges on canvas (appear on
selection via the DOM overlay; need a screenshot-driven placement pass); connectors stay
DOM/SVG (Iter-7: no spawn prize; not a bottleneck).

**Gotchas:** same-session A/B + stable calibration index mandatory; `git checkout --
perf-results/baseline.md` after any partial/diagnostic run; **the dev server desyncs from
`dist/` after `build:lib` ("Can't resolve 'axoview'") — let `npm run perf` own the
lifecycle (no `PERF_REUSE` against a hand-started server)**; kill stray :3000 listeners.
The correctness gate now runs canvas unconditionally (no env var): `npx playwright test
--config packages/axoview-e2e/playwright.config.ts --project=chromium drag-collision
undo-redo-cross-cutting undo-redo-dual-stack multi-select-drag z-order
rectangle-overlap-zorder css-preview-mid-drag rename readable-labels`.

---

## 🟢 canvas-ux-overhaul T3 — LayersPanel selection re-render (KEPT; separate track, ADR 0020 protocol)

Different initiative from the engine-perf Iters above (canvas-ux-overhaul, not T1/T2 node render),
but reuses the ADR 0020 discipline. Selecting a row in the LayersPanel lagged at high item counts.
This is a **click→select/open latency** (a discrete-event re-render), NOT the frame harness — measured
with a dedicated same-session A/B (`.scratch/measure-layers-click.mjs`, throwaway/gitignored).

**🔬 Diagnosis (code + render-count probe).** `LayerItemRow` is already `memo()`-wrapped, but the memo
was **defeated**: `handleItemClick` (the `onClick` prop on every row) churned identity on every
selection because its `useCallback` dep `applyCtrlToggleSelect` depends on `itemControls`/`mode`
(both change on select). New `onClick` identity → shallow-prop compare fails for ALL rows → every row
re-renders per selection. Proven with a throwaway counter in `LayerItemRow` (`window.__layerRowRenders`):
**1000 renders/click at N=1000** (machine-independent). The `LayerItem` objects are stable on selection
(`useLayerContext`'s memo deps exclude itemControls/mode), so the sole defect was callback identity —
the "memoized but highlight not decoupled" case.

**Hypothesis:** read the churny closures from a ref so `handleItemClick` is identity-stable (empty deps),
and memoize `sortedLayers`, so a selection re-renders only the two rows whose `isSelected` flips, not N.
("memoize AND decouple the highlight" path — virtualization unneeded; lower ripple on the heterogeneous
drag-enabled tree.)

**One variable:** `LayersPanel.tsx` only (latest-closures ref for `handleItemClick` + `sortedLayers`
useMemo). `LayerItemRow` untouched (already memoized). Zero behavior change.

**Same-session A/B (N=1000, median-of-20, calibration-matched):**

| metric | HEAD | fix |
|---|---|---|
| **renders/click** (machine-independent) | **1000** | **2** |
| longest click frame @cal 34.5 (HEAD) / 36.2 (fix) | **2866 ms** | **33 ms** |
| normalized longest (frame ÷ cal) | 83.1 | 0.92 (**~90×**) |
| rows in DOM (anti-cheat) | 1000 | 1000 |
| selectionChanged | true | true |

Render count 1000→2 is the decisive machine-independent proof. At matched cal (~35, a thermally-
throttled session) the longest click frame drops **2866→33 ms (~86×)**; the fix holds a 33 ms (2-vsync,
sub-perceptible) frame at EVERY calibration (cal 3.2–36) while HEAD freezes ~2.9 s @cal 35
(≈287 ms normalized to a cold cal-3.4 machine — a clearly perceptible lag). Gain ≫ drift. **→ KEEP.**

**KR4 — canvas spawn unaffected (separate, conditionally-mounted tree).** LayersPanel mounts only when
`activeLeftTab==='LAYERS'`; the spawn harness never sets it, so the panel's code never executes during
spawn (structural). Empirically the A/B's panel-closed canvas spawn held **draw-count = 1000** both
sides; settle tracked calibration only (83 ms @cal 3.5 fix == 83 ms @cal 3.4 cold-HEAD). No leak.

**Correctness / anti-cheat (the list must still render the right rows and stay interactive):**
jest **1128 passed / 1 skipped / 109 suites**; E2E `layers.spec.ts` 2/2 (drag-to-layer + hide + lock);
walkthrough at N=1000 **StrictMode ON** (no perf flag — stress-tests the ref-during-render): SELECT
(unassigned + row #700/1000), EXPAND renders all 1000 (4→1004), COLLAPSE (→4), item rename (dblclick),
F2 layer-rename — all green, **zero page errors**. Anti-cheat: `rowCount==1000` in the DOM before &
after (no virtualization cheat — every row rendered) and `selectionChanged==true`. Both libs build clean.

**Methodology note:** measured in a thermally-throttled session — the calibration index swung 3.2↔36
and **correctly flagged** that cold cal-3.4 HEAD and warm cal-35 runs aren't directly comparable, so the
keep rests on (a) the machine-independent render count 1000→2 and (b) the matched-cal (~35) longest-frame
2866→33 ms. `baseline.md` untouched (the latency harness never writes it; the one stray `npm run perf`
that rebuilt lib mid-flight was aborted before any write). Diagnostic counter + `.scratch/` harness
removed/gitignored; the shipped diff is `LayersPanel.tsx` only.

---

## 🟢 Track P — Canvas-UX-overhaul performance-validation gate (ADR 0020)

The final gate for the whole canvas-ux-overhaul program (T1–T9, all shipped to `integration`).
This is measurement + proof, not new features. **Same-session A/B, matched calibration index:**
program-tip **`1a508c2`** (T8) vs the pre-program commit **`5153c9e`** (the engine-perf tip the program
branched from), swapping ONLY `axoview-lib/src` + `axoview-app/src` between the two (the `perf/` harness
did NOT change during the program, so the ruler is constant; no build-config/deps changed either). Both
A/B sides ran at **calibration 3.2 ms** (cold/idle) → directly comparable, no drift confound.

**Harness diagnostics added (gated, dormant-when-off — byte-identical default run):** `PERF_OFFSET=1`
(every node off-grid: `offset` + `collides:false` — the T8 all-offset hypothesis), `PERF_BLOAT=N`
(maximally-loaded scene — the HTML-bloat stress), and a `PERF_LABELDRAG=N` mode (the T6 per-frame
label-drag cost). Load-bearing threshold refined `N≥100 → N≥200` (documented in-code): a 15-repeat noise
probe showed spawn-settle at N=100 is structurally bimodal 83↔117 ms (±1 idle frame → ~16% CoV that does
NOT shrink with repeats — the same vsync-quantization floor the log documents for N≤50). N≥200 resolves
cleanly.

### KR1 noise band — CERTIFIED (load-bearing)

15-repeat characterization, then the 12-repeat A/B + final baseline: **load-bearing range (spawn N≥200 +
all drag) worst CoV ≈ 6–9% < 10%** (N=200 6.7%, N=500 3.8%, N=1000 0%, all drag <1.5%). Small-N spawn
(N≤100) flutters ~16% at the ±1-frame quantization floor (sub-120 ms operations, already smooth, not a
target — reported transparently, excluded from the gate per the refined threshold). KR1 met.

### A/B headline — SPAWN fully neutral (the bulk-render budget held)

Matched cal 3.2, tip vs pre, median-of-12:

| N | spawn settle tip→pre | spawn commit tip→pre | drag mean tip→pre |
|---|---|---|---|
| 200 | 125 → 116.7 (within quant) | 26.4 → 28.2 | 16.87 → 16.87 (0%) |
| 500 | 150 → 150 (**0**) | 122.8 → 122.9 (**0**) | 30.1 → 26.1 (**+14%** ⚠) |
| 1000 | 183.3 → 183.4 (**0**) | 495.1 → 489.6 (**0**) | 70.3 → 68.5 (+2.7%) |

**Spawn is neutral at every N** — settle + commit byte-equal tip vs pre. The 495 ms synchronous commit
@1000 (the 968-connector `changeView`/`syncScene` routing) is **pre-existing** (489.6 ms pre-program),
not a program regression. This single result discharges several hypotheses at once (below).

### Hypotheses (the tactical "Pointed hypotheses" table — one row each)

- **T1+T4 event-routing / hotkey collapse → NEUTRAL ✅.** Spawn/drag/idle A/B neutral; event routing
  doesn't touch the frame budget (no per-frame work added). Confirmed.
- **T2 lasso intersection (#16) → NEUTRAL ✅.** Code-level: `doBoundsOverlap` is allocation-free (8 locals,
  no object/array per call); rectangle + textbox branches add only comparisons; the connector branch builds
  its id→tile Map **once per call** (SPATIAL-3), not per anchor. The standing `lasso.bulkPerf.test.ts`
  (1000 nodes + 400 connectors, 20 marquee frames) is GREEN in the lib suite. Falsifier (per-frame
  allocation in `getItemsInBounds`) provably absent.
- **T3 layers panel (#14) → VALIDATED (already KEPT `c875b652`).** The gate's job here was only to
  re-confirm **canvas spawn stays flat** (the panel is a separate, conditionally-mounted tree) — the spawn
  A/B is byte-identical tip vs pre, draw-count = N. Latency win (1000→2 renders/click) already in the log.
- **T6 label drag (#3) → ⚠️ REGRESSION (the one real finding — see below).** Predicted neutral
  (CSS-preview); the implementation diverges (per-frame model write). Falsifier triggered.
- **T7 rectangle edge handles (#11) → NEUTRAL ✅.** `TransformControls` renders the 8 anchors (memoised over
  the 4 corners) only for the **one selected** rectangle; it never mounts during spawn (nothing selected) →
  spawn A/B flat is the empirical backstop. No scaling with N. Confirmed.
- **T8 offset render — zero-offset common case → NEUTRAL ✅.** `node.offset ? {…} : base`
  ([NodesCanvas.tsx:412]) and `resolvePlacement → {tile}` are guarded no-op branches. Spawn A/B
  byte-identical (the offset-read branch costs nothing when absent). Confirmed.
- **T8 offset render — all-N offset + `collides:false` → NEUTRAL-to-slight-gain ✅.** `PERF_OFFSET=1`
  (cal 3.1) vs off (cal 3.2): spawn settle **150/183 byte-identical** (the per-node transform compose is
  free), drag @500 29.79 (on) ≈ 30.1 (off), @1000 71.1 ≈ 70.3 — neutral, with the predicted hint of
  slight-gain from the empty `TileIndex` (all `collides:false` → `buildExternalOccupied` skips them → no
  obstacles). Falsifier (extra React work per offset node) absent — it's a pure transform compose.

### ⚠️ Drag (node collision-drag) @N=500 — +14%, ACCEPTED with rationale

Not a listed hypothesis, but T8 touched the drag-preview path, so the gate measured it. **Reproducible:**
tip ~29.7 ms (3 runs: 29.69/29.37/30.1) vs pre ~26.1 ms (2 runs: 25.83/26.46), matched cal 3.2 — a real
~3.6 ms/frame, +14%, concentrated at N=500 (N=200 = 0, N=1000 = +2.7%). **Instrumented three ways
(not re-read):**
1. **renderProbe → IDENTICAL** (Connector ≈7.8/frame, 628 renders, byte-for-byte on both trees) — the
   Iter-6 useColor fix holds; this is **NOT** a re-render storm.
2. **PERF_DRAGPROFILE → cost is the lib per-frame drag arrow** (`index.js:17229`, ~3.9 ms/frame); all
   expected work (canvas+connector reconcile, emotion, the lib arrow), **no new hot function**.
3. **Code-diff → the canvas is static during a drag** (only the dragged node's DOM overlay + connectors
   move); the only per-frame additions are the **ADR-0023 off-grid drag-preview machinery** (snap/offset
   lockstep — runs every frame to keep the CSS preview and the committed `offset` exact) + two negligible
   O(N) `scene.items.find` (single-node).

**Verdict: ACCEPT.** Bounded feature compute (off-grid drag-preview is the ADR-0023 capability's irreducible
per-frame cost), small (~3.6 ms), on a path **already well over the 16.6 ms budget pre-program** (~26 ms /
33 fps — the 500-connected-node collision-drag-through-occupied-tiles is a known-heavy JS-bound path, never
60 fps for this scene; Iter 5/6). **Latent follow-up (flagged, not the cause here):** the O(N)
`scene.items.find` in `computeNodeUpdates` + `applyNodePreview` is the SPATIAL anti-pattern — negligible
for single/few-item drags but O(M·N) for an M-item multi-drag; the harness can't validate a fix (single-node
scene), so it's logged for a future iteration with its own multi-drag measurement, not bundled here.

### ⚠️ T6 label drag — REGRESSION at scale, FLAGGED FOR FIX

`PERF_LABELDRAG=1000`, real `NodeLabelHitLayer` path, engaged + moved (anti-cheat — the per-frame writes
actually changed `labelHeight`): **mean frame 103 ms (~10 fps), p95 150 ms**, drawn(visible)=1000.
Mechanism: dragging an **unselected** node's label writes the model **every pointermove**
([NodeLabelHitLayer.tsx:108], `updateViewItem({labelHeight})` in one undo transaction) → a **full canvas
redraw of all visible nodes every frame**. This is the hypothesis's stated falsifier ("a per-frame model
write during label drag would regress drag p95 — must not happen") and a **divergence from ADR-0024's
predicted CSS-preview design**. Holds 60 fps only up to ~160 visible nodes (redraw ≈ visible × 0.1 ms);
~103 ms at 1000. (The *selected*-node label drag is fine — `Label.tsx`'s `reposition` is already pure
CSS-preview, "never touches the model"; only the unselected-label direct-drag shortcut takes the slow path.)

**This is reducible and not small → does not qualify for accept-with-rationale → FLAGGED FOR FIX.**
Recommended fix (a focused T6 follow-up, not a perf-gate side-quest — the canvas→DOM pointer-capture handoff
has visual-correctness risk the perf specs don't cover): on label-drag start, promote the dragged node into
the DOM hybrid overlay (`hybridIds`) and reuse `Label.tsx`'s existing CSS-preview `reposition` (commit
`labelHeight` once on drop), so no per-frame model write / canvas redraw occurs. Related: `NodeLabelHitLayer`
emits **one DOM div per visible labelled node** at zoom ≥ 0.4 (1000 divs @ N=1000) — a DOM vector the same
fix (or a cursor-proximity cap) should also address.

**🟢 FIX (implemented + verified, this session).** Routed the unselected-label drag through a
transient UI-only `uiState.labelDrag = {id, height}` channel: on drag-start past slop the node is
promoted into the DOM overlay (`Renderer.hybridIds`) and the live offset is pushed to `labelDrag` each
frame — so the label follows the pointer as a **single-node DOM re-render**, with **no per-frame model
write and no canvas redraw**; the model `labelHeight` is written **once on release** (one undo). Files:
`types/ui.ts`, `uiStateStore.tsx` (field + `setLabelDrag`/`clearLabelDrag`), `Renderer.tsx`
(`labelDragId` ∈ hybridIds), `Node.tsx` (`labelDragHeight` selector — only the dragged node re-renders),
`NodeLabelHitLayer.tsx` (transient preview + single commit; drag-transaction dropped). **Result
(PERF_LABELDRAG=1000): mean frame 103 → 17.5 ms (p95 16.75 = 60 fps), ~6×** — the single `max=83 ms`
frame is the one-time promote/commit redraw, vs the old 103 ms EVERY frame. Zero effect on the
spawn/drag baseline (`labelDrag` is null except during a label drag; `NodeContent` mounts only for the
0-few overlay nodes). **Correctness: `label-drag.spec` 2/2** (incl. the real-mouse *unselected*-label
drag — position-below + persists-across-reload + one-undo + selection-unchanged), `readable-labels`,
`css-preview-mid-drag`, `canvas-node-render` green; lib unit green; the one e2e fail stays the
pre-existing machine-specific `z-order` click. **→ KEEP. T6 regression resolved.**

### HTML/DOM-bloat stress (user request) — canvas scales beautifully

`PERF_BLOAT=1000`: every node carries a rich/formatted description + notes + header-link + link; isometric
icons from 3 packs; 968 **labelled** connectors; 49 grouping rectangles; 8 layers. Report in
`perf-results/bloat-1000.md`. Findings:
- **Canvas spawn is content-agnostic:** commit 492 / settle 167 / longest 83 ms — **identical** to the plain
  scene. The canvas draws icon + name + HTML-stripped description; notes/links are heap-only (not painted for
  unselected nodes). So "huge richly-annotated diagrams" spawn at the same cost as plain ones. draw-count
  **1000/1000** (anti-cheat — every node painted, multi-pack iso icons included).
- **DOM stays node-free; bloat is connectors:** total document ≈ **11,547 elements** at 1000 nodes, almost
  all from the **968 DOM/SVG connectors** (paths + labels). The canvas nodes emit **0 per-node DOM**;
  `[data-drag-id]` shells = 49 (the rectangles, not nodes). At fit-to-view (zoom < 0.4) the T6 label-hit
  layer is inactive (0 divs); it only emits N divs at zoom ≥ 0.4.
- **Heap per entity << 5 KB** (guardrail PASS): the full 2017-entity scene's heap delta is below
  `performance.memory`'s ~MB resolution (≈0). Rich per-node content is cheap.

The one scale lever the bloat test surfaces for the future: the **connector DOM/SVG layer** (not nodes) is
what grows the DOM — folding it onto the canvas (Iter-7 deferred it: 0 spawn prize, but it IS the DOM-volume
driver at scale) is the remaining headroom.

### Guardrails + anti-cheat

- **KR3 idle — PASS** (every run): 60 s @ 0 entities, heap flat (0 MB / 0% retained after GC), 0 long tasks.
- **mem/entity < 5 KB — PASS** (bloat test, above).
- **bulk-spawn 1000 / 1000-paste** longest frame ≈ 83 ms (the canvas bulk-draw / paste commit) — over the
  literal "no frame > 50 ms" bar, but **pre-existing** (the engine-perf program already drove the bulk-draw
  633 → 83 ms and banked it; the A/B shows the canvas-ux program did **not** regress it — spawn commit/settle
  byte-identical tip vs pre). Sustained state is 60 fps; only the one unavoidable bulk-commit frame dips.
  Documented, not a program regression.
- **Anti-cheat (correctness suite) — effectively GREEN, zero program regressions.** lib unit **1187 passed /
  1 skipped / 115 suites** (incl. `lasso.bulkPerf`, `resolvePlacement`, `labelPosition`, `renderTarget`,
  `TransformRectangle` edge-axis, `spatialIndex`). e2e gate: program-tip **14 passed / 1 failed** and
  pre-program **14 passed / 1 failed — IDENTICAL**. The single failure (`z-order` Ctrl+]/Ctrl+[: a synthetic
  `clickAt` not registering `itemControls` on this Windows+Chromium box) **fails identically on the
  pre-program baseline**, so it is **pre-existing / machine-specific, not a program regression** (verified by
  running the same spec on `5153c9e`). Renderer draw-count = N on every spawn/bloat cell.

### Gate verdict

The canvas-ux-overhaul program **held the engine performance budget**: spawn (the bulk-render north-star) is
**fully neutral** tip-vs-pre at every N; the predicted-neutral interaction paths (T1/T4 routing, T2 lasso,
T7 handles, T8 zero- and all-offset render) are confirmed neutral; guardrails green; the canvas scales
content-agnostically to 1000 richly-loaded elements; and the correctness anti-cheat shows **zero program
regressions**. **Two drag-path findings:** (1) node collision-drag @500 +14% — **accepted** (instrumented;
bounded off-grid-preview compute on an already-over-budget path); (2) **T6 unselected-label drag** — a real
regression at scale (per-frame model write vs ADR-0024's CSS-preview design) — **FIXED** this session
(transient `labelDrag` overlay-promotion + single commit on drop; label-drag @1000 visible
**103 → 17.5 ms/frame, 60 fps**; label-drag spec 2/2 + lib/e2e anti-cheat green). **The program is GREEN.**

---

## ▶ COLD-START RESUME POINT (newest — 2026-06-25) — SUPERSEDES the Iter-11 resume point

**The Iter-11 resume point above is obsolete.** T1 + T2 (and the canvas-UX Track-P gate) are
**merged to master**; the engine has kept evolving since. Current branch:
`fix/large-diagram-pan-perf` (HEAD `3cf76c08`). This resume point reconciles the plan with
what actually shipped and records the **2026-06-25 strategic decision**.

### Where the program actually stands (vs the frozen charter)

- **T1 + T2 BANKED, merged to master.** `NodesCanvas` is the unconditional bulk node
  renderer; canvas-UX Track P proved spawn neutral tip-vs-pre. Tier ladder T0→T2 done.
- **Stale charter doc state — now fixed.** The charter header named branch `perf/engine`
  and clone `C:\myTemp\axoview_perf`; corrected to `c:\myTemp\FossFLOW` /
  `fix/large-diagram-pan-perf`. Tier ladder annotated (T2 ✅, T2.5 active, T3/T4 deferred).
- **🔴 NEW sub-track the charter never modeled: large-diagram PAN (T2.5 / R1).** The whole
  program measured *spawn* + *drag* — **never pan**, and **the harness has no pan scenario.**
  Shipped on this branch: **#54** synchronous canvas repaint (killed the canvas-trails-DOM
  rubber-band that appeared once canvas became the bulk renderer) and **`3cf76c08`**
  decoupled viewport culling from the pan frame (removed per-tile-crossing reconcile + O(N)
  visible-array churn; Grid reads RO-tracked size instead of per-frame `getBoundingClientRect`).
  **OPEN — R1** ([`known_issues.md`](../known_issues.md)): the per-frame *synchronous* canvas
  repaint floor — ~24–55 fps AC, **~6–8 fps CPU-throttled** on a ~54-node scene. Fix =
  dirty-region / layered redraw **or** sync-small/async-large hybrid (the latter risks
  reintroducing the #54 rubber-band on exactly the large scenes that show the symptom).
- **Connectors still DOM/SVG** (confirmed by `3cf76c08`, whose stabilization exists so
  "Connectors/ConnectorLabels memo-bail"). The ~968 SVG paths are ~most of the ~11.5k DOM
  elements at N=1000 — the documented remaining Canvas2D headroom (Iter 7 / bloat-1000).

### 🔭 DECISION 2026-06-25 — continue evolving Canvas2D; NO engine rewrite (T3/T4 deferred)

A full **isoflow-fork engine rewrite** (replace the engine with a WebGL/ECS substrate behind
the feature contract) was evaluated in depth (engine-architecture map + feature/UI-contract
inventory + test-landscape audit + a 3-stance design panel + adversarial stress-test) and
**declined for now.** Rationale (all evidence-backed):

1. **The only forcing function is unratified.** WebGL/ECS (T4/T3) is justified *only* by
   LEB60 — the moving-entity "kids' tile-world sim." That mandate exists in **exactly one
   place**, the charter's `T3 KRs` line — not in any vision doc, ADR, or product register;
   the deferred-features register is empty of it; every technical review frames Axoview as a
   *static diagram editor*. The WebGL trigger is **predicted, never measured.**
2. **No clean engine to extract.** "The engine" is woven through React hooks, three
   Context-scoped Zustand stores, and a MUI theme that reaches into the canvas paint loop
   (`NodesCanvas` reads the live theme for chip parity with the DOM hybrid). The render seam
   **doesn't exist yet** (`Renderer.tsx` mounts `NodesCanvas` directly). Dual hand-synced
   projection (`isoMath` vs `coordinateTransforms`, ~20 files); two dense tangles
   (`useSceneActions` 1050 LOC, `useInteractionManager` 1631 LOC incl. a ~450-line touch/pen
   state machine).
3. **The test net can't gate a render rewrite.** ~88% of e2e asserts *state*, not *pixels*;
   there is **no visual-regression baseline.** A rewrite could pass every green gate and ship
   a visibly broken isometric canvas — label counter-scale, signed-stalk geometry, off-grid
   offset-after-projection, edge-handle projection, annotation iso↔2D freeze are all
   `[ENGINE]` behaviors **not held by store shapes.**
4. **Cost vs payoff.** Realistic full-rewrite estimate ~40–60 focused sessions just to
   *re-reach* today's contract before any new capability, starving the committed roadmap
   (parked at Phase 3A). Canvas2D is sub-linear + content-agnostic to ~2,000 nodes
   (bloat-1000), heap <5 KB/entity — plenty of road for a diagram editor.

**T3/T4 reopen only when (a) the sim product is ratified AND (b) a tick-workload harness
measures a real Canvas2D ceiling** (the charter RED gate — a *measured* PoC, not a forecast).

### NEXT (no-regret work, valid regardless of the eventual T3/T4 call)

1. **Build the missing harness coverage:** a `measurePan` scenario **and** the Phase-0.5
   tick-workload harness (N entities moving 1 tile/tick + collision). These gate everything
   downstream and don't exist. Reuse the ADR-0020 protocol (same-session interleaved A/B,
   calibration index). Prereq for pan: a **large-N** `NodesCanvas.scrollSync` guard variant
   (the current guard renders `nodes={[]}` — a false-safe that would stay green while real
   scenes regress).
2. **Close R1** — dirty-region / layered redraw (the cheap per-node string-normalization
   lever is dead: drag CPU profiles show ~0 self-time there; the cost is the canvas draw
   calls). This is the binding pan bottleneck on the current branch.
3. **Fold connectors onto the canvas** — the real remaining Canvas2D headroom. **Prereq
   (harness honesty):** the bulk `model.set` spawn path **bypasses connector routing**
   (`syncScene`/`computePathsAsync`), so connectors currently render null and are measured as
   *free* (Iter-7 caveat). Fix the harness to route connectors on spawn BEFORE trusting any
   before/after fold measurement — it may reveal A* routing as a real, never-measured cost.
   Budget honestly: connector *labels* (inline rename, link affordances) + 3 line-types with
   arrows are the hard 80%, not a 2-session geometry port.

**Gotchas unchanged:** same-session interleaved A/B + stable calibration index mandatory
(cross-session drift ~9–22% ≫ within-run ~2%); `git checkout -- perf-results/baseline.md`
after any partial/diagnostic run; let `npm run perf` own the dev-server lifecycle; kill stray
:3000 listeners. Correctness gate: `npx playwright test --config
packages/axoview-e2e/playwright.config.ts --project=chromium drag-collision
undo-redo-cross-cutting undo-redo-dual-stack multi-select-drag z-order
rectangle-overlap-zorder css-preview-mid-drag rename readable-labels`.

---

## 🟡 T4 — WebGL INSTANCING (2026-07-07): node/label O(N)→O(1) pan & drag to 20,000 nodes

**Context / authorization.** The 2026-06-25 decision DEFERRED T4 (WebGL) as a RED gate.
**The owner re-opened it this session** ("we just did a webgl rewrite… do an optimistic/
heroic rewrite… run perf tests… resolve until a wall or marginal returns") — explicit
authorization to cross the gate. The prior session committed a WebGL2 **per-quad** spike
(`glCompositor`, `b2318c6`) that moved compositing to the GPU but left the **big perf win
deferred**: it re-emitted every quad's device corners on the CPU per frame, re-uploaded a
vertex buffer per frame, and (because every chip is a unique content-keyed texture) flushed
**one draw call per node** → pan/zoom O(N) on the CPU. This session finished it. Full report:
[`perf-results/webgl-instancing.md`](webgl-instancing.md).

### 🛠 Harness-fidelity fix FIRST (load-bearing — the whole measurement was software)

Headless Playwright renders WebGL2 on **SwiftShader (a CPU software rasteriser)**, verified
`UNMASKED_RENDERER_WEBGL = "…SwiftShader Device…"`. All prior WebGL-spike frame numbers were
software fill-rate bound (flat in N ~54 ms), NOT the real wall — the same class of
unrepresentative-measurement trap as the Iter-0 StrictMode/diagnostics fixes.
- `perf.config.ts`: force the real GPU headless (`--ignore-gpu-blocklist
  --enable-gpu-rasterization --use-angle=d3d11` → `ANGLE (Intel UHD, D3D11)`).
  `PERF_SWIFTSHADER=1` to measure software deliberately.
- `bootApp`: logs the live WebGL renderer every run (a permanent guard against silent
  SwiftShader regression). **All numbers below are the real GPU.**

### Hypothesis + one variable

Instancing the node/label draw (GPU-side transform + a texture atlas; geometry uploaded ONCE
per scene change) makes pan/drag O(1) in N. **Variable:** `glCompositor` (per-quad, per-frame
CPU emit + per-node draw call) → **`glSpriteBatch`** (instanced, single mipmapped atlas, one
`drawArraysInstanced`, vertex-shader transform; anchor + local basis vectors that bake the iso
shear + counter-scale flag, `gl_VertexID` unit quad). `NodesCanvas`/`LabelsCanvas` rewired;
`buildInstances` (O(N) CPU) runs only on a scene change, never on navigation. Canvas2D
fallback kept verbatim.

### Result — same-session A/B, real GPU, matched cal (ref 3.4 / instanced 3.2–3.4)

**PAN** (`measurePan`, per-frame repaint):

| N | ref per-quad (node+conn) | instanced node canvas (NOCONN) |
|---|---|---|
| 1000 | 17.7 mean / p95 33.2 | 18.1 mean / **p95 16.8** |
| 2000 | 22.3 | **16.67** |
| 5000 | 44.8 | **16.67** |
| 10000 | **102.1** (longtask 7543) | **16.67** (longtask 0) |
| 20000 | (≈200+, off the wall) | **16.67** (p95 16.71, 0% noise) |

→ **Node canvas pan is now perfectly FLAT at 16.67 ms = locked 60 fps, O(1) in N, zero
long-tasks, to 20,000 nodes.** At N=10000: **102 → 16.7 ms = 6.1×.** draw-count = N every
cell (anti-cheat: every node painted, no cull). Gain ≫ drift.

**DRAG** flat **16.67 ms (60 fps) to 20,000** (instancing made the per-frame drag redraw O(1)
too; dragged node stays a DOM hybrid). **SPAWN** settle plateaus **~117 ms even at 20,000**
(one-time `buildInstances` + first draw; commit 11 ms) — a brief load blip, not the old
multi-second freeze.

### Verdict: 🟢 KEEP — decisive, clean, verified.

- `tsc` clean · lib build clean · **unit 1483 passed / 1 skipped**.
- **Visual parity** (real-GPU screenshots): icons on tiles, iso-shear on non-iso icons, iso
  cubes upright, chips above with bold/italic/strike/underline/link-blue/colour, dotted
  stalks, correct back-to-front painter's order; LOD @zoom0.14 icons-only, clean mipmapped
  minification (no atlas bleed).
- **e2e correctness gate: 19 passed / 0 failed** (drag-collision, both undo-redo,
  multi-select-drag, z-order, rectangle-overlap-zorder, css-preview-mid-drag, rename,
  readable-labels, **import-export-image** — WebGL image export via `preserveDrawingBuffer`
  works).

### 🔬 Finding — the NEXT WALL is the DOM/SVG connector layer (confirmed, NOT resolved)

WITH connectors, high-N pan is bound by the **connector subsystem, not the node canvas**:
the isolated node canvas contributes only 16.67 ms, so the ~44 ms @5k (ref AND instanced,
with connectors) is **~100 % the DOM/SVG connectors** re-compositing on the CSS pan transform.
This is exactly the "remaining Canvas2D headroom" the 2026-06-25 decision named. Resolving it
= folding connector LINES onto the GPU (`glSpriteBatch`'s anchor+basis form draws line-segment
quads trivially) — **but connectors are a heavily-productized, tested layer** (halo + core +
arrow + double/dashed/dotted + degenerate-dot + unroutable + selection halo + labels + anchor
overlay; e2e asserts on `data-testid=connector-path` DOM). A full fold is a **large,
fidelity-risky, multi-session effort → RED gate: present a written design + measured PoC
before overhauling** (charter rule). Sized here with the prize measured (the entire high-N pan
delta); **held for owner go-ahead** rather than an autonomous overnight rewrite.

### 🐛 Atlas robustness fix (caught in review — the 16-node screenshot was too small)

The first 4096² atlas held ~950 distinct chips; the fit-to-view harness at **N=1000, LOD labels
ON draws ~1000 chips at once** → overflow → the reset-and-retry **thrashed and could strand
already-packed sprites (silently missing/garbled chips)**. Real scenes never hit it (viewport
culling caps simultaneous chips at ~hundreds), but it's a correctness risk. Fixed: **8192²**
atlas (~3–4 k chips), packer **never resets mid-build** (overflow chip skipped one build; atlas
**compacts at next `beginInstances()`**; stalk-dot region **reserved** so its UV survives).
**Verified: a 900-unique-chip readable scene renders every chip** (drawCount 900, labelsDrawn
900; the old 4096² dropped ~50+). Node spawn stays cheap: NOCONN settle N=500 100 ms / N=1000
83 ms (the WITH-conn N=1000 ≈633 ms is the pre-existing connector-routing commit, not nodes).

### Deliverables (integration, uncommitted working tree)

`webgl/glSpriteBatch.ts` (new), `NodesCanvas.tsx` + `LabelsCanvas.tsx` (rewired), harness GPU
flags + renderer log (`perf.config.ts`, `engine-perf.spec.ts`), `perf-results/webgl-instancing.md`,
this row. **Dead per-quad path removed** (`glCompositor.ts` deleted, `itemRaster.makeDotCanvas`
removed — the batch has its own dot). Verified end-to-end: tsc, unit 1483, e2e gate 19/19,
visual parity (readable + LOD + 900-chip stress). Known WebGL-substrate caveat (pre-existing):
`canvas-node-render.spec` + `import-export-image` pixel-sampling read the node canvas via
`getContext('2d').getImageData` — impossible on a WebGL canvas — needs a `readPixels`/screenshot
shim (not in the gate).

## ▶ COLD-START RESUME POINT (newest — 2026-07-07) — SUPERSEDES the 2026-06-25 point

**Branch `integration`.** The prior WebGL spike (`b2318c6`, per-quad glCompositor) is finished:
**node + label layers are now WebGL2 INSTANCED (`glSpriteBatch`) — one atlas, one draw call,
vertex-shader transform.** Pan & drag are **O(1) / locked 60 fps to 20,000 nodes** (was O(N),
wall at ~10k); spawn ~117 ms @20k. Working tree (uncommitted): `glSpriteBatch.ts`,
`NodesCanvas.tsx`, `LabelsCanvas.tsx`, `perf.config.ts`, `engine-perf.spec.ts`,
`webgl-instancing.md`. Verified: tsc, unit 1483, e2e gate 19/19, visual parity, real-GPU
measured. **NOT yet committed** — owner reviews `integration` manually.

**NEXT (in order):**
1. **Owner review** of the instancing change on `integration` (then commit).
2. **Connector GPU fold** — the confirmed next wall (100 % of high-N WITH-conn pan). RED gate:
   present a written design + a flag-gated measured PoC (solid single-line first) before the
   multi-session fold. `glSpriteBatch` already draws line quads.
3. **Harness debt:** a `readPixels`/screenshot shim so `canvas-node-render` /
   `import-export-image` pixel specs work on the WebGL canvas; and a full clean-cold
   instanced `baseline.md` refresh (left at the old Canvas2D numbers — a warm run's
   WITH-conn spawn is connector-routing-dominated, misleading as a node baseline).
4. **Atlas (only if a real culled scene nears the cap):** `sampler2DArray` pages for
   unbounded chip capacity. (Dead per-quad `glCompositor.ts` + `makeDotCanvas` already deleted.)

**Gotchas (carry forward, ALL still apply):** ⚠️ **WebGL perf MUST run on the real GPU** —
check the `[perf] WebGL renderer:` line each run (SwiftShader = software = fill-rate bound, not
the wall). Same-session A/B + stable calibration index mandatory; `git checkout --
perf-results/baseline.md perf-results/pan.md` after any partial/diagnostic run (PERF_PAN writes
pan.md, PERF_N writes baseline.md); let the harness own the dev server (build:lib desyncs it —
`Can't resolve 'axoview'`); kill stray :3000 listeners. Correctness gate command unchanged
(above).

---

## 🟡 GPU FOLD (2026-07-08): connectors + rectangles onto WebGL — APPLIED, measurement power-gated

**Context.** Owner tested the node/label instancing and asked to fix the next wall — the
DOM/SVG **connector** layer (100 % of high-N pan cost, T4 finding) — plus fold "all element
types" and add a harness gate requiring AC power before measuring (laptop was on battery;
CPU/GPU throttle → non-representative numbers).

**Mapping first (subagent, geometric-vs-DOM picking is the load-bearing fact):** connector +
rectangle picking is **100 % geometric** (`getItemAtTile` over `hitConnectors[].path.tiles` /
`rectangles[].from/to`) — removing the visible SVG does NOT break selection. Connector **labels**
are DOM-interactive (no geometric fallback). So: connectors + rects are safe to fold with a
sparse DOM hybrid; conn-labels need a hit-proxy.

**Applied:**
- **`glSpriteBatch`** gained a `white` texel (solid quads / lines) + a configurable atlas size
  (chip layers 8192; the new line/fill layers 512) + `isWebGL2Supported()` (no-WebGL2 →
  Renderer keeps connectors/rects in DOM; the new layers have no Canvas2D fallback).
- **`ConnectorsCanvas`** (new) — instanced halo + core polyline (scene points via
  `getTilePosition(connectorPathTileToGlobal)`, the space ConnectorLabel already uses), round
  join/cap dots, packed arrowhead sprite. DOM `<Connectors>` hybrid = selected + degenerate-dot
  + unroutable (own the halo / dot / error visuals). Dashed/dotted + double-line styles + rounded
  corners are DOM-hybrid / approximated for now (documented).
- **`RectanglesCanvas`** (new) — instanced iso fill parallelogram + border segments. DOM
  `<Rectangles>` hybrid = the **dragged** rect only (its `[data-drag-id]` drives the move
  preview); resize handles are separate TransformControls overlays.
- **Harness `PERF_ALLTYPES`** — the representative scene now carries ≥3 styled labels/connector,
  styled rectangle borders, and floating Labels (every renderer exercised at once).
- **AC-power gate** — `requireACPower()` blocks measurement on battery (Windows
  `BatteryStatus.PowerOnline`); `PERF_ALLOW_BATTERY=1` overrides. Verified it detects battery.
- **"No per-frame CPU work" check** — every GPU canvas publishes `data-build-count`; `measurePan`
  asserts the summed delta is **0** across the pan (buildInstances = the only O(N) CPU, must not
  run during navigation). Reusable prompt: [`no-cpu-work-check.md`](no-cpu-work-check.md).

**Correctness — GREEN (power-independent):** tsc clean · lib unit **1483 passed** · **e2e 27
passed / 0 failed** (drag/undo/z-order/rename/readable-labels + **connector-selection-clarity,
connector-dot-and-label-placement, rectangle-move-resize, rectangle-overlap-select, shapes,
lasso-connector-delete** — selection/interaction survive the fold) · all-types real-GPU
screenshot: nodes + colored halo/core connectors w/ arrows + rectangle fills+borders + floating
labels all render + line up.

**Connector labels — LOD-culled (measured-justified).** On-power measurement PROVED conn-labels
were the residual wall: with connectors+rects on the GPU but conn-labels on DOM, the all-types
pan was 16.67 (N=1000) → **28.75 (N=2000)** → **81.87 ms + 6.4 s longtask (N=5000)** — the 3×N DOM
label chips composite per frame. Rather than a blind GPU fold (DOM-coupled drag/edit → risky),
**LOD-cull them below readable zoom** (`readableLabels || zoom≥0.25`, mirroring the node-label
canvas LOD; only the SELECTED connector keeps labels live for F2/inline-edit). At fit-to-view
large N they are unreadable anyway → culled → O(1) restored. Low-risk, consistent, one boolean
selector (re-renders only on the LOD flip, never per pan frame).

### ▶ MEASURED (on AC power, real GPU) — the win

**All-types pan (`PERF_ALLTYPES` — every connector carries 3 labels + rects + floating labels):**

| N | BEFORE (all DOM) | GPU-fold only (conn-labels DOM) | AFTER (GPU fold + conn-label LOD) |
|---|---|---|---|
| 1000 | 22.8 ms | 16.67 (lt 0) | **16.67 (60 fps, lt 0, noCPU-rebuild=true)** |
| 2000 | **45.5 ms** (lt 653) | 28.75 (lt 0) | **16.67 (60 fps, lt 0, noCPU-rebuild=true)** |
| 5000 | (wall, ~100 ms+) | **81.87 (lt 6438)** | **16.67 (60 fps, lt 0, noCPU-rebuild=true)** |

(BEFORE ran at cal 4.1 warm vs AFTER cal 3.5 — but AFTER sits at the **vsync floor**, so it is
cal-independent; the point is BEFORE **scales/exceeds budget** while AFTER is **locked 60 fps
O(1)**.) The two fixes stack: (a) connector/rectangle bodies → GPU removes the SVG re-composite;
(b) connector-label LOD removes the residual DOM-chip wall. `noCPU-rebuild=true` at every cell =
machine-checkable proof no per-frame CPU geometry work leaked into the pan.

**Correctness after the LOD-cull:** connector-label / node-label / connector interaction specs
green (LOD only culls when zoomed out; specs interact at readable zoom).

**🐛 Fix (owner-reported) — lasso/multi-selected connectors showed NO selection halo.** The fold
regressed it: `connectorHybridIds` moved only the SINGLE `itemControls` connector to the DOM
`<Connector>` (which owns the selection-halo SVG), but a LASSO multi-selects into `selectedIds`
— those stayed on the GPU canvas, so their halo never rendered (selection STATE was correct —
`getItemsInBounds` is geometric — only the visual was missing; `lasso-connector-delete` passed
because it asserts deletion, not the halo). Fix: `connectorHybridIds` now also includes every
`selectedIds` CONNECTOR (via a comma-joined primitive selector). Reproduced (5 lasso'd
connectors → `selectionHalos` 0→5, `domConnectorPaths` 0→5) and re-verified green.

**Committed to `integration`** (owner asked). Executive summary handed to the owner.

---

## 2026-08-02 — R3/GPU-13, the four bulk canvases merged into one (ADR 0038 §8)

**Same-session A/B, matching calibration index** (3.1 ms merged vs 3.2 ms
pre-merge — inside the drift band, so the two arms are comparable; the protocol's
whole point). Arm A = `71ca5b1b` (four contexts, substrate only), arm B =
`cf81ba74..8ddcb43c` (one context, sorted draw). `PERF_PAN=1000,2000`:

| N | arm | mean | p95 | longest | longtask | noCPU-rebuild | draw |
|---|---|---|---|---|---|---|---|
| 1000 | A (four canvases) | 16.67 ms | 16.8 ms | 16.8 ms | 0 | true | 1000/1000 |
| 1000 | B (merged) | 16.67 ms | 16.7 ms | 16.8 ms | 0 | true | 1000/1000 |
| 2000 | A (four canvases) | 16.67 ms | 16.7 ms | 16.8 ms | 0 | true | 2000/2000 |
| 2000 | B (merged) | 16.67 ms | 16.8 ms | 16.8 ms | 0 | true | 2000/2000 |

**Verdict: no change, and the A/B cannot show one here** — both arms sit on the
**vsync floor** (16.67 ms = 60 fps) with zero long tasks, so the pan path had no
headroom to lose or gain. That is the expected result: pan was already one uniform
write plus one draw call per context, and merging turns four such into one, which
is far below the floor. The merge's own claim is a DRAW-CALL claim, not a
frame-time one, and it is asserted rather than reported — see below.

**`PERF_ATLAS=1000,2000,5000` on the merged canvas** (the §8 standing guard; it
asserts §5's build cadence rather than printing it):

| N | scene | merged atlas | pages | draw calls | build delta across a 10-step pan |
|---|---|---|---|---|---|
| 1000 | 1000 nodes / 968 conn / 49 rect / 250 labels | 2 766 / 8192 (33.8%), 1 257 slots | 1 | **1** | 0 |
| 2000 | 2000 / 1955 / 81 / 500 | 986 / 8192 (12%), 507 slots | 1 | **1** | 0 |
| 5000 | 5000 / 4929 / 225 / 1250 | 2 354 / 8192 (28.7%), 1 257 slots | 1 | **1** | 0 |

**One draw call for the whole bulk at every N, down from four**, and
`data-build-count` flat across the pan — ADR 0038 §5, machine-checked on the
merged canvas.

**A measured correction to §8's measurement 2.** The amendment derived a merged
budget by SUMMING the two separate chip atlases (3 144 rows at N=1000, 4 178 at
N=5000) and concluded the merged set would not fit the 4096 high-DPR clamp at
large N. Measured on the real merged atlas it packs far better — 2 766 and 2 354
rows — because one shelf packer shares rows across chip kinds instead of each
atlas rounding up its own. Both fit 4096 comfortably. The multi-page fallback is
therefore insurance rather than a routine path, which strengthens the sorted-draw
decision rather than contradicting it; no owner round-trip. The fallback stays,
because "does not require one texture" is the property that made the design safe
to commit to.

