import { useMemo } from 'react';
import { Coords, Size, ProjectionOrientationEnum } from 'src/types';
import { getBoundingBox } from 'src/utils';
import { UNPROJECTED_TILE_SIZE } from 'src/config';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';

interface Props {
  from: Coords;
  to: Coords;
  originOverride?: Coords;
  orientation?: keyof typeof ProjectionOrientationEnum;
}

export const useIsoProjection = ({
  from,
  to,
  originOverride,
  orientation
}: Props): {
  css: React.CSSProperties;
  position: Coords;
  gridSize: Size;
  pxSize: Size;
} => {
  const { getTilePosition, getProjectionCss, strategy } = useCanvasMode();

  const gridSize = useMemo(() => {
    return {
      width: Math.abs(from.x - to.x) + 1,
      height: Math.abs(from.y - to.y) + 1
    };
  }, [from, to]);

  const origin = useMemo(() => {
    if (originOverride) return originOverride;

    const boundingBox = getBoundingBox([from, to]);

    return boundingBox[3];
  }, [from, to, originOverride]);

  const position = useMemo(() => {
    if (strategy.projectionName === '2D') {
      // In 2D mode (inverted Y), origin = {x: lowX, y: highY} is the tile
      // whose screen position is the TOP-LEFT of the element area.
      // We need the top-left CORNER of that tile: center − (halfW, halfH).
      const center = getTilePosition({ tile: origin });
      return {
        x: center.x - UNPROJECTED_TILE_SIZE / 2,
        y: center.y - UNPROJECTED_TILE_SIZE / 2
      };
    }
    return getTilePosition({
      tile: origin,
      origin: orientation === 'Y' ? 'TOP' : 'LEFT'
    });
  }, [strategy.projectionName, getTilePosition, origin, orientation]);

  const pxSize = useMemo(() => {
    return {
      width: gridSize.width * UNPROJECTED_TILE_SIZE,
      height: gridSize.height * UNPROJECTED_TILE_SIZE
    };
  }, [gridSize]);

  const projectionCss = getProjectionCss(orientation);

  return useMemo(
    () => ({
      css: {
        position: 'absolute' as const,
        left: position.x,
        top: position.y,
        width: `${pxSize.width}px`,
        height: `${pxSize.height}px`,
        ...(projectionCss ? { transform: projectionCss } : {}),
        transformOrigin: 'top left'
      },
      position,
      gridSize,
      pxSize
    }),
    [position, pxSize, gridSize, projectionCss]
  );
};
