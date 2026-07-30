/**
 * E1 probes — undo over operations the baseline never exercises.
 *
 *  HIST-11  undo of a Ctrl+] z-order change
 *  HIST-12  undo of a Delete that cascaded connectors
 *  HIST-13  selection coherence across Delete → undo → redo (INV-2)
 *
 * All three are "conspicuous gaps" from coverage-baseline.md §"Undo/redo /
 * clipboard / hotkeys / modes".
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
  getViewItemCount,
  getUiMode
} from '../../helpers/store';

const modeType = async (page: import('@playwright/test').Page) =>
  (await getUiMode(page))?.type ?? null;

const activeView = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    return bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
  });

const zIndices = async (page: import('@playwright/test').Page) =>
  ((await activeView(page))?.items ?? []).map((i: any) => ({
    id: i.id,
    zIndex: i.zIndex
  }));

const selectedIds = (page: import('@playwright/test').Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().selectedIds ?? []
  );

/** Connectors present in the model with a missing/empty scene path (INV-4). */
const pathlessConnectors = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    const scene = bridge.scene.getState();
    return (view?.connectors ?? [])
      .filter((c: any) => {
        const e = scene.connectors?.[c.id];
        return !e || (e.path?.tiles ?? []).length === 0;
      })
      .map((c: any) => c.id);
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
  await page.keyboard.press('Escape');
}

const A: CanvasPoint = { x: 360, y: 260 };
const B: CanvasPoint = { x: 520, y: 340 };

// ---------------------------------------------------------------------------
// HIST-11 — undo of a z-order change
// ---------------------------------------------------------------------------
test.describe('HIST-11 — undo of Ctrl+] (z-order)', () => {
  test('undo restores the previous zIndex', async ({ app }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    await canvas.clickAt(A);
    await page.waitForTimeout(150);
    expect((await selectedIds(page)).length).toBe(1);

    const before = await zIndices(page);
    await page.keyboard.press('Control+]');
    await page.waitForTimeout(200);
    const raised = await zIndices(page);
    expect(raised).not.toEqual(before);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    expect(await zIndices(page)).toEqual(before);
    await expectStoreInvariants(page, 'after z-order undo');
  });
});

// ---------------------------------------------------------------------------
// HIST-12 — undo of a Delete that cascaded connectors
// ---------------------------------------------------------------------------
test.describe('HIST-12 — undo of a delete that cascaded connectors', () => {
  test('the restored connector comes back with a scene path', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    await drawConnector(page, canvas, A, B);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(1);
    expect(await pathlessConnectors(page)).toEqual([]);

    // Delete node A — the connector cascades away with it.
    await canvas.clickAt(A);
    await page.waitForTimeout(150);
    await page.keyboard.press('Delete');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(0);

    await page.keyboard.press('Control+z');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(2);

    // Both must return, and the connector must be routable again — not an
    // invisible model-only connector.
    expect(await getModelConnectorCount(page)).toBe(1);
    expect(await pathlessConnectors(page)).toEqual([]);
    await expectStoreInvariants(page, 'after delete-cascade undo');
  });
});

// ---------------------------------------------------------------------------
// HIST-13 — selection coherence across Delete → undo → redo
// ---------------------------------------------------------------------------
test.describe('HIST-13 — selection after Delete / undo / redo', () => {
  test.fail(
    'BUG: selection still references the deleted item (INV-2)',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);

      await placeIconViaMouse(page, A);
      await placeIconViaMouse(page, B);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(2);

      await canvas.clickAt(A);
      await page.waitForTimeout(150);
      expect((await selectedIds(page)).length).toBe(1);

      await page.keyboard.press('Delete');
      await expect
        .poll(() => getViewItemCount(page), { timeout: 5_000 })
        .toBe(1);
      await expectStoreInvariants(page, 'after delete');

      await page.keyboard.press('Control+z');
      await expect
        .poll(() => getViewItemCount(page), { timeout: 5_000 })
        .toBe(2);
      await expectStoreInvariants(page, 'after undo of delete');

      await page.keyboard.press('Control+y');
      await expect
        .poll(() => getViewItemCount(page), { timeout: 5_000 })
        .toBe(1);
      await expectStoreInvariants(page, 'after redo of delete');
    }
  );

  test('characterization: the deleted id stays selected until the next click', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    await canvas.clickAt(A);
    await page.waitForTimeout(150);
    const selectedBefore = await selectedIds(page);
    expect(selectedBefore).toHaveLength(1);
    const deletedId = (selectedBefore[0] as { id: string }).id;

    await page.keyboard.press('Delete');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);

    // The view item is gone from the model, but uiState still names it. Any
    // subsequent action routed through the selection (a style write, an arrow
    // nudge, a second Delete) targets an id `getItemByIdOrThrow` will reject —
    // the throw path HIST-05 shows corrupts the undo snapshot.
    const after = await selectedIds(page);
    expect(after).toEqual(selectedBefore);
    const stillInView = await page.evaluate((id) => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const view = bridge.model
        .getState()
        .views.find((v: any) => v.id === viewId);
      return (view?.items ?? []).some((i: any) => i.id === id);
    }, deletedId);
    expect(stillInView).toBe(false);
  });
});
