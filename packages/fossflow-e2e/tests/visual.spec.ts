/**
 * visual.spec.ts — Screenshot regression baselines (Phase 6)
 *
 * 5 tests, Visual project only (Chromium, fixed 1280×800 viewport).
 *
 * Run:            npm run test:visual
 * Update bases:   node_modules/.bin/playwright test --project=visual --update-snapshots --config packages/fossflow-e2e/playwright.config.ts
 *
 * Baselines are stored in packages/fossflow-e2e/snapshots/ and committed to the repo.
 * A threshold of maxDiffPixelRatio: 0.02 (2%) tolerates minor anti-aliasing differences.
 */
import { test, expect } from '@playwright/test';
import { CanvasPage } from '../fixtures/canvas.fixture';

// Shared screenshot options — 2% pixel tolerance for cross-machine rendering
const SCREENSHOT_OPTS = { maxDiffPixelRatio: 0.02 };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid="fossflow-canvas"]').waitFor({ state: 'visible', timeout: 15_000 });
  // Dismiss any hint tooltips
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
});

// ---------------------------------------------------------------------------
// V-1: Empty canvas — toolbar, grid, zoom at 90%
// ---------------------------------------------------------------------------
test('V-1: empty canvas baseline', async ({ page }) => {
  await expect(page).toHaveScreenshot('empty-canvas.png', SCREENSHOT_OPTS);
});

// ---------------------------------------------------------------------------
// V-2: Canvas with one node placed
// ---------------------------------------------------------------------------
test('V-2: canvas with one node placed', async ({ page }) => {
  const canvas = new CanvasPage(page);
  await canvas.placeNode(500, 350);
  await canvas.activateCursor();
  // Click away to deselect
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(300);

  await expect(page).toHaveScreenshot('one-node.png', SCREENSHOT_OPTS);
});

// ---------------------------------------------------------------------------
// V-3: Canvas with two nodes and a connector
// ---------------------------------------------------------------------------
test('V-3: canvas with two nodes and connector', async ({ page }) => {
  const canvas = new CanvasPage(page);
  await canvas.placeNode(300, 350);
  await canvas.placeNode(650, 350);
  await canvas.activateCursor();

  // Draw connector between them
  await page.getByRole('button', { name: /Connector/i }).click();
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 300, y: 350 } });
  await page.waitForTimeout(150);
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 650, y: 350 } });
  await page.waitForTimeout(300);

  // Click away to deselect
  await canvas.activateCursor();
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(200);

  await expect(page).toHaveScreenshot('two-nodes-connector.png', SCREENSHOT_OPTS);
});

// ---------------------------------------------------------------------------
// V-4: Node item controls panel open
// ---------------------------------------------------------------------------
test('V-4: node item controls panel open', async ({ page }) => {
  const canvas = new CanvasPage(page);
  await canvas.placeNode(500, 350);
  await canvas.activateCursor();
  await canvas.selectAt(500, 350);
  // Wait for panel animation
  await page.waitForTimeout(300);

  await expect(page).toHaveScreenshot('node-controls-open.png', SCREENSHOT_OPTS);
});

// ---------------------------------------------------------------------------
// V-5: Lasso selection active (rectangle visible over selected nodes)
// ---------------------------------------------------------------------------
test('V-5: lasso selection active', async ({ page }) => {
  const canvas = new CanvasPage(page);
  await canvas.placeNode(500, 350);
  await canvas.activateCursor();

  // Draw lasso around the node
  await page.getByRole('button', { name: /Lasso/i }).click();
  await page.mouse.move(300, 200);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(700, 500, { steps: 15 });
  // Do NOT release — capture screenshot mid-drag
  await page.waitForTimeout(200);

  await expect(page).toHaveScreenshot('lasso-active.png', SCREENSHOT_OPTS);

  await page.mouse.up({ button: 'left' });
});
