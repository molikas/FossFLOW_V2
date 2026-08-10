import { ViewItem, Icon, ModelItem } from 'src/types';
import {
  PROJECTED_TILE_SIZE,
  DEFAULT_LABEL_HEIGHT,
  DEFAULT_FONT_FAMILY,
  DEFAULT_ICON,
  TOMBSTONE_ICON
} from 'src/config';
import { LABEL_BASE_FONT_PX, labelCounterScaleFor } from 'src/config/labelSettings';
import { decodeHtmlEntities } from 'src/utils/htmlToPlainText';
import { isLabelVisibleInPreview } from 'src/utils/previewLabelVisibility';
import { LABEL_LINK_COLOR } from 'src/utils/labelChip';
import { SpriteBatch, UVRect } from 'src/webgl/glSpriteBatch';
import { rasterizeNodeChip } from 'src/webgl/itemRaster';
import {
  getRenderedTilePosition,
  TilePositionFn
} from 'src/utils/renderedGeometry';

// ---------------------------------------------------------------------------
// Node sprites — dotted stalk, icon, name chip — for the merged bulk canvas
// (ADR 0038 §8). Lifted verbatim out of the pre-merge
// `NodesCanvas.buildInstances`; the icon cache stays with the component, because
// it is session state (decode/failure bookkeeping) rather than build state, and
// reaches this module through `getImage` / `iconPending` / `putIcon`.
// ---------------------------------------------------------------------------

/**
 * Label chip geometry that the DOM path (Label.tsx) reads from the live MUI theme
 * is derived from the SAME theme by the caller rather than hardcoded — otherwise
 * retuning theme.shape.borderRadius / spacing would silently desync the canvas
 * chip from the DOM chip.
 */
export interface ChipStyle {
  radius: number; // theme.shape.borderRadius × 2  (sx borderRadius: 2)
  padX: number; // theme.spacing(1.5)
  padY: number; // theme.spacing(1)
  bg: string; // palette.common.white
  border: string; // palette.grey[400]
  text: string; // palette.text.primary
}

/** Per-node label layout, measured once and reused across pan/zoom redraws. */
export interface NodeLabelLayout {
  nameFont: string;
  nameLineH: number;
  chipW: number;
  chipH: number;
}

// Label chip layout — mirrors ExpandableLabel/Label: maxWidth 250 (inner = 250 −
// 2·padX). The on-canvas label is the node's `name` only.
const LABEL_CHIP_MAX_W = 250;
const PROJ_W = PROJECTED_TILE_SIZE.width;

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

/** Compute the node-name text/chip layout. */
export const measureNodeLabel = (
  ctx: CanvasRenderingContext2D,
  name: string,
  fontSize: number,
  bold: boolean,
  italic: boolean,
  chip: ChipStyle
): NodeLabelLayout => {
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

export interface NodeEmitterInput {
  batch: SpriteBatch;
  itemsById: Map<string, ModelItem>;
  iconsById: Map<string, Icon>;
  getTilePos: TilePositionFn;
  isIso: boolean;
  inPreview: boolean;
  previewHideLabels: boolean;
  exportHideLabels: boolean;
  /** Label LOD band — `isNodeLabelDrawn(zoom, readableLabels)`. */
  drawLabels: boolean;
  zoom: number;
  readableLabels: boolean;
  chip: ChipStyle;
  measureCtx: CanvasRenderingContext2D | null;
  /** Chip supersample factor (dpr capped at 2, × CHIP_SUPERSAMPLE). */
  ss: number;
  layoutCache: Map<string, NodeLabelLayout>;
  /** A DECODED icon bitmap, or null while it is pending / given up on. */
  getImage(url: string): HTMLImageElement | null;
  /** Is this url still expected to arrive? (false once it is given up on.) */
  iconPending(url: string): boolean;
  /** Pack a decoded icon into the atlas (downscaled through a scratch canvas). */
  putIcon(b: SpriteBatch, url: string, img: HTMLImageElement): UVRect | null;
}

export interface NodeEmitterStats {
  labelsDrawn: number;
  linkedLabelsDrawn: number;
  /**
   * R3/GPU-01: false only while an icon is genuinely still coming. A url that has
   * been GIVEN UP on is resolved, not pending — one dangling reference must not
   * hold `data-all-icons-drawn` down for the session.
   */
  allIconsDrawn: boolean;
}

export interface NodeEmitter {
  /** Emits the node's sprites; false when it has no model item. */
  emit(node: ViewItem): boolean;
  readonly stats: NodeEmitterStats;
}

export const createNodeEmitter = ({
  batch: b,
  itemsById,
  iconsById,
  getTilePos,
  isIso,
  inPreview,
  previewHideLabels,
  exportHideLabels,
  drawLabels,
  zoom,
  readableLabels,
  chip,
  measureCtx,
  ss,
  layoutCache,
  getImage,
  iconPending,
  putIcon
}: NodeEmitterInput): NodeEmitter => {
  const stats: NodeEmitterStats = {
    labelsDrawn: 0,
    linkedLabelsDrawn: 0,
    allIconsDrawn: true
  };

  return {
    stats,
    emit(node) {
      const modelItem = itemsById.get(node.id);
      if (!modelItem) return false;

      const pos = getRenderedTilePosition(node, getTilePos, 'CENTER');

      const name = decodeHtmlEntities(modelItem.label ?? modelItem.name);
      const hasLabel =
        isLabelVisibleInPreview(
          node.showLabel !== false,
          inPreview,
          previewHideLabels
        ) &&
        !exportHideLabels &&
        Boolean(name);
      const labelHeight = node.labelHeight ?? DEFAULT_LABEL_HEIGHT;

      // ----- stalk (dotted, drawn first) -----
      if (hasLabel && labelHeight !== 0 && drawLabels) {
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
      const icon = resolveIcon(modelItem.icon, iconsById);
      const img = getImage(icon.url);
      if (icon.url && !img && iconPending(icon.url)) {
        stats.allIconsDrawn = false;
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
          } else if (isIso) {
            const w = PROJ_W * 0.7 * scale;
            const h = iconHeight(img, w);
            // ADR 0044: grow the flat icon about its scale-1 CENTRE — shift the
            // origin back by half the EXTRA sheared extent — so a resize expands
            // symmetrically instead of only down-and-right from the top-left
            // corner. scale-1 (dw=dh=0) is byte-for-byte unchanged.
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
      if (hasLabel && drawLabels && measureCtx) {
        stats.labelsDrawn += 1;
        const fontSize = node.labelFontSize || LABEL_BASE_FONT_PX;
        const labelBold = !!node.labelBold;
        const labelItalic = !!node.labelItalic;
        const labelStrike = !!node.labelStrikethrough;
        const linked = !!modelItem.headerLink;
        if (linked) stats.linkedLabelsDrawn += 1;
        const labelUnder = !!node.labelUnderline || linked;
        const textColor =
          node.labelColor || (linked ? LABEL_LINK_COLOR : chip.text);

        const layoutKey = `${fontSize}:${labelBold ? 1 : 0}:${
          labelItalic ? 1 : 0
        }:${name}`;
        let layout = layoutCache.get(layoutKey);
        if (!layout) {
          layout = measureNodeLabel(
            measureCtx,
            name,
            fontSize,
            labelBold,
            labelItalic,
            chip
          );
          if (layoutCache.size > 4096) layoutCache.clear();
          layoutCache.set(layoutKey, layout);
        }
        const { nameFont, nameLineH, chipW, chipH } = layout;

        // Content-keyed chip texture (theme colours are in the key, so a theme
        // change re-rasterises). Lazy factory: a cache hit skips rasterisation.
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
          // The chip scales with the label counter-scale (flag = 1), and since
          // R5/OVL-02 that factor is THIS label's — derived from its own font
          // size, not the module default. Packed into i_misc.w.
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
            1,
            0,
            0,
            labelCounterScaleFor(zoom, readableLabels, node.labelFontSize)
          );
        }
      }
      return true;
    }
  };
};
