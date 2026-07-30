/**
 * R5 / OVL-02, OVL-14 — two DOM-overlay contracts that are pure enough to probe
 * at T1.
 *
 * OVL-02 — the ADR-0015 "keep labels readable" counter-scale is computed from
 *   the module CONSTANT `LABEL_BASE_FONT_PX` by both of its consumers
 *   (`ExpandableLabel`'s `--axoview-label-scale` and `NodesCanvas`'
 *   `u_counterScale`), so it never sees a node's own `labelFontSize`.
 *
 * OVL-14 — `handleArrowKey`'s `NUDGEABLE_TYPES` enumerates ITEM / RECTANGLE /
 *   TEXTBOX. Floating Labels (ADR 0031) landed later and are absent, so a
 *   selected Label falls through to the PAN branch.
 *
 * RIG NOTE: every `it.failing` is paired with a passing characterization that
 * asserts the observed end state, and each probe asserts its PRECONDITION (the
 * selection really holds a Label; the enlarged font really is above the floor)
 * so a probe whose setup silently didn't happen cannot masquerade as evidence.
 */
import { computeLabelCounterScale } from 'src/utils/labelScale';
import {
  LABEL_BASE_FONT_PX,
  LABEL_MIN_READABLE_PX,
  LABEL_MAX_COUNTER_SCALE
} from 'src/config/labelSettings';
import { handleArrowKey, KEYBOARD_PAN_SPEED } from 'src/interaction/handleArrowKey';
import type { ItemReference, State } from 'src/types';

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

// ---------------------------------------------------------------------------
// OVL-14 — a selected floating Label is not nudge-able
// ---------------------------------------------------------------------------

interface Calls {
  scroll: Array<{ x: number; y: number }>;
  begin: number;
  commit: number;
  itemUpdates: number;
  rectUpdates: number;
  textUpdates: number;
}

const makeUiState = (selectedIds: ItemReference[], calls: Calls) =>
  ({
    selectedIds,
    scroll: { position: { x: 0, y: 0 }, offset: { x: 0, y: 0 } },
    actions: {
      setScroll: ({ position }: { position: { x: number; y: number } }) => {
        calls.scroll.push(position);
      }
    }
  }) as unknown as State['uiState'];

const makeDeps = (calls: Calls) => ({
  getScene: () => ({
    items: [{ id: 'node-1', tile: { x: 0, y: 0 } }],
    rectangles: [{ id: 'rect-1', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }],
    textBoxes: [{ id: 'tb-1', tile: { x: 0, y: 0 } }]
  }),
  beginDragTransaction: () => {
    calls.begin += 1;
  },
  commitDragTransaction: () => {
    calls.commit += 1;
  },
  batchUpdateViewItemTiles: (u: unknown[]) => {
    calls.itemUpdates += u.length;
  },
  batchUpdateRectangles: (u: unknown[]) => {
    calls.rectUpdates += u.length;
  },
  batchUpdateTextBoxTiles: (u: unknown[]) => {
    calls.textUpdates += u.length;
  }
});

const freshCalls = (): Calls => ({
  scroll: [],
  begin: 0,
  commit: 0,
  itemUpdates: 0,
  rectUpdates: 0,
  textUpdates: 0
});

const arrow = (key: string) =>
  ({ key, preventDefault: () => undefined }) as unknown as KeyboardEvent;

describe('OVL-14 — arrow keys do not nudge a selected floating Label', () => {
  it('CONTROL: a selected ITEM is nudged and the canvas does NOT pan', () => {
    const calls = freshCalls();
    const ui = makeUiState([{ type: 'ITEM', id: 'node-1' }], calls);
    expect(handleArrowKey(arrow('ArrowRight'), ui, makeDeps(calls))).toBe(true);
    expect(calls.itemUpdates).toBe(1);
    expect(calls.begin).toBe(1);
    expect(calls.commit).toBe(1);
    expect(calls.scroll).toEqual([]);
  });

  it('CONTROL: a selected TEXTBOX is nudged too — the list is not item-only', () => {
    const calls = freshCalls();
    const ui = makeUiState([{ type: 'TEXTBOX', id: 'tb-1' }], calls);
    expect(handleArrowKey(arrow('ArrowRight'), ui, makeDeps(calls))).toBe(true);
    expect(calls.textUpdates).toBe(1);
    expect(calls.scroll).toEqual([]);
  });

  it('characterization: a selected LABEL pans the canvas instead of moving', () => {
    const calls = freshCalls();
    const ui = makeUiState([{ type: 'LABEL', id: 'label-1' }], calls);
    expect(handleArrowKey(arrow('ArrowRight'), ui, makeDeps(calls))).toBe(true);
    // Nothing moved…
    expect(calls.itemUpdates + calls.rectUpdates + calls.textUpdates).toBe(0);
    expect(calls.begin).toBe(0);
    // …and the CAMERA moved instead. (ARROW_PAN_VECTORS is authored
    // camera-style, so ArrowRight scrolls the viewport by -panSpeed.)
    expect(calls.scroll).toEqual([{ x: -KEYBOARD_PAN_SPEED, y: 0 }]);
  });

  it.failing('a selected Label should be nudged like every other placed entity', () => {
    const calls = freshCalls();
    const ui = makeUiState([{ type: 'LABEL', id: 'label-1' }], calls);
    handleArrowKey(arrow('ArrowRight'), ui, makeDeps(calls));
    expect(calls.scroll, 'the canvas must not pan').toEqual([]);
  });

  it.failing('and a mixed node+Label selection should move BOTH, not just the node', () => {
    const calls = freshCalls();
    const ui = makeUiState(
      [
        { type: 'ITEM', id: 'node-1' },
        { type: 'LABEL', id: 'label-1' }
      ],
      calls
    );
    handleArrowKey(arrow('ArrowRight'), ui, makeDeps(calls));
    expect(calls.itemUpdates + calls.rectUpdates + calls.textUpdates).toBe(2);
  });

  it('characterization: a mixed selection silently moves only the node — the Label is left behind', () => {
    const calls = freshCalls();
    const ui = makeUiState(
      [
        { type: 'ITEM', id: 'node-1' },
        { type: 'LABEL', id: 'label-1' }
      ],
      calls
    );
    handleArrowKey(arrow('ArrowRight'), ui, makeDeps(calls));
    expect(calls.itemUpdates).toBe(1);
    expect(calls.scroll).toEqual([]);
  });
});
