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
// HIST-05 (a throwing reducer left `pendingPre` armed for the next skipHistory
// writer) was fixed — every mutating action runs through `withHistory`, which
// discards the armed snapshot on a throw. Promoted to
// `src/hooks/__tests__/historyBrackets.test.tsx`.

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
// HIST-07 (a foreign mid-drag write re-armed the frozen pre-drag snapshot, so
// undo landed mid-drag) was fixed by moving the bracket state to the shared
// session. Promoted to `src/hooks/__tests__/historyBrackets.test.tsx`.

// ---------------------------------------------------------------------------
// HIST-08 — useHistory.transaction vs useSceneActions.transaction
// HIST-08 was ruled DELEGATE (2026-07-30) and implemented:
// `useHistory.transaction` is now a pass-through to `useSceneActions.transaction`,
// and the bracket state they share lives on the scene store's provider-scoped
// `editSession`. Promoted to `src/hooks/__tests__/historyBrackets.test.tsx`.
