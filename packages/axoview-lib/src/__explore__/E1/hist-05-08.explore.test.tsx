/**
 * E1 probes — the pendingPre / transaction-bracket family.
 *
 *  HIST-05  orphaned pendingPre after a throwing reducer
 *  HIST-06  leaked drag bracket (begin without commit)
 *  HIST-07  dragInProgress is per-hook-instance
 *  HIST-08  useHistory.transaction does not suppress useSceneActions history
 *
 * See docs/exploratory/areas/E1-history-undo-redo.md.
 */
import React from 'react';
import { renderHook } from '@testing-library/react';
import {
  setup,
  act,
  placeIcon,
  drawConnector,
  modelView,
  historyDepths,
  Providers,
  useTestHarness,
  seedView,
  VIEW_ID
} from './harness';
import { useScene } from 'src/hooks/useScene';

// ---------------------------------------------------------------------------
// HIST-05 — a reducer throw leaves pendingPre armed; the next skipHistory write
//           consumes it and records a diff nobody asked for.
// ---------------------------------------------------------------------------
describe('HIST-05 — orphaned pendingPre after a throwing reducer', () => {
  it.failing(
    'BUG: a failed edit arms pendingPre, and the next page switch records a bogus history entry',
    () => {
      const result = setup();

      placeIcon(result, 'node-C', { x: 3, y: 3 });
      const baseline = historyDepths(result);

      // A user edit whose reducer throws: UPDATE_VIEWITEM on an id that is not
      // in the view. saveToHistoryBeforeChange() has already run at this point.
      expect(() => {
        act(() => {
          result.current.scene.updateViewItem('does-not-exist', {
            tile: { x: 9, y: 9 }
          });
        });
      }).toThrow();

      // Nothing changed, so nothing should have entered history…
      expect(historyDepths(result).modelPast).toBe(baseline.modelPast);

      // …and the next skipHistory-only write (a page switch rebuilds the scene
      // via SYNC_SCENE) must not record anything either.
      act(() => {
        result.current.scene.switchView(VIEW_ID);
      });

      expect(historyDepths(result).scenePast).toBe(baseline.scenePast);
      expect(historyDepths(result).modelPast).toBe(baseline.modelPast);
    }
  );

  it('characterization: the bogus entry lands on the SCENE stack at the page switch', () => {
    const result = setup();

    placeIcon(result, 'node-C', { x: 3, y: 3 });
    const baseline = historyDepths(result);

    expect(() => {
      act(() => {
        result.current.scene.updateViewItem('does-not-exist', {
          tile: { x: 9, y: 9 }
        });
      });
    }).toThrow();

    // The throw itself records nothing — pendingPre is merely left armed.
    expect(historyDepths(result).modelPast).toBe(baseline.modelPast);
    expect(historyDepths(result).scenePast).toBe(baseline.scenePast);

    act(() => {
      result.current.scene.switchView(VIEW_ID);
    });

    // changeView's SYNC_SCENE write is skipHistory, but the armed pendingPre
    // turns it into a recorded entry anyway.
    expect(historyDepths(result).scenePast).toBe(baseline.scenePast + 1);
  });
});

// ---------------------------------------------------------------------------
// HIST-06 — leaked drag bracket
// ---------------------------------------------------------------------------
describe('HIST-06 — beginDragTransaction without a commit', () => {
  it.failing(
    'BUG: every edit after a leaked drag bracket is un-undoable while canUndo still reports true',
    () => {
      const result = setup();

      placeIcon(result, 'node-C', { x: 3, y: 3 }); // the pre-drag action
      const beforeLeak = historyDepths(result).modelPast;

      // Drag starts and the mouseup is lost (window blur, stolen contextmenu):
      // commitDragTransaction never runs.
      act(() => {
        result.current.scene.beginDragTransaction();
        result.current.scene.batchUpdateViewItemTiles([
          { id: 'node-C', tile: { x: 8, y: 8 } }
        ]);
      });

      // Later, keyboard-only edits.
      act(() => {
        result.current.scene.updateView(VIEW_ID, { name: 'Renamed' });
      });
      act(() => {
        result.current.scene.createLabel({
          id: 'lbl-1',
          tile: { x: 2, y: 2 },
          text: 'note'
        });
      });

      // Correct: two further edits, two further undo entries.
      expect(historyDepths(result).modelPast).toBe(beforeLeak + 2);
    }
  );

  it('characterization: the next Ctrl+Z silently DESTROYS the un-recorded edits', () => {
    const result = setup();

    placeIcon(result, 'node-C', { x: 3, y: 3 });

    act(() => {
      result.current.scene.beginDragTransaction();
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-C', tile: { x: 8, y: 8 } }
      ]);
    });
    act(() => {
      result.current.scene.updateView(VIEW_ID, { name: 'Renamed' });
    });
    expect(modelView(result).name).toBe('Renamed');
    expect(historyDepths(result).modelPast).toBe(1); // only the place-icon

    // canUndo is still true (the pre-drag entry is there)…
    expect(result.current.history.canUndo).toBe(true);

    act(() => {
      result.current.history.undo();
    });

    // …and because every entry's patch replaces the whole `views` array (the
    // store diffs `Object.assign(draft, next)` where `next.views` is a fresh
    // array), the undo rolls `views` back wholesale: the un-recorded rename AND
    // the drag are wiped along with the node, with no redo entry for either.
    expect(
      (modelView(result).items ?? []).some((i) => i.id === 'node-C')
    ).toBe(false);
    expect(modelView(result).name).toBe('View');
  });
});

// ---------------------------------------------------------------------------
// HIST-07 — dragInProgress is a per-hook-instance ref
// ---------------------------------------------------------------------------
describe('HIST-07 — a second useSceneActions instance ignores the open drag', () => {
  it.failing(
    'BUG: an edit from another component mid-drag overwrites the frozen pre-drag snapshot',
    () => {
      // Two hook instances under ONE provider pair — the real shape when two
      // components each call useScene()/useSceneActions().
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <Providers>{children}</Providers>
      );
      const { result } = renderHook(
        () => ({ main: useTestHarness(), other: useScene() }),
        { wrapper }
      );

      act(() => {
        result.current.main.uiStateApi.getState().actions.setView(VIEW_ID);
        result.current.main.modelApi.getState().actions.set(seedView(), true);
        result.current.main.modelApi.getState().actions.clearHistory();
        result.current.main.sceneApi.getState().actions.clearHistory();
      });

      // Drag node-A from (0,0) — the pre-drag snapshot is frozen here.
      act(() => {
        result.current.main.scene.beginDragTransaction();
        result.current.main.scene.batchUpdateViewItemTiles([
          { id: 'node-A', tile: { x: 2, y: 2 } }
        ]);
      });

      // A different component writes mid-drag. Its own dragInProgress ref is
      // false, so saveToHistoryBeforeChange() runs and overwrites pendingPre
      // with the MID-DRAG state.
      act(() => {
        result.current.other.updateView(VIEW_ID, { name: 'Renamed mid-drag' });
      });

      act(() => {
        result.current.main.scene.batchUpdateViewItemTiles([
          { id: 'node-A', tile: { x: 4, y: 4 } }
        ]);
        result.current.main.scene.commitDragTransaction();
      });

      act(() => {
        result.current.main.history.undo();
      });

      // Correct: undo returns node-A to where the drag started.
      const nodeA = result.current.main.modelApi
        .getState()
        .views.find((v) => v.id === VIEW_ID)!
        .items.find((i) => i.id === 'node-A');
      expect(nodeA?.tile).toEqual({ x: 0, y: 0 });
    }
  );

  it('characterization: undo lands node-A on the mid-drag tile, not its origin', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Providers>{children}</Providers>
    );
    const { result } = renderHook(
      () => ({ main: useTestHarness(), other: useScene() }),
      { wrapper }
    );

    act(() => {
      result.current.main.uiStateApi.getState().actions.setView(VIEW_ID);
      result.current.main.modelApi.getState().actions.set(seedView(), true);
      result.current.main.modelApi.getState().actions.clearHistory();
      result.current.main.sceneApi.getState().actions.clearHistory();
    });

    act(() => {
      result.current.main.scene.beginDragTransaction();
      result.current.main.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 2, y: 2 } }
      ]);
    });
    act(() => {
      result.current.other.updateView(VIEW_ID, { name: 'Renamed mid-drag' });
    });
    act(() => {
      result.current.main.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 4, y: 4 } }
      ]);
      result.current.main.scene.commitDragTransaction();
    });
    act(() => {
      result.current.main.history.undo();
    });

    const nodeA = result.current.main.modelApi
      .getState()
      .views.find((v) => v.id === VIEW_ID)!
      .items.find((i) => i.id === 'node-A');
    // The foreign write re-armed pendingPre with the mid-drag state, so the
    // drag's commit entry only covers the second half of the gesture.
    expect(nodeA?.tile).toEqual({ x: 2, y: 2 });
  });
});

// ---------------------------------------------------------------------------
// HIST-08 — useHistory.transaction vs useSceneActions.transaction
// ---------------------------------------------------------------------------
describe('HIST-08 — useHistory.transaction over scene CRUD', () => {
  it.failing(
    'BUG: three scene ops inside useHistory.transaction produce more than one undo entry',
    () => {
      const result = setup();

      const before = historyDepths(result).modelPast;

      act(() => {
        result.current.history.transaction(() => {
          result.current.scene.createLabel({
            id: 'lbl-1',
            tile: { x: 1, y: 1 },
            text: 'a'
          });
          result.current.scene.createLabel({
            id: 'lbl-2',
            tile: { x: 2, y: 2 },
            text: 'b'
          });
          result.current.scene.createLabel({
            id: 'lbl-3',
            tile: { x: 3, y: 3 },
            text: 'c'
          });
        });
      });

      expect(modelView(result).labels).toHaveLength(3);
      // Correct: a transaction is ONE undo entry.
      expect(historyDepths(result).modelPast).toBe(before + 1);
    }
  );

  it('control: useSceneActions.transaction over the same three ops IS one entry', () => {
    const result = setup();
    const before = historyDepths(result).modelPast;

    act(() => {
      result.current.scene.transaction(() => {
        result.current.scene.createLabel({
          id: 'lbl-1',
          tile: { x: 1, y: 1 },
          text: 'a'
        });
        result.current.scene.createLabel({
          id: 'lbl-2',
          tile: { x: 2, y: 2 },
          text: 'b'
        });
        result.current.scene.createLabel({
          id: 'lbl-3',
          tile: { x: 3, y: 3 },
          text: 'c'
        });
      });
    });

    expect(modelView(result).labels).toHaveLength(3);
    expect(historyDepths(result).modelPast).toBe(before + 1);
  });

  it('characterization: useHistory.transaction yields one entry PER op', () => {
    const result = setup();
    const before = historyDepths(result).modelPast;

    act(() => {
      result.current.history.transaction(() => {
        result.current.scene.createLabel({
          id: 'lbl-1',
          tile: { x: 1, y: 1 },
          text: 'a'
        });
        result.current.scene.createLabel({
          id: 'lbl-2',
          tile: { x: 2, y: 2 },
          text: 'b'
        });
        result.current.scene.createLabel({
          id: 'lbl-3',
          tile: { x: 3, y: 3 },
          text: 'c'
        });
      });
    });

    expect(historyDepths(result).modelPast).toBe(before + 3);

    act(() => {
      result.current.history.undo();
    });
    // One Ctrl+Z removes only the last label of the "atomic" group.
    expect(modelView(result).labels).toHaveLength(2);
  });
});

// Keep the import used so lint/ts stay quiet about the unused symbol when a
// probe is trimmed.
void drawConnector;
