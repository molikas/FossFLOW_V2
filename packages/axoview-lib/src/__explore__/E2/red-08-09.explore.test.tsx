/**
 * E2 probes — RED-08 (deleted nodes leak their model items) and RED-09 (the
 * `unroutable` flag is sticky: nothing re-routes a connector once it is set).
 *
 * RED-09 needs the real `useHistory.resyncScene`, so it runs on the React
 * harness built for area E1 rather than on the bare reducers.
 *
 * See docs/exploratory/areas/E2-reducers-cascades.md.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { view as viewReducer } from 'src/stores/reducers/view';
import { Providers, useTestHarness } from '../E1/harness';
import { seedState, viewOf, connectorAB, VIEW_ID } from './harness';
import type { State } from 'src/stores/reducers/types';

const dispatch = (state: State, action: string, payload: unknown): State =>
  viewReducer({
    action,
    payload,
    ctx: { viewId: VIEW_ID, state }
  } as never);

// ---------------------------------------------------------------------------
// RED-08 — the model item outlives every view item that referenced it
// ---------------------------------------------------------------------------
describe('RED-08 — orphaned model items', () => {
  it('characterization: DELETE_VIEWITEM leaves model.items untouched', () => {
    const state = seedState({ view: { connectors: [connectorAB()] } as never });
    const after = dispatch(state, 'DELETE_VIEWITEM', 'node-A');

    expect(viewOf(after).items.map((i) => i.id)).toEqual(['node-B']);
    expect(after.model.items.map((i) => i.id)).toEqual(['node-A', 'node-B']);
  });

  it.failing(
    'BUG: place/delete cycles grow model.items without bound while the view stays empty',
    () => {
      let state = seedState({ view: { items: [] } as never, model: { items: [] } as never });

      for (let i = 0; i < 10; i += 1) {
        state = {
          ...state,
          model: {
            ...state.model,
            items: [...state.model.items, { id: `n-${i}`, name: `n${i}`, icon: 'block' }]
          }
        };
        state = dispatch(state, 'CREATE_VIEWITEM', {
          id: `n-${i}`,
          tile: { x: i, y: 0 }
        });
        state = dispatch(state, 'DELETE_VIEWITEM', `n-${i}`);
      }

      expect(viewOf(state).items).toHaveLength(0);
      // Every one of those icons is still in the document, and will be saved,
      // exported and re-loaded forever.
      expect(state.model.items).toHaveLength(0);
    }
  );

  it('characterization: the orphans are invisible to validateView (it only checks the other direction)', () => {
    const state = seedState({ view: { connectors: [connectorAB()] } as never });
    const after = dispatch(state, 'DELETE_VIEWITEM', 'node-A');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateView } = require('src/schemas/validation');
    expect(validateView(viewOf(after), { model: after.model })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RED-09 — `unroutable` is sticky across the undo repair path
// ---------------------------------------------------------------------------
/**
 * `conn-branch` is anchored to `conn-main`'s second anchor (ADR 0006
 * anchor-to-anchor). Deleting node-B cascades `conn-main` away and leaves
 * `conn-branch` dangling (RED-07); a page switch then SYNC_SCENEs the view and
 * writes `unroutable: true`. Undoing the delete repairs the MODEL completely —
 * the question is whether the scene recovers.
 */
const seedForBranch = () => ({
  version: '1.0',
  title: 'E2 probe',
  icons: [{ id: 'block', name: 'Block', url: 'x', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [
    { id: 'node-A', name: 'A', icon: 'block' },
    { id: 'node-B', name: 'B', icon: 'block' }
  ],
  views: [
    {
      id: VIEW_ID,
      name: 'Page 1',
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
      ],
      rectangles: [],
      textBoxes: []
    }
  ]
});

describe('RED-09 — a connector marked unroutable is never retried', () => {
  const setup = () => {
    const { result } = renderHook(useTestHarness, { wrapper: Providers });
    act(() => {
      result.current.uiStateApi.getState().actions.setView(VIEW_ID);
      result.current.modelApi.getState().actions.set(seedForBranch(), true);
      result.current.scene.switchView(VIEW_ID); // SYNC_SCENE from a clean model
      result.current.modelApi.getState().actions.clearHistory();
      result.current.sceneApi.getState().actions.clearHistory();
    });
    return result;
  };

  it('characterization: the branch routes cleanly to start with', () => {
    const result = setup();
    const scene = result.current.sceneApi.getState();
    expect(scene.connectors['conn-branch'].path.tiles.length).toBeGreaterThan(0);
    expect(scene.connectors['conn-branch'].unroutable).toBeUndefined();
  });

  it('FALSIFIED: after delete → page-refresh → undo, the connector DOES recover', () => {
    const result = setup();

    act(() => {
      result.current.scene.deleteViewItem('node-B');
    });
    // A page switch (or any SYNC_SCENE) observes the dangling ref and marks it.
    act(() => {
      result.current.scene.switchView(VIEW_ID);
    });
    expect(
      result.current.sceneApi.getState().connectors['conn-branch'].unroutable
    ).toBe(true);

    // Undo restores node-B AND conn-main — the model is whole again.
    act(() => {
      result.current.history.undo();
    });
    const view = result.current.modelApi
      .getState()
      .views.find((v) => v.id === VIEW_ID)!;
    expect(view.items.map((i) => i.id)).toContain('node-B');
    expect((view.connectors ?? []).map((c) => c.id)).toContain('conn-main');

    // The connector is drawable again — but NOT because resyncScene retried it
    // (its `!sc.unroutable` guard still skips). The scene history entry's
    // inverse patch replaces the whole `connectors` map (the coarse-patch
    // mechanism pinned by E1/HIST-06), which restores the good path wholesale.
    const sceneEntry =
      result.current.sceneApi.getState().connectors['conn-branch'];
    expect(sceneEntry.path.tiles.length).toBeGreaterThan(0);
    expect(sceneEntry.unroutable).toBeUndefined();
  });

  it('characterization: a fresh SYNC_SCENE also clears the flag once the model is whole', () => {
    const result = setup();
    act(() => {
      result.current.scene.deleteViewItem('node-B');
    });
    act(() => {
      result.current.scene.switchView(VIEW_ID);
    });
    act(() => {
      result.current.history.undo();
    });
    act(() => {
      result.current.scene.switchView(VIEW_ID);
    });
    expect(
      result.current.sceneApi.getState().connectors['conn-branch'].path.tiles
        .length
    ).toBeGreaterThan(0);
  });
});

void React;
