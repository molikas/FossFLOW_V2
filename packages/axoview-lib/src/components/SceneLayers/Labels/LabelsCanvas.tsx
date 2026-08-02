import React, { memo, useEffect, useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import { Label, Layer, Coords } from 'src/types';
import { useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useCanvasMode } from 'src/contexts/CanvasModeContext';
import { useLayerContext } from 'src/hooks/useLayerContext';
import {
  measureLabelChip,
  labelFontPx,
  ChipColors,
  LabelChipLayout
} from 'src/utils/labelChip';
import { createSpriteBatch, SpriteBatch } from 'src/webgl/glSpriteBatch';
import { attachContextLossRecovery } from 'src/webgl/contextLoss';
import { rasterizeLabelChip, CHIP_SUPERSAMPLE } from 'src/webgl/itemRaster';
import { computeBackingStore } from 'src/utils/renderTarget';
import { resolveRenderOrder, findLayer } from 'src/utils/renderOrder';
import {
  getRenderedTilePosition,
  TilePositionFn
} from 'src/utils/renderedGeometry';
import {
  LABEL_BASE_FONT_PX,
  labelCounterScaleFor
} from 'src/config/labelSettings';

// ---------------------------------------------------------------------------
// LabelsCanvas (ADR 0031) — WebGL2 INSTANCED draw of the floating Label layer.
// Each chip (rounded rect + text + decorations, via the shared drawLabelChip) is
// rasterised ONCE into a content-keyed atlas entry and drawn as one instanced
// quad — glyph pixels identical to the old Canvas2D path. Geometry is rebuilt
// only on a scene / move / edit change; pan & zoom just update the view uniform
// and issue one draw call (see glSpriteBatch / NodesCanvas for the model).
//
// Mounted ABOVE NodesCanvas in the Renderer, so a label can sit OVER a node.
// DRAW-ONLY — selection + move are the DOM LabelHitLayer's job. WebGL2 is the
// sole render substrate (Phase C); a browser without it is gated upstream by the
// Renderer's WebGLUnsupportedScreen and never mounts this component.
// ---------------------------------------------------------------------------

interface Props {
  // Viewport-culled candidate labels (Renderer). This layer additionally filters
  // by layer visibility and sorts by zIndex.
  labels: Label[];
}

export const LabelsCanvas = memo(({ labels }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiApi = useUiStateStoreApi();
  const theme = useTheme();
  const { getTilePosition, strategy } = useCanvasMode();
  const { visibleIds, layers } = useLayerContext();

  const labelsRef = useRef(labels);
  const getTilePositionRef = useRef(getTilePosition);
  const visibleIdsRef = useRef(visibleIds);
  const layersRef = useRef(layers);
  const chipColorsRef = useRef<ChipColors>({ bg: '', border: '', text: '' });
  labelsRef.current = labels;
  getTilePositionRef.current = getTilePosition;
  visibleIdsRef.current = visibleIds;
  layersRef.current = layers;
  chipColorsRef.current = {
    bg: theme.palette.common.white,
    border: theme.palette.grey[400],
    text: theme.palette.text.primary
  };

  const pendingRef = useRef(false);
  const rafIdRef = useRef(0);
  const destroyedRef = useRef(false);
  const geomDirtyRef = useRef(true);
  const scheduleDrawRef = useRef<() => void>(() => {});

  // Painter's-order sort cache.
  const sortCacheRef = useRef<{
    labels: Label[] | null;
    visibleIds: ReadonlySet<string> | null;
    layers: Layer[] | null;
    sorted: Label[];
  }>({ labels: null, visibleIds: null, layers: null, sorted: [] });

  // Per-(text, fontSize, bold, italic) chip-layout cache.
  const layoutCacheRef = useRef<Map<string, LabelChipLayout>>(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let batch: SpriteBatch | null = createSpriteBatch(canvas);
    if (!batch) {
      // WebGL2 passed the gate probe but the batch failed here (shader/link or
      // context exhaustion). Surface it — the floating-label layer has no fallback.
      console.warn(
        '[LabelsCanvas] WebGL2 sprite batch unavailable — floating labels will not render'
      );
      return;
    }
    // Context-loss recovery: rebuild the batch on restore so a lost GPU context
    // doesn't blank the floating-label layer permanently.
    let contextLost = false;

    // Throwaway 2D context for measureText (the visible canvas is owned by WebGL).
    const measureCtx: CanvasRenderingContext2D | null =
      document.createElement('canvas').getContext('2d');

    // Shared per-frame state (sizes, transform inputs, sorted labels).
    const frameState = () => {
      const ui = uiApi.getState();
      const { scroll, zoom, rendererSize, readableLabels } = ui;
      const move = ui.labelMove;
      const moves = ui.labelMoves;
      const editingId = ui.inlineEditLabelId;
      // dpr here is only for chip supersampling (f.dpr, capped at 2 below) — the
      // render-path backing store is computed + clamped in drawGLBatch.
      const dpr = window.devicePixelRatio || 1;
      const W = rendererSize.width;
      const H = rendererSize.height;

      const allLabels = labelsRef.current;
      const visible = visibleIdsRef.current;
      const layersNow = layersRef.current;
      const getTilePos = getTilePositionRef.current;
      const colors = chipColorsRef.current;

      const cache = sortCacheRef.current;
      let sorted = cache.sorted;
      if (
        cache.labels !== allLabels ||
        cache.visibleIds !== visible ||
        cache.layers !== layersNow
      ) {
        const filtered = allLabels.filter(
          (l) => layersNow.length === 0 || visible.has(l.id)
        );
        // F4/LAY-01: the LAYER's stack position dominates the per-chip zIndex,
        // exactly as it does for nodes. This sorted on `zIndex` alone, so
        // reordering layers moved the nodes and nothing else.
        sorted = [...filtered].reverse().sort(
          (a, b) =>
            resolveRenderOrder(
              findLayer(a.layerId, layersNow)?.order ?? 0,
              a.zIndex ?? 0,
              0
            ) -
            resolveRenderOrder(
              findLayer(b.layerId, layersNow)?.order ?? 0,
              b.zIndex ?? 0,
              0
            )
        );
        sortCacheRef.current = {
          labels: allLabels,
          visibleIds: visible,
          layers: layersNow,
          sorted
        };
      }

      return {
        scroll,
        zoom,
        W,
        H,
        dpr,
        move,
        moves,
        editingId,
        getTilePos,
        colors,
        // R5/OVL-02: per-chip factor derived at emission.
        readableLabels,
        sorted
      };
    };

    // Per-label geometry: resolves the live move-preview and the layout cache,
    // returns the chip centre (cx,cy) in tile space + layout. `move` is the
    // single-label drag preview (LabelHitLayer); `moves` is the group-drag
    // preview (DragItems) keyed by id — both are UI-only, and a label matched by
    // either draws at the previewed tile/offset instead of its model position.
    const resolveLabel = (
      label: Label,
      move: { id: string; tile: Coords; offset?: Coords } | null | undefined,
      moves: Record<string, { tile: Coords; offset?: Coords }> | null | undefined,
      getTilePos: TilePositionFn,
      mctx: CanvasRenderingContext2D
    ) => {
      const preview =
        move && move.id === label.id ? move : moves?.[label.id] ?? null;
      const tile: Coords = preview ? preview.tile : label.tile;
      const offset: Coords | undefined = preview ? preview.offset : label.offset;
      const { x: cx, y: cy } = getRenderedTilePosition(
        { tile, offset },
        getTilePos,
        'CENTER'
      );
      const fontSize = labelFontPx(label);
      const key = `${fontSize}:${label.isBold ? 1 : 0}:${
        label.isItalic ? 1 : 0
      }:${label.text}`;
      let layout = layoutCacheRef.current.get(key);
      if (!layout) {
        layout = measureLabelChip(
          mctx,
          label.text,
          fontSize,
          label.isBold,
          label.isItalic
        );
        const lc = layoutCacheRef.current;
        if (lc.size > 4096) lc.clear();
        lc.set(key, layout);
      }
      return { cx, cy, layout };
    };

    // ----- WebGL instanced path -----
    let buildCount = 0; // data-build-count — must stay flat during pan (no CPU/frame)
    const buildInstances = (b: SpriteBatch) => {
      const f = frameState();
      // Clamp effective dpr at 2 for chip rasterisation (see NodesCanvas) so a
      // 3x device doesn't rasterise chips at 6x.
      const ss = Math.min(f.dpr, 2) * CHIP_SUPERSAMPLE;
      const mctx = measureCtx;
      let drawn = 0;
      if (mctx) {
        b.beginInstances();
        for (const label of f.sorted) {
          if (label.id === f.editingId) continue;
          const { cx, cy, layout } = resolveLabel(
            label,
            f.move,
            f.moves,
            f.getTilePos,
            mctx
          );
          const linked = !!label.headerLink;
          const texKey = `label|${labelFontPx(label)}|${
            label.isBold ? 1 : 0
          }|${label.isItalic ? 1 : 0}|${label.isStrikethrough ? 1 : 0}|${
            label.isUnderline ? 1 : 0
          }|${linked ? 1 : 0}|${label.color || ''}|${
            label.backgroundColor || ''
          }|${label.backgroundOpacity ?? 1}|${f.colors.bg}|${f.colors.border}|${
            f.colors.text
          }|${label.text}`;
          const uv = b.putCanvas(texKey, 0, () =>
            rasterizeLabelChip(label, layout, f.colors, ss)
          );
          if (uv) {
            const w = layout.chipW;
            const h = layout.chipH;
            // counterScaleFlag = 1: the "keep labels readable" uniform grows the
            // chip about its centre (cx,cy) when zoomed out (ADR 0015). No-op when
            // the toggle is off (uniform = 1) — parity with the node name chips.
            // R5/OVL-02: this chip's own counter-scale, from its own font size.
            b.addSprite(
              cx,
              cy,
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
              1,
              0,
              0,
              labelCounterScaleFor(
                f.zoom,
                f.readableLabels,
                labelFontPx(label)
              )
            );
            drawn += 1;
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
      }
      canvas.dataset.drawCount = String(drawn);
      canvas.dataset.buildCount = String(++buildCount);
    };

    const drawGLBatch = (b: SpriteBatch) => {
      pendingRef.current = false;
      if (contextLost) return;
      const ui = uiApi.getState();
      const { scroll, zoom, rendererSize, readableLabels } = ui;
      const W = rendererSize.width;
      const H = rendererSize.height;
      // Clamp the backing store to the canvas caps; the effective dpr feeds both
      // the buffer size and the u_view scale/origin below (ADR 0038).
      const {
        width: bw,
        height: bh,
        dpr
      } = computeBackingStore(W, H, window.devicePixelRatio || 1);
      // "Keep labels readable" (ADR 0015): the shader counter-scales flagged chips
      // up to a legible floor when zoomed out. 1 (no-op) when the toggle is off or
      // above the threshold — parity with the node name chips in NodesCanvas.
      // R5/OVL-02: the uniform carries the DEFAULT-sized factor; each chip
      // packs its own (from its own font size) into `i_misc.w`.
      const counterScale = labelCounterScaleFor(zoom, readableLabels);

      if (geomDirtyRef.current) {
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

    scheduleDraw();
    const unsubUi = uiApi.subscribe((s, p) => {
      if (
        s.scroll === p.scroll &&
        s.zoom === p.zoom &&
        s.rendererSize === p.rendererSize &&
        s.labelMove === p.labelMove &&
        s.labelMoves === p.labelMoves &&
        s.inlineEditLabelId === p.inlineEditLabelId &&
        s.readableLabels === p.readableLabels
      ) {
        return;
      }
      // A live move-preview (single or group) or an edit-skip change what's
      // drawn → rebuild; scroll/zoom (and the readable-labels uniform, whose flag
      // is already baked into every chip) alone just re-render the cached instances.
      if (
        s.labelMove !== p.labelMove ||
        s.labelMoves !== p.labelMoves ||
        s.inlineEditLabelId !== p.inlineEditLabelId
      ) {
        geomDirtyRef.current = true;
      }
      if (s.scroll !== p.scroll || s.zoom !== p.zoom) {
        drawNow();
      } else {
        scheduleDraw();
      }
    });

    const detachLoss = attachContextLossRecovery(canvas, {
      onLost: () => {
        contextLost = true;
      },
      onRestored: () => {
        const rebuilt = createSpriteBatch(canvas);
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
      detachLoss();
      batch?.destroy();
    };
  }, [uiApi]);

  useEffect(() => {
    geomDirtyRef.current = true;
    scheduleDrawRef.current();
    // strategy.projectionName MUST be a dep: on a 2D<->iso switch the tile->scene
    // positions change, so the GPU chips must rebuild or they stay at the old
    // projection while the DOM hit-proxy (LabelHitLayer) moves to the new one —
    // the chip and its clickable div separate and the label becomes unselectable
    // until some other change dirties geometry. NodesCanvas already does this.
  }, [labels, visibleIds, layers, strategy.projectionName, theme]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="axoview-labels-canvas"
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
