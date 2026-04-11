import { fixModel, modelFromModelStore } from '../model';
import type { Model, ModelStore } from 'src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeConnector(id: string, anchors: any[] = []) {
  return { id, anchors, color: 'color-1' };
}

function makeView(id: string, connectors: any[] = []) {
  return {
    id,
    name: 'View',
    items: [],
    connectors,
    textBoxes: [],
    rectangles: []
  };
}

function makeModel(overrides: Partial<Model> = {}): Model {
  return {
    version: '1.0',
    title: 'Test',
    description: '',
    colors: [{ id: 'color-1', value: '#ffffff' }],
    icons: [],
    items: [],
    views: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// fixModel — CONNECTOR_TOO_FEW_ANCHORS
// ---------------------------------------------------------------------------
describe('fixModel — CONNECTOR_TOO_FEW_ANCHORS', () => {
  it('returns the model unchanged when there are no validation issues', () => {
    const model = makeModel({
      views: [
        makeView('v1', [
          makeConnector('c1', [
            { id: 'a1', ref: { tile: { x: 1, y: 1 } } },
            { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
          ])
        ])
      ]
    }) as Model;

    const result = fixModel(model);
    expect(result.views[0].connectors).toHaveLength(1);
    expect(result.views[0].connectors![0].id).toBe('c1');
  });

  it('removes a connector that has zero anchors', () => {
    const model = makeModel({
      views: [makeView('v1', [makeConnector('bad-conn', [])])]
    }) as Model;

    const result = fixModel(model);
    expect(result.views[0].connectors).toHaveLength(0);
  });

  it('removes a connector that has only one anchor', () => {
    const model = makeModel({
      views: [
        makeView('v1', [
          makeConnector('single-anchor', [
            { id: 'a1', ref: { tile: { x: 0, y: 0 } } }
          ])
        ])
      ]
    }) as Model;

    const result = fixModel(model);
    expect(result.views[0].connectors).toHaveLength(0);
  });

  it('removes only the invalid connector, leaves valid ones intact', () => {
    const model = makeModel({
      views: [
        makeView('v1', [
          makeConnector('bad', []), // too few anchors
          makeConnector('good', [
            { id: 'a1', ref: { tile: { x: 1, y: 1 } } },
            { id: 'a2', ref: { tile: { x: 2, y: 2 } } }
          ])
        ])
      ]
    }) as Model;

    const result = fixModel(model);
    expect(result.views[0].connectors).toHaveLength(1);
    expect(result.views[0].connectors![0].id).toBe('good');
  });

  it('does not mutate the original model', () => {
    const original = makeModel({
      views: [makeView('v1', [makeConnector('bad', [])])]
    }) as Model;

    fixModel(original);
    expect(original.views[0].connectors).toHaveLength(1); // original unchanged
  });

  it('removes invalid connectors across multiple views', () => {
    const model = makeModel({
      views: [
        makeView('v1', [makeConnector('bad1', [])]),
        makeView('v2', [
          makeConnector('bad2', [{ id: 'a1', ref: { tile: { x: 0, y: 0 } } }])
        ])
      ]
    }) as Model;

    const result = fixModel(model);
    expect(result.views[0].connectors).toHaveLength(0);
    expect(result.views[1].connectors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// modelFromModelStore
// ---------------------------------------------------------------------------
describe('modelFromModelStore', () => {
  it('maps all required fields from the store', () => {
    const store: ModelStore = {
      version: '2.0',
      title: 'My Diagram',
      description: 'A test diagram',
      colors: [{ id: 'c1', value: '#000' }],
      icons: [
        { id: 'icon1', name: 'aws-s3', url: 'https://example.com/icon.svg' }
      ],
      items: [{ id: 'item1', name: 'S3 Bucket' }],
      views: [makeView('v1')],
      // ModelStore may have additional store-only fields
      actions: {} as any
    } as any;

    const result = modelFromModelStore(store);
    expect(result.version).toBe('2.0');
    expect(result.title).toBe('My Diagram');
    expect(result.description).toBe('A test diagram');
    expect(result.colors).toEqual(store.colors);
    expect(result.icons).toEqual(store.icons);
    expect(result.items).toEqual(store.items);
    expect(result.views).toEqual(store.views);
  });

  it('does not include store-only fields like actions', () => {
    const store = {
      version: '1.0',
      title: 'T',
      description: '',
      colors: [],
      icons: [],
      items: [],
      views: [],
      actions: { someAction: jest.fn() }
    } as any;

    const result = modelFromModelStore(store);
    expect((result as any).actions).toBeUndefined();
  });
});
