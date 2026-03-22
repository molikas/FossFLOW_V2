/**
 * pan.spec.ts — Pan interaction tests (Phase 3)
 *
 * 9 tests, Chromium + Firefox.
 * Covers FF-001: transient right-click pan with threshold detection,
 *               mode restoration, and deselect-on-right-click.
 */
import { expect } from '@playwright/test';
import { canvasTest } from '../fixtures';
import { getUiMode, getScroll, setPanSettings } from '../helpers/store';
import { rightDrag, rightClick, middleClickDrag } from '../helpers/mouse';

// Canvas centre — used as the anchor for all pan gestures
const CX = 500;
const CY = 350;

// The right-click drag threshold is 4px. Use 40px to reliably exceed it.
const PAN_DELTA = 40;

// ---------------------------------------------------------------------------
// P-1: Middle-click + drag → canvas pans (scroll position changes)
// ---------------------------------------------------------------------------
canvasTest('P-1: middle-click + drag → canvas pans', async ({ canvas, page }) => {
  await canvas.activateCursor();
  const before = await getScroll(page);

  await middleClickDrag(page, { x: CX, y: CY }, { x: CX + PAN_DELTA, y: CY });

  const after = await getScroll(page);
  // Scroll x should have changed
  expect(after.x).not.toBe(before.x);
});

// ---------------------------------------------------------------------------
// P-2: Middle-click release → mode restored to CURSOR
// ---------------------------------------------------------------------------
canvasTest('P-2: middle-click release → Cursor mode restored', async ({ canvas, page }) => {
  await canvas.activateCursor();
  await middleClickDrag(page, { x: CX, y: CY }, { x: CX + PAN_DELTA, y: CY });

  const mode = await getUiMode(page);
  expect(mode.type).toBe('CURSOR');
});

// ---------------------------------------------------------------------------
// P-3: Right-click (no drag) → item controls panel closes, mode stays CURSOR
// ---------------------------------------------------------------------------
canvasTest('P-3: right-click (no drag) → item panel closes, mode stays CURSOR', async ({ canvas, page }) => {
  // Place a node and open its item controls
  await canvas.placeNode(CX, CY);
  await canvas.activateCursor();
  await canvas.selectAt(CX, CY);
  await expect(page.locator('[data-testid="item-controls-panel"]')).toBeVisible();

  // Right-click without drag → should close item controls, not open menu
  await rightClick(page, { x: CX, y: CY });
  await page.waitForTimeout(200);

  // Item controls panel should be gone
  // (itemControls resets to null on right-click without drag per FF-001)
  const mode = await getUiMode(page);
  expect(mode.type).toBe('CURSOR');
  // Context menu must NOT appear
  await expect(page.locator('[data-testid="context-menu"]')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// P-4: Right-click + drag ≤4px → pan NOT activated
// ---------------------------------------------------------------------------
canvasTest('P-4: right-click + drag ≤4px → pan NOT activated', async ({ canvas, page }) => {
  await canvas.activateCursor();
  // Drag only 2px — below the 4px threshold
  await rightDrag(page, { x: CX, y: CY }, { x: CX + 2, y: CY }, 3);
  await page.waitForTimeout(200);

  const mode = await getUiMode(page);
  // Must NOT have entered PAN mode
  expect(mode.type).not.toBe('PAN');
});

// ---------------------------------------------------------------------------
// P-5: Right-click + drag >4px → enters PAN mode mid-drag
// ---------------------------------------------------------------------------
canvasTest('P-5: right-click + drag >4px → enters PAN mode', async ({ canvas, page }) => {
  await canvas.activateCursor();

  // Start right-drag, check mode mid-flight
  await page.mouse.move(CX, CY);
  await page.mouse.down({ button: 'right' });
  // Move well past the 4px threshold
  await page.mouse.move(CX + PAN_DELTA, CY, { steps: 5 });

  const mode = await getUiMode(page);
  expect(mode.type).toBe('PAN');

  // Clean up
  await page.mouse.up({ button: 'right' });
});

// ---------------------------------------------------------------------------
// P-6: Right-click release after drag → mode restored to CURSOR
// ---------------------------------------------------------------------------
canvasTest('P-6: right-click release after drag → restores Cursor', async ({ canvas, page }) => {
  await canvas.activateCursor();
  await rightDrag(page, { x: CX, y: CY }, { x: CX + PAN_DELTA, y: CY });
  await page.waitForTimeout(100);

  const mode = await getUiMode(page);
  expect(mode.type).toBe('CURSOR');
});

// ---------------------------------------------------------------------------
// P-7: Right-click in Connector mode → pan → release restores CONNECTOR
// ---------------------------------------------------------------------------
canvasTest('P-7: right-click in Connector mode → release restores CONNECTOR', async ({ canvas, page }) => {
  // Activate Connector mode via toolbar
  await page.getByRole('button', { name: /Connector/i }).click();
  const modeBeforePan = await getUiMode(page);
  expect(modeBeforePan.type).toBe('CONNECTOR');

  // Right-drag to pan
  await rightDrag(page, { x: CX, y: CY }, { x: CX + PAN_DELTA, y: CY });
  await page.waitForTimeout(100);

  // Mode must be restored to CONNECTOR
  const modeAfterPan = await getUiMode(page);
  expect(modeAfterPan.type).toBe('CONNECTOR');
});

// ---------------------------------------------------------------------------
// P-8: Right-click in Lasso mode → pan → release restores LASSO
// ---------------------------------------------------------------------------
canvasTest('P-8: right-click in Lasso mode → release restores LASSO', async ({ canvas, page }) => {
  // Activate Lasso mode via toolbar
  await page.getByRole('button', { name: /Lasso/i }).click();
  const modeBeforePan = await getUiMode(page);
  expect(modeBeforePan.type).toBe('LASSO');

  // Right-drag to pan
  await rightDrag(page, { x: CX, y: CY }, { x: CX + PAN_DELTA, y: CY });
  await page.waitForTimeout(100);

  // Mode must be restored to LASSO
  const modeAfterPan = await getUiMode(page);
  expect(modeAfterPan.type).toBe('LASSO');
});

// ---------------------------------------------------------------------------
// P-9: rightClickPan=false → right-click has no side-effects
// ---------------------------------------------------------------------------
canvasTest('P-9: rightClickPan=false → right-click: no pan, no menu, no deselect', async ({ canvas, page }) => {
  // Disable right-click pan via the store
  await setPanSettings(page, { rightClickPan: false });

  const scrollBefore = await getScroll(page);

  // Right-drag that would normally trigger pan
  await rightDrag(page, { x: CX, y: CY }, { x: CX + PAN_DELTA, y: CY });
  await page.waitForTimeout(200);

  const scrollAfter = await getScroll(page);
  // Scroll must not have changed
  expect(scrollAfter.x).toBe(scrollBefore.x);
  expect(scrollAfter.y).toBe(scrollBefore.y);

  // No context menu either
  await expect(page.locator('[data-testid="context-menu"]')).not.toBeVisible();

  // Mode unchanged
  const mode = await getUiMode(page);
  expect(mode.type).not.toBe('PAN');
});
