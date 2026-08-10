import { produce } from 'immer';
import {
  ModeActions,
  ItemReference,
  Coords,
  Size,
  ViewItem,
  Rectangle,
  TextBox,
  Label,
  Connector,
  ConnectorAnchor
} from 'src/types';
import {
  isWithinBounds,
  doBoundsOverlap,
  hasMovedTile,
  getItemByIdOrThrow,
  getTextBoxEndTile,
  segmentIntersectsRect
} from 'src/utils';
import { getConnectorMovementAnchorRefs } from 'src/utils/connectorSelection';
import {
  mergeMarqueeSelection,
  isAdditiveModifier
} from 'src/utils/selectableRefs';

interface LassoScene {
  items: ViewItem[];
  rectangles: Rectangle[];
  // The rendered textbox carries a computed `size`; we need it to hit-test the
  // box's full bounds (not just its origin tile).
  textBoxes: (TextBox & { size: Size })[];
  // Optional so partial scenes (tests / older callers) don't crash; reads guard
  // with `?? []`. The live useScene scene always provides it. ADR 0031.
  labels?: Label[];
  connectors: Connector[];
}

// Helper to find all items within the lasso bounds. Items on locked or hidden
// layers are excluded via isItemInteractable (mqa-results.md #2).
const getItemsInBounds = (
  startTile: Coords,
  endTile: Coords,
  scene: LassoScene,
  isItemInteractable: (ref: ItemReference) => boolean
): ItemReference[] => {
  const items: ItemReference[] = [];

  // Check all nodes/items
  scene.items.forEach((item: ViewItem) => {
    if (
      isWithinBounds(item.tile, [startTile, endTile]) &&
      isItemInteractable({ type: 'ITEM', id: item.id })
    ) {
      items.push({ type: 'ITEM', id: item.id });
    }
  });

  // Rectangles select on ANY overlap with the marquee (ADR 0006 addendum #16):
  // a lasso through the middle of a long rectangle must select it, not only one
  // that fully encloses all four corners. Allocation-free AABB test — this runs
  // every marquee-drag frame.
  scene.rectangles.forEach((rectangle: Rectangle) => {
    if (!isItemInteractable({ type: 'RECTANGLE', id: rectangle.id })) return;
    if (doBoundsOverlap(rectangle.from, rectangle.to, startTile, endTile)) {
      items.push({ type: 'RECTANGLE', id: rectangle.id });
    }
  });

  // Textboxes hit on their FULL bounds (origin tile → far corner), not just the
  // origin tile (ADR 0006 addendum #16): a lasso over a text body selects it.
  // getTextBoxEndTile resolves the far corner per orientation; doBoundsOverlap
  // tolerates the negative-axis corner that orientation Y produces.
  scene.textBoxes.forEach((textBox) => {
    if (!isItemInteractable({ type: 'TEXTBOX', id: textBox.id })) return;
    const endTextTile = getTextBoxEndTile(textBox, textBox.size);
    if (doBoundsOverlap(textBox.tile, endTextTile, startTile, endTile)) {
      items.push({ type: 'TEXTBOX', id: textBox.id });
    }
  });

  // Floating Labels (ADR 0031) hit on their anchor tile — a billboard chip has
  // no iso footprint, so a marquee covering the tile selects the label.
  (scene.labels ?? []).forEach((label) => {
    if (!isItemInteractable({ type: 'LABEL', id: label.id })) return;
    if (isWithinBounds(label.tile, [startTile, endTile])) {
      items.push({ type: 'LABEL', id: label.id });
    }
  });

  // Include a connector if any segment of its path intersects the lasso
  // rectangle (path-hit semantics — mirrors click selection). A "segment"
  // is the straight line between consecutive anchors after resolving each
  // anchor to its current tile position. This covers:
  //   - Both endpoints inside (first segment trivially intersects)
  //   - Endpoints outside but the connector crosses through the lasso
  //     (regression 2026-05-25: previously missed)
  //   - One endpoint inside, the other out
  //   - Sub-paths that loop in and out via waypoints
  // Routing decoration (Manhattan bends, curve smoothing) is a render
  // concern; selection works on the anchor-defined path.
  // SPATIAL-3: resolve item-anchors via a Map built once, not a scene.items.find
  // per anchor. getItemsInBounds runs every marquee-drag frame, so the old
  // per-anchor linear scan was O(C·A·N)/frame; this makes it O(C·A) after the
  // one-time O(N) map build. Built only when there are connectors so a plain
  // node marquee doesn't pay for it.
  const itemTileById =
    scene.connectors.length > 0
      ? new Map<string, Coords>(scene.items.map((it) => [it.id, it.tile]))
      : null;
  const anchorToTile = (anchor: ConnectorAnchor): Coords | null => {
    if (anchor.ref?.item) {
      return itemTileById?.get(anchor.ref.item) ?? null;
    }
    if (anchor.ref?.tile) return anchor.ref.tile;
    return null;
  };

  scene.connectors.forEach((connector: Connector) => {
    if (!connector.anchors || connector.anchors.length < 2) return;
    if (!isItemInteractable({ type: 'CONNECTOR', id: connector.id })) return;

    const tiles = connector.anchors.map((a) => anchorToTile(a));

    let pathHits = false;
    for (let i = 0; i < tiles.length - 1; i += 1) {
      const a = tiles[i];
      const b = tiles[i + 1];
      if (!a || !b) continue; // anchor with unresolvable ref — skip that segment
      if (segmentIntersectsRect(a, b, [startTile, endTile])) {
        pathHits = true;
        break;
      }
    }

    if (pathHits) {
      items.push({ type: 'CONNECTOR', id: connector.id });
      // Capture ALL tile-bound anchors — middle waypoints AND free-floating
      // (tile-bound) endpoints — so the whole connector drags rigidly with the
      // group (ADR 0006 addendum #2). Node-bound endpoints have no ref.tile, so
      // a normal connector is unaffected. Endpoints captured here travel only
      // alongside this CONNECTOR ref, so the delete path removes the connector
      // wholesale rather than splicing an endpoint (see
      // getConnectorMovementAnchorRefs).
      items.push(...getConnectorMovementAnchorRefs(connector));
      return;
    }

    // Connector path doesn't intersect the lasso. Still capture any free-
    // floating MIDDLE waypoint anchors inside the rect (a user could lasso
    // just a waypoint to drag it independently). Endpoints (index 0 and
    // length-1) are deliberately skipped HERE: a partial selection that
    // captured an endpoint WITHOUT its connector could splice the endpoint on
    // delete and corrupt the scene (regression 2026-05-25). Endpoint movement
    // capture lives in the path-hit branch above, where the connector comes
    // along too. NOTE: with path-hit semantics this branch is largely
    // defensive; a tile-bound middle waypoint inside the rect makes at least
    // one adjacent segment touch the rect, so pathHits is true and we never
    // reach here. Kept as a belt-and-suspenders fallback for edge cases.
    for (let i = 1; i < connector.anchors.length - 1; i += 1) {
      const anchor = connector.anchors[i];
      if (
        anchor.ref?.tile &&
        isWithinBounds(anchor.ref.tile, [startTile, endTile])
      ) {
        items.push({ type: 'CONNECTOR_ANCHOR', id: anchor.id });
      }
    }
  });

  return items;
};

export const Lasso: ModeActions = {
  mousemove: ({ uiState, scene, isItemInteractable }) => {
    if (uiState.mode.type !== 'LASSO' || !uiState.mouse.mousedown) return;

    if (!hasMovedTile(uiState.mouse)) return;

    if (uiState.mode.isDragging && uiState.mode.selection) {
      // User is dragging an existing selection - switch to DRAG_ITEMS mode
      const initialTiles: Record<string, Coords> = {};
      const initialRectangles: Record<string, { from: Coords; to: Coords }> =
        {};
      uiState.mode.selection.items.forEach((item) => {
        try {
          if (item.type === 'ITEM') {
            initialTiles[item.id] = getItemByIdOrThrow(
              scene.items,
              item.id
            ).value.tile;
          } else if (item.type === 'TEXTBOX') {
            initialTiles[item.id] = getItemByIdOrThrow(
              scene.textBoxes,
              item.id
            ).value.tile;
          } else if (item.type === 'LABEL') {
            initialTiles[item.id] = getItemByIdOrThrow(
              scene.labels ?? [],
              item.id
            ).value.tile;
          } else if (item.type === 'RECTANGLE') {
            const r = getItemByIdOrThrow(scene.rectangles, item.id).value;
            initialRectangles[item.id] = { from: r.from, to: r.to };
          } else if (item.type === 'CONNECTOR_ANCHOR') {
            for (const connector of scene.connectors) {
              const anchor = connector.anchors.find(
                (a: ConnectorAnchor) => a.id === item.id
              );
              if (anchor?.ref?.tile) {
                initialTiles[item.id] = anchor.ref.tile;
                break;
              }
            }
          }
        } catch {}
      });
      uiState.actions.setMode({
        type: 'DRAG_ITEMS',
        showCursor: true,
        items: uiState.mode.selection.items,
        initialTiles,
        initialRectangles
      });
      return;
    }

    // User is creating/updating the selection box
    const startTile = uiState.mouse.mousedown.tile;
    const endTile = uiState.mouse.position.tile;
    // Tolerate undefined in tests that bypass the State type via `as any`.
    const gate = isItemInteractable ?? (() => true);
    const items = getItemsInBounds(startTile, endTile, scene, gate);

    uiState.actions.setMode(
      produce(uiState.mode, (draft) => {
        if (draft.type === 'LASSO') {
          draft.selection = {
            startTile,
            endTile,
            items
          };
        }
      })
    );
  },

  mousedown: ({ uiState, isRendererInteraction }) => {
    if (uiState.mode.type !== 'LASSO') return;

    // If there's an existing selection, check if click is within it.
    // Allow this even for non-renderer clicks (e.g. clicking on a node element within
    // the selection) so the drag still starts correctly.
    if (uiState.mode.selection) {
      const isWithinSelection = isWithinBounds(uiState.mouse.position.tile, [
        uiState.mode.selection.startTile,
        uiState.mode.selection.endTile
      ]);

      if (isWithinSelection) {
        // Clicked within selection - prepare to drag
        uiState.actions.setMode(
          produce(uiState.mode, (draft) => {
            if (draft.type === 'LASSO') {
              draft.isDragging = true;
            }
          })
        );
        return;
      }
    }

    // Clicked outside an existing selection — clear it and start a new drag.
    // If there's no selection yet, do nothing: mousemove will build the selection box.
    // Only act on genuine canvas interactions; UI panel clicks leave lasso mode unchanged.
    if (!isRendererInteraction) return;

    if (uiState.mode.selection) {
      // Clear the old selection so the next drag starts fresh
      uiState.actions.setMode({
        type: 'LASSO',
        showCursor: true,
        selection: null,
        isDragging: false
      });
    }
    // No selection yet — do nothing, let mousemove handle the drag
  },

  mouseup: ({ uiState }) => {
    if (uiState.mode.type !== 'LASSO') return;
    if (!uiState.mouse.mousedown) return; // toolbar click — mousedown was stopped, skip

    const hasSelection =
      uiState.mode.selection && uiState.mode.selection.items.length > 0;

    if (!hasSelection) {
      // Dragged but caught nothing — exit back to cursor
      uiState.actions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      return;
    }

    // Mirror the lasso selection into the persistent multi-selection slice so
    // tools that read selectedIds (delete, Ctrl+A, panel auto-hide, the
    // BottomDock "N selected" badge) see the same set. ADR-0006. Optional-call
    // so mode-action unit tests with a minimal actions mock keep working.
    //
    // I3/SEL-15 (ruled 2026-07-30, ADR 0006 §2 addendum): with the additive
    // modifier held the marquee EXTENDS the selection instead of replacing it —
    // the same modifier the click path has honoured since change #10.
    uiState.actions.setSelectedIds?.(
      mergeMarqueeSelection(
        uiState.selectedIds ?? [],
        uiState.mode.selection!.items,
        isAdditiveModifier(uiState.mouse.modifiers)
      )
    );

    // 2026-07-02: after the marquee completes, drop back to CURSOR (keeping the
    // selection) instead of lingering in LASSO. This makes post-lasso clicks
    // behave like every other modelling tool (Figma/draw.io): a plain click on
    // empty canvas — even INSIDE the former marquee box — clears the selection;
    // a click on an element selects just it; dragging a selected element moves
    // the whole group (Cursor multi-select drag); dragging empty space starts a
    // new marquee. Previously LASSO stayed active and a click inside the box was
    // swallowed as a group-drag prep, so it never reset (the reported bug).
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  }
};
