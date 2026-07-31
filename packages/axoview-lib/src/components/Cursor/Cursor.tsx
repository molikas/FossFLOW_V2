import React, { memo, useMemo } from 'react';
import chroma from 'chroma-js';
import { useTheme } from '@mui/material';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import {
  cursorTileResidual,
  isSnappedPlacement
} from 'src/utils/resolvePlacement';
import { getRenderedDragTransform } from 'src/utils/renderedGeometry';

export const Cursor = memo(() => {
  const theme = useTheme();
  const tile = useUiStateStore(
    (state) => state.mouse.position.tile,
    (a, b) => a.x === b.x && a.y === b.y
  );
  const zoom = useUiStateStore((state) => {
    return state.zoom;
  });
  const { strategy } = useCanvasMode();

  // R5/OVL-10: with global snap OFF the ghost stayed on the integer tile while
  // the placement it previews lands at the cursor's SUB-TILE position — so the
  // element appeared up to half a tile from where the outline said it would.
  // Resolved through the same `cursorTileResidual` + `isSnappedPlacement` pair
  // the placement modes use, so the ghost and the commit cannot disagree.
  //
  // (The better shape the entry suggests — have the modes publish the resolved
  // placement to uiState so the ghost renders exactly what will be committed,
  // rather than recomputing it — is deliberately not taken: it means a store
  // write per pointer move on the hot path, which is what the CSS-preview design
  // exists to avoid. Reading the SAME two functions is the cheap half of the
  // guarantee, and a divergence would now require changing one of them.)
  const residual = useUiStateStore(
    (state) => {
      if (isSnappedPlacement(undefined, state.snapToGrid ?? true)) return null;
      if (!state.rendererSize) return null;
      return cursorTileResidual(
        strategy.projectionName,
        state.mouse.position.screen,
        state.mouse.position.tile,
        state.zoom,
        state.scroll,
        state.rendererSize
      );
    },
    (a, b) => a?.x === b?.x && a?.y === b?.y
  );

  const offsetStyle = useMemo(
    () => (residual ? { transform: getRenderedDragTransform(residual) } : null),
    [residual?.x, residual?.y] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const area = (
    <IsoTileArea
      from={tile}
      to={tile}
      // Outline + barely-there fill (was a solid alpha-0.5 diamond). The grid
      // cursor tracks the pointer in select / connector / placement modes, so it
      // must read as "pointer position," never as a placed node — a filled
      // diamond made empty clicks look like they spawned a node. (User feedback.)
      fill={chroma(theme.palette.primary.main).alpha(0.1).css()}
      stroke={{ width: 2, color: theme.palette.primary.main }}
      cornerRadius={10 * zoom}
    />
  );

  // Snapped: no wrapper at all, so the common path is untouched.
  if (!offsetStyle) return area;
  return <div style={offsetStyle}>{area}</div>;
});
