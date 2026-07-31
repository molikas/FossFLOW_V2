// Touch / pen + trackpad gesture threshold (ADR 0018 Decision 5). Pixel-based,
// NOT tile-based — a tile-based threshold swallowed sub-tile trackpad drags (the
// `pointerType:'mouse'` precision-touchpad bug). A press that lifts within
// TAP_SLOP_PX is a tap; beyond it, a drag/pan.
//
// In a config module (mirroring config/hotkeys.ts), not inline constants, so the
// threshold is tunable in one place.

import { Coords } from 'src/types';

/** Max screen-pixel travel between pointerdown and pointerup for a tap. */
export const TAP_SLOP_PX = 8;

/**
 * How long a stationary press must be held before it counts as a long press
 * (→ the per-item context menu, or a marquee lasso on empty canvas; ADR 0027 §2).
 *
 * Lives here rather than inside the gesture machine because it is not the only
 * consumer: the label hit-proxies own their own presses (ADR 0031 §4 — chips are
 * outside the tile hit-test), so they have to time the same hold themselves.
 * Two hard-coded delays would let the chip's menu and the node's menu open at
 * visibly different moments (I2/TCH-09).
 */
export const LONG_PRESS_MS = 450;

/**
 * True when the pointer has travelled beyond the tap slop radius — i.e. the
 * gesture is a drag/pan, not a tap. Pure + zoom-independent (operates on raw
 * screen pixels), so it is the single drag-start classifier for every mode
 * (mouse drag-start in Cursor, and touch tap-vs-pan in the gesture machine).
 */
export const exceedsTapSlop = (
  from: Coords,
  to: Coords,
  slop: number = TAP_SLOP_PX
): boolean => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return dx * dx + dy * dy > slop * slop;
};
