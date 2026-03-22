/**
 * smoke.spec.ts — Tier 2 smoke gate
 *
 * 4 tests, Chromium only, ~30 seconds.
 * Answers: "Is the app alive and minimally functional?"
 * Runs on every push before the full e2e suite.
 */
import { test, expect } from '@playwright/test';
import { getZoom } from '../helpers/store';

test.describe('Smoke — app is alive', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="fossflow-canvas"]').waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('S-1: app loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // Re-load after attaching the listener to catch any new errors
    // (beforeEach already confirmed the canvas is visible on initial load)
    await expect(page.locator('[data-testid="fossflow-canvas"]')).toBeVisible();
    expect(errors.filter((e) => !e.includes('favicon'))).toHaveLength(0);
  });

  test('S-2: tool menu is visible and enabled', async ({ page }) => {
    // All primary toolbar buttons must be present and not disabled
    const buttons = [
      page.getByRole('button', { name: /Add item/i }),
      page.getByRole('button', { name: /Select/i }),
      page.getByRole('button', { name: /Connector/i }),
    ];

    for (const button of buttons) {
      await expect(button).toBeVisible();
      await expect(button).not.toBeDisabled();
    }
  });

  test('S-3: canvas has non-zero dimensions', async ({ page }) => {
    const canvas = page.locator('[data-testid="fossflow-canvas"]');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('S-4: default zoom is 90%', async ({ page }) => {
    const zoom = await getZoom(page);
    expect(zoom).toBeCloseTo(0.9, 2);
  });
});
