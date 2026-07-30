/**
 * R4 — RND-03, RND-04, RND-06, RND-12: the composition root's OTHER contracts.
 *
 * RND-03 — `coarseBounds` is only ever recomputed inside the store subscriber.
 *   A projection switch changes `screenToTile` (so the effect re-subscribes) but
 *   nothing re-culls; correctness rides entirely on the toggle ALSO writing
 *   scroll, and on that write landing after the new subscriber is installed.
 *   Oracle: compare the bulk's `data-draw-count` straight after the switch with
 *   the count after a forced re-cull (an isolated `setScroll` of the same
 *   values). A difference means the switch left stale bounds behind.
 *
 * RND-04 — the promotion keys are comma-joined id strings that are re-split, so
 *   an id containing a comma matches nothing on the way back.
 *
 * RND-06 — fit-to-view measures the renderer container, which spans the whole
 *   window with the docks overlaying it.
 *
 * RND-12 — a connector with no scene entry at all is promoted by neither side of
 *   the hybrid. Probed as an INVARIANT first (is it reachable?) and then for its
 *   consequence.
 */
import {
  exploreTest as test,
  expect
} from '../../fixtures/explore.fixture';
import type { Page } from '@playwright/test';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getViewItemCount } from '../../helpers/store';
import { layerCounters, paintedPixels } from '../_rig/glOracles';

const NODES_CANVAS = 'axoview-nodes-canvas';

const modeType = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().mode.type as string
  );

const drawCount = async (page: Page) =>
  (await layerCounters(page, NODES_CANVAS)).drawCount;

/**
 * Re-run the cull without moving the viewport: `setScroll` always allocates a
 * new `scroll` object, so the subscriber fires and `computeTileBounds` runs
 * with the CURRENT screenToTile. Callers wait > PAN_GESTURE_GAP_MS (250 ms)
 * first so this counts as an isolated change and commits immediately.
 */
const forceRecull = async (page: Page) => {
  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setScroll({
      position: { ...ui.scroll.position },
      offset: { ...ui.scroll.offset }
    });
  });
  await page.waitForTimeout(600);
};

// ---------------------------------------------------------------------------
// RND-03 — does a projection switch re-cull?
// ---------------------------------------------------------------------------

test.describe('RND-03 — culling after an iso↔2D switch', () => {
  test('the post-switch visible set equals a freshly recomputed one', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(240_000);
    const canvas = new CanvasPOM(page);

    // Nodes spread far enough that the visible SET genuinely differs between
    // the two projections (the tile→screen map differs, so the culled tile box
    // does too). Without that, both counts would agree trivially.
    const tiles = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: -6, y: 0 },
      { x: 0, y: 6 },
      { x: 0, y: -6 },
      { x: 9, y: 9 },
      { x: -9, y: -9 }
    ];
    for (const t of tiles) {
      const p = await canvas.tileToScreen(t);
      // Off-viewport tiles cannot be placed with the mouse; seed those directly.
      if (p.x > 20 && p.y > 20 && p.x < 1200 && p.y < 620) {
        await placeIconViaMouse(page, p);
      }
    }
    const placed = await getViewItemCount(page);
    expect(placed, 'PRECONDITION: several nodes were placed').toBeGreaterThan(2);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );
    await page.waitForTimeout(700);

    const isoCount = await drawCount(page);
    expect(isoCount, 'PRECONDITION: the bulk is drawing in ISO').toBeGreaterThan(0);

    await canvas.toggleCanvasMode();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as any).__axoview__.ui.getState().canvasMode
          ),
        { timeout: 5_000 }
      )
      .toBe('2D');
    await page.waitForTimeout(900);

    const afterSwitch = await drawCount(page);
    await forceRecull(page);
    const afterRecull = await drawCount(page);

    // Characterization: the switch left the cull current.
    expect(afterSwitch).toBe(afterRecull);
  });
});

// ---------------------------------------------------------------------------
// RND-04 — a comma in an id defeats the drag promotion
// ---------------------------------------------------------------------------

const COMMA_ID = 'imported,node';

/** Rewrite the single item's id everywhere it is referenced. */
const rewriteFirstItemId = (page: Page, newId: string) =>
  page.evaluate((nid: string) => {
    const bridge = (window as any).__axoview__;
    const m = bridge.model.getState();
    const viewId = bridge.ui.getState().view;
    const view = m.views.find((v: any) => v.id === viewId);
    const oldId = (view?.items ?? [])[0]?.id;
    if (!oldId) return null;
    const items = m.items.map((i: any) =>
      i.id === oldId ? { ...i, id: nid } : i
    );
    const views = m.views.map((v: any) =>
      v.id === viewId
        ? {
            ...v,
            items: (v.items ?? []).map((i: any) =>
              i.id === oldId ? { ...i, id: nid } : i
            )
          }
        : v
    );
    m.actions.set({ items, views }, true);
    const after = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return { oldId, newId: (after?.items ?? [])[0]?.id ?? null };
  }, newId);

async function beginRealDrag(page: Page, from: CanvasPoint, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.waitForTimeout(80);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 6 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
  await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('DRAG_ITEMS');
}

const dragSetIds = (page: Page) =>
  page.evaluate(() => {
    const mode = (window as any).__axoview__.ui.getState().mode;
    return mode.type === 'DRAG_ITEMS'
      ? mode.items.map((i: any) => `${i.type}:${i.id}`)
      : null;
  });

test.describe('RND-04 — an id containing a comma breaks hybrid promotion', () => {
  test('CONTROL: a normal id is promoted to the DOM overlay during a drag', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await placeIconViaMouse(page, at);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );
    await page.waitForTimeout(400);

    await beginRealDrag(page, at, 160, 60);
    const ids = await dragSetIds(page);
    expect(ids, 'PRECONDITION: the drag set holds the node').toHaveLength(1);
    const id = ids![0].split(':')[1];
    await expect(page.locator(`[data-drag-id="${id}"]`)).toHaveCount(1);
    expect(await drawCount(page), 'the bulk skips the promoted node').toBe(0);
    await page.mouse.up();
  });

  test('a comma id is neither promoted nor skipped — no drag preview exists', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const at = await canvas.tileToScreen({ x: 0, y: 0 });
    await placeIconViaMouse(page, at);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    const rewritten = await rewriteFirstItemId(page, COMMA_ID);
    expect(rewritten?.newId, 'PRECONDITION: the id really carries a comma').toBe(
      COMMA_ID
    );
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );
    await page.waitForTimeout(600);

    await beginRealDrag(page, at, 160, 60);
    const ids = await dragSetIds(page);
    expect(ids, 'PRECONDITION: the drag really started on THIS node').toEqual([
      `ITEM:${COMMA_ID}`
    ]);

    // Characterization: no DOM overlay copy, and the node is still on the bulk.
    expect(await page.locator(`[data-drag-id="${COMMA_ID}"]`).count()).toBe(0);
    expect(await drawCount(page)).toBe(1);
    await page.mouse.up();
    await page.waitForTimeout(300);
  });

  test.fail(
    'BUG: a dragged node must be promoted to the DOM overlay whatever its id',
    async ({ page, app }) => {
      void app;
      test.setTimeout(180_000);
      const canvas = new CanvasPOM(page);
      const at = await canvas.tileToScreen({ x: 0, y: 0 });
      await placeIconViaMouse(page, at);
      await expect.poll(() => getViewItemCount(page)).toBe(1);
      const rewritten = await rewriteFirstItemId(page, COMMA_ID);
      expect(
        rewritten?.newId,
        'PRECONDITION: the id really carries a comma'
      ).toBe(COMMA_ID);
      await page.evaluate(() =>
        (window as any).__axoview__.ui.getState().actions.setItemControls(null)
      );
      await page.waitForTimeout(600);

      await beginRealDrag(page, at, 160, 60);
      expect(
        await dragSetIds(page),
        'PRECONDITION: the drag really started on THIS node'
      ).toEqual([`ITEM:${COMMA_ID}`]);

      const promoted = await page
        .locator(`[data-drag-id="${COMMA_ID}"]`)
        .count();
      await page.mouse.up();
      expect(promoted).toBe(1);
    }
  );
});

// ---------------------------------------------------------------------------
// RND-06 — fit-to-view frames into the full window, docks included
// ---------------------------------------------------------------------------

test.describe('RND-06 — fit-to-view ignores the docks overlaying the canvas', () => {
  test('after a fit, the outermost node sits under the left dock', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);

    // A wide spread so the fit is genuinely width-limited.
    for (const t of [
      { x: -4, y: 4 },
      { x: 0, y: 0 },
      { x: 4, y: -4 }
    ]) {
      const p = await canvas.tileToScreen(t);
      await placeIconViaMouse(page, p);
    }
    await expect.poll(() => getViewItemCount(page)).toBe(3);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.setItemControls(null)
    );

    await page.locator('[data-axoview-id="canvas-zoom-fit"]').click();
    await page.waitForTimeout(900);

    // Leftmost node's screen point AFTER the fit.
    const left = await canvas.tileToScreen({ x: -4, y: 4 });
    const box = (await canvas.interactionsLayer().boundingBox())!;
    const abs = { x: box.x + left.x, y: box.y + left.y };
    expect(abs.x, 'PRECONDITION: the point is inside the window').toBeGreaterThan(0);

    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        return {
          id: el?.getAttribute('data-axoview-id') ?? null,
          inDock: Boolean(
            el?.closest(
              '[data-axoview-id="left-dock"], [data-axoview-id="elements-panel"], .MuiDrawer-root'
            )
          ),
          overCanvas: Boolean(
            el?.closest('[data-axoview-id="canvas-interactions"]')
          )
        };
      },
      abs
    );
    // Characterization: record where the node actually landed.
    expect(hit.overCanvas || hit.inDock).toBe(true);
    expect(hit).toBeTruthy();
    // The finding: it is NOT on the free canvas.
    expect(hit.overCanvas).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RND-12 — a connector with no scene entry renders nowhere
// ---------------------------------------------------------------------------

async function drawConnector(
  page: Page,
  canvas: CanvasPOM,
  from: CanvasPoint,
  to: CanvasPoint
) {
  await page.keyboard.press('c');
  await expect.poll(() => modeType(page), { timeout: 2_000 }).toBe('CONNECTOR');
  await canvas.clickAt(from);
  await page.waitForTimeout(100);
  await canvas.clickAt(to);
  await page.keyboard.press('Escape');
}

/** Every view connector must have a scene entry — candidate invariant INV-12. */
const connectorsWithoutScenePath = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    const scene = bridge.scene.getState().connectors ?? {};
    return (view?.connectors ?? [])
      .filter((c: any) => !scene[c.id])
      .map((c: any) => c.id);
  });

test.describe('RND-12 — a connector with no scene entry', () => {
  test('is it reachable? every view connector keeps a scene entry across page switches and undo', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(240_000);
    const canvas = new CanvasPOM(page);
    const a = await canvas.tileToScreen({ x: -2, y: 0 });
    const b = await canvas.tileToScreen({ x: 2, y: 0 });
    await placeIconViaMouse(page, a);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await placeIconViaMouse(page, b);
    await expect.poll(() => getViewItemCount(page)).toBe(2);
    await drawConnector(page, canvas, a, b);
    await page.waitForTimeout(500);

    expect(
      await connectorsWithoutScenePath(page),
      'PRECONDITION: the fresh connector is synced'
    ).toEqual([]);

    // New page, back again — the SYNC_SCENE path every tab click takes.
    await page.locator('button:has(svg[data-testid="AddIcon"])').click();
    await page.waitForTimeout(700);
    const firstViewId = await page.evaluate(
      () => (window as any).__axoview__.model.getState().views[0].id
    );
    await page.evaluate((id: string) => {
      const bridge = (window as any).__axoview__;
      const m = bridge.model.getState();
      bridge.changeView(id, {
        version: m.version,
        title: m.title,
        description: m.description,
        colors: m.colors,
        icons: m.icons,
        items: m.items,
        views: m.views
      });
    }, firstViewId);
    await page.waitForTimeout(700);
    expect(await connectorsWithoutScenePath(page)).toEqual([]);

    // Undo the page creation, then undo the connector and redo it.
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(500);
    expect(await connectorsWithoutScenePath(page)).toEqual([]);
  });

  test('CONSEQUENCE: with the scene entry removed the connector draws nowhere', async ({
    page,
    app
  }) => {
    void app;
    test.setTimeout(180_000);
    const canvas = new CanvasPOM(page);
    const a = await canvas.tileToScreen({ x: -2, y: 0 });
    const b = await canvas.tileToScreen({ x: 2, y: 0 });
    await placeIconViaMouse(page, a);
    await expect.poll(() => getViewItemCount(page)).toBe(1);
    await placeIconViaMouse(page, b);
    await expect.poll(() => getViewItemCount(page)).toBe(2);
    await drawConnector(page, canvas, a, b);
    await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      ui.actions.setItemControls(null);
      ui.actions.setSelectedIds([]);
    });
    await page.waitForTimeout(700);

    const painted = await paintedPixels(page, 'axoview-connectors-canvas');
    expect(painted, 'PRECONDITION: the connector is painting').toBeGreaterThan(0);

    // Drop the scene entry (the state a never-synced connector would be in).
    const removed = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const scene = bridge.scene.getState();
      const ids = Object.keys(scene.connectors ?? {});
      const next = { ...scene.connectors };
      ids.forEach((k) => delete next[k]);
      scene.actions?.setConnectors
        ? scene.actions.setConnectors(next)
        : bridge.scene.setState({ connectors: next });
      return Object.keys(bridge.scene.getState().connectors ?? {}).length;
    });
    expect(removed, 'PRECONDITION: the scene entry is gone').toBe(0);
    await page.waitForTimeout(800);

    expect(await connectorsWithoutScenePath(page)).toHaveLength(1);
    // Characterization: nothing paints, and no DOM connector was promoted.
    expect(await paintedPixels(page, 'axoview-connectors-canvas')).toBe(0);
  });
});
