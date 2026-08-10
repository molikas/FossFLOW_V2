import { produce } from 'immer';
import { generateId, getItemAtTile, hasMovedTile, setWindowCursor } from 'src/utils';
import { exceedsTapSlop } from 'src/config/tapGesture';
import {
  connectorItemAtTile,
  countParallelConnectors,
  isDegenerateConnector,
  parallelWaypointTile
} from './connectorHitTest';
import {
  ModeActions,
  Connector as ConnectorI,
  ConnectorAnchor,
  ConnectorDefaults,
  Coords,
  State
} from 'src/types';

type ItemAtTile = ReturnType<typeof getItemAtTile>;

// Build a fresh connector anchor pointing at the hovered item (when one is
// under the cursor) or the raw tile. Mirrors the inline anchor construction
// the connector handlers previously repeated.
const makeAnchor = (itemAtTile: ItemAtTile, tile: Coords): ConnectorAnchor =>
  itemAtTile?.type === 'ITEM'
    ? { id: generateId(), ref: { item: itemAtTile.id } }
    : { id: generateId(), ref: { tile } };

// A brand-new two-ended connector with both anchors pinned to the same target.
// Pre-draw style defaults (set via the top-bar connector controls while the tool
// is armed) are applied here so the next connector inherits them; an unset field
// falls back to the connector schema default. `color` falls back to the scene's
// first colour when no default colour is chosen.
const createConnectorAt = (
  colorId: string,
  itemAtTile: ItemAtTile,
  tile: Coords,
  defaults: ConnectorDefaults = {}
): ConnectorI => ({
  id: generateId(),
  color: defaults.color ?? colorId,
  ...(defaults.customColor ? { customColor: defaults.customColor } : {}),
  ...(defaults.style ? { style: defaults.style } : {}),
  ...(defaults.lineType ? { lineType: defaults.lineType } : {}),
  ...(defaults.width !== undefined ? { width: defaults.width } : {}),
  ...(defaults.showArrow !== undefined ? { showArrow: defaults.showArrow } : {}),
  anchors: [makeAnchor(itemAtTile, tile), makeAnchor(itemAtTile, tile)]
});

// Click mode, first press: create the connector and arm it. The start anchor
// binds to the node under the cursor, or to the raw tile for a free-floating
// connector (drawing a line on empty canvas — ADR 0022 addendum).
//
// ADR 0022's "no free-floating connector from a stray click" guard is preserved
// not by blocking the empty start here, but by REVERTING it on mouseup when the
// gesture turned out to be a lone click (see the mouseup handler): a stray empty
// click leaves nothing behind, while a deliberate drag from empty draws the line.
const handleClickFirst = (
  { uiState, scene }: State,
  itemAtTile: ItemAtTile
) => {
  const tile = uiState.mouse.position.tile;
  const startAnchor =
    itemAtTile?.type === 'ITEM' ? { itemId: itemAtTile.id } : { tile };

  // Create a connector but don't finalize it yet.
  const newConnector = createConnectorAt(
    scene.colors[0].id,
    itemAtTile,
    tile,
    uiState.connectorDefaults
  );

  // Open one history entry for the entire create→drag→commit lifecycle.
  // commitDragTransaction is called on the second click (or mouseup in drag mode).
  scene.beginDragTransaction();
  scene.createConnector(newConnector);

  uiState.actions.setMode({
    type: 'CONNECTOR',
    showCursor: true,
    id: newConnector.id,
    startAnchor,
    isConnecting: true,
    returnToCursor:
      uiState.mode.type === 'CONNECTOR'
        ? uiState.mode.returnToCursor
        : undefined
  });
};

// Abandon the in-flight connector without committing it: delete, close the
// bracket (which nets to zero patches, so no spurious history entry) and reset
// the tool. The shared ending for every "this is not a connector" outcome —
// a degenerate result (CONN-07/CONN-10) or a gesture that never travelled.
const revertInFlight = ({ uiState, scene }: State, connectorId: string) => {
  scene.deleteConnector(connectorId);
  scene.commitDragTransaction();
  uiState.actions.setMode({
    type: 'CONNECTOR',
    showCursor: true,
    id: null,
    startAnchor: undefined,
    isConnecting: false
  });
};

// CONN-11: the router is a pure function of the two endpoints, so a SECOND
// connector between the same node pair is routed along byte-identical tiles and
// renders as one line — unreachable by pointer, so it cannot be selected,
// styled, labelled or deleted. Seed a waypoint that pulls it off the direct
// route. Returns the connector unchanged when it isn't node-to-node, when the
// pair has no other connector, or when the two nodes' tiles are unknown.
const fanOutParallel = (
  connector: ConnectorI,
  scene: State['scene']
): ConnectorI => {
  const first = connector.anchors[0];
  const last = connector.anchors[connector.anchors.length - 1];
  // Only fan a fresh two-anchor node→node connector; once it has waypoints of
  // its own the user has already given it a distinct route.
  if (connector.anchors.length !== 2) return connector;
  const itemA = first?.ref?.item;
  const itemB = last?.ref?.item;
  if (!itemA || !itemB || itemA === itemB) return connector;

  const existing = countParallelConnectors(
    scene.currentView.connectors ?? [],
    itemA,
    itemB,
    connector.id
  );
  if (existing === 0) return connector;

  const items = scene.currentView.items ?? [];
  const tileA = items.find((i) => i.id === itemA)?.tile;
  const tileB = items.find((i) => i.id === itemB)?.tile;
  if (!tileA || !tileB) return connector;

  const waypoint = parallelWaypointTile(tileA, tileB, existing);
  if (!waypoint) return connector;

  return produce(connector, (draft) => {
    draft.anchors.splice(1, 0, {
      id: generateId(),
      ref: { tile: waypoint }
    });
  });
};

// Click mode, second click: complete the connection (or reset if the
// in-progress connector vanished).
const handleClickSecond = (
  state: State,
  itemAtTile: ItemAtTile
) => {
  const { uiState, scene } = state;
  const currentMode = uiState.mode;
  if (currentMode.type !== 'CONNECTOR' || !currentMode.id) return;

  // Try to find the connector - it might not exist.
  const connector = (scene.currentView.connectors ?? []).find(
    (c) => c.id === currentMode.id
  );

  // If connector doesn't exist, reset mode and return.
  if (!connector) {
    scene.commitDragTransaction();
    uiState.actions.setMode({
      type: 'CONNECTOR',
      showCursor: true,
      id: null,
      startAnchor: undefined,
      isConnecting: false
    });
    return;
  }

  // Update the second anchor to the click position.
  const resolved = produce(connector, (draft) => {
    draft.anchors[draft.anchors.length - 1] = makeAnchor(
      itemAtTile,
      uiState.mouse.position.tile
    );
  });

  // CONN-10 / CONN-07: both ends on the same target is not a connector. That is
  // also `createConnectorAt`'s SEED state (both anchors on the pressed item), so
  // "the user clicked the same node twice" and "the user never resolved the far
  // end" produce the identical shape — which is why a self-loop was the default
  // rather than an edge case. Revert instead of committing.
  if (isDegenerateConnector(resolved.anchors)) {
    revertInFlight(state, currentMode.id);
    return;
  }

  const newConnector = fanOutParallel(resolved, scene);

  scene.updateConnector(currentMode.id, newConnector);
  scene.commitDragTransaction();
  // #8: a pre-draw style applies to exactly ONE connector — reset so the next
  // draw defaults (no sticky last-used style).
  uiState.actions.resetConnectorDefaults?.();

  if (currentMode.returnToCursor) {
    uiState.actions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
  } else {
    uiState.actions.setMode({
      type: 'CONNECTOR',
      showCursor: true,
      id: null,
      startAnchor: undefined,
      isConnecting: false
    });
  }
};

// Drag mode: create the connector and let mouseup commit it.
const handleDragStart = (
  { uiState, scene }: State,
  itemAtTile: ItemAtTile
) => {
  const newConnector = createConnectorAt(
    scene.colors[0].id,
    itemAtTile,
    uiState.mouse.position.tile,
    uiState.connectorDefaults
  );

  // Drag-mode: open one history entry for the whole press→drag→release.
  scene.beginDragTransaction();
  scene.createConnector(newConnector);

  uiState.actions.setMode({
    type: 'CONNECTOR',
    showCursor: true,
    id: newConnector.id,
    // Preserve the one-shot flag across the drag (mirrors handleClickFirst).
    // The palette Connector tool sets returnToCursor:true so it pops back to the
    // pointer after one connector; without carrying it here the flag was dropped
    // at mousedown and a drag-drawn connector left the tool armed instead of
    // resetting to the cursor on release.
    returnToCursor:
      uiState.mode.type === 'CONNECTOR'
        ? uiState.mode.returnToCursor
        : undefined
  });
};

export const Connector: ModeActions = {
  entry: () => {
    setWindowCursor('crosshair');
  },
  exit: () => {
    setWindowCursor('default');
  },
  mousemove: (state) => {
    const { uiState, scene } = state;
    if (
      uiState.mode.type !== 'CONNECTOR' ||
      !uiState.mode.id ||
      !hasMovedTile(uiState.mouse)
    )
      return;

    // TypeScript type guard - we know mode is CONNECTOR type here
    const connectorMode = uiState.mode;

    // Only update connector position in drag mode or when connecting in click mode
    if (
      uiState.connectorInteractionMode === 'drag' ||
      connectorMode.isConnecting
    ) {
      // Try to find the connector - it might not exist yet
      const connectorItem = (scene.currentView.connectors ?? []).find(
        (c) => c.id === connectorMode.id
      );

      // If connector doesn't exist yet, return early
      if (!connectorItem) {
        return;
      }

      const itemAtTile = connectorItemAtTile(state);

      // CONN-04: this used to rebuild the end anchor with a fresh
      // `generateId()` on EVERY tile the pointer crossed — three distinct ids
      // across three moves — so anything holding the id from a frame earlier
      // (an overlay React key, a selection ref, `mouse.targetAnchorId`) pointed
      // at an anchor that no longer existed. Only the `ref` changes while
      // drawing; the identity is allocated once, at create.
      const newConnector = produce(connectorItem, (draft) => {
        const last = draft.anchors.length - 1;
        draft.anchors[last] = {
          ...draft.anchors[last],
          ref:
            itemAtTile?.type === 'ITEM'
              ? { item: itemAtTile.id }
              : { tile: uiState.mouse.position.tile }
        };
      });

      scene.updateConnector(connectorMode.id!, newConnector);
    }
  },
  mousedown: (state) => {
    const { uiState, isRendererInteraction } = state;
    if (uiState.mode.type !== 'CONNECTOR' || !isRendererInteraction) return;

    // CONN-15: the layer gate. A locked or hidden node reads as bare tile here,
    // so the tool cannot bind an anchor to an entity the user declared
    // off-limits — the same predicate every Cursor path is handed.
    const itemAtTile = connectorItemAtTile(state);

    if (uiState.connectorInteractionMode !== 'click') {
      // Drag mode: original behavior.
      handleDragStart(state, itemAtTile);
      return;
    }

    // Click mode: first click arms the connection, second click completes it.
    if (!uiState.mode.startAnchor) {
      handleClickFirst(state, itemAtTile);
    } else {
      handleClickSecond(state, itemAtTile);
    }
  },
  mouseup: (state) => {
    const { uiState, scene } = state;
    if (uiState.mode.type !== 'CONNECTOR' || !uiState.mode.id) return;
    const connectorId = uiState.mode.id;

    // Drag mode: the press→drag→release commits the connection on release.
    if (uiState.connectorInteractionMode === 'drag') {
      // CONN-07: this used to commit whatever `anchors[1]` last resolved to,
      // with no tap-slop check — so a zero-travel press-release on empty canvas
      // committed the start tile TWICE: a zero-length connector attached to
      // nothing, impossible to select because there is nothing to click, which
      // then survived save and reload. A gesture that never travelled did not
      // draw anything; the same is true of one whose two ends coincide.
      const down = uiState.mouse.mousedown?.screen;
      const travelled =
        !!down && exceedsTapSlop(down, uiState.mouse.position.screen);
      const drawn = (scene.currentView.connectors ?? []).find(
        (c) => c.id === connectorId
      );
      if (!travelled || !drawn || isDegenerateConnector(drawn.anchors)) {
        revertInFlight(state, connectorId);
        return;
      }

      const fanned = fanOutParallel(drawn, scene);
      if (fanned !== drawn) scene.updateConnector(drawn.id, fanned);

      scene.commitDragTransaction();
      uiState.actions.resetConnectorDefaults?.(); // #8: one-shot pre-draw style
      if (uiState.mode.type === 'CONNECTOR' && uiState.mode.returnToCursor) {
        uiState.actions.setMode({
          type: 'CURSOR',
          showCursor: true,
          mousedownItem: null
        });
      } else {
        uiState.actions.setMode({
          type: 'CONNECTOR',
          showCursor: true,
          id: null
        });
      }
      return;
    }

    // Click mode.
    if (!uiState.mode.isConnecting) return;

    // A press→DRAG→release completes the connection. The tool hint advertises
    // "drag between items to connect", and dragging is the intuitive gesture,
    // but the first mousedown only ARMS the connector (handleClickFirst) —
    // without this a drag-release left a provisional connector glued to the
    // cursor with the drag-transaction still open (the "connector is locked /
    // left-click won't place it" regression). This commits at the release
    // tile/item for BOTH a node start and a free-floating empty start.
    const down = uiState.mouse.mousedown?.screen;
    const dragged =
      !!down && exceedsTapSlop(down, uiState.mouse.position.screen);
    if (dragged) {
      handleClickSecond(state, connectorItemAtTile(state));
      return;
    }

    // A lone click (no travel past the tap slop). If it STARTED on a node, leave
    // it armed for the canonical second click (click-then-click is unchanged).
    // If it started on EMPTY canvas it's a stray click — revert the provisional
    // connector so it can never land as free-floating junk (ADR 0022's
    // stray-click guard, now scoped to a click instead of blocking the gesture).
    if (uiState.mode.startAnchor?.itemId) return;
    revertInFlight(state, connectorId);
  }
};
