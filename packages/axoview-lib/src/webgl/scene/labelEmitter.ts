import { Label, Coords } from 'src/types';
import {
  measureLabelChip,
  labelFontPx,
  ChipColors,
  LabelChipLayout
} from 'src/utils/labelChip';
import { SpriteBatch } from 'src/webgl/glSpriteBatch';
import { rasterizeLabelChip } from 'src/webgl/itemRaster';
import {
  getRenderedTilePosition,
  TilePositionFn
} from 'src/utils/renderedGeometry';
import { labelCounterScaleFor } from 'src/config/labelSettings';

// ---------------------------------------------------------------------------
// Floating Label chips (ADR 0031) for the merged bulk canvas (ADR 0038 §8).
//
// Lifted verbatim out of the pre-merge `LabelsCanvas.buildInstances`. ADR 0031
// §2 — "a floating Label paints ABOVE nodes" — used to be guaranteed by mounting
// this layer immediately after `NodesCanvas`; it is now a SORT-KEY property (the
// `label` type rank is the highest), which is what §8 restated it as.
// ---------------------------------------------------------------------------

export interface LabelEmitterInput {
  batch: SpriteBatch;
  /** Throwaway 2D context for measureText. */
  measureCtx: CanvasRenderingContext2D;
  colors: ChipColors;
  /** Single-label drag preview (LabelHitLayer). */
  move: { id: string; tile: Coords; offset?: Coords } | null | undefined;
  /** Group-drag preview (DragItems), keyed by id. */
  moves: Record<string, { tile: Coords; offset?: Coords }> | null | undefined;
  /** The label being inline-edited — skipped here, the DOM editor owns it. */
  editingId: string | null;
  getTilePos: TilePositionFn;
  zoom: number;
  readableLabels: boolean;
  /** Chip supersample factor (dpr capped at 2, × CHIP_SUPERSAMPLE). */
  ss: number;
  /** Per-(text, size, bold, italic) layout cache, owned by the caller. */
  layoutCache: Map<string, LabelChipLayout>;
}

export interface LabelEmitter {
  /** Emits the chip; false when it was skipped (edited, or atlas-full). */
  emit(label: Label): boolean;
}

export const createLabelEmitter = ({
  batch: b,
  measureCtx,
  colors,
  move,
  moves,
  editingId,
  getTilePos,
  zoom,
  readableLabels,
  ss,
  layoutCache
}: LabelEmitterInput): LabelEmitter => {
  // Per-label geometry: resolves the live move-preview and the layout cache,
  // returning the chip centre (cx,cy) in tile space + layout. Both previews are
  // UI-only, and a label matched by either draws at the previewed tile/offset
  // instead of its model position.
  const resolveLabel = (label: Label) => {
    const preview = move && move.id === label.id ? move : moves?.[label.id] ?? null;
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
    let layout = layoutCache.get(key);
    if (!layout) {
      layout = measureLabelChip(
        measureCtx,
        label.text,
        fontSize,
        label.isBold,
        label.isItalic
      );
      if (layoutCache.size > 4096) layoutCache.clear();
      layoutCache.set(key, layout);
    }
    return { cx, cy, layout };
  };

  return {
    emit(label) {
      if (label.id === editingId) return false;
      const { cx, cy, layout } = resolveLabel(label);
      const linked = !!label.headerLink;
      const texKey = `label|${labelFontPx(label)}|${label.isBold ? 1 : 0}|${
        label.isItalic ? 1 : 0
      }|${label.isStrikethrough ? 1 : 0}|${label.isUnderline ? 1 : 0}|${
        linked ? 1 : 0
      }|${label.color || ''}|${label.backgroundColor || ''}|${
        label.backgroundOpacity ?? 1
      }|${colors.bg}|${colors.border}|${colors.text}|${label.text}`;
      const uv = b.putCanvas(texKey, 0, () =>
        rasterizeLabelChip(label, layout, colors, ss)
      );
      if (!uv) return false;
      const w = layout.chipW;
      const h = layout.chipH;
      // counterScaleFlag = 1: the "keep labels readable" factor grows the chip
      // about its centre when zoomed out (ADR 0015). R5/OVL-02: this chip's own
      // factor, from its own font size.
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
        labelCounterScaleFor(zoom, readableLabels, labelFontPx(label))
      );
      return true;
    }
  };
};
