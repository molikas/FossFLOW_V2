/**
 * CLASS GATE — the renderer and the picker resolve paint order the same way.
 *
 * ADR 0038 §3 says picking stays geometric: nothing may make hit-testing depend
 * on draw order or GPU readback. The GPU-13 brief §5 adds the other half — after
 * the merge, `hitDetection.ts` and the merged bulk canvas both sort by
 * `resolveRenderOrder`, so they agree *by construction*, "which is worth
 * asserting in a gate". This is that gate.
 *
 * ---------------------------------------------------------------------------
 * SCOPE — the zIndex and iso-depth tiers ONLY. The LAYER tier is deliberately
 * excluded, and it is excluded because the divergence is REAL, not because it
 * cannot happen (owner ruling, 2026-08-02):
 *
 *   > A rectangle on a high-`order` layer paints above a rectangle on a lower
 *   > one, but `hitDetection` resolves both with `layerOrder: 0` — so the
 *   > lower-layer rectangle wins on `zIndex` and takes the click from the one
 *   > visibly on top.
 *
 * `hitDetection` is handed a flat `HitTestScene` with no `layers` array, so the
 * layer bucket is not available to it at all. The earlier rationale — "two items
 * on different visible layers never share a tile without colliding" — holds for
 * NODES only, because collision is a node-placement rule; rectangles, labels and
 * connectors overlap across layers freely.
 *
 * Closing it means threading `layers` into the hit-test scene. That is PROJ-10's
 * residual and belongs to the PROGRAM FINAL SWEEP — deliberately NOT folded into
 * the GPU-13 merge, which must not widen. See the PROJ-10 entry in
 * known_issues.md.
 * ---------------------------------------------------------------------------
 */
import fs from 'fs';
import path from 'path';
import {
  resolveRenderOrder,
  compareSceneDrawOrder,
  SCENE_TYPE_RANK,
  SceneDrawOrder
} from 'src/utils/renderOrder';
import { getItemAtTile } from 'src/utils/hitDetection';
import {
  getStrategy,
  makeTilePositionFn
} from 'src/utils/coordinateTransforms';

const SRC = path.join(__dirname, '..', '..');

const node = (
  id: string,
  tile: { x: number; y: number },
  zIndex = 0,
  layerOrder = 0
): SceneDrawOrder & { id: string; tile: { x: number; y: number } } => ({
  id,
  tile,
  kind: 'node',
  layerOrder,
  zIndex,
  isoDepth: -tile.x - tile.y
});

/** The renderer's answer: who is painted LAST (i.e. on top) among these. */
const topmostPainted = <T extends SceneDrawOrder & { id: string }>(units: T[]) =>
  [...units].sort(compareSceneDrawOrder).at(-1)!.id;

/** The picker's answer for a click on `tile`. */
const picked = (
  items: Array<{ id: string; tile: { x: number; y: number }; zIndex?: number }>,
  tile: { x: number; y: number }
) =>
  getItemAtTile({
    tile,
    scene: { items, textBoxes: [], hitConnectors: [], rectangles: [] }
  })?.id ?? null;

describe('§1 — both sides read the same helper', () => {
  it('CONTROL: the two files exist and both import resolveRenderOrder', () => {
    // A path typo would make every scan below vacuously green — the shape the
    // 2026-07-29 audit found in the madge and bundle-size gates.
    for (const f of ['utils/hitDetection.ts', 'utils/renderOrder.ts']) {
      expect(fs.existsSync(path.join(SRC, f))).toBe(true);
    }
    const hit = fs.readFileSync(path.join(SRC, 'utils/hitDetection.ts'), 'utf8');
    expect(/resolveRenderOrder/.test(hit)).toBe(true);
  });

  it('the picker never reads the renderer, a canvas, or GPU state (ADR 0038 §3)', () => {
    // Comments stripped first: this file EXPLAINS its relationship to the
    // renderer at length, and a prose mention of `SceneCanvas` would fail a raw
    // scan for saying exactly the right thing. (The same trap the layer-filter
    // gate documents.)
    const hit = fs
      .readFileSync(path.join(SRC, 'utils/hitDetection.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\s\/\/.*$/gm, '');
    // Named surfaces, not a vague "no canvas": each of these would be a real
    // route from picking back into draw order / readback.
    for (const forbidden of [
      'readPixels',
      'getContext',
      'SceneCanvas',
      'data-testid',
      'querySelector'
    ]) {
      expect(`${forbidden}: ${hit.includes(forbidden)}`).toBe(
        `${forbidden}: false`
      );
    }
  });

  it('the merged sort ranks types ABOVE iso depth', () => {
    // The placement §8's skeleton left ambiguous and the merge had to settle: a
    // node at a positive tile has NEGATIVE iso depth, so if iso depth outranked
    // the type it would sort below every rectangle and label on the same layer —
    // a visible re-ordering of existing documents. See renderOrder.ts.
    const rect: SceneDrawOrder = {
      kind: 'rectangle',
      layerOrder: 0,
      zIndex: 0,
      isoDepth: 0
    };
    const farNode: SceneDrawOrder = {
      kind: 'node',
      layerOrder: 0,
      zIndex: 0,
      isoDepth: -400
    };
    expect(compareSceneDrawOrder(rect, farNode)).toBeLessThan(0);
    expect(SCENE_TYPE_RANK.rectangle).toBeLessThan(SCENE_TYPE_RANK.connector);
    expect(SCENE_TYPE_RANK.connector).toBeLessThan(SCENE_TYPE_RANK.node);
    expect(SCENE_TYPE_RANK.node).toBeLessThan(SCENE_TYPE_RANK.label);
  });
});

describe('§2 — zIndex tier: the click lands on what is painted on top', () => {
  // Two items on ONE tile — reachable with `collides: false` (ADR 0023), which
  // is exactly the shape PROJ-10 was filed against.
  const tile = { x: 3, y: 4 };

  it.each([
    ['array order low→high', ['low', 'high']],
    ['array order high→low', ['high', 'low']]
  ] as const)('agrees regardless of %s', (_label, order) => {
    const byId = {
      low: node('low', tile, 0),
      high: node('high', tile, 5)
    };
    const units = order.map((k) => byId[k]);
    const items = units.map((u) => ({
      id: u.id,
      tile: u.tile,
      zIndex: u.zIndex
    }));
    expect(topmostPainted(units)).toBe('high');
    expect(picked(items, tile)).toBe('high');
    // …and they agree with EACH OTHER, which is the property being gated.
    expect(picked(items, tile)).toBe(topmostPainted(units));
  });

  it('a NEGATIVE zIndex sinks under the default, on both sides', () => {
    const units = [node('sunk', tile, -5), node('normal', tile, 0)];
    const items = units.map((u) => ({
      id: u.id,
      tile: u.tile,
      zIndex: u.zIndex
    }));
    expect(topmostPainted(units)).toBe('normal');
    expect(picked(items, tile)).toBe(topmostPainted(units));
  });
});

describe('§3 — iso-depth tier: the same entity is painted last and picked', () => {
  // Two nodes whose drawn FOOTPRINTS overlap while their tiles differ — reachable
  // with ADR 0023's off-grid `offset`, and the only shape in which iso depth can
  // actually decide a click. `isoDepth = -tile.x - tile.y` is the shipped
  // convention on both sides; this asserts they agree about it rather than
  // restating what it means.
  const getTilePosition = makeTilePositionFn(getStrategy('ISOMETRIC'));
  const A = { id: 'a', tile: { x: 0, y: 0 } };
  const bTile = { x: 1, y: 0 };
  const posA = getTilePosition({ tile: A.tile });
  const posB = getTilePosition({ tile: bTile });
  // Nudge B exactly onto A, so one point sits inside both footprints.
  const B = {
    id: 'b',
    tile: bTile,
    offset: { x: posA.x - posB.x, y: posA.y - posB.y }
  };

  const units = [
    { id: A.id, kind: 'node' as const, layerOrder: 0, zIndex: 0, isoDepth: -A.tile.x - A.tile.y },
    { id: B.id, kind: 'node' as const, layerOrder: 0, zIndex: 0, isoDepth: -B.tile.x - B.tile.y }
  ];

  it.each([
    ['array order a,b', [A, B]],
    ['array order b,a', [B, A]]
  ] as const)('the picker returns the painted-last entity (%s)', (_l, items) => {
    const top = topmostPainted(units);
    const hit = getItemAtTile({
      tile: A.tile,
      scene: {
        items: items as unknown as Parameters<typeof getItemAtTile>[0]['scene']['items'],
        textBoxes: [],
        hitConnectors: [],
        rectangles: []
      },
      canvasMode: 'ISOMETRIC',
      point: posA
    });
    expect(hit?.id).toBe(top);
  });

  it('zIndex outranks iso depth on both sides', () => {
    const near = node('near', { x: 9, y: 9 }, 0);
    const farRaised = node('farRaised', { x: 0, y: 0 }, 1);
    expect(topmostPainted([near, farRaised])).toBe('farRaised');
    expect(resolveRenderOrder(0, near.zIndex, near.isoDepth)).toBeLessThan(
      resolveRenderOrder(0, farRaised.zIndex, farRaised.isoDepth)
    );
  });
});

describe('§4 — the excluded LAYER tier is excluded on purpose, and reachably so', () => {
  it('the renderer honours the layer bucket', () => {
    const lowLayer = node('lowLayer', { x: 2, y: 2 }, 9, 0);
    const highLayer = node('highLayer', { x: 2, y: 2 }, 0, 1);
    // Layer outranks zIndex by a million to one — that is LAYER_BUCKET.
    expect(topmostPainted([lowLayer, highLayer])).toBe('highLayer');
  });

  it('the picker CANNOT, and this test pins the divergence rather than hiding it', () => {
    // `HitTestScene` has no `layers` array, so `itemsInPaintOrder` resolves every
    // entity with `layerOrder: 0` and the zIndex tie decides. The renderer says
    // `highLayer`; the picker says `lowLayer`. Recorded as PROJ-10's residual and
    // routed to the program final sweep.
    //
    // If a future change threads `layers` through, THIS test goes red — which is
    // the point: closing the residual must be a deliberate act that comes here
    // and widens the gate, not a silent one.
    const tile = { x: 2, y: 2 };
    const items = [
      { id: 'lowLayer', tile, zIndex: 9 },
      { id: 'highLayer', tile, zIndex: 0 }
    ];
    expect(picked(items, tile)).toBe('lowLayer');
  });
});
