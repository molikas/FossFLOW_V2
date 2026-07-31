import { ModeActions, ConnectorAnchor, State } from 'src/types';
import { hasMovedTile, setWindowCursor } from 'src/utils';
import {
  connectorItemAtTile,
  isDegenerateConnector
} from './connectorHitTest';

// The anchor ref as it was when the reconnect began, so an abort can put it
// back (I4/CONN-01).
//
// `RECONNECT_ANCHOR` was the one mutating mode with no abort at all: it writes
// the model live on every tile (unlike DragItems' CSS preview), kept nothing to
// restore, was excluded from the Escape tool-exit set on the grounds that
// transient modes "own their own abort logic", and had no right-click restore
// branch. Every other mode has at least one of those. Module-level rather than
// mode state because the mode object is rebuilt by `setMode` on entry and the
// single-reconnect-at-a-time invariant matches `mode === 'RECONNECT_ANCHOR'` —
// the same shape DragItems' preview maps use.
let originalAnchor: {
  connectorId: string;
  anchorId: string;
  ref: ConnectorAnchor['ref'];
} | null = null;

/**
 * Put the anchor back where the reconnect found it and close the transaction.
 * Returns true when there was something to restore.
 *
 * Called by `handleEscapeKey` (Escape now cancels a reconnect) and by `exit` as
 * a safety net. Restoring BEFORE committing means the net patch set is empty, so
 * an aborted reconnect leaves no history entry.
 */
export const abortReconnectAnchor = (state: State): boolean => {
  const { scene } = state;
  const snapshot = originalAnchor;
  originalAnchor = null;
  if (!snapshot) return false;

  const connector = scene.connectors.find(
    (c) => c.id === snapshot.connectorId
  );
  if (connector) {
    scene.updateConnector(snapshot.connectorId, {
      anchors: connector.anchors.map((a) =>
        a.id === snapshot.anchorId ? { ...a, ref: snapshot.ref } : a
      )
    });
  }
  scene.commitDragTransaction();
  return true;
};

export const ReconnectAnchor: ModeActions = {
  entry: ({ scene, uiState }) => {
    setWindowCursor('crosshair');
    // Snapshot the anchor's current ref so Escape can restore it (CONN-01).
    originalAnchor = null;
    if (uiState.mode.type === 'RECONNECT_ANCHOR') {
      const { connectorId, anchorId } = uiState.mode;
      const connector = scene.connectors.find((c) => c.id === connectorId);
      const anchor = connector?.anchors.find((a) => a.id === anchorId);
      if (anchor) {
        originalAnchor = { connectorId, anchorId, ref: anchor.ref };
      }
    }
    // One history entry covers the whole reconnect drag (begin → mouseup commit).
    scene.beginDragTransaction();
  },
  exit: ({ scene }) => {
    setWindowCursor('default');
    // Safety net: commit if we exit the mode without a normal mouseup
    // (e.g. a programmatic mode change). No-op if already committed. The
    // snapshot is dropped here rather than restored — reaching `exit` without
    // an explicit abort means the reconnect was accepted, and reverting it
    // would silently undo a move the user made.
    originalAnchor = null;
    scene.commitDragTransaction();
  },
  mousemove: (state) => {
    const { uiState, scene } = state;
    if (uiState.mode.type !== 'RECONNECT_ANCHOR') return;
    if (!hasMovedTile(uiState.mouse)) return;

    const { connectorId, anchorId } = uiState.mode;
    const connector = scene.connectors.find((c) => c.id === connectorId);
    if (!connector) return;

    const tile = uiState.mouse.position.tile;
    // CONN-15: a locked or hidden node reads as bare tile, so a reconnect
    // cannot bind an endpoint to an entity the user declared off-limits — the
    // same gate `Connector` uses, from the same helper.
    const itemAtTile = connectorItemAtTile(state);
    const newRef = itemAtTile ? { item: itemAtTile.id } : { tile };

    const newAnchors = connector.anchors.map((a) =>
      a.id === anchorId ? { ...a, ref: newRef } : a
    );
    scene.updateConnector(connectorId, { anchors: newAnchors });
  },
  mouseup: (state) => {
    const { uiState, scene } = state;
    if (uiState.mode.type !== 'RECONNECT_ANCHOR') return;

    const { connectorId } = uiState.mode;

    // CONN-10's other route: dragging one endpoint onto the node the OTHER
    // endpoint already sits on produces the same zero-length self-loop the
    // draw path could produce. Put the anchor back instead of committing it —
    // the abort machinery is already here for CONN-01.
    const connector = scene.connectors.find((c) => c.id === connectorId);
    if (connector && isDegenerateConnector(connector.anchors)) {
      abortReconnectAnchor(state);
      uiState.actions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      return;
    }

    // CONN-02: this used to early-return unless `isRendererInteraction`, so a
    // release over a panel — dock, properties deck, anywhere off the canvas —
    // neither committed nor exited, and the reconnect kept following the pointer
    // with nothing pressed. The gesture BEGAN on the canvas (that is the only
    // way to reach this mode), so where the button comes up must not decide
    // whether it finishes. The commit was left to the `exit()` net, which only
    // runs on the next mode change.
    originalAnchor = null;
    scene.commitDragTransaction();

    // Anchor ref is already updated by mousemove preview.
    // Switch back to CURSOR with connector still selected so the user can see
    // the result and optionally adjust further.
    uiState.actions.setItemControls({ type: 'CONNECTOR', id: connectorId });
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
