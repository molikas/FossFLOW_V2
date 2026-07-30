/**
 * E1 probes — cross-page history.
 *
 *  HIST-09  D-9: an undo taken after a page switch applies the previous page's
 *           scene patch to the page now on screen (phantom scene connector).
 *  HIST-10  Undo of a page delete restores the page in the model but never
 *           restores `ui.view`, so Ctrl+Z looks like a no-op.
 *
 * `test.fail()` marks a confirmed repro (APPROACH §6): the body asserts the
 * CORRECT behaviour and stays "expected-failed" until someone fixes it.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import {
  getModelConnectorCount,
  getModelItemCount,
  getUiMode
} from '../../helpers/store';

const modeType = async (page: import('@playwright/test').Page) =>
  (await getUiMode(page))?.type ?? null;

const viewCount = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as any).__axoview__.model.getState().views.length
  );

const activeViewId = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as any).__axoview__.ui.getState().view);

/** Scene connector ids with no backing connector in the ACTIVE view (INV-3). */
const orphanSceneConnectors = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const views = bridge.model.getState().views;
    const view = views.find((v: any) => v.id === viewId);
    const modelIds = new Set((view?.connectors ?? []).map((c: any) => c.id));
    return Object.keys(bridge.scene.getState().connectors ?? {}).filter(
      (id) => !modelIds.has(id)
    );
  });

async function drawConnector(
  page: import('@playwright/test').Page,
  canvas: CanvasPOM,
  from: CanvasPoint,
  to: CanvasPoint
) {
  await page.keyboard.press('c');
  await expect.poll(() => modeType(page), { timeout: 2_000 }).toBe('CONNECTOR');
  await canvas.clickAt(from);
  await page.waitForTimeout(100);
  await canvas.clickAt(to);
}

// ViewTabs' icon buttons carry no accessible name (MUI Tooltip only sets a
// title on the wrapper), so target them by their MUI icon test id.
const addPage = (page: import('@playwright/test').Page) =>
  page.locator('button:has(svg[data-testid="AddIcon"])').click();

const deletePageTab = (page: import('@playwright/test').Page, nth: number) =>
  page.locator('button:has(svg[data-testid="CloseIcon"])').nth(nth).click();

/**
 * Switches pages the way a tab click does — `ViewTabs.handleTabClick` calls
 * `useSceneActions.switchView`, which is `useView.changeView` (SYNC_SCENE +
 * setView), the exact function the debug bridge exposes. The tabs carry no test
 * hooks, so this drives the same call rather than guessing at DOM text.
 */
const switchToView = (page: import('@playwright/test').Page, viewId: string) =>
  page.evaluate((id) => {
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
  }, viewId);

test.describe('HIST-09 — cross-page undo (D-9)', () => {
  test.fail(
    'BUG (known, D-9): undo after a page switch leaves a phantom scene connector on the new page',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);

      const page1Id = await activeViewId(page);

      // Create page 2 FIRST, so the page itself predates every history entry —
      // otherwise the un-recorded createView write (HIST-04) muddies the result.
      await addPage(page);
      await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
      const page2Id = await activeViewId(page);
      await switchToView(page, page1Id);
      await expect.poll(() => activeViewId(page), { timeout: 5_000 }).toBe(
        page1Id
      );

      const A: CanvasPoint = { x: 360, y: 260 };
      const B: CanvasPoint = { x: 520, y: 340 };
      const C: CanvasPoint = { x: 440, y: 440 };

      await placeIconViaMouse(page, A);
      await placeIconViaMouse(page, B);
      await placeIconViaMouse(page, C);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(3);

      // Two connectors on page 1 → the scene holds both paths.
      await drawConnector(page, canvas, A, B);
      await expect
        .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
        .toBe(1);
      await drawConnector(page, canvas, B, C);
      await expect
        .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
        .toBe(2);

      // Switch to the empty page 2. changeView rebuilds the scene from it.
      await switchToView(page, page2Id);
      await expect
        .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
        .toBe(0);
      expect(await orphanSceneConnectors(page)).toEqual([]);

      // Ctrl+Z. The model half reverts page 1 (off-screen); the scene half must
      // NOT write page 1's cached paths into page 2's scene.
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(300);

      expect(await viewCount(page)).toBe(2); // both pages still there
      expect(await orphanSceneConnectors(page)).toEqual([]);
      await expectStoreInvariants(page, 'after cross-page undo');
    }
  );

  test('characterization (D-9): the phantom is page 1 cached path landing in page 2 scene', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    const page1Id = await activeViewId(page);
    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
    const page2Id = await activeViewId(page);
    await switchToView(page, page1Id);

    const A: CanvasPoint = { x: 360, y: 260 };
    const B: CanvasPoint = { x: 520, y: 340 };
    const C: CanvasPoint = { x: 440, y: 440 };
    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await placeIconViaMouse(page, C);
    await drawConnector(page, canvas, A, B);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(1);
    await drawConnector(page, canvas, B, C);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(2);

    await switchToView(page, page2Id);
    expect(await orphanSceneConnectors(page)).toEqual([]);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // Page 2 owns no connectors, but its scene cache now holds page 1's.
    expect(await getModelConnectorCount(page)).toBe(0);
    expect((await orphanSceneConnectors(page)).length).toBeGreaterThan(0);
  });

  test('characterization: Ctrl+Z after "Add page" DELETES the new page and strands ui.view', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    const A: CanvasPoint = { x: 360, y: 260 };
    const B: CanvasPoint = { x: 520, y: 340 };
    const C: CanvasPoint = { x: 440, y: 440 };

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await placeIconViaMouse(page, C);
    await drawConnector(page, canvas, A, B);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(1);
    await drawConnector(page, canvas, B, C);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(2);

    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
    const page2Id = await activeViewId(page);
    expect(await orphanSceneConnectors(page)).toEqual([]);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    // The page creation was never recorded (HIST-04), and every history entry's
    // inverse patch replaces the whole `views` array — so undoing the connector
    // draw rolls `views` back to a snapshot that predates the new page. The
    // page silently disappears…
    expect(await viewCount(page)).toBe(1);
    // …and `ui.view` still points at it: a dangling active-view id (INV-1) that
    // every reader silently resolves by falling back to views[0].
    expect(await activeViewId(page)).toBe(page2Id);
    expect(
      await page.evaluate(
        (id) =>
          (window as any).__axoview__.model
            .getState()
            .views.some((v: any) => v.id === id),
        page2Id
      )
    ).toBe(false);
  });
});

test.describe('HIST-10 — undo of a page delete', () => {
  test.fail(
    'BUG: Ctrl+Z after deleting the active page restores it in the model but not on screen',
    async ({ app }) => {
      const { page } = app;

      const page1Id = await activeViewId(page);

      await addPage(page);
      await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
      const page2Id = await activeViewId(page);
      expect(page2Id).not.toBe(page1Id);

      // Delete the page that is currently on screen.
      await deletePageTab(page, 1);
      await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(1);
      expect(await activeViewId(page)).toBe(page1Id);

      await page.keyboard.press('Control+z');
      await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);

      // Correct: undoing "delete this page" puts the user back on that page.
      expect(await activeViewId(page)).toBe(page2Id);
    }
  );

  test('characterization: the page comes back in the model but the user stays on page 1', async ({
    app
  }) => {
    const { page } = app;

    const page1Id = await activeViewId(page);
    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);

    await deletePageTab(page, 1);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(1);

    await page.keyboard.press('Control+z');
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);

    // `ui.view` is in no history stack, so it is never restored: from the
    // user's seat, Ctrl+Z changed nothing on the canvas.
    expect(await activeViewId(page)).toBe(page1Id);
  });
});
