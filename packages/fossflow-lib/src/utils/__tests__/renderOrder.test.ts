import { resolveRenderOrder, findLayer } from '../renderOrder';
import { Layer } from 'src/types';

const makeLayer = (overrides: Partial<Layer> = {}): Layer => ({
  id: 'l1',
  name: 'Layer 1',
  visible: true,
  locked: false,
  order: 0,
  ...overrides
});

describe('resolveRenderOrder', () => {
  it('returns isoDepth alone when layer and zIndex are both 0', () => {
    expect(resolveRenderOrder(0, 0, -5)).toBe(-5);
  });

  it('layer bucket dominates over zIndex and isoDepth', () => {
    const higher = resolveRenderOrder(2, 0, 0);
    const lower  = resolveRenderOrder(1, 999, 999);
    expect(higher).toBeGreaterThan(lower);
  });

  it('within same layer, explicit zIndex dominates over isoDepth', () => {
    const higher = resolveRenderOrder(0, 2, 0);
    const lower  = resolveRenderOrder(0, 1, 999);
    expect(higher).toBeGreaterThan(lower);
  });

  it('within same layer and zIndex, isoDepth acts as tiebreaker', () => {
    expect(resolveRenderOrder(0, 0, 5)).toBeGreaterThan(resolveRenderOrder(0, 0, 4));
  });

  it('two items at same position produce identical order', () => {
    expect(resolveRenderOrder(1, 2, -3)).toBe(resolveRenderOrder(1, 2, -3));
  });

  it('negative isoDepth values are handled correctly', () => {
    const a = resolveRenderOrder(0, 0, -10);
    const b = resolveRenderOrder(0, 0, 10);
    expect(b).toBeGreaterThan(a);
  });
});

describe('findLayer', () => {
  const layers: Layer[] = [
    makeLayer({ id: 'a', name: 'A', order: 0 }),
    makeLayer({ id: 'b', name: 'B', order: 1 })
  ];

  it('returns the matching layer when found', () => {
    expect(findLayer('b', layers)?.name).toBe('B');
  });

  it('returns undefined when layerId is not found', () => {
    expect(findLayer('z', layers)).toBeUndefined();
  });

  it('returns undefined when layerId is undefined', () => {
    expect(findLayer(undefined, layers)).toBeUndefined();
  });

  it('returns undefined on empty layers array', () => {
    expect(findLayer('a', [])).toBeUndefined();
  });
});
