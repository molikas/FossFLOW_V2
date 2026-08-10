// "Was this released over the canvas?" — one answer, for every drop path.
//
// The 2026-07 campaign's I5 carry-forward note put it plainly: the question was
// asked three ways and answered right once. The MOUSE placement modes
// (`PlaceIcon` / `TextBox` / `Label`) asked nothing at all and committed on the
// tap-slop `moved` flag alone, so a palette drag released back over the Elements
// panel dropped an element at the tile *behind* the panel (I5/CTX-01). The TOUCH
// palette path asked `rendererEl.getBoundingClientRect()` containment, which
// calls every overlaying panel "canvas" because the panels sit INSIDE the
// renderer's rect (I2/TCH-05: renderer rect {0,46,1280,674} contains the panel
// icon at x:61). Only `isRendererInteraction` — an event-target identity test —
// was correct, and it is unavailable to a release whose target is the panel.
//
// `document.elementFromPoint` is the missing tool: it is a real hit-test, so it
// respects stacking and returns the PANEL for a point over the panel even though
// that point is inside the renderer's rect. It is also unaffected by pointer
// capture (capture retargets *events*, not the DOM hit-test), which is what the
// old "a hit-test can't help here" note in `PlaceIcon.mouseup` got wrong.

/**
 * Is the viewport point (client coordinates) over the canvas rather than over a
 * panel, dock or dialog drawn on top of it?
 *
 * Returns false when there is no renderer, no `document` (SSR), or the point
 * resolves to nothing (outside the viewport) — refusing the drop is the safe
 * answer for all three.
 */
export const isPointOverCanvas = (
  rendererEl: Element | null | undefined,
  clientX: number,
  clientY: number
): boolean => {
  if (!rendererEl || typeof document === 'undefined') return false;
  if (typeof document.elementFromPoint !== 'function') return false;
  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit) return false;
  return rendererEl === hit || rendererEl.contains(hit);
};

/**
 * The client-coordinate point for a `uiState.mouse` position.
 *
 * `getMouse` stores `position.screen` relative to the interactions box
 * (`clientX - rect.left`), so a mode holding only `uiState` cannot call
 * {@link isPointOverCanvas} directly. `State.rendererRef` is the same element
 * `getMouse` measured against, which makes the conversion exact.
 */
export const mouseClientPoint = (
  rendererEl: Element | null | undefined,
  screen: { x: number; y: number }
): { x: number; y: number } | null => {
  if (!rendererEl) return null;
  const rect = rendererEl.getBoundingClientRect();
  return { x: rect.left + screen.x, y: rect.top + screen.y };
};

/**
 * The drop gate the three mouse placement modes share.
 *
 * `isRendererInteraction` is authoritative when it is true — the release really
 * landed on the interactions box. It is false for a drag that started on a
 * palette icon (the release retargets to the icon), which is why those modes
 * fell back to "did the pointer travel?". That fallback is the bug: travelling
 * and *ending over the canvas* are different questions, and only the second one
 * licenses a placement.
 */
export const isCanvasDrop = (
  rendererEl: Element | null | undefined,
  isRendererInteraction: boolean,
  screen: { x: number; y: number },
  moved: boolean
): boolean => {
  if (isRendererInteraction) return true;
  if (!moved) return false;
  const point = mouseClientPoint(rendererEl, screen);
  return !!point && isPointOverCanvas(rendererEl, point.x, point.y);
};
