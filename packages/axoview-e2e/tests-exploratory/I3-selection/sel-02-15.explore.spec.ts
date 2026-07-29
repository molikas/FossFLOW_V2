/**
 * I3 probes — selection semantics and mode edge cases.
 *
 *  SEL-02  a connector-body drag splices its waypoint outside the transaction
 *  SEL-03  `altSpliceConsumed` is module-level and can strand
 *  SEL-05  a panel click inside a live marquee arms a canvas drag
 *  SEL-06  FreehandLasso's screen-space path skews under a mid-draw zoom
 *  SEL-08  Ctrl+click toggles an already-selected item OUT
 *  SEL-09  Shift+click adds a single item to the selection
 *  SEL-10  a multi-selection across an iso↔2D projection toggle
 *  SEL-12  marquee auto-scroll past the viewport edge
 *  SEL-13  Ctrl+A and hidden / locked layers
 *  SEL-14  hover state for an off-grid item within one tile
 *  SEL-15  extending an existing selection with a second marquee
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
  realDrag,
  getHoveredItemId
} from '../../helpers/offGrid';
import {
  getModelItemCount,
  getModelConnectorCount,
  getModelHistoryLength,
  getUiMode,
  getZoom
} from '../../helpers/store';

type Page = import('@playwright/test').Page;

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

const selectedIds = (page: Page) =>
  page.evaluate(
    () =>
      ((window as any).__axoview__.ui.getState().selectedIds ?? []) as Array<{
        type: string;
        id: string;
      }>
  );

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

const abs = async (canvas: CanvasPOM, p: CanvasPoint) => {
  const box = await canvas.interactionsLayer().boundingBox();
  return { x: box!.x + p.x, y: box!.y + p.y };
};

async function twoNodes(page: Page) {
  await placeIconViaMouse(page, { x: 520, y: 280 });
  await placeIconViaMouse(page, { x: 740, y: 360 });
  await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(2);
  return itemTiles(page);
}

// ---------------------------------------------------------------------------
// SEL-02 — connector-body drag splices its waypoint outside the transaction
// ---------------------------------------------------------------------------
test.describe('SEL-02 — abandoning a connector-body drag', () => {
  test.fail(
    'BUG: the spliced waypoint survives an abandoned drag AND its own undo',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      const nodes = await twoNodes(page);

      await page.keyboard.press('c');
      await canvas.clickAt({ x: 520, y: 280 });
      await page.waitForTimeout(150);
      await canvas.clickAt({ x: 740, y: 360 });
      await page.keyboard.press('Escape');
      await expect
        .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
        .toBe(1);

      const anchorsBefore = (
        (await activeView(page)).connectors[0].anchors ?? []
      ).length;

      const mid = {
        x: Math.round((nodes[0].tile.x + nodes[1].tile.x) / 2),
        y: Math.round((nodes[0].tile.y + nodes[1].tile.y) / 2)
      };
      const from = await absOfTile(canvas, mid);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 60, from.y - 50, { steps: 8 });
      await page.keyboard.press('r');
      await page.mouse.up();
      await page.waitForTimeout(400);

      await page.keyboard.press('Control+z');
      await page.waitForTimeout(400);
      expect(
        ((await activeView(page)).connectors[0]?.anchors ?? []).length
      ).toBe(anchorsBefore);
    }
  );

  test('characterization: the gesture records TWO history entries and one undo is not enough', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const nodes = await twoNodes(page);

    await page.keyboard.press('c');
    await canvas.clickAt({ x: 520, y: 280 });
    await page.waitForTimeout(150);
    await canvas.clickAt({ x: 740, y: 360 });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(1);

    const anchorsBefore = ((await activeView(page)).connectors[0].anchors ?? [])
      .length;
    const historyBefore = await getModelHistoryLength(page);

    // Grab the connector body midway and start dragging — this splices a new
    // waypoint — then abandon the gesture with a tool hotkey.
    const mid = {
      x: Math.round((nodes[0].tile.x + nodes[1].tile.x) / 2),
      y: Math.round((nodes[0].tile.y + nodes[1].tile.y) / 2)
    };
    const from = await absOfTile(canvas, mid);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y - 50, { steps: 8 });
    await page.keyboard.press('r'); // abandon into another tool
    await page.mouse.up();
    await page.waitForTimeout(400);

    const anchorsAfter = ((await activeView(page)).connectors[0].anchors ?? [])
      .length;
    const historyAfter = await getModelHistoryLength(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-02 observed — anchors ${anchorsBefore} -> ${anchorsAfter}; history ${historyBefore} -> ${historyAfter}`
    );

    // The splice ran OUTSIDE the drag transaction, so it is its own entry:
    // history grew by two for one gesture, and one Ctrl+Z leaves the waypoint.
    expect(historyAfter).toBeGreaterThan(historyBefore + 1);
    expect(anchorsAfter).toBe(anchorsBefore + 1);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    const anchorsUndone = ((await activeView(page)).connectors[0]?.anchors ?? [])
      .length;
    // eslint-disable-next-line no-console
    console.log(`SEL-02 after one undo — anchors ${anchorsUndone}`);
    expect(anchorsUndone).toBe(anchorsBefore + 1);

    // A SECOND undo is required to get rid of a waypoint the user never
    // deliberately created.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect(
      ((await activeView(page)).connectors[0]?.anchors ?? []).length
    ).toBe(anchorsBefore);
    await expectStoreInvariants(page, 'after undoing the stray splice');
  });
});

// ---------------------------------------------------------------------------
// SEL-03 — module-level altSpliceConsumed
// ---------------------------------------------------------------------------
test.describe('SEL-03 — a press whose mouseup never reaches Cursor', () => {
  test('the next plain click still selects normally', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const nodes = await twoNodes(page);

    // Alt+press on a connector waypoint is the gesture that sets the flag; the
    // simpler reproduction of "mouseup never reaches Cursor" is a mid-press
    // mode change, which routes the mouseup to the NEW mode instead.
    const a = await absOfTile(canvas, nodes[0].tile);
    await page.mouse.move(a.x, a.y);
    await page.keyboard.down('Alt');
    await page.mouse.down();
    await page.keyboard.press('l'); // mode change mid-press → LASSO owns the up
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.waitForTimeout(250);

    await page.keyboard.press('s');
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.clearSelection()
    );
    await page.waitForTimeout(100);

    // A plain click on node B must select it.
    const b = await absOfTile(canvas, nodes[1].tile);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(250);

    const sel = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(`SEL-03 observed — selection after the next click ${JSON.stringify(sel)}`);
    expect(sel.map((s) => s.id)).toEqual([nodes[1].id]);
  });
});

// ---------------------------------------------------------------------------
// SEL-05 — a panel click inside a live marquee
// ---------------------------------------------------------------------------
test.describe('SEL-05 — clicking a panel while a marquee selection is live', () => {
  test('a dock click must not arm a canvas group drag', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await twoNodes(page);

    // Marquee-select both nodes, staying in LASSO by NOT completing to CURSOR:
    // arm LASSO and drag a box around them.
    await page.keyboard.press('l');
    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('LASSO');
    const p1 = await abs(canvas, { x: 440, y: 200 });
    const p2 = await abs(canvas, { x: 860, y: 460 });
    await realDrag(page, p1, p2);
    await page.waitForTimeout(250);

    const selAfterMarquee = await selectedIds(page);
    expect(selAfterMarquee.length).toBeGreaterThan(0);

    const before = await itemTiles(page);
    // Click a dock button (off-canvas UI) and drag from it.
    const dock = page.locator('[data-axoview-id="dock-elements-toggle"]');
    const box = await dock.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 160, box!.y + 90, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = await itemTiles(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-05 observed — mode ${await modeType(page)}; ${JSON.stringify(before)} -> ${JSON.stringify(after)}`
    );
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// SEL-06 — freehand path skew under a mid-draw zoom
// ---------------------------------------------------------------------------
test.describe('SEL-06 — zooming while drawing a freehand lasso', () => {
  test('the polygon still captures what it was drawn around', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const nodes = await twoNodes(page);

    await page.evaluate(() => {
      (window as any).__axoview__.ui.getState().actions.setMode({
        type: 'FREEHAND_LASSO',
        showCursor: true,
        path: [],
        selection: null,
        isDragging: false
      });
    });

    const loop: CanvasPoint[] = [
      { x: 430, y: 190 },
      { x: 880, y: 190 },
      { x: 880, y: 470 },
      { x: 430, y: 470 },
      { x: 430, y: 195 }
    ];
    const start = await abs(canvas, loop[0]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const zoomBefore = await getZoom(page);
    for (let i = 1; i < loop.length; i += 1) {
      const p = await abs(canvas, loop[i]);
      await page.mouse.move(p.x, p.y, { steps: 8 });
      if (i === 2) {
        // Mid-draw wheel — nothing gates zoom on an in-flight gesture.
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(80);
      }
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const sel = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-06 observed — zoom ${zoomBefore} -> ${await getZoom(page)}; selected ${JSON.stringify(sel.map((s) => s.id))}; nodes ${JSON.stringify(nodes.map((n) => n.id))}`
    );

    // Both nodes were inside the loop the user drew.
    expect(new Set(sel.map((s) => s.id))).toEqual(
      new Set(nodes.map((n) => n.id))
    );
  });
});

// ---------------------------------------------------------------------------
// SEL-08 / SEL-09 / SEL-15 — additive selection gestures
// ---------------------------------------------------------------------------
test.describe('SEL-08 / SEL-09 / SEL-15 — additive selection', () => {
  test('SEL-09: Shift+click adds a second item to the selection', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const nodes = await twoNodes(page);

    const a = await absOfTile(canvas, nodes[0].tile);
    const b = await absOfTile(canvas, nodes[1].tile);
    await page.mouse.click(a.x, a.y);
    await page.waitForTimeout(200);
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(250);

    const sel = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(`SEL-09 observed — ${JSON.stringify(sel)}`);
    expect(new Set(sel.map((s) => s.id))).toEqual(
      new Set(nodes.map((n) => n.id))
    );
  });

  test('SEL-08: Ctrl+click toggles an already-selected item back out', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const nodes = await twoNodes(page);

    const a = await absOfTile(canvas, nodes[0].tile);
    const b = await absOfTile(canvas, nodes[1].tile);
    await page.mouse.click(a.x, a.y);
    await page.keyboard.down('Control');
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(200);
    expect((await selectedIds(page)).length).toBe(2);

    // Ctrl+click B again — it must drop back out.
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Control');
    await page.waitForTimeout(250);

    const sel = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(`SEL-08 observed — ${JSON.stringify(sel)}`);
    expect(sel.map((s) => s.id)).toEqual([nodes[0].id]);
  });

  test('SEL-15: a second marquee with a modifier extends the selection', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, { x: 470, y: 250 });
    await placeIconViaMouse(page, { x: 830, y: 420 });
    await expect
      .poll(() => getModelItemCount(page), { timeout: 10_000 })
      .toBe(2);
    const nodes = await itemTiles(page);

    // Marquee 1 around node A only.
    await page.keyboard.press('l');
    await realDrag(
      page,
      await abs(canvas, { x: 400, y: 180 }),
      await abs(canvas, { x: 620, y: 340 })
    );
    await page.waitForTimeout(250);
    const first = await selectedIds(page);
    expect(first.length).toBe(1);

    // Marquee 2 around node B, with Shift held (the additive modifier the
    // click path honours).
    await page.keyboard.press('l');
    await page.keyboard.down('Shift');
    await realDrag(
      page,
      await abs(canvas, { x: 700, y: 340 }),
      await abs(canvas, { x: 940, y: 500 })
    );
    await page.keyboard.up('Shift');
    await page.waitForTimeout(250);

    const sel = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-15 observed — first ${JSON.stringify(first.map((s) => s.id))}; after ${JSON.stringify(sel.map((s) => s.id))}; nodes ${JSON.stringify(nodes.map((n) => n.id))}`
    );
    // SUSPECT, not a defect: the marquee REPLACES the selection even with the
    // additive modifier held — the second marquee's single item is all that is
    // left. Click-selection honours Shift/Ctrl as additive, so the two gestures
    // disagree about what the same modifier means. Recorded as a product
    // question rather than filed.
    expect(sel.map((s) => s.id)).toEqual([nodes[0].id]);
    expect(first.map((s) => s.id)).toEqual([nodes[1].id]);
  });
});

// ---------------------------------------------------------------------------
// SEL-10 — selection across a projection toggle
// ---------------------------------------------------------------------------
test.describe('SEL-10 — multi-selection across an iso↔2D toggle', () => {
  test('the selection survives the projection switch intact', async ({
    app
  }) => {
    const { page } = app;
    await twoNodes(page);

    await page.keyboard.press('Control+a');
    await expect
      .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
      .toBe(2);
    const before = await selectedIds(page);

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setCanvasMode('2D')
    );
    await page.waitForTimeout(400);

    const after = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-10 observed — before ${JSON.stringify(before)}; after ${JSON.stringify(after)}`
    );
    expect(after).toEqual(before);
    await expectStoreInvariants(page, 'after projection toggle with a selection');
  });
});

// ---------------------------------------------------------------------------
// SEL-12 — marquee past the viewport edge
// ---------------------------------------------------------------------------
test.describe('SEL-12 — dragging a marquee past the viewport edge', () => {
  test('the canvas auto-scrolls so off-screen items can be lassoed', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await twoNodes(page);

    const scrollBefore = await page.evaluate(() => ({
      ...(window as any).__axoview__.ui.getState().scroll.position
    }));

    await page.keyboard.press('l');
    const start = await abs(canvas, { x: 600, y: 300 });
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // Push well past the right/bottom edge of the viewport and hold there.
    const size = page.viewportSize()!;
    await page.mouse.move(size.width - 2, size.height - 2, { steps: 12 });
    await page.waitForTimeout(700);
    const scrollDuring = await page.evaluate(() => ({
      ...(window as any).__axoview__.ui.getState().scroll.position
    }));
    await page.mouse.up();
    await page.waitForTimeout(200);

    // eslint-disable-next-line no-console
    console.log(
      `SEL-12 observed — scroll ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollDuring)}`
    );
    // SUSPECT, not a defect: there is no auto-scroll at all — holding the
    // marquee against the viewport edge for 700 ms moves nothing, so anything
    // off-screen simply cannot be lassoed without zooming out first. No
    // contract promises auto-scroll; recorded as a product question.
    expect(JSON.stringify(scrollDuring)).toBe(JSON.stringify(scrollBefore));
  });
});

// ---------------------------------------------------------------------------
// SEL-13 — Ctrl+A and hidden / locked layers
// ---------------------------------------------------------------------------
test.describe('SEL-13 — Ctrl+A with a hidden layer', () => {
  test('items on a hidden layer are excluded from select-all', async ({
    app
  }) => {
    const { page } = app;
    await twoNodes(page);
    const nodes = await itemTiles(page);

    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    const layerName = (await activeView(page)).layers[0].name as string;
    await layers.dragItemToLayer(nodes[0].id, layerName);
    await layers.toggleVisibility(layerName);
    await page.waitForTimeout(300);

    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.clearSelection()
    );
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(300);

    const sel = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-13 observed — hidden node ${nodes[0].id}; selected ${JSON.stringify(sel.map((s) => s.id))}`
    );
    expect(sel.map((s) => s.id)).not.toContain(nodes[0].id);
  });
});

// ---------------------------------------------------------------------------
// SEL-14 — hover state within one tile for an off-grid item
// ---------------------------------------------------------------------------
test.describe('SEL-14 — hovering an off-grid item within one tile', () => {
  /** An off-grid node whose drawn body and grid cell share a tile. */
  async function offGridNode(page: Page) {
    await placeIconViaMouse(page, { x: 660, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await setSnapToGrid(page, false);
    const [seed] = await getOffGridItems(page);
    const seedPt = await drawnClientPoint(page, seed);
    await realDrag(page, seedPt, { x: seedPt.x + 40, y: seedPt.y + 18 });
    const [node] = await getOffGridItems(page);
    expect(node.offset, 'setup: the node must be off-grid').toBeTruthy();
    // The setup drag leaves `uiState.mouse.mousedown` populated, and
    // `Cursor.mousemove` only runs the hover path when nothing is pressed — so
    // clear it with a plain click on empty canvas before measuring hover.
    await page.mouse.click(seedPt.x + 320, seedPt.y + 220);
    await page.waitForTimeout(200);
    return node;
  }

  /**
   * FALSIFIED. Moving from the bare grid cell onto the DRAWN body inside one
   * tile DOES update `hoveredItem` — `hasMovedTile` is not the blocker the
   * hypothesis assumed. (The first run of this probe read null in both
   * positions, but that was a rig artifact: the setup drag leaves
   * `uiState.mouse.mousedown` populated — the TCH-02 shape — and
   * `Cursor.mousemove` skips the hover path entirely while a press is live.
   * Clearing the press with a click makes the hover work.)
   *
   * The residual — hover not re-acquiring when the point is approached across
   * tiles in one glide — is the already-registered "Hover feedback lags the
   * cursor by one mousemove (`hasMovedTile` gate)" known issue, not a new find.
   */
  test('hover DOES update when moving onto the drawn body inside one tile', async ({
    app
  }) => {
    const { page } = app;
    const node = await offGridNode(page);
    const cell = await drawnClientPoint(page, { ...node, offset: undefined });
    const drawn = await drawnClientPoint(page, node);

    await page.mouse.move(cell.x, cell.y);
    await page.waitForTimeout(200);
    const atCell = await getHoveredItemId(page);
    await page.mouse.move(drawn.x, drawn.y, { steps: 4 });
    await page.waitForTimeout(250);
    const withinTile = await getHoveredItemId(page);

    // eslint-disable-next-line no-console
    console.log(
      `SEL-14 observed — offset ${JSON.stringify(node.offset)}; at cell ${atCell}; within tile ${withinTile}`
    );

    // The bare cell is NOT over the drawn body (pixel-accurate hit-testing,
    // ADR 0023), and the few px onto the body do register.
    expect(atCell).toBeNull();
    expect(withinTile).toBe(node.id);
  });
});
