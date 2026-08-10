/**
 * Promoted from the F4 explore lane (ADR 0047 flip rule) — LAY-05, implementing
 * the E2/RED-13 ruling (owner 2026-07-30): "Confirm with both outcomes —
 * deleting a non-empty layer asks 'Keep contents (unassign)' vs 'Delete
 * contents too', with an extra warning when the layer is hidden."
 *
 * The two entries are ONE change because they are one gesture. LAY-05's harm is
 * what makes RED-13's warning necessary: visibility derives as
 * `!layer || layer.visible` (`useLayerContext`), so an entity with NO layer is
 * UNCONDITIONALLY visible — unassigning the members of a hidden layer INVERTS
 * their visibility, and deleting a hidden layer revealed everything it was
 * hiding with no warning at all.
 *
 * Axoview layers are tags rather than owners, which is why the ruling took the
 * Visio pattern (ask) over AutoCAD's (refuse) or Photoshop's (delete silently).
 */
import { deleteLayer, describeLayerContents } from '../view';
import type { State, ViewReducerContext } from '../types';
import type { Layer, View } from 'src/types';

const VIEW_ID = 'view-1';

const layers = (hidden = false): Layer[] => [
  { id: 'l1', name: 'L1', visible: !hidden, locked: false, order: 0 },
  { id: 'l2', name: 'L2', visible: true, locked: false, order: 1 }
];

const stateWith = (opts: { hidden?: boolean } = {}): State =>
  ({
    model: {
      version: '1.0',
      title: 'F4',
      icons: [],
      colors: [],
      items: [{ id: 'n1', name: 'N1' }, { id: 'n2', name: 'N2' }],
      views: [
        {
          id: VIEW_ID,
          name: 'Page 1',
          layers: layers(opts.hidden),
          items: [
            { id: 'n1', tile: { x: 0, y: 0 }, layerId: 'l1' },
            { id: 'n2', tile: { x: 5, y: 5 }, layerId: 'l2' }
          ],
          rectangles: [
            { id: 'r1', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, layerId: 'l1' }
          ],
          labels: [{ id: 'lb1', text: 'x', tile: { x: 2, y: 2 }, layerId: 'l1' }],
          textBoxes: [],
          connectors: [
            {
              id: 'c1',
              color: 'c',
              layerId: 'l1',
              anchors: [
                { id: 'a1', ref: { item: 'n1' } },
                { id: 'a2', ref: { item: 'n2' } }
              ]
            },
            {
              id: 'c2',
              color: 'c',
              anchors: [
                { id: 'b1', ref: { tile: { x: 8, y: 8 } } },
                { id: 'b2', ref: { tile: { x: 9, y: 9 } } }
              ]
            }
          ]
        }
      ]
    },
    scene: { connectors: {}, textBoxes: {} }
  }) as unknown as State;

const ctx = (state: State): ViewReducerContext => ({ viewId: VIEW_ID, state });
const viewOf = (s: State) => s.model.views[0] as unknown as View;

describe('describeLayerContents — what the confirm dialog phrases itself from', () => {
  it('counts every entity type on the layer', () => {
    // n1 + r1 + lb1 + c1 = 4 on l1; n2 and c2 are elsewhere/unassigned.
    expect(describeLayerContents(viewOf(stateWith()), 'l1')).toEqual({
      count: 4,
      hidden: false
    });
  });

  it('reports an EMPTY layer, which is what lets the dialog be skipped', () => {
    const s = stateWith();
    expect(describeLayerContents(viewOf(s), 'l2').count).toBe(1);
    const empty = { ...viewOf(s), items: [], connectors: [], rectangles: [], labels: [], textBoxes: [] } as View;
    expect(describeLayerContents(empty, 'l1')).toEqual({
      count: 0,
      hidden: false
    });
  });

  it('reports HIDDEN — the LAY-05 warning case', () => {
    expect(describeLayerContents(viewOf(stateWith({ hidden: true })), 'l1'))
      .toEqual({ count: 4, hidden: true });
  });

  it('is safe on a missing view / unknown layer', () => {
    expect(describeLayerContents(undefined, 'l1')).toEqual({
      count: 0,
      hidden: false
    });
    expect(describeLayerContents(viewOf(stateWith()), 'ghost')).toEqual({
      count: 0,
      hidden: false
    });
  });
});

describe("deleteLayer contents: 'unassign' — the historical meaning", () => {
  const out = () =>
    viewOf(deleteLayer({ layerId: 'l1', contents: 'unassign' }, ctx(stateWith())));

  it('removes the layer and frees its members', () => {
    const v = out();
    expect((v.layers ?? []).map((l) => l.id)).toEqual(['l2']);
    expect(v.items?.find((i) => i.id === 'n1')?.layerId).toBeUndefined();
    expect(v.rectangles?.[0].layerId).toBeUndefined();
    expect(v.labels?.[0].layerId).toBeUndefined();
  });

  it('keeps every entity — nothing is destroyed', () => {
    const v = out();
    expect(v.items).toHaveLength(2);
    expect(v.connectors).toHaveLength(2);
    expect(v.rectangles).toHaveLength(1);
    expect(v.labels).toHaveLength(1);
  });

  it('leaves entities on OTHER layers alone', () => {
    expect(out().items?.find((i) => i.id === 'n2')?.layerId).toBe('l2');
  });

  it('a bare string payload still means unassign (back-compat)', () => {
    const v = viewOf(deleteLayer('l1', ctx(stateWith())));
    expect(v.items).toHaveLength(2);
    expect(v.items?.find((i) => i.id === 'n1')?.layerId).toBeUndefined();
  });
});

describe("deleteLayer contents: 'delete' — the Photoshop meaning (RED-13)", () => {
  const out = () =>
    viewOf(deleteLayer({ layerId: 'l1', contents: 'delete' }, ctx(stateWith())));

  it('removes the layer AND its members', () => {
    const v = out();
    expect((v.layers ?? []).map((l) => l.id)).toEqual(['l2']);
    expect(v.items?.map((i) => i.id)).toEqual(['n2']);
    expect(v.rectangles).toHaveLength(0);
    expect(v.labels).toHaveLength(0);
  });

  it('takes connectors ANCHORED to a deleted node with it', () => {
    // Dropping an ITEM and leaving its connector behind is E2/RED-07's shape:
    // an anchor pointing at nothing, permanently unroutable. `c1` is both on
    // the layer AND anchored to n1, so either rule would remove it — the
    // assertion that matters is that no anchor survives pointing at n1.
    const v = out();
    const anchoredToN1 = (v.connectors ?? []).some((c) =>
      c.anchors.some(
        (a) => (a.ref as { item?: string })?.item === 'n1'
      )
    );
    expect(anchoredToN1).toBe(false);
  });

  // E2/RED-07's class gets its own pin rather than coverage-by-side-effect: the
  // assertion above happens to hold because `c1` is ALSO on the deleted layer,
  // so it would still pass if the cascade were removed. This one cannot — its
  // connector is on NO layer and is anchored to a node that is, which is
  // exactly the case a layer-only filter misses.
  it('RED-07 PIN: a delete-with-contents leaves ZERO dangling anchors', () => {
    const s = stateWith();
    // A connector nobody assigned to the layer, anchored to a node that is on
    // it. PRECONDITION first, so a fixture that stopped setting this up could
    // not let the pin pass vacuously.
    const view = viewOf(s);
    view.connectors = [
      ...(view.connectors ?? []),
      {
        id: 'c3',
        color: 'c',
        anchors: [
          { id: 'd1', ref: { item: 'n1' } },
          { id: 'd2', ref: { tile: { x: 7, y: 7 } } }
        ]
      }
    ] as View['connectors'];
    const c3 = (view.connectors ?? []).find((c) => c.id === 'c3');
    expect(c3?.layerId).toBeUndefined();
    expect(
      (view.items ?? []).find((i) => i.id === 'n1')?.layerId
    ).toBe('l1');

    const after = viewOf(
      deleteLayer({ layerId: 'l1', contents: 'delete' }, ctx(s))
    );

    // The invariant, stated over the WHOLE view rather than over one connector:
    // every remaining item-anchor resolves to a surviving item.
    const surviving = new Set((after.items ?? []).map((i) => i.id));
    const dangling = (after.connectors ?? []).flatMap((c) =>
      c.anchors
        .map((a) => (a.ref as { item?: string })?.item)
        .filter((id): id is string => !!id && !surviving.has(id))
    );
    expect(dangling).toEqual([]);
    expect((after.connectors ?? []).map((c) => c.id)).toEqual(['c2']);
  });

  it('leaves an unrelated connector alone', () => {
    expect(out().connectors?.map((c) => c.id)).toEqual(['c2']);
  });

  it('normalises the remaining layer order (E2/RED-04 stays fixed)', () => {
    const v = out();
    expect((v.layers ?? []).map((l) => l.order)).toEqual([0]);
  });
});

describe('LAY-05 — the visibility inversion the warning exists for', () => {
  // The derivation `useLayerContext` uses, transcribed: an entity with NO layer
  // is unconditionally visible.
  const visible = (view: View, entityId: string): boolean => {
    const all = [
      ...(view.items ?? []),
      ...(view.rectangles ?? []),
      ...(view.labels ?? [])
    ] as { id: string; layerId?: string }[];
    const e = all.find((x) => x.id === entityId);
    if (!e) return false;
    const layer = (view.layers ?? []).find((l) => l.id === e.layerId);
    return !layer || layer.visible !== false;
  };

  it('PRECONDITION: a member of a hidden layer is hidden before the delete', () => {
    expect(visible(viewOf(stateWith({ hidden: true })), 'n1')).toBe(false);
  });

  it("'keep contents' on a HIDDEN layer makes its members visible — the harm, now warned about", () => {
    const v = viewOf(
      deleteLayer(
        { layerId: 'l1', contents: 'unassign' },
        ctx(stateWith({ hidden: true }))
      )
    );
    expect(visible(v, 'n1')).toBe(true);
    // Which is exactly why the dialog raises an Alert for this case rather than
    // letting the user discover it on the canvas.
    expect(
      describeLayerContents(viewOf(stateWith({ hidden: true })), 'l1').hidden
    ).toBe(true);
  });

  it("'delete contents' on a HIDDEN layer keeps them out of sight, by removing them", () => {
    const v = viewOf(
      deleteLayer(
        { layerId: 'l1', contents: 'delete' },
        ctx(stateWith({ hidden: true }))
      )
    );
    expect(v.items?.map((i) => i.id)).toEqual(['n2']);
    expect(visible(v, 'n1')).toBe(false);
  });
});
