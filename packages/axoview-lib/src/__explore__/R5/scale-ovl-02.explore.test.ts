/**
 * R5 / OVL-02 — the ADR-0015 "keep labels readable" counter-scale is computed
 * from the module CONSTANT `LABEL_BASE_FONT_PX` by both of its consumers
 * (`ExpandableLabel`'s `--axoview-label-scale` and `NodesCanvas`'
 * `u_counterScale`), so it never sees a node's own `labelFontSize`.
 *
 * OVL-14 (arrow keys did not nudge a floating Label) shared this file and was
 * fixed in wave 3; its probes are promoted to
 * `src/interaction/__tests__/handleArrowKey.test.ts`.
 *
 * RIG NOTE: every `it.failing` is paired with a passing characterization that
 * asserts the observed end state, and each probe asserts its PRECONDITION (the
 * enlarged font really is above the readable floor) so a probe whose setup
 * silently didn't happen cannot masquerade as evidence.
 *
 * RIG NOTE 2 (2026-07-31): assertions here take ONE argument. Jest's `expect`
 * throws "Expect takes at most one argument." on the Playwright-style
 * `expect(value, 'message')` form, which makes a probe red whatever the code
 * does — an OVL-14 probe in this file was written that way. See that entry.
 */
import { computeLabelCounterScale } from 'src/utils/labelScale';
import {
  LABEL_BASE_FONT_PX,
  LABEL_MIN_READABLE_PX,
  LABEL_MAX_COUNTER_SCALE
} from 'src/config/labelSettings';

// ---------------------------------------------------------------------------
// OVL-02 — the counter-scale ignores a node's own labelFontSize
// ---------------------------------------------------------------------------

/** Exactly what both consumers call. */
const scaleAt = (zoom: number, baseFontPx = LABEL_BASE_FONT_PX) =>
  computeLabelCounterScale(zoom, {
    enabled: true,
    baseFontPx,
    minReadablePx: LABEL_MIN_READABLE_PX,
    maxCounterScale: LABEL_MAX_COUNTER_SCALE
  });

describe('OVL-02 — readable-labels ignores per-node labelFontSize', () => {
  // A zoom where the BASE font is below the readable floor but a 3x-larger
  // per-node font is comfortably above it.
  const ZOOM = LABEL_MIN_READABLE_PX / LABEL_BASE_FONT_PX / 2;
  const BIG = LABEL_BASE_FONT_PX * 3;
  const SMALL = Math.max(1, Math.round(LABEL_BASE_FONT_PX / 3));

  it('PRECONDITION: at this zoom the BASE font is below the floor and a 3x font is above it', () => {
    expect(LABEL_BASE_FONT_PX * ZOOM).toBeLessThan(LABEL_MIN_READABLE_PX);
    expect(BIG * ZOOM).toBeGreaterThan(LABEL_MIN_READABLE_PX);
    expect(SMALL * ZOOM).toBeLessThan(LABEL_MIN_READABLE_PX);
  });

  it('characterization: the function itself is per-font-size correct', () => {
    // Fed the node's OWN font size it does the right thing in both directions…
    expect(scaleAt(ZOOM, BIG)).toBe(1);
    expect(scaleAt(ZOOM, SMALL)).toBeGreaterThan(scaleAt(ZOOM));
    // …so the defect is entirely in what the CALLERS pass.
    expect(scaleAt(ZOOM)).toBeGreaterThan(1);
  });

  it.failing('an already-legible enlarged label should not be scaled up again', () => {
    // What both consumers actually compute for a node with labelFontSize = 3x.
    const applied = scaleAt(ZOOM); // baseFontPx = LABEL_BASE_FONT_PX
    expect(applied).toBe(1);
  });

  it.failing('a shrunken label should be scaled up MORE than a base-size one', () => {
    const appliedToSmall = scaleAt(ZOOM);
    const wanted = scaleAt(ZOOM, SMALL);
    expect(appliedToSmall).toBeCloseTo(wanted, 5);
  });

  it('characterization: the enlarged label is over-scaled by exactly the font ratio', () => {
    const applied = scaleAt(ZOOM);
    const onScreenBefore = BIG * ZOOM;
    const onScreenAfter = onScreenBefore * applied;
    // Already legible before; blown up to 3x the floor after.
    expect(onScreenBefore).toBeGreaterThan(LABEL_MIN_READABLE_PX);
    expect(onScreenAfter).toBeCloseTo(LABEL_MIN_READABLE_PX * 3, 5);
  });

  it('characterization: the shrunken label is left below the floor', () => {
    const applied = scaleAt(ZOOM);
    expect(SMALL * ZOOM * applied).toBeLessThan(LABEL_MIN_READABLE_PX);
  });
});
