/**
 * E2 probes — RED-06 (no-op actions still stamp `lastUpdated`) and RED-07
 * (delete cascade misses anchor-to-anchor connector chains).
 *
 * See docs/exploratory/areas/E2-reducers-cascades.md.
 */
import { view as viewReducer } from 'src/stores/reducers/view';
import { validateView } from 'src/schemas/validation';
import { getConnectorPath } from 'src/utils';
import { seedState, viewOf, VIEW_ID } from './harness';
import type { State } from 'src/stores/reducers/types';

const dispatch = (state: State, action: string, payload: unknown): State =>
  viewReducer({
    action,
    payload,
    ctx: { viewId: VIEW_ID, state }
  } as never);

// ---------------------------------------------------------------------------
// RED-06 — TIMESTAMPED_ACTIONS fire even when the reducer changed nothing
// ---------------------------------------------------------------------------
describe('RED-06 — no-op actions still write to the model', () => {
  it.failing(
    'BUG: UPDATE_LAYER with an unknown id changes nothing yet still writes a new model',
    () => {
      const base = dispatch(seedState(), 'CREATE_LAYER', { name: 'Layer 1' });

      // The reducer's own body early-returns: `findIndex` is -1, nothing is
      // touched. The dispatcher stamps `lastUpdated` anyway, which rebuilds the
      // model, the views array and the view — so `useDirtyTracker` fires and the
      // store records a history entry that undoes to the same visible state.
      const after = dispatch(base, 'UPDATE_LAYER', {
        id: 'no-such-layer',
        name: 'ignored'
      });

      expect(after.model).toBe(base.model);
    }
  );

  it.failing(
    'BUG: REORDER_LAYERS with an empty list is the same no-op write',
    () => {
      const base = dispatch(seedState(), 'CREATE_LAYER', { name: 'Layer 1' });
      const after = dispatch(base, 'REORDER_LAYERS', []);
      expect(after.model).toBe(base.model);
    }
  );

  it.failing(
    'BUG: re-committing a page rename with the SAME name dirties the diagram',
    () => {
      // Reachable: ViewTabs' inline rename commits on blur/Enter unconditionally,
      // so opening the editor and pressing Enter without typing lands here.
      const base = dispatch(seedState(), 'UPDATE_VIEW', { name: 'Page 1' });
      const after = dispatch(base, 'UPDATE_VIEW', { name: 'Page 1' });

      expect(after.model).toBe(base.model);
    }
  );

  it.failing(
    'BUG: re-writing a view item property with its current value dirties the diagram',
    () => {
      const base = dispatch(seedState(), 'UPDATE_VIEWITEM', {
        id: 'node-A',
        labelColor: '#ff0000'
      });
      const after = dispatch(base, 'UPDATE_VIEWITEM', {
        id: 'node-A',
        labelColor: '#ff0000'
      });

      expect(after.model).toBe(base.model);
    }
  );

  it('characterization: the no-op differs from the original ONLY in lastUpdated', () => {
    const base = dispatch(seedState(), 'CREATE_LAYER', { name: 'Layer 1' });
    const after = dispatch(base, 'UPDATE_LAYER', {
      id: 'no-such-layer',
      name: 'ignored'
    });

    const strip = (s: State) => ({
      ...s.model,
      views: s.model.views.map((v) => ({ ...v, lastUpdated: undefined }))
    });
    // Same content…
    expect(strip(after)).toEqual(strip(base));
    // …different objects all the way down, which is what every subscriber sees.
    expect(after.model).not.toBe(base.model);
    expect(after.model.views).not.toBe(base.model.views);
    expect(viewOf(after)).not.toBe(viewOf(base));
  });
});

// ---------------------------------------------------------------------------
// RED-07 — anchor-to-anchor chains survive a delete that removes their target
// ---------------------------------------------------------------------------
/**
 * `conn-main` runs node-A → node-B. `conn-branch` starts free-floating and ends
 * on `conn-main`'s second anchor (ADR 0006 anchor-to-anchor ref) — the shape a
 * connector dropped onto another connector produces.
 */
const withAnchorChain = (): State =>
  seedState({
    view: {
      items: [
        { id: 'node-A', tile: { x: 0, y: 0 } },
        { id: 'node-B', tile: { x: 5, y: 5 } }
      ],
      connectors: [
        {
          id: 'conn-main',
          color: 'c1',
          anchors: [
            { id: 'main-a1', ref: { item: 'node-A' } },
            { id: 'main-a2', ref: { item: 'node-B' } }
          ]
        },
        {
          id: 'conn-branch',
          color: 'c1',
          anchors: [
            { id: 'branch-a1', ref: { tile: { x: 2, y: 8 } } },
            { id: 'branch-a2', ref: { anchor: 'main-a2' } }
          ]
        }
      ]
    } as never
  });

describe('RED-07 — deleting a node leaves anchor-to-anchor refs dangling', () => {
  it('control: the chained connector routes fine while node-B exists', () => {
    const state = withAnchorChain();
    expect(validateView(viewOf(state), { model: state.model })).toEqual([]);
    expect(() =>
      getConnectorPath({
        anchors: viewOf(state).connectors![1].anchors,
        view: viewOf(state)
      })
    ).not.toThrow();
  });

  it.failing(
    'BUG: deleting node-B removes conn-main but leaves conn-branch pointing at its dead anchor',
    () => {
      const state = withAnchorChain();

      const after = dispatch(state, 'DELETE_VIEWITEM', 'node-B');

      // conn-main referenced node-B directly, so the cascade takes it…
      expect(
        (viewOf(after).connectors ?? []).map((c) => c.id)
      ).not.toContain('conn-main');

      // …and conn-branch, which referenced conn-main's anchor, must not be left
      // pointing into the removed connector.
      expect(validateView(viewOf(after), { model: after.model })).toEqual([]);
    }
  );

  it.failing(
    'BUG: the dangling chain makes the surviving connector permanently unroutable',
    () => {
      const state = withAnchorChain();
      const after = dispatch(state, 'DELETE_VIEWITEM', 'node-B');

      const branch = (viewOf(after).connectors ?? []).find(
        (c) => c.id === 'conn-branch'
      );
      expect(branch).toBeDefined();

      expect(() =>
        getConnectorPath({ anchors: branch!.anchors, view: viewOf(after) })
      ).not.toThrow();
    }
  );

  it('characterization: SYNC_SCENE marks it unroutable rather than throwing', () => {
    const state = withAnchorChain();
    const after = dispatch(state, 'DELETE_VIEWITEM', 'node-B');
    const synced = dispatch(after, 'SYNC_SCENE', undefined);

    expect(synced.scene.connectors['conn-branch']).toMatchObject({
      unroutable: true
    });
  });
});
