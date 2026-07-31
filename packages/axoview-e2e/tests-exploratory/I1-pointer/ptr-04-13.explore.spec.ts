/**
 * I1 probes — Escape scope and context-menu life.
 *
 *  PTR-04  Escape typed into a text editor is also consumed by the canvas
 *  PTR-13  the canvas context menu survives a zoom, anchored to a stale point
 *
 * Both were FALSIFIED; the probes stay as characterization of behaviour that
 * currently holds only because each text surface defends itself locally
 * (PTR-04) and because MUI's backdrop eats the wheel (PTR-13).
 *
 * PROMOTED OUT — wave 3 fixed PTR-07/08 (a tool hotkey or Ctrl+A mid
 * connector-draw now aborts the provisional connector) and PTR-11 (the arrow
 * nudge re-checks the layer gate per press). Their legs moved to
 * `tests/canvas-keyboard-scope.spec.ts` in the main suite.
 *
 * PTR-13 drives real input (`page.mouse`) because it depends on the
 * right-button gesture that `usePanHandlers` owns.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import { getModelItemCount, getUiMode, getZoom } from '../../helpers/store';

type Page = import('@playwright/test').Page;

const A: CanvasPoint = { x: 700, y: 300 };

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const itemControls = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__axoview__.ui.getState().itemControls;
    return c ? { type: c.type, id: c.id } : null;
  });

const contextMenu = (page: Page) =>
  page.evaluate(() => {
    const cm = (window as any).__axoview__.ui.getState().contextMenu;
    return cm
      ? { variant: cm.variant, targetId: cm.target?.id ?? null, anchor: cm.anchor }
      : null;
  });

/** Closes the Elements dock so it can't intercept real mouse events. */
async function closeElementsDock(page: Page) {
  const icon = page.locator('[data-axoview-id="canvas-icon-grid-item"]').first();
  if (await icon.isVisible().catch(() => false)) {
    await page.locator('[data-axoview-id="dock-elements-toggle"]').click();
    await icon.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// PTR-04 — Escape typed into a text editor
// ---------------------------------------------------------------------------
test.describe('PTR-04 — Escape inside the on-canvas text editor', () => {
  test('the canvas selection state survives an Escape meant for the editor', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await canvas.placeTextBoxAt({ x: 700, y: 300 }, { text: 'hello' });
    await page.waitForTimeout(200);
    const boxId = (await itemControls(page))?.id ?? null;
    expect(boxId).toBeTruthy();

    // Re-enter the edit session the way a user does (ADR 0034 double-click).
    await canvas.dispatchAt(['mousemove'], { x: 700, y: 300 });
    await page.evaluate((id) => {
      (window as any).__axoview__.ui.getState().actions.setEditingTextBoxId(id);
    }, boxId);
    const editor = canvas.textBoxInlineEditor();
    await editor.waitFor({ state: 'visible', timeout: 5_000 });
    await editor.click();

    const controlsBefore = await itemControls(page);

    // Record whether the window-level handler sees (and consumes) the Escape.
    await page.evaluate(() => {
      (window as any).__ptrEsc = null;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape')
          (window as any).__ptrEsc = { prevented: e.defaultPrevented };
      });
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const seen = await page.evaluate(() => (window as any).__ptrEsc);
    const controlsAfter = await itemControls(page);
    // eslint-disable-next-line no-console
    console.log(
      `PTR-04 observed — window saw Escape: ${JSON.stringify(seen)}; itemControls ${JSON.stringify(controlsBefore)} -> ${JSON.stringify(controlsAfter)}; mode ${await modeType(page)}`
    );

    // Cancelling a text edit must not also drop the box out of the panel/strip.
    expect(controlsAfter).toEqual(controlsBefore);
  });
});

// ---------------------------------------------------------------------------
// PTR-13 — context menu life across a zoom
// ---------------------------------------------------------------------------
test.describe('PTR-13 — the canvas context menu across a zoom', () => {
  async function openItemMenu(page: Page) {
    await placeIconViaMouse(page, A);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
    await closeElementsDock(page);

    const box = await page
      .locator('[data-axoview-id="canvas-interactions"]')
      .boundingBox();
    if (!box) throw new Error('no interactions box');
    const pt = { x: box.x + A.x, y: box.y + A.y };
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await expect
      .poll(() => contextMenu(page).then((m) => m !== null), { timeout: 3_000 })
      .toBe(true);
    return pt;
  }

  test('positive control: a left-click away dismisses the menu', async ({
    app
  }) => {
    const { page } = app;
    await openItemMenu(page);

    const box = await page
      .locator('[data-axoview-id="canvas-interactions"]')
      .boundingBox();
    await page.mouse.click(box!.x + 300, box!.y + 500);
    await expect
      .poll(() => contextMenu(page).then((m) => m === null), { timeout: 3_000 })
      .toBe(true);
  });

  test('a zoom must not leave the menu floating at a stale anchor', async ({
    app
  }) => {
    const { page } = app;
    const pt = await openItemMenu(page);
    const menuBefore = await contextMenu(page);
    const zoomBefore = await getZoom(page);

    // Wheel over the canvas while the menu is open.
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(350);

    const zoomAfter = await getZoom(page);
    const menuAfter = await contextMenu(page);
    // eslint-disable-next-line no-console
    console.log(
      `PTR-13 observed — zoom ${zoomBefore} -> ${zoomAfter}; menu ${JSON.stringify(menuBefore)} -> ${JSON.stringify(menuAfter)}`
    );

    // Either the zoom is blocked while the menu is open, or the menu closes.
    // Leaving both live means the menu points at a place the item has left.
    // FALSIFIED: the MUI backdrop covers the canvas, so the wheel never reaches
    // `rendererEl` and the zoom simply does not happen.
    expect(zoomAfter === zoomBefore || menuAfter === null).toBe(true);
    await expectStoreInvariants(page, 'after zoom with the context menu open');
  });

  test('a keyboard pan must not leave the menu floating at a stale anchor', async ({
    app
  }) => {
    const { page } = app;
    await openItemMenu(page);
    const menuBefore = await contextMenu(page);
    const scrollBefore = await page.evaluate(() => ({
      ...(window as any).__axoview__.ui.getState().scroll.position
    }));

    // The backdrop stops the wheel, but the keydown listener is window-bound —
    // nothing stops the arrow-key pan from moving the canvas underneath.
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);

    const scrollAfter = await page.evaluate(() => ({
      ...(window as any).__axoview__.ui.getState().scroll.position
    }));
    const menuAfter = await contextMenu(page);
    // eslint-disable-next-line no-console
    console.log(
      `PTR-13b observed — scroll ${JSON.stringify(scrollBefore)} -> ${JSON.stringify(scrollAfter)}; menu ${JSON.stringify(menuBefore)} -> ${JSON.stringify(menuAfter)}`
    );

    expect(
      JSON.stringify(scrollAfter) === JSON.stringify(scrollBefore) ||
        menuAfter === null
    ).toBe(true);
  });
});
