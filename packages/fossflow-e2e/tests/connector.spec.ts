/**
 * connector.spec.ts — Connector draw, undo/redo, delete (Phase 4)
 *
 * 4 tests, Chromium + Firefox.
 * Replaces: e2e-tests/tests/test_connector_undo.py
 */
import { expect } from '@playwright/test';
import { canvasTest } from '../fixtures';
import { toolbar, connectorPaths } from '../helpers/selectors';

// Fixed canvas positions for the two nodes
const NODE1_X = 300;
const NODE1_Y = 300;
const NODE2_X = 650;
const NODE2_Y = 300;

/**
 * Places two nodes and draws a connector between them.
 * Assumes the canvas is in its initial state (no existing nodes).
 */
async function setupTwoNodesWithConnector(canvas: any, page: any) {
  // Place node 1
  await canvas.placeNode(NODE1_X, NODE1_Y);
  // Place node 2 (reopen Add Item panel)
  await canvas.placeNode(NODE2_X, NODE2_Y);

  // Switch to Connector mode
  await canvas.activateCursor();
  await page.getByRole('button', { name: /Connector/i }).click();

  // Click first node tile to start connector
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: NODE1_X, y: NODE1_Y } });
  await page.waitForTimeout(150);
  // Click second node tile to end connector
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: NODE2_X, y: NODE2_Y } });
  await page.waitForTimeout(300);
}

// ---------------------------------------------------------------------------
// C-1: Place two nodes, draw connector → connector path appears on canvas
// ---------------------------------------------------------------------------
canvasTest('C-1: place two nodes, draw connector → connector appears', async ({ canvas, page }) => {
  await setupTwoNodesWithConnector(canvas, page);
  await expect(connectorPaths(page).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// C-2: Undo connector → connector removed
// ---------------------------------------------------------------------------
canvasTest('C-2: undo connector → removed', async ({ canvas, page }) => {
  await setupTwoNodesWithConnector(canvas, page);
  await expect(connectorPaths(page).first()).toBeVisible();

  await canvas.activateCursor();
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(200);

  await expect(connectorPaths(page)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// C-3: Redo connector → restored
// ---------------------------------------------------------------------------
canvasTest('C-3: redo connector → restored', async ({ canvas, page }) => {
  await setupTwoNodesWithConnector(canvas, page);

  await canvas.activateCursor();
  await page.keyboard.press('Control+Z');
  await page.waitForTimeout(200);
  await expect(connectorPaths(page)).toHaveCount(0);

  await page.keyboard.press('Control+Y');
  await page.waitForTimeout(200);
  await expect(connectorPaths(page).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// C-4: Select connector + Delete key → connector removed
// ---------------------------------------------------------------------------
canvasTest('C-4: select connector + Delete key → removed', async ({ canvas, page }) => {
  await setupTwoNodesWithConnector(canvas, page);
  await expect(connectorPaths(page).first()).toBeVisible();

  // Switch to Cursor mode and click the connector's midpoint to select it
  await canvas.activateCursor();
  const midX = Math.round((NODE1_X + NODE2_X) / 2);
  const midY = Math.round((NODE1_Y + NODE2_Y) / 2);
  await page.locator('[data-testid="fossflow-canvas"]').click({ position: { x: midX, y: midY } });
  await page.waitForTimeout(150);

  await page.keyboard.press('Delete');
  await page.waitForTimeout(200);

  await expect(connectorPaths(page)).toHaveCount(0);
});
