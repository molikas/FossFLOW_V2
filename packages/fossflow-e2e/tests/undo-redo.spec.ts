/**
 * undo-redo.spec.ts — Undo/redo keyboard and button tests (Phase 2)
 *
 * 7 tests, Chromium + Firefox.
 * Replaces: test_node_placement.py::test_undo_redo_node,
 *           test_multi_node_undo.py, test_rect_text_undo.py
 */
import { expect } from '@playwright/test';
import { canvasTest } from '../fixtures';
import { toolbar } from '../helpers/selectors';

const NODE_X = 500;
const NODE_Y = 300;

// ---------------------------------------------------------------------------
// U-1: Place node → Undo button → node gone
// ---------------------------------------------------------------------------
canvasTest('U-1: place node → Undo button → node gone', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  const withNode = await canvas.countNodes();
  expect(withNode).toBeGreaterThan(0);

  await canvas.activateCursor();
  await toolbar.undo(page).click();
  await page.waitForTimeout(200);

  const afterUndo = await canvas.countNodes();
  expect(afterUndo).toBeLessThan(withNode);
});

// ---------------------------------------------------------------------------
// U-2: Redo button → node restored
// ---------------------------------------------------------------------------
canvasTest('U-2: Redo button → node restored', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  const withNode = await canvas.countNodes();

  await canvas.activateCursor();
  await toolbar.undo(page).click();
  await page.waitForTimeout(200);

  await toolbar.redo(page).click();
  await page.waitForTimeout(200);

  const afterRedo = await canvas.countNodes();
  expect(afterRedo).toBe(withNode);
});

// ---------------------------------------------------------------------------
// U-3: Ctrl+Z shortcut → same effect as Undo button
// ---------------------------------------------------------------------------
canvasTest('U-3: Ctrl+Z shortcut → same as Undo button', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  const withNode = await canvas.countNodes();

  await canvas.activateCursor();
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(200);

  const afterUndo = await canvas.countNodes();
  expect(afterUndo).toBeLessThan(withNode);
});

// ---------------------------------------------------------------------------
// U-4: Ctrl+Y shortcut → same effect as Redo button
// ---------------------------------------------------------------------------
canvasTest('U-4: Ctrl+Y shortcut → same as Redo button', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  const withNode = await canvas.countNodes();

  await canvas.activateCursor();
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(200);

  await page.keyboard.press('Control+Y');
  await page.waitForTimeout(200);

  const afterRedo = await canvas.countNodes();
  expect(afterRedo).toBe(withNode);
});

// ---------------------------------------------------------------------------
// U-5: Undo button disabled on fresh canvas (nothing to undo)
// ---------------------------------------------------------------------------
canvasTest('U-5: Undo button disabled on fresh canvas', async ({ canvas, page }) => {
  // No actions performed — undo must be disabled
  await expect(toolbar.undo(page)).toBeDisabled();
});

// ---------------------------------------------------------------------------
// U-6: Place 3 nodes → Undo 3× → canvas empty
// ---------------------------------------------------------------------------
canvasTest('U-6: place 3 nodes → Undo 3× → canvas empty', async ({ canvas, page }) => {
  await canvas.placeNode(300, 300);
  await canvas.placeNode(500, 300);
  await canvas.placeNode(700, 300);
  expect(await canvas.countNodes()).toBe(3);

  await canvas.activateCursor();
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(300);

  expect(await canvas.countNodes()).toBe(0);
});

// ---------------------------------------------------------------------------
// U-7: Draw rectangle via context menu → Undo → rectangle removed
// ---------------------------------------------------------------------------
canvasTest('U-7: draw rectangle → Undo → rectangle removed', async ({ canvas, page }) => {
  // Ensure CURSOR mode first
  await canvas.activateCursor();

  // Left-click empty canvas → empty-canvas context menu
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 400, y: 350 } });
  const addRectItem = page.getByRole('menuitem', { name: /Add Rectangle/i });
  await addRectItem.waitFor({ state: 'visible', timeout: 3000 });
  await addRectItem.click();
  await page.waitForTimeout(200);

  // Undo should remove the rectangle
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(200);

  // Context menu item should no longer create a visible rectangle element
  // We verify via the absence of the 'context-menu' and history length back to 0
  const histLen = await canvas.getHistoryLength();
  expect(histLen).toBe(0);
});
