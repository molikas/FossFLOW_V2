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
 * SCOPE — all three tiers, and cross-type (WIDENED 2026-08-08 by the program
 * final sweep, which closed PROJ-10's residual).
 *
 * This gate shipped with the GPU-13 merge scoped to the zIndex and iso-depth
 * tiers, because `hitDetection` was handed a flat `HitTestScene` with no
 * `layers` array and resolved every entity at `layerOrder: 0`. §4 PINNED that
 * divergence rather than hiding it, and said in as many words that closing the
 * residual must come here and widen the gate. This is that widening: §4 now
 * asserts the agreement it used to assert the absence of, and §5 pins what is
 * still — deliberately — out of the sort.
 *
 * The re-derivation that widened it beyond the layer tier: the merge made the
 * renderer resolve **cross-type** as well (one `compareSceneDrawOrder` sort over
 * all four bulk kinds, so layer and z-index cross an entity type at last), while
 * the picker still returned the first branch to hit. PROJ-10's residual was
 * scoped before that landed, so "the picker cannot see the layer bucket"
 * understated it — the picker could not resolve cross-type at all. Both are
 * closed together, because at equal layer and z-index `SCENE_TYPE_RANK`
 * reproduces the picker's historical precedence exactly (node > connector >
 * rectangle) and the layer-only fix is the more complicated one to write.
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
  items: Array<{
    id: string;
    tile: { x: number; y: number };
    zIndex?: number;
    layerId?: string;
  }>,
  tile: { x: number; y: number },
  layers?: Array<{ id: string; order: number }>
) =>
  getItemAtTile({
    tile,
    scene: {
      items,
      textBoxes: [],
      hitConnectors: [],
      rectangles: [],
      layers
    }
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

describe('§4 — LAYER tier: the bucket the picker used to be blind to', () => {
  const LAYERS = [
    { id: 'bottom', order: 0 },
    { id: 'top', order: 1 }
  ];
  const tile = { x: 2, y: 2 };

  it('the renderer honours the layer bucket', () => {
    const lowLayer = node('lowLayer', tile, 9, 0);
    const highLayer = node('highLayer', tile, 0, 1);
    // Layer outranks zIndex by a million to one — that is LAYER_BUCKET.
    expect(topmostPainted([lowLayer, highLayer])).toBe('highLayer');
  });

  it.each([
    ['array order low→high', ['lowLayer', 'highLayer']],
    ['array order high→low', ['highLayer', 'lowLayer']]
  ] as const)('and so does the picker — %s', (_label, order) => {
    // Was PROJ-10's residual: `HitTestScene` had no `layers` array, so
    // `itemsInPaintOrder` resolved everything at `layerOrder: 0` and the zIndex
    // tie decided — the renderer said `highLayer`, the picker said `lowLayer`.
    // The layer on top wins even though it is the one that LOSES on zIndex,
    // which is what makes this the layer tier and not a restatement of §2.
    const byId = {
      lowLayer: { id: 'lowLayer', tile, zIndex: 9, layerId: 'bottom' },
      highLayer: { id: 'highLayer', tile, zIndex: 0, layerId: 'top' }
    };
    const items = order.map((k) => byId[k]);
    const units = [
      node('lowLayer', tile, 9, 0),
      node('highLayer', tile, 0, 1)
    ];
    expect(picked(items, tile, LAYERS)).toBe('highLayer');
    expect(picked(items, tile, LAYERS)).toBe(topmostPainted(units));
  });

  it('an unknown or absent layerId reads as order 0, on both sides', () => {
    const items = [
      { id: 'unassigned', tile, zIndex: 0 },
      { id: 'ghostLayer', tile, zIndex: 0, layerId: 'deleted-layer' }
    ];
    // Neither resolves to a bucket, so the stable sort leaves array order — the
    // renderer's `layerOrderOf` has the same `?? 0` fallback for both cases.
    expect(picked(items, tile, LAYERS)).toBe('ghostLayer');
  });

  it.each([
    ['array order low→high', ['lowLayer', 'highLayer']],
    ['array order high→low', ['highLayer', 'lowLayer']]
  ] as const)(
    'RECTANGLE branch — the entry\'s own repro shape, %s',
    (_label, order) => {
      // PROJ-10's residual is written against two RECTANGLES: "a rectangle on a
      // high-`order` layer paints above one on a lower layer, but both resolve
      // with `layerOrder: 0`, so the lower-layer rectangle wins on zIndex and
      // takes the click". This is that sentence, executed. The rectangle branch
      // has re-sorted into paint order since long before the merge — it was the
      // layer TERM in that sort that was missing.
      const byId = {
        lowLayer: {
          id: 'lowLayer',
          from: { x: 0, y: 0 },
          to: { x: 4, y: 4 },
          zIndex: 9,
          layerId: 'bottom'
        },
        highLayer: {
          id: 'highLayer',
          from: { x: 0, y: 0 },
          to: { x: 4, y: 4 },
          zIndex: 0,
          layerId: 'top'
        }
      };
      const units = [
        { id: 'lowLayer', kind: 'rectangle' as const, layerOrder: 0, zIndex: 9, isoDepth: 0 },
        { id: 'highLayer', kind: 'rectangle' as const, layerOrder: 1, zIndex: 0, isoDepth: 0 }
      ];
      const hit = getItemAtTile({
        tile,
        scene: {
          items: [],
          textBoxes: [],
          hitConnectors: [],
          rectangles: order.map((k) => byId[k]),
          layers: LAYERS
        }
      });
      expect(hit).toEqual({ type: 'RECTANGLE', id: 'highLayer' });
      expect(hit?.id).toBe(topmostPainted(units));
    }
  );

  it('reordering the layers re-answers, even though `items` did not change', () => {
    // The tile index is a WeakMap keyed on the `items` ARRAY REFERENCE, and it is
    // built in paint order — so once paint order depends on layers, that cache
    // has a second input. A layer reorder writes a new `layers` array and leaves
    // `items` alone, which is precisely the shape that would return a stale
    // answer. Same `items` reference through both calls, on purpose.
    const items = [
      { id: 'a', tile, layerId: 'bottom' },
      { id: 'b', tile, layerId: 'top' }
    ];
    expect(picked(items, tile, LAYERS)).toBe('b');
    expect(
      picked(items, tile, [
        { id: 'bottom', order: 1 },
        { id: 'top', order: 0 }
      ])
    ).toBe('a');
  });

  it('omitting `layers` entirely keeps the pre-sweep behaviour', () => {
    // Every partial-scene caller in the unit suites passes no `layers`, and a
    // document with no layers has none. Both must resolve at order 0.
    const items = [
      { id: 'lowLayer', tile, zIndex: 9, layerId: 'bottom' },
      { id: 'highLayer', tile, zIndex: 0, layerId: 'top' }
    ];
    expect(picked(items, tile)).toBe('lowLayer');
  });
});

describe('§5 — CROSS-TYPE: layer and z-index cross an entity type on both sides', () => {
  // The merge's own headline (ADR 0038 §8): one sort over all four bulk kinds,
  // so a rectangle really can be painted over a node. The picker used to return
  // the first BRANCH to hit — items, then text boxes, then connectors, then
  // rectangles — which is a fixed type precedence and cannot express that.
  const tile = { x: 2, y: 2 };
  const rect = (
    id: string,
    zIndex = 0,
    layerId?: string
  ) => ({ id, from: { x: 0, y: 0 }, to: { x: 4, y: 4 }, zIndex, layerId });
  const conn = (id: string, layerId?: string) => ({
    id,
    // `connectorPathTileToGlobal` is `origin - tile`, so this path covers `tile`.
    path: { tiles: [{ x: -2, y: -2 }], rectangle: { from: { x: 0, y: 0 } } },
    layerId
  });
  const pick = (scene: Partial<Parameters<typeof getItemAtTile>[0]['scene']>) =>
    getItemAtTile({
      tile,
      scene: {
        items: [],
        textBoxes: [],
        hitConnectors: [],
        rectangles: [],
        ...scene
      }
    });

  it('CONTROL: at equal layer and z-index the historical precedence is unchanged', () => {
    // The widening must be invisible to a document with no layers and no
    // z-order — which is most of them. `SCENE_TYPE_RANK` reproduces the old
    // branch order exactly, and this is the assertion that says so.
    const all = {
      items: [{ id: 'n', tile }],
      hitConnectors: [conn('c')],
      rectangles: [rect('r')]
    };
    expect(pick(all)).toEqual({ type: 'ITEM', id: 'n' });
    expect(pick({ hitConnectors: all.hitConnectors, rectangles: all.rectangles }))
      .toEqual({ type: 'CONNECTOR', id: 'c' });
    expect(pick({ rectangles: all.rectangles })).toEqual({
      type: 'RECTANGLE',
      id: 'r'
    });
  });

  it('a rectangle on a higher LAYER takes the click from a node below it', () => {
    // PROJ-10's residual stated cross-type in its own repro sentence: "a
    // rectangle on a high-`order` layer paints above one on a lower layer".
    // With a node underneath instead, the old picker returned the node — an
    // entity the user cannot see, because the rectangle is painted over it.
    const layers = [
      { id: 'bottom', order: 0 },
      { id: 'top', order: 1 }
    ];
    const scene = {
      items: [{ id: 'n', tile, layerId: 'bottom' }],
      rectangles: [rect('r', 0, 'top')],
      layers
    };
    expect(
      topmostPainted([
        { id: 'n', kind: 'node' as const, layerOrder: 0, zIndex: 0, isoDepth: -4 },
        { id: 'r', kind: 'rectangle' as const, layerOrder: 1, zIndex: 0, isoDepth: 0 }
      ])
    ).toBe('r');
    expect(pick(scene)).toEqual({ type: 'RECTANGLE', id: 'r' });
  });

  it('a rectangle with a higher Z-INDEX takes the click from a node below it', () => {
    // The tier the merge changed and PROJ-10's wording predates: before it,
    // four canvases at fixed CSS z-indices made TYPE beat z-index cross-type
    // unconditionally. After it, `compareSceneDrawOrder` puts z-index above
    // type rank, so this rectangle paints over the node.
    const scene = {
      items: [{ id: 'n', tile, zIndex: 0 }],
      rectangles: [rect('r', 9)]
    };
    expect(
      topmostPainted([
        { id: 'n', kind: 'node' as const, layerOrder: 0, zIndex: 0, isoDepth: -4 },
        { id: 'r', kind: 'rectangle' as const, layerOrder: 0, zIndex: 9, isoDepth: 0 }
      ])
    ).toBe('r');
    expect(pick(scene)).toEqual({ type: 'RECTANGLE', id: 'r' });
  });

  it('a connector on a higher LAYER takes the click from a node below it', () => {
    const layers = [
      { id: 'bottom', order: 0 },
      { id: 'top', order: 1 }
    ];
    const scene = {
      items: [{ id: 'n', tile, layerId: 'bottom' }],
      hitConnectors: [conn('c', 'top')],
      layers
    };
    expect(pick(scene)).toEqual({ type: 'CONNECTOR', id: 'c' });
  });

  it('PIN — text boxes stay OUT of the cross-type ranking, and on purpose', () => {
    // `Renderer` mounts `TextBoxes` in a DOM `SceneLayer` above `SceneCanvas`,
    // so a text box is painted over every bulk entity whatever its layer says.
    // Wave 5 recorded text boxes and connector label chips as the out-of-sort
    // set with their own follow-up trigger; until they join the sort, ranking a
    // text box by a layer order the renderer does not consult would INTRODUCE a
    // divergence. If they ever join it, this pin goes red — which is the point.
    const layers = [
      { id: 'bottom', order: 0 },
      { id: 'top', order: 1 }
    ];
    const textBox = {
      id: 'tb',
      tile,
      size: { width: 4, height: 1 },
      orientation: 'X' as const,
      content: '',
      layerId: 'bottom'
    } as unknown as Parameters<
      typeof getItemAtTile
    >[0]['scene']['textBoxes'][number];
    // A rectangle on the TOP layer does not take the click from a text box on
    // the bottom one: the text box is genuinely the thing on screen.
    expect(
      pick({ textBoxes: [textBox], rectangles: [rect('r', 0, 'top')], layers })
    ).toEqual({ type: 'TEXTBOX', id: 'tb' });
  });
});
