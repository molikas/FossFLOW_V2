// Higher-level rendering utilities: mouse position, project bounds, fit-to-view.
// Low-level coordinate math lives in isoMath.ts.
// Hit detection lives in hitDetection.ts.
//
// Barrel re-exports from both sub-modules so that existing
// `import { X } from 'src/utils/renderer'` call sites continue to work.

export * from 'src/utils/isoMath';
export * from 'src/utils/hitDetection';

import {
  PROJECT_BOUNDING_BOX_PADDING,
  MAX_ZOOM,
  MIN_ZOOM
} from 'src/config';
import { Coords, Size, Scroll, Mouse, SlimMouseEvent, View } from 'src/types';
import { CoordsUtils } from 'src/utils/coordsUtils';
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
  getTextBoxEndTile
} from 'src/utils/isoMath';

// Type alias for a mode-aware getTilePosition function.
// Callers (hooks/components) inject this from CanvasModeContext; pure utilities
// default to the isometric implementation for backward compatibility.
export type TilePositionFn = (args: {
  tile: Coords;
  origin?: import('src/types').TileOrigin;
}) => Coords;

// Type alias for a mode-aware screenToTile function.
export type ScreenToTileFn = (args: {
  mouse: Coords;
  zoom: number;
  scroll: Scroll;
  rendererSize: Size;
}) => Coords;

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
  /** Injected by the caller from CanvasModeContext. Defaults to isometric. */
  screenToTileFn?: ScreenToTileFn;
}

export const getMouse = ({
  interactiveElement,
  zoom,
  scroll,
  lastMouse,
  mouseEvent,
  rendererSize,
  screenToTileFn = screenToIso
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
    tile: screenToTileFn({ mouse: mousePosition, zoom, scroll, rendererSize })
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
    // R1/PROJ-01: this used to add `{x: size.width, y: size.height}` — but a
    // text box grows DOWNWARD in tile space, to `tile.y − (height − 1)`, which
    // is what `getTextBoxEndTile` (the selection/hit-test authority) computes.
    // Adding the height instead of subtracting it put the frame on the wrong
    // side of the anchor: a 6-row box at y=0 gave lowY=−3 / highY=+9, so its own
    // rows were OUTSIDE the frame and six empty tiles above it were inside, and
    // the miss grew 1:1 with the row count. Both consumers — fit-to-view and
    // the image export — framed the wrong region. Reading the same helper the
    // hit-test reads is what stops the two drifting again.
    const size = getTextBoxDimensions(textBox);
    return [...acc, textBox.tile, getTextBoxEndTile(textBox, size)];
  }, []);

  // R1/PROJ-02: floating Labels (ADR 0031) were enumerated nowhere here, so a
  // Label dragged clear of the item bounds sat outside fit-to-view and outside
  // the exported image entirely — measured 37 tiles outside a 6-tile frame.
  const labelTiles = (view.labels ?? []).map((label) => label.tile);

  let allTiles = [
    ...itemTiles,
    ...connectorTiles,
    ...rectangleTiles,
    ...textBoxTiles,
    ...labelTiles
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

export const getVisualBounds = (
  view: View,
  getTilePositionFn: TilePositionFn = getTilePosition,
  padding = 50
) => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  view.items.forEach((item) => {
    const pos = getTilePositionFn({ tile: item.tile });
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
      const pos = getTilePositionFn({ tile: globalTile });
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    });
  });

  (view.textBoxes ?? []).forEach((textBox) => {
    const pos = getTilePositionFn({ tile: textBox.tile });
    const size = getTextBoxDimensions(textBox);
    const endTile = CoordsUtils.add(textBox.tile, {
      x: size.width,
      y: size.height
    });
    const endPos = getTilePositionFn({ tile: endTile });
    minX = Math.min(minX, pos.x, endPos.x);
    maxX = Math.max(maxX, pos.x, endPos.x);
    minY = Math.min(minY, pos.y, endPos.y);
    maxY = Math.max(maxY, pos.y, endPos.y);
  });

  (view.rectangles ?? []).forEach((rectangle) => {
    const fromPos = getTilePositionFn({ tile: rectangle.from });
    const toPos = getTilePositionFn({ tile: rectangle.to });
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

export const getUnprojectedBounds = (
  view: View,
  getTilePositionFn: TilePositionFn = getTilePosition
) => {
  const projectBounds = getProjectBounds(view);
  const cornerPositions = projectBounds.map((corner) =>
    getTilePositionFn({ tile: corner })
  );
  const sortedCorners = sortByPosition(cornerPositions);
  const topLeft = { x: sortedCorners.lowX, y: sortedCorners.lowY };
  // R1/PROJ-04: this used to call `getBoundingBoxSize`, which adds the inclusive
  // TILE-COUNT `+1` — correct for tiles, wrong here, because `cornerPositions`
  // are PIXELS. The reported project width/height were each exactly 1 px too
  // large and the error propagated into the fit-to-view zoom. It is the same
  // unit-mix `getFitToViewParams` already fixed for the centre and not for the
  // size. A pixel extent is `high − low`, full stop.
  return {
    width: sortedCorners.highX - sortedCorners.lowX,
    height: sortedCorners.highY - sortedCorners.lowY,
    x: topLeft.x,
    y: topLeft.y
  };
};

export const getFitToViewParams = (
  view: View,
  viewportSize: Size,
  getTilePositionFn: TilePositionFn = getTilePosition
) => {
  const projectBounds = getProjectBounds(view);
  const sortedCornerPositions = sortByPosition(projectBounds);
  const unprojectedBounds = getUnprojectedBounds(view, getTilePositionFn);
  // R4/RND-01: the lower bound was 0, so a large diagram fitted to a zoom every
  // other path refuses — the zoom buttons, the wheel and the pinch all clamp to
  // MIN_ZOOM — and the canvas ended up somewhere the UI could not have taken it.
  //
  // The product question the clamp does not answer, decided and stated here: a
  // diagram too large to fit at MIN_ZOOM IS framed with content off-screen. Fit
  // means "get as close to the whole thing as the zoom range allows", not "make
  // the zoom range bigger" — a content-dependent MIN_ZOOM for this one path
  // would let fit reach a zoom the user then cannot return to, because every
  // other control still clamps at MIN_ZOOM.
  const zoom = clamp(
    Math.min(
      viewportSize.width / unprojectedBounds.width,
      viewportSize.height / unprojectedBounds.height
    ),
    MIN_ZOOM,
    MAX_ZOOM
  );

  // Compute scroll using the mode-aware getTilePositionFn so that 2D mode
  // centres correctly. The previous approach passed a zoom-scaled tile coord
  // into the ISO-hardcoded getTileScrollPosition, which worked for ISO (where
  // a single node at {0,0} cancels the x-term) but produced a wrong offset for
  // 2D when the diagram centre is not at {0,0}.
  // Bounding-box MIDPOINT in tile space via (low + high) / 2 — NOT low + size/2:
  // getBoundingBoxSize adds +1 (inclusive tile COUNT), which biases the centre
  // by half a tile and mis-centres the fit. Dormant while fit-to-view was a
  // no-op; once fit actually moves the view the diagram lands half a tile off,
  // and a centre-anchored click then misses the node it should land on.
  const centerTile: Coords = {
    x: (sortedCornerPositions.lowX + sortedCornerPositions.highX) / 2,
    y: (sortedCornerPositions.lowY + sortedCornerPositions.highY) / 2
  };
  const centerScreenPos = getTilePositionFn({ tile: centerTile });
  // `+ 0` normalises a negative zero (when a centre component is exactly 0) to
  // +0 — otherwise a later `scroll.x + 0` pan flips it and trips strict
  // Object.is comparisons (e.g. e2e `toBe(0)` after an ArrowUp that leaves x
  // unchanged). No effect on any non-zero value.
  const scroll: Coords = {
    x: -centerScreenPos.x * zoom + 0,
    y: -centerScreenPos.y * zoom + 0
  };

  return { zoom, scroll };
};
