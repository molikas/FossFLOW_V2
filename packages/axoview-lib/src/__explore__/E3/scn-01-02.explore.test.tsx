/**
 * E3 probes — the `computePathsAsync` race window.
 *
 *  SCN-01  a connector deleted mid-routing gets its scene entry re-added
 *  SCN-02  the whole-scene write clobbers any scene edit made after the snapshot
 *
 * `pasteItems` commits synchronously and then schedules connector routing on
 * requestAnimationFrame in 25-connector batches. Everything the user does in
 * that window races the batch. See docs/reviews/exploratory-2026-07/areas/E3-scene-actions-paste.md.
 */
import { installCanvasStub } from '../canvasStub';
import {
  setup,
  act,
  modelView,
  orphanSceneConnectors,
  makePastePayload,
  flushAnimationFrames
} from './harness';

installCanvasStub();

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('SCN-01 — a connector deleted mid-routing is resurrected in the scene', () => {
  it('characterization: paste commits synchronously, routing lands on a later frame', () => {
    const result = setup();

    act(() => {
      result.current.scene.pasteItems(makePastePayload(2));
    });

    // Model is complete immediately…
    expect(modelView(result).connectors).toHaveLength(1);
    // …but the path is still the provisional empty one.
    expect(
      result.current.sceneApi.getState().connectors['p-conn-0'].path.tiles
    ).toHaveLength(0);

    flushAnimationFrames();

    expect(
      result.current.sceneApi.getState().connectors['p-conn-0'].path.tiles
        .length
    ).toBeGreaterThan(0);
  });

  it('FALSIFIED: deleting the pasted connector before routing leaves NO orphan', () => {
      const result = setup();

      act(() => {
        result.current.scene.pasteItems(makePastePayload(2));
      });
      expect(modelView(result).connectors).toHaveLength(1);

      // The user deletes it before the rAF batch runs.
      act(() => {
        result.current.scene.deleteConnector('p-conn-0');
      });
      expect(modelView(result).connectors).toHaveLength(0);
      expect(orphanSceneConnectors(result)).toEqual([]);

      flushAnimationFrames();

      // No resurrection: `processNextBatch` re-reads model+scene at BATCH time
      // (not at call time), and wraps each `syncConnector` in try/catch for
      // exactly this case, so a connector deleted before its batch simply drops
      // out of the routing set.
      expect(orphanSceneConnectors(result)).toEqual([]);
      expect(
        result.current.sceneApi.getState().connectors['p-conn-0']
      ).toBeUndefined();
  });

  it('FALSIFIED: the same holds ACROSS batches — 30 connectors, delete between frames', () => {
    const result = setup();

    act(() => {
      result.current.scene.pasteItems(makePastePayload(31));
    });
    expect(modelView(result).connectors).toHaveLength(30);

    // One frame: batch 1 routes the first 25 and re-schedules.
    act(() => {
      jest.advanceTimersByTime(20);
    });

    // Delete a connector that belongs to the SECOND batch, mid-flight.
    act(() => {
      result.current.scene.deleteConnector('p-conn-27');
    });

    flushAnimationFrames();

    expect(orphanSceneConnectors(result)).toEqual([]);
    expect(
      result.current.sceneApi.getState().connectors['p-conn-27']
    ).toBeUndefined();
  });
});

describe('SCN-02 — the batch write clobbers concurrent scene edits', () => {
  it('FALSIFIED: a text box created during the routing window keeps its scene size', () => {
      const result = setup();

      act(() => {
        result.current.scene.pasteItems(makePastePayload(2));
      });

      // A perfectly ordinary edit while the connectors are still routing.
      act(() => {
        result.current.scene.createTextBox({
          id: 'tb-1',
          tile: { x: 1, y: 1 },
          content: 'typed during routing'
        });
      });
      expect(
        result.current.sceneApi.getState().textBoxes['tb-1']
      ).toBeDefined();

      flushAnimationFrames();

      // The batch's whole-scene write is built from a read taken at batch time,
      // so the text box created after the paste is inside it.
      expect(
        result.current.sceneApi.getState().textBoxes['tb-1']
      ).toBeDefined();
      expect(modelView(result).textBoxes).toHaveLength(1);
  });

  it('FALSIFIED: a node moved during the routing window keeps its recomputed path', () => {
      const result = setup();

      act(() => {
        result.current.scene.pasteItems(makePastePayload(3));
      });
      flushAnimationFrames();

      // Second paste keeps the rAF queue busy while we move a node.
      act(() => {
        result.current.scene.pasteItems(makePastePayload(3, 'q'));
      });

      act(() => {
        result.current.scene.updateViewItem('p-item-0', {
          tile: { x: 30, y: 30 }
        });
      });
      const pathAfterMove = result.current.sceneApi
        .getState()
        .connectors['p-conn-0'].path.tiles.slice();

      flushAnimationFrames();

      expect(
        result.current.sceneApi.getState().connectors['p-conn-0'].path.tiles
      ).toEqual(pathAfterMove);
  });
});
