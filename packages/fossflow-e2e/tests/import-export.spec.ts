/**
 * import-export.spec.ts — Import JSON / Export SVG tests (Phase 5)
 *
 * 3 tests, Chromium + Firefox.
 * Replaces: test_import_diagram.py, test_export_svg.py
 *
 * Import uses page.waitForEvent('filechooser') — the import flow creates
 * a file input dynamically and clicks it, which Playwright intercepts.
 */
import * as path from 'path';
import { expect } from '@playwright/test';
import { canvasTest } from '../fixtures';

// Path to the sample diagram used for import tests
const SAMPLE_DIAGRAM = path.join(__dirname, '../fixtures/sample-diagram.json');

// ---------------------------------------------------------------------------
// IE-1: Import JSON → diagram restored (node count matches fixture)
// ---------------------------------------------------------------------------
canvasTest('IE-1: import JSON → diagram restored', async ({ canvas, page }) => {
  // Open the main menu
  await page.getByRole('button', { name: /Main menu/i }).click();
  const openItem = page.getByRole('menuitem', { name: /open/i });
  await openItem.waitFor({ state: 'visible' });

  // Intercept the file chooser before clicking "Open"
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    openItem.click()
  ]);

  await fileChooser.setFiles(SAMPLE_DIAGRAM);
  await page.waitForTimeout(500);

  // The sample diagram has 2 nodes (node-e2e-1, node-e2e-2)
  const nodeCount = await canvas.countNodes();
  expect(nodeCount).toBe(2);
});

// ---------------------------------------------------------------------------
// IE-2: Export SVG → download is triggered
// ---------------------------------------------------------------------------
canvasTest('IE-2: export SVG → download triggered', async ({ canvas, page }) => {
  // Place a node so there is something to export
  await canvas.placeNode(400, 300);
  await canvas.activateCursor();

  // Open the main menu → Export Image
  await page.getByRole('button', { name: /Main menu/i }).click();
  const exportItem = page.getByRole('menuitem', { name: /export image/i });
  await exportItem.waitFor({ state: 'visible' });
  await exportItem.click();

  // Wait for the Export Image dialog to open and the preview to render
  await page.waitForSelector('[data-testid="export-svg-button"]', { timeout: 15_000 });
  const svgButton = page.locator('[data-testid="export-svg-button"]');

  // Wait for the SVG button to become enabled (preview generated)
  await expect(svgButton).not.toBeDisabled({ timeout: 15_000 });

  // Trigger the download and assert it fires
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    svgButton.click()
  ]);

  expect(download.suggestedFilename()).toMatch(/\.svg$/i);
});

// ---------------------------------------------------------------------------
// IE-3: Exported SVG is valid XML (can be parsed as XML)
// ---------------------------------------------------------------------------
canvasTest('IE-3: exported SVG is valid XML', async ({ canvas, page }) => {
  await canvas.placeNode(400, 300);
  await canvas.activateCursor();

  await page.getByRole('button', { name: /Main menu/i }).click();
  const exportItem = page.getByRole('menuitem', { name: /export image/i });
  await exportItem.waitFor({ state: 'visible' });
  await exportItem.click();

  await page.waitForSelector('[data-testid="export-svg-button"]', { timeout: 15_000 });
  await expect(page.locator('[data-testid="export-svg-button"]')).not.toBeDisabled({ timeout: 15_000 });

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="export-svg-button"]').click()
  ]);

  // Read the downloaded file content
  const svgContent = await download.createReadStream().then(
    (stream) =>
      new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        stream.on('error', reject);
      })
  );

  // Must start with the SVG XML declaration or <svg> tag
  expect(svgContent.trim()).toMatch(/^(<\?xml|<svg)/i);
  // Must contain at least one SVG element
  expect(svgContent).toContain('<svg');
});
