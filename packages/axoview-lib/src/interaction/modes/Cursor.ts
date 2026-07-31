import { produce } from 'immer';
import {
  ConnectorAnchor,
  SceneConnector,
  ModeActions,
  ModeActionsAction,
  Coords,
  View,
  ItemReference,
  State
} from 'src/types';
import {
  getItemAtTile,
  hasMovedTile,
  getAnchorAtTile,
  getItemByIdOrThrow,
  generateId,
  CoordsUtils,
  getAnchorTile,
  connectorPathTileToGlobal,
  setWindowCursor
} from 'src/utils';
import { getConnectorWaypointRefs } from 'src/utils/connectorSelection';
import { exceedsTapSlop } from 'src/config/tapGesture';
import { cursorCanvasPoint } from 'src/utils/coordinateTransforms';

// hitConnectors elements merge the view connector (id, anchors) with the
// scene connector (path) — richer than the bare SceneConnector type.
type HitConnector = State['scene']['hitConnectors'][number];

// Set true by mousedown when Alt+click splices a waypoint, consumed by the
// subsequent mouseup so it bypasses its selection-clearing branches (the
// click was already handled; the selection should be preserved). Module-level
// instead of mode-state to avoid widening CursorMode for a transient flag.
let altSpliceConsumed = false;
import { useScene } from 'src/hooks/useScene';

// Returns the effective tile for an anchor for hit-detection purposes.
// For node-attached endpoints (first/last anchor with ref.item), uses the path junction tile
// so the handle is detectable at the same position it's visually rendered (not under the node).
const getAnchorHitTile = (
  anchor: ConnectorAnchor,
  index: number,
  totalAnchors: number,
  connector: SceneConnector,
  view: View
): Coords => {
  const isEndpoint = index === 0 || index === totalAnchors - 1;
  if (isEndpoint && anchor.ref.item && connector.path?.tiles?.length) {
    const pathTile =
      index === 0
        ? connector.path.tiles[0]
        : connector.path.tiles[connector.path.tiles.length - 1];
    return connectorPathTileToGlobal(pathTile, connector.path.rectangle.from);
  }
  return getAnchorTile(anchor, view);
};

// Exported for the off-path-fallback regression test (F2). Ordering a new
// waypoint by the nearest path tile — rather than throwing on an inexact grab —
// is the invariant the test pins.
export const getAnchorOrdering = (
  anchor: ConnectorAnchor,
  connector: SceneConnector,
  view: View
) => {
  const anchorTile = getAnchorTile(anchor, view);
  const { tiles } = connector.path;
  const from = connector.path.rectangle.from;

  const exact = tiles.findIndex((pathTile) =>
    CoordsUtils.isEqual(connectorPathTileToGlobal(pathTile, from), anchorTile)
  );
  if (exact !== -1) return exact;

  // Off-path grab: the mousedown tile sits on the connector's hit area but not
  // on an exact path tile (rounding / hit halo). Rather than throw in this hot
  // mousemove path — which left the mode stuck in CURSOR and re-threw every
  // frame — order the new waypoint by the NEAREST path tile so it can still be
  // inserted; it then follows the cursor as the drag continues.
  let bestIndex = 0;
  let bestDist = Infinity;
  tiles.forEach((pathTile, i) => {
    const g = connectorPathTileToGlobal(pathTile, from);
    const dist = (g.x - anchorTile.x) ** 2 + (g.y - anchorTile.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  });
  return bestIndex;
};

const getAnchor = (
  connectorId: string,
  tile: Coords,
  scene: ReturnType<typeof useScene>
) => {
  // hitConnectors includes merged scene path data needed for getAnchorOrdering.
  const connector = getItemByIdOrThrow(scene.hitConnectors, connectorId).value;
  const anchor = getAnchorAtTile(tile, connector.anchors);

  if (!anchor) {
    const newAnchor: ConnectorAnchor = {
      id: generateId(),
      ref: { tile }
    };

    const orderedAnchors = [...connector.anchors, newAnchor]
      .map((anch) => {
        return {
          ...anch,
          ordering: getAnchorOrdering(anch, connector, scene.currentView)
        };
      })
      .sort((a, b) => {
        return a.ordering - b.ordering;
      });

    scene.updateConnector(connector.id, { anchors: orderedAnchors });
    return newAnchor;
  }

  return anchor;
};

// Set the CURSOR mode's transient mousedown bookkeeping. The CURSOR guard
// re-narrows uiState.mode for the immer draft (callers always run after the
// handler's own guard, so it never returns early in practice).
const setMousedownBookkeeping = (
  { uiState }: State,
  mousedownItem: ItemReference | null,
  mousedownHandled: boolean
) => {
  if (uiState.mode.type !== 'CURSOR') return;
  uiState.actions.setMode(
    produce(uiState.mode, (draft) => {
      draft.mousedownItem = mousedownItem;
      draft.mousedownHandled = mousedownHandled;
    })
  );
};

// ─── mousedown helpers ──────────────────────────────────────────────────────

// Resolve a click to one of the selected connector's anchors. P2: a connector's
// endpoint anchors (attached to nodes) sit on the same tile as the node, so the
// generic getItemAtTile would return the node first and make the endpoint
// unreachable — this runs before that lookup.
//
// Prefer DOM-driven anchor identification (targetAnchorId, set by
// useInteractionManager from data-anchor-id on the hit element) — the visible
// waypoint + its hit ring extends beyond one tile, so a tile-equality check
// rejects valid clicks near tile boundaries or at low zoom. Fall back to the
// tile match for non-DOM hits (e.g. clicking the connector path body, or in
// tests that bypass the overlay). Returns the matched anchor + index, or null.
const findClickedConnectorAnchor = (
  connector: HitConnector,
  uiState: State['uiState'],
  view: View
): { anchor: ConnectorAnchor; index: number } | null => {
  const totalAnchors = connector.anchors.length;
  const targetAnchorId = uiState.mouse.targetAnchorId;
  for (let index = 0; index < connector.anchors.length; index++) {
    const anchor = connector.anchors[index];
    if (targetAnchorId) {
      if (anchor.id === targetAnchorId) return { anchor, index };
      continue;
    }
    const hitTile = getAnchorHitTile(
      anchor,
      index,
      totalAnchors,
      connector,
      view
    );
    if (CoordsUtils.isEqual(hitTile, uiState.mouse.position.tile)) {
      return { anchor, index };
    }
  }
  return null;
};

// Apply the gesture for a click landing on one of the selected connector's
// anchors.
const handleConnectorAnchorMousedown = (
  state: State,
  connector: HitConnector,
  anchor: ConnectorAnchor,
  index: number
) => {
  const { uiState, scene } = state;
  const isEndpoint = index === 0 || index === connector.anchors.length - 1;
  if (isEndpoint) {
    // Endpoint: enter click-to-reconnect mode. Much more reliable than drag
    // on a discrete tile grid, especially with large block node icons.
    uiState.actions.setMode({
      type: 'RECONNECT_ANCHOR',
      showCursor: true,
      connectorId: connector.id,
      anchorId: anchor.id,
      anchorIndex: index
    });
    return;
  }

  // Waypoint: Alt+click removes it; plain click starts a drag. Removal is the
  // direct gesture (no menu) because right-click is already overloaded by
  // rightClickPan + NodeActionBar. The connector's first/last anchors stay
  // intact — only middle (free-floating) waypoints can be removed this way.
  const altHeld = uiState.mouse.modifiers?.alt;
  if (altHeld) {
    const nextAnchors = connector.anchors.filter((a) => a.id !== anchor.id);
    scene.updateConnector(connector.id, { anchors: nextAnchors });
    // Flag this for the subsequent mouseup so it doesn't run the
    // empty-canvas-click branch and clear the selection.
    altSpliceConsumed = true;
    setMousedownBookkeeping(state, null, true);
  } else {
    setMousedownBookkeeping(
      state,
      { type: 'CONNECTOR_ANCHOR', id: anchor.id },
      true
    );
  }
};

// When a connector is selected, give its anchors first claim on the click.
// Returns true if the click was consumed (caller stops), false to fall through
// to generic item hit-detection.
const handleSelectedConnectorMousedown = (state: State): boolean => {
  const { uiState, scene } = state;
  const itemControls = uiState.itemControls;
  if (!itemControls || itemControls.type !== 'CONNECTOR') return false;

  const selectedConnector = scene.hitConnectors.find(
    (c) => c.id === itemControls.id
  );
  if (!selectedConnector) return false;

  const clicked = findClickedConnectorAnchor(
    selectedConnector,
    uiState,
    scene.currentView
  );
  if (!clicked) return false;

  handleConnectorAnchorMousedown(
    state,
    selectedConnector,
    clicked.anchor,
    clicked.index
  );
  return true;
};

// #1: Alt+click a connector waypoint removes it WITHOUT the connector being
// pre-selected (ADR 0022 §1 / locked decision #4). The selected-connector path
// above already handles Alt+click on the *selected* connector (DOM-precise via
// targetAnchorId); this covers every other connector by tile-matching the
// waypoint under the cursor — the bend is visible on the path even with no
// overlay handles drawn. Endpoints are never removed. Returns true if a waypoint
// was spliced (caller stops); leaves selection untouched (altSpliceConsumed makes
// the mouseup skip its selection-clearing branch).
const handleAltClickWaypointRemoval = (state: State): boolean => {
  const { uiState, scene } = state;
  if (!uiState.mouse.modifiers?.alt) return false;

  for (const connector of scene.hitConnectors) {
    const clicked = findClickedConnectorAnchor(
      connector,
      uiState,
      scene.currentView
    );
    if (!clicked) continue;
    const isEndpoint =
      clicked.index === 0 || clicked.index === connector.anchors.length - 1;
    if (isEndpoint) continue;

    const nextAnchors = connector.anchors.filter(
      (a) => a.id !== clicked.anchor.id
    );
    scene.updateConnector(connector.id, { anchors: nextAnchors });
    altSpliceConsumed = true;
    setMousedownBookkeeping(state, null, true);
    return true;
  }
  return false;
};

// Generic item hit-detection. Items on locked or hidden layers are treated as
// background — not selectable, not draggable (mqa-results.md #2).
// isItemInteractable may be undefined in tests that bypass the State type via
// `as any`. The non-null check on itemAtTile is critical — calling
// isItemInteractable(null) would throw and silently kill the cursor→lasso
// transition for empty-canvas drag.
const selectItemAtTileMousedown = (state: State) => {
  const { uiState, scene, isItemInteractable } = state;
  // #5: click-SELECTION uses exact connector tiles so an empty tile beside a
  // connector clears the selection instead of grabbing it. Hover and
  // reconnect/waypoint paths keep the ±1 halo (default).
  // ADR 0023: pixel-accurate click hit-test — select an off-grid item where it's
  // drawn (matches the hover path), not at its grid cell.
  const point = cursorCanvasPoint(uiState, uiState.mouse.position.screen);
  const itemAtTile = getItemAtTile({
    tile: uiState.mouse.position.tile,
    scene,
    canvasMode: uiState.canvasMode,
    point,
    connectorMatch: 'exact'
  });

  if (itemAtTile && (!isItemInteractable || isItemInteractable(itemAtTile))) {
    setMousedownBookkeeping(state, itemAtTile, true);
  } else {
    setMousedownBookkeeping(state, null, true);
    uiState.actions.setItemControls(null);
  }
};

const mousedown: ModeActionsAction = (state) => {
  const { uiState, isRendererInteraction } = state;
  if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

  if (handleSelectedConnectorMousedown(state)) return;
  if (handleAltClickWaypointRemoval(state)) return;

  selectItemAtTileMousedown(state);
};

// ─── mousemove helpers ──────────────────────────────────────────────────────

// True when the cursor sits over an anchor of the currently selected connector.
const isHoveringConnectorAnchor = ({ scene, uiState }: State): boolean => {
  const hoverControls = uiState.itemControls;
  if (!hoverControls || hoverControls.type !== 'CONNECTOR') return false;

  const hoveredConnector = scene.hitConnectors.find(
    (c) => c.id === hoverControls.id
  );
  if (!hoveredConnector) return false;

  return hoveredConnector.anchors.some((anchor, index) => {
    const hitTile = getAnchorHitTile(
      anchor,
      index,
      hoveredConnector.anchors.length,
      hoveredConnector,
      scene.currentView
    );
    return CoordsUtils.isEqual(hitTile, uiState.mouse.position.tile);
  });
};

// Hover cursor (no active mousedown): 'grab' over a selected connector's anchor,
// 'pointer' over any item, 'default' otherwise. Uses hasMovedTile to avoid
// redundant work when the tile under the cursor hasn't changed.
const updateHoverCursor = (state: State) => {
  const { scene, uiState, isItemInteractable } = state;
  if (!hasMovedTile(uiState.mouse)) return;

  if (isHoveringConnectorAnchor(state)) {
    setWindowCursor('grab');
    return;
  }

  // ADR 0023: pixel-accurate hit-testing needs the cursor's canvas point, not the
  // floored tile, so an off-grid item is grabbed where it's drawn.
  const point = cursorCanvasPoint(uiState, uiState.mouse.position.screen);
  const hit = getItemAtTile({
    tile: uiState.mouse.position.tile,
    scene,
    canvasMode: uiState.canvasMode,
    point
  });
  // A hidden (or locked) element isn't interactable, so it must not read as
  // hoverable — no pointer cursor, no hover outline. getItemAtTile is purely
  // geometric and still hits elements on a hidden layer, so without this gate
  // hovering their (invisible) footprint lit the HoverOutline (reported). Mirrors
  // the click/drag/select-all invariant. Absent gate (partial test state) = hoverable.
  const hoverItem =
    hit && (!isItemInteractable || isItemInteractable(hit)) ? hit : null;
  setWindowCursor(hoverItem ? 'pointer' : 'default');

  // A3: publish the hovered item for the faint hover outline (HoverOutline),
  // but only when the ref actually CHANGES — hover fires per tile move, so a
  // per-move store write would churn every subscriber. Optional-called so the
  // mode-action unit tests that mock a minimal actions map keep working.
  const prev = uiState.hoveredItem ?? null;
  const changed =
    (prev?.id ?? null) !== (hoverItem?.id ?? null) ||
    (prev?.type ?? null) !== (hoverItem?.type ?? null);
  if (changed) {
    uiState.actions.setHoveredItem?.(
      hoverItem ? { type: hoverItem.type, id: hoverItem.id } : null
    );
  }
};

// Multi-select drag (ADR-0006): if the pressed item is part of the persistent
// multi-selection (len > 1), drag the whole selection together. Otherwise drag
// just this item (the selection collapses to it via the mouseup path).
const resolveDragItems = (
  uiState: State['uiState'],
  item: ItemReference
): ItemReference[] => {
  const selectedIds = uiState.selectedIds ?? [];
  const inMultiSelect =
    selectedIds.length > 1 &&
    selectedIds.some((ref) => ref.type === item.type && ref.id === item.id);
  return inMultiSelect ? selectedIds : [item];
};

// CONNECTOR_ANCHOR free-floating waypoints store their tile on the anchor ref.
// Mirror Lasso.mousemove's anchor-seeding (modes/Lasso.ts). Without this entry,
// DragItems treats the anchor as an "anchor reconnect" (no initialTiles →
// re-anchor to cursor tile every frame). That's the inversion + pinched-path
// symptom when Ctrl+A includes free-floating waypoints. ADR-0006.
const seedAnchorTile = (
  scene: State['scene'],
  anchorId: string,
  initialTiles: Record<string, Coords>
) => {
  for (const connector of scene.connectors) {
    const anchor = connector.anchors.find((a) => a.id === anchorId);
    if (anchor?.ref?.tile) {
      initialTiles[anchorId] = anchor.ref.tile;
      break;
    }
  }
};

// Record one drag item's starting tile (or rectangle bounds). Throws from
// getItemByIdOrThrow are caught by the caller so a vanished item just gets
// skipped without aborting the whole drag.
const seedDragItemPosition = (
  scene: State['scene'],
  dragItem: ItemReference,
  initialTiles: Record<string, Coords>,
  initialRectangles: Record<string, { from: Coords; to: Coords }>
) => {
  if (dragItem.type === 'ITEM') {
    initialTiles[dragItem.id] = getItemByIdOrThrow(
      scene.items,
      dragItem.id
    ).value.tile;
  } else if (dragItem.type === 'TEXTBOX') {
    initialTiles[dragItem.id] = getItemByIdOrThrow(
      scene.textBoxes,
      dragItem.id
    ).value.tile;
  } else if (dragItem.type === 'LABEL') {
    // Floating Labels (ADR 0031) move by whole-tile group delta like nodes /
    // text boxes; DragItems commits them via batchUpdateLabelTiles. Without
    // this seed the label was selected by the lasso but had no initial tile, so
    // the group drag skipped it and it stayed put (reported regression).
    initialTiles[dragItem.id] = getItemByIdOrThrow(
      scene.labels,
      dragItem.id
    ).value.tile;
  } else if (dragItem.type === 'RECTANGLE') {
    const r = getItemByIdOrThrow(scene.rectangles, dragItem.id).value;
    initialRectangles[dragItem.id] = { from: r.from, to: r.to };
  } else if (dragItem.type === 'CONNECTOR_ANCHOR') {
    seedAnchorTile(scene, dragItem.id, initialTiles);
  }
};

const collectDragInitialPositions = (
  scene: State['scene'],
  dragItems: ItemReference[]
) => {
  const initialTiles: Record<string, Coords> = {};
  const initialRectangles: Record<string, { from: Coords; to: Coords }> = {};
  for (const dragItem of dragItems) {
    try {
      seedDragItemPosition(scene, dragItem, initialTiles, initialRectangles);
    } catch {
      /* item vanished mid-drag — skip it, keep dragging the rest */
    }
  }
  return { initialTiles, initialRectangles };
};

// ─── mouseup helpers ────────────────────────────────────────────────────────

// Ctrl+click a connector: toggle the connector AND its tile-bound waypoint
// anchors as one group — waypoints can't be independently selected via click
// (they're not hit-tested), so they must accompany the connector to remain
// consistent with Ctrl+A and lasso semantics. ADR-0006.
const toggleConnectorGroupSelection = (
  { uiState, scene }: State,
  connectorId: string
) => {
  const connector = scene.connectors.find(
    (c: { id: string }) => c.id === connectorId
  );
  const waypointRefs = connector ? getConnectorWaypointRefs(connector) : [];
  const groupIds = new Set<string>([
    connectorId,
    ...waypointRefs.map((r) => r.id)
  ]);
  const current = uiState.selectedIds ?? [];
  const isInSelection = current.some(
    (r) => r.type === 'CONNECTOR' && r.id === connectorId
  );
  const next: ItemReference[] = isInSelection
    ? current.filter((r) => !groupIds.has(r.id))
    : [
        ...current,
        { type: 'CONNECTOR' as const, id: connectorId },
        ...waypointRefs
      ];
  uiState.actions.setSelectedIds!(next);
};

// CONNECTOR-on-tile needs the tile so the action bar can anchor itself (a
// connector has no intrinsic tile). Single-click is select-only (ADR 0022 §3):
// setItemControls with openPanel:false sets the target + opens the bar without
// mounting the panel — the panel opens on double-click. Ctrl+click routes
// through the group-toggle gesture path instead.
const handleConnectorClickSelection = (
  state: State,
  connectorId: string,
  ctrlHeld: boolean | undefined
) => {
  const { uiState } = state;
  if (ctrlHeld && typeof uiState.actions.setSelectedIds === 'function') {
    toggleConnectorGroupSelection(state, connectorId);
  } else {
    uiState.actions.setItemControls(
      {
        type: 'CONNECTOR',
        id: connectorId,
        tile: uiState.mouse.position.tile
      },
      { openPanel: false }
    );
  }
};

// Non-connector click: Ctrl+click → toggle, plain click → replace. Optional-call
// the new actions so mode-action unit tests that mock a minimal
// uiState.actions continue to work, falling back to the single-item path
// (ADR-0006).
const handleItemClickSelection = (
  { uiState }: State,
  clicked: ItemReference,
  ctrlHeld: boolean | undefined
) => {
  const ref: ItemReference = { type: clicked.type, id: clicked.id };
  if (ctrlHeld && uiState.actions.toggleSelected) {
    uiState.actions.toggleSelected(ref);
  } else if (uiState.actions.setSelectedIds) {
    uiState.actions.setSelectedIds([ref]);
  } else {
    uiState.actions.setItemControls({ type: clicked.type, id: clicked.id });
  }
};

// Resolve a no-movement click on a pressed item into a selection update.
const resolveClickSelection = (state: State, clicked: ItemReference) => {
  const { uiState } = state;
  // #10: Shift joins Ctrl/Cmd as an additive-selection modifier on canvas
  // (Shift was unbound here — verified collision-free). ADR 0006 §2 gesture
  // matrix amended. The handlers treat this as the additive/toggle flag.
  const additive =
    uiState.mouse.modifiers?.ctrl ||
    uiState.mouse.modifiers?.meta ||
    uiState.mouse.modifiers?.shift;

  if (clicked.type === 'CONNECTOR') {
    handleConnectorClickSelection(state, clicked.id, additive);
  } else {
    handleItemClickSelection(state, clicked, additive);
  }
};

export const Cursor: ModeActions = {
  entry: (state) => {
    const { uiState } = state;

    if (uiState.mode.type !== 'CURSOR') return;

    if (uiState.mode.mousedownItem) {
      mousedown(state);
    }
  },
  mousemove: (state) => {
    const { scene, uiState } = state;
    if (uiState.mode.type !== 'CURSOR') return;

    let item = uiState.mode.mousedownItem;

    // Hover cursor (no mousedown): still use hasMovedTile to avoid redundant work
    if (!item && !uiState.mouse.mousedown) {
      updateHoverCursor(state);
      return;
    }

    // Drag detection: pixel-based slop on the raw screen delta (ADR 0018
    // Decision 5), NOT a whole-tile threshold — the tile threshold swallowed
    // sub-tile precision-trackpad drags. Compares position.screen vs
    // mousedown.screen so it is zoom-independent. Applies to every pointerType.
    if (!uiState.mouse.mousedown) return;
    const hasDragged = exceedsTapSlop(
      uiState.mouse.mousedown.screen,
      uiState.mouse.position.screen
    );
    if (!hasDragged) return;

    if (item?.type === 'CONNECTOR' && uiState.mouse.mousedown) {
      // I3/SEL-02: `getAnchor` SPLICES a new waypoint into the connector when
      // the press wasn't on an existing one — a real model write. It used to run
      // here, before `setMode(DRAG_ITEMS)` whose `entry` opens the drag bracket,
      // so one gesture produced two history entries: the splice, then the move.
      // One Ctrl+Z undid the move and left the waypoint behind, and the second
      // removed a waypoint the user had never created as its own action (and an
      // abandoned drag left it there for good). Opening the bracket first folds
      // the splice into the gesture's single entry; `DragItems.entry`'s own
      // `beginDragTransaction` is idempotent, and the mouseup commit closes the
      // one bracket.
      scene.beginDragTransaction();
      const anchor = getAnchor(item.id, uiState.mouse.mousedown.tile, scene);

      item = {
        type: 'CONNECTOR_ANCHOR',
        id: anchor.id
      };
    }

    if (item) {
      const dragItems = resolveDragItems(uiState, item);
      const { initialTiles, initialRectangles } = collectDragInitialPositions(
        scene,
        dragItems
      );
      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: dragItems,
        initialTiles,
        initialRectangles
      });
    } else if (uiState.mouse.mousedown && uiState.mode.mousedownHandled) {
      // Empty-area drag → start lasso selection (only when mousedown was properly handled)
      uiState.actions.setMode({
        type: 'LASSO',
        showCursor: true,
        selection: null,
        isDragging: false
      });
    }
  },
  mousedown,
  mouseup: (state) => {
    const { uiState, isRendererInteraction } = state;
    if (uiState.mode.type !== 'CURSOR' || !isRendererInteraction) return;

    // Alt+click waypoint splice ran in mousedown — bypass all selection logic.
    // Just reset the mousedown bookkeeping; the connector stays selected.
    if (altSpliceConsumed) {
      altSpliceConsumed = false;
      setMousedownBookkeeping(state, null, false);
      return;
    }

    // MQA #16 / ADR 0022 §4 (#6): the press did not land on the canvas, so this
    // release is the tail of a gesture that started elsewhere — most often a
    // text drag-select inside a properties-panel input that crossed the canvas
    // boundary and lifted over it. `getMouse` records `mouse.mousedown` for ANY
    // mousedown (even off-canvas), so the old `!mouse.mousedown` guard missed
    // this case and the release fell through to clearSelection — dismissing the
    // panel mid-text-selection. `mousedownHandled` is set ONLY by
    // Cursor.mousedown when the press hit the renderer (isRendererInteraction),
    // so an unhandled press is the precise signal that the gesture began
    // off-canvas. In that case never mutate the canvas selection.
    if (!uiState.mode.mousedownHandled) {
      setMousedownBookkeeping(state, null, false);
      return;
    }

    // Click-vs-clear: same pixel-slop classifier as drag-start (ADR 0018
    // Decision 5). On a real mouseup getMouse nulls mousedown, so this is
    // effectively a no-move tap there; the slop check still guards any path
    // that retains mousedown.
    const hasMoved =
      !!uiState.mouse.mousedown &&
      exceedsTapSlop(
        uiState.mouse.mousedown.screen,
        uiState.mouse.position.screen
      );

    if (uiState.mode.mousedownItem && !hasMoved) {
      resolveClickSelection(state, uiState.mode.mousedownItem);
    } else {
      // Plain left-click on empty canvas, or the tail of a completed drag —
      // clear the persistent selection. (B8: there is no double-click-to-add —
      // it was removed for good; right-click → "Add item" is the canonical add
      // path. Double-click opens Details on an item / no-ops on empty canvas.)
      (uiState.actions.clearSelection ??
        (() => uiState.actions.setItemControls(null)))();
    }

    setMousedownBookkeeping(state, null, false);
  }
};
