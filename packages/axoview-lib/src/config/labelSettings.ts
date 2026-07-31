// Re-export type from canonical location for backwards compatibility.
export type { LabelSettings } from 'src/types/settings';
import type { LabelSettings } from 'src/types/settings';

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  expandButtonPadding: 0
};

// "Keep labels readable" tuning (ADR 0015). Tunable here without code edits.
//
// Below the implied threshold (zoom < minReadablePx / baseFontPx) a node name
// label counter-scales up so its on-screen font size never drops below
// LABEL_MIN_READABLE_PX, bounded by LABEL_MAX_COUNTER_SCALE so it can't grow
// without limit at extreme low zoom. Only applies when uiState.readableLabels
// is on; off by default.
export const LABEL_MIN_READABLE_PX = 11;
export const LABEL_MAX_COUNTER_SCALE = 4;
/**
 * Base (unzoomed) font size for on-canvas labels — node labels, floating
 * Labels, and connector labels all default to this. Bumped 14 → 18 (2026-07-01)
 * so labels read well at typical zoom without the user hand-bumping every one;
 * 18px is the readable sweet spot for on-canvas chrome text. Explicitly-sized
 * labels are unaffected.
 */
export const LABEL_BASE_FONT_PX = 18;

// ---------------------------------------------------------------------------
// Label LOD — the draw threshold, and the rule the hit layers must follow
// ---------------------------------------------------------------------------
//
// R3/GPU-04 + GPU-05: draw visibility and HIT visibility were decided in
// different files with different thresholds, so a label could be painted at a
// zoom where nothing could grab it. Floating Label chips paint from
// `LabelsCanvas` with no zoom gate at all while `LabelHitLayer` mounted its
// proxies only at `zoom >= 0.4`; node name chips draw below `LABEL_LOD_ZOOM`
// whenever the "keep labels readable" setting is on, while `NodeLabelHitLayer`
// gated at the same 0.4 — so the accessibility setting whose whole purpose is
// keeping labels legible when zoomed out was the one MANUFACTURING inert ones.
//
// The rule, stated once: **nothing may be painted at a zoom where it cannot be
// hit.** These predicates are the shared source both sides read, so the two
// halves cannot drift apart again.

/** D3-3: below this zoom, node labels are too small to read — icons only. */
export const LABEL_LOD_ZOOM = 0.25;

/**
 * Is a node's name chip drawn at this zoom? `readableLabels` forces it below the
 * LOD floor, counter-scaled up to a legible size (ADR 0015), which is exactly
 * why the hit layer cannot use a fixed threshold of its own.
 */
export const isNodeLabelDrawn = (
  zoom: number,
  readableLabels: boolean
): boolean => readableLabels || zoom >= LABEL_LOD_ZOOM;
