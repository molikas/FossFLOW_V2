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

// Returns the effective tile for an anchor for hit-detection purposes.
// For node-attached endpoints (first/last anchor with ref.item), uses the path junction tile
// so the handle is detectable at the same position it's visually rendered (not under the node).
const getAnchorHitTile = (
  anchor: ConnectorAnchor,
  index: number,
  totalAnchors: number,
  connector: SceneConnector,
  view: View
): Coords => {
  const isEndpoint = index === 0 || index === totalAnchors - 1;
  if (isEndpoint && anchor.ref.item && connector.path?.tiles?.length) {
    const pathTile = index === 0
      ? connector.path.tiles[0]
      : connector.path.tiles[connector.path.tiles.length - 1];
    return connectorPathTileToGlobal(pathTile, connector.path.rectangle.from);
  }
  return getAnchorTile(anchor, view);
};

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
  // hitConnectors includes merged scene path data needed for getAnchorOrdering.
  const connector = getItemByIdOrThrow(scene.hitConnectors, connectorId).value;
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

  // P2: When a connector is selected, its endpoint anchors (attached to nodes) sit on
  // the same tile as the node. Normally getItemAtTile would return the node first, making
  // the endpoint unreachable. Check for selected connector anchors before the generic lookup.
  const itemControls = uiState.itemControls;
  if (itemControls && itemControls.type === 'CONNECTOR') {
    const selectedConnector = scene.hitConnectors.find(
      (c) => c.id === itemControls.id
    );
    if (selectedConnector) {
      const totalAnchors = selectedConnector.anchors.length;
      let clickedIndex = -1;
      const clickedAnchor = selectedConnector.anchors.find((anchor, index) => {
        const hitTile = getAnchorHitTile(
          anchor, index, totalAnchors, selectedConnector, scene.currentView
        );
        if (CoordsUtils.isEqual(hitTile, uiState.mouse.position.tile)) {
          clickedIndex = index;
          return true;
        }
        return false;
      });
      if (clickedAnchor) {
        const isEndpoint = clickedIndex === 0 || clickedIndex === totalAnchors - 1;
        if (isEndpoint) {
          // Endpoint: enter click-to-reconnect mode. Much more reliable than drag
          // on a discrete tile grid, especially with large block node icons.
          uiState.actions.setMode({
            type: 'RECONNECT_ANCHOR',
            showCursor: true,
            connectorId: selectedConnector.id,
            anchorId: clickedAnchor.id,
            anchorIndex: clickedIndex
          });
        } else {
          // Waypoint: keep drag behavior
          uiState.actions.setMode(
            produce(uiState.mode, (draft) => {
              draft.mousedownItem = { type: 'CONNECTOR_ANCHOR', id: clickedAnchor.id };
              draft.mousedownHandled = true;
            })
          );
        }
        return;
      }
    }
  }

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
        // If a connector is selected, show grab cursor when hovering over any of its anchors
        const hoverControls = uiState.itemControls;
        if (hoverControls && hoverControls.type === 'CONNECTOR') {
          const hoveredConnector = scene.hitConnectors.find((c) => c.id === hoverControls.id);
          if (hoveredConnector) {
            const isOverAnchor = hoveredConnector.anchors.some((anchor, index) => {
              const hitTile = getAnchorHitTile(
                anchor, index, hoveredConnector.anchors.length, hoveredConnector, scene.currentView
              );
              return CoordsUtils.isEqual(hitTile, uiState.mouse.position.tile);
            });
            if (isOverAnchor) {
              setWindowCursor('grab');
              return;
            }
          }
        }
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
