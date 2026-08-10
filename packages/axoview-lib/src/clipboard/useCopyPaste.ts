import { useCallback, startTransition } from 'react';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useScene } from 'src/hooks/useScene';
import { Connector, Coords, Rectangle, TextBox, Label, UiState } from 'src/types';
import { generateId } from 'src/utils';
import { resolvePlacement } from 'src/utils/resolvePlacement';
import { findNearestUnoccupiedTilesForGroup } from 'src/utils/findNearestUnoccupiedTile';
import { useTranslation } from 'src/stores/localeStore';
import { ClipboardItem, ClipboardPayload } from './clipboard';
import { useClipboard } from './ClipboardContext';

interface SelectionIds {
  itemIds: string[];
  connectorIds: string[];
  rectangleIds: string[];
  textBoxIds: string[];
  labelIds: string[];
}

const EMPTY_SELECTION: SelectionIds = {
  itemIds: [],
  connectorIds: [],
  rectangleIds: [],
  textBoxIds: [],
  labelIds: []
};

// Resolve the current selection (lasso/freehand multi-select, or the single
// itemControls target) into per-kind id lists.
function resolveSelectionIds(uiState: UiState): SelectionIds {
  const mode = uiState.mode;
  if (
    (mode.type === 'LASSO' || mode.type === 'FREEHAND_LASSO') &&
    mode.selection?.items?.length
  ) {
    const refs = mode.selection.items;
    return {
      itemIds: refs.filter((r) => r.type === 'ITEM').map((r) => r.id),
      connectorIds: refs.filter((r) => r.type === 'CONNECTOR').map((r) => r.id),
      rectangleIds: refs
        .filter((r) => r.type === 'RECTANGLE')
        .map((r) => r.id),
      textBoxIds: refs.filter((r) => r.type === 'TEXTBOX').map((r) => r.id),
      labelIds: refs.filter((r) => r.type === 'LABEL').map((r) => r.id)
    };
  }

  // CURSOR-mode multi-selection (Ctrl+click / Ctrl+A, or a lasso that settled to
  // CURSOR). itemControls is null for a multi-selection, so without this the
  // clipboard (and the context menu's bulk Cut/Copy/Duplicate) would resolve to
  // nothing. CONNECTOR_ANCHOR waypoints are ignored by the per-kind filters.
  if ((uiState.selectedIds?.length ?? 0) > 1) {
    const refs = uiState.selectedIds;
    return {
      itemIds: refs.filter((r) => r.type === 'ITEM').map((r) => r.id),
      connectorIds: refs.filter((r) => r.type === 'CONNECTOR').map((r) => r.id),
      rectangleIds: refs.filter((r) => r.type === 'RECTANGLE').map((r) => r.id),
      textBoxIds: refs.filter((r) => r.type === 'TEXTBOX').map((r) => r.id),
      labelIds: refs.filter((r) => r.type === 'LABEL').map((r) => r.id)
    };
  }

  const ctrl = uiState.itemControls;
  if (!ctrl) return EMPTY_SELECTION;
  switch (ctrl.type) {
    case 'ITEM':
      return { ...EMPTY_SELECTION, itemIds: [ctrl.id] };
    case 'TEXTBOX':
      return { ...EMPTY_SELECTION, textBoxIds: [ctrl.id] };
    case 'LABEL':
      return { ...EMPTY_SELECTION, labelIds: [ctrl.id] };
    case 'RECTANGLE':
      return { ...EMPTY_SELECTION, rectangleIds: [ctrl.id] };
    case 'CONNECTOR':
      return { ...EMPTY_SELECTION, connectorIds: [ctrl.id] };
    default:
      return EMPTY_SELECTION;
  }
}

// Connectors to copy: explicitly selected, OR both item-anchors are in the
// selected-item set (so a connector between two copied nodes travels with them).
function collectClipboardConnectors(
  rawConnectors: Connector[],
  selectedConnectorIds: string[],
  selectedIdSet: Set<string>
): Connector[] {
  const selectedConnectorIdSet = new Set(selectedConnectorIds);
  return rawConnectors.filter((connector) => {
    if (selectedConnectorIdSet.has(connector.id)) return true;
    const anchorsWithItem = connector.anchors.filter((a) => a.ref?.item);
    return (
      anchorsWithItem.length >= 2 &&
      anchorsWithItem.every((a) => selectedIdSet.has(a.ref!.item!))
    );
  });
}

const computeCentroid = (points: Coords[]): Coords => {
  if (points.length === 0) return { x: 0, y: 0 };
  const sum = points.reduce(
    (acc, t) => ({ x: acc.x + t.x, y: acc.y + t.y }),
    { x: 0, y: 0 }
  );
  return {
    x: Math.round(sum.x / points.length),
    y: Math.round(sum.y / points.length)
  };
};

export const useCopyPaste = () => {
  const uiStateApi = useUiStateStoreApi();
  const modelStoreApi = useModelStoreApi();
  const scene = useScene();
  const clipboard = useClipboard();
  // D7 — toast strings come from i18n; counts pluralise via one/other keys with
  // a {count} placeholder (never `+ 's'`), the routing toast via {percent}.
  const { t } = useTranslation('clipboard');

  const showNotification = useCallback(
    (message: string, severity: 'info' | 'success' | 'warning') => {
      uiStateApi.getState().actions.setNotification({ message, severity });
    },
    [uiStateApi]
  );

  // Shared helper: gather the current selection into a clipboard payload.
  // Returns null if nothing is selected or nothing resolves to canvas items.
  const buildPayload = useCallback((): {
    payload: ClipboardPayload;
    count: number;
  } | null => {
    const uiState = uiStateApi.getState();
    const model = modelStoreApi.getState();

    const { itemIds, connectorIds, rectangleIds, textBoxIds, labelIds } =
      resolveSelectionIds(uiState);

    if (
      itemIds.length === 0 &&
      connectorIds.length === 0 &&
      rectangleIds.length === 0 &&
      textBoxIds.length === 0 &&
      labelIds.length === 0
    ) {
      return null;
    }

    const selectedIdSet = new Set(itemIds);
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

    const clipboardConnectors = collectClipboardConnectors(
      currentView.connectors ?? [],
      connectorIds,
      selectedIdSet
    );

    const selectedRectIdSet = new Set(rectangleIds);
    const selectedTextIdSet = new Set(textBoxIds);
    const clipboardRectangles = (currentView.rectangles ?? []).filter((r) =>
      selectedRectIdSet.has(r.id)
    );
    const clipboardTextBoxes = (currentView.textBoxes ?? []).filter((tb) =>
      selectedTextIdSet.has(tb.id)
    );
    const selectedLabelIdSet = new Set(labelIds);
    const clipboardLabels = (currentView.labels ?? []).filter((l) =>
      selectedLabelIdSet.has(l.id)
    );

    const count =
      clipboardItems.length +
      clipboardConnectors.length +
      clipboardRectangles.length +
      clipboardTextBoxes.length +
      clipboardLabels.length;

    if (count === 0) return null;

    // Centroid across all item positions
    const allPoints = [
      ...clipboardItems.map((ci) => ci.viewItem.tile),
      ...clipboardRectangles.map((r) => ({
        x: Math.round((r.from.x + r.to.x) / 2),
        y: Math.round((r.from.y + r.to.y) / 2)
      })),
      ...clipboardTextBoxes.map((tb) => tb.tile),
      ...clipboardLabels.map((l) => l.tile)
    ];
    const centroid = computeCentroid(allPoints);

    return {
      payload: {
        items: clipboardItems,
        connectors: clipboardConnectors,
        rectangles: clipboardRectangles,
        textBoxes: clipboardTextBoxes,
        labels: clipboardLabels,
        centroid
      },
      count
    };
  }, [uiStateApi, modelStoreApi, scene]);

  // D7 — pick the singular/plural key and interpolate {count}; never `+ 's'`.
  const formatCount = useCallback(
    (one: 'copiedOne' | 'cutOne' | 'pastedOne', other: 'copiedOther' | 'cutOther' | 'pastedOther', count: number) =>
      t(count === 1 ? one : other).replace('{count}', String(count)),
    [t]
  );

  const handleCopy = useCallback(() => {
    const result = buildPayload();
    if (!result) return;
    clipboard.set(result.payload);
    showNotification(
      formatCount('copiedOne', 'copiedOther', result.count),
      'info'
    );
  }, [buildPayload, showNotification, clipboard, formatCount]);

  const handleCut = useCallback(() => {
    const result = buildPayload();
    if (!result) return;

    clipboard.set(result.payload);

    // Delete the cut items — mirrors the Delete key logic in useInteractionManager
    const uiState = uiStateApi.getState();
    const mode = uiState.mode;

    if (
      (mode.type === 'LASSO' || mode.type === 'FREEHAND_LASSO') &&
      mode.selection?.items?.length
    ) {
      scene.deleteSelectedItems(mode.selection.items);
      uiState.actions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      uiState.actions.setItemControls(null);
    } else if ((uiState.selectedIds?.length ?? 0) > 1) {
      // CURSOR-mode multi-selection — delete every selected item (mirrors the
      // Delete-key multi path + the context menu's bulk Delete).
      scene.deleteSelectedItems(uiState.selectedIds);
      uiState.actions.clearSelection();
    } else if (uiState.itemControls) {
      const ctrl = uiState.itemControls;
      if (ctrl.type === 'ITEM') scene.deleteViewItem(ctrl.id);
      else if (ctrl.type === 'CONNECTOR') scene.deleteConnector(ctrl.id);
      else if (ctrl.type === 'TEXTBOX') scene.deleteTextBox(ctrl.id);
      else if (ctrl.type === 'LABEL') scene.deleteLabel(ctrl.id);
      else if (ctrl.type === 'RECTANGLE') scene.deleteRectangle(ctrl.id);
      uiState.actions.setItemControls(null);
    }

    showNotification(
      formatCount('cutOne', 'cutOther', result.count),
      'success'
    );
  }, [buildPayload, showNotification, uiStateApi, scene, clipboard, formatCount]);

  const handlePaste = useCallback(() => {
    const clipboardData = clipboard.get();
    if (!clipboardData) {
      showNotification(t('nothingToPaste'), 'warning');
      return;
    }

    const uiState = uiStateApi.getState();
    const mouseTile = uiState.mouse.position.tile;
    const globalSnap = uiState.snapToGrid ?? true;

    const offset = {
      x: mouseTile.x - clipboardData.centroid.x,
      y: mouseTile.y - clipboardData.centroid.y
    };

    // Target tiles for items (before collision avoidance). Carry each item's
    // own snap/collides so non-colliding pasted items (ADR 0023) don't force the
    // block to shift around them.
    const targetItems = clipboardData.items.map((ci) => ({
      id: ci.viewItem.id,
      targetTile: {
        x: ci.viewItem.tile.x + offset.x,
        y: ci.viewItem.tile.y + offset.y
      },
      snap: ci.viewItem.snap,
      collides: ci.viewItem.collides
    }));

    // Collision avoidance
    let finalTiles = targetItems.map((t) => t.targetTile);
    if (targetItems.length > 0) {
      const resolved = findNearestUnoccupiedTilesForGroup(targetItems, scene);
      if (resolved) finalTiles = resolved;
    }

    // New IDs map (old id -> new id)
    const idMap = new Map<string, string>();
    clipboardData.items.forEach((ci) =>
      idMap.set(ci.viewItem.id, generateId())
    );
    clipboardData.connectors.forEach((c) => idMap.set(c.id, generateId()));
    clipboardData.rectangles.forEach((r) => idMap.set(r.id, generateId()));
    clipboardData.textBoxes.forEach((tb) => idMap.set(tb.id, generateId()));
    (clipboardData.labels ?? []).forEach((l) => idMap.set(l.id, generateId()));

    // E3/SCN-03: anchor ids are their own identity namespace and every
    // anchor-to-anchor ref and CONNECTOR_ANCHOR selection ref resolves by id
    // across the WHOLE view — carrying them over verbatim left two anchors
    // with one id, so a single waypoint delete spliced both connectors
    // (SCN-04) and the original's waypoint became unaddressable. Pasted
    // anchors get fresh ids through the same kind of map as everything else.
    const anchorIdMap = new Map<string, string>();
    clipboardData.connectors.forEach((c) =>
      c.anchors.forEach((a) => anchorIdMap.set(a.id, generateId()))
    );

    // (Foreign `layerId`s are stripped inside `pasteItems` — the chokepoint
    // every duplication path funnels through. E3/SCN-14.)

    // Build remapped items. Route each through the one placement chokepoint:
    // the `...ci.viewItem` spread preserves a copied item's own snap/collides/
    // offset, and resolvePlacement clears a stale offset when the item snaps so
    // off-grid-ness survives a copy without leaking onto snapped items.
    const newItems: ClipboardItem[] = clipboardData.items.map((ci, i) => {
      const newId = idMap.get(ci.viewItem.id)!;
      const placement = resolvePlacement(
        finalTiles[i],
        ci.viewItem.offset,
        ci.viewItem.snap,
        globalSnap
      );
      return {
        modelItem: { ...ci.modelItem, id: newId },
        viewItem: {
          ...ci.viewItem,
          id: newId,
          tile: placement.tile,
          offset: placement.offset
        }
      };
    });

    // Build a map of original item id -> pasted tile (for detach-to-tile conversion)
    const originalTileMap = new Map<string, { x: number; y: number }>();
    clipboardData.items.forEach((ci) => {
      originalTileMap.set(ci.viewItem.id, ci.viewItem.tile);
    });
    // Also include existing scene items so detached anchors can use their current tile
    for (const vi of scene.currentView.items ?? []) {
      if (!originalTileMap.has(vi.id)) originalTileMap.set(vi.id, vi.tile);
    }

    // Remap connector anchors — fresh anchor ids (SCN-03), remap known
    // items/anchors, detach refs pointing outside the clipboard set.
    const newConnectors: Connector[] = clipboardData.connectors.map(
      (c) => ({
        ...c,
        id: idMap.get(c.id) ?? generateId(),
        anchors: c.anchors.map((anchor) => {
          const newAnchorId = anchorIdMap.get(anchor.id) ?? generateId();
          if (anchor.ref?.item) {
            if (idMap.has(anchor.ref.item)) {
              return {
                ...anchor,
                id: newAnchorId,
                ref: { item: idMap.get(anchor.ref.item)! }
              };
            }
            // Detach anchor: convert to tile ref using the item's known position
            const tile = originalTileMap.get(anchor.ref.item) ?? mouseTile;
            return { ...anchor, id: newAnchorId, ref: { tile } };
          }
          // Anchor-to-anchor ref: inside the pasted set it follows the same
          // map (SCN-03); outside it, detach to the paste point — keeping the
          // original id would tether the clone to the source connector, and on
          // a cross-page paste it would dangle. (A cross-set anchor-to-anchor
          // ref is a rare shape; landing its detached waypoint at the paste
          // point rather than the source anchor's exact tile is acceptable.)
          if (anchor.ref?.anchor) {
            if (anchorIdMap.has(anchor.ref.anchor)) {
              return {
                ...anchor,
                id: newAnchorId,
                ref: { anchor: anchorIdMap.get(anchor.ref.anchor)! }
              };
            }
            return { ...anchor, id: newAnchorId, ref: { tile: mouseTile } };
          }
          // Tile waypoint: apply paste offset so intermediate points move with the connector
          if (anchor.ref?.tile) {
            return {
              ...anchor,
              id: newAnchorId,
              ref: {
                tile: {
                  x: anchor.ref.tile.x + offset.x,
                  y: anchor.ref.tile.y + offset.y
                }
              }
            };
          }
          return { ...anchor, id: newAnchorId };
        })
      })
    );

    // Offset rectangles
    const newRectangles: Rectangle[] = clipboardData.rectangles.map((r) => ({
      ...r,
      id: idMap.get(r.id) ?? generateId(),
      from: { x: r.from.x + offset.x, y: r.from.y + offset.y },
      to: { x: r.to.x + offset.x, y: r.to.y + offset.y }
    }));

    // Offset text boxes
    const newTextBoxes: TextBox[] = clipboardData.textBoxes.map((tb) => ({
      ...tb,
      id: idMap.get(tb.id) ?? generateId(),
      tile: { x: tb.tile.x + offset.x, y: tb.tile.y + offset.y }
    }));

    // Offset labels
    const newLabels: Label[] = (clipboardData.labels ?? []).map((l) => ({
      ...l,
      id: idMap.get(l.id) ?? generateId(),
      tile: { x: l.tile.x + offset.x, y: l.tile.y + offset.y }
    }));

    const pastedCount =
      newItems.length +
      newConnectors.length +
      newRectangles.length +
      newTextBoxes.length +
      newLabels.length;
    const LARGE_PASTE_THRESHOLD = 500;
    const isLargePaste = newConnectors.length >= LARGE_PASTE_THRESHOLD;

    // Build the progress callback — only used for large pastes.
    const onPathProgress = isLargePaste
      ? (done: number, total: number) => {
          if (done >= total) {
            showNotification(
              formatCount('pastedOne', 'pastedOther', pastedCount),
              'success'
            );
          } else {
            const pct = Math.round((done / total) * 100);
            showNotification(
              t('routingConnectors').replace('{percent}', String(pct)),
              'info'
            );
          }
        }
      : undefined;

    // Wrap the store write in startTransition so React can deprioritize the resulting
    // render and remain responsive to user input during large paste operations.
    startTransition(() => {
      const applied = scene.pasteItems(
        {
          items: newItems,
          connectors: newConnectors,
          rectangles: newRectangles,
          textBoxes: newTextBoxes,
          labels: newLabels
        },
        onPathProgress
      );

      // E3/SCN-12: an invalid payload used to be abandoned with only a
      // console.warn — Ctrl+V appeared to do nothing. Surface it with the SAME
      // warning the empty-clipboard path uses (the entry's fix direction, and
      // no new boot-critical i18n weight): from the user's seat the paste
      // yielded nothing either way (UX §6.3: failures are surfaced, not left in
      // devtools). Never claim success for a paste that was rejected.
      if (!applied) {
        showNotification(t('nothingToPaste'), 'warning');
        return;
      }

      if (!isLargePaste) {
        showNotification(
          formatCount('pastedOne', 'pastedOther', pastedCount),
          'success'
        );
      } else {
        showNotification(
          t('routingConnectors').replace('{percent}', '0'),
          'info'
        );
      }
    });

    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
    uiState.actions.setItemControls(null);
  }, [showNotification, uiStateApi, scene, clipboard, t, formatCount]);

  return { handleCopy, handleCut, handlePaste };
};
