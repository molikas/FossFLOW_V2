# ADR 0015 — Node Label Legibility Scaling

**Status:** Accepted
**Date:** 2026-06-11
**Supersedes:** none
**Superseded by:** none

## Context

Node and item name labels render **inside the zoom-scaled `SceneLayer`** (via
[`ExpandableLabel`](../../packages/axoview-lib/src/components/Label/ExpandableLabel.tsx) →
[`Label`](../../packages/axoview-lib/src/components/Label/Label.tsx)). Because the whole scene is
`transform: scale(zoom)`, labels shrink with the canvas — at low zoom (e.g. 46% on a large
diagram) the text becomes **too small to read**.

This is a **legibility** problem, confirmed with the user 2026-06-11 (the original report said
"slow," which was a typo for "small" — there is no measured performance issue here, and none is
being designed for). The node's interactive chrome already solves the analogous problem by
**counter-scaling** to stay pixel-stable ([ux-principles §8.8](../guidelines/ux-principles.md), e.g.
[`ViewModeInfoPopover`](../../packages/axoview-lib/src/components/ViewModeInfoPopover/ViewModeInfoPopover.tsx)); the
name labels do not.

## Decision

Add an optional **"keep labels readable" toggle** to the [`ZoomControls`](../../packages/axoview-lib/src/components/ZoomControls/ZoomControls.tsx)
cluster.

- **Off (default):** labels scale with the canvas, exactly as today.
- **On:** below a zoom threshold, name labels **counter-scale up to a legible minimum size** so
  text stays readable when zoomed out. Only the label scales — node geometry is untouched.

The toggle state persists in uiState alongside the existing label flags (`expandLabels`,
`labelSettings`).

Behavior sketch: above the threshold, no counter-scale. Below it, scale the label by
`max(1, minReadablePx / (baseFontPx * zoom))`, bounded, pinned to the node's anchor point.

This is **opt-in** deliberately: counter-scaled labels can overlap on dense diagrams, so forcing
it on everyone would trade one problem for another. The user turns it on when they need to read a
zoomed-out overview.

## Consequences

**Positive:**
- Labels stay readable when zoomed out, on demand.
- Opt-in keeps dense diagrams clean by default; no forced overlap.

**Negative / risks:**
- When on at very low zoom, labels can overlap. Acceptable — it is an explicit user choice, and
  the alternative (unreadable text) is worse for the case they enabled it for.
- One new persisted UI flag and one new affordance in the zoom cluster.

## Implementation notes (non-binding)

- Reuse the zoom-subscription / counter-scale pattern from
  [`ViewModeInfoPopover`](../../packages/axoview-lib/src/components/ViewModeInfoPopover/ViewModeInfoPopover.tsx)
  (per [ux-principles §8.8](../guidelines/ux-principles.md)): direct DOM ref subscribed to `uiState.zoom`,
  bypassing React render, applying `transform: scale(...)` to the label only.
- Add the toggle (e.g. an "Aa" icon) to [`ZoomControls`](../../packages/axoview-lib/src/components/ZoomControls/ZoomControls.tsx),
  beside the fit-to-view button. New flag (e.g. `uiState.readableLabels` or
  `labelSettings.keepReadable`).
- Leave `expandLabels` (the export force-expand path in `ExpandableLabel`) semantics unchanged —
  this is a separate concern (size, not expansion).
- Threshold + `minReadablePx` belong in [`labelSettings`](../../packages/axoview-lib/src/config/labelSettings.ts)
  so they are tunable without code edits.

## Acceptance criteria

- **Manual:** With the toggle on, zooming to ~46% holds labels at a readable size; with it off,
  labels shrink with the canvas as before.
- **Manual:** The toggle state survives a page reload.
- **Manual:** Toggling has no effect on node body / geometry size — labels only.

---

## Addendum — 2026-08-02: "on-screen font size" means the label's OWN size

**Status:** Accepted. Owner ruling 2026-07-31 (wave-3 handoff), implemented in
wave 4. Filed as R5/OVL-02.

### What changed, and why it needed a ruling

This ADR is written throughout in terms of *"the label's on-screen font size"*,
and when it was written every label had the same one. **ADR 0032's per-label
sizes (the style strip) postdate it**, and nothing revisited this document — so
"the label's font size" quietly became ambiguous, and every consumer resolved
the ambiguity the same wrong way: by reading the module constant
`LABEL_BASE_FONT_PX`.

That is correct for a default-sized label and wrong for both other cases, in
opposite directions:

- a label the user **enlarged** is already well above the floor and was scaled up
  again anyway, landing several times larger than everything around it;
- a label the user **shrank** — the one label this feature exists for — received
  the same factor as everyone else and stayed **below** the floor.

**The wording is now binding:** *on-screen font size* is the label's own
effective size × zoom. The factor is

```
factor = clamp(max(1, minReadablePx / (effectiveFontPx × zoom)), 1, maxCounterScale)
```

`maxCounterScale` still governs. A label shrunk past what the cap can rescue
lands short of the floor rather than growing without bound — the same trade this
ADR already made, now applied per label.

### One derivation, six consumers, one PR

The factor is derived in exactly one place —
[`labelCounterScaleFor`](../../packages/axoview-lib/src/config/labelSettings.ts) —
and **every consumer must call it**. There are six: two GPU layers paint the
chips (`NodesCanvas`, `LabelsCanvas`), three DOM layers publish
`--axoview-label-scale` for the boxes that proxy them (`LabelHitLayer`,
`NodeLabelHitLayer`, `ConnectorLabel`), and `ExpandableLabel` scales the DOM
node label.

They had to move **together**, which is why this shipped as one change: a factor
that moved on the paint side alone would leave every grab box at the default
label's scale while the chips beneath them moved — R5/OVL-12, the bug wave 3
fixed, reintroduced from the other side.

Two structural consequences, neither of which the ruling had to state but both
of which it implies:

1. **The GPU factor is per INSTANCE, not per draw.** A single `u_counterScale`
   uniform can only ever be right for a default-sized label. Each label chip now
   packs its own factor into the spare `i_misc.w`; the uniform survives as the
   fallback for any instance that carries none, so an emitter that has not been
   migrated keeps its previous behaviour rather than collapsing to 1.
2. **The DOM factor is per ELEMENT, not per wrapper.** All three DOM consumers
   published one `--axoview-label-scale` on a shared `display: contents`
   wrapper. Each label element now carries `data-label-font` and the store
   subscription sets the variable on that element — which preserves the property
   the wrapper existed for (pan/zoom writes the DOM directly, never re-rendering
   React; ux-principles §8.8).

### Rejected

**"Disable the counter-scale for restyled labels."** Cheap, and a regression for
the user it is meant to serve: a node whose label the user enlarged would stop
being kept readable *precisely because* they styled it.

### Enforcement

[`labelCounterScale.contract.test.ts`](../../packages/axoview-lib/src/config/__tests__/labelCounterScale.contract.test.ts)
forbids any counter-scale computed from `LABEL_BASE_FONT_PX` outside the shared
derivation, names all six consumers so one silently dropping out is caught, and
asserts the per-instance / per-element mechanisms above. The exemption names the
**function**, not the file — a second derivation added to `labelSettings.ts`
still fails, which is the wave-4 gate-authoring rule.

### Acceptance criteria (addendum)

- **Automated:** an enlarged label above the floor receives factor 1; a shrunk
  label is lifted to the floor; both verified against the shared derivation.
- **Manual:** with the toggle on and the canvas zoomed out, a node whose label
  was enlarged in the style strip is no longer conspicuously larger than its
  neighbours, and one whose label was shrunk is legible.
- **Manual:** the grab box still covers the drawn chip for all three sizes —
  drag and rename remain reachable.
