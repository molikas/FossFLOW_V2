// Higher-level rendering utilities: mouse position, project bounds, fit-to-view.
// Low-level coordinate math lives in isoMath.ts.
// Hit detection lives in hitDetection.ts.
//
// Barrel re-exports from both sub-modules so that existing
// `import { X } from 'src/utils/renderer'` call sites continue to work.

export * from 'src/utils/isoMath';
export * from 'src/utils/hitDetection';

import {
  UNPROJECTED_TILE_SIZE,
  PROJECT_BOUNDING_BOX_PADDING,
  MAX_ZOOM
} from 'src/config';
import { Coords, Size, Scroll, Mouse, SlimMouseEvent, View } from 'src/types';
import { CoordsUtils } from 'src/utils/CoordsUtils';
import { SizeUtils } from 'src/utils/SizeUtils';
import { clamp } from 'src/utils/common';
import {
  screenToIso,
  getTilePosition,
  getBoundingBox,
  getBoundingBoxSize,
  sortByPosition,
  getConnectorPath,
  connectorPathTileToGlobal,
  getTextBoxDimensions,
  getTileScrollPosition
} from 'src/utils/isoMath';

// ---------------------------------------------------------------------------
// Mouse position
// ---------------------------------------------------------------------------

interface GetMouse {
  interactiveElement: HTMLElement;
  zoom: number;
  scroll: Scroll;
  lastMouse: Mouse;
  mouseEvent: SlimMouseEvent;
  rendererSize: Size;
}

export const getMouse = ({
  interactiveElement,
  zoom,
  scroll,
  lastMouse,
  mouseEvent,
  rendererSize
}: GetMouse): Mouse => {
  const componentOffset = interactiveElement.getBoundingClientRect();
  const offset: Coords = {
    x: componentOffset?.left ?? 0,
    y: componentOffset?.top ?? 0
  };

  const { clientX, clientY } = mouseEvent;
  const mousePosition = { x: clientX - offset.x, y: clientY - offset.y };

  const newPosition: Mouse['position'] = {
    screen: mousePosition,
    tile: screenToIso({ mouse: mousePosition, zoom, scroll, rendererSize })
  };

  const newDelta: Mouse['delta'] = {
    screen: CoordsUtils.subtract(newPosition.screen, lastMouse.position.screen),
    tile: CoordsUtils.subtract(newPosition.tile, lastMouse.position.tile)
  };

  const getMousedown = (): Mouse['mousedown'] => {
    switch (mouseEvent.type) {
      case 'mousedown':
        return newPosition;
      case 'mousemove':
        return lastMouse.mousedown;
      default:
        return null;
    }
  };

  return { position: newPosition, delta: newDelta, mousedown: getMousedown() };
};

// ---------------------------------------------------------------------------
// Project bounds (tile-space bounding of all view content)
// ---------------------------------------------------------------------------

export const getProjectBounds = (
  view: View,
  padding = PROJECT_BOUNDING_BOX_PADDING
): Coords[] => {
  const itemTiles = view.items.map((item) => item.tile);

  const connectors = view.connectors ?? [];
  const connectorTiles = connectors.reduce<Coords[]>((acc, connector) => {
    const path = getConnectorPath({ anchors: connector.anchors, view });
    return [...acc, path.rectangle.from, path.rectangle.to];
  }, []);

  const rectangles = view.rectangles ?? [];
  const rectangleTiles = rectangles.reduce<Coords[]>((acc, rectangle) => {
    return [...acc, rectangle.from, rectangle.to];
  }, []);

  const textBoxes = view.textBoxes ?? [];
  const textBoxTiles = textBoxes.reduce<Coords[]>((acc, textBox) => {
    const size = getTextBoxDimensions(textBox);
    return [
      ...acc,
      textBox.tile,
      CoordsUtils.add(textBox.tile, { x: size.width, y: size.height })
    ];
  }, []);

  let allTiles = [
    ...itemTiles,
    ...connectorTiles,
    ...rectangleTiles,
    ...textBoxTiles
  ];

  if (allTiles.length === 0) {
    const centerTile = CoordsUtils.zero();
    allTiles = [centerTile, centerTile, centerTile, centerTile];
  }

  return getBoundingBox(allTiles, { x: padding, y: padding });
};

// ---------------------------------------------------------------------------
// Visual bounds (screen-space, for export/fit-to-view)
// ---------------------------------------------------------------------------

export const getVisualBounds = (view: View, padding = 50) => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  view.items.forEach((item) => {
    const pos = getTilePosition({ tile: item.tile });
    const itemSize = 50;
    minX = Math.min(minX, pos.x - itemSize / 2);
    maxX = Math.max(maxX, pos.x + itemSize / 2);
    minY = Math.min(minY, pos.y - itemSize / 2);
    maxY = Math.max(maxY, pos.y + itemSize / 2);
  });

  (view.connectors ?? []).forEach((connector) => {
    const path = getConnectorPath({ anchors: connector.anchors, view });
    path.tiles.forEach((tile) => {
      const globalTile = connectorPathTileToGlobal(tile, path.rectangle.from);
      const pos = getTilePosition({ tile: globalTile });
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    });
  });

  (view.textBoxes ?? []).forEach((textBox) => {
    const pos = getTilePosition({ tile: textBox.tile });
    const size = getTextBoxDimensions(textBox);
    const endTile = CoordsUtils.add(textBox.tile, {
      x: size.width,
      y: size.height
    });
    const endPos = getTilePosition({ tile: endTile });
    minX = Math.min(minX, pos.x, endPos.x);
    maxX = Math.max(maxX, pos.x, endPos.x);
    minY = Math.min(minY, pos.y, endPos.y);
    maxY = Math.max(maxY, pos.y, endPos.y);
  });

  (view.rectangles ?? []).forEach((rectangle) => {
    const fromPos = getTilePosition({ tile: rectangle.from });
    const toPos = getTilePosition({ tile: rectangle.to });
    minX = Math.min(minX, fromPos.x, toPos.x);
    maxX = Math.max(maxX, fromPos.x, toPos.x);
    minY = Math.min(minY, fromPos.y, toPos.y);
    maxY = Math.max(maxY, fromPos.y, toPos.y);
  });

  if (minX === Infinity) return { x: 0, y: 0, width: 200, height: 200 };

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2
  };
};

// ---------------------------------------------------------------------------
// Fit-to-view calculation
// ---------------------------------------------------------------------------

export const getUnprojectedBounds = (view: View) => {
  const projectBounds = getProjectBounds(view);
  const cornerPositions = projectBounds.map((corner) =>
    getTilePosition({ tile: corner })
  );
  const sortedCorners = sortByPosition(cornerPositions);
  const topLeft = { x: sortedCorners.lowX, y: sortedCorners.lowY };
  const size = getBoundingBoxSize(cornerPositions);
  return { width: size.width, height: size.height, x: topLeft.x, y: topLeft.y };
};

export const getFitToViewParams = (view: View, viewportSize: Size) => {
  const projectBounds = getProjectBounds(view);
  const sortedCornerPositions = sortByPosition(projectBounds);
  const boundingBoxSize = getBoundingBoxSize(projectBounds);
  const unprojectedBounds = getUnprojectedBounds(view);
  const zoom = clamp(
    Math.min(
      viewportSize.width / unprojectedBounds.width,
      viewportSize.height / unprojectedBounds.height
    ),
    0,
    MAX_ZOOM
  );
  const scrollTarget: Coords = {
    x: (sortedCornerPositions.lowX + boundingBoxSize.width / 2) * zoom,
    y: (sortedCornerPositions.lowY + boundingBoxSize.height / 2) * zoom
  };
  const scroll = getTileScrollPosition(scrollTarget);
  return { zoom, scroll };
};
