import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Alert
} from '@mui/material';
import { AddOutlined, DeleteOutlineOutlined } from '@mui/icons-material';
import { useLayerContext, LayerItem } from 'src/hooks/useLayerContext';
import { useLayerActions } from 'src/hooks/useLayerActions';
import { describeLayerContents } from 'src/stores/reducers/view';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useTranslation } from 'src/stores/localeStore';
import { useScene } from 'src/hooks/useScene';
import { useSceneData } from 'src/hooks/useSceneData';
import { ItemReference, Coords } from 'src/types';
import { filterUserFacingRefs } from 'src/utils/connectorSelection';
import { LayerRow } from './LayerRow';
import { LayerItemRow } from './LayerItemRow';

interface BoundingScene {
  items: { id: string; tile: Coords }[];
  textBoxes: { id: string; tile: Coords }[];
  rectangles: { id: string; from: Coords; to: Coords }[];
  connectors: { id: string }[];
}

// The tile(s) a single reference contributes to a bounding box: a node/textbox
// adds its tile, a rectangle adds both corners, a connector adds its path tiles.
const collectRefTiles = (
  ref: ItemReference,
  scene: BoundingScene,
  connectorPaths: Record<string, { tiles?: Coords[] } | undefined>
): Coords[] => {
  if (ref.type === 'ITEM') {
    const it = scene.items.find((i) => i.id === ref.id);
    return it ? [it.tile] : [];
  }
  if (ref.type === 'TEXTBOX') {
    const tb = scene.textBoxes.find((t) => t.id === ref.id);
    return tb ? [tb.tile] : [];
  }
  if (ref.type === 'RECTANGLE') {
    const r = scene.rectangles.find((rr) => rr.id === ref.id);
    return r ? [r.from, r.to] : [];
  }
  if (ref.type === 'CONNECTOR') {
    const path = connectorPaths[ref.id]?.tiles;
    return path && path.length > 0 ? [...path] : [];
  }
  return [];
};

// Compute the tile bounding box that contains every passed-in item.
// Used so the LASSO action bar (LassoLayerBar) can position itself above
// a panel-driven multi-selection the same way it does for canvas-drag selection.
const computeBoundingTiles = (
  items: ItemReference[],
  scene: BoundingScene,
  connectorPaths: Record<string, { tiles?: Coords[] } | undefined>
): { startTile: Coords; endTile: Coords } | null => {
  const tiles: Coords[] = [];
  for (const ref of items) {
    tiles.push(...collectRefTiles(ref, scene, connectorPaths));
  }
  if (tiles.length === 0) return null;
  const xs = tiles.map((t) => t.x);
  const ys = tiles.map((t) => t.y);
  return {
    startTile: { x: Math.min(...xs), y: Math.min(...ys) },
    endTile: { x: Math.max(...xs), y: Math.max(...ys) }
  };
};

export const LayersPanel = () => {
  const { t } = useTranslation('layersPanel');
  const { layers, itemCountByLayerId, unassignedCount, itemsByLayerId } =
    useLayerContext();
  const {
    createLayer,
    updateLayer,
    deleteLayer,
    reorderLayers,
    assignLayerToItems
  } = useLayerActions();
  const {
    currentView,
    updateModelItem,
    updateConnector,
    updateViewItem,
    updateTextBox,
    updateRectangle
  } = useScene();
  const sceneData = useSceneData();
  // F4/LAY-03 — the selected row IS the active layer, and it lives in uiState so
  // the placement modes can read it. It used to be component state that nothing
  // outside this panel could see, which is why every new element landed
  // unassigned however carefully the user had organised their layers.
  const selectedLayerId = useUiStateStore((s) => s.activeLayerId);
  const setSelectedLayerId = useUiStateStore((s) => s.actions.setActiveLayerId);
  // …and it is dropped as soon as it stops naming a live layer — a delete from
  // anywhere, or a switch to a page that does not have it. `activeLayerPatch`
  // re-checks at the placement site too, so a stale id can never be stamped
  // onto a new entity (the E2/RED-03 dangling-reference class).
  useEffect(() => {
    if (selectedLayerId && !layers.some((l) => l.id === selectedLayerId)) {
      setSelectedLayerId(null);
    }
  }, [selectedLayerId, layers, setSelectedLayerId]);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [expandedLayerIds, setExpandedLayerIds] = useState<Set<string>>(
    new Set()
  );
  const panelRef = useRef<HTMLDivElement>(null);

  // F2 → rename selected layer (mqa-results.md #3 / #15). Document-level so a
  // click on a row (which doesn't move focus) still arms the shortcut. Gated
  // on focus being either inside the panel or on body — keeps the file
  // explorer's own F2 handler authoritative when its container is focused.
  useEffect(() => {
    if (!selectedLayerId) return;
    const node = panelRef.current;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'F2') return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      const focusOk = !active || active === document.body || (node ? node.contains(active) : false);
      if (!focusOk) return;
      e.preventDefault();
      setEditingLayerId(selectedLayerId);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedLayerId]);

  // Bidirectional: read current canvas selection
  const itemControls = useUiStateStore((s) => s.itemControls);
  const mode = useUiStateStore((s) => s.mode);
  const selectedIds = useUiStateStore((s) => s.selectedIds);
  const uiStateActions = useUiStateStore((s) => s.actions);

  const selectedItemId =
    itemControls && itemControls.type !== 'ADD_ITEM' ? itemControls.id : null;

  // The current canvas multi-selection, regardless of how it was produced:
  // a LASSO/freehand drag and panel Ctrl-clicks live in `mode.selection`, while
  // a canvas Ctrl-click / Ctrl+A lives in `uiState.selectedIds` (ADR 0006 §6).
  // The panel mirrors BOTH so a canvas Ctrl-multi-select lights up the rows
  // (ADR 0006 addendum #13 / UX §4.1) — not only LASSO-mode selection.
  const selectedRefs = useMemo<ItemReference[]>(
    () =>
      mode.type === 'LASSO' && mode.selection
        ? mode.selection.items
        : selectedIds,
    [mode, selectedIds]
  );

  // Row-highlight id set, unioning every selection source.
  const highlightedIds = useMemo(
    () => new Set(selectedRefs.map((i) => i.id)),
    [selectedRefs]
  );

  // Anchor for shift-click range selection — id of the last plain-clicked row.
  const anchorIdRef = useRef<string | null>(null);

  // Layers displayed top-to-bottom = highest order first. Memoized so a
  // selection change (which re-renders the panel via the itemControls/mode
  // subscriptions) doesn't rebuild the array and invalidate visibleItemsFlat —
  // keeping the per-selection parent work O(1) rather than O(N) items (T3).
  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => b.order - a.order),
    [layers]
  );

  const handleAddLayer = useCallback(() => {
    // D8 — default layer name interpolated via i18n ({count}), not concat.
    createLayer({
      name: t('layerN').replace('{count}', String(layers.length + 1))
    });
  }, [createLayer, layers.length, t]);

  // F4/LAY-05 + the E2/RED-13 ruling (owner 2026-07-30) — deleting a layer that
  // HOLDS something asks what to do with the contents, because both answers are
  // defensible and doing either silently is not. An EMPTY layer skips the
  // dialog: there is nothing to decide.
  const [pendingDelete, setPendingDelete] = useState<{
    layerId: string;
    count: number;
    hidden: boolean;
  } | null>(null);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedLayerId) return;
    const { count, hidden } = describeLayerContents(
      currentView,
      selectedLayerId
    );
    if (count === 0) {
      deleteLayer(selectedLayerId, 'unassign');
      setSelectedLayerId(null);
      return;
    }
    setPendingDelete({ layerId: selectedLayerId, count, hidden });
  }, [deleteLayer, selectedLayerId, currentView, setSelectedLayerId]);

  const resolveDelete = useCallback(
    (contents: 'unassign' | 'delete') => {
      if (!pendingDelete) return;
      deleteLayer(pendingDelete.layerId, contents);
      setSelectedLayerId(null);
      setPendingDelete(null);
    },
    [pendingDelete, deleteLayer, setSelectedLayerId]
  );

  const handleToggleVisible = useCallback(
    (id: string) => {
      const layer = layers.find((l) => l.id === id);
      if (layer) updateLayer({ id, visible: !layer.visible });
    },
    [layers, updateLayer]
  );

  const handleToggleLocked = useCallback(
    (id: string) => {
      const layer = layers.find((l) => l.id === id);
      if (layer) updateLayer({ id, locked: !layer.locked });
    },
    [layers, updateLayer]
  );

  const handleRename = useCallback(
    (id: string, name: string) => {
      updateLayer({ id, name });
    },
    [updateLayer]
  );

  const handleToggleExpand = useCallback((layerId: string) => {
    setExpandedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }, []);

  const handleItemRename = useCallback(
    (item: LayerItem, newName: string) => {
      if (item.type === 'ITEM') updateModelItem(item.id, { name: newName });
      if (item.type === 'CONNECTOR') updateConnector(item.id, { name: newName });
      if (item.type === 'TEXTBOX') updateTextBox(item.id, { name: newName });
      if (item.type === 'RECTANGLE') updateRectangle(item.id, { name: newName });
    },
    [updateModelItem, updateConnector, updateTextBox, updateRectangle]
  );

  const handleToggleLabel = useCallback(
    (item: LayerItem) => {
      const next = item.showLabel === false ? undefined : false;
      if (item.type === 'ITEM') updateViewItem(item.id, { showLabel: next });
      if (item.type === 'CONNECTOR') updateConnector(item.id, { showLabel: next });
    },
    [updateViewItem, updateConnector]
  );

  // Flat list of visible item rows, in display order. Used to compute
  // the shift-click range. Only expanded layers contribute; collapsed
  // layers' items are not visible so they aren't selectable as range targets.
  const visibleItemsFlat = useMemo<LayerItem[]>(() => {
    const out: LayerItem[] = [];
    for (const layer of sortedLayers) {
      if (!expandedLayerIds.has(layer.id)) continue;
      const layerItems = itemsByLayerId.get(layer.id) ?? [];
      out.push(...layerItems);
    }
    const unassigned = itemsByLayerId.get('__unassigned__') ?? [];
    out.push(...unassigned);
    return out;
  }, [sortedLayers, expandedLayerIds, itemsByLayerId]);

  const buildLassoFromItems = useCallback(
    (items: ItemReference[]) => {
      const connectorPaths = sceneData.hitConnectors.reduce<
        Record<string, { tiles?: Coords[] }>
      >((acc, c) => {
        if (c.path) acc[c.id] = { tiles: c.path.tiles };
        return acc;
      }, {});
      const bounds = computeBoundingTiles(
        items,
        sceneData,
        connectorPaths
      ) ?? {
        startTile: { x: 0, y: 0 },
        endTile: { x: 0, y: 0 }
      };
      uiStateActions.setMode({
        type: 'LASSO',
        showCursor: true,
        isDragging: false,
        selection: {
          startTile: bounds.startTile,
          endTile: bounds.endTile,
          items
        }
      });
    },
    [sceneData, uiStateActions]
  );

  // Shift-click: select the inclusive range between the anchor row and the
  // clicked row. Returns true when a range was applied (handled).
  const tryShiftRangeSelect = useCallback(
    (item: LayerItem, shift: boolean): boolean => {
      if (!shift || !anchorIdRef.current) return false;
      const anchorIdx = visibleItemsFlat.findIndex(
        (i) => i.id === anchorIdRef.current
      );
      const targetIdx = visibleItemsFlat.findIndex((i) => i.id === item.id);
      if (anchorIdx === -1 || targetIdx === -1) return false;
      const [lo, hi] =
        anchorIdx <= targetIdx
          ? [anchorIdx, targetIdx]
          : [targetIdx, anchorIdx];
      const range = visibleItemsFlat
        .slice(lo, hi + 1)
        .map<ItemReference>((i) => ({ type: i.type, id: i.id }));
      buildLassoFromItems(range);
      return true;
    },
    [visibleItemsFlat, buildLassoFromItems]
  );

  // Ctrl-click: toggle the clicked row in/out of the current selection,
  // collapsing to single-select or clearing as the set shrinks.
  const applyCtrlToggleSelect = useCallback(
    (ref: ItemReference, item: LayerItem) => {
      // Start from current LASSO selection if present, else from current
      // single-item selection.
      const current: ItemReference[] =
        mode.type === 'LASSO' && mode.selection
          ? [...mode.selection.items]
          : itemControls && itemControls.type !== 'ADD_ITEM'
            ? [{ type: itemControls.type, id: itemControls.id }]
            : [];
      const exists = current.some(
        (r) => r.id === ref.id && r.type === ref.type
      );
      const next = exists
        ? current.filter((r) => !(r.id === ref.id && r.type === ref.type))
        : [...current, ref];
      if (next.length === 0) {
        uiStateActions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
        uiStateActions.setItemControls(null);
      } else if (next.length === 1) {
        uiStateActions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
        // Select-only (ADR 0022 §3) — collapsing a multi-select to one item
        // highlights it + opens the bar, but doesn't mount the panel.
        uiStateActions.setSelectedIds([{ type: next[0].type, id: next[0].id }]);
      } else {
        buildLassoFromItems(next);
      }
      anchorIdRef.current = item.id;
    },
    [mode, itemControls, uiStateActions, buildLassoFromItems]
  );

  // Latest closures the row-click handler needs, captured in a ref so
  // handleItemClick stays identity-stable across renders. applyCtrlToggleSelect
  // inherently depends on itemControls/mode (which change on every selection),
  // so keeping it as a direct useCallback dep would churn the onClick prop for
  // ALL rows on every selection and defeat LayerItemRow's memo — re-rendering
  // every row per selection (the T3 lag). Reading the latest closures from the
  // ref keeps behavior identical while letting the memo hold, so only the rows
  // whose isSelected actually flips re-render.
  const itemClickImpl = useRef({
    tryShiftRangeSelect,
    applyCtrlToggleSelect,
    mode,
    uiStateActions
  });
  itemClickImpl.current = {
    tryShiftRangeSelect,
    applyCtrlToggleSelect,
    mode,
    uiStateActions
  };

  // Panel → canvas: clicking an item row selects it on canvas.
  // Modifier keys promote to a multi-select via LASSO mode (UX §4.1).
  const handleItemClick = useCallback(
    (item: LayerItem, modifiers: { shift: boolean; ctrl: boolean }) => {
      const {
        tryShiftRangeSelect: tryShift,
        applyCtrlToggleSelect: applyCtrl,
        mode: curMode,
        uiStateActions: actions
      } = itemClickImpl.current;
      const ref: ItemReference = { type: item.type, id: item.id };

      if (tryShift(item, modifiers.shift)) return;

      if (modifiers.ctrl) {
        applyCtrl(ref, item);
        return;
      }

      // Plain click: drop any LASSO multi-select, single-select on canvas.
      // Select-only (highlight + canvas sync + action bar), NOT open — mirrors
      // the canvas single-click (ADR 0022 §3 / §4.1). The panel opens on
      // double-click (handleItemOpen).
      if (curMode.type === 'LASSO') {
        actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
      }
      anchorIdRef.current = item.id;
      actions.setSelectedIds([{ type: item.type, id: item.id }]);
    },
    []
  );

  // Panel → canvas: double-clicking a row opens its details panel, mirroring the
  // canvas open/select split (ADR 0022 §3 / ADR 0006 addendum). `uiStateActions`
  // is the store's stable actions object, so this stays identity-stable across
  // selection re-renders — preserving the T3 memo (commit c875b652): a selection
  // re-renders 2 rows, not all N.
  const handleItemOpen = useCallback(
    (item: LayerItem) => {
      uiStateActions.setItemControls({ type: item.type, id: item.id });
    },
    [uiStateActions]
  );

  // Drag item to assign to a layer
  const [itemDragState, setItemDragState] = useState<{
    item: LayerItem;
    overLayerId: string | null;
  } | null>(null);

  const handleItemDragStart = useCallback((item: LayerItem) => {
    setItemDragState({ item, overLayerId: null });
  }, []);

  const handleItemDragOverLayer = useCallback((layerId: string) => {
    setItemDragState((s) => (s ? { ...s, overLayerId: layerId } : null));
  }, []);

  const handleItemDragEnd = useCallback(() => {
    if (itemDragState?.overLayerId) {
      const target =
        itemDragState.overLayerId === '__unassigned__'
          ? undefined
          : itemDragState.overLayerId;
      const draggedRef: ItemReference = {
        type: itemDragState.item.type,
        id: itemDragState.item.id
      };
      // Bulk: if the dragged row is part of the current multi-selection, assign
      // the WHOLE selection to the target layer, not just the dragged item
      // (ADR 0006 addendum #13). filterUserFacingRefs drops CONNECTOR_ANCHOR
      // refs — waypoints can't be layer-assigned (UX §4.4). Otherwise assign
      // just the dragged item.
      const draggedInSelection = selectedRefs.some(
        (r) => r.id === draggedRef.id && r.type === draggedRef.type
      );
      const refs = draggedInSelection
        ? filterUserFacingRefs(selectedRefs)
        : [draggedRef];
      assignLayerToItems(target, refs);
    }
    setItemDragState(null);
  }, [itemDragState, assignLayerToItems, selectedRefs]);

  // Simple drag-to-reorder via mousedown/mousemove on drag handle
  const [dragState, setDragState] = useState<{
    dragId: string;
    overId: string | null;
  } | null>(null);

  const handleDragStart = useCallback((layerId: string) => {
    setDragState({ dragId: layerId, overId: null });
  }, []);

  const handleDragOver = useCallback(
    (layerId: string) => {
      if (dragState && dragState.dragId !== layerId) {
        setDragState((s) => (s ? { ...s, overId: layerId } : null));
      }
    },
    [dragState]
  );

  const handleDragEnd = useCallback(() => {
    if (!dragState || !dragState.overId) {
      setDragState(null);
      return;
    }
    const ids = sortedLayers.map((l) => l.id);
    const fromIdx = ids.indexOf(dragState.dragId);
    const toIdx = ids.indexOf(dragState.overId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const reordered = [...ids];
      reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, dragState.dragId);
      reorderLayers([...reordered].reverse());
    }
    setDragState(null);
  }, [dragState, sortedLayers, reorderLayers]);

  const unassignedItems = itemsByLayerId.get('__unassigned__') ?? [];

  return (
    <Box
      tabIndex={-1}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        outline: 'none',
        // VS Code-style hover-reveal for the layer-actions cluster (mqa-results.md #27).
        '&:hover .ff-layers-header-actions, &:focus-within .ff-layers-header-actions': {
          opacity: 1
        }
      }}
      onMouseUp={() => {
        handleDragEnd();
        handleItemDragEnd();
      }}
      onMouseLeave={() => {
        handleDragEnd();
        handleItemDragEnd();
      }}
      ref={panelRef}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 1.5, py: 1, flexShrink: 0 }}
      >
        <Typography variant="overline" color="text.secondary">
          {/* D8 — header routed through i18n */}
          {t('header')}
        </Typography>
        <Stack
          className="ff-layers-header-actions"
          direction="row"
          spacing={0.25}
          sx={{
            opacity: 0,
            transition: 'opacity 120ms ease',
            '&:focus-within': { opacity: 1 }
          }}
        >
          <Tooltip title={t('addLayer')} placement="top">
            <IconButton
              size="small"
              onClick={handleAddLayer}
              data-axoview-id="layers-panel-add"
              sx={{ p: 0.5 }}
            >
              <AddOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('deleteSelectedLayer')} placement="top">
            <span>
              <IconButton
                size="small"
                data-axoview-id="layers-panel-delete"
                onClick={handleDeleteSelected}
                disabled={!selectedLayerId}
                sx={{ p: 0.5 }}
              >
                <DeleteOutlineOutlined fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Divider />

      {/* Layer tree — scrollable */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 0.5, py: 0.5 }}>
        {sortedLayers.length === 0 && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', textAlign: 'center', mt: 2, mb: 1 }}
          >
            {/* D8 — empty-state routed through i18n */}
            {t('noLayersYet')}
          </Typography>
        )}
        {sortedLayers.length > 0 && (
          <>
            {sortedLayers.map((layer) => {
              const isExpanded = expandedLayerIds.has(layer.id);
              const layerItems = itemsByLayerId.get(layer.id) ?? [];
              return (
                <Box
                  key={layer.id}
                  onMouseEnter={() => {
                    if (dragState) handleDragOver(layer.id);
                    if (itemDragState) handleItemDragOverLayer(layer.id);
                  }}
                  sx={{
                    outline:
                      dragState?.overId === layer.id ||
                      itemDragState?.overLayerId === layer.id
                        ? '2px solid'
                        : 'none',
                    outlineColor: 'primary.main',
                    borderRadius: 1
                  }}
                >
                  <LayerRow
                    layer={layer}
                    isSelected={selectedLayerId === layer.id}
                    isExpanded={isExpanded}
                    isEditingExternal={editingLayerId === layer.id}
                    onEditEnd={() => setEditingLayerId(null)}
                    itemCount={itemCountByLayerId.get(layer.id) ?? 0}
                    onSelect={setSelectedLayerId}
                    onToggleExpand={handleToggleExpand}
                    onToggleVisible={handleToggleVisible}
                    onToggleLocked={handleToggleLocked}
                    onRename={handleRename}
                    dragHandleProps={{
                      onMouseDown: (e) => {
                        e.preventDefault();
                        handleDragStart(layer.id);
                      }
                    }}
                  />
                  {isExpanded && layerItems.length > 0 && (
                    <Box>
                      {layerItems.map((item) => (
                        <LayerItemRow
                          key={item.id}
                          item={item}
                          isSelected={item.id === selectedItemId || highlightedIds.has(item.id)}
                          onClick={handleItemClick}
                          onOpen={handleItemOpen}
                          onRename={handleItemRename}
                          onDragStart={handleItemDragStart}
                          onToggleLabel={handleToggleLabel}
                        />
                      ))}
                    </Box>
                  )}
                </Box>
              );
            })}
          </>
        )}

        {/* Unassigned group — always rendered so users have a drop target to
            pull items back out of a layer (mqa-results.md #4). */}
        <Box
          onMouseEnter={() => {
            if (itemDragState) handleItemDragOverLayer('__unassigned__');
          }}
          sx={{
            mt: 0.5,
            outline:
              itemDragState?.overLayerId === '__unassigned__'
                ? '2px dashed'
                : 'none',
            outlineColor: 'primary.main',
            borderRadius: 1,
            minHeight: unassignedCount === 0 ? 32 : undefined
          }}
        >
          <Typography
            variant="overline"
            color="text.disabled"
            sx={{ display: 'block', px: 0.5, pt: 0.5, pb: 0.25 }}
          >
            {/* D8 — "Unassigned (N)" count interpolated via i18n, not concat */}
            {t('unassigned').replace('{count}', String(unassignedCount))}
          </Typography>
          {unassignedCount === 0 ? (
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ display: 'block', px: 1, pb: 0.75, fontStyle: 'italic' }}
            >
              {/* D8 — drop hint routed through i18n */}
              {t('dropToUnassign')}
            </Typography>
          ) : (
            unassignedItems.map((item) => (
              <LayerItemRow
                key={item.id}
                item={item}
                isSelected={item.id === selectedItemId || highlightedIds.has(item.id)}
                onClick={handleItemClick}
                onOpen={handleItemOpen}
                onRename={handleItemRename}
                onDragStart={handleItemDragStart}
                onToggleLabel={handleToggleLabel}
              />
            ))
          )}
        </Box>
      </Box>

      {/* F4/LAY-05 + E2/RED-13 (owner ruling 2026-07-30) — deleting a layer that
          holds something asks which of the two defensible meanings applies.
          Axoview layers are TAGS, not owners, so the Visio pattern (ask) rather
          than AutoCAD's (refuse) or Photoshop's (delete contents silently).

          The hidden-layer warning is LAY-05: visibility derives as
          `!layer || layer.visible`, so an entity with NO layer is
          unconditionally visible — unassigning the members of a hidden layer
          inverts their visibility, and deleting a hidden layer used to reveal
          everything it was hiding with no warning at all. */}
      <Dialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        data-axoview-id="layer-delete-confirm"
      >
        <DialogTitle>{t('deleteLayerTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('deleteLayerBody').replace(
              '{count}',
              String(pendingDelete?.count ?? 0)
            )}
          </DialogContentText>
          {pendingDelete?.hidden && (
            <Alert
              severity="warning"
              sx={{ mt: 2 }}
              data-axoview-id="layer-delete-hidden-warning"
            >
              {t('deleteLayerHiddenWarning')}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>
            {t('deleteLayerCancel')}
          </Button>
          <Button
            onClick={() => resolveDelete('unassign')}
            data-axoview-id="layer-delete-keep"
          >
            {t('deleteLayerKeep')}
          </Button>
          <Button
            color="error"
            onClick={() => resolveDelete('delete')}
            data-axoview-id="layer-delete-contents"
          >
            {t('deleteLayerDeleteContents')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
