/**
 * lasso.spec.ts — Lasso selection tests (Phase 4)
 *
 * 5 tests, Chromium + Firefox.
 * Key regression guard: L-3 catches the ToolMenu click propagation bug fixed
 * in the 2026-03-20 commit (toolbar clicks must not trigger canvas actions
 * while Lasso mode is active).
 */
import { expect } from '@playwright/test';
import { canvasTest } from '../fixtures';
import { getUiMode } from '../helpers/store';
import { leftDrag, rightClick } from '../helpers/mouse';

// ---------------------------------------------------------------------------
// L-1: Drag empty canvas in Lasso mode → lasso rectangle visible
// ---------------------------------------------------------------------------
canvasTest('L-1: drag empty canvas → lasso rectangle visible', async ({ canvas, page }) => {
  // Activate lasso mode
  await page.getByRole('button', { name: /Lasso/i }).click();

  // Start a drag on the canvas — the lasso rectangle should appear
  await page.mouse.move(300, 300);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(500, 450, { steps: 10 });

  // Lasso rectangle must be visible mid-drag
  await expect(page.locator('[data-testid="lasso-selection"]')).toBeVisible();

  await page.mouse.up({ button: 'left' });
});

// ---------------------------------------------------------------------------
// L-2: Lasso captures items in bounds → selection non-empty
// ---------------------------------------------------------------------------
canvasTest('L-2: lasso captures items in bounds → selection non-empty', async ({ canvas, page }) => {
  // Place a node in the centre of the canvas
  await canvas.placeNode(500, 350);
  await canvas.activateCursor();

  // Activate lasso
  await page.getByRole('button', { name: /Lasso/i }).click();

  // Draw lasso around the node (300–700 wide, 200–500 tall should encompass it)
  await leftDrag(page, { x: 300, y: 200 }, { x: 700, y: 500 });
  await page.waitForTimeout(200);

  const mode = await getUiMode(page);
  // In LASSO mode after drag completes, selection.items should be non-empty
  expect(mode.type).toBe('LASSO');
  expect((mode as any).selection?.items?.length ?? 0).toBeGreaterThan(0);
});

// ---------------------------------------------------------------------------
// L-3: Toolbar click in Lasso mode → context menu must NOT appear
// (regression guard for ToolMenu propagation bug fixed 2026-03-20)
// ---------------------------------------------------------------------------
canvasTest('L-3: toolbar click in Lasso mode → no context menu', async ({ canvas, page }) => {
  await page.getByRole('button', { name: /Lasso/i }).click();

  // Confirm Lasso mode is active
  const modeBefore = await getUiMode(page);
  expect(modeBefore.type).toBe('LASSO');

  // Click any toolbar button — must not propagate to canvas and open context menu
  await page.getByRole('button', { name: /Connector/i }).click();
  await page.waitForTimeout(200);

  // Context menu must never appear
  await expect(page.locator('[data-testid="context-menu"]')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// L-4: Right-click in Lasso mode → clears selection, stays LASSO
// ---------------------------------------------------------------------------
canvasTest('L-4: right-click in Lasso → clears selection', async ({ canvas, page }) => {
  // Place node, lasso it
  await canvas.placeNode(500, 350);
  await canvas.activateCursor();
  await page.getByRole('button', { name: /Lasso/i }).click();
  await leftDrag(page, { x: 300, y: 200 }, { x: 700, y: 500 });
  await page.waitForTimeout(200);

  // Right-click should clear the lasso selection
  await rightClick(page, { x: 500, y: 350 });
  await page.waitForTimeout(200);

  const mode = await getUiMode(page);
  // Selection should be cleared (null or empty items)
  expect((mode as any).selection).toBeNull();
});

// ---------------------------------------------------------------------------
// L-5: Escape in Lasso mode → exits to Cursor
// ---------------------------------------------------------------------------
canvasTest('L-5: Escape → exits Lasso, returns to Cursor', async ({ canvas, page }) => {
  await page.getByRole('button', { name: /Lasso/i }).click();
  expect((await getUiMode(page)).type).toBe('LASSO');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  const mode = await getUiMode(page);
  expect(mode.type).toBe('CURSOR');
});
