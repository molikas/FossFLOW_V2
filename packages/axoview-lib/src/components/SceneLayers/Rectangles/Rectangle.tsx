import React, { memo, useMemo } from 'react';
import { useScene } from 'src/hooks/useScene';
import { IsoTileArea } from 'src/components/IsoTileArea/IsoTileArea';
import { getColorVariant } from 'src/utils';
import { useColor } from 'src/hooks/useColor';
import {
  RENDERED_DRAG_TRANSFORM,
  getRenderedDragTransform
} from 'src/utils/renderedGeometry';

type Props = ReturnType<typeof useScene>['rectangles'][0];

// Compositor drag wrapper (RECT-1). DragItems mutates --ff-drag-dx/dy on the
// [data-drag-id] element during a move; this one translate3d moves the whole
// rectangle on the GPU — no React re-render and no full-area <rect> repaint per
// frame (the big-square drag cliff: the rect is positioned via left/top, so a
// per-frame model write forced a real repaint scaling with its pixel area).
// The wrapper is a zero-offset positioned anchor, so the IsoTileArea <Svg> inside
// keeps its own left/top positioning — the transform only adds the drag delta.
const RECT_DRAG_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  transform: RENDERED_DRAG_TRANSFORM,
  willChange: 'transform'
};

export const Rectangle = memo(
  ({
    id,
    from,
    to,
    color: colorId,
    customColor,
    offset,
    borderColor,
    borderWidth,
    borderStyle,
    fillOpacity,
    borderOpacity
  }: Props) => {
    const predefinedColor = useColor(colorId);

    // Use custom color if provided, otherwise use the predefined color value.
    const colorValue = customColor ? customColor : predefinedColor?.value;
    // ADR 0039 addendum (STYL-03, owner 2026-07-30): "no fill" is an ABSENT
    // colour — the strip clears both `customColor` and the legacy `color`
    // preset. The `'transparent'` sentinel is still READ (diagrams written
    // before the ruling carry it) and means the same thing. Either way the area
    // keeps a visible grey outline so it stays seen and selectable
    // (SVG fill="transparent" stays hit-testable).
    const isTransparent = !colorValue || colorValue === 'transparent';

    // ADR 0023 off-grid: compose the SceneLayer-px offset into the SAME
    // translate3d that hosts the live drag delta, so they add (the IsoTileArea
    // inside still positions from the integer from/to). Snapped rectangles keep
    // the shared module-const style (referential stability for emotion).
    const dragStyle = useMemo(
      () =>
        offset
          ? {
              ...RECT_DRAG_STYLE,
              transform: getRenderedDragTransform(offset)
            }
          : RECT_DRAG_STYLE,
      [offset?.x, offset?.y] // eslint-disable-line react-hooks/exhaustive-deps
    );

    // Memoise the chroma-derived stroke variant so it isn't recomputed on every
    // render (the chroma pipeline is unmemoised). Keyed on the colour string.
    // Border: explicit overrides win; otherwise fall back to the legacy look
    // (grey outline for a transparent rect, else a darker shade of the fill).
    const strokeColor = useMemo(() => {
      if (borderColor) return borderColor;
      if (isTransparent) return '#9e9e9e';
      return colorValue ? getColorVariant(colorValue, 'dark', { grade: 2 }) : '';
    }, [colorValue, isTransparent, borderColor]);

    const strokeWidth = borderWidth ?? (isTransparent ? 2 : 1);
    const dashArray = useMemo(() => {
      if (borderStyle === 'DASHED') return `${strokeWidth * 3} ${strokeWidth * 2}`;
      if (borderStyle === 'DOTTED') return `${strokeWidth} ${strokeWidth * 2}`;
      return undefined;
    }, [borderStyle, strokeWidth]);

    return (
      <div data-drag-id={id} style={dragStyle}>
        <IsoTileArea
          from={from}
          to={to}
          fill={isTransparent ? 'transparent' : colorValue}
          fillOpacity={fillOpacity}
          cornerRadius={22}
          stroke={{
            color: strokeColor,
            width: strokeWidth,
            dashArray,
            opacity: borderOpacity
          }}
        />
      </div>
    );
  }
);
