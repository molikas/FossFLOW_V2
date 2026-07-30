/**
 * CLASS GATE — model identity & range validation (ADR 0047 §3).
 *
 * The 2026-07 exploratory campaign's single biggest cross-area finding: the
 * model has *reference*-integrity checks but no *identity* or *range* checks.
 * Duplicate ids, dangling layer refs, colliding layer `order`, out-of-range
 * `iconScale` and duplicate page names all validated clean, saved, and reloaded
 * — and the range ones came back as a file that will not open at all, because
 * `modelSchema.safeParse` runs on load and the write site never ran the bound.
 *
 * This gate is not a list of the specific bugs (those have their own promoted
 * suites); it is a scan for the *class*, so a new instance fails here without
 * anyone remembering to write a test:
 *
 *   1. RANGE — derived from `viewItemSchema` itself. Any field the schema
 *      bounds must be clamped at the write site. Add `labelFontSize.min(6)` to
 *      the schema without clamping it in `updateViewItem` and this fails.
 *   2. IDENTITY — the invariants a mutation must not be able to break:
 *      `layer.order` is a permutation of 0..n-1, an entity cannot reference a
 *      layer that does not exist, and the default page name is never one that
 *      is already on screen.
 *   3. REPAIR — the same violations arriving from a FILE, which the write-site
 *      guards cannot stop. Owner ruling 2026-07-30: repair, never reject, since
 *      rejecting means those files stop opening (E4/CLIP-02's harm). Every case
 *      asserts both that the violation is gone and that the model still parses.
 *
 * Related campaign entries: E2/RED-03, E2/RED-04/05, E3/SCN-13, E4/CLIP-13.
 */
import { viewItemSchema } from '../views';
import { updateViewItem } from 'src/stores/reducers/viewItem';
import {
  createLayer,
  deleteLayer,
  reorderLayers,
  assignLayerToItems
} from 'src/stores/reducers/view';
import { nextPageName } from 'src/utils/pageName';
import { repairModelIdentity } from 'src/utils/repairModel';
import { modelSchema } from '../model';
import type { State, ViewReducerContext } from 'src/stores/reducers/types';
import type { Layer, View } from 'src/types';

const VIEW_ID = 'view-1';

const makeState = (viewOverrides: Partial<View> = {}): State =>
  ({
    model: {
      version: '1.0',
      title: 'Contract',
      description: '',
      colors: [],
      icons: [],
      items: [{ id: 'item1', name: 'Item 1', icon: 'i' }],
      views: [
        {
          id: VIEW_ID,
          name: 'Page 1',
          items: [{ id: 'item1', tile: { x: 0, y: 0 } }],
          connectors: [],
          rectangles: [],
          textBoxes: [],
          ...viewOverrides
        }
      ]
    },
    scene: { connectors: {}, textBoxes: {} }
  }) as unknown as State;

const ctx = (state: State): ViewReducerContext => ({ viewId: VIEW_ID, state });

const viewOf = (state: State) => state.model.views[0];

const layers = (n: number): Layer[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `l${i + 1}`,
    name: `L${i + 1}`,
    visible: true,
    locked: false,
    order: i
  }));

// ---------------------------------------------------------------------------
// 1. RANGE — every schema-bounded view-item field is clamped at the write site
// ---------------------------------------------------------------------------

/**
 * Values extreme enough to fall outside any sane bound. A field is "bounded"
 * for the purposes of this gate when its own schema accepts a benign value of
 * that type but rejects one of these — discovered through `safeParse`, so the
 * gate does not depend on zod's internals.
 */
const PROBES: Record<'number', { benign: number; extremes: number[] }> = {
  number: { benign: 1, extremes: [-1_000_000, 1_000_000, 0.5, -0.5] }
};

interface BoundedField {
  field: string;
  rejected: number[];
}

const boundedNumericFields = (): BoundedField[] => {
  const found: BoundedField[] = [];
  Object.entries(viewItemSchema.shape).forEach(([field, schema]) => {
    const s = schema as { safeParse: (v: unknown) => { success: boolean } };
    if (!s.safeParse(PROBES.number.benign).success) return; // not a number field
    const rejected = PROBES.number.extremes.filter((v) => !s.safeParse(v).success);
    if (rejected.length > 0) found.push({ field, rejected });
  });
  return found;
};

describe('class gate — no mutation writes a view item the schema would reject', () => {
  const fields = boundedNumericFields();

  it('finds the bounded numeric fields to check (the gate can go red)', () => {
    // If this ever reads zero, the discovery above broke and every case below
    // became vacuous — the exact "a green gate that cannot fail" shape the
    // 2026-07-29 review flagged for the madge and bundle gates.
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.map((f) => f.field)).toEqual(
      expect.arrayContaining(['iconScale', 'zIndex'])
    );
  });

  it.each(fields)(
    '$field — an out-of-bounds write is clamped, not persisted',
    ({ field, rejected }) => {
      rejected.forEach((value) => {
        const next = updateViewItem(
          { id: 'item1', [field]: value } as never,
          ctx(makeState())
        );
        const written = viewOf(next).items[0];
        const parsed = viewItemSchema.safeParse(written);
        expect(
          parsed.success
            ? null
            : `writing ${field}=${value} produced a view item the schema rejects: ${JSON.stringify(written)}`
        ).toBeNull();
      });
    }
  );
});

// ---------------------------------------------------------------------------
// 2. IDENTITY — invariants no single mutation may break
// ---------------------------------------------------------------------------

/** `order` must be a permutation of 0..n-1 — anything else leaves two layers' stacking undefined. */
const expectOrderPermutation = (state: State) => {
  const list = viewOf(state).layers ?? [];
  expect([...list].map((l) => l.order).sort((a, b) => a - b)).toEqual(
    list.map((_, i) => i)
  );
};

describe('class gate — layer identity invariants survive every mutation', () => {
  it('createLayer after a deleteLayer does not reuse a live order', () => {
    let state = makeState({ layers: layers(3) });
    state = deleteLayer('l2', ctx(state));
    expectOrderPermutation(state);
    state = createLayer({ name: 'New' }, ctx(state));
    expectOrderPermutation(state);
  });

  it('a PARTIAL reorderLayers list still leaves a total order', () => {
    let state = makeState({ layers: layers(3) });
    state = reorderLayers(['l3'], ctx(state));
    expectOrderPermutation(state);
    // The named layer got the slot it asked for.
    expect(viewOf(state).layers!.find((l) => l.id === 'l3')!.order).toBe(0);
  });

  it('a full reorderLayers list is honoured exactly', () => {
    const state = reorderLayers(
      ['l3', 'l1', 'l2'],
      ctx(makeState({ layers: layers(3) }))
    );
    expectOrderPermutation(state);
    expect(viewOf(state).layers!.map((l) => l.id)).toEqual(['l3', 'l1', 'l2']);
  });

  it('no entity can be assigned to a layer that does not exist', () => {
    const state = makeState({ layers: layers(1) });
    expect(() =>
      assignLayerToItems({ layerId: 'ghost', itemIds: ['item1'] }, ctx(state))
    ).toThrow(/no such layer/);
    // …while a real one still works, so the guard is not a blanket refusal.
    const ok = assignLayerToItems(
      { layerId: 'l1', itemIds: ['item1'] },
      ctx(state)
    );
    expect(viewOf(ok).items[0].layerId).toBe('l1');
  });
});

describe('class gate — a default page name is never one already on screen', () => {
  const T = 'Page {count}';

  it('skips past the highest existing suffix, not the array length', () => {
    // The E3/SCN-13 shape: three pages created, the middle one deleted.
    expect(nextPageName(T, ['Page 1', 'Page 3'])).toBe('Page 4');
  });

  it('never collides with an existing name', () => {
    const names = ['Page 1', 'Page 2', 'Page 3'];
    for (let i = 0; i < 25; i += 1) {
      const next = nextPageName(T, names);
      expect(names).not.toContain(next);
      names.push(next);
    }
  });

  it('is unaffected by user-renamed pages', () => {
    expect(nextPageName(T, ['Architecture', 'Network'])).toBe('Page 3');
  });

  it('degrades safely when a locale drops the {count} token', () => {
    expect(nextPageName('Seite', ['Seite'])).toBe('Seite');
  });
});

// ---------------------------------------------------------------------------
// 3. REPAIR — the load path is the other half of the class. A write-site guard
// cannot help a file that already carries the violation.
// ---------------------------------------------------------------------------

describe('class gate — a model carrying the class is repaired, not rejected', () => {
  const fileWith = (viewOverrides: Record<string, unknown>) => ({
    version: '1.0',
    title: 'Gate',
    icons: [{ id: 'block', name: 'Block', url: 'x', isIsometric: true }],
    colors: [],
    items: [{ id: 'node-A', name: 'A', icon: 'block' }],
    views: [
      {
        id: VIEW_ID,
        name: 'Page 1',
        items: [{ id: 'node-A', tile: { x: 0, y: 0 } }],
        connectors: [],
        rectangles: [],
        textBoxes: [],
        ...viewOverrides
      }
    ]
  });

  const CASES: Array<{ name: string; view: Record<string, unknown> }> = [
    {
      name: 'a duplicate view-item id',
      view: {
        items: [
          { id: 'node-A', tile: { x: 0, y: 0 } },
          { id: 'node-A', tile: { x: 4, y: 4 } }
        ]
      }
    },
    {
      name: 'a layerId naming no layer',
      view: { items: [{ id: 'node-A', tile: { x: 0, y: 0 }, layerId: 'ghost' }], layers: [] }
    },
    {
      name: 'an absurd tile coordinate',
      view: { items: [{ id: 'node-A', tile: { x: 9e9, y: 0 } }] }
    },
    {
      name: 'a non-finite tile coordinate',
      view: { items: [{ id: 'node-A', tile: { x: Number.NaN, y: 0 } }] }
    }
  ];

  it.each(CASES)('$name is repaired and the diagram still opens', ({ view }) => {
    const raw = fileWith(view);
    const { data, report } = repairModelIdentity(raw as never);

    // The repair fired…
    expect(
      report.duplicateIds + report.danglingLayerRefs + report.outOfRangeCoords
    ).toBeGreaterThan(0);
    // …and the result is loadable, which is the whole point of repairing rather
    // than rejecting.
    const parsed = modelSchema.safeParse(data);
    expect(
      parsed.success ? null : JSON.stringify(parsed.error?.issues)
    ).toBeNull();
  });

  it('leaves a clean file byte-identical (the repair cannot fire spuriously)', () => {
    const raw = fileWith({});
    const { data, report } = repairModelIdentity(raw as never);
    expect(report).toEqual({
      duplicateIds: 0,
      danglingLayerRefs: 0,
      outOfRangeCoords: 0
    });
    expect(data).toEqual(raw);
  });
});
