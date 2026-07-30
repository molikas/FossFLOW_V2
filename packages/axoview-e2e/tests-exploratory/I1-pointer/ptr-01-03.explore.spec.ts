/**
 * I1 probes — the keydown dispatcher has no `editorMode` gate.
 *
 *  PTR-01  a tool hotkey arms an editing tool in EXPLORABLE_READONLY
 *  PTR-02  Delete removes an item in EXPLORABLE_READONLY
 *  PTR-03  Ctrl+X / Ctrl+V mutate the model in EXPLORABLE_READONLY
 *
 * Seed seam #4: `useInteractionManager`'s POINTER effect returns early on
 * `mode.type === 'INTERACTIONS_DISABLED'`, and `handleFunctionKeys` checks
 * `uiState.editorMode !== 'EDITABLE'` for F2 — but nothing else in the keydown
 * dispatcher (tool hotkeys, clipboard, z-order, arrow nudge, Delete) looks at
 * `editorMode` at all. `EXPLORABLE_READONLY` is the mode the app runs the
 * `/display/<diagramId>` viewer route in (App.tsx:355), and it does NOT map to
 * `INTERACTIONS_DISABLED` — its starting mode is `PAN` (utils/common.ts
 * getStartingMode), so the whole pointer + keyboard stack stays live.
 *
 * Forcing the mode through the debug bridge is the established pattern in this
 * repo for read-only legs (`view-mode-info-popover.spec.ts`,
 * `presenter-hover-notes.spec.ts`, `preview-layer-switcher.spec.ts`) — the app
 * drives editorMode from a prop and only re-syncs on prop change, so the
 * override sticks.
 */
import {
  exploreTest as test,
  expect,
  expectStoreInvariants
} from '../../fixtures/explore.fixture';
import { CanvasPOM, CanvasPoint } from '../../pom/CanvasPOM';
import { placeIconViaMouse } from '../../helpers/place';
import {
  getModelItemCount,
  getViewItemCount,
  getViewRectangleCount,
  getUiMode
} from '../../helpers/store';

type Page = import('@playwright/test').Page;

const A: CanvasPoint = { x: 360, y: 260 };
const B: CanvasPoint = { x: 540, y: 340 };

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const setReadOnly = async (page: Page) => {
  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setEditorMode('EXPLORABLE_READONLY');
    // Same starting mode the viewer route boots into (getStartingMode).
    ui.actions.setMode({ type: 'PAN', showCursor: false });
    ui.actions.setItemControls(null);
    ui.actions.clearSelection?.();
  });
  await expect.poll(() => editorMode(page), { timeout: 2_000 }).toBe(
    'EXPLORABLE_READONLY'
  );
};

const editorMode = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().editorMode as string
  );

const firstViewItemId = (page: Page) =>
  page.evaluate(() => {
    const bridge = (window as any).__axoview__;
    const viewId = bridge.ui.getState().view;
    const view = bridge.model
      .getState()
      .views.find((v: any) => v.id === viewId);
    return (view?.items ?? [])[0]?.id ?? null;
  });

// ---------------------------------------------------------------------------
// PTR-01 — a tool hotkey arms an editing tool in a read-only diagram
// ---------------------------------------------------------------------------
test.describe('PTR-01 — tool hotkeys in EXPLORABLE_READONLY', () => {
  test.fail(
    'BUG: `r` arms RECTANGLE.DRAW and a drag creates a rectangle in a read-only diagram',
    async ({ app }) => {
      const { page } = app;
      const canvas = new CanvasPOM(page);

      await placeIconViaMouse(page, A);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(1);

      await setReadOnly(page);
      const rectsBefore = await getViewRectangleCount(page);

      await page.keyboard.press('r');
      await page.waitForTimeout(150);

      // A read-only viewer must not be able to arm a drawing tool.
      expect(await modeType(page)).not.toBe('RECTANGLE.DRAW');

      await canvas.dragFromTo({ x: 620, y: 200 }, { x: 760, y: 300 });
      await page.waitForTimeout(200);
      expect(await getViewRectangleCount(page)).toBe(rectsBefore);
    }
  );

  test('characterization: `r` arms RECTANGLE.DRAW and the drag really creates a rectangle', async ({
    app
  }) => {
    const { page } = app;
    const canvas = new CanvasPOM(page);

    await placeIconViaMouse(page, A);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    await setReadOnly(page);
    expect(await modeType(page)).toBe('PAN');
    const rectsBefore = await getViewRectangleCount(page);

    await page.keyboard.press('r');
    await expect
      .poll(() => modeType(page), { timeout: 2_000 })
      .toBe('RECTANGLE.DRAW');

    await canvas.dragFromTo({ x: 620, y: 200 }, { x: 760, y: 300 });
    await expect
      .poll(() => getViewRectangleCount(page), { timeout: 3_000 })
      .toBe(rectsBefore + 1);

    // Still nominally a read-only viewer.
    expect(await editorMode(page)).toBe('EXPLORABLE_READONLY');
    await expectStoreInvariants(page, 'after read-only rectangle draw');
  });
});

// ---------------------------------------------------------------------------
// PTR-02 — Delete mutates a read-only diagram
// ---------------------------------------------------------------------------
test.describe('PTR-02 — Delete in EXPLORABLE_READONLY', () => {
  test.fail(
    'BUG: Delete removes the pinned item from a read-only diagram',
    async ({ app }) => {
      const { page } = app;

      await placeIconViaMouse(page, A);
      await placeIconViaMouse(page, B);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(2);

      await setReadOnly(page);
      const id = await firstViewItemId(page);
      expect(id).toBeTruthy();

      // Exactly what the ADR-0012 view-mode popover does on a click: pin the
      // item into itemControls.
      await page.evaluate((itemId) => {
        (window as any).__axoview__.ui
          .getState()
          .actions.setItemControls({ type: 'ITEM', id: itemId });
      }, id);
      await page.waitForTimeout(100);

      await page.keyboard.press('Delete');
      await page.waitForTimeout(300);

      expect(await getViewItemCount(page)).toBe(2);
    }
  );

  test('characterization: the read-only viewer loses the item for real', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await placeIconViaMouse(page, B);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    await setReadOnly(page);
    const id = await firstViewItemId(page);
    await page.evaluate((itemId) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id: itemId });
    }, id);
    await page.waitForTimeout(100);

    await page.keyboard.press('Delete');
    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(1);

    const stillThere = await page.evaluate((itemId) => {
      const bridge = (window as any).__axoview__;
      const viewId = bridge.ui.getState().view;
      const view = bridge.model
        .getState()
        .views.find((v: any) => v.id === viewId);
      return (view?.items ?? []).some((i: any) => i.id === itemId);
    }, id);
    expect(stillThere).toBe(false);
    expect(await editorMode(page)).toBe('EXPLORABLE_READONLY');
  });
});

// ---------------------------------------------------------------------------
// PTR-03 — clipboard shortcuts mutate a read-only diagram
// ---------------------------------------------------------------------------
test.describe('PTR-03 — Ctrl+C / Ctrl+V in EXPLORABLE_READONLY', () => {
  test.fail(
    'BUG: Ctrl+C then Ctrl+V duplicates an item inside a read-only diagram',
    async ({ app }) => {
      const { page } = app;

      await placeIconViaMouse(page, A);
      await expect
        .poll(() => getModelItemCount(page), { timeout: 5_000 })
        .toBe(1);

      await setReadOnly(page);
      const id = await firstViewItemId(page);
      await page.evaluate((itemId) => {
        (window as any).__axoview__.ui
          .getState()
          .actions.setItemControls({ type: 'ITEM', id: itemId });
      }, id);
      await page.waitForTimeout(100);

      await page.keyboard.press('Control+c');
      await page.waitForTimeout(150);
      await page.keyboard.press('Control+v');
      await page.waitForTimeout(400);

      expect(await getViewItemCount(page)).toBe(1);
    }
  );

  test('characterization: the paste lands a second item in the read-only view', async ({
    app
  }) => {
    const { page } = app;

    await placeIconViaMouse(page, A);
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    await setReadOnly(page);
    const id = await firstViewItemId(page);
    await page.evaluate((itemId) => {
      (window as any).__axoview__.ui
        .getState()
        .actions.setItemControls({ type: 'ITEM', id: itemId });
    }, id);
    await page.waitForTimeout(100);

    await page.keyboard.press('Control+c');
    await page.waitForTimeout(150);
    await page.keyboard.press('Control+v');

    await expect.poll(() => getViewItemCount(page), { timeout: 5_000 }).toBe(2);
    expect(await editorMode(page)).toBe('EXPLORABLE_READONLY');
    await expectStoreInvariants(page, 'after read-only paste');
  });
});
