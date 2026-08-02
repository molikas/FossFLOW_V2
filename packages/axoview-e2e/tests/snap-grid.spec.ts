/**
 * snap-grid.spec.ts — Track T8 (ADR 0023, off-grid positioning + per-item collision).
 *
 * The acceptance surface for #12 (global snap-to-grid toggle) and #20 (per-item
 * unsnap / disable collision). The integer tile stays the engine's source of
 * truth; off-grid lives ONLY in `viewItem.offset` (SceneLayer px) committed by
 * the one `resolvePlacement` chokepoint and applied as a post-projection render
 * translate. These tests read the model directly (debug bridge) and assert the
 * data-model invariants the rest of the engine relies on:
 *
 *   1. global snap OFF  → a drag commits a px `offset` while `tile` stays integer;
 *   2. per-item Unsnap (the context-menu handler) makes an item non-colliding, so
 *      it overlaps a neighbour instead of being pushed/blocked;
 *   3. the global toggle round-trips through persisted settings across a reload.
 *
 * Drag is driven by CanvasPOM's synthetic-pointer path (same as
 * drag-collision.spec); the menu handler is exercised by opening the context
 * menu via the store action and clicking the real MenuItem.
 *
 * The 2026-07-23 off-grid hardening added three cases at the bottom that go one
 * layer further and drive REAL `page.mouse` against DRAWN positions (locked
 * decision 7) — the lasso-accumulate repro, reload-survives-as-painted, and the
 * global-toggle freeze test. See `off-grid-pointer.spec.ts` for why the
 * data-model assertions above could not see the seven-bug cluster.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { getViewItemCount, waitForDebugBridge } from '../helpers/store';
import { promotedIconBox } from '../helpers/nodeOverlay';
import {
  closeElementsPanel,
  drawnClientPoint,
  getContextMenu,
  getOffGridItems,
  placeIconRealMouse,
  realDrag
} from '../helpers/offGrid';

type Page = import('@playwright/test').Page;

interface ViewItemSnapshot {
  id: string;
  tile: { x: number; y: number };
  offset?: { x: number; y: number };
  snap?: boolean;
  collides?: boolean;
}

const getViewItems = (page: Page): Promise<ViewItemSnapshot[]> =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    if (!Array.isArray(views) || views.length === 0) return [];
    const view =
      (viewId && views.find((v: any) => v.id === viewId)) ?? views[0];
    return (view?.items ?? []).map((i: any) => ({
      id: i.id,
      tile: i.tile,
      offset: i.offset,
      snap: i.snap,
      collides: i.collides
    }));
  });

const getSnapToGrid = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as any).__axoview__.ui.getState().snapToGrid);

const setSnapToGrid = (page: Page, value: boolean): Promise<void> =>
  page.evaluate(
    (v: boolean) =>
      (window as any).__axoview__.ui.getState().actions.setSnapToGrid(v),
    value
  );

/** Places the first palette icon at a canvas-relative point (mirrors drag-collision.spec). */
async function placeIcon(page: Page, point: CanvasPoint) {
  const elementsToggle = byAxoviewId(page, 'dock-elements-toggle');
  const firstIcon = byAxoviewId(page, 'canvas-icon-grid-item').first();
  if (!(await firstIcon.isVisible().catch(() => false))) {
    await elementsToggle.click();
    await firstIcon.waitFor({ state: 'visible', timeout: 5_000 });
  }
  const canvas = byLibTestId(page, 'axoview-canvas');
  const iconBox = await firstIcon.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!iconBox || !canvasBox)
    throw new Error('placeIcon: icon or canvas missing a bounding box');
  await page.mouse.move(
    iconBox.x + iconBox.width / 2,
    iconBox.y + iconBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + point.x, canvasBox.y + point.y, {
    steps: 10
  });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

test.describe('T8 — off-grid positioning & per-item collision (ADR 0023)', () => {
  test('global snap OFF: a drag commits a px offset while the tile stays integer (#12)', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    await setSnapToGrid(page, false);
    expect(await getSnapToGrid(page)).toBe(false);

    const place: CanvasPoint = { x: 400, y: 300 };
    await placeIcon(page, place);
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);

    // A deliberately sub-tile, off-axis drag: the floored tile is unlikely to
    // change, but an off-grid commit must record a non-zero px residual.
    const to: CanvasPoint = { x: place.x + 34, y: place.y + 19 };
    await canvas.dragFromTo(place, to);
    await page.waitForTimeout(150);

    const [item] = await getViewItems(page);
    expect(item).toBeTruthy();
    // The load-bearing invariant: tile is still an integer.
    expect(Number.isInteger(item.tile.x)).toBe(true);
    expect(Number.isInteger(item.tile.y)).toBe(true);
    // Off-grid: a px residual was committed.
    expect(item.offset).toBeTruthy();
    expect(Math.abs(item.offset!.x) + Math.abs(item.offset!.y)).toBeGreaterThan(1);
  });

  test('per-item Unsnap (context menu) lets an item overlap a neighbour without collision (#20, KR3)', async ({
    page,
    app
  }) => {
    void app;
    const canvas = new CanvasPOM(page);

    // Default global snap ON, so neighbours snap normally.
    await setSnapToGrid(page, true);

    const A: CanvasPoint = { x: 360, y: 300 };
    const B: CanvasPoint = { x: 540, y: 360 };
    await placeIcon(page, A);
    await placeIcon(page, B);
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(2);

    const before = await getViewItems(page);
    // The item placed at A is the drag subject; B is its neighbour.
    const subject = before[before.length === 2 ? 0 : 0];

    // Open the item context menu for the subject via the store action and click
    // the real "Unsnap from grid" entry (exercises the T8 menu handler).
    await page.evaluate((id: string) => {
      (window as any).__axoview__.ui.getState().actions.openContextMenu({
        anchor: { x: 200, y: 200 },
        variant: 'item',
        target: { type: 'ITEM', id }
      });
    }, subject.id);
    await page.getByRole('menuitem', { name: /Unsnap from grid/i }).click();

    await expect
      .poll(
        async () =>
          (await getViewItems(page)).find((i) => i.id === subject.id)?.snap,
        { timeout: 3_000 }
      )
      .toBe(false);

    // Drag the unsnapped item onto its neighbour. Grab and drop at the items'
    // exact tile centres (via tileToScreen) rather than the raw placement screen
    // points — a multi-tile synthetic drag between arbitrary screen pixels does
    // not reliably engage the intended item, whereas a tile-centre→tile-centre
    // drag is deterministic. With collision implied off the unsnapped item is
    // NOT blocked, so it lands on (overlaps) the neighbour's tile.
    const neighbourTile = before.find((i) => i.id !== subject.id)!.tile;
    const fromScreen = await canvas.tileToScreen(subject.tile);
    const toScreen = await canvas.tileToScreen(neighbourTile);
    await canvas.dragFromTo(fromScreen, toScreen);
    await page.waitForTimeout(150);

    const after = await getViewItems(page);
    const movedSubject = after.find((i) => i.id === subject.id)!;
    const neighbour = after.find((i) => i.id !== subject.id)!;

    // The neighbour never moved (the non-colliding mover does not push it).
    expect(neighbour.tile).toEqual(neighbourTile);

    // The unsnapped item landed ON the drop point as an off-grid placement:
    // snap:false plus a committed px `offset`. Per ADR 0023 an off-grid item
    // keeps the integer tile as a base and carries the sub-tile residual in
    // `offset`, so its INTEGER tile legitimately differs from the neighbour's —
    // a collision-OFF mover is dropped exactly where released, NOT snapped to a
    // clean adjacent free tile. Had collision still applied, the item would have
    // been pushed to a different, non-overlapping tile with NO offset.
    expect(movedSubject.snap).toBe(false);
    expect(movedSubject.offset).toBeTruthy();
    expect(
      Math.abs(movedSubject.offset!.x) + Math.abs(movedSubject.offset!.y)
    ).toBeGreaterThan(0);

    // It overlaps the neighbour's cell: tile base + offset places it on the
    // neighbour (Chebyshev distance ≤ 1 tile, the most a sub-tile residual can
    // shift the integer base), proving it was not pushed away.
    expect(Math.abs(movedSubject.tile.x - neighbour.tile.x)).toBeLessThanOrEqual(
      1
    );
    expect(Math.abs(movedSubject.tile.y - neighbour.tile.y)).toBeLessThanOrEqual(
      1
    );
  });

  test('the global snap-to-grid toggle round-trips through persisted settings across reload', async ({
    page,
    app
  }) => {
    void app;

    await setSnapToGrid(page, false);
    // The persist effect writes localStorage on the next tick.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            try {
              return JSON.parse(
                localStorage.getItem('axoview_user_settings') || '{}'
              ).snapToGrid;
            } catch {
              return undefined;
            }
          }),
        { timeout: 3_000 }
      )
      .toBe(false);

    // Reload: the store re-initialises from persisted settings (same mechanism
    // as canvasMode). The fixture keeps the diagram in localStorage, so the
    // bridge re-attaches.
    await page.reload();
    await waitForDebugBridge(page);
    expect(await getSnapToGrid(page)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Off-grid hardening (2026-07-23). The three tests above assert the MODEL;
  // these assert what the user actually sees and grabs. The lasso case is the
  // owner's deterministic repro for the seven-bug cluster: selecting several
  // items and moving them together ACCUMULATES each item's residual, which is
  // how the offsets grew large enough for the cell/drawn gap to bite.
  // -------------------------------------------------------------------------

  test('lasso-move accumulates offsets, and every moved item still opens its OWN menu', async ({
    page,
    app
  }) => {
    void app;
    await setSnapToGrid(page, false);

    await placeIconRealMouse(page, { x: 380, y: 300 });
    await placeIconRealMouse(page, { x: 520, y: 300 });
    await placeIconRealMouse(page, { x: 450, y: 380 });
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(3);
    await closeElementsPanel(page);

    const before = await getOffGridItems(page);
    const centres = await Promise.all(
      before.map((i) => drawnClientPoint(page, i))
    );
    const minX = Math.min(...centres.map((c) => c.x));
    const maxX = Math.max(...centres.map((c) => c.x));
    const minY = Math.min(...centres.map((c) => c.y));
    const maxY = Math.max(...centres.map((c) => c.y));

    // Lasso all three from empty canvas outside their footprints.
    await realDrag(
      page,
      { x: minX - 120, y: minY - 120 },
      { x: maxX + 120, y: maxY + 120 }
    );
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              ((window as any).__axoview__.ui.getState().selectedIds ?? []).length
          ),
        { timeout: 3_000 }
      )
      .toBe(3);

    // Move the whole selection by a sub-tile, off-axis delta — twice, so the
    // residuals accumulate rather than merely being set once.
    for (let i = 0; i < 2; i += 1) {
      const grabItem = (await getOffGridItems(page)).find(
        (it) => it.id === before[0].id
      )!;
      const grab = await drawnClientPoint(page, grabItem);
      await realDrag(page, grab, { x: grab.x + 29, y: grab.y + 13 });
    }

    const after = await getOffGridItems(page);
    expect(after).toHaveLength(3);
    for (const item of after) {
      expect(Number.isInteger(item.tile.x)).toBe(true);
      expect(Number.isInteger(item.tile.y)).toBe(true);
      expect(item.offset).toBeTruthy();
    }

    // Drop the multi-selection first: a right-click on a member of an active
    // multi-selection opens the BULK menu by design (ADR 0027), which would mask
    // what this case is about.
    await page.mouse.click(minX - 120, maxY + 140);
    await page.waitForTimeout(200);

    // Right-click EACH at its drawn position: every one must open its own item
    // menu. Before the fix the target was resolved from the rounded mouse tile,
    // so an accumulated residual sent the user to the canvas menu instead.
    for (const item of after) {
      const drawn = await drawnClientPoint(page, item);
      await page.mouse.click(drawn.x, drawn.y, { button: 'right' });
      await expect
        .poll(() => getContextMenu(page), { timeout: 3_000 })
        .toEqual({ variant: 'item', targetType: 'ITEM' });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
  });

  test('an off-grid item survives a reload at its DRAWN position, not just in the model', async ({
    page,
    app
  }) => {
    void app;
    await setSnapToGrid(page, false);
    await placeIconRealMouse(page, { x: 460, y: 320 });
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
    await closeElementsPanel(page);

    const [placed] = await getOffGridItems(page);
    const grab = await drawnClientPoint(page, placed);
    await realDrag(page, grab, { x: grab.x + 41, y: grab.y + 17 });

    const moved = (await getOffGridItems(page))[0];
    const drawnBefore = await drawnClientPoint(page, moved);
    // Click where it is DRAWN — a hit-test assertion in itself — then measure the
    // box the user sees. R4/RND-13/15: selection no longer promotes the node into
    // the DOM (ADR 0038 §8), so the measurement goes through
    // `helpers/nodeOverlay`; see there for why the overlay is still the drawn
    // position.
    await page.mouse.click(drawnBefore.x, drawnBefore.y);
    const boxBefore = await promotedIconBox(page, moved.id);

    // Persist exactly what an explicit Save writes, then reload — boot
    // re-validates through viewItemSchema, so this also proves `offset` survives
    // the round-trip (label-drag.spec uses the same idiom).
    await page.evaluate(() => {
      const m = (window as any).__axoview__.model.getState();
      const blob = {
        title: m.title,
        version: m.version,
        icons: m.icons,
        colors: m.colors,
        items: m.items,
        views: m.views
      };
      // The model blob alone restores the STORE but leaves the app on its
      // empty-state screen (the fixture's diagram is never written to the
      // explorer). Seed the explorer entry + last-opened id too, so the reload
      // comes back with the diagram actually OPEN and painted.
      localStorage.setItem('axoview-last-opened-data', JSON.stringify(blob));
      localStorage.setItem(
        'axoview-diagrams',
        JSON.stringify([
          {
            id: 'e2e-offgrid',
            name: blob.title || 'Untitled Diagram',
            data: { ...blob, icons: [] },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ])
      );
      localStorage.setItem('axoview-last-opened', 'e2e-offgrid');
    });
    await page.reload();
    await byLibTestId(page, 'axoview-canvas').waitFor({
      state: 'visible',
      timeout: 10_000
    });
    await waitForDebugBridge(page);
    await expect.poll(() => getViewItemCount(page), { timeout: 10_000 }).toBe(1);

    const restored = (await getOffGridItems(page))[0];
    expect(restored.offset).toBeTruthy();
    expect(restored.offset).toEqual(moved.offset);
    expect(restored.tile).toEqual(moved.tile);

    // The model surviving is what the old acceptance test checked. What matters
    // to the user is the PAINT. Boot may fit-to-view, so absolute client coords
    // are not comparable across the reload — assert instead that the node is
    // drawn at tile + offset in the NEW viewport, and that clicking there (a
    // hit-test assertion in itself) still selects it. The pre-reload box is
    // compared by SIZE, which the viewport change would also perturb if the
    // reload had dropped the residual onto the grid.
    await closeElementsPanel(page);
    await page.waitForTimeout(300);
    const drawnAfter = await drawnClientPoint(page, restored);
    await page.mouse.click(drawnAfter.x, drawnAfter.y);
    const boxAfter = await promotedIconBox(page, restored.id);

    // The icon's horizontal centre sits on the drawn point.
    expect(
      Math.abs(boxAfter.x + boxAfter.width / 2 - drawnAfter.x)
    ).toBeLessThan(8);
    // …and that point is NOT the grid cell: the residual is still being applied
    // to the paint, not merely stored. (Boot fit-to-screen changes the zoom, so
    // the pre-reload box is only useful as a "it had one" sanity check — client
    // coordinates and drawn size are not comparable across the refit.)
    expect(boxBefore.width).toBeGreaterThan(0);
    const bareAfter = await drawnClientPoint(page, {
      ...restored,
      offset: undefined
    });
    expect(
      Math.hypot(drawnAfter.x - bareAfter.x, drawnAfter.y - bareAfter.y)
    ).toBeGreaterThan(4);
  });

  test('turning global snap ON does NOT re-snap items that are already off-grid', async ({
    page,
    app
  }) => {
    void app;
    // FREEZE TEST, not an endorsement. Whether the global toggle should pull
    // existing off-grid items back onto the grid is an open product question
    // (PLAN.md open questions). Today it does not, and that is load-bearing:
    // per-item `snap:false` overrides exist precisely so a few items can stay
    // between tiles while the rest snap. This pins the behaviour so the answer
    // is a deliberate change with a failing test, not a silent drift.
    await setSnapToGrid(page, false);
    await placeIconRealMouse(page, { x: 460, y: 320 });
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
    await closeElementsPanel(page);

    const [placed] = await getOffGridItems(page);
    const grab = await drawnClientPoint(page, placed);
    await realDrag(page, grab, { x: grab.x + 33, y: grab.y + 15 });

    const offGrid = (await getOffGridItems(page))[0];
    expect(offGrid.offset).toBeTruthy();

    await setSnapToGrid(page, true);
    await page.waitForTimeout(300);

    const afterToggle = (await getOffGridItems(page))[0];
    expect(afterToggle.tile).toEqual(offGrid.tile);
    expect(afterToggle.offset).toEqual(offGrid.offset);

    // …and it is still grabbable where it is drawn, not at its cell.
    const drawn = await drawnClientPoint(page, afterToggle);
    await page.mouse.click(drawn.x, drawn.y, { button: 'right' });
    await expect
      .poll(() => getContextMenu(page), { timeout: 3_000 })
      .toEqual({ variant: 'item', targetType: 'ITEM' });
  });
});
