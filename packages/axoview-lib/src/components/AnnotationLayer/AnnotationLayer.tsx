// AnnotationLayer — ephemeral free-draw overlay (ADR 0014).
//
// A single screen-space SVG covering the canvas. Strokes are stored in
// scene-canvas coordinates and drawn inside a <g> whose transform mirrors the
// SceneLayer (translate(rendererCenter + scroll) scale(zoom)) — updated by a
// direct store subscription so pan/zoom never re-renders React. Pointer events
// are captured ONLY while a draw tool is active and the overlay is shown, so
// normal canvas selection/pan keep working when the palette is open but idle.
//
// Nothing here ever touches the Model — strokes live only in uiState and are
// excluded from every save/export/zip path (asserted in annotationPersistence
// + projectZip tests).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { shallow } from 'zustand/shallow';
import { AnnotationStroke, AnnotationTool, Coords } from 'src/types';
import { generateId } from 'src/utils';
import {
  screenToSceneCanvas,
  polylinePathD,
  arrowHeadPoints,
  rectFromPoints,
  strokeHitByEraser
} from 'src/utils/annotationGeometry';
import {
  HIGHLIGHTER_OPACITY,
  HIGHLIGHTER_WIDTH_MULTIPLIER,
  ERASER_RADIUS_PX
} from 'src/config/annotationSettings';

const isShape = (tool: AnnotationStroke['tool']) =>
  tool === 'rectangle' || tool === 'ellipse';
const isSegment = (tool: AnnotationStroke['tool']) =>
  tool === 'line' || tool === 'arrow';

// Per-tool cursors (ADR 0014 polish): the cursor points at the action instead
// of a blanket crosshair. Custom SVGs for freehand/eraser (hotspot at the
// working tip); precise `crosshair` for shape/line tools. No `#` in the SVG so
// the data-URI stays valid inside url().
const svgCursor = (svg: string, hx: number, hy: number) =>
  `url("data:image/svg+xml;utf8,${svg}") ${hx} ${hy}, crosshair`;

const PENCIL_CURSOR = svgCursor(
  "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 24 24'><path d='M4 20l2.6-.6L17.4 8.6l-2-2L4.6 17.4 4 20z' fill='black' stroke='white' stroke-width='1.4' stroke-linejoin='round'/></svg>",
  5,
  26
);
const HIGHLIGHTER_CURSOR = svgCursor(
  "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30' viewBox='0 0 24 24'><path d='M5 19l3 1 9.5-9.5-4-4L4 16l1 3z' fill='gold' stroke='black' stroke-width='1.1'/></svg>",
  6,
  25
);

// The eraser deliberately has no OS cursor — the ghost circle (rendered in the
// SVG, sized to ERASER_RADIUS_PX) IS the cursor, so the user sees exactly how
// large the hit area is. See cursorForTool's default + the eraser render below.
const cursorForTool = (tool: AnnotationTool): string => {
  switch (tool) {
    case 'pencil':
      return PENCIL_CURSOR;
    case 'highlighter':
      return HIGHLIGHTER_CURSOR;
    case 'line':
    case 'arrow':
    case 'rectangle':
    case 'ellipse':
      return 'crosshair';
    default:
      return 'default';
  }
};

/**
 * Renders one committed/draft stroke as SVG. Always pointer-transparent — the
 * eraser hit-tests stroke geometry at the layer level (radius around the
 * cursor) rather than relying on a click landing on the thin drawn line.
 */
const StrokeShape = ({ stroke }: { stroke: AnnotationStroke }) => {
  const { tool, color, thickness, points } = stroke;
  const eraseProps = { style: { pointerEvents: 'none' as const } };
  const common = {
    stroke: color,
    strokeWidth: thickness,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...(tool === 'highlighter'
      ? {
          opacity: HIGHLIGHTER_OPACITY,
          strokeWidth: thickness * HIGHLIGHTER_WIDTH_MULTIPLIER
        }
      : {})
  };

  if (isShape(tool) && points.length >= 2) {
    const r = rectFromPoints(points[0], points[points.length - 1]);
    if (tool === 'rectangle') {
      return <rect x={r.x} y={r.y} width={r.width} height={r.height} {...common} {...eraseProps} />;
    }
    return (
      <ellipse
        cx={r.x + r.width / 2}
        cy={r.y + r.height / 2}
        rx={r.width / 2}
        ry={r.height / 2}
        {...common}
        {...eraseProps}
      />
    );
  }

  const d = polylinePathD(points);
  const head =
    tool === 'arrow' && points.length >= 2
      ? arrowHeadPoints(points[0], points[points.length - 1], thickness * 4)
      : [];

  return (
    <g {...eraseProps}>
      <path d={d} {...common} />
      {head.length === 2 && (
        <path
          d={`M ${head[0].x} ${head[0].y} L ${points[points.length - 1].x} ${points[points.length - 1].y} L ${head[1].x} ${head[1].y}`}
          {...common}
        />
      )}
    </g>
  );
};

export const AnnotationLayer = () => {
  const uiStoreApi = useUiStateStoreApi();
  const actions = useUiStateStore((s) => s.actions);
  const { open, tool, color, thickness, strokes } = useUiStateStore(
    (s) => ({
      open: s.annotation.open,
      tool: s.annotation.tool,
      color: s.annotation.color,
      thickness: s.annotation.thickness,
      strokes: s.annotation.strokes
    }),
    shallow
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement>(null);
  // draftRef is the source of truth for the in-progress stroke; `draft` state
  // only drives re-render. Commit happens OUTSIDE any setState updater so it
  // never double-runs under React StrictMode (which double-invokes updaters).
  const draftRef = useRef<AnnotationStroke | null>(null);
  const [draft, setDraft] = useState<AnnotationStroke | null>(null);
  const drawingRef = useRef(false);
  // Eraser: erasingRef tracks a held drag-erase; eraserCircleRef is the ghost
  // circle we move in screen-space (via setAttribute, no React re-render) so it
  // tracks the cursor smoothly even with many strokes mounted.
  const erasingRef = useRef(false);
  const eraserCircleRef = useRef<SVGCircleElement>(null);

  const setDraftBoth = useCallback((next: AnnotationStroke | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  // Strokes are visible whenever the overlay is open (the pen toggle). The
  // overlay only CAPTURES pointer input while a draw tool is active — in
  // `select` mode it's fully pass-through (canvas interactive), and `eraser`
  // mode lets clicks fall through except on the strokes themselves.
  const shown = open;
  const isDrawTool = tool !== 'select' && tool !== 'eraser';
  const capturing = shown && isDrawTool;
  const eraserActive = shown && tool === 'eraser';

  // Esc / V returns to Select while a draw or eraser tool is active — the quick
  // "stop drawing, let me interact" gesture (Excalidraw's V). Gated on a
  // non-select tool so Esc still closes the view-mode popover when not drawing.
  useEffect(() => {
    if (!shown || tool === 'select') return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)
      ) {
        return;
      }
      // 'v' returns to the select tool, but only as a bare keypress — Ctrl/Cmd/Alt+V
      // (paste and other shortcuts) must not reset the armed tool. Escape always resets.
      if (
        e.key === 'Escape' ||
        ((e.key === 'v' || e.key === 'V') && !e.ctrlKey && !e.metaKey && !e.altKey)
      ) {
        actions.setAnnotationTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, tool, actions]);

  // Whole-screen annotation (2026-07-22): while a draw/eraser tool is armed the
  // overlay lifts above the in-canvas docks (z-index below) so the entire canvas
  // region — panels included — becomes the drawing surface and its chrome goes
  // inert. The app TOP BAR is a separate bar ABOVE the canvas box, out of the
  // overlay's reach, so we bridge the armed state to the app (same window-event
  // channel as 'axoview-navigate-to-diagram') and it makes the toolbar inert.
  // The pen + palette sit above the lifted overlay, so exiting annotation stays
  // reachable at all times.
  useEffect(() => {
    const armed = capturing || eraserActive;
    window.dispatchEvent(
      new CustomEvent('axoview-annotation-capturing', {
        detail: { capturing: armed }
      })
    );
    return () => {
      // Re-enable the toolbar if the overlay unmounts mid-draw (mode switch).
      window.dispatchEvent(
        new CustomEvent('axoview-annotation-capturing', {
          detail: { capturing: false }
        })
      );
    };
  }, [capturing, eraserActive]);

  // While a draw/eraser tool is active, swallow LEFT-button mouse events AND all
  // touch events at the layer so they never reach the window-level interaction
  // manager (which would otherwise pan in preview's PAN mode, or select/drag a
  // node in edit — the "node grabbed but won't drop" bug, since the canvas drag
  // started on mousedown/touchstart but the matching up event was captured by
  // the overlay). React's stopPropagation can't stop a native `window` listener,
  // so we attach native listeners here. Right-button (pan) and wheel (zoom) are
  // left untouched, so mouse canvas navigation stays available while drawing;
  // touch has no right-button equivalent, so a draw/eraser tool fully locks the
  // canvas to touch — which is exactly the requested "lock node selection".
  useEffect(() => {
    const el = rootRef.current;
    if (!el || (!capturing && !eraserActive)) return;
    const stopLeftButton = (e: MouseEvent) => {
      if (e.button === 0) e.stopPropagation();
    };
    const stopLeftDrag = (e: MouseEvent) => {
      if (e.buttons & 1) e.stopPropagation();
    };
    // Touch carries no button info; swallow it wholesale so the canvas can't
    // pick up a node from under the overlay. Annotation drawing/erasing runs off
    // React pointer events, which are a separate event family and unaffected.
    const stopTouch = (e: TouchEvent) => e.stopPropagation();
    el.addEventListener('mousedown', stopLeftButton);
    el.addEventListener('mousemove', stopLeftDrag);
    el.addEventListener('mouseup', stopLeftButton);
    el.addEventListener('touchstart', stopTouch);
    el.addEventListener('touchmove', stopTouch);
    el.addEventListener('touchend', stopTouch);
    return () => {
      el.removeEventListener('mousedown', stopLeftButton);
      el.removeEventListener('mousemove', stopLeftDrag);
      el.removeEventListener('mouseup', stopLeftButton);
      el.removeEventListener('touchstart', stopTouch);
      el.removeEventListener('touchmove', stopTouch);
      el.removeEventListener('touchend', stopTouch);
    };
  }, [capturing, eraserActive]);

  // Mirror the SceneLayer transform onto the <g> via a direct store
  // subscription — pan/zoom updates the attribute without re-rendering React.
  useEffect(() => {
    const apply = () => {
      const g = gRef.current;
      if (!g) return;
      const { scroll, zoom, rendererSize } = uiStoreApi.getState();
      const tx = rendererSize.width / 2 + scroll.position.x;
      const ty = rendererSize.height / 2 + scroll.position.y;
      g.setAttribute('transform', `translate(${tx}, ${ty}) scale(${zoom})`);
    };
    apply();
    return uiStoreApi.subscribe((state, prev) => {
      if (
        state.scroll === prev.scroll &&
        state.zoom === prev.zoom &&
        state.rendererSize === prev.rendererSize
      ) {
        return;
      }
      apply();
    });
  }, [uiStoreApi, shown]);

  const toScene = useCallback(
    (e: React.PointerEvent): Coords => {
      const rect = rootRef.current!.getBoundingClientRect();
      const { scroll, zoom, rendererSize } = uiStoreApi.getState();
      return screenToSceneCanvas(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        rendererSize,
        scroll.position,
        zoom
      );
    },
    [uiStoreApi]
  );

  // Move the ghost eraser circle to the cursor (screen-space, direct DOM).
  const moveEraserCircle = useCallback((e: React.PointerEvent) => {
    const c = eraserCircleRef.current;
    if (!c) return;
    const rect = rootRef.current!.getBoundingClientRect();
    c.setAttribute('cx', `${e.clientX - rect.left}`);
    c.setAttribute('cy', `${e.clientY - rect.top}`);
    c.style.opacity = '1';
  }, []);

  // Erase every stroke whose geometry falls within the eraser radius of the
  // cursor. Reads strokes fresh from the store so a fast drag never re-tests
  // already-removed strokes against a stale render closure. The radius is fixed
  // in screen px, so it's divided by zoom to compare against scene-space strokes.
  const eraseAt = useCallback(
    (e: React.PointerEvent) => {
      const { zoom, annotation } = uiStoreApi.getState();
      const center = toScene(e);
      const radiusScene = ERASER_RADIUS_PX / zoom;
      annotation.strokes.forEach((s) => {
        if (strokeHitByEraser(s, center, radiusScene)) {
          actions.eraseAnnotationStroke(s.id);
        }
      });
    },
    [uiStoreApi, toScene, actions]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (eraserActive && e.button === 0) {
        e.stopPropagation();
        rootRef.current?.setPointerCapture(e.pointerId);
        erasingRef.current = true;
        moveEraserCircle(e);
        eraseAt(e);
        return;
      }
      if (!capturing || e.button !== 0) return;
      e.stopPropagation();
      rootRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const p = toScene(e);
      const drawTool = tool as AnnotationStroke['tool'];
      setDraftBoth({
        id: generateId(),
        tool: drawTool,
        color,
        thickness,
        points: isShape(drawTool) || isSegment(drawTool) ? [p, p] : [p]
      });
    },
    [
      capturing,
      eraserActive,
      toScene,
      tool,
      color,
      thickness,
      setDraftBoth,
      moveEraserCircle,
      eraseAt
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (eraserActive) {
        moveEraserCircle(e);
        if (erasingRef.current) eraseAt(e);
        return;
      }
      if (!drawingRef.current) return;
      const cur = draftRef.current;
      if (!cur) return;
      const p = toScene(e);
      const next =
        isShape(cur.tool) || isSegment(cur.tool)
          ? { ...cur, points: [cur.points[0], p] }
          : { ...cur, points: [...cur.points, p] };
      setDraftBoth(next);
    },
    [eraserActive, toScene, setDraftBoth, moveEraserCircle, eraseAt]
  );

  const endStroke = useCallback(() => {
    erasingRef.current = false;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const cur = draftRef.current;
    if (cur) {
      const isShapeOrSeg = isShape(cur.tool) || isSegment(cur.tool);
      // Drop zero-extent shapes/segments (a click without a drag).
      const hasExtent = isShapeOrSeg
        ? cur.points[0].x !== cur.points[1].x ||
          cur.points[0].y !== cur.points[1].y
        : cur.points.length >= 1;
      if (hasExtent) actions.addAnnotationStroke(cur);
    }
    setDraftBoth(null);
  }, [actions, setDraftBoth]);

  // Hide the ghost circle when the cursor leaves the overlay (moving onto the
  // palette / dock) so a stray circle doesn't linger off to the side.
  const hideEraserCircle = useCallback(() => {
    const c = eraserCircleRef.current;
    if (c) c.style.opacity = '0';
  }, []);

  if (!shown) return null;

  let layerCursor = 'default';
  if (capturing) layerCursor = cursorForTool(tool);
  // Eraser uses no OS cursor — the ghost circle is the cursor (see render).
  else if (eraserActive) layerCursor = 'none';

  return (
    <div
      ref={rootRef}
      data-axoview-id="annotation-layer"
      style={{
        position: 'absolute',
        inset: 0,
        // Capture pointers while drawing or erasing; in Select mode the layer is
        // fully pass-through so the canvas handles pointers normally. Right-drag
        // pan + wheel zoom always bubble to the window handlers (we only act on
        // left-button draws), so canvas navigation stays available while drawing.
        pointerEvents: capturing || eraserActive ? 'auto' : 'none',
        cursor: layerCursor,
        // Below the docks (z-index 20) when idle/select so pass-through hover +
        // panels work; ABOVE them while a draw tool is armed so the whole canvas
        // region — panels included — is one drawing surface and its chrome is
        // inert (whole-screen annotation, 2026-07-22). The pen + palette sit at a
        // still-higher z-index so they stay operable. See ADR 0014.
        zIndex: capturing || eraserActive ? 25 : 6,
        touchAction: 'none'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
      onPointerLeave={eraserActive ? hideEraserCircle : undefined}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        <g ref={gRef}>
          {strokes.map((s) => (
            <StrokeShape key={s.id} stroke={s} />
          ))}
          {draft && <StrokeShape stroke={draft} />}
        </g>
        {/* Ghost eraser circle — drawn in screen-space (outside the zoom-scaled
            <g>) so it stays a constant ERASER_RADIUS_PX on screen. Hidden until
            the first pointer move positions it. Shows the user exactly how large
            the erase hit area is. */}
        {eraserActive && (
          <circle
            ref={eraserCircleRef}
            cx={-9999}
            cy={-9999}
            r={ERASER_RADIUS_PX}
            fill="rgba(0, 0, 0, 0.06)"
            stroke="#000"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            style={{ opacity: 0, pointerEvents: 'none' }}
          />
        )}
      </svg>
    </div>
  );
};
