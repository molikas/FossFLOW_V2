/**
 * selection-group-rules.spec.ts — the drag engine's group rules and the
 * marquee's selection semantics.
 *
 * Promoted from the 2026-07 exploratory lane when wave 3 fixed the I3 cluster
 * (`I3-selection/sel-01-04-07-11`, `sel-02-15`). The area's carry-forward note
 * put it well: the drag/selection engine is solid where it was designed for and
 * thin at the edges it grew into — nine of fifteen hypotheses were falsified,
 * and all four bugs sat at seams BETWEEN subsystems: keyboard → off-grid offset
 * (SEL-01), node-collision → non-node members (SEL-04), splice → transaction
 * ordering (SEL-02), and the marquee → the click path's modifier rule (SEL-15,
 * ruled 2026-07-30).
 *
 * SEL-07 (a live freehand selection making Backspace destructive in any text
 * field) is unit-pinned in `handleDeleteKey.test.ts` — it is a guard-ordering
 * bug with no geometry in it.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import {
  getOffGridItems,
  setSnapToGrid,
  drawnClientPoint,
  realDrag
} from '../helpers/offGrid';
import {
  getModelItemCount,
  getViewRectangleCount,
  getModelHistoryLength
} from '../helpers/store';

type Page = import('@playwright/test').Page;

test.describe.configure({ timeout: 90_000 });

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

const selectedIds = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().selectedIds ?? []
  );

const selectRefs = async (
  page: Page,
  refs: Array<{ type: string; id: string }>
) => {
  await page.evaluate((r) => {
    (window as any).__axoview__.ui.getState().actions.setSelectedIds(r);
  }, refs);
  await page.waitForTimeout(100);
};

const absOfTile = async (canvas: CanvasPOM, tile: { x: number; y: number }) => {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  return { x: box!.x + rel.x, y: box!.y + rel.y };
};

/** Closes the Elements dock so it can't intercept real mouse events. */
async function closeElementsDock(page: Page) {
  const icon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await icon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await icon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// SEL-01 — arrow-nudging an off-grid item
// ---------------------------------------------------------------------------
test.describe('the arrow nudge and the off-grid residual (SEL-01)', () => {
  /** Places a node, unsnaps it and nudges it off its grid cell with the mouse. */
  async function offGridNode(page: Page) {
    await placeIconViaMouse(page, { x: 660, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await setSnapToGrid(page, false);
    const [before] = await getOffGridItems(page);
    const from = await drawnClientPoint(page, before);
    await realDrag(page, from, { x: from.x + 44, y: from.y + 20 });
    const [item] = await getOffGridItems(page);
    expect(item.offset, 'setup: the node must be off-grid').toBeTruthy();
    return item;
  }

  test('one arrow press moves the tile and PRESERVES the px residual', async ({
    app
  }) => {
    const { page } = app;
    const node = await offGridNode(page);
    await selectRefs(page, [{ type: 'ITEM', id: node.id }]);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    const [after] = await getOffGridItems(page);
    expect(after.tile).toEqual({ x: node.tile.x + 1, y: node.tile.y });
    // Before the fix the batch updater's unconditional `offset: u.offset` wrote
    // `undefined` — the nudge passed none — and the item snapped to the grid.
    expect(after.offset).toEqual(node.offset);
  });

  test('repeated presses keep it', async ({ app }) => {
    const { page } = app;
    const node = await offGridNode(page);
    await selectRefs(page, [{ type: 'ITEM', id: node.id }]);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);

    const [after] = await getOffGridItems(page);
    expect(after.tile).toEqual({
      x: node.tile.x + 1,
      y: node.tile.y + 1
    });
    expect(after.offset).toEqual(node.offset);
  });
});

// ---------------------------------------------------------------------------
// SEL-04 — a mixed group dragged into a collision
// ---------------------------------------------------------------------------
test.describe('a mixed group dragged into a collision (SEL-04)', () => {
  /**
   * Builds node A, node B (the obstacle) and a rectangle. A and the rectangle
   * are selected as one group and dragged so A's target lands on B.
   */
  async function mixedGroup(page: Page, canvas: CanvasPOM) {
    await placeIconViaMouse(page, { x: 480, y: 300 });
    await placeIconViaMouse(page, { x: 760, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    await page.keyboard.press('r');
    await canvas.dragFromTo({ x: 430, y: 430 }, { x: 560, y: 500 });
    await expect
      .poll(() => getViewRectangleCount(page), { timeout: 5_000 })
      .toBe(1);
    await page.keyboard.press('s');
    await closeElementsDock(page);

    const view = await activeView(page);
    return {
      moving: view.items[0],
      obstacle: view.items[1],
      rect: view.rectangles[0]
    };
  }

  const geometry = async (page: Page) => {
    const v = await activeView(page);
    return {
      items: v.items.map((i: any) => ({ id: i.id, tile: { ...i.tile } })),
      rects: v.rectangles.map((r: any) => ({
        id: r.id,
        from: { ...r.from },
        to: { ...r.to }
      }))
    };
  };

  test('the group moves rigidly — the rectangle does not outrun the blocked node', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const g = await mixedGroup(page, canvas);
    await selectRefs(page, [
      { type: 'ITEM', id: g.moving.id },
      { type: 'RECTANGLE', id: g.rect.id }
    ]);

    const before = await geometry(page);
    const from = await absOfTile(canvas, before.items[0].tile);
    const to = await absOfTile(canvas, before.items[1].tile);
    await realDrag(page, from, to);
    await page.waitForTimeout(300);

    const after = await geometry(page);
    const movedNode = after.items.find((i: any) => i.id === g.moving.id)!;
    const movedRect = after.rects[0];
    const nodeDelta = {
      x: movedNode.tile.x - before.items[0].tile.x,
      y: movedNode.tile.y - before.items[0].tile.y
    };
    const rectDelta = {
      x: movedRect.from.x - before.rects[0].from.x,
      y: movedRect.from.y - before.rects[0].from.y
    };

    // Whatever the collision decides, the group must move RIGIDLY. Before the
    // fix the node was blocked at {-2,+2} while the rectangle kept following
    // the cursor to {-3,+3}, and both committed.
    expect(rectDelta).toEqual(nodeDelta);

    // The obstacle is untouched and no tile is shared.
    const obstacle = after.items.find((i: any) => i.id === g.obstacle.id)!;
    expect(obstacle.tile).toEqual(
      before.items.find((i: any) => i.id === g.obstacle.id)!.tile
    );
    expect(movedNode.tile).not.toEqual(obstacle.tile);
  });

  test('control: an unobstructed mixed group still moves', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const g = await mixedGroup(page, canvas);
    await selectRefs(page, [
      { type: 'ITEM', id: g.moving.id },
      { type: 'RECTANGLE', id: g.rect.id }
    ]);

    const before = await geometry(page);
    const from = await absOfTile(canvas, before.items[0].tile);
    await realDrag(page, from, { x: from.x, y: from.y + 160 });
    await page.waitForTimeout(300);

    const after = await geometry(page);
    const movedNode = after.items.find((i: any) => i.id === g.moving.id)!;
    expect(movedNode.tile).not.toEqual(before.items[0].tile);
    const nodeDelta = {
      x: movedNode.tile.x - before.items[0].tile.x,
      y: movedNode.tile.y - before.items[0].tile.y
    };
    const rectDelta = {
      x: after.rects[0].from.x - before.rects[0].from.x,
      y: after.rects[0].from.y - before.rects[0].from.y
    };
    expect(rectDelta).toEqual(nodeDelta);
  });
});

// ---------------------------------------------------------------------------
// SEL-02 — the waypoint splice rides the drag's transaction
// ---------------------------------------------------------------------------
test.describe('dragging a connector body (SEL-02)', () => {
  async function twoConnectedNodes(page: Page, canvas: CanvasPOM) {
    await placeIconViaMouse(page, { x: 480, y: 260 });
    await placeIconViaMouse(page, { x: 780, y: 420 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);
    await closeElementsDock(page);

    await page.keyboard.press('c');
    const view = await activeView(page);
    await canvas.clickAt(await canvas.tileToScreen(view.items[0].tile));
    await canvas.clickAt(await canvas.tileToScreen(view.items[1].tile));
    await expect
      .poll(async () => ((await activeView(page))?.connectors ?? []).length, {
        timeout: 5_000
      })
      .toBe(1);
    await page.keyboard.press('s');
    return (await activeView(page)).connectors[0];
  }

  const anchorCount = async (page: Page) =>
    ((await activeView(page))?.connectors?.[0]?.anchors ?? []).length;

  test('one gesture is one undo entry — a single Ctrl+Z leaves no waypoint', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const connector = await twoConnectedNodes(page, canvas);
    expect(connector.anchors).toHaveLength(2);

    const historyBefore = await getModelHistoryLength(page);

    // Grab the connector's mid-path tile and drag it — that splices a waypoint
    // and then moves it, which the user experiences as ONE gesture.
    const mid = connector.anchors
      .map((a: any) => a.ref)
      .filter((r: any) => r?.tile)[0];
    const view = await activeView(page);
    const midTile = mid ?? {
      x: Math.round((view.items[0].tile.x + view.items[1].tile.x) / 2),
      y: Math.round((view.items[0].tile.y + view.items[1].tile.y) / 2)
    };
    const from = await absOfTile(canvas, midTile.tile ?? midTile);
    await realDrag(page, from, { x: from.x + 90, y: from.y - 60 });
    await page.waitForTimeout(400);

    expect(await anchorCount(page)).toBe(3);
    const historyAfter = await getModelHistoryLength(page);

    // Before the fix the splice landed OUTSIDE the drag bracket, so the single
    // gesture pushed two entries and one Ctrl+Z left the waypoint behind.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    expect(await anchorCount(page)).toBe(2);
    expect(await getModelHistoryLength(page)).toBeLessThan(historyAfter);
    expect(historyAfter).toBeGreaterThan(historyBefore);
  });
});

// ---------------------------------------------------------------------------
// SEL-15 — the additive marquee (ruled 2026-07-30, ADR 0006 §10)
// ---------------------------------------------------------------------------
test.describe('a marquee with the additive modifier (SEL-15)', () => {
  /** Places three nodes spread apart and returns them in placement order. */
  async function threeNodes(page: Page) {
    const points: CanvasPoint[] = [
      { x: 420, y: 240 },
      { x: 640, y: 240 },
      { x: 860, y: 240 }
    ];
    for (const p of points) await placeIconViaMouse(page, p);
    await expect.poll(() => getModelItemCount(page), { timeout: 12_000 }).toBe(3);
    await closeElementsDock(page);
    return (await activeView(page)).items;
  }

  /** Marquees the box around one node's tile, optionally with Shift held. */
  async function marqueeAround(
    page: Page,
    canvas: CanvasPOM,
    tile: { x: number; y: number },
    withShift: boolean
  ) {
    const c = await absOfTile(canvas, tile);
    if (withShift) await page.keyboard.down('Shift');
    await page.mouse.move(c.x - 70, c.y - 90);
    await page.mouse.down();
    await page.mouse.move(c.x - 30, c.y - 40, { steps: 5 });
    await page.mouse.move(c.x + 70, c.y + 90, { steps: 8 });
    await page.mouse.up();
    if (withShift) await page.keyboard.up('Shift');
    await page.waitForTimeout(250);
  }

  test('Shift+marquee EXTENDS the selection instead of replacing it', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await threeNodes(page);

    await marqueeAround(page, canvas, items[0].tile, false);
    const first = await selectedIds(page);
    expect(first.map((r: any) => r.id)).toEqual([items[0].id]);

    await marqueeAround(page, canvas, items[1].tile, true);
    const merged = await selectedIds(page);
    expect(merged.map((r: any) => r.id).sort()).toEqual(
      [items[0].id, items[1].id].sort()
    );
  });

  test('an unmodified marquee still replaces', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await threeNodes(page);

    await marqueeAround(page, canvas, items[0].tile, false);
    expect((await selectedIds(page)).map((r: any) => r.id)).toEqual([
      items[0].id
    ]);

    await marqueeAround(page, canvas, items[1].tile, false);
    expect((await selectedIds(page)).map((r: any) => r.id)).toEqual([
      items[1].id
    ]);
  });

  test('extending is a union, never a toggle — re-lassoing keeps the member', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const items = await threeNodes(page);

    await marqueeAround(page, canvas, items[0].tile, false);
    await marqueeAround(page, canvas, items[0].tile, true);
    expect((await selectedIds(page)).map((r: any) => r.id)).toEqual([
      items[0].id
    ]);
  });
});
