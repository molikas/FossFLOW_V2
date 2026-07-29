/**
 * E1 probes — HIST-02 (a new model-only action does not invalidate the SCENE
 * redo stack) and HIST-03 (independent 50-entry trimming splits a logical
 * action across the two stacks).
 *
 * See docs/exploratory/areas/E1-history-undo-redo.md.
 */
import {
  setup,
  act,
  drawConnector,
  placeIcon,
  modelView,
  historyDepths,
  seqs,
  orphanSceneConnectors
} from './harness';

// ---------------------------------------------------------------------------
// HIST-02 — redo-stack invalidation is per-store, not per-logical-action
// ---------------------------------------------------------------------------
describe('HIST-02 — a new model-only action leaves the scene redo stack armed', () => {
  it('characterization: the scene future survives a model-only action', () => {
    const result = setup();

    drawConnector(result); // both stores
    act(() => {
      result.current.history.undo();
    });
    expect(historyDepths(result)).toMatchObject({
      modelFuture: 1,
      sceneFuture: 1
    });

    placeIcon(result); // model-only: scene set() yields 0 patches → early return

    const after = historyDepths(result);
    expect(after.modelFuture).toBe(0); // model store cleared its own future
    expect(after.sceneFuture).toBe(1); // scene store did NOT
  });

  it.failing(
    'BUG: redo stays available after a new action and resurrects the undone connector’s scene path',
    () => {
      const result = setup();

      drawConnector(result);
      act(() => {
        result.current.history.undo();
      });
      expect(modelView(result).connectors ?? []).toHaveLength(0);

      placeIcon(result); // a NEW action — redo must be dead from here on

      // Correct: nothing to redo.
      expect(result.current.history.canRedo).toBe(false);

      act(() => {
        result.current.history.redo();
      });

      // Correct: no scene path may exist for a connector the model does not have.
      expect(orphanSceneConnectors(result)).toEqual([]);
    }
  );
});

// ---------------------------------------------------------------------------
// HIST-03 — independent MAX_HISTORY_SIZE trimming
// ---------------------------------------------------------------------------
describe('HIST-03 — 50-entry trimming splits one logical action across the stacks', () => {
  it.failing(
    'BUG: after 50 model-only actions the shared-seq model entry is evicted while its scene half survives',
    () => {
      const result = setup();

      drawConnector(result); // the shared logical action, seq N
      const sharedSeq = seqs(result).scenePast[0];

      // 50 model-only actions — enough to push the model stack over its cap.
      for (let i = 0; i < 50; i += 1) {
        placeIcon(result, `node-${i}`, { x: 10 + i, y: 10 });
      }

      const depths = historyDepths(result);
      expect(depths.modelPast).toBe(50); // capped
      expect(depths.scenePast).toBe(1); // untouched by model-only actions

      const modelSeqs = seqs(result).modelPast;
      // Correct: the two halves of one logical action are evicted together (or
      // neither is). Actual: the model half of `sharedSeq` was shifted out while
      // the scene half is still sitting at the bottom of the scene stack.
      expect(modelSeqs).toContain(sharedSeq);
    }
  );

  it('characterization: for CONNECTORS the split is masked — resyncScene repairs the orphaned path', () => {
    const result = setup();

    drawConnector(result);
    for (let i = 0; i < 50; i += 1) {
      placeIcon(result, `node-${i}`, { x: 10 + i, y: 10 });
    }
    for (let i = 0; i < 60; i += 1) {
      act(() => {
        result.current.history.undo();
      });
    }

    // The connector's model half was evicted (so it survives every undo) and its
    // scene half was undone alone — but resyncScene re-routes it, so the visible
    // outcome is coherent. The masking is exactly why the text-box case below
    // matters: resyncScene handles connectors only.
    expect(modelView(result).connectors ?? []).toHaveLength(1);
    expect(orphanSceneConnectors(result)).toEqual([]);
    expect(historyDepths(result).scenePast).toBe(0);
  });

  it.failing(
    'BUG: draining the model stack undoes a text box’s scene half whose model half was evicted',
    () => {
      const result = setup();

      // Both-stores logical action whose scene half resyncScene will NOT repair.
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

      for (let i = 0; i < 50; i += 1) {
        placeIcon(result, `node-${i}`, { x: 10 + i, y: 10 });
      }
      for (let i = 0; i < 60; i += 1) {
        act(() => {
          result.current.history.undo();
        });
      }

      // The text box's model half was trimmed out of the model stack, so the
      // text box itself survives every undo. Correct: its scene size survives
      // with it. Actual: the scene half was still on the scene stack and got
      // undone alone → a model text box with no scene size (INV-5b), permanently.
      expect(modelView(result).textBoxes ?? []).toHaveLength(1);
      expect(
        result.current.sceneApi.getState().textBoxes['tb-1']
      ).toBeDefined();
    }
  );
});
