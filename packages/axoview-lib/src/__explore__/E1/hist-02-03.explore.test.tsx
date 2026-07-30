/**
 * E1 probes — HIST-02 (a new model-only action does not invalidate the SCENE
 * redo stack) and HIST-03 (independent 50-entry trimming splits a logical
 * action across the two stacks).
 *
 * See docs/exploratory/areas/E1-history-undo-redo.md.
 */
import { installCanvasStub } from '../canvasStub';
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

// jsdom has no canvas 2D context; text-box probes need a measurer or the
// reducer throws during setup and an it.failing body "passes" for the wrong
// reason. See __explore__/canvasStub.ts.
installCanvasStub();

// ---------------------------------------------------------------------------
// HIST-02 — redo-stack invalidation is per-store, not per-logical-action
// HIST-02 (a new action after an undo left the OTHER store's redo stack armed,
// so Redo re-applied a stale patch) was fixed — a new logical action clears both
// futures. Promoted to `src/hooks/__tests__/historyBrackets.test.tsx`.

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

  it('characterization: pins the exact end state — text box present, scene size gone', () => {
    const result = setup();

    act(() => {
      result.current.scene.createTextBox({
        id: 'tb-1',
        tile: { x: 1, y: 1 },
        content: 'hello'
      });
    });
    expect(result.current.sceneApi.getState().textBoxes['tb-1']).toBeDefined();

    for (let i = 0; i < 50; i += 1) {
      placeIcon(result, `node-${i}`, { x: 10 + i, y: 10 });
    }
    for (let i = 0; i < 60; i += 1) {
      act(() => {
        result.current.history.undo();
      });
    }

    expect(modelView(result).textBoxes ?? []).toHaveLength(1);
    expect(
      result.current.sceneApi.getState().textBoxes['tb-1']
    ).toBeUndefined();
  });
});
