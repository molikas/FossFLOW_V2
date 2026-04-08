import React, { useCallback, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Divider,
  Stack
} from '@mui/material';
import { AddOutlined, DeleteOutlineOutlined } from '@mui/icons-material';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { useLayerActions } from 'src/hooks/useLayerActions';
import { LayerRow } from './LayerRow';
import { generateId } from 'src/utils';

export const LayersPanel = () => {
  const { layers, itemCountByLayerId, unassignedCount } = useLayerContext();
  const { createLayer, updateLayer, deleteLayer, reorderLayers } = useLayerActions();
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  // Layers displayed top-to-bottom = highest order first (top layer shown at top of list).
  const sortedLayers = [...layers].sort((a, b) => b.order - a.order);

  const handleAddLayer = useCallback(() => {
    createLayer({ name: `Layer ${layers.length + 1}` });
  }, [createLayer, layers.length]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedLayerId) return;
    deleteLayer(selectedLayerId);
    setSelectedLayerId(null);
  }, [deleteLayer, selectedLayerId]);

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
        setDragState((s) => s ? { ...s, overId: layerId } : null);
      }
    },
    [dragState]
  );

  const handleDragEnd = useCallback(() => {
    if (!dragState || !dragState.overId) {
      setDragState(null);
      return;
    }
    // Build new order: remove dragId from position, insert before overI
    const ids = sortedLayers.map((l) => l.id);
    const fromIdx = ids.indexOf(dragState.dragId);
    const toIdx = ids.indexOf(dragState.overId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const reordered = [...ids];
      reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, dragState.dragId);
      // Reverse because sortedLayers is top→bottom (highest order first)
      reorderLayers([...reordered].reverse());
    }
    setDragState(null);
  }, [dragState, sortedLayers, reorderLayers]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0
      }}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 1.5, py: 1, flexShrink: 0 }}
      >
        <Typography variant="caption" fontWeight={600} color="text.secondary">
          LAYERS
        </Typography>
        <Stack direction="row" spacing={0.25}>
          <Tooltip title="Add layer" placement="top">
            <IconButton size="small" onClick={handleAddLayer} sx={{ p: 0.5 }}>
              <AddOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete selected layer" placement="top">
            <span>
              <IconButton
                size="small"
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

      {/* Layer list — scrollable */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 0.5, py: 0.5 }}>
        {sortedLayers.length === 0 ? (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', textAlign: 'center', mt: 2 }}
          >
            No layers yet. Click + to add one.
          </Typography>
        ) : (
          <>
            {sortedLayers.map((layer) => (
              <Box
                key={layer.id}
                onMouseEnter={() => dragState && handleDragOver(layer.id)}
                sx={{
                  outline:
                    dragState?.overId === layer.id
                      ? '2px solid'
                      : 'none',
                  outlineColor: 'primary.main',
                  borderRadius: 1
                }}
              >
                <LayerRow
                  layer={layer}
                  isSelected={selectedLayerId === layer.id}
                  itemCount={itemCountByLayerId.get(layer.id) ?? 0}
                  onSelect={setSelectedLayerId}
                  onToggleVisible={handleToggleVisible}
                  onToggleLocked={handleToggleLocked}
                  onRename={handleRename}
                  onDelete={deleteLayer}
                  dragHandleProps={{
                    onMouseDown: (e) => {
                      e.preventDefault();
                      handleDragStart(layer.id);
                    }
                  }}
                />
              </Box>
            ))}
            {unassignedCount > 0 && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ display: 'block', px: 0.5, pt: 0.5, fontSize: '0.65rem' }}
              >
                {unassignedCount} unassigned
              </Typography>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};
