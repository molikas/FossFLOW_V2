/**
 * projection-geometry.spec.ts — geometry that has to agree across a projection
 * change, and across the DOM/WebGL split.
 *
 * Promoted from the 2026-07 exploratory lane when wave 3 fixed the R1 cluster
 * (`R1/geometry-proj-05-10-11-12`, `R1-projection/proj-07-08-09-15`).
 *
 * The pure math is unit-pinned (`reprojectOffset.test.ts`,
 * `projectBounds.test.ts`, `hitPaintOrder.test.ts`). What needs a browser is the
 * WIRING: that the toggle actually re-projects the stored residuals (PROJ-07),
 * that the drawn text box and its own hit range agree in 2D-Y (PROJ-05), and
 * that promoting a connector to the DOM path does not move its endpoint
 * (PROJ-12) — the last of which is only reachable because selection is what
 * triggers the promotion.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import {
  getOffGridItems,
  setSnapToGrid,
  drawnClientPoint,
  realDrag
} from '../helpers/offGrid';
import { getModelItemCount } from '../helpers/store';

type Page = import('@playwright/test').Page;

test.describe.configure({ timeout: 90_000 });

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

const canvasMode = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().canvasMode as string
  );

/** Closes the Elements dock so it can't intercept real mouse events. */
async function closeElementsDock(page: Page) {
  const icon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await icon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await icon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// PROJ-07 — the off-grid residual across an iso↔2D switch
// ---------------------------------------------------------------------------
test.describe('the off-grid residual across a projection switch (PROJ-07)', () => {
  /** Places a node and nudges it off its grid cell with a real drag. */
  async function offGridNode(page: Page) {
    await placeIconViaMouse(page, { x: 660, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await setSnapToGrid(page, false);
    const [before] = await getOffGridItems(page);
    const from = await drawnClientPoint(page, before);
    await realDrag(page, from, { x: from.x + 52, y: from.y + 8 });
    const [item] = await getOffGridItems(page);
    expect(item.offset, 'setup: the node must be off-grid').toBeTruthy();
    await closeElementsDock(page);
    return item;
  }

  test('the residual is re-projected, and the tile is untouched', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const before = await offGridNode(page);

    await canvas.toggleCanvasMode();
    await expect.poll(() => canvasMode(page), { timeout: 5_000 }).toBe('2D');
    await page.waitForTimeout(300);

    const [after] = await getOffGridItems(page);
    // The integer tile is the base and never moves (ADR 0023 §1).
    expect(after.tile).toEqual(before.tile);
    // Before the fix the residual was carried BYTE-IDENTICAL, which is what put
    // an item drawn inside its ISO cell mostly over the neighbouring 2D one.
    expect(after.offset).not.toEqual(before.offset);
    // …and it now sits inside the 2D tile square (half-tile = 50 px).
    expect(Math.abs(after.offset.x)).toBeLessThanOrEqual(50.001);
    expect(Math.abs(after.offset.y)).toBeLessThanOrEqual(50.001);
  });

  test('toggling back restores the original residual exactly', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const before = await offGridNode(page);

    await canvas.toggleCanvasMode();
    await expect.poll(() => canvasMode(page), { timeout: 5_000 }).toBe('2D');
    await page.waitForTimeout(250);
    await canvas.toggleCanvasMode();
    await expect
      .poll(() => canvasMode(page), { timeout: 5_000 })
      .toBe('ISOMETRIC');
    await page.waitForTimeout(250);

    // The two maps are an exact inverse pair, so repeated toggling cannot drift.
    const [after] = await getOffGridItems(page);
    expect(after.offset.x).toBeCloseTo(before.offset.x, 6);
    expect(after.offset.y).toBeCloseTo(before.offset.y, 6);
  });

  test('an all-snapped diagram is not touched by a toggle', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 660, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await closeElementsDock(page);

    const before = await activeView(page);
    await canvas.toggleCanvasMode();
    await expect.poll(() => canvasMode(page), { timeout: 5_000 }).toBe('2D');
    await page.waitForTimeout(300);

    // No residuals → no write at all: no history entry, no dirty flag.
    const after = await activeView(page);
    expect(after.items).toEqual(before.items);
  });
});

// ---------------------------------------------------------------------------
// PROJ-05 — a 2D-Y text box is drawn where its hit range claims
// ---------------------------------------------------------------------------
test.describe('2D Y-orientation text box footprint (PROJ-05)', () => {
  test('the drawn body and the selection range occupy the same tiles', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    // Type the rows through the real editor so the SCENE re-measures them — a
    // direct model write of multi-line content does not, and the row count is
    // the whole point of this case.
    await canvas.placeTextBoxAt(
      { x: 620, y: 320 },
      { text: 'alpha\nbravo\ncharlie\ndelta' }
    );
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await closeElementsDock(page);

    // Y orientation — the shape the campaign measured. Flipping the orientation
    // alone does not change the measured row count, so this write is safe.
    await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const model = bridge.model.getState();
      const view = model.views.find((v: any) => v.id === viewId);
      const tb = view.textBoxes[0];
      model.actions.set({
        views: model.views.map((v: any) =>
          v.id !== viewId
            ? v
            : {
                ...v,
                textBoxes: v.textBoxes.map((t: any) =>
                  t.id !== tb.id ? t : { ...t, orientation: 'Y' }
                )
              }
        )
      });
    });
    await page.waitForTimeout(300);

    await canvas.toggleCanvasMode();
    await expect.poll(() => canvasMode(page), { timeout: 5_000 }).toBe('2D');
    await page.waitForTimeout(400);

    // The wrapper's rendered box must span the row count, not one tile. Before
    // the fix the 2D-Y branch dropped `size.height` entirely, so the wrapper was
    // ALWAYS one tile thick after the 90° rotate while `getTextBoxEndTile` gave
    // the hit range `size.height` tiles of thickness — a click two tiles beside
    // the visible text still selected it, and rows 2..N painted outside.
    const geom = await page.evaluate(() => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const view = bridge.model
        .getState()
        .views.find((v: any) => v.id === viewId);
      const tb = view.textBoxes[0];
      const scene = bridge.scene.getState();
      const size = scene.textBoxes?.[tb.id]?.size ?? null;
      // The projected wrapper is the child of the [data-drag-id] host that
      // `useIsoProjection` sizes — measuring it is measuring the drawn box.
      const host = document.querySelector(
        `[data-drag-id="${tb.id}"]`
      ) as HTMLElement | null;
      const projected = host?.firstElementChild as HTMLElement | null;
      const r = projected?.getBoundingClientRect();
      return {
        rows: size?.height ?? null,
        box: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null
      };
    });

    expect(geom.rows).toBeGreaterThan(1);
    expect(geom.box).not.toBeNull();
    // Rotated 90°, the ROW axis is the drawn box's width. With the row count
    // dropped it collapsed to a single tile; with it restored the box spans
    // clearly more than one tile of the 100px grid (at the default 0.65 zoom).
    expect(geom.box!.w).toBeGreaterThan(100 * 0.65);
  });
});

// ---------------------------------------------------------------------------
// PROJ-12 — the connector endpoint does not jump when it is selected
// ---------------------------------------------------------------------------
test.describe('connector endpoint parity across the DOM/WebGL split (PROJ-12)', () => {
  test('selecting a connector on an off-grid node does not move its endpoint', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, { x: 480, y: 260 });
    await placeIconViaMouse(page, { x: 800, y: 420 });
    await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(2);
    await closeElementsDock(page);

    const items = (await activeView(page)).items;
    await page.keyboard.press('c');
    await canvas.clickAt(await canvas.tileToScreen(items[0].tile));
    await canvas.clickAt(await canvas.tileToScreen(items[1].tile));
    await expect
      .poll(async () => ((await activeView(page))?.connectors ?? []).length, {
        timeout: 5_000
      })
      .toBe(1);
    await page.keyboard.press('s');

    // Push one endpoint's node off-grid by a residual big enough to see.
    await setSnapToGrid(page, false);
    const off = await getOffGridItems(page);
    const target = off.find((i: any) => i.id === items[1].id) ?? off[1];
    const from = await drawnClientPoint(page, target);
    await realDrag(page, from, { x: from.x + 40, y: from.y - 20 });
    await page.waitForTimeout(300);

    const [moved] = (await getOffGridItems(page)).filter(
      (i: any) => i.id === target.id
    );
    expect(moved.offset, 'setup: the node must be off-grid').toBeTruthy();

    // `Renderer.connectorHybridIds` promotes a connector to the DOM path the
    // moment it is SELECTED, so selecting it swaps which renderer draws it.
    // Before the fix only the DOM path applied the node's residual, so the wire
    // visibly jumped at the node on selection (41.6 px for a (37,−19) offset).
    const connectorId = (await activeView(page)).connectors[0].id;
    const endpointBefore = await page.evaluate((id) => {
      const scene = (window as any).__axoview__.scene.getState();
      const p = scene.connectors[id]?.path;
      if (!p?.tiles?.length) return null;
      const last = p.tiles[p.tiles.length - 1];
      return { x: last.x, y: last.y };
    }, connectorId);

    await page.evaluate((id) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'CONNECTOR', id });
    }, connectorId);
    await page.waitForTimeout(400);

    const endpointAfter = await page.evaluate((id) => {
      const scene = (window as any).__axoview__.scene.getState();
      const p = scene.connectors[id]?.path;
      if (!p?.tiles?.length) return null;
      const last = p.tiles[p.tiles.length - 1];
      return { x: last.x, y: last.y };
    }, connectorId);

    // Routing is integer-tile on BOTH paths — only the drawn endpoint shifts —
    // so the path itself must be identical either side of the promotion.
    expect(endpointAfter).toEqual(endpointBefore);
  });
});
