/**
 * E3 probes — transaction-boundary contracts.
 *
 *  SCN-05  createView/switchView ignore the open transaction's pending state
 *  SCN-06  pasteItems validates before rectangles/text boxes/labels are added
 *  SCN-07  the batch updaters' "drag-only" contract is unenforced
 *  SCN-08  previewConnectorPaths writes past an open transaction
 *
 * See docs/exploratory/areas/E3-scene-actions-paste.md.
 */
import { installCanvasStub } from '../canvasStub';
import {
  setup,
  act,
  modelView,
  historyDepths,
  makePastePayload,
  flushAnimationFrames,
  VIEW_ID
} from './harness';
import { validateView } from 'src/schemas/validation';

installCanvasStub();

// ---------------------------------------------------------------------------
// SCN-05 — view lifecycle inside an open transaction
// ---------------------------------------------------------------------------
describe('SCN-05 — createView inside a transaction', () => {
  it('FALSIFIED: a page created inside a transaction survives the commit', () => {
      const result = setup();

      act(() => {
        result.current.scene.transaction(() => {
          result.current.scene.createLabel({
            id: 'lbl-1',
            tile: { x: 1, y: 1 },
            text: 'a'
          });
          // Any compound operation that also wants a new page — e.g. a future
          // "move selection to a new page" command.
          result.current.scene.createView({ name: 'Page 2' });
        });
      });

      // `createView` builds its new state from the transaction-aware
      // `getState()` (which returns `pendingStateRef` while a transaction is
      // open) and writes through the same `setState`, so both the label and the
      // page are in the committed state.
      expect(result.current.modelApi.getState().views).toHaveLength(2);
      expect(modelView(result).labels).toHaveLength(1);
  });

  it('characterization: only the NAME derivation reads past the transaction', () => {
    const result = setup();

    act(() => {
      result.current.scene.transaction(() => {
        result.current.scene.createLabel({
          id: 'lbl-1',
          tile: { x: 1, y: 1 },
          text: 'a'
        });
        result.current.scene.createView({ name: 'Page 2' });
      });
    });

    // The one read that does bypass the transaction is the page-name counter
    // (`modelStoreApi.getState().views.length`), which is what SCN-13 probes.
    // Structurally the transaction is honoured.
    expect(modelView(result).labels).toHaveLength(1);
    expect(result.current.modelApi.getState().views).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// SCN-06 — paste validates before the non-bulk entities are layered on
// ---------------------------------------------------------------------------
describe('SCN-06 — pasteItems validation window', () => {
  it.failing(
    'BUG: a pasted rectangle with a dangling colour ref lands unvalidated and poisons the view',
    () => {
      const result = setup();

      const payload = makePastePayload(0);
      (payload as unknown as { rectangles: unknown[] }).rectangles = [
        {
          id: 'rect-1',
          from: { x: 1, y: 1 },
          to: { x: 3, y: 3 },
          color: 'colour-that-does-not-exist'
        }
      ];

      act(() => {
        result.current.scene.pasteItems(payload);
      });

      // Either the paste is rejected, or the pasted content is valid. What must
      // NOT happen is a committed view that validateView rejects.
      expect(validateView(modelView(result), {
        model: result.current.modelApi.getState()
      })).toEqual([]);
    }
  );

  it('characterization: the poisoned view then refuses every node move (RED-02 compound)', () => {
    const result = setup();

    const payload = makePastePayload(0);
    (payload as unknown as { rectangles: unknown[] }).rectangles = [
      {
        id: 'rect-1',
        from: { x: 1, y: 1 },
        to: { x: 3, y: 3 },
        color: 'colour-that-does-not-exist'
      }
    ];

    act(() => {
      result.current.scene.pasteItems(payload);
    });
    expect(modelView(result).rectangles).toHaveLength(1);

    expect(() => {
      act(() => {
        result.current.scene.updateViewItem('node-A', { tile: { x: 2, y: 2 } });
      });
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SCN-07 — the batch updaters' drag-only contract
// ---------------------------------------------------------------------------
describe('SCN-07 — batchUpdateViewItemTiles outside a drag bracket', () => {
  it.failing(
    'BUG: a batch move made outside a drag transaction is real but un-undoable',
    () => {
      const result = setup();
      const before = historyDepths(result).modelPast;

      // No beginDragTransaction — nothing enforces the documented contract.
      act(() => {
        result.current.scene.batchUpdateViewItemTiles([
          { id: 'node-A', tile: { x: 9, y: 9 } }
        ]);
      });

      expect(
        modelView(result).items.find((i) => i.id === 'node-A')!.tile
      ).toEqual({ x: 9, y: 9 });
      // The move happened, so it must be undoable.
      expect(historyDepths(result).modelPast).toBe(before + 1);
    }
  );

  it('characterization: the move lands with zero history entries and canUndo stays false', () => {
    const result = setup();

    act(() => {
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'node-A', tile: { x: 9, y: 9 } }
      ]);
    });

    expect(
      modelView(result).items.find((i) => i.id === 'node-A')!.tile
    ).toEqual({ x: 9, y: 9 });
    expect(historyDepths(result).modelPast).toBe(0);
    expect(result.current.history.canUndo).toBe(false);
  });

  it('characterization: the same call also bypasses validateView entirely', () => {
    const result = setup();

    // A tile that would fail nothing today, but the point is the absence of the
    // check: batchUpdate* never runs validateView, so any invariant the reducer
    // path enforces is simply not enforced here.
    act(() => {
      result.current.scene.batchUpdateViewItemTiles([
        { id: 'not-in-this-view', tile: { x: 1, y: 1 } }
      ]);
    });

    // Silently ignored rather than throwing (the reducer path would throw).
    expect(modelView(result).items.map((i) => i.id)).toEqual([
      'node-A',
      'node-B'
    ]);
  });
});

// ---------------------------------------------------------------------------
// SCN-08 — previewConnectorPaths vs an open transaction
// ---------------------------------------------------------------------------
describe('SCN-08 — previewConnectorPaths inside a transaction', () => {
  it.failing(
    'BUG: preview paths written during a transaction are erased by the commit',
    () => {
      const result = setup();

      act(() => {
        result.current.scene.createConnector({
          id: 'conn-1',
          color: 'c1',
          anchors: [
            { id: 'a1', ref: { item: 'node-A' } },
            { id: 'a2', ref: { item: 'node-B' } }
          ]
        });
      });
      const original = result.current.sceneApi
        .getState()
        .connectors['conn-1'].path.tiles.slice();

      act(() => {
        result.current.scene.transaction(() => {
          result.current.scene.previewConnectorPaths(
            new Map([['node-A', { x: 12, y: 12 }]])
          );
        });
      });

      // The preview wrote straight to the store; the commit then wrote the
      // transaction's pending scene (captured before the preview) over it.
      expect(
        result.current.sceneApi.getState().connectors['conn-1'].path.tiles
      ).not.toEqual(original);
    }
  );

  it('characterization: the preview write survives OUTSIDE a transaction', () => {
    const result = setup();

    act(() => {
      result.current.scene.createConnector({
        id: 'conn-1',
        color: 'c1',
        anchors: [
          { id: 'a1', ref: { item: 'node-A' } },
          { id: 'a2', ref: { item: 'node-B' } }
        ]
      });
    });
    const original = result.current.sceneApi
      .getState()
      .connectors['conn-1'].path.tiles.slice();

    act(() => {
      result.current.scene.previewConnectorPaths(
        new Map([['node-A', { x: 12, y: 12 }]])
      );
    });

    expect(
      result.current.sceneApi.getState().connectors['conn-1'].path.tiles
    ).not.toEqual(original);
  });
});

void flushAnimationFrames;
void VIEW_ID;
