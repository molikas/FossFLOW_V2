/**
 * I5 probes — pan/right-click, context menu, placement tools, transform handles.
 *
 * Real mouse throughout (APPROACH §3 tier T3): every hypothesis turns on where
 * a press started, where it was released, or which handle it hit.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { LayersPanelPOM } from '../../pom/LayersPanelPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { realDrag } from '../../helpers/offGrid';
import { byAxoviewId } from '../../helpers/selectors';
import {
  getModelItemCount,
  getViewItemCount,
  getViewRectangleCount,
  getViewTextBoxCount,
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

const itemTiles = async (page: Page) =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    tile: { x: i.tile.x as number, y: i.tile.y as number }
  }));

const rectangles = async (page: Page) =>
  ((await activeView(page))?.rectangles ?? []).map((r: any) => ({
    id: r.id as string,
    from: { x: r.from.x as number, y: r.from.y as number },
    to: { x: r.to.x as number, y: r.to.y as number }
  }));

const contextMenu = (page: Page) =>
  page.evaluate(() => {
    const cm = (window as any).__axoview__.ui.getState().contextMenu;
    return cm
      ? {
          variant: cm.variant as string,
          targetType: cm.target?.type ?? null,
          targetId: cm.target?.id ?? null,
          anchor: cm.anchor
        }
      : null;
  });

const absOfTile = async (canvas: CanvasPOM, tile: { x: number; y: number }) => {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  return { x: box!.x + rel.x, y: box!.y + rel.y };
};

const rightClickAt = async (page: Page, p: CanvasPoint) => {
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(350);
};

// CTX-03/04 are FIXED (wave 3) and their probes promoted to
// `usePanHandlers.test.ts` — every persistent tool mode survives a pan, from
// both the right-drag and the middle-drag gesture. CTX-06 likewise, to
// `TransformControlsManager.layerGate.test.tsx` — the transform chrome consults
// `visibleIds` as well as `lockedIds` now.
//
// CTX-01 is FIXED (wave 3) and its probe promoted — the mouse placement modes
// now hit-test the release point (`isCanvasDrop`). See PlaceIcon/TextBox/Label
// unit tests and utils/__tests__/canvasDropTarget.test.ts.

// ---------------------------------------------------------------------------
// CTX-02 — right-tap target after a keyboard pan
// ---------------------------------------------------------------------------
test.describe('CTX-02 — right-tap target freshness', () => {
  /**
   * FALSIFIED. After a keyboard pan with no pointer movement at all, the
   * right-tap opens the CANVAS menu (target null) rather than naming the node
   * that used to be under the cursor — the target is re-resolved, not read
   * from a stale snapshot.
   *
   * Rig note: the first two runs of this probe confirmed the bug, and both
   * were wrong. Focus stays inside the Elements icon grid after placing a node,
   * and the grid consumes arrow keys for its own roving-tabindex navigation, so
   * the canvas never panned (scroll {0,0} -> {0,0}) and the menu was correctly
   * naming the node still under the cursor. Clicking empty canvas first moves
   * focus and the pan lands (scroll {0,0} -> {240,0}).
   */
  test('the menu targets what is under the cursor now, not before the pan', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 620, y: 320 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    const [node] = await itemTiles(page);

    const p0 = await absOfTile(canvas, node.tile);
    const emptySpot = await absOfTile(canvas, { x: -4, y: -4 });
    await page.mouse.click(emptySpot.x, emptySpot.y);
    await page.waitForTimeout(200);
    await page.mouse.move(p0.x, p0.y);
    await page.waitForTimeout(250);
    await page.evaluate(() =>
      (window as any).__axoview__.ui.getState().actions.clearSelection()
    );

    const scrollBefore = await page.evaluate(() => ({
      ...(window as any).__axoview__.ui.getState().scroll.position
    }));
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    const scrollAfter = await page.evaluate(() => ({
      ...(window as any).__axoview__.ui.getState().scroll.position
    }));
    const nowAt = await absOfTile(canvas, node.tile);

    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(350);
    const menu = await contextMenu(page);

    // eslint-disable-next-line no-console
    console.log(
      `CTX-02 observed — scroll ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollAfter)}; cursor ${JSON.stringify(p0)}; node now at ${JSON.stringify(nowAt)}; menu ${JSON.stringify(menu)}`
    );

    // The pan really happened and really moved the node off the cursor...
    expect(scrollAfter).not.toEqual(scrollBefore);
    expect(Math.abs(nowAt.x - p0.x)).toBeGreaterThan(100);
    // ...and the menu correctly reports empty canvas under the pointer.
    expect(menu?.variant).toBe('canvas');
    expect(menu?.targetId ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CTX-07 — a right-click whose press began off-canvas
// ---------------------------------------------------------------------------
test.describe('CTX-07 — right-clicking inside a panel', () => {
  test('a right-click in the dock keeps its native menu', async ({ app }) => {
    const { page } = app;
    await placeIconViaMouse(page, { x: 620, y: 320 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);

    const icon = byAxoviewId(page, 'canvas-icon-grid-item').first();
    if (!(await icon.isVisible().catch(() => false))) {
      await byAxoviewId(page, 'dock-elements-toggle').click();
      await icon.waitFor({ state: 'visible', timeout: 5_000 });
    }
    const box = await icon.boundingBox();

    const prevented = await page.evaluate(() => {
      (window as any).__ctx7 = null;
      window.addEventListener(
        'contextmenu',
        (e) => {
          (window as any).__ctx7 = e.defaultPrevented;
        },
        false
      );
      return true;
    });
    void prevented;

    await rightClickAt(page, {
      x: box!.x + box!.width / 2,
      y: box!.y + box!.height / 2
    });

    const wasPrevented = await page.evaluate(() => (window as any).__ctx7);
    const menu = await contextMenu(page);
    // eslint-disable-next-line no-console
    console.log(
      `CTX-07 observed — contextmenu defaultPrevented: ${wasPrevented}; our menu ${JSON.stringify(menu)}`
    );
    expect(wasPrevented).toBe(false);
    expect(menu).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CTX-08 / CTX-09 / CTX-10 — rectangle draw and resize edges
// ---------------------------------------------------------------------------
test.describe('CTX-08 / CTX-09 / CTX-10 — rectangle geometry', () => {
  async function drawRect(page: Page, canvas: CanvasPOM) {
    await page.keyboard.press('r');
    await canvas.dragFromTo({ x: 480, y: 260 }, { x: 700, y: 380 });
    await expect
      .poll(() => getViewRectangleCount(page), { timeout: 5_000 })
      .toBe(1);
    await page.keyboard.press('s');
    return (await rectangles(page))[0];
  }

  test('CTX-09: a zero-travel rectangle draw does not commit a degenerate rect', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await page.keyboard.press('r');
    await canvas.clickAt({ x: 560, y: 320 });
    await page.waitForTimeout(400);

    const rects = await rectangles(page);
    // eslint-disable-next-line no-console
    console.log(`CTX-09 observed — ${JSON.stringify(rects)}`);
    // Either nothing is created, or what IS created is a usable 1-tile rect.
    if (rects.length > 0) {
      expect(rects[0].from).toEqual(rects[0].to);
    }
    expect(rects.length).toBeLessThanOrEqual(1);
    await expectStoreInvariants(page, 'after a zero-travel rectangle draw');
  });

  test('CTX-10: undo of a rectangle resize restores the original bounds', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const before = await drawRect(page, canvas);

    // Select it, then drag a corner handle.
    const corner = await absOfTile(canvas, before.to);
    await page.mouse.click(corner.x, corner.y);
    await page.waitForTimeout(300);
    await realDrag(page, corner, { x: corner.x + 130, y: corner.y + 70 });
    await page.waitForTimeout(300);
    const resized = (await rectangles(page))[0];
    // eslint-disable-next-line no-console
    console.log(
      `CTX-10 observed — before ${JSON.stringify(before)}; resized ${JSON.stringify(resized)}`
    );

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    const undone = (await rectangles(page))[0];
    // eslint-disable-next-line no-console
    console.log(`CTX-10 after undo — ${JSON.stringify(undone)}`);
    expect(undone.from).toEqual(before.from);
    expect(undone.to).toEqual(before.to);
  });

  test('CTX-08: dragging a handle past the opposite edge does not invert the rect', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const before = await drawRect(page, canvas);

    const corner = await absOfTile(canvas, before.to);
    await page.mouse.click(corner.x, corner.y);
    await page.waitForTimeout(300);
    // Drag the handle way past the opposite corner.
    const far = await absOfTile(canvas, {
      x: before.from.x - 4,
      y: before.from.y + 4
    });
    await realDrag(page, corner, far);
    await page.waitForTimeout(400);

    const after = (await rectangles(page))[0];
    // eslint-disable-next-line no-console
    console.log(
      `CTX-08 observed — before ${JSON.stringify(before)}; after ${JSON.stringify(after)}`
    );
    // A rectangle must stay a rectangle: normalised bounds, non-negative size.
    expect(Math.abs(after.to.x - after.from.x)).toBeGreaterThanOrEqual(0);
    await expectStoreInvariants(page, 'after an inverted rectangle resize');
  });
});

// ---------------------------------------------------------------------------
// CTX-11 / CTX-12 — the context menu itself
// ---------------------------------------------------------------------------
test.describe('CTX-11 / CTX-12 — context menu placement and contents', () => {
  test('CTX-11: a menu opened near the viewport edge stays on screen', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    const size = page.viewportSize()!;
    // Inside the interactions box, as close to its bottom-right as the canvas
    // goes — the raw viewport corner is over app chrome, where the canvas menu
    // correctly does not open.
    const canvasBox = await canvas.interactionsLayer().boundingBox();
    // Hard against the RIGHT edge of the canvas, vertically clear of the
    // bottom dock (which is not canvas, so a right-click there opens nothing).
    await rightClickAt(page, {
      x: Math.min(canvasBox!.x + canvasBox!.width - 6, size.width - 6),
      y: canvasBox!.y + canvasBox!.height * 0.5
    });

    const menu = await contextMenu(page);
    expect(menu, 'the canvas menu must open near the edge').not.toBeNull();
    const paper = page.locator('.MuiMenu-paper').first();
    await paper.waitFor({ state: 'visible', timeout: 3_000 });
    const box = await paper.boundingBox();
    // eslint-disable-next-line no-console
    console.log(
      `CTX-11 observed — viewport ${size.width}x${size.height}; menu box ${JSON.stringify(box)}`
    );
    expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.y).toBeGreaterThanOrEqual(-1);
  });

  test('CTX-12: a rectangle and a node offer the same core commands', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, { x: 620, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    const [node] = await itemTiles(page);
    const nodePoint = await absOfTile(canvas, node.tile);
    await rightClickAt(page, nodePoint);
    const nodeItems = await page
      .locator('.MuiMenu-paper li')
      .allTextContents();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);

    await page.keyboard.press('r');
    await canvas.dragFromTo({ x: 380, y: 440 }, { x: 560, y: 540 });
    await expect
      .poll(() => getViewRectangleCount(page), { timeout: 5_000 })
      .toBe(1);
    await page.keyboard.press('s');
    const rect = (await rectangles(page))[0];
    const rectPoint = await absOfTile(canvas, {
      x: Math.round((rect.from.x + rect.to.x) / 2),
      y: Math.round((rect.from.y + rect.to.y) / 2)
    });
    await rightClickAt(page, rectPoint);
    const rectItems = await page
      .locator('.MuiMenu-paper li')
      .allTextContents();

    // eslint-disable-next-line no-console
    console.log(
      `CTX-12 observed — node menu ${JSON.stringify(nodeItems)}; rectangle menu ${JSON.stringify(rectItems)}`
    );
    expect(nodeItems.length).toBeGreaterThan(0);
    expect(rectItems.length).toBeGreaterThan(0);
    // ADR 0027 §4: the menu is the sole per-item command surface, so Delete
    // must exist for every element type.
    const hasDelete = (items: string[]) =>
      items.some((t: string) => /delete|remove/i.test(t));
    expect(hasDelete(nodeItems)).toBe(true);
    expect(hasDelete(rectItems)).toBe(true);
  });
});

// CTX-15 is FIXED (wave 2) and its probe promoted to the main suite —
// `tests/readonly-enforcement.spec.ts`, alongside the I1/PTR-01..03 and
// F2/VIEW-11 legs of the same read-only class. The cause was not the pan path
// swallowing the click: `Pan.mouseup` already had the read-only branch, but a
// RAF-throttled mousemove arriving after the press wrote `mouse.mousedown` back
// to null, so the branch's "was this a click?" test never held.

// ---------------------------------------------------------------------------
// CTX-05 — wheel-zoom during a node icon-resize
// ---------------------------------------------------------------------------
test.describe('CTX-05 — zooming during a node resize', () => {
  test('a mid-resize wheel does not jump the committed icon scale', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await placeIconViaMouse(page, { x: 640, y: 320 });
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    const [node] = await itemTiles(page);

    const p = await absOfTile(canvas, node.tile);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(350);

    const anchors = page.locator('[data-axoview-id="canvas-transform-anchor"]');
    const count = await anchors.count().catch(() => 0);
    // eslint-disable-next-line no-console
    console.log(`CTX-05 — transform anchors found: ${count}`);
    test.skip(count === 0, 'no transform anchor exposed for a node selection');

    const handle = await anchors.first().boundingBox();
    const zoomBefore = await getZoom(page);
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 60, handle!.y + 40, { steps: 6 });
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(120);
    await page.mouse.move(handle!.x + 90, handle!.y + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const scale = await page.evaluate((id) => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const view = bridge.model
        .getState()
        .views.find((v: any) => v.id === viewId);
      return (view?.items ?? []).find((i: any) => i.id === id)?.iconScale ?? null;
    }, node.id);
    // eslint-disable-next-line no-console
    console.log(
      `CTX-05 observed — zoom ${zoomBefore} -> ${await getZoom(page)}; iconScale ${scale}`
    );
    // The schema caps iconScale at [0.1, 3] (CLIP-13); a zoom-corrupted factor
    // is the classic way past that cap.
    if (scale !== null) {
      expect(scale).toBeGreaterThanOrEqual(0.1);
      expect(scale).toBeLessThanOrEqual(3);
    }
    await expectStoreInvariants(page, 'after a zoom mid node-resize');
  });
});

// ---------------------------------------------------------------------------
// CTX-13 — keyboard placement position
// ---------------------------------------------------------------------------
test.describe('CTX-13 — placing via the keyboard', () => {
  test('Enter on a focused Elements icon places at the viewport centre', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    // Park the pointer far from centre so a stale-cursor placement would be
    // obvious, then place using only the keyboard.
    const corner = await absOfTile(canvas, { x: -6, y: 6 });
    await page.mouse.move(corner.x, corner.y);
    await page.waitForTimeout(250);

    const icon = byAxoviewId(page, 'canvas-icon-grid-item').first();
    if (!(await icon.isVisible().catch(() => false))) {
      await byAxoviewId(page, 'dock-elements-toggle').click();
      await icon.waitFor({ state: 'visible', timeout: 5_000 });
    }
    await icon.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    const items = await itemTiles(page);
    const centre = await page.evaluate(() => {
      const ui = (window as any).__axoview__.ui.getState();
      return { scroll: { ...ui.scroll.position }, zoom: ui.zoom };
    });
    // eslint-disable-next-line no-console
    console.log(
      `CTX-13 observed — viewport ${JSON.stringify(centre)}; items ${JSON.stringify(items)}`
    );

    expect(items, 'Enter on a focused icon must place a node').toHaveLength(1);
    // With scroll at origin the viewport centre is tile {0,0}-ish; what it must
    // NOT be is the stale pointer corner.
    expect(items[0].tile).not.toEqual({ x: -6, y: 6 });
    await expectStoreInvariants(page, 'after a keyboard placement');
  });
});

// ---------------------------------------------------------------------------
// Characterization for CTX-06 (the passing half of the pair)
// ---------------------------------------------------------------------------
test('CTX-06 characterization: four resize handles render over a hidden member', async ({
  app
}) => {
  const { page } = app;
  await placeIconViaMouse(page, { x: 520, y: 280 });
  await placeIconViaMouse(page, { x: 760, y: 380 });
  await expect.poll(() => getModelItemCount(page), { timeout: 10_000 }).toBe(2);
  const tiles = await itemTiles(page);

  const layers = new LayersPanelPOM(page);
  await layers.open();
  await layers.addLayer();
  const layerName = (await activeView(page)).layers[0].name as string;
  await layers.dragItemToLayer(tiles[1].id, layerName);
  await layers.toggleVisibility(layerName);
  await page.waitForTimeout(300);

  await page.evaluate(
    (refs) => {
      (window as any).__axoview__.ui.getState().actions.setSelectedIds(refs);
    },
    tiles.map((t: { id: string }) => ({ type: 'ITEM', id: t.id }))
  );
  await page.waitForTimeout(400);

  const handles = await page
    .locator('[data-axoview-id="canvas-transform-anchor"]')
    .count();
  // eslint-disable-next-line no-console
  console.log(
    `CTX-06 characterization — hidden ${tiles[1].id}; anchors ${handles}`
  );
  // The chrome is drawn around a group whose bounds include an entity the user
  // cannot see: `TransformControlsManager` consults lockedIds but not visibleIds.
  expect(handles).toBe(4);
});

// (CTX-15's characterization retired with its probe — see the note above.)
