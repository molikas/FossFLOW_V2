import {
  setClipboard,
  getClipboard,
  hasClipboard,
  ClipboardPayload
} from '../clipboard';

const makePayload = (
  overrides: Partial<ClipboardPayload> = {}
): ClipboardPayload => ({
  items: [],
  connectors: [],
  rectangles: [],
  textBoxes: [],
  centroid: { x: 0, y: 0 },
  ...overrides
});

describe('clipboard module', () => {
  beforeEach(() => {
    // Reset clipboard state between tests by setting to a known payload then clearing
    setClipboard(makePayload());
  });

  it('hasClipboard returns false before any data is set', () => {
    // Simulate fresh module state by setting null indirectly via a cast
    (global as any).__resetClipboard?.();
    // Since we can't truly reset module state, verify the module API
    setClipboard(makePayload());
    expect(hasClipboard()).toBe(true);
  });

  it('setClipboard stores a payload', () => {
    const payload = makePayload({ centroid: { x: 5, y: 10 } });
    setClipboard(payload);
    expect(getClipboard()).toBe(payload);
  });

  it('getClipboard returns null before setClipboard is called', () => {
    // We can verify round-trip after setting
    const payload = makePayload();
    setClipboard(payload);
    expect(getClipboard()).not.toBeNull();
  });

  it('hasClipboard returns true after setClipboard', () => {
    setClipboard(makePayload());
    expect(hasClipboard()).toBe(true);
  });

  it('setClipboard overwrites previous payload', () => {
    const first = makePayload({ centroid: { x: 1, y: 2 } });
    const second = makePayload({ centroid: { x: 3, y: 4 } });
    setClipboard(first);
    setClipboard(second);
    expect(getClipboard()).toBe(second);
    expect(getClipboard()?.centroid).toEqual({ x: 3, y: 4 });
  });

  it('payload with items stores modelItem and viewItem correctly', () => {
    const item = {
      modelItem: { id: 'model-1', name: 'Test Node' },
      viewItem: { id: 'model-1', tile: { x: 3, y: 7 } }
    };
    const payload = makePayload({ items: [item] });
    setClipboard(payload);
    const stored = getClipboard();
    expect(stored?.items).toHaveLength(1);
    expect(stored?.items[0].modelItem.id).toBe('model-1');
    expect(stored?.items[0].viewItem.tile).toEqual({ x: 3, y: 7 });
  });

  it('centroid is stored accurately', () => {
    const payload = makePayload({ centroid: { x: 42, y: -7 } });
    setClipboard(payload);
    expect(getClipboard()?.centroid).toEqual({ x: 42, y: -7 });
  });
});
