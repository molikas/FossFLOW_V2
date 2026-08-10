/**
 * The history brackets — transaction, drag, and the pre-snapshot they arm.
 *
 * Promoted from the 2026-07 campaign's probe lane (`__explore__/E1/hist-05-08`,
 * `hist-02-03`) with the bugs fixed: E1/HIST-02, HIST-05, HIST-06 (recovery),
 * HIST-07, HIST-08.
 *
 * The through-line is that "a bracket is open" is a property of the editing
 * SESSION, not of one hook instance, and that an armed pre-snapshot belongs to
 * exactly one logical action. Two `useSceneActions()` instances under one
 * provider pair is the configuration the app actually runs — every component
 * that edits calls the hook — so it is the configuration these tests use.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ModelProvider, useModelStoreApi } from 'src/stores/modelStore';
import { SceneProvider, useSceneStoreApi } from 'src/stores/sceneStore';
import { UiStateProvider, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useScene } from 'src/hooks/useScene';
import { useSceneActions } from 'src/hooks/useSceneActions';
import { useHistory } from 'src/hooks/useHistory';

const VIEW_ID = 'view-1';

const Providers = ({ children }: { children: React.ReactNode }) => (
  <ModelProvider>
    <SceneProvider>
      <UiStateProvider>{children}</UiStateProvider>
    </SceneProvider>
  </ModelProvider>
);

/** Two INDEPENDENT scene-action instances, as two components would have. */
const useTwoInstances = () => ({
  a: useSceneActions(),
  b: useSceneActions(),
  scene: useScene(),
  history: useHistory(),
  modelApi: useModelStoreApi(),
  sceneApi: useSceneStoreApi(),
  uiStateApi: useUiStateStoreApi()
});

const seedView = () => ({
  version: '1.0',
  title: 'Test',
  icons: [{ id: 'block', name: 'Block', url: '', isIsometric: true }],
  colors: [{ id: 'c1', value: '#0066cc' }],
  items: [
    { id: 'node-A', name: 'A', icon: 'block' },
    { id: 'node-B', name: 'B', icon: 'block' }
  ],
  views: [
    {
      id: VIEW_ID,
      name: 'View',
      items: [
        { id: 'node-A', tile: { x: 0, y: 0 } },
        { id: 'node-B', tile: { x: 5, y: 5 } }
      ],
      connectors: [],
      rectangles: [],
      textBoxes: []
    }
  ]
});

function setup() {
  const { result } = renderHook(useTwoInstances, { wrapper: Providers });
  act(() => {
    result.current.uiStateApi.getState().actions.setView(VIEW_ID);
    result.current.modelApi.getState().actions.set(seedView(), true);
    result.current.sceneApi
      .getState()
      .actions.set({ connectors: {}, textBoxes: {} }, true);
    result.current.modelApi.getState().actions.clearHistory();
    result.current.sceneApi.getState().actions.clearHistory();
  });
  return result;
}

type Harness = ReturnType<typeof setup>;

const depths = (r: Harness) => ({
  modelPast: r.current.modelApi.getState().history.past.length,
  modelFuture: r.current.modelApi.getState().history.future.length,
  scenePast: r.current.sceneApi.getState().history.past.length,
  sceneFuture: r.current.sceneApi.getState().history.future.length
});

const tileOf = (r: Harness, id: string) =>
  r.current.modelApi
    .getState()
    .views.find((v) => v.id === VIEW_ID)!
    .items.find((i) => i.id === id)!.tile;

// ---------------------------------------------------------------------------
// HIST-07 — `dragInProgress` was a per-hook ref, so a write from ANOTHER
// component mid-drag called `saveToHistory()` and overwrote the frozen pre-drag
// snapshot: the drag's commit then diffed from mid-drag state, and undo
// restored the item to a mid-drag position rather than its origin.
// ---------------------------------------------------------------------------
describe('a drag bracket is visible to every hook instance', () => {
  it('a foreign write mid-drag does not move where undo lands', () => {
    const r = setup();
    expect(tileOf(r, 'node-A')).toEqual({ x: 0, y: 0 }); // precondition

    act(() => {
      r.current.a.beginDragTransaction();
      r.current.a.updateViewItem('node-A', { tile: { x: 2, y: 2 } });
    });
    // A different component edits while the drag is open — the case a per-hook
    // ref could not see.
    act(() => {
      r.current.b.updateViewItem('node-B', { tile: { x: 7, y: 7 } });
    });
    act(() => {
      r.current.a.updateViewItem('node-A', { tile: { x: 4, y: 4 } });
      r.current.a.commitDragTransaction();
    });

    act(() => {
      r.current.history.undo();
    });

    expect(tileOf(r, 'node-A')).toEqual({ x: 0, y: 0 });
  });
});

// ---------------------------------------------------------------------------
// HIST-08 — `useHistory.transaction` kept its own `transactionInProgress`, so
// scene CRUD wrapped in it pushed one entry PER op and one Ctrl+Z undid only
// the last. Owner ruling 2026-07-30: one grouping primitive.
// ---------------------------------------------------------------------------
describe('useHistory.transaction groups scene CRUD', () => {
  it('records one entry for N operations, whichever hook opened the bracket', () => {
    const r = setup();
    const before = depths(r).modelPast;

    act(() => {
      r.current.history.transaction(() => {
        r.current.a.updateViewItem('node-A', { tile: { x: 1, y: 1 } });
        r.current.a.updateViewItem('node-A', { tile: { x: 2, y: 2 } });
        r.current.b.updateViewItem('node-B', { tile: { x: 8, y: 8 } });
      });
    });

    expect(depths(r).modelPast).toBe(before + 1);

    act(() => {
      r.current.history.undo();
    });
    // One keystroke reverts the whole group, both instances' writes included.
    expect(tileOf(r, 'node-A')).toEqual({ x: 0, y: 0 });
    expect(tileOf(r, 'node-B')).toEqual({ x: 5, y: 5 });
  });

  it('reports the open bracket through isInTransaction()', () => {
    const r = setup();
    expect(r.current.history.isInTransaction()).toBe(false);
    act(() => {
      r.current.history.transaction(() => {
        expect(r.current.history.isInTransaction()).toBe(true);
      });
    });
    expect(r.current.history.isInTransaction()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HIST-05 — a reducer that threw between `saveToHistory()` and `set()` left the
// pre-snapshot armed in both stores; the next skipHistory write (a page
// switch's SYNC_SCENE) consumed it and pushed a bogus entry stamped with the
// failed action's seq, so a later Ctrl+Z reverted a diff the user never made.
// ---------------------------------------------------------------------------
describe('a failed edit leaves no armed snapshot behind', () => {
  it('records nothing itself, and nothing later consumes its snapshot', () => {
    const r = setup();
    const before = depths(r);

    // A view item that does not exist: the reducer throws.
    expect(() => {
      act(() => {
        r.current.a.updateViewItem('no-such-item', { tile: { x: 1, y: 1 } });
      });
    }).toThrow();

    // The failed action recorded nothing…
    expect(depths(r)).toEqual(before);

    // …and a later coordinated write cannot pick up its snapshot.
    act(() => {
      r.current.sceneApi.getState().actions.set({ textBoxes: {} }, true);
    });
    expect(depths(r).scenePast).toBe(before.scenePast);
  });
});

// ---------------------------------------------------------------------------
// HIST-02 — a new action after an undo branches history, so BOTH redo stacks
// are stale. The store whose patch set for that action was empty never pushed
// an entry and so never cleared its own future: `canRedo` stayed true and Redo
// re-applied a stale scene patch (an orphan `scene.connectors[id]`).
// ---------------------------------------------------------------------------
describe('a new action invalidates redo on both stacks', () => {
  it('clears the scene future even when the action is model-only', () => {
    const r = setup();

    // A both-stores action, then undo it: both futures are armed.
    act(() => {
      r.current.a.beginDragTransaction();
      r.current.a.createConnector({
        id: 'conn-1',
        color: 'c1',
        anchors: [
          { id: 'c1-a1', ref: { item: 'node-A' } },
          { id: 'c1-a2', ref: { item: 'node-B' } }
        ]
      });
      r.current.a.commitDragTransaction();
    });
    act(() => {
      r.current.history.undo();
    });
    expect(depths(r).sceneFuture).toBeGreaterThan(0); // precondition

    // A model-only action: it touches no scene state, so the scene store has
    // nothing to push — and used to leave its future armed.
    act(() => {
      r.current.a.updateModelItem('node-A', { name: 'Renamed' });
    });

    expect(depths(r).sceneFuture).toBe(0);
    expect(depths(r).modelFuture).toBe(0);
    expect(r.current.history.canRedo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HIST-06 — a drag bracket is closed by the mouseup, and the mode's exit runs
// lazily on the NEXT mouse event, so a lost mouseup followed by a keyboard-only
// action left it open: later edits applied with no history entry while
// `canUndo()` stayed true, and the next Ctrl+Z reverted the pre-drag action and
// destroyed them. `useInteractionManager`'s keydown handler now closes any open
// bracket before dispatching; this pins the recovery it relies on.
// ---------------------------------------------------------------------------
describe('a leaked drag bracket is recoverable', () => {
  it('suppresses history while open — the drag contract', () => {
    const r = setup();
    const before = depths(r).modelPast;
    act(() => {
      r.current.a.beginDragTransaction();
      r.current.a.updateViewItem('node-A', { tile: { x: 1, y: 1 } });
    });
    expect(depths(r).modelPast).toBe(before);
  });

  it('and closing it restores normal recording, from any instance', () => {
    const r = setup();
    act(() => {
      r.current.a.beginDragTransaction();
      r.current.a.updateViewItem('node-A', { tile: { x: 1, y: 1 } });
    });
    const leaked = depths(r).modelPast;

    // What the keydown handler does: a no-op when no drag is open, a rescue
    // when one was left open. Called from the OTHER instance, which only works
    // because the bracket is provider-scoped.
    act(() => {
      r.current.b.commitDragTransaction();
    });

    act(() => {
      r.current.a.updateViewItem('node-A', { tile: { x: 3, y: 3 } });
    });
    expect(depths(r).modelPast).toBeGreaterThan(leaked);

    act(() => {
      r.current.history.undo();
    });
    // The post-leak edit is undone on its own, not swallowed with the drag.
    expect(tileOf(r, 'node-A')).toEqual({ x: 1, y: 1 });
  });
});

// ---------------------------------------------------------------------------
// E3/SCN-08 — `previewConnectorPaths` bypasses the transaction's pending state,
// so a preview issued INSIDE a transaction used to be erased by the commit: the
// bracket snapshotted the stores at open and wrote that snapshot back at close.
// It now starts empty and flushes only what `setState` actually produced, so a
// write made inside the bracket by any other route survives.
// ---------------------------------------------------------------------------
describe('a transaction does not clobber writes made by other routes', () => {
  it('keeps a connector preview issued inside the bracket', () => {
    const r = setup();
    act(() => {
      r.current.a.beginDragTransaction();
      r.current.a.createConnector({
        id: 'conn-1',
        color: 'c1',
        anchors: [
          { id: 'c1-a1', ref: { item: 'node-A' } },
          { id: 'c1-a2', ref: { item: 'node-B' } }
        ]
      });
      r.current.a.commitDragTransaction();
    });

    const restingPath = r.current.sceneApi
      .getState()
      .connectors['conn-1'].path.tiles;
    expect(restingPath.length).toBeGreaterThan(0); // precondition

    act(() => {
      r.current.history.transaction(() => {
        // A drag preview for node-A: the connector re-routes to the previewed
        // tile without the model moving.
        r.current.a.previewConnectorPaths(new Map([['node-A', { x: 3, y: 0 }]]));
      });
    });

    const previewed = r.current.sceneApi.getState().connectors['conn-1'].path.tiles;
    // The commit used to write the open-of-transaction snapshot back over it.
    expect(previewed).not.toEqual(restingPath);
  });

  it('keeps a direct store write made inside the bracket', () => {
    const r = setup();
    act(() => {
      r.current.history.transaction(() => {
        r.current.modelApi.getState().actions.set({ title: 'Written inside' }, true);
      });
    });
    expect(r.current.modelApi.getState().title).toBe('Written inside');
  });
});
