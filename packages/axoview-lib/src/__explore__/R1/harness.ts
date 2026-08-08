/**
 * Shared T1 harness for area R1 probes
 * (docs/reviews/exploratory-2026-07/areas/R1-projection-transforms.md).
 *
 * R1's subjects are pure functions — the two CoordinateTransformStrategy
 * objects, renderedGeometry's composition helpers and renderer.ts's projected
 * bounds. No React tree is needed for most of them; what IS needed is a
 * well-formed `View` to feed `getProjectBounds` / `getUnprojectedBounds`.
 *
 * Not a spec file — `jest.explore.config.js` only matches `*.explore.test.ts`.
 */
import type { View, TextBox, Label, Rectangle } from 'src/types';

export const VIEW_ID = 'view-r1';

/** A view with nothing in it — every collection present and empty. */
export const emptyView = (): View => ({
  id: VIEW_ID,
  name: 'Page 1',
  items: [],
  connectors: [],
  rectangles: [],
  textBoxes: [],
  labels: [],
  lastUpdated: '2026-07-29T00:00:00.000Z'
});

export const viewWith = (parts: Partial<View>): View => ({
  ...emptyView(),
  ...parts
});

export const textBox = (parts: Partial<TextBox> & { id: string }): TextBox =>
  ({
    tile: { x: 0, y: 0 },
    content: 'x',
    orientation: 'X',
    ...parts
  }) as TextBox;

export const label = (parts: Partial<Label> & { id: string }): Label =>
  ({
    text: 'L',
    tile: { x: 0, y: 0 },
    ...parts
  }) as Label;

export const rectangle = (
  parts: Partial<Rectangle> & { id: string }
): Rectangle =>
  ({
    from: { x: 0, y: 0 },
    to: { x: 1, y: 1 },
    ...parts
  }) as Rectangle;

/** A view item positioned at `tile`, optionally off-grid by `offset`. */
export const item = (id: string, tile: { x: number; y: number }, offset?: { x: number; y: number }) =>
  ({ id, tile, ...(offset ? { offset } : {}) }) as View['items'][number];
