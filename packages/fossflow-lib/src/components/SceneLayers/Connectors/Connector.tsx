import React, { useMemo, memo } from 'react';
import { useTheme, Box } from '@mui/material';
import { UNPROJECTED_TILE_SIZE, CONNECTOR_DEFAULTS } from 'src/config';
import { getColorVariant, getConnectorDirectionIcon } from 'src/utils';
import { Svg } from 'src/components/Svg/Svg';
import { useIsoProjection } from 'src/hooks/useIsoProjection';
import type { useScene } from 'src/hooks/useScene';
import { useColor } from 'src/hooks/useColor';
import { useSceneStore } from 'src/stores/sceneStore';
import { Connector as ConnectorType } from 'src/types';

interface Props {
  connector: ConnectorType;
  currentView: ReturnType<typeof useScene>['currentView'];
}

export const Connector = memo(({ connector, currentView }: Props) => {
  const theme = useTheme();

  // Subscribe only to this connector's scene data — O(1) per path write instead of O(N).
  const sceneConnector = useSceneStore(
    (state) => state.connectors[connector.id],
    (a, b) => a === b
  );
  const scenePath = sceneConnector?.path;
  const isUnroutable = sceneConnector?.unroutable === true;

  // Merge model connector with defaults and scene path.
  const merged = useMemo(
    () => ({
      ...CONNECTOR_DEFAULTS,
      ...connector,
      ...(scenePath ? { path: scenePath } : {})
    }),
    [connector, scenePath]
  );

  const predefinedColor = useColor(merged.color);

  const color = merged.customColor
    ? { value: merged.customColor }
    : predefinedColor;

  // Skip rendering if path isn't computed yet (deferred async pathfinding).
  const connectorPath = merged.path?.tiles?.length ? merged.path : null;
  const hasTiles = Boolean(connectorPath);

  // All hooks must be called unconditionally before any early return.
  const { css, pxSize } = useIsoProjection(
    connectorPath
      ? connectorPath.rectangle
      : { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } }
  );

  const drawOffset = useMemo(
    () => ({
      x: UNPROJECTED_TILE_SIZE / 2,
      y: UNPROJECTED_TILE_SIZE / 2
    }),
    []
  );

  const connectorWidthPx = useMemo(() => {
    return (UNPROJECTED_TILE_SIZE / 100) * merged.width;
  }, [merged.width]);

  const pathString = useMemo(() => {
    if (!hasTiles) return '';
    return connectorPath!.tiles.reduce((acc: string, tile) => {
      return `${acc} ${tile.x * UNPROJECTED_TILE_SIZE + drawOffset.x},${
        tile.y * UNPROJECTED_TILE_SIZE + drawOffset.y
      }`;
    }, '');
  }, [connectorPath?.tiles, drawOffset, hasTiles]);

  const offsetPaths = useMemo(() => {
    if (!hasTiles) return null;
    if (!merged.lineType || merged.lineType === 'SINGLE') return null;

    const tiles = connectorPath!.tiles;
    if (tiles.length < 2) return null;

    const offset = connectorWidthPx * 3;
    const path1Points: string[] = [];
    const path2Points: string[] = [];

    for (let i = 0; i < tiles.length; i++) {
      const curr = tiles[i];
      let dx = 0,
        dy = 0;

      if (i > 0 && i < tiles.length - 1) {
        const prev = tiles[i - 1];
        const next = tiles[i + 1];
        const dx1 = curr.x - prev.x;
        const dy1 = curr.y - prev.y;
        const dx2 = next.x - curr.x;
        const dy2 = next.y - curr.y;
        const avgDx = (dx1 + dx2) / 2;
        const avgDy = (dy1 + dy2) / 2;
        const len = Math.sqrt(avgDx * avgDx + avgDy * avgDy) || 1;
        dx = -avgDy / len;
        dy = avgDx / len;
      } else if (i === 0 && tiles.length > 1) {
        const next = tiles[1];
        const dirX = next.x - curr.x;
        const dirY = next.y - curr.y;
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        dx = -dirY / len;
        dy = dirX / len;
      } else if (i === tiles.length - 1 && tiles.length > 1) {
        const prev = tiles[i - 1];
        const dirX = curr.x - prev.x;
        const dirY = curr.y - prev.y;
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        dx = -dirY / len;
        dy = dirX / len;
      }

      const x = curr.x * UNPROJECTED_TILE_SIZE + drawOffset.x;
      const y = curr.y * UNPROJECTED_TILE_SIZE + drawOffset.y;

      path1Points.push(`${x + dx * offset},${y + dy * offset}`);
      path2Points.push(`${x - dx * offset},${y - dy * offset}`);
    }

    return { path1: path1Points.join(' '), path2: path2Points.join(' ') };
  }, [
    connectorPath?.tiles,
    merged.lineType,
    connectorWidthPx,
    drawOffset,
    hasTiles
  ]);

  const directionIcon = useMemo(() => {
    if (!hasTiles) return null;
    return getConnectorDirectionIcon(connectorPath!.tiles);
  }, [connectorPath?.tiles, hasTiles]);

  const strokeDashArray = useMemo(() => {
    switch (merged.style) {
      case 'DASHED':
        return `${connectorWidthPx * 2}, ${connectorWidthPx * 2}`;
      case 'DOTTED':
        return `0, ${connectorWidthPx * 1.8}`;
      case 'SOLID':
      default:
        return 'none';
    }
  }, [merged.style, connectorWidthPx]);

  // Don't render until path is available or if color is missing.
  // Exception: unroutable connectors render as a visible error indicator.
  if (!color || (!hasTiles && !isUnroutable)) {
    return null;
  }

  if (isUnroutable) {
    return (
      <Box
        data-testid="connector-unroutable"
        title="This connector could not be routed. Try moving the connected nodes."
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 40,
          height: 8,
          transform: 'translate(-50%,-50%)',
          border: '2px dashed #e53935',
          borderRadius: 1,
          opacity: 0.8
        }}
      />
    );
  }

  const lineType = merged.lineType || 'SINGLE';

  return (
    <Box data-testid="connector-path" style={css}>
      <Svg style={{ transform: 'scale(-1, 1)' }} viewboxSize={pxSize}>
        {lineType === 'SINGLE' ? (
          <>
            <polyline
              points={pathString}
              stroke={theme.palette.common.white}
              strokeWidth={connectorWidthPx * 1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.7}
              strokeDasharray={strokeDashArray}
              fill="none"
            />
            <polyline
              points={pathString}
              stroke={getColorVariant(color.value, 'dark', { grade: 1 })}
              strokeWidth={connectorWidthPx}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={strokeDashArray}
              fill="none"
            />
          </>
        ) : offsetPaths ? (
          <>
            <polyline
              points={offsetPaths.path1}
              stroke={theme.palette.common.white}
              strokeWidth={connectorWidthPx * 1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.7}
              strokeDasharray={strokeDashArray}
              fill="none"
            />
            <polyline
              points={offsetPaths.path1}
              stroke={getColorVariant(color.value, 'dark', { grade: 1 })}
              strokeWidth={connectorWidthPx}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={strokeDashArray}
              fill="none"
            />
            <polyline
              points={offsetPaths.path2}
              stroke={theme.palette.common.white}
              strokeWidth={connectorWidthPx * 1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.7}
              strokeDasharray={strokeDashArray}
              fill="none"
            />
            <polyline
              points={offsetPaths.path2}
              stroke={getColorVariant(color.value, 'dark', { grade: 1 })}
              strokeWidth={connectorWidthPx}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={strokeDashArray}
              fill="none"
            />
          </>
        ) : null}

        {lineType === 'DOUBLE_WITH_CIRCLE' &&
          connectorPath!.tiles.length >= 2 &&
          (() => {
            const midIndex = Math.floor(connectorPath!.tiles.length / 2);
            const midTile = connectorPath!.tiles[midIndex];
            const x = midTile.x * UNPROJECTED_TILE_SIZE + drawOffset.x;
            const y = midTile.y * UNPROJECTED_TILE_SIZE + drawOffset.y;

            let rotation = 0;
            if (midIndex > 0 && midIndex < connectorPath!.tiles.length - 1) {
              const prevTile = connectorPath!.tiles[midIndex - 1];
              const nextTile = connectorPath!.tiles[midIndex + 1];
              const dx = nextTile.x - prevTile.x;
              const dy = nextTile.y - prevTile.y;
              rotation = Math.atan2(dy, dx) * (180 / Math.PI);
            }

            const circleRadiusX = connectorWidthPx * 5;
            const circleRadiusY = connectorWidthPx * 4;

            return (
              <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
                <ellipse
                  cx={0}
                  cy={0}
                  rx={circleRadiusX}
                  ry={circleRadiusY}
                  fill="none"
                  stroke={getColorVariant(color.value, 'dark', { grade: 1 })}
                  strokeWidth={connectorWidthPx * 0.8}
                />
                <ellipse
                  cx={0}
                  cy={0}
                  rx={circleRadiusX}
                  ry={circleRadiusY}
                  fill="none"
                  stroke={theme.palette.common.white}
                  strokeWidth={connectorWidthPx * 1.2}
                  strokeOpacity={0.5}
                />
              </g>
            );
          })()}

        {directionIcon && merged.showArrow !== false && (
          <g transform={`translate(${directionIcon.x}, ${directionIcon.y})`}>
            <g transform={`rotate(${directionIcon.rotation})`}>
              <polygon
                fill="black"
                stroke={theme.palette.common.white}
                strokeWidth={4}
                points="17.58,17.01 0,-17.01 -17.58,17.01"
              />
            </g>
          </g>
        )}
      </Svg>
    </Box>
  );
});
