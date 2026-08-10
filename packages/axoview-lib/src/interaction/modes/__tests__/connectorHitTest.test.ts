/**
 * Promoted from the 2026-07 exploratory lane (I4/CONN-10, CONN-11, CONN-15).
 *
 * The area's carry-forward note named two themes: *the connector tool trusts
 * geometry and distrusts nothing else* — its hit-tests took neither the ADR 0023
 * cursor point nor `isItemInteractable`, while every Cursor path takes both —
 * and *degenerate connectors are creatable four ways and rejected none*. This
 * suite pins the predicates both modes now share.
 */
import {
  connectorItemAtTile,
  isDegenerateConnector,
  countParallelConnectors,
  parallelWaypointTile
} from '../connectorHitTest';
import type { ConnectorAnchor, State } from 'src/types';

const NODE = { id: 'n1', tile: { x: 3, y: 3 } };

const makeState = (
  interactable: (ref: { id: string }) => boolean = () => true
): State =>
  ({
    uiState: {
      canvasMode: 'ISOMETRIC',
      zoom: 1,
      scroll: { position: { x: 0, y: 0 }, offset: { x: 0, y: 0 } },
      rendererSize: { width: 800, height: 600 },
      // No `screen`, so `cursorCanvasPoint` yields undefined and the hit-test
      // takes its raw-tile path. The ADR 0023 pixel-accurate branch is
      // `getItemAtTile`'s own contract (`hitDetection` + `off-grid-pointer`
      // cover it); what this suite pins is the LAYER gate around it.
      mouse: { position: { tile: { x: 3, y: 3 } } }
    },
    scene: {
      items: [NODE],
      rectangles: [],
      textBoxes: [],
      labels: [],
      connectors: [],
      // `getItemAtTile` reads the merged scene-path list for connector hits.
      hitConnectors: [],
      currentView: { items: [NODE], connectors: [] }
    },
    isItemInteractable: interactable
  }) as unknown as State;

describe('connectorItemAtTile — the layer gate (CONN-15)', () => {
  it('returns the node under the cursor when it is interactable', () => {
    expect(connectorItemAtTile(makeState())).toEqual(
      expect.objectContaining({ type: 'ITEM', id: 'n1' })
    );
  });

  it('returns null for a node on a LOCKED or hidden layer', () => {
    // The whole bug: the tool bound an anchor to an entity the user had
    // declared un-editable, or could not even see.
    expect(connectorItemAtTile(makeState(() => false))).toBeNull();
  });

  it('treats a missing gate as "no layers configured"', () => {
    const state = makeState();
    delete (state as { isItemInteractable?: unknown }).isItemInteractable;
    expect(connectorItemAtTile(state)).toEqual(
      expect.objectContaining({ id: 'n1' })
    );
  });
});

describe('isDegenerateConnector', () => {
  const anchors = (
    a: ConnectorAnchor['ref'],
    b: ConnectorAnchor['ref'],
    ...mid: ConnectorAnchor['ref'][]
  ): ConnectorAnchor[] =>
    [a, ...mid, b].map((ref, i) => ({ id: `a${i}`, ref })) as ConnectorAnchor[];

  it('is true for a self-loop — both ends on the same node (CONN-10)', () => {
    expect(
      isDegenerateConnector(anchors({ item: 'n1' }, { item: 'n1' }))
    ).toBe(true);
  });

  it('is true for both ends on the same bare tile (CONN-07)', () => {
    expect(
      isDegenerateConnector(
        anchors({ tile: { x: 5, y: 5 } }, { tile: { x: 5, y: 5 } })
      )
    ).toBe(true);
  });

  it('is FALSE for a node → bare-tile connector with real length', () => {
    // A deliberate free-floating endpoint is a documented feature (ADR 0022
    // addendum) — the user can see it, select it and drag its end. This is the
    // half of CONN-07/13 that was resolved as by-design.
    expect(
      isDegenerateConnector(anchors({ item: 'n1' }, { tile: { x: 9, y: 2 } }))
    ).toBe(false);
  });

  it('is false for two different nodes and for two different tiles', () => {
    expect(
      isDegenerateConnector(anchors({ item: 'n1' }, { item: 'n2' }))
    ).toBe(false);
    expect(
      isDegenerateConnector(
        anchors({ tile: { x: 1, y: 1 } }, { tile: { x: 4, y: 4 } })
      )
    ).toBe(false);
  });

  it('judges the ENDS, ignoring waypoints between them', () => {
    expect(
      isDegenerateConnector(
        anchors({ item: 'n1' }, { item: 'n1' }, { tile: { x: 7, y: 7 } })
      )
    ).toBe(true);
    expect(
      isDegenerateConnector(
        anchors({ item: 'n1' }, { item: 'n2' }, { tile: { x: 7, y: 7 } })
      )
    ).toBe(false);
  });

  it('is true for fewer than two anchors — that is not a connector', () => {
    expect(isDegenerateConnector([])).toBe(true);
    expect(
      isDegenerateConnector([{ id: 'a', ref: { item: 'n1' } }] as never)
    ).toBe(true);
  });
});

describe('countParallelConnectors (CONN-11)', () => {
  const conn = (id: string, a: string, b: string) => ({
    id,
    anchors: [
      { id: `${id}-0`, ref: { item: a } },
      { id: `${id}-1`, ref: { item: b } }
    ] as ConnectorAnchor[]
  });

  it('counts connectors joining the same pair, in either direction', () => {
    const all = [conn('c1', 'a', 'b'), conn('c2', 'b', 'a')];
    expect(countParallelConnectors(all, 'a', 'b', 'c3')).toBe(2);
  });

  it('excludes the connector being drawn', () => {
    const all = [conn('c1', 'a', 'b')];
    expect(countParallelConnectors(all, 'a', 'b', 'c1')).toBe(0);
  });

  it('ignores connectors with a free-floating end and other pairs', () => {
    const free = {
      id: 'c9',
      anchors: [
        { id: 'x', ref: { item: 'a' } },
        { id: 'y', ref: { tile: { x: 1, y: 1 } } }
      ] as ConnectorAnchor[]
    };
    expect(
      countParallelConnectors([free, conn('c2', 'a', 'z')], 'a', 'b', 'c3')
    ).toBe(0);
  });
});

describe('parallelWaypointTile (CONN-11)', () => {
  const A = { x: 0, y: 0 };
  const B = { x: 0, y: 10 };

  it('displaces perpendicular to the direct route', () => {
    const wp = parallelWaypointTile(A, B, 1);
    // Route runs along y, so the offset is along x.
    expect(wp).toEqual({ x: -1, y: 5 });
  });

  it('alternates sides so a third connector fans the other way', () => {
    expect(parallelWaypointTile(A, B, 1)!.x).toBeLessThan(0);
    expect(parallelWaypointTile(A, B, 2)!.x).toBeGreaterThan(0);
  });

  it('grows the displacement as parallels accumulate', () => {
    const first = Math.abs(parallelWaypointTile(A, B, 1)!.x);
    const third = Math.abs(parallelWaypointTile(A, B, 3)!.x);
    expect(third).toBeGreaterThan(first);
  });

  it('never lands back on the direct midpoint', () => {
    // A rounding that put the waypoint on the route would not separate them,
    // which is the whole point of the fan-out.
    for (const [a, b] of [
      [A, B],
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 0 }, { x: 7, y: 3 }],
      [{ x: -4, y: 2 }, { x: 6, y: -5 }]
    ] as const) {
      const mid = {
        x: Math.round((a.x + b.x) / 2),
        y: Math.round((a.y + b.y) / 2)
      };
      for (const i of [1, 2, 3]) {
        expect(parallelWaypointTile(a, b, i)).not.toEqual(mid);
      }
    }
  });

  it('is null for two coincident endpoints', () => {
    expect(parallelWaypointTile(A, { ...A }, 1)).toBeNull();
  });
});
