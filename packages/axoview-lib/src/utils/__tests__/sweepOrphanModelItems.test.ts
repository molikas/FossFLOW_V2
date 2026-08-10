/**
 * Promoted from the E2 explore lane (ADR 0047 flip rule) — E2/RED-08.
 *
 * Deleting a node removed only the VIEW item. Its `model.items` entry — name,
 * icon, notes, link — stayed, invisible to everything: `validateView` only
 * checks the other direction (view item → model item), and lean-save strips
 * bundled icons but had no opinion about orphaned items. A place-then-delete
 * cycle grew `model.items` without bound while the canvas stayed empty, and
 * every orphan was persisted, exported and re-loaded.
 *
 * Two decisions in the entry are load-bearing and each has a test here:
 *   - it runs at SAVE, not at delete, so undo of a delete still finds its model
 *     item;
 *   - "referenced" means by ANY view, not by the current one.
 */
import { sweepOrphanModelItems } from '../sweepOrphanModelItems';

/**
 * Deliberately looser than `Model`: the fixtures need an `undefined` slot (the
 * RED-01 corruption, which is the point of one test) and a view with no `items`
 * key at all, neither of which the real type admits. The cast is confined to
 * this one helper so no test body carries an `as never`.
 */
type TestItem = { id: string; name: string } | undefined;
type TestView = { id: string; items?: Array<{ id: string }> };
type TestModel = { items: TestItem[]; views?: TestView[] };

const sweep = (m: TestModel): { model: TestModel; removed: number } =>
  sweepOrphanModelItems(
    m as unknown as Parameters<typeof sweepOrphanModelItems>[0]
  ) as unknown as { model: TestModel; removed: number };

const model = (items: TestItem[], views: TestView[]): TestModel => ({
  items,
  views
});

const item = (id: string) => ({ id, name: id });
const viewRef = (id: string) => ({ id });
const idsOf = (m: TestModel) => m.items.map((i) => i?.id);

describe('sweepOrphanModelItems — RED-08', () => {
  it('CONTROL: a model whose items are all referenced is returned untouched', () => {
    const input = model(
      [item('a'), item('b')],
      [{ id: 'v1', items: [viewRef('a'), viewRef('b')] }]
    );
    const out = sweep(input);
    expect(out.removed).toBe(0);
    // Same object, not a copy — a save path that rewrote the model on every
    // call would defeat any identity-based change detection above it.
    expect(out.model).toBe(input);
  });

  it('removes an item no view references', () => {
    const out = sweep(
      model([item('a'), item('orphan')], [{ id: 'v1', items: [viewRef('a')] }])
    );
    expect(out.removed).toBe(1);
    expect(idsOf(out.model)).toEqual(['a']);
  });

  it('an item referenced by ANOTHER page is live', () => {
    // The scoping decision. Sweeping per-view would delete the model item of
    // every node that happens to live on a page you are not looking at — the
    // cross-page content shape the campaign filed separately.
    const out = sweep(
      model(
        [item('a'), item('only-on-page-3')],
        [
          { id: 'v1', items: [viewRef('a')] },
          { id: 'v2', items: [] },
          { id: 'v3', items: [viewRef('only-on-page-3')] }
        ]
      )
    );
    expect(out.removed).toBe(0);
  });

  it('survivors keep their order and identity', () => {
    const out = sweep(
      model(
        [item('a'), item('orphan'), item('b')],
        [{ id: 'v1', items: [viewRef('b'), viewRef('a')] }]
      )
    );
    expect(idsOf(out.model)).toEqual(['a', 'b']);
  });

  it('does not mutate the input', () => {
    const input = model(
      [item('a'), item('orphan')],
      [{ id: 'v1', items: [viewRef('a')] }]
    );
    sweep(input);
    expect(input.items).toHaveLength(2);
  });

  it('tolerates an undefined slot rather than throwing on it', () => {
    // RED-01's corruption is already in users' files. A sweep that threw on one
    // would turn a silent leak into a failed save — a worse bug than the one it
    // is fixing, and it would land on exactly the documents that need repairing.
    const out = sweep(
      model([item('a'), undefined], [{ id: 'v1', items: [viewRef('a')] }])
    );
    expect(idsOf(out.model)).toEqual(['a']);
  });

  it('handles empty and absent collections', () => {
    expect(sweep(model([], [])).removed).toBe(0);
    // No `views` key at all: everything is orphaned, and nothing throws.
    expect(idsOf(sweep({ items: [item('a')] }).model)).toEqual([]);
    // A view with no `items` key contributes no references.
    expect(sweep(model([item('a')], [{ id: 'v1' }])).removed).toBe(1);
  });
});
