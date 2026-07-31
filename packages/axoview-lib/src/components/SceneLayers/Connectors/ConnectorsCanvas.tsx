import React, { memo, useEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import chroma from 'chroma-js';
import { Connector, Coords } from 'src/types';
import { CONNECTOR_DEFAULTS, UNPROJECTED_TILE_SIZE } from 'src/config';
import { connectorPathTileToGlobal } from 'src/utils/isoMath';
import { getColorVariant } from 'src/utils';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useLayerContext } from 'src/hooks/useLayerContext';
import {
  createSpriteBatch,
  SpriteBatch,
  UVRect
} from 'src/webgl/glSpriteBatch';
import { attachContextLossRecovery } from 'src/webgl/contextLoss';
import { computeBackingStore } from 'src/utils/renderTarget';
import { walkDots, walkDashes, buildAaLineQuad, AA_FEATHER } from 'src/webgl/lineStyle';

// ---------------------------------------------------------------------------
// ConnectorsCanvas — WebGL2 INSTANCED draw of the connector BODIES (halo + core
// polyline, round joins, arrowhead), replacing the per-connector DOM/SVG
// <Connector> for the BULK. Picking stays geometric (getItemAtTile over
// hitConnectors — mapping 2026-07-08), so removing the visible SVG doesn't touch
// selection; the DOM <Connectors> layer now renders only the sparse hybrid set
// (selected + degenerate-dot + unroutable — which own the selection halo / dot /
// error visuals). Pan/zoom = one uniform + one instanced draw (O(1) CPU).
//
// Geometry: each path tile → scene point via getTilePosition(
// connectorPathTileToGlobal(...)) — the SAME space ConnectorLabel resolves, so
// bodies and labels line up. Each segment is a tinted quad (white texel); round
// joins/caps are dots at each vertex; the arrow is a packed sprite.
//
// Styles (2026-07-08): the full DOM matrix is emitted here — `style`
// DASHED/DOTTED (dash-walked over the polyline) and `lineType`
// DOUBLE / DOUBLE_WITH_CIRCLE (two offset polylines + a mid-path ellipse ring),
// mirroring the DOM <Connector> geometry so the unselected bulk matches the
// selected DOM promotion. Widths are authored in UNPROJECTED tile-px and scaled
// to scene space by `widthScale` (the projection's linear factor) so GPU strokes
// are the same thickness as the DOM's projected strokes, not ~1.22× too thick.
// ---------------------------------------------------------------------------

interface Props {
  // The connectors to draw on the GPU (the bulk — Renderer excludes the hybrid
  // set: selected + degenerate + unroutable, which stay DOM).
  connectors: Connector[];
}

// A right-pointing arrowhead sprite (+x), black fill + white outline — mirrors
// the DOM connector arrow polygon. Rotated per-connector to the last segment.
const makeArrowCanvas = (): HTMLCanvasElement => {
  const S = 64;
  const cnv = document.createElement('canvas');
  cnv.width = S;
  cnv.height = S;
  const ctx = cnv.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  // Triangle pointing +x: apex at (right, mid), base on the left.
  ctx.beginPath();
  ctx.moveTo(S * 0.92, S * 0.5);
  ctx.lineTo(S * 0.12, S * 0.12);
  ctx.lineTo(S * 0.12, S * 0.88);
  ctx.closePath();
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = S * 0.11;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  return cnv;
};

// Parse a css colour to a WebGL [r,g,b] triple (0..1), memo-free (called only on
// a geometry rebuild). Falls back to mid-grey on a parse miss.
const glRGB = (css: string): [number, number, number] => {
  try {
    const [r, g, b] = chroma(css).gl();
    return [r, g, b];
  } catch {
    return [0.5, 0.5, 0.5];
  }
};

// An ellipse-outline sprite (white, tintable) for the DOUBLE_WITH_CIRCLE marker.
const makeRingCanvas = (): HTMLCanvasElement => {
  const S = 64;
  const cnv = document.createElement('canvas');
  cnv.width = S;
  cnv.height = S;
  const ctx = cnv.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#ffffff';
  const lw = S * 0.1;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.ellipse(S / 2, S / 2, S / 2 - lw, S / 2 - lw, 0, 0, Math.PI * 2);
  ctx.stroke();
  return cnv;
};

// A parallel copy of `poly` offset by `sign * off` along each vertex's normal —
// mirrors the DOM <Connector> offsetPaths (averaged interior normals, endpoint
// direction at the ends) for DOUBLE / DOUBLE_WITH_CIRCLE, computed in scene space.
const offsetPolyline = (poly: Coords[], off: number, sign: number): Coords[] => {
  const n = poly.length;
  const out: Coords[] = [];
  for (let i = 0; i < n; i++) {
    let nx = 0;
    let ny = 0;
    if (i > 0 && i < n - 1) {
      const avgDx = (poly[i + 1].x - poly[i - 1].x) / 2;
      const avgDy = (poly[i + 1].y - poly[i - 1].y) / 2;
      const len = Math.hypot(avgDx, avgDy) || 1;
      nx = -avgDy / len;
      ny = avgDx / len;
    } else if (i === 0 && n > 1) {
      const len = Math.hypot(poly[1].x - poly[0].x, poly[1].y - poly[0].y) || 1;
      nx = -(poly[1].y - poly[0].y) / len;
      ny = (poly[1].x - poly[0].x) / len;
    } else if (i === n - 1 && n > 1) {
      const len =
        Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y) || 1;
      nx = -(poly[i].y - poly[i - 1].y) / len;
      ny = (poly[i].x - poly[i - 1].x) / len;
    }
    out.push({ x: poly[i].x + sign * nx * off, y: poly[i].y + sign * ny * off });
  }
  return out;
};

export const ConnectorsCanvas = memo(({ connectors }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiApi = useUiStateStoreApi();
  const modelApi = useModelStoreApi();
  const sceneApi = useSceneStoreApi();
  const theme = useTheme();
  const { getTilePosition } = useCanvasMode();
  const { visibleIds, layers } = useLayerContext();

  const connectorsRef = useRef(connectors);
  const getTilePosRef = useRef(getTilePosition);
  const visibleIdsRef = useRef<ReadonlySet<string>>(visibleIds);
  const layersRef = useRef(layers);
  connectorsRef.current = connectors;
  getTilePosRef.current = getTilePosition;
  visibleIdsRef.current = visibleIds;
  layersRef.current = layers;

  const pendingRef = useRef(false);
  const rafIdRef = useRef(0);
  const destroyedRef = useRef(false);
  const geomDirtyRef = useRef(true);
  const scheduleDrawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Bodies need only the white + dot + arrow texels → a tiny atlas.
    let batch: SpriteBatch | null = createSpriteBatch(canvas, 512);
    if (!batch) {
      // WebGL2 passed the gate probe but the batch failed here (shader/link or
      // context exhaustion). Surface it — the bulk connector bodies have no DOM
      // fallback; only the sparse selected/degenerate/unroutable hybrid is DOM.
      console.warn(
        '[ConnectorsCanvas] WebGL2 sprite batch unavailable — connector bodies will not render'
      );
      return;
    }
    let arrowUV: UVRect =
      batch.putCanvas('__arrow__', 0, makeArrowCanvas) ?? batch.white;
    let ringUV: UVRect =
      batch.putCanvas('__ring__', 0, makeRingCanvas) ?? batch.white;
    // Context-loss recovery: rebuild the batch (+ re-pack the arrow/ring sprites,
    // whose UVs are captured outside buildInstances) on restore, so a lost GPU
    // context doesn't blank the connector bodies permanently.
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
      const scenePaths = sceneApi.getState().connectors;
      const colorsById = new Map(model.colors.map((c) => [c.id, c.value]));
      // R1/PROJ-12 (ADR 0023 addendum D): an endpoint anchored to an OFF-GRID
      // node must render at the node's drawn position, not its bare tile. The
      // DOM `<Connector>` does this through `connectorEndpointVertexDelta`,
      // which had exactly one caller — this path mapped every tile straight
      // through the projection and never read a view item's `offset`. Because
      // `Renderer.connectorHybridIds` promotes a connector to the DOM path the
      // moment it is SELECTED, selecting a connector attached to an off-grid
      // node moved its endpoint by the full residual (41.6 px for a (37,−19)
      // offset) — the wire visibly jumped at the node.
      //
      // No conversion is needed here, unlike the DOM path: these points are
      // already SceneLayer px (`getTilePosition` output) and `offset` is a
      // SceneLayer-px residual, so composing it is the plain vector add
      // `renderedGeometry` documents. The map is built only from items that
      // actually carry a residual, so an all-snapped diagram pays nothing.
      const activeViewId = uiApi.getState().view;
      const offsetByItemId = new Map<string, { x: number; y: number }>();
      for (const it of model.views.find((v) => v.id === activeViewId)?.items ??
        []) {
        if (it.offset) offsetByItemId.set(it.id, it.offset);
      }
      const getTilePos = getTilePosRef.current;
      const visible = visibleIdsRef.current;
      const layersNow = layersRef.current;
      const dot = b.dot;
      const white = b.white;
      let drawn = 0;

      b.beginInstances();

      // A thick segment from p0→p1 of width w, tinted (r,g,b,a). Emitted as an
      // ANALYTIC-AA line quad (shapeMode 1): buildAaLineQuad fattens the stroke by
      // AA_FEATHER on each side so the shader's fwidth() coverage ramp has room,
      // and reports the true halfWidth the fragment thresholds against — a crisp
      // ~1px edge at every iso angle/zoom (the `uv` arg is ignored in line mode).
      const segment = (
        p0: Coords,
        p1: Coords,
        w: number,
        uv: UVRect,
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
          uv,
          r,
          g,
          bl,
          a,
          0,
          1, // shapeMode: analytic line
          q.halfWidth
        );
      };
      // A round cap/join disc of radius rad at p. ANALYTIC-AA (shapeMode 2): the
      // quad is grown by AA_FEATHER so the radial coverage ramp isn't clipped; the
      // fragment thresholds at the true `rad` (the `dot` sprite is now unused here,
      // so the round joins are crisp instead of a mip-softened sampled circle).
      const cap = (
        p: Coords,
        rad: number,
        r: number,
        g: number,
        bl: number,
        a: number
      ) => {
        const R = rad + AA_FEATHER;
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
          r,
          g,
          bl,
          a,
          0,
          2, // shapeMode: analytic disc
          rad
        );
      };

      // Authored widths are UNPROJECTED tile-px; the scene points getTilePos
      // returns are PROJECTED, so a raw width draws ~1/scale too thick. Measure
      // the projection's linear factor from one tile step (== the DOM's
      // getProjectionCss scale; correct for iso AND 2D).
      const o0 = getTilePos({ tile: { x: 0, y: 0 } });
      const o1 = getTilePos({ tile: { x: 1, y: 0 } });
      const oY = getTilePos({ tile: { x: 0, y: 1 } });
      const widthScale =
        Math.hypot(o1.x - o0.x, o1.y - o0.y) / UNPROJECTED_TILE_SIZE || 1;
      // The projection's 2×2 linear map L (tile→scene), probed from unit tile
      // steps: L·(1,0) = (La,Lb), L·(0,1) = (Lc,Ld). Used to iso-shear the arrow
      // onto the ground plane below; in 2D L is a scaled identity, so the arrow
      // stays an un-sheared square there automatically.
      const La = o1.x - o0.x;
      const Lb = o1.y - o0.y;
      const Lc = oY.x - o0.x;
      const Ld = oY.y - o0.y;
      // Arrow size in TILE units — 40 unprojected px, projected through L per
      // connector so it foreshortens with direction like the DOM ground-plane
      // arrow (matches the current on-screen size for axis-aligned segments).
      const arrowTileSize = 40 / UNPROJECTED_TILE_SIZE;

      // Draw one polyline (halo or core pass) honouring the connector `style`.
      // Dash metrics use `unit` (the core width) so halo + core dashes align,
      // matching the DOM's shared strokeDasharray.
      const drawStyledLine = (
        poly: Coords[],
        lineW: number,
        style: string,
        unit: number,
        r: number,
        g: number,
        bl: number,
        a: number
      ) => {
        const rad = lineW / 2;
        if (style === 'DOTTED') {
          walkDots(poly, unit * 1.8, (p) => cap(p, rad, r, g, bl, a));
        } else if (style === 'DASHED') {
          walkDashes(poly, unit * 2, unit * 2, (p0, p1) => {
            segment(p0, p1, lineW, white, r, g, bl, a);
            cap(p0, rad, r, g, bl, a);
            cap(p1, rad, r, g, bl, a);
          });
        } else {
          for (let i = 0; i < poly.length - 1; i++)
            segment(poly[i], poly[i + 1], lineW, white, r, g, bl, a);
          for (let i = 0; i < poly.length; i++)
            cap(poly[i], rad, r, g, bl, a);
        }
      };

      for (const connector of connectorsRef.current) {
        // Escape hatch keys off whether ANY layer exists — an empty `visible`
        // set also means "every connector is on a hidden layer" (stay hidden).
        if (layersNow.length > 0 && !visible.has(connector.id)) continue;
        const scene = scenePaths[connector.id];
        const path = scene?.path;
        if (!path?.tiles || path.tiles.length < 2 || scene?.unroutable)
          continue;

        const pts = path.tiles.map((t) =>
          getTilePos({
            tile: connectorPathTileToGlobal(t, path.rectangle.from)
          })
        );

        // PROJ-12: shift the FIRST/LAST vertex by its anchored node's residual.
        // Routing stays integer-tile (the path is untouched); only the endpoints
        // move, exactly as the DOM path does it. `tiles[0] ↔ anchors[0]`,
        // `tiles[last] ↔ anchors[last]`; non-item endpoints get no shift.
        if (offsetByItemId.size > 0 && pts.length >= 2) {
          const anchors = connector.anchors;
          const startOffset = offsetByItemId.get(
            anchors[0]?.ref?.item ?? ''
          );
          const endOffset = offsetByItemId.get(
            anchors[anchors.length - 1]?.ref?.item ?? ''
          );
          if (startOffset) {
            pts[0] = {
              x: pts[0].x + startOffset.x,
              y: pts[0].y + startOffset.y
            };
          }
          if (endOffset) {
            const last = pts.length - 1;
            pts[last] = {
              x: pts[last].x + endOffset.x,
              y: pts[last].y + endOffset.y
            };
          }
        }

        const colorValue =
          connector.customColor ||
          colorsById.get(connector.color ?? '') ||
          '#9e9e9e';
        // Mirror the DOM connector stroke (Connector.tsx uses the same
        // getColorVariant 'dark' derivation) — a single source so the WebGL
        // bulk can't drift, and so the achromatic-grey guard (no warm tint on
        // greyscale connectors) applies on both paths.
        const [cr, cg, cb] = glRGB(
          getColorVariant(colorValue, 'dark', { grade: 1 })
        );
        const style = connector.style ?? 'SOLID';
        const lineType = connector.lineType ?? 'SINGLE';
        const w =
          widthScale * (connector.width ?? CONNECTOR_DEFAULTS.width ?? 15);
        const haloW = w * 1.4;

        // SINGLE → the centreline; DOUBLE(_WITH_CIRCLE) → two parallel offset
        // polylines (±3w), mirroring the DOM offsetPaths.
        const polylines =
          lineType === 'SINGLE'
            ? [pts]
            : [offsetPolyline(pts, w * 3, 1), offsetPolyline(pts, w * 3, -1)];
        for (const poly of polylines) {
          // White halo UNDER the coloured core; both honour the dash style.
          drawStyledLine(poly, haloW, style, w, 1, 1, 1, 0.7);
          drawStyledLine(poly, w, style, w, cr, cg, cb, 1);
        }

        // DOUBLE_WITH_CIRCLE: an ellipse ring at the mid-path tile, rotated to
        // the local direction (rx=5w, ry=4w — the DOM radii, projected).
        if (lineType === 'DOUBLE_WITH_CIRCLE' && pts.length >= 2) {
          const midIndex = Math.floor(pts.length / 2);
          const mid = pts[midIndex];
          let dirx = 1;
          let diry = 0;
          if (midIndex > 0 && midIndex < pts.length - 1) {
            const pr = pts[midIndex - 1];
            const nx = pts[midIndex + 1];
            const l = Math.hypot(nx.x - pr.x, nx.y - pr.y) || 1;
            dirx = (nx.x - pr.x) / l;
            diry = (nx.y - pr.y) / l;
          }
          const ring = (
            rx: number,
            ry: number,
            r: number,
            g: number,
            bl: number,
            a: number
          ) => {
            const ux2 = dirx * rx * 2;
            const uy2 = diry * rx * 2;
            const vx2 = -diry * ry * 2;
            const vy2 = dirx * ry * 2;
            b.addSprite(
              mid.x,
              mid.y,
              -(ux2 + vx2) / 2,
              -(uy2 + vy2) / 2,
              ux2,
              uy2,
              vx2,
              vy2,
              ringUV,
              r,
              g,
              bl,
              a,
              0
            );
          };
          ring(w * 5 * 1.12, w * 4 * 1.12, 1, 1, 1, 0.7); // white halo behind
          ring(w * 5, w * 4, cr, cg, cb, 1); // dark ring
        }

        // Arrowhead at the second-to-last point, aimed along the last segment
        // (mirrors getConnectorDirectionIcon's tiles[length-2] convention). White
        // tint (1,1,1,1) preserves the sprite's baked black fill + white outline,
        // so the arrow stays visible on a dark line (a black tint blacked it out).
        //
        // The basis is the iso-projection of the last segment's GROUND-PLANE frame:
        // the pointing direction g and its perpendicular h are taken in UNPROJECTED
        // tile space, then BOTH mapped through L. This shears the arrow onto the iso
        // ground plane exactly like the DOM <Connector> arrow (authored unprojected,
        // then run through the iso CSS matrix). The previous code built an
        // orthonormal SCENE-space basis — a screen-facing billboard that did not
        // foreshorten with the rest of the scene, which read as "deformed".
        if (connector.showArrow !== false && pts.length >= 2) {
          const nTiles = path.tiles.length;
          const gA = connectorPathTileToGlobal(
            path.tiles[nTiles - 2],
            path.rectangle.from
          );
          const gB = connectorPathTileToGlobal(
            path.tiles[nTiles - 1],
            path.rectangle.from
          );
          let gx = gB.x - gA.x;
          let gy = gB.y - gA.y;
          const gLen = Math.hypot(gx, gy) || 1;
          gx /= gLen; // ground-plane pointing unit
          gy /= gLen;
          const hx = -gy; // ground-plane perpendicular unit
          const hy = gx;
          const aux = (La * gx + Lc * gy) * arrowTileSize; // L·g·size (sheared u)
          const auy = (Lb * gx + Ld * gy) * arrowTileSize;
          const avx = (La * hx + Lc * hy) * arrowTileSize; // L·h·size (sheared v)
          const avy = (Lb * hx + Ld * hy) * arrowTileSize;
          const tip = pts[pts.length - 2];
          b.addSprite(
            tip.x,
            tip.y,
            -(aux + avx) / 2,
            -(auy + avy) / 2,
            aux,
            auy,
            avx,
            avy,
            arrowUV,
            1,
            1,
            1,
            1,
            0
          );
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
    // Pan/zoom → render only; scene-path/color changes → rebuild geometry.
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
    const unsubScene = sceneApi.subscribe((s, p) => {
      if (s.connectors === p.connectors) return;
      geomDirtyRef.current = true;
      scheduleDraw();
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
        arrowUV =
          rebuilt.putCanvas('__arrow__', 0, makeArrowCanvas) ?? rebuilt.white;
        ringUV =
          rebuilt.putCanvas('__ring__', 0, makeRingCanvas) ?? rebuilt.white;
        contextLost = false;
        geomDirtyRef.current = true;
        drawNow();
      }
    });

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(rafIdRef.current);
      unsubUi();
      unsubScene();
      unsubModel();
      detachLoss();
      batch?.destroy();
    };
  }, [uiApi, modelApi, sceneApi]);

  useEffect(() => {
    geomDirtyRef.current = true;
    scheduleDrawRef.current();
  }, [connectors, visibleIds, layers, getTilePosition, theme]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="axoview-connectors-canvas"
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
