/**
 * node.spec.ts — Node lifecycle (Phase 2)
 *
 * 8 tests, Chromium + Firefox.
 * Covers: place, select, rename, header link, description collapse, delete.
 */
import { expect } from '@playwright/test';
import { canvasTest } from '../fixtures';

// Canvas coords used consistently across tests in this file
const NODE_X = 500;
const NODE_Y = 300;

// ---------------------------------------------------------------------------
// N-1: Place node → appears on canvas
// ---------------------------------------------------------------------------
canvasTest('N-1: place node → appears on canvas', async ({ canvas }) => {
  const before = await canvas.countNodes();
  await canvas.placeNode(NODE_X, NODE_Y);
  const after = await canvas.countNodes();
  expect(after).toBeGreaterThan(before);
});

// ---------------------------------------------------------------------------
// N-2: Click node → item controls panel opens
// ---------------------------------------------------------------------------
canvasTest('N-2: click node → item controls panel opens', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);

  await expect(page.locator('[data-testid="item-controls-panel"]')).toBeVisible();
  const controls = await canvas.getItemControls();
  expect(controls?.type).toBe('ITEM');
});

// ---------------------------------------------------------------------------
// N-3: Edit node name → updated text visible in node label
// ---------------------------------------------------------------------------
canvasTest('N-3: edit node name → updates on canvas', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);

  // Find the name input in NodeControls (a textbox whose value matches the default name)
  const nameField = page.getByRole('textbox', { name: /name/i }).first();
  await nameField.waitFor({ state: 'visible' });
  await nameField.fill('TestNode');
  // Commit the name (Tab or Enter)
  await nameField.press('Tab');
  await page.waitForTimeout(300);

  // The node label on canvas should contain the new name
  await expect(page.locator('[data-testid="node-label"]').first()).toContainText('TestNode');
});

// ---------------------------------------------------------------------------
// N-4: Add header link → name renders as <a> tag
// ---------------------------------------------------------------------------
canvasTest('N-4: add header link → name renders as <a>', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);

  // Find the link / URL field in NodeControls
  const linkField = page.getByRole('textbox', { name: /link|url|http/i }).first();
  await linkField.waitFor({ state: 'visible' });
  await linkField.fill('https://example.com');
  await linkField.press('Tab');
  await page.waitForTimeout(300);

  // The node header should now render an anchor element
  await expect(page.locator('[data-testid="node-header-link"]').first()).toBeVisible();
  const href = await page.locator('[data-testid="node-header-link"]').first().getAttribute('href');
  expect(href).toBe('https://example.com');
});

// ---------------------------------------------------------------------------
// N-5: Header link → click opens URL in new tab
// ---------------------------------------------------------------------------
canvasTest('N-5: header link → opens URL in new tab', async ({ canvas, page, context }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);

  const linkField = page.getByRole('textbox', { name: /link|url|http/i }).first();
  await linkField.waitFor({ state: 'visible' });
  await linkField.fill('https://example.com');
  await linkField.press('Tab');
  await page.waitForTimeout(300);

  // Clicking the header link should open a new page/tab
  const [newPage] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('[data-testid="node-header-link"]').first().click()
  ]);
  expect(newPage.url()).toContain('example.com');
  await newPage.close();
});

// ---------------------------------------------------------------------------
// N-6: Add description → node label bounding box grows
// ---------------------------------------------------------------------------
canvasTest('N-6: add description → label expands', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);

  // Measure label height before description
  const label = page.locator('[data-testid="node-label"]').first();
  const beforeBox = await label.boundingBox();

  // The description editor is inside NodeControls — find it by the RichTextEditor
  // (a contenteditable div inside the item controls panel)
  const descEditor = page
    .locator('[data-testid="item-controls-panel"] [contenteditable="true"]')
    .first();
  await descEditor.waitFor({ state: 'visible' });
  await descEditor.click();
  await descEditor.fill('This is a description');
  // Click outside to commit
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 200, y: 200 } });
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);
  await page.waitForTimeout(300);

  const afterBox = await label.boundingBox();
  expect(afterBox!.height).toBeGreaterThan(beforeBox!.height);
});

// ---------------------------------------------------------------------------
// N-7: Clear description → node label collapses
// ---------------------------------------------------------------------------
canvasTest('N-7: clear description → label collapses', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);

  // Add a description first
  const descEditor = page
    .locator('[data-testid="item-controls-panel"] [contenteditable="true"]')
    .first();
  await descEditor.waitFor({ state: 'visible' });
  await descEditor.click();
  await descEditor.fill('A description');
  await page.waitForTimeout(200);

  // Measure label height with description
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 200, y: 200 } });
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);
  await page.waitForTimeout(200);
  const label = page.locator('[data-testid="node-label"]').first();
  const withDescBox = await label.boundingBox();

  // Clear the description
  await descEditor.waitFor({ state: 'visible' });
  await descEditor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Click outside to commit
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: 200, y: 200 } });
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);
  await page.waitForTimeout(300);

  const withoutDescBox = await label.boundingBox();
  expect(withoutDescBox!.height).toBeLessThan(withDescBox!.height);
});

// ---------------------------------------------------------------------------
// N-8: Delete key → node removed from canvas
// ---------------------------------------------------------------------------
canvasTest('N-8: delete key → node removed', async ({ canvas, page }) => {
  await canvas.placeNode(NODE_X, NODE_Y);
  const beforeCount = await canvas.countNodes();
  await canvas.activateCursor();
  await canvas.selectAt(NODE_X, NODE_Y);

  // Delete key removes the selected node
  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);

  const afterCount = await canvas.countNodes();
  expect(afterCount).toBeLessThan(beforeCount);
});
