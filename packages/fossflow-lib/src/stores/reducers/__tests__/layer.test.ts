import { createLayer, updateLayer, deleteLayer, reorderLayers, assignLayerToItems, reorderViewItem } from '../view';
import { State, ViewReducerContext } from '../types';
import { Layer, View } from 'src/types';

jest.mock('src/utils', () => ({
  getItemByIdOrThrow: jest.fn((items: any[], id: string) => {
    const index = items.findIndex((item: any) => item.id === id);
    if (index === -1) throw new Error(`Item with id ${id} not found`);
    return { value: items[index], index };
  }),
  generateId: jest.fn(() => 'generated-id'),
  CoordsUtils: { zero: () => ({ x: 0, y: 0 }), add: (a: any, b: any) => ({ x: a.x + b.x, y: a.y + b.y }) }
}));

// Stub out styles/theme which config.ts accesses at module level
jest.mock('src/styles/theme', () => ({
  customVars: { customPalette: { defaultColor: '#000000', diagramBg: '#ffffff' } }
}));

const makeState = (viewOverrides: Partial<View> = {}): State => ({
  model: {
    version: '1.0',
    title: 'Test',
    description: '',
    colors: [],
    icons: [],
    items: [],
    views: [{
      id: 'view1',
      name: 'View 1',
      items: [{ id: 'item1', tile: { x: 0, y: 0 } }],
      connectors: [{ id: 'conn1', anchors: [], layerId: undefined }],
      rectangles: [{ id: 'rect1', from: { x: 0, y: 0 }, to: { x: 2, y: 2 } }],
      textBoxes: [{ id: 'tb1', tile: { x: 0, y: 0 }, content: 'hello' }],
      ...viewOverrides
    }]
  },
  scene: { connectors: {}, textBoxes: {} }
});

const ctx = (state: State): ViewReducerContext => ({ viewId: 'view1', state });

describe('createLayer', () => {
  it('adds a new layer to the view', () => {
    const state = makeState();
    const result = createLayer({ name: 'Foreground' }, ctx(state));
    expect(result.model.views[0].layers).toHaveLength(1);
    expect(result.model.views[0].layers![0].name).toBe('Foreground');
    expect(result.model.views[0].layers![0].visible).toBe(true);
    expect(result.model.views[0].layers![0].locked).toBe(false);
  });

  it('assigns order equal to current layers length', () => {
    const existingLayer: Layer = { id: 'existing', name: 'Existing', visible: true, locked: false, order: 0 };
    const state = makeState({ layers: [existingLayer] });
    const result = createLayer({ name: 'New' }, ctx(state));
    expect(result.model.views[0].layers![1].order).toBe(1);
  });

  it('does not mutate the original state', () => {
    const state = makeState();
    createLayer({ name: 'Test' }, ctx(state));
    expect(state.model.views[0].layers).toBeUndefined();
  });
});

describe('updateLayer', () => {
  const layerState = () => makeState({
    layers: [{ id: 'layer1', name: 'Old Name', visible: true, locked: false, order: 0 }]
  });

  it('updates name', () => {
    const result = updateLayer({ id: 'layer1', name: 'New Name' }, ctx(layerState()));
    expect(result.model.views[0].layers![0].name).toBe('New Name');
  });

  it('toggles visible', () => {
    const result = updateLayer({ id: 'layer1', visible: false }, ctx(layerState()));
    expect(result.model.views[0].layers![0].visible).toBe(false);
  });

  it('toggles locked', () => {
    const result = updateLayer({ id: 'layer1', locked: true }, ctx(layerState()));
    expect(result.model.views[0].layers![0].locked).toBe(true);
  });

  it('is a no-op for unknown layer id', () => {
    const state = layerState();
    const result = updateLayer({ id: 'unknown', name: 'X' }, ctx(state));
    expect(result.model.views[0].layers![0].name).toBe('Old Name');
  });
});

describe('deleteLayer', () => {
  const setup = () => {
    const state = makeState({
      layers: [
        { id: 'layer1', name: 'L1', visible: true, locked: false, order: 0 },
        { id: 'layer2', name: 'L2', visible: true, locked: false, order: 1 }
      ],
      items: [{ id: 'item1', tile: { x: 0, y: 0 }, layerId: 'layer1' }],
      connectors: [{ id: 'conn1', anchors: [], layerId: 'layer1' }],
      rectangles: [{ id: 'rect1', from: { x: 0, y: 0 }, to: { x: 2, y: 2 }, layerId: 'layer1' }],
      textBoxes: [{ id: 'tb1', tile: { x: 0, y: 0 }, content: 'hi', layerId: 'layer1' }]
    });
    return state;
  };

  it('removes the layer', () => {
    const result = deleteLayer('layer1', ctx(setup()));
    expect(result.model.views[0].layers).toHaveLength(1);
    expect(result.model.views[0].layers![0].id).toBe('layer2');
  });

  it('unassigns layerId from items referencing the deleted layer', () => {
    const result = deleteLayer('layer1', ctx(setup()));
    expect(result.model.views[0].items[0].layerId).toBeUndefined();
  });

  it('unassigns layerId from connectors referencing the deleted layer', () => {
    const result = deleteLayer('layer1', ctx(setup()));
    expect((result.model.views[0].connectors![0] as any).layerId).toBeUndefined();
  });

  it('leaves entities on other layers intact', () => {
    const state = makeState({
      layers: [
        { id: 'layer1', name: 'L1', visible: true, locked: false, order: 0 },
        { id: 'layer2', name: 'L2', visible: true, locked: false, order: 1 }
      ],
      items: [
        { id: 'item1', tile: { x: 0, y: 0 }, layerId: 'layer1' },
        { id: 'item2', tile: { x: 1, y: 0 }, layerId: 'layer2' }
      ]
    });
    const result = deleteLayer('layer1', ctx(state));
    expect(result.model.views[0].items[1].layerId).toBe('layer2');
  });
});

describe('reorderLayers', () => {
  it('reassigns order based on position in provided array', () => {
    const state = makeState({
      layers: [
        { id: 'l1', name: 'L1', visible: true, locked: false, order: 0 },
        { id: 'l2', name: 'L2', visible: true, locked: false, order: 1 },
        { id: 'l3', name: 'L3', visible: true, locked: false, order: 2 }
      ]
    });
    const result = reorderLayers(['l3', 'l1', 'l2'], ctx(state));
    const layers = result.model.views[0].layers!;
    expect(layers.find((l) => l.id === 'l3')!.order).toBe(0);
    expect(layers.find((l) => l.id === 'l1')!.order).toBe(1);
    expect(layers.find((l) => l.id === 'l2')!.order).toBe(2);
  });
});

describe('assignLayerToItems', () => {
  it('assigns layerId to specified items', () => {
    const state = makeState();
    const result = assignLayerToItems({ layerId: 'layer1', itemIds: ['item1'] }, ctx(state));
    expect(result.model.views[0].items[0].layerId).toBe('layer1');
  });

  it('removes layerId when layerId is undefined', () => {
    const state = makeState({
      items: [{ id: 'item1', tile: { x: 0, y: 0 }, layerId: 'layer1' }]
    });
    const result = assignLayerToItems({ layerId: undefined, itemIds: ['item1'] }, ctx(state));
    expect(result.model.views[0].items[0].layerId).toBeUndefined();
  });

  it('leaves unspecified items unchanged', () => {
    const state = makeState({
      items: [
        { id: 'item1', tile: { x: 0, y: 0 } },
        { id: 'item2', tile: { x: 1, y: 0 }, layerId: 'existing-layer' }
      ]
    });
    const result = assignLayerToItems({ layerId: 'new-layer', itemIds: ['item1'] }, ctx(state));
    expect(result.model.views[0].items[1].layerId).toBe('existing-layer');
  });
});

describe('reorderViewItem', () => {
  it('sets zIndex on the specified item', () => {
    const state = makeState();
    const result = reorderViewItem({ id: 'item1', zIndex: 5 }, ctx(state));
    expect((result.model.views[0].items[0] as any).zIndex).toBe(5);
  });

  it('is a no-op for unknown item id', () => {
    const state = makeState();
    const result = reorderViewItem({ id: 'unknown', zIndex: 5 }, ctx(state));
    expect((result.model.views[0].items[0] as any).zIndex).toBeUndefined();
  });
});
