/**
 * I1 probes — Escape scope, mid-gesture tool switches, nudge gating, menu life.
 *
 *  PTR-04  Escape typed into a text editor is also consumed by the canvas
 *  PTR-07  a tool hotkey mid connector-draw abandons the provisional connector
 *  PTR-08  Ctrl+A mid connector-draw does the same
 *  PTR-11  arrow-nudge moves an item on a layer locked after selection
 *  PTR-13  the canvas context menu survives a zoom, anchored to a stale point
 *
 * PTR-07/08 and PTR-13 drive real input (`page.mouse`) because they depend on
 * hit-testing and on the right-button gesture that `usePanHandlers` owns.
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
  getModelItemCount,
  getModelConnectorCount,
  getModelHistoryLength,
  getUiMode,
  getZoom
} from '../../helpers/store';

type Page = import('@playwright/test').Page;

const A: CanvasPoint = { x: 700, y: 300 };
const B: CanvasPoint = { x: 860, y: 380 };

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const activeView = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model.getState().views.find((v: any) => v.id === viewId);
  });

type TileRow = { id: string; tile: { x: number; y: number } };

const itemTiles = async (page: Page): Promise<TileRow[]> =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id as string,
    tile: { x: i.tile.x as number, y: i.tile.y as number }
  }));

const itemControls = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__axoview__.ui.getState().itemControls;
    return c ? { type: c.type, id: c.id } : null;
  });

const selectedIds = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().selectedIds ?? []
  );

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
// PTR-07 / PTR-08 — interrupting a connector draw
// ---------------------------------------------------------------------------
test.describe('PTR-07 / PTR-08 — interrupting an in-flight connector', () => {
  /**
   * Arms CONNECTOR mode and performs the FIRST click of the click-to-connect
   * flow on node A. `handleClickFirst` really creates the connector in the
   * model and opens a drag transaction; only the second click (or Escape /
   * right-click) closes either.
   */
  async function armHalfDrawnConnector(page: Page, canvas: CanvasPOM) {
    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);
    await closeElementsDock(page);

    await page.keyboard.press('c');
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('CONNECTOR');

    await canvas.clickAt(A);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 3_000 })
      .toBe(1);
    const armed = await getUiMode(page);
    expect((armed as any)?.isConnecting).toBe(true);
  }

  test('positive control: Escape aborts the half-drawn connector', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('Escape');
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 3_000 })
      .toBe(0);
  });

  test.fail(
    'PTR-07 BUG: the rectangle hotkey strands the half-drawn connector',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);
      await armHalfDrawnConnector(page, canvas);

      await page.keyboard.press('r');
      await expect
        .poll(() => modeType(page), { timeout: 3_000 })
        .toBe('RECTANGLE.DRAW');
      // Nudge the pointer so the deferred mode entry/exit actually runs.
      await canvas.dispatchAt(['mousemove'], { x: 760, y: 340 });
      await page.waitForTimeout(250);

      expect(await getModelConnectorCount(page)).toBe(0);
    }
  );

  test('PTR-07 characterization: the abandoned connector stays, anchored to A and to a bare tile', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('r');
    await expect
      .poll(() => modeType(page), { timeout: 3_000 })
      .toBe('RECTANGLE.DRAW');
    await canvas.dispatchAt(['mousemove'], { x: 760, y: 340 });
    await page.waitForTimeout(250);

    const connectors = ((await activeView(page))?.connectors ?? []) as any[];
    // eslint-disable-next-line no-console
    console.log(
      `PTR-07 observed — ${JSON.stringify(connectors.map((c) => ({ id: c.id, anchors: c.anchors?.map((a: any) => a.ref) })))}`
    );

    // A connector the user never finished is now a real, saved entity.
    expect(connectors).toHaveLength(1);
    expect(connectors[0].anchors).toHaveLength(2);
    // Escape can no longer reach it: the mode is no longer CONNECTOR, so
    // `handleConnectorEscape` returns false and it is orphaned for good.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    expect(await getModelConnectorCount(page)).toBe(1);
  });

  test.fail('PTR-08 BUG: Ctrl+A strands the half-drawn connector', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('Control+a');
    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('CURSOR');
    await canvas.dispatchAt(['mousemove'], { x: 760, y: 340 });
    await page.waitForTimeout(250);

    expect(await getModelConnectorCount(page)).toBe(0);
  });

  test('PTR-08 characterization: Ctrl+A even folds the orphan into the selection', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('Control+a');
    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('CURSOR');
    await canvas.dispatchAt(['mousemove'], { x: 760, y: 340 });
    await page.waitForTimeout(250);

    const selected = await selectedIds(page);
    // eslint-disable-next-line no-console
    console.log(
      `PTR-08 observed — connectors ${await getModelConnectorCount(page)}; selected ${JSON.stringify(selected)}`
    );
    expect(await getModelConnectorCount(page)).toBe(1);
    // 2 nodes + the connector the user never committed.
    expect(selected).toHaveLength(3);
    expect(selected.some((s: any) => s.type === 'CONNECTOR')).toBe(true);
  });

  test('scope note: the leaked drag bracket does NOT suppress later history', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);
    await armHalfDrawnConnector(page, canvas);

    await page.keyboard.press('r');
    await canvas.dispatchAt(['mousemove'], { x: 760, y: 340 });
    await page.waitForTimeout(200);
    const historyBefore = await getModelHistoryLength(page);

    // A plain rectangle draw after the abandoned connector.
    await canvas.dragFromTo({ x: 640, y: 200 }, { x: 780, y: 260 });
    await page.waitForTimeout(400);

    // eslint-disable-next-line no-console
    console.log(
      `history ${historyBefore} -> ${await getModelHistoryLength(page)}`
    );
    // The HIST-06 amplifier does NOT fire here — the next gesture's own
    // begin/commit closes the bracket. The damage is the stranded entity only.
    expect(await getModelHistoryLength(page)).toBeGreaterThan(historyBefore);
  });
});

// ---------------------------------------------------------------------------
// PTR-11 — arrow nudge on a layer locked after selection
// ---------------------------------------------------------------------------
test.describe('PTR-11 — arrow nudge vs a layer locked after selection', () => {
  /** Places two nodes on one layer, selects them, then locks the layer. */
  async function selectThenLock(page: Page) {
    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

    const ids: string[] = ((await activeView(page))?.items ?? []).map(
      (i: any) => i.id
    );

    const layers = new LayersPanelPOM(page);
    await layers.open();
    await layers.addLayer();
    const layerName = (await activeView(page)).layers[0].name as string;
    for (const id of ids) await layers.dragItemToLayer(id, layerName);

    // Select everything while the layer is still unlocked.
    await page.keyboard.press('Control+a');
    await expect
      .poll(async () => (await selectedIds(page)).length, { timeout: 5_000 })
      .toBeGreaterThan(0);

    // Now lock the layer. RED-15: the selection is not revisited.
    await layers.toggleLock(layerName);
    await page.waitForTimeout(250);
    const lockedNow = await page.evaluate((name) => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const view = bridge.model
        .getState()
        .views.find((v: any) => v.id === viewId);
      return Boolean(
        (view?.layers ?? []).find((l: any) => l.name === name)?.locked
      );
    }, layerName);
    expect(lockedNow).toBe(true);
  }

  test.fail(
    'BUG: the arrow keys nudge items on a locked layer',
    async ({ app }) => {
      const { page } = app;
      await selectThenLock(page);

      const before = await itemTiles(page);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(350);

      // handleArrowKey asserts in a comment that selectedIds cannot hold locked
      // items, so it applies no lock gate of its own.
      expect(await itemTiles(page)).toEqual(before);
    }
  );

  test('characterization: every locked item moves one tile, and keeps moving', async ({
    app
  }) => {
    const { page } = app;
    await selectThenLock(page);

    const before = await itemTiles(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
    const after = await itemTiles(page);

    // eslint-disable-next-line no-console
    console.log(
      `PTR-11 observed — before ${JSON.stringify(before)}; after ${JSON.stringify(after)}; selected ${(await selectedIds(page)).length}`
    );

    // Every selected item on the locked layer moved exactly +1 tile in x.
    expect(after).toEqual(
      before.map((i) => ({ id: i.id, tile: { x: i.tile.x + 1, y: i.tile.y } }))
    );

    // Not a one-off: the nudge keeps working for as long as the stale
    // selection survives, so a locked layer can be walked across the canvas.
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(350);
    expect(await itemTiles(page)).toEqual(
      before.map((i) => ({
        id: i.id,
        tile: { x: i.tile.x + 1, y: i.tile.y + 1 }
      }))
    );
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
