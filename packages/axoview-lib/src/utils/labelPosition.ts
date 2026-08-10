// Pure node-label positioning math (ADR 0024). Kept dependency-free and
// unit-testable — the `labelScale.ts` precedent — so the on-canvas drag (the
// label chip is its own handle) and the renderers (DOM `Label`, bulk
// `SceneCanvas`) all resolve the same geometry from one place.
//
// The label's vertical placement is a SIGNED offset: positive = the chip sits
// ABOVE the node (the legacy behaviour, stalk drawn upward); negative = BELOW it
// (stalk drawn downward). The magnitude is the stalk length in canvas px (the
// SceneLayer's local, pre-zoom space).

export type ExpandDirection = 'CENTER' | 'BOTTOM';

export interface LabelPlacement {
  /** Chip sits below the node (offset < 0). */
  isBelow: boolean;
  /** Whether a stalk connector is drawn at all (false when offset === 0). */
  showStalk: boolean;
  /** CSS `top` for the stalk SVG, in canvas px. */
  stalkTop: number;
  /** Stalk length (SVG height + line length), always >= 0. */
  stalkLength: number;
  /** CSS `top` for the chip, in canvas px. */
  chipTop: number;
  /** The Y component of the chip's `translate(-50%, …)`. */
  chipTranslateY: string;
  /**
   * Chip `transform-origin`. Flipped so the ADR-0015 readable-labels
   * counter-scale (which scales about this origin) holds the stalk-attachment
   * point — the chip edge nearest the node — fixed in both directions.
   */
  transformOrigin: string;
}

/**
 * Resolve the chip + stalk geometry for a signed label offset. Mirrors the
 * legacy above-node math exactly for offset > 0.
 */
export const resolveLabelPlacement = (
  offset: number,
  expandDirection: ExpandDirection = 'CENTER'
): LabelPlacement => {
  if (offset < 0) {
    const length = -offset;
    return {
      isBelow: true,
      showStalk: true,
      stalkTop: 0,
      stalkLength: length,
      chipTop: length,
      // Chip grows downward from the stalk end.
      chipTranslateY: '0%',
      transformOrigin: 'top center'
    };
  }

  // Above the node (or exactly at it). BOTTOM lifts the chip fully above the
  // attachment point; CENTER straddles it (the ConnectorLabel case).
  const chipTranslateY = expandDirection === 'BOTTOM' ? '-100%' : '-50%';
  return {
    isBelow: false,
    showStalk: offset > 0,
    stalkTop: -offset,
    stalkLength: offset,
    chipTop: -offset,
    chipTranslateY,
    transformOrigin: 'bottom center'
  };
};

// Offset bounds — kept tight so a drag (or the Style slider) can't fling the
// label far off into empty canvas. Symmetric-ish around the node; the positive
// side keeps the legacy above-node maximum.
export const LABEL_OFFSET_MIN = -200;
export const LABEL_OFFSET_MAX = 280;

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

export const clampLabelOffset = (offset: number): number =>
  clamp(offset, LABEL_OFFSET_MIN, LABEL_OFFSET_MAX);

/**
 * New signed offset after dragging the label by `pointerDeltaScreenY` screen px
 * (down = positive). Screen px convert to canvas px by `/ zoom` since the label
 * lives inside the zoom-scaled SceneLayer. Dragging down lowers the label
 * (offset decreases, crossing zero into below-node), clamped to the bounds.
 */
export const resolveDraggedOffset = ({
  startOffset,
  pointerDeltaScreenY,
  zoom
}: {
  startOffset: number;
  pointerDeltaScreenY: number;
  zoom: number;
}): number => {
  if (zoom <= 0) return startOffset;
  return clampLabelOffset(startOffset - pointerDeltaScreenY / zoom);
};
