/**
 * R1 / PROJ-01, PROJ-02, PROJ-03, PROJ-04 — the projected-bounds family.
 *
 * `getProjectBounds` → `getUnprojectedBounds` → `getFitToViewParams` is the
 * chain behind fit-to-view AND the Export-Image sizing. It has zero tests.
 *
 * RIG NOTE (COLDSTART "Rig traps"): every `it.failing` below is paired with a
 * passing characterization that positively asserts the observed numbers, and
 * every probe asserts its PRECONDITION first (that the text box really is N
 * rows tall, that the label really is outside the item bounds, …) so a probe
 * whose setup silently didn't happen cannot masquerade as evidence.
 *
 * jsdom has no canvas 2D context and `getTextBoxDimensions` throws without one
 * — `installCanvasStub()` runs first (campaign trap #1).
 */
import { installCanvasStub } from 'src/__explore__/canvasStub';

installCanvasStub();

// eslint-disable-next-line import/first
import {
  getProjectBounds,
  getUnprojectedBounds,
  getFitToViewParams
} from 'src/utils/renderer';
// eslint-disable-next-line import/first
import { getTextBoxEndTile, getBoundingBoxSize, sortByPosition } from 'src/utils/isoMath';
// eslint-disable-next-line import/first
import { getTextBoxDimensions } from 'src/utils/isoMath';
// eslint-disable-next-line import/first
import { makeTilePositionFn, getStrategy } from 'src/utils/coordinateTransforms';
// eslint-disable-next-line import/first
import { PROJECT_BOUNDING_BOX_PADDING } from 'src/config';
// eslint-disable-next-line import/first
import { viewWith, textBox, label, item } from './harness';

const isoTilePos = makeTilePositionFn(getStrategy('ISOMETRIC'));

/** Tile-space bounds actually returned by getProjectBounds (padding included). */
const tileBounds = (view: Parameters<typeof getProjectBounds>[0]) => {
  const box = getProjectBounds(view);
  const s = sortByPosition(box);
  return { lowX: s.lowX, highX: s.highX, lowY: s.lowY, highY: s.highY };
};

// ---------------------------------------------------------------------------
// PROJ-01 — a text box's tile extent is added in the WRONG Y direction
// ---------------------------------------------------------------------------

describe('PROJ-01 — getProjectBounds extends a text box the wrong way in Y', () => {
  // A 6-line box. `content` is HTML so countHtmlLines counts blocks; the canvas
  // stub makes measurement deterministic.
  const SIX_LINES = '<p>a</p><p>b</p><p>c</p><p>d</p><p>e</p><p>f</p>';
  const tb = textBox({ id: 'tb1', tile: { x: 0, y: 0 }, content: SIX_LINES });

  it('PRECONDITION: the box really is multi-row and grows to DECREASING tile y', () => {
    const size = getTextBoxDimensions(tb);
    expect(size.height).toBeGreaterThan(1);
    const end = getTextBoxEndTile(tb, size);
    // The authoritative end tile is BELOW the anchor (smaller tile y).
    expect(end.y).toBeLessThan(tb.tile.y);
    expect(end.y).toBe(tb.tile.y - (size.height - 1));
  });

  it('characterization: the bounds extend ABOVE the anchor and stop AT it below', () => {
    const size = getTextBoxDimensions(tb);
    const b = tileBounds(viewWith({ textBoxes: [tb] }));
    const P = PROJECT_BOUNDING_BOX_PADDING;

    // Observed: highY = tile.y + size.height + padding (empty space above),
    // lowY = tile.y - padding (the box's own rows below are NOT covered).
    expect(b.highY).toBe(tb.tile.y + size.height + P);
    expect(b.lowY).toBe(tb.tile.y - P);
  });

  it.failing('BUG: the box\'s own bottom row lies outside the project bounds', () => {
    const size = getTextBoxDimensions(tb);
    const end = getTextBoxEndTile(tb, size);
    const b = tileBounds(viewWith({ textBoxes: [tb] }));
    // The rendered bottom row must be inside the frame fit-to-view / export use.
    expect(b.lowY).toBeLessThanOrEqual(end.y);
  });

  it.failing('BUG: the bounds pad empty space ABOVE a text box that grows down', () => {
    const size = getTextBoxDimensions(tb);
    const b = tileBounds(viewWith({ textBoxes: [tb] }));
    // Nothing is drawn above tile.y, so highY must not exceed tile.y + padding.
    expect(b.highY).toBeLessThanOrEqual(tb.tile.y + PROJECT_BOUNDING_BOX_PADDING);
  });

  it('the same sign error is what makes the miss GROW with row count', () => {
    const short = textBox({ id: 's', tile: { x: 0, y: 0 }, content: '<p>a</p>' });
    const tall = textBox({
      id: 't',
      tile: { x: 0, y: 0 },
      content: '<p>a</p>'.repeat(20)
    });
    const shortSize = getTextBoxDimensions(short);
    const tallSize = getTextBoxDimensions(tall);
    expect(tallSize.height).toBeGreaterThan(shortSize.height);

    const shortMiss =
      tileBounds(viewWith({ textBoxes: [short] })).lowY -
      getTextBoxEndTile(short, shortSize).y;
    const tallMiss =
      tileBounds(viewWith({ textBoxes: [tall] })).lowY -
      getTextBoxEndTile(tall, tallSize).y;
    // Positive miss = rows below the bounds. It scales with the box height.
    expect(tallMiss).toBeGreaterThan(shortMiss);
  });
});

// ---------------------------------------------------------------------------
// PROJ-02 — floating labels are not in the project bounds at all
// ---------------------------------------------------------------------------

describe('PROJ-02 — getProjectBounds ignores floating labels', () => {
  const view = viewWith({
    items: [item('i1', { x: 0, y: 0 })],
    labels: [label({ id: 'lab1', tile: { x: 40, y: 40 } })]
  });

  it('PRECONDITION: the view really carries a label far outside the item bounds', () => {
    expect(view.labels).toHaveLength(1);
    expect(view.labels![0].tile).toEqual({ x: 40, y: 40 });
    expect(view.items).toHaveLength(1);
  });

  it('characterization: the bounds are exactly the single item ± padding', () => {
    const b = tileBounds(view);
    const P = PROJECT_BOUNDING_BOX_PADDING;
    expect(b).toEqual({ lowX: -P, highX: P, lowY: -P, highY: P });
  });

  it.failing('BUG: a label at (40,40) is outside the project bounds', () => {
    const b = tileBounds(view);
    expect(b.highX).toBeGreaterThanOrEqual(40);
    expect(b.highY).toBeGreaterThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// PROJ-03 — the ADR-0023 offset is not composed into the projected bounds
// ---------------------------------------------------------------------------

// VERDICT: FALSIFIED. The composition IS omitted (first two tests), but the
// predicted *clipping* never happens: PROJECT_BOUNDING_BOX_PADDING is 3 TILES
// on every side, which is ~424 px in iso x — an order of magnitude more than
// the largest residual a drag can leave (half a tile). The omission is a latent
// invariant gap, not a reachable defect. Recorded so a future padding change
// (or a padding-free consumer) re-opens it.
describe('PROJ-03 — projected bounds ignore the off-grid offset', () => {
  const OFFSET = { x: 70, y: 40 }; // ~half an iso tile — the max a drag can leave
  const snapped = viewWith({ items: [item('i1', { x: 3, y: 3 })] });
  const offGrid = viewWith({ items: [item('i1', { x: 3, y: 3 }, OFFSET)] });

  it('PRECONDITION: the two views differ only by the item offset', () => {
    expect(offGrid.items[0].offset).toEqual(OFFSET);
    expect(snapped.items[0].offset).toBeUndefined();
    expect(offGrid.items[0].tile).toEqual(snapped.items[0].tile);
  });

  it('the offset is NOT composed — the two views give identical bounds', () => {
    expect(getUnprojectedBounds(offGrid, isoTilePos)).toEqual(
      getUnprojectedBounds(snapped, isoTilePos)
    );
  });

  it('…but the 3-tile padding fully absorbs it, so nothing is ever clipped', () => {
    const bounds = getUnprojectedBounds(offGrid, isoTilePos);
    const rendered = isoTilePos({ tile: { x: 3, y: 3 } });
    const drawn = { x: rendered.x + OFFSET.x, y: rendered.y + OFFSET.y };
    expect(drawn.x).toBeGreaterThan(bounds.x);
    expect(drawn.x).toBeLessThan(bounds.x + bounds.width);
    expect(drawn.y).toBeGreaterThan(bounds.y);
    expect(drawn.y).toBeLessThan(bounds.y + bounds.height);
    // Margin left over on the tightest side is still many times the residual.
    expect(bounds.x + bounds.width - drawn.x).toBeGreaterThan(2 * OFFSET.x);
  });
});

// ---------------------------------------------------------------------------
// PROJ-04 — pixel positions fed through a tile-count sizer
// ---------------------------------------------------------------------------

describe('PROJ-04 — getUnprojectedBounds adds the tile-count +1 to a pixel size', () => {
  const view = viewWith({
    items: [item('a', { x: 0, y: 0 }), item('b', { x: 10, y: 6 })]
  });

  it('PRECONDITION: getBoundingBoxSize is the inclusive tile-COUNT helper', () => {
    // Two tiles one apart span 2 tiles — the +1 is correct for tiles.
    expect(getBoundingBoxSize([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toEqual({
      width: 2,
      height: 1
    });
  });

  it('characterization: reported size is exactly (px extent + 1) on both axes', () => {
    const bounds = getUnprojectedBounds(view, isoTilePos);
    const corners = getProjectBounds(view).map((c) => isoTilePos({ tile: c }));
    const s = sortByPosition(corners);
    expect(bounds.width).toBeCloseTo(s.highX - s.lowX + 1, 9);
    expect(bounds.height).toBeCloseTo(s.highY - s.lowY + 1, 9);
  });

  it.failing('BUG: the reported px size is 1px larger than the projected extent', () => {
    const bounds = getUnprojectedBounds(view, isoTilePos);
    const corners = getProjectBounds(view).map((c) => isoTilePos({ tile: c }));
    const s = sortByPosition(corners);
    expect(bounds.width).toBeCloseTo(s.highX - s.lowX, 9);
  });

  it('the +1 also leaks into the fit-to-view zoom', () => {
    const viewport = { width: 1000, height: 800 };
    const { zoom } = getFitToViewParams(view, viewport, isoTilePos);
    const bounds = getUnprojectedBounds(view, isoTilePos);
    expect(zoom).toBeCloseTo(
      Math.min(viewport.width / bounds.width, viewport.height / bounds.height),
      9
    );
  });
});
