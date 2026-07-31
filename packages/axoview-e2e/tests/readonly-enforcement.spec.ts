/**
 * readonly-enforcement.spec.ts — the read-only class, end to end.
 *
 * Promoted from the 2026-07 exploratory lane when wave 2 fixed the class
 * (`I1/ptr-01-03`, `I5/ctx-01-15`'s CTX-15 leg, `F2/view-modes`' VIEW-11 leg).
 * `EXPLORABLE_READONLY` is the mode the `/display/<diagramId>` viewer route runs
 * in; the campaign found it enforced surface-by-surface from memory, so a viewer
 * could arm drawing tools, Delete items, paste, reorder z and nudge with the
 * arrows — while the one interaction read-only is supposed to OFFER, a click on
 * a content-bearing node, did nothing.
 *
 * The unit-level class gates own the enumeration
 * (`axoview-lib/src/interaction/__tests__/readonlySurfaces.contract.test.ts` and
 * `ItemControls/__tests__/readonlyPanels.contract.test.tsx`). This spec proves
 * the wiring holds through the real app: real keystrokes, real mouse, real
 * store.
 *
 * Forcing the mode through the debug bridge is the established pattern for
 * read-only legs here (`view-mode-info-popover.spec.ts`,
 * `preview-layer-switcher.spec.ts`) — the app drives editorMode from a prop and
 * only re-syncs on prop change, so the override sticks.
 */
import { canvasReadyTest as test, expect } from '../fixtures/app.fixture';
import { CanvasPOM, CanvasPoint } from '../pom/CanvasPOM';
import { placeIconViaMouse } from '../helpers/place';
import {
  getModelItemCount,
  getViewItemCount,
  getViewRectangleCount,
  getUiMode
} from '../helpers/store';

type Page = import('@playwright/test').Page;

// Every leg boots a blank diagram and places a node through the real palette
// before it can even reach read-only, which is ~28 s of the default 30 s budget.
test.describe.configure({ timeout: 60_000 });

const A: CanvasPoint = { x: 360, y: 260 };
const B: CanvasPoint = { x: 540, y: 340 };

const modeType = async (page: Page) => (await getUiMode(page))?.type ?? null;

const editorMode = (page: Page) =>
  page.evaluate(
    () => (window as any).__axoview__.ui.getState().editorMode as string
  );

const itemControls = (page: Page) =>
  page.evaluate(() => {
    const c = (window as any).__axoview__.ui.getState().itemControls;
    return c ? { type: c.type as string, id: c.id as string } : null;
  });

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

const absOfTile = async (canvas: CanvasPOM, tile: { x: number; y: number }) => {
  const rel = await canvas.tileToScreen(tile);
  const box = await canvas.interactionsLayer().boundingBox();
  return { x: box!.x + rel.x, y: box!.y + rel.y };
};

/** The state the viewer route boots into (getStartingMode). */
const setReadOnly = async (page: Page) => {
  await page.evaluate(() => {
    const ui = (window as any).__axoview__.ui.getState();
    ui.actions.setItemControls(null);
    ui.actions.clearSelection?.();
    ui.actions.setEditorMode('EXPLORABLE_READONLY');
    ui.actions.setMode({ type: 'PAN', showCursor: false });
  });
  await expect
    .poll(() => editorMode(page), { timeout: 2_000 })
    .toBe('EXPLORABLE_READONLY');
};

const pin = (page: Page, id: string) =>
  page.evaluate((itemId: string) => {
    (window as any).__axoview__.ui
      .getState()
      .actions.setItemControls({ type: 'ITEM', id: itemId });
  }, id);

// ---------------------------------------------------------------------------
// PTR-01 — tool hotkeys cannot arm an editing tool for a viewer
// ---------------------------------------------------------------------------
test('a tool hotkey does not arm a drawing tool in read-only, and a drag draws nothing', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);

  await placeIconViaMouse(page, A);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);

  await setReadOnly(page);
  const rectsBefore = await getViewRectangleCount(page);

  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  expect(await modeType(page)).not.toBe('RECTANGLE.DRAW');

  await canvas.dragFromTo({ x: 620, y: 200 }, { x: 760, y: 300 });
  await page.waitForTimeout(300);
  expect(await getViewRectangleCount(page)).toBe(rectsBefore);
  expect(await editorMode(page)).toBe('EXPLORABLE_READONLY');
});

// ---------------------------------------------------------------------------
// PTR-02 — Delete cannot destroy what a viewer clicked
// ---------------------------------------------------------------------------
test('Delete does not remove the pinned item in read-only', async ({ app }) => {
  const { page } = app;

  await placeIconViaMouse(page, A);
  await placeIconViaMouse(page, B);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(2);

  await setReadOnly(page);
  const [first] = await itemTiles(page);
  // Exactly what the ADR 0012 view-mode popover does on a click.
  await pin(page, first.id);
  await page.waitForTimeout(150);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);

  expect(await getViewItemCount(page)).toBe(2);
});

// ---------------------------------------------------------------------------
// PTR-03 — the clipboard's write half is refused; its read half is not
// ---------------------------------------------------------------------------
test('Ctrl+C then Ctrl+V does not duplicate an item in read-only', async ({
  app
}) => {
  const { page } = app;

  await placeIconViaMouse(page, A);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);

  await setReadOnly(page);
  const [first] = await itemTiles(page);
  await pin(page, first.id);
  await page.waitForTimeout(150);

  await page.keyboard.press('Control+c');
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(500);

  expect(await getViewItemCount(page)).toBe(1);
});

// ---------------------------------------------------------------------------
// The viewer's own surfaces stay live — the gate is not a blanket refusal
// ---------------------------------------------------------------------------
test('the arrow keys still pan for a viewer', async ({ app }) => {
  const { page } = app;

  await placeIconViaMouse(page, A);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  await setReadOnly(page);

  // Rig trap (recorded on the I5/CTX-02 probe): focus stays inside the Elements
  // icon grid after a palette placement, and the grid consumes the arrow keys
  // for its own roving tabindex — so the canvas never sees them.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur?.());

  const before = await page.evaluate(() => ({
    ...(window as any).__axoview__.ui.getState().scroll.position
  }));
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({
    ...(window as any).__axoview__.ui.getState().scroll.position
  }));

  expect(after).not.toEqual(before);
});

test('Escape closes the popover instead of handing the viewer a CURSOR', async ({
  app
}) => {
  const { page } = app;

  await placeIconViaMouse(page, A);
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  await setReadOnly(page);
  const [first] = await itemTiles(page);
  await pin(page, first.id);
  await page.waitForTimeout(150);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  expect(await itemControls(page)).toBeNull();
  // PAN is the viewer's resting mode; Esc must not swap it for a live editing one.
  expect(await modeType(page)).toBe('PAN');
});

// ---------------------------------------------------------------------------
// CTX-15 — the one interaction read-only should OFFER
// ---------------------------------------------------------------------------
test('a read-only left-click on a content-bearing node opens its info popover', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);

  await placeIconViaMouse(page, { x: 640, y: 320 });
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  const [node] = await itemTiles(page);

  // Give it content so ADR 0012 considers it clickable, and PROVE the write
  // landed — otherwise "no popover" would just mean "no content".
  await page.evaluate((id: string) => {
    const model = (window as any).__axoview__.model.getState();
    model.actions.set({
      items: model.items.map((i: any) =>
        i.id === id ? { ...i, description: 'notes' } : i
      )
    });
  }, node.id);
  expect(
    await page.evaluate(
      (id: string) =>
        (window as any).__axoview__.model
          .getState()
          .items.find((i: any) => i.id === id)?.description ?? null,
      node.id
    )
  ).toBe('notes');

  await setReadOnly(page);

  const p = await absOfTile(canvas, node.tile);
  await page.mouse.click(p.x, p.y);

  await expect
    .poll(() => itemControls(page).then((c) => c?.id ?? null), {
      timeout: 5_000
    })
    .toBe(node.id);
});

// ---------------------------------------------------------------------------
// VIEW-11 — every element panel, not just the node's, is read-only in view mode
// ---------------------------------------------------------------------------
test('the LABEL panel renders no editable surface in view mode', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);

  await canvas.placeLabelAt(await canvas.tileToScreen({ x: 0, y: 0 }));
  await page.getByTestId('label-inline-editor').waitFor({ timeout: 5_000 });
  await page.keyboard.press('Escape');
  const label = (await activeView(page))?.labels?.[0];
  expect(label, 'setup: a Label must exist to select').toBeTruthy();

  await setReadOnly(page);
  await page.evaluate((labelId: string) => {
    const a = (window as any).__axoview__.ui.getState().actions;
    a.setItemControls({ type: 'LABEL', id: labelId });
    a.setRightSidebarOpen(true);
  }, label.id as string);

  const panel = page.getByTestId('item-controls-panel');
  await panel.waitFor({ state: 'visible', timeout: 5_000 });
  // The Quill notes editor mounts read-only, so no contenteditable is offered.
  await expect
    .poll(
      () => panel.locator('.ql-editor[contenteditable="true"]').count(),
      { timeout: 5_000 }
    )
    .toBe(0);
  expect(await editorMode(page)).toBe('EXPLORABLE_READONLY');
});

test('the NODE panel is still read-only in view mode (the original control)', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);

  await placeIconViaMouse(page, await canvas.tileToScreen({ x: 1, y: 1 }));
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  const [node] = await itemTiles(page);

  // Give it notes, so the panel really mounts a Quill and "no contenteditable"
  // means read-only rather than "no editor rendered at all".
  await page.evaluate((id: string) => {
    const model = (window as any).__axoview__.model.getState();
    model.actions.set({
      items: model.items.map((i: any) =>
        i.id === id ? { ...i, notes: '<p>owner note</p>' } : i
      )
    });
  }, node.id);

  await setReadOnly(page);
  await page.evaluate((id: string) => {
    const a = (window as any).__axoview__.ui.getState().actions;
    a.setItemControls({ type: 'ITEM', id });
    a.setRightSidebarOpen(true);
  }, node.id);

  const panel = page.getByTestId('item-controls-panel');
  await panel.waitFor({ state: 'visible', timeout: 5_000 });
  await expect(panel.locator('.ql-editor').first()).toBeVisible();
  expect(await panel.locator('.ql-editor[contenteditable="true"]').count()).toBe(
    0
  );
});

test('a read-only click on empty canvas dismisses the popover', async ({
  app
}) => {
  const { page } = app;
  const canvas = new CanvasPOM(page);

  await placeIconViaMouse(page, { x: 640, y: 320 });
  await expect.poll(() => getModelItemCount(page), { timeout: 8_000 }).toBe(1);
  const [node] = await itemTiles(page);
  await setReadOnly(page);
  await pin(page, node.id);
  await page.waitForTimeout(150);
  expect((await itemControls(page))?.id).toBe(node.id);

  // Well clear of the node but still inside the interactions box — a point
  // outside it would prove nothing (the canvas would never see the click).
  await canvas.clickAt({ x: 300, y: 520 });

  await expect.poll(() => itemControls(page), { timeout: 5_000 }).toBeNull();
});
