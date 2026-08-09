/**
 * import-export-image.spec.ts — Track T5 (ADR 0025) image-export coverage.
 *
 * Extends the import-export family to the Export-as-image dialog
 * (axoview-lib ExportImageDialog). Covers the three T5 key results:
 *
 *   1. #9  — "Download as SVG" succeeds and produces a parseable SVG file
 *            (the old btoa/encodeURIComponent path threw on some content).
 *   2. #18 — a high DPI selection still yields a preview image, never a blank
 *            (the render-target calculator clamps instead of failing silently).
 *   3. #19 — the "Screenshot (recommended)" preset is the default selection,
 *            and "Show labels" is an explicit option.
 *
 * The dialog mounts a hidden Axoview and rasterises via dom-to-image-more, so
 * the previews are produced in-browser — these assertions need the real app
 * (run with `npm run test:e2e`), not jsdom.
 *
 * App-side anchor added with this spec (ADR 0008 D5 — attribute + exercising
 * spec land together): `toolbar-export-image` on the Export popover MenuItem.
 * The SVG download button keeps its lib `data-testid="export-svg-button"`.
 */
import fs from 'fs';
import { appTest as test, expect } from '../fixtures/app.fixture';
import { AppToolbarPOM } from '../pom/AppToolbarPOM';
import { byAxoviewId, byLibTestId } from '../helpers/selectors';
import { getModelItemCount, waitForDebugBridge } from '../helpers/store';

const LOCAL_STORAGE_KEYS = [
  'axoview-diagrams',
  'axoview-last-opened',
  'axoview-last-opened-data',
  'axoview-explorer-initialized',
  'axoview-explorer-open'
];

const ONBOARDING_DISMISS_FLAGS: Array<[string, string]> = [
  ['axoview-lazy-loading-welcome-dismissed', 'true'],
  ['axoview-show-drag-hint', 'false']
];

async function pinOnboardingDismissed(page: import('@playwright/test').Page) {
  await page.addInitScript((flags: Array<[string, string]>) => {
    try {
      for (const [k, v] of flags) localStorage.setItem(k, v);
    } catch {
      /* localStorage may not be available pre-navigation */
    }
  }, ONBOARDING_DISMISS_FLAGS);
}

async function clearDiagramStorage(page: import('@playwright/test').Page) {
  await page.evaluate((keys: string[]) => {
    for (const k of keys) localStorage.removeItem(k);
  }, LOCAL_STORAGE_KEYS);
}

async function openElementsPanel(page: import('@playwright/test').Page) {
  const elementsToggle = byAxoviewId(page, 'dock-elements-toggle');
  const gridItem = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const gridVisible = await gridItem.isVisible().catch(() => false);
  if (!gridVisible) await elementsToggle.click();
  await gridItem.waitFor({ state: 'visible', timeout: 5_000 });
}

async function placeIcon(
  page: import('@playwright/test').Page,
  point: { x: number; y: number }
) {
  await openElementsPanel(page);
  const firstIcon = byAxoviewId(page, 'canvas-icon-grid-item').first();
  const canvas = byLibTestId(page, 'axoview-canvas');
  const iconBox = await firstIcon.boundingBox();
  const canvasBox = await canvas.boundingBox();
  if (!iconBox || !canvasBox) throw new Error('placeIcon: missing bounding box');
  await page.mouse.move(
    iconBox.x + iconBox.width / 2,
    iconBox.y + iconBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + point.x, canvasBox.y + point.y, {
    steps: 10
  });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function bootBlankDiagram(page: import('@playwright/test').Page) {
  await clearDiagramStorage(page);
  await page.reload();
  const createBtn = byAxoviewId(page, 'screen-empty-create');
  await createBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await createBtn.click();
  await byLibTestId(page, 'axoview-canvas').waitFor({
    state: 'visible',
    timeout: 10_000
  });
  await waitForDebugBridge(page);
}

const svgButton = (page: import('@playwright/test').Page) =>
  byLibTestId(page, 'export-svg-button');

// The SVG button is disabled until the hidden Axoview's SVG export resolves —
// a reliable "the dialog finished its first export" signal.
async function openImageDialogAndWaitReady(
  page: import('@playwright/test').Page
) {
  const toolbar = new AppToolbarPOM(page);
  await toolbar.clickExportImage();
  await expect(page.getByText('Export as image')).toBeVisible({ timeout: 10_000 });
  await expect(svgButton(page)).toBeEnabled({ timeout: 20_000 });
}

test.describe('Export image — T5 (ADR 0025)', () => {
  test.beforeEach(async ({ page }) => {
    await pinOnboardingDismissed(page);
  });

  test('#9: Download as SVG produces a valid, parseable SVG file', async ({
    page,
    app
  }) => {
    void app;
    await bootBlankDiagram(page);
    await placeIcon(page, { x: 380, y: 280 });
    await placeIcon(page, { x: 460, y: 320 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(2);

    await openImageDialogAndWaitReady(page);

    // The Screenshot preset is the default selection (KR4 / #19).
    await expect(page.getByText('Screenshot (recommended)')).toBeVisible();

    // Download + parse the SVG (KR1 / #9): it must be a real, parseable SVG,
    // not a thrown error or an empty file.
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      svgButton(page).click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.svg$/);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const raw = fs.readFileSync(downloadPath!, 'utf8');
    expect(raw.length).toBeGreaterThan(0);
    expect(raw).toContain('<svg');

    // Parse it the way a consumer would — a malformed SVG yields a parsererror.
    const parsed = await page.evaluate((svgText) => {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      return {
        hasError: !!doc.querySelector('parsererror'),
        root: doc.documentElement?.tagName?.toLowerCase()
      };
    }, raw);
    expect(parsed.hasError).toBe(false);
    expect(parsed.root).toBe('svg');
  });

  test('#18: a high-DPI selection still yields a preview, never a blank', async ({
    page,
    app
  }) => {
    void app;
    await bootBlankDiagram(page);
    await placeIcon(page, { x: 380, y: 280 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    await openImageDialogAndWaitReady(page);

    // Switch to the 4× DPI preset (the case that previously produced a blank
    // canvas on large diagrams). The clamp keeps it producing an image.
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: /4x/ }).click();

    // The export re-runs; the SVG button re-enables once it resolves and the
    // PNG preview image must be present (KR2 — never a blank/no-preview).
    await expect(svgButton(page)).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByAltText('preview')).toBeVisible({ timeout: 20_000 });
  });

  test('#19: "Show labels" is an explicit export option', async ({
    page,
    app
  }) => {
    void app;
    await bootBlankDiagram(page);
    await placeIcon(page, { x: 380, y: 280 });

    await openImageDialogAndWaitReady(page);

    // The explicit label-visibility option is present and on by default.
    const showLabels = page.getByLabel('Show labels');
    await expect(showLabels).toBeVisible();
    await expect(showLabels).toBeChecked();

    // Toggling it off re-exports without throwing — the SVG button cycles
    // disabled→enabled and the preview stays present.
    await showLabels.uncheck();
    await expect(svgButton(page)).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByAltText('preview')).toBeVisible({ timeout: 20_000 });
  });

  test('#10: canvas-drawn icon nodes are present in the export PNG, not just connectors', async ({
    page,
    app
  }) => {
    void app;
    await bootBlankDiagram(page);
    // A single icon node, NO connector: all visible content lives on the
    // Canvas2D node layer. If dom-to-image fails to rasterise the <canvas>, the
    // export is all background — that is exactly the QA #10 regression.
    await placeIcon(page, { x: 380, y: 280 });
    await expect.poll(() => getModelItemCount(page), { timeout: 5_000 }).toBe(1);

    await openImageDialogAndWaitReady(page);
    await expect(svgButton(page)).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByAltText('preview')).toBeVisible({ timeout: 20_000 });

    // Sample the preview PNG: the top-left pixel is the background; count pixels
    // that differ from it. A captured icon yields a meaningful fraction.
    const nonBgRatio = () =>
      page.evaluate(async () => {
        const img = document.querySelector(
          'img[alt="preview"]'
        ) as HTMLImageElement | null;
        if (!img) return -1;
        if (!img.complete || img.naturalWidth === 0) {
          await new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          });
        }
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx || c.width === 0) return -1;
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, c.width, c.height);
        const [br, bg, bb, ba] = [data[0], data[1], data[2], data[3]];
        let nonBg = 0;
        let total = 0;
        // STRIDE-SAMPLE, every 16th pixel. This runs inside a poll, and at full
        // resolution it is a 1.67M-iteration loop per call (1698x983 at 2x DPI)
        // that blocks the page's main thread — which is the same thread the
        // dialog's recapture needs. Measuring at full rate starved the very
        // update being waited for: the value sat at the first capture for the
        // whole 20 s on CI, while a single off-poll read moments later showed
        // the settled image. A 1-in-16 sample is ~100k iterations, and the two
        // outcomes it separates are 0.001 and 0.042 — 40x apart, so sampling
        // error cannot reach the 0.01 threshold.
        for (let i = 0; i < data.length; i += 4 * 16) {
          const dr = Math.abs(data[i] - br);
          const dg = Math.abs(data[i + 1] - bg);
          const db = Math.abs(data[i + 2] - bb);
          const da = Math.abs(data[i + 3] - ba);
          if (dr + dg + db + da > 48) nonBg++;
          total++;
        }
        return nonBg / total;
      });

    // The dialog captures once readiness is real (≥1 node drawn + icons
    // decoded) and RE-captures if the first snapshot ran before that — so the
    // settled preview must show the icon. Poll (not a one-shot read): the
    // replacement capture lands asynchronously after the dialog opens.
    // The dialog captures once readiness is real (content built, icons decoded,
    // backing store at its real size — see waitForIconsDrawn) and RE-captures
    // if the first snapshot went out before that. Poll (not a one-shot read):
    // the replacement capture lands asynchronously after the dialog opens.
    await expect
      .poll(nonBgRatio, { timeout: 20_000 })
      .toBeGreaterThan(0.01);
  });
});
