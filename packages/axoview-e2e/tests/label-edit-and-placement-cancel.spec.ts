/**
 * label-edit-and-placement-cancel.spec.ts — owner 2026-07-02 shake-out.
 *
 *   - A floating Label (ADR 0031) can be inline-edited by DOUBLE-CLICKING its
 *     chip or pressing F2 while selected — no Details deck (parity with node /
 *     connector labels). The Label is Canvas2D at rest; a contentEditable in
 *     LabelHitLayer takes over during edit (LabelsCanvas skips painting it).
 *   - Arming a placement tool then RIGHT-CLICKING the canvas cancels the tool
 *     and returns to the pointer (parity across rectangle / node / label / text
 *     / connector). Escape does the same.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM } from '../pom/CanvasPOM';

type Page = import('@playwright/test').Page;

const getFirstLabelId = (page: Page) =>
  page.evaluate(() => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view = (viewId && views.find((v: any) => v.id === viewId)) ?? views?.[0];
    return (view?.labels ?? [])[0]?.id ?? null;
  });

const labelText = (page: Page, id: string) =>
  page.evaluate((lid) => {
    const viewId = (window as any).__axoview__.ui.getState().view;
    const views = (window as any).__axoview__.model.getState().views;
    const view = (viewId && views.find((v: any) => v.id === viewId)) ?? views?.[0];
    return (view?.labels ?? []).find((l: any) => l.id === lid)?.text ?? null;
  }, id);

const modeType = (page: Page) =>
  page.evaluate(() => (window as any).__axoview__.ui.getState().mode.type);
const itemControlsType = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().itemControls?.type ?? null
  );
const clearSelection = (page: Page) =>
  page.evaluate(() =>
    (window as any).__axoview__.ui.getState().actions.setItemControls(null)
  );
const setMode = (page: Page, type: string) =>
  page.evaluate((t) => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setMode({ type: t, showCursor: true, id: null });
  }, type);

test.describe('Floating Label inline edit (double-click / F2)', () => {
  test('double-clicking a label chip edits it inline', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);
    // Place-and-type: placement opens the inline editor immediately, and the
    // POM types + commits so the chip repaints and the hit proxy mounts before
    // the double-click-to-edit path under test runs. (Placement seeds EMPTY
    // text since the TXT-07 ruling — an uncommitted Label is discarded — so the
    // text has to come from somewhere, and the POM is that somewhere.)
    await canvas.placeLabelAt({ x: 400, y: 300 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as any).__axoview__.ui.getState().inlineEditLabelId
          ),
        { timeout: 3_000 }
      )
      .toBeNull();
    const id = await getFirstLabelId(page);
    expect(id).toBeTruthy();
    await clearSelection(page);

    const hit = page.locator(`[data-label-hit-id="${id}"]`);
    await hit.waitFor({ state: 'visible', timeout: 3_000 });
    await hit.dblclick();

    const editor = page.locator('[data-testid="label-inline-editor"]');
    await editor.waitFor({ state: 'visible', timeout: 3_000 });
    // useInlineRename focuses + selects-all on mount, so typing replaces.
    await page.keyboard.type('Renamed');
    await page.keyboard.press('Enter');

    await expect
      .poll(() => labelText(page, id!), { timeout: 3_000 })
      .toBe('Renamed');
  });

  test('F2 edits the selected floating label inline', async ({ page, app }) => {
    void app;
    const canvas = new CanvasPOM(page);
    await canvas.placeLabelAt({ x: 420, y: 320 });
    const id = await getFirstLabelId(page);
    // Placement auto-selects the label.
    await expect.poll(() => itemControlsType(page), { timeout: 3_000 }).toBe(
      'LABEL'
    );
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('F2');

    const editor = page.locator('[data-testid="label-inline-editor"]');
    await editor.waitFor({ state: 'visible', timeout: 3_000 });
    await page.keyboard.type('ViaF2');
    await page.keyboard.press('Enter');

    await expect
      .poll(() => labelText(page, id!), { timeout: 3_000 })
      .toBe('ViaF2');
  });
});

test.describe('Right-click / Escape cancel an armed placement tool', () => {
  test('right-clicking the canvas cancels an armed RECTANGLE.DRAW → CURSOR', async ({
    page,
    app
  }) => {
    void app;
    await setMode(page, 'RECTANGLE.DRAW');
    expect(await modeType(page)).toBe('RECTANGLE.DRAW');

    const canvasEl = page.locator('[data-testid="axoview-canvas"]');
    const box = await canvasEl.boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2, {
      button: 'right'
    });

    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('CURSOR');
  });

  test('Escape cancels an armed LABEL tool → CURSOR', async ({ page, app }) => {
    void app;
    await setMode(page, 'LABEL');
    expect(await modeType(page)).toBe('LABEL');
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.keyboard.press('Escape');
    await expect.poll(() => modeType(page), { timeout: 3_000 }).toBe('CURSOR');
  });
});
