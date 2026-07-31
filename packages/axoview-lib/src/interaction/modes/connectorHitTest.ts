// The connector tool's hit-test and its degeneracy rules.
//
// The I4 carry-forward note put it plainly: *the connector tool trusts geometry
// and distrusts nothing else*. Its hit-tests called `getItemAtTile({ tile,
// scene })` with neither the ADR 0023 `point` nor `isItemInteractable`, while
// every `Cursor` path passes both — so a node on a locked layer, or on a hidden
// one, was a valid anchor target (CONN-15), and an off-grid node's drawn body
// was invisible to the tool (CONN-03, which did not fire at realistic offsets
// but is the same hole). And *degenerate connectors are creatable four ways and
// rejected none*: self-loop (CONN-10), zero-length free-floating (CONN-07),
// half-attached (CONN-13), and the abandoned self-anchored provisional from
// I1/PTR-07 — nothing in the reducer, `validateView` or `modelSchema` objects to
// any of them.
//
// Both modes (`Connector`, `ReconnectAnchor`) go through this module so the
// answer cannot drift between drawing a connector and re-anchoring one.

import { getItemAtTile } from 'src/utils';
import { cursorCanvasPoint } from 'src/utils/coordinateTransforms';
import type { ConnectorAnchor, Coords, ItemReference, State } from 'src/types';

/**
 * What the connector tool is pointing at — an interactable ITEM, or nothing.
 *
 * Two differences from the bare `getItemAtTile` the tool used to call:
 *
 *  1. **The layer gate.** A locked or hidden node reads as empty tile, so the
 *     tool cannot bind an anchor to an entity the user has declared off-limits
 *     or cannot even see (CONN-15). Same predicate the pointer modes are handed.
 *  2. **The ADR 0023 cursor point.** Item hit-testing becomes pixel-accurate
 *     against rendered footprints, so an off-grid node is connectable where it
 *     is DRAWN rather than at its grid cell (CONN-03).
 *
 * Returns null for anything that is not an interactable ITEM: the connector
 * tool's only valid anchor target is a node, and every other result (a
 * connector, a rectangle, a locked node) means "treat this as bare tile".
 */
export const connectorItemAtTile = (state: State): ItemReference | null => {
  const { uiState, scene, isItemInteractable } = state;
  const tile = uiState.mouse.position.tile;
  const hit = getItemAtTile({
    tile,
    scene,
    canvasMode: uiState.canvasMode,
    point: cursorCanvasPoint(uiState, uiState.mouse.position.screen)
  });
  if (hit?.type !== 'ITEM') return null;
  // `isItemInteractable` may be absent in tests that bypass the State type;
  // treat that as "no layers configured", which is what an empty gate means.
  if (isItemInteractable && !isItemInteractable(hit)) return null;
  return hit;
};

/** The two ends of a connector, ignoring any waypoints between them. */
const endpoints = (anchors: readonly ConnectorAnchor[]) =>
  anchors.length >= 2
    ? ([anchors[0], anchors[anchors.length - 1]] as const)
    : null;

const sameTile = (a: Coords | undefined, b: Coords | undefined) =>
  !!a && !!b && a.x === b.x && a.y === b.y;

/**
 * Is this connector degenerate — both ends resolving to the SAME target?
 *
 * Two shapes, one rule:
 *  - both anchors bound to the same node → a zero-length self-loop (CONN-10),
 *    which is also the state `createConnectorAt` seeds before the second click
 *    resolves the far end, so an abandoned draw leaves one behind (I1/PTR-07);
 *  - both anchors on the same bare tile → a zero-length connector attached to
 *    nothing, which a zero-travel press-release in drag mode committed (CONN-07).
 *
 * A node → bare-tile connector with real length is NOT degenerate: a deliberate
 * free-floating endpoint is a documented feature (ADR 0022 addendum), and the
 * user can see it, select it and drag its end. See the CONN-07/13 entry for why
 * that half was resolved as by-design rather than reverted.
 */
export const isDegenerateConnector = (
  anchors: readonly ConnectorAnchor[]
): boolean => {
  const ends = endpoints(anchors);
  if (!ends) return true; // fewer than two anchors is not a connector at all
  const [a, b] = ends;
  if (a.ref?.item && b.ref?.item) return a.ref.item === b.ref.item;
  if (a.ref?.tile && b.ref?.tile) return sameTile(a.ref.tile, b.ref.tile);
  return false;
};

/**
 * How many connectors ALREADY join this unordered node pair, excluding `selfId`.
 *
 * Used to fan parallel connectors apart (CONN-11): the router is a pure function
 * of the two endpoints, so a second connector between the same pair is routed
 * along byte-identical tiles and renders as one line — the second one cannot be
 * selected, styled, labelled or deleted by pointer.
 */
export const countParallelConnectors = (
  connectors: readonly { id: string; anchors: ConnectorAnchor[] }[],
  itemA: string,
  itemB: string,
  selfId: string
): number => {
  let n = 0;
  for (const c of connectors) {
    if (c.id === selfId) continue;
    const ends = endpoints(c.anchors);
    if (!ends) continue;
    const [p, q] = ends;
    if (!p.ref?.item || !q.ref?.item) continue;
    if (
      (p.ref.item === itemA && q.ref.item === itemB) ||
      (p.ref.item === itemB && q.ref.item === itemA)
    ) {
      n += 1;
    }
  }
  return n;
};

/**
 * A waypoint tile that pulls the `index`-th parallel connector off the direct
 * route between `a` and `b`, or null when the pair is coincident.
 *
 * Index-based perpendicular displacement at the midpoint — the standard
 * parallel-edge treatment. Signs alternate so a third connector fans to the
 * other side of the direct route rather than stacking on the second.
 *
 * This is the automated form of the workaround the campaign found by accident
 * ("add a waypoint to one of them by dragging its body"). It is a MODEL change,
 * not a router change: the waypoint is a real anchor the user can drag or
 * delete, it survives save/load, and it rides the creation's own history entry.
 * A true router-level fan-out (bundling, curvature) is a bigger piece of work
 * and is not what this entry asked for.
 */
export const parallelWaypointTile = (
  a: Coords,
  b: Coords,
  index: number
): Coords | null => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  // Alternate sides: 1 → +1, 2 → -1, 3 → +2, 4 → -2, …
  const step = Math.ceil(index / 2);
  const sign = index % 2 === 1 ? 1 : -1;
  const magnitude = step * sign;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const tile = {
    x: Math.round(mid.x + (-dy / len) * magnitude),
    y: Math.round(mid.y + (dx / len) * magnitude)
  };
  // A displacement that rounds back onto the direct midpoint would not separate
  // the routes — nudge along the dominant perpendicular axis instead.
  if (tile.x === Math.round(mid.x) && tile.y === Math.round(mid.y)) {
    if (Math.abs(dy) >= Math.abs(dx)) tile.x += magnitude > 0 ? 1 : -1;
    else tile.y += magnitude > 0 ? 1 : -1;
  }
  return tile;
};
