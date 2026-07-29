/**
 * E1 probes — HIST-01 (layer ops skip the logical-action sequence) and
 * HIST-04 (page creation is not undoable).
 *
 * See docs/exploratory/areas/E1-history-undo-redo.md for the hypotheses.
 *
 * `it.failing` marks a CONFIRMED bug repro (APPROACH §6): the body asserts the
 * CORRECT behaviour, so the probe is green while the bug lives and flips to an
 * unexpected pass the moment someone fixes it.
 */
import {
  setup,
  act,
  drawConnector,
  modelView,
  historyDepths,
  seqs,
  expectCoherent,
  VIEW_ID
} from './harness';

// ---------------------------------------------------------------------------
// HIST-01 — useLayerActions.commit() never allocates a logical-action sequence
// ---------------------------------------------------------------------------
describe("HIST-01 — layer ops inherit the previous action's history sequence", () => {
  it("characterization: a layer op stamps its model entry with the PREVIOUS action's seq", () => {
    const result = setup();

    drawConnector(result); // both stores, one logical action → seq N
    const afterDraw = seqs(result);
    expect(afterDraw.modelPast).toHaveLength(1);
    expect(afterDraw.scenePast).toHaveLength(1);
    expect(afterDraw.modelPast[0]).toBe(afterDraw.scenePast[0]);

    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });

    const after = seqs(result);
    expect(after.modelPast).toHaveLength(2);
    // The layer op's entry carries the SAME seq as the connector draw, because
    // useLayerActions.commit() calls modelStore.saveToHistory() without
    // allocateHistorySequence(). Two logical actions, one sequence.
    expect(after.modelPast[1]).toBe(after.modelPast[0]);
  });

  it('characterization: one undo after draw-connector → layer-op steps BOTH stacks', () => {
    const result = setup();

    drawConnector(result);
    act(() => {
      result.current.layers.createLayer({ name: 'Layer 1' });
    });
    const before = historyDepths(result);
    expect(before).toMatchObject({ modelPast: 2, scenePast: 1 });

    act(() => {
      result.current.history.undo();
    });

    const after = historyDepths(result);
    // The layer entry popped — correct. The connector's SCENE entry popped too
    // — wrong: that belongs to the earlier draw-connector action.
    expect(after.modelPast).toBe(1);
    expect(after.scenePast).toBe(0);
    expect(after.sceneFuture).toBe(1);
  });

  it.failing(
    'BUG: undoing a layer op also reverts the previous action’s scene entry, stranding a text box with no scene size',
    () => {
      const result = setup();

      // Previous logical action writes BOTH stores: the model text box plus its
      // scene size. Unlike connector paths, scene text-box sizes are NOT
      // repaired by useHistory.resyncScene (which only re-routes connectors).
      act(() => {
        result.current.scene.createTextBox({
          id: 'tb-1',
          tile: { x: 1, y: 1 },
          content: 'hello'
        });
      });
      expect(
        result.current.sceneApi.getState().textBoxes['tb-1']
      ).toBeDefined();

      // Next logical action: a layer op.
      act(() => {
        result.current.layers.createLayer({ name: 'Layer 1' });
      });

      // ONE Ctrl+Z must revert exactly ONE logical action (D-7 contract).
      act(() => {
        result.current.history.undo();
      });

      // Correct: the layer is gone and the text box is untouched.
      expect(modelView(result).layers ?? []).toHaveLength(0);
      expect(modelView(result).textBoxes).toHaveLength(1);
      // Actual: the scene entry for the text box was reverted with it — a model
      // text box with no scene size (INV-5b).
      expect(
        result.current.sceneApi.getState().textBoxes['tb-1']
      ).toBeDefined();
    }
  );

  it.failing(
    'BUG: the extra scene pop leaves an orphan scene connector after the second undo',
    () => {
      const result = setup();

      drawConnector(result);
      act(() => {
        result.current.layers.createLayer({ name: 'Layer 1' });
      });

      act(() => {
        result.current.history.undo(); // intends: undo the layer op
      });
      // resyncScene repairs the connector path the scene pop just destroyed…
      expectCoherent(result);

      act(() => {
        result.current.history.undo(); // intends: undo the connector draw
      });

      // …but the scene stack is now empty, so this undo reverts the model half
      // only: the connector leaves the model while its repaired scene path
      // stays behind (INV-3 orphan).
      expect(modelView(result).connectors ?? []).toHaveLength(0);
      const sceneIds = Object.keys(
        result.current.sceneApi.getState().connectors
      );
      expect(sceneIds).toEqual([]);
    }
  );
});

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
