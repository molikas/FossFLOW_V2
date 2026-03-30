import { produce } from 'immer';
import {
  ConnectorAnchor,
  SceneConnector,
  ModeActions,
  ModeActionsAction,
  Coords,
  View
} from 'src/types';
import {
  getItemAtTile,
  hasMovedTile,
  getAnchorAtTile,
  getItemByIdOrThrow,
  generateId,
  CoordsUtils,
  getAnchorTile,
  connectorPathTileToGlobal,
  setWindowCursor
} from 'src/utils';
import { useScene } from 'src/hooks/useScene';

const getAnchorOrdering = (
  anchor: ConnectorAnchor,
  connector: SceneConnector,
  view: View
) => {
  const anchorTile = getAnchorTile(anchor, view);
  const index = connector.path.tiles.findIndex((pathTile) => {
    const globalTile = connectorPathTileToGlobal(
      pathTile,
      connector.path.rectangle.from
    );
    return CoordsUtils.isEqual(globalTile, anchorTile);
  });

  if (index === -1) {
    throw new Error(
      `Could not calculate ordering index of anchor [anchorId: ${anchor.id}]`
    );
  }

  return index;
};

const getAnchor = (
  connectorId: string,
  tile: Coords,
  scene: ReturnType<typeof useScene>
) => {
  const connector = getItemByIdOrThrow(scene.connectors, connectorId).value;
  const anchor = getAnchorAtTile(tile, connector.anchors);

  if (!anchor) {
    const newAnchor: ConnectorAnchor = {
      id: generateId(),
      ref: { tile }
    };

    const orderedAnchors = [...connector.anchors, newAnchor]
      .map((anch) => {
        return {
          ...anch,
          ordering: getAnchorOrdering(anch, connector, scene.currentView)
        };
      })
      .sort((a, b) => {
        return a.ordering - b.ordering;
      });

    scene.updateConnector(connector.id, { anchors: orderedAnchors });
    return newAnchor;
  }

  return anchor;
};

const mousedown: ModeActionsAction = ({
  uiState,
  scene,
  isRendererInteraction
}) => {
  if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

  const itemAtTile = getItemAtTile({
    tile: uiState.mouse.position.tile,
    scene
  });

  if (itemAtTile) {
    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = itemAtTile;
        draft.mousedownHandled = true;
      })
    );
  } else {
    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = null;
        draft.mousedownHandled = true;
      })
    );

    uiState.actions.setItemControls(null);
  }
};

export const Cursor: ModeActions = {
  entry: (state) => {
    const { uiState } = state;

    if (uiState.mode.type !== 'CURSOR') return;

    if (uiState.mode.mousedownItem) {
      mousedown(state);
    }
  },
  mousemove: ({ scene, uiState }) => {
    if (uiState.mode.type !== 'CURSOR') return;

    let item = uiState.mode.mousedownItem;

    // Hover cursor (no mousedown): still use hasMovedTile to avoid redundant work
    if (!item && !uiState.mouse.mousedown) {
      if (hasMovedTile(uiState.mouse)) {
        const hoverItem = getItemAtTile({ tile: uiState.mouse.position.tile, scene });
        setWindowCursor(hoverItem ? 'pointer' : 'default');
      }
      return;
    }

    // Drag detection: use position vs mousedown directly instead of stale delta.
    // hasMovedTile relies on delta which is one RAF frame behind, causing a half-tile delay.
    if (!uiState.mouse.mousedown) return;
    const hasDragged = !CoordsUtils.isEqual(
      uiState.mouse.position.tile,
      uiState.mouse.mousedown.tile
    );
    if (!hasDragged) return;

    if (item?.type === 'CONNECTOR' && uiState.mouse.mousedown) {
      const anchor = getAnchor(item.id, uiState.mouse.mousedown.tile, scene);

      item = {
        type: 'CONNECTOR_ANCHOR',
        id: anchor.id
      };
    }

    if (item) {
      const initialTiles: Record<string, Coords> = {};
      const initialRectangles: Record<string, { from: Coords; to: Coords }> = {};
      if (item.type === 'ITEM') {
        try { initialTiles[item.id] = getItemByIdOrThrow(scene.items, item.id).value.tile; } catch {}
      } else if (item.type === 'TEXTBOX') {
        try { initialTiles[item.id] = getItemByIdOrThrow(scene.textBoxes, item.id).value.tile; } catch {}
      } else if (item.type === 'RECTANGLE') {
        try {
          const r = getItemByIdOrThrow(scene.rectangles, item.id).value;
          initialRectangles[item.id] = { from: r.from, to: r.to };
        } catch {}
      }
      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: [item],
        initialTiles,
        initialRectangles
      });
    } else {
      // Empty-area drag → start lasso selection (only when mousedown was properly handled)
      if (uiState.mouse.mousedown && uiState.mode.mousedownHandled) {
        uiState.actions.setMode({
          type: 'LASSO',
          showCursor: true,
          selection: null,
          isDragging: false
        });
      }
    }
  },
  mousedown,
  mouseup: ({ uiState, isRendererInteraction }) => {
    if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

    const hasMoved = uiState.mouse.mousedown && hasMovedTile(uiState.mouse);

    if (uiState.mode.mousedownItem && !hasMoved) {
      if (uiState.mode.mousedownItem.type === 'ITEM') {
        uiState.actions.setItemControls({
          type: 'ITEM',
          id: uiState.mode.mousedownItem.id
        });
      } else if (uiState.mode.mousedownItem.type === 'RECTANGLE') {
        uiState.actions.setItemControls({
          type: 'RECTANGLE',
          id: uiState.mode.mousedownItem.id
        });
      } else if (uiState.mode.mousedownItem.type === 'CONNECTOR') {
        uiState.actions.setItemControls({
          type: 'CONNECTOR',
          id: uiState.mode.mousedownItem.id
        });
      } else if (uiState.mode.mousedownItem.type === 'TEXTBOX') {
        uiState.actions.setItemControls({
          type: 'TEXTBOX',
          id: uiState.mode.mousedownItem.id
        });
      }
    } else if (!hasMoved && uiState.mode.mousedownHandled) {
      // Plain left-click on empty canvas — just deselect.
      // Adding items is handled by double-click (QuickAddNodePopover).
      uiState.actions.setItemControls(null);
    } else {
      uiState.actions.setItemControls(null);
    }

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        draft.mousedownItem = null;
        draft.mousedownHandled = false;
      })
    );
  }
};
