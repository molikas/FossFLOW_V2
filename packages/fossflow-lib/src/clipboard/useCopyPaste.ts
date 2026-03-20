import { useCallback } from 'react';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { Connector, Rectangle, TextBox } from 'src/types';
import { generateId } from 'src/utils';
import { findNearestUnoccupiedTilesForGroup } from 'src/utils/findNearestUnoccupiedTile';
import { ClipboardItem, setClipboard, getClipboard } from './clipboard';

export const useCopyPaste = () => {
  const uiStateApi = useUiStateStoreApi();
  const modelStoreApi = useModelStoreApi();
  const scene = useScene();

  const handleCopy = useCallback(() => {
    const uiState = uiStateApi.getState();
    const model = modelStoreApi.getState();

    let selectedItemIds: string[] = [];
    let selectedConnectorIds: string[] = [];
    let selectedRectangleIds: string[] = [];
    let selectedTextBoxIds: string[] = [];

    const mode = uiState.mode;
    if (
      (mode.type === 'LASSO' || mode.type === 'FREEHAND_LASSO') &&
      mode.selection?.items?.length
    ) {
      const refs = mode.selection.items;
      selectedItemIds = refs.filter((r) => r.type === 'ITEM').map((r) => r.id);
      selectedConnectorIds = refs.filter((r) => r.type === 'CONNECTOR').map((r) => r.id);
      selectedRectangleIds = refs.filter((r) => r.type === 'RECTANGLE').map((r) => r.id);
      selectedTextBoxIds = refs.filter((r) => r.type === 'TEXTBOX').map((r) => r.id);
    } else if (uiState.itemControls && uiState.itemControls.type === 'ITEM') {
      selectedItemIds = [uiState.itemControls.id];
    }

    if (
      selectedItemIds.length === 0 &&
      selectedConnectorIds.length === 0 &&
      selectedRectangleIds.length === 0 &&
      selectedTextBoxIds.length === 0
    ) {
      return;
    }

    const selectedIdSet = new Set(selectedItemIds);
    const currentView = scene.currentView;

    // Collect items (modelItem + viewItem pairs)
    const clipboardItems: ClipboardItem[] = [];
    for (const viewItem of currentView.items ?? []) {
      if (selectedIdSet.has(viewItem.id)) {
        const modelItem = model.items.find((mi) => mi.id === viewItem.id);
        if (modelItem) {
          clipboardItems.push({ modelItem, viewItem });
        }
      }
    }

    // Connectors: explicitly selected OR both item-anchors are in the selected set
    const rawConnectors = currentView.connectors ?? [];
    const selectedConnectorIdSet = new Set(selectedConnectorIds);
    const clipboardConnectors = rawConnectors.filter((connector) => {
      if (selectedConnectorIdSet.has(connector.id)) return true;
      const anchorsWithItem = connector.anchors.filter((a) => a.ref?.item);
      return (
        anchorsWithItem.length >= 2 &&
        anchorsWithItem.every((a) => selectedIdSet.has(a.ref!.item!))
      );
    });

    const selectedRectIdSet = new Set(selectedRectangleIds);
    const selectedTextIdSet = new Set(selectedTextBoxIds);
    const clipboardRectangles = (currentView.rectangles ?? []).filter((r) =>
      selectedRectIdSet.has(r.id)
    );
    const clipboardTextBoxes = (currentView.textBoxes ?? []).filter((tb) =>
      selectedTextIdSet.has(tb.id)
    );

    if (
      clipboardItems.length === 0 &&
      clipboardConnectors.length === 0 &&
      clipboardRectangles.length === 0 &&
      clipboardTextBoxes.length === 0
    ) {
      return;
    }

    // Centroid of viewItem tiles
    const tiles = clipboardItems.map((ci) => ci.viewItem.tile);
    const centroid =
      tiles.length > 0
        ? {
            x: Math.round(tiles.reduce((s, t) => s + t.x, 0) / tiles.length),
            y: Math.round(tiles.reduce((s, t) => s + t.y, 0) / tiles.length)
          }
        : { x: 0, y: 0 };

    setClipboard({
      items: clipboardItems,
      connectors: clipboardConnectors,
      rectangles: clipboardRectangles,
      textBoxes: clipboardTextBoxes,
      centroid
    });
  }, [uiStateApi, modelStoreApi, scene]);

  const handlePaste = useCallback(() => {
    const clipboard = getClipboard();
    if (!clipboard) return;

    const uiState = uiStateApi.getState();
    const mouseTile = uiState.mouse.position.tile;

    const offset = {
      x: mouseTile.x - clipboard.centroid.x,
      y: mouseTile.y - clipboard.centroid.y
    };

    // Target tiles for items (before collision avoidance)
    const targetItems = clipboard.items.map((ci) => ({
      id: ci.viewItem.id,
      targetTile: {
        x: ci.viewItem.tile.x + offset.x,
        y: ci.viewItem.tile.y + offset.y
      }
    }));

    // Collision avoidance
    let finalTiles = targetItems.map((t) => t.targetTile);
    if (targetItems.length > 0) {
      const resolved = findNearestUnoccupiedTilesForGroup(targetItems, scene);
      if (resolved) finalTiles = resolved;
    }

    // New IDs map (old id -> new id)
    const idMap = new Map<string, string>();
    clipboard.items.forEach((ci) => idMap.set(ci.viewItem.id, generateId()));
    clipboard.connectors.forEach((c) => idMap.set(c.id, generateId()));
    clipboard.rectangles.forEach((r) => idMap.set(r.id, generateId()));
    clipboard.textBoxes.forEach((tb) => idMap.set(tb.id, generateId()));

    // Build remapped items
    const newItems: ClipboardItem[] = clipboard.items.map((ci, i) => {
      const newId = idMap.get(ci.viewItem.id)!;
      return {
        modelItem: { ...ci.modelItem, id: newId },
        viewItem: { ...ci.viewItem, id: newId, tile: finalTiles[i] }
      };
    });

    // Remap connector anchors
    const newConnectors: Connector[] = clipboard.connectors.map((c) => ({
      ...c,
      id: idMap.get(c.id) ?? generateId(),
      anchors: c.anchors.map((anchor) => {
        if (anchor.ref?.item && idMap.has(anchor.ref.item)) {
          return { ...anchor, ref: { ...anchor.ref, item: idMap.get(anchor.ref.item)! } };
        }
        return anchor;
      })
    }));

    // Offset rectangles
    const newRectangles: Rectangle[] = clipboard.rectangles.map((r) => ({
      ...r,
      id: idMap.get(r.id) ?? generateId(),
      from: { x: r.from.x + offset.x, y: r.from.y + offset.y },
      to: { x: r.to.x + offset.x, y: r.to.y + offset.y }
    }));

    // Offset text boxes
    const newTextBoxes: TextBox[] = clipboard.textBoxes.map((tb) => ({
      ...tb,
      id: idMap.get(tb.id) ?? generateId(),
      tile: { x: tb.tile.x + offset.x, y: tb.tile.y + offset.y }
    }));

    // Paste everything in a single undo step
    scene.pasteItems({
      items: newItems,
      connectors: newConnectors,
      rectangles: newRectangles,
      textBoxes: newTextBoxes
    });

    // Select pasted items via LASSO mode
    const newRefs = [
      ...newItems.map((ni) => ({ type: 'ITEM' as const, id: ni.viewItem.id })),
      ...newConnectors.map((c) => ({ type: 'CONNECTOR' as const, id: c.id })),
      ...newRectangles.map((r) => ({ type: 'RECTANGLE' as const, id: r.id })),
      ...newTextBoxes.map((tb) => ({ type: 'TEXTBOX' as const, id: tb.id }))
    ];

    uiState.actions.setMode({
      type: 'LASSO',
      showCursor: true,
      selection: {
        startTile: { x: 0, y: 0 },
        endTile: { x: 0, y: 0 },
        items: newRefs
      },
      isDragging: false
    });
    uiState.actions.setItemControls(null);
  }, [uiStateApi, scene]);

  return { handleCopy, handlePaste };
};
