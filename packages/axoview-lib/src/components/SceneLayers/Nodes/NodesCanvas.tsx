import React, { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { ViewItem, Icon, Layer, ModelItem } from 'src/types';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  DEFAULT_FONT_FAMILY,
  DEFAULT_ICON,
  TOMBSTONE_ICON
} from 'src/config';
import {
  LABEL_BASE_FONT_PX,
  LABEL_MIN_READABLE_PX,
  LABEL_MAX_COUNTER_SCALE,
  isNodeLabelDrawn
} from 'src/config/labelSettings';
import { computeLabelCounterScale } from 'src/utils/labelScale';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useLayerContext } from 'src/hooks/useLayerContext';
import { resolveRenderOrder } from 'src/utils/renderOrder';
import { decodeHtmlEntities } from 'src/utils/htmlToPlainText';
import { isLabelVisibleInPreview } from 'src/utils/previewLabelVisibility';
import { LABEL_LINK_COLOR } from 'src/utils/labelChip';
import { createSpriteBatch, SpriteBatch } from 'src/webgl/glSpriteBatch';
import { attachContextLossRecovery } from 'src/webgl/contextLoss';
import { rasterizeNodeChip, CHIP_SUPERSAMPLE } from 'src/webgl/itemRaster';
import { computeBackingStore } from 'src/utils/renderTarget';
import { getRenderedTilePosition } from 'src/utils/renderedGeometry';

// ---------------------------------------------------------------------------
// NodesCanvas — WebGL2 INSTANCED bulk draw of the node layer (icon sprite +
// name-chip + stalk), replacing the per-node React DOM subtree (~14 elements ×
// N) with one GPU-composited <canvas> and — the heroic step — ONE instanced
// draw call for the whole layer.
//
// The previous per-quad spike re-emitted every quad's device-space
// corners on the CPU every frame and re-uploaded a vertex buffer; because each
// chip is a unique content-keyed texture, painter's-order batching flushed a
// draw call PER node. That made pan/zoom O(N) on the CPU — the wall at scale.
//
// This path (glSpriteBatch) instead:
//   • packs every icon + chip + the stalk dot into ONE mipmapped texture atlas;
//   • stores each quad's geometry in TILE space (anchor + local basis vectors
//     that bake the isometric shear + atlas UV + tint + counter-scale flag),
//     uploaded ONCE per scene change (buildInstances — all the per-node CPU
//     work: getTilePosition, chip raster, atlas packing);
//   • computes every corner's screen position in the VERTEX SHADER from a single
//     view uniform (zoom·dpr, device origin) + counter-scale uniform.
// So pan/zoom = one uniform write + one drawArraysInstanced call, O(1) on the
// CPU at any N — the property that scales the layer to tens of thousands of
// nodes. buildInstances runs only when the SCENE changes (nodes / model / theme
// / projection / the label LOD band); navigation never rebuilds.
//
// WebGL2 is required — it is the sole render substrate (Phase C). A browser
// without it is gated upstream by the Renderer's WebGLUnsupportedScreen and
// never mounts this component, so a SpriteBatch is always available here.
//
// DRAW-ONLY. Hit-testing/selection/drag stay in the stores + the invisible
// `canvas-interactions` box. The hybrid keeps DOM for the selected/editing
// node's live label (skipNodes), unchanged.
//
// Transform model (unchanged): the SceneLayer CSS is translate(scroll)
// scale(zoom) about the renderer centre. The GL path mirrors it, mapping
// tile-space point (tx,ty) → device px as
//   ((zoom·tx + W/2 + scroll.x)·dpr, (zoom·ty + H/2 + scroll.y)·dpr)
// entirely in the shader (u_view = (zoom·dpr, origin_x·dpr, origin_y·dpr)).
// ---------------------------------------------------------------------------

interface Props {
  nodes: ViewItem[];
  // Nodes lifted into a DOM <Node> overlay by the hybrid (the selected node) —
  // skipped here so they aren't drawn twice. Referentially stable (empty list
  // when nothing is selected), so the redraw effect below only fires on an
  // actual selection change.
  skipNodes?: ViewItem[];
}

// Label chip geometry that the DOM path (Label.tsx) reads from the live MUI
// theme is derived from the SAME theme here (see `chipStyleRef` in the component)
// rather than hardcoded — otherwise retuning theme.shape.borderRadius / spacing
// would silently desync the canvas chip from the DOM chip.
interface ChipStyle {
  radius: number; // theme.shape.borderRadius × 2  (sx borderRadius: 2)
  padX: number; // theme.spacing(1.5)
  padY: number; // theme.spacing(1)
  bg: string; // palette.common.white
  border: string; // palette.grey[400]
  text: string; // palette.text.primary
}
// Label chip layout — mirrors ExpandableLabel/Label: maxWidth 250 (inner = 250 −
// 2·padX). Option A: the on-canvas label is the node's `name` only.
const LABEL_CHIP_MAX_W = 250;
const PROJ_W = PROJECTED_TILE_SIZE.width;
// Icons are downscaled to this max atlas dimension (px) so a large source SVG
// can't blow the atlas; the on-screen icon quad is sized from PROJ_W regardless,
// so this only caps the sampled texture resolution (icons are small on screen).
const ICON_ATLAS_CAP = 256;
// R3/GPU-01/03: how many times a failing icon url is re-requested before the
// layer gives up on it. Bounded on both sides deliberately — zero retries cached
// a TRANSIENT failure (one 503) as permanent for the session, and unbounded
// retries would re-request a dead reference on every geometry rebuild.
const MAX_ICON_LOAD_ATTEMPTS = 3;

// D3-2: per-node label layout, measured once and reused across pan/zoom redraws.
interface LabelLayout {
  nameFont: string;
  nameLineH: number;
  chipW: number;
  chipH: number;
}
// Shared empty skip-set so an unselected scene reuses one Set instance.
const EMPTY_SKIP: Set<string> = new Set();

// theme.spacing(n) returns a px string (e.g. "9px"); the canvas needs the number.
const spacingPx = (v: string | number): number =>
  typeof v === 'number' ? v : parseFloat(v);

// Fixed iso projection matrix (X-orientation) — mirrors getProjectionCss / the
// NonIsometricIcon transform.
const ISO: [number, number, number, number, number, number] = [
  0.707, -0.409, 0.707, 0.409, 0, -0.816
];

const resolveIcon = (
  iconId: string | undefined,
  iconsById: Map<string, Icon>
): Icon => {
  if (!iconId) return DEFAULT_ICON;
  return iconsById.get(iconId) ?? TOMBSTONE_ICON;
};

// Sprite height from the source aspect ratio; guards naturalWidth === 0.
const iconHeight = (img: HTMLImageElement, w: number): number =>
  img.naturalWidth > 0 ? (img.naturalHeight / img.naturalWidth) * w : w;

// Compute the node-name text/chip layout.
const measureNodeLabel = (
  ctx: CanvasRenderingContext2D,
  name: string,
  fontSize: number,
  bold: boolean,
  italic: boolean,
  chip: ChipStyle
): LabelLayout => {
  const innerMaxW = LABEL_CHIP_MAX_W - chip.padX * 2;
  const nameFont = `${italic ? 'italic ' : ''}${
    bold ? 700 : 600
  } ${fontSize}px ${DEFAULT_FONT_FAMILY}`;
  const nameLineH = fontSize * 1.5;
  ctx.font = nameFont;
  const nameW = ctx.measureText(name).width;
  const innerW = Math.min(innerMaxW, nameW);
  return {
    nameFont,
    nameLineH,
    chipW: innerW + chip.padX * 2,
    chipH: nameLineH + chip.padY * 2
  };
};

export const NodesCanvas = memo(({ nodes, skipNodes }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiApi = useUiStateStoreApi();
  const modelApi = useModelStoreApi();
  const theme = useTheme();
  const { getTilePosition, strategy } = useCanvasMode();
  const { layers, visibleIds } = useLayerContext();

  const nodesRef = useRef(nodes);
  const layersRef = useRef(layers);
  const visibleIdsRef = useRef(visibleIds);
  const getTilePositionRef = useRef(getTilePosition);
  const projectionRef = useRef(strategy.projectionName);
  const skipIdsRef = useRef<Set<string>>(new Set());
  const chipStyleRef = useRef<ChipStyle>({
    radius: 0,
    padX: 0,
    padY: 0,
    bg: '',
    border: '',
    text: ''
  });
  nodesRef.current = nodes;
  layersRef.current = layers;
  visibleIdsRef.current = visibleIds;
  getTilePositionRef.current = getTilePosition;
  projectionRef.current = strategy.projectionName;
  skipIdsRef.current =
    skipNodes && skipNodes.length > 0
      ? new Set(skipNodes.map((n) => n.id))
      : EMPTY_SKIP;
  chipStyleRef.current = {
    radius: (theme.shape.borderRadius as number) * 2,
    padX: spacingPx(theme.spacing(1.5)),
    padY: spacingPx(theme.spacing(1)),
    bg: theme.palette.common.white,
    border: theme.palette.grey[400],
    text: theme.palette.text.primary
  };

  // Icon-bitmap cache: one HTMLImageElement per icon URL. In the GL path it seeds
  // the per-url atlas entry on first build. An icon is only used once it is in
  // `decodedRef` — `complete`/`onload` do NOT guarantee the bitmap is ready for a
  // GPU texSubImage2D upload, and uploading a not-yet-decoded image bakes a BLACK
  // atlas tile on some drivers (icons render black until a later redraw). The
  // black tile is then cached by url forever, so the gate must be `decode()`.
  const iconCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const decodedRef = useRef<Set<string>>(new Set());
  // Failed icon loads, url → attempt count (R3/GPU-01, GPU-03).
  //
  // "Failed" is a THIRD state, distinct from decoded and from pending: a pending
  // url holds the readiness flag down, a failed one does not — that is the half
  // that stops one dangling reference disabling `data-all-icons-drawn` for the
  // session. The count bounds the retry: `markFailed` drops the cache entry so
  // the next geometry rebuild re-requests (GPU-03's transient 503 recovers),
  // but a permanently dead url is not re-requested on every rebuild forever.
  const failedRef = useRef<Map<string, number>>(new Map());
  const pendingRef = useRef(false);
  const rafIdRef = useRef(0);
  const destroyedRef = useRef(false);
  // GL geometry is rebuilt only when the SCENE changes; navigation renders with
  // the cached instance buffer. This ref flags a needed rebuild.
  const geomDirtyRef = useRef(true);
  const scheduleDrawRef = useRef<() => void>(() => {});
  const drawNowRef = useRef<() => void>(() => {});

  // ST-4: painter's-order sort cache.
  const sortCacheRef = useRef<{
    nodes: ViewItem[] | null;
    layers: Layer[] | null;
    visibleIds: ReadonlySet<string> | null;
    skipIds: ReadonlySet<string> | null;
    sorted: ViewItem[];
  }>({
    nodes: null,
    layers: null,
    visibleIds: null,
    skipIds: null,
    sorted: []
  });

  // D3-1: id→item / id→icon lookup cache.
  const itemMapCacheRef = useRef<{
    items: ModelItem[] | null;
    icons: Icon[] | null;
    itemsById: Map<string, ModelItem>;
    iconsById: Map<string, Icon>;
  }>({ items: null, icons: null, itemsById: new Map(), iconsById: new Map() });

  // D3-2: text-layout cache, keyed by the content that determines it.
  const labelLayoutCacheRef = useRef<Map<string, LabelLayout>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // WebGL2 is required (Phase C): a browser without it is gated upstream by the
    // Renderer's WebGLUnsupportedScreen and never mounts this component, so
    // createSpriteBatch is expected to succeed here.
    // 8192² atlas: chips + icons for the whole node layer (verified to hold the
    // fit-to-view harness's ~1000 simultaneous readable chips).
    // Cap the atlas at 4096 on high-DPR/mobile (dpr>=2): an 8192² RGBA atlas is
    // ~268MB up front — too heavy for integrated/mobile GPUs. 4096² is ~67MB and
    // still holds a viewport-culled scene's readable chips. glSpriteBatch clamps
    // to MAX_TEXTURE_SIZE on top of this.
    const atlasSize =
      typeof window !== 'undefined' && window.devicePixelRatio >= 2
        ? 4096
        : 8192;
    let batch: SpriteBatch | null = createSpriteBatch(canvas, atlasSize);
    if (!batch) {
      // WebGL2 passed the gate probe but a real batch couldn't be built here
      // (shader/link/atlas-alloc failure, or context exhaustion). Surface it
      // rather than silently drawing nothing into a blank canvas.
      console.warn(
        '[NodesCanvas] WebGL2 sprite batch unavailable — node layer will not render'
      );
      return;
    }
    // Context-loss recovery: a lost GPU context (tab reclaim, driver reset,
    // context-cap eviction) would otherwise blank the node layer PERMANENTLY —
    // WebGL2 is the sole substrate, no fallback. Rebuilt on restore below.
    let contextLost = false;

    // A throwaway 2D context purely for measureText (the visible canvas is owned
    // by WebGL and has no 2D context).
    const measureCtx: CanvasRenderingContext2D | null = document
      .createElement('canvas')
      .getContext('2d');
    // Shared scratch for downscaling large icons into the atlas.
    const iconScratch = document.createElement('canvas');

    const getImage = (url: string): HTMLImageElement | null => {
      if (!url) return null;
      const cache = iconCacheRef.current;
      const decoded = decodedRef.current;
      // Given up on: draws nothing (the chip and stalk still paint) and — the
      // load-bearing half — no longer holds the readiness flag down, so
      // `waitForIconsDrawn` and every export gating on it stop waiting for a
      // bitmap that is never coming.
      if ((failedRef.current.get(url) ?? 0) >= MAX_ICON_LOAD_ATTEMPTS) {
        return null;
      }
      const existing = cache.get(url);
      // Only hand back an image whose bitmap is fully DECODED — see decodedRef.
      if (existing) return decoded.has(url) ? existing : null;
      const img = new Image();
      cache.set(url, img);
      // A newly decoded icon changes geometry → rebuild + redraw. Route through
      // the ref so the CURRENT effect's scheduler is used even if this decode
      // resolves after an effect re-run (stale closures would draw a dead batch).
      const markReady = () => {
        decoded.add(url);
        if (!destroyedRef.current) {
          geomDirtyRef.current = true;
          scheduleDrawRef.current();
        }
      };
      // R3/GPU-01 + GPU-03: the failure branch that did not exist.
      //
      // GPU-01 — the `catch` below used to end at `img.onload = markReady`, a
      // handler that can NEVER fire when the load has already errored: there was
      // no `onerror` path at all, so `decodedRef` never gained the url,
      // `getImage` returned null for the rest of the session, and
      // `data-all-icons-drawn` stayed "false" permanently. One dangling icon
      // reference disabled the readiness flag for the whole session.
      //
      // GPU-03 — and because the `Image` was inserted into the cache BEFORE the
      // decode resolved, a TRANSIENT failure (one 503) was cached as a permanent
      // one: the url was served correctly seconds later and four further
      // geometry rebuilds went past, and the request count stayed at 1 because
      // every build took the `existing` branch. Dropping the cache entry is what
      // lets the next build retry the network.
      const markFailed = () => {
        cache.delete(url);
        failedRef.current.set(url, (failedRef.current.get(url) ?? 0) + 1);
        if (!destroyedRef.current) {
          geomDirtyRef.current = true;
          scheduleDrawRef.current();
        }
      };
      img.onerror = markFailed;
      img.src = url;
      // decode() resolves only when the bitmap is ready for texSubImage2D — the
      // gate that prevents a black atlas upload. It can reject (some SVG data
      // URIs on older engines, or a detached image); fall back to load/complete.
      img
        .decode()
        .then(markReady)
        .catch(() => {
          if (img.complete && img.naturalWidth > 0) markReady();
          // `complete` with a zero natural width IS the already-failed case —
          // the load finished and produced no bitmap. Waiting for `onload` here
          // was the bug.
          else if (img.complete) markFailed();
          else img.onload = markReady;
        });
      return decoded.has(url) ? img : null;
    };

    // ----- shared per-frame scene state -----
    const frameState = () => {
      const ui = uiApi.getState();
      const { scroll, zoom, rendererSize, readableLabels } = ui;
      const inPreview = ui.editorMode === 'EXPLORABLE_READONLY';
      const previewHideLabels = ui.previewHideLabels;
      const exportHideLabels = ui.exportHideLabels;
      // dpr here is only for chip supersampling (f.dpr, capped at 2 below) — the
      // render-path backing store is computed + clamped in drawGLBatch.
      const dpr = window.devicePixelRatio || 1;
      const W = rendererSize.width;
      const H = rendererSize.height;

      const model = modelApi.getState();
      const items = model.items;
      const icons = model.icons;
      const mapCache = itemMapCacheRef.current;
      let itemsById = mapCache.itemsById;
      let iconsById = mapCache.iconsById;
      if (mapCache.items !== items || mapCache.icons !== icons) {
        itemsById = new Map(items.map((i) => [i.id, i]));
        iconsById = new Map(icons.map((ic) => [ic.id, ic]));
        itemMapCacheRef.current = { items, icons, itemsById, iconsById };
      }
      const layersNow = layersRef.current;
      const visibleNow = visibleIdsRef.current;
      const getTilePos = getTilePositionRef.current;
      const isIso = projectionRef.current === 'ISOMETRIC';

      const counterScale = computeLabelCounterScale(zoom, {
        enabled: readableLabels,
        baseFontPx: LABEL_BASE_FONT_PX,
        minReadablePx: LABEL_MIN_READABLE_PX,
        maxCounterScale: LABEL_MAX_COUNTER_SCALE
      });
      const drawLabels = isNodeLabelDrawn(zoom, readableLabels);
      const skipIds = skipIdsRef.current;

      // Painter's order (ST-4 cache).
      const cache = sortCacheRef.current;
      let sorted: ViewItem[];
      if (
        cache.nodes === nodesRef.current &&
        cache.layers === layersNow &&
        cache.visibleIds === visibleNow &&
        cache.skipIds === skipIds
      ) {
        sorted = cache.sorted;
      } else {
        const layerOrder = new Map(layersNow.map((l) => [l.id, l.order]));
        const orderOf = (n: ViewItem) =>
          resolveRenderOrder(
            n.layerId ? (layerOrder.get(n.layerId) ?? 0) : 0,
            n.zIndex ?? 0,
            -n.tile.x - n.tile.y
          );
        const visible = nodesRef.current.filter(
          (n) =>
            (layersNow.length === 0 || visibleNow.has(n.id)) &&
            !skipIds.has(n.id)
        );
        sorted = visible.sort((a, b) => orderOf(a) - orderOf(b));
        sortCacheRef.current = {
          nodes: nodesRef.current,
          layers: layersNow,
          visibleIds: visibleNow,
          skipIds,
          sorted
        };
      }

      return {
        scroll,
        zoom,
        W,
        H,
        dpr,
        inPreview,
        previewHideLabels,
        exportHideLabels,
        itemsById,
        iconsById,
        getTilePos,
        isIso,
        counterScale,
        drawLabels,
        sorted
      };
    };

    // ------------------------------------------------------------------
    // WebGL instanced path (glSpriteBatch). buildInstances = per-node CPU work
    // (scene changes only); drawGLBatch = per-frame render (uniform + one draw).
    // ------------------------------------------------------------------
    let lastBuiltDrawLabels = -1; // -1 = never built
    // Published on data-build-count: the "no per-frame CPU work" invariant is
    // that this stays FLAT during a pan/zoom (buildInstances = the only O(N)
    // CPU, must run on scene change only). The perf harness asserts it.
    let buildCount = 0;

    // Rasterise an icon into the atlas via a Canvas2D intermediary (cached by url
    // inside the batch, so this runs once per unique icon). Uploading through a
    // canvas — the same source type the name chips use, which render reliably —
    // rather than a raw HTMLImageElement avoids the driver-specific black-tile
    // upload that raw-image texSubImage2D can produce, and folds the
    // large-icon downscale into the same path.
    const putIcon = (b: SpriteBatch, url: string, img: HTMLImageElement) => {
      const nw = img.naturalWidth || 64;
      const nh = img.naturalHeight || 64;
      const scale = Math.min(1, ICON_ATLAS_CAP / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      const ictx = iconScratch ? iconScratch.getContext('2d') : null;
      if (!iconScratch || !ictx) return b.putImage(url, img, nw, nh); // fallback
      iconScratch.width = w;
      iconScratch.height = h;
      ictx.clearRect(0, 0, w, h);
      ictx.drawImage(img, 0, 0, w, h);
      return b.putImage(url, iconScratch, w, h);
    };

    // Rebuild the instance buffer from the current scene. All the O(N) CPU work
    // lives here and runs only on a scene change (geomDirty / LOD flip), never on
    // pan/zoom. The atlas compacts (if a prior build overflowed) inside
    // beginInstances(), so this single pass never packs onto stale UVs.
    const buildInstances = (b: SpriteBatch) => {
      const f = frameState();
      // Clamp effective dpr at 2 for chip rasterisation: on a 3x screen
      // dpr*CHIP_SUPERSAMPLE would be 6x (36x chip area), overflowing the atlas
      // and thrashing memory for no visible gain (2x keeps text crisp to 2x zoom).
      const ss = Math.min(f.dpr, 2) * CHIP_SUPERSAMPLE;
      const mctx = measureCtx;
      const chip = chipStyleRef.current;

      // beginInstances() compacts the atlas if a prior build overflowed it, so a
      // single pass here always packs into fresh space (never stale UVs).
      b.beginInstances();
      let drawn = 0;
      let labelsDrawn = 0;
      let linkedLabelsDrawn = 0;
      let allIconsDrawn = true;

      for (const node of f.sorted) {
        const modelItem = f.itemsById.get(node.id);
        if (!modelItem) continue;
        drawn += 1;

        const pos = getRenderedTilePosition(node, f.getTilePos, 'CENTER');

        const name = decodeHtmlEntities(modelItem.label ?? modelItem.name);
        const hasLabel =
          isLabelVisibleInPreview(
            node.showLabel !== false,
            f.inPreview,
            f.previewHideLabels
          ) &&
          !f.exportHideLabels &&
          Boolean(name);
        const labelHeight = node.labelHeight ?? DEFAULT_LABEL_HEIGHT;

        // ----- stalk (dotted, drawn first) -----
        if (hasLabel && labelHeight !== 0 && f.drawLabels) {
          const len = Math.abs(labelHeight);
          const sign = labelHeight >= 0 ? 1 : -1;
          const rDot = 1.5; // diameter 3 tile px (matches lineWidth 3)
          for (let d = 0; d <= len; d += 6) {
            b.addSprite(
              pos.x,
              pos.y - sign * d,
              -rDot,
              -rDot,
              2 * rDot,
              0,
              0,
              2 * rDot,
              b.dot,
              0,
              0,
              0,
              1,
              0
            );
          }
        }

        // ----- icon -----
        const icon = resolveIcon(modelItem.icon, f.iconsById);
        const img = getImage(icon.url);
        // R3/GPU-01: a url that has been given up on is RESOLVED, not pending —
        // it must not hold the readiness flag down. Without this one dangling
        // reference kept `data-all-icons-drawn` at "false" for the whole
        // session, so every consumer that gates on it waited for a bitmap that
        // was never coming.
        if (
          icon.url &&
          !img &&
          (failedRef.current.get(icon.url) ?? 0) < MAX_ICON_LOAD_ATTEMPTS
        ) {
          allIconsDrawn = false;
        }
        if (img) {
          const uv = putIcon(b, icon.url, img);
          if (uv) {
            // ADR 0044: per-node iconScale overrides the shared asset scale.
            const scale = node.iconScale ?? icon.scale ?? 1;
            if (icon.isIsometric) {
              const w = PROJ_W * 0.8 * scale;
              const h = iconHeight(img, w);
              b.addSprite(
                pos.x,
                pos.y,
                -w / 2,
                -h / 2,
                w,
                0,
                0,
                h,
                uv,
                1,
                1,
                1,
                1,
                0
              );
            } else if (f.isIso) {
              const w = PROJ_W * 0.7 * scale;
              const h = iconHeight(img, w);
              // ADR 0044: grow the flat icon about its scale-1 CENTRE — shift the
              // origin back by half the EXTRA sheared extent — so a resize expands
              // symmetrically instead of only down-and-right from the top-left
              // corner (matches the DOM NonIsometricIcon + the isometric branch).
              // scale-1 (dw=dh=0) is byte-for-byte unchanged.
              const w1 = PROJ_W * 0.7;
              const h1 = iconHeight(img, w1);
              const dw = w - w1;
              const dh = h - h1;
              // local (lx,ly) → iso; fold ISO translation into the anchor.
              const ox =
                pos.x - PROJ_W / 2 + ISO[4] - 0.5 * (ISO[0] * dw + ISO[2] * dh);
              const oy = pos.y + ISO[5] - 0.5 * (ISO[1] * dw + ISO[3] * dh);
              b.addSprite(
                ox,
                oy,
                0,
                0,
                ISO[0] * w,
                ISO[1] * w,
                ISO[2] * h,
                ISO[3] * h,
                uv,
                1,
                1,
                1,
                1,
                0
              );
            } else {
              const w = PROJ_W * 0.7 * scale;
              const h = iconHeight(img, w);
              b.addSprite(
                pos.x,
                pos.y,
                -w / 2,
                -h / 2,
                w,
                0,
                0,
                h,
                uv,
                1,
                1,
                1,
                1,
                0
              );
            }
          }
        }

        // ----- name chip -----
        if (hasLabel && f.drawLabels && mctx) {
          labelsDrawn += 1;
          const fontSize = node.labelFontSize || LABEL_BASE_FONT_PX;
          const labelBold = !!node.labelBold;
          const labelItalic = !!node.labelItalic;
          const labelStrike = !!node.labelStrikethrough;
          const linked = !!modelItem.headerLink;
          if (linked) linkedLabelsDrawn += 1;
          const labelUnder = !!node.labelUnderline || linked;
          const textColor =
            node.labelColor || (linked ? LABEL_LINK_COLOR : chip.text);

          const layoutKey = `${fontSize}:${labelBold ? 1 : 0}:${
            labelItalic ? 1 : 0
          }:${name}`;
          let layout = labelLayoutCacheRef.current.get(layoutKey);
          if (!layout) {
            layout = measureNodeLabel(
              mctx,
              name,
              fontSize,
              labelBold,
              labelItalic,
              chip
            );
            const lc = labelLayoutCacheRef.current;
            if (lc.size > 4096) lc.clear();
            lc.set(layoutKey, layout);
          }
          const { nameFont, nameLineH, chipW, chipH } = layout;

          // Content-keyed chip texture (theme colours are in the key, so a
          // theme change re-rasterises). Lazy factory: a cache hit skips
          // rasterisation entirely.
          const texKey = `node|${fontSize}|${labelBold ? 1 : 0}|${
            labelItalic ? 1 : 0
          }|${labelStrike ? 1 : 0}|${labelUnder ? 1 : 0}|${textColor}|${
            chip.bg
          }|${chip.border}|${chip.radius}|${chip.padX}|${chip.padY}|${name}`;
          const uv = b.putCanvas(texKey, 0, () =>
            rasterizeNodeChip(
              name,
              chipW,
              chipH,
              {
                radius: chip.radius,
                padX: chip.padX,
                padY: chip.padY,
                bg: chip.bg,
                border: chip.border,
                fontSize,
                nameFont,
                nameLineH,
                textColor,
                underline: labelUnder,
                strike: labelStrike
              },
              ss
            )
          );

          if (uv) {
            const anchorX = pos.x;
            const anchorY = pos.y - labelHeight;
            const x0 = -chipW / 2;
            const y0 = labelHeight < 0 ? 0 : -chipH;
            // chip scales with the label counter-scale (flag = 1).
            b.addSprite(
              anchorX,
              anchorY,
              x0,
              y0,
              chipW,
              0,
              0,
              chipH,
              uv,
              1,
              1,
              1,
              1,
              1
            );
          }
        }
      }

      b.commitInstances();

      // R2/GL-02: an overflowing chip is SKIPPED for this build and the atlas
      // compacts on the next `beginInstances` — but the compaction only happens
      // when a next build occurs, and nothing scheduled one. If no geometry
      // change followed, the missing chips stayed missing on screen indefinitely
      // (R3/GPU-14 measured 276 of 300 label chips drawn while `data-build-count`
      // reported a completed build). Ask for exactly one follow-up; the batch
      // refuses to offer a second until a build packs everything, so a scene that
      // genuinely does not fit degrades instead of spinning.
      if (b.atlasOverflowed()) {
        geomDirtyRef.current = true;
        scheduleDrawRef.current();
      }

      canvas.dataset.drawCount = String(drawn);
      canvas.dataset.labelsDrawn = String(labelsDrawn);
      canvas.dataset.linkedLabelsDrawn = String(linkedLabelsDrawn);
      canvas.dataset.allIconsDrawn = String(allIconsDrawn);
      canvas.dataset.buildCount = String(++buildCount);
      lastBuiltDrawLabels = f.drawLabels ? 1 : 0;
    };

    const drawGLBatch = (b: SpriteBatch) => {
      pendingRef.current = false;
      if (contextLost) return;
      const ui = uiApi.getState();
      const { scroll, zoom, rendererSize, readableLabels } = ui;
      const W = rendererSize.width;
      const H = rendererSize.height;
      // Clamp the backing store to the canvas caps; the effective dpr then feeds
      // BOTH the buffer size AND the u_view scale/origin below (ADR 0038).
      const {
        width: bw,
        height: bh,
        dpr
      } = computeBackingStore(W, H, window.devicePixelRatio || 1);
      const counterScale = computeLabelCounterScale(zoom, {
        enabled: readableLabels,
        baseFontPx: LABEL_BASE_FONT_PX,
        minReadablePx: LABEL_MIN_READABLE_PX,
        maxCounterScale: LABEL_MAX_COUNTER_SCALE
      });
      const drawLabels = isNodeLabelDrawn(zoom, readableLabels) ? 1 : 0;

      // Rebuild geometry only on a scene change or a label-LOD-band crossing.
      if (geomDirtyRef.current || drawLabels !== lastBuiltDrawLabels) {
        buildInstances(b);
        geomDirtyRef.current = false;
      }

      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      const originXDev = (W / 2 + scroll.position.x) * dpr;
      const originYDev = (H / 2 + scroll.position.y) * dpr;
      b.render(bw, bh, zoom * dpr, originXDev, originYDev, counterScale);
      canvas.dataset.labelScale = String(counterScale);
    };

    const draw = () => {
      if (batch) drawGLBatch(batch);
    };

    const scheduleDraw = () => {
      if (pendingRef.current || destroyedRef.current) return;
      pendingRef.current = true;
      rafIdRef.current = requestAnimationFrame(draw);
    };
    const drawNow = () => {
      if (destroyedRef.current) return;
      pendingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);
      draw();
    };
    destroyedRef.current = false;
    pendingRef.current = false;
    scheduleDrawRef.current = scheduleDraw;
    drawNowRef.current = drawNow;

    scheduleDraw();
    const unsubUi = uiApi.subscribe((s, p) => {
      if (
        s.scroll === p.scroll &&
        s.zoom === p.zoom &&
        s.rendererSize === p.rendererSize &&
        s.readableLabels === p.readableLabels &&
        s.previewHideLabels === p.previewHideLabels &&
        s.exportHideLabels === p.exportHideLabels &&
        s.editorMode === p.editorMode
      ) {
        return;
      }
      // readableLabels / preview / export flags change what's drawn → rebuild
      // geometry. Scroll/zoom alone are view-only (LOD-band crossing is caught
      // in drawGLBatch), so a pan/zoom just re-renders the cached instances.
      if (
        s.readableLabels !== p.readableLabels ||
        s.previewHideLabels !== p.previewHideLabels ||
        s.exportHideLabels !== p.exportHideLabels ||
        s.editorMode !== p.editorMode
      ) {
        geomDirtyRef.current = true;
      }
      if (s.scroll !== p.scroll || s.zoom !== p.zoom) {
        drawNow();
      } else {
        scheduleDraw();
      }
    });
    const unsubModel = modelApi.subscribe((s, p) => {
      if (s.items === p.items && s.icons === p.icons) return;
      geomDirtyRef.current = true;
      scheduleDraw();
    });

    const detachLoss = attachContextLossRecovery(canvas, {
      onLost: () => {
        contextLost = true;
      },
      onRestored: () => {
        const rebuilt = createSpriteBatch(canvas, atlasSize);
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
  }, [nodes, layers, visibleIds, strategy.projectionName, theme]);

  useLayoutEffect(() => {
    geomDirtyRef.current = true;
    drawNowRef.current();
  }, [skipNodes]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="axoview-nodes-canvas"
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
