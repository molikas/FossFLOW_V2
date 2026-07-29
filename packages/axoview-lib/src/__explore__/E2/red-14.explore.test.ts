/**
 * E2 probe — RED-14: deleting a connector leaves sibling connectors anchored to
 * its anchors (ADR 0006 anchor-to-anchor) pointing at a dead anchor.
 *
 * The node-delete twin of this gap is RED-07; this is the direct
 * `DELETE_CONNECTOR` path.
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

/** conn-branch's second anchor rides on conn-main's second anchor. */
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

describe('RED-14 — deleting a connector orphans anchor-to-anchor siblings', () => {
  it('control: both connectors are valid and routable to begin with', () => {
    const state = withAnchorChain();
    expect(validateView(viewOf(state), { model: state.model })).toEqual([]);
  });

  it.failing(
    'BUG: deleting conn-main leaves conn-branch referencing its removed anchor',
    () => {
      const state = withAnchorChain();
      const after = dispatch(state, 'DELETE_CONNECTOR', 'conn-main');

      expect((viewOf(after).connectors ?? []).map((c) => c.id)).toEqual([
        'conn-branch'
      ]);
      // Correct: the cascade repairs or removes the dependent connector.
      expect(validateView(viewOf(after), { model: after.model })).toEqual([]);
    }
  );

  it.failing('BUG: the orphaned sibling can no longer be routed', () => {
    const state = withAnchorChain();
    const after = dispatch(state, 'DELETE_CONNECTOR', 'conn-main');
    const branch = (viewOf(after).connectors ?? []).find(
      (c) => c.id === 'conn-branch'
    )!;

    expect(() =>
      getConnectorPath({ anchors: branch.anchors, view: viewOf(after) })
    ).not.toThrow();
  });

  it('characterization: the poisoned view then rejects every node move (RED-02 compound)', () => {
    const state = withAnchorChain();
    const after = dispatch(state, 'DELETE_CONNECTOR', 'conn-main');

    expect(() =>
      dispatch(after, 'UPDATE_VIEWITEM', {
        id: 'node-A',
        tile: { x: 1, y: 1 }
      })
    ).toThrow();
  });
});
