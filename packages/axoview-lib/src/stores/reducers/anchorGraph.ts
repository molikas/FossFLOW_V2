import { Connector } from 'src/types';

/**
 * THE "leave no dangling anchor ref" rule (E2/RED-07 + E2/RED-14).
 *
 * ADR 0006 lets a connector be dropped onto another connector, producing an
 * anchor whose `ref` names a sibling connector's ANCHOR rather than a tile or
 * an item. Both delete paths computed their victim set from ITEM references
 * only and never walked that graph:
 *
 *   - `deleteViewItem` removed the connectors touching the deleted node, and
 *     left any connector anchored to THOSE connectors pointing at nothing
 *     (RED-07);
 *   - `deleteConnector` removed one connector and left the same wreckage
 *     (RED-14).
 *
 * The consequence was out of all proportion to the gesture, because of the
 * RED-02 amplifier: a dangling ref makes `validateView` report
 * `INVALID_ANCHOR_TO_ANCHOR_REF`, which used to make **every subsequent node
 * move and placement in that view throw**. Deleting one connector could make a
 * whole page un-editable.
 *
 * The rule, from the entries: for each surviving connector, a `ref.anchor` that
 * no longer resolves is re-pointed at that anchor's last known TILE; if the
 * tile is unknown, the ref is dropped, and a connector left with fewer than two
 * anchors is cascade-deleted.
 *
 * Re-pointing rather than always cascading is deliberate: the user drew that
 * connector *somewhere*, and silently deleting a second connector because they
 * deleted a first is a bigger surprise than leaving it where it was drawn.
 */

type AnchorRef = {
  item?: string;
  tile?: { x: number; y: number };
  anchor?: string;
};

const refOf = (anchor: unknown): AnchorRef | undefined =>
  (anchor as { ref?: AnchorRef } | undefined)?.ref;

/**
 * Every anchor id in the view, with the tile it resolved to if that is
 * knowable. Anchors that reference an item have no tile of their own — the
 * item's position is the tile — so they map to `undefined` and a ref pointing
 * at them is dropped rather than mis-placed.
 */
export const collectAnchorTiles = (
  connectors: readonly Connector[] | undefined
): Map<string, { x: number; y: number } | undefined> => {
  const out = new Map<string, { x: number; y: number } | undefined>();
  (connectors ?? []).forEach((connector) => {
    (connector.anchors ?? []).forEach((anchor) => {
      const ref = refOf(anchor);
      out.set(anchor.id, ref?.tile);
    });
  });
  return out;
};

export interface AnchorSweepResult {
  connectors: Connector[];
  /** Refs re-pointed at a known tile. */
  repointed: number;
  /** Connectors removed because too few anchors survived. */
  removed: number;
  /** Refs dropped with no tile to fall back to. */
  dropped: number;
}

/**
 * Sweep a connector list so no `ref.anchor` points outside it.
 *
 * `knownTiles` supplies the last known tile for anchors that are ABOUT to
 * disappear — the delete paths build it from the doomed connectors before
 * removing them, which is the only moment that information exists. The load
 * repair passes nothing, because by then it is gone.
 *
 * Iterates to a fixed point: removing a connector can orphan a ref that pointed
 * at ITS anchors, which is the transitive case a single pass misses (A→B→C).
 */
export const sweepDanglingAnchorRefs = (
  connectors: readonly Connector[] | undefined,
  knownTiles: Map<string, { x: number; y: number } | undefined> = new Map()
): AnchorSweepResult => {
  let current = [...(connectors ?? [])];
  let repointed = 0;
  let removed = 0;
  let dropped = 0;

  // Bounded by the connector count: each pass either removes at least one
  // connector or reaches the fixed point.
  for (let pass = 0; pass <= current.length; pass += 1) {
    const liveAnchorIds = new Set<string>();
    current.forEach((c) =>
      (c.anchors ?? []).forEach((a) => liveAnchorIds.add(a.id))
    );

    let changed = false;
    const next: Connector[] = [];

    for (const connector of current) {
      let touched = false;
      const anchors = (connector.anchors ?? []).flatMap((anchor) => {
        const ref = refOf(anchor);
        if (!ref?.anchor || liveAnchorIds.has(ref.anchor)) return [anchor];
        changed = true;
        touched = true;
        const tile = knownTiles.get(ref.anchor);
        if (tile) {
          repointed += 1;
          return [{ ...anchor, ref: { tile } }];
        }
        dropped += 1;
        return [];
      });

      // A connector needs two ends to be a connector at all — but only THIS
      // sweep's doing is this sweep's to clean up. A connector that arrived
      // with one anchor came that way (the CLIP-01 anchor dedupe can produce
      // one), and removing it here would silently widen "sweep dangling anchor
      // refs" into "also delete malformed connectors" — a different decision,
      // in a helper two delete paths and the load repair all share.
      if (touched && anchors.length < 2) {
        removed += 1;
        changed = true;
        continue;
      }
      next.push(
        anchors === connector.anchors ? connector : { ...connector, anchors }
      );
    }

    current = next;
    if (!changed) break;
  }

  return { connectors: current, repointed, removed, dropped };
};
