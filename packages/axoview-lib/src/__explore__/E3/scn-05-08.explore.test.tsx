/**
 * E3 probes — transaction-boundary contracts.
 *
 *  SCN-05  createView/switchView ignore the open transaction's pending state
 *  SCN-06  pasteItems validates before rectangles/text boxes/labels are added
 *  SCN-07  the batch updaters' "drag-only" contract is unenforced
 *  SCN-08  previewConnectorPaths writes past an open transaction
 *
 * See docs/reviews/exploratory-2026-07/areas/E3-scene-actions-paste.md.
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

  // RE-DERIVED 2026-08-02. This characterization asserted the RED-02 AMPLIFIER —
  // that one bad reference anywhere in a view made every later node move throw —
  // and wave 4 fixed exactly that: `updateViewItem` now diffs the issue set
  // against the pre-state and only rejects what the ACTION introduced, leaving
  // pre-existing problems for the load-time repair (wave 1's repair-don't-reject
  // ruling). So the paste still lands a rectangle with an unknown colour, and
  // the view stays editable.
  //
  // The SCN-06 finding itself — that `pasteItems` accepts an entity referencing
  // a colour the model does not have — is UNCHANGED and still open. What
  // changed is its blast radius, which is the whole point of having fixed the
  // amplifier first.
  it('characterization: the poisoned view is still EDITABLE (RED-02 fixed)', () => {
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
    // PRECONDITION: the bad reference really did land — the finding stands.
    expect(modelView(result).rectangles).toHaveLength(1);
    expect(
      validateView(modelView(result), {
        model: result.current.modelApi.getState()
      }).length
    ).toBeGreaterThan(0);

    // …and an UNRELATED node move now succeeds instead of throwing.
    act(() => {
      result.current.scene.updateViewItem('node-A', { tile: { x: 2, y: 2 } });
    });
    expect(
      modelView(result).items.find((i: { id: string }) => i.id === 'node-A')?.tile
    ).toEqual({ x: 2, y: 2 });
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
// SCN-08 (a preview issued inside a transaction was erased by the commit) was
// fixed as part of the E1/HIST-08 delegation: the transaction bracket no longer
// snapshots the stores at open and write it back at close, so a write made
// inside the bracket by any other route survives. Promoted to
// `src/hooks/__tests__/historyBrackets.test.tsx`.
