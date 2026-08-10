/**
 * Promoted from the F4 explore lane (ADR 0047 flip rule) — LAY-01.
 *
 * The Layers panel looked like it controlled paint order for every element type
 * and controlled it for exactly one: only the node layers keyed their sort on
 * `resolveRenderOrder`. `LabelsCanvas` and `Rectangles` sorted on `zIndex`
 * alone, so reordering two layers left their chips and areas byte-identical.
 *
 * These pin the KEY those layers now share. The behavioural half — that the
 * rendered order actually follows it — lives in the e2e layer specs; a pure
 * test cannot see a canvas.
 *
 * NOTE this does not cross entity TYPES: rectangles still paint structurally
 * under nodes (SceneLayer order). That is GPU-13, a separate design-gated item.
 */
import { resolveRenderOrder, findLayer } from '../renderOrder';
import type { Layer } from 'src/types';

const LAYERS: Layer[] = [
  { id: 'bottom', name: 'Bottom', visible: true, locked: false, order: 0 },
  { id: 'top', name: 'Top', visible: true, locked: false, order: 1 }
];

/** Exactly the comparator LabelsCanvas / Rectangles now use. */
const byRenderOrder = (
  a: { layerId?: string; zIndex?: number },
  b: { layerId?: string; zIndex?: number }
) =>
  resolveRenderOrder(findLayer(a.layerId, LAYERS)?.order ?? 0, a.zIndex ?? 0, 0) -
  resolveRenderOrder(findLayer(b.layerId, LAYERS)?.order ?? 0, b.zIndex ?? 0, 0);

describe('LAY-01 — the layer stack dominates the per-element z-index', () => {
  it('a bottom-layer element with a huge zIndex still sorts under a top-layer one', () => {
    const bottom = { layerId: 'bottom', zIndex: 99 };
    const top = { layerId: 'top', zIndex: 0 };
    expect(byRenderOrder(bottom, top)).toBeLessThan(0);
  });

  it('within one layer, zIndex still decides', () => {
    const lower = { layerId: 'top', zIndex: 1 };
    const higher = { layerId: 'top', zIndex: 2 };
    expect(byRenderOrder(lower, higher)).toBeLessThan(0);
  });

  it('an unassigned element sorts as layer order 0', () => {
    const unassigned = { zIndex: 0 };
    const top = { layerId: 'top', zIndex: 0 };
    const bottom = { layerId: 'bottom', zIndex: 0 };
    expect(byRenderOrder(unassigned, top)).toBeLessThan(0);
    expect(byRenderOrder(unassigned, bottom)).toBe(0);
  });

  it('CONTROL: a zIndex-only comparator CANNOT tell the two layers apart — the bug', () => {
    const byZIndexOnly = (
      a: { zIndex?: number },
      b: { zIndex?: number }
    ) => (a.zIndex ?? 0) - (b.zIndex ?? 0);
    const bottom = { layerId: 'bottom', zIndex: 0 };
    const top = { layerId: 'top', zIndex: 0 };
    expect(byZIndexOnly(bottom, top)).toBe(0);
    // …while the shared key does.
    expect(byRenderOrder(bottom, top)).toBeLessThan(0);
  });

  it('swapping the two layers swaps the elements on them', () => {
    const swapped: Layer[] = [
      { ...LAYERS[0], order: 1 },
      { ...LAYERS[1], order: 0 }
    ];
    const key = (r: { layerId?: string; zIndex?: number }, ls: Layer[]) =>
      resolveRenderOrder(findLayer(r.layerId, ls)?.order ?? 0, r.zIndex ?? 0, 0);
    const a = { layerId: 'bottom', zIndex: 0 };
    const b = { layerId: 'top', zIndex: 0 };
    expect(key(a, LAYERS) < key(b, LAYERS)).toBe(true);
    expect(key(a, swapped) < key(b, swapped)).toBe(false);
  });
});
