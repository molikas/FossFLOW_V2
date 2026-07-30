/**
 * E1 probe — HIST-04 (page creation is not undoable).
 *
 * HIST-01 lived here too; it was fixed and promoted to
 * `src/hooks/__tests__/useLayerActions.history.test.tsx`.
 *
 * See docs/exploratory/areas/E1-history-undo-redo.md for the hypotheses.
 *
 * `it.failing` marks a CONFIRMED bug repro (APPROACH §6): the body asserts the
 * CORRECT behaviour, so the probe is green while the bug lives and flips to an
 * unexpected pass the moment someone fixes it.
 */
import { installCanvasStub } from '../canvasStub';
import { setup, act, modelView, historyDepths, VIEW_ID } from './harness';

// jsdom has no canvas 2D context; text-box probes need a measurer or the
// reducer throws during setup and an it.failing body "passes" for the wrong
// reason. See __explore__/canvasStub.ts.
installCanvasStub();

// ---------------------------------------------------------------------------
// HIST-04 — createView writes skipHistory with no saveToHistoryBeforeChange
// ---------------------------------------------------------------------------
describe('HIST-04 — creating a page is not undoable', () => {
  it('characterization: createView pushes no history entry at all', () => {
    const result = setup();

    act(() => {
      result.current.scene.updateView(VIEW_ID, { name: 'Renamed page' });
    });
    expect(historyDepths(result).modelPast).toBe(1);

    act(() => {
      result.current.scene.createView({ name: 'Page 2' });
    });

    expect(result.current.modelApi.getState().views).toHaveLength(2);
    // No entry for the page creation — the depth is unchanged.
    expect(historyDepths(result).modelPast).toBe(1);
  });

  it.failing(
    'BUG: Ctrl+Z after "New page" reverts the PREVIOUS action and leaves the page',
    () => {
      const result = setup();

      act(() => {
        result.current.scene.updateView(VIEW_ID, { name: 'Renamed page' });
      });
      act(() => {
        result.current.scene.createView({ name: 'Page 2' });
      });

      act(() => {
        result.current.history.undo();
      });

      // Correct: the undo removes the page just created, leaving the rename.
      expect(result.current.modelApi.getState().views).toHaveLength(1);
      expect(modelView(result).name).toBe('Renamed page');
    }
  );

  it.failing(
    'BUG: create/delete page are asymmetric — delete records an undo entry, create does not',
    () => {
      const result = setup();

      act(() => {
        result.current.scene.createView({ name: 'Page 2' });
      });
      const afterCreate = historyDepths(result).modelPast;

      const secondViewId = result.current.modelApi
        .getState()
        .views.find((v) => v.id !== VIEW_ID)!.id;

      act(() => {
        result.current.scene.deleteView(secondViewId);
      });
      const afterDelete = historyDepths(result).modelPast;

      expect(afterDelete - afterCreate).toBe(1);
      expect(afterCreate).toBe(1); // create must record an entry too
    }
  );
});
