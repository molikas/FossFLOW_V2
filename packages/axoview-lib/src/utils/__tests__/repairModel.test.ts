/**
 * Identity & range repair on the way in — E4/CLIP-01, E2/RED-03 (import half),
 * E4/CLIP-15.
 *
 * Owner ruling 2026-07-30: **repair, don't reject.** These violations are
 * already in users' saved files — that is the bug — so turning them into schema
 * errors would stop those files opening, which is the harm E4/CLIP-02 is filed
 * for. Each case below therefore asserts two things: the violation is gone, AND
 * the model still parses.
 */
import { repairModelIdentity, isCleanRepair, describeRepair, MAX_TILE_COORD } from '../repairModel';
import { modelSchema } from 'src/schemas/model';

const VIEW = 'view-1';

const base = (overrides: Record<string, unknown> = {}) => ({
  version: '1.0',
  title: 'Repair',
  icons: [{ id: 'block', name: 'Block', url: 'x', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [{ id: 'node-A', name: 'A', icon: 'block' }],
  views: [
    {
      id: VIEW,
      name: 'Page 1',
      items: [{ id: 'node-A', tile: { x: 0, y: 0 } }],
      connectors: [],
      rectangles: [],
      textBoxes: [],
      ...overrides
    }
  ]
});

const viewOf = (data: Record<string, unknown>) =>
  (data.views as Array<Record<string, unknown>>)[0];

describe('duplicate ids (CLIP-01)', () => {
  it('keeps the first occurrence and drops the shadowed twin', () => {
    const raw = base();
    (raw.items as unknown[]).push({ id: 'node-A', name: 'A (shadow)', icon: 'block' });
    (viewOf(raw).items as unknown[]).push({ id: 'node-A', tile: { x: 9, y: 9 } });

    const { data, report } = repairModelIdentity(raw);

    expect(report.duplicateIds).toBe(2);
    expect(data.items).toHaveLength(1);
    expect((data.items as Array<{ name: string }>)[0].name).toBe('A');
    expect(viewOf(data).items).toHaveLength(1);
    expect(modelSchema.safeParse(data).success).toBe(true);
  });

  it('dedupes every view collection, and views themselves', () => {
    const raw = base({
      rectangles: [
        { id: 'r1', from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
        { id: 'r1', from: { x: 5, y: 5 }, to: { x: 6, y: 6 } }
      ],
      textBoxes: [
        { id: 't1', tile: { x: 0, y: 0 }, content: 'a' },
        { id: 't1', tile: { x: 1, y: 1 }, content: 'b' }
      ],
      layers: [
        { id: 'l1', name: 'L1', visible: true, locked: false, order: 0 },
        { id: 'l1', name: 'L1 again', visible: true, locked: false, order: 1 }
      ]
    });
    (raw.views as unknown[]).push({ ...viewOf(raw) });

    const { data, report } = repairModelIdentity(raw);

    expect(report.duplicateIds).toBe(4); // rect, textbox, layer, view
    expect(data.views).toHaveLength(1);
    expect(viewOf(data).rectangles).toHaveLength(1);
    expect(viewOf(data).textBoxes).toHaveLength(1);
    expect(viewOf(data).layers).toHaveLength(1);
  });

  it('dedupes connector anchor ids across the whole view', () => {
    // An anchor→anchor ref resolves against every anchor in the view, so two
    // connectors sharing an anchor id make the target ambiguous (E3/SCN-03).
    const raw = base({
      connectors: [
        {
          id: 'c1',
          anchors: [
            { id: 'a1', ref: { item: 'node-A' } },
            { id: 'a2', ref: { item: 'node-A' } }
          ]
        },
        {
          id: 'c2',
          anchors: [
            { id: 'a1', ref: { item: 'node-A' } },
            { id: 'a3', ref: { item: 'node-A' } }
          ]
        }
      ]
    });

    const { data, report } = repairModelIdentity(raw);

    expect(report.duplicateIds).toBe(1);
    const connectors = viewOf(data).connectors as Array<{ anchors: unknown[] }>;
    expect(connectors[0].anchors).toHaveLength(2);
    expect(connectors[1].anchors).toHaveLength(1);
  });

  it('leaves a clean model untouched, and says so', () => {
    const raw = base();
    const { data, report } = repairModelIdentity(raw);
    expect(isCleanRepair(report)).toBe(true);
    expect(data).toEqual(raw);
  });
});

describe('dangling layer references (RED-03, import half)', () => {
  it('unassigns an entity whose layer does not exist in the view', () => {
    const raw = base({
      items: [{ id: 'node-A', tile: { x: 0, y: 0 }, layerId: 'ghost' }],
      layers: [{ id: 'l1', name: 'L1', visible: true, locked: false, order: 0 }]
    });

    const { data, report } = repairModelIdentity(raw);

    expect(report.danglingLayerRefs).toBe(1);
    expect((viewOf(data).items as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      'layerId'
    );
    expect(modelSchema.safeParse(data).success).toBe(true);
  });

  it('keeps a reference to a layer that does exist', () => {
    const raw = base({
      items: [{ id: 'node-A', tile: { x: 0, y: 0 }, layerId: 'l1' }],
      layers: [{ id: 'l1', name: 'L1', visible: true, locked: false, order: 0 }]
    });
    const { data, report } = repairModelIdentity(raw);
    expect(report.danglingLayerRefs).toBe(0);
    expect((viewOf(data).items as Array<{ layerId?: string }>)[0].layerId).toBe('l1');
  });

  it('covers every entity type that can carry a layerId', () => {
    const raw = base({
      items: [{ id: 'node-A', tile: { x: 0, y: 0 }, layerId: 'ghost' }],
      rectangles: [{ id: 'r1', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, layerId: 'ghost' }],
      textBoxes: [{ id: 't1', tile: { x: 0, y: 0 }, content: 'x', layerId: 'ghost' }],
      layers: []
    });
    const { report } = repairModelIdentity(raw);
    expect(report.danglingLayerRefs).toBe(3);
  });
});

describe('out-of-range coordinates (CLIP-15)', () => {
  it('clamps an absurd tile instead of letting it poison the projection', () => {
    const raw = base({
      items: [{ id: 'node-A', tile: { x: 9e9, y: -9e9 } }]
    });
    const { data, report } = repairModelIdentity(raw);
    expect(report.outOfRangeCoords).toBe(2);
    expect((viewOf(data).items as Array<{ tile: { x: number; y: number } }>)[0].tile).toEqual({
      x: MAX_TILE_COORD,
      y: -MAX_TILE_COORD
    });
  });

  it('repairs a non-finite coordinate — which the schema REJECTS, so the file would not open', () => {
    const raw = base({
      items: [{ id: 'node-A', tile: { x: Number.NaN, y: Number.POSITIVE_INFINITY } }]
    });
    // Precondition: this really is a file that does not open today.
    expect(modelSchema.safeParse(raw).success).toBe(false);

    const { data, report } = repairModelIdentity(raw);

    expect(report.outOfRangeCoords).toBe(2);
    expect(modelSchema.safeParse(data).success).toBe(true);
  });

  it('repairs the off-grid offset and rectangle corners too', () => {
    const raw = base({
      items: [{ id: 'node-A', tile: { x: 0, y: 0 }, offset: { x: Number.NaN, y: 0 } }],
      rectangles: [{ id: 'r1', from: { x: 9e9, y: 0 }, to: { x: 1, y: 1 } }]
    });
    const { report } = repairModelIdentity(raw);
    expect(report.outOfRangeCoords).toBe(2);
  });

  it('leaves ordinary coordinates alone, including negative ones', () => {
    const raw = base({
      items: [{ id: 'node-A', tile: { x: -12, y: 340 }, offset: { x: 0.5, y: -0.5 } }]
    });
    const { report } = repairModelIdentity(raw);
    expect(report.outOfRangeCoords).toBe(0);
  });
});

describe('the repair is reported, never silent', () => {
  it('describes each kind of repair', () => {
    expect(
      describeRepair({
        duplicateIds: 2,
        danglingLayerRefs: 1,
        outOfRangeCoords: 3,
        danglingAnchorRefs: 2
      })
    ).toBe(
      '2 duplicate ids removed; 1 item unassigned from a layer that no longer exists; 3 out-of-range coordinates clamped; 2 connections detached from a connection that no longer exists'
    );
  });

  it('singularises', () => {
    expect(
      describeRepair({
        duplicateIds: 1,
        danglingLayerRefs: 0,
        outOfRangeCoords: 0,
        danglingAnchorRefs: 0
      })
    ).toBe('1 duplicate id removed');
  });

  // E2/RED-02's load half — the repair-don't-reject ruling applied to the
  // anchor graph. The singular form matters: one detached connection is the
  // common case (RED-14 produces exactly one).
  it('singularises the anchor-ref clause too', () => {
    expect(
      describeRepair({
        duplicateIds: 0,
        danglingLayerRefs: 0,
        outOfRangeCoords: 0,
        danglingAnchorRefs: 1
      })
    ).toBe('1 connection detached from a connection that no longer exists');
  });
});
