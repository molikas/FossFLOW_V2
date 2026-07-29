/**
 * E1 probes — HIST-14 (off-grid `offset` across an undo) and HIST-15 (what the
 * 50-entry cap silently discards).
 *
 * See docs/exploratory/areas/E1-history-undo-redo.md.
 */
import { setup, act, placeIcon, modelView, historyDepths } from './harness';

const nodeA = (result: ReturnType<typeof setup>) =>
  modelView(result).items.find((i) => i.id === 'node-A');

// ---------------------------------------------------------------------------
// HIST-14 — offset-omission bug class applied to the history surface
// ---------------------------------------------------------------------------
describe('HIST-14 — undo of a snap-back restores the off-grid offset', () => {
  it('a drag that clears `offset` is undone with the offset restored', () => {
    const result = setup();

    // Put node-A off-grid (ADR 0023: integer tile + px residual).
    act(() => {
      result.current.scene.beginDragTransaction();
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 1, y: 1 }, offset: { x: 17, y: -9 } }
      ]);
      result.current.scene.commitDragTransaction();
    });
    expect(nodeA(result)!.offset).toEqual({ x: 17, y: -9 });

    // Second drag re-snaps to the grid: `offset` is written as undefined.
    act(() => {
      result.current.scene.beginDragTransaction();
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 2, y: 2 }, offset: undefined }
      ]);
      result.current.scene.commitDragTransaction();
    });
    expect(nodeA(result)!.offset).toBeUndefined();

    act(() => {
      result.current.history.undo();
    });

    // The undone snap-back must bring the off-grid residual back with the tile.
    expect(nodeA(result)!.tile).toEqual({ x: 1, y: 1 });
    expect(nodeA(result)!.offset).toEqual({ x: 17, y: -9 });
  });

  it('undo→redo→undo of an off-grid drag is idempotent on both tile and offset', () => {
    const result = setup();

    act(() => {
      result.current.scene.beginDragTransaction();
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 4, y: 4 }, offset: { x: 3, y: 21 } }
      ]);
      result.current.scene.commitDragTransaction();
    });
    const after = { ...nodeA(result)! };

    act(() => {
      result.current.history.undo();
    });
    expect(nodeA(result)!.tile).toEqual({ x: 0, y: 0 });
    expect(nodeA(result)!.offset).toBeUndefined();

    act(() => {
      result.current.history.redo();
    });
    expect(nodeA(result)!.tile).toEqual(after.tile);
    expect(nodeA(result)!.offset).toEqual(after.offset);

    act(() => {
      result.current.history.undo();
    });
    expect(nodeA(result)!.tile).toEqual({ x: 0, y: 0 });
    expect(nodeA(result)!.offset).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HIST-15 — the depth cap discards the base state with no signal
// ---------------------------------------------------------------------------
describe('HIST-15 — undoing everything after >50 edits does not reach the original', () => {
  it('characterization: 60 edits then undo-until-exhausted leaves 10 edits applied', () => {
    const result = setup();

    const originalItemCount = modelView(result).items.length;
    expect(originalItemCount).toBe(2);

    for (let i = 0; i < 60; i += 1) {
      placeIcon(result, `node-${i}`, { x: 10 + i, y: 10 });
    }
    expect(modelView(result).items).toHaveLength(62);
    expect(historyDepths(result).modelPast).toBe(50); // capped

    let guard = 0;
    while (result.current.history.canUndo && guard < 200) {
      act(() => {
        result.current.history.undo();
      });
      guard += 1;
    }

    // canUndo now reports "nothing left to undo" — but 10 of the 60 edits are
    // still applied, with no signal that history was truncated.
    expect(result.current.history.canUndo).toBe(false);
    expect(modelView(result).items).toHaveLength(originalItemCount + 10);
  });
});
