import { produce } from 'immer';
import {
  ModeActions,
  ItemReference,
  Coords,
  ViewItem,
  Rectangle,
  TextBox,
  Label,
  Connector,
  ConnectorAnchor
} from 'src/types';
import {
  isPointInPolygon,
  getItemByIdOrThrow,
  segmentIntersectsPolygon
} from 'src/utils';
import { getConnectorMovementAnchorRefs } from 'src/utils/connectorSelection';
import {
  mergeMarqueeSelection,
  isAdditiveModifier
} from 'src/utils/selectableRefs';

interface FreehandScene {
  items: ViewItem[];
  rectangles: Rectangle[];
  textBoxes: TextBox[];
  // Optional so partial scenes (tests / older callers) don't crash; reads guard
  // with `?? []`. The live useScene scene always provides it. ADR 0031.
  labels?: Label[];
  connectors: Connector[];
}

// Helper to find all items whose centers are within the freehand polygon.
// Items on locked or hidden layers are excluded (mqa-results.md #2).
const getItemsInFreehandBounds = (
  pathTiles: Coords[],
  scene: FreehandScene,
  isItemInteractable: (ref: ItemReference) => boolean
): ItemReference[] => {
  const items: ItemReference[] = [];

  if (pathTiles.length < 3) return items;

  // Check all nodes/items
  scene.items.forEach((item: ViewItem) => {
    if (
      isPointInPolygon(item.tile, pathTiles) &&
      isItemInteractable({ type: 'ITEM', id: item.id })
    ) {
      items.push({ type: 'ITEM', id: item.id });
    }
  });

  // Check all rectangles - they must be FULLY enclosed (all 4 corners inside)
  scene.rectangles.forEach((rectangle: Rectangle) => {
    if (!isItemInteractable({ type: 'RECTANGLE', id: rectangle.id })) return;
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
    if (
      isPointInPolygon(textBox.tile, pathTiles) &&
      isItemInteractable({ type: 'TEXTBOX', id: textBox.id })
    ) {
      items.push({ type: 'TEXTBOX', id: textBox.id });
    }
  });

  // Floating Labels (ADR 0031) hit on their anchor tile — a billboard chip has
  // no iso footprint, so the polygon selects it when its tile is enclosed.
  // Mirrors Lasso.ts; without this the freehand marquee silently dropped every
  // label (they were never even enumerated here).
  (scene.labels ?? []).forEach((label: Label) => {
    if (
      isPointInPolygon(label.tile, pathTiles) &&
      isItemInteractable({ type: 'LABEL', id: label.id })
    ) {
      items.push({ type: 'LABEL', id: label.id });
    }
  });

  // Include a connector if any segment of its path intersects the freehand
  // polygon (path-hit semantics — mirrors Lasso.ts and click selection).
  // See Lasso.ts for the full rationale; this is the polygon analogue.
  const anchorToTile = (
    anchor: ConnectorAnchor,
    nodeItems: ViewItem[]
  ): Coords | null => {
    if (anchor.ref?.item) {
      const item = nodeItems.find((it) => it.id === anchor.ref.item);
      return item ? item.tile : null;
    }
    if (anchor.ref?.tile) return anchor.ref.tile;
    return null;
  };

  scene.connectors.forEach((connector: Connector) => {
    if (!connector.anchors || connector.anchors.length < 2) return;
    if (!isItemInteractable({ type: 'CONNECTOR', id: connector.id })) return;

    const tiles = connector.anchors.map((a) => anchorToTile(a, scene.items));

    let pathHits = false;
    for (let i = 0; i < tiles.length - 1; i += 1) {
      const a = tiles[i];
      const b = tiles[i + 1];
      if (!a || !b) continue;
      if (segmentIntersectsPolygon(a, b, pathTiles)) {
        pathHits = true;
        break;
      }
    }

    if (pathHits) {
      // Capture the connector plus all its tile-bound anchors (middle waypoints
      // AND free-floating endpoints) so it drags rigidly with the group, mirror
      // of Lasso.ts (ADR 0006 addendum #2). Endpoints captured here travel only
      // alongside this CONNECTOR ref, keeping the delete path splice-safe.
      items.push(
        { type: 'CONNECTOR', id: connector.id },
        ...getConnectorMovementAnchorRefs(connector)
      );
      return;
    }

    // Defensive fallback (see Lasso.ts for the analogous comment): with
    // path-hit semantics a tile-bound middle waypoint inside the polygon
    // implies an adjacent segment intersects, so this loop is largely
    // redundant — kept for edge-case safety.
    for (let i = 1; i < connector.anchors.length - 1; i += 1) {
      const anchor = connector.anchors[i];
      if (anchor.ref?.tile && isPointInPolygon(anchor.ref.tile, pathTiles)) {
        items.push({ type: 'CONNECTOR_ANCHOR', id: anchor.id });
      }
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
          } else if (item.type === 'LABEL') {
            initialTiles[item.id] = getItemByIdOrThrow(
              scene.labels ?? [],
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

  mouseup: ({ uiState, scene, screenToTile, isItemInteractable }) => {
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
      const gate = isItemInteractable ?? (() => true);
      const items = getItemsInFreehandBounds(pathTiles, scene, gate);

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
      // Mirror into the persistent multi-selection (ADR-0006). Optional-call
      // so mock uiState in unit tests doesn't need the new action.
      //
      // I3/SEL-15 (ruled 2026-07-30, ADR 0006 §2 addendum): with the additive
      // modifier held the marquee EXTENDS the selection instead of replacing
      // it. Shared with `Lasso.mouseup` so the two tools cannot drift.
      uiState.actions.setSelectedIds?.(
        mergeMarqueeSelection(
          uiState.selectedIds ?? [],
          items,
          isAdditiveModifier(uiState.mouse.modifiers)
        )
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
