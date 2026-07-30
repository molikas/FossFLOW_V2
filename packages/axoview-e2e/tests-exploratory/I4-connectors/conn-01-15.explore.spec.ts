/**
 * I4 probes — connector draw, reconnect and waypoint interactions.
 *
 * Real mouse throughout: every one of these depends on hit-testing, pointer
 * capture or the anchor overlay's DOM handles (APPROACH §3 tier T3).
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { LayersPanelPOM } from '../../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../../helpers/place';
import {
  getOffGridItems,
  setSnapToGrid,
  drawnClientPoint,
  realDrag
} from '../../helpers/offGrid';
import {
  getModelItemCount,
  getModelConnectorCount,
  getUiMode,
  getItemControls
} from '../../helpers/store';

type Page = import('@playwright/test').Page;

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

const connectors = async (page: Page) =>
  ((await activeView(page))?.connectors ?? []).map((c: any) => ({
    id: c.id as string,
    anchors: (c.anchors ?? []).map((a: any) => ({ id: a.id, ref: a.ref }))
  }));

const itemTiles = async (page: Page) =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    tile: { x: i.tile.x as number, y: i.tile.y as number }
  }));

const absOfTile = async (canvas: CanvasPOM, tile: { x: number; y: number }) => {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  return { x: box!.x + rel.x, y: box!.y + rel.y };
};

const setInteractionMode = (page: Page, mode: 'click' | 'drag') =>
  page.evaluate(
    (m) =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setConnectorInteractionMode(m),
    mode
  );

/** Two nodes plus one connector between them, drawn in click mode. */
async function twoNodesAndConnector(page: Page, canvas: CanvasPOM) {
  await placeIconViaMouse(page, { x: 520, y: 280 });
  await placeIconViaMouse(page, { x: 800, y: 380 });
  await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(2);

  await page.keyboard.press('c');
  await canvas.clickAt({ x: 520, y: 280 });
  await page.waitForTimeout(150);
  await canvas.clickAt({ x: 800, y: 380 });
  await page.keyboard.press('Escape');
  await expect
    .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
    .toBe(1);
  await page.keyboard.press('s');
  return { tiles: await itemTiles(page), connectors: await connectors(page) };
}

/** Selects the connector so its anchor overlay renders. */
async function selectConnector(page: Page, id: string) {
  await page.evaluate((cid) => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setItemControls({ type: 'CONNECTOR', id: cid });
  }, id);
  await page.waitForTimeout(250);
}

// ---------------------------------------------------------------------------
// CONN-01 / CONN-02 — the reconnect mode has no way out
// ---------------------------------------------------------------------------
test.describe('CONN-01 / CONN-02 — leaving RECONNECT_ANCHOR', () => {
  /** Puts the app into RECONNECT_ANCHOR on the connector's first endpoint. */
  async function enterReconnect(page: Page, canvas: CanvasPOM) {
    const setup = await twoNodesAndConnector(page, canvas);
    const conn = setup.connectors[0];
    await selectConnector(page, conn.id);
    await page.evaluate(
      (args: { connectorId: string; anchorId: string }) => {
        (window as any).__axoview__.ui.getState().actions.setMode({
          type: 'RECONNECT_ANCHOR',
          showCursor: true,
          connectorId: args.connectorId,
          anchorId: args.anchorId
        });
      },
      { connectorId: conn.id, anchorId: conn.anchors[0].id }
    );
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('RECONNECT_ANCHOR');
    return { setup, conn };
  }

  test.fail(
    'CONN-01 BUG: Escape mid-reconnect neither restores the anchor nor leaves the mode',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      const { setup, conn } = await enterReconnect(page, canvas);
      const originalRef = conn.anchors[0].ref;

      // Move the anchor onto empty canvas — mousemove rewrites the ref live.
      const empty = await absOfTile(canvas, { x: 4, y: 4 });
      await page.mouse.move(empty.x, empty.y, { steps: 8 });
      await page.waitForTimeout(200);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      const after = (await connectors(page))[0];
      expect(after.anchors[0].ref).toEqual(originalRef);
      expect(await modeType(page)).toBe('CURSOR');
      void setup;
    }
  );

  test('CONN-01 characterization: the anchor stays moved and the mode stays armed', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const { conn } = await enterReconnect(page, canvas);
    const originalRef = conn.anchors[0].ref;

    const empty = await absOfTile(canvas, { x: 4, y: 4 });
    await page.mouse.move(empty.x, empty.y, { steps: 8 });
    await page.waitForTimeout(200);
    const movedRef = (await connectors(page))[0].anchors[0].ref;

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const afterEsc = (await connectors(page))[0].anchors[0].ref;
    const modeAfter = await modeType(page);

    // eslint-disable-next-line no-console
    console.log(
      `CONN-01 observed — original ${JSON.stringify(originalRef)}; moved ${JSON.stringify(movedRef)}; after Esc ${JSON.stringify(afterEsc)}; mode ${modeAfter}`
    );

    // The live rewrite happened...
    expect(movedRef).not.toEqual(originalRef);
    // ...Escape restored nothing...
    expect(afterEsc).toEqual(movedRef);
    // ...and the user is still in the crosshair mode.
    expect(modeAfter).toBe('RECONNECT_ANCHOR');
  });

  test.fail(
    'CONN-02 BUG: releasing the reconnect over a panel leaves the mode armed',
    async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await enterReconnect(page, canvas);

    // Release over the left dock (off-canvas).
    const dock = page.locator('[data-axoview-id="dock-elements-toggle"]');
    const box = await dock.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, {
      steps: 6
    });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(300);

    const mode = await modeType(page);
    // eslint-disable-next-line no-console
    console.log(`CONN-02 observed — mode after an off-canvas release: ${mode}`);
    expect(mode).toBe('CURSOR');
  });
});

// ---------------------------------------------------------------------------
// CONN-03 — connecting to an off-grid node
// ---------------------------------------------------------------------------
test.describe('CONN-03 — connecting to a visibly-moved off-grid node', () => {
  test('the second click binds the anchor to the node, not to a bare tile', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, { x: 520, y: 280 });
    await placeIconViaMouse(page, { x: 820, y: 380 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 10_000 })
      .toBe(2);

    // Push node B well off its grid cell.
    await setSnapToGrid(page, false);
    const items = await getOffGridItems(page);
    const target = items[1];
    const from = await drawnClientPoint(page, target);
    await realDrag(page, from, { x: from.x + 44, y: from.y + 20 });
    const [, moved] = await getOffGridItems(page);
    expect(moved.offset, 'setup: node B must be off-grid').toBeTruthy();

    const drawn = await drawnClientPoint(page, moved);
    const cell = await drawnClientPoint(page, { ...moved, offset: undefined });

    // Draw a connector from node A to where node B is DRAWN.
    await page.keyboard.press('c');
    const a = await drawnClientPoint(page, items[0]);
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(200);
    await page.mouse.click(drawn.x, drawn.y);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const conn = (await connectors(page))[0];
    // eslint-disable-next-line no-console
    console.log(
      `CONN-03 observed — offset ${JSON.stringify(moved.offset)}; drawn ${JSON.stringify(drawn)} vs cell ${JSON.stringify(cell)}; anchors ${JSON.stringify(conn?.anchors.map((x: any) => x.ref))}`
    );

    expect(conn).toBeTruthy();
    const refs = conn.anchors.map((x: any) => x.ref?.item).filter(Boolean);
    expect(refs).toContain(moved.id);
    await expectStoreInvariants(page, 'after off-grid connect');
  });
});

// ---------------------------------------------------------------------------
// CONN-04 — end-anchor id churn during the draw
// ---------------------------------------------------------------------------
test.describe('CONN-04 — the end anchor id while drawing', () => {
  test.fail(
    'CONN-04 BUG: the end anchor gets a fresh id on every tile move',
    async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, { x: 520, y: 280 });
    await placeIconViaMouse(page, { x: 820, y: 380 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 10_000 })
      .toBe(2);
    const tiles = await itemTiles(page);

    await page.keyboard.press('c');
    const a = await absOfTile(canvas, tiles[0].tile);
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(200);

    const ids: string[] = [];
    for (const t of [
      { x: tiles[0].tile.x + 1, y: tiles[0].tile.y },
      { x: tiles[0].tile.x + 2, y: tiles[0].tile.y },
      { x: tiles[0].tile.x + 3, y: tiles[0].tile.y }
    ]) {
      const p = await absOfTile(canvas, t);
      await page.mouse.move(p.x, p.y, { steps: 4 });
      await page.waitForTimeout(120);
      const c = (await connectors(page))[0];
      if (c?.anchors[1]) ids.push(c.anchors[1].id);
    }
    await page.keyboard.press('Escape');

    // eslint-disable-next-line no-console
    console.log(`CONN-04 observed — end anchor ids across 3 moves: ${JSON.stringify(ids)}`);
    expect(new Set(ids).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CONN-07 / CONN-13 — degenerate clicks
// ---------------------------------------------------------------------------
test.describe('CONN-07 / CONN-13 — stray clicks while the connector tool is armed', () => {
  test.fail(
    'CONN-13 BUG: a second click on empty canvas does NOT revert the provisional connector',
    async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 520, y: 280 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 8_000 })
      .toBe(1);
    const tiles = await itemTiles(page);

    await setInteractionMode(page, 'click');
    await page.keyboard.press('c');
    const a = await absOfTile(canvas, tiles[0].tile);
    await page.mouse.click(a.x, a.y);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 3_000 })
      .toBe(1);

    // Second click on empty canvas — the "stray-empty-click revert".
    const empty = await absOfTile(canvas, { x: 5, y: 5 });
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(400);

    const cs = await connectors(page);
    // eslint-disable-next-line no-console
    console.log(
      `CONN-13 observed — ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
    );
    expect(cs).toHaveLength(0);
  });

  test.fail(
    'CONN-07 BUG: a zero-travel click in DRAG mode leaves a zero-length connector',
    async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 520, y: 280 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 8_000 })
      .toBe(1);

    await setInteractionMode(page, 'drag');
    await page.keyboard.press('c');
    const empty = await absOfTile(canvas, { x: 5, y: 5 });
    await page.mouse.move(empty.x, empty.y);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);

    const cs = await connectors(page);
    // eslint-disable-next-line no-console
    console.log(
      `CONN-07 observed — ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
    );
    expect(cs).toHaveLength(0);
    await expectStoreInvariants(page, 'after a zero-travel drag-mode click');
  });
});

// ---------------------------------------------------------------------------
// CONN-08 / CONN-09 — direct endpoint and waypoint editing
// ---------------------------------------------------------------------------
test.describe('CONN-08 / CONN-09 — editing an existing connector', () => {
  test('CONN-09: dragging the connector body creates a waypoint and moves it', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const setup = await twoNodesAndConnector(page, canvas);
    const before = setup.connectors[0].anchors.length;

    const mid = {
      x: Math.round((setup.tiles[0].tile.x + setup.tiles[1].tile.x) / 2),
      y: Math.round((setup.tiles[0].tile.y + setup.tiles[1].tile.y) / 2)
    };
    const from = await absOfTile(canvas, mid);
    await realDrag(page, from, { x: from.x + 20, y: from.y - 110 });
    await page.waitForTimeout(300);

    const after = (await connectors(page))[0];
    const waypoint = after.anchors.find((a: any) => a.ref?.tile);
    // eslint-disable-next-line no-console
    console.log(
      `CONN-09 observed — anchors ${before} -> ${after.anchors.length}; refs ${JSON.stringify(after.anchors.map((a: any) => a.ref))}`
    );
    expect(after.anchors.length).toBe(before + 1);
    expect(waypoint).toBeTruthy();
    // It must have moved to where it was dragged, not stayed on the old path.
    expect(waypoint.ref.tile).not.toEqual(mid);
    await expectStoreInvariants(page, 'after a waypoint drag');
  });

  test('CONN-08: dragging an endpoint onto a third node re-anchors it', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const setup = await twoNodesAndConnector(page, canvas);
    await placeIconViaMouse(page, { x: 640, y: 520 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 8_000 })
      .toBe(3);

    const conn = setup.connectors[0];
    await selectConnector(page, conn.id);
    const tiles = await itemTiles(page);
    // Resolve by id, not index — the view's item order is not the draw order.
    const anchored = new Set(
      conn.anchors.map((a: any) => a.ref?.item).filter(Boolean)
    );
    const thirdNode = tiles.find((t) => !anchored.has(t.id))!;
    const endpointNodeId = conn.anchors[0].ref?.item as string;
    const endpointTile = tiles.find((t) => t.id === endpointNodeId)!.tile;
    const otherEndId = conn.anchors
      .map((a: any) => a.ref?.item)
      .find((id: string) => id && id !== endpointNodeId) as string;

    // Grab the endpoint on its own node and drag it to the unconnected node.
    const from = await absOfTile(canvas, endpointTile);
    const to = await absOfTile(canvas, thirdNode.tile);
    await realDrag(page, from, to);
    await page.waitForTimeout(400);

    const after = (await connectors(page))[0];
    const refs = after.anchors.map((a: any) => a.ref?.item).filter(Boolean);
    const tilesAfter = await itemTiles(page);
    // eslint-disable-next-line no-console
    console.log(
      `CONN-08 observed — anchors ${JSON.stringify(after.anchors.map((a: any) => a.ref))}; dragged endpoint ${endpointNodeId} onto ${thirdNode.id}; other end ${otherEndId}; item tiles ${JSON.stringify(tilesAfter)}`
    );
    // Re-anchoring means: the dragged endpoint is now on the third node, and
    // the OTHER endpoint is untouched — not both ends collapsed onto one node.
    expect(refs).toContain(thirdNode.id);
    expect(refs).toContain(otherEndId);
    expect(new Set(refs).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// CONN-10 / CONN-11 / CONN-14 — degenerate topologies
// ---------------------------------------------------------------------------
test.describe('CONN-10 / CONN-11 / CONN-14 — degenerate connector topologies', () => {
  test.fail('CONN-10 BUG: a node CAN be connected to itself', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 620, y: 320 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 8_000 })
      .toBe(1);
    const tiles = await itemTiles(page);

    await page.keyboard.press('c');
    const a = await absOfTile(canvas, tiles[0].tile);
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(200);
    await page.mouse.click(a.x, a.y); // second click on the SAME node
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const cs = await connectors(page);
    const selfLoops = cs.filter((c) => {
      const items = c.anchors.map((x: any) => x.ref?.item).filter(Boolean);
      return items.length === 2 && items[0] === items[1];
    });
    // eslint-disable-next-line no-console
    console.log(
      `CONN-10 observed — connectors ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
    );
    expect(selfLoops).toHaveLength(0);
  });

  test.fail(
    'CONN-11 BUG: two connectors between the same pair share one route exactly',
    async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const setup = await twoNodesAndConnector(page, canvas);

    // A second connector between the same two nodes.
    await page.keyboard.press('c');
    await canvas.clickAt({ x: 520, y: 280 });
    await page.waitForTimeout(150);
    await canvas.clickAt({ x: 800, y: 380 });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(2);
    await page.keyboard.press('s');

    const paths = await page.evaluate(() => {
      const scene = (window as any).__axoview__.scene.getState();
      return Object.entries(scene.connectors ?? {}).map(
        ([id, e]: [string, any]) => ({
          id,
          tiles: (e.path?.tiles ?? []).map((t: any) => `${t.x},${t.y}`).join('|')
        })
      );
    });
    // eslint-disable-next-line no-console
    console.log(`CONN-11 observed — ${JSON.stringify(paths)}`);
    void setup;

    // Two connectors drawn on exactly the same route can never be told apart
    // by clicking.
    expect(new Set(paths.map((p: any) => p.tiles)).size).toBe(2);
  });

  test('CONN-14: reconnecting an endpoint onto its own node is a clean no-op', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const setup = await twoNodesAndConnector(page, canvas);
    const conn = setup.connectors[0];
    await selectConnector(page, conn.id);

    await page.evaluate(
      (args: { connectorId: string; anchorId: string }) => {
        (window as any).__axoview__.ui.getState().actions.setMode({
          type: 'RECONNECT_ANCHOR',
          showCursor: true,
          connectorId: args.connectorId,
          anchorId: args.anchorId
        });
      },
      { connectorId: conn.id, anchorId: conn.anchors[0].id }
    );
    // Move away and back onto the node it is already attached to. Approach
    // through two distinct intermediate tiles so `hasMovedTile` definitely
    // fires on the final position — otherwise a lag, not the reconnect, would
    // decide the result.
    const away = await absOfTile(canvas, { x: 4, y: 4 });
    // "Home" is the node THIS anchor is bound to — resolved by id, because the
    // view's item order is not the draw order.
    const allTiles = await itemTiles(page);
    const homeNodeId = conn.anchors[0].ref?.item as string;
    const homeTile = allTiles.find((t) => t.id === homeNodeId)!.tile;
    const via1 = await absOfTile(canvas, { x: homeTile.x + 2, y: homeTile.y + 2 });
    const via2 = await absOfTile(canvas, { x: homeTile.x + 1, y: homeTile.y + 1 });
    const home = await absOfTile(canvas, homeTile);
    await page.mouse.move(away.x, away.y, { steps: 6 });
    await page.waitForTimeout(150);
    await page.mouse.move(via1.x, via1.y, { steps: 4 });
    await page.waitForTimeout(150);
    await page.mouse.move(via2.x, via2.y, { steps: 4 });
    await page.waitForTimeout(150);
    await page.mouse.move(home.x, home.y, { steps: 4 });
    await page.waitForTimeout(200);
    const refBeforeRelease = (await connectors(page))[0].anchors[0].ref;
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);
    // eslint-disable-next-line no-console
    console.log(
      `CONN-14 pre-release ref — ${JSON.stringify(refBeforeRelease)}; home tile ${JSON.stringify(homeTile)}`
    );

    const after = (await connectors(page))[0];
    // eslint-disable-next-line no-console
    console.log(
      `CONN-14 observed — anchors ${JSON.stringify(after.anchors.map((a: any) => a.ref))}`
    );
    expect(after.anchors).toHaveLength(conn.anchors.length);
    expect(after.anchors[0].ref).toEqual(conn.anchors[0].ref);
    await expectStoreInvariants(page, 'after a same-node reconnect');
  });
});

// ---------------------------------------------------------------------------
// CONN-15 — connecting to a node on a locked layer
// ---------------------------------------------------------------------------
test.describe('CONN-15 — connecting to a node on a locked layer', () => {
  test.fail(
    'CONN-15 BUG: a locked node CAN be used as a connector anchor',
    async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 520, y: 280 });
    await placeIconViaMouse(page, { x: 820, y: 380 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 10_000 })
      .toBe(2);
    const tiles = await itemTiles(page);

    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    const layerName = (await activeView(page)).layers[0].name as string;
    await layers.dragItemToLayer(tiles[1].id, layerName);
    await layers.toggleLock(layerName);
    await page.waitForTimeout(300);

    await page.keyboard.press('c');
    const a = await absOfTile(canvas, tiles[0].tile);
    const b = await absOfTile(canvas, tiles[1].tile);
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(200);
    await page.mouse.click(b.x, b.y);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const cs = await connectors(page);
    const boundToLocked = cs.some((c) =>
      c.anchors.some((x: any) => x.ref?.item === tiles[1].id)
    );
    // eslint-disable-next-line no-console
    console.log(
      `CONN-15 observed — locked node ${tiles[1].id}; connectors ${JSON.stringify(cs.map((c) => c.anchors.map((x: any) => x.ref)))}`
    );
    expect(boundToLocked).toBe(false);
  });
});
