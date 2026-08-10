# ADR 0031 — Floating Label as a First-Class Entity

**Status:** Accepted
**Date:** 2026-06-29
**Supersedes:** none (resolves the [ux-principles §5](../guidelines/ux-principles.md) item-type-parity exemption taken by the spike's `variant:'label'` text box; relates to [ADR 0024](0024-node-label-positioning-and-sizing.md) node-label positioning, [ADR 0019](0019-canvas2d-node-render-layer.md) Canvas2D render substrate, [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md) perf harness)
**Superseded by:** none

## Context

The spike added a floating **Label** element as a **variant of TextBox** ([`schemas/textBox.ts:14`](../../packages/axoview-lib/src/schemas/textBox.ts) `variant: z.enum(['text','label'])`, plus optional `backgroundColor` / `zIndex` / `isStrikethrough`). A verification pass found the variant approach carries real, partly **intrinsic** debt:

- **Two deep forks** on `variant === 'label'`: a render-geometry fork (billboard chip vs iso-projection, [`TextBox.tsx`](../../packages/axoview-lib/src/components/SceneLayers/TextBoxes/TextBox.tsx) ~L60–235) and a hit-detection fork ([`hitDetection.ts:61,84–89`](../../packages/axoview-lib/src/utils/hitDetection.ts), anchor-tile-only vs footprint). Four further shallow branches.
- **z-order against nodes is impossible.** The `TextBoxes` SceneLayer is DOM-earlier than `NodesCanvas` at equal `zIndex:0`, so a label over a node is **always occluded**; the `zIndex` field is intra-layer only. This is architectural, not a bug a later patch can fix.

> **Addendum (2026-08-02) — §2's guarantee is a sort key now, and the `zIndex` field is no longer intra-layer.** [ADR 0038 §8](0038-webgl-instanced-render-substrate.md) merged the four bulk canvases into one WebGL2 context ordered by a single sort, so "a floating Label paints above nodes" is the **`label` type rank** in `compareSceneDrawOrder` rather than a mount-order accident — and a Label's `zIndex` now outranks that type rank, so it orders against every entity type, not just other Labels. The sentence above stays as the record of why the entity was extracted from the `TextBox` variant in the first place; the architectural claim it makes was true of the four-canvas hybrid and is not true of the merged one.
- **Anchor-tile-only hit-test:** a wide chip is only clickable on its single center tile.
- **Font model is a heuristic** (`iso fontSize × 24 → px`), not a first-class px size.
- **Double formatting:** a label exposes *both* per-character rich text *and* whole-chip B/I/S — the exact two-layer conflict the code deliberately excludes plain text boxes from.

The branch is **unpushed** — no saved diagram contains a `variant:'label'` element. The data-model reshape is therefore **free now and a permanent load-time migration after first ship.** The user has chosen the clean path ("implement it properly, not a POC").

## Decision

**Extract a dedicated first-class `Label` entity** (a peer of Node / Connector / TextBox / Rectangle per [§5](../guidelines/ux-principles.md)), retiring the `variant:'label'` text-box. Done **before** the integration→master merge, while migration cost is zero.

1. **Dedicated schema + reducers.** A `Label` model entity with first-class fields (text, position, `backgroundColor`, `bold/italic/strikethrough`, font size in **px**, z-order). The `variant`/label fields are removed from `textBox.ts`; `TextBox` reverts to text-only.
2. **Own render layer, placed above the node layer.** Resolves cross-layer z-order — a Label can sit above nodes (and an explicit z-order field orders within the layer).
3. **Edit model: plain text + whole-chip B/I/S only.** No rich-text editor on labels — this dissolves the two-layer formatting conflict. (Rich text stays on plain TextBox, where per-character formatting is the point.)
4. **Full-chip hit-testing.** The entire chip is selectable, not just the anchor tile — via the proven `NodeLabelHitLayer` DOM hit-proxy pattern (or the Canvas2D path, per §6).
5. **Panel parity** — a Label's panel is whatever shape [ADR 0030](0030-docked-style-controls-strip.md) defines for every item type (no Style tab; styling via the docked strip). The binding decision is *parity*, not a particular shape: 0030 is the single home for what the panel looks like, so this point deliberately does not name it. *(It read "Details / Notes" until 2026-07-15 — falsified by commit `987eaaf`'s collapsible-section deck, which restated wording here could not track.)*
6. **Render substrate is a performance decision, not an afterthought (binding).** Floating labels are billboard chips and a real diagram may carry **hundreds**. Rendering each as a DOM node reintroduces precisely the DOM-layer scaling cliff [ADR 0019](0019-canvas2d-node-render-layer.md) moved nodes *off of* (DOM doesn't cull or sub-linearly scale the way the Canvas2D layer does). The extracted Label layer **must be measured against the [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md) harness with a label-heavy scenario before merge.** If a DOM-chip layer regresses spawn/pan p95 beyond the noise band, render the Label layer on **Canvas2D** (billboard text, same substrate as node labels) with viewport culling — or virtualize the DOM layer. The substrate is chosen by measurement, and recorded here in an addendum once measured.
7. **Migration: none.** Because the branch is unpushed, the reshape lands with no load-time converter. This window does not reopen — if extraction does not happen before master, this ADR is void and the variant is ratified-with-debt instead.

**2026-07-03:** point 3's parenthetical is refined by [ADR 0034](0034-inline-canvas-text-editing-and-dual-scope-strip-formatting.md): per-character formatting **stays exclusive to the plain TextBox**, but it is now authored **inline on the canvas** (toolbar-less Quill) and driven from the strip's dual-scope format cluster — the rich-text *popup* this point referenced is retired. Labels are unchanged (plain text + whole-chip B/I/S); the two-layer conflict this ADR dissolved for labels is now also dissolved for text boxes, in the opposite direction (content HTML is the single formatting layer; the element-level `is*` flags are legacy-folded at load).

## Consequences

**Positive:**
- §5 parity restored; the intrinsic limits (z-order, hit, font model, double-formatting) are fixed at the root, not patched forever.
- The render substrate is chosen on perf evidence — labels can't silently re-break the large-diagram budget.
- Zero migration; the data model is clean from first ship.

**Negative / risks:**
- One L-sized rebuild slice (schema + reducers + render layer + hit layer + clipboard/persistence). Keep it isolated so the schema diff is reviewable and the zero-migration claim is verifiable in one place.
- A second render layer above nodes adds compositing surface — mitigated by the §6 perf gate.

## Implementation notes (non-binding)

- Mirror the existing entity scaffolding (schema → reducer/scene actions → SceneLayer → hit layer → ItemControls panel → clipboard/persistence). The TextBox subsystem is the closest template; subtract the iso-projection + rich-text pieces.
- Reuse `NodeLabelHitLayer` as the hit-proxy template (§4).
- Keep the connector-label and node-label styling paths untouched — this ADR is only the *floating* Label.

## Acceptance criteria

- **Schema:** a `Label` parses/round-trips; `textBox.ts` no longer carries `variant`/label fields; no migration code exists (verified against the unpushed baseline).
- **Render/z-order:** a label placed over a node renders **above** it.
- **Hit-test:** the full chip width is selectable (not just the anchor tile); a connector passing under the chip is still selectable where the chip isn't.
- **Edit model:** a label cannot carry both rich text and whole-chip B/I/S (single model).
- **Performance (gates the merge):** a label-heavy scenario (≥200 floating labels) shows **no p95 regression beyond the ADR 0020 noise band (<10%)** vs the master baseline for spawn + pan; the chosen substrate is recorded in an addendum.
- **Coverage:** unit/e2e for placement, hit-branch, defaults, and the perf scenario.

## Addendum — render substrate decided by measurement (2026-06-30)

Point 6 (§Decision) deferred the DOM-vs-Canvas2D substrate to the [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md) harness. The E-slice perf gate now measures it. New scenarios in [`engine-perf.spec.ts`](../../packages/axoview-e2e/perf/engine-perf.spec.ts) at N ∈ {200, 500, 1000}, median-of-7, vs the master spawn baseline ([`perf-results/baseline.md`](../../perf-results/baseline.md)); full table was in `perf-results/e-slice-gate.md` (retired 2026-07-08 under the [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md) retention policy; git history is the archive):

| Surface (substrate) @ N=1000 | spawn p95 | settle | commit |
|---|---|---|---|
| bare-node baseline (master) | 79.18 ms | 183 ms | — |
| node labels, full B/I/S (**Canvas2D**) | 79.99 ms | 200 ms | 513 ms |
| backgrounds + ≤30px borders (**Canvas2D**) | 79.18 ms | 183 ms | 534 ms |
| connector labels, all styled (DOM) | 79.25 ms | 183 ms | 504 ms |
| **floating labels (DOM chips)** | **184.96 ms** | **600 ms** | **814 ms** |

**Finding.** Every Canvas2D surface adds **≈0** to spawn p95 even at N=1000 (within the <10% noise band). The **DOM floating-label** layer is the lone outlier — it **~2.3× the spawn p95 and ~3× the settle** (over an N-node base), the exact DOM-layer scaling cliff [ADR 0019](0019-canvas2d-node-render-layer.md) moved nodes off of. The pan floor (`perf-results/pan.md`, since retired — see the [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md) retention policy) confirms the synchronous-repaint cost is O(visible) regardless of substrate.

**Decision (fires Point 6's "if DOM regresses, use Canvas2D" trigger).** The extracted `Label` layer (slice **C1**) renders on **Canvas2D** — a billboard text layer with viewport culling, the same substrate as node labels (which the table shows scales for free) — placed **above** the node layer for z-order. A DOM chip layer is rejected: it reintroduces the measured cliff. (Virtualizing a DOM layer is a fallback only if a Canvas2D billboard proves infeasible for hit-testing; the `NodeLabelHitLayer` proxy already shows the hit-layer can stay a thin DOM overlay over a Canvas2D paint.) This binds C1's render-layer implementation.

**Confirmed by C1 (2026-06-30).** The shipped `LabelsCanvas` (Canvas2D billboard + a per-(text, fontSize, B/I) layout cache mirroring `NodesCanvas`, full-chip selection via the `LabelHitLayer` DOM proxy) re-measures at **79.25 ms p95 / 183 ms settle @ N=1000** — within the [ADR 0020](0020-engine-perf-harness-and-measurement-protocol.md) <10% band of the 79.18 ms / 183 ms bare-node baseline, ≈ the node-label Canvas2D surface, and **−57% p95 / −69% settle** vs the rejected DOM chip layer. The per-frame `measureText` was the dominant cost; caching the chip layout drops 1000 extra billboards to ≈0 added spawn cost. Full table was in `perf-results/e-slice-gate.md` §2b (retired; git history is the archive). The substrate decision holds.
