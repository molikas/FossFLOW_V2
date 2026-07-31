/**
 * I3 probe — SEL-11: a partial collision in a multi-select drop. FALSIFIED —
 * `computeNodeUpdates` really is all-or-nothing across the NODE members; kept
 * as characterization of the rule SEL-04 turned out to be violating from the
 * other side (the group's non-node members ignored it).
 *
 * PROMOTED OUT — wave 3 fixed SEL-01 (the nudge carries the off-grid residual),
 * SEL-04 (a blocked frame blocks the WHOLE group, not just its nodes) and
 * SEL-07 (the lasso Delete branch respects text-field focus). SEL-01/04 moved
 * to `tests/selection-group-rules.spec.ts`; SEL-07 is unit-pinned in
 * `handleDeleteKey.test.ts` — it is a guard-ordering bug with no geometry.
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
