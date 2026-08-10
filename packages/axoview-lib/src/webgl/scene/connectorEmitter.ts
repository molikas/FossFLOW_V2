import { Connector, Coords } from 'src/types';
import { CONNECTOR_DEFAULTS, UNPROJECTED_TILE_SIZE } from 'src/config';
import { connectorPathTileToGlobal } from 'src/utils/isoMath';
import { getColorVariant } from 'src/utils';
import { TilePositionFn } from 'src/utils/renderedGeometry';
import { SpriteBatch, UVRect } from 'src/webgl/glSpriteBatch';
import {
  walkDots,
  walkDashes,
  buildAaLineQuad,
  AA_FEATHER
} from 'src/webgl/lineStyle';
import { glRGB } from 'src/webgl/scene/glColor';

// ---------------------------------------------------------------------------
// Connector BODIES (halo + core polyline, round joins, DOUBLE offset paths,
// mid-path ellipse ring, arrowhead) for the merged bulk canvas (ADR 0038 §8).
//
// Lifted verbatim out of the pre-merge `ConnectorsCanvas.buildInstances`. This
// is the layer §2(a) called "the hard part" of the merge, on the grounds that
// interleaving it into a global sort means its draws can no longer be one
// contiguous batch. §8's measurement 1 settled that structurally: `render()`
// issues one draw per ATLAS PAGE run, and every instance emitted here samples the
// page-wildcard white/dot texels, so a connector never opens a run of its own
// however it interleaves.
//
// Picking stays geometric (getItemAtTile over hitConnectors); the DOM
// <Connectors> layer keeps only the sparse hybrid.
// ---------------------------------------------------------------------------

/** A scene-store connector path, as `ConnectorsCanvas` consumed it. */
export interface ScenePath {
  path?: { tiles: Coords[]; rectangle: { from: Coords } };
  unroutable?: boolean;
}

export interface ConnectorEmitterInput {
  batch: SpriteBatch;
  colorsById: Map<string, string>;
  scenePaths: Record<string, ScenePath | undefined>;
  /**
   * ADR 0023 addendum D (R1/PROJ-12): item id → SceneLayer-px residual, for the
   * endpoints anchored to an off-grid node. Empty when the diagram is all-snapped.
   */
  offsetByItemId: Map<string, Coords>;
  getTilePos: TilePositionFn;
  arrowUV: UVRect;
  ringUV: UVRect;
  /**
   * Connectors that are currently selected.
   *
   * S3/A2's selection halo used to come free with the DOM promotion: a selected
   * connector was lifted into the DOM `<Connector>`, which drew the accent
   * polyline. Order-preserving selection (ADR 0038 §8) took that promotion away —
   * with one merged canvas, a promoted element can only paint above or below the
   * WHOLE bulk — so the halo is emitted here instead, in the connector's own
   * place in the paint order.
   */
  selectedIds: ReadonlySet<string>;
  /** `TRANSFORM_CONTROLS_COLOR` — the selection accent, as the DOM halo uses. */
  selectionColor: string;
}

export interface ConnectorEmitter {
  /** Emits the connector's geometry; false when it has no drawable path. */
  emit(connector: Connector): boolean;
}

export const createConnectorEmitter = ({
  batch: b,
  colorsById,
  scenePaths,
  offsetByItemId,
  getTilePos,
  arrowUV,
  ringUV,
  selectedIds,
  selectionColor
}: ConnectorEmitterInput): ConnectorEmitter => {
  const dot = b.dot;
  const white = b.white;
  const [selR, selG, selB] = glRGB(selectionColor);

  // A thick segment p0→p1 of width w, tinted (r,g,b,a), as an ANALYTIC-AA line
  // quad (shapeMode 1): the shader thresholds against the true halfWidth for a
  // crisp ~1px edge at every iso angle/zoom.
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
  // A round cap/join disc of radius rad at p (shapeMode 2, analytic).
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

  // Authored widths are UNPROJECTED tile-px; the scene points getTilePos returns
  // are PROJECTED, so a raw width draws ~1/scale too thick.
  const o0 = getTilePos({ tile: { x: 0, y: 0 } });
  const o1 = getTilePos({ tile: { x: 1, y: 0 } });
  const oY = getTilePos({ tile: { x: 0, y: 1 } });
  const widthScale =
    Math.hypot(o1.x - o0.x, o1.y - o0.y) / UNPROJECTED_TILE_SIZE || 1;
  // The projection's 2×2 linear map L (tile→scene), probed from unit tile steps.
  // Used to iso-shear the arrow onto the ground plane; in 2D L is a scaled
  // identity, so the arrow stays an un-sheared square there automatically.
  const La = o1.x - o0.x;
  const Lb = o1.y - o0.y;
  const Lc = oY.x - o0.x;
  const Ld = oY.y - o0.y;
  // Arrow size in TILE units — 40 unprojected px, projected through L per
  // connector so it foreshortens with direction like the DOM ground-plane arrow.
  const arrowTileSize = 40 / UNPROJECTED_TILE_SIZE;

  // A parallel copy of `poly` offset by `sign * off` along each vertex's normal —
  // mirrors the DOM <Connector> offsetPaths for DOUBLE / DOUBLE_WITH_CIRCLE.
  const offsetPolyline = (
    poly: Coords[],
    off: number,
    sign: number
  ): Coords[] => {
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
        const len =
          Math.hypot(poly[1].x - poly[0].x, poly[1].y - poly[0].y) || 1;
        nx = -(poly[1].y - poly[0].y) / len;
        ny = (poly[1].x - poly[0].x) / len;
      } else if (i === n - 1 && n > 1) {
        const len =
          Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y) || 1;
        nx = -(poly[i].y - poly[i - 1].y) / len;
        ny = (poly[i].x - poly[i - 1].x) / len;
      }
      out.push({
        x: poly[i].x + sign * nx * off,
        y: poly[i].y + sign * ny * off
      });
    }
    return out;
  };

  // Draw one polyline (halo or core pass) honouring the connector `style`. Dash
  // metrics use `unit` (the core width) so halo + core dashes align, matching the
  // DOM's shared strokeDasharray.
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
      for (let i = 0; i < poly.length; i++) cap(poly[i], rad, r, g, bl, a);
    }
  };

  return {
    emit(connector) {
      const scene = scenePaths[connector.id];
      const path = scene?.path;
      if (!path?.tiles || path.tiles.length < 2 || scene?.unroutable) {
        return false;
      }

      const pts = path.tiles.map((t) =>
        getTilePos({ tile: connectorPathTileToGlobal(t, path.rectangle.from) })
      );

      // PROJ-12: shift the FIRST/LAST vertex by its anchored node's residual.
      // Routing stays integer-tile (the path is untouched); only the endpoints
      // move, exactly as the DOM path does it.
      if (offsetByItemId.size > 0 && pts.length >= 2) {
        const anchors = connector.anchors;
        const startOffset = offsetByItemId.get(anchors[0]?.ref?.item ?? '');
        const endOffset = offsetByItemId.get(
          anchors[anchors.length - 1]?.ref?.item ?? ''
        );
        if (startOffset) {
          pts[0] = { x: pts[0].x + startOffset.x, y: pts[0].y + startOffset.y };
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
      // getColorVariant 'dark' derivation) — a single source so the WebGL bulk
      // can't drift, and so the achromatic-grey guard applies on both paths.
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
      // S3/A2 selection halo — a wide, semi-transparent accent stroke UNDER the
      // connector so a selected connector reads clearly in a dense diagram.
      // Painted first (lowest) along the centreline; covers SINGLE and DOUBLE
      // alike, and always SOLID — the same geometry and the same 3.5×/0.35
      // metrics the DOM `<Connector>` halo uses, moved here because selection no
      // longer promotes the connector out of the bulk.
      if (selectedIds.has(connector.id)) {
        drawStyledLine(pts, w * 3.5, 'SOLID', w, selR, selG, selB, 0.35);
      }

      const polylines =
        lineType === 'SINGLE'
          ? [pts]
          : [offsetPolyline(pts, w * 3, 1), offsetPolyline(pts, w * 3, -1)];
      for (const poly of polylines) {
        // White halo UNDER the coloured core; both honour the dash style.
        drawStyledLine(poly, haloW, style, w, 1, 1, 1, 0.7);
        drawStyledLine(poly, w, style, w, cr, cg, cb, 1);
      }

      // DOUBLE_WITH_CIRCLE: an ellipse ring at the mid-path tile, rotated to the
      // local direction (rx=5w, ry=4w — the DOM radii, projected).
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

      // Arrowhead at the second-to-last point, aimed along the last segment. The
      // basis is the iso-projection of that segment's GROUND-PLANE frame, so the
      // GPU (unselected) and DOM (selected) arrows share one silhouette. White
      // tint preserves the sprite's baked black fill + white outline.
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
      return true;
    }
  };
};
