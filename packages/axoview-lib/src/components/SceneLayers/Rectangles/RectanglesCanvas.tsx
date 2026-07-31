import React, { memo, useEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import chroma from 'chroma-js';
import { Coords, Rectangle as RectangleType } from 'src/types';
import { UNPROJECTED_TILE_SIZE } from 'src/config';
import { getColorVariant } from 'src/utils';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useLayerContext } from 'src/hooks/useLayerContext';
import {
  createSpriteBatch,
  SpriteBatch,
  UVRect
} from 'src/webgl/glSpriteBatch';
import { attachContextLossRecovery } from 'src/webgl/contextLoss';
import { computeBackingStore } from 'src/utils/renderTarget';
import { getRenderedAreaCorners } from 'src/utils/renderedGeometry';
import { walkDashes, buildAaLineQuad, AA_FEATHER } from 'src/webgl/lineStyle';

// ---------------------------------------------------------------------------
// RectanglesCanvas — WebGL2 INSTANCED draw of grouping-rectangle FILLS + BORDERS
// (the bulk), replacing the per-rectangle DOM/SVG <Rectangle> for everything not
// currently being DRAGGED. Picking is geometric (getItemAtTile over
// rectangles[].from/to — mapping 2026-07-08), so the bulk needs no DOM; the DOM
// <Rectangles> layer keeps only the dragged rect (its [data-drag-id] element is
// what DragItems mutates for the live move preview) + resize handles are separate
// TransformControls overlays (unaffected). Pan/zoom = one instanced draw (O(1)).
//
// Geometry: the tile rect [from..to] projects to a scene-space parallelogram —
// the same linear iso map getTilePosition uses, so fills line up with nodes and
// connectors. Border widths are scaled to scene space (widthScale) and dashed/
// dotted styles are emitted (shared lineStyle walker), matching the DOM. Only
// corner radius (rounded rects) is still approximated (sharp corners) on the bulk.
// ---------------------------------------------------------------------------

interface Props {
  // Rectangles to draw on the GPU (Renderer excludes the dragged ones).
  rectangles: RectangleType[];
}

const glRGB = (css: string): [number, number, number] => {
  try {
    const [r, g, b] = chroma(css).gl();
    return [r, g, b];
  } catch {
    return [0.5, 0.5, 0.5];
  }
};

export const RectanglesCanvas = memo(({ rectangles }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiApi = useUiStateStoreApi();
  const modelApi = useModelStoreApi();
  const theme = useTheme();
  const { getTilePosition, strategy } = useCanvasMode();
  // Layer visibility (mirrors NodesCanvas / ConnectorsCanvas / LabelsCanvas):
  // the WebGL bulk must skip rects whose layer is hidden, or hiding a layer
  // leaves its rectangles drawn (picking + the DOM layers already honour this).
  const { visibleIds, layers } = useLayerContext();

  const rectsRef = useRef(rectangles);
  const visibleIdsRef = useRef(visibleIds);
  const layersRef = useRef(layers);
  const getTilePosRef = useRef(getTilePosition);
  const isIsoRef = useRef(strategy.projectionName === 'ISOMETRIC');
  rectsRef.current = rectangles;
  visibleIdsRef.current = visibleIds;
  layersRef.current = layers;
  getTilePosRef.current = getTilePosition;
  isIsoRef.current = strategy.projectionName === 'ISOMETRIC';

  const pendingRef = useRef(false);
  const rafIdRef = useRef(0);
  const destroyedRef = useRef(false);
  const geomDirtyRef = useRef(true);
  const scheduleDrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let batch: SpriteBatch | null = createSpriteBatch(canvas, 512);
    if (!batch) {
      // WebGL2 passed the gate probe but the batch failed here (shader/link or
      // context exhaustion). Surface it — the bulk rectangle fills have no fallback.
      console.warn(
        '[RectanglesCanvas] WebGL2 sprite batch unavailable — rectangle fills will not render'
      );
      return;
    }
    // Context-loss recovery: rebuild the batch on restore so a lost GPU context
    // doesn't blank the grouping-rectangle fills permanently.
    let contextLost = false;
    let buildCount = 0; // data-build-count — must stay flat during pan (no CPU/frame)

    const view = () => {
      const ui = uiApi.getState();
      const { scroll, zoom, rendererSize } = ui;
      const W = rendererSize.width;
      const H = rendererSize.height;
      // Clamp the backing store to the canvas caps; the effective dpr feeds both
      // the buffer size and the u_view scale/origin at render (ADR 0038).
      const backing = computeBackingStore(W, H, window.devicePixelRatio || 1);
      return {
        scroll,
        zoom,
        W,
        H,
        dpr: backing.dpr,
        bw: backing.width,
        bh: backing.height
      };
    };

    const buildInstances = (b: SpriteBatch) => {
      const model = modelApi.getState();
      const colorsById = new Map(model.colors.map((c) => [c.id, c.value]));
      const getTilePos = getTilePosRef.current;
      const isIso = isIsoRef.current;
      const white = b.white;
      const dot = b.dot;
      let drawn = 0;

      // Authored widths are UNPROJECTED tile-px; getTilePos returns PROJECTED
      // scene points, so scale border widths by the projection's linear factor
      // (== the DOM's getProjectionCss scale) or they draw ~1/scale too thick.
      const g0 = getTilePos({ tile: { x: 0, y: 0 } });
      const g1 = getTilePos({ tile: { x: 1, y: 0 } });
      const widthScale =
        Math.hypot(g1.x - g0.x, g1.y - g0.y) / UNPROJECTED_TILE_SIZE || 1;

      b.beginInstances();

      // Border edge as an ANALYTIC-AA line quad (shapeMode 1) — crisp at every iso
      // angle/zoom via the shader's fwidth() coverage ramp (§12); buildAaLineQuad
      // fattens by AA_FEATHER for ramp room and reports the true halfWidth.
      const segment = (
        p0: Coords,
        p1: Coords,
        w: number,
        r: number,
        g: number,
        bl: number,
        a: number
      ) => {
        const q = buildAaLineQuad(p0, p1, w, AA_FEATHER);
        b.addSprite(
          q.anchorX,
          q.anchorY,
          q.localOriginX,
          q.localOriginY,
          q.ux,
          q.uy,
          q.vx,
          q.vy,
          white,
          r,
          g,
          bl,
          a,
          0,
          1, // shapeMode: analytic line
          q.halfWidth
        );
      };

      const visibleNow = visibleIdsRef.current;
      const layersNow = layersRef.current;
      for (const rect of rectsRef.current) {
        // Skip rects on a hidden layer. The "draw all" escape hatch keys off
        // whether ANY layer exists — NOT `visibleNow.size`, since an empty set
        // also means "every rect is on a hidden layer" and must stay hidden.
        if (layersNow.length > 0 && !visibleNow.has(rect.id)) continue;
        const fillValue = rect.customColor || colorsById.get(rect.color ?? '');
        // ADR 0039 addendum (STYL-03): absent IS the "no fill" representation
        // now — outline-only, exactly like the legacy `'transparent'` sentinel
        // this still reads. Must agree with the DOM <Rectangle> path.
        const isTransparent = !fillValue || fillValue === 'transparent';
        // ADR 0023 off-grid: the shared vertex math — the DOM <Rectangle> path
        // and this bulk MUST agree on where a rect is drawn (bug #3 lived in
        // exactly that gap), so the corners come from renderedGeometry.
        const [c0, c1, c2, c3] = getRenderedAreaCorners(
          rect.from,
          rect.to,
          rect.offset,
          getTilePos,
          isIso ? 'ISOMETRIC' : '2D'
        );

        // Border metrics (needed BEFORE the fill so the fill can inset away from
        // the stroke — see below). Scale the authored width to scene space
        // (widthScale), then honour the border style — SOLID (four edges + round
        // join dots) or DASHED / DOTTED dash-walked around the closed loop,
        // mirroring the DOM Rectangle strokeDasharray.
        const strokeColor =
          rect.borderColor ||
          (isTransparent
            ? '#9e9e9e'
            : getColorVariant(fillValue, 'dark', { grade: 2 }));
        const strokeW =
          (rect.borderWidth ?? (isTransparent ? 2 : 1)) * widthScale;

        // Fill (skip for an explicit transparent choice — outline only). INSET by
        // half the stroke so the fill's hard edge never lands exactly on the
        // border centreline: a fill edge coincident with the analytic-AA stroke
        // centreline cancels the stroke's coverage on the fill's excluded
        // (bottom/right, per the top-left fill rule) boundary — the "rectangle's
        // bottom border missing in 2D" bug. Insetting mirrors the DOM
        // IsoTileArea, which draws its <rect> inset by halfStroke for the same
        // reason (SVG strokes centre on the path). The stroke still traces the
        // true footprint (c0..c3); only the fill shrinks under it, so there is no
        // visible gap (the stroke covers the seam).
        if (!isTransparent) {
          const [fr, fg, fb] = glRGB(fillValue);
          const uLen = Math.hypot(c1.x - c0.x, c1.y - c0.y) || 1;
          const vLen = Math.hypot(c3.x - c0.x, c3.y - c0.y) || 1;
          // Clamp so a thick border on a small rect can't invert the fill quad
          // (2·ins must stay within each side); at the limit the fill collapses to
          // zero and the stroke fills the footprint, which is the correct look.
          const ins = Math.min(strokeW / 2, uLen / 2, vLen / 2);
          const uhx = (c1.x - c0.x) / uLen;
          const uhy = (c1.y - c0.y) / uLen;
          const vhx = (c3.x - c0.x) / vLen;
          const vhy = (c3.y - c0.y) / vLen;
          b.addSprite(
            c0.x + ins * (uhx + vhx),
            c0.y + ins * (uhy + vhy),
            0,
            0,
            c1.x - c0.x - 2 * ins * uhx,
            c1.y - c0.y - 2 * ins * uhy,
            c3.x - c0.x - 2 * ins * vhx,
            c3.y - c0.y - 2 * ins * vhy,
            white as UVRect,
            fr,
            fg,
            fb,
            rect.fillOpacity ?? 1,
            0
          );
        }

        const [sr, sg, sb] = glRGB(strokeColor);
        const sa = rect.borderOpacity ?? 1;
        const jr = strokeW / 2;
        // Border corner/join as an ANALYTIC-AA disc (shapeMode 2) — crisp round
        // join instead of a mip-softened sampled dot; grown by AA_FEATHER for the
        // radial ramp, thresholded at the true radius jr.
        const capDot = (p: Coords) => {
          const R = jr + AA_FEATHER;
          b.addSprite(
            p.x,
            p.y,
            -R,
            -R,
            2 * R,
            0,
            0,
            2 * R,
            dot,
            sr,
            sg,
            sb,
            sa,
            0,
            2, // shapeMode: analytic disc
            jr
          );
        };
        const borderStyle = rect.borderStyle ?? 'SOLID';
        if (borderStyle === 'DASHED' || borderStyle === 'DOTTED') {
          const loop = [c0, c1, c2, c3, c0];
          const dashLen = borderStyle === 'DASHED' ? strokeW * 3 : strokeW;
          walkDashes(loop, dashLen, strokeW * 2, (p0, p1) => {
            segment(p0, p1, strokeW, sr, sg, sb, sa);
            capDot(p0);
            capDot(p1);
          });
        } else {
          segment(c0, c1, strokeW, sr, sg, sb, sa);
          segment(c1, c2, strokeW, sr, sg, sb, sa);
          segment(c2, c3, strokeW, sr, sg, sb, sa);
          segment(c3, c0, strokeW, sr, sg, sb, sa);
          for (const c of [c0, c1, c2, c3]) capDot(c);
        }

        drawn += 1;
      }

      b.commitInstances();
      canvas.dataset.drawCount = String(drawn);
      canvas.dataset.buildCount = String(++buildCount);
    };

    const drawGLBatch = (b: SpriteBatch) => {
      pendingRef.current = false;
      if (contextLost) return;
      const v = view();
      if (geomDirtyRef.current) {
        buildInstances(b);
        geomDirtyRef.current = false;
      }
      canvas.style.width = `${v.W}px`;
      canvas.style.height = `${v.H}px`;
      const originXDev = (v.W / 2 + v.scroll.position.x) * v.dpr;
      const originYDev = (v.H / 2 + v.scroll.position.y) * v.dpr;
      b.render(v.bw, v.bh, v.zoom * v.dpr, originXDev, originYDev, 1);
    };

    const scheduleDraw = () => {
      if (pendingRef.current || destroyedRef.current) return;
      pendingRef.current = true;
      rafIdRef.current = requestAnimationFrame(() => {
        if (batch) drawGLBatch(batch);
      });
    };
    const drawNow = () => {
      if (destroyedRef.current) return;
      pendingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      if (batch) drawGLBatch(batch);
    };
    destroyedRef.current = false;
    pendingRef.current = false;
    scheduleDrawRef.current = scheduleDraw;

    scheduleDraw();
    const unsubUi = uiApi.subscribe((s, p) => {
      if (
        s.scroll === p.scroll &&
        s.zoom === p.zoom &&
        s.rendererSize === p.rendererSize
      )
        return;
      if (s.scroll !== p.scroll || s.zoom !== p.zoom) drawNow();
      else scheduleDraw();
    });
    const unsubModel = modelApi.subscribe((s, p) => {
      if (s.colors === p.colors) return;
      geomDirtyRef.current = true;
      scheduleDraw();
    });

    const detachLoss = attachContextLossRecovery(canvas, {
      onLost: () => {
        contextLost = true;
      },
      onRestored: () => {
        const rebuilt = createSpriteBatch(canvas, 512);
        if (!rebuilt) return;
        batch = rebuilt;
        contextLost = false;
        geomDirtyRef.current = true;
        drawNow();
      }
    });

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(rafIdRef.current);
      unsubUi();
      unsubModel();
      detachLoss();
      batch?.destroy();
    };
  }, [uiApi, modelApi]);

  useEffect(() => {
    geomDirtyRef.current = true;
    scheduleDrawRef.current();
  }, [rectangles, visibleIds, layers, getTilePosition, strategy.projectionName, theme]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="axoview-rectangles-canvas"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 0
      }}
    />
  );
});
