/**
 * Promoted from the E2 explore lane (ADR 0047 flip rule) — E2/RED-15.
 *
 * The invariant (ADR 0006 §3 / canvas-interaction I-1) is that `selectedIds`
 * only ever contains interactable refs, and every ACQUISITION path enforced it:
 * Ctrl+A, lasso, click and the context menu all filter through
 * `makeInteractableCheck`. Nothing enforced it afterwards. So a selection that
 * was legal when it was made survived its layer being hidden or locked, and
 * then Delete removed entities the user could no longer see while a group drag
 * moved entities the Layers panel presented as locked.
 *
 * The rule under test is deliberately "the SAME filter, applied again" rather
 * than a second opinion about what is interactable — a re-check that could
 * disagree with acquisition would be a new way for the two to drift, which is
 * the bug `collectSelectableRefs` was factored out to prevent.
 */
import {
  dropUninteractableRefs,
  makeInteractableCheck
} from '../selectableRefs';
import type { ItemReference } from 'src/types';

const ref = (id: string): ItemReference => ({ type: 'ITEM', id });
const ids = (r: { refs: ItemReference[] }) => r.refs.map((x) => x.id);

const ALL = ['a', 'b', 'c'].map(ref);
const NONE = new Set<string>();
const visible = (...v: string[]) => new Set(v);

describe('dropUninteractableRefs — RED-15, the invalidation step', () => {
  it('CONTROL: nothing is dropped while every ref is still interactable', () => {
    const out = dropUninteractableRefs(ALL, NONE, visible('a', 'b', 'c'), true);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(out.dropped).toBe(0);
  });

  it('drops a ref whose layer was HIDDEN after it was selected', () => {
    const out = dropUninteractableRefs(ALL, NONE, visible('a', 'c'), true);
    expect(ids(out)).toEqual(['a', 'c']);
    expect(out.dropped).toBe(1);
  });

  it('drops a ref whose layer was LOCKED after it was selected', () => {
    const out = dropUninteractableRefs(
      ALL,
      new Set(['b']),
      visible('a', 'b', 'c'),
      true
    );
    expect(ids(out)).toEqual(['a', 'c']);
    expect(out.dropped).toBe(1);
  });

  it('hiding every layer clears the selection outright', () => {
    // The Delete symptom at full strength: the canvas is empty, and the store
    // used to still hold all three.
    const out = dropUninteractableRefs(ALL, NONE, NONE, true);
    expect(ids(out)).toEqual([]);
    expect(out.dropped).toBe(3);
  });

  it('with NO layers configured the selection is untouched', () => {
    // `hasLayers === false` is the no-layers fallback, and it keys off whether
    // any layer EXISTS rather than off `visibleIds.size` — an empty
    // `visibleIds` also means "everything is on a hidden layer", and conflating
    // the two made a fully-hidden view snap back to fully-interactable. That
    // regression must not come back through this new caller.
    const out = dropUninteractableRefs(ALL, NONE, NONE, false);
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    expect(out.dropped).toBe(0);
  });

  it('an empty selection is a no-op, not an error', () => {
    const out = dropUninteractableRefs([], NONE, NONE, true);
    expect(out.refs).toEqual([]);
    expect(out.dropped).toBe(0);
  });

  it('preserves ref identity and order — this is a filter, not a rebuild', () => {
    // The caller writes the result straight back into `selectedIds`. Returning
    // reconstructed refs would drop any field a ref type carries beyond `id`
    // (connector waypoints carry an index), and reordering would move the
    // anchor a shift-click extends from.
    const out = dropUninteractableRefs(ALL, NONE, visible('a', 'b', 'c'), true);
    expect(out.refs[0]).toBe(ALL[0]);
    expect(out.refs[2]).toBe(ALL[2]);
  });

  it('agrees with makeInteractableCheck by construction', () => {
    // The point of the entry: acquisition and invalidation must not be able to
    // disagree. If this ever fails, one of them grew its own opinion.
    const lockedIds = new Set(['b']);
    const visibleIds = visible('a', 'b');
    const check = makeInteractableCheck(lockedIds, visibleIds, true);
    const out = dropUninteractableRefs(ALL, lockedIds, visibleIds, true);
    expect(ids(out)).toEqual(ALL.filter((r) => check(r.id)).map((r) => r.id));
  });
});
