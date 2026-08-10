/**
 * lasso-connector-delete.spec.ts — v1.1 Track 5e-1.
 *
 * The PR #6 regression class at the E2E layer. PR #6 (commit 2ed5f79,
 * 2026-05-25) was caught by manual smoke after the Lasso partial-selection
 * else-branch handed tile-bound endpoint anchors to `deleteSelectedItems`,
 * leaving connectors with <2 anchors and corrupting the scene (subsequent
 * placeIcon mouseup threw "Connector must have at least two anchors").
 * The two commits in PR #6 fixed it two ways:
 *
 *   (a) Lasso.ts + FreehandLasso.ts: iterate `i = 1..length - 2` in the
 *       partial-selection else-branch, mirroring `getConnectorWaypointRefs`.
 *       Endpoints can never be pushed as `CONNECTOR_ANCHOR` refs.
 *   (b) Lasso path-hit semantics — a connector whose path crosses the
 *       lasso rect is selected as a whole `CONNECTOR` ref (mirroring click).
 *
 * The lib's unit tests (`Lasso.modes.test.ts`) pin both contracts at the
 * mode-action layer. This spec lifts the **user-observable** end of the
 * regression to the E2E layer:
 *
 *   1. partial-lasso-delete-then-place — exact PR #6 user repro. Draw a
 *      free-tile connector → lasso a rect that overlaps only part of the
 *      connector → press Delete → the connector is gone, the scene is
 *      clean, and a subsequent placeIcon does NOT throw.
 *
 *   2. path-hit lasso selection — draw a free-tile connector with both
 *      endpoints OUTSIDE a thin lasso strip but whose path crosses the
 *      strip. Lasso the strip → selection contains the connector (via the
 *      path-hit semantics introduced by PR #6 commit 2). Delete clears it.
 *
 * Lazy data-axoview-id retrofits — none this spec. The PR #6 paths are
 * all hotkey + coord-dispatch driven (CanvasPOM.dispatchAt / dragFromTo
 * on `canvas-interactions`, hotkey `l` = lasso, `c` = connector, `s` =
 * cursor in the smnrct profile per HOTKEY_PROFILES).
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import {
  getModelConnectorCount,
  getModelItemCount,
  getUiMode
} from '../helpers/store';

const getUiModeType = async (page: import('@playwright/test').Page) => {
  const mode = await getUiMode(page);
  return mode?.type ?? null;
};

/**
 * Lasso selection observable. Reads the persistent `uiState.selectedIds` slice,
 * which a completed marquee mirrors its hits into before dropping back to
 * CURSOR (Lasso.mouseup, 2026-07-02). Must still be polled BEFORE pressing
 * Delete, which clears the selection.
 */
const getLassoSelection = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const ids = (window as any).__axoview__.ui.getState().selectedIds;
    return (ids as any[]) ?? [];
  });

/**
 * Place a single icon onto the canvas via the same drag-from-grid path
 * smoke.spec.ts / connector.spec.ts use. Inlined here rather than promoted
 * to CanvasPOM because (a) no other 5e spec needs it yet and (b) lifting
 * the helper without a second consumer would be premature abstraction.
 */
async function placeIcon(
  page: import('@playwright/test').Page,
  point: CanvasPoint
) {
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

test.describe('Lasso × connector × delete-cascade — Track 5e-1 (PR #6 regression)', () => {
  test('5e-1 partial-lasso-delete-then-place: free-tile connector + partial lasso + Delete leaves a clean scene', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);

    // 1. Draw a connector between two FREE tiles (no icons). This is the
    //    exact PR #6 scenario — tile-bound endpoints were the trigger for
    //    the partial-selection else-branch bug.
    //    Click-mode's first click on empty canvas is now a no-op (B3 / Decision
    //    #4 — no free-floating connector from a stray click), so the free→free
    //    fixture is drawn in drag mode (a deliberate press-drag-release).
    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setConnectorInteractionMode('drag')
    );
    await page.keyboard.press('c');
    await expect.poll(() => getUiModeType(page), { timeout: 2_000 }).toBe(
      'CONNECTOR'
    );

    const CONN_START: CanvasPoint = { x: 240, y: 240 };
    const CONN_END: CanvasPoint = { x: 600, y: 400 };
    await canvas.dragFromTo(CONN_START, CONN_END);
    await expect.poll(() => getModelConnectorCount(page), { timeout: 5_000 }).toBe(1);
    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setConnectorInteractionMode('click')
    );

    // 2. Enter LASSO mode via hotkey (`l` in both qwerty + smnrct profiles).
    await page.keyboard.press('l');
    await expect.poll(() => getUiModeType(page), { timeout: 2_000 }).toBe('LASSO');

    // 3. Drag a lasso rect that PARTIALLY overlaps the connector — the
    //    rect contains the connector midpoint but neither endpoint. With
    //    path-hit semantics (PR #6 commit 2) the connector is selected as
    //    a whole `CONNECTOR` ref; the previous partial-selection bug would
    //    have leaked tile-bound endpoints as CONNECTOR_ANCHOR refs.
    const LASSO_FROM: CanvasPoint = { x: 360, y: 280 };
    const LASSO_TO: CanvasPoint = { x: 480, y: 360 };
    await canvas.dragFromTo(LASSO_FROM, LASSO_TO);

    // 4. Selection must contain the connector. We accept either a whole
    //    `CONNECTOR` ref (the post-PR #6 path-hit path) or a non-empty
    //    selection that the Delete handler can resolve — the contract is
    //    "lasso picked up the partially-covered connector".
    const selection = await getLassoSelection(page);
    expect(Array.isArray(selection)).toBe(true);
    expect((selection ?? []).length).toBeGreaterThan(0);
    const refTypes = (selection ?? []).map((r: any) => r.type);
    expect(refTypes).toContain('CONNECTOR');

    // 5. Delete clears the selection, deletes the connector, and exits
    //    back to CURSOR mode (see useInteractionManager.handleKeyDown's
    //    LASSO/Delete branch).
    await page.keyboard.press('Delete');
    await expect.poll(() => getModelConnectorCount(page), { timeout: 5_000 }).toBe(0);
    await expect.poll(() => getUiModeType(page), { timeout: 2_000 }).toBe('CURSOR');

    // 6. Place an icon AFTER the delete — this is the user-reported smoke
    //    PR #6 names in its commit body ("draw two connectors, lasso
    //    partial of one, press Delete, then add a node. After this fix
    //    the node places cleanly."). Pre-fix the connector was left with
    //    a single anchor and placeIcon's downstream isoMath throw
    //    cascaded out of the scene. Post-fix the scene takes it cleanly.
    //
    //    The drop point moved from {240,240} to {700,300} in wave 3: at
    //    {240,240} `document.elementFromPoint` resolves to an Elements-panel
    //    icon button, i.e. the drag was being released ON THE PANEL, and the
    //    node it placed landed at a tile hidden behind it. That is exactly
    //    I5/CTX-01, so this step was passing only because of the bug. The drop
    //    LOCATION is incidental to what this journey asserts (that the scene
    //    survives the delete cascade); the location being on open canvas is not.
    await placeIcon(page, { x: 700, y: 300 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);
  });

  test('5e-1 path-hit: lasso strip crossing a connector whose endpoints sit outside still selects it', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);

    // 1. Draw a diagonal connector between two free tiles, endpoints far
    //    enough apart that a thin horizontal strip across the middle
    //    contains neither endpoint.
    //    Free→free via drag mode — click-mode's first click on empty canvas is
    //    a no-op now (B3 / Decision #4).
    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setConnectorInteractionMode('drag')
    );
    await page.keyboard.press('c');
    await expect.poll(() => getUiModeType(page), { timeout: 2_000 }).toBe(
      'CONNECTOR'
    );

    const TOP_LEFT: CanvasPoint = { x: 220, y: 200 };
    const BOTTOM_RIGHT: CanvasPoint = { x: 620, y: 460 };
    await canvas.dragFromTo(TOP_LEFT, BOTTOM_RIGHT);
    await expect.poll(() => getModelConnectorCount(page), { timeout: 5_000 }).toBe(1);
    await page.evaluate(() =>
      (window as any).__axoview__.ui
        .getState()
        .actions.setConnectorInteractionMode('click')
    );

    // 2. Lasso a thin horizontal strip across the middle. Neither endpoint
    //    is inside; the connector's diagonal path crosses through it. This
    //    is the screenshot scenario PR #6 commit 2 names — pre-PR-#6 the
    //    rect-strict-enclosure rule missed this; post-PR-#6 the path-hit
    //    rule picks it up.
    await page.keyboard.press('l');
    await expect.poll(() => getUiModeType(page), { timeout: 2_000 }).toBe('LASSO');

    const STRIP_FROM: CanvasPoint = { x: 180, y: 320 };
    const STRIP_TO: CanvasPoint = { x: 660, y: 360 };
    await canvas.dragFromTo(STRIP_FROM, STRIP_TO);

    const selection = await getLassoSelection(page);
    expect(Array.isArray(selection)).toBe(true);
    const refTypes = (selection ?? []).map((r: any) => r.type);
    expect(refTypes).toContain('CONNECTOR');

    // 3. Delete confirms the selection is actionable.
    await page.keyboard.press('Delete');
    await expect.poll(() => getModelConnectorCount(page), { timeout: 5_000 }).toBe(0);
  });
});
