/**
 * Promoted from the E2 explore lane (ADR 0047 flip rule) — RED-06.
 *
 * Every action in `TIMESTAMPED_ACTIONS` used to run `updateViewTimestamp`
 * unconditionally, including the ones whose reducer body changed nothing. The
 * result was a brand-new model / views array / view object with only
 * `lastUpdated` different, so `useDirtyTracker` fired ("unsaved changes"),
 * autosave ran, and history stored an entry whose undo produces no visible
 * change — a Ctrl+Z that appears to do nothing.
 *
 * Two halves, both pinned here:
 *  1. the dispatcher honours the "nothing happened" signal the reducers already
 *     give (`newState.model !== ctx.state.model`);
 *  2. the `update*` reducers actually GIVE that signal for an identical write,
 *     instead of assigning `{ ...current, ...updates }` unconditionally.
 */
import { view as viewReducer } from '../view';
import { isNoOpUpdate } from '../noOpUpdate';
import type { State } from '../types';
import { seedState, viewOf, VIEW_ID } from '../__fixtures__/reducerHarness';

const dispatch = (state: State, action: string, payload: unknown): State =>
  viewReducer({
    action,
    payload,
    ctx: { viewId: VIEW_ID, state }
  } as never);

describe('isNoOpUpdate — the primitive-only comparison', () => {
  it('an identical primitive write is a no-op', () => {
    expect(isNoOpUpdate({ name: 'A', size: 3 }, { name: 'A' })).toBe(true);
    expect(isNoOpUpdate({ name: 'A', size: 3 }, { name: 'A', size: 3 })).toBe(
      true
    );
  });

  it('a changed value is not', () => {
    expect(isNoOpUpdate({ name: 'A' }, { name: 'B' })).toBe(false);
  });

  it('an explicit reset over an already-absent field is a no-op', () => {
    expect(isNoOpUpdate({ width: undefined }, { width: undefined })).toBe(true);
    expect(isNoOpUpdate({}, { width: undefined })).toBe(true);
  });

  it('but an explicit reset over a SET field is a change', () => {
    expect(isNoOpUpdate({ width: 4 }, { width: undefined })).toBe(false);
  });

  it('an object-valued update is CONSERVATIVELY a change, even when deep-equal', () => {
    // A deep compare on the drag hot path would cost more than the write it is
    // avoiding, and a false "no change" would silently drop a real edit.
    expect(
      isNoOpUpdate({ tile: { x: 1, y: 1 } }, { tile: { x: 1, y: 1 } })
    ).toBe(false);
  });

  it('an empty update is a no-op', () => {
    expect(isNoOpUpdate({ name: 'A' }, {})).toBe(true);
  });
});

describe('RED-06 — a no-op action leaves the model untouched', () => {
  it('UPDATE_LAYER with an unknown id changes nothing and writes nothing', () => {
    const base = dispatch(seedState(), 'CREATE_LAYER', { name: 'Layer 1' });
    const after = dispatch(base, 'UPDATE_LAYER', {
      id: 'no-such-layer',
      name: 'ignored'
    });
    expect(after.model).toBe(base.model);
  });

  it('REORDER_LAYERS with an empty list is the same no-op', () => {
    const base = dispatch(seedState(), 'CREATE_LAYER', { name: 'Layer 1' });
    const after = dispatch(base, 'REORDER_LAYERS', []);
    expect(after.model).toBe(base.model);
  });

  it('re-committing a page rename with the SAME name does not dirty the diagram', () => {
    // Reachable: ViewTabs' inline rename commits on blur/Enter unconditionally,
    // so opening the editor and pressing Enter without typing lands here.
    const base = dispatch(seedState(), 'UPDATE_VIEW', { name: 'Page 1' });
    const after = dispatch(base, 'UPDATE_VIEW', { name: 'Page 1' });
    expect(after.model).toBe(base.model);
  });

  it('re-writing a view-item property with its current value does not dirty it', () => {
    const base = dispatch(seedState(), 'UPDATE_VIEWITEM', {
      id: 'node-A',
      labelColor: '#ff0000'
    });
    const after = dispatch(base, 'UPDATE_VIEWITEM', {
      id: 'node-A',
      labelColor: '#ff0000'
    });
    expect(after.model).toBe(base.model);
  });

  it('CONTROL: a REAL change still stamps lastUpdated', () => {
    const base = dispatch(seedState(), 'UPDATE_VIEW', { name: 'Page 1' });
    const after = dispatch(base, 'UPDATE_VIEW', { name: 'Page 2' });
    expect(after.model).not.toBe(base.model);
    expect(viewOf(after).lastUpdated).not.toBe(viewOf(base).lastUpdated);
    expect(viewOf(after).name).toBe('Page 2');
  });

  it('CONTROL: a real view-item change still lands, and still stamps', () => {
    const base = seedState();
    const after = dispatch(base, 'UPDATE_VIEWITEM', {
      id: 'node-A',
      labelColor: '#00ff00'
    });
    expect(after.model).not.toBe(base.model);
    expect(
      viewOf(after).items?.find((i) => i.id === 'node-A')?.labelColor
    ).toBe('#00ff00');
  });
});
