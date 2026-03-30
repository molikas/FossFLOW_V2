import { useCallback } from 'react';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { Connector, Rectangle, TextBox } from 'src/types';
import { generateId } from 'src/utils';
import { findNearestUnoccupiedTilesForGroup } from 'src/utils/findNearestUnoccupiedTile';
import { ClipboardItem, ClipboardPayload, setClipboard, getClipboard } from './clipboard';

export const useCopyPaste = () => {
  const uiStateApi = useUiStateStoreApi();
  const modelStoreApi = useModelStoreApi();
  const scene = useScene();

  const showNotification = useCallback((message: string, severity: 'info' | 'success' | 'warning') => {
    uiStateApi.getState().actions.setNotification({ message, severity });
  }, [uiStateApi]);

  // Shared helper: gather the current selection into a clipboard payload.
  // Returns null if nothing is selected or nothing resolves to canvas items.
  const buildPayload = useCallback((): { payload: ClipboardPayload; count: number } | null => {
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
      selectedItemIds = refs.filter((r: any) => r.type === 'ITEM').map((r: any) => r.id);
      selectedConnectorIds = refs.filter((r: any) => r.type === 'CONNECTOR').map((r: any) => r.id);
      selectedRectangleIds = refs.filter((r: any) => r.type === 'RECTANGLE').map((r: any) => r.id);
      selectedTextBoxIds = refs.filter((r: any) => r.type === 'TEXTBOX').map((r: any) => r.id);
    } else if (uiState.itemControls) {
      const ctrl = uiState.itemControls;
      if (ctrl.type === 'ITEM') selectedItemIds = [ctrl.id];
      else if (ctrl.type === 'TEXTBOX') selectedTextBoxIds = [ctrl.id];
      else if (ctrl.type === 'RECTANGLE') selectedRectangleIds = [ctrl.id];
      else if (ctrl.type === 'CONNECTOR') selectedConnectorIds = [ctrl.id];
    }

    if (
      selectedItemIds.length === 0 &&
      selectedConnectorIds.length === 0 &&
      selectedRectangleIds.length === 0 &&
      selectedTextBoxIds.length === 0
    ) {
      return null;
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

    const count =
      clipboardItems.length +
      clipboardConnectors.length +
      clipboardRectangles.length +
      clipboardTextBoxes.length;

    if (count === 0) return null;

    // Centroid across all item positions
    const allPoints = [
      ...clipboardItems.map((ci) => ci.viewItem.tile),
      ...clipboardRectangles.map((r) => ({
        x: Math.round((r.from.x + r.to.x) / 2),
        y: Math.round((r.from.y + r.to.y) / 2)
      })),
      ...clipboardTextBoxes.map((tb) => tb.tile)
    ];
    const centroid =
      allPoints.length > 0
        ? {
            x: Math.round(allPoints.reduce((s, t) => s + t.x, 0) / allPoints.length),
            y: Math.round(allPoints.reduce((s, t) => s + t.y, 0) / allPoints.length)
          }
        : { x: 0, y: 0 };

    return {
      payload: {
        items: clipboardItems,
        connectors: clipboardConnectors,
        rectangles: clipboardRectangles,
        textBoxes: clipboardTextBoxes,
        centroid
      },
      count
    };
  }, [uiStateApi, modelStoreApi, scene]);

  const handleCopy = useCallback(() => {
    const result = buildPayload();
    if (!result) return;
    setClipboard(result.payload);
    showNotification(`Copied ${result.count} item${result.count !== 1 ? 's' : ''}`, 'info');
  }, [buildPayload, uiStateApi]);

  const handleCut = useCallback(() => {
    const result = buildPayload();
    if (!result) return;

    setClipboard(result.payload);

    // Delete the cut items — mirrors the Delete key logic in useInteractionManager
    const uiState = uiStateApi.getState();
    const mode = uiState.mode;

    if (
      (mode.type === 'LASSO' || mode.type === 'FREEHAND_LASSO') &&
      mode.selection?.items?.length
    ) {
      scene.deleteSelectedItems(mode.selection.items);
      uiState.actions.setMode({ type: 'CURSOR', showCursor: true, mousedownItem: null });
      uiState.actions.setItemControls(null);
    } else if (uiState.itemControls) {
      const ctrl = uiState.itemControls;
      if (ctrl.type === 'ITEM') scene.deleteViewItem(ctrl.id);
      else if (ctrl.type === 'CONNECTOR') scene.deleteConnector(ctrl.id);
      else if (ctrl.type === 'TEXTBOX') scene.deleteTextBox(ctrl.id);
      else if (ctrl.type === 'RECTANGLE') scene.deleteRectangle(ctrl.id);
      uiState.actions.setItemControls(null);
    }

    showNotification(`Cut ${result.count} item${result.count !== 1 ? 's' : ''}`, 'success');
  }, [buildPayload, uiStateApi, scene]);

  const handlePaste = useCallback(() => {
    const clipboard = getClipboard();
    if (!clipboard) {
      showNotification('Nothing to paste', 'warning');
      return;
    }

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

    // Build a map of original item id -> pasted tile (for detach-to-tile conversion)
    const originalTileMap = new Map<string, { x: number; y: number }>();
    clipboard.items.forEach((ci) => {
      originalTileMap.set(ci.viewItem.id, ci.viewItem.tile);
    });
    // Also include existing scene items so detached anchors can use their current tile
    for (const vi of scene.currentView.items ?? []) {
      if (!originalTileMap.has(vi.id)) originalTileMap.set(vi.id, vi.tile);
    }

    // Remap connector anchors — remap known items, detach anchors pointing at items not in clipboard
    const newConnectors: Connector[] = clipboard.connectors.map((c) => ({
      ...c,
      id: idMap.get(c.id) ?? generateId(),
      anchors: c.anchors.map((anchor) => {
        if (anchor.ref?.item) {
          if (idMap.has(anchor.ref.item)) {
            return { ...anchor, ref: { item: idMap.get(anchor.ref.item)! } };
          }
          // Detach anchor: convert to tile ref using the item's known position
          const tile = originalTileMap.get(anchor.ref.item) ?? mouseTile;
          return { ...anchor, ref: { tile } };
        }
        // Tile waypoint: apply paste offset so intermediate points move with the connector
        if (anchor.ref?.tile) {
          return {
            ...anchor,
            ref: { tile: { x: anchor.ref.tile.x + offset.x, y: anchor.ref.tile.y + offset.y } }
          };
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

    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
    uiState.actions.setItemControls(null);

    const pastedCount =
      newItems.length + newConnectors.length + newRectangles.length + newTextBoxes.length;
    showNotification(`Pasted ${pastedCount} item${pastedCount !== 1 ? 's' : ''}`, 'success');
  }, [uiStateApi, scene]);

  return { handleCopy, handleCut, handlePaste };
};
