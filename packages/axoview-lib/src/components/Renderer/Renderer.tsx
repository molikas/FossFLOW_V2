import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Box } from '@mui/material';
import { useUiStateStore, useUiStateStoreApi } from 'src/stores/uiStateStore';
import { useInteractionManager } from 'src/interaction/useInteractionManager';
import {
  useCanvasMode,
  CanvasModeContextValue
} from 'src/contexts/CanvasModeContext';
import { Grid } from 'src/components/Grid/Grid';
import { Cursor } from 'src/components/Cursor/Cursor';
import { Nodes } from 'src/components/SceneLayers/Nodes/Nodes';
import { NodeLabelHitLayer } from 'src/components/SceneLayers/Nodes/NodeLabelHitLayer';
import { LabelHitLayer } from 'src/components/SceneLayers/Labels/LabelHitLayer';
import { Rectangles } from 'src/components/SceneLayers/Rectangles/Rectangles';
import { SceneCanvas } from 'src/components/SceneLayers/SceneCanvas';
import { isWebGL2Supported } from 'src/webgl/glSpriteBatch';
import { WebGLUnsupportedScreen } from 'src/components/Renderer/WebGLUnsupportedScreen';
import { Connectors } from 'src/components/SceneLayers/Connectors/Connectors';
import { ConnectorLabels } from 'src/components/SceneLayers/ConnectorLabels/ConnectorLabels';
import { TextBoxes } from 'src/components/SceneLayers/TextBoxes/TextBoxes';
import { SizeIndicator } from 'src/components/DebugUtils/SizeIndicator';
import { SceneLayer } from 'src/components/SceneLayer/SceneLayer';
import { TransformControlsManager } from 'src/components/TransformControlsManager/TransformControlsManager';
import { HoverOutline } from 'src/components/TransformControlsManager/HoverOutline';
import { HoverHitDebug } from 'src/components/DebugUtils/HoverHitDebug';
import { ConnectorAnchorOverlay } from 'src/components/ConnectorAnchorOverlay/ConnectorAnchorOverlay';
import { ElementLinkCard } from 'src/components/ElementLinkCard/ElementLinkCard';
import { Lasso } from 'src/components/Lasso/Lasso';
import { FreehandLasso } from 'src/components/FreehandLasso/FreehandLasso';
import { useScene } from 'src/hooks/useScene';
import { useInlineEditHistoryBracket } from 'src/hooks/useInlineEditHistoryBracket';
import { getFitToViewParams, CoordsUtils } from 'src/utils';
import { RendererProps } from 'src/types/rendererProps';
import { Scroll, Size, ViewItem } from 'src/types';

// Stable empty list so the canvas-node DOM hybrid overlay memo returns a
// referentially-stable value when nothing is selected (avoids re-renders).
const NO_HYBRID_NODES: ViewItem[] = [];

// Extra tiles of padding around the screen edges to avoid visible pop-in.
const VIEWPORT_TILE_PADDING = 4;

// Coalescing windows for the viewport-culling re-render during a continuous
// pan/zoom gesture (see the coarseBounds subscriber). A fast fling otherwise
// re-culls on most frames; these throttle it to a handful of times/sec off the
// per-frame path while keeping the cull current within VIEWPORT_TILE_PADDING.
const PAN_GESTURE_GAP_MS = 250; // scroll/zoom changes closer than this = one gesture
const PAN_BOUNDS_THROTTLE_MS = 180; // max cull cadence mid-gesture
const PAN_SETTLE_MS = 120; // flush the final cull this long after motion stops
/**
 * Delimiter for the joined-id primitives below (R4/RND-04). NUL, because an id
 * is an opaque string that an imported diagram may have minted anywhere, and a
 * comma in one used to split the key into fragments matching no id at all.
 */
const ID_KEY_SEP = '\u0000';

interface TileBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const computeTileBounds = (
  scroll: Scroll,
  zoom: number,
  rendererSize: Size,
  screenToTile: CanvasModeContextValue['screenToTile']
): TileBounds => {
  if (rendererSize.width === 0 || rendererSize.height === 0) {
    return { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
  }

  const corners = [
    { x: 0, y: 0 },
    { x: rendererSize.width, y: 0 },
    { x: 0, y: rendererSize.height },
    { x: rendererSize.width, y: rendererSize.height }
  ].map((mouse) => screenToTile({ mouse, zoom, scroll, rendererSize }));

  const xs = corners.map((t) => t.x);
  const ys = corners.map((t) => t.y);

  return {
    minX: Math.min(...xs) - VIEWPORT_TILE_PADDING,
    maxX: Math.max(...xs) + VIEWPORT_TILE_PADDING,
    minY: Math.min(...ys) - VIEWPORT_TILE_PADDING,
    maxY: Math.max(...ys) + VIEWPORT_TILE_PADDING
  };
};

const tileBoundsEqual = (a: TileBounds, b: TileBounds) =>
  a.minX === b.minX &&
  a.maxX === b.maxX &&
  a.minY === b.minY &&
  a.maxY === b.maxY;

// Returns `next` unless it is element-wise identical (same length, same item
// refs in order) to the previous result — in which case the previous array ref
// is reused. A coarseBounds change reallocates the filtered visible* arrays even
// when membership is unchanged (the common case when the whole diagram fits and
// a pan only shifts the bounds); reusing the ref lets the memoized connector
// layers and the SceneCanvas [nodes] effect bail instead of re-rendering /
// redrawing. Mirrors the in-render ref-cache pattern already used in SceneCanvas.
function useStableList<T>(next: T[]): T[] {
  const ref = useRef<T[]>(next);
  const prev = ref.current;
  if (
    prev !== next &&
    prev.length === next.length &&
    prev.every((p, i) => p === next[i])
  ) {
    return prev;
  }
  ref.current = next;
  return next;
}

export const Renderer = ({ showGrid, backgroundColor }: RendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionsRef = useRef<HTMLDivElement>(null);
  const uiStateApi = useUiStateStoreApi();
  const { screenToTile, getTilePosition } = useCanvasMode();
  const enableDebugTools = useUiStateStore((state) => state.enableDebugTools);
  const showCursor = useUiStateStore((state) => state.mode.showCursor);
  // While an annotation draw/eraser tool is active, the canvas cursor tile
  // highlight would sit under the pen and read as a stray selection — hide it.
  const annotationActive = useUiStateStore(
    (state) => state.annotation.open && state.annotation.tool !== 'select'
  );
  // QA 2026-07-19: over a hovered item in select mode, HoverOutline already draws
  // that item's box — the tile-cursor diamond on top of it reads as a confusing
  // SECOND box. Suppress the tile cursor there (it still shows on empty canvas for
  // placement targeting). hoveredItem is set/cleared per hover-move in CURSOR
  // mode (Cursor.ts), so it's accurate here.
  const hoveringItemInCursor = useUiStateStore(
    (state) => state.mode.type === 'CURSOR' && state.hoveredItem !== null
  );
  const uiStateActions = useUiStateStore((state) => state.actions);
  const { setInteractionsElement } = useInteractionManager();
  const {
    items,
    rectangles,
    connectors,
    hitConnectors,
    textBoxes,
    labels,
    currentView
  } = useScene();

  // Tile-space visible bounds — updated by the store subscriber (no React renders on pan/zoom
  // unless the tile range actually changes). Coarse equality means re-renders only fire when
  // the user pans far enough to expose new tiles, not on every pixel.
  const [coarseBounds, setCoarseBounds] = useState<TileBounds>(() => {
    const s = uiStateApi.getState();
    return computeTileBounds(s.scroll, s.zoom, s.rendererSize, screenToTile);
  });

  // Viewport-culling re-render, decoupled from the per-frame pan path.
  //
  // coarseBounds drives a React re-render of the connector/label layers and
  // hands SceneCanvas a fresh `visibleItems` array. Firing setCoarseBounds
  // synchronously on every scroll write re-rendered + re-culled on most frames
  // of a fast pan — and because this subscriber runs inside the pan rAF, right
  // next to the synchronous canvas repaint, those re-renders plus the
  // per-crossing array/Set allocations were the long-task bursts + heap churn on
  // large diagrams. So: an isolated change (zoom step, fit-to-view, programmatic
  // scroll, resize) culls immediately, but a continuous gesture (mouse pan, touch
  // pan, pinch — all detected generically as a rapid stream of changes) throttles
  // the cull off the per-frame path and always flushes once motion settles.
  // VIEWPORT_TILE_PADDING keeps already-rendered content on-screen during the
  // throttled window. This leaves the #54 synchronous canvas repaint untouched
  // (SceneCanvas keeps painting the committed set every frame), so no
  // cross-surface rubber-band returns.
  useEffect(() => {
    let lastChangeAt = 0;
    let lastCommitAt = 0;
    let pending: TileBounds | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const commit = (bounds: TileBounds) => {
      lastCommitAt = performance.now();
      pending = null;
      setCoarseBounds((cur) => (tileBoundsEqual(cur, bounds) ? cur : bounds));
    };

    const unsubscribe = uiStateApi.subscribe((state, prev) => {
      if (
        state.scroll === prev.scroll &&
        state.zoom === prev.zoom &&
        state.rendererSize === prev.rendererSize
      ) {
        return;
      }
      const newBounds = computeTileBounds(
        state.scroll,
        state.zoom,
        state.rendererSize,
        screenToTile
      );
      pending = newBounds;
      const now = performance.now();
      const continuous = now - lastChangeAt < PAN_GESTURE_GAP_MS;
      lastChangeAt = now;

      // Isolated change / gesture start → cull now. Mid-gesture → at most once
      // per PAN_BOUNDS_THROTTLE_MS so edges still populate without per-frame cost.
      if (!continuous || now - lastCommitAt >= PAN_BOUNDS_THROTTLE_MS) {
        commit(newBounds);
      }
      // Always (re)arm a trailing flush so the final viewport culls exactly once
      // the gesture stops, wherever the throttle last landed.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        if (pending) commit(pending);
      }, PAN_SETTLE_MS);
    });

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      unsubscribe();
    };
  }, [uiStateApi, screenToTile]);

  useEffect(() => {
    if (!containerRef.current || !interactionsRef.current) return;
    setInteractionsElement(interactionsRef.current);
    uiStateActions.setRendererEl(containerRef.current);
  }, [setInteractionsElement, uiStateActions]);

  // Fit-to-view on open (deferred). The loader sets pendingFitToView when a
  // diagram open requested fit but the renderer wasn't in the tree yet. Apply it
  // here in a useLayoutEffect, measuring the container SYNCHRONOUSLY via
  // getBoundingClientRect so the fit lands BEFORE the first paint even on the
  // very first mount — deterministic, no flash, and no race with a user/test
  // interacting right after load (the store rendererSize is set a frame later by
  // the async ResizeObserver, which is used only as a fallback trigger). Uses the
  // mode-aware getTilePosition so 2D centres correctly. The setScroll/setZoom also
  // re-cull + repaint at the final viewport.
  const pendingFitToView = useUiStateStore((state) => state.pendingFitToView);
  const rendererSizeForFit = useUiStateStore((state) => state.rendererSize);
  useLayoutEffect(() => {
    if (!pendingFitToView || !currentView) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const w = rect?.width || rendererSizeForFit.width;
    const h = rect?.height || rendererSizeForFit.height;
    if (w <= 0 || h <= 0) return; // not laid out yet — re-runs on rendererSize
    const { zoom, scroll } = getFitToViewParams(
      currentView,
      { width: w, height: h },
      getTilePosition
    );
    uiStateActions.setScroll({ position: scroll, offset: CoordsUtils.zero() });
    uiStateActions.setZoom(zoom);
    uiStateActions.setPendingFitToView(false);
  }, [
    pendingFitToView,
    currentView,
    rendererSizeForFit,
    getTilePosition,
    uiStateActions
  ]);

  const isShowGrid = useMemo(
    () => showGrid === undefined || showGrid,
    [showGrid]
  );

  // The whole bulk is drawn on the GPU by the single `SceneCanvas` — WebGL2 is
  // the sole render substrate (ADR 0038); a browser without it never reaches this
  // code path (the WebGLUnsupportedScreen gate below). Actively-manipulated nodes
  // are instead rendered by the DOM <Node> overlay (and skipped by the canvas) so
  // they keep the DOM affordances the canvas can't cheaply replicate: the F2
  // inline-rename contentEditable, and the `--ff-drag` compositor drag preview
  // (DragItems mutates `[data-drag-id]`, which only the DOM path has). Every
  // signal is sparse, so the bulk spawn path is pure canvas. Dragging the node in
  // DOM (rather than redrawing it on the canvas per preview frame) is how the
  // hybrid gets a correct, compositor-only drag preview for free.
  //
  // **SELECTION DOES NOT PROMOTE** (R4/RND-13/15; owner ruling on the GPU-13
  // brief §7 Q1, ADR 0038 §8). A promoted element is a DOM sibling of the merged
  // canvas, so it can only paint ABOVE or BELOW the entire canvas — never in its
  // own place in the document order. Lifting a node on selection therefore reads
  // as an accidental "bring to front" that no z-order command issued, and it
  // inverts ADR 0031 §2 (a floating Label paints above nodes) for whichever node
  // is selected. Selecting now changes nothing about paint order; only the
  // selection CHROME floats (TransformControlsManager's handles and outline,
  // which are their own overlays and always did).
  //
  // The rename session is what promotes a node now, and it is store state
  // (`inlineEditNodeId`) rather than the synchronous `inlineEditNodeName` window
  // event — a node that has not mounted yet cannot hear an event.
  const inlineEditNodeId = useUiStateStore((s) => s.inlineEditNodeId);
  // Joined dragged-ITEM ids (a primitive, so the selector re-renders only on
  // drag start/end, not per drag frame — mode.items is set once at entry).
  //
  // R4/RND-04: the delimiter was a COMMA, and an id is an opaque string —
  // `generateId()` produces UUIDs, but an IMPORTED diagram carries whatever ids
  // its author's tool minted. One containing a comma split into fragments that
  // matched no id, so the node was never promoted to the DOM overlay and had no
  // drag preview at all. NUL cannot appear in an id from any real source, and
  // the join/split is a re-render optimisation rather than a data structure, so
  // the delimiter is free to be one no id can contain.
  const draggingKey = useUiStateStore((s) =>
    s.mode.type === 'DRAG_ITEMS'
      ? s.mode.items
          .filter((i) => i.type === 'ITEM')
          .map((i) => i.id)
          .join(ID_KEY_SEP)
      : ''
  );
  // Track P (T6 fix): a canvas node whose NAME label is being dragged is promoted
  // to the DOM overlay too, so the label follows the pointer in DOM (a single-node
  // CSS-preview re-render) instead of a per-frame model write redrawing the whole
  // canvas. A primitive id selector → re-renders only on label-drag start/end.
  const labelDragId = useUiStateStore((s) => s.labelDrag?.id ?? null);
  // ADR 0044: nodes being icon-resized are promoted to the DOM overlay so their
  // ICONS preview the live scale (NodeContent reads iconScaleDrag). The single
  // selected node already is (selectedNodeId), but a GROUP resize leaves
  // itemControls null, so its members otherwise stay on the WebGL bulk — which
  // reads the COMMITTED scale — and only the boxes previewed, not the icons. A
  // primitive key (targets are set once at grab) → re-renders only on resize
  // start/end, not per frame.
  const resizingNodesKey = useUiStateStore((s) =>
    s.mode.type === 'NODE.TRANSFORM'
      ? s.mode.targets.map((t) => t.id).join(ID_KEY_SEP)
      : ''
  );
  // Rectangle GPU-fold (2026-07-08): the DRAGGED rectangles keep their DOM
  // [data-drag-id] element (DragItems mutates --ff-drag on it for the live
  // move preview); everything else draws on the WebGL SceneCanvas. Picking
  // + resize handles are geometric / separate overlays, so the bulk needs no DOM.
  const draggingRectKey = useUiStateStore((s) =>
    s.mode.type === 'DRAG_ITEMS'
      ? s.mode.items
          .filter((i) => i.type === 'RECTANGLE')
          .map((i) => i.id)
          .join(ID_KEY_SEP)
      : ''
  );
  // ADR 0034: the text box being edited inline is promoted ABOVE the
  // interactions box (same reasoning as the hybrid nodes / label hit layers —
  // below it "the box ate every press"), so its Quill editor receives pointer
  // events. The lower TextBoxes layer skips it so it isn't drawn twice.
  const editingTextBoxId = useUiStateStore((s) => s.editingTextBoxId);
  // One history entry per on-canvas edit session (TXT-04/07/08). Owned HERE
  // because the promotion above unmounts and remounts the edited box, so a
  // bracket owned by that component would close itself the instant the session
  // began — see the hook's own note.
  useInlineEditHistoryBracket();
  const restingTextBoxes = useMemo(
    () =>
      editingTextBoxId
        ? textBoxes.filter((t) => t.id !== editingTextBoxId)
        : textBoxes,
    [textBoxes, editingTextBoxId]
  );
  const editingTextBoxes = useMemo(
    () =>
      editingTextBoxId
        ? textBoxes.filter((t) => t.id === editingTextBoxId)
        : null,
    [textBoxes, editingTextBoxId]
  );

  const hybridIds = useMemo(() => {
    if (!inlineEditNodeId && !draggingKey && !labelDragId && !resizingNodesKey)
      return null;
    const ids = new Set<string>();
    if (inlineEditNodeId) ids.add(inlineEditNodeId);
    if (draggingKey) for (const id of draggingKey.split(ID_KEY_SEP)) ids.add(id);
    if (labelDragId) ids.add(labelDragId);
    if (resizingNodesKey)
      for (const id of resizingNodesKey.split(ID_KEY_SEP)) ids.add(id);
    return ids;
  }, [inlineEditNodeId, draggingKey, labelDragId, resizingNodesKey]);

  const visibleItemsRaw = useMemo(() => {
    const { minX, maxX, minY, maxY } = coarseBounds;
    if (minX === -Infinity) return items; // bounds not yet computed
    return items.filter(
      (item) =>
        // R4/RND-14 (ruled 2026-07-30 — "adopt reveal-then-act", cheap form):
        // a PROMOTED id bypasses the viewport cull. A keyboard command on an
        // off-screen selection — F2, the z-order chords, the arrow nudge — used
        // to act on a node the cull had removed from `visibleItems`, so its DOM
        // overlay never mounted and the command was a silent no-op. VS Code,
        // Figma, Miro and Finder all reveal before acting; a silent no-op is the
        // worst of the options. Keeping the promoted node mounted is what makes
        // the command land; scrolling the viewport to it is the expensive half
        // the ruling explicitly deferred.
        hybridIds?.has(item.id) ||
        (item.tile.x >= minX &&
          item.tile.x <= maxX &&
          item.tile.y >= minY &&
          item.tile.y <= maxY)
    );
  }, [items, coarseBounds, hybridIds]);
  // Keep the same array ref when a bounds change exposed no new node, so the
  // connector layers + the SceneCanvas [nodes] effect bail (see useStableList).
  const visibleItems = useStableList(visibleItemsRaw);

  // The selected node, lifted out of the canvas into a DOM <Node> overlay (see
  // selectedNodeId). Referentially stable (NO_HYBRID_NODES) when nothing is
  // selected so the canvas + overlay don't re-render on unrelated state.
  const hybridNodes = useMemo(() => {
    if (!hybridIds) return NO_HYBRID_NODES;
    const found = visibleItems.filter((item) => hybridIds.has(item.id));
    return found.length > 0 ? found : NO_HYBRID_NODES;
  }, [hybridIds, visibleItems]);

  // Canvas-drawn nodes (everything not lifted into the DOM overlay) — their
  // labels get invisible drag hit targets so they can be repositioned without
  // selecting first (ADR 0024, label-as-handle). The selected/dragged nodes keep
  // their own DOM label handle.
  const canvasLabelNodes = useMemo(() => {
    if (!hybridIds) return visibleItems;
    return visibleItems.filter((item) => !hybridIds.has(item.id));
  }, [hybridIds, visibleItems]);

  const visibleConnectorsRaw = useMemo(() => {
    const { minX, maxX, minY, maxY } = coarseBounds;
    if (minX === -Infinity) return connectors;
    // Use hitConnectors (which carry path data) to cull off-screen connectors,
    // then return the corresponding raw connectors for rendering.
    const visibleIds = new Set(
      hitConnectors
        .filter((connector) => {
          if (!connector.path?.rectangle) return true;
          const { from, to } = connector.path.rectangle;
          const cMinX = Math.min(from.x, to.x);
          const cMaxX = Math.max(from.x, to.x);
          const cMinY = Math.min(from.y, to.y);
          const cMaxY = Math.max(from.y, to.y);
          return (
            cMaxX >= minX && cMinX <= maxX && cMaxY >= minY && cMinY <= maxY
          );
        })
        .map((c) => c.id)
    );
    return connectors.filter((c) => visibleIds.has(c.id));
  }, [connectors, hitConnectors, coarseBounds]);
  // Reuse the same array ref when the visible connector set is unchanged across
  // a bounds shift, so Connectors / ConnectorLabels memo-bail (see useStableList).
  const visibleConnectors = useStableList(visibleConnectorsRaw);

  // Connector GPU-fold (2026-07-08): the bulk connector BODIES draw on the merged
  // canvas; only a sparse set keeps the DOM/SVG <Connector> — the DEGENERATE
  // 1-tile connectors (the dot cue) and the UNROUTABLE ones (the error badge),
  // neither of which the bulk can draw at all (it needs ≥2 path tiles). Picking
  // is geometric (getItemAtTile over hitConnectors), so the bulk needs no DOM.
  //
  // **SELECTED connectors are no longer promoted** (R4/RND-13/15 + ADR 0038 §8).
  // The promotion existed for the S3/A2 selection halo, which is DOM-only in
  // `<Connector>` — and with one merged canvas a promoted connector would paint
  // above every node instead of below them, i.e. selection would restack the
  // document, which is the thing order-preserving selection forbids. The halo is
  // emitted by the connector emitter instead, in the connector's own place in the
  // paint order, with the same 3.5×/0.35 metrics.
  const connectorHybridIds = useMemo(() => {
    const ids = new Set<string>();
    for (const hc of hitConnectors) {
      if (hc.unroutable || (hc.path?.tiles && hc.path.tiles.length < 2))
        ids.add(hc.id);
    }
    return ids;
  }, [hitConnectors]);
  const domConnectors = useMemo(
    () => visibleConnectors.filter((c) => connectorHybridIds.has(c.id)),
    [visibleConnectors, connectorHybridIds]
  );
  const canvasConnectors = useMemo(
    () =>
      connectorHybridIds.size === 0
        ? visibleConnectors
        : visibleConnectors.filter((c) => !connectorHybridIds.has(c.id)),
    [visibleConnectors, connectorHybridIds]
  );

  // Floating Labels (ADR 0031) — viewport-culled like nodes; layer-visibility +
  // zIndex sort happen inside SceneCanvas / LabelHitLayer.
  const visibleLabelsRaw = useMemo(() => {
    const { minX, maxX, minY, maxY } = coarseBounds;
    if (minX === -Infinity) return labels;
    return labels.filter(
      (label) =>
        label.tile.x >= minX &&
        label.tile.x <= maxX &&
        label.tile.y >= minY &&
        label.tile.y <= maxY
    );
  }, [labels, coarseBounds]);
  const visibleLabels = useStableList(visibleLabelsRaw);

  const rectHybridIds = useMemo(
    () => (draggingRectKey ? new Set(draggingRectKey.split(ID_KEY_SEP)) : null),
    [draggingRectKey]
  );
  const domRectangles = useMemo(
    () =>
      rectHybridIds
        ? rectangles.filter((r) => rectHybridIds.has(r.id))
        : ([] as typeof rectangles),
    [rectHybridIds, rectangles]
  );
  const canvasRectangles = useMemo(
    () =>
      rectHybridIds
        ? rectangles.filter((r) => !rectHybridIds.has(r.id))
        : rectangles,
    [rectHybridIds, rectangles]
  );

  // WebGL2 is the sole render substrate (Phase C): a browser without it can't
  // draw the bulk layers at all, so gate the whole canvas area behind the
  // unsupported-browser Screen instead of rendering an empty canvas. Placed
  // AFTER every hook above so React's hook order stays stable across the gate.
  if (!isWebGL2Supported()) return <WebGLUnsupportedScreen />;

  return (
    <Box
      ref={containerRef}
      data-testid="axoview-canvas"
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        // Touch/pen gesture guardrails (ADR 0018 Decision 7). On the container
        // (rendererEl) so they also cover the sibling anchor/label SceneLayers,
        // and scoped to the canvas so page scroll elsewhere is unaffected.
        // The canvas owns pan/zoom for touch (one-finger pan, two-finger pinch),
        // so the browser's native pan/zoom/double-tap must be disabled here.
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        bgcolor: (theme) =>
          backgroundColor === 'transparent'
            ? 'transparent'
            : (backgroundColor ?? theme.customVars.customPalette.diagramBg)
      }}
    >
      {/* The GRID is the backdrop and mounts FIRST now.
          Before the merge it sat between RectanglesCanvas and ConnectorsCanvas,
          so grid lines painted over grouping-rectangle fills but under
          everything else — a position that only existed because there were four
          canvases to sit between. With one bulk canvas the grid is either under
          all content or over all of it, and under is what a backdrop means
          (and what every other tool does). */}
      <Box
        sx={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          top: 0,
          left: 0
        }}
      >
        {isShowGrid && <Grid />}
      </Box>
      {/* THE bulk canvas — rectangles, connectors, nodes and floating Labels in
          ONE WebGL2 context, ordered by one sort (R3/GPU-13, ADR 0038 §8). Mount
          order carries no ordering meaning any more; the sort key does. */}
      <SceneCanvas
        rectangles={canvasRectangles}
        connectors={canvasConnectors}
        nodes={visibleItems}
        skipNodes={hybridNodes}
        labels={visibleLabels}
      />
      {/* The DOM <Rectangles> keeps only the DRAGGED rect (its [data-drag-id] is
          what DragItems mutates for the live move preview) and the DOM
          <Connectors> only the degenerate-dot and unroutable-badge cues, which
          the bulk cannot draw at all. Both float above the canvas — a promoted
          element always can only be above or below the whole of it — which is
          why SELECTION no longer promotes anything (see hybridIds). */}
      <SceneLayer>
        <Rectangles rectangles={domRectangles} />
      </SceneLayer>
      <SceneLayer>
        <Connectors connectors={domConnectors} currentView={currentView} />
      </SceneLayer>
      <SceneLayer>
        <Lasso />
      </SceneLayer>
      <FreehandLasso />
      {showCursor && !annotationActive && !hoveringItemInCursor && (
        <SceneLayer>
          <Cursor />
        </SceneLayer>
      )}
      <SceneLayer>
        <TextBoxes textBoxes={restingTextBoxes} />
      </SceneLayer>
      {enableDebugTools && (
        <SceneLayer>
          <SizeIndicator />
        </SceneLayer>
      )}
      {/* Interaction layer: this is where events are detected */}
      <Box
        ref={interactionsRef}
        data-axoview-id="canvas-interactions"
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%'
        }}
      />
      {/* Floating Labels (ADR 0031) are drawn by the merged canvas above; ADR
          0031 §2's "a Label paints above nodes" is now the `label` TYPE RANK in
          `compareSceneDrawOrder`, not this layer's mount position. Only the
          pixel-accurate DOM hit-proxy remains here. */}
      <SceneLayer>
        <LabelHitLayer labels={visibleLabels} />
      </SceneLayer>
      <SceneLayer>
        <NodeLabelHitLayer nodes={canvasLabelNodes} />
      </SceneLayer>
      {/* Connector labels render ABOVE the interactions box (like
          NodeLabelHitLayer) so a press on a label chip targets the label —
          its onPointerDown + stopPropagation then own the gesture. Below the
          interactions box the box ate every press, so label drag/select did
          nothing and the connector got dragged instead. */}
      <SceneLayer>
        <ConnectorLabels connectors={visibleConnectors} />
      </SceneLayer>
      {hybridNodes.length > 0 && (
        <SceneLayer>
          <Nodes nodes={hybridNodes} />
        </SceneLayer>
      )}
      <SceneLayer>
        <ConnectorAnchorOverlay />
      </SceneLayer>
      <SceneLayer>
        <HoverOutline />
        {/* Debug tool (ADR 0023 follow-up): cursor point + rendered footprint
            centres, the two things off-grid hit-testing compares. */}
        {enableDebugTools && <HoverHitDebug />}
      </SceneLayer>
      <SceneLayer>
        <TransformControlsManager />
      </SceneLayer>
      {/* The inline-edited text box (ADR 0034) — promoted above the
          interactions box for the duration of the edit session so the mounted
          Quill editor owns its pointer events. Mounted ABOVE the transform
          controls too (2026-07-04): the resize anchors stay visible during the
          session, but where one overlaps the (often small) box, the TEXT wins
          the click — caret placement beats resize; each anchor's outer half
          sticks out past the box edge and stays grabbable. */}
      {editingTextBoxes && editingTextBoxes.length > 0 && (
        <SceneLayer>
          <TextBoxes textBoxes={editingTextBoxes} />
        </SceneLayer>
      )}
      {/* Element-level link card (ADR 0034 addendum 2026-07-05): Ctrl+K while
          inline-renaming a floating Label / node name / connector label pops
          the same inline link UI text boxes have — targeting the element's
          headerLink. Body-portaled Popper; mounted once here for store
          access. */}
      <ElementLinkCard />
    </Box>
  );
};
