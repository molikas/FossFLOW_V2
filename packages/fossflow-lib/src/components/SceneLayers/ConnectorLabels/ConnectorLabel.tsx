import React, { useMemo, memo } from 'react';
import { Box, Typography } from '@mui/material';
import { useSceneStore } from 'src/stores/sceneStore';
import {
  connectorPathTileToGlobal,
  getConnectorLabels,
  getLabelTileIndex
} from 'src/utils';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { PROJECTED_TILE_SIZE, UNPROJECTED_TILE_SIZE } from 'src/config';
import { Label } from 'src/components/Label/Label';
import { Connector, ConnectorLabel as ConnectorLabelType } from 'src/types';

interface Props {
  connector: Connector;
}

export const ConnectorLabel = memo(({ connector }: Props) => {
  // Subscribe only to this connector's path — same pattern as Connector.tsx (Fix A).
  const scenePath = useSceneStore(
    (state) => state.connectors[connector.id]?.path,
    (a, b) => a === b
  );
  const { getTilePosition } = useCanvasMode();

  const labels = useMemo(() => getConnectorLabels(connector), [connector]);

  const labelPositions = useMemo(() => {
    if (!scenePath?.tiles?.length) return [];

    return labels
      .map((label) => {
        const tileIndex = getLabelTileIndex(
          scenePath.tiles.length,
          label.position
        );
        const tile = scenePath.tiles[tileIndex];
        if (!tile) return null;

        let position = getTilePosition({
          tile: connectorPathTileToGlobal(tile, scenePath.rectangle.from)
        });

        const lineType = connector.lineType || 'SINGLE';
        if (
          (lineType === 'DOUBLE' || lineType === 'DOUBLE_WITH_CIRCLE') &&
          label.line === '2'
        ) {
          const { tiles } = scenePath;
          if (tileIndex > 0 && tileIndex < tiles.length - 1) {
            const prev = tiles[tileIndex - 1];
            const next = tiles[tileIndex + 1];
            const dx = next.x - prev.x;
            const dy = next.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const connectorWidthPx =
              (UNPROJECTED_TILE_SIZE / 100) * (connector.width || 15);
            const offset = connectorWidthPx * 3;
            const perpX = -dy / len;
            const perpY = dx / len;
            position = {
              x: position.x - perpX * offset,
              y: position.y - perpY * offset
            };
          }
        }

        return { label, position };
      })
      .filter(
        (
          item
        ): item is {
          label: ConnectorLabelType;
          position: { x: number; y: number };
        } => item !== null
      );
  }, [labels, scenePath, connector.lineType, connector.width, getTilePosition]);

  return (
    <>
      {labelPositions.map(({ label, position }) => (
        <Box
          key={label.id}
          sx={{ position: 'absolute', pointerEvents: 'none' }}
          style={{
            maxWidth: PROJECTED_TILE_SIZE.width,
            left: position.x,
            top: position.y
          }}
        >
          <Label
            maxWidth={150}
            labelHeight={label.height || 0}
            showLine={label.showLine !== false}
            sx={{
              py: 0.75,
              px: 1,
              borderRadius: 2,
              backgroundColor: 'background.paper',
              opacity: 0.95
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: 400,
                color: label.labelColor || 'text.primary',
                ...(label.fontSize ? { fontSize: `${label.fontSize}px` } : {})
              }}
            >
              {label.text}
            </Typography>
          </Label>
        </Box>
      ))}
    </>
  );
});
