/**
 * I3 probes — the drag engine's group rules and the selection's blast radius.
 *
 *  SEL-01  arrow-nudging an off-grid item wipes its `offset` residual
 *  SEL-04  a mixed group dragged into a collision tears apart
 *  SEL-07  a live freehand selection makes Backspace-in-a-text-field destructive
 *  SEL-11  a partial collision in a multi-select drop
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import {
  getOffGridItems,
  setSnapToGrid,
  drawnClientPoint,
  realDrag
} from '../../helpers/offGrid';
import {
  getModelItemCount,
  getViewItemCount,
  getViewRectangleCount,
  getUiMode
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
    () => (window as any).__axoview__.ui.getState().selectedIds ?? []
  );

const selectRefs = async (page: Page, refs: Array<{ type: string; id: string }>) => {
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

// ---------------------------------------------------------------------------
// SEL-01 — arrow-nudging an off-grid item
// ---------------------------------------------------------------------------
test.describe('SEL-01 — arrow nudge on an off-grid item', () => {
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

  test.fail(
    'BUG: one arrow press discards the px residual and snaps the item to the grid',
    async ({ app }) => {
      const { page } = app;
      const node = await offGridNode(page);
      await selectRefs(page, [{ type: 'ITEM', id: node.id }]);

      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);

      const [after] = await getOffGridItems(page);
      // The nudge should translate by one tile and keep the residual.
      expect(after.offset).toEqual(node.offset);
      expect(after.tile).toEqual({ x: node.tile.x + 1, y: node.tile.y });
    }
  );

  test('characterization: the tile moves, the offset is erased', async ({
    app
  }) => {
    const { page } = app;
    const node = await offGridNode(page);
    await selectRefs(page, [{ type: 'ITEM', id: node.id }]);

    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);

    const [after] = await getOffGridItems(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-01 observed — before ${JSON.stringify({ tile: node.tile, offset: node.offset })}; after ${JSON.stringify({ tile: after.tile, offset: after.offset })}`
    );

    expect(after.tile).toEqual({ x: node.tile.x + 1, y: node.tile.y });
    // The residual is gone — the item visibly jumps to the grid.
    expect(after.offset ?? null).toBeNull();
    await expectStoreInvariants(page, 'after off-grid nudge');
  });
});

// ---------------------------------------------------------------------------
// SEL-04 — a mixed group dragged into a collision
// ---------------------------------------------------------------------------
test.describe('SEL-04 — mixed node + rectangle group over an occupied tile', () => {
  /**
   * Builds: node A and node B (the obstacle), plus a rectangle. A and the
   * rectangle are selected as one group and dragged so A's target lands on B.
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

  test.fail(
    'BUG: the group tears — the node is blocked but the rectangle keeps going',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      const g = await mixedGroup(page, canvas);
      await selectRefs(page, [
        { type: 'ITEM', id: g.moving.id },
        { type: 'RECTANGLE', id: g.rect.id }
      ]);

      const before = await geometry(page);
      const nodeDx =
        before.items[1].tile.x - before.items[0].tile.x;
      const nodeDy =
        before.items[1].tile.y - before.items[0].tile.y;

      // Drag the group so the moving node targets the obstacle's tile.
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
      void nodeDx;
      void nodeDy;

      // Whatever the collision decides, the group must move RIGIDLY.
      expect(rectDelta).toEqual(nodeDelta);
    }
  );

  test('characterization: the node and the rectangle commit different deltas', async ({
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
    const nodeDelta = {
      x: movedNode.tile.x - before.items[0].tile.x,
      y: movedNode.tile.y - before.items[0].tile.y
    };
    const rectDelta = {
      x: after.rects[0].from.x - before.rects[0].from.x,
      y: after.rects[0].from.y - before.rects[0].from.y
    };
    // eslint-disable-next-line no-console
    console.log(
      `SEL-04 observed — node ${JSON.stringify(nodeDelta)}; rect ${JSON.stringify(rectDelta)}; before ${JSON.stringify(before)}; after ${JSON.stringify(after)}`
    );

    expect(rectDelta).not.toEqual(nodeDelta);
    await expectStoreInvariants(page, 'after torn group drag');
  });
});

// ---------------------------------------------------------------------------
// SEL-07 — a live freehand selection makes Backspace destructive everywhere
// ---------------------------------------------------------------------------
test.describe('SEL-07 — Backspace in a text field with a freehand selection live', () => {
  /** Draws a freehand lasso around two nodes and returns the live selection. */
  async function freehandSelectTwo(page: Page, canvas: CanvasPOM) {
    await placeIconViaMouse(page, { x: 560, y: 280 });
    await placeIconViaMouse(page, { x: 700, y: 360 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    // Arm the freehand lasso and draw a loop enclosing both nodes.
    await page.evaluate(() => {
      (window as any).__axoview__.ui.getState().actions.setMode({
        type: 'FREEHAND_LASSO',
        showCursor: true,
        path: [],
        selection: null,
        isDragging: false
      });
    });
    const box = await canvas.interactionsLayer().boundingBox();
    const loop: CanvasPoint[] = [
      { x: 470, y: 210 },
      { x: 820, y: 210 },
      { x: 820, y: 460 },
      { x: 470, y: 460 },
      { x: 470, y: 215 }
    ];
    await page.mouse.move(box!.x + loop[0].x, box!.y + loop[0].y);
    await page.mouse.down();
    for (const p of loop.slice(1)) {
      await page.mouse.move(box!.x + p.x, box!.y + p.y, { steps: 8 });
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  test.fail(
    'BUG: a Backspace typed into a text field deletes the canvas selection',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      await freehandSelectTwo(page, canvas);
      await page.evaluate(() => {
        const el = document.createElement('input');
        el.id = 'sel07-field';
        el.value = 'abc';
        el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999';
        document.body.appendChild(el);
        el.focus();
        (el as HTMLInputElement).setSelectionRange(3, 3);
      });
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);
      expect(await getViewItemCount(page)).toBe(2);
    }
  );

  test('characterization: the items are destroyed and the keystroke never reaches the field', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await freehandSelectTwo(page, canvas);

    const mode = await getUiMode(page);
    const sel = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(
      `SEL-07 setup — mode ${(mode as any)?.type}; mode.selection items ${((mode as any)?.selection?.items ?? []).length}; selectedIds ${sel.length}`
    );

    // How many real text fields does the app expose right now? Recorded so the
    // finding's reachability is evidence, not assumption.
    const realInputs = await page.evaluate(
      () =>
        document.querySelectorAll(
          'input:not([type=hidden]):not([type=file]), textarea, [contenteditable=true]'
        ).length
    );

    // A focused text field — the shape every panel/rename input has.
    await page.evaluate(() => {
      const el = document.createElement('input');
      el.id = 'sel07-field';
      el.value = 'abc';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999';
      document.body.appendChild(el);
      el.focus();
      el.setSelectionRange(3, 3);
    });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // NB: model.items leaks deleted nodes (RED-08), so the view is the oracle.
    const remaining = await getViewItemCount(page);
    const fieldValue = await page.evaluate(
      () => (document.getElementById('sel07-field') as HTMLInputElement).value
    );
    // eslint-disable-next-line no-console
    console.log(
      `SEL-07 observed — real inputs in DOM: ${realInputs}; VIEW items left ${remaining}; field "${fieldValue}"`
    );

    // The whole freehand selection is gone, and the field never saw the key.
    expect(remaining).toBe(0);
    expect(fieldValue).toBe('abc');
    expect(realInputs).toBeGreaterThan(0);
  });

  test('control: with no freehand selection the same Backspace is harmless', async ({
    app
  }) => {
    const { page } = app;
    await placeIconViaMouse(page, { x: 560, y: 280 });
    await placeIconViaMouse(page, { x: 700, y: 360 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    await page.evaluate(() => {
      const el = document.createElement('input');
      el.id = 'sel07-field';
      el.value = 'abc';
      el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999';
      document.body.appendChild(el);
      el.focus();
      el.setSelectionRange(3, 3);
    });
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);
    expect(await getViewItemCount(page)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// SEL-11 — partial collision in a multi-select drop
// ---------------------------------------------------------------------------
test.describe('SEL-11 — multi-select drop where only one target tile is blocked', () => {
  test('the group moves rigidly or not at all — never partially', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    // Three nodes: two selected and dragged, one obstacle in the path of only
    // the first one's target tile.
    await placeIconViaMouse(page, { x: 460, y: 300 });
    await placeIconViaMouse(page, { x: 600, y: 300 });
    await placeIconViaMouse(page, { x: 740, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(3);

    const view = await activeView(page);
    const [a, b, obstacle] = view.items;
    await selectRefs(page, [
      { type: 'ITEM', id: a.id },
      { type: 'ITEM', id: b.id }
    ]);

    const before = view.items.map((i: any) => ({
      id: i.id,
      tile: { ...i.tile }
    }));
    const from = await absOfTile(canvas, a.tile);
    const to = await absOfTile(canvas, obstacle.tile);
    await realDrag(page, from, to);
    await page.waitForTimeout(300);

    const after = ((await activeView(page)).items as any[]).map((i) => ({
      id: i.id,
      tile: { ...i.tile }
    }));
    const delta = (id: string) => {
      const bTile = before.find((i: any) => i.id === id)!.tile;
      const aTile = after.find((i) => i.id === id)!.tile;
      return { x: aTile.x - bTile.x, y: aTile.y - bTile.y };
    };
    // eslint-disable-next-line no-console
    console.log(
      `SEL-11 observed — A ${JSON.stringify(delta(a.id))}; B ${JSON.stringify(delta(b.id))}; obstacle ${JSON.stringify(delta(obstacle.id))}; mode ${await modeType(page)}`
    );

    expect(delta(a.id)).toEqual(delta(b.id));
    expect(delta(obstacle.id)).toEqual({ x: 0, y: 0 });
    const tiles = after.map((i) => `${i.tile.x},${i.tile.y}`);
    expect(new Set(tiles).size).toBe(tiles.length);
    await expectStoreInvariants(page, 'after partial-collision group drop');
  });
});
