import { produce } from 'immer';
import {
  ModeActions,
  ItemReference,
  Coords,
  ViewItem,
  Rectangle,
  TextBox,
  Connector,
  ConnectorAnchor
} from 'src/types';
import { isPointInPolygon, getItemByIdOrThrow } from 'src/utils';

interface FreehandScene {
  items: ViewItem[];
  rectangles: Rectangle[];
  textBoxes: TextBox[];
  connectors: Connector[];
}

// Helper to find all items whose centers are within the freehand polygon
const getItemsInFreehandBounds = (
  pathTiles: Coords[],
  scene: FreehandScene
): ItemReference[] => {
  const items: ItemReference[] = [];

  if (pathTiles.length < 3) return items;

  // Check all nodes/items
  const selectedNodeIds = new Set<string>();
  scene.items.forEach((item: ViewItem) => {
    if (isPointInPolygon(item.tile, pathTiles)) {
      items.push({ type: 'ITEM', id: item.id });
      selectedNodeIds.add(item.id);
    }
  });

  // Check all rectangles - they must be FULLY enclosed (all 4 corners inside)
  scene.rectangles.forEach((rectangle: Rectangle) => {
    const corners = [
      rectangle.from,
      { x: rectangle.to.x, y: rectangle.from.y },
      rectangle.to,
      { x: rectangle.from.x, y: rectangle.to.y }
    ];

    // Rectangle is only selected if ALL corners are inside the polygon
    const allCornersInside = corners.every((corner) =>
      isPointInPolygon(corner, pathTiles)
    );

    if (allCornersInside) {
      items.push({ type: 'RECTANGLE', id: rectangle.id });
    }
  });

  // Check all text boxes
  scene.textBoxes.forEach((textBox: TextBox) => {
    if (isPointInPolygon(textBox.tile, pathTiles)) {
      items.push({ type: 'TEXTBOX', id: textBox.id });
    }
  });

  // Include a connector if both its endpoint anchors are within the selection.
  scene.connectors.forEach((connector: Connector) => {
    if (!connector.anchors || connector.anchors.length < 2) return;

    const first = connector.anchors[0];
    const last = connector.anchors[connector.anchors.length - 1];

    const anchorInBounds = (anchor: ConnectorAnchor): boolean => {
      if (anchor.ref?.item) return selectedNodeIds.has(anchor.ref.item);
      if (anchor.ref?.tile) return isPointInPolygon(anchor.ref.tile, pathTiles);
      return false;
    };

    if (anchorInBounds(first) && anchorInBounds(last)) {
      items.push({ type: 'CONNECTOR', id: connector.id });
    } else {
      // Still capture any free-floating waypoint anchors
      connector.anchors.forEach((anchor: ConnectorAnchor) => {
        if (anchor.ref?.tile && isPointInPolygon(anchor.ref.tile, pathTiles)) {
          items.push({ type: 'CONNECTOR_ANCHOR', id: anchor.id });
        }
      });
    }
  });

  return items;
};

export const FreehandLasso: ModeActions = {
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'FREEHAND_LASSO' || !uiState.mouse.mousedown)
      return;

    // If user is dragging an existing selection, switch to DRAG_ITEMS mode
    if (uiState.mode.isDragging && uiState.mode.selection) {
      const initialTiles: Record<string, Coords> = {};
      const initialRectangles: Record<string, { from: Coords; to: Coords }> =
        {};
      uiState.mode.selection.items.forEach((item) => {
        try {
          if (item.type === 'ITEM') {
            initialTiles[item.id] = getItemByIdOrThrow(
              scene.items,
              item.id
            ).value.tile;
          } else if (item.type === 'TEXTBOX') {
            initialTiles[item.id] = getItemByIdOrThrow(
              scene.textBoxes,
              item.id
            ).value.tile;
          } else if (item.type === 'RECTANGLE') {
            const r = getItemByIdOrThrow(scene.rectangles, item.id).value;
            initialRectangles[item.id] = { from: r.from, to: r.to };
          } else if (item.type === 'CONNECTOR_ANCHOR') {
            for (const connector of scene.connectors) {
              const anchor = connector.anchors.find(
                (a: ConnectorAnchor) => a.id === item.id
              );
              if (anchor?.ref?.tile) {
                initialTiles[item.id] = anchor.ref.tile;
                break;
              }
            }
          }
        } catch {}
      });
      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: uiState.mode.selection.items,
        initialTiles,
        initialRectangles
      });
      return;
    }

    // User is drawing the freehand path - collect screen coordinates
    const newScreenPoint = uiState.mouse.position.screen;

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        if (draft.type === 'FREEHAND_LASSO') {
          // Add point to path if it's far enough from the last point (throttle)
          const lastPoint = draft.path[draft.path.length - 1];
          if (
            !lastPoint ||
            Math.abs(newScreenPoint.x - lastPoint.x) > 5 ||
            Math.abs(newScreenPoint.y - lastPoint.y) > 5
          ) {
            draft.path.push(newScreenPoint);
          }
        }
      })
    );
  },

  mousedown: ({ uiState, isRendererInteraction }) => {
    if (uiState.mode.type !== 'FREEHAND_LASSO') return;

    // If there's an existing selection, check if click is within it.
    // Allow this even for non-renderer clicks (e.g. clicking on a node element within
    // the selection) so the drag still starts correctly.
    if (uiState.mode.selection) {
      const clickTile = uiState.mouse.position.tile;
      const isWithinSelection = isPointInPolygon(
        clickTile,
        uiState.mode.selection.pathTiles
      );

      if (isWithinSelection) {
        // Clicked within selection - prepare to drag
        uiState.actions.setMode(
          produce(uiState.mode, (draft) => {
            if (draft.type === 'FREEHAND_LASSO') {
              draft.isDragging = true;
            }
          })
        );
        return;
      }

      // Clicked outside selection on canvas - clear it and start new path.
      // Non-renderer clicks (panels, etc.) should leave the selection unchanged.
      if (!isRendererInteraction) return;

      uiState.actions.setMode(
        produce(uiState.mode, (draft) => {
          if (draft.type === 'FREEHAND_LASSO') {
            draft.path = [uiState.mouse.position.screen];
            draft.selection = null;
            draft.isDragging = false;
          }
        })
      );
      return;
    }

    // No selection yet. Only start a new path for genuine canvas interactions.
    if (!isRendererInteraction) return;

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        if (draft.type === 'FREEHAND_LASSO') {
          draft.path = [uiState.mouse.position.screen];
          draft.selection = null;
          draft.isDragging = false;
        }
      })
    );
  },

  mouseup: ({ uiState, scene, screenToTile }) => {
    if (uiState.mode.type !== 'FREEHAND_LASSO') return;
    if (!uiState.mouse.mousedown) return; // toolbar click — mousedown was stopped, skip

    // If we've drawn a path, convert to tiles and find items
    if (uiState.mode.path.length >= 3 && !uiState.mode.selection) {
      const rendererSize = uiState.rendererEl?.getBoundingClientRect();
      if (!rendererSize) return;

      // Convert screen path to tile coordinates using the injected mode-aware screenToTile.
      const pathTiles = uiState.mode.path.map((screenPoint) => {
        return screenToTile({
          mouse: screenPoint,
          zoom: uiState.zoom,
          scroll: uiState.scroll,
          rendererSize: {
            width: rendererSize.width,
            height: rendererSize.height
          }
        });
      });

      // Find all items within the freehand polygon
      const items = getItemsInFreehandBounds(pathTiles, scene);

      uiState.actions.setMode(
        produce(uiState.mode, (draft) => {
          if (draft.type === 'FREEHAND_LASSO') {
            draft.selection = {
              pathTiles,
              items
            };
            draft.isDragging = false;
          }
        })
      );
    } else {
      // Reset dragging state but keep selection if it exists
      uiState.actions.setMode(
        produce(uiState.mode, (draft) => {
          if (draft.type === 'FREEHAND_LASSO') {
            draft.isDragging = false;
          }
        })
      );
    }
  }
};
