import { produce } from 'immer';
import { ModeActions, Coords, ItemReference } from 'src/types';
import { useScene } from 'src/hooks/useScene';
import type { State } from 'src/stores/reducers/types';
import {
  getItemByIdOrThrow,
  CoordsUtils,
  getAnchorParent,
  getItemAtTile,
  setWindowCursor
} from 'src/utils';

const dragItems = (
  items: ItemReference[],
  tile: Coords,
  mouseOffset: Coords,
  initialTiles: Record<string, Coords>,
  initialRectangles: Record<string, { from: Coords; to: Coords }>,
  scene: ReturnType<typeof useScene>
) => {
  const itemRefs = items.filter(item => item.type === 'ITEM');
  const textBoxRefs = items.filter(item => item.type === 'TEXTBOX');
  const rectangleRefs = items.filter(item => item.type === 'RECTANGLE');
  const anchorRefs = items.filter(item => item.type === 'CONNECTOR_ANCHOR');

  // Nodes: absolute positioning from grab-point + mouse offset.
  // If any target tile is occupied by an external node, don't move the group.
  let nodeUpdates: Array<{ id: string; tile: Coords }> | null = null;
  if (itemRefs.length > 0) {
    const draggedIdSet = new Set(itemRefs.map(i => i.id));

    const targets = itemRefs.map(item => ({
      id: item.id,
      targetTile: initialTiles[item.id]
        ? CoordsUtils.add(initialTiles[item.id], mouseOffset)
        : getItemByIdOrThrow(scene.items, item.id).value.tile
    }));

    const externalOccupied = new Set(
      scene.items
        .filter(si => !draggedIdSet.has(si.id))
        .map(si => `${si.tile.x},${si.tile.y}`)
    );

    const targetKeys = new Set<string>();
    let hasCollision = false;
    for (const t of targets) {
      const key = `${t.targetTile.x},${t.targetTile.y}`;
      if (externalOccupied.has(key) || targetKeys.has(key)) {
        hasCollision = true;
        break;
      }
      targetKeys.add(key);
    }

    if (!hasCollision) {
      nodeUpdates = targets.map(t => ({ id: t.id, tile: t.targetTile }));
    }
  }

  // Textboxes: absolute positioning from initial tile + mouse offset
  const textBoxUpdates = textBoxRefs
    .map(item => ({
      id: item.id,
      tile: initialTiles[item.id]
        ? CoordsUtils.add(initialTiles[item.id], mouseOffset)
        : getItemByIdOrThrow(scene.textBoxes, item.id).value.tile
    }));

  // Rectangles: absolute positioning from initial bounds + mouse offset
  const rectangleUpdates = rectangleRefs
    .map(item => {
      const init = initialRectangles[item.id];
      if (init) {
        return {
          id: item.id,
          from: CoordsUtils.add(init.from, mouseOffset),
          to: CoordsUtils.add(init.to, mouseOffset)
        };
      }
      const r = getItemByIdOrThrow(scene.rectangles, item.id).value;
      return { id: item.id, from: r.from, to: r.to };
    });

  const hasOtherUpdates = textBoxUpdates.length > 0 || rectangleUpdates.length > 0;

  if (nodeUpdates || hasOtherUpdates) {
    scene.transaction(() => {
      let currentState: State | undefined;

      nodeUpdates?.forEach(({ id, tile: newTile }) => {
        currentState = scene.updateViewItem(id, { tile: newTile }, currentState);
      });

      textBoxUpdates.forEach(({ id, tile: newTile }) => {
        currentState = scene.updateTextBox(id, { tile: newTile }, currentState);
      });

      rectangleUpdates.forEach(({ id, from, to }) => {
        currentState = scene.updateRectangle(id, { from, to }, currentState);
      });
    });
  }

  // Connector anchors use tile-relative logic (unchanged)
  anchorRefs.forEach((item) => {
    const connector = getAnchorParent(item.id, scene.connectors);

    const newConnector = produce(connector, (draft) => {
      const anchor = getItemByIdOrThrow(connector.anchors, item.id);
      const itemAtTile = getItemAtTile({ tile, scene });

      switch (itemAtTile?.type) {
        case 'ITEM':
          draft.anchors[anchor.index] = { ...anchor.value, ref: { item: itemAtTile.id } };
          break;
        case 'CONNECTOR_ANCHOR':
          draft.anchors[anchor.index] = { ...anchor.value, ref: { anchor: itemAtTile.id } };
          break;
        default:
          draft.anchors[anchor.index] = { ...anchor.value, ref: { tile } };
          break;
      }
    });

    scene.updateConnector(connector.id, newConnector);
  });
};

export const DragItems: ModeActions = {
  entry: ({ uiState, rendererRef }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;
    rendererRef.style.userSelect = 'none';
    setWindowCursor('grabbing');
  },
  exit: ({ rendererRef }) => {
    rendererRef.style.userSelect = 'auto';
    setWindowCursor('default');
  },
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;

    // mouseOffset: cumulative tile displacement from grab point (absolute positioning).
    // Use this instead of hasMovedTile(delta) — delta is stale (previous frame) due to RAF
    // throttling, which caused a 1-2 tile activation delay.
    const mouseOffset = CoordsUtils.subtract(
      uiState.mouse.position.tile,
      uiState.mouse.mousedown.tile
    );
    if (CoordsUtils.isEqual(mouseOffset, CoordsUtils.zero())) return;

    // Show not-allowed cursor only when a node is dragged onto another node
    const hasDraggedNode = uiState.mode.items.some((i) => i.type === 'ITEM');
    const draggedIds = new Set(uiState.mode.items.map((i) => i.id));
    const itemAtCursor = getItemAtTile({ tile: uiState.mouse.position.tile, scene });
    if (hasDraggedNode && itemAtCursor?.type === 'ITEM' && !draggedIds.has(itemAtCursor.id)) {
      setWindowCursor('not-allowed');
    } else {
      setWindowCursor('grabbing');
    }

    dragItems(
      uiState.mode.items,
      uiState.mouse.position.tile,
      mouseOffset,
      uiState.mode.initialTiles,
      uiState.mode.initialRectangles,
      scene
    );
  },
  mouseup: ({ uiState }) => {
    uiState.actions.setItemControls(null);
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
