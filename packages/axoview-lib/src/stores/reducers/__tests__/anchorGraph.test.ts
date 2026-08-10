/**
 * Promoted from the E2 explore lane (ADR 0047 flip rule) — RED-07 and RED-14,
 * which are one rule seen from two delete paths, plus the RED-02 amplifier that
 * made either of them catastrophic.
 *
 * ADR 0006 lets a connector be dropped onto another connector, producing an
 * anchor whose `ref` names a sibling's ANCHOR. Both delete paths computed their
 * victim set from ITEM references only and never walked that graph, so deleting
 * a node (RED-07) or a connector (RED-14) left a survivor pointing at an anchor
 * that no longer existed — and until RED-02, one such ref made **every
 * subsequent node move and placement in the view throw**.
 *
 * The rule under test: a `ref.anchor` that no longer resolves is re-pointed at
 * that anchor's last known TILE; where the tile is unknown the ref is dropped,
 * and a connector the sweep leaves with fewer than two anchors goes with it.
 */
import {
  sweepDanglingAnchorRefs,
  collectAnchorTiles
} from '../anchorGraph';
import type { Connector } from 'src/types';

const conn = (id: string, anchors: unknown[]): Connector =>
  ({ id, color: 'c', anchors }) as unknown as Connector;

const tileAnchor = (id: string, x: number, y: number) => ({
  id,
  ref: { tile: { x, y } }
});
const itemAnchor = (id: string, item: string) => ({ id, ref: { item } });
const anchorAnchor = (id: string, anchor: string) => ({ id, ref: { anchor } });

describe('collectAnchorTiles — the tiles that only exist before a delete', () => {
  it('maps each anchor id to its tile', () => {
    const tiles = collectAnchorTiles([
      conn('c1', [tileAnchor('a1', 3, 4), tileAnchor('a2', 5, 6)])
    ]);
    expect(tiles.get('a1')).toEqual({ x: 3, y: 4 });
    expect(tiles.get('a2')).toEqual({ x: 5, y: 6 });
  });

  it('an ITEM-anchored anchor has no tile of its OWN — the item owns it', () => {
    // Recorded rather than guessed: re-pointing at a tile we invented would put
    // the surviving connector somewhere the user never drew it.
    const tiles = collectAnchorTiles([
      conn('c1', [itemAnchor('a1', 'node-1'), tileAnchor('a2', 5, 6)])
    ]);
    expect(tiles.has('a1')).toBe(true);
    expect(tiles.get('a1')).toBeUndefined();
  });
});

describe('sweepDanglingAnchorRefs — the shared rule', () => {
  it('CONTROL: a view with only resolvable refs is untouched', () => {
    const connectors = [
      conn('c1', [tileAnchor('a1', 0, 0), tileAnchor('a2', 1, 1)]),
      conn('c2', [anchorAnchor('b1', 'a1'), tileAnchor('b2', 2, 2)])
    ];
    const out = sweepDanglingAnchorRefs(connectors);
    expect(out).toEqual({
      connectors,
      repointed: 0,
      removed: 0,
      dropped: 0
    });
  });

  it('RE-POINTS a dangling ref at the vanished anchor\'s last tile', () => {
    const doomed = conn('c1', [tileAnchor('a1', 7, 8), tileAnchor('a2', 9, 9)]);
    const survivor = conn('c2', [anchorAnchor('b1', 'a1'), tileAnchor('b2', 2, 2)]);
    const out = sweepDanglingAnchorRefs(
      [survivor],
      collectAnchorTiles([doomed])
    );
    expect(out.repointed).toBe(1);
    expect(out.removed).toBe(0);
    expect(out.connectors[0].anchors[0].ref).toEqual({ tile: { x: 7, y: 8 } });
    // …and the ref that always resolved is untouched.
    expect(out.connectors[0].anchors[1].ref).toEqual({ tile: { x: 2, y: 2 } });
  });

  it('DROPS the ref when no tile is known, and removes a connector left with one end', () => {
    const survivor = conn('c2', [anchorAnchor('b1', 'gone'), tileAnchor('b2', 2, 2)]);
    const out = sweepDanglingAnchorRefs([survivor]);
    expect(out.dropped).toBe(1);
    expect(out.removed).toBe(1);
    expect(out.connectors).toEqual([]);
  });

  it('a connector with THREE anchors survives losing one', () => {
    const survivor = conn('c2', [
      anchorAnchor('b1', 'gone'),
      tileAnchor('b2', 2, 2),
      tileAnchor('b3', 3, 3)
    ]);
    const out = sweepDanglingAnchorRefs([survivor]);
    expect(out.removed).toBe(0);
    expect(out.connectors[0].anchors.map((a) => a.id)).toEqual(['b2', 'b3']);
  });

  it('walks the graph TRANSITIVELY — A→B→C, where removing B orphans A', () => {
    // The case a single pass misses. C is deleted, B loses its only anchor ref
    // and is removed, and A is then pointing at one of B's anchors.
    const a = conn('A', [anchorAnchor('a1', 'b1'), tileAnchor('a2', 0, 0)]);
    const b = conn('B', [anchorAnchor('b1', 'gone'), tileAnchor('b2', 1, 1)]);
    const out = sweepDanglingAnchorRefs([a, b]);
    expect(out.connectors).toEqual([]);
    expect(out.removed).toBe(2);
  });

  it('does NOT remove a connector that arrived malformed — only its own doing', () => {
    // The CLIP-01 anchor dedupe can leave a one-anchor connector. Removing it
    // here would silently widen "sweep dangling refs" into "also delete
    // malformed connectors" — a different decision, in a helper that two delete
    // paths and the load repair all share.
    const malformed = conn('c1', [tileAnchor('a1', 0, 0)]);
    const out = sweepDanglingAnchorRefs([malformed]);
    expect(out.connectors).toEqual([malformed]);
    expect(out.removed).toBe(0);
  });

  it('handles an absent connector list', () => {
    expect(sweepDanglingAnchorRefs(undefined).connectors).toEqual([]);
  });
});
