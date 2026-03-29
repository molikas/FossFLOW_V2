import { produce } from 'immer';
import { ModeActions, ItemReference } from 'src/types';
import { CoordsUtils, isWithinBounds, hasMovedTile, getItemByIdOrThrow } from 'src/utils';
import type { Coords } from 'src/types';

// Helper to find all items within the lasso bounds
const getItemsInBounds = (
  startTile: { x: number; y: number },
  endTile: { x: number; y: number },
  scene: any
): ItemReference[] => {
  const items: ItemReference[] = [];

  // Check all nodes/items
  scene.items.forEach((item: any) => {
    if (isWithinBounds(item.tile, [startTile, endTile])) {
      items.push({ type: 'ITEM', id: item.id });
    }
  });

  // Check all rectangles - they must be FULLY enclosed (all 4 corners inside)
  scene.rectangles.forEach((rectangle: any) => {
    const corners = [
      rectangle.from,
      { x: rectangle.to.x, y: rectangle.from.y },
      rectangle.to,
      { x: rectangle.from.x, y: rectangle.to.y }
    ];

    // Rectangle is only selected if ALL corners are inside the bounds
    const allCornersInside = corners.every(corner =>
      isWithinBounds(corner, [startTile, endTile])
    );

    if (allCornersInside) {
      items.push({ type: 'RECTANGLE', id: rectangle.id });
    }
  });

  // Check all text boxes
  scene.textBoxes.forEach((textBox: any) => {
    if (isWithinBounds(textBox.tile, [startTile, endTile])) {
      items.push({ type: 'TEXTBOX', id: textBox.id });
    }
  });

  // Collect tile-based connector anchors (waypoints not attached to a node)
  scene.connectors.forEach((connector: any) => {
    connector.anchors.forEach((anchor: any) => {
      if (anchor.ref?.tile && isWithinBounds(anchor.ref.tile, [startTile, endTile])) {
        items.push({ type: 'CONNECTOR_ANCHOR', id: anchor.id });
      }
    });
  });

  return items;
};

export const Lasso: ModeActions = {
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'LASSO' || !uiState.mouse.mousedown) return;

    if (!hasMovedTile(uiState.mouse)) return;

    if (uiState.mode.isDragging && uiState.mode.selection) {
      // User is dragging an existing selection - switch to DRAG_ITEMS mode
      const initialTiles: Record<string, Coords> = {};
      const initialRectangles: Record<string, { from: Coords; to: Coords }> = {};
      uiState.mode.selection.items.forEach((item) => {
        try {
          if (item.type === 'ITEM') {
            initialTiles[item.id] = getItemByIdOrThrow(scene.items, item.id).value.tile;
          } else if (item.type === 'TEXTBOX') {
            initialTiles[item.id] = getItemByIdOrThrow(scene.textBoxes, item.id).value.tile;
          } else if (item.type === 'RECTANGLE') {
            const r = getItemByIdOrThrow(scene.rectangles, item.id).value;
            initialRectangles[item.id] = { from: r.from, to: r.to };
          } else if (item.type === 'CONNECTOR_ANCHOR') {
            for (const connector of scene.connectors) {
              const anchor = connector.anchors.find((a: any) => a.id === item.id);
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

    // User is creating/updating the selection box
    const startTile = uiState.mouse.mousedown.tile;
    const endTile = uiState.mouse.position.tile;
    const items = getItemsInBounds(startTile, endTile, scene);

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        if (draft.type === 'LASSO') {
          draft.selection = {
            startTile,
            endTile,
            items
          };
        }
      })
    );
  },

  mousedown: ({ uiState, isRendererInteraction }) => {
    if (uiState.mode.type !== 'LASSO') return;

    // If there's an existing selection, check if click is within it.
    // Allow this even for non-renderer clicks (e.g. clicking on a node element within
    // the selection) so the drag still starts correctly.
    if (uiState.mode.selection) {
      const isWithinSelection = isWithinBounds(uiState.mouse.position.tile, [
        uiState.mode.selection.startTile,
        uiState.mode.selection.endTile
      ]);

      if (isWithinSelection) {
        // Clicked within selection - prepare to drag
        uiState.actions.setMode(
          produce(uiState.mode, (draft) => {
            if (draft.type === 'LASSO') {
              draft.isDragging = true;
            }
          })
        );
        return;
      }
    }

    // Clicked outside an existing selection — clear it and start a new drag.
    // If there's no selection yet, do nothing: mousemove will build the selection box.
    // Only act on genuine canvas interactions; UI panel clicks leave lasso mode unchanged.
    if (!isRendererInteraction) return;

    if (uiState.mode.selection) {
      // Clear the old selection so the next drag starts fresh
      uiState.actions.setMode({
        type: 'LASSO',
        showCursor: true,
        selection: null,
        isDragging: false
      });
    }
    // No selection yet — do nothing, let mousemove handle the drag
  },

  mouseup: ({ uiState }) => {
    if (uiState.mode.type !== 'LASSO') return;
    if (!uiState.mouse.mousedown) return; // toolbar click — mousedown was stopped, skip

    const hasSelection =
      uiState.mode.selection && uiState.mode.selection.items.length > 0;

    if (!hasSelection) {
      // Dragged but caught nothing — exit back to cursor
      uiState.actions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      return;
    }

    // Keep the selection visible, reset dragging flag
    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        if (draft.type === 'LASSO') {
          draft.isDragging = false;
        }
      })
    );
  }
};
