# ADR 0020 — Engine Performance Harness & Measurement Protocol

**Status:** Accepted
**Date:** 2026-06-15
**Supersedes:** none
**Superseded by:** none

## Context

The engine-performance initiative (T2 render rewrite — [ADR 0019](0019-canvas2d-node-render-layer.md)
— and the planned T3 simulation engine) needs a **reproducible measurement
methodology**, not ad-hoc timings. The methodology was developed and proven across
Iters 0–9 and had been living in the `docs/tactical/perf-charter.md` working doc — **this ADR is now the sole durable copy** (the charter was wrapped and deleted 2026-07-15; its history is in git, and its unratified T3 sim mandate moved to PLAN.md's ENG-T3 row).
That file is a **tactical** doc — by the three-tier convention (ADR 0008, and
[workflow.md](../workflow.md) Principle 4) it is deleted at `/feature wrap` when T2
ships. Its durable half — the harness contract, the measurement discipline, the tier
ladder, and the north-star metric — must outlive T2 because **T3 reuses it verbatim**.
This ADR promotes that durable half to a locked decision; the charter tactical is
retired at the T2 wrap.

The central empirical fact that shapes the protocol: **cross-session machine drift was
measured at ~22%, far exceeding the ~2–5% within-run noise.** Absolute frame numbers
are therefore only comparable between runs taken close together on the same machine
state. Any methodology that compares a fresh run against a prior-session baseline is
measuring drift, not the change.

## Decision

The durable performance methodology is the following, and all engine-perf work (T2,
T3, T4) conforms to it.

**1. Harness (KR1).** A committed one-command harness — `npm run perf`
([packages/axoview-e2e/perf/](../../packages/axoview-e2e/perf/)) — drives the **real
app in real Chromium** (Playwright) via the debug bridge (`window.__axoview__`), with
StrictMode double-render and the diagnostics overlay disabled for representative cost.
It scripts bulk-paste (spawn) and synthetic pointermove streams (drag), capturing
p50/p95/mean/longest-frame/settle/long-task per entity count N ∈ {25, 50, 100, 200,
500, 1000, 2000}, plus the idle guardrail. It **owns its server lifecycle** (`build:lib
&& dev`, fresh) so it never measures a stale `dist/`.

**2. Measurement protocol (KR6) — the anti-drift discipline.**
- Every keep/revert is a **same-session A/B with a stable calibration index** (a fixed
  CPU-workload index printed each run). The reference and treatment runs must report a
  matching calibration index; a mismatched pair (e.g. 3.8 vs 3.1) is **discarded and
  re-run warm**, never compared.
- Median-of-≥N runs, warm-up discarded; the **noise band** (coefficient of variation of
  the continuous headline metric) is reported. **A result inside the noise band is not a
  change** and is reverted.
- **One variable per iteration.** One decision-log row per hypothesis: {hypothesis,
  single variable, before/after, noise-relative verdict, keep/revert, why}.

**3. Running memory (durable).** [perf-results/decision-log.md](../../perf-results/decision-log.md)
(one row per hypothesis; the resume point is its tail) and
[perf-results/baseline.md](../../perf-results/baseline.md) (current certified numbers)
are the persistent record — the context window is scratch. **`baseline.md` is rewritten
by every run, including partial/diagnostic runs — restore it (`git checkout`) after any
non-full run; only a clean full idle run updates it.**

**4. Tier ladder & north-star metric.** Targets, each naming the substrate unlock it
requires:

| Tier | SSB / LEB60 | Unlock |
|---|---|---|
| T0 (today) | 25 / ~20 | DOM/SVG + React per node |
| T1 | 300 / ~50 | fix idle churn, memoize; no rewrite |
| T2 | 2,000 / ~200 | **Canvas2D** layer decoupled from React + cull (ADR 0019) |
| T3 ⭐ | 2,000 / **1,000** | **ECS + fixed-timestep tick loop + spatial-hash collision**; tick decoupled from render |
| T4 ✅ | 10,000 / **5,000+** | **WebGL instanced** sprites (SHIPPED 2026-07-08, ADR 0038); batched per-tick rule eval |

The **north-star is LEB60** — Live Entity Budget @60fps: concurrently simulated,
collision-checked, *moving* entities holding p95 frame ≤ 16.6 ms. **SSB** (static
structures @60fps) is the companion. T2 advances SSB; T3 is the LEB60 product target
(1,000 animals moving 1 tile/tick @ 10 ticks/s with collision atop 2,000 structures on
a 256×256 grid; tick p95 < 5 ms, render p95 < 11 ms, never serialized into one >50 ms
task).

**5. Guardrails (each must be green or the headline number is a lie).** Idle heap flat
±5% over 60s at zero entities (KR3); zero frames > 50 ms during a bulk paste; bulk-spawn
of 1,000 with no fps < 30; memory per entity < 5 KB.

**6. Anti-cheat.** The committed correctness suite is the anti-cheat: a perf change may
not remove work the real app does. Each renderer carries a draw/work counter the harness
asserts against N (DOM: `[data-drag-id]` shell count; Canvas/**GPU**: `dataset.drawCount`
per layer canvas — see the 2026-07-08 addendum). The GPU-fold added a third substrate: the
node/label/connector/rectangle canvases each publish `dataset.drawCount` (drawn instances)
and `dataset.buildCount` (geometry rebuilds — must stay flat during pan, ADR 0038 §5).

**7. Escalation (RED gate).** An architectural rewrite (Canvas2D/WebGL render, ECS
simulation) is authorized but RED: a written design + a measured proof-of-concept
finding precede the multi-session overhaul, and the decision is presented before
committing. Local minimum (3 consecutive sub-noise hypotheses) or a provable substrate
ceiling triggers a findings report.

**2026-07-02 (E-slice — labels & text-styling productization).** Productizing the
labels/text-styling UX (the integration productization plan, slice E — a tactical wrapped
in `ce8f8f5`; git history is the archive) added five styling/pan stress scenarios to the
harness. Each conforms verbatim
to §1–§6 — env-gated, comma-N lists (e.g. `PERF_LABELHEAVY=200,500,1000`),
median-of-`REPEATS` with warm-up discarded, calibration-matched, CoV noise band reported —
and each writes its own `perf-results/<name>.md`, leaving `baseline.md` **untouched** (the
§3 charter discipline), exactly like the pre-existing `PERF_BLOAT` / `PERF_LABELDRAG`
diagnostics:

| Env knob | Report | What it stresses (substrate) |
|---|---|---|
| `PERF_LABELHEAVY` | `label-heavy.md` | every node label B/I/S + colour + varied px (**Canvas2D** label draw) |
| `PERF_CONNLABELHEAVY` | `conn-label-heavy.md` | every connector carries a styled additional label (**DOM** `ConnectorLabel`) |
| `PERF_BGHEAVY` | `bg-heavy.md` | double-density grouping rects with fills + ≤30px styled borders (**Canvas2D** fill+stroke overdraw) |
| `PERF_FLOATLABELS` | `floating-label-heavy.md` | N first-class floating **Label** chips ([ADR 0031](0031-floating-label-entity-model.md), **Canvas2D** `LabelsCanvas`) |
| `PERF_PAN` (+ optional `PERF_THROTTLE`) | `pan.md` | sustained per-rAF `setScroll` repaint floor (`measurePan`) |

The four spawn-class scenarios reuse the spawn baseline's cells so their settle/p95 are
directly comparable to `baseline.md`'s spawn column, and each extends the §6 anti-cheat
with a **draw-count == N** assertion (`renderedNodes` for the node canvas; `renderedLabels`
for the Canvas2D Label layer — every styled entity must actually draw). The gate result
(median-of-7, N ∈ {200, 500, 1000}): base spawn unchanged at N ≥ 500, the Canvas2D surfaces
ride at the ~79 ms baseline, and the DOM floating-label chip layer's ~2.3× spawn-p95 cliff
is the measured evidence behind the then-current **Label substrate = Canvas2D** decision
([ADR 0031](0031-floating-label-entity-model.md) E3 — since superseded by
[ADR 0038](0038-webgl-instanced-render-substrate.md): labels are now drawn on the WebGL2
substrate with every other bulk layer). Full numbers were in `perf-results/e-slice-gate.md`,
retired 2026-07-08 under the retention policy below; git history is the archive. `measurePan` is the
**first** pan baseline (it did not exist on master), so it records the floor ENG-PAN R1
must beat (KR-P3), not a regression comparison.

## Consequences

**Positive:**
- T3 opens with `/feature start t3-sim-engine` reading this ADR + the running memory,
  with zero methodology re-derivation.
- Every perf claim in the repo is reproducible by a fresh reader running `npm run perf`
  and reading the decision-log row.

**Negative / risks:**
- The calibration index is **machine-relative**; the harness is tuned for the Windows
  dev box. Porting the absolute numbers to CI requires recalibration, not a copy.
- The same-session-A/B discipline is a process constraint a hurried contributor can
  violate (comparing across sessions); the ~22% drift figure here is the standing
  reminder of why that produces garbage.

## Implementation notes (non-binding)

- Env knobs: `PERF_N`, `PERF_REPEATS`, `PERF_WARMUP`, `PERF_IDLE_MS`; diagnostics
  `PERF_PROFILE` / `PERF_CPUPROFILE` (spawn), `PERF_DRAGPROFILE` (drag),
  `PERF_RENDERPROBE`, `PERF_NOLABEL`, `PERF_NOCONN`. (`PERF_CANVAS` is retired with the
  flag in ADR 0019.)
- E-slice styling/pan scenarios (2026-07-02 addendum): `PERF_LABELHEAVY`,
  `PERF_CONNLABELHEAVY`, `PERF_BGHEAVY`, `PERF_FLOATLABELS` (spawn-class, each writes
  `perf-results/<name>.md`), and `PERF_PAN` (+ optional `PERF_THROTTLE`, CDP CPU throttle).
  All comma-N; none touch `baseline.md`.
- **Build/dev gotcha (load-bearing):** the rsbuild dev server desyncs from `dist/` after
  `build:lib` ("Can't resolve 'axoview'"). Let `npm run perf` own the lifecycle
  (build + fresh boot); do **not** `PERF_REUSE` against a hand-started dev server unless
  it was just rebuilt + restarted. Kill stray :3000 listeners between runs.
- **Phase 0.5 (gates T3):** add a tick-workload harness — N entities moving 1 tile/tick
  with collision — before any T3 (LEB60) claim. T3 sim targets are unmeasurable until
  it exists.
- A durable summary of `npm run perf` (contract, env knobs, gotcha) lives in
  [docs/guidelines/testing.md](../guidelines/testing.md); this ADR is the decision, that section is the how-to.

## Acceptance criteria

- `npm run perf` runs from a clean checkout and emits `baseline.md` + a noise band; KR1
  noise band < 10% on the load-bearing range.
- The durable artifacts (this ADR, `decision-log.md`, `baseline.md`, the harness code,
  the `docs/testing.md` section) survive the T2 `/feature wrap`; only the charter
  tactical and the T2-specific scaffolding are retired.
- T3 can be opened against this ADR without reconstructing the methodology.
- **(2026-07-02)** The E-slice styling/pan scenarios (`PERF_LABELHEAVY`,
  `PERF_CONNLABELHEAVY`, `PERF_BGHEAVY`, `PERF_FLOATLABELS`, `PERF_PAN`) run under the §1–§6
  protocol, each emitting its own `perf-results/*.md` without rewriting `baseline.md`, and
  extend the §6 anti-cheat with a draw-count == N assertion (`renderedNodes` /
  `renderedLabels`). Gate outcome recorded in git history (the E-slice gate shipped).

**Addendum (2026-08-02) — the §6 node anti-cheat reads `data-nodes-drawn`.**
The bulk canvases merge into one context under
[ADR 0038 §8](0038-webgl-instanced-render-substrate.md), where `dataset.drawCount`
becomes a TOTAL over every entity type and can no longer be compared against N.
The honesty assertion is therefore **`dataset.nodesDrawn == N`**; the total stays
published and informational. `NodesCanvas` published both from the rename onward
and the harness assertion was repointed in the same change, so there was no window
in which it read a dead attribute. `PERF_ATLAS` (`perf-results/atlas.md`) is the §8
measurement scenario and additionally asserts `buildDelta === 0` across a pan,
which is §5's invariant stated as a gate rather than a report.

**Merge landed the same day.** The four canvases are now one
(`axoview-scene-canvas`), so every anti-cheat reads a PER-TYPE channel on it:
`data-nodes-drawn`, `data-connectors-drawn`, `data-rectangles-drawn`,
`data-labels-drawn` (node NAME chips) and `data-floating-labels-drawn` (ADR 0031
Labels). `data-build-count` is one counter instead of four summed, and
`PERF_ATLAS` reports the one merged atlas plus the pages and draw calls it needed
— which is what says whether §8's "one draw call" case held on a given run.

**Addendum (2026-07-08) — T4 WebGL fold shipped (ADR 0038).**
- T4 (WebGL instanced substrate) shipped; the tier ladder is marked ✅. Nodes,
  labels, connector bodies and rectangle bodies render via `glSpriteBatch`.
- §6 anti-cheat extended to the GPU substrate: the connector anti-cheat now reads
  `axoview-connectors-canvas` `dataset.drawCount` (+ the sparse DOM hybrid) instead
  of a DOM `connector-path` count that the fold emptied; nodes/labels already read
  their canvases' `dataset.drawCount`. The "no per-frame CPU work" invariant is
  enforced by `measurePan`'s `buildDelta === 0` (ADR 0038 §5).
- **Perf-results retention policy (fills the prior gap).** DURABLE (never delete):
  `perf-results/decision-log.md` (running memory, resume point) and
  `perf-results/baseline.md` (self-regenerating certified numbers). FOLD-THEN-DELETE:
  a tier's design/PoC docs are captured in that tier's ADR at `/feature` wrap, then
  removed (the T4 spike docs `webgl-instancing.md` + `no-cpu-work-check.md` folded
  into ADR 0038). REGENERABLE (prune when the tier/gate closes; git history is the
  archive): per-scenario `*.md` reports (`PERF_*HEAVY`, `PERF_PAN`, `PERF_BLOAT`) and
  `*profile*.md` dumps. GITIGNORED: `perf-results/raw/` frame dumps. Applying this,
  18 pre-T4 POC/scratch files (incl. `e-slice-gate.md`, the T2 cold-start/design docs,
  and the profiling dumps) were retired 2026-07-08.
