/**
 * undo-page-navigation.spec.ts — E1/HIST-10 + E1/HIST-04.
 *
 * Owner ruling (DECISIONS.md 2026-07-30, brief signed off 2026-08-02):
 * *always navigate*. Each history entry is stamped with the page that was
 * active when its action was performed, and undo/redo switches to that page
 * when it targets a non-active one — so a step's effect is never off-screen.
 *
 * Promoted from `tests-exploratory/E1-history/hist-09-10.explore.spec.ts`.
 * The unit-level contract (stamp agreement across the two stores, navigation
 * recording no history, the missing-page guard) lives in
 * `axoview-lib/src/hooks/__tests__/useHistory.pageStamp.test.tsx`; what only an
 * e2e can prove is the part the ruling is actually about — that the CANVAS
 * follows, not just the model and the tab strip.
 *
 * ViewTabs' icon buttons carry no accessible name (MUI Tooltip only sets a
 * title on the wrapper), so they are targeted by their MUI icon test id.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { placeIconViaMouse, CanvasPoint } from '../helpers/place';
import { CanvasPOM } from '../pom/CanvasPOM';
import { getModelConnectorCount, getUiMode } from '../helpers/store';

type PW = import('@playwright/test').Page;

const addPage = (page: PW) =>
  page.locator('button:has(svg[data-testid="AddIcon"])').click();

const deletePageTab = (page: PW, nth: number) =>
  page.locator('button:has(svg[data-testid="CloseIcon"])').nth(nth).click();

const viewCount = (page: PW) =>
  page.evaluate(
    () => (window as any).__axoview__.model.getState().views.length
  );

const activeViewId = (page: PW) =>
  page.evaluate(() => (window as any).__axoview__.ui.getState().view);

/**
 * Item count of the page the user is actually looking at, or `null` when the
 * active id names no page at all.
 *
 * Deliberately NOT `helpers/store.getViewItemCount`: that one falls back to
 * `views[0]` when the active id does not resolve — the very papering-over that
 * hides a dangling `uiState.view` (E3/SCN-09), so it cannot fail on it.
 */
const activePageItemCount = (page: PW) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return view ? (view.items ?? []).length : null;
  });

/**
 * Scene-connector ids with no backing connector in the ACTIVE view — INV-3, the
 * D-9 phantom. A cached path whose owner is not on the page you are looking at.
 */
const orphanSceneConnectors = (page: PW) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    const modelIds = new Set((view?.connectors ?? []).map((c: any) => c.id));
    return Object.keys(bridge.scene.getState().connectors ?? {}).filter(
      (id) => !modelIds.has(id)
    );
  });

const A: CanvasPoint = { x: 360, y: 260 };
const B: CanvasPoint = { x: 520, y: 340 };
const C: CanvasPoint = { x: 440, y: 440 };

async function drawConnector(page: PW, from: CanvasPoint, to: CanvasPoint) {
  const canvas = new CanvasPOM(page);
  await page.keyboard.press('c');
  await expect
    .poll(async () => (await getUiMode(page))?.type ?? null, { timeout: 2_000 })
    .toBe('CONNECTOR');
  await canvas.clickAt(from);
  await page.waitForTimeout(100);
  await canvas.clickAt(to);
}

test.describe('HIST-10 — undo/redo navigates to the page the action was on', () => {
  test('undoing a delete of the ACTIVE page brings the canvas back to that page', async ({
    page,
    app
  }) => {
    void app;

    const page1Id = await activeViewId(page);

    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
    const page2Id = await activeViewId(page);
    expect(page2Id).not.toBe(page1Id);

    // Put something on page 2 so "the canvas changed" is observable rather
    // than inferred: page 1 has no items, page 2 has two.
    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect
      .poll(() => activePageItemCount(page), { timeout: 5_000 })
      .toBe(2);

    // Delete the page currently on screen. The fallback drops us on page 1,
    // which is empty.
    await deletePageTab(page, 1);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(1);
    expect(await activeViewId(page)).toBe(page1Id);
    expect(await activePageItemCount(page)).toBe(0);

    await page.keyboard.press('Control+z');
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);

    // Before HIST-10 the page returned to the model and the tab reappeared,
    // but `ui.view` stayed on page 1 and the canvas did not change — from the
    // user's seat Ctrl+Z did nothing.
    await expect.poll(() => activeViewId(page), { timeout: 5_000 }).toBe(
      page2Id
    );
    expect(await activePageItemCount(page)).toBe(2);
  });

  test('an edit made on another page is undone WITH a switch back to it', async ({
    page,
    app
  }) => {
    void app;

    const page1Id = await activeViewId(page);
    await placeIconViaMouse(page, A);
    await expect
      .poll(() => activePageItemCount(page), { timeout: 5_000 })
      .toBe(1);

    // Walk away to a new page…
    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
    const page2Id = await activeViewId(page);

    // …one Ctrl+Z undoes the page creation (HIST-04) and returns us to page 1,
    // a second undoes the placement that was made there.
    await page.keyboard.press('Control+z');
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(1);
    await expect.poll(() => activeViewId(page), { timeout: 5_000 }).toBe(
      page1Id
    );
    expect(page2Id).not.toBe(page1Id);

    await page.keyboard.press('Control+z');
    await expect
      .poll(() => activePageItemCount(page), { timeout: 5_000 })
      .toBe(0);
    expect(await activeViewId(page)).toBe(page1Id);
  });
});

test.describe('HIST-09 / D-9 — a cross-page undo leaves no phantom scene connector', () => {
  /**
   * Promoted from the D-9 repro in `hist-09-10.explore.spec.ts`, which HIST-10
   * closed as a side effect and which nothing else covers.
   *
   * D-9: an undo taken after a page switch applied the previous page's scene
   * patch to the page now on screen, leaving a cached connector path with no
   * owner in the active view (INV-3). Navigation fixes it at the root rather
   * than by cleanup — the step lands the user back on the page the entry
   * belongs to, and `switchView`'s SYNC_SCENE rebuilds that page's scene from
   * its model, so the patched-in paths are the correct ones for the page being
   * looked at.
   *
   * The guard is the ORPHAN COUNT, not the navigation: if a later change makes
   * undo stop navigating, this goes red for the original D-9 reason.
   */
  test('undo after a page switch: no orphaned scene connector on the page shown', async ({
    page,
    app
  }) => {
    void app;

    const page1Id = await activeViewId(page);

    // Create page 2 FIRST so the page itself predates every history entry.
    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
    const page2Id = await activeViewId(page);

    // Back to page 1 and build something with connectors there.
    await page.keyboard.press('Control+z'); // undo the page creation → page 1
    await expect.poll(() => activeViewId(page), { timeout: 5_000 }).toBe(
      page1Id
    );
    await page.keyboard.press('Control+y'); // redo it back — page 2 exists again
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);
    await page.evaluate((id) => {
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
    }, page1Id);
    await expect.poll(() => activeViewId(page), { timeout: 5_000 }).toBe(
      page1Id
    );

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await placeIconViaMouse(page, C);
    await drawConnector(page, A, B);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(1);
    await drawConnector(page, B, C);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(2);

    // Walk to the empty page 2, then undo. The entry belongs to page 1.
    await page.evaluate((id) => {
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
    }, page2Id);
    await expect
      .poll(() => getModelConnectorCount(page), { timeout: 5_000 })
      .toBe(0);
    expect(await orphanSceneConnectors(page)).toEqual([]);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);

    expect(await viewCount(page)).toBe(2); // both pages still there
    expect(await orphanSceneConnectors(page)).toEqual([]);
  });
});

test.describe('HIST-04 — creating a page is undoable', () => {
  test('Ctrl+Z after "Add page" removes the page and leaves no dangling active view', async ({
    page,
    app
  }) => {
    void app;

    const page1Id = await activeViewId(page);
    await placeIconViaMouse(page, A);
    await expect
      .poll(() => activePageItemCount(page), { timeout: 5_000 })
      .toBe(1);

    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);

    await page.keyboard.press('Control+z');
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(1);

    // The undo removed the PAGE — not the icon placed before it. Previously
    // createView recorded nothing, so this Ctrl+Z reverted the placement while
    // the page stayed.
    expect(await activeViewId(page)).toBe(page1Id);
    expect(await activePageItemCount(page)).toBe(1);
  });

  test('redo brings the page back, still with a resolvable active view', async ({
    page,
    app
  }) => {
    void app;

    await addPage(page);
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);

    await page.keyboard.press('Control+z');
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(1);

    await page.keyboard.press('Control+y');
    await expect.poll(() => viewCount(page), { timeout: 5_000 }).toBe(2);

    // Whatever the redo lands on, the active id must name a page that exists —
    // `activePageItemCount` returns null when it does not.
    expect(await activePageItemCount(page)).not.toBeNull();
  });
});
