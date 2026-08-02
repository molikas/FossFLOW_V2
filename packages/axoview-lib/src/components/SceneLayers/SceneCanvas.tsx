import React, { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Connector,
  Icon,
  Label,
  Layer,
  ModelItem,
  Rectangle as RectangleType,
  ViewItem,
  ItemControls,
  ItemReference
} from 'src/types';
import { TRANSFORM_CONTROLS_COLOR } from 'src/config';
import { isNodeLabelDrawn, labelCounterScaleFor } from 'src/config/labelSettings';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useModelStoreApi } from 'src/stores/modelStore';
import { useSceneStoreApi } from 'src/stores/sceneStore';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useLayerContext } from 'src/hooks/useLayerContext';
import {
  SceneEntityKind,
  compareSceneDrawOrder,
  findLayer
} from 'src/utils/renderOrder';
import { LabelChipLayout } from 'src/utils/labelChip';
import { computeBackingStore } from 'src/utils/renderTarget';
import {
  createSpriteBatch,
  SpriteBatch,
  UVRect
} from 'src/webgl/glSpriteBatch';
import { publishAtlasStats } from 'src/webgl/atlasDiagnostics';
import { attachContextLossRecovery } from 'src/webgl/contextLoss';
import { CHIP_SUPERSAMPLE } from 'src/webgl/itemRaster';
import { createRectangleEmitter } from 'src/webgl/scene/rectangleEmitter';
import { createConnectorEmitter } from 'src/webgl/scene/connectorEmitter';
import { createNodeEmitter, ChipStyle, NodeLabelLayout } from 'src/webgl/scene/nodeEmitter';
import { createLabelEmitter } from 'src/webgl/scene/labelEmitter';
import { makeArrowCanvas, makeRingCanvas } from 'src/webgl/scene/connectorSprites';

// ---------------------------------------------------------------------------
// SceneCanvas — the ONE WebGL2 bulk canvas (R3/GPU-13, ADR 0038 §8).
//
// It replaces `RectanglesCanvas → ConnectorsCanvas → NodesCanvas →
// LabelsCanvas`, four separate contexts whose stacking was fixed by mount order
// in `Renderer.tsx`. Because four WebGL2 contexts do not share a depth buffer,
// no per-entity depth scheme could order across them: merging the contexts was
// the precondition, and inside the merged one the ordering mechanism is SORTED
// DRAW (depth buffer stays off, exactly as before).
//
// One build pass:
//   1. collect every visible entity of all four types with its sort key
//      (`compareSceneDrawOrder`: layer stack ▸ z-index ▸ TYPE RANK ▸ iso depth);
//   2. stable-sort once;
//   3. walk the sorted list and let each type's emitter append its sprites.
//
// `SpriteBatch.render()` then issues one `drawArraysInstanced` per contiguous
// atlas-page run — one call for the whole bulk whenever the content fits one
// page, which §8's measurement 1 records at every N on the 8192 desktop clamp.
//
// Everything else about the substrate is unchanged and load-bearing:
//   • ADR 0038 §3 — picking stays geometric; this canvas is DRAW-ONLY.
//   • ADR 0038 §4 — `preserveDrawingBuffer: true`; image export now composites
//     ONE canvas instead of four, and gates on this canvas's
//     `data-all-icons-drawn`.
//   • ADR 0038 §5 — no per-frame CPU geometry work: `buildInstances` runs on a
//     scene change or an LOD-band crossing only, and `data-build-count` stays
//     flat across a pan.
//   • ADR 0031 §2 — "a floating Label paints above nodes" is now a SORT-KEY
//     property (the label type rank), not a mount-order accident.
// ---------------------------------------------------------------------------

interface Props {
  /** Bulk rectangles (Renderer excludes the dragged ones). */
  rectangles: RectangleType[];
  /** Bulk connectors (Renderer excludes the sparse DOM hybrid). */
  connectors: Connector[];
  /** Viewport-culled nodes. */
  nodes: ViewItem[];
  /** Nodes lifted into the DOM <Nodes> overlay — skipped so they aren't drawn twice. */
  skipNodes?: ViewItem[];
  /** Viewport-culled floating Labels. */
  labels: Label[];
}

// R3/GPU-01/03: how many times a failing icon url is re-requested before the
// layer gives up on it. Bounded on both sides deliberately — zero retries cached
// a TRANSIENT failure (one 503) as permanent for the session, and unbounded
// retries would re-request a dead reference on every geometry rebuild.
const MAX_ICON_LOAD_ATTEMPTS = 3;
// Icons are downscaled to this max atlas dimension (px) so a large source SVG
// can't blow the atlas; the on-screen icon quad is sized from PROJ_W regardless.
const ICON_ATLAS_CAP = 256;
// Shared empty skip-set so an unselected scene reuses one Set instance.
const EMPTY_SKIP: Set<string> = new Set();

/**
 * The CONNECTOR half of the current selection, as a set + a comparable key.
 *
 * A connector's selection halo is drawn by this canvas now (order-preserving
 * selection — see the emitter), so a change here is a geometry change. The key
 * keeps that narrow: selecting a NODE must not rebuild the whole bulk, and
 * `itemControls` / `selectedIds` change on every selection of anything.
 */
const connectorSelection = (
  itemControls: ItemControls | null,
  selectedIds: ReadonlyArray<ItemReference>
): { ids: Set<string>; key: string } => {
  const ids = new Set<string>();
  if (itemControls?.type === 'CONNECTOR') ids.add(itemControls.id);
  for (const r of selectedIds) if (r.type === 'CONNECTOR') ids.add(r.id);
  // NUL delimiter, for the R4/RND-04 reason the Renderer's joined-id keys use
  // one: an id is an opaque string an imported diagram may have minted anywhere.
  return { ids, key: [...ids].sort().join(String.fromCharCode(0)) };
};

// theme.spacing(n) returns a px string (e.g. "9px"); the canvas needs the number.
const spacingPx = (v: string | number): number =>
  typeof v === 'number' ? v : parseFloat(v);

/** One entity in the merged draw order. */
interface DrawUnit {
  kind: SceneEntityKind;
  layerOrder: number;
  zIndex: number;
  isoDepth: number;
  entity: RectangleType | Connector | ViewItem | Label;
}

export const SceneCanvas = memo(
  ({ rectangles, connectors, nodes, skipNodes, labels }: Props) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const uiApi = useUiStateStoreApi();
    const modelApi = useModelStoreApi();
    const sceneApi = useSceneStoreApi();
    const theme = useTheme();
    const { getTilePosition, strategy } = useCanvasMode();
    const { layers, visibleIds } = useLayerContext();

    // Live refs — the GL effect runs once per store identity and reads the
    // current props/context through these rather than re-creating the context.
    const rectanglesRef = useRef(rectangles);
    const connectorsRef = useRef(connectors);
    const nodesRef = useRef(nodes);
    const labelsRef = useRef(labels);
    const layersRef = useRef(layers);
    const visibleIdsRef = useRef(visibleIds);
    const getTilePositionRef = useRef(getTilePosition);
    const projectionRef = useRef(strategy.projectionName);
    const skipIdsRef = useRef<Set<string>>(EMPTY_SKIP);
    const chipStyleRef = useRef<ChipStyle>({
      radius: 0,
      padX: 0,
      padY: 0,
      bg: '',
      border: '',
      text: ''
    });
    rectanglesRef.current = rectangles;
    connectorsRef.current = connectors;
    nodesRef.current = nodes;
    labelsRef.current = labels;
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

    // Icon-bitmap cache: one HTMLImageElement per icon URL. An icon is only used
    // once it is in `decodedRef` — `complete`/`onload` do NOT guarantee the
    // bitmap is ready for a GPU texSubImage2D upload, and uploading a
    // not-yet-decoded image bakes a BLACK atlas tile on some drivers. The black
    // tile is then cached by url forever, so the gate must be `decode()`.
    const iconCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
    const decodedRef = useRef<Set<string>>(new Set());
    // Failed icon loads, url → attempt count (R3/GPU-01, GPU-03). "Failed" is a
    // THIRD state, distinct from decoded and from pending: a pending url holds
    // the readiness flag down, a failed one does not.
    const failedRef = useRef<Map<string, number>>(new Map());
    const pendingRef = useRef(false);
    const rafIdRef = useRef(0);
    const destroyedRef = useRef(false);
    const geomDirtyRef = useRef(true);
    const scheduleDrawRef = useRef<() => void>(() => {});
    const drawNowRef = useRef<() => void>(() => {});

    // id→item / id→icon lookup cache.
    const itemMapCacheRef = useRef<{
      items: ModelItem[] | null;
      icons: Icon[] | null;
      itemsById: Map<string, ModelItem>;
      iconsById: Map<string, Icon>;
    }>({ items: null, icons: null, itemsById: new Map(), iconsById: new Map() });

    // Text-layout caches, keyed by the content that determines them.
    const nodeLayoutCacheRef = useRef<Map<string, NodeLabelLayout>>(new Map());
    const labelLayoutCacheRef = useRef<Map<string, LabelChipLayout>>(new Map());

    // Merged painter's-order cache — the sorted draw list is rebuilt only when
    // one of its inputs changes identity.
    const sortCacheRef = useRef<{
      rectangles: RectangleType[] | null;
      connectors: Connector[] | null;
      nodes: ViewItem[] | null;
      labels: Label[] | null;
      layers: Layer[] | null;
      visibleIds: ReadonlySet<string> | null;
      skipIds: ReadonlySet<string> | null;
      sorted: DrawUnit[];
    }>({
      rectangles: null,
      connectors: null,
      nodes: null,
      labels: null,
      layers: null,
      visibleIds: null,
      skipIds: null,
      sorted: []
    });

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // ONE context for the whole bulk. The atlas must now hold node chips, label
      // chips and icons together, so it is sized like the old node atlas — 8192,
      // capped to 4096 on high-DPR/mobile (an 8192² RGBA atlas is ~268MB up
      // front, too heavy for integrated/mobile GPUs).
      //
      // maxPages = 2 because §8's measurement 2 found the merged chip set does
      // NOT fit the 4096 clamp at N=5000 (4 178 rows vs 4 096). A second page is
      // allocated only if the first fills, and costs one bind per material run —
      // the measured 44–140 calls, all far above §4's ~8-instance threshold.
      const atlasSize =
        typeof window !== 'undefined' && window.devicePixelRatio >= 2
          ? 4096
          : 8192;
      let batch: SpriteBatch | null = createSpriteBatch(canvas, atlasSize, 2);
      if (!batch) {
        // WebGL2 passed the gate probe but a real batch couldn't be built here
        // (shader/link/atlas-alloc failure, or context exhaustion). Surface it
        // rather than silently drawing nothing into a blank canvas.
        console.warn(
          '[SceneCanvas] WebGL2 sprite batch unavailable — the diagram will not render'
        );
        return;
      }
      let contextLost = false;

      // A throwaway 2D context purely for measureText (the visible canvas is
      // owned by WebGL and has no 2D context).
      const measureCtx: CanvasRenderingContext2D | null = document
        .createElement('canvas')
        .getContext('2d');
      // Shared scratch for downscaling large icons into the atlas.
      const iconScratch = document.createElement('canvas');

      const iconPending = (url: string) =>
        (failedRef.current.get(url) ?? 0) < MAX_ICON_LOAD_ATTEMPTS;

      const getImage = (url: string): HTMLImageElement | null => {
        if (!url) return null;
        const cache = iconCacheRef.current;
        const decoded = decodedRef.current;
        // Given up on: draws nothing (the chip and stalk still paint) and — the
        // load-bearing half — no longer holds the readiness flag down, so
        // `waitForIconsDrawn` and every export gating on it stop waiting for a
        // bitmap that is never coming.
        if (!iconPending(url)) return null;
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
        // R3/GPU-01 + GPU-03: the failure branch that did not exist. Without
        // `onerror`, `decodedRef` never gained the url and `data-all-icons-drawn`
        // stayed "false" permanently — one dangling reference disabled the
        // readiness flag for the whole session. And because the `Image` was
        // inserted into the cache BEFORE the decode resolved, a TRANSIENT failure
        // was cached as permanent; dropping the cache entry is what lets the next
        // build retry the network.
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
            // the load finished and produced no bitmap.
            else if (img.complete) markFailed();
            else img.onload = markReady;
          });
        return decoded.has(url) ? img : null;
      };

      // Rasterise an icon into the atlas via a Canvas2D intermediary (cached by
      // url inside the batch, so this runs once per unique icon). Uploading
      // through a canvas — the same source type the name chips use — rather than
      // a raw HTMLImageElement avoids the driver-specific black-tile upload that
      // raw-image texSubImage2D can produce, and folds the downscale in.
      const putIcon = (
        b: SpriteBatch,
        url: string,
        img: HTMLImageElement
      ): UVRect | null => {
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

      /**
       * The merged draw order.
       *
       * Each type contributes its entities PRE-ORDERED in the within-type
       * convention it already had, and the sort is stable, so an equal key
       * resolves exactly as it did before the merge:
       *   • rectangles and labels — REVERSED insertion order (earlier in the
       *     array paints on top), which is what the DOM `<Rectangles>` layer and
       *     `hitDetection`'s rectangle branch already use. The pre-merge
       *     `RectanglesCanvas` walked plain model order instead, so the GPU and
       *     the picker disagreed about two same-`zIndex` overlapping rectangles;
       *     adopting the picker's convention is what lets the agreement gate
       *     assert something true.
       *   • connectors — model order (they did not sort at all before).
       *   • nodes — array order, with iso depth as the real tiebreaker.
       */
      const buildDrawOrder = (): DrawUnit[] => {
        const rects = rectanglesRef.current;
        const conns = connectorsRef.current;
        const nds = nodesRef.current;
        const lbls = labelsRef.current;
        const layersNow = layersRef.current;
        const visibleNow = visibleIdsRef.current;
        const skipIds = skipIdsRef.current;
        const cache = sortCacheRef.current;
        if (
          cache.rectangles === rects &&
          cache.connectors === conns &&
          cache.nodes === nds &&
          cache.labels === lbls &&
          cache.layers === layersNow &&
          cache.visibleIds === visibleNow &&
          cache.skipIds === skipIds
        ) {
          return cache.sorted;
        }

        // The "draw all" escape hatch keys off whether ANY layer exists — NOT
        // `visibleNow.size`, since an empty set also means "everything is on a
        // hidden layer" and must stay hidden.
        const layered = layersNow.length > 0;
        const layerOrderOf = (layerId: string | undefined) =>
          findLayer(layerId, layersNow)?.order ?? 0;

        const units: DrawUnit[] = [];
        for (let i = rects.length - 1; i >= 0; i -= 1) {
          const r = rects[i];
          if (layered && !visibleNow.has(r.id)) continue;
          units.push({
            kind: 'rectangle',
            layerOrder: layerOrderOf(r.layerId),
            zIndex: r.zIndex ?? 0,
            isoDepth: 0,
            entity: r
          });
        }
        for (const c of conns) {
          if (layered && !visibleNow.has(c.id)) continue;
          units.push({
            kind: 'connector',
            layerOrder: layerOrderOf(c.layerId),
            // Connectors carry no z-index: `canZOrder` in the canvas context menu
            // offers the z-order commands to ITEM / LABEL / RECTANGLE only, and
            // the schema has no field for one. They therefore order by layer and
            // type rank alone — which is what the brief's "bring-to-front on a
            // connector does nothing" observes, and is unchanged by the merge.
            zIndex: 0,
            isoDepth: 0,
            entity: c
          });
        }
        for (const n of nds) {
          if (layered && !visibleNow.has(n.id)) continue;
          if (skipIds.has(n.id)) continue;
          units.push({
            kind: 'node',
            layerOrder: layerOrderOf(n.layerId),
            zIndex: n.zIndex ?? 0,
            isoDepth: -n.tile.x - n.tile.y,
            entity: n
          });
        }
        for (let i = lbls.length - 1; i >= 0; i -= 1) {
          const l = lbls[i];
          if (layered && !visibleNow.has(l.id)) continue;
          units.push({
            kind: 'label',
            layerOrder: layerOrderOf(l.layerId),
            zIndex: l.zIndex ?? 0,
            isoDepth: 0,
            entity: l
          });
        }

        units.sort(compareSceneDrawOrder);
        sortCacheRef.current = {
          rectangles: rects,
          connectors: conns,
          nodes: nds,
          labels: lbls,
          layers: layersNow,
          visibleIds: visibleNow,
          skipIds,
          sorted: units
        };
        return units;
      };

      let lastBuiltDrawLabels = -1; // -1 = never built
      // Published on data-build-count: the "no per-frame CPU work" invariant is
      // that this stays FLAT during a pan/zoom. The perf harness asserts it.
      let buildCount = 0;

      const buildInstances = (b: SpriteBatch) => {
        const ui = uiApi.getState();
        const { zoom, readableLabels } = ui;
        const model = modelApi.getState();
        const scenePaths = sceneApi.getState().connectors;

        const mapCache = itemMapCacheRef.current;
        let itemsById = mapCache.itemsById;
        let iconsById = mapCache.iconsById;
        if (mapCache.items !== model.items || mapCache.icons !== model.icons) {
          itemsById = new Map(model.items.map((i) => [i.id, i]));
          iconsById = new Map(model.icons.map((ic) => [ic.id, ic]));
          itemMapCacheRef.current = {
            items: model.items,
            icons: model.icons,
            itemsById,
            iconsById
          };
        }
        const colorsById = new Map(model.colors.map((c) => [c.id, c.value]));
        // R1/PROJ-12 (ADR 0023 addendum D): a connector endpoint anchored to an
        // OFF-GRID node must render at the node's DRAWN position, not its bare
        // tile. Built only from items that actually carry a residual, so an
        // all-snapped diagram pays nothing.
        const offsetByItemId = new Map<string, { x: number; y: number }>();
        for (const it of model.views.find((v) => v.id === ui.view)?.items ?? []) {
          if (it.offset) offsetByItemId.set(it.id, it.offset);
        }

        const getTilePos = getTilePositionRef.current;
        const isIso = projectionRef.current === 'ISOMETRIC';
        // Clamp effective dpr at 2 for chip rasterisation: on a 3x screen
        // dpr*CHIP_SUPERSAMPLE would be 6x (36x chip area), overflowing the atlas
        // and thrashing memory for no visible gain.
        const ss =
          Math.min(window.devicePixelRatio || 1, 2) * CHIP_SUPERSAMPLE;
        const drawLabels = isNodeLabelDrawn(zoom, readableLabels);

        // beginInstances() compacts the atlas if a prior build overflowed it (or
        // key churn left it stale), so a single pass here always packs into fresh
        // space — never stale UVs.
        b.beginInstances();
        // The arrow and ring sprites are re-fetched INSIDE the build, not
        // captured once at context creation as the pre-merge ConnectorsCanvas
        // did. A compaction clears the uv cache, and the merged atlas — unlike
        // that layer's 4-key 512² one — genuinely compacts, which would have left
        // both UVs pointing at texels some chip had since overwritten. The
        // content key makes a non-compacting build a plain cache hit.
        const arrowUV = b.putCanvas('__arrow__', 0, makeArrowCanvas) ?? b.white;
        const ringUV = b.putCanvas('__ring__', 0, makeRingCanvas) ?? b.white;

        const rectEmitter = createRectangleEmitter({
          batch: b,
          colorsById,
          getTilePos,
          isIso
        });
        const connEmitter = createConnectorEmitter({
          batch: b,
          colorsById,
          scenePaths,
          offsetByItemId,
          getTilePos,
          arrowUV,
          ringUV,
          selectedIds: connectorSelection(ui.itemControls, ui.selectedIds).ids,
          selectionColor: TRANSFORM_CONTROLS_COLOR
        });
        const nodeEmitter = createNodeEmitter({
          batch: b,
          itemsById,
          iconsById,
          getTilePos,
          isIso,
          inPreview: ui.editorMode === 'EXPLORABLE_READONLY',
          previewHideLabels: ui.previewHideLabels,
          exportHideLabels: ui.exportHideLabels,
          drawLabels,
          zoom,
          readableLabels,
          chip: chipStyleRef.current,
          measureCtx,
          ss,
          layoutCache: nodeLayoutCacheRef.current,
          getImage,
          iconPending,
          putIcon
        });
        const labelEmitter = measureCtx
          ? createLabelEmitter({
              batch: b,
              measureCtx,
              colors: {
                bg: theme.palette.common.white,
                border: theme.palette.grey[400],
                text: theme.palette.text.primary
              },
              move: ui.labelMove,
              moves: ui.labelMoves,
              editingId: ui.inlineEditLabelId,
              getTilePos,
              zoom,
              readableLabels,
              ss,
              layoutCache: labelLayoutCacheRef.current
            })
          : null;

        let rectsDrawn = 0;
        let connsDrawn = 0;
        let nodesDrawn = 0;
        let labelsDrawn = 0;

        // ONE ordered pass over every bulk entity — the composition
        // `resolveRenderOrder`'s global value space was always designed for and
        // never had (R3/GPU-13: four independent applications of a global
        // comparator).
        for (const unit of buildDrawOrder()) {
          switch (unit.kind) {
            case 'rectangle':
              rectEmitter.emit(unit.entity as RectangleType);
              rectsDrawn += 1;
              break;
            case 'connector':
              if (connEmitter.emit(unit.entity as Connector)) connsDrawn += 1;
              break;
            case 'node':
              if (nodeEmitter.emit(unit.entity as ViewItem)) nodesDrawn += 1;
              break;
            case 'label':
              if (labelEmitter?.emit(unit.entity as Label)) labelsDrawn += 1;
              break;
            default:
              break;
          }
        }

        b.commitInstances();

        // R2/GL-02: an overflowing chip is SKIPPED for this build and the atlas
        // compacts on the next `beginInstances` — but the compaction only happens
        // when a next build occurs, and nothing scheduled one. Ask for exactly one
        // follow-up; the batch refuses to offer a second until a build packs
        // everything, so a scene that genuinely does not fit degrades instead of
        // spinning.
        if (b.atlasOverflowed()) {
          geomDirtyRef.current = true;
          scheduleDrawRef.current();
        }

        // R3/GPU-13: `data-draw-count` is now a TOTAL over every bulk entity type
        // and can no longer be compared against N. `data-nodes-drawn == N` is the
        // honesty channel ADR 0020's anti-cheat asserts from here on; the
        // per-type counts below give the connector/rectangle/label anti-cheats the
        // same channel on the one canvas.
        canvas.dataset.drawCount = String(
          rectsDrawn + connsDrawn + nodesDrawn + labelsDrawn
        );
        canvas.dataset.nodesDrawn = String(nodesDrawn);
        canvas.dataset.connectorsDrawn = String(connsDrawn);
        canvas.dataset.rectanglesDrawn = String(rectsDrawn);
        canvas.dataset.labelsDrawn = String(nodeEmitter.stats.labelsDrawn);
        canvas.dataset.floatingLabelsDrawn = String(labelsDrawn);
        canvas.dataset.linkedLabelsDrawn = String(
          nodeEmitter.stats.linkedLabelsDrawn
        );
        canvas.dataset.allIconsDrawn = String(nodeEmitter.stats.allIconsDrawn);
        canvas.dataset.buildCount = String(++buildCount);
        publishAtlasStats(canvas, b);
        lastBuiltDrawLabels = drawLabels ? 1 : 0;
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
        const counterScale = labelCounterScaleFor(zoom, readableLabels);
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
        const connSelChanged =
          (s.itemControls !== p.itemControls || s.selectedIds !== p.selectedIds) &&
          connectorSelection(s.itemControls, s.selectedIds).key !==
            connectorSelection(p.itemControls, p.selectedIds).key;
        if (
          s.scroll === p.scroll &&
          s.zoom === p.zoom &&
          s.rendererSize === p.rendererSize &&
          s.readableLabels === p.readableLabels &&
          s.previewHideLabels === p.previewHideLabels &&
          s.exportHideLabels === p.exportHideLabels &&
          s.editorMode === p.editorMode &&
          s.labelMove === p.labelMove &&
          s.labelMoves === p.labelMoves &&
          s.inlineEditLabelId === p.inlineEditLabelId &&
          !connSelChanged
        ) {
          return;
        }
        // Flags that change WHAT is drawn → rebuild geometry. Scroll/zoom alone
        // are view-only (an LOD-band crossing is caught in drawGLBatch), so a
        // pan/zoom just re-renders the cached instances — ADR 0038 §5.
        if (
          s.readableLabels !== p.readableLabels ||
          s.previewHideLabels !== p.previewHideLabels ||
          s.exportHideLabels !== p.exportHideLabels ||
          s.editorMode !== p.editorMode ||
          s.labelMove !== p.labelMove ||
          s.labelMoves !== p.labelMoves ||
          s.inlineEditLabelId !== p.inlineEditLabelId ||
          connSelChanged
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
        if (s.items === p.items && s.icons === p.icons && s.colors === p.colors)
          return;
        geomDirtyRef.current = true;
        scheduleDraw();
      });
      const unsubScene = sceneApi.subscribe((s, p) => {
        if (s.connectors === p.connectors) return;
        geomDirtyRef.current = true;
        scheduleDraw();
      });

      const detachLoss = attachContextLossRecovery(canvas, {
        onLost: () => {
          contextLost = true;
        },
        onRestored: () => {
          const rebuilt = createSpriteBatch(canvas, atlasSize, 2);
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
        unsubScene();
        detachLoss();
        batch?.destroy();
      };
    }, [uiApi, modelApi, sceneApi, theme]);

    useEffect(() => {
      geomDirtyRef.current = true;
      scheduleDrawRef.current();
    }, [
      rectangles,
      connectors,
      nodes,
      labels,
      layers,
      visibleIds,
      getTilePosition,
      strategy.projectionName,
      theme
    ]);

    // The hybrid promotion must land in the SAME frame the selection does, or the
    // promoted node is briefly drawn twice (canvas + DOM overlay).
    useLayoutEffect(() => {
      geomDirtyRef.current = true;
      drawNowRef.current();
    }, [skipNodes]);

    return (
      <canvas
        ref={canvasRef}
        data-testid="axoview-scene-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 0
        }}
      />
    );
  }
);
