/**
 * I4 probes — connector draw, reconnect and waypoint interactions.
 *
 *  CONN-03  connecting to an off-grid node binds to a bare tile
 *  CONN-08  dragging an existing endpoint onto a different node
 *  CONN-09  direct waypoint editing (drag to move, Alt+click to remove)
 *  CONN-14  reconnecting an endpoint onto the node it already sits on
 *
 * All FALSIFIED; kept as characterization. (CONN-03's hole in the code was
 * real — the hit-test took no ADR 0023 `point` — but the input did not expose
 * it; wave 3 closed it anyway as part of the shared connector hit-test.)
 *
 * PROMOTED OUT — wave 3 fixed CONN-01/02 (the reconnect has an abort and ends
 * on any release), CONN-04 (one stable end-anchor id per draw), CONN-07 (a
 * zero-travel release reverts), CONN-10 (no self-loops, from either route),
 * CONN-11 (parallel connectors fan apart) and CONN-15 (the layer gate). Their
 * legs moved to `tests/connector-integrity.spec.ts`, with the predicates in
 * `interaction/modes/__tests__/connectorHitTest.test.ts`.
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
// CONN-14 — reconnecting an endpoint onto the node it already sits on
// ---------------------------------------------------------------------------
// CONN-10 and CONN-11 are FIXED (wave 3) and their probes promoted to
// tests/connector-integrity.spec.ts — the tool refuses a connector whose two
// ends resolve to the same target, and a second connector between one node pair
// is fanned off the direct route.
test.describe('CONN-14 — reconnect onto the same node', () => {
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

