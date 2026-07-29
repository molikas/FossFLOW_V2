/**
 * E4 probes — what the load-time validation stack does NOT check.
 *
 *  CLIP-01  duplicate entity ids
 *  CLIP-02  anchor-to-anchor refs into a connector the load filter dropped
 *  CLIP-03  a connector with fewer than two anchors
 *
 * All three go through the real stack: `modelSchema.safeParse`, whose
 * `superRefine` runs `validateModel`. See
 * docs/exploratory/areas/E4-clipboard-schemas-load.md.
 */
import { modelSchema } from 'src/schemas/model';
import { validateView } from 'src/schemas/validation';
import { getItemByIdOrThrow, getConnectorPath } from 'src/utils';

const baseModel = (overrides: Record<string, unknown> = {}) => ({
  version: '1.0',
  title: 'E4 probe',
  icons: [{ id: 'block', name: 'Block', url: 'x', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [
    { id: 'node-A', name: 'A', icon: 'block' },
    { id: 'node-B', name: 'B', icon: 'block' }
  ],
  views: [
    {
      id: 'view-1',
      name: 'Page 1',
      items: [
        { id: 'node-A', tile: { x: 0, y: 0 } },
        { id: 'node-B', tile: { x: 5, y: 5 } }
      ],
      connectors: [],
      rectangles: [],
      textBoxes: []
    }
  ],
  ...overrides
});

// ---------------------------------------------------------------------------
// CLIP-01 — duplicate ids
// ---------------------------------------------------------------------------
describe('CLIP-01 — duplicate ids load clean', () => {
  it.failing('BUG: two model items sharing an id pass modelSchema', () => {
    const model = baseModel({
      items: [
        { id: 'node-A', name: 'First', icon: 'block' },
        { id: 'node-A', name: 'Second — same id', icon: 'block' },
        { id: 'node-B', name: 'B', icon: 'block' }
      ]
    });

    expect(modelSchema.safeParse(model).success).toBe(false);
  });

  it('characterization: the second item is unreachable — every lookup returns the first', () => {
    const model = baseModel({
      items: [
        { id: 'node-A', name: 'First', icon: 'block' },
        { id: 'node-A', name: 'Second — same id', icon: 'block' },
        { id: 'node-B', name: 'B', icon: 'block' }
      ]
    });

    expect(modelSchema.safeParse(model).success).toBe(true);
    expect(getItemByIdOrThrow(model.items, 'node-A').value.name).toBe('First');
    // No lookup in the codebase can ever address the second one.
  });

  it.failing('BUG: two VIEWS sharing an id pass modelSchema', () => {
    const model = baseModel();
    model.views = [model.views[0], { ...model.views[0], name: 'Clone' }];

    expect(modelSchema.safeParse(model).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CLIP-02 — anchor-to-anchor ref into a dropped connector
// ---------------------------------------------------------------------------
describe('CLIP-02 — one bad connector fails the whole load', () => {
  it('characterization: the model with a dangling anchor-to-anchor ref is rejected wholesale', () => {
    const model = baseModel();
    model.views[0].connectors = [
      // This one WOULD be dropped by the load-time filter (its anchor names an
      // item that is not in the view)…
      {
        id: 'conn-dropped',
        color: 'c1',
        anchors: [
          { id: 'dropped-a1', ref: { item: 'node-that-does-not-exist' } },
          { id: 'dropped-a2', ref: { item: 'node-B' } }
        ]
      },
      // …and this one references its anchor. The filter checks `ref.item` only,
      // so it survives — and then fails validation.
      {
        id: 'conn-survivor',
        color: 'c1',
        anchors: [
          { id: 'surv-a1', ref: { tile: { x: 2, y: 2 } } },
          { id: 'surv-a2', ref: { anchor: 'dropped-a2' } }
        ]
      }
    ] as never;

    // Simulate the load filter: drop connectors whose item refs don't resolve.
    const itemIds = new Set(model.views[0].items.map((i) => i.id));
    const filtered = (model.views[0].connectors as never[]).filter((c: never) =>
      ((c as { anchors: { ref: { item?: string } }[] }).anchors ?? []).every(
        (a) => (typeof a.ref.item === 'string' ? itemIds.has(a.ref.item) : true)
      )
    );
    expect(filtered.map((c: never) => (c as { id: string }).id)).toEqual([
      'conn-survivor'
    ]);

    model.views[0].connectors = filtered as never;

    // The whole diagram now fails to open — not just the one bad connector.
    const result = modelSchema.safeParse(model);
    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.error.issues.map((i) => i.message).join(' ')
    ).toMatch(/anchor/i);
  });

  it.failing(
    'BUG: a single unresolvable connector must not make the entire diagram unopenable',
    () => {
      const model = baseModel();
      model.views[0].connectors = [
        {
          id: 'conn-survivor',
          color: 'c1',
          anchors: [
            { id: 'surv-a1', ref: { tile: { x: 2, y: 2 } } },
            { id: 'surv-a2', ref: { anchor: 'anchor-that-is-gone' } }
          ]
        }
      ] as never;

      // The load path drops connectors with bad ITEM refs; it should treat a
      // bad ANCHOR ref the same way rather than failing the whole load.
      expect(modelSchema.safeParse(model).success).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// CLIP-03 — a connector with fewer than two anchors
// ---------------------------------------------------------------------------
describe('CLIP-03 — connectors with fewer than two anchors', () => {
  it('FALSIFIED: a 1-anchor connector is rejected', () => {
    const model = baseModel();
    model.views[0].connectors = [
      {
        id: 'conn-lonely',
        color: 'c1',
        anchors: [{ id: 'only-one', ref: { item: 'node-A' } }]
      }
    ] as never;

    // `connectorSchema.anchors` itself has only a `.max()`, but
    // `modelSchema.superRefine` runs `validateModel`, which rejects the
    // connector before the shape check would let it through.
    expect(modelSchema.safeParse(model).success).toBe(false);
  });

  it('FALSIFIED: a ZERO-anchor connector is rejected too', () => {
    const model = baseModel();
    model.views[0].connectors = [
      { id: 'conn-empty', color: 'c1', anchors: [] }
    ] as never;

    expect(modelSchema.safeParse(model).success).toBe(false);
  });

  it('characterization: the rejection comes from validateModel, not from the zod shape', () => {
    const model = baseModel();
    model.views[0].connectors = [
      {
        id: 'conn-lonely',
        color: 'c1',
        anchors: [{ id: 'only-one', ref: { item: 'node-A' } }]
      }
    ] as never;

    expect(modelSchema.safeParse(model).success).toBe(false);
    // validateView is the layer that catches it — the connector schema's own
    // `anchors` rule has no `.min(2)`, so anything that builds a connector
    // WITHOUT going through validateModel (a reducer write, a paste assembly)
    // is still free to produce one, and routing then throws.
    expect(
      validateView(model.views[0] as never, { model: model as never }).length
    ).toBeGreaterThan(0);
    expect(() =>
      getConnectorPath({
        anchors: model.views[0].connectors[0].anchors as never,
        view: model.views[0] as never
      })
    ).toThrow(/at least two anchors/);
  });
});
