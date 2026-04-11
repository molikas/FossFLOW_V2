import { ModeActions } from 'src/types';
import { getItemAtTile, hasMovedTile, setWindowCursor } from 'src/utils';

export const ReconnectAnchor: ModeActions = {
  entry: () => {
    setWindowCursor('crosshair');
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'RECONNECT_ANCHOR') return;
    if (!hasMovedTile(uiState.mouse)) return;

    const { connectorId, anchorId } = uiState.mode;
    const connector = scene.connectors.find((c) => c.id === connectorId);
    if (!connector) return;

    const tile = uiState.mouse.position.tile;
    const itemAtTile = getItemAtTile({ tile, scene });
    const newRef =
      itemAtTile?.type === 'ITEM' ? { item: itemAtTile.id } : { tile };

    const newAnchors = connector.anchors.map((a) =>
      a.id === anchorId ? { ...a, ref: newRef } : a
    );
    scene.updateConnector(connectorId, { anchors: newAnchors });
  },
  mouseup: ({ uiState, scene, isRendererInteraction }) => {
    if (uiState.mode.type !== 'RECONNECT_ANCHOR' || !isRendererInteraction)
      return;

    const { connectorId } = uiState.mode;

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
