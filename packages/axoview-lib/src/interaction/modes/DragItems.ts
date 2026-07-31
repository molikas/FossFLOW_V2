import { produce } from 'immer';
import { ModeActions, Coords, ItemReference } from 'src/types';
import { useScene } from 'src/hooks/useScene';
import {
  getItemByIdOrThrow,
  CoordsUtils,
  getAnchorParent,
  getItemAtTile,
  setWindowCursor,
  itemCollides
} from 'src/utils';
import { cursorCanvasPoint } from 'src/utils/coordinateTransforms';
import { isSnappedPlacement } from 'src/utils/resolvePlacement';
import { UNPROJECTED_TILE_SIZE, PROJECTED_TILE_SIZE } from 'src/config';

// =============================================================================
// MQA #7 Path 4-true (EXPERIMENTAL)
// =============================================================================
//
// CSS-only drag preview for item moves. During drag:
//   - Item tiles are NOT written to the model. The drag visual is applied via
//     CSS variable mutation on the dragged Node DOM elements (compositor-only:
//     no layout, no React reconciliation, no immer reducer chain).
//   - Connector path data is refreshed in the scene store via
//     `previewConnectorPaths` so wires visually follow their endpoints. No
//     model touch; one direct sceneStore set() per frame.
//   - The drag transaction is still open (beginDragTransaction on entry), so
//     when the model finally commits on mouseup, one history entry covers
//     the whole drag for undo.
//
// On mouseup: read the final preview tiles, commit them to the model via the
// existing batchUpdateViewItemTiles, then commitDragTransaction.
//
// Rectangles / textboxes now use the SAME CSS-preview path (RECT-1): a
// translate3d via the --ff-drag-* vars during the move, with the model committed
// once on mouseup. This removes the per-frame model write that re-rendered the
// dragged element and repainted its full pixel area every frame (the sluggish
// big-square drag). Only connector-anchor RECONNECT (re-anchoring onto a
// different item/anchor) still takes the reducer path — it's rare and off the
// move hot path.
// =============================================================================

// Module-level drag preview state. Cleared by entry/exit. Single-drag-at-a-
// time invariant matches uiStateStore.mode === 'DRAG_ITEMS'.
const previewTiles = new Map<string, Coords>();
// Waypoint anchor preview tiles (anchorId → new tile). Routed through
// previewConnectorPaths' synthetic view rather than scene.updateConnector
// during drag — otherwise syncConnector runs against stale model items and
// stomps the preview path with the wrong endpoints.
const previewAnchorTiles = new Map<string, Coords>();
// Rectangle / textbox MOVE preview (RECT-1) — accumulated target positions while
// the drag shows a CSS translate3d; committed to the model once on mouseup.
const previewRectangles = new Map<string, { from: Coords; to: Coords }>();
const previewTextBoxes = new Map<string, Coords>();
// Label MOVE preview (ADR 0031) — labels are canvas-drawn (no [data-drag-id]),
// so a group drag has no live CSS preview; target tiles accumulate here and
// commit once on mouseup (single-label moves stay smooth via LabelHitLayer).
const previewLabels = new Map<string, Coords>();
// Off-grid residual (ADR 0023) accumulated per dragged item alongside the tile
// preview. `undefined` = snapped (offset cleared on commit). Kept in lockstep
// with the tile maps above and committed together on mouseup.
const previewNodeOffsets = new Map<string, Coords | undefined>();
const previewRectOffsets = new Map<string, Coords | undefined>();
const previewTextBoxOffsets = new Map<string, Coords | undefined>();
const previewLabelOffsets = new Map<string, Coords | undefined>();

// An item is off-grid (commits a px residual instead of snapping) when the
// global toggle is off OR the item itself is unsnapped (ADR 0023). This used to
// re-implement the predicate inline — the "second chokepoint" ADR 0023's
// as-built caveat flagged. It now reads the ONE definition, in the placement
// chokepoint itself, so the drag and the placement path cannot desync.
const isOffGrid = (snap: boolean | undefined, globalSnap: boolean): boolean =>
  !isSnappedPlacement(snap, globalSnap);

// D4-4: external (non-dragged) item occupancy is invariant during a drag — the
// dragged items move via CSS only, the model isn't written — so it's snapshotted
// ONCE at drag entry instead of rebuilt as an O(N) Set every frame. Cleared on
// exit/mouseup. (Also de-risks the T3 collision tick loop, which has the same
// loop-invariant occupancy.)
let externalOccupiedCache: Set<string> | null = null;

function buildExternalOccupied(
  draggedItemIds: Set<string>,
  items: { id: string; tile: Coords; snap?: boolean; collides?: boolean }[]
): Set<string> {
  const occupied = new Set<string>();
  // Non-colliding items (ADR 0023) are not drag obstacles.
  for (const si of items) {
    if (!draggedItemIds.has(si.id) && itemCollides(si)) {
      occupied.add(`${si.tile.x},${si.tile.y}`);
    }
  }
  return occupied;
}

function tileDeltaToPixels(
  dx: number,
  dy: number,
  canvasMode: 'ISOMETRIC' | '2D'
): { x: number; y: number } {
  if (canvasMode === '2D') {
    return { x: dx * UNPROJECTED_TILE_SIZE, y: -dy * UNPROJECTED_TILE_SIZE };
  }
  // Isometric — matches isometricStrategy.toScreen() delta math.
  const halfW = PROJECTED_TILE_SIZE.width / 2;
  const halfH = PROJECTED_TILE_SIZE.height / 2;
  return { x: halfW * (dx - dy), y: -halfH * (dx + dy) };
}

function applyCssOffset(id: string, dx: number, dy: number) {
  const el = document.querySelector<HTMLElement>(`[data-drag-id="${id}"]`);
  if (!el) return;
  el.style.setProperty('--ff-drag-dx', `${dx}px`);
  el.style.setProperty('--ff-drag-dy', `${dy}px`);
}

function clearAllCssOffsets() {
  // Nodes, rectangles and textboxes all carry --ff-drag-* offsets during a drag.
  const ids = [
    ...previewTiles.keys(),
    ...previewRectangles.keys(),
    ...previewTextBoxes.keys()
  ];
  for (const id of ids) {
    const el = document.querySelector<HTMLElement>(`[data-drag-id="${id}"]`);
    if (el) {
      el.style.removeProperty('--ff-drag-dx');
      el.style.removeProperty('--ff-drag-dy');
    }
  }
}

type NodeUpdate = { id: string; tile: Coords };

// Nodes — collision check against external items (model is stale during drag,
// but external items haven't moved so their tiles are authoritative). Returns
// null when any target tile collides (with an external item or another dragged
// node), in which case no node moves this frame.
function computeNodeUpdates(
  itemRefs: ItemReference[],
  initialTiles: Record<string, Coords>,
  mouseOffset: Coords,
  scene: ReturnType<typeof useScene>,
  externalOccupied: Set<string> | null
): NodeUpdate[] | null {
  if (itemRefs.length === 0) return null;

  const draggedIdSet = new Set(itemRefs.map((i) => i.id));
  const targets = itemRefs.map((item) => {
    // Non-throwing lookup for the collision flag (default: collides). The tile
    // still comes from initialTiles when present (preserving the original throw
    // only for the genuinely-missing else branch).
    const found = scene.items.find((it) => it.id === item.id);
    return {
      id: item.id,
      targetTile: initialTiles[item.id]
        ? CoordsUtils.add(initialTiles[item.id], mouseOffset)
        : getItemByIdOrThrow(scene.items, item.id).value.tile,
      // A non-colliding mover (ADR 0023) is never blocked and never blocks its
      // dragged siblings.
      collides: found ? itemCollides(found) : true
    };
  });

  // Built once at drag entry (D4-4); fall back to building it if absent (e.g. a
  // direct call outside an open drag).
  const occupied =
    externalOccupied ?? buildExternalOccupied(draggedIdSet, scene.items);

  const targetKeys = new Set<string>();
  for (const t of targets) {
    if (!t.collides) continue;
    const key = `${t.targetTile.x},${t.targetTile.y}`;
    if (occupied.has(key) || targetKeys.has(key)) return null;
    targetKeys.add(key);
  }

  return targets.map((t) => ({ id: t.id, tile: t.targetTile }));
}

// Apply CSS preview for nodes (no model write, no React, no immer).
//
// Snapped nodes step by whole tiles (the projected integer-tile delta — today's
// behaviour). Off-grid nodes (ADR 0023) follow the pointer pixel-for-pixel: the
// CSS preview is the precise SceneLayer-px cursor delta, and the committed
// `offset` is the item's current offset plus the SUB-TILE residual (the part of
// the precise delta beyond the whole-tile step). Tile + offset therefore stay in
// lockstep so the on-drop commit matches the preview exactly (no jump).
function applyNodePreview(
  nodeUpdates: NodeUpdate[] | null,
  initialTiles: Record<string, Coords>,
  preciseDelta: Coords,
  scene: ReturnType<typeof useScene>,
  canvasMode: 'ISOMETRIC' | '2D',
  globalSnap: boolean
) {
  if (!nodeUpdates) return;
  for (const u of nodeUpdates) {
    const initial = initialTiles[u.id];
    if (!initial) continue;
    const dx = u.tile.x - initial.x;
    const dy = u.tile.y - initial.y;
    const tilePx = tileDeltaToPixels(dx, dy, canvasMode);
    const viewItem = scene.items.find((it) => it.id === u.id);
    previewTiles.set(u.id, u.tile);

    const current = viewItem?.offset ?? CoordsUtils.zero();
    if (viewItem && isOffGrid(viewItem.snap, globalSnap)) {
      applyCssOffset(u.id, preciseDelta.x, preciseDelta.y);
      previewNodeOffsets.set(u.id, {
        x: current.x + (preciseDelta.x - tilePx.x),
        y: current.y + (preciseDelta.y - tilePx.y)
      });
    } else {
      // Snapped: the commit clears the offset, and the renderer always applies
      // the (still-stale) model offset during the preview — so subtract it here
      // (current) to keep the preview pixel-identical to the post-commit render
      // (base + tilePx) and avoid a one-frame jump on release.
      applyCssOffset(u.id, tilePx.x - current.x, tilePx.y - current.y);
      previewNodeOffsets.set(u.id, undefined);
    }
  }
}

// Accumulate waypoint anchor moves into the preview map (no model write). Only
// the "free-floating tile drag" branch goes through preview; the re-anchor-
// onto-item / onto-anchor cases are returned as reconnects for the reducer
// path (rare, single-anchor reconnect outside the drag hot path).
function accumulateAnchorPreview(
  anchorRefs: ItemReference[],
  initialTiles: Record<string, Coords>,
  mouseOffset: Coords
): ItemReference[] {
  const anchorReconnects: ItemReference[] = [];
  anchorRefs.forEach((item) => {
    if (initialTiles[item.id]) {
      const newTile = CoordsUtils.add(initialTiles[item.id], mouseOffset);
      previewAnchorTiles.set(item.id, newTile);
    } else {
      anchorReconnects.push(item);
    }
  });
  return anchorReconnects;
}

// Resolve the new anchor ref for a reconnect drop: onto an item, onto another
// anchor, or free-floating onto a bare tile.
function resolveAnchorRef(
  itemAtTile: ReturnType<typeof getItemAtTile>,
  tile: Coords
) {
  switch (itemAtTile?.type) {
    case 'ITEM':
      return { item: itemAtTile.id };
    case 'CONNECTOR_ANCHOR':
      return { anchor: itemAtTile.id };
    default:
      return { tile };
  }
}

// Anchor reconnect (re-anchoring onto a different item or anchor) keeps the
// reducer path — it's rare (single-anchor reconnect) and outside the move hot
// path. Textbox/rectangle MOVES no longer come here: they go through the
// immer-free batchUpdate{TextBoxTiles,Rectangles} path (see dragItems) to avoid
// a full-state immer clone per frame (the rectangle/textbox drag fps cliff).
function commitAnchorReconnects(
  anchorReconnects: ItemReference[],
  tile: Coords,
  scene: ReturnType<typeof useScene>
) {
  if (anchorReconnects.length === 0) return;

  scene.transaction(() => {
    anchorReconnects.forEach((item) => {
      const connector = getAnchorParent(item.id, scene.connectors);
      const newConnector = produce(connector, (draft) => {
        const anchor = getItemByIdOrThrow(connector.anchors, item.id);
        const itemAtTile = getItemAtTile({ tile, scene });
        draft.anchors[anchor.index] = {
          ...anchor.value,
          ref: resolveAnchorRef(itemAtTile, tile)
        };
      });
      scene.updateConnector(connector.id, newConnector);
    });
  });
}

const dragItems = (
  items: ItemReference[],
  tile: Coords,
  mouseOffset: Coords,
  preciseDelta: Coords,
  initialTiles: Record<string, Coords>,
  initialRectangles: Record<string, { from: Coords; to: Coords }>,
  scene: ReturnType<typeof useScene>,
  canvasMode: 'ISOMETRIC' | '2D',
  globalSnap: boolean
) => {
  const itemRefs = items.filter((item) => item.type === 'ITEM');
  const textBoxRefs = items.filter((item) => item.type === 'TEXTBOX');
  const labelRefs = items.filter((item) => item.type === 'LABEL');
  const rectangleRefs = items.filter((item) => item.type === 'RECTANGLE');
  const anchorRefs = items.filter((item) => item.type === 'CONNECTOR_ANCHOR');

  const nodeUpdates = computeNodeUpdates(
    itemRefs,
    initialTiles,
    mouseOffset,
    scene,
    externalOccupiedCache
  );
  applyNodePreview(
    nodeUpdates,
    initialTiles,
    preciseDelta,
    scene,
    canvasMode,
    globalSnap
  );

  const anchorReconnects = accumulateAnchorPreview(
    anchorRefs,
    initialTiles,
    mouseOffset
  );

  // Single preview-path update per frame covering both items and waypoints.
  // Routing both through one synthetic view eliminates the race where
  // scene.updateConnector → syncConnector would overwrite the preview with
  // a path computed from stale model items.
  if (previewTiles.size > 0 || previewAnchorTiles.size > 0) {
    scene.previewConnectorPaths(previewTiles, previewAnchorTiles);
  }

  // Rectangles / textboxes: CSS-only preview (RECT-1) — one translate3d via the
  // --ff-drag-* vars and accumulate the target positions; the model is committed
  // once on mouseup. No per-frame model write → no re-render and no full-area
  // repaint (the big-rectangle drag cliff). They move by the whole mouseOffset,
  // so the pixel delta is shared. Items missing an initial position (shouldn't
  // happen — entry records them) are skipped, mirroring the node preview.
  if (rectangleRefs.length > 0 || textBoxRefs.length > 0) {
    const pixels = tileDeltaToPixels(mouseOffset.x, mouseOffset.y, canvasMode);
    // Sub-tile residual shared by every off-grid item this frame (the part of
    // the precise cursor delta beyond the whole-tile step).
    const residual = { x: preciseDelta.x - pixels.x, y: preciseDelta.y - pixels.y };
    for (const item of rectangleRefs) {
      const init = initialRectangles[item.id];
      if (!init) continue;
      const rect = scene.rectangles.find((r) => r.id === item.id);
      const offGrid = !!rect && isOffGrid(rect.snap, globalSnap);
      const rectOffset = rect?.offset ?? CoordsUtils.zero();
      // Off-grid: follow the pointer (preciseDelta). Snapped: the wrapper still
      // renders the stale model offset during the preview, so subtract it so the
      // preview matches the post-commit (offset-cleared) position.
      const css = offGrid
        ? preciseDelta
        : { x: pixels.x - rectOffset.x, y: pixels.y - rectOffset.y };
      applyCssOffset(item.id, css.x, css.y);
      previewRectangles.set(item.id, {
        from: CoordsUtils.add(init.from, mouseOffset),
        to: CoordsUtils.add(init.to, mouseOffset)
      });
      previewRectOffsets.set(
        item.id,
        offGrid
          ? CoordsUtils.add(rect!.offset ?? CoordsUtils.zero(), residual)
          : undefined
      );
    }
    for (const item of textBoxRefs) {
      const init = initialTiles[item.id];
      if (!init) continue;
      const textBox = scene.textBoxes.find((t) => t.id === item.id);
      const offGrid = !!textBox && isOffGrid(textBox.snap, globalSnap);
      const tbOffset = textBox?.offset ?? CoordsUtils.zero();
      const css = offGrid
        ? preciseDelta
        : { x: pixels.x - tbOffset.x, y: pixels.y - tbOffset.y };
      applyCssOffset(item.id, css.x, css.y);
      previewTextBoxes.set(item.id, CoordsUtils.add(init, mouseOffset));
      previewTextBoxOffsets.set(
        item.id,
        offGrid
          ? CoordsUtils.add(textBox!.offset ?? CoordsUtils.zero(), residual)
          : undefined
      );
    }
  }

  // Labels (ADR 0031): canvas-drawn, so no CSS preview — accumulate the target
  // tile (whole-tile group delta) and commit on mouseup; the existing off-grid
  // offset is preserved.
  if (labelRefs.length > 0) {
    for (const item of labelRefs) {
      const init = initialTiles[item.id];
      if (!init) continue;
      const label = scene.labels.find((l) => l.id === item.id);
      previewLabels.set(item.id, CoordsUtils.add(init, mouseOffset));
      previewLabelOffsets.set(item.id, label?.offset);
    }
  }

  // Anchor reconnect (rare) keeps the reducer path.
  commitAnchorReconnects(anchorReconnects, tile, scene);
};

/**
 * Drop the whole drag preview WITHOUT committing it, and close the transaction.
 *
 * This is `exit`'s body minus the renderer chrome, factored out so a keyboard
 * path can abort a live drag (I1/PTR-10: an undo taken mid-drag was
 * unrecoverable, because the pending mouseup still committed the preview maps
 * as a new action and that clears the redo stack). Clearing the maps is the
 * operative part — the mouseup that arrives afterwards then writes nothing.
 *
 * Idempotent: `exit` runs the same clears again on the next mouse event, and
 * `commitDragTransaction` is a no-op when no bracket is open.
 */
export const abortDragItems = (
  scene: Pick<ReturnType<typeof useScene>, 'commitDragTransaction'>,
  uiState: { actions: { clearLabelMoves?: () => void } }
) => {
  clearAllCssOffsets();
  previewTiles.clear();
  previewAnchorTiles.clear();
  previewRectangles.clear();
  previewTextBoxes.clear();
  previewLabels.clear();
  previewNodeOffsets.clear();
  previewRectOffsets.clear();
  previewTextBoxOffsets.clear();
  previewLabelOffsets.clear();
  externalOccupiedCache = null;
  uiState.actions.clearLabelMoves?.();
  scene.commitDragTransaction();
};

export const DragItems: ModeActions = {
  entry: ({ uiState, rendererRef, scene }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;
    rendererRef.style.userSelect = 'none';
    setWindowCursor('grabbing');
    previewTiles.clear();
    previewAnchorTiles.clear();
    previewRectangles.clear();
    previewTextBoxes.clear();
    previewLabels.clear();
    previewNodeOffsets.clear();
    previewRectOffsets.clear();
    previewTextBoxOffsets.clear();
    previewLabelOffsets.clear();
    // D4-4: snapshot external (non-dragged) item occupancy once for the whole
    // drag — it's invariant, so the per-frame collision check reads this instead
    // of rebuilding an O(N) Set each frame.
    externalOccupiedCache = buildExternalOccupied(
      new Set(
        uiState.mode.items.filter((i) => i.type === 'ITEM').map((i) => i.id)
      ),
      scene.items
    );
    // One history entry covers the whole drag; the only per-tick model writes
    // are anchor reconnects (rare) — node/rectangle/textbox moves stay CSS-only
    // until the mouseup commit, and skip produceWithPatches while frozen.
    scene.beginDragTransaction();
  },
  exit: ({ rendererRef, scene, uiState }) => {
    rendererRef.style.userSelect = 'auto';
    setWindowCursor('default');
    // Safety net for escape / programmatic mode change. If exit fires without
    // a normal mouseup, clear the preview without committing — including the
    // canvas label move-preview, or an escaped group drag leaves the labels
    // stranded at their (uncommitted) preview position.
    abortDragItems(scene, uiState);
  },
  mousemove: ({ uiState, scene }) => {
    if (uiState.mode.type !== 'DRAG_ITEMS' || !uiState.mouse.mousedown) return;

    const mouseOffset = CoordsUtils.subtract(
      uiState.mouse.position.tile,
      uiState.mouse.mousedown.tile
    );

    // Precise (sub-tile) pointer delta in SceneLayer px — screen delta divided
    // by zoom (the SceneLayer applies scale(zoom) outside the drag translate).
    // Drives off-grid previews; snapped items ignore it (ADR 0023). Falls back to
    // the whole-tile projected delta when screen coords are absent (real getMouse
    // always sets them; this only guards partial test mocks).
    const zoom = uiState.zoom || 1;
    const downScreen = uiState.mouse.mousedown.screen;
    const posScreen = uiState.mouse.position.screen;
    const preciseDelta =
      downScreen && posScreen
        ? {
            x: (posScreen.x - downScreen.x) / zoom,
            y: (posScreen.y - downScreen.y) / zoom
          }
        : tileDeltaToPixels(mouseOffset.x, mouseOffset.y, uiState.canvasMode);

    const hasDraggedNode = uiState.mode.items.some((i) => i.type === 'ITEM');
    const draggedIds = new Set(uiState.mode.items.map((i) => i.id));
    // ADR 0023: pixel-accurate "over another item?" check so dragging over an
    // off-grid node reads its real drawn footprint (matches hover/click).
    const cursorPoint = cursorCanvasPoint(uiState, posScreen);
    const itemAtCursor = getItemAtTile({
      tile: uiState.mouse.position.tile,
      scene,
      canvasMode: uiState.canvasMode,
      point: cursorPoint
    });
    if (
      hasDraggedNode &&
      itemAtCursor?.type === 'ITEM' &&
      !draggedIds.has(itemAtCursor.id)
    ) {
      setWindowCursor('not-allowed');
    } else {
      setWindowCursor('grabbing');
    }

    dragItems(
      uiState.mode.items,
      uiState.mouse.position.tile,
      mouseOffset,
      preciseDelta,
      uiState.mode.initialTiles,
      uiState.mode.initialRectangles,
      scene,
      uiState.canvasMode,
      uiState.snapToGrid ?? true
    );

    // Floating labels are canvas-drawn (LabelsCanvas) with no [data-drag-id] DOM
    // element to carry a CSS `--ff-drag-*` preview, so publish their accumulated
    // target tile/offset to the group move-preview channel — LabelsCanvas redraws
    // each dragged chip there. Without this the labels stay frozen mid-drag and
    // only jump into place on the mouseup commit (the reported "label not moving"
    // confusion). Cleared on mouseup (after commit) and on exit.
    if (previewLabels.size > 0) {
      const moves: Record<string, { tile: Coords; offset?: Coords }> = {};
      for (const [id, t] of previewLabels) {
        moves[id] = { tile: t, offset: previewLabelOffsets.get(id) };
      }
      uiState.actions.setLabelMoves?.(moves);
    }
  },
  mouseup: ({ uiState, scene }) => {
    // Commit deferred CSS-preview moves (nodes + rectangles + textboxes) to the
    // model BEFORE closing the drag transaction — commitDragTransaction then
    // captures one history entry covering the whole drag. Clear the CSS offsets
    // AFTER committing but BEFORE clearing the preview maps (clearAllCssOffsets
    // reads their keys to find the [data-drag-id] elements).
    if (previewTiles.size > 0) {
      scene.batchUpdateViewItemTiles(
        Array.from(previewTiles, ([id, tile]) => ({
          id,
          tile,
          offset: previewNodeOffsets.get(id)
        }))
      );
    }
    if (previewRectangles.size > 0) {
      scene.batchUpdateRectangles(
        Array.from(previewRectangles, ([id, r]) => ({
          id,
          from: r.from,
          to: r.to,
          offset: previewRectOffsets.get(id)
        }))
      );
    }
    if (previewTextBoxes.size > 0) {
      scene.batchUpdateTextBoxTiles(
        Array.from(previewTextBoxes, ([id, tile]) => ({
          id,
          tile,
          offset: previewTextBoxOffsets.get(id)
        }))
      );
    }
    if (previewLabels.size > 0) {
      scene.batchUpdateLabelTiles(
        Array.from(previewLabels, ([id, tile]) => ({
          id,
          tile,
          offset: previewLabelOffsets.get(id)
        }))
      );
    }
    // Drop the canvas move-preview AFTER the model commit above, so LabelsCanvas
    // redraws each chip at its new model position and the preview clears in the
    // same pass (no one-frame jump back to the origin). Mirrors the single-label
    // updateLabel → clearLabelMove ordering in LabelHitLayer.
    uiState.actions.clearLabelMoves?.();
    clearAllCssOffsets();
    previewTiles.clear();
    previewRectangles.clear();
    previewTextBoxes.clear();
    previewLabels.clear();
    previewNodeOffsets.clear();
    previewRectOffsets.clear();
    previewTextBoxOffsets.clear();
    previewLabelOffsets.clear();
    externalOccupiedCache = null;

    // Commit waypoint anchor preview tiles. Group by parent connector so we
    // make one scene.updateConnector call per connector (not per anchor),
    // each carrying the full updated anchors array.
    if (previewAnchorTiles.size > 0) {
      const byConnector = new Map<string, ReturnType<typeof produce>>();
      for (const [anchorId, tile] of previewAnchorTiles) {
        const connector = getAnchorParent(anchorId, scene.connectors);
        const accumulator = (byConnector.get(connector.id) ?? connector) as
          | typeof connector
          | undefined;
        const next = produce(accumulator!, (draft) => {
          const anchor = getItemByIdOrThrow(
            (accumulator as typeof connector).anchors,
            anchorId
          );
          draft.anchors[anchor.index] = {
            ...anchor.value,
            ref: { tile }
          };
        });
        byConnector.set(connector.id, next);
      }
      for (const [id, newConnector] of byConnector) {
        scene.updateConnector(
          id,
          newConnector as Parameters<typeof scene.updateConnector>[1]
        );
      }
      previewAnchorTiles.clear();
    }

    scene.commitDragTransaction();
    uiState.actions.setItemControls(null);
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
